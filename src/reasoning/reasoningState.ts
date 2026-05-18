import type { ExplorationSession } from '../types';
import type { ExplorationStrategyId } from '../strategies/types';
import type { ReasoningSessionState } from './types';

export function createReasoningState(initialStrategy: ExplorationStrategyId = 'navigation-focused'): ReasoningSessionState {
  return {
    enabled: true,
    currentStrategy: initialStrategy,
    strategyHistory: [
      {
        strategy: initialStrategy,
        reason: 'Initial strategy selected for session start.',
        timestamp: new Date().toISOString(),
      },
    ],
    traces: [],
    hypotheses: [],
    actionExplanations: [],
    findingExplanations: [],
    contextSummaries: [],
  };
}

export function ensureReasoningState(session: ExplorationSession, initialStrategy: ExplorationStrategyId = 'navigation-focused') {
  if (!session.reasoningState) {
    session.reasoningState = createReasoningState(initialStrategy);
  }
  session.reasoningState.enabled = session.config.reasoningEnabled !== false;
  return session.reasoningState;
}
