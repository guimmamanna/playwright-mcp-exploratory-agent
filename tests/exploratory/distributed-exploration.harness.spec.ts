import { expect, test } from '@playwright/test';
import { runDistributedExplorationCli } from '../../src/cli/runDistributedExploration';
import type { WorkerRunnerFn } from '../../src/distributed';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { defaultDistributedExplorationConfig } from '../../src/distributed/defaultConfig';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionMemory } from '../../src/memory/sessionMemory';

const harnessEnabled = process.env.DISTRIBUTED_EXPLORATION === '1';

test('distributed CLI harness completes with mock workers', async () => {
  test.skip(!harnessEnabled, 'Run via npm run explore:distributed');

  const outputDirectory = await mkdtemp(join(tmpdir(), 'distributed-cli-'));
  const cliOptions = process.env.DISTRIBUTED_CLI_OPTIONS
    ? JSON.parse(process.env.DISTRIBUTED_CLI_OPTIONS)
    : {};

  const originalRunner = globalThis.__distributedWorkerRunner;
  globalThis.__distributedWorkerRunner = async (assignment) => ({
    workerId: assignment.workerId,
    assignment,
    status: 'completed',
    session: {
      id: `session-${assignment.workerId}`,
      goal: assignment.assignedGoal,
      config: { ...defaultExplorationConfig, baseUrl: 'http://localhost:3000' },
      startedAt: new Date().toISOString(),
      status: 'completed',
      steps: [],
      findings: [],
      memory: createSessionMemory(),
      generatedTests: [],
      bugReports: [],
      evidenceDirectory: assignment.evidenceDirectory,
    },
    reportPath: join(assignment.reportDirectory, 'report.md'),
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    retryCount: 0,
  });

  try {
    const result = await runDistributedExplorationCli({
      outputDirectory,
      maxWorkers: Number(cliOptions.maxWorkers || 2),
      maxParallelWorkers: Number(cliOptions.maxParallelWorkers || 2),
      maxStepsPerWorker: Number(cliOptions.maxStepsPerWorker || 2),
      headless: cliOptions.headless !== 'false',
      config: {
        browsers: ['chromium'],
        viewports: ['desktop'],
        personas: ['anonymous-visitor', 'admin'],
        featureAreas: ['navigation'],
        routes: ['/'],
        riskCategories: ['navigation'],
      },
    });

    expect(result.workers.length).toBeGreaterThan(0);
    expect(result.globalReportPath).toBeTruthy();
  } finally {
    globalThis.__distributedWorkerRunner = originalRunner;
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

declare global {
  // eslint-disable-next-line no-var
  var __distributedWorkerRunner: WorkerRunnerFn | undefined;
}
