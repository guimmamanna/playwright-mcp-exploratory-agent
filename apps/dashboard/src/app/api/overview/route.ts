import { NextResponse } from 'next/server';
import { loadOverview } from '@/lib/store';

export async function GET() {
  const overview = await loadOverview();
  return NextResponse.json(overview);
}
