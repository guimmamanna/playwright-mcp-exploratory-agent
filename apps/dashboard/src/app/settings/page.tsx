'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchJson } from '@/lib/api';

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetchJson<Record<string, unknown>>('/api/config').then(setConfig).catch(console.error);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Storage</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Reports directory:</span> {String(config?.reportsDirectory || '—')}</p>
          <p><span className="text-muted-foreground">Evidence directory:</span> {String(config?.evidenceDirectory || '—')}</p>
          <p><span className="text-muted-foreground">Default base URL:</span> {String(config?.defaultBaseUrl || '—')}</p>
          <p className="text-muted-foreground">Database adapter: filesystem (JSON) — SQLite/vector adapters planned.</p>
          {(config?.reportDirectories as string[] | undefined)?.map((dir) => (
            <p key={dir} className="text-xs text-muted-foreground">{dir}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
