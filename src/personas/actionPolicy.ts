import { checkEnvironmentSafety } from '../environment/safetyRules';
import type { AgentAction, ExplorationConfig, ExplorationSession } from '../types';
import type { ActionPolicyResult, PersonaProfile } from './types';

const FORBIDDEN_WORDS = [
  'checkout',
  'payment',
  'pay',
  'purchase',
  'buy now',
  'place order',
  'delete',
  'remove',
  'cancel subscription',
  'send email',
  'send message',
  'compose message',
  'submit message',
  'account settings',
];

function buildCandidateText(action: AgentAction, extra = '') {
  return [action.kind, action.target, action.selector, action.url, action.reason, extra]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesRestrictedFlow(text: string, restrictedFlows: string[]) {
  return restrictedFlows.some((flow) => text.includes(flow.toLowerCase()));
}

export function evaluateActionPolicy(args: {
  session: ExplorationSession;
  action: AgentAction;
  candidateText?: string;
  destructiveAllowed?: boolean;
}): ActionPolicyResult {
  const { session, action, candidateText = '', destructiveAllowed = false } = args;
  const config = session.config;
  const persona = session.explorationContext?.persona;
  const environment = session.explorationContext?.environment;
  const text = buildCandidateText(action, candidateText);

  if (persona?.allowedActions && !persona.allowedActions.includes(action.kind)) {
    return {
      allowed: false,
      source: 'persona',
      reason: `Blocked for persona "${persona.name}": action kind "${action.kind}" is not permitted.`,
    };
  }

  if (!config.allowedActions.includes(action.kind)) {
    return {
      allowed: false,
      source: 'config',
      reason: `Action kind "${action.kind}" is not in allowedActions.`,
    };
  }

  if (persona && matchesRestrictedFlow(text, persona.restrictedFlows)) {
    return {
      allowed: false,
      source: 'persona',
      reason: `Blocked for persona "${persona.name}": flow matches a restricted pattern.`,
    };
  }

  if (environment) {
    const envCheck = checkEnvironmentSafety(environment, action, text);
    if (!envCheck.allowed) {
      return { allowed: false, source: 'environment', reason: envCheck.reason };
    }
  }

  if (!destructiveAllowed) {
    const forbidden = [...FORBIDDEN_WORDS, ...config.forbiddenActions];
    if (forbidden.some((word) => text.includes(word.toLowerCase()))) {
      return {
        allowed: false,
        source: 'config',
        reason: 'Blocked by global forbidden action policy.',
      };
    }
  }

  return { allowed: true };
}

export function personaPriorityBoost(persona: PersonaProfile | undefined, candidateText: string, priority: string) {
  if (!persona) {
    return 0;
  }

  let boost = 0;
  const text = candidateText.toLowerCase();

  for (const flow of persona.preferredFlows) {
    if (text.includes(flow.toLowerCase())) {
      boost += 28;
      break;
    }
  }

  const priorityIndex = persona.explorationPriorities.indexOf(priority as PersonaProfile['explorationPriorities'][number]);
  if (priorityIndex !== -1) {
    boost += (persona.explorationPriorities.length - priorityIndex) * 6;
  }

  if (persona.riskProfile === 'conservative' && ['create-edit-delete', 'settings'].includes(priority)) {
    boost -= 12;
  }

  if (persona.riskProfile === 'aggressive' && ['create-edit-delete', 'settings'].includes(priority)) {
    boost += 8;
  }

  return boost;
}

export function inferObservedPermissions(persona: PersonaProfile | undefined, observationText: string) {
  const permissions = new Set(persona?.permissions || []);
  const text = observationText.toLowerCase();

  if (/admin|manage users|role/i.test(text)) {
    permissions.add('admin');
  }
  if (/read only|view only|cannot edit/i.test(text)) {
    permissions.delete('write');
    permissions.add('read');
  }
  if (/premium|pro plan|subscriber/i.test(text)) {
    permissions.add('premium');
  }
  if (/sign in|log in|register|create account/i.test(text)) {
    permissions.add('signup');
  }

  return Array.from(permissions);
}
