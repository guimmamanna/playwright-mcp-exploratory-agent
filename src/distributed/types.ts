import type { ExplorationGoal, ExplorationSession, Finding, GeneratedTest, PersonaId } from '../types';

export type BrowserMatrixId = 'chromium' | 'firefox' | 'webkit';

export type ViewportMatrixId = 'mobile' | 'tablet' | 'desktop';

export type WorkerStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'retrying'
  | 'timed-out';

export type RiskCategoryId =
  | 'navigation'
  | 'forms'
  | 'search'
  | 'filters'
  | 'authentication'
  | 'settings'
  | 'accessibility'
  | 'console-network';

export interface WorkerAssignment {
  workerId: string;
  assignedGoal: ExplorationGoal;
  personaId: PersonaId;
  environmentId: string;
  browser: BrowserMatrixId;
  viewport: ViewportMatrixId;
  viewportSize: { width: number; height: number };
  featureArea?: string;
  route?: string;
  riskCategory?: RiskCategoryId;
  maxSteps: number;
  evidenceDirectory: string;
  reportDirectory: string;
  storageStatePath: string;
  memoryPath: string;
  areaKey: string;
}

export interface WorkerResult {
  workerId: string;
  assignment: WorkerAssignment;
  status: WorkerStatus;
  session?: ExplorationSession;
  reportPath?: string;
  error?: string;
  startedAt: string;
  endedAt: string;
  retryCount: number;
}

export interface DistributedExplorationConfig {
  baseUrl: string;
  outputDirectory: string;
  maxParallelWorkers: number;
  maxWorkers?: number;
  maxStepsPerWorker: number;
  workerTimeoutMinutes: number;
  stopAllOnCriticalFailure: boolean;
  continueOnWorkerFailure: boolean;
  retryFailedWorkerOnce: boolean;
  personas?: PersonaId[];
  browsers?: BrowserMatrixId[];
  viewports?: ViewportMatrixId[];
  featureAreas?: string[];
  routes?: string[];
  riskCategories?: RiskCategoryId[];
  environmentId?: string;
}

export interface SchedulerOptions {
  baseGoal: ExplorationGoal;
  config: DistributedExplorationConfig;
}

export interface MergedFindingRecord {
  fingerprint: string;
  finding: Finding;
  workerIds: string[];
  mergeCount: number;
  mergedEvidence: boolean;
}

export interface CoordinationSnapshot {
  assignedAreas: Array<{ areaKey: string; workerId: string }>;
  completedAreas: string[];
  activeWorkers: Array<{ workerId: string; status: WorkerStatus }>;
  blockedAreas: string[];
  globalFindings: Finding[];
  mergedFindings: MergedFindingRecord[];
  duplicateFindingCount: number;
  generatedTests: GeneratedTest[];
}

export interface DistributedRunResult {
  runId: string;
  startedAt: string;
  endedAt: string;
  workers: WorkerResult[];
  coordination: CoordinationSnapshot;
  globalReportPath?: string;
  stoppedEarly: boolean;
  stopReason?: string;
}
