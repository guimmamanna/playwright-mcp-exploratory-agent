import type { ExplorationConfig, ExplorationGoal, ExplorationPriority } from '../types';
import type { LongTermKnowledge, SessionLearningContext } from './types';
import { suppressedFingerprints } from '../learning/falsePositiveManager';
import { pathnameOf } from '../learning/fingerprints';
import { topRiskRoutes } from '../learning/riskScoring';

function targetRoute(goal: ExplorationGoal, config: ExplorationConfig) {
  if (goal.targetUrl) {
    try {
      return new URL(goal.targetUrl, config.baseUrl).pathname;
    } catch {
      return goal.targetUrl;
    }
  }
  try {
    return new URL(config.baseUrl).pathname || '/';
  } catch {
    return '/';
  }
}

export function retrieveMemoryForSession(
  knowledge: LongTermKnowledge,
  goal: ExplorationGoal,
  config: ExplorationConfig,
): SessionLearningContext {
  const route = targetRoute(goal, config);
  const personaId = config.personaId || config.persona;
  const environmentId = config.environmentId || config.environmentName;

  const routeRisks = topRiskRoutes(knowledge, 8).map((entry) => ({
    area: entry.key,
    route: entry.key,
    score: entry.score,
    reason: entry.reasons.join('; ') || 'Historically elevated risk',
  }));

  const areaRisks = knowledge.riskScores
    .filter((entry) => entry.dimension === 'feature-area')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => ({
      area: entry.key,
      score: entry.score,
      reason: entry.reasons.join('; ') || 'Feature area risk history',
    }));

  const knownRisks = [...routeRisks, ...areaRisks];
  const routeSpecific = knownRisks.filter((risk) => !risk.route || risk.route === route || route.startsWith(risk.route));

  const recommendedPriorities = new Set<ExplorationPriority>(goal.priorities);
  for (const gap of knowledge.explorationGaps) {
    recommendedPriorities.add(gap.recommendedPriority);
  }
  if (routeSpecific.some((risk) => risk.score >= 25)) {
    recommendedPriorities.add('console-network');
  }
  if (knowledge.flakyFlows.some((flow) => flow.route === route)) {
    recommendedPriorities.add('forms');
    recommendedPriorities.add('navigation');
  }

  const stableSelectors = knowledge.reliableSelectors
    .filter((item) => item.reliability >= 0.7)
    .sort((a, b) => b.reliability - a.reliability)
    .slice(0, 20);

  const healedSelectors = [...knowledge.healedSelectors].sort((a, b) => b.timesUsed - a.timesUsed).slice(0, 15);

  const previousBugs = knowledge.recurringBugs
    .filter((bug) => bug.routes.includes(route) || bug.occurrences > 1)
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 15);

  const flakyFlows = knowledge.flakyFlows
    .filter((flow) => !flow.route || flow.route === route)
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 10);

  const explorationGaps = knowledge.explorationGaps
    .filter((gap) => route === '/' || gap.area.includes(route) || goal.priorities.includes(gap.recommendedPriority))
    .slice(0, 10);

  const personaBehaviour = personaId ? knowledge.personaBehaviours[personaId] : undefined;
  if (personaBehaviour?.preferredFlows.length) {
    recommendedPriorities.add('navigation');
  }

  const envBehaviour = knowledge.environmentBehaviours[environmentId];
  if (envBehaviour?.slowApiEndpoints.length) {
    recommendedPriorities.add('console-network');
  }

  return {
    retrievedAt: new Date().toISOString(),
    knownRisks: routeSpecific.length ? routeSpecific : knownRisks,
    previousBugs,
    flakyFlows,
    stableSelectors,
    healedSelectors,
    recommendedPriorities: Array.from(recommendedPriorities),
    explorationGaps,
    suppressedFindingFingerprints: suppressedFingerprints(knowledge),
    falsePositiveCount: knowledge.falsePositives.filter((item) => item.status === 'false-positive' || item.status === 'ignored').length,
    historicalSessionCount: knowledge.sessionHistory.length,
  };
}

export function recordTestedArea(knowledge: LongTermKnowledge, route: string, featureArea?: string) {
  const areaKey = `${pathnameOf(route)}::${featureArea || 'general'}`;
  const existing = knowledge.testedAreas.find((item) => item.areaKey === areaKey);
  const now = new Date().toISOString();
  if (existing) {
    existing.timesTested += 1;
    existing.lastTestedAt = now;
    return existing;
  }
  knowledge.testedAreas.push({
    areaKey,
    route: pathnameOf(route),
    featureArea,
    timesTested: 1,
    lastTestedAt: now,
  });
  return knowledge.testedAreas.at(-1)!;
}
