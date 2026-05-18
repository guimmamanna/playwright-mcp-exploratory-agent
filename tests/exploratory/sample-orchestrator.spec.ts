import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { sampleExplorationGoal } from '../../src/config/sampleGoal';
import { PlaywrightMcpExecutor, type PlaywrightMcpToolClient } from '../../src/executor/mcpExecutor';
import { BasicHeuristicEngine } from '../../src/heuristics/basicHeuristics';
import { ExploratoryOrchestrator } from '../../src/orchestrator/exploratoryOrchestrator';
import { RiskBasedPlanner } from '../../src/planner/riskBasedPlanner';
import { BugReporter } from '../../src/reporting/bugReporter';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { VerifiedFlowTestGenerator } from '../../src/test-generator/verifiedFlowTestGenerator';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { BasicValidator } from '../../src/validator/basicValidator';
import type { ExplorationSession, Observation } from '../../src/types';

class MockMcpToolClient implements PlaywrightMcpToolClient {
  private currentUrl = 'about:blank';

  async observe(_session: ExplorationSession): Promise<Observation> {
    if (this.currentUrl === 'about:blank') {
      return createBlankObservation({
        id: 'initial-observation',
        url: 'about:blank',
      });
    }

    return createBlankObservation({
      id: 'homepage-observation',
      url: this.currentUrl,
      title: 'Sample App',
      visibleText: 'Welcome Search Settings',
      interactiveElements: [
        {
          kind: 'link',
          label: 'Home',
          href: this.currentUrl,
          visible: true,
        },
        {
          kind: 'button',
          label: 'Search',
          visible: true,
        },
      ],
      links: [
        {
          kind: 'link',
          label: 'Home',
          href: this.currentUrl,
          visible: true,
        },
      ],
      consoleMessages: [],
      networkEvents: [],
    });
  }

  async navigate(url: string): Promise<void> {
    this.currentUrl = url;
  }

  async click(_target: string): Promise<void> {}

  async fill(_target: string, _value: string): Promise<void> {}

  async select(_target: string, _value: string): Promise<void> {}

  async press(_key: string): Promise<void> {}

  async wait(_timeoutMs: number): Promise<void> {}

  async screenshot(_session: ExplorationSession): Promise<string | undefined> {
    return undefined;
  }
}

test('sample exploratory orchestrator writes a markdown report', async () => {
  const reportDirectory = await mkdtemp(join(tmpdir(), 'exploratory-report-'));
  const config = {
    ...defaultExplorationConfig,
    baseUrl: 'http://localhost:3000',
    allowedDomains: ['localhost'],
    maxSteps: 3,
    reasoningEnabled: false,
    multiAgentEnabled: false,
    stopConditions: defaultExplorationConfig.stopConditions.filter((condition) => condition !== 'loopDetected'),
    reportingOptions: {
      ...defaultExplorationConfig.reportingOptions,
      reportDirectory,
    },
  };

  const orchestrator = new ExploratoryOrchestrator({
    goal: {
      ...sampleExplorationGoal,
      id: 'local-homepage-smoke',
      name: 'Homepage smoke exploration',
      baseUrl: 'http://localhost:3000',
      targetUrl: '/',
    },
    config,
    planner: new RiskBasedPlanner(),
    executor: new PlaywrightMcpExecutor(new MockMcpToolClient()),
    validator: new BasicValidator(),
    heuristics: new BasicHeuristicEngine(),
    reporter: new MarkdownReporter(reportDirectory, new BugReporter(join(reportDirectory, 'bugs'))),
    testGenerator: new VerifiedFlowTestGenerator({
      outputDirectory: join(reportDirectory, 'generated-tests'),
      execute: false,
    }),
  });

  const session = await orchestrator.run();

  expect(['completed', 'stopped']).toContain(session.status);
  expect(session.memory.stopReason || session.steps.at(-1)?.plan.action.reason).toBeTruthy();
  expect(session.steps.length).toBeGreaterThan(0);
  expect(session.steps.every((step) => step.beforeObservation && step.afterObservation)).toBe(true);
  expect(session.memory.observations.length).toBeGreaterThanOrEqual(session.steps.length);
  expect(session.memory.visitedUrls).toContain('http://localhost:3000/');
  expect(session.memory.interactedElements).toContain('http://localhost:3000/');
  expect(session.memory.pendingAreas).toContain('navigation');
  expect(session.reportPath).toBeTruthy();

  const report = await readFile(session.reportPath!, 'utf8');
  expect(report).toContain('# Exploratory Session Report');
  expect(report).toContain('Homepage smoke');
  expect(report).toContain('## Observations');
  expect(report).toContain('## Step Observations');
  expect(report).toContain('Before:');
  expect(report).toContain('After:');
  expect(report).toContain('## Generated Tests');
  expect(report).toContain('## Coverage Summary');
  expect(report).toContain('Repeated actions prevented:');
});
