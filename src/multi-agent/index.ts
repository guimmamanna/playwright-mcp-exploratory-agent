export * from './types';
export * from './protocol';
export * from './blackboard';
export * from './conflictResolver';
export * from './findingMerge';
export * from './scheduling';
export { MultiAgentCoordinator, type MultiAgentCoordinatorOptions } from './coordinator';

import type { ExplorationConfig } from '../types';
import type { MultiAgentConfig } from './types';

export const defaultMultiAgentConfig: MultiAgentConfig = {
  enabled: false,
  scheduleMode: 'parallel',
  focus: 'full',
  escalateCritical: true,
  runTestGeneratorDuringSession: true,
};

export function resolveMultiAgentConfig(config: ExplorationConfig): MultiAgentConfig {
  return {
    enabled: config.multiAgentEnabled ?? false,
    scheduleMode: config.multiAgentScheduleMode ?? 'parallel',
    focus: config.multiAgentFocus ?? 'full',
    escalateCritical: config.multiAgentEscalateCritical ?? true,
    runTestGeneratorDuringSession: config.multiAgentRunTestGenerator ?? true,
  };
}
