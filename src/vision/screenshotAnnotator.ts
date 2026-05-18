import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import type { VisionAnomaly, VisionUIRegion } from './models/types';

const COLORS: Record<string, [number, number, number, number]> = {
  button: [66, 135, 245, 180],
  'primary-cta': [46, 125, 50, 200],
  form: [255, 193, 7, 180],
  modal: [156, 39, 176, 180],
  alert: [244, 67, 54, 200],
  navigation: [0, 188, 212, 160],
  overlay: [255, 87, 34, 140],
  section: [158, 158, 158, 120],
  other: [120, 120, 120, 120],
};

function drawRect(png: PNG, bounds: { x: number; y: number; width: number; height: number }, color: [number, number, number, number]) {
  const x0 = Math.max(0, Math.floor(bounds.x));
  const y0 = Math.max(0, Math.floor(bounds.y));
  const x1 = Math.min(png.width - 1, Math.floor(bounds.x + bounds.width));
  const y1 = Math.min(png.height - 1, Math.floor(bounds.y + bounds.height));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const onBorder = x === x0 || x === x1 || y === y0 || y === y1;
      if (!onBorder) continue;
      const idx = (png.width * y + x) << 2;
      const alpha = color[3] / 255;
      png.data[idx] = Math.round(png.data[idx] * (1 - alpha) + color[0] * alpha);
      png.data[idx + 1] = Math.round(png.data[idx + 1] * (1 - alpha) + color[1] * alpha);
      png.data[idx + 2] = Math.round(png.data[idx + 2] * (1 - alpha) + color[2] * alpha);
    }
  }
}

export async function annotateScreenshot(args: {
  screenshotPath: string;
  evidenceDirectory: string;
  url: string;
  regions: VisionUIRegion[];
  anomalies: VisionAnomaly[];
}) {
  const buffer = await readFile(args.screenshotPath);
  const png = PNG.sync.read(buffer);

  for (const region of args.regions.slice(0, 25)) {
    drawRect(png, region.bounds, COLORS[region.kind] || COLORS.other);
  }

  for (const anomaly of args.anomalies.filter((item) => item.bounds).slice(0, 8)) {
    drawRect(png, anomaly.bounds!, [244, 67, 54, 220]);
  }

  const slug = args.url.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').slice(0, 80) || 'page';
  const annotatedScreenshotPath = join(args.evidenceDirectory, 'vision', `${slug}-annotated.png`);
  const heatmapPath = join(args.evidenceDirectory, 'vision', `${slug}-heatmap.json`);

  await mkdir(dirname(annotatedScreenshotPath), { recursive: true });
  await writeFile(annotatedScreenshotPath, PNG.sync.write(png));
  await writeFile(
    heatmapPath,
    JSON.stringify(
      {
        regions: args.regions.map((region) => ({ id: region.id, kind: region.kind, bounds: region.bounds, confidence: region.confidence })),
        anomalies: args.anomalies.map((anomaly) => ({ id: anomaly.id, type: anomaly.anomalyType, bounds: anomaly.bounds })),
      },
      null,
      2,
    ),
    'utf8',
  );

  return { annotatedScreenshotPath, heatmapPath };
}
