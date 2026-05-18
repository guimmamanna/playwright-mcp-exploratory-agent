import type { ExplorationSession, Finding, Observation } from '../types';
import { mergeFindings } from '../memory/sessionMemory';
import { claimTask, createBlackboard, recordObservationOnBlackboard } from './blackboard';
import { accumulateFindingsByAgent, mergeAgentFindings, tagFindingWithAgent } from './findingMerge';
import { agentsForFocus, buildTasksForAgents, runTasks } from './scheduling';
import type {
  AgentCoverageRecord,
  AgentRoleName,
  MultiAgentConfig,
  MultiAgentSessionState,
  SpecialistAgent,
} from './types';
import { ReportAgent } from '../roles/reportAgent';
import { TestGeneratorAgent } from '../roles/testGeneratorAgent';

export interface MultiAgentCoordinatorOptions {
  config: MultiAgentConfig;
  agents?: SpecialistAgent[];
}

function initCoverage(agents: SpecialistAgent[]): AgentCoverageRecord[] {
  return agents.map((agent) => ({
    agentName: agent.name,
    tasksRun: 0,
    findingsContributed: 0,
  }));
}

function bumpCoverage(state: MultiAgentSessionState, agentName: AgentRoleName, task?: string, findings = 0) {
  const record = state.agentCoverage.find((entry) => entry.agentName === agentName);
  if (!record) return;
  record.tasksRun += 1;
  record.findingsContributed += findings;
  if (task) record.lastTask = task;
}

export class MultiAgentCoordinator {
  private readonly agents: SpecialistAgent[];
  private readonly reportAgent: ReportAgent;
  private readonly testGeneratorAgent?: TestGeneratorAgent;

  constructor(private readonly options: MultiAgentCoordinatorOptions) {
    this.agents = options.agents || [];
    this.reportAgent = (this.agents.find((a) => a.name === 'ReportAgent') as ReportAgent) || new ReportAgent();
    this.testGeneratorAgent = this.agents.find((a) => a.name === 'TestGeneratorAgent') as TestGeneratorAgent | undefined;
  }

  initState(): MultiAgentSessionState {
    const activeAgents = agentsForFocus(this.options.config.focus, this.agents).map((a) => a.name);
    return {
      enabled: true,
      scheduleMode: this.options.config.scheduleMode,
      focus: this.options.config.focus,
      activeAgents,
      blackboard: createBlackboard(),
      messages: [],
      findingsByAgent: {} as MultiAgentSessionState['findingsByAgent'],
      mergedFindingIds: [],
      conflicts: [],
      agentCoverage: initCoverage(this.agents),
      escalatedCriticalIds: [],
      recommendations: [],
    };
  }

  attachToSession(session: ExplorationSession): MultiAgentSessionState {
    if (!session.multiAgentState) {
      session.multiAgentState = this.initState();
    }
    return session.multiAgentState;
  }

  private claim(blackboard: import('./types').BlackboardMemory, taskId: string) {
    return claimTask(blackboard, taskId);
  }

  async runObservationCycle(args: {
    session: ExplorationSession;
    observation: Observation;
    phase: 'before' | 'after';
    stepId?: string;
  }): Promise<Finding[]> {
    const state = this.attachToSession(args.session);
    const { blackboard } = state;
    recordObservationOnBlackboard(blackboard, args.observation);

    const activeAgents = agentsForFocus(state.focus, this.agents);
    const tasks = buildTasksForAgents(activeAgents, {
      sessionId: args.session.id,
      stepId: args.stepId,
      phase: args.phase,
      observation: args.observation,
    });

    const messages = await runTasks(
      tasks,
      activeAgents,
      blackboard,
      state.scheduleMode,
      (taskId) => this.claim(blackboard, taskId),
    );

    state.messages.push(...messages);

    for (const message of messages) {
      bumpCoverage(state, message.agentName, message.currentTask, message.finding ? 1 : 0);
    }

    const { merged, byAgent } = mergeAgentFindings(blackboard, messages, args.session.findings);
    accumulateFindingsByAgent(state.findingsByAgent, byAgent);

    const newFindings = merged.filter((f) => !args.session.findings.some((existing) => existing.id === f.id));

    if (this.options.config.escalateCritical) {
      for (const finding of newFindings) {
        if (finding.severity === 'critical' && !state.escalatedCriticalIds.includes(finding.id)) {
          state.escalatedCriticalIds.push(finding.id);
          args.session.memory.notes.push(`[CRITICAL] ${finding.title} (${finding.discoveredByAgent || 'unknown agent'})`);
        }
      }
    }

    mergeFindings(args.session, newFindings.map((f) => tagFindingWithAgent(f, f.discoveredByAgent as AgentRoleName)));
    return newFindings;
  }

  async finalize(session: ExplorationSession): Promise<Finding[]> {
    const state = this.attachToSession(session);
    const extraFindings: Finding[] = [];

    if (this.options.config.runTestGeneratorDuringSession && this.testGeneratorAgent) {
      const { messages, tests } = await this.testGeneratorAgent.finalizeFromSession(session, state.blackboard);
      state.messages.push(...messages);
      for (const test of tests) {
        if (!session.generatedTests.some((existing) => existing.id === test.id)) {
          session.generatedTests.push(test);
        }
      }
    }

    const reportResult = this.reportAgent.finalize(
      state.blackboard,
      state,
      session.findings,
      state.activeAgents,
    );
    state.messages.push(...reportResult.messages);
    state.recommendations = reportResult.recommendations;

    const reportNew = reportResult.mergedFindings.filter(
      (f) => !session.findings.some((existing) => existing.id === f.id),
    );
    mergeFindings(session, reportNew);
    extraFindings.push(...reportNew);

    return extraFindings;
  }

  stop(): void {
    // Safe stop — coordinator is stateless between sessions; no background workers.
  }
}
