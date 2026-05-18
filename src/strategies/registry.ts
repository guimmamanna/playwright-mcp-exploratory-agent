import type { StrategyDefinition } from './types';

export const strategyRegistry: Record<string, StrategyDefinition> = {
  'authentication-focused': {
    id: 'authentication-focused',
    name: 'Authentication focused',
    description: 'Explore login, signup, session, and paywall entry points.',
    priorities: ['authentication', 'navigation', 'forms'],
    riskAreas: ['auth', 'session', 'paywall'],
    scoreBoost: 35,
  },
  'form-focused': {
    id: 'form-focused',
    name: 'Form focused',
    description: 'Prioritize form filling, validation, and submission flows.',
    priorities: ['forms', 'search', 'filters'],
    riskAreas: ['validation', 'required fields'],
    scoreBoost: 30,
  },
  'navigation-focused': {
    id: 'navigation-focused',
    name: 'Navigation focused',
    description: 'Breadth-first navigation across primary user journeys.',
    priorities: ['navigation', 'search', 'filters'],
    riskAreas: ['dead ends', 'broken links'],
    scoreBoost: 20,
  },
  'accessibility-focused': {
    id: 'accessibility-focused',
    name: 'Accessibility focused',
    description: 'Keyboard, ARIA, contrast, and modal accessibility checks.',
    priorities: ['accessibility', 'navigation', 'forms'],
    riskAreas: ['keyboard trap', 'labels', 'contrast'],
    scoreBoost: 32,
  },
  'stress-exploration': {
    id: 'stress-exploration',
    name: 'Stress exploration',
    description: 'Rapid interaction and repeated actions to surface instability.',
    priorities: ['console-network', 'performance', 'forms'],
    riskAreas: ['performance', 'race conditions'],
    scoreBoost: 18,
  },
  'edge-case-exploration': {
    id: 'edge-case-exploration',
    name: 'Edge case exploration',
    description: 'Invalid inputs, empty states, and boundary conditions.',
    priorities: ['forms', 'uploads', 'create-edit-delete'],
    riskAreas: ['validation', 'empty state'],
    scoreBoost: 28,
  },
  'state-persistence-exploration': {
    id: 'state-persistence-exploration',
    name: 'State persistence exploration',
    description: 'Verify filters, selections, and drafts persist across navigation.',
    priorities: ['state-persistence', 'filters', 'forms'],
    riskAreas: ['filter persistence', 'draft state'],
    scoreBoost: 26,
  },
  'permission-exploration': {
    id: 'permission-exploration',
    name: 'Permission exploration',
    description: 'Probe role boundaries, admin pages, and restricted actions.',
    priorities: ['settings', 'navigation', 'authentication'],
    riskAreas: ['permissions', 'authorization'],
    scoreBoost: 34,
  },
  'responsive-exploration': {
    id: 'responsive-exploration',
    name: 'Responsive exploration',
    description: 'Focus on layout behavior across viewport sizes.',
    priorities: ['responsiveness', 'navigation', 'accessibility'],
    riskAreas: ['layout', 'overflow', 'mobile'],
    scoreBoost: 24,
  },
};

export function getStrategy(id: string) {
  return strategyRegistry[id] || strategyRegistry['navigation-focused'];
}
