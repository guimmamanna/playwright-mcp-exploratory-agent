import type { ActionExecutionResult, AgentAction, LocatorStrategy } from '../types';
import type { SessionMemory } from '../types';

export type RecoveryStrategyId =
  | 'retry-improved-locator'
  | 'retry-alternative-selector'
  | 'vision-fallback'
  | 'wait-network-idle'
  | 'refresh-page'
  | 'go-back'
  | 'reopen-route'
  | 're-login'
  | 'clear-modal'
  | 'dismiss-cookie-banner'
  | 'reset-form-state'
  | 'restore-checkpoint';

export type RecoveryDecisionType = 'recover' | 'skip' | 'finding' | 'stop';

export type BlockedFlowType =
  | 'repeated-failed-action'
  | 'url-loop'
  | 'stuck-loading'
  | 'modal-blocking'
  | 'session-timeout'
  | 'disabled-cta'
  | 'auth-401'
  | 'auth-403'
  | 'blank-screen'
  | 'unexpected-redirect'
  | 'locator-not-found'
  | 'element-not-visible';

export interface BlockedFlowContext {
  types: BlockedFlowType[];
  summary: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ExplorationCheckpoint {
  id: string;
  timestamp: string;
  url: string;
  pageStateSummary: string;
  memorySnapshot: {
    visitedUrls: string[];
    actionHistory: AgentAction[];
    observationSignatures: string[];
  };
  lastSuccessfulAction?: AgentAction;
  screenshotPath?: string;
  stepId?: string;
}

export interface RecoveryAttemptRecord {
  id: string;
  timestamp: string;
  stepId?: string;
  strategy: RecoveryStrategyId;
  success: boolean;
  message: string;
  healedSelector?: string;
  healedStrategy?: LocatorStrategy;
  checkpointId?: string;
  originalError?: string;
}

export interface RecoveryDecision {
  decision: RecoveryDecisionType;
  reason: string;
  strategies: RecoveryStrategyId[];
}

export interface RecoverySessionState {
  enabled: boolean;
  checkpoints: ExplorationCheckpoint[];
  recoveryAttempts: RecoveryAttemptRecord[];
  actionRetryCounts: Record<string, number>;
  totalRecoveryAttempts: number;
  selectorHealingAttempts: number;
}

export interface RecoveryResult {
  recovered: boolean;
  execution?: ActionExecutionResult;
  attempts: RecoveryAttemptRecord[];
  decision: RecoveryDecision;
  checkpointRestored?: string;
  findingCreated?: boolean;
}
