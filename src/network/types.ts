import type { AgentAction, ApiIssueClassification, FindingSeverity } from '../types';

export type { ApiIssueClassification };

export interface TrackedNetworkRequest {
  id: string;
  url: string;
  method: string;
  status?: number;
  resourceType?: string;
  responseTimeMs?: number;
  requestPayloadSummary?: string;
  responseBodySummary?: string;
  headersSummary?: string;
  failureText?: string;
  triggeringAction?: string;
  pageUrl?: string;
  stepId?: string;
  timestamp: string;
  issueClassification?: ApiIssueClassification;
  redirectUrl?: string;
  isSlow?: boolean;
  slowSeverity?: FindingSeverity;
}

export interface NetworkIssue {
  id: string;
  issueType: ApiIssueClassification;
  severity: FindingSeverity;
  title: string;
  description: string;
  request: TrackedNetworkRequest;
  suspectedRootCause?: string;
  recommendation: string;
}

export interface NetworkSignals {
  totalRequests: number;
  failedCount: number;
  slowCount: number;
  statusCodeSummary: Record<string, number>;
  issues: NetworkIssue[];
  pollingLoops: string[];
  summary: string;
}

export interface NetworkActionContext {
  stepId?: string;
  action?: AgentAction;
  pageUrl?: string;
}

export interface NetworkThresholds {
  warnMs: number;
  highMs: number;
  criticalMs: number;
}
