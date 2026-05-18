import type { ExplorationSession, Observation } from '../types';
import type { ExplorationStrategyId } from './types';
import { getStrategy } from './registry';

export function selectStrategyFromObservation(
  session: ExplorationSession,
  observation: Observation,
): ExplorationStrategyId {
  const text = [observation.visibleTextSummary, observation.domSummary, observation.url].filter(Boolean).join(' ').toLowerCase();

  if (session.memory.skippedRiskyActions.length > 0) {
    return 'permission-exploration';
  }
  if (/modal|dialog|keyboard|accessibility|aria/i.test(text)) {
    return 'accessibility-focused';
  }
  if (/filter|sort|refine/i.test(text)) {
    return 'state-persistence-exploration';
  }
  if (/upload|file input|attach/i.test(text)) {
    return 'edge-case-exploration';
  }
  if (/sign in|log in|register|auth/i.test(text)) {
    return 'authentication-focused';
  }
  if (observation.forms.length > 0) {
    return 'form-focused';
  }
  if (session.explorationContext?.persona.id === 'mobile-only-user') {
    return 'responsive-exploration';
  }

  return 'navigation-focused';
}

export function strategyPriorityBoost(strategyId: ExplorationStrategyId, candidatePriority: string) {
  const strategy = getStrategy(strategyId);
  const index = strategy.priorities.indexOf(candidatePriority as (typeof strategy.priorities)[number]);
  if (index === -1) return 0;
  return strategy.scoreBoost - index * 3;
}
