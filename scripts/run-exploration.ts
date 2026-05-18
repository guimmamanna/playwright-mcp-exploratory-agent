#!/usr/bin/env npx tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { amazonExplorationGoal } from '../src/config/amazonGoal';
import { defaultExplorationConfig } from '../src/config/defaultConfig';
import { loadProjectEnv, resolveFreeTierLlmApiKey, resolveFreeTierLlmProvider } from '../src/config/loadEnv';
import { BrowserSession } from '../src/executor/browserSession';
import { PlaywrightBrowserClient } from '../src/executor/playwrightBrowserClient';
import { PlaywrightMcpExecutor } from '../src/executor/mcpExecutor';
import { BasicHeuristicEngine } from '../src/heuristics/basicHeuristics';
import { MultiAgentCoordinator, resolveMultiAgentConfig } from '../src/multi-agent';
import { ExploratoryOrchestrator } from '../src/orchestrator/exploratoryOrchestrator';
import { RiskBasedPlanner } from '../src/planner/riskBasedPlanner';
import { BugReporter } from '../src/reporting/bugReporter';
import { MarkdownReporter } from '../src/reporting/markdownReporter';
import { createDefaultSpecialistAgents } from '../src/roles';
import { BasicValidator } from '../src/validator/basicValidator';

import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
loadProjectEnv(root);

interface RunConfig {
  baseUrl: string;
  targetUrl?: string;
  environmentId?: string;
  personaId?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  maxSteps?: number;
  maxDurationMinutes?: number;
  outputDir: string;
  sessionId: string;
  viewportSize?: { width: number; height: number };
  forbiddenActions?: string[];
  accessibilityAuditEnabled?: boolean;
  visualIntelligenceEnabled?: boolean;
  networkIntelligenceEnabled?: boolean;
  generateTests?: boolean;
  reasoningEnabled?: boolean;
  recoveryEnabled?: boolean;
  learningEnabled?: boolean;
  multiAgentEnabled?: boolean;
  headless?: boolean;
}

async function main() {
  const raw = process.env.EXPLORATION_RUN_CONFIG;
  const runConfig: RunConfig = raw
    ? JSON.parse(raw)
    : {
        baseUrl: process.env.EXPLORATORY_BASE_URL || 'https://www.amazon.co.uk/ref=nav_logo',
        environmentId: 'production-like',
        personaId: 'anonymous-visitor',
        browser: 'chromium',
        maxSteps: 8,
        maxDurationMinutes: 5,
        outputDir: join(root, 'reports/exploratory/runs', `cli-${Date.now()}`),
        sessionId: `cli-${Date.now()}`,
        viewportSize: { width: 1440, height: 900 },
        forbiddenActions: ['checkout', 'payment', 'delete'],
        accessibilityAuditEnabled: true,
        visualIntelligenceEnabled: true,
        networkIntelligenceEnabled: true,
        generateTests: false,
        reasoningEnabled: Boolean(resolveFreeTierLlmApiKey()),
        recoveryEnabled: false,
        learningEnabled: false,
        multiAgentEnabled: true,
        headless: process.env.HEADLESS !== 'false',
      };

  await mkdir(runConfig.outputDir, { recursive: true });
  console.log(`CURRENT_ACTION: Launching browser for ${runConfig.baseUrl}`);
  console.log(`CURRENT_URL: ${runConfig.baseUrl}`);

  const baseUrl = runConfig.baseUrl.replace(/\/ref=.*$/, '') || 'https://www.amazon.co.uk';
  const llmProvider = resolveFreeTierLlmProvider();
  const llmApiKey = resolveFreeTierLlmApiKey();

  const explorationConfig = {
    ...defaultExplorationConfig,
    baseUrl,
    environmentId: (runConfig.environmentId || defaultExplorationConfig.environmentId) as typeof defaultExplorationConfig.environmentId,
    personaId: (runConfig.personaId || defaultExplorationConfig.personaId) as typeof defaultExplorationConfig.personaId,
    persona: runConfig.personaId || defaultExplorationConfig.persona,
    maxSteps: runConfig.maxSteps ?? defaultExplorationConfig.maxSteps,
    maxDurationMinutes: runConfig.maxDurationMinutes ?? defaultExplorationConfig.maxDurationMinutes,
    viewport: runConfig.viewportSize || defaultExplorationConfig.viewport,
    forbiddenActions: runConfig.forbiddenActions || defaultExplorationConfig.forbiddenActions,
    accessibilityAuditEnabled: runConfig.accessibilityAuditEnabled ?? true,
    visualIntelligenceEnabled: runConfig.visualIntelligenceEnabled ?? true,
    networkIntelligenceEnabled: runConfig.networkIntelligenceEnabled ?? true,
    generateTests: runConfig.generateTests ?? false,
    reasoningEnabled: runConfig.reasoningEnabled ?? Boolean(llmApiKey),
    llmProvider: llmApiKey ? llmProvider : 'mock',
    llmApiKey,
    llmModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    recoveryEnabled: runConfig.recoveryEnabled ?? false,
    learningEnabled: runConfig.learningEnabled ?? false,
    multiAgentEnabled: runConfig.multiAgentEnabled ?? true,
    reportingOptions: {
      ...defaultExplorationConfig.reportingOptions,
      reportDirectory: runConfig.outputDir,
    },
    evidenceDirectory: join(runConfig.outputDir, 'evidence'),
  };

  const browserSession = new BrowserSession(explorationConfig, {
    headless: runConfig.headless !== false,
    browser: runConfig.browser || 'chromium',
    timeoutMs: 45000,
  });

  try {
    const page = await browserSession.start(runConfig.baseUrl);
    const client = new PlaywrightBrowserClient(page);
    const multiAgentCoordinator = explorationConfig.multiAgentEnabled
      ? new MultiAgentCoordinator({
          config: resolveMultiAgentConfig(explorationConfig),
          agents: createDefaultSpecialistAgents(),
        })
      : undefined;

    const orchestrator = new ExploratoryOrchestrator({
      goal: {
        ...amazonExplorationGoal,
        baseUrl,
        targetUrl: runConfig.targetUrl || amazonExplorationGoal.targetUrl,
      },
      config: explorationConfig,
      planner: new RiskBasedPlanner(),
      executor: new PlaywrightMcpExecutor(client),
      validator: new BasicValidator(),
      heuristics: new BasicHeuristicEngine(),
      reporter: new MarkdownReporter(runConfig.outputDir, new BugReporter(join(runConfig.outputDir, 'bugs'))),
      multiAgentCoordinator,
    });

    console.log('CURRENT_ACTION: Running exploratory orchestrator');
    const result = await orchestrator.run();

    await writeFile(
      join(runConfig.outputDir, 'session-memory.json'),
      JSON.stringify(
        {
          sessionId: runConfig.sessionId,
          goalId: result.goal.id,
          status: result.status,
          savedAt: new Date().toISOString(),
          stopReason: result.memory.stopReason,
          findingsCount: result.findings.length,
          generatedTestsCount: result.generatedTests.length,
          memory: {
            visitedUrls: result.memory.visitedUrls,
            exploredPages: result.memory.exploredPages,
            pendingAreas: result.memory.pendingAreas,
            notes: result.memory.notes,
          },
          coverage: result.memory.coverage,
        },
        null,
        2,
      ),
    );

    console.log(`Exploration completed: ${result.status} (${result.findings.length} findings)`);
    console.log(`Report: ${result.reportPath}`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    await writeFile(join(runConfig.outputDir, 'run-error.txt'), String(error));
    process.exit(1);
  } finally {
    await browserSession.close();
  }
}

main();
