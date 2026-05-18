import { mkdir } from 'node:fs/promises';
import type { ExplorationGoal } from '../types';
import { scheduleWorkerAssignments } from '../scheduler/explorationScheduler';
import { runExplorationWorker, type WorkerExecutionOptions } from '../workers/explorationWorker';
import { CoordinationStore } from './coordinationStore';
import { writeAggregateReport } from './aggregateReporter';
import type {
  DistributedExplorationConfig,
  DistributedRunResult,
  WorkerAssignment,
  WorkerResult,
} from './types';

export type WorkerRunnerFn = (
  assignment: WorkerAssignment,
  options: WorkerExecutionOptions,
) => Promise<WorkerResult>;

export interface DistributedRunnerOptions {
  baseGoal: ExplorationGoal;
  config: DistributedExplorationConfig;
  workerRunner?: WorkerRunnerFn;
  headless?: boolean;
}

function now() {
  return new Date().toISOString();
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export class DistributedExplorationRunner {
  private readonly store = new CoordinationStore();

  constructor(private readonly options: DistributedRunnerOptions) {}

  async run(): Promise<DistributedRunResult> {
    const runId = `distributed-${Date.now()}`;
    const startedAt = now();
    const { config, baseGoal } = this.options;
    const runner = this.options.workerRunner || runExplorationWorker;

    await mkdir(config.outputDirectory, { recursive: true });

    const assignments = scheduleWorkerAssignments({ baseGoal, config });
    this.store.registerAssignments(assignments);

    const results: WorkerResult[] = [];
    let stoppedEarly = false;
    let stopReason: string | undefined;
    const timeoutMs = config.workerTimeoutMinutes * 60 * 1000;

    await runWithConcurrency(assignments, config.maxParallelWorkers, async (assignment) => {
      if (stoppedEarly) return;

      this.store.markWorkerStatus(assignment.workerId, 'running');
      let result = await runner(assignment, {
        headless: this.options.headless !== false,
        timeoutMs,
      });

      if (
        config.retryFailedWorkerOnce &&
        (result.status === 'failed' || result.status === 'timed-out') &&
        result.retryCount === 0
      ) {
        this.store.markWorkerStatus(assignment.workerId, 'retrying');
        result = await runner(assignment, { headless: this.options.headless !== false, timeoutMs });
        result = { ...result, retryCount: 1 };
      }

      results.push(result);

      if (result.session) {
        this.store.addWorkerFindings(assignment.workerId, result.session.findings);
        this.store.addGeneratedTests(result.session.generatedTests);
      }

      if (result.status === 'completed' || result.status === 'stopped') {
        this.store.markAreaCompleted(assignment.areaKey, assignment.workerId);
      } else {
        this.store.markAreaBlocked(assignment.areaKey, result.error || `Worker ${result.status}`);
        if (!config.continueOnWorkerFailure) {
          stoppedEarly = true;
          stopReason = result.error || `Worker ${assignment.workerId} failed`;
        }
      }

      if (config.stopAllOnCriticalFailure && this.store.hasCriticalFinding()) {
        stoppedEarly = true;
        stopReason = 'Critical finding detected; stopping all workers.';
      }
    });

    const coordination = this.store.snapshot();
    const runResult: DistributedRunResult = {
      runId,
      startedAt,
      endedAt: now(),
      workers: results,
      coordination,
      stoppedEarly,
      stopReason,
    };

    runResult.globalReportPath = await writeAggregateReport(config.outputDirectory, runResult);
    return runResult;
  }
}

export async function runDistributedExploration(options: DistributedRunnerOptions) {
  return new DistributedExplorationRunner(options).run();
}
