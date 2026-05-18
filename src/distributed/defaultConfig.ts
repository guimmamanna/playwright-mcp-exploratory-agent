import type { DistributedExplorationConfig } from './types';

export const defaultDistributedExplorationConfig: DistributedExplorationConfig = {
  baseUrl: 'http://localhost:3000',
  outputDirectory: 'exploratory-results/distributed',
  maxParallelWorkers: 3,
  maxWorkers: 3,
  maxStepsPerWorker: 5,
  workerTimeoutMinutes: 5,
  stopAllOnCriticalFailure: false,
  continueOnWorkerFailure: true,
  retryFailedWorkerOnce: true,
  personas: ['anonymous-visitor', 'admin', 'readonly-user'],
  browsers: ['chromium'],
  viewports: ['desktop'],
  featureAreas: ['navigation', 'forms'],
  routes: ['/'],
  riskCategories: ['navigation', 'forms'],
  environmentId: 'local',
};
