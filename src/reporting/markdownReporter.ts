import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExplorationSession, ExplorationStep, Finding, GeneratedTest, Observation } from '../types';
import { summarizeObservation } from '../observer/observationFactory';
import { refreshCoverage } from '../memory/coverageTracking';
import { BugReporter } from './bugReporter';
import { titleCaseCategory, titleCaseSeverity } from './severityScoring';

function sanitizeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '') || 'exploration';
}

function findingRow(finding: Finding) {
  const evidence = finding.evidence.map((item) => `[${item.label}](${item.path})`).join(', ') || '';
  const bugReport = finding.bugReportPath ? `[bug report](${finding.bugReportPath})` : '';
  const agent = finding.discoveredByAgent || '';
  return `| ${titleCaseSeverity(finding.severity)} | ${titleCaseCategory(finding.category)} | ${finding.type} | ${finding.title} | ${
    finding.url || ''
  } | ${agent} | ${bugReport} | ${evidence} |`;
}

function cell(value: string | number | undefined) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
    .trim();
}

function reproductionBlock(finding: Finding) {
  if (!finding.reproductionSteps.length) {
    return '';
  }

  const steps = finding.reproductionSteps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  return `\n### ${finding.title}\n\nSeverity: ${titleCaseSeverity(finding.severity)}\n\nCategory: ${titleCaseCategory(
    finding.category,
  )}\n\n${finding.description}\n\n${steps}\n${
    finding.suspectedRootCause ? `\nSuspected root cause: ${finding.suspectedRootCause}\n` : ''
  }`;
}

function observationRow(observation: Observation) {
  const consoleErrors = observation.consoleMessages.filter((message) => message.level === 'error').length;
  const failedRequests = (observation.failedNetworkRequests || []).length;
  const screenshot = observation.screenshotPath ? `[screenshot](${observation.screenshotPath})` : '';

  return `| ${cell(observation.stepId)} | ${cell(observation.phase)} | ${cell(observation.url)} | ${cell(
    observation.title,
  )} | ${cell(observation.visibleTextSummary?.slice(0, 240))} | ${observation.interactiveElements.length} | ${
    observation.buttons.length
  } | ${observation.links.length} | ${observation.inputs.length} | ${observation.forms.length} | ${consoleErrors} | ${failedRequests} | ${screenshot} |`;
}

function accessibilityFindingRow(finding: Finding) {
  return `| ${cell(finding.title)} | ${cell(titleCaseSeverity(finding.severity))} | ${cell(finding.wcagReference)} | ${cell(
    finding.affectedSelector,
  )} | ${cell(finding.affectedRole)} | ${cell(finding.recommendation)} | ${finding.evidence.find((item) => item.kind === 'screenshot') ? 'yes' : ''} |`;
}

function accessibilitySummary(session: ExplorationSession) {
  const accessibilityFindings = session.findings.filter((finding) => finding.category === 'accessibility' || finding.type === 'accessibility');
  const severityCounts = {
    critical: accessibilityFindings.filter((finding) => finding.severity === 'critical').length,
    high: accessibilityFindings.filter((finding) => finding.severity === 'high').length,
    medium: accessibilityFindings.filter((finding) => finding.severity === 'medium').length,
    low: accessibilityFindings.filter((finding) => finding.severity === 'low').length,
  };
  const affectedPages = Array.from(new Set(accessibilityFindings.map((finding) => finding.url).filter(Boolean) as string[]));
  const wcagReferences = Array.from(
    new Set(accessibilityFindings.map((finding) => finding.wcagReference).filter(Boolean) as string[]),
  );

  const table = accessibilityFindings.length
    ? `| Title | Severity | WCAG | Selector | Role | Recommendation | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
${accessibilityFindings.map(accessibilityFindingRow).join('\n')}`
    : 'No accessibility issues were recorded.';

  return `## Accessibility Summary

- Total accessibility issues: ${accessibilityFindings.length}
- Severity breakdown: critical ${severityCounts.critical}, high ${severityCounts.high}, medium ${severityCounts.medium}, low ${severityCounts.low}
- Affected pages: ${affectedPages.join(', ') || 'none'}
- WCAG references: ${wcagReferences.join(', ') || 'none'}
- Keyboard trap detected: ${session.memory.observations.at(-1)?.accessibilitySignals?.keyboardTrapDetected ? 'yes' : 'no'}
- Repeated actions prevented: ${session.memory.repeatedActionsPrevented}

${table}
`;
}

function networkFindingRow(finding: Finding) {
  return `| ${cell(finding.title)} | ${cell(titleCaseSeverity(finding.severity))} | ${cell(finding.apiClassification)} | ${cell(
    finding.correlatedRequestMethod,
  )} | ${cell(finding.correlatedRequestUrl)} | ${cell(finding.responseTimeMs ? `${finding.responseTimeMs}ms` : '')} | ${cell(
    finding.recommendation || finding.suspectedRootCause,
  )} |`;
}

function networkSummary(session: ExplorationSession) {
  const networkFindings = session.findings.filter((finding) => finding.category === 'network-error' || finding.type === 'network-failure');
  const latestSignals = session.memory.observations.at(-1)?.networkSignals;
  const severityCounts = {
    critical: networkFindings.filter((finding) => finding.severity === 'critical').length,
    high: networkFindings.filter((finding) => finding.severity === 'high').length,
    medium: networkFindings.filter((finding) => finding.severity === 'medium').length,
    low: networkFindings.filter((finding) => finding.severity === 'low').length,
  };
  const impactedActions = Array.from(
    new Set(
      networkFindings
        .flatMap((finding) => session.steps.filter((step) => step.id === finding.stepId))
        .map((step) => `${step.plan.action.kind} ${step.plan.action.target || ''}`.trim()),
    ),
  );
  const statusSummary = latestSignals
    ? Object.entries(latestSignals.statusCodeSummary)
        .map(([code, count]) => `${code}: ${count}`)
        .join(', ')
    : 'none';

  const table = networkFindings.length
    ? `| Title | Severity | Classification | Method | URL | Response Time | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
${networkFindings.map(networkFindingRow).join('\n')}`
    : 'No network issues were recorded.';

  return `## Network Summary

- Total network/API issues: ${networkFindings.length}
- Severity breakdown: critical ${severityCounts.critical}, high ${severityCounts.high}, medium ${severityCounts.medium}, low ${severityCounts.low}
- Failed requests captured: ${latestSignals?.failedCount ?? 0}
- Slow requests captured: ${latestSignals?.slowCount ?? 0}
- Status code summary: ${statusSummary}
- Impacted user actions: ${impactedActions.join(', ') || 'none'}
- Polling loops: ${latestSignals?.pollingLoops.join(', ') || 'none'}

${table}
`;
}

function reasoningSummary(session: ExplorationSession) {
  const state = session.reasoningState;
  if (!state?.enabled) {
    return '';
  }

  const hypotheses = state.hypotheses;
  const traces = state.traces.slice(-5);
  const strategies = state.strategyHistory
    .map((entry) => `- ${entry.strategy} (${entry.reason})`)
    .join('\n');
  const hypothesisTable = hypotheses.length
    ? `| Hypothesis | Status | Risk area | Validation |
| --- | --- | --- | --- |
${hypotheses
  .map(
    (item) =>
      `| ${cell(item.statement)} | ${cell(item.status)} | ${cell(item.riskArea)} | ${cell(item.validationIdea)} |`,
  )
  .join('\n')}`
    : 'No hypotheses were recorded.';

  const traceBlock = traces.length
    ? traces
        .map(
          (trace) =>
            `- **${trace.strategy}** (confidence ${(trace.confidenceScore * 100).toFixed(0)}%): ${trace.reasoningSummary}`,
        )
        .join('\n')
    : 'No reasoning traces recorded.';

  const explanations = state.actionExplanations
    .slice(-5)
    .map(
      (item) =>
        `- Plan ${item.planId}: ${item.whySelected} (risk: ${item.riskTarget}, confidence ${(item.confidenceLevel * 100).toFixed(0)}%)`,
    )
    .join('\n');

  return `## AI Reasoning Summary

- Current strategy: ${state.currentStrategy}
- Reasoning traces: ${state.traces.length}
- Hypotheses: ${hypotheses.length}
- Last replan: ${state.lastReplanReason || 'none'}

### Strategies used

${strategies || 'none'}

### Recent reasoning traces

${traceBlock}

### Action decision explanations

${explanations || 'none'}

### Hypotheses tested

${hypothesisTable}
`;
}

function environmentPersonaSummary(session: ExplorationSession) {
  const context = session.explorationContext;
  const blocked = session.memory.skippedRiskyActions;
  const environmentBlocked = blocked.filter((entry) => entry.blockedBy === 'environment');
  const personaBlocked = blocked.filter((entry) => entry.blockedBy === 'persona');

  return `## Environment and Persona Context

- Environment: ${context?.environment.name || session.config.environmentName}
- Persona: ${context?.persona.name || session.config.persona}
- API environment: ${context?.apiEnvironment || session.goal.metadata?.apiEnvironment || 'n/a'}
- Locale: ${context?.locale || session.config.locale || 'n/a'}
- Timezone: ${context?.timezone || session.config.timezone || 'n/a'}
- Test data mode: ${context?.testDataMode || session.goal.metadata?.testDataMode || 'n/a'}
- Permissions observed: ${(context?.observedPermissions || []).join(', ') || 'none'}
- Feature flags configured: ${
    Object.entries(context?.configuredFeatureFlags || session.config.featureFlags || {})
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ') || 'none'
  }
- Feature flags detected in UI: ${context?.detectedFeatureFlags.join(', ') || 'none'}
- Environment-blocked actions: ${environmentBlocked.length}
- Persona-blocked actions: ${personaBlocked.length}

### Blocked actions due to safety policy

${
  blocked.length
    ? blocked
        .map(
          (entry) =>
            `- [${entry.blockedBy || 'config'}] ${entry.reason} (${entry.url})`,
        )
        .join('\n')
    : 'No actions were blocked by environment or persona safety rules.'
}
`;
}

function learningSummary(session: ExplorationSession) {
  if (!session.config.learningEnabled && !session.learningContext && !session.memoryUpdateSummary) {
    return '';
  }

  const context = session.learningContext;
  const update = session.memoryUpdateSummary;
  const comparison = session.historicalComparison;

  const riskLines = context?.knownRisks.length
    ? context.knownRisks.map((risk) => `- ${risk.area} (${risk.score}): ${risk.reason}`).join('\n')
    : 'No historical risks retrieved.';

  const gapLines = context?.explorationGaps.length
    ? context.explorationGaps.map((gap) => `- ${gap.area}: ${gap.reason} → prioritise ${gap.recommendedPriority}`).join('\n')
    : 'No exploration gaps recorded.';

  const selectorLines = context?.stableSelectors.length
    ? context.stableSelectors
        .slice(0, 8)
        .map((item) => `- ${item.strategy} "${item.value}" (${(item.reliability * 100).toFixed(0)}% reliable)`)
        .join('\n')
    : 'No stable selectors recorded yet.';

  return `## Long-Term Learning Summary

- Learning enabled: ${session.config.learningEnabled ? 'yes' : 'no'}
- Historical sessions: ${context?.historicalSessionCount ?? 0}
- Suppressed false positives: ${context?.falsePositiveCount ?? 0}
- Retrieved at: ${context?.retrievedAt || 'n/a'}

### Historical risk context

${riskLines}

### Recommended priorities from memory

${context?.recommendedPriorities.join(', ') || 'none'}

### Exploration gaps to revisit

${gapLines}

### Reliable selectors

${selectorLines}

### Session comparison

- Previous finding count: ${comparison?.previousFindingCount ?? 'n/a'}
- Current finding count: ${comparison?.currentFindingCount ?? session.findings.length}
- New issues: ${comparison?.newIssues.length ? comparison.newIssues.join('; ') : 'none'}
- Repeated issues: ${comparison?.repeatedIssues.length ? comparison.repeatedIssues.join('; ') : 'none'}
- Regression candidates: ${update?.regressionCandidates.length ? update.regressionCandidates.join('; ') : 'none'}
- Improvements since last run: ${update?.improvementsSinceLastRun.length ? update.improvementsSinceLastRun.join('; ') : 'none'}

### Memory updates made

${update?.memoryUpdates.length ? update.memoryUpdates.map((line) => `- ${line}`).join('\n') : 'No memory updates recorded.'}
`;
}

function recoverySummary(session: ExplorationSession) {
  const attempts = session.recoveryState?.recoveryAttempts || [];
  const stepAttempts = session.steps.flatMap((step) => step.recoveryAttempts || []);
  const allAttempts = attempts.length ? attempts : stepAttempts;
  if (!allAttempts.length && !session.config.recoveryEnabled) {
    return '';
  }

  const checkpoints = session.recoveryState?.checkpoints || [];
  const table = allAttempts.length
    ? `| Strategy | Success | Healed Selector | Checkpoint | Message |
| --- | --- | --- | --- | --- |
${allAttempts
  .map(
    (attempt) =>
      `| ${cell(attempt.strategy)} | ${attempt.success ? 'yes' : 'no'} | ${cell(attempt.healedSelector)} | ${cell(
        attempt.checkpointId,
      )} | ${cell(attempt.message)} |`,
  )
  .join('\n')}`
    : 'No recovery attempts were recorded.';

  const outcomes = session.steps
    .filter((step) => step.recoveryAttempts?.length)
    .map((step) => {
      const last = step.recoveryAttempts!.at(-1)!;
      const outcome = step.execution?.status === 'success' ? 'recovered' : 'failed';
      return `- Step ${step.index + 1} (${step.plan.action.kind}): ${outcome} via ${last.strategy}${
        step.execution?.selectorHealingApplied ? ' (selector healed)' : ''
      }${step.execution?.checkpointRestored ? ` (checkpoint ${step.execution.checkpointRestored})` : ''}`;
    })
    .join('\n');

  return `## Recovery Summary

- Recovery enabled: ${session.config.recoveryEnabled ? 'yes' : 'no'}
- Total recovery attempts: ${session.recoveryState?.totalRecoveryAttempts || allAttempts.length}
- Selector healing attempts: ${session.recoveryState?.selectorHealingAttempts || 0}
- Checkpoints saved: ${checkpoints.length}
- Latest checkpoint: ${checkpoints.at(-1)?.url || 'none'}

### Recovery attempts

${table}

### Step outcomes after recovery

${outcomes || 'No steps required recovery during this session.'}
`;
}

function multimodalVisionSummary(session: ExplorationSession) {
  const observations = session.memory.observations.filter((observation) => observation.visionSignals);
  if (!observations.length) {
    return '';
  }

  const latest = observations.at(-1)?.visionSignals;
  const findings = session.findings.filter((finding) => finding.visionAnomalyType);
  const regionLines = (latest?.regions || [])
    .slice(0, 12)
    .map((region) => `- ${region.kind}: ${region.label || region.id} (confidence ${(region.confidence * 100).toFixed(0)}%)`)
    .join('\n');

  return `## Multimodal Vision Summary

- Provider: ${latest?.provider || 'n/a'}
- OCR summary: ${latest?.ocrTextSummary || 'none'}
- Regions detected: ${latest?.regions.length || 0}
- Vision anomalies: ${latest?.anomalies.length || 0}
- Page usable (vision): ${latest?.reasoning.pageUsable ? 'yes' : 'no'}
- Vision reasoning: ${latest?.reasoning.summary || 'none'}
- Annotated screenshot: ${latest?.annotatedScreenshotPath ? `[annotated](${latest.annotatedScreenshotPath})` : 'none'}
- Heatmap metadata: ${latest?.heatmapPath ? `[heatmap](${latest.heatmapPath})` : 'none'}

### Detected UI regions

${regionLines || 'No regions recorded.'}

### Vision findings

${findings.length ? findings.map((finding) => `- ${finding.title} (${finding.visionAnomalyType})`).join('\n') : 'No multimodal vision findings.'}
`;
}

function visualSummary(session: ExplorationSession) {
  const visualFindings = session.findings.filter((finding) => finding.category === 'visual' || finding.type === 'visual-anomaly');
  const captures = session.memory.observations.flatMap((observation) => observation.visualSignals?.captures || []);
  const screenshots = captures
    .filter((capture) => capture.screenshotPath)
    .map((capture) => `- ${capture.viewport} (${capture.width}x${capture.height}): ${capture.screenshotPath}`)
    .join('\n');
  const diffs = captures
    .filter((capture) => capture.diffPath)
    .map((capture) => `- ${capture.viewport}: ${capture.diffPath} (${((capture.diffRatio || 0) * 100).toFixed(1)}% changed)`)
    .join('\n');

  const table = visualFindings.length
    ? `| Title | Severity | Viewport | Issue | Selector | Recommendation | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
${visualFindings
  .map(
    (finding) =>
      `| ${cell(finding.title)} | ${cell(titleCaseSeverity(finding.severity))} | ${cell(finding.viewport)} | ${cell(
        finding.visualIssueType,
      )} | ${cell(finding.affectedSelector)} | ${cell(finding.recommendation || finding.suspectedRootCause)} | ${
        finding.evidence.find((item) => item.kind === 'screenshot') ? 'yes' : ''
      } |`,
  )
  .join('\n')}`
    : 'No visual issues were recorded.';

  return `## Visual Summary

- Total visual/responsive issues: ${visualFindings.length}
- Viewport captures: ${captures.length}
- Affected pages: ${Array.from(new Set(visualFindings.map((finding) => finding.url).filter(Boolean))).join(', ') || 'none'}

### Screenshots by viewport

${screenshots || 'No viewport screenshots captured.'}

### Visual diffs

${diffs || 'No visual diffs exceeded the configured threshold.'}

### Detected layout issues

${table}
`;
}

function multiAgentSummary(session: ExplorationSession) {
  const state = session.multiAgentState;
  if (!state?.enabled) {
    return '';
  }

  const coverageRows = state.agentCoverage
    .map(
      (entry) =>
        `| ${entry.agentName} | ${entry.tasksRun} | ${entry.findingsContributed} | ${cell(entry.lastTask)} |`,
    )
    .join('\n');

  const findingsByAgent = Object.entries(state.findingsByAgent)
    .map(([agent, findings]) => `- **${agent}**: ${findings.length} finding(s)`)
    .join('\n');

  const conflictRows = state.conflicts.length
    ? state.conflicts
        .map(
          (conflict) =>
            `| ${cell(conflict.flowKey)} | ${conflict.agents.join(', ')} | ${cell(conflict.finalStatus)} | ${cell(conflict.resolution)} |`,
        )
        .join('\n')
    : '| — | — | — | No conflicts resolved |';

  const mergedTable = session.findings.length
    ? `| Severity | Category | Type | Title | URL | Agent | Bug Report | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
${session.findings.map(findingRow).join('\n')}`
    : 'No merged findings.';

  return `## Multi-Agent Collaboration

- Schedule mode: ${state.scheduleMode}
- Focus: ${state.focus}
- Active agents: ${state.activeAgents.join(', ')}
- Messages exchanged: ${state.messages.length}
- Escalated critical findings: ${state.escalatedCriticalIds.length}

### Findings by agent

${findingsByAgent || 'No agent-attributed findings.'}

### Agent coverage

| Agent | Tasks run | Findings contributed | Last task |
| --- | ---: | ---: | --- |
${coverageRows || '| — | 0 | 0 | — |'}

### Conflicts resolved

| Flow | Agents | Final status | Resolution |
| --- | --- | --- | --- |
${conflictRows}

### Recommendations

${state.recommendations.map((item) => `- ${item}`).join('\n') || '- None'}

### Merged findings (deduplicated)

${mergedTable}
`;
}

function generatedTestRow(test: GeneratedTest) {
  const lastRun = test.executionResults.at(-1);
  const execution = lastRun
    ? `${lastRun.status}${lastRun.selectorHealingApplied ? ' after selector healing' : ''}`
    : 'not run';
  return `| ${cell(test.title)} | ${cell(test.flowCategory)} | ${cell(test.status)} | ${cell(test.confidenceScore)} | ${cell(
    test.filePath,
  )} | ${cell(execution)} | ${cell(test.failureReason || lastRun?.failureReason)} |`;
}

function stepObservationBlock(step: ExplorationStep) {
  const before = summarizeObservation(step.beforeObservation);
  const after = step.afterObservation ? summarizeObservation(step.afterObservation) : 'No after observation recorded.';
  const locatorStrategy = step.execution?.locatorStrategy
    ? `${step.execution.locatorStrategy.type}${step.execution.locatorStrategy.role ? `:${step.execution.locatorStrategy.role}` : ''}${
        step.execution.locatorStrategy.value ? `=${step.execution.locatorStrategy.value}` : ''
      }`
    : 'none';
  const beforeScreenshot = step.beforeObservation.screenshotPath
    ? `[before screenshot](${step.beforeObservation.screenshotPath})`
    : 'none';
  const afterScreenshot = step.afterObservation?.screenshotPath
    ? `[after screenshot](${step.afterObservation.screenshotPath})`
    : 'none';
  const executionErrors = step.execution?.errors?.length
    ? step.execution.errors.map((error) => `- ${error.code}: ${error.message}`).join('\n')
    : 'None';
  const recoveryLines = step.recoveryAttempts?.length
    ? step.recoveryAttempts
        .map(
          (attempt) =>
            `- ${attempt.strategy}: ${attempt.success ? 'succeeded' : 'failed'}${attempt.healedSelector ? ` (healed: ${attempt.healedSelector})` : ''} — ${attempt.message}`,
        )
        .join('\n')
    : 'None';
  const validationChecks = step.validation?.result.checks?.length
    ? step.validation.result.checks
        .map((check) => `- ${check.passed ? 'PASS' : 'FAIL'} ${check.name}${check.details ? `: ${check.details}` : ''}`)
        .join('\n')
    : 'No validation checks recorded.';

  return `### Step ${step.index + 1}: ${step.plan.action.kind}

Action: \`${JSON.stringify(step.plan.action)}\`

Rationale: ${step.plan.rationale}

Expected outcome: ${step.plan.expectedOutcome}

Validation idea: ${step.plan.validationIdea}

Locator strategy used: ${locatorStrategy}

Execution: ${step.execution?.status || step.status}${step.execution?.message ? ` - ${step.execution.message}` : ''}

Actual outcome: ${step.validation?.result.actualOutcome || step.execution?.actualOutcome || ''}

Validation result: ${step.validation?.result.passed ? 'passed' : 'failed'} - ${step.validation?.result.summary || ''}

Screenshots: ${beforeScreenshot} / ${afterScreenshot}

Execution errors:

${executionErrors}

Recovery attempts:

${recoveryLines}

Validation checks:

${validationChecks}

Before:

\`\`\`text
${before}
\`\`\`

After:

\`\`\`text
${after}
\`\`\`
`;
}

export class MarkdownReporter {
  constructor(
    private readonly reportDirectory: string,
    private readonly bugReporter = new BugReporter(),
  ) {}

  async writeSessionReport(session: ExplorationSession): Promise<string> {
    await mkdir(this.reportDirectory, { recursive: true });
    await this.bugReporter.writeBugReports(session);

    const reportPath = join(
      this.reportDirectory,
      `${sanitizeFilePart(session.goal.id)}-${sanitizeFilePart(session.id)}.md`,
    );

    const coverage = refreshCoverage(session);
    const exploredAreas = coverage.exploredAreas.length ? coverage.exploredAreas.join(', ') : 'none';
    const unexploredAreas = coverage.unexploredAreas.length ? coverage.unexploredAreas.join(', ') : 'none';

    const generatedTests = session.generatedTests.length
      ? `| Title | Flow Category | Status | Confidence | File | Last Execution | Failure Reason |
| --- | --- | --- | --- | --- | --- | --- |
${session.generatedTests.map(generatedTestRow).join('\n')}`
      : 'No generated tests were produced.';

    const body = `# Exploratory Session Report

## Summary

- Session: ${session.id}
- Goal: ${session.goal.name}
- Environment: ${session.explorationContext?.environment.name || session.config.environmentName}
- Persona: ${session.explorationContext?.persona.name || session.config.persona}
- Status: ${session.status}
- Started: ${session.startedAt}
- Ended: ${session.endedAt || ''}
- Steps: ${session.steps.length}
- Findings: ${session.findings.length}
- Bug reports: ${session.bugReports.length}
- Generated tests: ${session.generatedTests.length}
- Observations: ${session.memory.observations.length}
- Visited URLs: ${session.memory.visitedUrls.length}

## Goal

${session.goal.description}

## Session Memory

- Visited pages: ${session.memory.visitedUrls.join(', ') || 'none'}
- Explored pages: ${session.memory.exploredPages.join(', ') || 'none'}
- Clicked elements: ${session.memory.clickedElements.length}
- Filled forms: ${session.memory.filledForms.length}
- Submitted forms: ${session.memory.submittedForms.length}
- Tested filters: ${session.memory.testedFilters.join(', ') || 'none'}
- Tested navigation paths: ${session.memory.testedNavigationPaths.length}
- Failed actions: ${session.memory.failedActions.length}
- Known bugs: ${session.memory.knownBugs.length}
- Skipped risky actions: ${session.memory.skippedRiskyActions.length}
- Pending areas: ${session.memory.pendingAreas.join(', ') || 'none'}
- Successful flows recorded: ${session.memory.successfulFlows.length}
- Generated test refs: ${session.memory.generatedTestRefs.join(', ') || 'none'}
- Repeated actions prevented: ${session.memory.repeatedActionsPrevented}
- Stop reason: ${session.memory.stopReason || 'not recorded'}

## Coverage Summary

- Pages visited: ${coverage.pagesVisited} (${coverage.uniquePagesVisited} unique)
- Interactive elements explored: ${coverage.interactiveElementsExplored} / ${coverage.interactiveElementsSeen} (${coverage.explorationPercentage}%)
- Forms encountered: ${coverage.formsEncountered}
- Forms tested: ${coverage.formsTested}
- Filters tested: ${coverage.filtersTested}
- Findings found: ${coverage.findingsCount}
- Blocked flows: ${coverage.blockedFlows}
- Explored areas: ${exploredAreas}
- Unexplored areas: ${unexploredAreas}

## Observations

| Step | Phase | URL | Title | Visible Text Summary | Elements | Buttons | Links | Inputs | Forms | Console Errors | Failed Requests | Screenshot |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${session.memory.observations.length ? session.memory.observations.map(observationRow).join('\n') : '|  |  |  |  | No observations recorded | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |'}

## Findings Summary

| Severity | Category | Type | Title | URL | Agent | Bug Report | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
${session.findings.length ? session.findings.map(findingRow).join('\n') : '| Low | functional | none | No findings recorded |  |  |  |  |'}

${multiAgentSummary(session)}

${accessibilitySummary(session)}

${networkSummary(session)}

${environmentPersonaSummary(session)}

${reasoningSummary(session)}

${learningSummary(session)}

${recoverySummary(session)}

${visualSummary(session)}

${multimodalVisionSummary(session)}

## Reproduction Steps
${session.findings.map(reproductionBlock).join('\n') || '\nNo bugs were recorded during this session.\n'}

## Executed Steps

${session.steps
  .map(
    (step) =>
      `${step.index + 1}. ${step.plan.action.kind} - ${step.plan.rationale} - ${step.execution?.status || step.status} - ${
        step.validation?.result.summary || 'not validated'
      }`,
  )
  .join('\n')}

## Step Observations

${session.steps.map(stepObservationBlock).join('\n')}

## Generated Tests

${generatedTests}
`;

    await writeFile(reportPath, body, 'utf8');
    session.reportPath = reportPath;
    return reportPath;
  }
}
