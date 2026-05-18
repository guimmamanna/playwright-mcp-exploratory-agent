import type { Page, Request, Response } from '@playwright/test';
import type { AgentAction, NetworkEventRecord } from '../types';
import { slowSeverityForResponseTime, defaultNetworkThresholds } from './performanceThresholds';
import type { NetworkActionContext, NetworkThresholds, TrackedNetworkRequest } from './types';

function now() {
  return new Date().toISOString();
}

function summarizeText(value: string | undefined, maxLength = 240) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function summarizeHeaders(headers: Record<string, string>) {
  const keys = ['content-type', 'authorization', 'x-request-id', 'location', 'access-control-allow-origin'];
  return keys
    .filter((key) => headers[key])
    .map((key) => `${key}=${headers[key]}`)
    .join('; ')
    .slice(0, 240);
}

function actionLabel(action?: AgentAction) {
  if (!action) {
    return undefined;
  }
  return [action.kind, action.target, action.selector, action.url].filter(Boolean).join(' ');
}

function isApiLike(resourceType?: string, url?: string) {
  if (['xhr', 'fetch', 'websocket'].includes(resourceType || '')) {
    return true;
  }
  return /\/api\/|\/graphql|\.json(\?|$)/i.test(url || '');
}

export class NetworkCollector {
  private readonly requests = new Map<string, TrackedNetworkRequest>();
  private readonly startTimes = new WeakMap<Request, number>();
  private readonly requestKeyMap = new WeakMap<Request, string>();
  private context: NetworkActionContext = {};
  private attached = false;
  private idCounter = 0;

  constructor(
    private readonly page: Page,
    private readonly thresholds: NetworkThresholds = defaultNetworkThresholds,
  ) {}

  setActionContext(context: NetworkActionContext) {
    this.context = context;
  }

  attach() {
    if (this.attached) {
      return;
    }

    this.page.on('request', (request: Request) => {
      const id = `req-${++this.idCounter}`;
      this.requestKeyMap.set(request, id);
      this.startTimes.set(request, Date.now());
      const postData = request.postData() || undefined;

      this.requests.set(id, {
        id,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        requestPayloadSummary: summarizeText(postData),
        headersSummary: summarizeHeaders(request.headers()),
        triggeringAction: actionLabel(this.context.action),
        pageUrl: this.context.pageUrl || this.page.url(),
        stepId: this.context.stepId,
        timestamp: now(),
      });
    });

    this.page.on('response', (response: Response) => {
      void this.handleResponse(response);
    });

    this.page.on('requestfailed', (request: Request) => {
      const id = this.requestKeyMap.get(request) || `req-${++this.idCounter}`;
      const record = this.requests.get(id) || {
        id,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: now(),
      };

      record.failureText = request.failure()?.errorText || 'request failed';
      record.triggeringAction = record.triggeringAction || actionLabel(this.context.action);
      record.pageUrl = record.pageUrl || this.context.pageUrl || this.page.url();
      record.stepId = record.stepId || this.context.stepId;
      this.requests.set(id, record);
    });

    this.attached = true;
  }

  private async handleResponse(response: Response) {
    const request = response.request();
    const id = this.requestKeyMap.get(request);
    if (!id) {
      return;
    }

    const record = this.requests.get(id);
    if (!record) {
      return;
    }

    const started = this.startTimes.get(request);
    const responseTimeMs = started ? Date.now() - started : undefined;
    record.status = response.status();
    record.responseTimeMs = responseTimeMs;
    record.headersSummary = summarizeHeaders(response.headers());

    if (response.status() >= 300 && response.status() < 400) {
      record.redirectUrl = response.headers()['location'];
    }

    if (isApiLike(record.resourceType, record.url)) {
      try {
        const body = await response.text();
        record.responseBodySummary = summarizeText(body);
      } catch {
        record.responseBodySummary = undefined;
      }
    }

    if (responseTimeMs !== undefined) {
      record.slowSeverity = slowSeverityForResponseTime(responseTimeMs, this.thresholds);
      record.isSlow = Boolean(record.slowSeverity);
    }
  }

  getTrackedRequests(): TrackedNetworkRequest[] {
    return Array.from(this.requests.values());
  }

  toNetworkEventRecords(): NetworkEventRecord[] {
    return this.getTrackedRequests().map((request) => ({
      url: request.url,
      method: request.method,
      status: request.status,
      failureText: request.failureText,
      resourceType: request.resourceType,
      timestamp: request.timestamp,
      responseTimeMs: request.responseTimeMs,
      requestPayloadSummary: request.requestPayloadSummary,
      responseBodySummary: request.responseBodySummary,
      headersSummary: request.headersSummary,
      triggeringAction: request.triggeringAction,
      pageUrl: request.pageUrl,
      stepId: request.stepId,
      redirectUrl: request.redirectUrl,
      issueClassification: request.issueClassification,
    }));
  }
}
