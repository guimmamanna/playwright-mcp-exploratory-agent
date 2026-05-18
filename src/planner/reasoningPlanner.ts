import { evaluateReplan, applyReplan, proposeHypotheses, markHypothesisTesting } from '../reasoning';
import { ReasoningEngine } from '../reasoning/reasoningEngine';
import { ensureReasoningState } from '../reasoning/reasoningState';
import { strategyPriorityBoost } from '../strategies/strategySelector';
import type { ActionPlan, ExplorationPlanner, PlannerContext } from '../types';
import { RiskBasedPlanner } from './riskBasedPlanner';

export interface ReasoningPlannerOptions {
  basePlanner?: ExplorationPlanner;
  reasoningEngine?: ReasoningEngine;
}

function enrichPlan(plan: ActionPlan, args: {
  reasoningSummary: string;
  strategy: string;
  confidenceScore: number;
  riskTarget: string;
  hypothesisId?: string;
}): ActionPlan {
  return {
    ...plan,
    rationale: `${plan.rationale}\n\nAI reasoning: ${args.reasoningSummary}`,
    reasoningSummary: args.reasoningSummary,
    explorationStrategy: args.strategy as ActionPlan['explorationStrategy'],
    confidenceScore: args.confidenceScore,
    riskTarget: args.riskTarget,
    hypothesisId: args.hypothesisId,
  };
}

export class ReasoningPlanner implements ExplorationPlanner {
  private readonly basePlanner: ExplorationPlanner;
  private readonly reasoningEngine: ReasoningEngine;

  constructor(options: ReasoningPlannerOptions = {}) {
    this.basePlanner = options.basePlanner || new RiskBasedPlanner();
    this.reasoningEngine = options.reasoningEngine || new ReasoningEngine();
  }

  async planNextAction(context: PlannerContext): Promise<ActionPlan> {
    const { session, observation } = context;
    const state = ensureReasoningState(session, session.reasoningState?.currentStrategy || 'navigation-focused');

    const replan = evaluateReplan(session);
    applyReplan(session, replan);

    const { output } = await this.reasoningEngine.reason(session, observation);
    proposeHypotheses(session, output, observation.stepId);

    const activeHypothesis = session.reasoningState?.hypotheses.find((item) => item.status === 'proposed');
    if (activeHypothesis) {
      markHypothesisTesting(session, activeHypothesis.id, observation.stepId);
    }

    const basePlan = await this.basePlanner.planNextAction(context);
    if (basePlan.action.kind === 'stop') {
      return enrichPlan(basePlan, {
        reasoningSummary: output.reasoningSummary,
        strategy: output.strategy,
        confidenceScore: output.confidenceScore,
        riskTarget: output.riskAssessment,
        hypothesisId: activeHypothesis?.id,
      });
    }

    const strategyBoost = strategyPriorityBoost(output.strategy, basePlan.priority);
    const enriched = enrichPlan(
      {
        ...basePlan,
        priority: basePlan.priority,
        riskLevel: output.riskAssessment === 'high' || output.riskAssessment === 'critical' ? 'high' : basePlan.riskLevel,
      },
      {
        reasoningSummary: `${output.reasoningSummary}${replan.shouldReplan ? ` Replan: ${replan.reason}` : ''}`,
        strategy: output.strategy,
        confidenceScore: Math.min(0.99, output.confidenceScore + strategyBoost / 100),
        riskTarget: activeHypothesis?.riskArea || output.riskAssessment,
        hypothesisId: activeHypothesis?.id,
      },
    );

    state.actionExplanations.push({
      stepId: observation.stepId,
      planId: enriched.id,
      whySelected: output.reasoningSummary,
      riskTarget: enriched.riskTarget || output.riskAssessment,
      expectedOutcome: enriched.expectedOutcome,
      confidenceLevel: enriched.confidenceScore || output.confidenceScore,
      strategy: output.strategy,
      hypothesisId: activeHypothesis?.id,
    });
    if (state.actionExplanations.length > 30) {
      state.actionExplanations = state.actionExplanations.slice(-30);
    }

    return enriched;
  }
}
