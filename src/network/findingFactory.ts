import type { Finding, Observation } from '../types';
import { normalizeFinding } from '../reporting/severityScoring';
import type { NetworkIssue } from './types';

function findingId(issue: NetworkIssue, url: string) {
  return `network-failure:${issue.issueType}:${url}:${issue.request.method}:${issue.request.status || issue.request.failureText || 'failed'}`
    .toLowerCase()
    .replace(/[^a-z0-9:.-]+/g, '-')
    .slice(0, 140);
}

export function networkIssueToFinding(issue: NetworkIssue, observation: Observation, options: { stepId?: string } = {}): Finding {
  return normalizeFinding({
    id: findingId(issue, observation.url),
    type: 'network-failure',
    severity: issue.severity,
    category: 'network-error',
    title: issue.title,
    description: issue.description,
    url: observation.url,
    stepId: options.stepId || observation.stepId || issue.request.stepId,
    suspectedRootCause: issue.suspectedRootCause,
    recommendation: issue.recommendation,
    networkIssueType: issue.issueType,
    apiClassification: issue.issueType,
    correlatedRequestUrl: issue.request.url,
    correlatedRequestMethod: issue.request.method,
    responseTimeMs: issue.request.responseTimeMs,
    evidence: observation.screenshotPath
      ? [{ label: 'Screenshot', path: observation.screenshotPath, kind: 'screenshot' }]
      : [],
    reproductionSteps: [
      `Open ${observation.url}`,
      issue.request.triggeringAction
        ? `Perform action: ${issue.request.triggeringAction}.`
        : 'Reproduce the user interaction that triggered the request.',
      `Observe ${issue.request.method} ${issue.request.url}.`,
    ],
    expectedResult: 'API and network requests complete successfully within acceptable latency.',
    actualResult: issue.description,
    status: 'new',
  });
}

export function issuesToFindings(issues: NetworkIssue[], observation: Observation, options: { stepId?: string } = {}): Finding[] {
  const seen = new Set<string>();
  return issues
    .map((issue) => networkIssueToFinding(issue, observation, options))
    .filter((finding) => {
      if (seen.has(finding.id)) {
        return false;
      }
      seen.add(finding.id);
      return true;
    });
}
