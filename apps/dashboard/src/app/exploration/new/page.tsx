'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { postJson } from '@/lib/api';
import type { ExplorationStartConfig } from '@/lib/types';

export default function NewExplorationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<ExplorationStartConfig>({
    baseUrl: 'https://www.amazon.co.uk/ref=nav_logo',
    environmentId: 'local',
    personaId: 'anonymous-visitor',
    browser: 'chromium',
    viewport: 'desktop',
    maxSteps: 10,
    maxDurationMinutes: 5,
    forbiddenActions: ['checkout', 'payment', 'delete'],
    accessibilityAuditEnabled: true,
    visualIntelligenceEnabled: true,
    networkIntelligenceEnabled: true,
    generateTests: true,
    learningEnabled: false,
    recoveryEnabled: false,
  });

  async function start() {
    setLoading(true);
    try {
      const result = await postJson<{ sessionId: string }>('/api/sessions/start', config);
      router.push(`/sessions/${result.sessionId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New exploration</h1>
        <p className="text-sm text-muted-foreground">Configure and launch an autonomous exploratory session.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Target</CardTitle>
          <CardDescription>Base URL, environment, and persona.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Base URL</span>
            <Input value={config.baseUrl} onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Environment</span>
            <Select value={config.environmentId} onChange={(e) => setConfig({ ...config, environmentId: e.target.value })}>
              <option value="local">local</option>
              <option value="dev">dev</option>
              <option value="qa">qa</option>
              <option value="staging">staging</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Persona</span>
            <Select value={config.personaId} onChange={(e) => setConfig({ ...config, personaId: e.target.value })}>
              <option value="anonymous-visitor">anonymous-visitor</option>
              <option value="admin">admin</option>
              <option value="readonly-user">readonly-user</option>
              <option value="accessibility-user">accessibility-user</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Browser</span>
            <Select value={config.browser} onChange={(e) => setConfig({ ...config, browser: e.target.value as ExplorationStartConfig['browser'] })}>
              <option value="chromium">Chromium</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Viewport</span>
            <Select value={config.viewport} onChange={(e) => setConfig({ ...config, viewport: e.target.value as ExplorationStartConfig['viewport'] })}>
              <option value="mobile">mobile</option>
              <option value="tablet">tablet</option>
              <option value="desktop">desktop</option>
            </Select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limits &amp; modes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Max steps</span>
            <Input type="number" value={config.maxSteps} onChange={(e) => setConfig({ ...config, maxSteps: Number(e.target.value) })} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Max duration (minutes)</span>
            <Input type="number" value={config.maxDurationMinutes} onChange={(e) => setConfig({ ...config, maxDurationMinutes: Number(e.target.value) })} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Forbidden actions (comma-separated)</span>
            <Input value={config.forbiddenActions.join(', ')} onChange={(e) => setConfig({ ...config, forbiddenActions: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </label>
          {[
            ['accessibilityAuditEnabled', 'Accessibility audit'],
            ['visualIntelligenceEnabled', 'Visual testing'],
            ['networkIntelligenceEnabled', 'Network monitoring'],
            ['generateTests', 'Generate tests'],
            ['learningEnabled', 'Long-term learning'],
            ['recoveryEnabled', 'Autonomous recovery'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config[key as keyof ExplorationStartConfig] as boolean} onChange={(e) => setConfig({ ...config, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </CardContent>
      </Card>

      <Button onClick={start} disabled={loading} size="lg">
        {loading ? 'Starting…' : 'Start exploration'}
      </Button>
    </div>
  );
}
