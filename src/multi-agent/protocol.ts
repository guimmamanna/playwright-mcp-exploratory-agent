import type { Finding } from '../types';
import type { AgentMessage, AgentRoleName } from './types';

export function createAgentMessage(args: {
  agentName: AgentRoleName;
  currentTask: string;
  observation: string;
  finding?: Finding;
  confidence?: AgentMessage['confidence'];
  recommendation?: string;
  nextSuggestedAction?: string;
}): AgentMessage {
  return {
    agentName: args.agentName,
    currentTask: args.currentTask,
    observation: args.observation,
    finding: args.finding,
    confidence: args.confidence || (args.finding ? 'medium' : 'low'),
    recommendation: args.recommendation || 'Continue exploration.',
    nextSuggestedAction: args.nextSuggestedAction || 'Observe next page state.',
  };
}

export function isValidAgentMessage(message: unknown): message is AgentMessage {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as AgentMessage;
  return (
    typeof candidate.agentName === 'string' &&
    typeof candidate.currentTask === 'string' &&
    typeof candidate.observation === 'string' &&
    ['low', 'medium', 'high'].includes(candidate.confidence) &&
    typeof candidate.recommendation === 'string' &&
    typeof candidate.nextSuggestedAction === 'string'
  );
}

export function messagesWithFindings(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((message) => Boolean(message.finding));
}
