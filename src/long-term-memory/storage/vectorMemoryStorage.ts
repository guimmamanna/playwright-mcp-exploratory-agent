import type { LongTermKnowledge, MemoryStorageAdapter } from '../types';
import { JsonMemoryStorage } from './jsonMemoryStorage';

/**
 * Vector database adapter stub for future semantic retrieval.
 * Currently delegates to JSON storage.
 */
export class VectorMemoryStorage implements MemoryStorageAdapter {
  readonly kind = 'vector' as const;
  private readonly fallback: JsonMemoryStorage;

  constructor(filePath: string) {
    this.fallback = new JsonMemoryStorage(filePath.replace(/\.vector\.json$/i, '.json'));
  }

  load(): Promise<LongTermKnowledge> {
    return this.fallback.load();
  }

  save(knowledge: LongTermKnowledge): Promise<void> {
    return this.fallback.save(knowledge);
  }

  async searchSimilar(_query: string, _limit = 5): Promise<string[]> {
    return [];
  }
}
