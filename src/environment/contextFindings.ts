import type { ExplorationSession, Finding, Observation } from '../types';
import { normalizeFinding } from '../reporting/severityScoring';
import { compareFeatureFlags } from './featureFlags';

function findingId(type: string, key: string) {
  return `${type}:${key}`.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-').slice(0, 120);
}

export function featureFlagFindings(session: ExplorationSession, observation: Observation): Finding[] {
  const environment = session.explorationContext?.environment;
  const detected = observation.featureFlagSignals?.flags || [];
  if (!environment || !detected.length) {
    return [];
  }

  const mismatches = compareFeatureFlags(environment, detected);
  return mismatches.map((mismatch) =>
    normalizeFinding({
      id: findingId('feature-flag', mismatch.key),
      type: 'flow-failure',
      severity: 'medium',
      category: 'functional',
      title: 'Feature flag visibility mismatch',
      description: mismatch.issue,
      url: observation.url,
      stepId: observation.stepId,
      suspectedRootCause: `Expected ${String(mismatch.expected)} for ${mismatch.key} in ${environment.name}.`,
      recommendation: 'Verify feature flag rollout and environment configuration alignment.',
      evidence: [],
      reproductionSteps: [
        `Open ${observation.url}`,
        `Confirm whether feature "${mismatch.key}" should be enabled in ${environment.name}.`,
      ],
      status: 'new',
    }),
  );
}

export function localeFindings(observation: Observation): Finding[] {
  return (observation.localeSignals?.issues || []).map((issue) =>
    normalizeFinding({
      id: findingId('locale', issue.id),
      type: 'flow-failure',
      severity: issue.severity,
      category: 'usability',
      title: issue.title,
      description: issue.description,
      url: observation.url,
      stepId: observation.stepId,
      recommendation: issue.recommendation,
      evidence: [],
      reproductionSteps: [`Open ${observation.url}`, 'Review locale-specific formatting and language attributes.'],
      status: 'new',
    }),
  );
}
