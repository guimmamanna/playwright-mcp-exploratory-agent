import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface VisualDiffResult {
  diffPath?: string;
  diffRatio: number;
  changed: boolean;
}

async function loadPng(path: string) {
  const buffer = await readFile(path);
  return PNG.sync.read(buffer);
}

export async function compareScreenshots(args: {
  baselinePath: string;
  currentPath: string;
  diffPath: string;
  threshold: number;
}): Promise<VisualDiffResult> {
  const [baseline, current] = await Promise.all([loadPng(args.baselinePath), loadPng(args.currentPath)]);

  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);

  const normalizedBaseline = new PNG({ width, height });
  const normalizedCurrent = new PNG({ width, height });
  const diff = new PNG({ width, height });

  PNG.bitblt(baseline, normalizedBaseline, 0, 0, baseline.width, baseline.height, 0, 0);
  PNG.bitblt(current, normalizedCurrent, 0, 0, current.width, current.height, 0, 0);

  const diffPixels = pixelmatch(normalizedBaseline.data, normalizedCurrent.data, diff.data, width, height, {
    threshold: args.threshold,
    includeAA: true,
  });

  const diffRatio = diffPixels / (width * height);
  const changed = diffRatio > args.threshold;

  if (changed) {
    await mkdir(dirname(args.diffPath), { recursive: true });
    await writeFile(args.diffPath, PNG.sync.write(diff));
  }

  return {
    diffPath: changed ? args.diffPath : undefined,
    diffRatio,
    changed,
  };
}

export function baselinePathFor(evidenceDirectory: string, url: string, viewportName: string) {
  const slug = url.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'page';
  return join(evidenceDirectory, 'visual-baselines', `${slug}-${viewportName}.png`);
}

export function diffPathFor(evidenceDirectory: string, url: string, viewportName: string, phase = 'diff') {
  const slug = url.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'page';
  return join(evidenceDirectory, 'visual-diffs', `${slug}-${viewportName}-${phase}.png`);
}

export function screenshotPathFor(evidenceDirectory: string, url: string, viewportName: string, phase = 'current') {
  const slug = url.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'page';
  return join(evidenceDirectory, 'visual', `${slug}-${viewportName}-${phase}.png`);
}
