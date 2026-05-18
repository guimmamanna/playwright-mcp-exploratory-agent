import type { ExplorationSession, Observation } from '../types';

const MAX_CHARS = 1200;
const MAX_FINDINGS = 6;
const MAX_URLS = 8;
const MAX_ACTIONS = 6;

function truncate(value: string, max = MAX_CHARS) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

export function summarizeObservation(observation: Observation) {
  const elements = observation.interactiveElements
    .slice(0, 12)
    .map((element) => `${element.kind}:${element.label || element.href || element.selectorHint || 'unknown'}`)
    .join(', ');

  return truncate(
    [
      `url=${observation.url}`,
      `title=${observation.title || ''}`,
      `text=${observation.visibleTextSummary || ''}`,
      `forms=${observation.forms.length}`,
      `buttons=${observation.buttons.length}`,
      `links=${observation.links.length}`,
      `consoleErrors=${observation.consoleMessages.filter((message) => message.level === 'error').length}`,
      `failedRequests=${(observation.failedNetworkRequests || []).length}`,
      `elements=[${elements}]`,
      observation.domSummary ? `signals=${observation.domSummary}` : '',
    ]
      .filter(Boolean)
      .join('; '),
    500,
  );
}

export function summarizeSessionMemory(session: ExplorationSession) {
  return truncate(
    [
      `visited=${session.memory.visitedUrls.slice(-MAX_URLS).join(' | ')}`,
      `pending=${session.memory.pendingAreas.join(', ')}`,
      `blocked=${session.memory.skippedRiskyActions.length}`,
      `failed=${session.memory.failedActions.length}`,
      `repeatedPrevented=${session.memory.repeatedActionsPrevented}`,
      `coverage=${session.memory.coverage.explorationPercentage}%`,
    ].join('; '),
    400,
  );
}

export function summarizeFindings(session: ExplorationSession) {
  return session.findings
    .slice(-MAX_FINDINGS)
    .map((finding) => `${finding.severity}:${finding.type}:${finding.title}`)
    .join(' | ');
}

export function summarizeRecentActions(session: ExplorationSession) {
  return session.memory.actionHistory
    .slice(-MAX_ACTIONS)
    .map((action) => `${action.kind}:${action.target || action.url || action.selector || ''}`)
    .join(' | ');
}

export function buildCompactReasoningContext(session: ExplorationSession, observation: Observation) {
  const chunks = [
    `goal=${session.goal.name}; priorities=${session.goal.priorities.join(',')}`,
    session.goal.riskAreas?.length ? `riskAreas=${session.goal.riskAreas.join(',')}` : '',
    session.explorationContext
      ? `env=${session.explorationContext.environment.name}; persona=${session.explorationContext.persona.name}; locale=${session.explorationContext.locale}`
      : `env=${session.config.environmentName}; persona=${session.config.persona}`,
    `stopConditions=${session.config.stopConditions.join(',')}`,
    summarizeSessionMemory(session),
    summarizeObservation(observation),
    summarizeFindings(session) ? `findings=${summarizeFindings(session)}` : '',
    summarizeRecentActions(session) ? `recentActions=${summarizeRecentActions(session)}` : '',
    session.memory.skippedRiskyActions.length ? `blocked=recent actions were blocked by safety policy` : '',
  ].filter(Boolean);

  return truncate(chunks.join('\n'));
}

export function chunkObservationText(observation: Observation, chunkSize = 400) {
  const text = observation.visibleText || observation.visibleTextSummary || '';
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks.slice(0, 3);
}
