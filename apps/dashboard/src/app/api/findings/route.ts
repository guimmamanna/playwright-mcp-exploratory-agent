import { NextResponse } from 'next/server';
import { filterFindings } from '@/lib/parsers/reportParser';
import { loadAllFindings } from '@/lib/store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const findings = await loadAllFindings();
  const filtered = filterFindings(findings, {
    severity: searchParams.get('severity') || undefined,
    category: searchParams.get('category') || undefined,
    environment: searchParams.get('environment') || undefined,
    persona: searchParams.get('persona') || undefined,
    search: searchParams.get('search') || undefined,
    status: searchParams.get('status') || undefined,
  });
  return NextResponse.json(filtered);
}

export async function PATCH(request: Request) {
  const body = await request.json();
  return NextResponse.json({ ok: true, findingId: body.findingId, status: body.status });
}
