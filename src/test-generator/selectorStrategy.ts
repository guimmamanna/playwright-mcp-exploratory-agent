import type { AgentAction, ExplorationStep, InteractiveElement, LocatorStrategy } from '../types';

export interface RankedLocator {
  strategy: LocatorStrategy;
  expression: string;
  rank: number;
  stable: boolean;
}

function stringLiteral(value: string) {
  return JSON.stringify(value);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function regexLiteral(value: string) {
  return `/${escapeRegex(value)}/i`;
}

function isCssLike(value: string | undefined) {
  return Boolean(value && /^(#|\.|\[|[a-z][a-z0-9-]*(\.|#|\[|:|\s|>|$))/i.test(value));
}

function isXPathLike(value: string | undefined) {
  return Boolean(value && (/^\/\//.test(value) || /^xpath=/i.test(value)));
}

function normalizeXPath(value: string) {
  return value.startsWith('xpath=') ? value : `xpath=${value}`;
}

function labelOf(action: AgentAction) {
  return action.label || action.target || action.placeholder || action.text || action.testId || action.selector || '';
}

function elementMatchesAction(element: InteractiveElement, action: AgentAction) {
  const actionValues = new Set(
    [action.selector, action.target, action.label, action.placeholder, action.text, action.testId]
      .filter(Boolean)
      .map((value) => value!.toLowerCase()),
  );
  return [element.selectorHint, element.label, element.placeholder, element.href]
    .filter(Boolean)
    .some((value) => actionValues.has(value!.toLowerCase()));
}

function findElement(step: ExplorationStep) {
  const action = step.plan.action;
  return step.beforeObservation.interactiveElements.find((element) => elementMatchesAction(element, action));
}

function roleForAction(action: AgentAction, element?: InteractiveElement, executed?: LocatorStrategy) {
  if (action.role) return action.role;
  if (executed?.type === 'role' && executed.role) return executed.role;
  if (action.kind === 'search') return 'searchbox';
  if (action.kind === 'fill') return element?.inputType === 'search' ? 'searchbox' : 'textbox';
  if (action.kind === 'select') return 'combobox';
  if (action.kind === 'check' || action.kind === 'uncheck') return 'checkbox';
  if (element?.kind === 'button') return 'button';
  if (element?.kind === 'link') return 'link';
  if (element?.kind === 'checkbox') return 'checkbox';
  if (element?.kind === 'radio') return 'radio';
  if (element?.kind === 'select') return 'combobox';
  return undefined;
}

function locatorExpression(strategy: LocatorStrategy) {
  switch (strategy.type) {
    case 'role':
      return `page.getByRole(${stringLiteral(strategy.role || 'button')}${strategy.value ? `, { name: ${regexLiteral(strategy.value)} }` : ''})`;
    case 'label':
      return `page.getByLabel(${regexLiteral(strategy.value || '')})`;
    case 'placeholder':
      return `page.getByPlaceholder(${regexLiteral(strategy.value || '')})`;
    case 'text':
      return `page.getByText(${regexLiteral(strategy.value || '')})`;
    case 'testId':
      return `page.getByTestId(${stringLiteral(strategy.value || '')})`;
    case 'xpath':
    case 'css':
      return `page.locator(${stringLiteral(strategy.value || '')})`;
    default:
      return 'page.locator("body")';
  }
}

function addCandidate(
  candidates: RankedLocator[],
  strategy: LocatorStrategy,
  rank: number,
  stable: boolean,
) {
  if (!strategy.value && strategy.type !== 'role') {
    return;
  }

  const key = `${strategy.type}:${strategy.role || ''}:${strategy.value || ''}`;
  if (candidates.some((candidate) => `${candidate.strategy.type}:${candidate.strategy.role || ''}:${candidate.strategy.value || ''}` === key)) {
    return;
  }

  candidates.push({
    strategy,
    expression: locatorExpression(strategy),
    rank,
    stable,
  });
}

export function rankSelectorStrategies(step: ExplorationStep): RankedLocator[] {
  const action = step.plan.action;
  const executed = step.execution?.locatorStrategy;
  const element = findElement(step);
  const candidates: RankedLocator[] = [];
  const target = labelOf(action);
  const elementLabel = element?.label || element?.placeholder || target;
  const role = roleForAction(action, element, executed);

  if (role && elementLabel) {
    addCandidate(candidates, { type: 'role', role, value: elementLabel }, 100, true);
  }

  if (executed?.type === 'role' && executed.role && executed.value) {
    addCandidate(candidates, executed, 99, true);
  }

  for (const label of [action.label, element?.label, action.target].filter(Boolean) as string[]) {
    addCandidate(candidates, { type: 'label', value: label }, 90, true);
  }

  for (const placeholder of [action.placeholder, element?.placeholder, action.target].filter(Boolean) as string[]) {
    addCandidate(candidates, { type: 'placeholder', value: placeholder }, 80, true);
  }

  for (const text of [action.text, element?.label, action.target].filter(Boolean) as string[]) {
    addCandidate(candidates, { type: 'text', value: text }, 70, true);
  }

  if (action.testId) {
    addCandidate(candidates, { type: 'testId', value: action.testId }, 60, true);
  }

  if (action.selector && isCssLike(action.selector)) {
    addCandidate(candidates, { type: 'css', value: action.selector }, 40, false);
  }

  if (action.selector && isXPathLike(action.selector)) {
    addCandidate(candidates, { type: 'xpath', value: normalizeXPath(action.selector) }, 10, false);
  }

  return candidates.sort((a, b) => b.rank - a.rank);
}

export function primaryLocatorExpression(step: ExplorationStep) {
  return rankSelectorStrategies(step)[0]?.expression;
}

export function selectorStrategiesForSteps(steps: ExplorationStep[]) {
  return steps.flatMap((step) => rankSelectorStrategies(step).map((locator) => locator.strategy));
}
