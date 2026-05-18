import type { ExplorationGoal } from '../types';

export const amazonExplorationGoal: ExplorationGoal = {
  id: 'amazon-uk-homepage-smoke',
  name: 'Amazon UK homepage smoke exploration',
  description:
    'Explore the Amazon UK homepage: navigation, search, category links, and non-destructive interactions. Avoid checkout, payments, and account changes.',
  baseUrl: 'https://www.amazon.co.uk',
  targetUrl: '/ref=nav_logo',
  priorities: ['navigation', 'search', 'accessibility', 'console-network', 'responsiveness'],
  acceptanceCriteria: [
    'Homepage loads without critical console errors.',
    'Primary navigation and search are discoverable.',
    'No checkout, payment, or destructive actions are attempted.',
  ],
  riskAreas: ['cookie-banner', 'geo-delivery-banner', 'sign-in-modal'],
  destructiveActionsAllowed: false,
  metadata: {
    market: 'amazon.co.uk',
    locale: 'en-GB',
  },
};
