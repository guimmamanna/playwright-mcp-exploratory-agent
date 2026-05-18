import type { Finding, GeneratedTest, Observation } from '../types';
import type { AgentNote, AgentRoleName, BlackboardMemory, FlowHealthStatus } from './types';

export function createBlackboard(): BlackboardMemory {
  return {
    appMap: [],
    visitedRoutes: [],
    findings: [],
    screenshots: [],
    networkEvents: [],
    accessibilityIssues: [],
    generatedTests: [],
    riskScores: {},
    agentNotes: [],
    claimedTasks: [],
    flowStatuses: {},
  };
}

function routeFromUrl(url: string) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

export function updateAppMapFromObservation(blackboard: BlackboardMemory, observation: Observation) {
  const route = routeFromUrl(observation.url);
  if (!blackboard.visitedRoutes.includes(route)) {
    blackboard.visitedRoutes.push(route);
  }

  const existing = blackboard.appMap.find((entry) => entry.route === route);
  const interactiveCount = observation.interactiveElements.length;
  const riskScore = Math.min(
    100,
    (observation.consoleMessages.filter((m) => m.level === 'error').length * 15) +
      ((observation.failedNetworkRequests || []).length * 20) +
      ((observation.accessibilitySignals?.issueCount || 0) * 10),
  );

  if (existing) {
    existing.interactiveCount = Math.max(existing.interactiveCount, interactiveCount);
    existing.lastVisitedAt = observation.timestamp;
    existing.title = observation.title || existing.title;
    existing.riskScore = Math.max(existing.riskScore, riskScore);
  } else {
    blackboard.appMap.push({
      route,
      title: observation.title,
      interactiveCount,
      lastVisitedAt: observation.timestamp,
      riskScore,
    });
  }

  blackboard.riskScores[route] = riskScore;
}

export function recordObservationOnBlackboard(blackboard: BlackboardMemory, observation: Observation) {
  updateAppMapFromObservation(blackboard, observation);

  if (observation.screenshotPath && !blackboard.screenshots.includes(observation.screenshotPath)) {
    blackboard.screenshots.push(observation.screenshotPath);
  }

  for (const event of observation.networkEvents) {
    blackboard.networkEvents.push({
      url: event.url,
      method: event.method,
      status: event.status,
      stepId: observation.stepId,
    });
  }

  for (const issue of observation.accessibilitySignals?.issues || []) {
    const key = `${issue.id}:${issue.title}`;
    if (!blackboard.accessibilityIssues.includes(key)) {
      blackboard.accessibilityIssues.push(key);
    }
  }
}

export function claimTask(blackboard: BlackboardMemory, taskId: string): boolean {
  if (blackboard.claimedTasks.includes(taskId)) {
    return false;
  }
  blackboard.claimedTasks.push(taskId);
  return true;
}

export function addAgentNote(
  blackboard: BlackboardMemory,
  agentName: AgentRoleName,
  note: string,
  stepId?: string,
) {
  blackboard.agentNotes.push({
    agentName,
    note,
    timestamp: new Date().toISOString(),
    stepId,
  });
}

export function addFindingToBlackboard(blackboard: BlackboardMemory, finding: Finding) {
  if (!blackboard.findings.some((existing) => existing.id === finding.id)) {
    blackboard.findings.push(finding);
  }
}

export function setFlowStatus(blackboard: BlackboardMemory, flowKey: string, status: FlowHealthStatus) {
  blackboard.flowStatuses[flowKey] = status;
}

export function getFlowStatus(blackboard: BlackboardMemory, flowKey: string): FlowHealthStatus {
  return blackboard.flowStatuses[flowKey] || 'unknown';
}

export function recordGeneratedTestOnBlackboard(blackboard: BlackboardMemory, test: GeneratedTest) {
  if (!blackboard.generatedTests.some((existing) => existing.id === test.id)) {
    blackboard.generatedTests.push(test);
  }
}
