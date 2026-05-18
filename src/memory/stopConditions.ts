import type { ExplorationSession } from '../types';
import { detectExplorationLoop } from './loopDetection';

export interface StopEvaluation {
  shouldStop: boolean;
  reason?: string;
  condition?: string;
}

function criticalFindingCount(session: ExplorationSession) {
  return session.findings.filter((finding) => finding.severity === 'critical' && finding.status !== 'dismissed').length;
}

export function evaluateStopConditions(
  session: ExplorationSession,
  options: { deadline: number; now?: number },
): StopEvaluation {
  const now = options.now ?? Date.now();
  const { config } = session;

  if (config.stopConditions.includes('maxSteps') && session.steps.length >= config.maxSteps) {
    return {
      shouldStop: true,
      condition: 'maxSteps',
      reason: `Maximum step limit reached (${config.maxSteps}).`,
    };
  }

  if (config.stopConditions.includes('maxDuration') && now >= options.deadline) {
    return {
      shouldStop: true,
      condition: 'maxDuration',
      reason: `Maximum duration reached (${config.maxDurationMinutes} minutes).`,
    };
  }

  if (config.stopConditions.includes('loopDetected')) {
    const loop = detectExplorationLoop(session);
    if (loop.detected) {
      return {
        shouldStop: true,
        condition: 'loopDetected',
        reason: loop.description || 'Repeated exploration loop detected.',
      };
    }
  }

  if (config.stopConditions.includes('maxCriticalFailures') && criticalFindingCount(session) >= 3) {
    return {
      shouldStop: true,
      condition: 'maxCriticalFailures',
      reason: `Too many critical failures found (${criticalFindingCount(session)}).`,
    };
  }

  if (config.stopConditions.includes('criticalFinding')) {
    const critical = session.findings.find((finding) => finding.severity === 'critical' && finding.status !== 'dismissed');
    if (critical) {
      return {
        shouldStop: true,
        condition: 'criticalFinding',
        reason: `Critical finding encountered: ${critical.title}.`,
      };
    }
  }

  for (const note of session.memory.notes) {
    if (note.startsWith('user-stop:') && config.stopConditions.includes('userDefined')) {
      return {
        shouldStop: true,
        condition: 'userDefined',
        reason: note.replace(/^user-stop:\s*/, ''),
      };
    }
  }

  return { shouldStop: false };
}

export function applyStopEvaluation(session: ExplorationSession, evaluation: StopEvaluation) {
  if (evaluation.shouldStop && evaluation.reason) {
    session.memory.stopReason = evaluation.reason;
  }
}
