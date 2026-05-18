import type { ExplorationSession } from '../types';
import { actionSignature } from './elementKey';

export interface LoopDetectionResult {
  detected: boolean;
  kind?: 'page-state' | 'action-cycle';
  description?: string;
  repeatCount?: number;
}

export function hasRepeatedObservationLoop(session: ExplorationSession, threshold = 3): boolean {
  const last = session.memory.observationSignatures.at(-1);
  if (!last) {
    return false;
  }

  return session.memory.observationSignatures.filter((signature) => signature === last).length >= threshold;
}

export function detectPageStateLoop(session: ExplorationSession, threshold = 3): LoopDetectionResult {
  const last = session.memory.observationSignatures.at(-1);
  if (!last) {
    return { detected: false };
  }

  const repeatCount = session.memory.observationSignatures.filter((signature) => signature === last).length;
  if (repeatCount < threshold) {
    return { detected: false };
  }

  return {
    detected: true,
    kind: 'page-state',
    repeatCount,
    description: `The same page state was observed ${repeatCount} times without meaningful progress.`,
  };
}

export function detectActionCycleLoop(session: ExplorationSession, cycleLength = 2, threshold = 2): LoopDetectionResult {
  const signatures = session.memory.actionHistory.map(actionSignature).filter(Boolean);
  if (signatures.length < cycleLength * threshold) {
    return { detected: false };
  }

  const recent = signatures.slice(-cycleLength * threshold);
  const pattern = recent.slice(-cycleLength).join('->');
  let cycles = 0;

  for (let index = recent.length - cycleLength; index >= 0; index -= cycleLength) {
    const slice = recent.slice(index, index + cycleLength).join('->');
    if (slice === pattern) {
      cycles += 1;
    } else {
      break;
    }
  }

  if (cycles >= threshold) {
    return {
      detected: true,
      kind: 'action-cycle',
      repeatCount: cycles,
      description: `Action cycle "${pattern}" repeated ${cycles} times.`,
    };
  }

  return { detected: false };
}

export function detectExplorationLoop(session: ExplorationSession): LoopDetectionResult {
  const pageLoop = detectPageStateLoop(session);
  if (pageLoop.detected) {
    return pageLoop;
  }

  return detectActionCycleLoop(session);
}
