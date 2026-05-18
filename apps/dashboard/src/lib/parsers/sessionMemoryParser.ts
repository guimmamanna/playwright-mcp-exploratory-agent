import type { DashboardSession } from '../types';

export interface SessionMemoryFile {
  sessionId: string;
  goalId: string;
  status: string;
  savedAt: string;
  stopReason?: string;
  findingsCount: number;
  generatedTestsCount: number;
  memory: {
    visitedUrls: string[];
    exploredPages: string[];
    pendingAreas: string[];
    notes: string[];
    testedNavigationPaths: Array<{ fromUrl: string; toUrl: string }>;
  };
  coverage: {
    pagesVisited: number;
    uniquePagesVisited: number;
    interactiveElementsExplored: number;
    interactiveElementsSeen: number;
    explorationPercentage: number;
    formsEncountered: number;
    formsTested: number;
    exploredAreas: string[];
    unexploredAreas: string[];
    findingsCount: number;
  };
}

export function sessionFromMemoryFile(file: SessionMemoryFile, filePath: string): DashboardSession {
  return {
    id: file.sessionId,
    goalId: file.goalId,
    goalName: file.goalId,
    status: (file.status as DashboardSession['status']) || 'completed',
    startedAt: file.savedAt,
    endedAt: file.savedAt,
    findingsCount: file.findingsCount,
    generatedTestsCount: file.generatedTestsCount,
    stopReason: file.stopReason,
    memoryNotes: file.memory.notes,
    reportPath: filePath,
    currentUrl: file.memory.visitedUrls.at(-1),
    coverage: {
      pagesVisited: file.coverage.pagesVisited,
      uniquePagesVisited: file.coverage.uniquePagesVisited,
      interactiveElementsExplored: file.coverage.interactiveElementsExplored,
      interactiveElementsSeen: file.coverage.interactiveElementsSeen,
      explorationPercentage: file.coverage.explorationPercentage,
      formsTested: file.coverage.formsTested,
      formsEncountered: file.coverage.formsEncountered,
      exploredAreas: file.coverage.exploredAreas,
      unexploredAreas: file.coverage.unexploredAreas,
      visitedUrls: file.memory.visitedUrls,
      byBrowser: {},
      byPersona: {},
      byViewport: {},
    },
  };
}
