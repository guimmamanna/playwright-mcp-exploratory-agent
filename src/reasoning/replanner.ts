import type { ExplorationSession } from '../types';
import type { ExplorationStrategyId } from '../strategies/types';
import { selectStrategyFromObservation } from '../strategies/strategySelector';

export interface ReplanDecision {
  shouldReplan: boolean;
  nextStrategy: ExplorationStrategyId;
  reason: string;
}

export function evaluateReplan(session: ExplorationSession): ReplanDecision {
  const state = session.reasoningState;
  const current = state?.currentStrategy || 'navigation-focused';
  const observation = session.memory.observations.at(-1);

  const recentBlocked = session.memory.skippedRiskyActions.slice(-2);
  if (recentBlocked.length >= 1) {
    return {
      shouldReplan: true,
      nextStrategy: 'permission-exploration',
      reason: 'Actions were blocked by persona or environment safety rules.',
    };
  }

  const recentFailed = session.memory.failedActions.slice(-2);
  if (recentFailed.length >= 2) {
    return {
      shouldReplan: true,
      nextStrategy: 'edge-case-exploration',
      reason: 'Multiple recent actions failed; switching to edge-case validation.',
    };
  }

  if (session.memory.repeatedActionsPrevented >= 2) {
    return {
      shouldReplan: true,
      nextStrategy: 'navigation-focused',
      reason: 'Duplicate exploration detected; reducing low-value loops.',
    };
  }

  const criticalFindings = session.findings.filter((finding) => finding.severity === 'critical').length;
  if (criticalFindings > 0 && current !== 'stress-exploration') {
    return {
      shouldReplan: true,
      nextStrategy: 'stress-exploration',
      reason: 'Critical findings present; intensify investigation around unstable areas.',
    };
  }

  if (observation) {
    const heuristic = selectStrategyFromObservation(session, observation);
    if (heuristic !== current && session.steps.length > 0 && session.steps.length % 3 === 0) {
      return {
        shouldReplan: true,
        nextStrategy: heuristic,
        reason: 'Periodic strategy refresh based on latest UI signals.',
      };
    }
  }

  return { shouldReplan: false, nextStrategy: current, reason: 'Continue current strategy.' };
}

export function applyReplan(session: ExplorationSession, decision: ReplanDecision) {
  if (!session.reasoningState || !decision.shouldReplan) return;
  if (session.reasoningState.currentStrategy === decision.nextStrategy) return;

  session.reasoningState.currentStrategy = decision.nextStrategy;
  session.reasoningState.lastReplanReason = decision.reason;
  session.reasoningState.strategyHistory.push({
    strategy: decision.nextStrategy,
    reason: decision.reason,
    timestamp: new Date().toISOString(),
    stepId: session.steps.at(-1)?.id,
  });
}
