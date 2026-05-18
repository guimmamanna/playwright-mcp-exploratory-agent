import type { Page } from '@playwright/test';
import type { ActionExecutionResult, ActionPlan, ExplorationSession, Observation } from '../types';
import { actionSignature } from '../memory/elementKey';
import { recordFailedAction } from '../memory/sessionMemory';
import { detectBlockedFlow } from './blockedFlowDetection';
import {
  actionRetryCount,
  ensureRecoveryState,
  incrementActionRetry,
  saveCheckpoint,
} from './checkpoints';
import { decideRecovery } from './recoveryDecisionEngine';
import { blockedFlowToFinding } from './findingFactory';
import { runRecoveryStrategy } from './recoveryStrategies';
import type { RecoveryAttemptRecord, RecoveryResult } from './types';

export interface RecoveryEngineDependencies {
  page: Page;
  observe: () => Promise<Observation>;
  execute: (plan: ActionPlan) => Promise<ActionExecutionResult>;
}

function roleHintsFor(action: ActionPlan['action']) {
  switch (action.kind) {
    case 'search':
      return ['searchbox', 'textbox'];
    case 'fill':
      return ['textbox'];
    case 'select':
      return ['combobox'];
    case 'check':
    case 'uncheck':
      return ['checkbox'];
    default:
      return ['button', 'link'];
  }
}

function recordAttempt(
  session: ExplorationSession,
  attempt: Omit<RecoveryAttemptRecord, 'id' | 'timestamp'>,
): RecoveryAttemptRecord {
  const state = ensureRecoveryState(session);
  const record: RecoveryAttemptRecord = {
    id: `recovery-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...attempt,
  };
  state.recoveryAttempts.push(record);
  state.totalRecoveryAttempts += 1;
  if (state.recoveryAttempts.length > 50) {
    state.recoveryAttempts = state.recoveryAttempts.slice(-50);
  }
  return record;
}

export class RecoveryEngine {
  constructor(private readonly deps: RecoveryEngineDependencies) {}

  captureStableCheckpoint(session: ExplorationSession, observation: Observation, execution?: ActionExecutionResult, stepId?: string) {
    if (!session.config.recoveryEnabled) return;
    if (execution?.status === 'success') {
      saveCheckpoint(session, observation, execution, stepId);
    }
  }

  async attemptRecovery(args: {
    session: ExplorationSession;
    plan: ActionPlan;
    execution: ActionExecutionResult;
    stepId?: string;
  }): Promise<RecoveryResult> {
    const { session, plan, execution, stepId } = args;
    const state = ensureRecoveryState(session);

    if (!session.config.recoveryEnabled || execution.status === 'success' || execution.status === 'blocked') {
      return {
        recovered: false,
        attempts: [],
        decision: { decision: 'skip', reason: 'Recovery not applicable.', strategies: [] },
      };
    }

    const observation = await this.deps.observe();
    const blocked = detectBlockedFlow({ session, observation, execution });
    const signature = actionSignature(plan.action);
    const decision = decideRecovery(
      blocked,
      {
        actionRetries: actionRetryCount(session, signature),
        maxActionRetries: session.config.maxRetriesPerAction || 3,
        sessionRecoveryAttempts: state.totalRecoveryAttempts,
        maxSessionRecoveryAttempts: session.config.maxRecoveryAttemptsPerSession || 15,
      },
      session.config,
    );

    if (decision.decision === 'stop') {
      session.memory.stopReason = decision.reason;
      return { recovered: false, attempts: [], decision };
    }

    if (decision.decision === 'skip') {
      return { recovered: false, attempts: [], decision };
    }

    if (decision.decision === 'finding') {
      recordFailedAction(session, plan.action, blocked.summary);
      return {
        recovered: false,
        attempts: [],
        decision,
        findingCreated: true,
      };
    }

    incrementActionRetry(session, signature);
    const attempts: RecoveryAttemptRecord[] = [];
    let recoveredExecution: ActionExecutionResult | undefined;
    let checkpointRestored: string | undefined;
    let healedPlan = plan;

    for (const strategy of decision.strategies) {
      if (state.totalRecoveryAttempts >= (session.config.maxRecoveryAttemptsPerSession || 15)) break;
      if (state.selectorHealingAttempts >= (session.config.maxSelectorHealingAttempts || 8) && strategy.includes('locator')) {
        continue;
      }

      const strategyResult = await runRecoveryStrategy(strategy, {
        page: this.deps.page,
        session,
        plan: healedPlan,
        roleHints: roleHintsFor(plan.action),
      });

      const attempt = recordAttempt(session, {
        stepId,
        strategy,
        success: strategyResult.success,
        message: strategyResult.message,
        healedSelector: strategyResult.healedSelector,
        healedStrategy: strategyResult.healedAction ? { type: 'css', value: strategyResult.healedSelector } : undefined,
        checkpointId: strategyResult.checkpointId,
        originalError: execution.errors?.[0]?.message,
      });
      attempts.push(attempt);

      if (strategyResult.checkpointId) {
        checkpointRestored = strategyResult.checkpointId;
      }

      if (strategyResult.healedAction) {
        healedPlan = { ...healedPlan, action: strategyResult.healedAction };
      }

      const retry = await this.deps.execute(healedPlan);
      if (retry.status === 'success') {
        recoveredExecution = {
          ...retry,
          message: `${retry.message || retry.actualOutcome || ''} (recovered via ${strategy})`.trim(),
          selectorHealingApplied: Boolean(strategyResult.healedSelector),
        };
        attempt.success = true;
        attempt.message = `${strategyResult.message} Recovery execution succeeded.`;
        break;
      }

      recordFailedAction(session, plan.action, retry.errors?.[0]?.message || retry.message || 'Recovery retry failed');
    }

    if (!recoveredExecution && blocked.types.length) {
      return {
        recovered: false,
        attempts,
        decision: {
          decision: 'finding',
          reason: 'Recovery strategies exhausted; blocked flow should be recorded.',
          strategies: decision.strategies,
        },
        findingCreated: true,
      };
    }

    return {
      recovered: Boolean(recoveredExecution),
      execution: recoveredExecution,
      attempts,
      decision,
      checkpointRestored,
    };
  }

  createBlockedFlowFinding(session: ExplorationSession, plan: ActionPlan, blocked: ReturnType<typeof detectBlockedFlow>, stepId?: string) {
    return blockedFlowToFinding(blocked, session, plan, stepId);
  }
}
