import type { Finding, GeneratedTest } from '../types';
import type { CoordinationSnapshot, MergedFindingRecord, WorkerAssignment, WorkerStatus } from './types';
import { ingestFinding, type DuplicateMergeResult } from './duplicateFindings';

export class CoordinationStore {
  private assignedAreas = new Map<string, string>();
  private completedAreas = new Set<string>();
  private activeWorkers = new Map<string, WorkerStatus>();
  private blockedAreas = new Set<string>();
  private globalFindings: Finding[] = [];
  private mergedFindings = new Map<string, MergedFindingRecord>();
  private generatedTests: GeneratedTest[] = [];
  private duplicateFindingCount = 0;

  registerAssignments(assignments: WorkerAssignment[]) {
    for (const assignment of assignments) {
      this.assignedAreas.set(assignment.areaKey, assignment.workerId);
      this.activeWorkers.set(assignment.workerId, 'queued');
    }
  }

  markWorkerStatus(workerId: string, status: WorkerStatus) {
    this.activeWorkers.set(workerId, status);
  }

  markAreaCompleted(areaKey: string, workerId: string) {
    this.completedAreas.add(areaKey);
    this.activeWorkers.set(workerId, 'completed');
  }

  markAreaBlocked(areaKey: string, reason?: string) {
    this.blockedAreas.add(areaKey);
    if (reason) {
      this.globalFindings.push({
        id: `blocked-area:${areaKey}`,
        type: 'flow-failure',
        severity: 'medium',
        category: 'functional',
        title: `Blocked exploration area: ${areaKey}`,
        description: reason,
        reproductionSteps: [],
        evidence: [],
        status: 'needs-triage',
      });
    }
  }

  addWorkerFindings(workerId: string, findings: Finding[]): DuplicateMergeResult[] {
    const results: DuplicateMergeResult[] = [];
    for (const finding of findings) {
      const result = ingestFinding(this.mergedFindings, finding, workerId);
      results.push(result);
      if (result.duplicate) {
        this.duplicateFindingCount += 1;
      }
      if (!this.globalFindings.some((existing) => existing.id === result.record.finding.id)) {
        this.globalFindings.push(result.record.finding);
      } else {
        const index = this.globalFindings.findIndex((existing) => existing.id === result.record.finding.id);
        this.globalFindings[index] = result.record.finding;
      }
    }
    return results;
  }

  addGeneratedTests(tests: GeneratedTest[]) {
    for (const test of tests) {
      if (!this.generatedTests.some((existing) => existing.id === test.id)) {
        this.generatedTests.push(test);
      }
    }
  }

  hasCriticalFinding() {
    return this.globalFindings.some((finding) => finding.severity === 'critical');
  }

  snapshot(): CoordinationSnapshot {
    return {
      assignedAreas: Array.from(this.assignedAreas.entries()).map(([areaKey, workerId]) => ({ areaKey, workerId })),
      completedAreas: Array.from(this.completedAreas),
      activeWorkers: Array.from(this.activeWorkers.entries()).map(([workerId, status]) => ({ workerId, status })),
      blockedAreas: Array.from(this.blockedAreas),
      globalFindings: [...this.globalFindings],
      mergedFindings: Array.from(this.mergedFindings.values()),
      duplicateFindingCount: this.duplicateFindingCount,
      generatedTests: [...this.generatedTests],
    };
  }
}
