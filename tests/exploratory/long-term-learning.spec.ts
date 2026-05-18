import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { memoryPriorityBoost } from '../../src/learning/memoryPlanning';
import {
  isSuppressedFinding,
  markFindingStatus,
  suppressedFingerprints,
} from '../../src/learning/falsePositiveManager';
import { findingFingerprint } from '../../src/learning/fingerprints';
import { recordRecurringBug, updateRiskScoresFromSession } from '../../src/learning/riskScoring';
import { compareWithHistory } from '../../src/learning/historicalComparison';
import { extractLearningSignals } from '../../src/learning/signalExtractor';
import { createEmptyKnowledge, JsonMemoryStorage } from '../../src/long-term-memory/storage/jsonMemoryStorage';
import { retrieveMemoryForSession } from '../../src/long-term-memory/retrieval';
import { updateMemoryFromSession } from '../../src/long-term-memory/sessionUpdate';
import { LongTermMemoryService } from '../../src/long-term-memory/longTermMemoryService';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { sampleExplorationGoal } from '../../src/config/sampleGoal';
import type { ExplorationSession, Finding } from '../../src/types';

function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-1',
    type: 'console-error',
    severity: 'medium',
    category: 'console-error',
    title: 'Console error on homepage',
    description: 'Unhandled exception in bundle.',
    url: 'http://localhost:3000/',
    reproductionSteps: ['Open homepage'],
    evidence: [],
    status: 'new',
    ...overrides,
  };
}

function sampleSession(findings: Finding[] = []): ExplorationSession {
  return {
    id: 'session-learning-1',
    goal: { ...sampleExplorationGoal, baseUrl: 'http://localhost:3000' },
    config: { ...defaultExplorationConfig, baseUrl: 'http://localhost:3000', learningEnabled: true },
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    status: 'completed',
    currentUrl: 'http://localhost:3000/',
    steps: [
      {
        id: 'step-001',
        index: 0,
        startedAt: new Date().toISOString(),
        beforeObservation: {
          id: 'obs-1',
          timestamp: new Date().toISOString(),
          phase: 'before',
          url: 'http://localhost:3000/',
          visibleText: 'Home',
          visibleTextSummary: 'Home',
          domSummary: '',
          interactiveElements: [],
          buttons: [],
          inputs: [],
          forms: [],
          links: [],
          consoleMessages: [],
          networkEvents: [],
        },
        observation: {
          id: 'obs-1',
          timestamp: new Date().toISOString(),
          phase: 'before',
          url: 'http://localhost:3000/',
          visibleText: 'Home',
          visibleTextSummary: 'Home',
          domSummary: '',
          interactiveElements: [],
          buttons: [],
          inputs: [],
          forms: [],
          links: [],
          consoleMessages: [],
          networkEvents: [],
        },
        plan: {
          id: 'plan-1',
          action: { kind: 'click', target: 'Search', selector: '#search' },
          rationale: 'Search',
          expectedOutcome: 'Search opens',
          validationIdea: 'Verify search',
          riskLevel: 'low',
          priority: 'search',
        },
        execution: {
          status: 'success',
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          action: { kind: 'click', target: 'Search', selector: '#search' },
          locatorStrategy: { type: 'role', role: 'button', value: 'Search' },
        },
        findings: [],
        status: 'validated',
      },
    ],
    findings,
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: 'exploratory-results/evidence',
  };
}

test('retrieves historical risks, selectors, and gaps before a session', async () => {
  const knowledge = createEmptyKnowledge();
  knowledge.riskScores.push({
    key: '/',
    dimension: 'route',
    score: 42,
    reasons: ['Repeated console errors'],
    lastUpdatedAt: new Date().toISOString(),
  });
  knowledge.reliableSelectors.push({
    selectorKey: 'role::Search',
    strategy: 'role',
    value: 'Search',
    successCount: 8,
    failureCount: 1,
    reliability: 0.89,
    lastUsedAt: new Date().toISOString(),
  });
  knowledge.explorationGaps.push({
    area: 'forms',
    reason: 'Forms rarely tested',
    recommendedPriority: 'forms',
    lastSeenAt: new Date().toISOString(),
  });
  knowledge.recurringBugs.push({
    fingerprint: findingFingerprint(sampleFinding()),
    title: sampleFinding().title,
    type: 'console-error',
    severity: 'medium',
    occurrences: 3,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    routes: ['/'],
    sessionIds: ['old-session'],
  });

  const context = retrieveMemoryForSession(knowledge, sampleExplorationGoal, defaultExplorationConfig);

  expect(context.knownRisks.length).toBeGreaterThan(0);
  expect(context.stableSelectors.some((item) => item.value === 'Search')).toBe(true);
  expect(context.explorationGaps.some((gap) => gap.area === 'forms')).toBe(true);
  expect(context.previousBugs.length).toBeGreaterThan(0);
});

test('updates risk scores and selector reliability after a session', () => {
  const knowledge = createEmptyKnowledge();
  const session = sampleSession([sampleFinding({ severity: 'high' })]);
  extractLearningSignals(knowledge, session);
  const riskUpdates = updateRiskScoresFromSession(knowledge, session);
  const summary = updateMemoryFromSession(knowledge, session);

  expect(riskUpdates).toBeGreaterThan(0);
  expect(knowledge.reliableSelectors.some((item) => item.value === 'Search')).toBe(true);
  expect(summary.selectorUpdates).toBeGreaterThan(0);
  expect(knowledge.sessionHistory.some((record) => record.sessionId === session.id)).toBe(true);
});

test('marks and suppresses false positives', () => {
  const knowledge = createEmptyKnowledge();
  const finding = sampleFinding();
  markFindingStatus(knowledge, finding, 'false-positive', 'Benign dev-only warning');

  expect(isSuppressedFinding(finding, knowledge)).toBe(true);
  expect(suppressedFingerprints(knowledge)).toContain(findingFingerprint(finding));
});

test('detects repeated bugs and compares historical runs', () => {
  const knowledge = createEmptyKnowledge();
  const finding = sampleFinding();
  recordRecurringBug(knowledge, finding, 'session-a');
  recordRecurringBug(knowledge, finding, 'session-b');
  knowledge.sessionHistory.push({
    sessionId: 'session-a',
    goalId: sampleExplorationGoal.id,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    findingCount: 2,
    status: 'completed',
  });

  const session = sampleSession([finding]);
  const comparison = compareWithHistory(knowledge, session);

  expect(knowledge.recurringBugs[0].occurrences).toBe(2);
  expect(comparison.repeatedIssues).toContain(finding.title);
});

test('boosts planner priority for historically risky and flaky areas', () => {
  const boost = memoryPriorityBoost({
    session: sampleSession(),
    observationUrl: 'http://localhost:3000/',
    priority: 'forms',
    action: { kind: 'fill', target: 'Email' },
    learning: {
      retrievedAt: new Date().toISOString(),
      knownRisks: [{ area: '/', route: '/', score: 40, reason: 'Historical failures' }],
      previousBugs: [],
      flakyFlows: [{ flowKey: '/::fill::email', summary: 'flaky', route: '/', failureCount: 2, successCount: 1, sessionIds: [] }],
      stableSelectors: [],
      healedSelectors: [],
      recommendedPriorities: ['forms'],
      explorationGaps: [{ area: 'forms', reason: 'under-tested', recommendedPriority: 'forms', lastSeenAt: new Date().toISOString() }],
      suppressedFindingFingerprints: [],
      falsePositiveCount: 0,
      historicalSessionCount: 2,
    },
  });

  expect(boost).toBeGreaterThan(20);
});

test('persists knowledge through JSON storage adapter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'learning-store-'));
  const filePath = join(dir, 'knowledge.json');
  const service = new LongTermMemoryService({ storagePath: filePath, adapter: 'json' });
  const session = sampleSession([sampleFinding()]);
  await service.updateFromSession(session);

  const reloaded = new JsonMemoryStorage(filePath);
  const knowledge = await reloaded.load();
  expect(knowledge.sessionHistory.length).toBe(1);
  expect(knowledge.reliableSelectors.length).toBeGreaterThan(0);

  await rm(dir, { recursive: true, force: true });
});

test('includes learning section in session report', async () => {
  const reportDir = await mkdtemp(join(tmpdir(), 'learning-report-'));
  const session = sampleSession([sampleFinding()]);
  session.config.learningEnabled = true;
  session.learningContext = {
    retrievedAt: new Date().toISOString(),
    knownRisks: [{ area: '/', route: '/', score: 30, reason: 'Prior failures' }],
    previousBugs: [],
    flakyFlows: [],
    stableSelectors: [],
    healedSelectors: [],
    recommendedPriorities: ['navigation'],
    explorationGaps: [],
    suppressedFindingFingerprints: [],
    falsePositiveCount: 1,
    historicalSessionCount: 2,
  };
  session.memoryUpdateSummary = {
    sessionId: session.id,
    updatedAt: new Date().toISOString(),
    newFindings: 1,
    recurringFindings: 0,
    regressionCandidates: [],
    newlyDiscoveredIssues: ['Console error on homepage'],
    improvementsSinceLastRun: [],
    memoryUpdates: ['Recorded 1 findings (0 recurring).'],
    riskScoreUpdates: 3,
    selectorUpdates: 1,
    falsePositivesRecorded: 1,
  };
  session.historicalComparison = {
    previousFindingCount: 2,
    currentFindingCount: 1,
    newIssues: ['Console error on homepage'],
    repeatedIssues: [],
    resolvedCandidates: [],
  };

  const reporter = new MarkdownReporter(reportDir);
  const reportPath = await reporter.writeSessionReport(session);
  const report = await readFile(reportPath, 'utf8');

  expect(report).toContain('## Long-Term Learning Summary');
  expect(report).toContain('Historical risk context');
  expect(report).toContain('Memory updates made');

  await rm(reportDir, { recursive: true, force: true });
});
