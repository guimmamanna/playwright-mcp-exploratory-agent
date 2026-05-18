import { defaultAccessibilityEngine } from '../accessibility/accessibilityEngine';
import { defaultNetworkEngine } from '../network/networkEngine';
import { defaultVisualEngine } from '../visual/visualEngine';
import type {
  EvidenceLink,
  ExplorationStep,
  ExplorationValidator,
  Finding,
  FindingSeverity,
  FindingType,
  Observation,
  ValidationCheck,
  ValidationResult,
} from '../types';
import { classifyFindingCategory, normalizeFinding } from '../reporting/severityScoring';

function findingId(type: FindingType, step: ExplorationStep, title: string) {
  return `${type}:${step.id}:${title}`.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-').slice(0, 140);
}

function evidenceFromStep(step: ExplorationStep): EvidenceLink[] {
  return [
    step.beforeObservation.screenshotPath
      ? { label: 'Before screenshot', path: step.beforeObservation.screenshotPath, kind: 'screenshot' as const }
      : undefined,
    step.afterObservation?.screenshotPath
      ? { label: 'After screenshot', path: step.afterObservation.screenshotPath, kind: 'screenshot' as const }
      : undefined,
    step.execution?.evidencePath
      ? { label: 'Execution evidence', path: step.execution.evidencePath, kind: 'screenshot' as const }
      : undefined,
  ].filter(Boolean) as EvidenceLink[];
}

function makeFinding(args: {
  step: ExplorationStep;
  type: FindingType;
  severity: FindingSeverity;
  category?: Finding['category'];
  title: string;
  description: string;
  suspectedRootCause?: string;
}): Finding {
  return normalizeFinding({
    id: findingId(args.type, args.step, args.title),
    type: args.type,
    category: args.category || classifyFindingCategory(args),
    severity: args.severity,
    title: args.title,
    description: args.description,
    url: args.step.afterObservation?.url || args.step.beforeObservation.url,
    stepId: args.step.id,
    evidence: evidenceFromStep(args.step),
    reproductionSteps: [
      `Open ${args.step.beforeObservation.url}`,
      `Execute ${args.step.plan.action.kind}${args.step.plan.action.target ? ` on ${args.step.plan.action.target}` : ''}.`,
      'Compare the before and after observations.',
    ],
    expectedResult: args.step.plan.expectedOutcome,
    actualResult: args.step.execution?.actualOutcome || args.description,
    suspectedRootCause: args.suspectedRootCause,
    status: 'new',
  });
}

function textChanged(before: Observation, after?: Observation) {
  if (!after) return false;
  return (before.visibleTextSummary || before.visibleText || '') !== (after.visibleTextSummary || after.visibleText || '');
}

function hasNewConsoleErrors(before: Observation, after?: Observation) {
  if (!after) return [];
  const beforeErrors = new Set(before.consoleMessages.filter((message) => message.level === 'error').map((message) => message.text));
  return after.consoleMessages.filter((message) => message.level === 'error' && !beforeErrors.has(message.text));
}

function hasNewFailedRequests(before: Observation, after?: Observation) {
  if (!after) return [];
  const beforeFailures = new Set(
    (before.failedNetworkRequests || []).map((request) => `${request.method}:${request.url}:${request.status}:${request.failureText}`),
  );
  return (after.failedNetworkRequests || []).filter(
    (request) => !beforeFailures.has(`${request.method}:${request.url}:${request.status}:${request.failureText}`),
  );
}

function detectSuccessMessages(after?: Observation) {
  const text = after?.visibleText || '';
  return /\b(success|saved|created|updated|added|complete|completed|sent|submitted)\b/i.test(text);
}

function detectErrorMessages(after?: Observation) {
  const text = after?.visibleText || '';
  return /\b(error|failed|invalid|required|try again|could not|unable|not found|empty|no results)\b/i.test(text);
}

function detectFormValidationMessages(after?: Observation) {
  const text = after?.visibleText || '';
  return /\b(required|invalid|must be|enter a valid|please fill|missing)\b/i.test(text);
}

function detectEmptyState(after?: Observation) {
  const text = after?.visibleText || '';
  return /\b(no results|nothing found|empty|no items|not found)\b/i.test(text);
}

function detectBrokenState(after?: Observation) {
  const text = after?.visibleText || '';
  return /\b(404|500|something went wrong|page not found|server error|unexpected error)\b/i.test(text);
}

function actionExpectedObservableChange(kind: string) {
  return ['click', 'search', 'select', 'check', 'uncheck', 'navigate', 'goBack'].includes(kind);
}

export class BasicValidator implements ExplorationValidator {
  async validate({ step, execution }: Parameters<ExplorationValidator['validate']>[0]): Promise<ValidationResult> {
    const before = step.beforeObservation;
    const after = step.afterObservation;
    const checks: ValidationCheck[] = [];
    const findings: Finding[] = [];

    checks.push({
      name: 'execution completed',
      passed: Boolean(execution && ['success', 'skipped'].includes(execution.status)),
      details: execution?.actualOutcome || execution?.message || 'No execution result.',
    });

    if (!execution) {
      findings.push(
        makeFinding({
          step,
          type: 'flow-failure',
          severity: 'high',
          category: 'functional',
          title: 'No execution result recorded',
          description: 'The action did not produce a structured execution result.',
        }),
      );
    } else if (execution.status === 'failed' || execution.status === 'blocked') {
      findings.push(
        makeFinding({
          step,
          type: execution.status === 'blocked' ? 'safety' : 'flow-failure',
          severity: 'high',
          category: 'functional',
          title: execution.status === 'blocked' ? 'Action blocked by safety policy' : 'Exploration action failed',
          description: execution.errors?.map((error) => error.message).join('\n') || execution.message || 'Action failed.',
          suspectedRootCause: execution.errors?.[0]?.code,
        }),
      );
    }

    const urlChanged = Boolean(after && before.url !== after.url);
    const titleChanged = Boolean(after && before.title !== after.title);
    const uiChanged = textChanged(before, after);

    checks.push({ name: 'URL change check', passed: urlChanged, details: `${before.url} -> ${after?.url || 'missing'}` });
    checks.push({
      name: 'title change check',
      passed: titleChanged,
      details: `${before.title || ''} -> ${after?.title || ''}`,
    });
    checks.push({
      name: 'visible UI change check',
      passed: uiChanged,
      details: uiChanged ? 'Visible text changed.' : 'No visible text change detected.',
    });

    if (execution?.status === 'success' && step.plan.action.kind === 'navigate' && !urlChanged) {
      findings.push(
        makeFinding({
          step,
          type: 'flow-failure',
          severity: 'high',
          category: 'functional',
          title: 'Navigation did not change URL',
          description: 'The navigate action completed but the after-observation URL did not change.',
          suspectedRootCause: 'Navigation may have been intercepted, blocked, or routed to the same page.',
        }),
      );
    }

    if (execution?.status === 'success' && actionExpectedObservableChange(step.plan.action.kind) && !urlChanged && !titleChanged && !uiChanged) {
      findings.push(
        makeFinding({
          step,
          type: 'flow-failure',
          severity: 'low',
          category: 'functional',
          title: 'Action produced no observable page change',
          description: 'The action completed, but URL, title, and visible text stayed the same.',
          suspectedRootCause: 'The target may be inert, hidden state changed outside current observation, or the action had no effect.',
        }),
      );
    }

    const newConsoleErrors = hasNewConsoleErrors(before, after);
    checks.push({
      name: 'new console errors',
      passed: newConsoleErrors.length === 0,
      details: `${newConsoleErrors.length} new console errors.`,
    });
    for (const consoleError of newConsoleErrors) {
      findings.push(
        makeFinding({
          step,
          type: 'console-error',
          severity: 'high',
          category: 'console-error',
          title: 'New console error after action',
          description: consoleError.text,
          suspectedRootCause: consoleError.location,
        }),
      );
    }

    if (after) {
      const newNetworkFindings = defaultNetworkEngine.newIssuesAfterAction(before, after, { stepId: step.id });
      checks.push({
        name: 'new network issues after action',
        passed: newNetworkFindings.length === 0,
        details: `${newNetworkFindings.length} new network/API issues introduced by the action.`,
      });
      findings.push(...newNetworkFindings);
    }

    const hasSuccessMessage = detectSuccessMessages(after);
    const hasErrorMessage = detectErrorMessages(after);
    const hasFormValidation = detectFormValidationMessages(after);
    const hasEmptyState = detectEmptyState(after);
    const hasBrokenState = detectBrokenState(after);

    checks.push({ name: 'success message check', passed: hasSuccessMessage, details: hasSuccessMessage ? 'Success-like message detected.' : 'No success-like message detected.' });
    checks.push({ name: 'new error message check', passed: !hasErrorMessage, details: hasErrorMessage ? 'Error-like text is visible.' : 'No error-like text detected.' });

    if (hasErrorMessage) {
      findings.push(
        makeFinding({
          step,
          type: hasEmptyState ? 'empty-state' : 'flow-failure',
          severity: hasBrokenState ? 'high' : hasFormValidation ? 'medium' : 'high',
          category: hasEmptyState || hasFormValidation ? 'usability' : 'functional',
          title: hasBrokenState
            ? 'Broken state visible after action'
            : hasFormValidation
              ? 'Form validation message visible after action'
              : 'Error-like message visible after action',
          description: after?.visibleTextSummary || 'The after observation contains error-like visible text.',
        }),
      );
    }

    if (after) {
      const newAccessibilityFindings = defaultAccessibilityEngine.newIssuesAfterAction(before, after, { stepId: step.id });
      checks.push({
        name: 'new accessibility issues',
        passed: newAccessibilityFindings.length === 0,
        details: `${newAccessibilityFindings.length} new accessibility issues after action.`,
      });
      findings.push(...newAccessibilityFindings);
    }

    const keyVisualActions = ['click', 'search', 'navigate', 'fill', 'select'];
    if (after && keyVisualActions.includes(step.plan.action.kind)) {
      const newVisualFindings = defaultVisualEngine.newIssuesAfterAction(before, after, { stepId: step.id });
      checks.push({
        name: 'new visual issues after action',
        passed: newVisualFindings.length === 0,
        details: `${newVisualFindings.length} new visual/responsive issues after action.`,
      });
      findings.push(...newVisualFindings);
    }

    const blockingFindings = findings.filter((finding) => ['high', 'critical'].includes(finding.severity));
    const passed = Boolean(execution && !['failed', 'blocked'].includes(execution.status)) && blockingFindings.length === 0;
    const actualOutcome = [
      execution?.actualOutcome || execution?.message,
      urlChanged ? 'URL changed.' : undefined,
      titleChanged ? 'Title changed.' : undefined,
      uiChanged ? 'Visible UI changed.' : undefined,
      hasSuccessMessage ? 'Success message detected.' : undefined,
      hasErrorMessage ? 'Error message detected.' : undefined,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      passed,
      summary: passed ? 'Action validated without high-severity issues.' : 'Action validation detected issues.',
      expectedOutcome: step.plan.expectedOutcome,
      actualOutcome,
      checks,
      findings,
    };
  }
}
