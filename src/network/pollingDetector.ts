import type { TrackedNetworkRequest } from './types';

export function detectPollingLoops(requests: TrackedNetworkRequest[], minimumRepeats = 3, windowMs = 15_000): string[] {
  const apiRequests = requests.filter((request) => ['GET', 'HEAD'].includes(request.method.toUpperCase()));
  const grouped = new Map<string, TrackedNetworkRequest[]>();

  for (const request of apiRequests) {
    const key = `${request.method}:${request.url.split('?')[0]}`;
    const bucket = grouped.get(key) || [];
    bucket.push(request);
    grouped.set(key, bucket);
  }

  const loops: string[] = [];

  for (const [key, bucket] of grouped.entries()) {
    if (bucket.length < minimumRepeats) {
      continue;
    }

    const sorted = [...bucket].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    for (let index = 0; index <= sorted.length - minimumRepeats; index += 1) {
      const start = Date.parse(sorted[index].timestamp);
      const end = Date.parse(sorted[index + minimumRepeats - 1].timestamp);
      if (end - start <= windowMs) {
        loops.push(key);
        break;
      }
    }
  }

  return loops;
}
