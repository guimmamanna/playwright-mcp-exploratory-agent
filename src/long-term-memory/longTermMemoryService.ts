import { join } from 'node:path';
import type { ExplorationConfig, ExplorationGoal, ExplorationSession } from '../types';
import { JsonMemoryStorage, SqliteMemoryStorage, VectorMemoryStorage } from './storage';
import type { LongTermKnowledge, MemoryStorageAdapter, MemoryUpdateSummary, SessionLearningContext } from './types';
import { retrieveMemoryForSession } from './retrieval';
import { updateMemoryFromSession } from './sessionUpdate';
import { markFindingStatus } from '../learning/falsePositiveManager';
import type { FalsePositiveStatus } from './types';
import type { Finding } from '../types';

export interface LongTermMemoryServiceOptions {
  storagePath?: string;
  adapter?: 'json' | 'sqlite' | 'vector';
}

export class LongTermMemoryService {
  private knowledge?: LongTermKnowledge;
  private readonly adapter: MemoryStorageAdapter;

  constructor(private readonly options: LongTermMemoryServiceOptions = {}) {
    const storagePath = options.storagePath || join('exploratory-results', 'long-term-memory', 'knowledge.json');
    this.adapter =
      options.adapter === 'sqlite'
        ? new SqliteMemoryStorage(storagePath)
        : options.adapter === 'vector'
          ? new VectorMemoryStorage(storagePath)
          : new JsonMemoryStorage(storagePath);
  }

  async load(): Promise<LongTermKnowledge> {
    if (!this.knowledge) {
      this.knowledge = await this.adapter.load();
    }
    return this.knowledge;
  }

  async save(): Promise<void> {
    if (!this.knowledge) return;
    await this.adapter.save(this.knowledge);
  }

  async retrieveForSession(goal: ExplorationGoal, config: ExplorationConfig): Promise<SessionLearningContext> {
    const knowledge = await this.load();
    return retrieveMemoryForSession(knowledge, goal, config);
  }

  async updateFromSession(
    session: ExplorationSession,
    learningContext?: SessionLearningContext,
  ): Promise<MemoryUpdateSummary> {
    const knowledge = await this.load();
    const summary = updateMemoryFromSession(knowledge, session, learningContext);
    await this.save();
    return summary;
  }

  async markFinding(
    finding: Finding,
    status: FalsePositiveStatus,
    reason?: string,
  ): Promise<void> {
    const knowledge = await this.load();
    markFindingStatus(knowledge, finding, status, reason);
    await this.save();
  }

  getKnowledge(): LongTermKnowledge | undefined {
    return this.knowledge;
  }
}

export function createLongTermMemoryService(options?: LongTermMemoryServiceOptions) {
  return new LongTermMemoryService(options);
}
