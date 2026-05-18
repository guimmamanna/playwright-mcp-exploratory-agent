import type { TrackedNetworkRequest } from './types';
import type { ApiIssueClassification } from './types';

function combinedText(request: TrackedNetworkRequest) {
  return [request.url, request.failureText, request.responseBodySummary, request.headersSummary].filter(Boolean).join(' ').toLowerCase();
}

function isApiRequest(request: TrackedNetworkRequest) {
  const type = request.resourceType || '';
  if (['xhr', 'fetch', 'websocket'].includes(type)) {
    return true;
  }
  return /\/api\/|\/graphql|\.json(\?|$)/i.test(request.url);
}

function isAnalyticsRequest(url: string) {
  return /\b(google-analytics|googletagmanager|segment|mixpanel|hotjar|sentry|analytics|tracking|telemetry)\b/i.test(url);
}

export function classifyNetworkRequest(request: TrackedNetworkRequest): ApiIssueClassification | undefined {
  const text = combinedText(request);
  const status = request.status;

  if (request.failureText) {
    if (/timeout|timed out|err_timed_out/i.test(request.failureText)) {
      return 'timeout';
    }
    if (/cors|cross-origin|access-control/i.test(request.failureText)) {
      return 'cors-issue';
    }
    if (/blocked|aborted|cancelled|net::err_blocked/i.test(request.failureText)) {
      return 'blocked-request';
    }
    return 'blocked-request';
  }

  if (request.redirectUrl && status && status >= 300 && status < 400) {
    return 'unexpected-redirect';
  }

  if (status === undefined && !request.isSlow) {
    return undefined;
  }

  if (request.isSlow && (!status || status < 400)) {
    return 'performance-degradation';
  }

  if (status === undefined) {
    return undefined;
  }

  if (status >= 500) {
    return isApiRequest(request) ? 'server-error' : 'rest-api-error';
  }

  if (status === 401 || status === 403) {
    return 'auth-session-issue';
  }

  if (status === 422 || status === 400) {
    if (/validation|invalid|required|field/i.test(text)) {
      return 'validation-error';
    }
    return 'client-error';
  }

  if (status >= 400) {
    return 'client-error';
  }

  if (/graphql/i.test(request.url) || /"errors"\s*:\s*\[/i.test(request.responseBodySummary || '')) {
    return 'graphql-error';
  }

  if (isApiRequest(request) && /"error"|"errors"|invalid json|unexpected token/i.test(request.responseBodySummary || '')) {
    return 'malformed-response';
  }

  if (isApiRequest(request) && status >= 400) {
    return 'rest-api-error';
  }

  return undefined;
}

export function isCriticalFlowRequest(url: string) {
  return /\b(checkout|payment|pay|order|cart|basket|login|signin|sign-in|auth|session|save|profile|account)\b/i.test(url);
}

export function isCoreFlowRequest(url: string) {
  return /\b(api\/|\/v\d+\/|dashboard|orders|users|data|submit|create|update)\b/i.test(url);
}

export function isLowPriorityRequest(url: string) {
  return isAnalyticsRequest(url) || /\.(png|jpg|jpeg|gif|svg|woff|css)(\?|$)/i.test(url);
}
