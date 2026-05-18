import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { PlaywrightPageObserver } from '../../src/observer/playwrightPageObserver';
import type { ExplorationSession } from '../../src/types';

function createSession(evidenceDirectory: string): ExplorationSession {
  return {
    id: 'observer-test-session',
    goal: {
      id: 'observer-test-goal',
      name: 'Observer test goal',
      description: 'Verify page observation capture.',
      priorities: ['navigation', 'forms', 'accessibility', 'console-network'],
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://example.com',
      allowedDomains: ['example.com'],
      evidenceDirectory,
      screenshotMode: 'every-step',
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

test('PlaywrightPageObserver captures page state, errors, failed requests, and screenshot evidence', async ({
  page,
}) => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'observer-evidence-'));
  const session = createSession(evidenceDirectory);
  const observer = new PlaywrightPageObserver(page, {
    screenshotMode: 'always',
  });
  observer.attach();

  await page.route('http://example.com/demo', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <!doctype html>
        <html>
          <head>
            <title>Observer Demo</title>
            <script>
              console.error('demo console failure');
              fetch('/api/fail').catch(() => {});
            </script>
          </head>
          <body>
            <main>
              <h1>Account Search</h1>
              <a href="/settings">Settings</a>
              <button aria-label="Run search">Search</button>
              <form aria-label="Profile form">
                <label>Name <input name="name" required /></label>
                <input name="unlabelled" />
                <button type="submit">Save</button>
              </form>
              <img src="/bad.png">
            </main>
          </body>
        </html>
      `,
    });
  });
  await page.route('http://example.com/api/fail', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":true}' });
  });
  await page.route('http://example.com/bad.png', async (route) => {
    await route.fulfill({ status: 404, contentType: 'image/png', body: '' });
  });

  await page.goto('http://example.com/demo', { waitUntil: 'networkidle' }).catch(async () => {
    await page.waitForLoadState('domcontentloaded');
  });

  const observation = await observer.observe(session, 'before', 'step-001');

  expect(observation.url).toBe('http://example.com/demo');
  expect(observation.title).toBe('Observer Demo');
  expect(observation.visibleTextSummary).toContain('Account Search');
  expect(observation.links.some((link) => link.label === 'Settings')).toBe(true);
  expect(observation.buttons.some((button) => button.label === 'Run search')).toBe(true);
  expect(observation.inputs.length).toBeGreaterThanOrEqual(2);
  expect(observation.forms[0].fieldCount).toBe(2);
  expect(observation.forms[0].labelsMissing).toBe(1);
  expect(observation.accessibilitySnapshot).toContain('interactiveWithoutLabels');
  expect(observation.consoleMessages.some((message) => message.text.includes('demo console failure'))).toBe(
    true,
  );
  expect(observation.failedNetworkRequests.some((request) => request.status === 500)).toBe(true);
  expect(observation.failedNetworkRequests.some((request) => request.status === 404)).toBe(true);
  expect(observation.screenshotPath).toBeTruthy();

  const screenshotStats = await stat(observation.screenshotPath!);
  expect(screenshotStats.size).toBeGreaterThan(0);
});
