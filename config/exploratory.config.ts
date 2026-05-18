import { defaultExplorationConfig } from '../src/config/defaultConfig';
import type { ExplorationConfig } from '../src/types';

const config: ExplorationConfig = {
  ...defaultExplorationConfig,
  baseUrl: 'http://localhost:3000',
  environmentName: 'local',
  maxSteps: 12,
  maxDurationMinutes: 8,
  viewport: {
    width: 1440,
    height: 900,
  },
  persona: 'anonymous first-time visitor',
  allowedDomains: ['localhost', '127.0.0.1'],
  allowedActions: [
    'navigate',
    'click',
    'fill',
    'search',
    'select',
    'check',
    'uncheck',
    'press',
    'goBack',
    'wait',
    'waitForLoadState',
    'screenshot',
    'noop',
    'stop',
  ],
  forbiddenActions: [
    'checkout',
    'payment',
    'purchase',
    'send-email',
    'send-message',
    'delete',
    'remove account',
    'account settings',
  ],
  credentials: undefined,
  reportingOptions: {
    reportDirectory: 'exploratory-results',
    includeConsole: true,
    includeNetwork: true,
    includeScreenshots: true,
  },
  screenshotMode: 'on-failure',
  saveVideo: false,
  generateTests: true,
};

export default config;
