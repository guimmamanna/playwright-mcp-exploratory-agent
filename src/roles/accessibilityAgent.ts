import { defaultAccessibilityEngine } from '../accessibility/accessibilityEngine';
import { createAgentMessage } from '../multi-agent/protocol';
import type { AgentMessage, BlackboardMemory, CoordinatorContext, MultiAgentFocus, SpecialistAgent } from '../multi-agent/types';
import { tagFindingWithAgent } from '../multi-agent/findingMerge';

export class AccessibilityAgent implements SpecialistAgent {
  readonly name = 'AccessibilityAgent' as const;

  supportsFocus(focus: MultiAgentFocus): boolean {
    return focus === 'full' || focus === 'accessibility-only';
  }

  analyze(context: CoordinatorContext, blackboard: BlackboardMemory): AgentMessage[] {
    const { observation, stepId } = context;
    const findings = defaultAccessibilityEngine
      .findingsFromObservation(observation, { stepId })
      .map((finding) => tagFindingWithAgent(finding, this.name));

    if (!findings.length) {
      return [
        createAgentMessage({
          agentName: this.name,
          currentTask: 'WCAG and keyboard accessibility audit',
          observation: `No accessibility issues on ${observation.url}`,
          confidence: 'high',
          recommendation: 'Continue keyboard navigation probes on interactive controls.',
          nextSuggestedAction: 'Test modal focus trap if dialogs appear.',
        }),
      ];
    }

    for (const issue of observation.accessibilitySignals?.issues || []) {
      const key = `${issue.id}:${issue.title}`;
      if (!blackboard.accessibilityIssues.includes(key)) {
        blackboard.accessibilityIssues.push(key);
      }
    }

    return findings.map((finding) =>
      createAgentMessage({
        agentName: this.name,
        currentTask: 'WCAG and keyboard accessibility audit',
        observation: finding.title,
        finding,
        confidence: finding.severity === 'critical' ? 'high' : 'medium',
        recommendation: finding.recommendation || 'Fix accessibility violation and re-run axe scan.',
        nextSuggestedAction: 'Verify keyboard focus order and ARIA labels.',
      }),
    );
  }
}
