import type { FindingSeverity } from '../types';
import type { ApiIssueClassification, NetworkIssue, TrackedNetworkRequest } from './types';
import { classifyNetworkRequest, isCoreFlowRequest, isCriticalFlowRequest, isLowPriorityRequest } from './classifier';
import { slowSeverityForResponseTime } from './performanceThresholds';

export function scoreNetworkIssueSeverity(
  request: TrackedNetworkRequest,
  classification: ApiIssueClassification,
): FindingSeverity {
  const url = request.url;

  if (classification === 'polling-loop') {
    return 'medium';
  }

  if (request.isSlow && request.slowSeverity) {
    if (isCriticalFlowRequest(url)) {
      return request.slowSeverity === 'medium' ? 'high' : request.slowSeverity;
    }
    return request.slowSeverity;
  }

  if (isLowPriorityRequest(url) && classification !== 'server-error') {
    return 'low';
  }

  if (
    isCriticalFlowRequest(url) &&
    ['server-error', 'auth-session-issue', 'timeout', 'blocked-request', 'cors-issue', 'malformed-response', 'graphql-error'].includes(
      classification,
    )
  ) {
    return 'critical';
  }

  if (classification === 'server-error' || classification === 'graphql-error') {
    return isCoreFlowRequest(url) || isCriticalFlowRequest(url) ? 'high' : 'medium';
  }

  if (['timeout', 'blocked-request', 'cors-issue', 'unexpected-redirect', 'malformed-response'].includes(classification)) {
    return isCoreFlowRequest(url) ? 'high' : 'medium';
  }

  if (classification === 'auth-session-issue') {
    return isCriticalFlowRequest(url) ? 'critical' : 'high';
  }

  if (classification === 'validation-error' || classification === 'client-error') {
    return isCriticalFlowRequest(url) ? 'high' : 'medium';
  }

  if (classification === 'performance-degradation') {
    return request.slowSeverity || 'medium';
  }

  return 'medium';
}

export function buildNetworkIssue(request: TrackedNetworkRequest): NetworkIssue | undefined {
  const issueType = classifyNetworkRequest(request);
  if (!issueType) {
    return undefined;
  }

  const severity = scoreNetworkIssueSeverity(request, issueType);
  const statusLabel = request.status ? `status ${request.status}` : request.failureText || 'failed';
  const timingLabel = request.responseTimeMs ? `${request.responseTimeMs}ms` : 'unknown duration';

  const titles: Record<ApiIssueClassification, string> = {
    'client-error': `Client error on ${request.method} request`,
    'server-error': `Server error on ${request.method} request`,
    'auth-session-issue': 'Authentication or session issue detected',
    'validation-error': 'API validation error detected',
    'cors-issue': 'CORS failure detected',
    timeout: 'Request timeout detected',
    'performance-degradation': 'Slow API response detected',
    'unexpected-redirect': 'Unexpected redirect detected',
    'malformed-response': 'Malformed API response detected',
    'blocked-request': 'Blocked network request detected',
    'graphql-error': 'GraphQL error detected',
    'rest-api-error': 'REST API error detected',
    'polling-loop': 'Repeated polling loop detected',
  };

  const recommendations: Record<ApiIssueClassification, string> = {
    'client-error': 'Verify request payload, route, and client-side error handling.',
    'server-error': 'Inspect server logs and API health for the failing endpoint.',
    'auth-session-issue': 'Confirm credentials, session cookies, and token refresh behavior.',
    'validation-error': 'Review API contract and form payload validation rules.',
    'cors-issue': 'Fix CORS headers or proxy API requests through the application origin.',
    timeout: 'Investigate backend latency, timeouts, and retry behavior.',
    'performance-degradation': 'Profile the endpoint and optimize backend or payload size.',
    'unexpected-redirect': 'Confirm redirect targets and auth middleware behavior.',
    'malformed-response': 'Ensure the API returns valid JSON and expected schema.',
    'blocked-request': 'Check browser extensions, CSP, mixed content, and network policies.',
    'graphql-error': 'Inspect GraphQL errors array and resolver failures.',
    'rest-api-error': 'Inspect REST response body and status handling in the UI.',
    'polling-loop': 'Reduce polling frequency or switch to push/subscription updates.',
  };

  return {
    id: `network:${issueType}:${request.id}`,
    issueType,
    severity,
    title: titles[issueType],
    description: `${request.method} ${request.url} (${statusLabel}, ${timingLabel})${
      request.triggeringAction ? ` after ${request.triggeringAction}` : ''
    }.`,
    request,
    suspectedRootCause: request.failureText || request.responseBodySummary || request.headersSummary,
    recommendation: recommendations[issueType],
  };
}

export function issuesFromRequests(requests: TrackedNetworkRequest[]): NetworkIssue[] {
  return requests.map((request) => buildNetworkIssue(request)).filter(Boolean) as NetworkIssue[];
}
