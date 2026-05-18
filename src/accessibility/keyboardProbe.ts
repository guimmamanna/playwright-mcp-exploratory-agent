import type { Page } from '@playwright/test';
import type { AccessibilityIssue, KeyboardProbeResult } from './types';

function selectorOfActiveElement() {
  const element = document.activeElement;
  if (!element || element === document.body) {
    return 'body';
  }

  const id = element.getAttribute('id');
  if (id) return `#${CSS.escape(id)}`;

  const testId = element.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;

  const aria = element.getAttribute('aria-label');
  if (aria) return `${element.tagName.toLowerCase()}[aria-label="${aria}"]`;

  return element.tagName.toLowerCase();
}

export async function probeKeyboardNavigation(page: Page, maxTabs = 25): Promise<KeyboardProbeResult> {
  const focusOrder: string[] = [];
  let keyboardTrapDetected = false;
  let focusDisappeared = false;

  await page.evaluate(() => {
    const first = document.querySelector<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  });

  for (let index = 0; index < maxTabs; index += 1) {
    const active = await page.evaluate(selectorOfActiveElement);
    focusOrder.push(active);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
  }

  const unreachableControls = await page.evaluate(() => {
    const tabbable = Array.from(
      document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
    });

    const reached = new Set<string>();
    return tabbable
      .map((element) => {
        const id = element.getAttribute('id');
        if (id) return `#${CSS.escape(id)}`;
        const testId = element.getAttribute('data-testid');
        if (testId) return `[data-testid="${testId}"]`;
        return element.tagName.toLowerCase();
      })
      .filter((selector) => {
        if (reached.has(selector)) {
          return false;
        }
        reached.add(selector);
        return true;
      });
  });

  const reachedSet = new Set(focusOrder);
  const unreachable = unreachableControls.filter((selector) => !reachedSet.has(selector)).slice(0, 10);

  if (focusOrder.length >= 6) {
    const tail = focusOrder.slice(-6);
    const unique = new Set(tail);
    keyboardTrapDetected = unique.size <= 2;
  }

  focusDisappeared = focusOrder.filter((selector) => selector === 'body').length >= 3;

  return {
    focusOrder,
    unreachableControls: unreachable,
    keyboardTrapDetected,
    focusDisappeared,
  };
}

export function keyboardProbeIssues(probe: KeyboardProbeResult): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  if (probe.keyboardTrapDetected) {
    issues.push({
      id: 'keyboard-trap',
      issueType: 'keyboard-trap',
      severity: 'high',
      title: 'Keyboard trap detected',
      description: 'Tab navigation appears to cycle within the same controls without escape.',
      wcagReference: 'WCAG 2.2 2.1.2 No Keyboard Trap',
      recommendation: 'Ensure users can tab out of all components, especially modals and widgets.',
    });
  }

  if (probe.focusDisappeared) {
    issues.push({
      id: 'focus-disappeared',
      issueType: 'focus-disappeared',
      severity: 'medium',
      title: 'Focus disappears during keyboard navigation',
      description: 'Focus repeatedly returns to the document body while tabbing.',
      wcagReference: 'WCAG 2.2 2.4.3 Focus Order',
      recommendation: 'Keep focus visible on interactive elements and avoid tabindex misuse.',
    });
  }

  for (const selector of probe.unreachableControls) {
    issues.push({
      id: `unreachable:${selector}`,
      issueType: 'keyboard-blocker',
      severity: 'high',
      title: 'Keyboard unreachable control',
      description: `Control ${selector} appears visible but was not reached during tab navigation.`,
      wcagReference: 'WCAG 2.2 2.1.1 Keyboard',
      affectedSelector: selector,
      recommendation: 'Ensure the control is keyboard focusable and not blocked by tabindex or overlays.',
    });
  }

  return issues;
}
