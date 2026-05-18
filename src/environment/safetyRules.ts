import type { EnvironmentProfile } from './types';
import type { AgentAction } from '../types';

export interface EnvironmentSafetyCheck {
  allowed: boolean;
  reason?: string;
}

function actionText(action: AgentAction, extra = '') {
  return [action.kind, action.target, action.selector, action.url, action.reason, extra]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const MUTATION_WORDS = ['edit', 'update', 'save', 'submit', 'create', 'upload', 'delete', 'remove', 'post', 'put', 'patch'];
const EMAIL_WORDS = ['send email', 'send message', 'compose', 'mail', 'notify'];

export function checkEnvironmentSafety(
  environment: EnvironmentProfile,
  action: AgentAction,
  candidateText = '',
): EnvironmentSafetyCheck {
  const text = `${actionText(action)} ${candidateText}`.toLowerCase();

  for (const restricted of environment.restrictedActions) {
    if (text.includes(restricted.toLowerCase())) {
      return {
        allowed: false,
        reason: `Blocked by ${environment.name} environment policy: matches "${restricted}".`,
      };
    }
  }

  if (!environment.allowEmailSending && EMAIL_WORDS.some((word) => text.includes(word))) {
    return {
      allowed: false,
      reason: `Blocked by ${environment.name} environment policy: outbound email/messaging is disabled.`,
    };
  }

  if (!environment.allowDataMutation && MUTATION_WORDS.some((word) => text.includes(word))) {
    if (['fill', 'select', 'check', 'uncheck'].includes(action.kind)) {
      return {
        allowed: false,
        reason: `Blocked by ${environment.name} environment policy: data mutation is disabled.`,
      };
    }
  }

  if (!environment.allowDestructiveActions && /delete|remove|purge|checkout|payment|buy now|place order/.test(text)) {
    return {
      allowed: false,
      reason: `Blocked by ${environment.name} environment policy: destructive or commerce actions are disabled.`,
    };
  }

  return { allowed: true };
}

export function environmentForbiddenActions(environment: EnvironmentProfile) {
  const extras = [...environment.restrictedActions];
  if (!environment.allowEmailSending) {
    extras.push('send-email', 'send-message', 'compose message');
  }
  if (!environment.allowDataMutation) {
    extras.push('edit', 'update', 'save changes', 'submit form', 'create', 'upload');
  }
  if (!environment.allowDestructiveActions) {
    extras.push('delete', 'remove', 'checkout', 'payment', 'place order');
  }
  return extras;
}
