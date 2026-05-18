import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { rankSelectorStrategies } from '../../src/test-generator/selectorStrategy';
import { VerifiedFlowTestGenerator } from '../../src/test-generator/verifiedFlowTestGenerator';
import type { ActionPlan, ExplorationSession, ExplorationStep } from '../../src/types';

function dataUrl() {
  return `data:text/html,${encodeURIComponent(`
    <!doctype html>
    <html>
      <head><title>Search Demo</title></head>
      <body>
        <form id="search-form">
          <label>Search products <input type="search" name="q" /></label>
          <button type="submit">Search</button>
        </form>
        <main id="results">No query yet</main>
        <script>
          document.querySelector('#search-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const query = new FormData(event.currentTarget).get('q');
            document.querySelector('#results').textContent = 'Results for ' + query;
          });
        </script>
      </body>
    </html>
  `)}`;
}

function plan(): ActionPlan {
  return {
    id: 'plan-001',
    action: {
      kind: 'search',
      target: 'Search products',
      value: 'test',
    },
    rationale: 'Search field is a safe exploratory target.',
    expectedOutcome: 'Search results are displayed for the submitted query.',
    validationIdea: 'Visible result text changes after submitting search.',
    riskLevel: 'low',
    priority: 'search',
  };
}

function createSession(outputDirectory: string): ExplorationSession {
  const url = dataUrl();
  const actionPlan = plan();
  const beforeObservation = createBlankObservation({
    id: 'before-search',
    phase: 'before',
    stepId: 'step-001',
    url,
    title: 'Search Demo',
    visibleText: 'Search products Search No query yet',
    visibleTextSummary: 'Search products Search No query yet',
    interactiveElements: [
      {
        kind: 'input',
        label: 'Search products',
        selectorHint: 'input[name="q"]',
        inputType: 'search',
        visible: true,
      },
    ],
    inputs: [
      {
        kind: 'input',
        label: 'Search products',
        selectorHint: 'input[name="q"]',
        inputType: 'search',
        visible: true,
      },
    ],
  });
  const afterObservation = createBlankObservation({
    id: 'after-search',
    phase: 'after',
    stepId: 'step-001',
    url,
    title: 'Search Demo',
    visibleText: 'Search products Search Results for test',
    visibleTextSummary: 'Results for test',
  });
  const step: ExplorationStep = {
    id: 'step-001',
    index: 0,
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:01.000Z',
    beforeObservation,
    afterObservation,
    observation: beforeObservation,
    plan: actionPlan,
    execution: {
      status: 'success',
      startedAt: '2026-05-17T00:00:00.000Z',
      endedAt: '2026-05-17T00:00:01.000Z',
      action: actionPlan.action,
      locatorStrategy: {
        type: 'role',
        role: 'searchbox',
        value: 'Search products',
      },
      actualOutcome: 'Searched for "test".',
    },
    validation: {
      result: {
        passed: true,
        summary: 'Search action validated.',
        expectedOutcome: actionPlan.expectedOutcome,
        actualOutcome: 'Visible UI changed.',
        findings: [],
      },
    },
    findings: [],
    status: 'validated',
  };

  return {
    id: 'generated-test-session',
    goal: {
      id: 'generated-search',
      name: 'Generated search',
      description: 'Generate a regression test from a validated search flow.',
      priorities: ['search'],
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: url,
      generateTests: true,
      reportingOptions: {
        ...defaultExplorationConfig.reportingOptions,
        reportDirectory: outputDirectory,
      },
    },
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:01.000Z',
    status: 'completed',
    currentUrl: url,
    steps: [step],
    findings: [],
    memory: {
      ...createSessionMemory(),
      observations: [beforeObservation, afterObservation],
      visitedUrls: [url],
    },
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: outputDirectory,
  };
}

test('ranks role-based selectors before CSS and text fallbacks', () => {
  const session = createSession('unused');
  const step = session.steps[0];
  step.plan.action.selector = 'input[name="q"]';

  const strategies = rankSelectorStrategies(step).map((candidate) => candidate.strategy.type);

  expect(strategies[0]).toBe('role');
  expect(strategies).toContain('css');
  expect(strategies.indexOf('role')).toBeLessThan(strategies.indexOf('css'));
});

test('writes and executes reusable Playwright tests from validated interaction history', async () => {
  const outputDirectory = await mkdtemp(join(process.cwd(), 'tests/exploratory/.generated-'));

  try {
    const session = createSession(outputDirectory);
    const generator = new VerifiedFlowTestGenerator({
      outputDirectory,
      execute: true,
      project: 'chromium',
      reporter: 'line',
      generatedAt: () => '2026-05-17T00:00:02.000Z',
    });

    const generatedTests = await generator.generate(session);

    expect(generatedTests).toHaveLength(1);
    expect(generatedTests[0].status).toBe('passed');
    expect(generatedTests[0].flowCategory).toBe('successful-flow');
    expect(generatedTests[0].confidenceScore).toBe('high');
    expect(generatedTests[0].metadata.sourceSessionId).toBe(session.id);
    expect(generatedTests[0].executionResults.at(-1)?.status).toBe('passed');

    const source = await readFile(generatedTests[0].filePath, 'utf8');
    expect(source).toContain("import { test, expect } from '@playwright/test';");
    expect(source).toContain("page.getByRole(\"searchbox\"");
    expect(source).toContain('Results for test');
    expect(source).toContain('source exploratory session');
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
