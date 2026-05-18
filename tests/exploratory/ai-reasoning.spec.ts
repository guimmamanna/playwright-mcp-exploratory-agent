import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { MockLLMProvider } from '../../src/llm';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { ReasoningPlanner } from '../../src/planner/reasoningPlanner';
import { RiskBasedPlanner } from '../../src/planner/riskBasedPlanner';
import { createBlankObservation } from '../../src/observer/observationFactory';
import {
  ReasoningEngine,
  applyReplan,
  buildCompactReasoningContext,
  evaluateReplan,
  explainFinding,
  proposeHypotheses,
  validateHypotheses,
  ensureReasoningState,
} from '../../src/reasoning';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { BugReporter } from '../../src/reporting/bugReporter';
import type { ExplorationSession, Finding } from '../../src/types';

function createSession(overrides: Partial<ExplorationSession> = {}): ExplorationSession {
  const session: ExplorationSession = {
    id: 'reasoning-session',
    goal: {
      id: 'reasoning-goal',
      name: 'Reasoning goal',
      description: 'Validate AI reasoning pipeline.',
      priorities: ['navigation', 'forms', 'accessibility'],
      riskAreas: ['permissions', 'filters'],
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://localhost:3000',
      allowedDomains: ['localhost'],
      reasoningEnabled: true,
      llmProvider: 'mock',
    },
    startedAt: new Date().toISOString(),
    status: 'running',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: defaultExplorationConfig.evidenceDirectory,
    ...overrides,
  };
  ensureReasoningState(session);
  return session;
}

test('reasoning engine returns structured output with strategy and hypotheses', async () => {
  const session = createSession();
  const observation = createBlankObservation({
    url: 'http://localhost:3000/settings',
    visibleTextSummary: 'Admin settings manage users roles permissions',
    domSummary: 'modal dialog keyboard trap',
  });

  const engine = new ReasoningEngine({ provider: new MockLLMProvider() });
  const { output, trace } = await engine.reason(session, observation);

  expect(output.strategy).toBeTruthy();
  expect(output.reasoningSummary.length).toBeGreaterThan(10);
  expect(output.confidenceScore).toBeGreaterThan(0);
  expect(output.confidenceScore).toBeLessThanOrEqual(1);
  expect(trace.provider).toContain('mock');
  expect(session.reasoningState?.traces.length).toBe(1);
});

test('context summarisation keeps compact prompt-sized memory', () => {
  const session = createSession();
  session.memory.visitedUrls = Array.from({ length: 20 }, (_, index) => `http://localhost:3000/page-${index}`);
  session.findings = Array.from({ length: 12 }, (_, index) => ({
    id: `finding-${index}`,
    type: 'console-error',
    severity: 'high',
    category: 'console-error',
    title: `Issue ${index}`,
    description: 'desc',
    evidence: [],
    reproductionSteps: [],
    status: 'new',
  }));

  const summary = buildCompactReasoningContext(
    session,
    createBlankObservation({
      url: 'http://localhost:3000/long',
      visibleTextSummary: 'x'.repeat(5000),
    }),
  );

  expect(summary.length).toBeLessThanOrEqual(1300);
  expect(summary).toContain('visited=');
  expect(summary).toContain('findings=');
});

test('strategy switches when blocked flows are detected', () => {
  const session = createSession();
  session.reasoningState!.currentStrategy = 'form-focused';
  session.memory.skippedRiskyActions.push({
    signature: 'fill:profile',
    reason: 'Blocked by environment',
    url: 'http://localhost:3000/profile',
    timestamp: new Date().toISOString(),
    blockedBy: 'environment',
  });

  const decision = evaluateReplan(session);
  applyReplan(session, decision);

  expect(decision.shouldReplan).toBe(true);
  expect(session.reasoningState?.currentStrategy).toBe('permission-exploration');
});

test('hypothesis lifecycle moves from proposed to confirmed with evidence', () => {
  const session = createSession();
  proposeHypotheses(
    session,
    {
      strategy: 'state-persistence-exploration',
      reasoningSummary: 'Filter persistence should be validated',
      riskAssessment: 'medium',
      confidenceScore: 0.8,
      suggestedActions: [],
      hypotheses: [
        {
          statement: 'This filter may not persist state',
          riskArea: 'state persistence',
          validationIdea: 'Apply filter and navigate away',
        },
      ],
    },
    'step-001',
  );

  const finding: Finding = {
    id: 'finding-filter',
    type: 'flow-failure',
    severity: 'medium',
    category: 'functional',
    title: 'Filter state persistence issue',
    description: 'Filter state was lost after navigation',
    evidence: [],
    reproductionSteps: [],
    status: 'new',
  };

  validateHypotheses(session, [finding], 'step-002');
  const hypothesis = session.reasoningState?.hypotheses[0];
  expect(hypothesis?.status).toBe('confirmed');
  expect(hypothesis?.evidenceFindingIds).toContain('finding-filter');
});

test('reasoning planner enriches plans with explanations and confidence', async () => {
  const session = createSession();
  const observation = createBlankObservation({
    url: 'http://localhost:3000/login',
    links: [{ kind: 'link', label: 'Sign in', href: '/login', visible: true }],
    buttons: [{ kind: 'button', label: 'Register', selectorHint: '#register', visible: true }],
  });

  const plan = await new ReasoningPlanner({
    basePlanner: new RiskBasedPlanner(),
    reasoningEngine: new ReasoningEngine({ provider: new MockLLMProvider() }),
  }).planNextAction({ session, observation, findings: [] });

  expect(plan.reasoningSummary).toBeTruthy();
  expect(plan.explorationStrategy).toBeTruthy();
  expect(plan.confidenceScore).toBeGreaterThan(0);
  expect(plan.rationale).toContain('AI reasoning');
  expect(session.reasoningState?.actionExplanations.length).toBeGreaterThan(0);
});

test('blocked-flow replanning changes strategy in subsequent reasoning', async () => {
  const session = createSession();
  session.memory.skippedRiskyActions.push({
    signature: 'click:delete',
    reason: 'Blocked',
    url: 'http://localhost:3000',
    timestamp: new Date().toISOString(),
    blockedBy: 'environment',
  });

  const engine = new ReasoningEngine({ provider: new MockLLMProvider() });
  const { output } = await engine.reason(
    session,
    createBlankObservation({ url: 'http://localhost:3000', visibleTextSummary: 'blocked skippedRisky actions' }),
  );

  expect(output.strategy).toBe('navigation-focused');
  expect(output.reasoningSummary.toLowerCase()).toMatch(/blocked|permission|navigation/);
});

test('AI-assisted bug explanation adds ownership and investigation notes', () => {
  const explanation = explainFinding({
    id: 'network-1',
    type: 'network-failure',
    severity: 'high',
    category: 'network-error',
    title: 'API request failed',
    description: 'GET /api/items returned 500',
    evidence: [],
    reproductionSteps: [],
    status: 'new',
    apiClassification: 'server-error',
  });

  expect(explanation.suspectedOwnership).toBe('backend');
  expect(explanation.probableCause).toContain('network');
  expect(explanation.investigationNotes.length).toBeGreaterThan(20);
});

test('session report includes reasoning traces and hypotheses', async () => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'ai-reasoning-report-'));
  const session = createSession();
  session.reasoningState!.traces.push({
    id: 'trace-1',
    timestamp: new Date().toISOString(),
    strategy: 'accessibility-focused',
    reasoningSummary: 'Modal keyboard path should be validated first.',
    riskAssessment: 'high',
    confidenceScore: 0.84,
    provider: 'mock:mock-reasoning-v1',
    compactContextSummary: 'compact',
  });
  session.reasoningState!.hypotheses.push({
    id: 'hyp-1',
    statement: 'This modal may fail keyboard navigation',
    riskArea: 'accessibility',
    validationIdea: 'Tab through modal controls',
    status: 'testing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidenceFindingIds: [],
    confidence: 0.8,
  });

  const reportPath = await new MarkdownReporter(evidenceDirectory, new BugReporter(join(evidenceDirectory, 'bugs'))).writeSessionReport(
    session,
  );
  const markdown = await readFile(reportPath, 'utf8');

  expect(markdown).toContain('## AI Reasoning Summary');
  expect(markdown).toContain('accessibility-focused');
  expect(markdown).toContain('This modal may fail keyboard navigation');

  await rm(evidenceDirectory, { recursive: true, force: true });
});
