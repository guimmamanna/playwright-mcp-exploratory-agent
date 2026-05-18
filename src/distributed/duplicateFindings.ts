import type { Finding } from '../types';
import type { MergedFindingRecord } from './types';

export interface DuplicateMergeResult {
  duplicate: boolean;
  record: MergedFindingRecord;
}

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pathnameOf(url?: string) {
  if (!url) return 'unknown';
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

export function findingFingerprint(finding: Finding) {
  return `${finding.type}::${normalizeTitle(finding.title)}::${pathnameOf(finding.url)}`;
}

function bumpConfidence(current: Finding['reproducibilityConfidence']): Finding['reproducibilityConfidence'] {
  if (current === 'high') return 'high';
  if (current === 'medium') return 'high';
  return 'medium';
}

export function ingestFinding(
  registry: Map<string, MergedFindingRecord>,
  finding: Finding,
  workerId: string,
): DuplicateMergeResult {
  const fingerprint = findingFingerprint(finding);
  const existing = registry.get(fingerprint);

  if (!existing) {
    const record: MergedFindingRecord = {
      fingerprint,
      finding: { ...finding, reproducibilityConfidence: finding.reproducibilityConfidence || 'medium' },
      workerIds: [workerId],
      mergeCount: 1,
      mergedEvidence: false,
    };
    registry.set(fingerprint, record);
    return { duplicate: false, record };
  }

  const mergedEvidence = [...existing.finding.evidence];
  for (const link of finding.evidence) {
    if (!mergedEvidence.some((item) => item.path === link.path && item.kind === link.kind)) {
      mergedEvidence.push(link);
    }
  }

  const mergedFinding: Finding = {
    ...existing.finding,
    description: `${existing.finding.description}\n\nAlso observed by worker ${workerId}: ${finding.description}`,
    evidence: mergedEvidence,
    reproducibilityConfidence: bumpConfidence(existing.finding.reproducibilityConfidence),
    suspectedRootCause: existing.finding.suspectedRootCause || finding.suspectedRootCause,
  };

  const record: MergedFindingRecord = {
    fingerprint,
    finding: mergedFinding,
    workerIds: Array.from(new Set([...existing.workerIds, workerId])),
    mergeCount: existing.mergeCount + 1,
    mergedEvidence: true,
  };
  registry.set(fingerprint, record);

  return { duplicate: true, record };
}
