import type { AgentAction, ExplorationSession } from '../types';
import { actionSignature, elementKeyFromAction } from './elementKey';

export interface DuplicateCheckOptions {
  url: string;
  allowRepeatForConfirmation?: boolean;
}

export function hasInteractedWithElement(session: ExplorationSession, elementKey: string) {
  return session.memory.clickedElements.includes(elementKey) || session.memory.interactedElements.includes(elementKey);
}

export function isDuplicateAction(session: ExplorationSession, action: AgentAction, options: DuplicateCheckOptions) {
  if (['navigate', 'goBack', 'wait', 'waitForLoadState', 'screenshot', 'noop', 'stop'].includes(action.kind)) {
    return false;
  }

  const key = elementKeyFromAction(action, options.url);
  if (!hasInteractedWithElement(session, key)) {
    return false;
  }

  if (options.allowRepeatForConfirmation) {
    return false;
  }

  const failedOnSameTarget = session.memory.failedActions.some(
    (record) => record.signature === actionSignature(action) || record.signature.includes(key),
  );
  if (failedOnSameTarget) {
    return false;
  }

  const openBugOnPage = session.findings.some(
    (finding) =>
      finding.status !== 'dismissed' &&
      (finding.url === options.url || finding.stepId) &&
      ['medium', 'high', 'critical'].includes(finding.severity),
  );
  if (openBugOnPage && action.reason?.toLowerCase().includes('confirm')) {
    return false;
  }

  return true;
}

export function recordPreventedDuplicate(session: ExplorationSession) {
  session.memory.repeatedActionsPrevented += 1;
}
