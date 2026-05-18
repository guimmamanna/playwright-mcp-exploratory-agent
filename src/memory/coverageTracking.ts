import type { ExplorationCoverage, ExplorationSession, Observation } from '../types';
import { elementKeyFromInteractive } from './elementKey';

function uniqueElementKeys(observation: Observation) {
  const keys = new Set<string>();
  const elements = [
    ...observation.interactiveElements,
    ...observation.buttons,
    ...observation.inputs,
    ...observation.links,
  ];

  for (const element of elements) {
    if (element.visible === false) {
      continue;
    }
    const kind = ['input', 'textarea', 'select'].includes(element.kind) ? 'fill' : 'click';
    keys.add(elementKeyFromInteractive(element, observation.url, kind));
  }
  return keys;
}

function exploredElementKeys(session: ExplorationSession) {
  const keys = new Set<string>([...session.memory.clickedElements, ...session.memory.interactedElements]);
  for (const form of session.memory.filledForms) {
    for (const fieldKey of form.fieldKeys) {
      keys.add(fieldKey);
    }
  }
  return keys;
}

function inferExploredAreas(session: ExplorationSession) {
  const explored = new Set<string>();
  if (session.memory.filledForms.length || session.memory.submittedForms.length) {
    explored.add('forms');
  }
  if (session.memory.testedFilters.length) {
    explored.add('filters');
  }
  if (session.memory.testedNavigationPaths.length) {
    explored.add('navigation');
  }
  if (session.memory.actionHistory.some((action) => action.kind === 'search')) {
    explored.add('search');
  }
  if (session.memory.successfulFlows.length) {
    explored.add('successful-flows');
  }
  if (session.findings.some((finding) => finding.type === 'console-error')) {
    explored.add('console-errors');
  }
  if (session.findings.some((finding) => finding.type === 'network-failure')) {
    explored.add('network-failures');
  }
  return Array.from(explored);
}

export function createEmptyCoverage(): ExplorationCoverage {
  return {
    pagesVisited: 0,
    uniquePagesVisited: 0,
    interactiveElementsSeen: 0,
    interactiveElementsExplored: 0,
    explorationPercentage: 0,
    formsEncountered: 0,
    formsTested: 0,
    filtersTested: 0,
    findingsCount: 0,
    blockedFlows: 0,
    exploredAreas: [],
    unexploredAreas: [],
  };
}

export function calculateCoverage(session: ExplorationSession): ExplorationCoverage {
  const seenKeys = new Set<string>();
  for (const observation of session.memory.observations) {
    for (const key of uniqueElementKeys(observation)) {
      seenKeys.add(key);
    }
  }

  const exploredKeys = exploredElementKeys(session);
  let exploredCount = 0;
  for (const key of seenKeys) {
    if (exploredKeys.has(key)) {
      exploredCount += 1;
    }
  }

  const exploredAreas = inferExploredAreas(session);
  const unexploredAreas = session.memory.pendingAreas.filter((area) => !exploredAreas.includes(area));
  const blockedFlows = session.steps.filter((step) => step.execution?.status === 'blocked' || step.status === 'blocked').length;

  return {
    pagesVisited: session.memory.observations.length,
    uniquePagesVisited: session.memory.visitedUrls.length,
    interactiveElementsSeen: seenKeys.size,
    interactiveElementsExplored: exploredCount,
    explorationPercentage: seenKeys.size ? Math.round((exploredCount / seenKeys.size) * 100) : 0,
    formsEncountered: session.memory.formsEncountered.length,
    formsTested: session.memory.filledForms.length + session.memory.submittedForms.length,
    filtersTested: session.memory.testedFilters.length,
    findingsCount: session.findings.length,
    blockedFlows,
    exploredAreas,
    unexploredAreas,
  };
}

export function refreshCoverage(session: ExplorationSession) {
  session.memory.coverage = calculateCoverage(session);
  return session.memory.coverage;
}
