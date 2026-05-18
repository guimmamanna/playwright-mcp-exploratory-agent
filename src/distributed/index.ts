export { CoordinationStore } from './coordinationStore';
export { findingFingerprint, ingestFinding } from './duplicateFindings';
export { writeAggregateReport } from './aggregateReporter';
export { DistributedExplorationRunner, runDistributedExploration } from './distributedRunner';
export type { DistributedRunnerOptions, WorkerRunnerFn } from './distributedRunner';
export type {
  BrowserMatrixId,
  ViewportMatrixId,
  WorkerStatus,
  WorkerAssignment,
  WorkerResult,
  DistributedExplorationConfig,
  SchedulerOptions,
  MergedFindingRecord,
  CoordinationSnapshot,
  DistributedRunResult,
  RiskCategoryId,
} from './types';
