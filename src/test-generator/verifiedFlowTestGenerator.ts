import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ExplorationSession,
  ExplorationStep,
  Finding,
  GeneratedTest,
  GeneratedTestConfidence,
  GeneratedTestFlowCategory,
  GeneratedTestGenerator,
} from '../types';
import { inferReproducibilityConfidence } from '../reporting/severityScoring';
import { mapInteractionHistoryToTest } from './interactionToTestMapping';
import { rankSelectorStrategies } from './selectorStrategy';
import { buildGeneratedTestSource } from './testSourceBuilder';
import { executeGeneratedTest, type GeneratedTestExecutionOptions } from './testExecutionPipeline';

interface FlowCandidate {
  id: string;
  title: string;
  flowCategory: GeneratedTestFlowCategory;
  steps: ExplorationStep[];
  finding?: Finding;
}

export interface VerifiedFlowTestGeneratorOptions extends GeneratedTestExecutionOptions {
  outputDirectory?: string;
  generatedAt?: () => string;
}

function sanitizeFilePart(value: string, maxLength = 80) {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '') || 'generated';
  return sanitized.slice(0, maxLength).replace(/-$/g, '') || 'generated';
}

function isMeaningfulAction(step: ExplorationStep) {
  return !['noop', 'stop', 'screenshot', 'wait'].includes(step.plan.action.kind);
}

function isSuccessfulStep(step: ExplorationStep) {
  return step.execution?.status === 'success' && step.validation?.result.passed === true && isMeaningfulAction(step);
}

function hasValidatedNavigationResult(step: ExplorationStep) {
  return Boolean(
    isSuccessfulStep(step) &&
      step.afterObservation &&
      (step.beforeObservation.url !== step.afterObservation.url || step.beforeObservation.title !== step.afterObservation.title),
  );
}

function isReproducibleBug(finding: Finding, session: ExplorationSession) {
  if (finding.status === 'dismissed') {
    return false;
  }

  const confidence = inferReproducibilityConfidence(finding);
  const step = finding.stepId ? session.steps.find((candidate) => candidate.id === finding.stepId) : undefined;
  return Boolean(
    confidence !== 'low' &&
      step &&
      step.afterObservation &&
      finding.reproductionSteps.length > 0 &&
      ['console-error', 'network-failure', 'flow-failure', 'empty-state', 'form-validation'].includes(finding.type),
  );
}

function stepsThroughFinding(session: ExplorationSession, finding: Finding) {
  const index = session.steps.findIndex((step) => step.id === finding.stepId);
  if (index === -1) {
    return [];
  }

  return session.steps
    .slice(0, index + 1)
    .filter((step) => step.execution?.status === 'success' && isMeaningfulAction(step));
}

function confidenceForSteps(steps: ExplorationStep[], finding?: Finding): GeneratedTestConfidence {
  const strategies = steps.map((step) => rankSelectorStrategies(step)[0]?.strategy).filter(Boolean);

  if (finding && inferReproducibilityConfidence(finding) === 'low') {
    return 'low';
  }

  if (strategies.some((strategy) => strategy.type === 'xpath' || strategy.type === 'none')) {
    return 'low';
  }

  if (strategies.some((strategy) => strategy.type === 'css' || strategy.type === 'text')) {
    return finding && inferReproducibilityConfidence(finding) === 'high' ? 'medium' : 'medium';
  }

  if (steps.every((step) => step.validation?.result.passed || finding)) {
    return finding && inferReproducibilityConfidence(finding) === 'medium' ? 'medium' : 'high';
  }

  return 'medium';
}

function flowCandidates(session: ExplorationSession): FlowCandidate[] {
  const candidates: FlowCandidate[] = [];
  const successfulSteps = session.steps.filter(isSuccessfulStep);

  if (successfulSteps.length) {
    const mapping = mapInteractionHistoryToTest(successfulSteps, 'successful-flow');
    candidates.push({
      id: 'successful-flow',
      title: mapping.regressionTestName,
      flowCategory: 'successful-flow',
      steps: successfulSteps,
    });
  }

  const navigationSteps = session.steps.filter(hasValidatedNavigationResult);
  if (navigationSteps.length) {
    const mapping = mapInteractionHistoryToTest(navigationSteps, 'navigation-path');
    candidates.push({
      id: 'navigation-path',
      title: mapping.regressionTestName,
      flowCategory: 'navigation-path',
      steps: navigationSteps,
    });
  }

  for (const finding of session.findings.filter((candidate) => isReproducibleBug(candidate, session)).slice(0, 5)) {
    const steps = stepsThroughFinding(session, finding);
    if (!steps.length) {
      continue;
    }

    const mapping = mapInteractionHistoryToTest(steps, 'reproduced-bug', { findingTitle: finding.title });
    candidates.push({
      id: `bug-${sanitizeFilePart(finding.id, 48)}`,
      title: mapping.regressionTestName,
      flowCategory: 'reproduced-bug',
      steps,
      finding,
    });
  }

  return candidates;
}

function filePathFor(outputDirectory: string, session: ExplorationSession, candidate: FlowCandidate, index: number) {
  return join(
    outputDirectory,
    `${sanitizeFilePart(session.goal.id)}-${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(candidate.id)}.generated.spec.ts`,
  );
}

export class VerifiedFlowTestGenerator implements GeneratedTestGenerator {
  private readonly outputDirectory: string;
  private readonly executionOptions: GeneratedTestExecutionOptions;
  private readonly generatedAt: () => string;

  constructor(options: VerifiedFlowTestGeneratorOptions = {}) {
    this.outputDirectory = options.outputDirectory || 'tests/exploratory';
    this.generatedAt = options.generatedAt || (() => new Date().toISOString());
    this.executionOptions = {
      execute: options.execute ?? true,
      project: options.project || 'chromium',
      reporter: options.reporter || 'line',
      cwd: options.cwd || process.cwd(),
      retrySelectorHealing: options.retrySelectorHealing ?? true,
    };
  }

  async generate(session: ExplorationSession): Promise<GeneratedTest[]> {
    if (!session.config.generateTests) {
      return [];
    }

    await mkdir(this.outputDirectory, { recursive: true });
    const generatedTests: GeneratedTest[] = [];

    for (const [index, candidate] of flowCandidates(session).entries()) {
      const generatedAt = this.generatedAt();
      const confidenceScore = confidenceForSteps(candidate.steps, candidate.finding);
      const primary = buildGeneratedTestSource({
        session,
        title: candidate.title,
        steps: candidate.steps,
        generatedAt,
        flowCategory: candidate.flowCategory,
        confidenceScore,
        finding: candidate.finding,
      });

      if (primary.assertionCount === 0) {
        continue;
      }

      const filePath = filePathFor(this.outputDirectory, session, candidate, index);
      await writeFile(filePath, primary.source, 'utf8');

      const generatedTest: GeneratedTest = {
        id: `generated-${session.id}-${candidate.id}`,
        title: candidate.title,
        filePath,
        source: primary.source,
        basedOnStepIds: candidate.steps.map((step) => step.id),
        status: 'draft',
        generatedAt,
        flowCategory: candidate.flowCategory,
        confidenceScore,
        metadata: {
          sourceSessionId: session.id,
          generatedTimestamp: generatedAt,
          flowCategory: candidate.flowCategory,
          confidenceScore,
          selectorStrategies: primary.selectorStrategies,
        },
        executionResults: [],
      };

      await executeGeneratedTest(generatedTest, this.executionOptions, () =>
        buildGeneratedTestSource({
          session,
          title: candidate.title,
          steps: candidate.steps,
          generatedAt,
          flowCategory: candidate.flowCategory,
          confidenceScore,
          finding: candidate.finding,
          healedSelectors: true,
        }).source,
      );

      generatedTests.push(generatedTest);
    }

    return generatedTests;
  }
}
