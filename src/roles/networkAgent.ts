import { defaultNetworkEngine } from '../network/networkEngine';
import { createAgentMessage } from '../multi-agent/protocol';
import { addAgentNote } from '../multi-agent/blackboard';
import type { AgentMessage, BlackboardMemory, CoordinatorContext, MultiAgentFocus, SpecialistAgent } from '../multi-agent/types';
import { tagFindingWithAgent } from '../multi-agent/findingMerge';

export class NetworkAgent implements SpecialistAgent {
  readonly name = 'NetworkAgent' as const;

  supportsFocus(focus: MultiAgentFocus): boolean {
    return focus === 'full' || focus === 'network-only';
  }

  analyze(context: CoordinatorContext, blackboard: BlackboardMemory): AgentMessage[] {
    const { observation, stepId } = context;
    const findings = defaultNetworkEngine
      .findingsFromObservation(observation, { stepId })
      .map((finding) => tagFindingWithAgent(finding, this.name));

    for (const event of observation.networkEvents) {
      blackboard.networkEvents.push({
        url: event.url,
        method: event.method,
        status: event.status,
        stepId,
      });
    }

    const slowEndpoints = (observation.networkSignals?.issues || []).filter(
      (issue) => issue.issueType === 'performance-degradation',
    );
    if (slowEndpoints.length) {
      addAgentNote(
        blackboard,
        this.name,
        `Slow endpoints detected: ${slowEndpoints.map((e) => e.requestUrl).join(', ')}`,
        stepId,
      );
    }

    if (!findings.length) {
      return [
        createAgentMessage({
          agentName: this.name,
          currentTask: 'Monitor API health and performance',
          observation: `No network failures on ${observation.url}`,
          confidence: 'high',
          recommendation: 'Continue monitoring XHR/fetch during user actions.',
          nextSuggestedAction: 'Correlate next action with network timeline.',
        }),
      ];
    }

    return findings.map((finding) =>
      createAgentMessage({
        agentName: this.name,
        currentTask: 'Monitor API health and performance',
        observation: finding.description,
        finding,
        confidence: finding.severity === 'critical' || finding.severity === 'high' ? 'high' : 'medium',
        recommendation: finding.recommendation || 'Inspect API logs and retry the user action.',
        nextSuggestedAction: 'Link failing request to triggering UI action.',
      }),
    );
  }
}
