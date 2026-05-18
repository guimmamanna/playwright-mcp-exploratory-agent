import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { sampleExplorationGoal } from '../../src/config/sampleGoal';
import { createSessionMemory, mergeFindings } from '../../src/memory/sessionMemory';
import { createBlankObservation } from '../../src/observer/observationFactory';
import { MultiAgentCoordinator } from '../../src/multi-agent/coordinator';
import { claimTask, createBlackboard, recordObservationOnBlackboard } from '../../src/multi-agent/blackboard';
import { resolveFlowConflict, assessFlowFromFindings } from '../../src/multi-agent/conflictResolver';
import { mergeAgentFindings, findingFingerprint } from '../../src/multi-agent/findingMerge';
import { createAgentMessage } from '../../src/multi-agent/protocol';
import { agentsForFocus, buildTasksForAgents } from '../../src/multi-agent/scheduling';
import { normalizeFinding } from '../../src/reporting/severityScoring';
import { createDefaultSpecialistAgents } from '../../src/roles';
import type { ExplorationSession, Finding } from '../../src/types';

function createTestSession(): ExplorationSession {
  return {
    id: 'test-session',
    goal: sampleExplorationGoal,
    config: { ...defaultExplorationConfig, multiAgentEnabled: true },
    startedAt: new Date().toISOString(),
    status: 'running',
    steps: [],
    findings: [],
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: 'exploratory-results/evidence',
  };
}

function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return normalizeFinding({
    id: overrides.id || 'finding-1',
    type: overrides.type || 'network-failure',
    severity: overrides.severity || 'high',
    category: overrides.category || 'network-error',
    title: overrides.title || 'API request failed',
    description: overrides.description || 'Server returned 500',
    url: overrides.url || 'http://localhost:3000/checkout',
    evidence: [],
    reproductionSteps: ['Open page', 'Submit form'],
    status: 'new',
    ...overrides,
  });
}

test.describe('Multi-agent coordinator', () => {
  test('assigns tasks to agents and claims work on blackboard', async () => {
    const agents = createDefaultSpecialistAgents();
    const coordinator = new MultiAgentCoordinator({
      config: { enabled: true, scheduleMode: 'sequential', focus: 'full', escalateCritical: true, runTestGeneratorDuringSession: false },
      agents,
    });

    const session = createTestSession();
    const observation = createBlankObservation({
      url: 'http://localhost:3000/',
      title: 'Home',
    });

    const active = agentsForFocus('full', agents);
    const tasks = buildTasksForAgents(active, {
      sessionId: session.id,
      stepId: 'step-001',
      phase: 'before',
      observation,
    });

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some((task) => task.agentName === 'ExplorerAgent')).toBeTruthy();
    expect(tasks.some((task) => task.agentName === 'NetworkAgent')).toBeTruthy();

    const blackboard = createBlackboard();
    for (const task of tasks) {
      expect(claimTask(blackboard, task.id)).toBe(true);
      expect(claimTask(blackboard, task.id)).toBe(false);
    }

    await coordinator.runObservationCycle({ session, observation, phase: 'before', stepId: 'step-001' });
    expect(session.multiAgentState?.messages.length).toBeGreaterThan(0);
    expect(session.multiAgentState?.blackboard.visitedRoutes).toContain('/');
  });

  test('updates shared blackboard memory from observations', () => {
    const blackboard = createBlackboard();
    const observation = createBlankObservation({
      url: 'http://localhost:3000/products',
      title: 'Products',
      screenshotPath: '/tmp/shot.png',
      networkEvents: [{ url: '/api/products', method: 'GET', status: 200, timestamp: new Date().toISOString() }],
      accessibilitySignals: {
        issueCount: 1,
        axeViolationCount: 1,
        keyboardFocusOrder: [],
        unreachableControls: [],
        keyboardTrapDetected: false,
        focusDisappeared: false,
        landmarks: [],
        headingLevels: [],
        snapshotSummary: '',
        issues: [
          {
            id: 'a11y-1',
            issueType: 'missing-label',
            severity: 'medium',
            title: 'Missing label',
            description: 'Input missing label',
            recommendation: 'Add label',
          },
        ],
      },
    });

    recordObservationOnBlackboard(blackboard, observation);
    expect(blackboard.visitedRoutes).toContain('/products');
    expect(blackboard.screenshots).toContain('/tmp/shot.png');
    expect(blackboard.networkEvents.length).toBe(1);
    expect(blackboard.accessibilityIssues.length).toBe(1);
    expect(blackboard.appMap[0]?.route).toBe('/products');
  });

  test('merges duplicate findings from multiple agents', () => {
    const blackboard = createBlackboard();
    const finding = sampleFinding({ discoveredByAgent: 'NetworkAgent' });

    const messages = [
      createAgentMessage({
        agentName: 'NetworkAgent',
        currentTask: 'Monitor APIs',
        observation: '500 error',
        finding,
        confidence: 'high',
      }),
      createAgentMessage({
        agentName: 'ExplorerAgent',
        currentTask: 'Explore flows',
        observation: 'Same API failure',
        finding: { ...finding, discoveredByAgent: 'ExplorerAgent' },
        confidence: 'medium',
      }),
    ];

    const { merged, duplicatesSkipped } = mergeAgentFindings(blackboard, messages, []);
    expect(merged).toHaveLength(1);
    expect(duplicatesSkipped).toBe(1);
    expect(findingFingerprint(merged[0])).toBe(findingFingerprint(finding));
  });

  test('resolves conflict when explorer passes but network fails', () => {
    const blackboard = createBlackboard();
    const flowKey = '/checkout';
    const findings: Finding[] = [
      sampleFinding({
        id: 'network-500',
        type: 'network-failure',
        title: 'API request failed',
        url: `http://localhost:3000${flowKey}`,
        discoveredByAgent: 'NetworkAgent',
      }),
    ];

    const assessment = assessFlowFromFindings(findings, flowKey);
    expect(assessment.networkFailed).toBe(true);

    const conflict = resolveFlowConflict(blackboard, { ...assessment, explorerPassed: true }, [
      'ExplorerAgent',
      'NetworkAgent',
    ]);

    expect(conflict?.finalStatus).toBe('degraded');
    expect(blackboard.flowStatuses[flowKey]).toBe('degraded');
  });

  test('focused accessibility-only mode runs only accessibility agents', async () => {
    const agents = createDefaultSpecialistAgents();
    const coordinator = new MultiAgentCoordinator({
      config: {
        enabled: true,
        scheduleMode: 'sequential',
        focus: 'accessibility-only',
        escalateCritical: false,
        runTestGeneratorDuringSession: false,
      },
      agents,
    });

    const session = createTestSession();
    const observation = createBlankObservation({ url: 'http://localhost:3000/a11y' });

    await coordinator.runObservationCycle({ session, observation, phase: 'before', stepId: 'step-a11y' });

    const agentNames = new Set(session.multiAgentState?.messages.map((m) => m.agentName));
    expect(agentNames.has('AccessibilityAgent')).toBe(true);
    expect(agentNames.has('NetworkAgent')).toBe(false);
    expect(agentNames.has('ExplorerAgent')).toBe(false);
  });

  test('finalize merges findings and records agent coverage', async () => {
    const agents = createDefaultSpecialistAgents();
    const coordinator = new MultiAgentCoordinator({
      config: { enabled: true, scheduleMode: 'parallel', focus: 'full', escalateCritical: true, runTestGeneratorDuringSession: false },
      agents,
    });

    const session = createTestSession();
    const finding = sampleFinding({ discoveredByAgent: 'NetworkAgent' });
    mergeFindings(session, [finding]);

    await coordinator.finalize(session);
    expect(session.multiAgentState?.recommendations.length).toBeGreaterThan(0);
    expect(session.multiAgentState?.mergedFindingIds.length).toBeGreaterThanOrEqual(1);
  });
});
