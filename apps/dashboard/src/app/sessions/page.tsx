'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchJson } from '@/lib/api';
import type { DashboardSession } from '@/lib/types';

export default function ActiveSessionsPage() {
  const [workers, setWorkers] = useState<Array<{
    sessionId?: string;
    id?: string;
    status?: string;
    currentUrl?: string;
    currentAction?: string;
    findingsCount?: number;
    elapsedMs?: number;
  }>>([]);
  const [sessions, setSessions] = useState<DashboardSession[]>([]);

  useEffect(() => {
    const load = () => {
      fetchJson<typeof workers>('/api/workers').then(setWorkers).catch(console.error);
      fetchJson<DashboardSession[]>('/api/sessions').then(setSessions).catch(console.error);
    };
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  const active = sessions.filter((s) => s.status === 'running');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Active sessions</h1>
        <p className="text-sm text-muted-foreground">Monitor running exploratory workers in real time.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(workers.length ? workers : active).map((worker) => {
          const id = String('sessionId' in worker ? worker.sessionId : worker.id || '');
          const status = String(worker.status || 'running');
          const currentUrl = 'currentUrl' in worker ? worker.currentUrl : undefined;
          const currentAction = 'currentAction' in worker ? worker.currentAction : undefined;
          const findingsCount = worker.findingsCount ?? 0;
          const elapsedMs = 'elapsedMs' in worker ? worker.elapsedMs : 0;
          return (
            <Card key={id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{id}</CardTitle>
                <Badge variant="outline">{status}</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">URL:</span> {String(currentUrl || '—')}</p>
                <p><span className="text-muted-foreground">Action:</span> {String(currentAction || '—')}</p>
                <p><span className="text-muted-foreground">Findings:</span> {findingsCount}</p>
                <p><span className="text-muted-foreground">Elapsed:</span> {Math.round(Number(elapsedMs || 0) / 1000)}s</p>
                <Link href={`/sessions/${id}`} className="text-primary hover:underline">View session details</Link>
              </CardContent>
            </Card>
          );
        })}
        {!workers.length && !active.length && (
          <p className="text-muted-foreground">No active sessions. Start one from New exploration.</p>
        )}
      </div>
    </div>
  );
}
