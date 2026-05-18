import type { Finding } from '../types';
import type { AgentRoleName, BlackboardMemory, FlowHealthStatus, ResolvedConflict } from './types';
import { getFlowStatus, setFlowStatus } from './blackboard';

export interface FlowAssessment {
  flowKey: string;
  explorerPassed: boolean;
  networkFailed: boolean;
  hasCriticalFinding: boolean;
}

function flowKeyFromFinding(finding: Finding) {
  const url = finding.url || 'unknown';
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function assessFlowFromFindings(findings: Finding[], flowKey: string): FlowAssessment {
  const scoped = findings.filter((f) => flowKeyFromFinding(f) === flowKey || f.url?.includes(flowKey));
  const explorerPassed = !scoped.some(
    (f) => f.type === 'flow-failure' || f.title.toLowerCase().includes('flow failed'),
  );
  const networkFailed = scoped.some(
    (f) =>
      f.type === 'network-failure' ||
      f.category === 'network-error' ||
      (f.correlatedRequestUrl && (f.severity === 'high' || f.severity === 'critical')),
  );
  const hasCriticalFinding = scoped.some((f) => f.severity === 'critical');
  return { flowKey, explorerPassed, networkFailed, hasCriticalFinding };
}

export function resolveFlowConflict(
  blackboard: BlackboardMemory,
  assessment: FlowAssessment,
  agents: AgentRoleName[],
): ResolvedConflict | undefined {
  const { flowKey, explorerPassed, networkFailed } = assessment;

  if (explorerPassed && !networkFailed) {
    setFlowStatus(blackboard, flowKey, 'passed');
    return undefined;
  }

  if (explorerPassed && networkFailed) {
    setFlowStatus(blackboard, flowKey, 'degraded');
    return {
      id: `conflict:${flowKey}:${Date.now()}`,
      flowKey,
      agents,
      resolution:
        'ExplorerAgent reported flow as passed but NetworkAgent detected hidden API failures. Flow marked as degraded.',
      finalStatus: 'degraded',
      timestamp: new Date().toISOString(),
    };
  }

  if (!explorerPassed || assessment.hasCriticalFinding) {
    setFlowStatus(blackboard, flowKey, 'failed');
    if (networkFailed || !explorerPassed) {
      return {
        id: `conflict:${flowKey}:${Date.now()}`,
        flowKey,
        agents,
        resolution: assessment.hasCriticalFinding
          ? 'Critical finding escalated — flow marked as failed.'
          : 'Functional or network failures detected — flow marked as failed.',
        finalStatus: 'failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  return undefined;
}

export function resolveAllFlowConflicts(
  blackboard: BlackboardMemory,
  findings: Finding[],
  activeAgents: AgentRoleName[],
): ResolvedConflict[] {
  const flowKeys = new Set<string>([
    ...Object.keys(blackboard.flowStatuses),
    ...findings.map(flowKeyFromFinding),
  ]);

  const resolved: ResolvedConflict[] = [];
  for (const flowKey of flowKeys) {
    const assessment = assessFlowFromFindings(findings, flowKey);
    const conflict = resolveFlowConflict(blackboard, assessment, activeAgents);
    if (conflict) {
      resolved.push(conflict);
    } else if (getFlowStatus(blackboard, flowKey) === 'unknown' && assessment.explorerPassed && !assessment.networkFailed) {
      setFlowStatus(blackboard, flowKey, 'passed');
    }
  }
  return resolved;
}

export function degradedFlowFinding(flowKey: string, conflict: ResolvedConflict): Finding {
  return {
    id: `flow-degraded:${flowKey}`,
    type: 'flow-failure',
    severity: 'high',
    category: 'functional',
    title: `Flow degraded on ${flowKey}`,
    description: conflict.resolution,
    url: flowKey,
    evidence: [],
    reproductionSteps: [`Navigate to ${flowKey}`, 'Complete the user flow', 'Inspect network responses for hidden failures.'],
    status: 'needs-triage',
    discoveredByAgent: 'NetworkAgent',
  };
}
