import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BugReport,
  ConsoleMessageRecord,
  EvidenceLink,
  ExplorationSession,
  Finding,
  NetworkEventRecord,
} from '../types';
import {
  inferReproducibilityConfidence,
  normalizeFinding,
  titleCaseCategory,
  titleCaseSeverity,
} from './severityScoring';

function sanitizeFilePart(value: string, maxLength = 72) {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '') || 'bug';
  return sanitized.slice(0, maxLength).replace(/-$/g, '') || 'bug';
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function evidenceFromStep(session: ExplorationSession, finding: Finding): EvidenceLink[] {
  const step = finding.stepId ? session.steps.find((candidate) => candidate.id === finding.stepId) : undefined;
  const evidence = [...finding.evidence];

  if (step?.beforeObservation.screenshotPath) {
    evidence.push({
      label: 'Before screenshot',
      path: step.beforeObservation.screenshotPath,
      kind: 'screenshot',
    });
  }

  if (step?.afterObservation?.screenshotPath) {
    evidence.push({
      label: 'After screenshot',
      path: step.afterObservation.screenshotPath,
      kind: 'screenshot',
    });
  }

  return uniqueBy(evidence, (item) => `${item.kind}:${item.path}:${item.label}`);
}

function logsForFinding(session: ExplorationSession, finding: Finding): ConsoleMessageRecord[] {
  const step = finding.stepId ? session.steps.find((candidate) => candidate.id === finding.stepId) : undefined;
  const observations = [step?.beforeObservation, step?.afterObservation].filter(Boolean);
  const logs = observations.flatMap((observation) => observation?.consoleMessages || []);
  return uniqueBy(
    logs.filter((message) => message.level === 'error'),
    (message) => `${message.timestamp}:${message.level}:${message.text}:${message.location || ''}`,
  );
}

function failedRequestsForFinding(session: ExplorationSession, finding: Finding): NetworkEventRecord[] {
  const step = finding.stepId ? session.steps.find((candidate) => candidate.id === finding.stepId) : undefined;
  const observations = [step?.beforeObservation, step?.afterObservation].filter(Boolean);
  const requests = observations.flatMap((observation) => observation?.failedNetworkRequests || []);
  return uniqueBy(
    requests,
    (request) => `${request.timestamp}:${request.method}:${request.url}:${request.status || ''}:${request.failureText || ''}`,
  );
}

function markdownList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- None recorded.';
}

function numberedSteps(steps: string[]) {
  return steps.length ? steps.map((step, index) => `${index + 1}. ${step}`).join('\n') : '1. Reproduction steps were not captured.';
}

function evidenceList(evidence: EvidenceLink[]) {
  return evidence.length ? evidence.map((item) => `- [${item.label}](${item.path}) (${item.kind})`).join('\n') : '- None captured.';
}

function screenshotList(evidence: EvidenceLink[]) {
  const screenshots = evidence.filter((item) => item.kind === 'screenshot');
  return screenshots.length ? screenshots.map((item) => `- [${item.label}](${item.path})`).join('\n') : '- None captured.';
}

function consoleLogList(logs: ConsoleMessageRecord[]) {
  return logs.length
    ? logs.map((message) => `- ${message.level.toUpperCase()}: ${message.text}${message.location ? ` (${message.location})` : ''}`).join('\n')
    : '- None captured.';
}

function requestList(requests: NetworkEventRecord[]) {
  return requests.length
    ? requests
        .map((request) => `- ${request.method} ${request.url} -> ${request.status || request.failureText || 'failed'}`)
        .join('\n')
    : '- None captured.';
}

function reportBody(report: BugReport) {
  return `# ${report.title}

| Field | Value |
| --- | --- |
| Severity | ${titleCaseSeverity(report.severity)} |
| Category | ${titleCaseCategory(report.category)} |
| Environment | ${report.environmentName} |
| URL | ${report.url || ''} |
| Reproducibility confidence | ${report.reproducibilityConfidence} |

## Summary

${report.summary}

## Steps To Reproduce

${numberedSteps(report.reproductionSteps)}

## Expected Result

${report.expectedResult || 'Expected result was not recorded.'}

## Actual Result

${report.actualResult || report.summary}

## Screenshots

${screenshotList(report.evidence)}

## Evidence

${evidenceList(report.evidence)}

## Console Logs

${consoleLogList(report.consoleLogs)}

## Failed Network Requests

${requestList(report.failedNetworkRequests)}

## Suspected Cause

${report.suspectedRootCause || 'Not yet isolated.'}

${report.category === 'network-error' ? `## Network Details

| Field | Value |
| --- | --- |
| Classification | ${report.apiClassification || report.networkIssueType || ''} |
| Request | ${report.correlatedRequestMethod || ''} ${report.correlatedRequestUrl || ''} |
| Response time | ${report.responseTimeMs ? `${report.responseTimeMs}ms` : 'unknown'} |

### Recommendation

${report.recommendation || report.suspectedRootCause || 'Inspect API logs and client request handling.'}
` : ''}

${report.category === 'visual' ? `## Visual Details

| Field | Value |
| --- | --- |
| Viewport | ${report.viewport || ''} |
| Issue type | ${report.visualIssueType || ''} |
| Affected selector | ${report.affectedSelector || ''} |
| Visual diff ratio | ${report.visualDiffRatio !== undefined ? `${(report.visualDiffRatio * 100).toFixed(1)}%` : 'n/a'} |

### Recommendation

${report.recommendation || report.suspectedRootCause || 'Review layout and responsive behavior across target viewports.'}
` : ''}

${report.category === 'accessibility' ? `## Accessibility Details

| Field | Value |
| --- | --- |
| WCAG reference | ${report.wcagReference || 'Not recorded'} |
| Issue type | ${report.accessibilityIssueType || ''} |
| Affected selector | ${report.affectedSelector || ''} |
| Affected role | ${report.affectedRole || ''} |
| Affected name | ${report.affectedName || ''} |

### Recommendation

${report.recommendation || report.suspectedRootCause || 'Review the affected control against WCAG guidance.'}
` : ''}

${report.aiProbableCause ? `## AI Investigation Notes

| Field | Value |
| --- | --- |
| Probable cause | ${report.aiProbableCause} |
| Impacted functionality | ${report.aiImpactedFunctionality || ''} |
| Reproduction stability | ${report.aiReproductionStability || ''} |
| Suspected ownership | ${report.aiSuspectedOwnership || ''} |

${report.aiInvestigationNotes || ''}
` : ''}

## Generated Playwright Tests

${markdownList(report.generatedTestRefs)}
`;
}

export class BugReporter {
  constructor(private readonly bugReportDirectory = 'reports/exploratory/bugs') {}

  async writeBugReports(session: ExplorationSession): Promise<BugReport[]> {
    await mkdir(this.bugReportDirectory, { recursive: true });

    const reports: BugReport[] = [];
    const reportableFindings = session.findings.filter((finding) => finding.status !== 'dismissed');

    for (const finding of reportableFindings) {
      const normalizedFinding = normalizeFinding(finding);
      Object.assign(finding, normalizedFinding);

      const id = `bug-${normalizedFinding.id}`;
      const reportPath = join(
        this.bugReportDirectory,
        `${sanitizeFilePart(normalizedFinding.severity, 12)}-${sanitizeFilePart(normalizedFinding.category, 24)}-${sanitizeFilePart(
          normalizedFinding.title,
          64,
        )}-${sanitizeFilePart(normalizedFinding.id, 64)}.md`,
      );
      const report: BugReport = {
        id,
        findingId: normalizedFinding.id,
        title: normalizedFinding.title,
        severity: normalizedFinding.severity,
        category: normalizedFinding.category,
        summary: normalizedFinding.description,
        environmentName: session.config.environmentName,
        url: normalizedFinding.url || session.currentUrl,
        reproductionSteps: normalizedFinding.reproductionSteps,
        expectedResult: normalizedFinding.expectedResult,
        actualResult: normalizedFinding.actualResult || normalizedFinding.description,
        evidence: evidenceFromStep(session, normalizedFinding),
        consoleLogs: logsForFinding(session, normalizedFinding),
        failedNetworkRequests: failedRequestsForFinding(session, normalizedFinding),
        suspectedRootCause: normalizedFinding.suspectedRootCause,
        reproducibilityConfidence: inferReproducibilityConfidence(normalizedFinding),
        generatedTestRefs: session.generatedTests.map(
          (test) => `${test.filePath} (${test.status}, confidence: ${test.confidenceScore})`,
        ),
        wcagReference: normalizedFinding.wcagReference,
        affectedSelector: normalizedFinding.affectedSelector,
        affectedRole: normalizedFinding.affectedRole,
        affectedName: normalizedFinding.affectedName,
        recommendation: normalizedFinding.recommendation,
        accessibilityIssueType: normalizedFinding.accessibilityIssueType,
        networkIssueType: normalizedFinding.networkIssueType,
        apiClassification: normalizedFinding.apiClassification,
        correlatedRequestUrl: normalizedFinding.correlatedRequestUrl,
        correlatedRequestMethod: normalizedFinding.correlatedRequestMethod,
        responseTimeMs: normalizedFinding.responseTimeMs,
        visualIssueType: normalizedFinding.visualIssueType,
        viewport: normalizedFinding.viewport,
        visualDiffRatio: normalizedFinding.visualDiffRatio,
        aiProbableCause: normalizedFinding.aiProbableCause,
        aiImpactedFunctionality: normalizedFinding.aiImpactedFunctionality,
        aiReproductionStability: normalizedFinding.aiReproductionStability,
        aiSuspectedOwnership: normalizedFinding.aiSuspectedOwnership,
        aiInvestigationNotes: normalizedFinding.aiInvestigationNotes,
        reportPath,
      };

      await writeFile(reportPath, reportBody(report), 'utf8');
      normalizedFinding.bugReportPath = reportPath;
      Object.assign(finding, normalizedFinding);
      reports.push(report);
    }

    session.bugReports = reports;
    return reports;
  }
}
