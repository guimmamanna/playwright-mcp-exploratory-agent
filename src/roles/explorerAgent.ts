import type { Finding } from '../types';
import { classifyFindingCategory, normalizeFinding } from '../reporting/severityScoring';
import { addAgentNote, setFlowStatus, updateAppMapFromObservation } from '../multi-agent/blackboard';
import { createAgentMessage } from '../multi-agent/protocol';
import type { AgentMessage, BlackboardMemory, CoordinatorContext, MultiAgentFocus, SpecialistAgent } from '../multi-agent/types';

function findingId(key: string) {
  return `explorer:${key}`.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-').slice(0, 120);
}

export class ExplorerAgent implements SpecialistAgent {
  readonly name = 'ExplorerAgent' as const;

  supportsFocus(focus: MultiAgentFocus): boolean {
    return focus === 'full';
  }

  analyze(context: CoordinatorContext, blackboard: BlackboardMemory): AgentMessage[] {
    const { observation, stepId } = context;
    updateAppMapFromObservation(blackboard, observation);

    const messages: AgentMessage[] = [];
    const flowKey = observation.url;
    const hasFunctionalRisk =
      observation.errors?.length ||
      observation.consoleMessages.some((m) => m.level === 'error') ||
      observation.links.some((l) => !l.href || l.href === '#');

    if (hasFunctionalRisk) {
      setFlowStatus(blackboard, flowKey, 'failed');
      const finding: Finding = normalizeFinding({
        id: findingId(`${observation.url}:functional-risk`),
        type: 'flow-failure',
        category: classifyFindingCategory({ type: 'flow-failure', title: 'Functional risk' }),
        severity: 'medium',
        title: 'Functional risk detected during exploration',
        description: 'Console errors, page errors, or inert navigation were observed on this route.',
        url: observation.url,
        stepId,
        evidence: observation.screenshotPath
          ? [{ label: 'Screenshot', path: observation.screenshotPath, kind: 'screenshot' }]
          : [],
        reproductionSteps: [`Open ${observation.url}`, 'Review console and interactive elements.'],
        status: 'new',
        discoveredByAgent: this.name,
      });

      messages.push(
        createAgentMessage({
          agentName: this.name,
          currentTask: 'Explore user flows and functional risks',
          observation: `Detected functional risks on ${observation.url}`,
          finding,
          confidence: 'medium',
          recommendation: 'Re-test the flow with NetworkAgent to confirm API health.',
          nextSuggestedAction: 'Attempt alternate navigation path.',
        }),
      );
    } else {
      setFlowStatus(blackboard, flowKey, 'passed');
      addAgentNote(blackboard, this.name, `Flow appears healthy on ${observation.url}`, stepId);
      messages.push(
        createAgentMessage({
          agentName: this.name,
          currentTask: 'Explore user flows and functional risks',
          observation: `No immediate functional risks on ${observation.url}`,
          confidence: 'medium',
          recommendation: 'Continue exploring pending areas.',
          nextSuggestedAction: 'Target untested forms or navigation paths.',
        }),
      );
    }

    if (observation.forms.length > 0) {
      addAgentNote(blackboard, this.name, `Forms detected (${observation.forms.length}) — prioritize validation flows`, stepId);
    }

    return messages;
  }
}
