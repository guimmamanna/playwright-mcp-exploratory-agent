import type { AccessibilityIssue } from './types';
import type { Finding, Observation } from '../types';
import { classifyFindingCategory, normalizeFinding } from '../reporting/severityScoring';

function findingId(issue: AccessibilityIssue, url: string) {
  return `accessibility:${issue.issueType}:${url}:${issue.affectedSelector || issue.title}`
    .toLowerCase()
    .replace(/[^a-z0-9:.-]+/g, '-')
    .slice(0, 140);
}

export function accessibilityIssueToFinding(
  issue: AccessibilityIssue,
  observation: Observation,
  options: { stepId?: string; evidencePath?: string } = {},
): Finding {
  return normalizeFinding({
    id: findingId(issue, observation.url),
    type: 'accessibility',
    severity: issue.severity,
    category: classifyFindingCategory({ type: 'accessibility', title: issue.title, description: issue.description }),
    title: issue.title,
    description: issue.description,
    url: observation.url,
    stepId: options.stepId || observation.stepId,
    suspectedRootCause: issue.recommendation,
    wcagReference: issue.wcagReference,
    affectedSelector: issue.affectedSelector,
    affectedRole: issue.affectedRole,
    affectedName: issue.affectedName,
    recommendation: issue.recommendation,
    accessibilityIssueType: issue.issueType,
    evidence: options.evidencePath
      ? [{ label: 'Screenshot', path: options.evidencePath, kind: 'screenshot' }]
      : [],
    reproductionSteps: [
      `Open ${observation.url}`,
      issue.affectedSelector ? `Inspect ${issue.affectedSelector}.` : 'Review the affected control with assistive technology or keyboard-only navigation.',
    ],
    expectedResult: 'The control meets WCAG expectations for name, role, value, keyboard access, and visual presentation.',
    actualResult: issue.description,
    status: 'new',
  });
}

export function issuesToFindings(
  issues: AccessibilityIssue[],
  observation: Observation,
  options: { stepId?: string; evidencePath?: string } = {},
): Finding[] {
  const seen = new Set<string>();
  return issues
    .map((issue) => accessibilityIssueToFinding(issue, observation, options))
    .filter((finding) => {
      if (seen.has(finding.id)) {
        return false;
      }
      seen.add(finding.id);
      return true;
    });
}
