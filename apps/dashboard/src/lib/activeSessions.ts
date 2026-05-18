import type { DashboardSession, DashboardWorker, ExplorationStartConfig } from './types';

export interface ActiveSessionRecord extends DashboardSession {
  config: ExplorationStartConfig;
  logs: string[];
  workers?: DashboardWorker[];
}

const activeSessions = new Map<string, ActiveSessionRecord>();

export function registerActiveSession(session: ActiveSessionRecord) {
  activeSessions.set(session.id, session);
}

export function updateActiveSession(sessionId: string, patch: Partial<ActiveSessionRecord>) {
  const existing = activeSessions.get(sessionId);
  if (!existing) return;
  activeSessions.set(sessionId, { ...existing, ...patch });
}

export function appendSessionLog(sessionId: string, message: string) {
  const existing = activeSessions.get(sessionId);
  if (!existing) return;
  existing.logs.push(`[${new Date().toISOString()}] ${message}`);
  if (existing.logs.length > 100) existing.logs = existing.logs.slice(-100);
}

export function getActiveSession(sessionId: string) {
  return activeSessions.get(sessionId);
}

export function listActiveSessions() {
  return Array.from(activeSessions.values());
}

export function completeActiveSession(sessionId: string, patch: Partial<ActiveSessionRecord>) {
  const existing = activeSessions.get(sessionId);
  if (!existing) return;
  activeSessions.set(sessionId, { ...existing, ...patch, status: patch.status || 'completed' });
  setTimeout(() => activeSessions.delete(sessionId), 60_000);
}
