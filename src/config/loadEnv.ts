import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function parseEnvFile(content: string) {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadProjectEnv(cwd = process.cwd()) {
  const candidates = [join(cwd, '.env'), join(cwd, '.env.local')];
  for (const path of candidates) {
    if (existsSync(path)) {
      parseEnvFile(readFileSync(path, 'utf8'));
    }
  }
}

export function resolveFreeTierLlmProvider(): 'gemini' | 'mock' {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'mock';
}

export function resolveFreeTierLlmApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
}
