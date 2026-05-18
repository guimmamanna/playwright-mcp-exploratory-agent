import type { AgentAction, LocatorStrategy } from '../types';

export interface HealedLocatorResult {
  success: boolean;
  action: AgentAction;
  strategy?: LocatorStrategy;
  strategiesTried: LocatorStrategy[];
  message?: string;
}

export type LocatorStrategyOrder =
  | 'role'
  | 'label'
  | 'placeholder'
  | 'text'
  | 'testId'
  | 'css'
  | 'xpath'
  | 'vision';
