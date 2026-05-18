import type { Finding, Observation } from '../types';
import { normalizeFinding } from '../reporting/severityScoring';
import type { VisualIssue } from './types';

function findingId(issue: VisualIssue, url: string) {
  return `visual-anomaly:${issue.issueType}:${issue.viewport}:${url}:${issue.affectedSelector || issue.title}`
    .toLowerCase()
    .replace(/[^a-z0-9:.-]+/g, '-')
    .slice(0, 140);
}

export function visualIssueToFinding(issue: VisualIssue, observation: Observation, options: { stepId?: string } = {}): Finding {
  const evidence = [];
  if (issue.screenshotPath) {
    evidence.push({ label: `Screenshot (${issue.viewport})`, path: issue.screenshotPath, kind: 'screenshot' as const });
  }
  if (issue.diffPath) {
    evidence.push({ label: `Visual diff (${issue.viewport})`, path: issue.diffPath, kind: 'screenshot' as const });
  }

  return normalizeFinding({
    id: findingId(issue, observation.url),
    type: 'visual-anomaly',
    severity: issue.severity,
    category: 'visual',
    title: issue.title,
    description: issue.description,
    url: observation.url,
    stepId: options.stepId || observation.stepId,
    suspectedRootCause: issue.description,
    recommendation: issue.recommendation,
    visualIssueType: issue.issueType,
    viewport: issue.viewport,
    affectedSelector: issue.affectedSelector,
    visualDiffRatio: issue.diffRatio,
    evidence,
    reproductionSteps: [
      `Open ${observation.url}`,
      `Review layout at ${issue.viewport} viewport.`,
      issue.affectedSelector ? `Inspect ${issue.affectedSelector}.` : 'Compare screenshots across viewports.',
    ],
    expectedResult: 'Layout renders cleanly without overlap, clipping, or viewport overflow.',
    actualResult: issue.description,
    status: 'new',
  });
}

export function issuesToFindings(issues: VisualIssue[], observation: Observation, options: { stepId?: string } = {}): Finding[] {
  const seen = new Set<string>();
  return issues
    .map((issue) => visualIssueToFinding(issue, observation, options))
    .filter((finding) => {
      if (seen.has(finding.id)) return false;
      seen.add(finding.id);
      return true;
    });
}
