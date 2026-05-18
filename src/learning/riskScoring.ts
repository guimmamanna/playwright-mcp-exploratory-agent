import type { ExplorationSession } from '../types';
import type { LongTermKnowledge, RiskScoreEntry } from '../long-term-memory/types';
import { findingFingerprint, pathnameOf } from './fingerprints';

function upsertRisk(
  knowledge: LongTermKnowledge,
  entry: Omit<RiskScoreEntry, 'lastUpdatedAt'> & { scoreDelta?: number },
) {
  const existing = knowledge.riskScores.find((item) => item.key === entry.key && item.dimension === entry.dimension);
  const timestamp = new Date().toISOString();
  if (existing) {
    existing.score = Math.min(100, Math.max(0, existing.score + (entry.scoreDelta || entry.score - existing.score)));
    existing.reasons = Array.from(new Set([...existing.reasons, ...entry.reasons])).slice(-8);
    existing.lastUpdatedAt = timestamp;
    return existing;
  }

  const created: RiskScoreEntry = {
    ...entry,
    score: Math.min(100, Math.max(0, entry.score)),
    lastUpdatedAt: timestamp,
  };
  knowledge.riskScores.push(created);
  return created;
}

export function updateRiskScoresFromSession(knowledge: LongTermKnowledge, session: ExplorationSession) {
  let updates = 0;
  const route = pathnameOf(session.currentUrl || session.config.baseUrl);

  for (const finding of session.findings) {
    const severityBoost = finding.severity === 'critical' ? 25 : finding.severity === 'high' ? 15 : finding.severity === 'medium' ? 8 : 3;
    upsertRisk(knowledge, {
      key: pathnameOf(finding.url) || route,
      dimension: 'route',
      score: severityBoost,
      scoreDelta: severityBoost,
      reasons: [`${finding.severity} finding: ${finding.title}`],
    });
    updates += 1;

    if (finding.category) {
      upsertRisk(knowledge, {
        key: finding.category,
        dimension: 'feature-area',
        score: severityBoost,
        scoreDelta: severityBoost / 2,
        reasons: [finding.title],
      });
      updates += 1;
    }

    if (finding.correlatedRequestUrl) {
      upsertRisk(knowledge, {
        key: finding.correlatedRequestUrl,
        dimension: 'api-endpoint',
        score: severityBoost,
        scoreDelta: severityBoost,
        reasons: [finding.networkIssueType || finding.type],
      });
      updates += 1;
    }
  }

  const personaId = session.config.personaId || session.config.persona;
  if (personaId) {
    upsertRisk(knowledge, {
      key: personaId,
      dimension: 'persona',
      score: session.findings.length > 0 ? 10 : -2,
      scoreDelta: session.findings.length > 0 ? 5 : -2,
      reasons: session.findings.length ? ['Findings observed for persona'] : ['Clean run for persona'],
    });
    updates += 1;
  }

  const environmentId = session.config.environmentId || session.config.environmentName;
  upsertRisk(knowledge, {
    key: environmentId,
    dimension: 'environment',
    score: session.findings.filter((finding) => finding.severity === 'high' || finding.severity === 'critical').length * 8,
    scoreDelta: 4,
    reasons: ['Session findings in environment'],
  });
  updates += 1;

  knowledge.highRiskPages = knowledge.riskScores
    .filter((item) => item.dimension === 'route')
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return updates;
}

export function topRiskRoutes(knowledge: LongTermKnowledge, limit = 5) {
  const routes = knowledge.highRiskPages.length
    ? knowledge.highRiskPages
    : knowledge.riskScores.filter((item) => item.dimension === 'route');
  return [...routes].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function riskScoreForRoute(knowledge: LongTermKnowledge, route: string) {
  return knowledge.riskScores.find((item) => item.dimension === 'route' && item.key === pathnameOf(route))?.score || 0;
}

export function repeatedBugFingerprints(knowledge: LongTermKnowledge) {
  return new Set(knowledge.recurringBugs.filter((bug) => bug.occurrences > 1).map((bug) => bug.fingerprint));
}

export function recordRecurringBug(knowledge: LongTermKnowledge, finding: Parameters<typeof findingFingerprint>[0], sessionId: string) {
  const fingerprint = findingFingerprint(finding);
  const existing = knowledge.recurringBugs.find((bug) => bug.fingerprint === fingerprint);
  const route = pathnameOf('url' in finding ? finding.url : undefined);
  const now = new Date().toISOString();

  if (existing) {
    existing.occurrences += 1;
    existing.lastSeenAt = now;
    if (!existing.sessionIds.includes(sessionId)) existing.sessionIds.push(sessionId);
    if (route && !existing.routes.includes(route)) existing.routes.push(route);
    return existing;
  }

  knowledge.recurringBugs.push({
    fingerprint,
    title: finding.title,
    type: finding.type,
    severity: finding.severity,
    occurrences: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    routes: route ? [route] : [],
    sessionIds: [sessionId],
  });
  return knowledge.recurringBugs.at(-1)!;
}
