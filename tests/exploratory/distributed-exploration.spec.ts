import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { defaultExplorationConfig } from '../../src/config/defaultConfig';
import { sampleExplorationGoal } from '../../src/config/sampleGoal';
import {
  CoordinationStore,
  DistributedExplorationRunner,
  findingFingerprint,
  ingestFinding,
  writeAggregateReport,
} from '../../src/distributed';
import { defaultDistributedExplorationConfig } from '../../src/distributed/defaultConfig';
import type { WorkerAssignment, WorkerResult, WorkerRunnerFn } from '../../src/distributed';
import { scheduleWorkerAssignments, describeAssignment } from '../../src/scheduler';
import { createSessionMemory } from '../../src/memory/sessionMemory';
import type { ExplorationSession, Finding } from '../../src/types';

function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-console-error',
    type: 'console-error',
    severity: 'medium',
    category: 'console-error',
    title: 'Console error on homepage',
    description: 'Unhandled exception in bundle.',
    url: 'http://localhost:3000/',
    reproductionSteps: ['Open homepage'],
    evidence: [{ kind: 'screenshot', path: '/tmp/a.png', description: 'worker-a' }],
    status: 'new',
    ...overrides,
  };
}

function mockSession(workerId: string, findings: Finding[] = []): ExplorationSession {
  return {
    id: `session-${workerId}`,
    goal: { ...sampleExplorationGoal, id: `goal-${workerId}` },
    config: { ...defaultExplorationConfig, baseUrl: 'http://localhost:3000' },
    startedAt: new Date().toISOString(),
    status: 'completed',
    steps: [],
    findings,
    memory: createSessionMemory(),
    generatedTests: [],
    bugReports: [],
    evidenceDirectory: `evidence/${workerId}`,
    reportPath: `reports/${workerId}/report.md`,
  };
}

function mockWorkerResult(assignment: WorkerAssignment, status: WorkerResult['status'], findings: Finding[] = []): WorkerResult {
  return {
    workerId: assignment.workerId,
    assignment,
    status,
    session: status === 'completed' ? mockSession(assignment.workerId, findings) : undefined,
    reportPath: join(assignment.reportDirectory, 'report.md'),
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    retryCount: 0,
  };
}

test('scheduler assigns workers across persona, browser, viewport, route, and risk', () => {
  const assignments = scheduleWorkerAssignments({
    baseGoal: sampleExplorationGoal,
    config: {
      ...defaultDistributedExplorationConfig,
      maxWorkers: 3,
      personas: ['admin', 'readonly-user'],
      browsers: ['chromium', 'firefox'],
      viewports: ['desktop', 'mobile'],
      featureAreas: ['settings'],
      routes: ['/settings'],
      riskCategories: ['navigation'],
    },
  });

  expect(assignments).toHaveLength(3);
  expect(new Set(assignments.map((item) => item.workerId)).size).toBe(3);
  expect(assignments[0].personaId).toBeTruthy();
  expect(assignments[0].browser).toBeTruthy();
  expect(assignments[0].viewport).toBeTruthy();
  expect(describeAssignment(assignments[0])).toMatch(/settings/i);
});

test('worker assignments use isolated evidence, storage, and report paths', () => {
  const outputDirectory = '/tmp/distributed-run';
  const assignments = scheduleWorkerAssignments({
    baseGoal: sampleExplorationGoal,
    config: {
      ...defaultDistributedExplorationConfig,
      outputDirectory,
      maxWorkers: 2,
      personas: ['admin', 'readonly-user'],
      browsers: ['chromium'],
      viewports: ['desktop'],
      featureAreas: ['navigation'],
      routes: ['/'],
      riskCategories: ['navigation'],
    },
  });

  const evidenceDirs = assignments.map((item) => item.evidenceDirectory);
  const reportDirs = assignments.map((item) => item.reportDirectory);
  const storagePaths = assignments.map((item) => item.storageStatePath);

  expect(new Set(evidenceDirs).size).toBe(2);
  expect(new Set(reportDirs).size).toBe(2);
  expect(new Set(storagePaths).size).toBe(2);
  for (const assignment of assignments) {
    expect(assignment.evidenceDirectory).toContain(assignment.workerId);
    expect(assignment.memoryPath).toContain(assignment.workerId);
  }
});

test('merges duplicate findings and increases confidence', () => {
  const registry = new Map();
  const finding = sampleFinding();
  const first = ingestFinding(registry, finding, 'worker-1');
  const duplicate = ingestFinding(registry, { ...finding, description: 'Same issue from worker 2' }, 'worker-2');

  expect(first.duplicate).toBe(false);
  expect(duplicate.duplicate).toBe(true);
  expect(duplicate.record.mergeCount).toBe(2);
  expect(duplicate.record.workerIds).toEqual(expect.arrayContaining(['worker-1', 'worker-2']));
  expect(duplicate.record.finding.reproducibilityConfidence).toBe('high');
  expect(findingFingerprint(finding)).toBe(duplicate.record.fingerprint);
});

test('generates aggregate report with coverage dimensions', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'distributed-report-'));
  const assignments = scheduleWorkerAssignments({
    baseGoal: sampleExplorationGoal,
    config: {
      ...defaultDistributedExplorationConfig,
      outputDirectory,
      maxWorkers: 2,
      personas: ['admin', 'readonly-user'],
      browsers: ['chromium'],
      viewports: ['desktop', 'mobile'],
      featureAreas: ['navigation'],
      routes: ['/'],
      riskCategories: ['navigation'],
    },
  });

  const result = {
    runId: 'run-test',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    workers: assignments.map((assignment, index) =>
      mockWorkerResult(assignment, 'completed', index === 0 ? [sampleFinding()] : []),
    ),
    coordination: new CoordinationStore().snapshot(),
    stoppedEarly: false,
  };

  const store = new CoordinationStore();
  store.registerAssignments(assignments);
  for (const worker of result.workers) {
    if (worker.session) {
      store.addWorkerFindings(worker.workerId, worker.session.findings);
    }
  }
  result.coordination = store.snapshot();

  const reportPath = await writeAggregateReport(outputDirectory, result);
  const report = await readFile(reportPath, 'utf8');

  expect(report).toContain('# Distributed Exploratory Summary');
  expect(report).toContain('Coverage by persona');
  expect(report).toContain('Coverage by viewport');
  expect(report).toContain('Coverage by browser');
  expect(report).toContain('Merged duplicate findings');

  await rm(outputDirectory, { recursive: true, force: true });
});

test('continues when a worker fails and retries once when configured', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'distributed-run-'));
  const assignments = scheduleWorkerAssignments({
    baseGoal: sampleExplorationGoal,
    config: {
      ...defaultDistributedExplorationConfig,
      outputDirectory,
      maxWorkers: 2,
      maxParallelWorkers: 2,
      personas: ['admin', 'readonly-user'],
      browsers: ['chromium'],
      viewports: ['desktop'],
      featureAreas: ['navigation'],
      routes: ['/'],
      riskCategories: ['navigation'],
      continueOnWorkerFailure: true,
      retryFailedWorkerOnce: true,
    },
  });

  const attempts = new Map<string, number>();
  const runner: WorkerRunnerFn = async (assignment) => {
    const count = (attempts.get(assignment.workerId) || 0) + 1;
    attempts.set(assignment.workerId, count);
    if (assignment.personaId === 'admin' && count === 1) {
      return {
        ...mockWorkerResult(assignment, 'failed'),
        error: 'Simulated worker failure',
      };
    }
    return { ...mockWorkerResult(assignment, 'completed'), retryCount: count > 1 ? 1 : 0 };
  };

  const result = await new DistributedExplorationRunner({
    baseGoal: { ...sampleExplorationGoal, baseUrl: 'http://localhost:3000' },
    config: {
      ...defaultDistributedExplorationConfig,
      outputDirectory,
      maxWorkers: 2,
      maxParallelWorkers: 2,
      personas: ['admin', 'readonly-user'],
      browsers: ['chromium'],
      viewports: ['desktop'],
      featureAreas: ['navigation'],
      routes: ['/'],
      riskCategories: ['navigation'],
      continueOnWorkerFailure: true,
      retryFailedWorkerOnce: true,
    },
    workerRunner: runner,
  }).run();

  expect(result.workers).toHaveLength(2);
  expect(attempts.get(result.workers.find((worker) => worker.assignment.personaId === 'admin')!.workerId)).toBe(2);
  expect(result.workers.some((worker) => worker.status === 'completed')).toBe(true);
  expect(result.globalReportPath).toBeTruthy();

  await rm(outputDirectory, { recursive: true, force: true });
});

test('stops all workers when critical failure policy is enabled', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'distributed-critical-'));
  let executed = 0;

  const runner: WorkerRunnerFn = async (assignment) => {
    executed += 1;
    const findings =
      executed === 1
        ? [sampleFinding({ severity: 'critical', title: 'Payment corruption detected' })]
        : [];
    return mockWorkerResult(assignment, 'completed', findings);
  };

  const result = await new DistributedExplorationRunner({
    baseGoal: sampleExplorationGoal,
    config: {
      ...defaultDistributedExplorationConfig,
      outputDirectory,
      maxWorkers: 4,
      maxParallelWorkers: 1,
      personas: ['admin', 'anonymous-visitor', 'readonly-user', 'first-time-user'],
      browsers: ['chromium'],
      viewports: ['desktop'],
      featureAreas: ['navigation'],
      routes: ['/'],
      riskCategories: ['navigation'],
      stopAllOnCriticalFailure: true,
    },
    workerRunner: runner,
  }).run();

  expect(result.stoppedEarly).toBe(true);
  expect(result.stopReason).toMatch(/critical/i);
  expect(result.coordination.globalFindings.some((finding) => finding.severity === 'critical')).toBe(true);
  expect(executed).toBe(1);

  await rm(outputDirectory, { recursive: true, force: true });
});
