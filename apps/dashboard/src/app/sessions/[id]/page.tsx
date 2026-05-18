'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SeverityBadge } from '@/components/ui/badge';
import { fetchJson } from '@/lib/api';
import type { DashboardSession } from '@/lib/types';

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<DashboardSession | null>(null);

  useEffect(() => {
    if (!params.id) return;
    fetchJson<DashboardSession>(`/api/sessions/${params.id}`).then(setSession).catch(console.error);
  }, [params.id]);

  if (!session) return <p className="text-muted-foreground">Loading session…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{session.goalName || session.id}</h1>
        <p className="text-sm text-muted-foreground">Status: {session.status} · {session.environment} · {session.persona}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Findings</CardTitle></CardHeader><CardContent>{session.findingsCount}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Generated tests</CardTitle></CardHeader><CardContent>{session.generatedTestsCount}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Coverage</CardTitle></CardHeader><CardContent>{session.coverage?.explorationPercentage ?? 0}%</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(session.steps || []).map((step) => (
            <div key={step.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">Step {step.index + 1}: {step.actionKind}</p>
              <p className="text-muted-foreground">{step.rationale}</p>
              <p>Status: {step.status}</p>
            </div>
          ))}
          {!session.steps?.length && <p className="text-muted-foreground">No step timeline available in report.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Findings</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(session.findings || []).map((finding) => (
            <div key={finding.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>{finding.title}</span>
              <SeverityBadge severity={finding.severity} />
            </div>
          ))}
        </CardContent>
      </Card>

      {session.memoryUpdateSummary && (
        <Card>
          <CardHeader><CardTitle>Learning updates</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {session.memoryUpdateSummary.memoryUpdates.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
