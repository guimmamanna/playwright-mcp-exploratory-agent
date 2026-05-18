import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { PlaywrightPageObserver } from '../../src/observer/playwrightPageObserver';
import { BugReporter } from '../../src/reporting/bugReporter';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { inspectVisualDom } from '../../src/visual/domInspection';
import { responsiveViewports, viewportByName } from '../../src/visual/viewports';
import { defaultVisualEngine } from '../../src/visual/visualEngine';
import type { ExplorationSession } from '../../src/types';

function createSession(evidenceDirectory: string): ExplorationSession {
  return {
    id: 'visual-session',
    goal: {
      id: 'visual-goal',
      name: 'Visual goal',
      description: 'Verify visual intelligence.',
      priorities: ['visual', 'navigation'],
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://localhost:3000',
      evidenceDirectory,
      visualIntelligenceEnabled: true,
      multiViewportVisualMode: true,
      visualComparisonEnabled: false,
    },
    startedAt: '2026-05-17T00:00:00.000Z',
    status: 'running',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory,
  };
}

test('responsive viewport configuration matches required breakpoints', () => {
  expect(responsiveViewports).toEqual([
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]);
  expect(viewportByName('mobile')).toEqual({ name: 'mobile', width: 390, height: 844 });
});

test('detects horizontal overflow on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <html><body style="margin:0">
      <div style="width:2000px;height:40px;background:#ccc">wide content</div>
    </body></html>
  `);

  const issues = await inspectVisualDom(page, { name: 'mobile', width: 390, height: 844 });
  expect(issues.some((issue) => issue.issueType === 'horizontal-scroll')).toBe(true);
});

test('detects broken images', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <img src="https://example.invalid/visual-broken.png" width="120" height="80" alt="broken" />
    </body></html>
  `);
  await page.waitForTimeout(400);

  const issues = await inspectVisualDom(page, { name: 'desktop', width: 1440, height: 900 });
  expect(issues.some((issue) => issue.issueType === 'broken-image')).toBe(true);
});

test('detects interactive elements outside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <html><body>
      <button style="position:absolute;left:500px;top:20px">Offscreen action</button>
    </body></html>
  `);

  const issues = await inspectVisualDom(page, { name: 'mobile', width: 390, height: 844 });
  expect(issues.some((issue) => issue.issueType === 'outside-viewport')).toBe(true);
});

test('detects clipped text candidates', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <p id="clip" style="width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        This label is intentionally long enough to clip
      </p>
    </body></html>
  `);

  const issues = await inspectVisualDom(page, { name: 'desktop', width: 1440, height: 900 });
  expect(issues.some((issue) => issue.issueType === 'clipped-text')).toBe(true);
});

test('captures viewport screenshots and reports visual findings', async ({ page }) => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'visual-intel-'));
  const session = createSession(evidenceDirectory);

  await page.setContent(`
    <html><body>
      <main>
        <button style="position:absolute;left:500px">Submit</button>
        <img src="https://example.invalid/missing.png" width="80" height="80" alt="" />
      </main>
    </body></html>
  `);

  const observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
  const observation = await observer.observe(session);

  expect(observation.visualSignals).toBeDefined();
  expect(observation.visualSignals?.captures.length).toBeGreaterThanOrEqual(3);
  expect(observation.visualSignals?.captures.every((capture) => capture.screenshotPath)).toBe(true);
  expect(observation.visualSignals?.issues.length).toBeGreaterThan(0);

  const findings = defaultVisualEngine.findingsFromObservation(observation);
  expect(findings.every((finding) => finding.category === 'visual')).toBe(true);
  expect(findings.some((finding) => finding.viewport)).toBe(true);

  session.findings.push(...findings);
  session.memory.observations.push(observation);

  const bugReports = await new BugReporter(join(evidenceDirectory, 'bugs')).writeBugReports(session);
  expect(bugReports.some((report) => report.category === 'visual')).toBe(true);

  const reportPath = await new MarkdownReporter(evidenceDirectory, new BugReporter(join(evidenceDirectory, 'bugs'))).writeSessionReport(
    session,
  );
  const markdown = await readFile(reportPath, 'utf8');
  expect(markdown).toContain('## Visual Summary');
  expect(markdown).toContain('Screenshots by viewport');

  await rm(evidenceDirectory, { recursive: true, force: true });
});

test('maps visual issues from observation factory signals', () => {
  const observation = createBlankObservation({
    url: 'http://localhost:3000/demo',
    visualSignals: {
      activeViewport: 'mobile',
      captures: [
        {
          viewport: 'mobile',
          width: 390,
          height: 844,
          screenshotPath: '/tmp/mobile.png',
          issueCount: 1,
        },
      ],
      issues: [
        {
          id: 'horizontal-scroll:mobile',
          issueType: 'horizontal-scroll',
          severity: 'high',
          title: 'Horizontal scroll detected',
          description: 'Overflow',
          viewport: 'mobile',
          recommendation: 'Fix overflow',
          screenshotPath: '/tmp/mobile.png',
        },
      ],
      summary: 'viewports=1; issues=1',
    },
  });

  const findings = defaultVisualEngine.findingsFromObservation(observation);
  expect(findings[0].category).toBe('visual');
  expect(findings[0].viewport).toBe('mobile');
  expect(findings[0].visualIssueType).toBe('horizontal-scroll');
});
