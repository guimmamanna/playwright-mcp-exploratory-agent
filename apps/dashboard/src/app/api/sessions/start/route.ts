import { NextResponse } from 'next/server';
import { startExploration } from '@/lib/explorationRunner';
import type { ExplorationStartConfig } from '@/lib/types';

export async function POST(request: Request) {
  const body = (await request.json()) as ExplorationStartConfig;
  const sessionId = await startExploration(body);
  return NextResponse.json({ sessionId, status: 'running' });
}
