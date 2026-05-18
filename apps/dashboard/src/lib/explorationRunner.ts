import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  appendSessionLog,
  completeActiveSession,
  registerActiveSession,
  updateActiveSession,
} from './activeSessions';
import { workspaceRoot, defaultSettings } from './paths';
import type { ExplorationStartConfig } from './types';

const viewportSizes = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

export async function startExploration(config: ExplorationStartConfig) {
  const sessionId = `dashboard-${Date.now()}`;
  const settings = defaultSettings();
  const outputDir = join(settings.reportsDirectory, 'runs', sessionId);
  await mkdir(outputDir, { recursive: true });

  const runConfig = {
    ...config,
    outputDir,
    sessionId,
    viewportSize: viewportSizes[config.viewport],
  };

  await writeFile(join(outputDir, 'run-config.json'), JSON.stringify(runConfig, null, 2));

  registerActiveSession({
    id: sessionId,
    goalId: `dashboard-exploration-${sessionId}`,
    goalName: 'Dashboard exploration',
    status: 'running',
    startedAt: new Date().toISOString(),
    environment: config.environmentId,
    persona: config.personaId,
    browser: config.browser,
    viewport: config.viewport,
    baseUrl: config.baseUrl,
    currentUrl: config.baseUrl,
    currentAction: 'Starting exploration…',
    findingsCount: 0,
    generatedTestsCount: 0,
    config,
    logs: [],
  });

  runExplorationProcess(runConfig).catch((error) => {
    appendSessionLog(sessionId, `Runner error: ${error instanceof Error ? error.message : String(error)}`);
    completeActiveSession(sessionId, { status: 'failed', currentAction: 'Failed' });
  });

  return sessionId;
}

async function runExplorationProcess(runConfig: ExplorationStartConfig & { outputDir: string; sessionId: string; viewportSize: { width: number; height: number } }) {
  const root = workspaceRoot();
  const scriptPath = join(root, 'apps', 'dashboard', 'scripts', 'run-exploration.mjs');

  appendSessionLog(runConfig.sessionId, 'Spawning exploration worker process.');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: root,
      env: {
        ...process.env,
        EXPLORATION_RUN_CONFIG: JSON.stringify(runConfig),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      const message = chunk.toString().trim();
      appendSessionLog(runConfig.sessionId, message);
      if (message.includes('CURRENT_URL:')) {
        updateActiveSession(runConfig.sessionId, { currentUrl: message.split('CURRENT_URL:')[1]?.trim() });
      }
      if (message.includes('CURRENT_ACTION:')) {
        updateActiveSession(runConfig.sessionId, { currentAction: message.split('CURRENT_ACTION:')[1]?.trim() });
      }
    });

    child.stderr?.on('data', (chunk) => appendSessionLog(runConfig.sessionId, chunk.toString().trim()));

    child.on('close', (code) => {
      appendSessionLog(runConfig.sessionId, `Process exited with code ${code}`);
      completeActiveSession(runConfig.sessionId, {
        status: code === 0 ? 'completed' : 'failed',
        endedAt: new Date().toISOString(),
        currentAction: code === 0 ? 'Completed' : 'Failed',
      });
      if (code === 0) resolve();
      else reject(new Error(`Exploration process failed with code ${code}`));
    });
  });
}
