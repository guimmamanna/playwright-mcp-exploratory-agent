import type { LLMProvider, LLMRequest, LLMResponse } from './types';

function extractJsonBlock(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferFromPrompt(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes('blocked') || lower.includes('skippedrisky')) {
    return {
      strategy: 'navigation-focused',
      reasoningSummary: 'Recent actions were blocked; pivot to safer navigation paths and re-evaluate permissions.',
      riskAssessment: 'medium',
      confidenceScore: 0.72,
      suggestedActions: ['Explore alternative navigation links', 'Verify read-only paths'],
      hypotheses: [
        {
          statement: 'Permission restrictions may be hiding primary workflows',
          riskArea: 'permission exploration',
          validationIdea: 'Attempt view-only navigation and compare visible controls',
        },
      ],
    };
  }

  if (lower.includes('modal') || lower.includes('dialog') || lower.includes('keyboard')) {
    return {
      strategy: 'accessibility-focused',
      reasoningSummary: 'Modal or keyboard-sensitive UI detected; prioritize accessibility validation.',
      riskAssessment: 'high',
      confidenceScore: 0.81,
      suggestedActions: ['Probe keyboard navigation through modal controls'],
      hypotheses: [
        {
          statement: 'This modal may fail keyboard navigation',
          riskArea: 'accessibility',
          validationIdea: 'Tab through modal controls and verify focus trap behavior',
        },
      ],
    };
  }

  if (lower.includes('filter') || lower.includes('sort')) {
    return {
      strategy: 'state-persistence-exploration',
      reasoningSummary: 'Filtering controls are visible; test whether applied filters persist across navigation.',
      riskAssessment: 'medium',
      confidenceScore: 0.77,
      suggestedActions: ['Apply a filter and navigate away, then return'],
      hypotheses: [
        {
          statement: 'This filter may not persist state',
          riskArea: 'state persistence',
          validationIdea: 'Apply filter, navigate away, and verify filter state on return',
        },
      ],
    };
  }

  if (lower.includes('upload') || lower.includes('file')) {
    return {
      strategy: 'edge-case-exploration',
      reasoningSummary: 'Upload affordances detected; probe validation and error handling paths.',
      riskAssessment: 'high',
      confidenceScore: 0.74,
      suggestedActions: ['Attempt upload with invalid file types or empty input'],
      hypotheses: [
        {
          statement: 'This upload flow may fail validation',
          riskArea: 'forms',
          validationIdea: 'Submit invalid or empty upload input and inspect validation messaging',
        },
      ],
    };
  }

  if (lower.includes('admin') || lower.includes('settings') || lower.includes('permission')) {
    return {
      strategy: 'permission-exploration',
      reasoningSummary: 'Administrative or settings surfaces may expose permission-sensitive behavior.',
      riskAssessment: 'high',
      confidenceScore: 0.79,
      suggestedActions: ['Navigate settings and management pages'],
      hypotheses: [
        {
          statement: 'This page may expose permission leakage',
          riskArea: 'permissions',
          validationIdea: 'Compare visible actions against expected role permissions',
        },
      ],
    };
  }

  if (lower.includes('sign in') || lower.includes('login') || lower.includes('register')) {
    return {
      strategy: 'authentication-focused',
      reasoningSummary: 'Authentication entry points are visible; explore signup/login flows first.',
      riskAssessment: 'medium',
      confidenceScore: 0.83,
      suggestedActions: ['Open login or registration paths'],
      hypotheses: [],
    };
  }

  if (lower.includes('form') || lower.includes('input')) {
    return {
      strategy: 'form-focused',
      reasoningSummary: 'Interactive forms dominate the page; prioritize safe field entry and validation checks.',
      riskAssessment: 'medium',
      confidenceScore: 0.8,
      suggestedActions: ['Fill required fields with safe synthetic values'],
      hypotheses: [],
    };
  }

  return {
    strategy: 'navigation-focused',
    reasoningSummary: 'Continue breadth-first navigation while monitoring console, network, and accessibility signals.',
    riskAssessment: 'low',
    confidenceScore: 0.7,
    suggestedActions: ['Follow high-value navigation links', 'Search when available'],
    hypotheses: [],
  };
}

export class MockLLMProvider implements LLMProvider {
  readonly id = 'mock' as const;
  readonly model: string;

  constructor(model = 'mock-reasoning-v1') {
    this.model = model;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const prompt = request.messages.map((message) => message.content).join('\n');
    const userJson = extractJsonBlock(prompt);
    if (userJson?.strategy) {
      return {
        provider: this.id,
        model: this.model,
        content: JSON.stringify(userJson),
        usage: { promptTokens: prompt.length / 4, completionTokens: 120 },
      };
    }

    const inferred = inferFromPrompt(prompt);
    return {
      provider: this.id,
      model: this.model,
      content: JSON.stringify(inferred),
      usage: { promptTokens: prompt.length / 4, completionTokens: 150 },
    };
  }
}
