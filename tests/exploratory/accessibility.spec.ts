import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultAccessibilityEngine } from '../../src/accessibility/accessibilityEngine';
import { inspectDomAccessibility } from '../../src/accessibility/domInspection';
import { keyboardProbeIssues, probeKeyboardNavigation } from '../../src/accessibility/keyboardProbe';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { PlaywrightPageObserver } from '../../src/observer/playwrightPageObserver';
import { BugReporter } from '../../src/reporting/bugReporter';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { BasicValidator } from '../../src/validator/basicValidator';
import type { ExplorationSession, ExplorationStep } from '../../src/types';

function createSession(evidenceDirectory: string): ExplorationSession {
  return {
    id: 'accessibility-session',
    goal: {
      id: 'accessibility-goal',
      name: 'Accessibility goal',
      description: 'Verify accessibility intelligence.',
      priorities: ['accessibility', 'forms', 'navigation'],
    },
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://localhost:3000',
      evidenceDirectory,
      accessibilityAuditEnabled: true,
      keyboardNavigationCheckEnabled: true,
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

test('detects missing labels and heading structure issues', async ({ page }) => {
  await page.setContent(`
    <html>
      <body>
        <h3>Dashboard</h3>
        <button></button>
        <input />
        <a href="/next">click here</a>
        <img src="/logo.png" width="40" height="40" />
      </body>
    </html>
  `);

  const dom = await inspectDomAccessibility(page);

  expect(dom.issues.some((issue) => issue.issueType === 'button-without-label')).toBe(true);
  expect(dom.issues.some((issue) => issue.issueType === 'input-without-label')).toBe(true);
  expect(dom.issues.some((issue) => issue.issueType === 'heading-structure')).toBe(true);
  expect(dom.issues.some((issue) => issue.issueType === 'missing-alt-text')).toBe(true);
});

test('detects duplicate accessible names', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <button>Save</button>
      <button>Save</button>
    </body></html>
  `);

  const dom = await inspectDomAccessibility(page);
  expect(dom.issues.some((issue) => issue.issueType === 'duplicate-accessible-name')).toBe(true);
});

test('detects keyboard traps and unreachable controls', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <div id="trap">
        <button id="one">One</button>
        <button id="two">Two</button>
      <button id="outside" tabindex="-1">Outside</button>
    </body></html>
  `);

  const probe = await probeKeyboardNavigation(page, 12);
  const issues = keyboardProbeIssues(probe);

  expect(probe.focusOrder.length).toBeGreaterThan(0);
  expect(issues.some((issue) => issue.issueType === 'keyboard-blocker' || issue.issueType === 'keyboard-trap')).toBe(true);
});

test('detects modal focus handling issues', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <dialog open>
        <p>Confirm delete</p>
      </dialog>
    </body></html>
  `);

  const dom = await inspectDomAccessibility(page);
  expect(dom.issues.some((issue) => issue.issueType === 'inaccessible-modal')).toBe(true);
});

test('observer and validator surface accessibility findings and reports', async ({ page }) => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'accessibility-report-'));
  const session = createSession(evidenceDirectory);
  const observer = new PlaywrightPageObserver(page, { screenshotMode: 'always' });
  observer.attach();

  await page.setContent(`
    <html><body>
      <main>
        <h1>Profile</h1>
        <form>
          <input id="email" />
          <button type="submit">Save</button>
        </form>
      </main>
    </body></html>
  `);

  const before = await observer.observe(session, 'before', 'step-001');
  expect(before.accessibilitySignals?.issueCount).toBeGreaterThan(0);

  await page.click('button');
  await page.setContent(`
    <html><body>
      <main>
        <h1>Profile</h1>
        <form>
          <input id="email" />
          <button></button>
        </form>
      </main>
    </body></html>
  `);
  const after = await observer.observe(session, 'after', 'step-001');

  const findings = defaultAccessibilityEngine.findingsFromObservation(before);
  expect(findings.some((finding) => finding.category === 'accessibility')).toBe(true);

  const step: ExplorationStep = {
    id: 'step-001',
    index: 0,
    startedAt: '2026-05-17T00:00:00.000Z',
    endedAt: '2026-05-17T00:00:01.000Z',
    beforeObservation: before,
    afterObservation: after,
    observation: before,
    plan: {
      id: 'plan-001',
      action: { kind: 'click', target: 'Save' },
      rationale: 'Submit profile',
      expectedOutcome: 'Profile saves',
      validationIdea: 'No accessibility regressions',
      riskLevel: 'low',
      priority: 'forms',
    },
    execution: {
      status: 'success',
      startedAt: '2026-05-17T00:00:00.000Z',
      endedAt: '2026-05-17T00:00:01.000Z',
      action: { kind: 'click', target: 'Save' },
      actualOutcome: 'Clicked save',
    },
    findings: [],
    status: 'validated',
  };

  const validation = await new BasicValidator().validate({ session, step, execution: step.execution });
  expect(validation.findings.some((finding) => finding.type === 'accessibility')).toBe(true);

  session.steps.push(step);
  session.findings.push(...findings, ...validation.findings);

  const reportPath = await new MarkdownReporter(evidenceDirectory, new BugReporter(join(evidenceDirectory, 'bugs'))).writeSessionReport(
    session,
  );
  const report = await readFile(reportPath, 'utf8');
  expect(report).toContain('## Accessibility Summary');
  expect(report).toContain('WCAG');

  const bugReports = await new BugReporter(join(evidenceDirectory, 'bugs')).writeBugReports(session);
  expect(bugReports.some((bug) => bug.category === 'accessibility')).toBe(true);

  await rm(evidenceDirectory, { recursive: true, force: true });
});
