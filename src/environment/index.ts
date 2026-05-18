export { environmentProfiles, getEnvironmentProfile } from './profiles';
export { checkEnvironmentSafety, environmentForbiddenActions } from './safetyRules';
export { detectFeatureFlags, compareFeatureFlags, featureFlagDomScript } from './featureFlags';
export { validateLocale, localeDomScript } from './localeValidation';
export { resolveExplorationContext, attachExplorationContext } from './explorationContext';
export type {
  EnvironmentId,
  EnvironmentProfile,
  EnvironmentRiskTier,
  TestDataMode,
  DetectedFeatureFlag,
  FeatureFlagSignals,
  LocaleSignals,
  LocaleIssue,
} from './types';
export type { ExplorationContextSnapshot, ResolvedExplorationContext, ResolveExplorationContextOptions } from './explorationContext';
