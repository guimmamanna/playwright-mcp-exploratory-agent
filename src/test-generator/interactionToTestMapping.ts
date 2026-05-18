import type { AgentAction, ExplorationStep, GeneratedTestFlowCategory } from '../types';

export interface InteractionToTestMapping {
  flowCategory: GeneratedTestFlowCategory;
  regressionTestName: string;
  interactionSummary: string[];
  basedOnStepIds: string[];
}

function actionLabel(action: AgentAction) {
  switch (action.kind) {
    case 'navigate':
      return action.url ? `navigate to ${action.url}` : 'navigate';
    case 'fill':
      return `fill ${action.label || action.placeholder || action.target || 'field'}`;
    case 'search':
      return `search for ${action.value || action.target || 'query'}`;
    case 'select':
      return `select ${action.value || action.target || 'option'}`;
    case 'check':
    case 'uncheck':
      return `${action.kind} ${action.label || action.target || 'control'}`;
    case 'press':
      return `press ${action.key || action.value || 'Enter'}`;
    case 'goBack':
      return 'go back';
    case 'waitForLoadState':
      return `wait for ${action.loadState || 'domcontentloaded'}`;
    default:
      return `${action.kind} ${action.label || action.text || action.target || action.selector || ''}`.trim();
  }
}

function inferRegressionName(steps: ExplorationStep[], flowCategory: GeneratedTestFlowCategory, findingTitle?: string) {
  const labels = steps
    .filter((step) => !['noop', 'screenshot', 'wait', 'stop'].includes(step.plan.action.kind))
    .map((step) => actionLabel(step.plan.action));

  const hasAuthFlow =
    labels.some((label) => /sign\s*in|log\s*in|email|password/i.test(label)) &&
    labels.some((label) => /password|log\s*in|sign\s*in/i.test(label));

  if (flowCategory === 'reproduced-bug' && findingTitle) {
    return `Reproduce bug: ${findingTitle}`;
  }

  if (hasAuthFlow) {
    return 'login flow regression test';
  }

  if (flowCategory === 'navigation-path') {
    const lastNavigation = [...steps].reverse().find((step) => step.afterObservation?.url);
    const destination = lastNavigation?.afterObservation?.title || lastNavigation?.afterObservation?.url;
    return destination ? `navigation path regression to ${destination}` : 'validated navigation path regression test';
  }

  const terminalAction = labels.at(-1);
  if (terminalAction) {
    return `${terminalAction} flow regression test`;
  }

  return 'verified exploratory flow regression test';
}

export function mapInteractionHistoryToTest(
  steps: ExplorationStep[],
  flowCategory: GeneratedTestFlowCategory,
  options: { findingTitle?: string } = {},
): InteractionToTestMapping {
  const interactionSummary = steps
    .filter((step) => !['noop', 'screenshot', 'wait', 'stop'].includes(step.plan.action.kind))
    .map((step) => actionLabel(step.plan.action));

  return {
    flowCategory,
    regressionTestName: inferRegressionName(steps, flowCategory, options.findingTitle),
    interactionSummary,
    basedOnStepIds: steps.map((step) => step.id),
  };
}
