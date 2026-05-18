import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { BugReporter } from '../../src/reporting/bugReporter';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { mapInteractionHistoryToTest } from '../../src/test-generator/interactionToTestMapping';
import { rankSelectorStrategies } from '../../src/test-generator/selectorStrategy';
import { buildGeneratedTestSource } from '../../src/test-generator/testSourceBuilder';
import { VerifiedFlowTestGenerator } from '../../src/test-generator/verifiedFlowTestGenerator';
import type { ActionPlan, ExplorationSession, ExplorationStep, Finding } from '../../src/types';

function loginPlan(id: string, action: ActionPlan['action']): ActionPlan {
  return {
    id,
    action,
    rationale: 'Exercise login flow.',
    expectedOutcome: 'User reaches the dashboard.',
    validationIdea: 'Dashboard is visible after login.',
    riskLevel: 'low',
    priority: 'authentication',
  };
}

function successfulStep(args: {
  id: string;
  index: number;
  action: ActionPlan['action'];
  beforeUrl: string;
  afterUrl: string;
  afterTitle: string;
  afterText: string;
  locatorStrategy?: ExplorationStep['execution'] extends infer T ? T extends { locatorStrategy?: infer L } ? L : never : never;
}): ExplorationStep {
  const beforeObservation = createBlankObservation({
    id: `before-${args.id}`,
    phase: 'before',
    stepId: args.id,
    url: args.beforeUrl,
    title: 'Sign In',
    visibleText: 'Sign In Email Password',
    interactiveElements: [
      {
        kind: 'button',
        label: args.action.label || args.action.target || 'Sign In',
        visible: true,
      },
    ],
  });
  const afterObservation = createBlankObservation({
    id: `after-${args.id}`,
    phase: 'after',
    stepId: args.id,
    url: args.afterUrl,
    title: args.afterTitle,
    visibleText: args.afterText,
    visibleTextSummary: args.afterText,
    accessibilitySnapshot: 'role: main',
  });

  const plan = loginPlan(args.id, args.action);

  return {
    id: args.id,
    index: args.index,
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:01.000Z',
    beforeObservation,
    afterObservation,
    observation: beforeObservation,
    plan,
    execution: {
      status: 'success',
      startedAt: '2026-05-17T00:00:00.000Z',
      endedAt: '2026-05-17T00:00:01.000Z',
      action: plan.action,
      actualOutcome: 'Action succeeded.',
      locatorStrategy: args.locatorStrategy,
    },
    validation: {
      result: {
        passed: true,
        summary: 'Validated successfully.',
        expectedOutcome: plan.expectedOutcome,
        actualOutcome: args.afterText,
        checks: [{ name: 'visible-change', passed: true }],
      },
    },
    findings: [],
    status: 'validated',
  };
}

function createLoginSession(): ExplorationSession {
  const steps: ExplorationStep[] = [
    successfulStep({
      id: 'step-001',
      index: 0,
      action: { kind: 'click', label: 'Sign In', role: 'button' },
      beforeUrl: 'http://localhost:3000/',
      afterUrl: 'http://localhost:3000/login',
      afterTitle: 'Sign In',
      afterText: 'Email Password Login',
      locatorStrategy: { type: 'role', role: 'button', value: 'Sign In' },
    }),
    successfulStep({
      id: 'step-002',
      index: 1,
      action: { kind: 'fill', label: 'Email', role: 'textbox', value: 'user@example.com' },
      beforeUrl: 'http://localhost:3000/login',
      afterUrl: 'http://localhost:3000/login',
      afterTitle: 'Sign In',
      afterText: 'Email Password Login',
      locatorStrategy: { type: 'label', value: 'Email' },
    }),
    successfulStep({
      id: 'step-003',
      index: 2,
      action: { kind: 'fill', label: 'Password', role: 'textbox', value: 'secret' },
      beforeUrl: 'http://localhost:3000/login',
      afterUrl: 'http://localhost:3000/login',
      afterTitle: 'Sign In',
      afterText: 'Email Password Login',
      locatorStrategy: { type: 'label', value: 'Password' },
    }),
    successfulStep({
      id: 'step-004',
      index: 3,
      action: { kind: 'click', label: 'Login', role: 'button' },
      beforeUrl: 'http://localhost:3000/login',
      afterUrl: 'http://localhost:3000/dashboard',
      afterTitle: 'Dashboard',
      afterText: 'Dashboard Welcome back',
      locatorStrategy: { type: 'role', role: 'button', value: 'Login' },
    }),
  ];

  return {
    id: 'login-session',
    goal: {
      id: 'login-goal',
      name: 'Login smoke',
      description: 'Validate login flow.',
      targetUrl: 'http://localhost:3000/',
      priorities: ['authentication'],
    },
    config: {
      ...defaultExplorationConfig,
      environmentName: 'test',
      generateTests: true,
    },
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:04.000Z',
    status: 'completed',
    currentUrl: 'http://localhost:3000/dashboard',
    steps,
    findings: [],
    memory: {
      ...createSessionMemory(),
      visitedUrls: ['http://localhost:3000/', 'http://localhost:3000/login', 'http://localhost:3000/dashboard'],
    },
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: 'exploratory-results/evidence',
  };
}

function createBugSession(outputDirectory: string): ExplorationSession {
  const plan = loginPlan('plan-bug', { kind: 'click', target: 'Load data', label: 'Load data', role: 'button' });
  const beforeObservation = createBlankObservation({
    id: 'before-bug',
    phase: 'before',
    stepId: 'step-bug-001',
    url: 'http://localhost:3000/dashboard',
    title: 'Dashboard',
  });
  const afterObservation = createBlankObservation({
    id: 'after-bug',
    phase: 'after',
    stepId: 'step-bug-001',
    url: 'http://localhost:3000/dashboard',
    title: 'Dashboard',
    visibleText: 'Orders failed to load',
    failedNetworkRequests: [
      {
        method: 'GET',
        url: 'http://localhost:3000/api/orders',
        status: 500,
        timestamp: '2026-05-17T00:00:01.000Z',
      },
    ],
  });
  const finding: Finding = {
    id: 'network-failure:step-bug-001:orders',
    type: 'network-failure',
    severity: 'high',
    category: 'network-error',
    title: 'Orders API fails while loading dashboard',
    description: 'GET /api/orders returns 500.',
    url: 'http://localhost:3000/dashboard',
    stepId: 'step-bug-001',
    evidence: [],
    reproductionSteps: ['Open dashboard', 'Click Load data'],
    expectedResult: 'Orders load.',
    actualResult: 'Orders API returns 500.',
    status: 'new',
  };
  const step: ExplorationStep = {
    id: 'step-bug-001',
    index: 0,
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:01.000Z',
    beforeObservation,
    afterObservation,
    observation: beforeObservation,
    plan,
    execution: {
      status: 'success',
      startedAt: '2026-05-17T00:00:00.000Z',
      endedAt: '2026-05-17T00:00:01.000Z',
      action: plan.action,
      actualOutcome: 'Clicked Load data.',
      locatorStrategy: { type: 'role', role: 'button', value: 'Load data' },
    },
    validation: {
      result: {
        passed: false,
        summary: 'Failed network request detected.',
        expectedOutcome: plan.expectedOutcome,
        actualOutcome: 'Orders API returned 500.',
        findings: [finding],
      },
    },
    findings: [finding],
    status: 'failed',
  };

  return {
    id: 'bug-session',
    goal: {
      id: 'bug-goal',
      name: 'Dashboard data',
      description: 'Reproduce dashboard API failure.',
      priorities: ['console-network'],
    },
    config: {
      ...defaultExplorationConfig,
      environmentName: 'test',
      generateTests: true,
    },
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:01.000Z',
    status: 'completed',
    currentUrl: 'http://localhost:3000/dashboard',
    steps: [step],
    findings: [finding],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: outputDirectory,
  };
}

test('maps verified interaction history to a login regression test name', () => {
  const session = createLoginSession();
  const mapping = mapInteractionHistoryToTest(session.steps, 'successful-flow');

  expect(mapping.regressionTestName).toBe('login flow regression test');
  expect(mapping.interactionSummary).toEqual(['click Sign In', 'fill Email', 'fill Password', 'click Login']);
});

test('ranks selectors with role-based locators first', () => {
  const session = createLoginSession();
  const ranked = rankSelectorStrategies(session.steps[0]);

  expect(ranked[0]?.strategy.type).toBe('role');
  expect(ranked[0]?.expression).toContain('getByRole');
});

test('builds Playwright source with role locators, assertions, and metadata annotations', () => {
  const session = createLoginSession();
  const built = buildGeneratedTestSource({
    session,
    title: 'login flow regression test',
    steps: session.steps,
    generatedAt: '2026-05-17T00:00:04.000Z',
    flowCategory: 'successful-flow',
    confidenceScore: 'high',
  });

  expect(built.source).toContain("import { test, expect } from '@playwright/test';");
  expect(built.source).toContain('getByRole');
  expect(built.source).toContain('toHaveURL');
  expect(built.source).toContain('toBeVisible');
  expect(built.source).toContain('source exploratory session');
  expect(built.source).toContain('Verified interaction history:');
  expect(built.assertionCount).toBeGreaterThan(0);
});

test('generates verified flow tests without executing when disabled', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'generated-tests-'));
  const session = createLoginSession();

  const generated = await new VerifiedFlowTestGenerator({
    outputDirectory,
    execute: false,
    generatedAt: () => '2026-05-17T00:00:04.000Z',
  }).generate(session);

  expect(generated.length).toBeGreaterThan(0);
  expect(generated[0].title).toBe('login flow regression test');
  expect(generated[0].flowCategory).toBe('successful-flow');
  expect(generated[0].confidenceScore).toBe('high');
  expect(generated[0].metadata.sourceSessionId).toBe('login-session');
  expect(generated[0].filePath).toContain(outputDirectory);

  const source = await readFile(generated[0].filePath, 'utf8');
  expect(source).toContain('login flow regression test');
  expect(generated[0].executionResults[0]?.status).toBe('not-run');

  await rm(outputDirectory, { recursive: true, force: true });
});

test('generates reproduced bug tests from validated findings only', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'generated-bug-tests-'));
  const session = createBugSession(outputDirectory);

  const generated = await new VerifiedFlowTestGenerator({
    outputDirectory,
    execute: false,
    generatedAt: () => '2026-05-17T00:00:02.000Z',
  }).generate(session);

  expect(generated).toHaveLength(1);
  expect(generated[0].flowCategory).toBe('reproduced-bug');
  expect(generated[0].title).toContain('Orders API fails while loading dashboard');
  expect(generated[0].source).toContain('failedNetworkRequests');

  await rm(outputDirectory, { recursive: true, force: true });
});

test('includes generated tests in the session markdown report', async () => {
  const reportDirectory = await mkdtemp(join(tmpdir(), 'generated-test-report-'));
  const outputDirectory = join(reportDirectory, 'generated');
  const session = createLoginSession();

  session.generatedTests = await new VerifiedFlowTestGenerator({
    outputDirectory,
    execute: false,
    generatedAt: () => '2026-05-17T00:00:04.000Z',
  }).generate(session);

  const reportPath = await new MarkdownReporter(reportDirectory, new BugReporter(join(reportDirectory, 'bugs'))).writeSessionReport(
    session,
  );
  const report = await readFile(reportPath, 'utf8');

  expect(report).toContain('## Generated Tests');
  expect(report).toContain('login flow regression test');
  expect(report).toContain('successful-flow');
  expect(report).toContain(session.generatedTests[0].filePath);
  expect(report).toContain('high');

  await rm(reportDirectory, { recursive: true, force: true });
});
