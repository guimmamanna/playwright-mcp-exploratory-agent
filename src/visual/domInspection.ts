import type { Page } from '@playwright/test';
import type { ViewportProfile, VisualIssue, VisualIssueType } from './types';

export const visualDomInspectionScript = (viewportName: string) => {
  const issues: Array<{
    id: string;
    issueType: VisualIssueType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    viewport: string;
    affectedSelector?: string;
    recommendation: string;
  }> = [];

  const push = (issue: (typeof issues)[number]) => issues.push(issue);

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

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (document.documentElement.scrollWidth > viewportWidth + 2) {
    push({
      id: `horizontal-scroll:${viewportName}`,
      issueType: 'horizontal-scroll',
      severity: viewportName === 'mobile' ? 'high' : 'medium',
      title: 'Horizontal scroll detected',
      description: `Page content is wider than the ${viewportName} viewport.`,
      viewport: viewportName,
      recommendation: 'Remove horizontal overflow by fixing widths, flex wrapping, or overflow rules.',
    });
  }

  const textNodes = Array.from(document.querySelectorAll('p, span, a, button, label, h1, h2, h3, h4, h5, h6')).filter(isVisible);
  for (const element of textNodes.slice(0, 40)) {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if ((style.overflow === 'hidden' || style.textOverflow === 'ellipsis') && box.width > 0 && element.scrollWidth > box.width + 2) {
      push({
        id: `clipped-text:${cssPath(element)}`,
        issueType: 'clipped-text',
        severity: 'medium',
        title: 'Clipped text candidate detected',
        description: 'Visible text may be clipped or truncated.',
        viewport: viewportName,
        affectedSelector: cssPath(element),
        recommendation: 'Allow text wrapping or increase container width on smaller viewports.',
      });
      break;
    }

    const fontSize = Number.parseFloat(style.fontSize || '0');
    if (viewportName === 'mobile' && fontSize > 0 && fontSize < 12) {
      push({
        id: `small-text:${cssPath(element)}`,
        issueType: 'small-text-candidate',
        severity: 'low',
        title: 'Unreadable small text candidate',
        description: `Text may be too small to read on ${viewportName} (${fontSize}px).`,
        viewport: viewportName,
        affectedSelector: cssPath(element),
        recommendation: 'Increase font size or spacing for mobile readability.',
      });
      break;
    }
  }

  const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'));
  for (const button of buttons) {
    const label = (button.textContent || button.getAttribute('aria-label') || '').trim();
    if (!/sign in|log in|submit|continue|checkout|buy|save|search|apply/i.test(label)) {
      continue;
    }
    const style = window.getComputedStyle(button);
    const box = button.getBoundingClientRect();
    const hidden = style.display === 'none' || style.visibility === 'hidden' || box.width === 0 || box.height === 0;
    const offscreen = box.bottom < 0 || box.top > viewportHeight || box.right < 0 || box.left > viewportWidth;
    if (hidden || offscreen) {
      push({
        id: `hidden-primary-button:${cssPath(button)}`,
        issueType: 'hidden-primary-button',
        severity: 'high',
        title: 'Primary action may be hidden',
        description: `Important button "${label}" is not visible in the ${viewportName} viewport.`,
        viewport: viewportName,
        affectedSelector: cssPath(button),
        recommendation: 'Ensure primary actions remain visible and reachable on smaller viewports.',
      });
      break;
    }
  }

  for (const image of Array.from(document.querySelectorAll('img')).filter(isVisible)) {
    const selector = cssPath(image);
    const alt = image.getAttribute('alt');
    const complete = (image as HTMLImageElement).complete;
    const naturalWidth = (image as HTMLImageElement).naturalWidth;
    if (!complete || naturalWidth === 0) {
      push({
        id: `broken-image:${selector}`,
        issueType: 'broken-image',
        severity: 'medium',
        title: 'Broken image detected',
        description: `Image ${selector} failed to load or has zero dimensions.`,
        viewport: viewportName,
        affectedSelector: selector,
        recommendation: 'Fix image source URLs and provide fallback content.',
      });
    } else if (!alt && !image.getAttribute('aria-hidden')) {
      const box = image.getBoundingClientRect();
      if (box.width >= 24 && box.height >= 24) {
        push({
          id: `missing-icon:${selector}`,
          issueType: 'missing-icon',
          severity: 'low',
          title: 'Missing icon or image label',
          description: 'A visible image/icon lacks alternative text.',
          viewport: viewportName,
          affectedSelector: selector,
          recommendation: 'Provide alt text or mark decorative images appropriately.',
        });
      }
    }

    const box = image.getBoundingClientRect();
    if (box.width >= 40 && box.height >= 40 && (!image.getAttribute('src') || image.getAttribute('src') === '')) {
      push({
        id: `empty-image:${selector}`,
        issueType: 'empty-image-placeholder',
        severity: 'medium',
        title: 'Empty image placeholder detected',
        description: 'A large image element has no usable source.',
        viewport: viewportName,
        affectedSelector: selector,
        recommendation: 'Populate the image source or remove the placeholder element.',
      });
    }
  }

  const positioned = Array.from(document.querySelectorAll('*')).filter(isVisible).slice(0, 120);
  for (let i = 0; i < positioned.length; i += 1) {
    const a = positioned[i];
    const aBox = a.getBoundingClientRect();
    if (aBox.width < 8 || aBox.height < 8) continue;
    for (let j = i + 1; j < Math.min(positioned.length, i + 12); j += 1) {
      const b = positioned[j];
      const bBox = b.getBoundingClientRect();
      const overlap =
        aBox.left < bBox.right &&
        aBox.right > bBox.left &&
        aBox.top < bBox.bottom &&
        aBox.bottom > bBox.top;
      if (overlap && a !== b) {
        push({
          id: `overlap:${cssPath(a)}:${cssPath(b)}`,
          issueType: 'overlapping-elements',
          severity: 'medium',
          title: 'Overlapping elements detected',
          description: `Elements ${cssPath(a)} and ${cssPath(b)} overlap in the ${viewportName} layout.`,
          viewport: viewportName,
          affectedSelector: cssPath(a),
          recommendation: 'Adjust spacing, z-index, or responsive layout rules to prevent overlap.',
        });
        i = positioned.length;
        break;
      }
    }
  }

  for (const element of Array.from(document.querySelectorAll('[role="dialog"], dialog[open], .modal')).filter(isVisible)) {
    const box = element.getBoundingClientRect();
    if (box.width > viewportWidth || box.height > viewportHeight || box.left < 0 || box.top < 0) {
      push({
        id: `modal-overflow:${cssPath(element)}`,
        issueType: 'modal-overflow',
        severity: 'high',
        title: 'Modal overflows viewport',
        description: 'A dialog or modal extends beyond the visible viewport.',
        viewport: viewportName,
        affectedSelector: cssPath(element),
        recommendation: 'Constrain modal width/height and enable internal scrolling on small screens.',
      });
      break;
    }
  }

  const sticky = Array.from(document.querySelectorAll('header, [style*="position: sticky"], [style*="position: fixed"]')).filter(isVisible);
  if (sticky.length) {
    const headerBox = sticky[0].getBoundingClientRect();
    const covered = Array.from(document.querySelectorAll('main a, main button, main input')).find((element) => {
      const box = element.getBoundingClientRect();
      return box.top < headerBox.bottom && box.bottom > 0;
    });
    if (covered) {
      push({
        id: `sticky-header:${viewportName}`,
        issueType: 'sticky-header-overlap',
        severity: 'medium',
        title: 'Sticky header may cover content',
        description: 'Fixed or sticky header appears to overlap primary content.',
        viewport: viewportName,
        affectedSelector: cssPath(sticky[0]),
        recommendation: 'Add top padding to main content or reduce sticky header height on smaller viewports.',
      });
    }
  }

  for (const element of Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]')).filter(isVisible)) {
    const box = element.getBoundingClientRect();
    if (box.right > viewportWidth + 2 || box.bottom > viewportHeight + 2 || box.left < -2 || box.top < -2) {
      push({
        id: `outside-viewport:${cssPath(element)}`,
        issueType: 'outside-viewport',
        severity: 'medium',
        title: 'Interactive element outside viewport',
        description: 'A visible control is positioned outside the current viewport bounds.',
        viewport: viewportName,
        affectedSelector: cssPath(element),
        recommendation: 'Bring controls into the viewport or provide responsive repositioning.',
      });
      break;
    }
  }

  return issues;
};

export async function inspectVisualDom(page: Page, viewport: ViewportProfile): Promise<VisualIssue[]> {
  const results = await page.evaluate(visualDomInspectionScript, viewport.name);
  return results.map((issue) => ({
    ...issue,
    viewport: viewport.name,
  }));
}
