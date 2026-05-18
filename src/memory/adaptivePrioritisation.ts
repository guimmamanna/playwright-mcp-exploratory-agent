import type { AgentAction, ExplorationSession, InteractiveElement } from '../types';
import { elementKeyFromAction, elementKeyFromInteractive } from './elementKey';
import { isDuplicateAction } from './duplicateDetection';

export interface PrioritisationContext {
  session: ExplorationSession;
  observationUrl: string;
  priority: string;
  element?: InteractiveElement;
  action: AgentAction;
}

export function adaptivePriorityBoost(context: PrioritisationContext) {
  const { session, observationUrl, priority, element, action } = context;
  let boost = 0;

  if (priority === 'forms') {
    const formKey = element ? elementKeyFromInteractive(element, observationUrl, 'fill') : elementKeyFromAction(action, observationUrl);
    const tested = session.memory.filledForms.some((form) => form.fieldKeys.includes(formKey));
    if (!tested) {
      boost += 25;
    }
  }

  if (priority === 'navigation' || priority === 'authentication') {
    const destination = action.url || element?.href;
    if (destination && !session.memory.visitedUrls.includes(destination)) {
      boost += 20;
    }
    const pathKey = `${observationUrl}->${destination || action.target || ''}`;
    if (!session.memory.testedNavigationPaths.some((path) => `${path.fromUrl}->${path.toUrl}` === pathKey)) {
      boost += 12;
    }
  }

  if (priority === 'filters') {
    const filterKey = action.target || action.selector || element?.label || '';
    if (filterKey && !session.memory.testedFilters.includes(filterKey.toLowerCase())) {
      boost += 18;
    }
  }

  if (session.memory.pendingAreas.includes('console-errors') && priority === 'console-network') {
    boost += 30;
  }

  if (session.memory.pendingAreas.includes('network-failures') && priority === 'console-network') {
    boost += 30;
  }

  const failedOnPage = session.memory.failedActions.some((record) => record.url === observationUrl);
  if (failedOnPage && !isDuplicateAction(session, action, { url: observationUrl, allowRepeatForConfirmation: true })) {
    boost += 15;
  }

  if (session.memory.pendingAreas.includes('forms') && priority === 'forms') {
    boost += 10;
  }

  if (session.memory.pendingAreas.includes('navigation') && priority === 'navigation') {
    boost += 10;
  }

  const persona = session.explorationContext?.persona;
  if (persona) {
    const label = [action.target, action.selector, element?.label, element?.href].filter(Boolean).join(' ').toLowerCase();
    if (persona.preferredFlows.some((flow) => label.includes(flow.toLowerCase()))) {
      boost += 16;
    }
    if (session.explorationContext?.environment.riskTier === 'high' && priority === 'create-edit-delete') {
      boost -= 25;
    }
  }

  return boost;
}
