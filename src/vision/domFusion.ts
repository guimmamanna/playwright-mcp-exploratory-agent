import type { Page } from '@playwright/test';
import type { Observation } from '../types';
import type { UnifiedUIUnderstanding, VisionUIRegion } from './models/types';

export const domRegionScript = () => {
  const regions: Array<{
    id: string;
    kind: string;
    label?: string;
    bounds: { x: number; y: number; width: number; height: number };
    selectorHint?: string;
    disabled?: boolean;
  }> = [];

  const push = (args: (typeof regions)[number]) => regions.push(args);

  const isVisible = (element: Element) => {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 2 && box.height > 2;
  };

  const cssPath = (element: Element) => {
    const id = element.getAttribute('id');
    if (id) return `#${CSS.escape(id)}`;
    const testId = element.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    return element.tagName.toLowerCase();
  };

  for (const element of Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(isVisible)) {
    const box = element.getBoundingClientRect();
    push({
      id: `button:${cssPath(element)}`,
      kind: /sign in|log in|submit|continue|buy|save|search/i.test(element.textContent || '')
        ? 'primary-cta'
        : 'button',
      label: (element.textContent || element.getAttribute('aria-label') || '').trim(),
      bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      selectorHint: cssPath(element),
      disabled: (element as HTMLButtonElement).disabled,
    });
  }

  for (const form of Array.from(document.querySelectorAll('form')).filter(isVisible)) {
    const box = form.getBoundingClientRect();
    push({
      id: `form:${cssPath(form)}`,
      kind: 'form',
      label: form.getAttribute('aria-label') || form.getAttribute('name') || 'form',
      bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      selectorHint: cssPath(form),
    });
  }

  for (const element of Array.from(document.querySelectorAll('[role="dialog"], dialog[open], .modal')).filter(isVisible)) {
    const box = element.getBoundingClientRect();
    push({
      id: `modal:${cssPath(element)}`,
      kind: 'modal',
      label: element.getAttribute('aria-label') || 'modal',
      bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      selectorHint: cssPath(element),
    });
  }

  for (const element of Array.from(document.querySelectorAll('nav, header, [role="navigation"]')).filter(isVisible).slice(0, 3)) {
    const box = element.getBoundingClientRect();
    push({
      id: `nav:${cssPath(element)}`,
      kind: 'navigation',
      label: 'navigation',
      bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      selectorHint: cssPath(element),
    });
  }

  for (const element of Array.from(document.querySelectorAll('[role="alert"], .alert, .toast')).filter(isVisible)) {
    const box = element.getBoundingClientRect();
    push({
      id: `alert:${cssPath(element)}`,
      kind: 'alert',
      label: (element.textContent || '').trim().slice(0, 80),
      bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      selectorHint: cssPath(element),
    });
  }

  const overlays = Array.from(document.querySelectorAll('[class*="overlay"], [class*="backdrop"], [aria-modal="true"]')).filter(isVisible);
  for (const element of overlays.slice(0, 4)) {
    const box = element.getBoundingClientRect();
    push({
      id: `overlay:${cssPath(element)}`,
      kind: 'overlay',
      label: 'overlay',
      bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      selectorHint: cssPath(element),
    });
  }

  return {
    regions,
    hasShadowDom: Boolean(document.querySelector('*')?.shadowRoot),
    hasCanvas: document.querySelectorAll('canvas').length > 0,
    poorAccessibility: document.querySelectorAll('button:not([aria-label]):empty, input:not([aria-label]):not([id])').length > 3,
  };
};

export async function collectDomRegions(page: Page): Promise<{
  regions: VisionUIRegion[];
  hasShadowDom: boolean;
  hasCanvas: boolean;
  poorAccessibility: boolean;
}> {
  const result = await page.evaluate(domRegionScript);
  return {
    regions: result.regions.map((region) => ({
      id: region.id,
      kind: region.kind as VisionUIRegion['kind'],
      label: region.label,
      bounds: region.bounds,
      confidence: 0.85,
      source: 'dom',
      selectorHint: region.selectorHint,
    })),
    hasShadowDom: result.hasShadowDom,
    hasCanvas: result.hasCanvas,
    poorAccessibility: result.poorAccessibility,
  };
}

export function fuseUnderstanding(args: {
  observation: Observation;
  domRegions: VisionUIRegion[];
  visionRegions: VisionUIRegion[];
  ocrLines: string[];
  hasShadowDom: boolean;
  hasCanvas: boolean;
  poorAccessibility: boolean;
}): UnifiedUIUnderstanding {
  const merged = new Map<string, VisionUIRegion>();
  for (const region of [...args.domRegions, ...args.visionRegions]) {
    const existing = merged.get(region.id);
    if (!existing || region.confidence > existing.confidence) {
      merged.set(region.id, { ...region, source: existing ? 'fused' : region.source });
    }
  }

  const regions = Array.from(merged.values());
  const interactiveCount = args.observation.interactiveElements.length;
  const labeledCount = args.observation.interactiveElements.filter((element) => element.label || element.placeholder).length;
  const weakDomStructure = interactiveCount > 0 && labeledCount / interactiveCount < 0.4;

  return {
    regions,
    fusedText: [args.observation.visibleTextSummary, args.ocrLines.join(' ')].filter(Boolean).join(' ').slice(0, 1200),
    domElementCount: interactiveCount,
    visionConfidence: regions.length ? regions.reduce((sum, region) => sum + region.confidence, 0) / regions.length : 0.5,
    weakDomStructure,
    hasShadowDomHints: args.hasShadowDom,
    hasCanvasRendering: args.hasCanvas,
    poorAccessibilityMetadata: args.poorAccessibility || (args.observation.accessibilitySignals?.issueCount || 0) > 2,
  };
}
