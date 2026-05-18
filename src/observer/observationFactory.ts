import type { Observation } from '../types';

export function createBlankObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: overrides.id || `observation-${Date.now()}`,
    timestamp: overrides.timestamp || new Date().toISOString(),
    phase: overrides.phase || 'standalone',
    stepId: overrides.stepId,
    url: overrides.url || 'about:blank',
    title: overrides.title,
    visibleText: overrides.visibleText || '',
    visibleTextSummary: overrides.visibleTextSummary || overrides.visibleText || '',
    domSummary: overrides.domSummary || '',
    accessibilitySnapshot: overrides.accessibilitySnapshot,
    accessibilitySignals: overrides.accessibilitySignals,
    networkSignals: overrides.networkSignals,
    visualSignals: overrides.visualSignals,
    visionSignals: overrides.visionSignals,
    featureFlagSignals: overrides.featureFlagSignals,
    localeSignals: overrides.localeSignals,
    screenshotPath: overrides.screenshotPath,
    consoleMessages: overrides.consoleMessages || [],
    networkEvents: overrides.networkEvents || [],
    failedNetworkRequests: overrides.failedNetworkRequests || [],
    interactiveElements: overrides.interactiveElements || [],
    buttons: overrides.buttons || [],
    inputs: overrides.inputs || [],
    forms: overrides.forms || [],
    links: overrides.links || [],
    visualAnomalies: overrides.visualAnomalies || [],
    errors: overrides.errors || [],
  };
}

export function summarizeObservation(observation: Observation): string {
  return [
    `URL: ${observation.url}`,
    observation.title ? `Title: ${observation.title}` : undefined,
    observation.visibleTextSummary ? `Visible text: ${observation.visibleTextSummary}` : undefined,
    `Interactive elements: ${observation.interactiveElements.length}`,
    `Buttons: ${observation.buttons.length}`,
    `Links: ${observation.links.length}`,
    `Inputs: ${observation.inputs.length}`,
    `Forms: ${observation.forms.length}`,
    `Console errors: ${observation.consoleMessages.filter((message) => message.level === 'error').length}`,
    `Failed network requests: ${(observation.failedNetworkRequests || []).length}`,
    observation.screenshotPath ? `Screenshot: ${observation.screenshotPath}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}
