export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'new' | 'known' | 'needs-triage' | 'dismissed' | 'confirmed' | 'false-positive' | 'needs-review' | 'ignored';

export interface DashboardFinding {
  id: string;
  sessionId: string;
  title: string;
  severity: FindingSeverity;
  category: string;
  type: string;
  url?: string;
  description?: string;
  status: FindingStatus;
  environment?: string;
  persona?: string;
  bugReportPath?: string;
  reproductionSteps?: string[];
}

export interface DashboardSession {
  id: string;
  goalId: string;
  goalName?: string;
  status: 'created' | 'running' | 'completed' | 'stopped' | 'failed';
  startedAt: string;
  endedAt?: string;
  environment?: string;
  persona?: string;
  browser?: string;
  viewport?: string;
  baseUrl?: string;
  currentUrl?: string;
  currentAction?: string;
  findingsCount: number;
  generatedTestsCount: number;
  reportPath?: string;
  coverage?: DashboardCoverage;
  steps?: DashboardStep[];
  findings?: DashboardFinding[];
  generatedTests?: DashboardGeneratedTest[];
  memoryNotes?: string[];
  stopReason?: string;
  memoryUpdateSummary?: {
    memoryUpdates: string[];
    regressionCandidates: string[];
    newlyDiscoveredIssues: string[];
    improvementsSinceLastRun: string[];
  };
}

export interface DashboardStep {
  id: string;
  index: number;
  actionKind: string;
  rationale: string;
  status: string;
  summary?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  reasoningSummary?: string;
}

export interface DashboardGeneratedTest {
  id: string;
  sessionId: string;
  title: string;
  filePath: string;
  confidence: 'low' | 'medium' | 'high';
  status: 'draft' | 'passed' | 'failed' | 'blocked' | 'not-run';
  flowCategory: string;
}

export interface DashboardBugReport {
  id: string;
  sessionId?: string;
  title: string;
  severity: FindingSeverity;
  category: string;
  environment?: string;
  url?: string;
  summary: string;
  reproductionSteps: string[];
  expectedResult?: string;
  actualResult?: string;
  markdown: string;
  filePath: string;
}

export interface DashboardCoverage {
  pagesVisited: number;
  uniquePagesVisited: number;
  interactiveElementsExplored: number;
  interactiveElementsSeen: number;
  explorationPercentage: number;
  formsTested: number;
  formsEncountered: number;
  exploredAreas: string[];
  unexploredAreas: string[];
  visitedUrls: string[];
  byBrowser: Record<string, number>;
  byPersona: Record<string, number>;
  byViewport: Record<string, number>;
}

export interface DashboardWorker {
  workerId: string;
  sessionId: string;
  status: string;
  persona?: string;
  browser?: string;
  viewport?: string;
  currentUrl?: string;
  currentAction?: string;
  elapsedMs: number;
  findingsCount: number;
  screenshotPath?: string;
  logs: string[];
}

export interface OverviewStats {
  totalSessions: number;
  totalFindings: number;
  findingsBySeverity: Record<FindingSeverity, number>;
  generatedTestsPassed: number;
  generatedTestsFailed: number;
  coverageByBrowser: Array<{ name: string; value: number }>;
  coverageByPersona: Array<{ name: string; value: number }>;
  recentHighRiskAreas: Array<{ area: string; score: number; sessions: number }>;
  activeSessions: number;
}

export interface ExplorationStartConfig {
  baseUrl: string;
  environmentId: string;
  personaId: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  viewport: 'mobile' | 'tablet' | 'desktop';
  maxSteps: number;
  maxDurationMinutes: number;
  forbiddenActions: string[];
  accessibilityAuditEnabled: boolean;
  visualIntelligenceEnabled: boolean;
  networkIntelligenceEnabled: boolean;
  generateTests: boolean;
  reasoningEnabled?: boolean;
  recoveryEnabled?: boolean;
  learningEnabled?: boolean;
}

export interface DashboardSettings {
  reportsDirectory: string;
  evidenceDirectory: string;
  defaultBaseUrl: string;
  defaultEnvironment: string;
  defaultPersona: string;
}
