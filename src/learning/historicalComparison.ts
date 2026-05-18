import type { ExplorationSession } from '../types';
import type { HistoricalComparison, LongTermKnowledge } from '../long-term-memory/types';
import { findingFingerprint } from './fingerprints';
import { repeatedBugFingerprints } from './riskScoring';

export function compareWithHistory(knowledge: LongTermKnowledge, session: ExplorationSession): HistoricalComparison {
  const previous = knowledge.sessionHistory
    .filter((record) => record.goalId === session.goal.id)
    .sort((a, b) => (a.endedAt || a.startedAt).localeCompare(b.endedAt || b.startedAt))
    .at(-1);

  const previousFindingCount = previous?.findingCount || 0;
  const currentFindingCount = session.findings.length;
  const recurring = repeatedBugFingerprints(knowledge);

  const newIssues: string[] = [];
  const repeatedIssues: string[] = [];

  for (const finding of session.findings) {
    const fp = findingFingerprint(finding);
    if (recurring.has(fp)) {
      repeatedIssues.push(finding.title);
    } else {
      newIssues.push(finding.title);
    }
  }

  const resolvedCandidates = knowledge.recurringBugs
    .filter((bug) => bug.occurrences > 1 && !session.findings.some((finding) => findingFingerprint(finding) === bug.fingerprint))
    .map((bug) => bug.title);

  return {
    previousFindingCount,
    currentFindingCount,
    newIssues,
    repeatedIssues,
    resolvedCandidates,
  };
}
