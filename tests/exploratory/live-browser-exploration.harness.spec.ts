import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { amazonExplorationGoal } from '../../src/config/amazonGoal';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { loadProjectEnv, resolveFreeTierLlmApiKey, resolveFreeTierLlmProvider } from '../../src/config/loadEnv';
import { PlaywrightBrowserClient } from '../../src/executor/playwrightBrowserClient';
import { PlaywrightMcpExecutor } from '../../src/executor/mcpExecutor';
import { BasicHeuristicEngine } from '../../src/heuristics/basicHeuristics';
import { MultiAgentCoordinator, resolveMultiAgentConfig } from '../../src/multi-agent';
import { ExploratoryOrchestrator } from '../../src/orchestrator/exploratoryOrchestrator';
import { RiskBasedPlanner } from '../../src/planner/riskBasedPlanner';
import { BugReporter } from '../../src/reporting/bugReporter';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { createDefaultSpecialistAgents } from '../../src/roles';
import { BasicValidator } from '../../src/validator/basicValidator';

loadProjectEnv(process.cwd());

test('live browser exploration harness', async ({ page }) => {
  const raw = process.env.EXPLORATION_RUN_CONFIG;
  test.skip(!raw, 'Set EXPLORATION_RUN_CONFIG to run live exploration.');

  const runConfig = JSON.parse(raw) as {
    baseUrl: string;
    targetUrl?: string;
    environmentId?: string;
    personaId?: string;
    maxSteps?: number;
    maxDurationMinutes?: number;
    outputDir: string;
    sessionId: string;
    viewportSize?: { width: number; height: number };
    forbiddenActions?: string[];
    reasoningEnabled?: boolean;
    multiAgentEnabled?: boolean;
  };

  await mkdir(runConfig.outputDir, { recursive: true });
  await page.setViewportSize(runConfig.viewportSize || { width: 1440, height: 900 });
  await page.goto(runConfig.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const baseUrl = runConfig.baseUrl.replace(/\/ref=.*$/, '') || 'https://www.amazon.co.uk';
  const llmApiKey = resolveFreeTierLlmApiKey();

  const explorationConfig = {
    ...defaultExplorationConfig,
    baseUrl,
    environmentId: (runConfig.environmentId || defaultExplorationConfig.environmentId) as typeof defaultExplorationConfig.environmentId,
    personaId: (runConfig.personaId || defaultExplorationConfig.personaId) as typeof defaultExplorationConfig.personaId,
    maxSteps: runConfig.maxSteps ?? 5,
    maxDurationMinutes: runConfig.maxDurationMinutes ?? 5,
    viewport: runConfig.viewportSize || defaultExplorationConfig.viewport,
    reasoningEnabled: runConfig.reasoningEnabled ?? Boolean(llmApiKey),
    llmProvider: llmApiKey ? resolveFreeTierLlmProvider() : 'mock',
    llmApiKey,
    llmModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    multiAgentEnabled: runConfig.multiAgentEnabled ?? true,
    reportingOptions: {
      ...defaultExplorationConfig.reportingOptions,
      reportDirectory: runConfig.outputDir,
    },
    evidenceDirectory: join(runConfig.outputDir, 'evidence'),
  };

  const client = new PlaywrightBrowserClient(page);
  const multiAgentCoordinator = explorationConfig.multiAgentEnabled
    ? new MultiAgentCoordinator({
        config: resolveMultiAgentConfig(explorationConfig),
        agents: createDefaultSpecialistAgents(),
      })
    : undefined;

  const orchestrator = new ExploratoryOrchestrator({
    goal: { ...amazonExplorationGoal, baseUrl, targetUrl: runConfig.targetUrl || amazonExplorationGoal.targetUrl },
    config: explorationConfig,
    planner: new RiskBasedPlanner(),
    executor: new PlaywrightMcpExecutor(client),
    validator: new BasicValidator(),
    heuristics: new BasicHeuristicEngine(),
    reporter: new MarkdownReporter(runConfig.outputDir, new BugReporter(join(runConfig.outputDir, 'bugs'))),
    multiAgentCoordinator,
  });

  const session = await orchestrator.run();
  await writeFile(join(runConfig.outputDir, 'session-memory.json'), JSON.stringify({ sessionId: runConfig.sessionId, status: session.status, findingsCount: session.findings.length }, null, 2));
  expect(session.steps.length).toBeGreaterThan(0);
});
