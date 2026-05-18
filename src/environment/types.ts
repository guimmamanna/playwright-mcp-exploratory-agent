export type EnvironmentId = 'local' | 'dev' | 'qa' | 'uat' | 'staging' | 'production-like';

export type EnvironmentRiskTier = 'low' | 'medium' | 'high';

export type TestDataMode = 'synthetic' | 'fixture' | 'shared' | 'readonly';

export interface EnvironmentProfile {
  id: EnvironmentId;
  name: string;
  baseUrl: string;
  loginUrl?: string;
  featureFlags: Record<string, boolean | string>;
  allowedDomains: string[];
  restrictedActions: string[];
  apiEnvironment: string;
  locale: string;
  timezone: string;
  testDataMode: TestDataMode;
  riskTier: EnvironmentRiskTier;
  allowDataMutation: boolean;
  allowDestructiveActions: boolean;
  allowEmailSending: boolean;
}

export interface DetectedFeatureFlag {
  key: string;
  value?: string;
  source: 'dom' | 'config' | 'window';
  selector?: string;
}

export interface FeatureFlagSignals {
  flags: DetectedFeatureFlag[];
  gatedElements: string[];
  summary: string;
}

export interface LocaleSignals {
  locale: string;
  timezone: string;
  languageTag?: string;
  currencySamples: string[];
  dateSamples: string[];
  issues: LocaleIssue[];
  summary: string;
}

export interface LocaleIssue {
  id: string;
  issueType: 'language-mismatch' | 'currency-format' | 'timezone-hint' | 'locale-attribute';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  recommendation: string;
}
