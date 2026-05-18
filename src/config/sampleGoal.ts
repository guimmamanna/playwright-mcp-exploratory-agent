import type { ExplorationGoal } from '../types';

export const sampleExplorationGoal: ExplorationGoal = {
  id: 'demo-todomvc-smoke',
  name: 'Demo TodoMVC smoke exploration',
  description:
    'Explore the Playwright TodoMVC demo: add items, toggle completion, and capture console, network, and accessibility issues without destructive actions.',
  baseUrl: 'https://demo.playwright.dev',
  targetUrl: '/todomvc',
  priorities: ['navigation', 'forms', 'accessibility', 'console-network', 'responsiveness'],
  acceptanceCriteria: [
    'The demo page loads without critical console errors.',
    'Primary interactive controls are discoverable.',
    'No destructive action is attempted.',
  ],
  destructiveActionsAllowed: false,
};
