import type { ActionExecutionResult, ExplorationSession, Observation } from '../types';
import { actionSignature } from '../memory/elementKey';
import type { BlockedFlowContext, BlockedFlowType } from './types';

export function detectBlockedFlow(args: {
  session: ExplorationSession;
  observation: Observation;
  execution?: ActionExecutionResult;
}): BlockedFlowContext {
  const { session, observation, execution } = args;
  const types = new Set<BlockedFlowType>();

  if (execution?.errors?.some((error) => error.code === 'locator-not-found')) {
    types.add('locator-not-found');
  }
  if (execution?.errors?.some((error) => error.code === 'element-not-visible')) {
    types.add('element-not-visible');
  }

  const failedSignature = execution?.action ? actionSignature(execution.action) : '';
  const repeatedFailures = session.memory.failedActions.filter((record) => record.signature === failedSignature).length;
  if (repeatedFailures >= 2) {
    types.add('repeated-failed-action');
  }

  const recentUrls = session.memory.visitedUrls.slice(-4);
  if (recentUrls.length >= 3 && new Set(recentUrls).size <= 1) {
    types.add('url-loop');
  }

  const text = [observation.visibleTextSummary, observation.domSummary].join(' ').toLowerCase();
  if (/loading|spinner|please wait/i.test(text) && observation.interactiveElements.length < 3) {
    types.add('stuck-loading');
  }

  if (observation.visionSignals?.anomalies.some((anomaly) => anomaly.anomalyType === 'overlay-collision')) {
    types.add('modal-blocking');
  }
  if ((observation.accessibilitySignals?.issueCount || 0) > 0 && /dialog|modal/i.test(text)) {
    types.add('modal-blocking');
  }

  if (/session expired|log in again|sign in to continue|unauthorized/i.test(text)) {
    types.add('session-timeout');
  }

  if (observation.networkEvents?.some((event) => event.status === 401) || /401/.test(text)) {
    types.add('auth-401');
  }
  if (observation.networkEvents?.some((event) => event.status === 403) || /403|forbidden/i.test(text)) {
    types.add('auth-403');
  }

  if (observation.visionSignals?.anomalies.some((anomaly) => anomaly.anomalyType === 'blank-page')) {
    types.add('blank-screen');
  }

  if (execution?.action?.url && observation.url && !observation.url.includes(new URL(execution.action.url, observation.url).pathname)) {
    types.add('unexpected-redirect');
  }

  const buttons = observation.buttons.filter((button) => button.visible !== false);
  if (buttons.some((button) => button.disabled) && /submit|continue|save/i.test(text)) {
    types.add('disabled-cta');
  }

  const typeList = Array.from(types);
  const severity: BlockedFlowContext['severity'] =
    typeList.some((type) => ['auth-401', 'auth-403', 'blank-screen', 'repeated-failed-action'].includes(type)) ? 'high' : 'medium';

  return {
    types: typeList,
    summary: typeList.length ? typeList.join(', ') : 'transient-action-failure',
    severity,
  };
}
