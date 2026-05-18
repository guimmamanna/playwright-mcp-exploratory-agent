import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExplorationSession } from '../types';
import { refreshCoverage } from './coverageTracking';

export const defaultSessionMemoryPath = 'reports/exploratory/session-memory.json';

export async function persistSessionMemory(
  session: ExplorationSession,
  filePath = defaultSessionMemoryPath,
): Promise<string> {
  const coverage = refreshCoverage(session);
  const payload = {
    sessionId: session.id,
    goalId: session.goal.id,
    status: session.status,
    savedAt: new Date().toISOString(),
    stopReason: session.memory.stopReason,
    repeatedActionsPrevented: session.memory.repeatedActionsPrevented,
    memory: {
      visitedUrls: session.memory.visitedUrls,
      exploredPages: session.memory.exploredPages,
      clickedElements: session.memory.clickedElements,
      filledForms: session.memory.filledForms,
      submittedForms: session.memory.submittedForms,
      testedFilters: session.memory.testedFilters,
      testedNavigationPaths: session.memory.testedNavigationPaths,
      failedActions: session.memory.failedActions,
      knownBugs: session.memory.knownBugs,
      skippedRiskyActions: session.memory.skippedRiskyActions,
      pendingAreas: session.memory.pendingAreas,
      successfulFlows: session.memory.successfulFlows,
      generatedTestRefs: session.memory.generatedTestRefs,
      interactedElements: session.memory.interactedElements,
      findingIds: session.memory.findingIds,
      notes: session.memory.notes,
    },
    coverage,
    findingsCount: session.findings.length,
    generatedTestsCount: session.generatedTests.length,
  };

  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}
