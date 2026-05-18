import type { ActionExecutionResult, ExplorationSession, Observation } from '../types';
import type { ExplorationCheckpoint, RecoverySessionState } from './types';

export function ensureRecoveryState(session: ExplorationSession): RecoverySessionState {
  if (!session.recoveryState) {
    session.recoveryState = {
      enabled: Boolean(session.config.recoveryEnabled),
      checkpoints: [],
      recoveryAttempts: [],
      actionRetryCounts: {},
      totalRecoveryAttempts: 0,
      selectorHealingAttempts: 0,
    };
  }
  return session.recoveryState;
}

export function saveCheckpoint(
  session: ExplorationSession,
  observation: Observation,
  execution?: ActionExecutionResult,
  stepId?: string,
): ExplorationCheckpoint {
  const state = ensureRecoveryState(session);
  const checkpoint: ExplorationCheckpoint = {
    id: `checkpoint-${Date.now()}`,
    timestamp: new Date().toISOString(),
    url: observation.url,
    pageStateSummary: observation.visibleTextSummary || observation.domSummary || observation.title || observation.url,
    memorySnapshot: {
      visitedUrls: [...session.memory.visitedUrls],
      actionHistory: [...session.memory.actionHistory],
      observationSignatures: [...session.memory.observationSignatures],
    },
    lastSuccessfulAction: execution?.action,
    screenshotPath: observation.screenshotPath,
    stepId,
  };
  state.checkpoints.push(checkpoint);
  if (state.checkpoints.length > 10) {
    state.checkpoints = state.checkpoints.slice(-10);
  }
  return checkpoint;
}

export function latestCheckpoint(session: ExplorationSession) {
  return ensureRecoveryState(session).checkpoints.at(-1);
}

export function actionRetryCount(session: ExplorationSession, signature: string) {
  return ensureRecoveryState(session).actionRetryCounts[signature] || 0;
}

export function incrementActionRetry(session: ExplorationSession, signature: string) {
  const state = ensureRecoveryState(session);
  state.actionRetryCounts[signature] = (state.actionRetryCounts[signature] || 0) + 1;
}
