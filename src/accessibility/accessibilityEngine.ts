import type { Page } from '@playwright/test';
import type { AccessibilitySignals, ExplorationConfig, Finding, Observation } from '../types';
import { inspectDomAccessibility } from './domInspection';
import { runAxeScan } from './axeScanner';
import { captureAccessibilitySnapshotSummary } from './playwrightSnapshot';
import { keyboardProbeIssues, probeKeyboardNavigation } from './keyboardProbe';
import { issuesToFindings } from './findingFactory';
import type { AccessibilityIssue } from './types';

function uniqueIssues(issues: AccessibilityIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.issueType}:${issue.affectedSelector || ''}:${issue.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toSignals(args: {
  issues: AccessibilityIssue[];
  axeViolationCount: number;
  keyboardFocusOrder: string[];
  unreachableControls: string[];
  keyboardTrapDetected: boolean;
  focusDisappeared: boolean;
  landmarks: string[];
  headingLevels: number[];
  snapshotSummary: string;
}): AccessibilitySignals {
  return {
    issueCount: args.issues.length,
    axeViolationCount: args.axeViolationCount,
    keyboardFocusOrder: args.keyboardFocusOrder,
    unreachableControls: args.unreachableControls,
    keyboardTrapDetected: args.keyboardTrapDetected,
    focusDisappeared: args.focusDisappeared,
    landmarks: args.landmarks,
    headingLevels: args.headingLevels,
    snapshotSummary: args.snapshotSummary,
    issues: args.issues.map((issue) => ({
      id: issue.id,
      issueType: issue.issueType,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      wcagReference: issue.wcagReference,
      affectedSelector: issue.affectedSelector,
      affectedRole: issue.affectedRole,
      affectedName: issue.affectedName,
      recommendation: issue.recommendation,
    })),
  };
}

export class AccessibilityEngine {
  async auditPage(page: Page, observation: Observation, config: ExplorationConfig): Promise<AccessibilitySignals> {
    const issues: AccessibilityIssue[] = [];
    let axeViolationCount = 0;
    let keyboardFocusOrder: string[] = [];
    let unreachableControls: string[] = [];
    let keyboardTrapDetected = false;
    let focusDisappeared = false;
    let landmarks: string[] = [];
    let headingLevels: number[] = [];
    let snapshotSummary = observation.accessibilitySnapshot || '';

    if (config.accessibilityAuditEnabled !== false) {
      const dom = await inspectDomAccessibility(page);
      issues.push(...dom.issues);
      landmarks = dom.landmarks;
      headingLevels = dom.headingLevels;

      const axe = await runAxeScan(page);
      issues.push(...axe.issues);
      axeViolationCount = axe.violationCount;

      snapshotSummary = await captureAccessibilitySnapshotSummary(page);
    }

    if (config.keyboardNavigationCheckEnabled !== false) {
      const probe = await probeKeyboardNavigation(page);
      keyboardFocusOrder = probe.focusOrder;
      unreachableControls = probe.unreachableControls;
      keyboardTrapDetected = probe.keyboardTrapDetected;
      focusDisappeared = probe.focusDisappeared;
      issues.push(...keyboardProbeIssues(probe));
    }

    return toSignals({
      issues: uniqueIssues(issues),
      axeViolationCount,
      keyboardFocusOrder,
      unreachableControls,
      keyboardTrapDetected,
      focusDisappeared,
      landmarks,
      headingLevels,
      snapshotSummary,
    });
  }

  findingsFromObservation(observation: Observation, options: { stepId?: string } = {}): Finding[] {
    const issues = observation.accessibilitySignals?.issues || [];
    return issuesToFindings(
      issues.map((issue) => ({
        id: issue.id,
        issueType: issue.issueType,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        wcagReference: issue.wcagReference,
        affectedSelector: issue.affectedSelector,
        affectedRole: issue.affectedRole,
        affectedName: issue.affectedName,
        recommendation: issue.recommendation,
      })),
      observation,
      { stepId: options.stepId, evidencePath: observation.screenshotPath },
    );
  }

  newIssuesAfterAction(before: Observation, after: Observation, options: { stepId?: string } = {}): Finding[] {
    const beforeIds = new Set((before.accessibilitySignals?.issues || []).map((issue) => issue.id));
    const introduced = (after.accessibilitySignals?.issues || []).filter((issue) => !beforeIds.has(issue.id));
    return issuesToFindings(
      introduced.map((issue) => ({
        id: issue.id,
        issueType: issue.issueType,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        wcagReference: issue.wcagReference,
        affectedSelector: issue.affectedSelector,
        affectedRole: issue.affectedRole,
        affectedName: issue.affectedName,
        recommendation: issue.recommendation,
      })),
      after,
      { stepId: options.stepId, evidencePath: after.screenshotPath },
    );
  }
}

export const defaultAccessibilityEngine = new AccessibilityEngine();
