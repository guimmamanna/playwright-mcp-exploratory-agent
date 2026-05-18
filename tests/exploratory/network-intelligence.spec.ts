import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { classifyNetworkRequest, scoreNetworkIssueSeverity } from '../../src/network';
import { defaultNetworkEngine } from '../../src/network/networkEngine';
import { slowSeverityForResponseTime } from '../../src/network/performanceThresholds';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { PlaywrightPageObserver } from '../../src/observer/playwrightPageObserver';
import { PlaywrightActionExecutor } from '../../src/executor/playwrightActionExecutor';
import { BugReporter } from '../../src/reporting/bugReporter';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { BasicValidator } from '../../src/validator/basicValidator';
import type { ExplorationSession, ExplorationStep } from '../../src/types';

function createSession(evidenceDirectory: string): ExplorationSession {
  return {
    id: 'network-session',
    goal: {
      id: 'network-goal',
      name: 'Network goal',
      description: 'Verify network intelligence.',
      priorities: ['console-network', 'navigation'],
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://localhost:3000',
      evidenceDirectory,
      networkIntelligenceEnabled: true,
    },
    startedAt: '2026-05-17T00:00:00.000Z',
    status: 'running',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory,
  };
}

test('classifies 4xx responses as client or validation errors', () => {
  expect(
    classifyNetworkRequest({
      id: '1',
      url: 'http://localhost:3000/api/profile',
      method: 'PATCH',
      status: 400,
      responseBodySummary: '{"errors":[{"field":"email","message":"invalid"}]}',
      timestamp: '2026-05-17T00:00:00.000Z',
    }),
  ).toBe('validation-error');

  expect(
    classifyNetworkRequest({
      id: '2',
      url: 'http://localhost:3000/api/items/1',
      method: 'GET',
      status: 404,
      timestamp: '2026-05-17T00:00:00.000Z',
    }),
  ).toBe('client-error');
});

test('classifies 5xx responses as server errors', () => {
  const classification = classifyNetworkRequest({
    id: '3',
    url: 'http://localhost:3000/api/orders',
    method: 'GET',
    status: 500,
    resourceType: 'fetch',
    timestamp: '2026-05-17T00:00:00.000Z',
  });

  expect(classification).toBe('server-error');
  expect(scoreNetworkIssueSeverity(
    {
      id: '3',
      url: 'http://localhost:3000/api/orders',
      method: 'GET',
      status: 500,
      timestamp: '2026-05-17T00:00:00.000Z',
    },
    classification!,
  )).toBe('high');
});

test('detects timeout and slow request thresholds', () => {
  expect(
    classifyNetworkRequest({
      id: '4',
      url: 'http://localhost:3000/api/search',
      method: 'GET',
      failureText: 'net::ERR_TIMED_OUT',
      timestamp: '2026-05-17T00:00:00.000Z',
    }),
  ).toBe('timeout');

  expect(slowSeverityForResponseTime(1200)).toBe('medium');
  expect(slowSeverityForResponseTime(3500)).toBe('high');
  expect(slowSeverityForResponseTime(9000)).toBe('critical');

  expect(
    classifyNetworkRequest({
      id: '5',
      url: 'http://localhost:3000/api/dashboard',
      method: 'GET',
      status: 200,
      resourceType: 'fetch',
      responseTimeMs: 3200,
      isSlow: true,
      slowSeverity: 'high',
      timestamp: '2026-05-17T00:00:00.000Z',
    }),
  ).toBe('performance-degradation');
});

test('correlates network issues with triggering actions during exploration', async ({ page }) => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'network-intelligence-'));
  const session = createSession(evidenceDirectory);
  const observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
  const executor = new PlaywrightActionExecutor(page, observer);
  const validator = new BasicValidator();

  await page.route('http://localhost:3000/**', async (route) => {
    if (route.request().url().includes('/api/orders')) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server failure"}' });
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <html><body>
          <button id="load">Load orders</button>
          <script>
            document.getElementById('load').addEventListener('click', () => fetch('/api/orders'));
          </script>
        </body></html>
      `,
    });
  });

  await page.goto('http://localhost:3000/');
  const plan = {
    id: 'plan-001',
    action: { kind: 'click' as const, target: 'Load orders', selector: '#load' },
    rationale: 'Load orders from API',
    expectedOutcome: 'Orders load successfully',
    validationIdea: 'No failed API requests',
    riskLevel: 'low' as const,
    priority: 'console-network' as const,
  };

  const beforeObservation = await observer.observe(session, 'before', 'step-001');
  const execution = await executor.execute(plan, session);
  await page.waitForLoadState('networkidle').catch(() => {});
  const afterObservation = await observer.observe(session, 'after', 'step-001');

  const step: ExplorationStep = {
    id: 'step-001',
    index: 0,
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:01.000Z',
    beforeObservation,
    afterObservation,
    observation: beforeObservation,
    plan,
    execution,
    findings: [],
    status: 'validated',
  };

  const validation = await validator.validate({ session, step, execution });
  const correlated = validation.findings.find((finding) => finding.type === 'network-failure');

  expect(execution.status).toBe('success');
  expect(correlated).toBeTruthy();
  expect(correlated?.correlatedRequestUrl).toContain('/api/orders');
  expect(correlated?.apiClassification).toBe('server-error');
  expect(afterObservation.networkSignals?.failedCount).toBeGreaterThan(0);

  session.steps.push(step);
  session.findings.push(...defaultNetworkEngine.findingsFromObservation(afterObservation), ...validation.findings);

  const reportPath = await new MarkdownReporter(evidenceDirectory, new BugReporter(join(evidenceDirectory, 'bugs'))).writeSessionReport(
    session,
  );
  const report = await readFile(reportPath, 'utf8');
  expect(report).toContain('## Network Summary');
  expect(report).toContain('server-error');

  const bugReports = await new BugReporter(join(evidenceDirectory, 'bugs')).writeBugReports(session);
  expect(bugReports.some((bug) => bug.category === 'network-error')).toBe(true);

  await rm(evidenceDirectory, { recursive: true, force: true });
});
