import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { BugReporter } from '../../src/reporting/bugReporter';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import type { ActionPlan, ExplorationSession, ExplorationStep, Finding } from '../../src/types';

function actionPlan(): ActionPlan {
  return {
    id: 'plan-001',
    action: {
      kind: 'click',
      target: 'Load data',
    },
    rationale: 'Exercise data loading.',
    expectedOutcome: 'Data loads without failed network requests.',
    validationIdea: 'Observe visible data and failed network requests.',
    riskLevel: 'low',
    priority: 'navigation',
  };
}

function createSession(reportDirectory: string, bugReportDirectory: string): ExplorationSession {
  const plan = actionPlan();
  const beforeObservation = createBlankObservation({
    id: 'before-001',
    phase: 'before',
    stepId: 'step-001',
    url: 'http://localhost:3000/dashboard',
    title: 'Dashboard',
    screenshotPath: join(reportDirectory, 'before.png'),
  });
  const afterObservation = createBlankObservation({
    id: 'after-001',
    phase: 'after',
    stepId: 'step-001',
    url: 'http://localhost:3000/dashboard',
    title: 'Dashboard',
    screenshotPath: join(reportDirectory, 'after.png'),
    consoleMessages: [
      {
        level: 'error',
        text: 'Uncaught TypeError: cannot read property id',
        timestamp: '2026-05-17T00:00:00.000Z',
        location: 'app.js:10',
      },
    ],
    failedNetworkRequests: [
      {
        method: 'GET',
        url: 'http://localhost:3000/api/orders',
        status: 500,
        timestamp: '2026-05-17T00:00:01.000Z',
        resourceType: 'fetch',
      },
    ],
  });
  const finding: Finding = {
    id: 'network-failure:step-001:orders-api',
    type: 'network-failure',
    severity: 'medium',
    category: 'network-error',
    title: 'Orders API fails while loading dashboard',
    description: 'GET /api/orders returns 500 after clicking Load data.',
    url: 'http://localhost:3000/dashboard',
    stepId: 'step-001',
    evidence: [{ label: 'After screenshot', path: join(reportDirectory, 'after.png'), kind: 'screenshot' }],
    reproductionSteps: ['Open http://localhost:3000/dashboard', 'Click Load data'],
    expectedResult: 'Dashboard orders load successfully.',
    actualResult: 'Orders API returns 500 and the dashboard stays empty.',
    suspectedRootCause: 'Server error from /api/orders.',
    status: 'new',
  };
  const step: ExplorationStep = {
    id: 'step-001',
    index: 0,
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:02.000Z',
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
      name: 'Bug reporting goal',
      description: 'Verify standalone bug report generation.',
      priorities: ['navigation', 'console-network'],
    },
    config: {
      ...defaultExplorationConfig,
      environmentName: 'test',
      reportingOptions: {
        ...defaultExplorationConfig.reportingOptions,
        reportDirectory,
      },
    },
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:02.000Z',
    status: 'completed',
    currentUrl: 'http://localhost:3000/dashboard',
    steps: [step],
    findings: [finding],
    memory: {
      ...createSessionMemory(),
      observations: [beforeObservation, afterObservation],
      visitedUrls: ['http://localhost:3000/dashboard'],
    },
    generatedTests: [
      {
        id: 'generated-001',
        title: 'dashboard data failure',
        filePath: 'tests/exploratory/dashboard-data.spec.ts',
        source: '',
        basedOnStepIds: ['step-001'],
        status: 'draft',
        generatedAt: '2026-05-17T00:00:02.000Z',
        flowCategory: 'reproduced-bug',
        confidenceScore: 'high',
        metadata: {
          sourceSessionId: 'bug-session',
          generatedTimestamp: '2026-05-17T00:00:02.000Z',
          flowCategory: 'reproduced-bug',
          confidenceScore: 'high',
          selectorStrategies: [],
        },
        executionResults: [],
      },
    ],
    bugReports: [],
    evidenceDirectory: reportDirectory,
  };
}

test('writes standalone markdown bug reports with structured evidence', async () => {
  const reportDirectory = await mkdtemp(join(tmpdir(), 'exploratory-report-'));
  const bugReportDirectory = join(reportDirectory, 'bugs');
  const session = createSession(reportDirectory, bugReportDirectory);

  const reports = await new BugReporter(bugReportDirectory).writeBugReports(session);

  expect(reports).toHaveLength(1);
  expect(reports[0].severity).toBe('high');
  expect(reports[0].category).toBe('network-error');
  expect(reports[0].consoleLogs).toHaveLength(1);
  expect(reports[0].failedNetworkRequests).toHaveLength(1);
  expect(session.findings[0].bugReportPath).toBeTruthy();

  const bugReport = await readFile(reports[0].reportPath!, 'utf8');
  expect(bugReport).toContain('# Orders API fails while loading dashboard');
  expect(bugReport).toContain('| Severity | High |');
  expect(bugReport).toContain('| Category | Network Error |');
  expect(bugReport).toContain('## Steps To Reproduce');
  expect(bugReport).toContain('GET http://localhost:3000/api/orders -> 500');
  expect(bugReport).toContain('Uncaught TypeError');
  expect(bugReport).toContain('tests/exploratory/dashboard-data.spec.ts');
});

test('links standalone bug reports from the session report', async () => {
  const reportDirectory = await mkdtemp(join(tmpdir(), 'exploratory-session-report-'));
  const bugReportDirectory = join(reportDirectory, 'bugs');
  const session = createSession(reportDirectory, bugReportDirectory);

  const reportPath = await new MarkdownReporter(reportDirectory, new BugReporter(bugReportDirectory)).writeSessionReport(session);
  const sessionReport = await readFile(reportPath, 'utf8');

  expect(session.bugReports).toHaveLength(1);
  expect(sessionReport).toContain('## Findings Summary');
  expect(sessionReport).toContain('- Bug reports: 1');
  expect(sessionReport).toContain('| High | Network Error | network-failure | Orders API fails while loading dashboard |');
  expect(sessionReport).toContain('[bug report]');
});
