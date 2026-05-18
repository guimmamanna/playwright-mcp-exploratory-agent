import type { ExplorationContextSnapshot } from './environment/explorationContext';
import type { FeatureFlagSignals, LocaleSignals } from './environment/types';
import type { ExplorationStrategyId } from './strategies/types';
import type { ReasoningSessionState } from './reasoning/types';
import type { RecoveryAttemptRecord, RecoverySessionState } from './recovery/types';
import type {
  HistoricalComparison,
  MemoryUpdateSummary,
  SessionLearningContext,
} from './long-term-memory/types';
import type { VisionSignals } from './vision/models/types';

export type AgentRoleName =
  | 'ExplorerAgent'
  | 'AccessibilityAgent'
  | 'NetworkAgent'
  | 'VisualAgent'
  | 'SecuritySmokeAgent'
  | 'TestGeneratorAgent'
  | 'ReportAgent';

export type MultiAgentScheduleMode = 'sequential' | 'parallel' | 'focused';

export type MultiAgentFocus =
  | 'full'
  | 'accessibility-only'
  | 'network-only'
  | 'visual-regression-only';

export type ExplorationPriority =
  | 'authentication'
  | 'navigation'
  | 'forms'
  | 'filters'
  | 'search'
  | 'create-edit-delete'
  | 'uploads'
  | 'settings'
  | 'state-persistence'
  | 'accessibility'
  | 'responsiveness'
  | 'console-network'
  | 'performance';

export type AgentActionKind =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'search'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'press'
  | 'goBack'
  | 'wait'
  | 'waitForLoadState'
  | 'screenshot'
  | 'noop'
  | 'stop';

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

export type FindingCategory =
  | 'functional'
  | 'accessibility'
  | 'usability'
  | 'performance'
  | 'visual'
  | 'console-error'
  | 'network-error'
  | 'data-issue';

export type ReproducibilityConfidence = 'low' | 'medium' | 'high';

export type GeneratedTestFlowCategory = 'successful-flow' | 'reproduced-bug' | 'navigation-path';

export type GeneratedTestConfidence = 'low' | 'medium' | 'high';

export type FindingType =
  | 'console-error'
  | 'network-failure'
  | 'accessibility'
  | 'broken-link'
  | 'form-validation'
  | 'empty-state'
  | 'navigation-dead-end'
  | 'visual-anomaly'
  | 'safety'
  | 'loop-detected'
  | 'flow-failure';

export type SessionStatus = 'created' | 'running' | 'completed' | 'stopped' | 'failed';

export interface ExplorationGoal {
  id: string;
  name: string;
  description: string;
  baseUrl?: string;
  targetUrl?: string;
  priorities: ExplorationPriority[];
  acceptanceCriteria?: string[];
  riskAreas?: string[];
  destructiveActionsAllowed?: boolean;
  metadata?: Record<string, string>;
}

export interface CredentialsRef {
  id: string;
  description?: string;
}

export interface ReportingOptions {
  reportDirectory: string;
  includeConsole: boolean;
  includeNetwork: boolean;
  includeScreenshots: boolean;
}

export type EnvironmentId = 'local' | 'dev' | 'qa' | 'uat' | 'staging' | 'production-like';

export type PersonaId =
  | 'first-time-user'
  | 'returning-user'
  | 'admin'
  | 'readonly-user'
  | 'premium-user'
  | 'mobile-only-user'
  | 'accessibility-user'
  | 'anonymous-visitor';

export interface ExplorationConfig {
  baseUrl: string;
  environmentName: string;
  environmentId?: EnvironmentId;
  personaId?: PersonaId;
  maxSteps: number;
  maxDurationMinutes: number;
  viewport: {
    width: number;
    height: number;
  };
  persona: string;
  locale?: string;
  timezone?: string;
  featureFlags?: Record<string, boolean | string>;
  allowedDomains: string[];
  allowedActions: AgentActionKind[];
  forbiddenActions: string[];
  stopConditions: string[];
  credentials?: CredentialsRef;
  evidenceDirectory: string;
  reportingOptions: ReportingOptions;
  screenshotMode: 'off' | 'on-failure' | 'every-step';
  saveVideo: boolean;
  generateTests: boolean;
  accessibilityAuditEnabled?: boolean;
  keyboardNavigationCheckEnabled?: boolean;
  networkIntelligenceEnabled?: boolean;
  networkSlowWarnMs?: number;
  networkSlowHighMs?: number;
  networkSlowCriticalMs?: number;
  visualIntelligenceEnabled?: boolean;
  multiViewportVisualMode?: boolean;
  visualComparisonEnabled?: boolean;
  visualDiffThreshold?: number;
  reasoningEnabled?: boolean;
  llmProvider?: 'mock' | 'openai' | 'claude' | 'gemini';
  llmModel?: string;
  llmApiKey?: string;
  maxReasoningContextChars?: number;
  visionMultimodalEnabled?: boolean;
  visionProvider?: 'mock' | 'openai' | 'claude' | 'omniparser';
  visionModel?: string;
  visionApiKey?: string;
  visionEndpoint?: string;
  visionMode?: 'off' | 'on-failure' | 'every-step' | 'batched';
  visionCacheEnabled?: boolean;
  visionAnnotateScreenshots?: boolean;
  visionBatchSize?: number;
  visionMaxScreenshotsPerSession?: number;
  recoveryEnabled?: boolean;
  maxRetriesPerAction?: number;
  maxRecoveryAttemptsPerSession?: number;
  maxSelectorHealingAttempts?: number;
  learningEnabled?: boolean;
  longTermMemoryPath?: string;
  learningStorageAdapter?: 'json' | 'sqlite' | 'vector';
  multiAgentEnabled?: boolean;
  multiAgentScheduleMode?: MultiAgentScheduleMode;
  multiAgentFocus?: MultiAgentFocus;
  multiAgentEscalateCritical?: boolean;
  multiAgentRunTestGenerator?: boolean;
}

export interface ConsoleMessageRecord {
  level: 'debug' | 'info' | 'warning' | 'error';
  text: string;
  location?: string;
  timestamp: string;
}

export type ApiIssueClassification =
  | 'client-error'
  | 'server-error'
  | 'auth-session-issue'
  | 'validation-error'
  | 'cors-issue'
  | 'timeout'
  | 'performance-degradation'
  | 'unexpected-redirect'
  | 'malformed-response'
  | 'blocked-request'
  | 'graphql-error'
  | 'rest-api-error'
  | 'polling-loop';

export interface NetworkEventRecord {
  url: string;
  method: string;
  status?: number;
  failureText?: string;
  resourceType?: string;
  timestamp: string;
  responseTimeMs?: number;
  requestPayloadSummary?: string;
  responseBodySummary?: string;
  headersSummary?: string;
  triggeringAction?: string;
  pageUrl?: string;
  stepId?: string;
  redirectUrl?: string;
  issueClassification?: ApiIssueClassification;
}

export interface NetworkIssueRecord {
  id: string;
  issueType: ApiIssueClassification;
  severity: FindingSeverity;
  title: string;
  description: string;
  suspectedRootCause?: string;
  recommendation: string;
  requestUrl: string;
  requestMethod: string;
  status?: number;
  responseTimeMs?: number;
  triggeringAction?: string;
}

export interface NetworkSignals {
  totalRequests: number;
  failedCount: number;
  slowCount: number;
  statusCodeSummary: Record<string, number>;
  issues: NetworkIssueRecord[];
  pollingLoops: string[];
  summary: string;
}

export interface InteractiveElement {
  kind: 'link' | 'button' | 'input' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'other';
  label?: string;
  role?: string;
  selectorHint?: string;
  href?: string;
  placeholder?: string;
  inputType?: string;
  required?: boolean;
  disabled?: boolean;
  visible?: boolean;
}

export interface FormSummary {
  selectorHint?: string;
  fieldCount: number;
  submitLabel?: string;
  labelsMissing: number;
  fields?: InteractiveElement[];
}

export interface AccessibilityIssueRecord {
  id: string;
  issueType: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  wcagReference?: string;
  affectedSelector?: string;
  affectedRole?: string;
  affectedName?: string;
  recommendation: string;
}

export interface AccessibilitySignals {
  issueCount: number;
  axeViolationCount: number;
  keyboardFocusOrder: string[];
  unreachableControls: string[];
  keyboardTrapDetected: boolean;
  focusDisappeared: boolean;
  landmarks: string[];
  headingLevels: number[];
  snapshotSummary: string;
  issues: AccessibilityIssueRecord[];
}

export type VisualIssueType =
  | 'overlapping-elements'
  | 'clipped-text'
  | 'horizontal-scroll'
  | 'hidden-primary-button'
  | 'broken-image'
  | 'missing-icon'
  | 'layout-shift-candidate'
  | 'modal-overflow'
  | 'sticky-header-overlap'
  | 'small-text-candidate'
  | 'outside-viewport'
  | 'empty-image-placeholder'
  | 'visual-diff';

export interface VisualIssueRecord {
  id: string;
  issueType: VisualIssueType;
  severity: FindingSeverity;
  title: string;
  description: string;
  viewport: string;
  affectedSelector?: string;
  recommendation: string;
  screenshotPath?: string;
  diffPath?: string;
  diffRatio?: number;
}

export interface VisualSignals {
  activeViewport: string;
  captures: Array<{
    viewport: string;
    width: number;
    height: number;
    screenshotPath?: string;
    baselinePath?: string;
    diffPath?: string;
    diffRatio?: number;
    issueCount: number;
  }>;
  issues: VisualIssueRecord[];
  summary: string;
}

export interface Observation {
  id: string;
  timestamp: string;
  phase?: 'before' | 'after' | 'standalone';
  stepId?: string;
  url: string;
  title?: string;
  visibleText?: string;
  visibleTextSummary?: string;
  domSummary?: string;
  accessibilitySnapshot?: string;
  accessibilitySignals?: AccessibilitySignals;
  networkSignals?: NetworkSignals;
  visualSignals?: VisualSignals;
  visionSignals?: VisionSignals;
  featureFlagSignals?: FeatureFlagSignals;
  localeSignals?: LocaleSignals;
  screenshotPath?: string;
  consoleMessages: ConsoleMessageRecord[];
  networkEvents: NetworkEventRecord[];
  failedNetworkRequests?: NetworkEventRecord[];
  interactiveElements: InteractiveElement[];
  buttons: InteractiveElement[];
  inputs: InteractiveElement[];
  forms: FormSummary[];
  links: InteractiveElement[];
  visualAnomalies?: string[];
  errors?: string[];
}

export interface AgentAction {
  kind: AgentActionKind;
  target?: string;
  value?: string;
  selector?: string;
  role?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  testId?: string;
  url?: string;
  key?: string;
  loadState?: 'load' | 'domcontentloaded' | 'networkidle';
  timeoutMs?: number;
  reason?: string;
}

export interface ActionPlan {
  id: string;
  action: AgentAction;
  rationale: string;
  expectedOutcome: string;
  validationIdea: string;
  riskLevel: 'low' | 'medium' | 'high';
  priority: ExplorationPriority;
  stopAfterAction?: boolean;
  reasoningSummary?: string;
  explorationStrategy?: ExplorationStrategyId;
  confidenceScore?: number;
  riskTarget?: string;
  hypothesisId?: string;
}

export interface LocatorStrategy {
  type: 'role' | 'label' | 'placeholder' | 'text' | 'testId' | 'css' | 'xpath' | 'url' | 'keyboard' | 'vision' | 'none';
  value?: string;
  role?: string;
  exact?: boolean;
}

export interface ExecutionError {
  code:
    | 'blocked-risky-action'
    | 'locator-not-found'
    | 'element-not-visible'
    | 'element-not-enabled'
    | 'execution-failed'
    | 'unsupported-action'
    | 'invalid-action';
  message: string;
  stack?: string;
  locatorStrategiesTried?: LocatorStrategy[];
}

export interface ActionResult {
  status: 'success' | 'skipped' | 'blocked' | 'failed';
  startedAt: string;
  endedAt: string;
  action: AgentAction;
  locatorStrategy?: LocatorStrategy;
  locatorStrategiesTried?: LocatorStrategy[];
  message?: string;
  actualOutcome?: string;
  evidencePath?: string;
  resultingUrl?: string;
  errors?: ExecutionError[];
  selectorHealingApplied?: boolean;
  checkpointRestored?: string;
}

export type ActionExecutionResult = ActionResult;

export interface ValidationCheck {
  name: string;
  passed: boolean;
  details?: string;
}

export interface ValidationResult {
  passed: boolean;
  summary: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  checks?: ValidationCheck[];
  findings: Finding[];
}

export interface EvidenceLink {
  label: string;
  path: string;
  kind: 'screenshot' | 'trace' | 'video' | 'log' | 'html' | 'other';
}

export interface Finding {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  url?: string;
  stepId?: string;
  evidence: EvidenceLink[];
  reproductionSteps: string[];
  expectedResult?: string;
  actualResult?: string;
  suspectedRootCause?: string;
  reproducibilityConfidence?: ReproducibilityConfidence;
  bugReportPath?: string;
  status: 'new' | 'known' | 'needs-triage' | 'dismissed';
  wcagReference?: string;
  affectedSelector?: string;
  affectedRole?: string;
  affectedName?: string;
  recommendation?: string;
  accessibilityIssueType?: string;
  networkIssueType?: ApiIssueClassification;
  apiClassification?: ApiIssueClassification;
  correlatedRequestUrl?: string;
  correlatedRequestMethod?: string;
  responseTimeMs?: number;
  visualIssueType?: VisualIssueType;
  viewport?: string;
  visualDiffRatio?: number;
  visionAnomalyType?: string;
  aiProbableCause?: string;
  aiImpactedFunctionality?: string;
  aiReproductionStability?: ReproducibilityConfidence;
  aiSuspectedOwnership?: 'frontend' | 'backend' | 'shared' | 'unknown';
  aiInvestigationNotes?: string;
  discoveredByAgent?: AgentRoleName;
}

export interface BugReport {
  id: string;
  findingId: string;
  title: string;
  severity: FindingSeverity;
  category: FindingCategory;
  summary: string;
  environmentName: string;
  url?: string;
  reproductionSteps: string[];
  expectedResult?: string;
  actualResult?: string;
  evidence: EvidenceLink[];
  consoleLogs: ConsoleMessageRecord[];
  failedNetworkRequests: NetworkEventRecord[];
  suspectedRootCause?: string;
  reproducibilityConfidence: ReproducibilityConfidence;
  generatedTestRefs: string[];
  reportPath?: string;
  wcagReference?: string;
  affectedSelector?: string;
  affectedRole?: string;
  affectedName?: string;
  recommendation?: string;
  accessibilityIssueType?: string;
  networkIssueType?: ApiIssueClassification;
  apiClassification?: ApiIssueClassification;
  correlatedRequestUrl?: string;
  correlatedRequestMethod?: string;
  responseTimeMs?: number;
  visualIssueType?: VisualIssueType;
  viewport?: string;
  visualDiffRatio?: number;
  visionAnomalyType?: string;
  aiProbableCause?: string;
  aiImpactedFunctionality?: string;
  aiReproductionStability?: ReproducibilityConfidence;
  aiSuspectedOwnership?: 'frontend' | 'backend' | 'shared' | 'unknown';
  aiInvestigationNotes?: string;
}

export interface GeneratedTest {
  id: string;
  title: string;
  filePath: string;
  source: string;
  basedOnStepIds: string[];
  status: 'draft' | 'passed' | 'failed' | 'blocked';
  generatedAt: string;
  flowCategory: GeneratedTestFlowCategory;
  confidenceScore: GeneratedTestConfidence;
  metadata: {
    sourceSessionId: string;
    generatedTimestamp: string;
    flowCategory: GeneratedTestFlowCategory;
    confidenceScore: GeneratedTestConfidence;
    selectorStrategies: LocatorStrategy[];
  };
  executionResults: GeneratedTestExecutionResult[];
  failureReason?: string;
}

export interface GeneratedTestExecutionResult {
  status: 'not-run' | 'passed' | 'failed' | 'blocked';
  startedAt: string;
  endedAt: string;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  retryAttempted?: boolean;
  selectorHealingApplied?: boolean;
  failureReason?: string;
}

export interface GeneratedTestGenerator {
  generate(session: ExplorationSession): GeneratedTest[] | Promise<GeneratedTest[]>;
}

export interface StepValidation {
  result: ValidationResult;
}

export interface ExplorationStep {
  id: string;
  index: number;
  startedAt: string;
  endedAt?: string;
  beforeObservation: Observation;
  afterObservation?: Observation;
  /**
   * Backwards-compatible alias for beforeObservation.
   * New code should read beforeObservation and afterObservation explicitly.
   */
  observation: Observation;
  plan: ActionPlan;
  execution?: ActionExecutionResult;
  validation?: StepValidation;
  findings: Finding[];
  recoveryAttempts?: RecoveryAttemptRecord[];
  status: 'planned' | 'executed' | 'validated' | 'skipped' | 'blocked' | 'failed';
}

export interface ElementInteractionRecord {
  key: string;
  label?: string;
  url: string;
  actionKind: AgentActionKind;
  timestamp: string;
}

export interface FormInteractionRecord {
  formKey: string;
  url: string;
  fieldKeys: string[];
  submitted: boolean;
  timestamp: string;
}

export interface NavigationPathRecord {
  fromUrl: string;
  toUrl: string;
  label?: string;
  timestamp: string;
}

export interface FailedActionRecord {
  signature: string;
  reason: string;
  url: string;
  timestamp: string;
}

export interface SkippedRiskyActionRecord {
  signature: string;
  reason: string;
  url: string;
  timestamp: string;
  blockedBy?: 'persona' | 'environment' | 'config';
}

export interface SuccessfulFlowRecord {
  stepIds: string[];
  summary: string;
  timestamp: string;
}

export interface ExplorationCoverage {
  pagesVisited: number;
  uniquePagesVisited: number;
  interactiveElementsSeen: number;
  interactiveElementsExplored: number;
  explorationPercentage: number;
  formsEncountered: number;
  formsTested: number;
  filtersTested: number;
  findingsCount: number;
  blockedFlows: number;
  exploredAreas: string[];
  unexploredAreas: string[];
}

export interface SessionMemory {
  visitedUrls: string[];
  exploredPages: string[];
  clickedElements: string[];
  filledForms: FormInteractionRecord[];
  submittedForms: FormInteractionRecord[];
  testedFilters: string[];
  testedNavigationPaths: NavigationPathRecord[];
  failedActions: FailedActionRecord[];
  knownBugs: string[];
  skippedRiskyActions: SkippedRiskyActionRecord[];
  pendingAreas: string[];
  successfulFlows: SuccessfulFlowRecord[];
  generatedTestRefs: string[];
  actionHistory: AgentAction[];
  observationSignatures: string[];
  observations: Observation[];
  interactedElements: string[];
  findingIds: string[];
  notes: string[];
  formsEncountered: FormSummary[];
  elementInteractions: ElementInteractionRecord[];
  repeatedActionsPrevented: number;
  stopReason?: string;
  coverage: ExplorationCoverage;
}

export interface ExplorationSession {
  id: string;
  goal: ExplorationGoal;
  config: ExplorationConfig;
  explorationContext?: ExplorationContextSnapshot;
  reasoningState?: ReasoningSessionState;
  recoveryState?: RecoverySessionState;
  learningContext?: SessionLearningContext;
  memoryUpdateSummary?: MemoryUpdateSummary;
  historicalComparison?: HistoricalComparison;
  startedAt: string;
  endedAt?: string;
  status: SessionStatus;
  currentUrl?: string;
  steps: ExplorationStep[];
  findings: Finding[];
  memory: SessionMemory;
  generatedTests: GeneratedTest[];
  bugReports: BugReport[];
  reportPath?: string;
  evidenceDirectory: string;
  multiAgentState?: import('./multi-agent/types').MultiAgentSessionState;
}

export interface PlannerContext {
  session: ExplorationSession;
  observation: Observation;
  findings: Finding[];
}

export interface ExplorationPlanner {
  planNextAction(context: PlannerContext): Promise<ActionPlan>;
}

export interface ExplorationExecutor {
  observe(session: ExplorationSession): Promise<Observation>;
  execute(plan: ActionPlan, session: ExplorationSession): Promise<ActionResult>;
}

export interface ExplorationValidator {
  validate(args: {
    session: ExplorationSession;
    step: ExplorationStep;
    execution?: ActionExecutionResult;
  }): Promise<ValidationResult>;
}

export interface HeuristicEngine {
  evaluate(args: {
    session: ExplorationSession;
    observation: Observation;
  }): Finding[];
}

export interface SessionReporter {
  writeSessionReport(session: ExplorationSession): Promise<string>;
}
