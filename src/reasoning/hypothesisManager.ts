import type { ExplorationSession, Finding } from '../types';
import type { ExplorationHypothesis, ReasoningOutput } from './types';

function hypothesisId(statement: string) {
  return `hypothesis-${statement.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
}

export function proposeHypotheses(session: ExplorationSession, output: ReasoningOutput, stepId?: string) {
  const now = new Date().toISOString();
  for (const candidate of output.hypotheses) {
    const id = hypothesisId(candidate.statement);
    const existing = session.reasoningState?.hypotheses.find((item) => item.id === id);
    if (existing) continue;

    const hypothesis: ExplorationHypothesis = {
      id,
      statement: candidate.statement,
      riskArea: candidate.riskArea,
      validationIdea: candidate.validationIdea,
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
      relatedStepId: stepId,
      evidenceFindingIds: [],
      confidence: output.confidenceScore,
    };
    session.reasoningState?.hypotheses.push(hypothesis);
  }
}

export function markHypothesisTesting(session: ExplorationSession, hypothesisId: string, stepId?: string) {
  const hypothesis = session.reasoningState?.hypotheses.find((item) => item.id === hypothesisId);
  if (!hypothesis) return;
  hypothesis.status = 'testing';
  hypothesis.updatedAt = new Date().toISOString();
  hypothesis.relatedStepId = stepId || hypothesis.relatedStepId;
}

export function validateHypotheses(session: ExplorationSession, findings: Finding[], stepId?: string) {
  if (!session.reasoningState) return;

  for (const hypothesis of session.reasoningState.hypotheses) {
    if (['confirmed', 'rejected'].includes(hypothesis.status)) continue;

    const riskTokens = hypothesis.riskArea.toLowerCase().split(/\s+/);
    const matched = findings.filter((finding) => {
      const haystack = `${finding.title} ${finding.description} ${finding.type} ${finding.category}`.toLowerCase();
      return riskTokens.some((token) => token.length > 3 && haystack.includes(token));
    });

    if (matched.length > 0) {
      hypothesis.status = 'confirmed';
      hypothesis.evidenceFindingIds = matched.map((finding) => finding.id);
      hypothesis.updatedAt = new Date().toISOString();
      hypothesis.relatedStepId = stepId || hypothesis.relatedStepId;
      continue;
    }

    if (hypothesis.status === 'testing' && stepId) {
      hypothesis.status = 'inconclusive';
      hypothesis.updatedAt = new Date().toISOString();
    }
  }
}

export function activeHypotheses(session: ExplorationSession) {
  return (session.reasoningState?.hypotheses || []).filter((item) => ['proposed', 'testing'].includes(item.status));
}
