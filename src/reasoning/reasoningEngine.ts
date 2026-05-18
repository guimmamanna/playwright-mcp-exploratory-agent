import { createLLMProvider } from '../llm';
import type { LLMProvider } from '../llm';
import { getStrategy } from '../strategies/registry';
import type { ExplorationStrategyId } from '../strategies/types';
import { selectStrategyFromObservation } from '../strategies/strategySelector';
import type { ExplorationSession, Observation } from '../types';
import { buildCompactReasoningContext } from './contextSummarizer';
import type { ReasoningOutput, ReasoningTrace } from './types';

export interface ReasoningEngineOptions {
  provider?: LLMProvider;
  llmProvider?: 'mock' | 'openai' | 'claude' | 'gemini';
  model?: string;
  apiKey?: string;
}

function parseReasoningOutput(content: string, fallbackStrategy: ExplorationStrategyId): ReasoningOutput {
  try {
    const parsed = JSON.parse(content) as Partial<ReasoningOutput> & { suggestedActions?: Array<string | { description: string }> };
    const strategy = (parsed.strategy as ExplorationStrategyId) || fallbackStrategy;
    return {
      strategy,
      reasoningSummary: parsed.reasoningSummary || getStrategy(strategy).description,
      riskAssessment: (parsed.riskAssessment as ReasoningOutput['riskAssessment']) || 'medium',
      confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.7,
      suggestedActions: (parsed.suggestedActions || []).map((action) =>
        typeof action === 'string' ? { description: action } : { description: action.description },
      ),
      hypotheses: (parsed.hypotheses || []).map((hypothesis) => ({
        statement: hypothesis.statement,
        riskArea: hypothesis.riskArea,
        validationIdea: hypothesis.validationIdea,
      })),
    };
  } catch {
    return {
      strategy: fallbackStrategy,
      reasoningSummary: 'Fallback reasoning applied after LLM response parsing failed.',
      riskAssessment: 'medium',
      confidenceScore: 0.6,
      suggestedActions: [],
      hypotheses: [],
    };
  }
}

export class ReasoningEngine {
  private readonly provider: LLMProvider;

  constructor(options: ReasoningEngineOptions = {}) {
    this.provider =
      options.provider ||
      createLLMProvider({
        provider: options.llmProvider || 'mock',
        model: options.model,
        apiKey: options.apiKey,
      });
  }

  async reason(session: ExplorationSession, observation: Observation): Promise<{
    output: ReasoningOutput;
    trace: ReasoningTrace;
  }> {
    const fallbackStrategy = selectStrategyFromObservation(session, observation);
    const compactContext = buildCompactReasoningContext(session, observation);
    session.reasoningState?.contextSummaries.push(compactContext);
    if (session.reasoningState && session.reasoningState.contextSummaries.length > 8) {
      session.reasoningState.contextSummaries = session.reasoningState.contextSummaries.slice(-8);
    }

    const response = await this.provider.complete({
      responseFormat: 'json',
      maxTokens: 700,
      messages: [
        {
          role: 'system',
          content:
            'You are an exploratory testing strategist. Return strict JSON with keys: strategy, reasoningSummary, riskAssessment, confidenceScore, suggestedActions, hypotheses.',
        },
        {
          role: 'user',
          content: [
            'Plan the next exploration step from this compact context:',
            compactContext,
            `Current strategy: ${session.reasoningState?.currentStrategy || fallbackStrategy}`,
            `Pending areas: ${session.memory.pendingAreas.join(', ') || 'none'}`,
            `Blocked actions: ${session.memory.skippedRiskyActions.length}`,
          ].join('\n'),
        },
      ],
    });

    const output = parseReasoningOutput(response.content, fallbackStrategy);
    const trace: ReasoningTrace = {
      id: `reasoning-${Date.now()}`,
      stepId: observation.stepId,
      timestamp: new Date().toISOString(),
      strategy: output.strategy,
      reasoningSummary: output.reasoningSummary,
      riskAssessment: output.riskAssessment,
      confidenceScore: output.confidenceScore,
      provider: `${response.provider}:${response.model}`,
      compactContextSummary: compactContext,
    };

    if (session.reasoningState) {
      session.reasoningState.currentStrategy = output.strategy;
      session.reasoningState.traces.push(trace);
      if (session.reasoningState.traces.length > 20) {
        session.reasoningState.traces = session.reasoningState.traces.slice(-20);
      }
    }

    return { output, trace };
  }
}

export const defaultReasoningEngine = new ReasoningEngine();
