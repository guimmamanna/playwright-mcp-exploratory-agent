import type { ExplorationSession } from '../types';
import type { LongTermKnowledge, MemoryUpdateSummary, SessionLearningContext } from './types';
import { compareWithHistory } from '../learning/historicalComparison';
import { extractLearningSignals } from '../learning/signalExtractor';
import { recordRecurringBug, updateRiskScoresFromSession } from '../learning/riskScoring';
import { findingFingerprint } from '../learning/fingerprints';
import { recordTestedArea } from './retrieval';
import { isSuppressedFinding } from '../learning/falsePositiveManager';

export function updateMemoryFromSession(
  knowledge: LongTermKnowledge,
  session: ExplorationSession,
  learningContext?: SessionLearningContext,
): MemoryUpdateSummary {
  const comparison = compareWithHistory(knowledge, session);
  extractLearningSignals(knowledge, session);

  let riskScoreUpdates = updateRiskScoresFromSession(knowledge, session);
  let selectorUpdates = 0;
  let recurringFindings = 0;
  const newlyDiscoveredIssues: string[] = [];
  const regressionCandidates: string[] = [];

  for (const finding of session.findings) {
    if (isSuppressedFinding(finding, knowledge)) continue;
    const bug = recordRecurringBug(knowledge, finding, session.id);
    if (bug.occurrences > 1) {
      recurringFindings += 1;
      regressionCandidates.push(finding.title);
    } else {
      newlyDiscoveredIssues.push(finding.title);
    }
  }

  selectorUpdates = session.steps.filter((step) => step.execution?.locatorStrategy).length;
  selectorUpdates += session.steps.flatMap((step) => step.recoveryAttempts || []).filter((item) => item.healedSelector).length;

  const route = session.currentUrl || session.config.baseUrl;
  recordTestedArea(knowledge, route, session.goal.priorities[0]);

  const personaId = session.config.personaId || session.config.persona;
  const environmentId = session.config.environmentId || session.config.environmentName;
  knowledge.personaBehaviours[personaId] = {
    personaId,
    preferredFlows: session.explorationContext?.persona.preferredFlows || [],
    blockedPatterns: session.memory.skippedRiskyActions.map((item) => item.reason).slice(0, 10),
    notes: session.memory.notes.slice(-5),
    lastUpdatedAt: new Date().toISOString(),
  };
  knowledge.environmentBehaviours[environmentId] = {
    environmentId,
    notes: [
      ...(knowledge.environmentBehaviours[environmentId]?.notes || []),
      ...session.memory.notes.slice(-3),
    ].slice(-8),
    slowApiEndpoints: knowledge.environmentBehaviours[environmentId]?.slowApiEndpoints || [],
    lastUpdatedAt: new Date().toISOString(),
  };

  for (const test of session.generatedTests) {
    if (knowledge.pastGeneratedTests.some((item) => item.id === test.id)) continue;
    knowledge.pastGeneratedTests.push({
      id: test.id,
      title: test.title,
      filePath: test.filePath,
      sessionId: session.id,
      flowCategory: test.flowCategory,
      recordedAt: new Date().toISOString(),
    });
  }

  knowledge.sessionHistory.push({
    sessionId: session.id,
    goalId: session.goal.id,
    environmentId,
    personaId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    findingCount: session.findings.length,
    status: session.status,
  });
  if (knowledge.sessionHistory.length > 100) {
    knowledge.sessionHistory = knowledge.sessionHistory.slice(-100);
  }

  const improvementsSinceLastRun: string[] = [];
  if (comparison.currentFindingCount < comparison.previousFindingCount) {
    improvementsSinceLastRun.push(
      `Finding count decreased from ${comparison.previousFindingCount} to ${comparison.currentFindingCount}.`,
    );
  }
  if (comparison.resolvedCandidates.length) {
    improvementsSinceLastRun.push(`Previously recurring issues not reproduced: ${comparison.resolvedCandidates.join(', ')}`);
  }

  const memoryUpdates = [
    `Recorded ${session.findings.length} findings (${recurringFindings} recurring).`,
    `Updated ${riskScoreUpdates} risk score entries.`,
    `Captured ${selectorUpdates} selector reliability signals.`,
    `Stored ${session.generatedTests.length} generated test references.`,
    learningContext ? `Applied ${learningContext.suppressedFindingFingerprints.length} false-positive suppressions.` : 'Learning context not attached.',
  ];

  knowledge.lastUpdatedAt = new Date().toISOString();

  return {
    sessionId: session.id,
    updatedAt: knowledge.lastUpdatedAt,
    newFindings: newlyDiscoveredIssues.length,
    recurringFindings,
    regressionCandidates,
    newlyDiscoveredIssues,
    improvementsSinceLastRun,
    memoryUpdates,
    riskScoreUpdates,
    selectorUpdates,
    falsePositivesRecorded: knowledge.falsePositives.length,
  };
}

export function filterSessionFindingsWithMemory(session: ExplorationSession, knowledge: LongTermKnowledge) {
  return session.findings.filter((finding) => {
    const fp = findingFingerprint(finding);
    return !knowledge.falsePositives.some(
      (item) => item.fingerprint === fp && (item.status === 'false-positive' || item.status === 'ignored'),
    );
  });
}
