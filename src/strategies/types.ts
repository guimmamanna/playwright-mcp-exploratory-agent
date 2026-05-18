import type { ExplorationPriority } from '../types';

export type ExplorationStrategyId =
  | 'authentication-focused'
  | 'form-focused'
  | 'navigation-focused'
  | 'accessibility-focused'
  | 'stress-exploration'
  | 'edge-case-exploration'
  | 'state-persistence-exploration'
  | 'permission-exploration'
  | 'responsive-exploration';

export interface StrategyDefinition {
  id: ExplorationStrategyId;
  name: string;
  description: string;
  priorities: ExplorationPriority[];
  riskAreas: string[];
  scoreBoost: number;
}
