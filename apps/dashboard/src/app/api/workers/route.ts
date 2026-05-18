import { NextResponse } from 'next/server';
import { listActiveSessions } from '@/lib/activeSessions';

export async function GET() {
  const workers = listActiveSessions()
    .filter((session) => session.status === 'running')
    .map((session) => ({
      workerId: session.id,
      sessionId: session.id,
      status: session.status,
      persona: session.persona,
      browser: session.browser,
      viewport: session.viewport,
      currentUrl: session.currentUrl,
      currentAction: session.currentAction,
      elapsedMs: Date.now() - new Date(session.startedAt).getTime(),
      findingsCount: session.findingsCount,
      logs: session.logs?.slice(-20) || [],
    }));
  return NextResponse.json(workers);
}
