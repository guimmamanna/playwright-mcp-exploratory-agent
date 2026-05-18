import type { Finding } from '../types';
import type { FindingAIExplanation } from './types';

export function explainFinding(finding: Finding): FindingAIExplanation {
  const haystack = `${finding.title} ${finding.description} ${finding.type} ${finding.category}`.toLowerCase();

  let suspectedOwnership: FindingAIExplanation['suspectedOwnership'] = 'unknown';
  if (finding.category === 'network-error' || finding.networkIssueType || finding.apiClassification) {
    suspectedOwnership = 'backend';
  } else if (finding.category === 'visual' || finding.category === 'accessibility' || finding.type === 'visual-anomaly') {
    suspectedOwnership = 'frontend';
  } else if (finding.type === 'console-error') {
    suspectedOwnership = haystack.includes('api') || haystack.includes('fetch') ? 'shared' : 'frontend';
  }

  let probableCause = finding.suspectedRootCause || 'Insufficient runtime evidence to isolate a single root cause.';
  if (finding.type === 'network-failure') {
    probableCause = 'A network request failed or returned an unexpected response during exploration.';
  } else if (finding.type === 'accessibility') {
    probableCause = 'Accessible name, role, label, or keyboard semantics are likely incomplete.';
  } else if (finding.type === 'visual-anomaly') {
    probableCause = 'Layout or responsive rendering likely regressed on the active viewport.';
  }

  const reproductionStability: FindingAIExplanation['reproductionStability'] =
    finding.severity === 'critical' || finding.severity === 'high'
      ? 'high'
      : finding.reproducibilityConfidence === 'high'
        ? 'high'
        : finding.reproducibilityConfidence === 'medium'
          ? 'medium'
          : 'low';

  return {
    findingId: finding.id,
    probableCause,
    impactedFunctionality: inferImpactedFunctionality(finding),
    reproductionStability,
    suspectedOwnership,
    investigationNotes: buildInvestigationNotes(finding, suspectedOwnership),
  };
}

function inferImpactedFunctionality(finding: Finding) {
  if (finding.category === 'accessibility') return 'Inclusive access to core UI workflows';
  if (finding.category === 'network-error') return 'Data retrieval or mutation through API calls';
  if (finding.category === 'visual') return 'Visual layout and responsive presentation';
  if (finding.type === 'form-validation') return 'Form submission and field validation';
  if (finding.type === 'navigation-dead-end') return 'Primary navigation and task continuation';
  return 'General user journey continuity';
}

function buildInvestigationNotes(finding: Finding, ownership: FindingAIExplanation['suspectedOwnership']) {
  return [
    `Review ${finding.url || 'the affected page'} with focus on ${finding.category}.`,
    ownership === 'backend'
      ? 'Capture failing request/response payloads and correlate with server logs.'
      : ownership === 'frontend'
        ? 'Reproduce in browser with DOM/state inspection and component ownership mapping.'
        : 'Validate both client state and server responses before assigning ownership.',
    finding.recommendation ? `Suggested fix direction: ${finding.recommendation}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
