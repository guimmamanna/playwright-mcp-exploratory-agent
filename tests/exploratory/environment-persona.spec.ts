import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { checkEnvironmentSafety } from '../../src/environment/safetyRules';
import { getEnvironmentProfile } from '../../src/environment/profiles';
import { resolveExplorationContext } from '../../src/environment/explorationContext';
import { detectFeatureFlags } from '../../src/environment/featureFlags';
import { validateLocale } from '../../src/environment/localeValidation';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { RiskBasedPlanner } from '../../src/planner/riskBasedPlanner';
import { evaluateActionPolicy } from '../../src/personas/actionPolicy';
import { getPersonaProfile } from '../../src/personas/profiles';
import { MarkdownReporter } from '../../src/reporting/markdownReporter';
import { BugReporter } from '../../src/reporting/bugReporter';
import type { ExplorationSession } from '../../src/types';

function createSession(overrides: Partial<ExplorationSession> = {}): ExplorationSession {
  const resolved = resolveExplorationContext({
    environmentId: 'qa',
    personaId: 'readonly-user',
    config: {
      ...defaultExplorationConfig,
      baseUrl: 'http://localhost:3000',
      allowedDomains: ['localhost'],
    },
  });

  return {
    id: 'env-persona-session',
    goal: resolved.goal,
    config: resolved.config,
    explorationContext: resolved.context,
    startedAt: new Date().toISOString(),
    status: 'running',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: defaultExplorationConfig.evidenceDirectory,
    ...overrides,
  };
}

test('resolves environment and persona profiles into config and goal', () => {
  const resolved = resolveExplorationContext({
    environmentId: 'uat',
    personaId: 'admin',
  });

  expect(resolved.config.environmentName).toBe('uat');
  expect(resolved.config.persona).toBe('admin');
  expect(resolved.config.locale).toBe('en-US');
  expect(resolved.goal.priorities).toEqual(getPersonaProfile('admin').explorationPriorities);
  expect(resolved.context.environment.featureFlags).toEqual(getEnvironmentProfile('uat').featureFlags);
});

test('environment safety rules block destructive actions in production-like environments', () => {
  const environment = getEnvironmentProfile('production-like');
  const blocked = checkEnvironmentSafety(environment, {
    kind: 'click',
    target: 'Delete account',
    reason: 'Remove user account',
  });

  expect(blocked.allowed).toBe(false);
  expect(blocked.reason?.toLowerCase()).toContain('production');
});

test('persona-based action filtering blocks edit flows for readonly users', () => {
  const session = createSession();
  const policy = evaluateActionPolicy({
    session,
    action: { kind: 'fill', target: 'Edit profile name', reason: 'Update profile field' },
    candidateText: 'edit profile save changes',
  });

  expect(policy.allowed).toBe(false);
  expect(policy.source).toBe('persona');
});

test('readonly persona planner prefers safe navigation over edit actions', async () => {
  const session = createSession();
  const observation = createBlankObservation({
    url: 'http://localhost:3000/dashboard',
    links: [
      { kind: 'link', label: 'View reports', href: '/reports', visible: true },
      { kind: 'link', label: 'Edit profile', href: '/profile/edit', visible: true },
    ],
    buttons: [
      { kind: 'button', label: 'Save changes', selectorHint: '#save', visible: true },
      { kind: 'button', label: 'View dashboard', selectorHint: '#view', visible: true },
    ],
  });

  const plan = await new RiskBasedPlanner().planNextAction({ session, observation, findings: [] });
  const actionText = [plan.action.kind, plan.action.target, plan.action.reason].join(' ').toLowerCase();
  expect(actionText).not.toMatch(/edit|save changes/);
});

test('detects feature-flag-dependent UI in the DOM', async ({ page }) => {
  await page.setContent(`
    <html><body>
      <div data-feature="betaDashboard" data-enabled="true">Beta dashboard</motion>
      <button data-beta="newCheckout">Try checkout</button>
    </body></html>
  `.replaceAll('motion', 'div'));

  const signals = await detectFeatureFlags(page);
  expect(signals.flags.some((flag) => flag.key === 'betaDashboard')).toBe(true);
  expect(signals.gatedElements.length).toBeGreaterThan(0);
});

test('validates locale-specific language and currency hints', async ({ page }) => {
  const environment = getEnvironmentProfile('qa');
  await page.setContent(`
    <html lang="en-GB"><body>
      <p>Total: £19.99</p>
      <time datetime="2026-05-17">17/05/2026</time>
    </body></html>
  `);

  const signals = await validateLocale(page, environment);
  expect(signals.languageTag).toBe('en-GB');
  expect(signals.currencySamples.some((sample) => sample.includes('£'))).toBe(true);
});

test('anonymous persona prioritises signup and login flows', async () => {
  const resolved = resolveExplorationContext({ environmentId: 'local', personaId: 'anonymous-visitor' });
  const session = createSession({
    goal: resolved.goal,
    config: resolved.config,
    explorationContext: resolved.context,
  });

  const observation = createBlankObservation({
    url: 'http://localhost:3000',
    links: [
      { kind: 'link', label: 'Pricing', href: '/pricing', visible: true },
      { kind: 'link', label: 'Sign in', href: '/login', visible: true },
    ],
    buttons: [{ kind: 'button', label: 'Search', selectorHint: '#search', visible: true }],
  });

  const plan = await new RiskBasedPlanner().planNextAction({ session, observation, findings: [] });
  expect(['click', 'navigate']).toContain(plan.action.kind);
  expect([plan.action.target, plan.action.url, plan.rationale].join(' ')).toMatch(/sign in|login|pricing|auth/i);
});

test('session report includes environment, persona, and blocked action context', async () => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'env-persona-report-'));
  const session = createSession();
  session.memory.skippedRiskyActions.push({
    signature: 'fill:profile',
    reason: 'Blocked for persona "Read-only user": flow matches a restricted pattern.',
    url: 'http://localhost:3000/profile',
    timestamp: new Date().toISOString(),
    blockedBy: 'persona',
  });
  session.findings.push({
    id: 'finding-1',
    type: 'safety',
    severity: 'low',
    category: 'functional',
    title: 'Blocked edit attempt',
    description: 'Readonly persona blocked an edit action.',
    url: 'http://localhost:3000/profile',
    evidence: [],
    reproductionSteps: [],
    status: 'new',
  });

  const reportPath = await new MarkdownReporter(evidenceDirectory, new BugReporter(join(evidenceDirectory, 'bugs'))).writeSessionReport(
    session,
  );
  const markdown = await readFile(reportPath, 'utf8');

  expect(markdown).toContain('## Environment and Persona Context');
  expect(markdown).toContain('Read-only user');
  expect(markdown).toContain('QA');
  expect(markdown).toContain('Persona-blocked actions: 1');

  await rm(evidenceDirectory, { recursive: true, force: true });
});
