import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { PlaywrightActionExecutor } from '../../src/executor/playwrightActionExecutor';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { PlaywrightPageObserver } from '../../src/observer/playwrightPageObserver';
import { BasicValidator } from '../../src/validator/basicValidator';
import type { ActionPlan, ExplorationSession, ExplorationStep, Observation } from '../../src/types';

async function makeSession(page: Page): Promise<ExplorationSession> {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'action-executor-evidence-'));
  return {
    id: `action-executor-${Date.now()}`,
    goal: {
      id: 'executor-validator-goal',
      name: 'Executor validator goal',
      description: 'Exercise action execution and validation.',
      priorities: ['search', 'forms', 'navigation', 'console-network'],
      destructiveActionsAllowed: false,
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: page.url(),
      allowedDomains: ['example.com'],
      evidenceDirectory,
      screenshotMode: 'every-step',
    },
    startedAt: new Date().toISOString(),
    status: 'running',
    currentUrl: page.url(),
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory,
  };
}

function makePlan(overrides: Partial<ActionPlan>): ActionPlan {
  return {
    id: 'plan-test',
    priority: 'search',
    riskLevel: 'low',
    action: {
      kind: 'noop',
    },
    rationale: 'Test action.',
    expectedOutcome: 'The page changes in an observable way.',
    validationIdea: 'Compare before and after observations.',
    ...overrides,
  };
}

async function makeStep(args: {
  plan: ActionPlan;
  beforeObservation: Observation;
  afterObservation?: Observation;
  execution?: ExplorationStep['execution'];
}): Promise<ExplorationStep> {
  return {
    id: 'step-001',
    index: 0,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    beforeObservation: args.beforeObservation,
    afterObservation: args.afterObservation,
    observation: args.beforeObservation,
    plan: args.plan,
    execution: args.execution,
    findings: [],
    status: args.execution?.status === 'success' ? 'executed' : args.execution?.status || 'planned',
  };
}

test('executes a search action with role-based locator and validates the UI change', async ({ page }) => {
  await page.route('http://example.com/search', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <html>
          <head><title>Search Page</title></head>
          <body>
            <form id="search-form">
              <label>Search products <input type="search" name="q" /></label>
              <button type="submit">Search</button>
            </form>
            <main id="results">No query yet</main>
            <script>
              document.querySelector('#search-form').addEventListener('submit', event => {
                event.preventDefault();
                const q = new FormData(event.currentTarget).get('q');
                document.querySelector('#results').textContent = 'Results for ' + q;
                history.pushState({}, '', '/results?q=' + encodeURIComponent(q));
              });
            </script>
          </body>
        </html>
      `,
    });
  });

  await page.goto('http://example.com/search');
  const session = await makeSession(page);
  const observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
  const executor = new PlaywrightActionExecutor(page, observer);
  const validator = new BasicValidator();
  const plan = makePlan({
    action: {
      kind: 'search',
      target: 'Search products',
      value: 'blue shirt',
    },
    expectedOutcome: 'Search results are shown for the submitted query.',
  });

  const beforeObservation = await observer.observe(session, 'before', 'step-001');
  const execution = await executor.execute(plan, session);
  const afterObservation = await observer.observe(session, 'after', 'step-001');
  const step = await makeStep({ plan, beforeObservation, afterObservation, execution });
  const validation = await validator.validate({ session, step, execution });

  expect(execution.status).toBe('success');
  expect(execution.locatorStrategy?.type).toBe('role');
  expect(execution.locatorStrategy?.role).toBe('searchbox');
  expect(afterObservation.visibleText).toContain('Results for blue shirt');
  expect(validation.passed).toBe(true);
  expect(validation.checks?.some((check) => check.name === 'URL change check' && check.passed)).toBe(true);
  expect(validation.actualOutcome).toContain('URL changed');
});

test('captures disabled element execution failures as validation findings', async ({ page }) => {
  await page.setContent('<button disabled>Save</button>');
  const session = await makeSession(page);
  const observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
  const executor = new PlaywrightActionExecutor(page, observer);
  const validator = new BasicValidator();
  const plan = makePlan({
    action: {
      kind: 'click',
      target: 'Save',
    },
  });

  const beforeObservation = await observer.observe(session, 'before', 'step-001');
  const execution = await executor.execute(plan, session);
  const afterObservation = await observer.observe(session, 'after', 'step-001');
  const step = await makeStep({ plan, beforeObservation, afterObservation, execution });
  const validation = await validator.validate({ session, step, execution });

  expect(execution.status).toBe('failed');
  expect(execution.errors?.[0].code).toBe('element-not-enabled');
  expect(validation.passed).toBe(false);
  expect(validation.findings[0].type).toBe('flow-failure');
});

test('blocks destructive actions before interacting with the page', async ({ page }) => {
  await page.setContent('<button>Delete account</button>');
  const session = await makeSession(page);
  const observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
  const executor = new PlaywrightActionExecutor(page, observer);
  const validator = new BasicValidator();
  const plan = makePlan({
    action: {
      kind: 'click',
      target: 'Delete account',
      reason: 'Delete account',
    },
  });

  const beforeObservation = await observer.observe(session, 'before', 'step-001');
  const execution = await executor.execute(plan, session);
  const afterObservation = await observer.observe(session, 'after', 'step-001');
  const step = await makeStep({ plan, beforeObservation, afterObservation, execution });
  const validation = await validator.validate({ session, step, execution });

  expect(execution.status).toBe('blocked');
  expect(execution.errors?.[0].code).toBe('blocked-risky-action');
  expect(validation.passed).toBe(false);
  expect(validation.findings[0].type).toBe('safety');
});

test('validator flags failed network requests introduced by an action', async ({ page }) => {
  await page.route('http://example.com/network', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <html>
          <head><title>Network Page</title></head>
          <body>
            <button id="load">Load data</button>
            <script>
              document.querySelector('#load').addEventListener('click', () => fetch('/api/fail'));
            </script>
          </body>
        </html>
      `,
    });
  });
  await page.route('http://example.com/api/fail', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
  });

  await page.goto('http://example.com/network');
  const session = await makeSession(page);
  const observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
  const executor = new PlaywrightActionExecutor(page, observer);
  const validator = new BasicValidator();
  const plan = makePlan({
    action: {
      kind: 'click',
      target: 'Load data',
    },
    expectedOutcome: 'The data load completes without failed requests.',
  });

  const beforeObservation = await observer.observe(session, 'before', 'step-001');
  const execution = await executor.execute(plan, session);
  await page.waitForLoadState('networkidle').catch(() => {});
  const afterObservation = await observer.observe(session, 'after', 'step-001');
  const step = await makeStep({ plan, beforeObservation, afterObservation, execution });
  const validation = await validator.validate({ session, step, execution });

  expect(execution.status).toBe('success');
  expect(validation.passed).toBe(false);
  expect(validation.findings.some((finding) => finding.type === 'network-failure')).toBe(true);
});
