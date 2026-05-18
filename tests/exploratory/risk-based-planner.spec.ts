import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { RiskBasedPlanner } from '../../src/planner/riskBasedPlanner';
import type { ExplorationGoal, ExplorationSession, Observation } from '../../src/types';

const goal: ExplorationGoal = {
  id: 'planner-test-goal',
  name: 'Planner test goal',
  description: 'Exercise planner decisions.',
  priorities: ['search', 'forms', 'filters', 'navigation', 'settings', 'accessibility'],
  destructiveActionsAllowed: false,
};

function createSession(overrides: Partial<ExplorationSession> = {}): ExplorationSession {
  return {
    id: 'planner-session',
    goal,
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://localhost:3000',
      allowedDomains: ['localhost'],
      maxSteps: 5,
    },
    startedAt: new Date().toISOString(),
    status: 'running',
    currentUrl: 'http://localhost:3000',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: defaultExplorationConfig.evidenceDirectory,
    ...overrides,
  };
}

async function plan(observation: Observation, session = createSession()) {
  return new RiskBasedPlanner().planNextAction({
    session,
    observation,
    findings: [],
  });
}

test('navigates to base URL when the browser has no page loaded', async () => {
  const actionPlan = await plan(createBlankObservation({ url: 'about:blank' }));

  expect(actionPlan.action.kind).toBe('navigate');
  expect(actionPlan.action.url).toBe('http://localhost:3000');
  expect(actionPlan.riskLevel).toBe('low');
  expect(actionPlan.validationIdea).toContain('URL');
});

test('prioritises safe search fields over buttons, forms, and links', async () => {
  const observation = createBlankObservation({
    url: 'http://localhost:3000/products',
    inputs: [
      {
        kind: 'input',
        label: 'Search products',
        placeholder: 'Search',
        selectorHint: '[placeholder="Search"]',
        inputType: 'search',
        visible: true,
      },
      {
        kind: 'input',
        label: 'Email',
        selectorHint: '#email',
        inputType: 'email',
        visible: true,
      },
    ],
    buttons: [
      {
        kind: 'button',
        label: 'Checkout',
        selectorHint: '#checkout',
        visible: true,
      },
      {
        kind: 'button',
        label: 'Apply filters',
        selectorHint: '#apply',
        visible: true,
      },
    ],
    links: [
      {
        kind: 'link',
        label: 'Settings',
        href: 'http://localhost:3000/settings',
        selectorHint: 'a[aria-label="Settings"]',
        visible: true,
      },
    ],
  });

  const actionPlan = await plan(observation);

  expect(actionPlan.priority).toBe('search');
  expect(actionPlan.action.kind).toBe('search');
  expect(actionPlan.action.selector).toBe('[placeholder="Search"]');
  expect(actionPlan.action.value).toBe('test');
  expect(actionPlan.validationIdea).toMatch(/submitting search|results|URL/i);
});

test('avoids repeated actions and chooses the next meaningful safe candidate', async () => {
  const session = createSession();
  session.memory.actionHistory.push({
    kind: 'fill',
    selector: '[placeholder="Search"]',
    target: 'Search products',
    value: 'test',
  });

  const observation = createBlankObservation({
    url: 'http://localhost:3000/products',
    inputs: [
      {
        kind: 'input',
        label: 'Search products',
        placeholder: 'Search',
        selectorHint: '[placeholder="Search"]',
        inputType: 'search',
        visible: true,
      },
      {
        kind: 'input',
        label: 'Email',
        selectorHint: '#email',
        inputType: 'email',
        visible: true,
      },
    ],
  });

  const actionPlan = await plan(observation, session);

  expect(actionPlan.priority).toBe('forms');
  expect(actionPlan.action.kind).toBe('fill');
  expect(actionPlan.action.selector).toBe('#email');
  expect(actionPlan.action.value).toBe('test@example.com');
});

test('filters out checkout, destructive, and external-domain actions', async () => {
  const observation = createBlankObservation({
    url: 'http://localhost:3000/products',
    buttons: [
      {
        kind: 'button',
        label: 'Checkout',
        selectorHint: '#checkout',
        visible: true,
      },
      {
        kind: 'button',
        label: 'Delete account',
        selectorHint: '#delete-account',
        visible: true,
      },
    ],
    links: [
      {
        kind: 'link',
        label: 'External help',
        href: 'https://example.com/help',
        selectorHint: 'a[href="https://example.com/help"]',
        visible: true,
      },
    ],
  });

  const actionPlan = await plan(observation);

  expect(actionPlan.action.kind).toBe('stop');
  expect(actionPlan.stopAfterAction).toBe(true);
  expect(actionPlan.rationale).toContain('unsafe');
});

test('can choose filter controls before generic navigation links', async () => {
  const observation = createBlankObservation({
    url: 'http://localhost:3000/products',
    buttons: [
      {
        kind: 'button',
        label: 'Size filter',
        selectorHint: '#size-filter',
        visible: true,
      },
    ],
    links: [
      {
        kind: 'link',
        label: 'Home',
        href: 'http://localhost:3000/',
        selectorHint: 'a[href="/"]',
        visible: true,
      },
    ],
  });

  const actionPlan = await plan(observation);

  expect(actionPlan.priority).toBe('filters');
  expect(actionPlan.action.kind).toBe('click');
  expect(actionPlan.action.selector).toBe('#size-filter');
  expect(actionPlan.expectedOutcome).toMatch(/filtered|filter/i);
  expect(actionPlan.validationIdea).toMatch(/selected filter|result count|URL/i);
});

test('assigns medium risk to settings-style exploration without applying changes', async () => {
  const observation = createBlankObservation({
    url: 'http://localhost:3000/account',
    links: [
      {
        kind: 'link',
        label: 'Language preferences',
        href: 'http://localhost:3000/preferences/language',
        selectorHint: 'a[href="/preferences/language"]',
        visible: true,
      },
    ],
  });

  const actionPlan = await plan(observation);

  expect(actionPlan.priority).toBe('settings');
  expect(actionPlan.riskLevel).toBe('medium');
  expect(actionPlan.action.kind).toBe('navigate');
  expect(actionPlan.validationIdea).toMatch(/settings|preferences/i);
});
