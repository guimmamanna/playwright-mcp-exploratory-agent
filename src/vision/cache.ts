import type { VisionSignals } from './models/types';

const cache = new Map<string, VisionSignals>();

export function visionCacheKey(url: string, screenshotPath: string) {
  return `${url}::${screenshotPath}`;
}

export function getCachedVision(key: string) {
  const cached = cache.get(key);
  if (!cached) return undefined;
  return { ...cached, cacheHit: true };
}

export function setCachedVision(key: string, signals: VisionSignals) {
  cache.set(key, signals);
  if (cache.size > 100) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}

export function clearVisionCache() {
  cache.clear();
}
