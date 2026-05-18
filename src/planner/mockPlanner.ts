import type { ActionPlan, ExplorationPlanner, PlannerContext } from '../types';

function planId(index: number) {
  return `plan-${String(index + 1).padStart(3, '0')}`;
}

export class MockPlanner implements ExplorationPlanner {
  async planNextAction({ session, observation, findings }: PlannerContext): Promise<ActionPlan> {
    const nextIndex = session.steps.length;
    const targetUrl = session.goal.targetUrl
      ? new URL(session.goal.targetUrl, session.config.baseUrl).toString()
      : session.config.baseUrl;

    const hasCriticalFinding = findings.some((finding) => finding.severity === 'critical');
    if (hasCriticalFinding && session.config.stopConditions.includes('criticalFinding')) {
      return {
        id: planId(nextIndex),
        priority: 'console-network',
        riskLevel: 'low',
        action: {
          kind: 'stop',
          reason: 'Critical finding encountered.',
        },
        rationale: 'Stop before compounding a critical defect.',
        expectedOutcome: 'Exploration session stops and reports current findings.',
        validationIdea: 'Confirm no additional exploratory action is attempted after the critical finding.',
        stopAfterAction: true,
      };
    }

    if (!observation.url || observation.url === 'about:blank') {
      return {
        id: planId(nextIndex),
        priority: session.goal.priorities[0] || 'navigation',
        riskLevel: 'low',
        action: {
          kind: 'navigate',
          url: targetUrl,
          reason: 'Start exploration at the configured target URL.',
        },
        rationale: 'The current session has not loaded an application page yet.',
        expectedOutcome: `The browser navigates to ${targetUrl}.`,
        validationIdea: 'Confirm URL and title are captured after navigation.',
      };
    }

    if (session.config.screenshotMode === 'every-step' && !observation.screenshotPath) {
      return {
        id: planId(nextIndex),
        priority: 'accessibility',
        riskLevel: 'low',
        action: {
          kind: 'screenshot',
          reason: 'Capture visual evidence for the current page state.',
        },
        rationale: 'Configured screenshot mode requires visual evidence.',
        expectedOutcome: 'A screenshot artifact is attached to the current step.',
        validationIdea: 'Confirm the step report links to a screenshot artifact.',
      };
    }

    return {
      id: planId(nextIndex),
      priority: session.goal.priorities[0] || 'navigation',
      riskLevel: 'low',
      action: {
        kind: 'stop',
        reason: 'Slice 1 mock planner performs observation and initial navigation only.',
      },
      rationale: 'No risk-based planner has been connected yet.',
      expectedOutcome: 'Exploration stops after recording baseline findings.',
      validationIdea: 'Confirm the session report records the stop reason.',
      stopAfterAction: true,
    };
  }
}
