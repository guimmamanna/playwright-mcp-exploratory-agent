import type {
  AgentRoleName,
  Finding,
  GeneratedTest,
  MultiAgentFocus,
  MultiAgentScheduleMode,
  Observation,
} from '../types';

export type { AgentRoleName, MultiAgentFocus, MultiAgentScheduleMode };

export type FlowHealthStatus = 'passed' | 'degraded' | 'failed' | 'unknown';

export interface AgentMessage {
  agentName: AgentRoleName;
  currentTask: string;
  observation: string;
  finding?: Finding;
  confidence: 'low' | 'medium' | 'high';
  recommendation: string;
  nextSuggestedAction: string;
}

export interface AppMapEntry {
  route: string;
  title?: string;
  interactiveCount: number;
  lastVisitedAt: string;
  riskScore: number;
}

export interface AgentNote {
  agentName: AgentRoleName;
  note: string;
  timestamp: string;
  stepId?: string;
}

export interface BlackboardMemory {
  appMap: AppMapEntry[];
  visitedRoutes: string[];
  findings: Finding[];
  screenshots: string[];
  networkEvents: Array<{ url: string; method: string; status?: number; stepId?: string }>;
  accessibilityIssues: string[];
  generatedTests: GeneratedTest[];
  riskScores: Record<string, number>;
  agentNotes: AgentNote[];
  claimedTasks: string[];
  flowStatuses: Record<string, FlowHealthStatus>;
}

export interface ResolvedConflict {
  id: string;
  flowKey: string;
  agents: AgentRoleName[];
  resolution: string;
  finalStatus: FlowHealthStatus;
  timestamp: string;
}

export interface AgentCoverageRecord {
  agentName: AgentRoleName;
  tasksRun: number;
  findingsContributed: number;
  lastTask?: string;
}

export interface MultiAgentSessionState {
  enabled: boolean;
  scheduleMode: MultiAgentScheduleMode;
  focus: MultiAgentFocus;
  activeAgents: AgentRoleName[];
  blackboard: BlackboardMemory;
  messages: AgentMessage[];
  findingsByAgent: Record<AgentRoleName, Finding[]>;
  mergedFindingIds: string[];
  conflicts: ResolvedConflict[];
  agentCoverage: AgentCoverageRecord[];
  escalatedCriticalIds: string[];
  recommendations: string[];
}

export interface MultiAgentConfig {
  enabled: boolean;
  scheduleMode: MultiAgentScheduleMode;
  focus: MultiAgentFocus;
  escalateCritical: boolean;
  runTestGeneratorDuringSession: boolean;
}

export interface CoordinatorTask {
  id: string;
  agentName: AgentRoleName;
  description: string;
  observation: Observation;
  sessionId: string;
  stepId?: string;
  phase: 'before' | 'after';
}

export interface CoordinatorContext {
  sessionId: string;
  stepId?: string;
  phase: 'before' | 'after';
  observation: Observation;
  currentUrl: string;
}

export interface SpecialistAgent {
  readonly name: AgentRoleName;
  supportsFocus(focus: MultiAgentFocus): boolean;
  analyze(context: CoordinatorContext, blackboard: BlackboardMemory): AgentMessage[] | Promise<AgentMessage[]>;
  finalize?(blackboard: BlackboardMemory): AgentMessage[] | Promise<AgentMessage[]>;
}
