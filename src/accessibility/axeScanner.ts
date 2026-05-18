import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { AccessibilityIssue, AxeScanResult } from './types';

function axeSource() {
  const require = createRequire(join(process.cwd(), 'package.json'));
  return readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
}

function mapImpact(impact: string | undefined): AccessibilityIssue['severity'] {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'high';
    case 'moderate':
      return 'medium';
    default:
      return 'low';
  }
}

export async function runAxeScan(page: Page): Promise<AxeScanResult> {
  try {
    await page.addScriptTag({ content: axeSource() });
    const results = await page.evaluate(async () => {
      // @ts-expect-error axe is injected at runtime
      return await window.axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa', 'best-practice'],
      });
    });

    const issues: AccessibilityIssue[] = (results.violations || []).flatMap((violation: {
      id: string;
      impact?: string;
      help: string;
      description: string;
      tags: string[];
      nodes: Array<{ target: string[]; failureSummary?: string }>;
    }) =>
      violation.nodes.slice(0, 5).map((node, index) => ({
        id: `axe:${violation.id}:${index}`,
        issueType: `axe-${violation.id}`,
        severity: mapImpact(violation.impact),
        title: violation.help,
        description: node.failureSummary || violation.description,
        wcagReference: violation.tags.find((tag: string) => tag.startsWith('wcag')) || violation.tags[0],
        affectedSelector: node.target.join(' '),
        recommendation: violation.help,
      })),
    );

    return {
      violationCount: results.violations?.length || 0,
      issues,
    };
  } catch {
    return { violationCount: 0, issues: [] };
  }
}
