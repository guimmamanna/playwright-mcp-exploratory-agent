import type { LongTermKnowledge, MemoryStorageAdapter } from '../types';
import { JsonMemoryStorage, createEmptyKnowledge } from './jsonMemoryStorage';

/**
 * SQLite adapter placeholder — persists via JSON fallback until sqlite driver is added.
 */
export class SqliteMemoryStorage implements MemoryStorageAdapter {
  readonly kind = 'sqlite' as const;
  private readonly fallback: JsonMemoryStorage;

  constructor(filePath: string) {
    this.fallback = new JsonMemoryStorage(filePath.replace(/\.sqlite?$/i, '.json'));
  }

  load(): Promise<LongTermKnowledge> {
    return this.fallback.load();
  }

  save(knowledge: LongTermKnowledge): Promise<void> {
    return this.fallback.save({ ...knowledge, lastUpdatedAt: new Date().toISOString() });
  }

  async init(): Promise<void> {
    await this.fallback.save(createEmptyKnowledge());
  }
}
