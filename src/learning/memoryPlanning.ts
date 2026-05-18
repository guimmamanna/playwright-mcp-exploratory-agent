import type { SessionLearningContext } from '../long-term-memory/types';
import type { PrioritisationContext } from '../memory/adaptivePrioritisation';
import { pathnameOf } from './fingerprints';

export function memoryPriorityBoost(
  context: PrioritisationContext & { learning?: SessionLearningContext },
): number {
  const learning = context.learning;
  if (!learning) return 0;

  let boost = 0;
  const route = pathnameOf(context.observationUrl);

  const routeRisk = learning.knownRisks.find((risk) => risk.route === route || route.startsWith(risk.route || ''));
  if (routeRisk) {
    boost += Math.min(35, Math.round(routeRisk.score / 2));
  }

  for (const gap of learning.explorationGaps) {
    if (context.priority === gap.recommendedPriority || gap.area.includes(context.priority)) {
      boost += 18;
    }
    if (context.observationUrl.includes(gap.area)) {
      boost += 12;
    }
  }

  if (learning.recommendedPriorities.includes(context.priority as SessionLearningContext['recommendedPriorities'][number])) {
    boost += 10;
  }

  const selectorHint = [context.action.selector, context.action.target, context.element?.label]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const reliable = learning.stableSelectors.find(
    (item) => selectorHint && item.value.toLowerCase().includes(selectorHint),
  );
  if (reliable && reliable.reliability >= 0.7) {
    boost += 12;
  }

  const healed = learning.healedSelectors.find(
    (item) => selectorHint && item.healedSelector.toLowerCase().includes(selectorHint),
  );
  if (healed) {
    boost += 8;
  }

  if (learning.previousBugs.length > 0) {
    boost += 6;
  }

  const flakyOnRoute = learning.flakyFlows?.some((flow) => flow.route === route);
  if (flakyOnRoute && (context.priority === 'forms' || context.priority === 'navigation')) {
    boost += 14;
  }

  return boost;
}

export function applyReliableSelectorHints(
  action: PrioritisationContext['action'],
  learning?: SessionLearningContext,
) {
  if (!learning?.stableSelectors.length) return action;

  const label = action.target || action.label || action.selector || '';
  const match = learning.stableSelectors
    .filter((item) => item.reliability >= 0.75)
    .sort((a, b) => b.reliability - a.reliability)
    .find((item) => label && item.value.toLowerCase().includes(label.toLowerCase()));

  if (!match) return action;

  return {
    ...action,
    selector: match.strategy === 'css' ? match.value : action.selector,
    testId: match.strategy === 'testId' ? match.value : action.testId,
    label: match.strategy === 'label' ? match.value : action.label,
  };
}
