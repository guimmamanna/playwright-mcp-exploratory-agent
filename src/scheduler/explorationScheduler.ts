import { join } from 'node:path';
import type { ExplorationGoal, ExplorationPriority, PersonaId } from '../types';
import type {
  BrowserMatrixId,
  DistributedExplorationConfig,
  RiskCategoryId,
  SchedulerOptions,
  ViewportMatrixId,
  WorkerAssignment,
} from '../distributed/types';
import {
  browserLabel,
  defaultBrowserMatrix,
  defaultFeatureAreas,
  defaultPersonaMatrix,
  defaultRiskCategories,
  defaultRoutes,
  defaultViewportMatrix,
  viewportSizeFor,
} from './matrices';

interface ShardDimensions {
  personaId: PersonaId;
  browser: BrowserMatrixId;
  viewport: ViewportMatrixId;
  featureArea?: string;
  route?: string;
  riskCategory?: RiskCategoryId;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function areaKey(shard: ShardDimensions) {
  return [
    shard.personaId,
    shard.browser,
    shard.viewport,
    shard.featureArea || 'general',
    shard.route || 'root',
    shard.riskCategory || 'mixed',
  ].join('::');
}

function workerIdFromShard(shard: ShardDimensions, index: number) {
  const label = [
    shard.personaId,
    shard.viewport,
    browserLabel(shard.browser),
    shard.featureArea,
    shard.route?.replace(/\//g, '-') || 'home',
    shard.riskCategory,
  ]
    .filter(Boolean)
    .map((part) => slug(String(part)))
    .join('-');
  return `worker-${String(index + 1).padStart(2, '0')}-${label}`.slice(0, 120);
}

function buildGoalForShard(
  baseGoal: ExplorationGoal,
  shard: ShardDimensions,
  workerId: string,
  baseUrl: string,
): ExplorationGoal {
  const priorities = new Set<ExplorationPriority>(baseGoal.priorities);
  if (shard.featureArea) {
    priorities.add(shard.featureArea as ExplorationPriority);
  }
  if (shard.riskCategory) {
    priorities.add(shard.riskCategory as ExplorationPriority);
  }

  const flowLabel = [
    shard.personaId,
    `${shard.viewport} ${browserLabel(shard.browser)}`,
    shard.featureArea ? `${shard.featureArea} flow` : undefined,
    shard.route && shard.route !== '/' ? shard.route : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    ...baseGoal,
    baseUrl: baseGoal.baseUrl || baseUrl,
    id: `${baseGoal.id}-${workerId}`,
    name: `${baseGoal.name} — ${flowLabel}`,
    description: `${baseGoal.description} (distributed shard: ${flowLabel})`,
    targetUrl: shard.route || baseGoal.targetUrl,
    priorities: Array.from(priorities),
    riskAreas: shard.riskCategory ? [shard.riskCategory, ...(baseGoal.riskAreas || [])] : baseGoal.riskAreas,
    metadata: {
      ...(baseGoal.metadata || {}),
      workerId,
      personaId: shard.personaId,
      browser: shard.browser,
      viewport: shard.viewport,
      featureArea: shard.featureArea || '',
      route: shard.route || '',
      riskCategory: shard.riskCategory || '',
    },
  };
}

function cartesianShards(config: DistributedExplorationConfig): ShardDimensions[] {
  const personas = config.personas?.length ? config.personas : defaultPersonaMatrix;
  const browsers = config.browsers?.length ? config.browsers : defaultBrowserMatrix;
  const viewports = config.viewports?.length ? config.viewports : defaultViewportMatrix;
  const featureAreas = config.featureAreas?.length ? config.featureAreas : defaultFeatureAreas;
  const routes = config.routes?.length ? config.routes : defaultRoutes;
  const riskCategories = config.riskCategories?.length ? config.riskCategories : [...defaultRiskCategories];

  const shards: ShardDimensions[] = [];
  for (const personaId of personas) {
    for (const browser of browsers) {
      for (const viewport of viewports) {
        for (const featureArea of featureAreas) {
          for (const route of routes) {
            for (const riskCategory of riskCategories) {
              shards.push({ personaId, browser, viewport, featureArea, route, riskCategory });
            }
          }
        }
      }
    }
  }
  return shards;
}

/**
 * Example assignments:
 * - worker-01-admin-desktop-chromium-settings-/settings-settings
 * - worker-02-readonly-mobile-webkit-navigation
 * - worker-03-accessibility-user-tablet-firefox-forms
 */
export function scheduleWorkerAssignments(options: SchedulerOptions): WorkerAssignment[] {
  const { baseGoal, config } = options;
  const shards = cartesianShards(config);
  const limit = config.maxWorkers || config.maxParallelWorkers || shards.length;
  const selected = shards.slice(0, Math.max(1, limit));

  return selected.map((shard, index) => {
    const workerId = workerIdFromShard(shard, index);
    const workerRoot = join(config.outputDirectory, workerId);
    const key = areaKey(shard);

    return {
      workerId,
      assignedGoal: buildGoalForShard(baseGoal, shard, workerId, config.baseUrl),
      personaId: shard.personaId,
      environmentId: config.environmentId || 'local',
      browser: shard.browser,
      viewport: shard.viewport,
      viewportSize: viewportSizeFor(shard.viewport),
      featureArea: shard.featureArea,
      route: shard.route,
      riskCategory: shard.riskCategory,
      maxSteps: config.maxStepsPerWorker,
      evidenceDirectory: join(workerRoot, 'evidence'),
      reportDirectory: join(workerRoot, 'reports'),
      storageStatePath: join(workerRoot, 'storage-state.json'),
      memoryPath: join(workerRoot, 'session-memory.json'),
      areaKey: key,
    };
  });
}

export function describeAssignment(assignment: WorkerAssignment) {
  return `${assignment.personaId} ${assignment.viewport} ${browserLabel(assignment.browser)} ${
    assignment.featureArea || 'general'
  } @ ${assignment.route || '/'}`;
}
