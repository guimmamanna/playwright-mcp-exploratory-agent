import type { Finding } from '../types';
import type { FalsePositiveRecord, FalsePositiveStatus, LongTermKnowledge } from '../long-term-memory/types';
import { findingFingerprint } from './fingerprints';

export function isSuppressedFinding(finding: Finding, knowledge: LongTermKnowledge) {
  const fingerprint = findingFingerprint(finding);
  const record = knowledge.falsePositives.find((item) => item.fingerprint === fingerprint);
  if (!record) return false;
  return record.status === 'false-positive' || record.status === 'ignored';
}

export function suppressedFingerprints(knowledge: LongTermKnowledge) {
  return knowledge.falsePositives
    .filter((item) => item.status === 'false-positive' || item.status === 'ignored')
    .map((item) => item.fingerprint);
}

export function markFindingStatus(
  knowledge: LongTermKnowledge,
  finding: Finding,
  status: FalsePositiveStatus,
  reason?: string,
): FalsePositiveRecord {
  const fingerprint = findingFingerprint(finding);
  const existing = knowledge.falsePositives.find((item) => item.fingerprint === fingerprint);
  const record: FalsePositiveRecord = {
    fingerprint,
    title: finding.title,
    status,
    reason,
    markedAt: new Date().toISOString(),
    route: finding.url,
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    knowledge.falsePositives.push(record);
  }

  return record;
}

export function filterSuppressedFindings(findings: Finding[], knowledge: LongTermKnowledge) {
  return findings.filter((finding) => !isSuppressedFinding(finding, knowledge));
}
