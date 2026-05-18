import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function workspaceRoot() {
  const cwd = process.cwd();
  const candidates = [cwd, join(cwd, '..'), join(cwd, '../..'), join(cwd, '../../..')];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'examples', 'reports'))) {
      return candidate;
    }
    if (existsSync(join(candidate, 'src', 'orchestrator')) && existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  return join(cwd, '../..');
}

export function reportDirectories() {
  const root = workspaceRoot();
  const fromEnv = process.env.EXPLORATORY_REPORTS_DIRS?.split(',').map((item) => item.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv.map((dir) => (dir.startsWith('/') ? dir : join(root, dir)));

  const dashboardDataCandidates = [
    join(process.cwd(), 'data', 'reports'),
    join(process.cwd(), 'apps', 'dashboard', 'data', 'reports'),
    join(root, 'apps', 'dashboard', 'data', 'reports'),
  ];
  const dashboardData =
    dashboardDataCandidates.find((dir) => existsSync(dir)) ?? dashboardDataCandidates[0];

  return [
    dashboardData,
    join(root, 'examples', 'reports'),
    join(root, 'reports', 'exploratory'),
    join(root, 'exploratory-results'),
    join(root, 'exploratory-results', 'distributed'),
  ];
}

export function defaultSettings() {
  const root = workspaceRoot();
  return {
    reportsDirectory: join(root, 'reports', 'exploratory'),
    evidenceDirectory: join(root, 'exploratory-results', 'evidence'),
    defaultBaseUrl: process.env.EXPLORATORY_BASE_URL || 'https://demo.playwright.dev/todomvc',
    defaultEnvironment: 'local',
    defaultPersona: 'anonymous-visitor',
  };
}
