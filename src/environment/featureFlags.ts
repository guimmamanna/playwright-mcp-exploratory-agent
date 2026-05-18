import type { Page } from '@playwright/test';
import type { EnvironmentProfile, DetectedFeatureFlag, FeatureFlagSignals } from './types';

export const featureFlagDomScript = () => {
  const flags: Array<{ key: string; value?: string; source: 'dom' | 'window'; selector?: string }> = [];
  const gated: string[] = [];

  const record = (key: string, value: string | undefined, source: 'dom' | 'window', selector?: string) => {
    if (!flags.some((flag) => flag.key === key)) {
      flags.push({ key, value, source, selector });
    }
  };

  const windowFlags = (window as unknown as { __FEATURE_FLAGS__?: Record<string, boolean | string> }).__FEATURE_FLAGS__;
  if (windowFlags) {
    for (const [key, value] of Object.entries(windowFlags)) {
      record(key, String(value), 'window');
    }
  }

  for (const element of Array.from(document.querySelectorAll('[data-feature], [data-flag], [data-beta], [data-experiment]'))) {
    const key =
      element.getAttribute('data-feature') ||
      element.getAttribute('data-flag') ||
      element.getAttribute('data-beta') ||
      element.getAttribute('data-experiment');
    if (!key) continue;
    const selector = element.id ? `#${element.id}` : element.tagName.toLowerCase();
    record(key, element.getAttribute('data-enabled') || 'visible', 'dom', selector);
    gated.push(selector);
  }

  for (const element of Array.from(document.querySelectorAll('[class*="feature-"], [class*="beta-"], [aria-label*="beta" i]'))) {
    const label = element.getAttribute('aria-label') || element.className;
    if (/beta|feature flag|experiment/i.test(label)) {
      const selector = element.id ? `#${element.id}` : element.tagName.toLowerCase();
      record(label.slice(0, 60), 'visible', 'dom', selector);
      gated.push(selector);
    }
  }

  return { flags, gatedElements: gated.slice(0, 20) };
};

export async function detectFeatureFlags(page: Page): Promise<FeatureFlagSignals> {
  const dom = await page.evaluate(featureFlagDomScript);
  return {
    flags: dom.flags.map((flag) => ({ ...flag, source: flag.source })),
    gatedElements: dom.gatedElements,
    summary: `flags=${dom.flags.length}; gated=${dom.gatedElements.length}`,
  };
}

export function compareFeatureFlags(
  environment: EnvironmentProfile,
  detected: DetectedFeatureFlag[],
): Array<{ key: string; expected?: boolean | string; actual?: string; issue: string }> {
  const mismatches: Array<{ key: string; expected?: boolean | string; actual?: string; issue: string }> = [];

  for (const [key, expected] of Object.entries(environment.featureFlags)) {
    const match = detected.find((flag) => flag.key.toLowerCase() === key.toLowerCase());
    if (!match && expected === true) {
      mismatches.push({
        key,
        expected,
        issue: `Expected feature "${key}" to be visible in ${environment.name} but no gated UI was detected.`,
      });
    }
  }

  return mismatches;
}
