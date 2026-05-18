import type { ExplorationConfig } from '../types';
import type { BlockedFlowContext, RecoveryDecision, RecoveryStrategyId } from './types';

export function decideRecovery(
  blocked: BlockedFlowContext,
  limits: {
    actionRetries: number;
    maxActionRetries: number;
    sessionRecoveryAttempts: number;
    maxSessionRecoveryAttempts: number;
  },
  config: ExplorationConfig,
): RecoveryDecision {
  if (limits.sessionRecoveryAttempts >= limits.maxSessionRecoveryAttempts) {
    return {
      decision: 'stop',
      reason: 'Maximum recovery attempts for this session have been reached.',
      strategies: [],
    };
  }

  if (limits.actionRetries >= limits.maxActionRetries) {
    return {
      decision: 'finding',
      reason: 'Maximum retries per action exceeded; record blocked flow as finding.',
      strategies: [],
    };
  }

  if (blocked.types.includes('repeated-failed-action') && limits.actionRetries >= 1) {
    return {
      decision: 'finding',
      reason: 'Repeated failures for the same action indicate a blocked flow.',
      strategies: [],
    };
  }

  const strategies: RecoveryStrategyId[] = [];

  if (blocked.types.includes('locator-not-found') || blocked.types.includes('element-not-visible')) {
    strategies.push('retry-improved-locator', 'retry-alternative-selector', 'vision-fallback');
  }
  if (blocked.types.includes('modal-blocking')) {
    strategies.push('clear-modal', 'dismiss-cookie-banner');
  }
  if (blocked.types.includes('stuck-loading')) {
    strategies.push('wait-network-idle', 'refresh-page');
  }
  if (blocked.types.includes('session-timeout') || blocked.types.includes('auth-401')) {
    strategies.push('re-login', 'reopen-route');
  }
  if (blocked.types.includes('auth-403')) {
    strategies.push('go-back', 'restore-checkpoint');
  }
  if (blocked.types.includes('url-loop') || blocked.types.includes('unexpected-redirect')) {
    strategies.push('go-back', 'restore-checkpoint');
  }
  if (blocked.types.includes('blank-screen')) {
    strategies.push('refresh-page', 'reopen-route', 'restore-checkpoint');
  }
  if (blocked.types.includes('disabled-cta')) {
    strategies.push('reset-form-state', 'wait-network-idle');
  }

  if (!strategies.length) {
    strategies.push('retry-improved-locator', 'wait-network-idle', 'refresh-page');
  }

  const unique = Array.from(new Set(strategies));

  if (config.recoveryEnabled === false) {
    return { decision: 'skip', reason: 'Recovery is disabled in configuration.', strategies: [] };
  }

  return {
    decision: 'recover',
    reason: `Attempt recovery for blocked flow: ${blocked.summary}`,
    strategies: unique,
  };
}
