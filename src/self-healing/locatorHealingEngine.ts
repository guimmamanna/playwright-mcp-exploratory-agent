import type { Locator, Page } from '@playwright/test';
import type { AgentAction, LocatorStrategy } from '../types';
import { clickVisionRegion, findVisionRegion, visionLocatorStrategy } from '../vision/visualFallback';
import type { ExplorationSession } from '../types';
import type { HealedLocatorResult } from './types';

function labelOf(action: AgentAction) {
  return action.label || action.target || action.placeholder || action.text || action.selector || action.testId || '';
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCssLike(value: string | undefined) {
  return Boolean(value && /^(#|\.|\[|[a-z][a-z0-9-]*(\.|#|\[|:|\s|>|$))/i.test(value));
}

export class LocatorHealingEngine {
  buildCandidates(page: Page, action: AgentAction, roleHints: string[]) {
    const candidates: Array<{ locator: Locator; strategy: LocatorStrategy }> = [];
    const target = labelOf(action);
    const targetPattern = target ? new RegExp(escapeRegex(target), 'i') : undefined;

    if (action.role && targetPattern) {
      candidates.push({
        locator: page.getByRole(action.role as Parameters<Page['getByRole']>[0], { name: targetPattern }),
        strategy: { type: 'role', role: action.role, value: target },
      });
    }

    if (targetPattern) {
      for (const role of roleHints) {
        candidates.push({
          locator: page.getByRole(role as Parameters<Page['getByRole']>[0], { name: targetPattern }),
          strategy: { type: 'role', role, value: target },
        });
      }
    }

    for (const label of [action.label, action.target].filter(Boolean) as string[]) {
      candidates.push({
        locator: page.getByLabel(label, { exact: false }),
        strategy: { type: 'label', value: label },
      });
    }

    for (const placeholder of [action.placeholder, action.target].filter(Boolean) as string[]) {
      candidates.push({
        locator: page.getByPlaceholder(placeholder, { exact: false }),
        strategy: { type: 'placeholder', value: placeholder },
      });
    }

    if (action.testId) {
      candidates.push({
        locator: page.getByTestId(action.testId),
        strategy: { type: 'testId', value: action.testId },
      });
    }

    for (const text of [action.text, action.target].filter(Boolean) as string[]) {
      candidates.push({
        locator: page.getByText(text, { exact: false }),
        strategy: { type: 'text', value: text },
      });
    }

    if (action.selector && isCssLike(action.selector)) {
      candidates.push({
        locator: page.locator(action.selector),
        strategy: { type: 'css', value: action.selector },
      });
    }

    if (target && target.length > 2) {
      const xpath = `xpath=//*[contains(normalize-space(.), "${target.replace(/"/g, '')}")][not(self::script)]`;
      candidates.push({
        locator: page.locator(xpath),
        strategy: { type: 'xpath', value: xpath },
      });
    }

    return candidates;
  }

  async heal(
    page: Page,
    session: ExplorationSession,
    action: AgentAction,
    roleHints: string[],
    options: { allowVision?: boolean; alreadyTried?: LocatorStrategy[] } = {},
  ): Promise<HealedLocatorResult> {
    const tried = [...(options.alreadyTried || [])];
    const candidates = this.buildCandidates(page, action, roleHints);

    for (const candidate of candidates) {
      if (tried.some((strategy) => strategy.type === candidate.strategy.type && strategy.value === candidate.strategy.value)) {
        continue;
      }
      tried.push(candidate.strategy);
      if ((await candidate.locator.count().catch(() => 0)) > 0) {
        const healedAction: AgentAction = {
          ...action,
          selector: candidate.strategy.type === 'css' ? candidate.strategy.value : undefined,
          role: candidate.strategy.role || action.role,
          testId: candidate.strategy.type === 'testId' ? candidate.strategy.value : action.testId,
          label: candidate.strategy.type === 'label' ? candidate.strategy.value : action.label,
          target: candidate.strategy.value || action.target,
        };
        return {
          success: true,
          action: healedAction,
          strategy: candidate.strategy,
          strategiesTried: tried,
          message: `Healed locator using ${candidate.strategy.type}.`,
        };
      }
    }

    if (options.allowVision !== false && session.config.visionMultimodalEnabled !== false) {
      const region = findVisionRegion(session, action);
      if (region) {
        const coordinates = await clickVisionRegion(page, region);
        const strategy = visionLocatorStrategy(region, coordinates);
        return {
          success: true,
          action,
          strategy,
          strategiesTried: [...tried, strategy],
          message: 'Healed via vision coordinate fallback.',
        };
      }
    }

    return {
      success: false,
      action,
      strategiesTried: tried,
      message: 'No locator healing strategy succeeded.',
    };
  }
}

export const defaultLocatorHealingEngine = new LocatorHealingEngine();
