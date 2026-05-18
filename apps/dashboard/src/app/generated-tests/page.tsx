'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson } from '@/lib/api';
import type { DashboardGeneratedTest } from '@/lib/types';

export default function GeneratedTestsPage() {
  const [tests, setTests] = useState<DashboardGeneratedTest[]>([]);

  useEffect(() => {
    fetchJson<DashboardGeneratedTest[]>('/api/generated-tests').then(setTests).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Generated tests</h1>
      <div className="space-y-3">
        {tests.map((test) => (
          <Card key={test.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{test.title}</p>
                <p className="text-sm text-muted-foreground">{test.filePath}</p>
                <p className="text-xs text-muted-foreground">Session: {test.sessionId} · {test.flowCategory}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{test.confidence}</Badge>
                <Badge variant={test.status === 'passed' ? 'default' : test.status === 'failed' ? 'critical' : 'secondary'}>{test.status}</Badge>
                <Button variant="outline" size="sm" disabled title="Placeholder">Run again</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!tests.length && <p className="text-muted-foreground">No generated tests found in reports.</p>}
      </div>
    </div>
  );
}
