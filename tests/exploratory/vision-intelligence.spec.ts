import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { PlaywrightPageObserver } from '../../src/observer/playwrightPageObserver';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { BugReporter } from '../../src/reporting/bugReporter';
import { extractOcrFromPage } from '../../src/vision/ocr';
import { collectDomRegions } from '../../src/vision/domFusion';
import { detectVisionAnomalies } from '../../src/vision/anomalyDetection';
import { VisionEngine } from '../../src/vision/visionEngine';
import { clickVisionRegion, findVisionRegion, visionLocatorStrategy } from '../../src/vision/visualFallback';
import { clearVisionCache } from '../../src/vision/cache';
import type { ExplorationSession } from '../../src/types';

function createSession(evidenceDirectory: string): ExplorationSession {
  return {
    id: 'vision-session',
    goal: {
      id: 'vision-goal',
      name: 'Vision goal',
      description: 'Validate multimodal vision intelligence.',
      priorities: ['navigation', 'forms', 'accessibility'],
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://localhost:3000',
      allowedDomains: ['localhost'],
      evidenceDirectory,
      visualIntelligenceEnabled: true,
      visionMultimodalEnabled: true,
      visionProvider: 'mock',
      visionMode: 'every-step',
    },
    startedAt: new Date().toISOString(),
    status: 'running',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory,
  };
}

test.beforeEach(() => {
  clearVisionCache();
});

test('extracts OCR text from visible UI', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <div role="alert">Payment failed: card declined</motion>
      <button aria-label="Retry payment">Retry</button>
    </body></html>
  `.replaceAll('motion', 'motion'));

  const ocr = await extractOcrFromPage(page);
  expect(ocr.lines.some((line) => /payment failed/i.test(line))).toBe(true);
  expect(ocr.summary.length).toBeGreaterThan(5);
});

test('detects blank page and modal regions', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(`<html><body></body></html>`);

  const dom = await collectDomRegions(page);
  const anomalies = detectVisionAnomalies({
    observation: createBlankObservation({ url: 'http://localhost:3000/blank', visibleTextSummary: '' }),
    regions: dom.regions,
    ocrLines: [],
    viewport: { width: 800, height: 600 },
  });

  expect(anomalies.some((item) => item.anomalyType === 'blank-page')).toBe(true);

  await page.setContent(`
    <html><body>
      <dialog open aria-label="Confirm delete" style="display:block;position:fixed;inset:20%">
        <p>Are you sure?</p>
        <button>Delete</button>
      </dialog>
      <dialog open aria-label="Confirm delete" style="display:block;position:fixed;inset:10%">
        <p>Duplicate?</p>
      </dialog>
    </body></html>
  `);

  const domWithModals = await collectDomRegions(page);
  const modalAnomalies = detectVisionAnomalies({
    observation: createBlankObservation({ url: 'http://localhost:3000/modal', visibleTextSummary: 'Are you sure Duplicate' }),
    regions: domWithModals.regions,
    ocrLines: ['Are you sure?', 'Duplicate?'],
    viewport: { width: 800, height: 600 },
  });

  expect(domWithModals.regions.some((region) => region.kind === 'modal')).toBe(true);
  expect(modalAnomalies.some((item) => item.anomalyType === 'duplicate-dialog')).toBe(true);
});

test('detects overlay collision anomalies', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10"></div>
      <button style="position:fixed;left:40px;top:40px;z-index:1">Submit</button>
    </body></html>
  `);

  const dom = await collectDomRegions(page);
  const anomalies = detectVisionAnomalies({
    observation: createBlankObservation({ url: 'http://localhost:3000/overlay', visibleTextSummary: 'Submit' }),
    regions: dom.regions,
    ocrLines: ['Submit'],
    viewport: { width: 800, height: 600 },
  });

  expect(anomalies.some((item) => item.anomalyType === 'overlay-collision')).toBe(true);
});

test('vision engine produces annotated screenshots and signals', async ({ page }) => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'vision-engine-'));
  const session = createSession(evidenceDirectory);

  await page.setContent(`
    <html><body>
      <nav><a href="/home">Home</a></nav>
      <form aria-label="Search form"><input placeholder="Search products" /><button type="submit">Search</button></form>
    </body></html>
  `);

  const observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
  const observation = await observer.observe(session);

  expect(observation.screenshotPath).toBeTruthy();
  const engine = new VisionEngine({ visionProvider: 'mock' });
  const signals = await engine.analyzePage(page, session, observation, session.config);
  expect(signals).toBeDefined();
  expect(signals?.regions.length).toBeGreaterThan(0);
  expect(signals?.ocrLines.length).toBeGreaterThan(0);
  if (signals?.annotatedScreenshotPath) {
    await access(signals.annotatedScreenshotPath);
  }

  await rm(evidenceDirectory, { recursive: true, force: true });
});

test('visual fallback interaction uses vision region coordinates', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(`
    <html><body>
      <button id="cta" aria-label="Continue flow" style="margin-top:120px;margin-left:80px"></button>
    </body></html>
  `);

  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'vision-fallback-'));
  const session = createSession(evidenceDirectory);
  const observation = await new PlaywrightPageObserver(page, { screenshotMode: 'always' }).observe(session);
  observation.visionSignals = await new VisionEngine({ visionProvider: 'mock' }).analyzePage(
    page,
    session,
    observation,
    session.config,
  );
  session.memory.observations.push(observation);

  const region = findVisionRegion(session, { kind: 'click', target: 'Continue flow' });
  expect(region).toBeDefined();

  const coordinates = await clickVisionRegion(page, region!);
  const strategy = visionLocatorStrategy(region!, coordinates);
  expect(strategy.type).toBe('vision');
  expect(coordinates.x).toBeGreaterThan(50);
  expect(coordinates.y).toBeGreaterThan(50);

  await rm(evidenceDirectory, { recursive: true, force: true });
});

test('caches visual analysis for repeated screenshots', async ({ page }) => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'vision-cache-'));
  const session = createSession(evidenceDirectory);
  await page.setContent('<html><body><button>Go</button></body></html>');
  const observation = await new PlaywrightPageObserver(page, { screenshotMode: 'always' }).observe(session);
  const engine = new VisionEngine({ visionProvider: 'mock' });

  const first = await engine.analyzePage(page, session, observation, session.config);
  const second = await engine.analyzePage(page, session, observation, session.config);
  expect(first).toBeDefined();
  expect(second?.cacheHit).toBe(true);

  await rm(evidenceDirectory, { recursive: true, force: true });
});

test('session report includes multimodal vision section', async () => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'vision-report-'));
  const session = createSession(evidenceDirectory);
  session.memory.observations.push(
    createBlankObservation({
      visionSignals: {
        provider: 'mock:mock-vision-v1',
        ocrTextSummary: 'Payment failed',
        ocrLines: ['Payment failed'],
        regions: [{ id: 'button:submit', kind: 'button', label: 'Submit', bounds: { x: 1, y: 1, width: 10, height: 10 }, confidence: 0.9, source: 'fused' }],
        anomalies: [],
        reasoning: {
          pageUsable: true,
          navigationAppearsBroken: false,
          formsAppearIncomplete: false,
          importantCtasVisible: true,
          summary: 'Primary CTA visible.',
        },
        understanding: {
          regions: [],
          fusedText: '',
          domElementCount: 1,
          visionConfidence: 0.9,
          weakDomStructure: false,
          hasShadowDomHints: false,
          hasCanvasRendering: false,
          poorAccessibilityMetadata: false,
        },
        domVisionConfidence: 0.9,
        summary: 'regions=1',
      },
    }),
  );

  const reportPath = await new MarkdownReporter(evidenceDirectory, new BugReporter(join(evidenceDirectory, 'bugs'))).writeSessionReport(
    session,
  );
  const markdown = await readFile(reportPath, 'utf8');
  expect(markdown).toContain('## Multimodal Vision Summary');
  expect(markdown).toContain('OCR summary');

  await rm(evidenceDirectory, { recursive: true, force: true });
});
