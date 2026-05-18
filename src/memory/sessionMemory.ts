import type {
  ActionPlan,
  AgentAction,
  ExplorationSession,
  ExplorationStep,
  Finding,
  FormSummary,
  Observation,
  SessionMemory,
} from '../types';
import { normalizeFinding } from '../reporting/severityScoring';
import { createEmptyCoverage, refreshCoverage } from './coverageTracking';
import { elementKeyFromAction, actionSignature } from './elementKey';
import { isDuplicateAction, recordPreventedDuplicate } from './duplicateDetection';
import { detectExplorationLoop } from './loopDetection';

export { hasRepeatedObservationLoop, detectExplorationLoop, detectPageStateLoop, detectActionCycleLoop } from './loopDetection';
export { isDuplicateAction, recordPreventedDuplicate } from './duplicateDetection';
export { calculateCoverage, refreshCoverage, createEmptyCoverage } from './coverageTracking';
export { evaluateStopConditions, applyStopEvaluation } from './stopConditions';
export { persistSessionMemory, defaultSessionMemoryPath } from './memoryPersistence';
export { adaptivePriorityBoost } from './adaptivePrioritisation';
export { elementKeyFromAction, elementKeyFromInteractive, actionSignature } from './elementKey';

export function observationSignature(observation: Observation): string {
  const visibleLabels = observation.interactiveElements
    .map((element) => `${element.kind}:${element.label || element.href || element.selectorHint || 'unknown'}`)
    .slice(0, 20)
    .join('|');

  return [observation.url, observation.title || '', visibleLabels].join('::');
}

export function createSessionMemory(): SessionMemory {
  return {
    visitedUrls: [],
    exploredPages: [],
    clickedElements: [],
    filledForms: [],
    submittedForms: [],
    testedFilters: [],
    testedNavigationPaths: [],
    failedActions: [],
    knownBugs: [],
    skippedRiskyActions: [],
    pendingAreas: [],
    successfulFlows: [],
    generatedTestRefs: [],
    actionHistory: [],
    observationSignatures: [],
    observations: [],
    interactedElements: [],
    findingIds: [],
    notes: [],
    formsEncountered: [],
    elementInteractions: [],
    repeatedActionsPrevented: 0,
    coverage: createEmptyCoverage(),
  };
}

function rememberUnique(list: string[], value: string) {
  if (value && !list.includes(value)) {
    list.push(value);
  }
}

function rememberPage(session: ExplorationSession, observation: Observation) {
  if (!observation.url) {
    return;
  }

  rememberUnique(session.memory.visitedUrls, observation.url);
  const pageLabel = observation.title ? `${observation.title} (${observation.url})` : observation.url;
  rememberUnique(session.memory.exploredPages, pageLabel);
}

function inferPendingAreas(observation: Observation): string[] {
  const areas = new Set<string>();
  const visibleText = observation.visibleText || '';

  if (observation.forms.length > 0 || observation.inputs.length > 0) {
    areas.add('forms');
  }

  if (observation.links.length > 0) {
    areas.add('navigation');
  }

  if (observation.inputs.some((input) => /search/i.test(input.label || input.placeholder || input.selectorHint || ''))) {
    areas.add('search');
  }

  if (/\bsettings|preferences|account\b/i.test(visibleText)) {
    areas.add('settings');
  }

  if (observation.consoleMessages.some((message) => message.level === 'error')) {
    areas.add('console-errors');
  }

  if ((observation.failedNetworkRequests || []).length > 0) {
    areas.add('network-failures');
  }

  if (observation.buttons.some((button) => /filter|sort|category/i.test(button.label || ''))) {
    areas.add('filters');
  }

  return Array.from(areas);
}

export function updateMemoryFromObservation(session: ExplorationSession, observation: Observation) {
  const { memory } = session;

  rememberPage(session, observation);

  const signature = observationSignature(observation);
  memory.observationSignatures.push(signature);
  memory.observations.push(observation);
  memory.formsEncountered.push(...observation.forms);

  for (const area of inferPendingAreas(observation)) {
    rememberUnique(memory.pendingAreas, area);
  }

  refreshCoverage(session);
}

function recordElementInteraction(session: ExplorationSession, action: AgentAction, url: string, timestamp: string) {
  const key = elementKeyFromAction(action, url);
  const record = {
    key,
    label: action.target || action.label,
    url,
    actionKind: action.kind,
    timestamp,
  };

  session.memory.elementInteractions.push(record);
  rememberUnique(session.memory.interactedElements, key);
  rememberUnique(session.memory.interactedElements, action.target || action.selector || action.url || '');

  if (['click', 'select', 'check', 'uncheck', 'press'].includes(action.kind)) {
    rememberUnique(session.memory.clickedElements, key);
  }
}

function recordFormInteraction(session: ExplorationSession, action: AgentAction, url: string, timestamp: string) {
  if (!['fill', 'search', 'select'].includes(action.kind)) {
    return;
  }

  const fieldKey = elementKeyFromAction(action, url);
  const formKey = `${url}::form`;
  let form = session.memory.filledForms.find((candidate) => candidate.formKey === formKey);

  if (!form) {
    form = { formKey, url, fieldKeys: [], submitted: false, timestamp };
    session.memory.filledForms.push(form);
  }

  rememberUnique(form.fieldKeys, fieldKey);

  if (action.kind === 'search' || /submit|login|sign in|apply/i.test(action.target || '')) {
    form.submitted = true;
    session.memory.submittedForms.push({ ...form, submitted: true, timestamp });
  }
}

function recordFilterInteraction(session: ExplorationSession, action: AgentAction) {
  const label = (action.target || action.selector || '').toLowerCase();
  if (label && /filter|sort|category|refine|apply/i.test(label)) {
    rememberUnique(session.memory.testedFilters, label);
  }
}

function recordNavigationPath(session: ExplorationSession, action: AgentAction, fromUrl: string, timestamp: string) {
  const toUrl = action.url;
  if (!toUrl || toUrl === fromUrl) {
    return;
  }

  const path = { fromUrl, toUrl, label: action.target, timestamp };
  const exists = session.memory.testedNavigationPaths.some(
    (candidate) => candidate.fromUrl === path.fromUrl && candidate.toUrl === path.toUrl,
  );
  if (!exists) {
    session.memory.testedNavigationPaths.push(path);
  }
}

export function updateMemoryFromPlan(session: ExplorationSession, plan: ActionPlan) {
  const url = session.currentUrl || session.config.baseUrl;
  const timestamp = new Date().toISOString();

  if (isDuplicateAction(session, plan.action, { url })) {
    recordPreventedDuplicate(session);
    session.memory.notes.push(`Prevented duplicate action: ${actionSignature(plan.action)} on ${url}`);
    return;
  }

  session.memory.actionHistory.push(plan.action);
  recordElementInteraction(session, plan.action, url, timestamp);
  recordFormInteraction(session, plan.action, url, timestamp);
  recordFilterInteraction(session, plan.action);
  recordNavigationPath(session, plan.action, url, timestamp);
  refreshCoverage(session);
}

export function recordSkippedRiskyAction(
  session: ExplorationSession,
  action: AgentAction,
  reason: string,
  blockedBy?: 'persona' | 'environment' | 'config',
) {
  const url = session.currentUrl || session.config.baseUrl;
  session.memory.skippedRiskyActions.push({
    signature: actionSignature(action),
    reason,
    url,
    timestamp: new Date().toISOString(),
    blockedBy,
  });
}

export function recordFailedAction(session: ExplorationSession, action: AgentAction, reason: string) {
  const url = session.currentUrl || session.config.baseUrl;
  session.memory.failedActions.push({
    signature: actionSignature(action),
    reason,
    url,
    timestamp: new Date().toISOString(),
  });
}

export function recordSuccessfulFlow(session: ExplorationSession, stepIds: string[], summary: string) {
  session.memory.successfulFlows.push({
    stepIds,
    summary,
    timestamp: new Date().toISOString(),
  });
}

export function syncGeneratedTestRefs(session: ExplorationSession) {
  session.memory.generatedTestRefs = session.generatedTests.map((test) => test.filePath);
}

export function updateMemoryFromStep(session: ExplorationSession, step: ExplorationStep) {
  for (const finding of step.findings) {
    if (!session.memory.findingIds.includes(finding.id)) {
      session.memory.findingIds.push(finding.id);
    }
    if (finding.status !== 'dismissed' && !session.memory.knownBugs.includes(finding.id)) {
      session.memory.knownBugs.push(finding.id);
    }
  }

  if (step.execution?.status === 'failed') {
    recordFailedAction(session, step.plan.action, step.execution.message || 'Action execution failed.');
  }

  if (step.validation?.result.passed && step.execution?.status === 'success') {
    const recentValidated = session.steps
      .filter((candidate) => candidate.validation?.result.passed && candidate.execution?.status === 'success')
      .map((candidate) => candidate.id);
    if (recentValidated.length >= 2) {
      recordSuccessfulFlow(session, recentValidated, `Validated flow ending at ${step.plan.action.kind}`);
    }
  }

  const loop = detectExplorationLoop(session);
  if (loop.detected) {
    session.memory.notes.push(loop.description || 'Exploration loop detected.');
  }

  refreshCoverage(session);
}

export function mergeFindings(session: ExplorationSession, findings: Finding[]) {
  for (const finding of findings) {
    const normalizedFinding = normalizeFinding(finding);
    if (!session.findings.some((existing) => existing.id === normalizedFinding.id)) {
      session.findings.push(normalizedFinding);
    }
    rememberUnique(session.memory.knownBugs, normalizedFinding.id);
    rememberUnique(session.memory.findingIds, normalizedFinding.id);
  }

  refreshCoverage(session);
}
