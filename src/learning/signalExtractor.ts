import type { ExplorationSession } from '../types';
import type { LearningSignalRecord, LongTermKnowledge } from '../long-term-memory/types';
import { findingFingerprint, flowKey, pathnameOf, selectorKey } from './fingerprints';

function pushSignal(
  knowledge: LongTermKnowledge,
  signal: Omit<LearningSignalRecord, 'id' | 'timestamp'> & { id?: string },
) {
  const record: LearningSignalRecord = {
    id: signal.id || `signal-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    signalType: signal.signalType,
    summary: signal.summary,
    route: signal.route,
    sessionId: signal.sessionId,
    metadata: signal.metadata,
  };
  knowledge.learningSignals.push(record);
  if (knowledge.learningSignals.length > 200) {
    knowledge.learningSignals = knowledge.learningSignals.slice(-200);
  }
  return record;
}

export function extractLearningSignals(knowledge: LongTermKnowledge, session: ExplorationSession) {
  const signals: LearningSignalRecord[] = [];

  const findingGroups = new Map<string, number>();
  for (const finding of session.findings) {
    const fp = findingFingerprint(finding);
    findingGroups.set(fp, (findingGroups.get(fp) || 0) + 1);
    if ((findingGroups.get(fp) || 0) >= 2) {
      signals.push(
        pushSignal(knowledge, {
          signalType: 'repeated-finding',
          summary: `Repeated finding: ${finding.title}`,
          route: pathnameOf(finding.url),
          sessionId: session.id,
          metadata: { fingerprint: fp },
        }),
      );
    }
  }

  for (const step of session.steps) {
    if (step.recoveryAttempts?.some((attempt) => attempt.success)) {
      signals.push(
        pushSignal(knowledge, {
          signalType: 'successful-recovery',
          summary: `Recovered action via ${step.recoveryAttempts!.find((item) => item.success)!.strategy}`,
          route: pathnameOf(step.afterObservation?.url || step.beforeObservation.url),
          sessionId: session.id,
        }),
      );
    }

    if (step.execution?.selectorHealingApplied) {
      signals.push(
        pushSignal(knowledge, {
          signalType: 'flaky-selector',
          summary: `Selector healing applied for ${step.plan.action.target || step.plan.action.selector}`,
          route: pathnameOf(step.afterObservation?.url),
          sessionId: session.id,
        }),
      );
    }

    const failed = step.execution?.status === 'failed';
    const succeeded = step.execution?.status === 'success';
    const route = pathnameOf(step.afterObservation?.url || step.beforeObservation.url);
    const key = flowKey(route, step.plan.action.kind, step.plan.action.target);

    if (succeeded) {
      const stable = knowledge.stableFlows.find((flow) => flow.flowKey === key);
      if (stable) {
        stable.successCount += 1;
        stable.lastSeenAt = new Date().toISOString();
        if (!stable.sessionIds.includes(session.id)) stable.sessionIds.push(session.id);
      } else {
        knowledge.stableFlows.push({
          flowKey: key,
          summary: `${step.plan.action.kind} on ${step.plan.action.target || route}`,
          route,
          sessionIds: [session.id],
          lastSeenAt: new Date().toISOString(),
          successCount: 1,
        });
      }
    }

    if (failed) {
      const flaky = knowledge.flakyFlows.find((flow) => flow.flowKey === key);
      if (flaky) {
        flaky.failureCount += 1;
        flaky.lastFailureAt = new Date().toISOString();
        if (!flaky.sessionIds.includes(session.id)) flaky.sessionIds.push(session.id);
      } else {
        knowledge.flakyFlows.push({
          flowKey: key,
          summary: `${step.plan.action.kind} failed on ${step.plan.action.target || route}`,
          route,
          failureCount: 1,
          successCount: 0,
          sessionIds: [session.id],
          lastFailureAt: new Date().toISOString(),
        });
      }
      signals.push(
        pushSignal(knowledge, {
          signalType: 'unstable-page',
          summary: `Unstable flow at ${route}`,
          route,
          sessionId: session.id,
        }),
      );
    }

    const strategy = step.execution?.locatorStrategy;
    if (strategy?.value) {
      const keySelector = selectorKey(strategy.type, strategy.value);
      let record = knowledge.reliableSelectors.find((item) => item.selectorKey === keySelector);
      if (!record) {
        record = {
          selectorKey: keySelector,
          strategy: strategy.type,
          value: strategy.value,
          successCount: 0,
          failureCount: 0,
          reliability: 0.5,
          lastUsedAt: new Date().toISOString(),
        };
        knowledge.reliableSelectors.push(record);
      }
      if (succeeded) record.successCount += 1;
      if (failed) record.failureCount += 1;
      const total = record.successCount + record.failureCount;
      record.reliability = total ? record.successCount / total : 0.5;
      record.lastUsedAt = new Date().toISOString();
    }

    for (const attempt of step.recoveryAttempts || []) {
      if (attempt.healedSelector) {
        const healed = knowledge.healedSelectors.find(
          (item) => item.healedSelector === attempt.healedSelector && item.originalSelector === step.plan.action.selector,
        );
        if (healed) {
          healed.timesUsed += 1;
          healed.lastUsedAt = new Date().toISOString();
        } else {
          knowledge.healedSelectors.push({
            originalSelector: step.plan.action.selector,
            healedSelector: attempt.healedSelector,
            strategy: attempt.healedStrategy?.type || 'css',
            timesUsed: 1,
            lastUsedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  for (const event of session.memory.observations.flatMap((observation) => observation.networkEvents || [])) {
    if ((event.responseTimeMs || 0) >= (session.config.networkSlowHighMs || 3000)) {
      signals.push(
        pushSignal(knowledge, {
          signalType: 'slow-api',
          summary: `Slow API ${event.method} ${event.url} (${event.responseTimeMs}ms)`,
          route: pathnameOf(event.pageUrl),
          sessionId: session.id,
          metadata: { status: String(event.status || '') },
        }),
      );
      const envId = session.config.environmentId || session.config.environmentName;
      const env = knowledge.environmentBehaviours[envId] || {
        environmentId: envId,
        notes: [],
        slowApiEndpoints: [],
        lastUpdatedAt: new Date().toISOString(),
      };
      if (!env.slowApiEndpoints.includes(event.url)) env.slowApiEndpoints.push(event.url);
      env.lastUpdatedAt = new Date().toISOString();
      knowledge.environmentBehaviours[envId] = env;
    }
  }

  for (const finding of session.findings.filter((item) => item.category === 'accessibility')) {
    signals.push(
      pushSignal(knowledge, {
        signalType: 'accessibility-hotspot',
        summary: finding.title,
        route: pathnameOf(finding.url),
        sessionId: session.id,
      }),
    );
  }

  for (const finding of session.findings.filter((item) => item.category === 'visual')) {
    signals.push(
      pushSignal(knowledge, {
        signalType: 'visual-regression-hotspot',
        summary: finding.title,
        route: pathnameOf(finding.url),
        sessionId: session.id,
      }),
    );
  }

  for (const area of session.memory.coverage.unexploredAreas) {
    const existing = knowledge.explorationGaps.find((gap) => gap.area === area);
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
    } else {
      knowledge.explorationGaps.push({
        area,
        reason: 'Area remained unexplored in session coverage.',
        recommendedPriority: area.includes('form') ? 'forms' : area.includes('nav') ? 'navigation' : 'accessibility',
        lastSeenAt: new Date().toISOString(),
      });
    }
  }

  return signals;
}
