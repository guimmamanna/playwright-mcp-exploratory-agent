import type { Page } from '@playwright/test';
import type { ActionPlan, AgentAction, ExplorationSession } from '../types';
import { defaultLocatorHealingEngine } from '../self-healing/locatorHealingEngine';
import { latestCheckpoint } from './checkpoints';
import type { RecoveryStrategyId } from './types';

export interface StrategyContext {
  page: Page;
  session: ExplorationSession;
  plan: ActionPlan;
  roleHints: string[];
}

export interface StrategyResult {
  success: boolean;
  message: string;
  healedAction?: AgentAction;
  healedSelector?: string;
  checkpointId?: string;
}

export async function runRecoveryStrategy(strategy: RecoveryStrategyId, context: StrategyContext): Promise<StrategyResult> {
  const { page, session, plan } = context;

  switch (strategy) {
    case 'retry-improved-locator':
    case 'retry-alternative-selector': {
      const healed = await defaultLocatorHealingEngine.heal(page, session, plan.action, context.roleHints, {
        allowVision: false,
      });
      if (!healed.success) {
        return { success: false, message: healed.message || 'Locator healing failed.' };
      }
      session.recoveryState!.selectorHealingAttempts += 1;
      return {
        success: true,
        message: healed.message || 'Locator healed.',
        healedAction: healed.action,
        healedSelector: healed.strategy?.value || healed.action.selector,
      };
    }

    case 'vision-fallback': {
      const healed = await defaultLocatorHealingEngine.heal(page, session, plan.action, context.roleHints, {
        allowVision: true,
        alreadyTried: plan.action.kind ? [] : [],
      });
      return {
        success: healed.success,
        message: healed.message || 'Vision fallback attempted.',
        healedAction: healed.action,
        healedSelector: healed.strategy?.value,
      };
    }

    case 'wait-network-idle':
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => page.waitForTimeout(1500));
      return { success: true, message: 'Waited for network idle.' };

    case 'refresh-page':
      await page.reload({ waitUntil: 'domcontentloaded' });
      return { success: true, message: 'Page refreshed.' };

    case 'go-back':
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      return { success: true, message: 'Navigated back in history.' };

    case 'reopen-route': {
      const checkpoint = latestCheckpoint(session);
      const url = checkpoint?.url || session.config.baseUrl;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return { success: true, message: `Reopened route ${url}.`, checkpointId: checkpoint?.id };
    }

    case 're-login': {
      const loginUrl =
        session.explorationContext?.environment.loginUrl ||
        session.config.baseUrl.replace(/\/?$/, '/login');
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
      return { success: true, message: `Navigated to login route ${loginUrl}.` };
    }

    case 'clear-modal':
      await dismissOverlay(page, ['close', 'dismiss', 'cancel', '×', 'x']);
      return { success: true, message: 'Attempted to clear modal or overlay.' };

    case 'dismiss-cookie-banner':
      await dismissOverlay(page, ['accept', 'agree', 'got it', 'allow', 'ok']);
      return { success: true, message: 'Attempted to dismiss cookie banner.' };

    case 'reset-form-state':
      await page.evaluate(() => {
        for (const form of Array.from(document.querySelectorAll('form'))) {
          form.reset();
        }
      });
      return { success: true, message: 'Reset form state on the page.' };

    case 'restore-checkpoint': {
      const checkpoint = latestCheckpoint(session);
      if (!checkpoint) {
        return { success: false, message: 'No checkpoint available to restore.' };
      }
      await page.goto(checkpoint.url, { waitUntil: 'domcontentloaded' });
      return {
        success: true,
        message: `Restored checkpoint at ${checkpoint.url}.`,
        checkpointId: checkpoint.id,
      };
    }

    default:
      return { success: false, message: `Unknown recovery strategy: ${strategy}` };
  }
}

async function dismissOverlay(page: Page, labels: string[]) {
  for (const label of labels) {
    const button = page.getByRole('button', { name: new RegExp(label, 'i') });
    if ((await button.count().catch(() => 0)) > 0) {
      await button.first().click({ timeout: 2000 }).catch(() => undefined);
      return;
    }
  }
}
