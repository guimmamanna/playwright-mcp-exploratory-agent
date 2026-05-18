import type { ExplorationConfig, ExplorationGoal } from '../types';
import { defaultExplorationConfig } from '../config/defaultConfig';
import { environmentForbiddenActions } from './safetyRules';
import { getEnvironmentProfile } from './profiles';
import type { EnvironmentId, EnvironmentProfile } from './types';
import { getPersonaProfile } from '../personas/profiles';
import type { PersonaId, PersonaProfile } from '../personas/types';

export interface ExplorationContextSnapshot {
  environmentId: EnvironmentId;
  personaId: PersonaId;
  environment: EnvironmentProfile;
  persona: PersonaProfile;
  locale: string;
  timezone: string;
  apiEnvironment: string;
  testDataMode: string;
  detectedFeatureFlags: string[];
  observedPermissions: string[];
  configuredFeatureFlags: Record<string, boolean | string>;
}

export interface ResolvedExplorationContext {
  config: ExplorationConfig;
  goal: ExplorationGoal;
  context: ExplorationContextSnapshot;
}

export interface ResolveExplorationContextOptions {
  environmentId?: string;
  personaId?: string;
  config?: Partial<ExplorationConfig>;
  goal?: Partial<ExplorationGoal>;
}

export function resolveExplorationContext(options: ResolveExplorationContextOptions = {}): ResolvedExplorationContext {
  const environment = getEnvironmentProfile(
    options.environmentId || options.config?.environmentId || options.config?.environmentName || 'local',
  );
  const persona = getPersonaProfile(
    options.personaId || options.config?.personaId || options.config?.persona || 'anonymous-visitor',
  );

  const mergedConfig: ExplorationConfig = {
    ...defaultExplorationConfig,
    ...options.config,
    environmentName: environment.id,
    persona: persona.id,
    baseUrl: options.config?.baseUrl || environment.baseUrl,
    allowedDomains: options.config?.allowedDomains || environment.allowedDomains,
    forbiddenActions: Array.from(
      new Set([...defaultExplorationConfig.forbiddenActions, ...environmentForbiddenActions(environment)]),
    ),
    viewport: persona.viewport || options.config?.viewport || defaultExplorationConfig.viewport,
    accessibilityAuditEnabled:
      persona.accessibilitySettings.auditEnabled ?? options.config?.accessibilityAuditEnabled ?? true,
    keyboardNavigationCheckEnabled:
      persona.accessibilitySettings.keyboardCheckEnabled ?? options.config?.keyboardNavigationCheckEnabled ?? true,
    multiViewportVisualMode:
      persona.id === 'mobile-only-user' ? true : options.config?.multiViewportVisualMode ?? defaultExplorationConfig.multiViewportVisualMode,
    locale: environment.locale,
    timezone: environment.timezone,
    featureFlags: { ...environment.featureFlags, ...(options.config?.featureFlags || {}) },
  };

  const mergedGoal: ExplorationGoal = {
    id: options.goal?.id || 'exploratory-goal',
    name: options.goal?.name || `${persona.name} on ${environment.name}`,
    description:
      options.goal?.description ||
      `Explore as ${persona.name} in the ${environment.name} environment (${environment.apiEnvironment}).`,
    baseUrl: mergedConfig.baseUrl,
    targetUrl: options.goal?.targetUrl,
    priorities: options.goal?.priorities || persona.explorationPriorities,
    acceptanceCriteria: options.goal?.acceptanceCriteria,
    riskAreas: options.goal?.riskAreas,
    destructiveActionsAllowed:
      options.goal?.destructiveActionsAllowed ?? (environment.allowDestructiveActions && persona.riskProfile === 'aggressive'),
    metadata: {
      environmentId: environment.id,
      personaId: persona.id,
      locale: environment.locale,
      apiEnvironment: environment.apiEnvironment,
      testDataMode: environment.testDataMode,
      navigationStyle: persona.navigationStyle,
      ...(options.goal?.metadata || {}),
    },
  };

  return {
    config: mergedConfig,
    goal: mergedGoal,
    context: {
      environmentId: environment.id,
      personaId: persona.id,
      environment,
      persona,
      locale: environment.locale,
      timezone: environment.timezone,
      apiEnvironment: environment.apiEnvironment,
      testDataMode: environment.testDataMode,
      detectedFeatureFlags: [],
      observedPermissions: [...persona.permissions],
      configuredFeatureFlags: { ...environment.featureFlags },
    },
  };
}

export function attachExplorationContext(
  session: { config: ExplorationConfig; goal: ExplorationGoal; explorationContext?: ExplorationContextSnapshot },
  resolved: ResolvedExplorationContext,
) {
  session.config = resolved.config;
  session.goal = resolved.goal;
  session.explorationContext = resolved.context;
}
