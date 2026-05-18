import type {
  ActionExecutionResult,
  ExplorationConfig,
  ExplorationExecutor,
  ExplorationGoal,
  ExplorationPlanner,
  ExplorationSession,
  ExplorationStep,
  ExplorationValidator,
  Finding,
  GeneratedTestGenerator,
  HeuristicEngine,
  SessionReporter,
} from '../types';
import { resolveExplorationContext } from '../environment/explorationContext';
import {
  applyStopEvaluation,
  createSessionMemory,
  evaluateStopConditions,
  mergeFindings,
  persistSessionMemory,
  recordSkippedRiskyAction,
  refreshCoverage,
  syncGeneratedTestRefs,
  updateMemoryFromObservation,
  updateMemoryFromPlan,
  updateMemoryFromStep,
} from '../memory/sessionMemory';
import { ReasoningPlanner } from '../planner/reasoningPlanner';
import { RiskBasedPlanner } from '../planner/riskBasedPlanner';
import { explainFinding, ensureReasoningState, validateHypotheses } from '../reasoning';
import { ReasoningEngine } from '../reasoning/reasoningEngine';
import { evaluateActionPolicy, inferObservedPermissions } from '../personas/actionPolicy';
import { PlaywrightActionExecutor } from '../executor/playwrightActionExecutor';
import { detectBlockedFlow, RecoveryEngine } from '../recovery';
import { createLongTermMemoryService } from '../long-term-memory';
import { compareWithHistory } from '../learning/historicalComparison';
import { findingFingerprint } from '../learning/fingerprints';
import type { MultiAgentCoordinator } from '../multi-agent/coordinator';

function now() {
  return new Date().toISOString();
}

function makeSessionId(goal: ExplorationGoal) {
  return `${goal.id}-${Date.now()}`;
}

function isDomainAllowed(url: string, allowedDomains: string[]) {
  if (!allowedDomains.length) {
    return true;
  }

  const hostname = new URL(url).hostname;
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function shouldResolveContext(config: ExplorationConfig) {
  return Boolean(config.environmentId || config.personaId);
}

export interface ExploratoryOrchestratorOptions {
  goal: ExplorationGoal;
  config: ExplorationConfig;
  planner: ExplorationPlanner;
  executor: ExplorationExecutor;
  validator: ExplorationValidator;
  heuristics: HeuristicEngine;
  reporter: SessionReporter;
  testGenerator?: GeneratedTestGenerator;
  multiAgentCoordinator?: MultiAgentCoordinator;
}

function filterLearningFindings(session: ExplorationSession, findings: Finding[]) {
  if (!session.learningContext) {
    return findings;
  }
  const suppressed = new Set(session.learningContext.suppressedFindingFingerprints);
  return findings.filter((finding) => !suppressed.has(findingFingerprint(finding)));
}

export class ExploratoryOrchestrator {
  constructor(private readonly options: ExploratoryOrchestratorOptions) {}

  private resolvePlanner(config: ExplorationConfig, planner: ExplorationPlanner): ExplorationPlanner {
    if (!config.reasoningEnabled) {
      return planner;
    }
    if (planner instanceof ReasoningPlanner) {
      return planner;
    }
    return new ReasoningPlanner({
      basePlanner: planner instanceof RiskBasedPlanner ? planner : planner,
      reasoningEngine: new ReasoningEngine({
        llmProvider: config.llmProvider || 'mock',
        model: config.llmModel,
        apiKey: config.llmApiKey,
      }),
    });
  }

  private enrichFindingsWithAI(session: ExplorationSession) {
    if (!session.reasoningState?.enabled) return;
    for (const finding of session.findings) {
      if (finding.aiProbableCause) continue;
      const explanation = explainFinding(finding);
      finding.aiProbableCause = explanation.probableCause;
      finding.aiImpactedFunctionality = explanation.impactedFunctionality;
      finding.aiReproductionStability = explanation.reproductionStability;
      finding.aiSuspectedOwnership = explanation.suspectedOwnership;
      finding.aiInvestigationNotes = explanation.investigationNotes;
      const existing = session.reasoningState.findingExplanations.find((item) => item.findingId === finding.id);
      if (!existing) {
        session.reasoningState.findingExplanations.push(explanation);
      }
    }
  }

  async run(): Promise<ExplorationSession> {
    const { executor, validator, heuristics, reporter, testGenerator } = this.options;
    const resolved = shouldResolveContext(this.options.config)
      ? resolveExplorationContext({
          environmentId: this.options.config.environmentId,
          personaId: this.options.config.personaId,
          config: this.options.config,
          goal: this.options.goal,
        })
      : {
          config: this.options.config,
          goal: this.options.goal,
          context: undefined,
        };
    const goal = resolved.goal;
    const config = resolved.config;
    const planner = this.resolvePlanner(config, this.options.planner);
    const startedAt = now();
    const deadline = Date.now() + config.maxDurationMinutes * 60 * 1000;

    const session: ExplorationSession = {
      id: makeSessionId(goal),
      goal,
      config,
      explorationContext: resolved.context,
      startedAt,
      status: 'running',
      steps: [],
      findings: [],
      memory: createSessionMemory(),
      generatedTests: [],
      bugReports: [],
      evidenceDirectory: config.evidenceDirectory,
    };

    if (config.reasoningEnabled) {
      ensureReasoningState(session);
    }

    const memoryService = config.learningEnabled
      ? createLongTermMemoryService({
          storagePath: config.longTermMemoryPath,
          adapter: config.learningStorageAdapter || 'json',
        })
      : undefined;

    if (memoryService) {
      session.learningContext = await memoryService.retrieveForSession(goal, config);
      for (const gap of session.learningContext.explorationGaps) {
        if (!session.memory.pendingAreas.includes(gap.area)) {
          session.memory.pendingAreas.push(gap.area);
        }
      }
      for (const risk of session.learningContext.knownRisks) {
        session.memory.notes.push(`Historical risk (${risk.score}): ${risk.area} — ${risk.reason}`);
      }
    }

    try {
      while (session.steps.length < config.maxSteps && Date.now() < deadline) {
        const stopBeforeStep = evaluateStopConditions(session, { deadline });
        if (stopBeforeStep.shouldStop) {
          applyStopEvaluation(session, stopBeforeStep);
          session.status = 'stopped';
          break;
        }

        const stepIndex = session.steps.length;
        const stepId = `step-${String(stepIndex + 1).padStart(3, '0')}`;
        const beforeObservation = await executor.observe(session);
        beforeObservation.phase = 'before';
        beforeObservation.stepId = stepId;
        session.currentUrl = beforeObservation.url;

        updateMemoryFromObservation(session, beforeObservation);
        if (session.explorationContext) {
          session.explorationContext.observedPermissions = inferObservedPermissions(
            session.explorationContext.persona,
            beforeObservation.visibleText || beforeObservation.visibleTextSummary || '',
          );
          session.explorationContext.detectedFeatureFlags = Array.from(
            new Set([
              ...session.explorationContext.detectedFeatureFlags,
              ...(beforeObservation.featureFlagSignals?.flags.map((flag) => flag.key) || []),
            ]),
          );
        }

        const beforeHeuristicFindings = filterLearningFindings(
          session,
          heuristics.evaluate({ session, observation: beforeObservation }),
        );
        mergeFindings(session, beforeHeuristicFindings);
        if (this.options.multiAgentCoordinator && config.multiAgentEnabled) {
          await this.options.multiAgentCoordinator.runObservationCycle({
            session,
            observation: beforeObservation,
            phase: 'before',
            stepId,
          });
        }
        validateHypotheses(session, beforeHeuristicFindings, stepId);
        this.enrichFindingsWithAI(session);

        const plan = await planner.planNextAction({
          session,
          observation: beforeObservation,
          findings: [...beforeHeuristicFindings, ...session.findings],
        });

        if (plan.action.kind === 'stop') {
          session.memory.stopReason = plan.action.reason || plan.rationale;
          updateMemoryFromPlan(session, plan);
          const stopStep: ExplorationStep = {
            id: stepId,
            index: stepIndex,
            startedAt: now(),
            beforeObservation,
            afterObservation: beforeObservation,
            observation: beforeObservation,
            plan,
            findings: [...beforeHeuristicFindings],
            status: 'validated',
            endedAt: now(),
          };
          session.steps.push(stopStep);
          session.status = config.stopConditions.includes('noMeaningfulActions') ? 'stopped' : 'completed';
          break;
        }

        updateMemoryFromPlan(session, plan);

        const step: ExplorationStep = {
          id: stepId,
          index: stepIndex,
          startedAt: now(),
          beforeObservation,
          observation: beforeObservation,
          plan,
          findings: [...beforeHeuristicFindings],
          status: 'planned',
        };

        const targetUrl = plan.action.url;
        if (targetUrl && !isDomainAllowed(targetUrl, config.allowedDomains)) {
          step.execution = {
            status: 'blocked',
            startedAt: now(),
            endedAt: now(),
            action: plan.action,
            message: `Blocked navigation outside allowed domains: ${targetUrl}`,
            actualOutcome: `Blocked navigation outside allowed domains: ${targetUrl}`,
            errors: [
              {
                code: 'blocked-risky-action',
                message: `Blocked navigation outside allowed domains: ${targetUrl}`,
              },
            ],
          };
          const afterObservation = await executor.observe(session);
          afterObservation.phase = 'after';
          afterObservation.stepId = step.id;
          step.afterObservation = afterObservation;
          updateMemoryFromObservation(session, afterObservation);
          step.status = 'blocked';
          session.steps.push(step);
          updateMemoryFromStep(session, step);
          session.status = 'stopped';
          break;
        }

        const actionText = [plan.action.kind, plan.action.reason, plan.action.target, plan.action.selector, plan.action.url]
          .filter(Boolean)
          .join(' ');
        const policy = evaluateActionPolicy({
          session,
          action: plan.action,
          candidateText: actionText,
          destructiveAllowed: goal.destructiveActionsAllowed === true,
        });

        let execution: ActionExecutionResult;
        if (!policy.allowed) {
          recordSkippedRiskyAction(session, plan.action, policy.reason || `Blocked action: ${actionText}`, policy.source);
          execution = {
            status: 'blocked',
            startedAt: now(),
            endedAt: now(),
            action: plan.action,
            message: policy.reason || `Blocked action: ${actionText}`,
            actualOutcome: policy.reason || `Blocked action: ${actionText}`,
            errors: [
              {
                code: 'blocked-risky-action',
                message: policy.reason || `Blocked action: ${actionText}`,
              },
            ],
          };
        } else {
          execution = await executor.execute(plan, session);
        }

        const page = executor instanceof PlaywrightActionExecutor ? executor.getPage() : undefined;
        const recoveryEngine =
          page && session.config.recoveryEnabled
            ? new RecoveryEngine({
                page,
                observe: () => executor.observe(session),
                execute: (recoveryPlan) => executor.execute(recoveryPlan, session),
              })
            : undefined;

        if (recoveryEngine && execution.status === 'failed') {
          const recoveryResult = await recoveryEngine.attemptRecovery({
            session,
            plan,
            execution,
            stepId: step.id,
          });
          if (recoveryResult.attempts.length) {
            step.recoveryAttempts = recoveryResult.attempts;
          }
          if (recoveryResult.recovered && recoveryResult.execution) {
            execution = {
              ...recoveryResult.execution,
              checkpointRestored: recoveryResult.checkpointRestored,
            };
          } else if (recoveryResult.findingCreated || recoveryResult.decision.decision === 'finding') {
            const blockedObservation = await executor.observe(session);
            const blocked = detectBlockedFlow({ session, observation: blockedObservation, execution });
            const blockedFinding = recoveryEngine.createBlockedFlowFinding(session, plan, blocked, step.id);
            step.findings.push(blockedFinding);
            mergeFindings(session, [blockedFinding]);
          } else if (recoveryResult.decision.decision === 'stop') {
            session.memory.stopReason = recoveryResult.decision.reason;
          }
        }

        step.execution = execution;
        step.status = execution.status === 'success' ? 'executed' : execution.status;

        const afterObservation = await executor.observe(session);
        afterObservation.phase = 'after';
        afterObservation.stepId = step.id;
        step.afterObservation = afterObservation;
        session.currentUrl = afterObservation.url;
        updateMemoryFromObservation(session, afterObservation);

        if (recoveryEngine && execution.status === 'success') {
          recoveryEngine.captureStableCheckpoint(session, afterObservation, execution, step.id);
        }

        const afterHeuristicFindings = filterLearningFindings(
          session,
          heuristics.evaluate({ session, observation: afterObservation }),
        );
        step.findings.push(...afterHeuristicFindings);
        mergeFindings(session, afterHeuristicFindings);
        if (this.options.multiAgentCoordinator && config.multiAgentEnabled) {
          await this.options.multiAgentCoordinator.runObservationCycle({
            session,
            observation: afterObservation,
            phase: 'after',
            stepId: step.id,
          });
        }
        validateHypotheses(session, afterHeuristicFindings, step.id);
        this.enrichFindingsWithAI(session);

        const validation = await validator.validate({ session, step, execution });
        step.validation = { result: validation };
        const validationFindings = filterLearningFindings(session, validation.findings);
        step.findings.push(...validationFindings);
        mergeFindings(session, validationFindings);
        step.status = validation.passed ? 'validated' : 'failed';
        step.endedAt = now();

        session.steps.push(step);
        updateMemoryFromStep(session, step);

        const stopAfterStep = evaluateStopConditions(session, { deadline });
        if (stopAfterStep.shouldStop) {
          applyStopEvaluation(session, stopAfterStep);
          session.status = 'stopped';
          break;
        }

        if (plan.stopAfterAction || execution.status === 'blocked') {
          session.memory.stopReason =
            session.memory.stopReason ||
            (execution.status === 'blocked' ? execution.message : plan.action.reason || plan.rationale);
          session.status = execution.status === 'blocked' ? 'stopped' : 'completed';
          break;
        }
      }

      if (session.status === 'running') {
        if (Date.now() >= deadline) {
          session.status = 'stopped';
          session.memory.stopReason = session.memory.stopReason || `Maximum duration reached (${config.maxDurationMinutes} minutes).`;
        } else if (session.steps.length >= config.maxSteps) {
          session.status = 'stopped';
          session.memory.stopReason = session.memory.stopReason || `Maximum step limit reached (${config.maxSteps}).`;
        } else {
          session.status = 'completed';
        }
      }

      session.generatedTests = testGenerator ? await testGenerator.generate(session) : [];
      if (this.options.multiAgentCoordinator && config.multiAgentEnabled) {
        await this.options.multiAgentCoordinator.finalize(session);
        this.options.multiAgentCoordinator.stop();
      }
      syncGeneratedTestRefs(session);
      refreshCoverage(session);
      session.endedAt = now();
      if (memoryService) {
        const knowledge = await memoryService.load();
        session.historicalComparison = compareWithHistory(knowledge, session);
        session.memoryUpdateSummary = await memoryService.updateFromSession(session, session.learningContext);
      }
      await persistSessionMemory(session);
      await reporter.writeSessionReport(session);
      return session;
    } catch (error) {
      session.status = 'failed';
      session.endedAt = now();
      session.memory.stopReason = session.memory.stopReason || (error instanceof Error ? error.message : String(error));
      session.memory.notes.push(error instanceof Error ? error.message : String(error));
      refreshCoverage(session);
      if (memoryService) {
        const knowledge = await memoryService.load();
        session.historicalComparison = compareWithHistory(knowledge, session);
        session.memoryUpdateSummary = await memoryService.updateFromSession(session, session.learningContext);
      }
      await persistSessionMemory(session);
      await reporter.writeSessionReport(session);
      return session;
    }
  }
}
