import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LongTermKnowledge, MemoryStorageAdapter } from '../types';

export function createEmptyKnowledge(): LongTermKnowledge {
  return {
    version: 1,
    lastUpdatedAt: new Date().toISOString(),
    stableFlows: [],
    flakyFlows: [],
    recurringBugs: [],
    testedAreas: [],
    highRiskPages: [],
    reliableSelectors: [],
    healedSelectors: [],
    falsePositives: [],
    environmentBehaviours: {},
    personaBehaviours: {},
    pastGeneratedTests: [],
    riskScores: [],
    learningSignals: [],
    explorationGaps: [],
    sessionHistory: [],
  };
}

export class JsonMemoryStorage implements MemoryStorageAdapter {
  readonly kind = 'json' as const;

  constructor(private readonly filePath: string) {}

  async load(): Promise<LongTermKnowledge> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as LongTermKnowledge;
      return { ...createEmptyKnowledge(), ...parsed, version: 1 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return createEmptyKnowledge();
      }
      throw error;
    }
  }

  async save(knowledge: LongTermKnowledge): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(knowledge, null, 2), 'utf8');
  }
}
