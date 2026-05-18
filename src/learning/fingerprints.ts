import type { Finding } from '../types';

export function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function pathnameOf(url?: string) {
  if (!url) return '/';
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

export function findingFingerprint(finding: Pick<Finding, 'type' | 'title' | 'url'>) {
  return `${finding.type}::${normalizeTitle(finding.title)}::${pathnameOf(finding.url)}`;
}

export function selectorKey(strategy: string, value: string) {
  return `${strategy}::${value}`;
}

export function flowKey(route: string, actionKind: string, target?: string) {
  return `${pathnameOf(route)}::${actionKind}::${normalizeTitle(target || 'unknown')}`;
}
