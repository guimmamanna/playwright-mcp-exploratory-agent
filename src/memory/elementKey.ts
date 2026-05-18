import type { AgentAction, InteractiveElement } from '../types';

export function elementKeyFromParts(url: string, kind: string, target?: string) {
  const normalizedUrl = url.split('#')[0] || url;
  const normalizedTarget = (target || 'unknown').toLowerCase().trim();
  return `${normalizedUrl}::${kind}::${normalizedTarget}`;
}

export function elementKeyFromAction(action: AgentAction, url: string) {
  const target =
    action.selector || action.target || action.label || action.placeholder || action.text || action.url || action.key || 'unknown';
  return elementKeyFromParts(url, action.kind, target);
}

export function elementKeyFromInteractive(element: InteractiveElement, url: string, kind = 'click') {
  const target = element.selectorHint || element.label || element.placeholder || element.href || 'unknown';
  return elementKeyFromParts(url, kind, target);
}

export function actionSignature(action: AgentAction) {
  return [action.kind, action.url, action.selector, action.target, action.value, action.key]
    .filter(Boolean)
    .join('|')
    .toLowerCase();
}
