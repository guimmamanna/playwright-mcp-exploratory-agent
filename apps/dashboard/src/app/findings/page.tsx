'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SeverityBadge } from '@/components/ui/badge';
import { fetchJson } from '@/lib/api';
import type { DashboardFinding } from '@/lib/types';

export default function FindingsPage() {
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (severity !== 'all') params.set('severity', severity);
    if (category !== 'all') params.set('category', category);
    if (search) params.set('search', search);
    fetchJson<DashboardFinding[]>(`/api/findings?${params}`).then(setFindings).catch(console.error);
  }, [severity, category, search]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Findings</h1>
      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            <option value="functional">Functional</option>
            <option value="accessibility">Accessibility</option>
            <option value="console-error">Console error</option>
            <option value="visual">Visual</option>
          </Select>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {findings.map((finding) => (
          <Card key={finding.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{finding.title}</p>
                <p className="text-sm text-muted-foreground">{finding.category} · {finding.url || 'no url'}</p>
              </div>
              <div className="flex items-center gap-2">
                <SeverityBadge severity={finding.severity} />
                <Select defaultValue={finding.status} onChange={() => undefined} className="w-36">
                  <option value="new">new</option>
                  <option value="confirmed">confirmed</option>
                  <option value="false-positive">false positive</option>
                  <option value="needs-review">needs review</option>
                  <option value="ignored">ignored</option>
                </Select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
