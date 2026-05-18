import type { AgentRoleName, CoordinatorTask, MultiAgentFocus, MultiAgentScheduleMode, SpecialistAgent } from './types';

const ALL_AGENTS: AgentRoleName[] = [
  'ExplorerAgent',
  'AccessibilityAgent',
  'NetworkAgent',
  'VisualAgent',
  'SecuritySmokeAgent',
  'TestGeneratorAgent',
  'ReportAgent',
];

const FOCUS_AGENTS: Record<MultiAgentFocus, AgentRoleName[]> = {
  full: ALL_AGENTS.filter((name) => name !== 'ReportAgent'),
  'accessibility-only': ['AccessibilityAgent', 'ReportAgent'],
  'network-only': ['NetworkAgent', 'ReportAgent'],
  'visual-regression-only': ['VisualAgent', 'ReportAgent'],
};

export function agentsForFocus(focus: MultiAgentFocus, registry: SpecialistAgent[]): SpecialistAgent[] {
  const allowed = new Set(FOCUS_AGENTS[focus]);
  return registry.filter((agent) => allowed.has(agent.name) && agent.supportsFocus(focus));
}

export function buildTasksForAgents(
  agents: SpecialistAgent[],
  context: Omit<CoordinatorTask, 'id' | 'agentName' | 'description'>,
): CoordinatorTask[] {
  return agents
    .filter((agent) => agent.name !== 'ReportAgent')
    .map((agent) => ({
      id: `${context.sessionId}:${context.stepId || 'finalize'}:${context.phase}:${agent.name}`,
      agentName: agent.name,
      description: `Analyze ${context.phase} observation at ${context.observation.url}`,
      ...context,
    }));
}

export async function runTasks(
  tasks: CoordinatorTask[],
  agents: SpecialistAgent[],
  blackboard: import('./types').BlackboardMemory,
  mode: MultiAgentScheduleMode,
  claimTask: (taskId: string) => boolean,
): Promise<import('./types').AgentMessage[]> {
  const agentMap = new Map(agents.map((agent) => [agent.name, agent]));
  const runnable = tasks.filter((task) => claimTask(task.id));

  const runOne = async (task: CoordinatorTask) => {
    const agent = agentMap.get(task.agentName);
    if (!agent) return [];
    return agent.analyze(
      {
        sessionId: task.sessionId,
        stepId: task.stepId,
        phase: task.phase,
        observation: task.observation,
        currentUrl: task.observation.url,
      },
      blackboard,
    );
  };

  if (mode === 'parallel') {
    const batches = await Promise.all(runnable.map(runOne));
    return batches.flat();
  }

  const messages: import('./types').AgentMessage[] = [];
  for (const task of runnable) {
    messages.push(...(await runOne(task)));
  }
  return messages;
}

export { ALL_AGENTS, FOCUS_AGENTS };
