import { defaultVisualEngine } from '../visual/visualEngine';
import { createAgentMessage } from '../multi-agent/protocol';
import type { AgentMessage, BlackboardMemory, CoordinatorContext, MultiAgentFocus, SpecialistAgent } from '../multi-agent/types';
import { tagFindingWithAgent } from '../multi-agent/findingMerge';

export class VisualAgent implements SpecialistAgent {
  readonly name = 'VisualAgent' as const;

  supportsFocus(focus: MultiAgentFocus): boolean {
    return focus === 'full' || focus === 'visual-regression-only';
  }

  analyze(context: CoordinatorContext, blackboard: BlackboardMemory): AgentMessage[] {
    const { observation, stepId } = context;
    const findings = defaultVisualEngine
      .findingsFromObservation(observation, { stepId })
      .map((finding) => tagFindingWithAgent(finding, this.name));

    if (observation.screenshotPath && !blackboard.screenshots.includes(observation.screenshotPath)) {
      blackboard.screenshots.push(observation.screenshotPath);
    }

    if (!findings.length) {
      return [
        createAgentMessage({
          agentName: this.name,
          currentTask: 'Visual layout and regression checks',
          observation: `No visual issues on ${observation.url}`,
          confidence: 'medium',
          recommendation: 'Capture baseline screenshots for regression comparison.',
          nextSuggestedAction: 'Test responsive breakpoints if enabled.',
        }),
      ];
    }

    return findings.map((finding) =>
      createAgentMessage({
        agentName: this.name,
        currentTask: 'Visual layout and regression checks',
        observation: finding.title,
        finding,
        confidence: finding.visualDiffRatio && finding.visualDiffRatio > 0.1 ? 'high' : 'medium',
        recommendation: finding.recommendation || 'Review layout at affected viewport.',
        nextSuggestedAction: 'Compare screenshot against baseline.',
      }),
    );
  }
}
