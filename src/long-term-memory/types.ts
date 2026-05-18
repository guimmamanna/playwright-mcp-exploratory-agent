import type {
  EnvironmentId,
  ExplorationPriority,
  Finding,
  GeneratedTest,
  LocatorStrategy,
  PersonaId,
} from '../types';

export type FalsePositiveStatus = 'confirmed' | 'false-positive' | 'needs-review' | 'ignored';

export type MemoryStorageKind = 'json' | 'sqlite' | 'vector';

export interface StableFlowRecord {
  flowKey: string;
  summary: string;
  route?: string;
  sessionIds: string[];
  lastSeenAt: string;
  successCount: number;
}

export interface FlakyFlowRecord {
  flowKey: string;
  summary: string;
  route?: string;
  failureCount: number;
  successCount: number;
  sessionIds: string[];
  lastFailureAt?: string;
}

export interface RecurringBugRecord {
  fingerprint: string;
  title: string;
  type: string;
  severity: string;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  routes: string[];
  sessionIds: string[];
}

export interface TestedAreaRecord {
  areaKey: string;
  route: string;
  featureArea?: string;
  timesTested: number;
  lastTestedAt: string;
}

export interface SelectorReliabilityRecord {
  selectorKey: string;
  strategy: LocatorStrategy['type'];
  value: string;
  successCount: number;
  failureCount: number;
  reliability: number;
  lastUsedAt: string;
}

export interface HealedSelectorRecord {
  originalSelector?: string;
  healedSelector: string;
  strategy: LocatorStrategy['type'];
  timesUsed: number;
  lastUsedAt: string;
}

export interface FalsePositiveRecord {
  fingerprint: string;
  title: string;
  status: FalsePositiveStatus;
  reason?: string;
  markedAt: string;
  route?: string;
}

export interface EnvironmentBehaviourRecord {
  environmentId: EnvironmentId | string;
  notes: string[];
  slowApiEndpoints: string[];
  lastUpdatedAt: string;
}

export interface PersonaBehaviourRecord {
  personaId: PersonaId | string;
  preferredFlows: string[];
  blockedPatterns: string[];
  notes: string[];
  lastUpdatedAt: string;
}

export interface RiskScoreEntry {
  key: string;
  dimension: 'route' | 'component' | 'feature-area' | 'api-endpoint' | 'persona' | 'environment';
  score: number;
  reasons: string[];
  lastUpdatedAt: string;
}

export interface LearningSignalRecord {
  id: string;
  signalType: string;
  summary: string;
  route?: string;
  sessionId: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface ExplorationGapRecord {
  area: string;
  reason: string;
  recommendedPriority: ExplorationPriority;
  lastSeenAt: string;
}

export interface PastGeneratedTestRecord {
  id: string;
  title: string;
  filePath: string;
  sessionId: string;
  flowCategory: string;
  recordedAt: string;
}

export interface SessionHistoryRecord {
  sessionId: string;
  goalId: string;
  environmentId?: string;
  personaId?: string;
  startedAt: string;
  endedAt?: string;
  findingCount: number;
  status: string;
}

export interface LongTermKnowledge {
  version: 1;
  lastUpdatedAt: string;
  stableFlows: StableFlowRecord[];
  flakyFlows: FlakyFlowRecord[];
  recurringBugs: RecurringBugRecord[];
  testedAreas: TestedAreaRecord[];
  highRiskPages: RiskScoreEntry[];
  reliableSelectors: SelectorReliabilityRecord[];
  healedSelectors: HealedSelectorRecord[];
  falsePositives: FalsePositiveRecord[];
  environmentBehaviours: Record<string, EnvironmentBehaviourRecord>;
  personaBehaviours: Record<string, PersonaBehaviourRecord>;
  pastGeneratedTests: PastGeneratedTestRecord[];
  riskScores: RiskScoreEntry[];
  learningSignals: LearningSignalRecord[];
  explorationGaps: ExplorationGapRecord[];
  sessionHistory: SessionHistoryRecord[];
}

export interface SessionLearningContext {
  retrievedAt: string;
  knownRisks: Array<{ area: string; route?: string; score: number; reason: string }>;
  previousBugs: RecurringBugRecord[];
  flakyFlows: FlakyFlowRecord[];
  stableSelectors: SelectorReliabilityRecord[];
  healedSelectors: HealedSelectorRecord[];
  recommendedPriorities: ExplorationPriority[];
  explorationGaps: ExplorationGapRecord[];
  suppressedFindingFingerprints: string[];
  falsePositiveCount: number;
  historicalSessionCount: number;
}

export interface MemoryUpdateSummary {
  sessionId: string;
  updatedAt: string;
  newFindings: number;
  recurringFindings: number;
  regressionCandidates: string[];
  newlyDiscoveredIssues: string[];
  improvementsSinceLastRun: string[];
  memoryUpdates: string[];
  riskScoreUpdates: number;
  selectorUpdates: number;
  falsePositivesRecorded: number;
}

export interface HistoricalComparison {
  previousFindingCount: number;
  currentFindingCount: number;
  newIssues: string[];
  repeatedIssues: string[];
  resolvedCandidates: string[];
}

export interface MemoryStorageAdapter {
  kind: MemoryStorageKind;
  load(): Promise<LongTermKnowledge>;
  save(knowledge: LongTermKnowledge): Promise<void>;
}
