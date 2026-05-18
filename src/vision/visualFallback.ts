import type { Page } from '@playwright/test';
import type { AgentAction, ExplorationSession, LocatorStrategy } from '../types';
import type { VisionUIRegion } from './models/types';

function labelOf(action: AgentAction) {
  return (action.label || action.target || action.placeholder || action.text || '').toLowerCase();
}

export function findVisionRegion(session: ExplorationSession, action: AgentAction): VisionUIRegion | undefined {
  const regions = session.memory.observations.at(-1)?.visionSignals?.regions || [];
  const needle = labelOf(action);
  if (!needle) return regions.find((region) => region.kind === 'button' || region.kind === 'primary-cta');

  return regions.find((region) => (region.label || '').toLowerCase().includes(needle));
}

export async function clickVisionRegion(page: Page, region: VisionUIRegion) {
  const x = region.bounds.x + region.bounds.width / 2;
  const y = region.bounds.y + region.bounds.height / 2;
  await page.mouse.click(x, y);
  return { x, y };
}

export function visionLocatorStrategy(region: VisionUIRegion, coordinates: { x: number; y: number }): LocatorStrategy {
  return {
    type: 'vision',
    value: `${region.label || region.kind}@${coordinates.x},${coordinates.y}`,
    role: region.kind,
  };
}

export function shouldUseVisionFallback(session: ExplorationSession) {
  const understanding = session.memory.observations.at(-1)?.visionSignals?.understanding;
  if (!understanding) return false;
  return (
    understanding.weakDomStructure ||
    understanding.hasShadowDomHints ||
    understanding.hasCanvasRendering ||
    understanding.poorAccessibilityMetadata
  );
}
