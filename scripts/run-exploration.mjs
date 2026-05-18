#!/usr/bin/env node
/**
 * Run live browser exploration via Playwright test harness (avoids tsx page.evaluate issues).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const raw = process.env.EXPLORATION_RUN_CONFIG;
const runConfig = raw
  ? JSON.parse(raw)
  : {
      baseUrl: process.env.EXPLORATORY_BASE_URL || 'https://demo.playwright.dev/todomvc',
      environmentId: 'production-like',
      personaId: 'anonymous-visitor',
      maxSteps: 8,
      maxDurationMinutes: 5,
      outputDir: join(root, 'reports/exploratory/runs', `cli-${Date.now()}`),
      sessionId: `cli-${Date.now()}`,
      viewportSize: { width: 1440, height: 900 },
      multiAgentEnabled: true,
      reasoningEnabled: Boolean(process.env.GEMINI_API_KEY),
    };

mkdirSync(runConfig.outputDir, { recursive: true });

const result = spawnSync(
  'npx',
  ['playwright', 'test', 'tests/exploratory/live-browser-exploration.harness.spec.ts', '--project=chromium'],
  {
    cwd: root,
    env: {
      ...process.env,
      EXPLORATION_RUN_CONFIG: JSON.stringify(runConfig),
      HEADLESS: process.env.HEADLESS ?? 'true',
    },
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
