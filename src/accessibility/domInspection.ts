import type { Page } from '@playwright/test';
import type { AccessibilityIssue, DomInspectionResult } from './types';

export const domInspectionScript = () => {
  const issues: Array<{
    id: string;
    issueType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    wcagReference?: string;
    affectedSelector?: string;
    affectedRole?: string;
    affectedName?: string;
    recommendation: string;
  }> = [];

  const isVisible = (element: Element) => {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
  };

  const cssPath = (element: Element) => {
    const id = element.getAttribute('id');
    if (id) return `#${CSS.escape(id)}`;
    const testId = element.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    return element.tagName.toLowerCase();
  };

  const accessibleName = (element: Element) => {
    const labelledBy = element.getAttribute('aria-labelledby');
    const labelledText = labelledBy
      ?.split(/\s+/)
      .map((token) => document.getElementById(token)?.textContent || '')
      .join(' ')
      .trim();
    return (
      element.getAttribute('aria-label') ||
      labelledText ||
      (element instanceof HTMLInputElement && element.labels?.[0]?.textContent) ||
      (element instanceof HTMLTextAreaElement && element.labels?.[0]?.textContent) ||
      (element instanceof HTMLSelectElement && element.labels?.[0]?.textContent) ||
      element.getAttribute('placeholder') ||
      element.getAttribute('title') ||
      (element.textContent || '').replace(/\s+/g, ' ').trim() ||
      undefined
    );
  };

  const pushIssue = (issue: (typeof issues)[number]) => {
    issues.push(issue);
  };

  const interactiveSelector = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
  const interactive = Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible);

  for (const element of interactive) {
    const name = accessibleName(element);
    const selector = cssPath(element);
    const role = element.getAttribute('role') || element.tagName.toLowerCase();

    if (!name || name.length < 2) {
      pushIssue({
        id: `missing-name:${selector}`,
        issueType: 'missing-accessible-name',
        severity: 'medium',
        title: 'Missing accessible name',
        description: `Visible ${role} has no meaningful accessible name.`,
        wcagReference: 'WCAG 2.2 4.1.2 Name, Role, Value',
        affectedSelector: selector,
        affectedRole: role,
        recommendation: 'Provide visible text, aria-label, aria-labelledby, or an associated label element.',
      });
    }

    if (element.tagName.toLowerCase() === 'button' && !name) {
      pushIssue({
        id: `button-without-label:${selector}`,
        issueType: 'button-without-label',
        severity: 'high',
        title: 'Button without label',
        description: 'A visible button does not expose an accessible name.',
        wcagReference: 'WCAG 2.2 4.1.2 Name, Role, Value',
        affectedSelector: selector,
        affectedRole: 'button',
        recommendation: 'Add visible button text or aria-label that describes the action.',
      });
    }
  }

  for (const link of Array.from(document.querySelectorAll('a[href]')).filter(isVisible)) {
    const text = (link.textContent || '').replace(/\s+/g, ' ').trim();
    const name = accessibleName(link);
    if (!text || /^(click here|here|more|link)$/i.test(text)) {
      pushIssue({
        id: `link-text:${cssPath(link)}`,
        issueType: 'link-without-useful-text',
        severity: 'medium',
        title: 'Link without useful text',
        description: `Link "${name || text || cssPath(link)}" does not provide descriptive link text.`,
        wcagReference: 'WCAG 2.2 2.4.4 Link Purpose (In Context)',
        affectedSelector: cssPath(link),
        affectedRole: 'link',
        affectedName: name,
        recommendation: 'Use descriptive link text that explains the destination or action.',
      });
    }
  }

  for (const input of Array.from(document.querySelectorAll('input, select, textarea')).filter(isVisible)) {
    const selector = cssPath(input);
    const name = accessibleName(input);
    const hasLabel =
      name ||
      input.getAttribute('aria-label') ||
      input.getAttribute('aria-labelledby') ||
      (input instanceof HTMLInputElement && input.labels && input.labels.length > 0);
    if (!hasLabel) {
      pushIssue({
        id: `input-without-label:${selector}`,
        issueType: 'input-without-label',
        severity: 'high',
        title: 'Form input without label',
        description: 'A visible form control is not associated with an accessible label.',
        wcagReference: 'WCAG 2.2 1.3.1 Info and Relationships',
        affectedSelector: selector,
        affectedRole: input.getAttribute('role') || input.tagName.toLowerCase(),
        recommendation: 'Associate the control with a label element or provide aria-label / aria-labelledby.',
      });
    }
  }

  for (const element of Array.from(document.querySelectorAll('[aria-hidden="true"] *')).filter(isVisible)) {
    const focusable = element.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) {
      pushIssue({
        id: `aria-hidden-focusable:${cssPath(element)}`,
        issueType: 'invalid-aria',
        severity: 'high',
        title: 'Focusable element inside aria-hidden subtree',
        description: 'A focusable element is hidden from assistive technologies but still keyboard reachable.',
        wcagReference: 'WCAG 2.2 4.1.2 Name, Role, Value',
        affectedSelector: cssPath(element),
        recommendation: 'Remove aria-hidden from ancestors or remove the element from the tab order.',
      });
    }
  }

  for (const element of Array.from(document.querySelectorAll('[role]')).filter(isVisible)) {
    const role = element.getAttribute('role') || '';
    if (/^(foo|bar|clickable)$/i.test(role)) {
      pushIssue({
        id: `invalid-role:${cssPath(element)}`,
        issueType: 'invalid-aria',
        severity: 'medium',
        title: 'Invalid or non-standard ARIA role',
        description: `Element uses role="${role}" which is not a valid ARIA role.`,
        wcagReference: 'WCAG 2.2 4.1.2 Name, Role, Value',
        affectedSelector: cssPath(element),
        affectedRole: role,
        recommendation: 'Use a valid ARIA role from the specification or rely on native semantics.',
      });
    }
  }

  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')).filter(isVisible);
  const headingLevels = headings.map((heading) => {
    const ariaLevel = heading.getAttribute('aria-level');
    if (ariaLevel) return Number.parseInt(ariaLevel, 10);
    const match = heading.tagName.match(/^H(\d)$/i);
    return match ? Number.parseInt(match[1], 10) : 0;
  });

  if (!headingLevels.includes(1)) {
    pushIssue({
      id: 'heading-structure:no-h1',
      issueType: 'heading-structure',
      severity: 'medium',
      title: 'Missing level 1 heading',
      description: 'The page does not expose an h1 or aria-level="1" heading.',
      wcagReference: 'WCAG 2.2 1.3.1 Info and Relationships',
      recommendation: 'Add a single descriptive h1 that identifies the main page topic.',
    });
  }

  for (let index = 1; index < headingLevels.length; index += 1) {
    if (headingLevels[index] - headingLevels[index - 1] > 1) {
      pushIssue({
        id: `heading-structure:skip-${index}`,
        issueType: 'heading-structure',
        severity: 'low',
        title: 'Skipped heading level',
        description: `Heading levels jump from h${headingLevels[index - 1]} to h${headingLevels[index]}.`,
        wcagReference: 'WCAG 2.2 1.3.1 Info and Relationships',
        recommendation: 'Use consecutive heading levels to preserve document outline.',
      });
      break;
    }
  }

  const landmarks = ['main', 'nav', 'header', 'footer', 'aside', 'form', 'section[aria-label], section[aria-labelledby]'];
  const foundLandmarks = landmarks.filter((selector) => document.querySelector(selector));
  if (!foundLandmarks.some((selector) => selector.startsWith('main'))) {
    pushIssue({
      id: 'landmark:missing-main',
      issueType: 'missing-landmark',
      severity: 'medium',
      title: 'Missing main landmark',
      description: 'The page does not expose a main landmark for screen reader navigation.',
      wcagReference: 'WCAG 2.2 1.3.1 Info and Relationships',
      recommendation: 'Wrap primary content in <main> or role="main".',
    });
  }

  for (const image of Array.from(document.querySelectorAll('img')).filter(isVisible)) {
    if (!image.hasAttribute('alt')) {
      pushIssue({
        id: `missing-alt:${cssPath(image)}`,
        issueType: 'missing-alt-text',
        severity: 'medium',
        title: 'Image missing alt text',
        description: 'An image is visible without an alt attribute.',
        wcagReference: 'WCAG 2.2 1.1.1 Non-text Content',
        affectedSelector: cssPath(image),
        affectedRole: 'img',
        recommendation: 'Provide alt text that conveys the image purpose, or alt="" if decorative.',
      });
    }
  }

  for (const dialog of Array.from(document.querySelectorAll('[role="dialog"], dialog[open]')).filter(isVisible)) {
    const selector = cssPath(dialog);
    const labelled = dialog.getAttribute('aria-label') || dialog.getAttribute('aria-labelledby');
    if (!labelled) {
      pushIssue({
        id: `modal-without-name:${selector}`,
        issueType: 'inaccessible-modal',
        severity: 'high',
        title: 'Modal without accessible name',
        description: 'A visible dialog does not expose an accessible name.',
        wcagReference: 'WCAG 2.2 4.1.2 Name, Role, Value',
        affectedSelector: selector,
        affectedRole: 'dialog',
        recommendation: 'Provide aria-label or aria-labelledby for the dialog.',
      });
    }

    const focusable = Array.from(dialog.querySelectorAll(interactiveSelector)).filter(isVisible);
    if (!focusable.length) {
      pushIssue({
        id: `modal-no-focusable:${selector}`,
        issueType: 'inaccessible-modal',
        severity: 'high',
        title: 'Modal without keyboard-focusable controls',
        description: 'The dialog does not contain any keyboard-focusable elements.',
        wcagReference: 'WCAG 2.2 2.1.1 Keyboard',
        affectedSelector: selector,
        affectedRole: 'dialog',
        recommendation: 'Ensure the dialog contains focusable controls and initial focus moves into the dialog.',
      });
    }
  }

  const namesByKey = new Map<string, string[]>();
  for (const element of interactive) {
    const name = (accessibleName(element) || '').toLowerCase().trim();
    if (!name) continue;
    const role = element.getAttribute('role') || element.tagName.toLowerCase();
    const key = `${role}::${name}`;
    const selectors = namesByKey.get(key) || [];
    selectors.push(cssPath(element));
    namesByKey.set(key, selectors);
  }

  for (const [key, selectors] of namesByKey.entries()) {
    if (selectors.length > 1) {
      pushIssue({
        id: `duplicate-name:${key}`,
        issueType: 'duplicate-accessible-name',
        severity: 'low',
        title: 'Duplicate accessible name',
        description: `Multiple controls share the accessible name "${key.split('::')[1]}" (${selectors.join(', ')}).`,
        wcagReference: 'WCAG 2.2 1.3.1 Info and Relationships',
        affectedSelector: selectors[0],
        recommendation: 'Differentiate control names so assistive technology users can distinguish actions.',
      });
    }
  }

  for (const element of Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).filter(isVisible)) {
    const text = (element.textContent || '').trim();
    if (!text && !element.getAttribute('aria-label')) {
      pushIssue({
        id: `live-region-empty:${cssPath(element)}`,
        issueType: 'dynamic-content-announcement',
        severity: 'low',
        title: 'Live region without announcement content',
        description: 'A live region is present but does not contain text or an accessible label.',
        wcagReference: 'WCAG 2.2 4.1.3 Status Messages',
        affectedSelector: cssPath(element),
        recommendation: 'Populate live regions when dynamic content changes, or remove unused live regions.',
      });
    }
  }

  for (const element of Array.from(document.querySelectorAll('button, a, input, [tabindex]:not([tabindex="-1"])')).filter(isVisible)) {
    const style = window.getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth || '0');
    const boxShadow = style.boxShadow;
    if (outlineWidth === 0 && (!boxShadow || boxShadow === 'none')) {
      pushIssue({
        id: `focus-indicator:${cssPath(element)}`,
        issueType: 'focus-indicator',
        severity: 'low',
        title: 'Possible missing visible focus indicator',
        description: 'A focusable element may not expose a visible focus style.',
        wcagReference: 'WCAG 2.2 2.4.7 Focus Visible',
        affectedSelector: cssPath(element),
        recommendation: 'Provide a visible :focus or :focus-visible style with sufficient contrast.',
      });
      break;
    }
  }

  for (const element of Array.from(document.querySelectorAll('*')).filter(isVisible).slice(0, 200)) {
    const style = window.getComputedStyle(element);
    const color = style.color;
    const background = style.backgroundColor;
    if (color && background && color !== background && /rgb\((\d+), (\d+), (\d+)\)/.test(color) && /rgb\((\d+), (\d+), (\d+)\)/.test(background)) {
      const parse = (value: string) => value.match(/\d+/g)?.map(Number) || [0, 0, 0];
      const [cr, cg, cb] = parse(color);
      const [br, bg, bb] = parse(background);
      const luminance = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const l1 = 0.2126 * luminance(cr) + 0.7152 * luminance(cg) + 0.0722 * luminance(cb);
      const l2 = 0.2126 * luminance(br) + 0.7152 * luminance(bg) + 0.0722 * luminance(bb);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < 4.5 && (element.textContent || '').trim().length > 0) {
        pushIssue({
          id: `contrast:${cssPath(element)}`,
          issueType: 'low-contrast',
          severity: 'medium',
          title: 'Possible low contrast text',
          description: `Text may not meet 4.5:1 contrast (${ratio.toFixed(2)}:1 estimated).`,
          wcagReference: 'WCAG 2.2 1.4.3 Contrast (Minimum)',
          affectedSelector: cssPath(element),
          recommendation: 'Increase foreground/background contrast for body text.',
        });
        break;
      }
    }
  }

  return {
    issues,
    landmarks: foundLandmarks,
    headingLevels,
  };
};

export async function inspectDomAccessibility(page: Page): Promise<DomInspectionResult> {
  return page.evaluate(domInspectionScript);
}
