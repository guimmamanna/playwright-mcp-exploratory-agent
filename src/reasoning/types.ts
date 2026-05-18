import type { ExplorationStrategyId } from '../strategies/types';
import type { AgentAction, FindingSeverity } from '../types';

export type HypothesisStatus = 'proposed' | 'testing' | 'confirmed' | 'rejected' | 'inconclusive';

export interface ExplorationHypothesis {
  id: string;
  statement: string;
  riskArea: string;
  validationIdea: string;
  status: HypothesisStatus;
  createdAt: string;
  updatedAt: string;
  relatedStepId?: string;
  evidenceFindingIds: string[];
  confidence: number;
}

export interface SuggestedAction {
  description: string;
  actionKind?: AgentAction['kind'];
  targetHint?: string;
}

export interface ReasoningOutput {
  strategy: ExplorationStrategyId;
  reasoningSummary: string;
  riskAssessment: FindingSeverity | 'low' | 'medium' | 'high';
  suggestedActions: SuggestedAction[];
  confidenceScore: number;
  hypotheses: Array<{
    statement: string;
    riskArea: string;
    validationIdea: string;
  }>;
}

export interface ActionReasoningExplanation {
  stepId?: string;
  planId: string;
  whySelected: string;
  riskTarget: string;
  expectedOutcome: string;
  confidenceLevel: number;
  strategy: ExplorationStrategyId;
  hypothesisId?: string;
}

export interface ReasoningTrace {
  id: string;
  stepId?: string;
  timestamp: string;
  strategy: ExplorationStrategyId;
  reasoningSummary: string;
  riskAssessment: string;
  confidenceScore: number;
  provider: string;
  compactContextSummary: string;
}

export interface FindingAIExplanation {
  findingId: string;
  probableCause: string;
  impactedFunctionality: string;
  reproductionStability: 'low' | 'medium' | 'high';
  suspectedOwnership: 'frontend' | 'backend' | 'shared' | 'unknown';
  investigationNotes: string;
}

export interface ReasoningSessionState {
  enabled: boolean;
  currentStrategy: ExplorationStrategyId;
  strategyHistory: Array<{ strategy: ExplorationStrategyId; stepId?: string; reason: string; timestamp: string }>;
  traces: ReasoningTrace[];
  hypotheses: ExplorationHypothesis[];
  actionExplanations: ActionReasoningExplanation[];
  findingExplanations: FindingAIExplanation[];
  contextSummaries: string[];
  lastReplanReason?: string;
}
