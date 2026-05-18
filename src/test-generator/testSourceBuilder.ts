import type {
  ExplorationSession,
  ExplorationStep,
  Finding,
  GeneratedTestConfidence,
  GeneratedTestFlowCategory,
  LocatorStrategy,
  NetworkEventRecord,
} from '../types';
import { mapInteractionHistoryToTest } from './interactionToTestMapping';
import { rankSelectorStrategies, selectorStrategiesForSteps } from './selectorStrategy';

export interface TestSourceBuildResult {
  source: string;
  selectorStrategies: LocatorStrategy[];
  assertionCount: number;
}

interface SourceOptions {
  session: ExplorationSession;
  title: string;
  steps: ExplorationStep[];
  generatedAt: string;
  flowCategory: GeneratedTestFlowCategory;
  confidenceScore: GeneratedTestConfidence;
  finding?: Finding;
  healedSelectors?: boolean;
}

function stringLiteral(value: string) {
  return JSON.stringify(value);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function regexLiteral(value: string) {
  return `/${escapeRegex(value)}/i`;
}

function variableName(step: ExplorationStep) {
  return `step${String(step.index + 1).padStart(3, '0')}Target`;
}

function safeStartUrl(session: ExplorationSession, steps: ExplorationStep[]) {
  const observedUrl = steps[0]?.beforeObservation.url;
  if (observedUrl && observedUrl !== 'about:blank') {
    return observedUrl;
  }
  return session.goal.targetUrl || session.config.baseUrl;
}

function textSummary(observation: ExplorationStep['afterObservation']) {
  return (observation?.visibleTextSummary || observation?.visibleText || '').replace(/\s+/g, ' ').trim();
}

function newVisiblePhrase(step: ExplorationStep) {
  const beforeText = (step.beforeObservation.visibleTextSummary || step.beforeObservation.visibleText || '').replace(/\s+/g, ' ').trim();
  const afterText = textSummary(step.afterObservation);

  if (!afterText || afterText === beforeText) {
    return undefined;
  }

  if (afterText.length <= 120) {
    return afterText;
  }

  const segments = afterText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 3 && segment.length <= 120 && !beforeText.includes(segment));

  return segments[0];
}

function locatorLine(step: ExplorationStep, healedSelectors: boolean) {
  const locators = rankSelectorStrategies(step);
  const name = variableName(step);
  const primary = locators[0];

  if (!primary) {
    return undefined;
  }

  if (healedSelectors) {
    const factories = locators.map((locator) => `    () => ${locator.expression}`).join(',\n');
    return `  const ${name} = await firstVisible(page, [\n${factories}\n  ]);`;
  }

  return `  const ${name} = ${primary.expression}.first();`;
}

function actionLines(step: ExplorationStep, healedSelectors: boolean) {
  const action = step.plan.action;
  const lines: string[] = [];

  switch (action.kind) {
    case 'navigate':
      if (action.url) {
        lines.push(`  await page.goto(${stringLiteral(action.url)}, { waitUntil: ${stringLiteral(action.loadState || 'domcontentloaded')} });`);
      }
      return lines;

    case 'goBack':
      lines.push("  await page.goBack({ waitUntil: 'domcontentloaded' });");
      return lines;

    case 'waitForLoadState':
      lines.push(`  await page.waitForLoadState(${stringLiteral(action.loadState || 'domcontentloaded')});`);
      return lines;

    case 'wait':
      lines.push("  await page.waitForLoadState('domcontentloaded');");
      return lines;

    case 'press':
      lines.push(`  await page.keyboard.press(${stringLiteral(action.key || action.value || 'Enter')});`);
      return lines;

    case 'noop':
    case 'screenshot':
    case 'stop':
      return lines;

    default:
      break;
  }

  const locator = locatorLine(step, healedSelectors);
  if (!locator) {
    return [];
  }

  const name = variableName(step);
  lines.push(locator);
  lines.push(`  await expect(${name}).toBeVisible();`);

  if (!['click'].includes(action.kind)) {
    lines.push(`  await expect(${name}).toBeEnabled();`);
  }

  switch (action.kind) {
    case 'click':
      lines.push(`  await ${name}.click();`);
      break;
    case 'fill':
      lines.push(`  await ${name}.fill(${stringLiteral(action.value || '')});`);
      break;
    case 'search':
      lines.push(`  await ${name}.fill(${stringLiteral(action.value || '')});`);
      lines.push(`  await ${name}.press(${stringLiteral(action.key || 'Enter')});`);
      break;
    case 'select':
      lines.push(`  await ${name}.selectOption({ label: ${stringLiteral(action.value || action.text || action.target || '')} });`);
      break;
    case 'check':
      lines.push(`  await ${name}.check();`);
      break;
    case 'uncheck':
      lines.push(`  await ${name}.uncheck();`);
      break;
    default:
      break;
  }

  return lines;
}

function validationMessagePhrase(step: ExplorationStep) {
  const failedCheck = step.validation?.result.checks?.find((check) => !check.passed && check.details);
  if (failedCheck?.details) {
    return failedCheck.details.slice(0, 120);
  }

  const afterText = textSummary(step.afterObservation);
  if (afterText && /\b(required|invalid|must be|enter a valid|please fill|missing|error|failed)\b/i.test(afterText)) {
    const match = afterText.match(
      /[^.!?\n]*\b(required|invalid|must be|enter a valid|please fill|missing|error|failed)[^.!?\n]*/i,
    );
    return match?.[0]?.trim().slice(0, 120);
  }

  return undefined;
}

function successMessagePhrase(step: ExplorationStep) {
  const afterText = textSummary(step.afterObservation);
  if (!afterText || !/\b(success|saved|created|updated|added|complete|completed|sent|submitted)\b/i.test(afterText)) {
    return undefined;
  }

  const match = afterText.match(
    /[^.!?\n]*\b(success|saved|created|updated|added|complete|completed|sent|submitted)[^.!?\n]*/i,
  );
  return match?.[0]?.trim().slice(0, 120);
}

function accessibilityAssertionLines(step: ExplorationStep, finding?: Finding) {
  const lines: string[] = [];
  const after = step.afterObservation;
  const snapshot = after?.accessibilitySnapshot?.trim();

  if (finding?.type === 'accessibility' && finding.description) {
    lines.push(`  await expect(page.getByText(${regexLiteral(finding.description.slice(0, 120))}).first()).toBeVisible();`);
    return lines;
  }

  if (!snapshot) {
    return lines;
  }

  const landmarkMatch = snapshot.match(/\b(main|navigation|banner|contentinfo|complementary)\b/i);
  if (landmarkMatch) {
    lines.push(`  await expect(page.getByRole(${stringLiteral(landmarkMatch[1].toLowerCase())})).toBeVisible();`);
  }

  return lines;
}

function assertionLines(step: ExplorationStep, finding?: Finding) {
  const lines: string[] = [];
  const after = step.afterObservation;

  if (!after) {
    return lines;
  }

  if (after.url && after.url !== step.beforeObservation.url) {
    lines.push(`  await expect(page).toHaveURL(${stringLiteral(after.url)});`);
  }

  if (after.title && after.title !== step.beforeObservation.title) {
    lines.push(`  await expect(page).toHaveTitle(${stringLiteral(after.title)});`);
  }

  const successPhrase = successMessagePhrase(step);
  if (successPhrase) {
    lines.push(`  await expect(page.getByText(${regexLiteral(successPhrase)}).first()).toBeVisible();`);
  }

  const validationPhrase = validationMessagePhrase(step);
  if (validationPhrase && (finding || step.validation?.result.passed === false)) {
    lines.push(`  await expect(page.getByText(${regexLiteral(validationPhrase)}).first()).toBeVisible();`);
  }

  const phrase = newVisiblePhrase(step);
  if (phrase && phrase !== successPhrase && phrase !== validationPhrase) {
    lines.push(`  await expect(page.getByText(${regexLiteral(phrase)}).first()).toBeVisible();`);
  }

  lines.push(...accessibilityAssertionLines(step, finding));

  return lines;
}

function networkNeedle(request: NetworkEventRecord) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

function bugAssertionLines(finding: Finding | undefined, steps: ExplorationStep[]) {
  if (!finding) {
    return [];
  }

  const step = finding.stepId ? steps.find((candidate) => candidate.id === finding.stepId) || steps.at(-1) : steps.at(-1);
  const after = step?.afterObservation;

  if (finding.type === 'network-failure') {
    const request = after?.failedNetworkRequests?.[0];
    if (request) {
      const needle = networkNeedle(request);
      const status = request.status ? String(request.status) : undefined;
      return [
        `  expect(failedNetworkRequests.some((request) => request.includes(${stringLiteral(needle)})${
          status ? ` && request.includes(${stringLiteral(status)})` : ''
        })).toBeTruthy();`,
      ];
    }
  }

  if (finding.type === 'console-error') {
    const errorText = after?.consoleMessages.find((message) => message.level === 'error')?.text || finding.description;
    return [`  expect(consoleErrors.some((message) => message.includes(${stringLiteral(errorText.slice(0, 120))}))).toBeTruthy();`];
  }

  const phrase = finding.actualResult || finding.description || textSummary(after);
  if (phrase) {
    return [`  await expect(page.getByText(${regexLiteral(phrase.slice(0, 120))}).first()).toBeVisible();`];
  }

  return [];
}

function includeNetworkInstrumentation(finding?: Finding) {
  return finding?.type === 'network-failure';
}

function includeConsoleInstrumentation(finding?: Finding) {
  return finding?.type === 'console-error';
}

function helperSource(healedSelectors: boolean) {
  if (!healedSelectors) {
    return '';
  }

  return `
async function firstVisible(_page: Page, candidates: Array<() => Locator>): Promise<Locator> {
  for (const candidate of candidates) {
    const locator = candidate().first();
    if ((await locator.count().catch(() => 0)) > 0 && (await locator.isVisible().catch(() => false))) {
      return locator;
    }
  }

  throw new Error('No generated selector candidate resolved to a visible element.');
}
`;
}

export function buildGeneratedTestSource(options: SourceOptions): TestSourceBuildResult {
  const { session, title, steps, generatedAt, flowCategory, confidenceScore, finding, healedSelectors = false } = options;
  const selectorStrategies = selectorStrategiesForSteps(steps);
  const imports = healedSelectors
    ? "import { test, expect, type Locator, type Page } from '@playwright/test';"
    : "import { test, expect } from '@playwright/test';";
  const lines: string[] = [imports, helperSource(healedSelectors), ''];
  const startUrl = safeStartUrl(session, steps);
  let assertionCount = 0;

  const interactionMapping = mapInteractionHistoryToTest(steps, flowCategory, { findingTitle: finding?.title });

  lines.push(`test(${stringLiteral(title)}, async ({ page }) => {`);
  if (interactionMapping.interactionSummary.length) {
    lines.push(`  // Verified interaction history: ${interactionMapping.interactionSummary.join(' -> ')}`);
  }
  lines.push(
    `  test.info().annotations.push({ type: 'source exploratory session', description: ${stringLiteral(
      session.id,
    )} }, { type: 'generated timestamp', description: ${stringLiteral(generatedAt)} }, { type: 'flow category', description: ${stringLiteral(
      flowCategory,
    )} }, { type: 'confidence', description: ${stringLiteral(confidenceScore)} });`,
  );

  if (includeConsoleInstrumentation(finding)) {
    lines.push('  const consoleErrors: string[] = [];');
    lines.push("  page.on('console', (message) => {");
    lines.push("    if (message.type() === 'error') consoleErrors.push(message.text());");
    lines.push('  });');
  }

  if (includeNetworkInstrumentation(finding)) {
    lines.push('  const failedNetworkRequests: string[] = [];');
    lines.push("  page.on('response', (response) => {");
    lines.push("    if (response.status() >= 400) failedNetworkRequests.push(`${response.request().method()} ${response.url()} ${response.status()}`);");
    lines.push('  });');
    lines.push("  page.on('requestfailed', (request) => failedNetworkRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || 'failed'}`));");
  }

  if (steps[0]?.plan.action.kind !== 'navigate') {
    lines.push(`  await page.goto(${stringLiteral(startUrl)}, { waitUntil: 'domcontentloaded' });`);
  }

  for (const step of steps) {
    const actions = actionLines(step, healedSelectors);
    const assertions = assertionLines(step, finding);
    lines.push(...actions);
    lines.push(...assertions);
    assertionCount += assertions.length + actions.filter((line) => line.includes('toBeVisible') || line.includes('toBeEnabled')).length;
  }

  const bugAssertions = bugAssertionLines(finding, steps);
  lines.push(...bugAssertions);
  assertionCount += bugAssertions.length;

  lines.push('});');
  lines.push('');

  return {
    source: lines.join('\n').replace(/\n{3,}/g, '\n\n'),
    selectorStrategies,
    assertionCount,
  };
}
