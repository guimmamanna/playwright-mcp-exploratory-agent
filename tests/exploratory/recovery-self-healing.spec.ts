import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory, recordFailedAction } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import {
  decideRecovery,
  detectBlockedFlow,
  ensureRecoveryState,
  latestCheckpoint,
  RecoveryEngine,
  runRecoveryStrategy,
  saveCheckpoint,
} from '../../src/recovery';
import { defaultLocatorHealingEngine } from '../../src/self-healing/locatorHealingEngine';
import { resolveExplorationContext } from '../../src/environment/explorationContext';
import type { ActionExecutionResult, ActionPlan, ExplorationSession } from '../../src/types';

function createSession(overrides: Partial<ExplorationSession['config']> = {}): ExplorationSession {
  const { context } = resolveExplorationContext({
    config: { environmentId: 'local', personaId: 'anonymous-visitor', baseUrl: 'http://localhost:3000' },
  });
  return {
    id: 'recovery-session',
    goal: {
      id: 'recovery-goal',
      name: 'Recovery goal',
      description: 'Validate autonomous recovery and self-healing.',
      priorities: ['navigation', 'forms'],
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://localhost:3000',
      allowedDomains: ['localhost'],
      recoveryEnabled: true,
      maxRetriesPerAction: 3,
      maxRecoveryAttemptsPerSession: 15,
      maxSelectorHealingAttempts: 8,
      ...overrides,
    },
    explorationContext: context,
    startedAt: new Date().toISOString(),
    status: 'running',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: 'exploratory-results/evidence',
  };
}

function failedExecution(message: string): ActionExecutionResult {
  return {
    status: 'failed',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    action: { kind: 'click', target: 'Submit' },
    message,
    errors: [{ code: 'locator-not-found', message }],
  };
}

function samplePlan(): ActionPlan {
  return {
    id: 'plan-1',
    action: { kind: 'click', target: 'Submit', selector: '#broken-submit' },
    rationale: 'Submit the form',
    expectedOutcome: 'Form submits',
    validationIdea: 'Success message appears',
    riskLevel: 'low',
    priority: 'forms',
  };
}

test('heals broken selector using accessible name', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <button id="real-submit">Submit</button>
    </body></html>
  `);

  const session = createSession();
  const healed = await defaultLocatorHealingEngine.heal(
    page,
    session,
    { kind: 'click', target: 'Submit', selector: '#broken-submit' },
    ['button'],
  );

  expect(healed.success).toBe(true);
  expect(healed.strategy?.type).toBe('role');
});

test('detects session timeout and chooses re-login recovery', () => {
  const session = createSession();
  const observation = createBlankObservation({
    url: 'http://localhost:3000/dashboard',
    visibleTextSummary: 'Session expired. Please log in again to continue.',
  });
  const blocked = detectBlockedFlow({
    session,
    observation,
    execution: failedExecution('locator-not-found'),
  });

  expect(blocked.types).toContain('session-timeout');
  const decision = decideRecovery(
    blocked,
    { actionRetries: 0, maxActionRetries: 3, sessionRecoveryAttempts: 0, maxSessionRecoveryAttempts: 15 },
    session.config,
  );
  expect(decision.decision).toBe('recover');
  expect(decision.strategies).toContain('re-login');
});

test('dismisses modal overlay during recovery', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <dialog open role="dialog" aria-modal="true" id="blocker">
        <p>Confirm action</p>
        <button onclick="document.getElementById('blocker').remove()">Close</button>
      </dialog>
      <button id="primary">Continue</button>
    </body></html>
  `);

  const session = createSession();
  const result = await runRecoveryStrategy('clear-modal', {
    page,
    session,
    plan: samplePlan(),
    roleHints: ['button'],
  });

  expect(result.success).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('applies loading timeout recovery strategies', () => {
  const session = createSession();
  const observation = createBlankObservation({
    url: 'http://localhost:3000/list',
    visibleTextSummary: 'Loading... please wait',
    domSummary: 'spinner active',
    interactiveElements: [],
  });
  const blocked = detectBlockedFlow({ session, observation, execution: failedExecution('timeout') });

  expect(blocked.types).toContain('stuck-loading');
  const decision = decideRecovery(
    blocked,
    { actionRetries: 0, maxActionRetries: 3, sessionRecoveryAttempts: 0, maxSessionRecoveryAttempts: 15 },
    session.config,
  );
  expect(decision.strategies).toEqual(expect.arrayContaining(['wait-network-idle', 'refresh-page']));
});

test('stops recovery after repeated failures per action', () => {
  const session = createSession({ maxRetriesPerAction: 2 });
  const plan = samplePlan();
  recordFailedAction(session, plan.action, 'locator-not-found');
  recordFailedAction(session, plan.action, 'locator-not-found');

  const blocked = detectBlockedFlow({
    session,
    observation: createBlankObservation({ url: 'http://localhost:3000' }),
    execution: failedExecution('locator-not-found'),
  });

  const decision = decideRecovery(
    blocked,
    {
      actionRetries: 2,
      maxActionRetries: 2,
      sessionRecoveryAttempts: 1,
      maxSessionRecoveryAttempts: 15,
    },
    session.config,
  );

  expect(decision.decision).toBe('finding');
});

test('restores exploration from last stable checkpoint', async ({ page }) => {
  const stableUrl = 'http://localhost:3000/stable';
  await page.route(stableUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><h1>Stable dashboard</h1></body></html>',
    });
  });

  await page.goto(stableUrl);
  const session = createSession();
  const observation = createBlankObservation({ url: stableUrl, visibleTextSummary: 'Stable dashboard' });
  saveCheckpoint(session, observation, {
    status: 'success',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    action: { kind: 'navigate', url: stableUrl },
    message: 'Reached stable page',
  });

  await page.setContent('<html><body><h1>Broken state</h1></body></html>');
  const checkpoint = latestCheckpoint(session);
  expect(checkpoint?.url).toContain('/stable');

  const restored = await runRecoveryStrategy('restore-checkpoint', {
    page,
    session,
    plan: samplePlan(),
    roleHints: ['button'],
  });

  expect(restored.success).toBe(true);
  expect(restored.checkpointId).toBe(checkpoint?.id);
  await expect(page.locator('h1')).toHaveText('Stable dashboard');
});

test('records recovery attempts in session report', async ({ page }) => {
  const reportDir = await mkdtemp(join(tmpdir(), 'recovery-report-'));
  const session = createSession({ recoveryEnabled: true });
  ensureRecoveryState(session);
  session.recoveryState!.recoveryAttempts.push({
    id: 'recovery-1',
    timestamp: new Date().toISOString(),
    strategy: 'retry-improved-locator',
    success: true,
    message: 'Healed locator using role.',
    healedSelector: 'Submit',
  });
  session.endedAt = new Date().toISOString();
  session.status = 'completed';

  const reporter = new MarkdownReporter(reportDir);
  const reportPath = await reporter.writeSessionReport(session);
  const report = await readFile(reportPath, 'utf8');

  expect(report).toContain('## Recovery Summary');
  expect(report).toContain('retry-improved-locator');
  expect(report).toContain('Submit');

  await rm(reportDir, { recursive: true, force: true });
});

test('recovery engine retries action after locator healing', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <button>Continue</button>
    </body></html>
  `);

  const session = createSession({ recoveryEnabled: true, visionMultimodalEnabled: false });
  const engine = new RecoveryEngine({
    page,
    observe: async () =>
      createBlankObservation({
        url: page.url(),
        visibleTextSummary: await page.locator('body').innerText(),
        buttons: [{ kind: 'button', label: 'Continue', visible: true }],
      }),
    execute: async (plan) => {
      if (plan.action.selector === '#missing') {
        return failedExecution('locator-not-found');
      }
      await page.getByRole('button', { name: 'Continue' }).click();
      return {
        status: 'success',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        action: plan.action,
        message: 'Clicked Continue after recovery.',
      };
    },
  });

  const result = await engine.attemptRecovery({
    session,
    plan: { ...samplePlan(), action: { kind: 'click', target: 'Continue', selector: '#missing' } },
    execution: failedExecution('locator-not-found'),
    stepId: 'step-001',
  });

  expect(result.recovered).toBe(true);
  expect(result.attempts.some((attempt) => attempt.strategy.includes('locator'))).toBe(true);
});
