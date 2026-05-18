import type { ActionPlan, ExplorationSession, Finding } from '../types';
import { normalizeFinding } from '../reporting/severityScoring';
import type { BlockedFlowContext } from './types';

export function blockedFlowToFinding(
  blocked: BlockedFlowContext,
  session: ExplorationSession,
  plan: ActionPlan,
  stepId?: string,
): Finding {
  return normalizeFinding({
    id: `blocked-flow:${stepId || plan.id}:${blocked.summary}`.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-').slice(0, 120),
    type: 'flow-failure',
    severity: blocked.severity,
    category: 'functional',
    title: 'Blocked exploration flow detected',
    description: `Exploration was blocked (${blocked.summary}) while attempting ${plan.action.kind} on ${plan.action.target || plan.action.selector || 'target'}.`,
    url: session.currentUrl,
    stepId,
    suspectedRootCause: blocked.types.join(', '),
    recommendation: 'Review UI blockers, authentication state, and selector stability before retrying.',
    evidence: [],
    reproductionSteps: [
      `Open ${session.currentUrl || session.config.baseUrl}`,
      `Attempt ${plan.action.kind} on ${plan.action.target || plan.action.selector || 'element'}.`,
      'Observe blocked flow indicators and recovery logs.',
    ],
    status: 'new',
  });
}
