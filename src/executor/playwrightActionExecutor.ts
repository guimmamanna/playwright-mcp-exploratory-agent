import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type {
  ActionPlan,
  ActionResult,
  AgentAction,
  ExecutionError,
  ExplorationExecutor,
  ExplorationSession,
  LocatorStrategy,
  Observation,
} from '../types';
import { PlaywrightPageObserver } from '../observer/playwrightPageObserver';
import { clickVisionRegion, findVisionRegion, visionLocatorStrategy } from '../vision/visualFallback';

interface ResolvedLocator {
  locator: Locator;
  strategy: LocatorStrategy;
  tried: LocatorStrategy[];
}

const RISKY_ACTION_PATTERN =
  /\b(checkout|payment|purchase|buy now|place order|delete|remove account|cancel subscription|send email|send message|submit message|account settings)\b/i;

function now() {
  return new Date().toISOString();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'screenshot';
}

function labelOf(action: AgentAction) {
  return action.label || action.target || action.placeholder || action.text || action.selector || action.testId || '';
}

function isCssLike(value: string | undefined) {
  return Boolean(value && /^(#|\.|\[|[a-z][a-z0-9-]*(\.|#|\[|:|\s|>|$))/i.test(value));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRisky(plan: ActionPlan) {
  const action = plan.action;
  return [action.kind, action.reason, action.target, action.selector, action.text, action.label, action.url]
    .filter(Boolean)
    .some((value) => RISKY_ACTION_PATTERN.test(value!));
}

function executionError(
  code: ExecutionError['code'],
  message: string,
  locatorStrategiesTried?: LocatorStrategy[],
  error?: unknown,
): ExecutionError {
  return {
    code,
    message,
    stack: error instanceof Error ? error.stack : undefined,
    locatorStrategiesTried,
  };
}

export class PlaywrightActionExecutor implements ExplorationExecutor {
  constructor(
    private readonly page: Page,
    private readonly observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' }),
  ) {
    this.observer.attach();
  }

  observe(session: ExplorationSession): Promise<Observation> {
    return this.observer.observe(session);
  }

  getPage(): Page {
    return this.page;
  }

  async execute(plan: ActionPlan, session: ExplorationSession): Promise<ActionResult> {
    const action = plan.action;
    const startedAt = now();
    const stepId = `step-${String(session.steps.length + 1).padStart(3, '0')}`;

    this.observer.setActionContext({
      stepId,
      action,
      pageUrl: session.currentUrl || this.page.url(),
    });

    if (isRisky(plan) && session.goal.destructiveActionsAllowed !== true) {
      const error = executionError('blocked-risky-action', `Blocked risky action: ${action.reason || action.kind}`);
      return {
        status: 'blocked',
        startedAt,
        endedAt: now(),
        action,
        actualOutcome: error.message,
        message: error.message,
        errors: [error],
      };
    }

    try {
      const result = await this.executeSafe(action, session);
      return {
        ...result,
        startedAt,
        endedAt: now(),
        action,
        resultingUrl: this.page.url(),
      };
    } catch (error) {
      const attachedExecutionError = (error as { executionError?: ExecutionError }).executionError;
      const visionFallback = await this.tryVisionFallback(plan, session, attachedExecutionError);
      if (visionFallback) {
        return {
          ...visionFallback,
          startedAt,
          endedAt: now(),
          action,
          resultingUrl: this.page.url(),
        };
      }

      const executionFailure =
        attachedExecutionError ||
        executionError(
          'execution-failed',
          error instanceof Error ? error.message : String(error),
          undefined,
          error,
        );

      return {
        status: 'failed',
        startedAt,
        endedAt: now(),
        action,
        locatorStrategy: executionFailure.locatorStrategiesTried?.at(-1),
        locatorStrategiesTried: executionFailure.locatorStrategiesTried,
        actualOutcome: 'Action failed before completion.',
        message: executionFailure.message,
        errors: [executionFailure],
        resultingUrl: this.page.url(),
      };
    }
  }

  private async executeSafe(
    action: AgentAction,
    session: ExplorationSession,
  ): Promise<Omit<ActionResult, 'startedAt' | 'endedAt' | 'action' | 'resultingUrl'>> {
    switch (action.kind) {
      case 'navigate':
        if (!action.url) {
          return this.failed(action, 'invalid-action', 'Navigate action requires a URL.');
        }
        await this.page.goto(action.url, { waitUntil: action.loadState || 'domcontentloaded' });
        return {
          status: 'success',
          actualOutcome: `Navigated to ${this.page.url()}.`,
          locatorStrategy: { type: 'url', value: action.url },
          locatorStrategiesTried: [{ type: 'url', value: action.url }],
        };

      case 'goBack':
        await this.page.goBack({ waitUntil: action.loadState || 'domcontentloaded' });
        return {
          status: 'success',
          actualOutcome: `Navigated back to ${this.page.url()}.`,
          locatorStrategy: { type: 'url', value: 'history.back' },
          locatorStrategiesTried: [{ type: 'url', value: 'history.back' }],
        };

      case 'wait':
        await this.page.waitForTimeout(action.timeoutMs || 1000);
        return {
          status: 'success',
          actualOutcome: `Waited ${action.timeoutMs || 1000}ms.`,
          locatorStrategy: { type: 'none' },
          locatorStrategiesTried: [{ type: 'none' }],
        };

      case 'waitForLoadState':
        await this.page.waitForLoadState(action.loadState || 'domcontentloaded', {
          timeout: action.timeoutMs || 15000,
        });
        return {
          status: 'success',
          actualOutcome: `Waited for ${action.loadState || 'domcontentloaded'} load state.`,
          locatorStrategy: { type: 'none' },
          locatorStrategiesTried: [{ type: 'none' }],
        };

      case 'press':
        await this.page.keyboard.press(action.key || action.value || 'Enter');
        return {
          status: 'success',
          actualOutcome: `Pressed ${action.key || action.value || 'Enter'}.`,
          locatorStrategy: { type: 'keyboard', value: action.key || action.value || 'Enter' },
          locatorStrategiesTried: [{ type: 'keyboard', value: action.key || action.value || 'Enter' }],
        };

      case 'screenshot': {
        await mkdir(session.evidenceDirectory, { recursive: true });
        const evidencePath = join(session.evidenceDirectory, `${Date.now()}-${slug(this.page.url())}.png`);
        await this.page.screenshot({ path: evidencePath, fullPage: true });
        return {
          status: 'success',
          actualOutcome: `Screenshot saved to ${evidencePath}.`,
          evidencePath,
          locatorStrategy: { type: 'none' },
          locatorStrategiesTried: [{ type: 'none' }],
        };
      }

      case 'noop':
      case 'stop':
        return {
          status: 'skipped',
          actualOutcome: 'No browser action executed.',
          locatorStrategy: { type: 'none' },
          locatorStrategiesTried: [{ type: 'none' }],
        };

      case 'click': {
        const resolved = await this.resolveLocator(action, ['button', 'link']);
        const visibleEnabled = await this.ensureVisibleAndEnabled(resolved);
        if (visibleEnabled) return visibleEnabled;
        await resolved.locator.click({ timeout: action.timeoutMs || 10000 });
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        return this.successWithLocator(resolved, `Clicked ${labelOf(action) || resolved.strategy.value || 'element'}.`);
      }

      case 'fill': {
        const resolved = await this.resolveLocator(action, ['textbox']);
        const visibleEnabled = await this.ensureVisibleAndEnabled(resolved);
        if (visibleEnabled) return visibleEnabled;
        await resolved.locator.fill(action.value || '', { timeout: action.timeoutMs || 10000 });
        return this.successWithLocator(resolved, `Filled ${labelOf(action) || 'field'}.`);
      }

      case 'search': {
        const resolved = await this.resolveLocator(action, ['searchbox', 'textbox']);
        const visibleEnabled = await this.ensureVisibleAndEnabled(resolved);
        if (visibleEnabled) return visibleEnabled;
        await resolved.locator.fill(action.value || '', { timeout: action.timeoutMs || 10000 });
        await resolved.locator.press(action.key || 'Enter');
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        return this.successWithLocator(resolved, `Searched for "${action.value || ''}".`);
      }

      case 'select': {
        const resolved = await this.resolveLocator(action, ['combobox']);
        const visibleEnabled = await this.ensureVisibleAndEnabled(resolved);
        if (visibleEnabled) return visibleEnabled;
        await resolved.locator.selectOption({ label: action.value || action.text || action.target || '' });
        return this.successWithLocator(resolved, `Selected option "${action.value || action.text || ''}".`);
      }

      case 'check':
      case 'uncheck': {
        const resolved = await this.resolveLocator(action, ['checkbox']);
        const visibleEnabled = await this.ensureVisibleAndEnabled(resolved);
        if (visibleEnabled) return visibleEnabled;
        if (action.kind === 'check') {
          await resolved.locator.check({ timeout: action.timeoutMs || 10000 });
        } else {
          await resolved.locator.uncheck({ timeout: action.timeoutMs || 10000 });
        }
        return this.successWithLocator(resolved, `${action.kind === 'check' ? 'Checked' : 'Unchecked'} ${labelOf(action)}.`);
      }

      default:
        return this.failed(action, 'unsupported-action', `Unsupported action kind: ${action.kind}`);
    }
  }

  private async tryVisionFallback(
    plan: ActionPlan,
    session: ExplorationSession,
    executionError?: ExecutionError,
  ): Promise<Omit<ActionResult, 'startedAt' | 'endedAt' | 'action' | 'resultingUrl'> | undefined> {
    if (session.config.visionMultimodalEnabled === false) return undefined;
    if (executionError?.code !== 'locator-not-found') return undefined;
    if (!session.memory.observations.at(-1)?.visionSignals?.regions.length) return undefined;
    if (!['click', 'search', 'fill', 'select', 'check', 'uncheck'].includes(plan.action.kind)) return undefined;

    const region = findVisionRegion(session, plan.action);
    if (!region) return undefined;

    const coordinates = await clickVisionRegion(this.page, region);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    const strategy = visionLocatorStrategy(region, coordinates);
    return {
      status: 'success',
      locatorStrategy: strategy,
      locatorStrategiesTried: [...(executionError?.locatorStrategiesTried || []), strategy],
      actualOutcome: `Vision fallback clicked ${region.label || region.kind} at (${coordinates.x}, ${coordinates.y}).`,
      message: 'Recovered via vision-based locator fallback.',
    };
  }

  private async resolveLocator(action: AgentAction, roleHints: string[]): Promise<ResolvedLocator> {
    const candidates = this.locatorCandidates(action, roleHints);
    const tried: LocatorStrategy[] = [];

    for (const candidate of candidates) {
      tried.push(candidate.strategy);
      if ((await candidate.locator.count().catch(() => 0)) > 0) {
        return { ...candidate, locator: candidate.locator.first(), tried };
      }
    }

    throw Object.assign(new Error('No locator matched the planned action target.'), {
      executionError: executionError('locator-not-found', 'No locator matched the planned action target.', tried),
    });
  }

  private locatorCandidates(action: AgentAction, roleHints: string[]) {
    const candidates: Array<{ locator: Locator; strategy: LocatorStrategy }> = [];
    const target = labelOf(action);
    const targetPattern = target ? new RegExp(escapeRegex(target), 'i') : undefined;

    if (action.role && targetPattern) {
      candidates.push({
        locator: this.page.getByRole(action.role as Parameters<Page['getByRole']>[0], { name: targetPattern }),
        strategy: { type: 'role', role: action.role, value: target },
      });
    }

    if (targetPattern) {
      for (const role of roleHints) {
        candidates.push({
          locator: this.page.getByRole(role as Parameters<Page['getByRole']>[0], { name: targetPattern }),
          strategy: { type: 'role', role, value: target },
        });
      }
    }

    for (const label of [action.label, action.target].filter(Boolean) as string[]) {
      candidates.push({
        locator: this.page.getByLabel(label, { exact: false }),
        strategy: { type: 'label', value: label },
      });
    }

    for (const placeholder of [action.placeholder, action.target].filter(Boolean) as string[]) {
      candidates.push({
        locator: this.page.getByPlaceholder(placeholder, { exact: false }),
        strategy: { type: 'placeholder', value: placeholder },
      });
    }

    if (action.testId) {
      candidates.push({
        locator: this.page.getByTestId(action.testId),
        strategy: { type: 'testId', value: action.testId },
      });
    }

    for (const text of [action.text, action.target].filter(Boolean) as string[]) {
      candidates.push({
        locator: this.page.getByText(text, { exact: false }),
        strategy: { type: 'text', value: text },
      });
    }

    if (action.selector && isCssLike(action.selector)) {
      candidates.push({
        locator: this.page.locator(action.selector),
        strategy: { type: 'css', value: action.selector },
      });
    }

    return candidates;
  }

  private async ensureVisibleAndEnabled(
    resolved: ResolvedLocator,
  ): Promise<Omit<ActionResult, 'startedAt' | 'endedAt' | 'action' | 'resultingUrl'> | undefined> {
    if (!(await resolved.locator.isVisible().catch(() => false))) {
      return {
        status: 'failed',
        locatorStrategy: resolved.strategy,
        locatorStrategiesTried: resolved.tried,
        actualOutcome: 'Element was found but not visible.',
        message: 'Element was found but not visible.',
        errors: [executionError('element-not-visible', 'Element was found but not visible.', resolved.tried)],
      };
    }

    if (!(await resolved.locator.isEnabled().catch(() => false))) {
      return {
        status: 'failed',
        locatorStrategy: resolved.strategy,
        locatorStrategiesTried: resolved.tried,
        actualOutcome: 'Element was visible but disabled.',
        message: 'Element was visible but disabled.',
        errors: [executionError('element-not-enabled', 'Element was visible but disabled.', resolved.tried)],
      };
    }

    return undefined;
  }

  private successWithLocator(
    resolved: ResolvedLocator,
    actualOutcome: string,
  ): Omit<ActionResult, 'startedAt' | 'endedAt' | 'action' | 'resultingUrl'> {
    return {
      status: 'success',
      locatorStrategy: resolved.strategy,
      locatorStrategiesTried: resolved.tried,
      actualOutcome,
    };
  }

  private failed(
    action: AgentAction,
    code: ExecutionError['code'],
    message: string,
  ): Omit<ActionResult, 'startedAt' | 'endedAt' | 'action' | 'resultingUrl'> {
    return {
      status: 'failed',
      actualOutcome: message,
      message,
      errors: [executionError(code, message)],
      locatorStrategy: action.url ? { type: 'url', value: action.url } : undefined,
    };
  }
}
