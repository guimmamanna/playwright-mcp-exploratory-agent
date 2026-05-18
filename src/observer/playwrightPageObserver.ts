import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConsoleMessage, Page } from '@playwright/test';
import { defaultAccessibilityEngine } from '../accessibility/accessibilityEngine';
import { NetworkCollector } from '../network/networkCollector';
import { defaultNetworkEngine } from '../network/networkEngine';
import { defaultVisualEngine } from '../visual/visualEngine';
import { detectFeatureFlags } from '../environment/featureFlags';
import { validateLocale } from '../environment/localeValidation';
import { defaultVisionEngine } from '../vision/visionEngine';
import type {
  AgentAction,
  ConsoleMessageRecord,
  ExplorationSession,
  FormSummary,
  InteractiveElement,
  NetworkIssueRecord,
  Observation,
} from '../types';

export interface PageObservationOptions {
  maxVisibleTextLength?: number;
  maxElements?: number;
  screenshotMode?: 'off' | 'always';
}

function now() {
  return new Date().toISOString();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'page';
}

function compactText(value: string | undefined, maxLength: number) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function consoleLevel(message: ConsoleMessage): ConsoleMessageRecord['level'] {
  const type = message.type();
  if (type === 'error') {
    return 'error';
  }
  if (type === 'warning') {
    return 'warning';
  }
  if (type === 'debug') {
    return 'debug';
  }
  return 'info';
}

function toNetworkSignals(issues: ReturnType<typeof defaultNetworkEngine.analyzeRequests>['issues'], summary: ReturnType<typeof defaultNetworkEngine.analyzeRequests>['signals']) {
  const issueRecords: NetworkIssueRecord[] = issues.map((issue) => ({
    id: issue.id,
    issueType: issue.issueType,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    suspectedRootCause: issue.suspectedRootCause,
    recommendation: issue.recommendation,
    requestUrl: issue.request.url,
    requestMethod: issue.request.method,
    status: issue.request.status,
    responseTimeMs: issue.request.responseTimeMs,
    triggeringAction: issue.request.triggeringAction,
  }));

  return {
    ...summary,
    issues: issueRecords,
  };
}

export class PlaywrightPageObserver {
  private readonly consoleMessages: ConsoleMessageRecord[] = [];
  private readonly networkCollector: NetworkCollector;
  private attached = false;

  constructor(private readonly page: Page, private readonly options: PageObservationOptions = {}) {
    this.networkCollector = new NetworkCollector(page);
  }

  setActionContext(context: { stepId?: string; action?: AgentAction; pageUrl?: string }) {
    this.networkCollector.setActionContext(context);
  }

  attach() {
    if (this.attached) {
      return;
    }

    this.page.on('console', (message) => {
      this.consoleMessages.push({
        level: consoleLevel(message),
        text: message.text(),
        location: `${message.location().url}:${message.location().lineNumber}`,
        timestamp: now(),
      });
    });

    this.networkCollector.attach();
    this.attached = true;
  }

  async observe(session: ExplorationSession, phase: Observation['phase'] = 'standalone', stepId?: string): Promise<Observation> {
    this.attach();

    const timestamp = now();
    const maxVisibleTextLength = this.options.maxVisibleTextLength || 1200;
    const maxElements = this.options.maxElements || 80;
    const [title, url, pageSignals] = await Promise.all([
      this.page.title().catch(() => ''),
      Promise.resolve(this.page.url()),
      this.collectPageSignals(maxVisibleTextLength, maxElements),
    ]);

    const screenshotPath = await this.captureScreenshot(session, phase, stepId);
    const trackedRequests = this.networkCollector.getTrackedRequests();
    const networkAnalysis =
      session.config.networkIntelligenceEnabled !== false
        ? defaultNetworkEngine.analyzeRequests(trackedRequests)
        : { issues: [], signals: defaultNetworkEngine.buildSignals(trackedRequests) };
    const networkEvents = this.networkCollector.toNetworkEventRecords();
    const failedNetworkRequests = networkEvents.filter(
      (event) => event.failureText || (event.status !== undefined && event.status >= 400),
    );

    const observation: Observation = {
      id: `observation-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp,
      phase,
      stepId,
      url,
      title,
      visibleText: pageSignals.visibleText,
      visibleTextSummary: compactText(pageSignals.visibleText, maxVisibleTextLength),
      domSummary: pageSignals.domSummary,
      accessibilitySnapshot: pageSignals.accessibilitySnapshot,
      screenshotPath,
      consoleMessages: [...this.consoleMessages],
      networkEvents,
      failedNetworkRequests,
      networkSignals: toNetworkSignals(networkAnalysis.issues, networkAnalysis.signals),
      interactiveElements: pageSignals.interactiveElements,
      buttons: pageSignals.buttons,
      inputs: pageSignals.inputs,
      forms: pageSignals.forms,
      links: pageSignals.links,
      visualAnomalies: pageSignals.visualAnomalies,
      errors: pageSignals.errors,
    };

    if (session.config.accessibilityAuditEnabled !== false || session.config.keyboardNavigationCheckEnabled !== false) {
      observation.accessibilitySignals = await defaultAccessibilityEngine.auditPage(this.page, observation, session.config);
      observation.accessibilitySnapshot = [
        pageSignals.accessibilitySnapshot,
        `axeViolations=${observation.accessibilitySignals.axeViolationCount}`,
        `a11yIssues=${observation.accessibilitySignals.issueCount}`,
        observation.accessibilitySignals.snapshotSummary,
      ]
        .filter(Boolean)
        .join('; ');
    }

    if (session.explorationContext?.environment) {
      observation.featureFlagSignals = await detectFeatureFlags(this.page);
      observation.localeSignals = await validateLocale(this.page, session.explorationContext.environment);
      if (session.explorationContext) {
        session.explorationContext.detectedFeatureFlags = Array.from(
          new Set([
            ...session.explorationContext.detectedFeatureFlags,
            ...observation.featureFlagSignals.flags.map((flag) => flag.key),
          ]),
        );
      }
    }

    if (session.config.visualIntelligenceEnabled !== false) {
      try {
        observation.visualSignals = await defaultVisualEngine.auditPage(this.page, observation, session.config);
        const primaryCapture =
          observation.visualSignals.captures.find((capture) => capture.viewport === observation.visualSignals?.activeViewport) ||
          observation.visualSignals.captures[0];
        if (primaryCapture?.screenshotPath) {
          observation.screenshotPath = primaryCapture.screenshotPath;
        }
        observation.visualAnomalies = [
          ...(pageSignals.visualAnomalies || []),
          ...observation.visualSignals.issues.map((issue) => issue.title),
        ];
      } catch {
        observation.visualSignals = {
          activeViewport: defaultVisualEngine.activeViewportProfile(session.config).name,
          captures: [],
          issues: [],
          summary: 'visual-audit-failed',
        };
      }
    }

    if (session.config.visionMultimodalEnabled) {
      try {
        observation.visionSignals = await defaultVisionEngine.analyzePage(this.page, session, observation, session.config);
        if (observation.visionSignals?.annotatedScreenshotPath && !observation.screenshotPath) {
          observation.screenshotPath = observation.visionSignals.screenshotPath;
        }
      } catch {
        observation.visionSignals = undefined;
      }
    }

    observation.domSummary = [
      pageSignals.domSummary,
      observation.networkSignals?.summary,
      observation.visualSignals?.summary,
      observation.visionSignals?.summary,
    ]
      .filter(Boolean)
      .join('; ');

    return observation;
  }

  private async captureScreenshot(
    session: ExplorationSession,
    phase: Observation['phase'],
    stepId?: string,
  ): Promise<string | undefined> {
    if (this.options.screenshotMode === 'off' || session.config.screenshotMode === 'off') {
      return undefined;
    }

    try {
      await mkdir(session.evidenceDirectory, { recursive: true });
      const path = join(
        session.evidenceDirectory,
        `${String(session.steps.length + 1).padStart(3, '0')}-${phase || 'observation'}-${slug(this.page.url())}.png`,
      );
      await this.page.screenshot({ path, fullPage: true });
      return path;
    } catch {
      return undefined;
    }
  }

  private async collectPageSignals(maxVisibleTextLength: number, maxElements: number) {
    return this.page
      .evaluate(
        ({ maxVisibleTextLength, maxElements }) => {
          const isVisible = (element: Element) => {
            const style = window.getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
          };

          const textOf = (element: Element | null | undefined) =>
            (element?.textContent || '').replace(/\s+/g, ' ').trim();

          const cssPath = (element: Element) => {
            const id = element.getAttribute('id');
            if (id) {
              return `#${CSS.escape(id)}`;
            }

            const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
            if (testId) {
              return `[data-testid="${testId}"]`;
            }

            const aria = element.getAttribute('aria-label');
            if (aria) {
              return `${element.tagName.toLowerCase()}[aria-label="${aria.replace(/"/g, '\\"')}"]`;
            }

            return element.tagName.toLowerCase();
          };

          const accessibleName = (element: Element) => {
            const labelledBy = element.getAttribute('aria-labelledby');
            const labelledText = labelledBy
              ?.split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent || '')
              .join(' ')
              .trim();

            const label =
              element.getAttribute('aria-label') ||
              labelledText ||
              (element instanceof HTMLInputElement && element.labels?.[0]?.textContent) ||
              (element instanceof HTMLTextAreaElement && element.labels?.[0]?.textContent) ||
              (element instanceof HTMLSelectElement && element.labels?.[0]?.textContent) ||
              element.getAttribute('placeholder') ||
              element.getAttribute('title') ||
              textOf(element);

            return label?.replace(/\s+/g, ' ').trim() || undefined;
          };

          const kindOf = (element: Element): InteractiveElement['kind'] => {
            const tag = element.tagName.toLowerCase();
            const role = element.getAttribute('role');
            const type = element.getAttribute('type') || '';

            if (tag === 'a') return 'link';
            if (tag === 'button' || role === 'button' || type === 'button' || type === 'submit') return 'button';
            if (tag === 'select') return 'select';
            if (tag === 'textarea') return 'textarea';
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            if (tag === 'input') return 'input';
            return 'other';
          };

          const toInteractiveElement = (element: Element): InteractiveElement => {
            const input = element instanceof HTMLInputElement ? element : undefined;
            const control =
              element instanceof HTMLButtonElement ||
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement
                ? element
                : undefined;

            return {
              kind: kindOf(element),
              label: accessibleName(element),
              role: element.getAttribute('role') || undefined,
              selectorHint: cssPath(element),
              href: element instanceof HTMLAnchorElement ? element.href : undefined,
              placeholder: element.getAttribute('placeholder') || undefined,
              inputType: input?.type,
              required: control ? control.required : undefined,
              disabled: control ? control.disabled : undefined,
              visible: isVisible(element),
            };
          };

          const interactiveSelector = [
            'a[href]',
            'button',
            'input',
            'select',
            'textarea',
            '[role="button"]',
            '[role="link"]',
            '[tabindex]:not([tabindex="-1"])',
          ].join(',');

          const interactiveElements = Array.from(document.querySelectorAll(interactiveSelector))
            .filter(isVisible)
            .slice(0, maxElements)
            .map(toInteractiveElement);

          const forms: FormSummary[] = Array.from(document.querySelectorAll('form'))
            .filter(isVisible)
            .slice(0, 20)
            .map((form) => {
              const fields = Array.from(form.querySelectorAll('input, select, textarea')).filter(isVisible);
              const fieldSummaries = fields.map(toInteractiveElement);
              const labelsMissing = fieldSummaries.filter((field) => !field.label).length;
              const submit = form.querySelector('button[type="submit"], input[type="submit"], button');
              return {
                selectorHint: cssPath(form),
                fieldCount: fields.length,
                submitLabel: accessibleName(submit || undefined),
                labelsMissing,
                fields: fieldSummaries,
              };
            });

          const visibleText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
          const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
            .filter(isVisible)
            .slice(0, 20)
            .map(textOf)
            .filter(Boolean);

          const imagesWithoutAlt = Array.from(document.querySelectorAll('img'))
            .filter(isVisible)
            .filter((image) => !image.getAttribute('alt')).length;

          const visualAnomalies = Array.from(document.querySelectorAll('*'))
            .filter((element) => isVisible(element) && element.scrollWidth > element.clientWidth + 5)
            .slice(0, 10)
            .map((element) => `Possible horizontal overflow at ${cssPath(element)}`);

          const errors: string[] = [];
          if (!document.body) {
            errors.push('Missing document body.');
          }

          return {
            visibleText,
            domSummary: [
              `headings=${headings.join(' | ') || 'none'}`,
              `interactive=${interactiveElements.length}`,
              `forms=${forms.length}`,
              `imagesWithoutAlt=${imagesWithoutAlt}`,
            ].join('; '),
            accessibilitySnapshot: [
              `interactiveWithoutLabels=${interactiveElements.filter((element) => !element.label).length}`,
              `imagesWithoutAlt=${imagesWithoutAlt}`,
              `formsWithMissingLabels=${forms.filter((form) => form.labelsMissing > 0).length}`,
            ].join('; '),
            interactiveElements,
            buttons: interactiveElements.filter((element) => element.kind === 'button'),
            inputs: interactiveElements.filter((element) =>
              ['input', 'select', 'textarea', 'checkbox', 'radio'].includes(element.kind),
            ),
            links: interactiveElements.filter((element) => element.kind === 'link'),
            forms,
            visualAnomalies,
            errors,
            visibleTextSummary: visibleText.slice(0, maxVisibleTextLength),
          };
        },
        { maxVisibleTextLength, maxElements },
      )
      .catch((error) => ({
        visibleText: '',
        visibleTextSummary: '',
        domSummary: '',
        accessibilitySnapshot: '',
        interactiveElements: [],
        buttons: [],
        inputs: [],
        links: [],
        forms: [],
        visualAnomalies: [],
        errors: [error instanceof Error ? error.message : String(error)],
      }));
  }
}
