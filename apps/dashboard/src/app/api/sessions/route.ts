import { NextResponse } from 'next/server';
import { loadAllSessions } from '@/lib/store';

export async function GET() {
  const sessions = await loadAllSessions();
  return NextResponse.json(sessions);
}
