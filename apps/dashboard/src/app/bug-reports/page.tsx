'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SeverityBadge } from '@/components/ui/badge';
import { fetchJson } from '@/lib/api';
import type { DashboardBugReport } from '@/lib/types';

export default function BugReportsPage() {
  const [reports, setReports] = useState<DashboardBugReport[]>([]);
  const [selected, setSelected] = useState<DashboardBugReport | null>(null);

  useEffect(() => {
    fetchJson<DashboardBugReport[]>('/api/bug-reports').then((data) => {
      setReports(data);
      setSelected(data[0] || null);
    }).catch(console.error);
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-2 lg:col-span-1">
        <h1 className="text-2xl font-semibold">Bug reports</h1>
        {reports.map((report) => (
          <button key={report.id} onClick={() => setSelected(report)} className="block w-full rounded-md border border-border p-3 text-left text-sm hover:bg-accent">
            <p className="font-medium">{report.title}</p>
            <SeverityBadge severity={report.severity} />
          </button>
        ))}
      </div>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>{selected?.title || 'Select a report'}</CardTitle></CardHeader>
        <CardContent>
          {selected ? (
            <article className="prose prose-invert max-w-none text-sm">
              <h3 className="text-base font-semibold">Steps to reproduce</h3>
              <ol className="list-decimal pl-5">
                {selected.reproductionSteps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <h3 className="mt-4 text-base font-semibold">Expected</h3>
              <p>{selected.expectedResult || 'Not recorded'}</p>
              <h3 className="mt-4 text-base font-semibold">Actual</h3>
              <p>{selected.actualResult || 'Not recorded'}</p>
              <pre className="mt-6 overflow-auto rounded-md bg-muted p-4 text-xs">{selected.markdown}</pre>
            </article>
          ) : (
            <p className="text-muted-foreground">No bug report selected.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
