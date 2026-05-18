import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { listActiveSessions } from './activeSessions';
import { parseBugReportMarkdown, parseSessionReport } from './parsers/reportParser';
import { sessionFromMemoryFile, type SessionMemoryFile } from './parsers/sessionMemoryParser';
import { reportDirectories } from './paths';
import type {
  DashboardBugReport,
  DashboardCoverage,
  DashboardFinding,
  DashboardGeneratedTest,
  DashboardSession,
  OverviewStats,
} from './types';

async function walkFiles(dir: string, matcher: (name: string) => boolean): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walkFiles(fullPath, matcher)));
      } else if (matcher(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    return [];
  }
  return results;
}

export async function loadAllSessions(): Promise<DashboardSession[]> {
  const sessions = new Map<string, DashboardSession>();

  for (const dir of reportDirectories()) {
    const memoryFiles = await walkFiles(dir, (name) => name === 'session-memory.json');
    for (const file of memoryFiles) {
      try {
        const raw = JSON.parse(await readFile(file, 'utf8')) as SessionMemoryFile;
        sessions.set(raw.sessionId, sessionFromMemoryFile(raw, file));
      } catch {
        // ignore malformed
      }
    }

    const reportFiles = await walkFiles(dir, (name) => name.endsWith('.md') && !name.includes('bug'));
    for (const file of reportFiles) {
      if (file.includes('/bugs/')) continue;
      try {
        const markdown = await readFile(file, 'utf8');
        if (!markdown.includes('# Exploratory Session Report')) continue;
        const parsed = parseSessionReport(markdown, file);
        if (!parsed.id) continue;
        const existing = sessions.get(parsed.id);
        const merged: DashboardSession = {
          ...(existing || { id: parsed.id, goalId: parsed.goalId || parsed.id, findingsCount: 0, generatedTestsCount: 0, status: 'completed', startedAt: new Date().toISOString() }),
          ...parsed,
          id: parsed.id,
          goalId: parsed.goalId || parsed.id,
          findings: parsed.findings || existing?.findings,
          generatedTests: parsed.generatedTests || existing?.generatedTests,
          findingsCount: parsed.findings?.length ?? existing?.findingsCount ?? 0,
          generatedTestsCount: parsed.generatedTests?.length ?? existing?.generatedTestsCount ?? 0,
        };
        sessions.set(parsed.id, merged);
      } catch {
        // ignore
      }
    }
  }

  for (const active of listActiveSessions()) {
    sessions.set(active.id, { ...sessions.get(active.id), ...active });
  }

  return Array.from(sessions.values()).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
}

export async function loadSession(sessionId: string): Promise<DashboardSession | undefined> {
  const sessions = await loadAllSessions();
  return sessions.find((session) => session.id === sessionId || session.id.includes(sessionId));
}

export async function loadAllFindings(): Promise<DashboardFinding[]> {
  const sessions = await loadAllSessions();
  return sessions.flatMap((session) => session.findings || []);
}

export async function loadBugReports(): Promise<DashboardBugReport[]> {
  const reports: DashboardBugReport[] = [];
  for (const dir of reportDirectories()) {
    const bugFiles = await walkFiles(join(dir, 'bugs'), (name) => name.endsWith('.md'));
    const altBugFiles = await walkFiles(dir, (name) => name.endsWith('.md') && name.includes('bug'));
    for (const file of [...bugFiles, ...altBugFiles]) {
      try {
        const markdown = await readFile(file, 'utf8');
        if (!markdown.startsWith('# ')) continue;
        reports.push(parseBugReportMarkdown(markdown, file));
      } catch {
        // ignore
      }
    }
  }
  return reports;
}

export async function loadGeneratedTests(): Promise<DashboardGeneratedTest[]> {
  const sessions = await loadAllSessions();
  return sessions.flatMap((session) =>
    (session.generatedTests || []).map((test) => ({ ...test, sessionId: session.id })),
  );
}

export async function aggregateCoverage(): Promise<DashboardCoverage> {
  const sessions = await loadAllSessions();
  const visited = new Set<string>();
  const exploredAreas = new Set<string>();
  const unexploredAreas = new Set<string>();
  const byBrowser: Record<string, number> = {};
  const byPersona: Record<string, number> = {};
  const byViewport: Record<string, number> = {};

  let pagesVisited = 0;
  let interactiveExplored = 0;
  let interactiveSeen = 0;
  let formsTested = 0;
  let formsEncountered = 0;

  for (const session of sessions) {
    const coverage = session.coverage;
    if (!coverage) continue;
    pagesVisited += coverage.pagesVisited;
    interactiveExplored += coverage.interactiveElementsExplored;
    interactiveSeen += coverage.interactiveElementsSeen;
    formsTested += coverage.formsTested;
    formsEncountered += coverage.formsEncountered;
    coverage.visitedUrls.forEach((url) => visited.add(url));
    coverage.exploredAreas.forEach((area) => exploredAreas.add(area));
    coverage.unexploredAreas.forEach((area) => unexploredAreas.add(area));
    if (session.browser) byBrowser[session.browser] = (byBrowser[session.browser] || 0) + 1;
    if (session.persona) byPersona[session.persona] = (byPersona[session.persona] || 0) + 1;
    if (session.viewport) byViewport[session.viewport] = (byViewport[session.viewport] || 0) + 1;
  }

  return {
    pagesVisited,
    uniquePagesVisited: visited.size,
    interactiveElementsExplored: interactiveExplored,
    interactiveElementsSeen: interactiveSeen,
    explorationPercentage: interactiveSeen ? Math.round((interactiveExplored / interactiveSeen) * 100) : 0,
    formsTested,
    formsEncountered,
    exploredAreas: Array.from(exploredAreas),
    unexploredAreas: Array.from(unexploredAreas),
    visitedUrls: Array.from(visited),
    byBrowser,
    byPersona,
    byViewport,
  };
}

export async function loadOverview(): Promise<OverviewStats> {
  const sessions = await loadAllSessions();
  const findings = await loadAllFindings();
  const tests = await loadGeneratedTests();
  const coverage = await aggregateCoverage();

  const findingsBySeverity = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };

  const recentHighRiskAreas = coverage.unexploredAreas.slice(0, 6).map((area) => ({
    area,
    score: 70,
    sessions: sessions.filter((session) => session.coverage?.unexploredAreas.includes(area)).length,
  }));

  return {
    totalSessions: sessions.length,
    totalFindings: findings.length,
    findingsBySeverity,
    generatedTestsPassed: tests.filter((test) => test.status === 'passed').length,
    generatedTestsFailed: tests.filter((test) => test.status === 'failed').length,
    coverageByBrowser: Object.entries(coverage.byBrowser).map(([name, value]) => ({ name, value })),
    coverageByPersona: Object.entries(coverage.byPersona).map(([name, value]) => ({ name, value })),
    recentHighRiskAreas,
    activeSessions: listActiveSessions().filter((session) => session.status === 'running').length,
  };
}

export async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
