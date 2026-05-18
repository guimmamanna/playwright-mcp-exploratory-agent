import { mkdir } from 'node:fs/promises';
import { sampleExplorationGoal } from '../config/sampleGoal';
import { defaultDistributedExplorationConfig } from '../distributed/defaultConfig';
import { runDistributedExploration, type WorkerRunnerFn } from '../distributed/distributedRunner';
import type { DistributedExplorationConfig } from '../distributed/types';
import type { ExplorationGoal } from '../types';

declare global {
  // Optional hook for harness/tests to inject mock workers without launching browsers.
  var __distributedWorkerRunner: WorkerRunnerFn | undefined;
}

export interface DistributedCliOptions {
  baseUrl?: string;
  outputDirectory?: string;
  maxParallelWorkers?: number;
  maxWorkers?: number;
  maxStepsPerWorker?: number;
  headless?: boolean;
  goal?: ExplorationGoal;
  config?: Partial<DistributedExplorationConfig>;
}

export async function runDistributedExplorationCli(options: DistributedCliOptions = {}) {
  const config: DistributedExplorationConfig = {
    ...defaultDistributedExplorationConfig,
    ...options.config,
    baseUrl: options.baseUrl || options.config?.baseUrl || defaultDistributedExplorationConfig.baseUrl,
    outputDirectory:
      options.outputDirectory || options.config?.outputDirectory || defaultDistributedExplorationConfig.outputDirectory,
    maxParallelWorkers:
      options.maxParallelWorkers ||
      options.config?.maxParallelWorkers ||
      defaultDistributedExplorationConfig.maxParallelWorkers,
    maxWorkers: options.maxWorkers || options.config?.maxWorkers || defaultDistributedExplorationConfig.maxWorkers,
    maxStepsPerWorker:
      options.maxStepsPerWorker ||
      options.config?.maxStepsPerWorker ||
      defaultDistributedExplorationConfig.maxStepsPerWorker,
  };

  await mkdir(config.outputDirectory, { recursive: true });

  const baseGoal: ExplorationGoal = {
    ...(options.goal || sampleExplorationGoal),
    baseUrl: config.baseUrl,
    targetUrl: options.goal?.targetUrl || '/',
  };

  return runDistributedExploration({
    baseGoal,
    config,
    headless: options.headless !== false,
    workerRunner: globalThis.__distributedWorkerRunner,
  });
}
