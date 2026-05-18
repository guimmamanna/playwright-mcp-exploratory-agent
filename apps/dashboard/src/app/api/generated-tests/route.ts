import { NextResponse } from 'next/server';
import { loadGeneratedTests } from '@/lib/store';

export async function GET() {
  return NextResponse.json(await loadGeneratedTests());
}
