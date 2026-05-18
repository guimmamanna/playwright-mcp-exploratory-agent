import type { Page } from '@playwright/test';

export async function captureAccessibilitySnapshotSummary(page: Page) {
  try {
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    if (!snapshot) {
      return 'No accessibility snapshot available.';
    }

    const names: string[] = [];
    const walk = (node: { role?: string; name?: string; children?: unknown[] } | undefined) => {
      if (!node) return;
      if (node.role && node.name) {
        names.push(`${node.role}:${node.name}`);
      }
      for (const child of node.children || []) {
        walk(child as { role?: string; name?: string; children?: unknown[] });
      }
    };

    walk(snapshot as { role?: string; name?: string; children?: unknown[] });
    return names.slice(0, 40).join(' | ') || 'Accessibility snapshot captured without named nodes.';
  } catch (error) {
    return error instanceof Error ? error.message : 'Accessibility snapshot failed.';
  }
}
