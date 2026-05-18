import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Page } from '@playwright/test';
import type { ViewportProfile } from './types';
import { screenshotPathFor } from './visualDiff';

export async function captureViewportScreenshot(
  page: Page,
  evidenceDirectory: string,
  url: string,
  viewport: ViewportProfile,
  phase = 'current',
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(150);
  const path = screenshotPathFor(evidenceDirectory, url, viewport.name, phase);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  return path;
}
