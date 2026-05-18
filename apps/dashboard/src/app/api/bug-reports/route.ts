import { NextResponse } from 'next/server';
import { loadBugReports } from '@/lib/store';

export async function GET() {
  return NextResponse.json(await loadBugReports());
}
