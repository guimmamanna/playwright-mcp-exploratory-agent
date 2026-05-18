'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SeverityChart } from '@/components/charts/severity-chart';
import { fetchJson } from '@/lib/api';
import type { OverviewStats } from '@/lib/types';

export default function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);

  useEffect(() => {
    fetchJson<OverviewStats>('/api/overview').then(setStats).catch(console.error);
  }, []);

  if (!stats) return <p className="text-muted-foreground">Loading overview…</p>;

  const severityData = [
    { name: 'Critical', value: stats.findingsBySeverity.critical },
    { name: 'High', value: stats.findingsBySeverity.high },
    { name: 'Medium', value: stats.findingsBySeverity.medium },
    { name: 'Low', value: stats.findingsBySeverity.low },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">Exploratory testing health across sessions and workers.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total sessions</CardDescription><CardTitle>{stats.totalSessions}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Total findings</CardDescription><CardTitle>{stats.totalFindings}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Active sessions</CardDescription><CardTitle>{stats.activeSessions}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Generated tests</CardDescription><CardTitle>{stats.generatedTestsPassed} pass / {stats.generatedTestsFailed} fail</CardTitle></CardHeader></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Findings by severity</CardTitle></CardHeader>
          <CardContent><SeverityChart data={severityData} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent high-risk areas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats.recentHighRiskAreas.length ? stats.recentHighRiskAreas.map((area) => (
              <div key={area.area} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{area.area}</span>
                <span className="text-muted-foreground">score {area.score} · {area.sessions} sessions</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">No high-risk areas recorded yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Coverage by browser</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats.coverageByBrowser.map((item) => (
              <div key={item.name} className="flex justify-between text-sm"><span>{item.name || 'unknown'}</span><span>{item.value}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Coverage by persona</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats.coverageByPersona.map((item) => (
              <div key={item.name} className="flex justify-between text-sm"><span>{item.name || 'unknown'}</span><span>{item.value}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
