import { defaultAccessibilityEngine } from '../accessibility/accessibilityEngine';
import { defaultNetworkEngine } from '../network/networkEngine';
import { defaultVisualEngine } from '../visual/visualEngine';
import { featureFlagFindings, localeFindings } from '../environment/contextFindings';
import { visionSignalsToFindings } from '../vision/findingFactory';
import type { Finding, HeuristicEngine, Observation, SessionMemory } from '../types';
import { hasRepeatedObservationLoop } from '../memory/sessionMemory';
import { classifyFindingCategory, normalizeFinding } from '../reporting/severityScoring';

function findingId(type: string, key: string) {
  return `${type}:${key}`.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-').slice(0, 120);
}

function makeFinding(args: Omit<Finding, 'id' | 'category' | 'evidence' | 'reproductionSteps' | 'status'> & {
  category?: Finding['category'];
  key: string;
  evidencePath?: string;
  reproductionSteps?: string[];
}): Finding {
  return normalizeFinding({
    id: findingId(args.type, args.key),
    type: args.type,
    category: args.category || classifyFindingCategory(args),
    severity: args.severity,
    title: args.title,
    description: args.description,
    url: args.url,
    stepId: args.stepId,
    suspectedRootCause: args.suspectedRootCause,
    evidence: args.evidencePath
      ? [{ label: 'Evidence', path: args.evidencePath, kind: args.evidencePath.endsWith('.png') ? 'screenshot' : 'other' }]
      : [],
    reproductionSteps: args.reproductionSteps || [],
    status: 'new',
  });
}

function brokenLinkFindings(observation: Observation): Finding[] {
  const brokenHrefLinks = observation.links.filter((link) => {
    const href = link.href || '';
    return href === '#' || href.startsWith('javascript:') || href.startsWith('about:blank');
  });

  return brokenHrefLinks.slice(0, 10).map((link) =>
    makeFinding({
      key: link.href || link.label || 'missing-href',
      type: 'broken-link',
      severity: 'low',
      category: 'functional',
      title: 'Potentially broken or inert link',
      description: `Link "${link.label || link.href || 'unknown'}" has a non-navigable href.`,
      url: observation.url,
      reproductionSteps: [`Open ${observation.url}`, `Inspect link "${link.label || link.href || 'unknown'}".`],
      suspectedRootCause: 'Placeholder href or JavaScript-only navigation without a stable fallback.',
    }),
  );
}

function consoleErrorFindings(observation: Observation): Finding[] {
  return observation.consoleMessages
    .filter((message) => message.level === 'error')
    .map((message) =>
      makeFinding({
        key: message.text,
        type: 'console-error',
        severity: 'high',
        category: 'console-error',
        title: 'Console error detected',
        description: message.text,
        url: observation.url,
        reproductionSteps: [`Open ${observation.url}`, 'Check browser console output.'],
        suspectedRootCause: message.location,
      }),
    );
}

function networkFindings(observation: Observation): Finding[] {
  return defaultNetworkEngine.findingsFromObservation(observation, { stepId: observation.stepId });
}

function accessibilityFindings(observation: Observation): Finding[] {
  return defaultAccessibilityEngine.findingsFromObservation(observation, { stepId: observation.stepId });
}

function emptyStateFindings(observation: Observation): Finding[] {
  const text = observation.visibleText || '';
  if (!/\b(no results|nothing found|empty|no items|not found)\b/i.test(text)) {
    return [];
  }

  return [
    makeFinding({
      key: observation.url,
      type: 'empty-state',
      severity: 'low',
      category: 'usability',
      title: 'Empty state detected',
      description: 'The page appears to show an empty or no-results state. Validate that recovery guidance exists.',
      url: observation.url,
      reproductionSteps: [`Open ${observation.url}`, 'Review the empty-state content and recovery actions.'],
    }),
  ];
}

function navigationDeadEndFindings(observation: Observation): Finding[] {
  const actionableCount = observation.interactiveElements.filter((element) => element.visible !== false).length;
  if (actionableCount > 0 || observation.forms.length > 0) {
    return [];
  }

  return [
    makeFinding({
      key: observation.url,
      type: 'navigation-dead-end',
      severity: 'high',
      category: 'functional',
      title: 'Navigation dead end detected',
      description: 'No visible actionable elements or forms were observed on the page.',
      url: observation.url,
      reproductionSteps: [`Open ${observation.url}`, 'Try to continue the user journey.'],
      suspectedRootCause: 'Missing navigation affordance, hidden content, or broken render state.',
    }),
  ];
}

function visualFindings(observation: Observation): Finding[] {
  return defaultVisualEngine.findingsFromObservation(observation, { stepId: observation.stepId });
}

function multimodalVisionFindings(observation: Observation): Finding[] {
  if (!observation.visionSignals) return [];
  return visionSignalsToFindings(observation.visionSignals, observation, { stepId: observation.stepId });
}

function repeatedLoopFinding(observation: Observation, memory: SessionMemory): Finding | undefined {
  const recent = memory.observationSignatures.at(-1);
  if (!recent) {
    return undefined;
  }

  const count = memory.observationSignatures.filter((signature) => signature === recent).length;
  if (count < 3) {
    return undefined;
  }

  return makeFinding({
    key: recent,
    type: 'loop-detected',
    severity: 'high',
    category: 'functional',
    title: 'Repeated exploration loop detected',
    description: `The same page/actionable state has been observed ${count} times.`,
    url: observation.url,
    reproductionSteps: [`Open ${observation.url}`, 'Repeat the last planned actions.'],
    suspectedRootCause: 'Planner or flow may be returning to the same state without progress.',
  });
}

export class BasicHeuristicEngine implements HeuristicEngine {
  evaluate({ session, observation }: Parameters<HeuristicEngine['evaluate']>[0]): Finding[] {
    const findings = [
      ...consoleErrorFindings(observation),
      ...networkFindings(observation),
      ...brokenLinkFindings(observation),
      ...accessibilityFindings(observation),
      ...emptyStateFindings(observation),
      ...navigationDeadEndFindings(observation),
      ...visualFindings(observation),
      ...multimodalVisionFindings(observation),
      ...featureFlagFindings(session, observation),
      ...localeFindings(observation),
    ];

    if (hasRepeatedObservationLoop(session)) {
      const loopFinding = repeatedLoopFinding(observation, session.memory);
      if (loopFinding) {
        findings.push(loopFinding);
      }
    }

    return findings;
  }
}
