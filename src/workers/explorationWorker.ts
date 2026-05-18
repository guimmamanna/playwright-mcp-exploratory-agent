import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { defaultExplorationConfig } from '../config/defaultConfig';
import { PlaywrightActionExecutor } from '../executor/playwrightActionExecutor';
import { BasicHeuristicEngine } from '../heuristics/basicHeuristics';
import { persistSessionMemory } from '../memory/memoryPersistence';
import { ExploratoryOrchestrator } from '../orchestrator/exploratoryOrchestrator';
import { RiskBasedPlanner } from '../planner/riskBasedPlanner';
import { BugReporter } from '../reporting/bugReporter';
import { MarkdownReporter } from '../reporting/markdownReporter';
import { VerifiedFlowTestGenerator } from '../test-generator/verifiedFlowTestGenerator';
import { BasicValidator } from '../validator/basicValidator';
import type { BrowserMatrixId, WorkerAssignment, WorkerResult } from '../distributed/types';

export interface WorkerExecutionOptions {
  headless?: boolean;
  timeoutMs?: number;
}

function launchBrowser(browser: BrowserMatrixId, headless = true): Promise<Browser> {
  const options = { headless };
  switch (browser) {
    case 'firefox':
      return firefox.launch(options);
    case 'webkit':
      return webkit.launch(options);
    default:
      return chromium.launch(options);
  }
}

async function createIsolatedContext(browser: Browser, assignment: WorkerAssignment): Promise<BrowserContext> {
  await mkdir(assignment.evidenceDirectory, { recursive: true });
  return browser.newContext({
    viewport: assignment.viewportSize,
    storageState: undefined,
    recordHar: undefined,
  });
}

export async function runExplorationWorker(
  assignment: WorkerAssignment,
  options: WorkerExecutionOptions = {},
): Promise<WorkerResult> {
  const startedAt = new Date().toISOString();
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    await mkdir(assignment.reportDirectory, { recursive: true });
    await mkdir(assignment.evidenceDirectory, { recursive: true });

    browser = await launchBrowser(assignment.browser, options.headless !== false);
    context = await createIsolatedContext(browser, assignment);
    page = await context.newPage();

    const baseUrl = assignment.assignedGoal.baseUrl || defaultExplorationConfig.baseUrl;
    const config = {
      ...defaultExplorationConfig,
      baseUrl,
      environmentId: assignment.environmentId as typeof defaultExplorationConfig.environmentId,
      personaId: assignment.personaId,
      persona: assignment.personaId,
      maxSteps: assignment.maxSteps,
      viewport: assignment.viewportSize,
      evidenceDirectory: assignment.evidenceDirectory,
      reportingOptions: {
        ...defaultExplorationConfig.reportingOptions,
        reportDirectory: assignment.reportDirectory,
      },
      stopConditions: defaultExplorationConfig.stopConditions.filter((condition) => condition !== 'loopDetected'),
    };

    if (assignment.assignedGoal.targetUrl) {
      const target = new URL(assignment.assignedGoal.targetUrl, config.baseUrl).toString();
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30000 });
    }

    const executor = new PlaywrightActionExecutor(page);
    const orchestrator = new ExploratoryOrchestrator({
      goal: {
        ...assignment.assignedGoal,
        baseUrl,
      },
      config,
      planner: new RiskBasedPlanner(),
      executor,
      validator: new BasicValidator(),
      heuristics: new BasicHeuristicEngine(),
      reporter: new MarkdownReporter(assignment.reportDirectory, new BugReporter(join(assignment.reportDirectory, 'bugs'))),
      testGenerator: new VerifiedFlowTestGenerator({
        outputDirectory: join(assignment.reportDirectory, 'generated-tests'),
        execute: false,
      }),
    });

    const runPromise = orchestrator.run();
    const session = options.timeoutMs
      ? await Promise.race([
          runPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Worker timed out after ${options.timeoutMs}ms`)), options.timeoutMs),
          ),
        ])
      : await runPromise;

    await persistSessionMemory(session, assignment.memoryPath);
    await context.storageState({ path: assignment.storageStatePath }).catch(() => undefined);

    const status =
      session.status === 'failed' ? 'failed' : session.status === 'stopped' ? 'stopped' : ('completed' as const);

    return {
      workerId: assignment.workerId,
      assignment,
      status,
      session,
      reportPath: session.reportPath,
      startedAt,
      endedAt: new Date().toISOString(),
      retryCount: 0,
    };
  } catch (error) {
    return {
      workerId: assignment.workerId,
      assignment,
      status: error instanceof Error && error.message.includes('timed out') ? 'timed-out' : 'failed',
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      endedAt: new Date().toISOString(),
      retryCount: 0,
    };
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
