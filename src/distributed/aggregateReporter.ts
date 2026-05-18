import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CoordinationSnapshot, DistributedRunResult, WorkerResult } from './types';

function severityCounts(findings: CoordinationSnapshot['globalFindings']) {
  return {
    critical: findings.filter((finding) => finding.severity === 'critical').length,
    high: findings.filter((finding) => finding.severity === 'high').length,
    medium: findings.filter((finding) => finding.severity === 'medium').length,
    low: findings.filter((finding) => finding.severity === 'low').length,
  };
}

function coverageByDimension(workers: WorkerResult[], dimension: 'personaId' | 'browser' | 'viewport') {
  const groups = new Map<string, { completed: number; failed: number; total: number }>();
  for (const worker of workers) {
    const key = worker.assignment[dimension];
    const entry = groups.get(key) || { completed: 0, failed: 0, total: 0 };
    entry.total += 1;
    if (worker.status === 'completed') entry.completed += 1;
    if (worker.status === 'failed' || worker.status === 'timed-out') entry.failed += 1;
    groups.set(key, entry);
  }
  return Array.from(groups.entries())
    .map(([name, stats]) => `- ${name}: ${stats.completed}/${stats.total} completed (${stats.failed} failed)`)
    .join('\n');
}

function mergedFindingsTable(snapshot: CoordinationSnapshot) {
  if (!snapshot.mergedFindings.length) {
    return 'No findings were recorded across workers.';
  }
  return `| Finding | Severity | Workers | Merge count | Confidence |
| --- | --- | --- | --- | --- |
${snapshot.mergedFindings
  .map(
    (record) =>
      `| ${record.finding.title} | ${record.finding.severity} | ${record.workerIds.join(', ')} | ${record.mergeCount} | ${
        record.finding.reproducibilityConfidence || 'medium'
      } |`,
  )
  .join('\n')}`;
}

function workerRows(workers: WorkerResult[]) {
  return workers
    .map(
      (worker) =>
        `| ${worker.workerId} | ${worker.assignment.personaId} | ${worker.assignment.browser} | ${worker.assignment.viewport} | ${worker.status} | ${worker.session?.findings.length || 0} | ${worker.session?.generatedTests.length || 0} | ${worker.reportPath || ''} |`,
    )
    .join('\n');
}

export async function writeAggregateReport(
  outputDirectory: string,
  result: DistributedRunResult,
): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });
  const reportPath = join(outputDirectory, `distributed-summary-${result.runId}.md`);
  const severities = severityCounts(result.coordination.globalFindings);

  const body = `# Distributed Exploratory Summary

## Run

- Run ID: ${result.runId}
- Started: ${result.startedAt}
- Ended: ${result.endedAt}
- Workers: ${result.workers.length}
- Stopped early: ${result.stoppedEarly ? 'yes' : 'no'}
- Stop reason: ${result.stopReason || 'none'}

## Global findings

- Total findings: ${result.coordination.globalFindings.length}
- Duplicate merges: ${result.coordination.duplicateFindingCount}
- Critical: ${severities.critical}
- High: ${severities.high}
- Medium: ${severities.medium}
- Low: ${severities.low}

## Coverage by persona

${coverageByDimension(result.workers, 'personaId')}

## Coverage by viewport

${coverageByDimension(result.workers, 'viewport')}

## Coverage by browser

${coverageByDimension(result.workers, 'browser')}

## Merged duplicate findings

${mergedFindingsTable(result.coordination)}

## Generated tests

- Total generated tests: ${result.coordination.generatedTests.length}
${result.coordination.generatedTests.map((test) => `- ${test.title} (${test.filePath})`).join('\n') || 'No generated tests.'}

## Worker reports

| Worker | Persona | Browser | Viewport | Status | Findings | Tests | Report |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
${workerRows(result.workers)}

## Blocked areas

${result.coordination.blockedAreas.length ? result.coordination.blockedAreas.map((area) => `- ${area}`).join('\n') : 'None'}
`;

  await writeFile(reportPath, body, 'utf8');
  return reportPath;
}
