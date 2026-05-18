export { LongTermMemoryService, createLongTermMemoryService } from './longTermMemoryService';
export { retrieveMemoryForSession, recordTestedArea } from './retrieval';
export { updateMemoryFromSession, filterSessionFindingsWithMemory } from './sessionUpdate';
export type {
  LongTermKnowledge,
  SessionLearningContext,
  MemoryUpdateSummary,
  HistoricalComparison,
  FalsePositiveStatus,
  MemoryStorageKind,
  MemoryStorageAdapter,
} from './types';
