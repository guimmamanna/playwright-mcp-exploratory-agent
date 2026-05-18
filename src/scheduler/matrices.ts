import type { PersonaId } from '../types';
import type { BrowserMatrixId, ViewportMatrixId } from '../distributed/types';
import { responsiveViewports } from '../visual/viewports';

export const defaultBrowserMatrix: BrowserMatrixId[] = ['chromium', 'firefox', 'webkit'];

export const defaultViewportMatrix: ViewportMatrixId[] = ['mobile', 'tablet', 'desktop'];

export const defaultPersonaMatrix: PersonaId[] = [
  'anonymous-visitor',
  'first-time-user',
  'returning-user',
  'admin',
  'readonly-user',
  'accessibility-user',
];

export const defaultFeatureAreas = ['navigation', 'forms', 'settings', 'search', 'accessibility'];

export const defaultRoutes = ['/', '/login', '/settings'];

export const defaultRiskCategories = ['navigation', 'forms', 'authentication', 'accessibility', 'console-network'] as const;

export function viewportSizeFor(name: ViewportMatrixId) {
  const profile = responsiveViewports.find((viewport) => viewport.name === name);
  return profile ? { width: profile.width, height: profile.height } : { width: 1440, height: 900 };
}

export function browserLabel(browser: BrowserMatrixId) {
  switch (browser) {
    case 'firefox':
      return 'Firefox';
    case 'webkit':
      return 'WebKit';
    default:
      return 'Chrome';
  }
}
