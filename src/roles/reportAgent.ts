import { accumulateFindingsByAgent, mergeAgentFindings } from '../multi-agent/findingMerge';
import { resolveAllFlowConflicts, degradedFlowFinding } from '../multi-agent/conflictResolver';
import { createAgentMessage } from '../multi-agent/protocol';
import type { Finding } from '../types';
import type {
  AgentMessage,
  AgentRoleName,
  BlackboardMemory,
  MultiAgentFocus,
  MultiAgentSessionState,
  SpecialistAgent,
} from '../multi-agent/types';

export class ReportAgent implements SpecialistAgent {
  readonly name = 'ReportAgent' as const;

  supportsFocus(_focus: MultiAgentFocus): boolean {
    return true;
  }

  analyze(): AgentMessage[] {
    return [];
  }

  finalize(
    blackboard: BlackboardMemory,
    state: MultiAgentSessionState,
    allFindings: Finding[],
    activeAgents: AgentRoleName[],
  ): { messages: AgentMessage[]; mergedFindings: Finding[]; recommendations: string[] } {
    const { merged, duplicatesSkipped, byAgent } = mergeAgentFindings(blackboard, [], allFindings);
    accumulateFindingsByAgent(state.findingsByAgent, byAgent);

    const conflicts = resolveAllFlowConflicts(blackboard, merged, activeAgents);
    state.conflicts.push(...conflicts);

    const degradedFindings: Finding[] = [];
    for (const conflict of conflicts) {
      if (conflict.finalStatus === 'degraded') {
        degradedFindings.push(degradedFlowFinding(conflict.flowKey, conflict));
      }
    }

    const finalMerged = mergeAgentFindings(blackboard, [], [...merged, ...degradedFindings]).merged;
    state.mergedFindingIds = finalMerged.map((f) => f.id);

    const recommendations = [
      `Merged ${finalMerged.length} unique findings (${duplicatesSkipped} duplicates skipped).`,
      ...conflicts.map((c) => c.resolution),
      ...Object.entries(state.findingsByAgent).map(
        ([agent, findings]) => `${agent}: ${findings.length} finding(s)`,
      ),
    ];

    if (state.escalatedCriticalIds.length) {
      recommendations.push(`Escalated ${state.escalatedCriticalIds.length} critical issue(s) for immediate review.`);
    }

    const messages: AgentMessage[] = [
      createAgentMessage({
        agentName: this.name,
        currentTask: 'Merge findings and generate final report metadata',
        observation: `Report ready with ${finalMerged.length} merged findings and ${conflicts.length} conflict(s) resolved`,
        confidence: 'high',
        recommendation: recommendations.join(' '),
        nextSuggestedAction: 'Write session markdown report with agent attribution.',
      }),
    ];

    return { messages, mergedFindings: finalMerged, recommendations };
  }
}
