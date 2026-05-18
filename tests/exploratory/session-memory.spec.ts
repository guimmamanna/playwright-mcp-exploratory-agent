import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import {
  calculateCoverage,
  createSessionMemory,
  detectActionCycleLoop,
  detectPageStateLoop,
  evaluateStopConditions,
  isDuplicateAction,
  persistSessionMemory,
  refreshCoverage,
  updateMemoryFromObservation,
  updateMemoryFromPlan,
} from '../../src/memory/sessionMemory';
import { elementKeyFromAction } from '../../src/memory/elementKey';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { BugReporter } from '../../src/reporting/bugReporter';
import type { ExplorationSession, Finding } from '../../src/types';

function createSession(overrides: Partial<ExplorationSession> = {}): ExplorationSession {
  return {
    id: 'memory-session',
    goal: {
      id: 'memory-goal',
      name: 'Memory goal',
      description: 'Exercise adaptive session memory.',
      priorities: ['forms', 'navigation', 'filters'],
    },
    config: {
      ...defaultExplorationConfig,
      maxSteps: 5,
      maxDurationMinutes: 1,
      stopConditions: ['maxSteps', 'maxDuration', 'loopDetected', 'criticalFinding', 'maxCriticalFailures', 'userDefined'],
    },
    startedAt: '2026-05-17T00:00:00.000Z',
    status: 'running',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: 'exploratory-results/evidence',
    currentUrl: 'http://localhost:3000/products',
    ...overrides,
  };
}

test('detects duplicate actions on the same element', () => {
  const session = createSession();
  const action = { kind: 'click' as const, target: 'Search', selector: '#search' };
  const url = 'http://localhost:3000/products';
  const key = elementKeyFromAction(action, url);

  session.memory.clickedElements.push(key);
  session.memory.interactedElements.push(key);

  expect(isDuplicateAction(session, action, { url })).toBe(true);
  expect(isDuplicateAction(session, action, { url, allowRepeatForConfirmation: true })).toBe(false);
});

test('detects page-state and action-cycle loops', () => {
  const session = createSession();
  session.memory.observationSignatures.push('page-a', 'page-a', 'page-a');

  expect(detectPageStateLoop(session).detected).toBe(true);

  session.memory.actionHistory = [
    { kind: 'click', target: 'Home' },
    { kind: 'click', target: 'Products' },
    { kind: 'click', target: 'Home' },
    { kind: 'click', target: 'Products' },
  ];

  expect(detectActionCycleLoop(session).detected).toBe(true);
});

test('calculates exploration coverage from observations and interactions', () => {
  const session = createSession();
  const observation = createBlankObservation({
    url: 'http://localhost:3000/products',
    interactiveElements: [
      { kind: 'button', label: 'Search', selectorHint: '#search', visible: true },
      { kind: 'input', label: 'Email', selectorHint: '#email', visible: true },
    ],
    forms: [{ fieldCount: 1, labelsMissing: 0 }],
  });

  updateMemoryFromObservation(session, observation);
  updateMemoryFromPlan(session, {
    id: 'plan-001',
    action: { kind: 'click', target: 'Search', selector: '#search' },
    rationale: 'Click search',
    expectedOutcome: 'Search opens',
    validationIdea: 'Verify search UI',
    riskLevel: 'low',
    priority: 'navigation',
  });

  const coverage = calculateCoverage(session);

  expect(coverage.uniquePagesVisited).toBe(1);
  expect(coverage.interactiveElementsSeen).toBeGreaterThan(0);
  expect(coverage.interactiveElementsExplored).toBeGreaterThan(0);
  expect(coverage.explorationPercentage).toBeGreaterThan(0);
  expect(coverage.formsEncountered).toBe(1);
});

test('evaluates stop conditions for loops, critical findings, and user-defined stops', () => {
  const session = createSession();
  const deadline = Date.now() + 60_000;

  session.memory.observationSignatures.push('loop', 'loop', 'loop');
  expect(evaluateStopConditions(session, { deadline }).condition).toBe('loopDetected');

  const criticalSession = createSession({
    findings: [
      {
        id: 'critical-1',
        type: 'flow-failure',
        severity: 'critical',
        category: 'functional',
        title: 'Checkout broken',
        description: 'Checkout fails',
        status: 'new',
        evidence: [],
        reproductionSteps: [],
      },
    ],
  });

  expect(evaluateStopConditions(criticalSession, { deadline }).condition).toBe('criticalFinding');

  const userStopSession = createSession();
  userStopSession.memory.notes.push('user-stop: Operator requested halt.');
  expect(evaluateStopConditions(userStopSession, { deadline }).condition).toBe('userDefined');
});

test('persists session memory JSON and includes coverage in markdown report', async () => {
  const reportDirectory = await mkdtemp(join(tmpdir(), 'memory-report-'));
  const memoryPath = join(reportDirectory, 'session-memory.json');
  const session = createSession({
    memory: {
      ...createSessionMemory(),
      visitedUrls: ['http://localhost:3000/products'],
      exploredPages: ['Products (http://localhost:3000/products)'],
      clickedElements: ['http://localhost:3000/products::click::search'],
      pendingAreas: ['forms', 'navigation'],
      repeatedActionsPrevented: 2,
      stopReason: 'No meaningful exploratory actions remain.',
    },
    findings: [
      {
        id: 'finding-1',
        type: 'form-validation',
        severity: 'medium',
        category: 'functional',
        title: 'Email required',
        description: 'Validation shown',
        status: 'new',
        evidence: [],
        reproductionSteps: [],
      } as Finding,
    ],
  });

  refreshCoverage(session);
  await persistSessionMemory(session, memoryPath);

  const saved = JSON.parse(await readFile(memoryPath, 'utf8'));
  expect(saved.sessionId).toBe('memory-session');
  expect(saved.memory.visitedUrls).toContain('http://localhost:3000/products');
  expect(saved.coverage.uniquePagesVisited).toBe(1);
  expect(saved.repeatedActionsPrevented).toBe(2);

  const reportPath = await new MarkdownReporter(reportDirectory, new BugReporter(join(reportDirectory, 'bugs'))).writeSessionReport(
    session,
  );
  const report = await readFile(reportPath, 'utf8');

  expect(report).toContain('## Coverage Summary');
  expect(report).toContain('Explored areas:');
  expect(report).toContain('Unexplored areas:');
  expect(report).toContain('Repeated actions prevented: 2');
  expect(report).toContain('Stop reason: No meaningful exploratory actions remain.');

  await rm(reportDirectory, { recursive: true, force: true });
});
