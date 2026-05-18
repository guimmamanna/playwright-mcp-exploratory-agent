import { NextResponse } from 'next/server';
import { defaultSettings, reportDirectories } from '@/lib/paths';

export async function GET() {
  return NextResponse.json({
    ...defaultSettings(),
    reportDirectories: reportDirectories(),
  });
}
