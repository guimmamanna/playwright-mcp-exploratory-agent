import type { ExplorationConfig, Finding, Observation } from '../types';
import { detectPollingLoops } from './pollingDetector';
import { issuesFromRequests } from './severityRules';
import { issuesToFindings } from './findingFactory';
import type { NetworkIssueRecord } from '../types';
import type { NetworkIssue, NetworkSignals, TrackedNetworkRequest } from './types';
import { defaultNetworkThresholds } from './performanceThresholds';

function statusSummary(requests: TrackedNetworkRequest[]) {
  const summary: Record<string, number> = {};
  for (const request of requests) {
    const key = request.failureText ? 'failed' : String(request.status || 'unknown');
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

function buildPollingIssues(loops: string[], requests: TrackedNetworkRequest[]): NetworkIssue[] {
  return loops.map((loopKey) => {
    const sample = requests.find((request) => `${request.method}:${request.url.split('?')[0]}` === loopKey);
    const request: TrackedNetworkRequest = sample || {
      id: `polling-${loopKey}`,
      url: loopKey.split(':').slice(1).join(':'),
      method: loopKey.split(':')[0] || 'GET',
      timestamp: new Date().toISOString(),
    };

    return {
      id: `network:polling-loop:${loopKey}`,
      issueType: 'polling-loop' as const,
      severity: 'medium' as const,
      title: 'Repeated polling loop detected',
      description: `Repeated requests detected for ${loopKey}.`,
      request,
      suspectedRootCause: 'Client polling interval may be too aggressive.',
      recommendation: 'Reduce polling frequency or use push updates.',
    };
  });
}

export class NetworkEngine {
  analyzeRequests(requests: TrackedNetworkRequest[]): { issues: NetworkIssue[]; signals: NetworkSignals } {
    const pollingLoops = detectPollingLoops(requests);
    const issues = [...issuesFromRequests(requests), ...buildPollingIssues(pollingLoops, requests)];
    const failedCount = requests.filter((request) => request.failureText || (request.status && request.status >= 400)).length;
    const slowCount = requests.filter((request) => request.isSlow).length;

    const signals: NetworkSignals = {
      totalRequests: requests.length,
      failedCount,
      slowCount,
      statusCodeSummary: statusSummary(requests),
      issues,
      pollingLoops,
      summary: `requests=${requests.length}; failed=${failedCount}; slow=${slowCount}; issues=${issues.length}`,
    };

    return { issues, signals };
  }

  buildSignals(requests: TrackedNetworkRequest[]): NetworkSignals {
    return this.analyzeRequests(requests).signals;
  }

  findingsFromObservation(observation: Observation, options: { stepId?: string } = {}): Finding[] {
    const issues = (observation.networkSignals?.issues || []).map((issue) => this.issueFromRecord(issue));
    return issuesToFindings(issues, observation, options);
  }

  private issueFromRecord(record: NetworkIssueRecord): NetworkIssue {
    return {
      id: record.id,
      issueType: record.issueType,
      severity: record.severity,
      title: record.title,
      description: record.description,
      suspectedRootCause: record.suspectedRootCause,
      recommendation: record.recommendation,
      request: {
        id: record.id,
        url: record.requestUrl,
        method: record.requestMethod,
        status: record.status,
        responseTimeMs: record.responseTimeMs,
        triggeringAction: record.triggeringAction,
        timestamp: new Date().toISOString(),
      },
    };
  }

  newIssuesAfterAction(before: Observation, after: Observation, options: { stepId?: string } = {}): Finding[] {
    const beforeIds = new Set((before.networkSignals?.issues || []).map((issue) => issue.id));
    const introduced = (after.networkSignals?.issues || [])
      .filter((issue) => !beforeIds.has(issue.id))
      .map((issue) => this.issueFromRecord(issue));
    return issuesToFindings(introduced, after, options);
  }

  thresholdsForConfig(config: ExplorationConfig) {
    return {
      warnMs: config.networkSlowWarnMs ?? defaultNetworkThresholds.warnMs,
      highMs: config.networkSlowHighMs ?? defaultNetworkThresholds.highMs,
      criticalMs: config.networkSlowCriticalMs ?? defaultNetworkThresholds.criticalMs,
    };
  }
}

export const defaultNetworkEngine = new NetworkEngine();
