import type { AgentActionKind, ExplorationPriority } from '../types';

export type PersonaId =
  | 'first-time-user'
  | 'returning-user'
  | 'admin'
  | 'readonly-user'
  | 'premium-user'
  | 'mobile-only-user'
  | 'accessibility-user'
  | 'anonymous-visitor';

export type PersonaRiskProfile = 'conservative' | 'balanced' | 'aggressive';

export type NavigationStyle = 'breadth-first' | 'depth-first' | 'task-focused';

export interface PersonaProfile {
  id: PersonaId;
  name: string;
  description: string;
  explorationPriorities: ExplorationPriority[];
  riskProfile: PersonaRiskProfile;
  preferredFlows: string[];
  permissions: string[];
  allowedActions?: AgentActionKind[];
  restrictedFlows: string[];
  accessibilitySettings: {
    auditEnabled: boolean;
    keyboardCheckEnabled: boolean;
  };
  navigationStyle: NavigationStyle;
  viewport?: { width: number; height: number };
  locale?: string;
}

export type ActionBlockSource = 'persona' | 'environment' | 'config';

export interface ActionPolicyResult {
  allowed: boolean;
  reason?: string;
  source?: ActionBlockSource;
}
