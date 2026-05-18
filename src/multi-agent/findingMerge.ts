import type { Finding } from '../types';
import type { AgentMessage, AgentRoleName, BlackboardMemory } from './types';
import { addFindingToBlackboard } from './blackboard';

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pathnameOf(url?: string) {
  if (!url) return 'unknown';
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

export function findingFingerprint(finding: Finding) {
  return `${finding.type}::${normalizeTitle(finding.title)}::${pathnameOf(finding.url)}`;
}

export function tagFindingWithAgent(finding: Finding, agentName: AgentRoleName): Finding {
  return {
    ...finding,
    discoveredByAgent: finding.discoveredByAgent || agentName,
  };
}

export function mergeAgentFindings(
  blackboard: BlackboardMemory,
  messages: AgentMessage[],
  existingFindings: Finding[],
): { merged: Finding[]; duplicatesSkipped: number; byAgent: Record<AgentRoleName, Finding[]> } {
  const registry = new Map<string, Finding>();
  for (const finding of existingFindings) {
    registry.set(findingFingerprint(finding), finding);
  }

  const byAgent = {} as Record<AgentRoleName, Finding[]>;
  let duplicatesSkipped = 0;

  for (const message of messages) {
    if (!message.finding) continue;
    const tagged = tagFindingWithAgent(message.finding, message.agentName);
    if (!byAgent[message.agentName]) {
      byAgent[message.agentName] = [];
    }

    const fingerprint = findingFingerprint(tagged);
    if (registry.has(fingerprint)) {
      duplicatesSkipped += 1;
      const existing = registry.get(fingerprint)!;
      if (!existing.discoveredByAgent && tagged.discoveredByAgent) {
        registry.set(fingerprint, { ...existing, discoveredByAgent: tagged.discoveredByAgent });
      }
      continue;
    }

    registry.set(fingerprint, tagged);
    byAgent[message.agentName].push(tagged);
    addFindingToBlackboard(blackboard, tagged);
  }

  return {
    merged: Array.from(registry.values()),
    duplicatesSkipped,
    byAgent,
  };
}

export function accumulateFindingsByAgent(
  target: Record<AgentRoleName, Finding[]>,
  incoming: Record<AgentRoleName, Finding[]>,
) {
  for (const [agent, findings] of Object.entries(incoming) as Array<[AgentRoleName, Finding[]]>) {
    if (!target[agent]) target[agent] = [];
    for (const finding of findings) {
      if (!target[agent].some((existing) => existing.id === finding.id)) {
        target[agent].push(finding);
      }
    }
  }
}
