import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Page } from '@playwright/test';
import type { ExplorationConfig, Finding, Observation, VisualSignals, VisualIssueRecord } from '../types';
import { inspectVisualDom } from './domInspection';
import { issuesToFindings } from './findingFactory';
import { captureViewportScreenshot } from './screenshotCapture';
import type { VisualIssue, ViewportCaptureResult, ViewportProfile } from './types';
import { responsiveViewports } from './viewports';
import { baselinePathFor, compareScreenshots, diffPathFor } from './visualDiff';

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function toSignals(captures: ViewportCaptureResult[], activeViewport: string): VisualSignals {
  const issues = captures.flatMap((capture) => capture.issues);
  return {
    activeViewport,
    captures: captures.map((capture) => ({
      viewport: capture.viewport.name,
      width: capture.viewport.width,
      height: capture.viewport.height,
      screenshotPath: capture.screenshotPath,
      baselinePath: capture.baselinePath,
      diffPath: capture.diffPath,
      diffRatio: capture.diffRatio,
      issueCount: capture.issues.length,
    })),
    issues: issues.map((issue) => ({
      id: issue.id,
      issueType: issue.issueType,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      viewport: issue.viewport,
      affectedSelector: issue.affectedSelector,
      recommendation: issue.recommendation,
      screenshotPath: issue.screenshotPath,
      diffPath: issue.diffPath,
      diffRatio: issue.diffRatio,
    })),
    summary: `viewports=${captures.length}; issues=${issues.length}`,
  };
}

export class VisualEngine {
  private issueFromRecord(record: VisualIssueRecord): VisualIssue {
    return {
      id: record.id,
      issueType: record.issueType,
      severity: record.severity,
      title: record.title,
      description: record.description,
      viewport: record.viewport,
      affectedSelector: record.affectedSelector,
      recommendation: record.recommendation,
      screenshotPath: record.screenshotPath,
      diffPath: record.diffPath,
      diffRatio: record.diffRatio,
    };
  }

  async auditViewport(
    page: Page,
    observation: Observation,
    config: ExplorationConfig,
    viewport: ViewportProfile,
    phase = 'current',
  ): Promise<ViewportCaptureResult> {
    const screenshotPath = await captureViewportScreenshot(page, config.evidenceDirectory, observation.url, viewport, phase);
    const domIssues = await inspectVisualDom(page, viewport).then((issues) =>
      issues.map((issue) => ({ ...issue, screenshotPath })),
    );

    const baselinePath = baselinePathFor(config.evidenceDirectory, observation.url, viewport.name);
    let diffPath: string | undefined;
    let diffRatio: number | undefined;
    const issues: VisualIssue[] = [...domIssues];

    if (config.visualComparisonEnabled !== false && (await fileExists(screenshotPath))) {
      if (!(await fileExists(baselinePath))) {
        await mkdir(dirname(baselinePath), { recursive: true });
        await copyFile(screenshotPath, baselinePath);
      } else {
        const diffTarget = diffPathFor(config.evidenceDirectory, observation.url, viewport.name, phase);
        const comparison = await compareScreenshots({
          baselinePath,
          currentPath: screenshotPath,
          diffPath: diffTarget,
          threshold: config.visualDiffThreshold ?? 0.1,
        });
        diffRatio = comparison.diffRatio;
        diffPath = comparison.diffPath;
        if (comparison.changed) {
          issues.push({
            id: `visual-diff:${viewport.name}:${observation.url}`,
            issueType: 'visual-diff',
            severity: comparison.diffRatio > 0.25 ? 'high' : 'medium',
            title: 'Visual diff exceeds threshold',
            description: `Screenshot changed by ${(comparison.diffRatio * 100).toFixed(1)}% on ${viewport.name}.`,
            viewport: viewport.name,
            recommendation: 'Review layout regressions against the stored baseline screenshot.',
            screenshotPath,
            diffPath,
            diffRatio: comparison.diffRatio,
          });
        }
      }
    }

    return {
      viewport,
      screenshotPath,
      baselinePath,
      diffPath,
      diffRatio,
      issues,
    };
  }

  async auditPage(page: Page, observation: Observation, config: ExplorationConfig): Promise<VisualSignals> {
    const viewports = config.multiViewportVisualMode ? responsiveViewports : [this.activeViewportProfile(config)];
    const captures: ViewportCaptureResult[] = [];

    for (const viewport of viewports) {
      captures.push(await this.auditViewport(page, observation, config, viewport));
    }

    if (config.multiViewportVisualMode) {
      const desktop = responsiveViewports.find((viewport) => viewport.name === 'desktop');
      if (desktop) {
        await page.setViewportSize({ width: desktop.width, height: desktop.height });
      }
    }

    return toSignals(captures, viewports[0]?.name || 'desktop');
  }

  activeViewportProfile(config: ExplorationConfig): ViewportProfile {
    const match = responsiveViewports.find(
      (viewport) => viewport.width === config.viewport.width && viewport.height === config.viewport.height,
    );
    return match || { name: 'desktop', width: config.viewport.width, height: config.viewport.height };
  }

  findingsFromObservation(observation: Observation, options: { stepId?: string } = {}): Finding[] {
    const issues = (observation.visualSignals?.issues || []).map((issue) => this.issueFromRecord(issue));
    return issuesToFindings(issues, observation, options);
  }

  newIssuesAfterAction(before: Observation, after: Observation, options: { stepId?: string } = {}): Finding[] {
    const beforeIds = new Set((before.visualSignals?.issues || []).map((issue) => issue.id));
    const introduced = (after.visualSignals?.issues || [])
      .filter((issue) => !beforeIds.has(issue.id))
      .map((issue) => this.issueFromRecord(issue));
    return issuesToFindings(introduced, after, options);
  }
}

export const defaultVisualEngine = new VisualEngine();
