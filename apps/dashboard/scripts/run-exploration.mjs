#!/usr/bin/env node
/**
 * Dashboard exploration runner — delegates to root browser exploration script.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const scriptPath = join(root, 'scripts/run-exploration.mjs');

const raw = process.env.EXPLORATION_RUN_CONFIG;
if (!raw) {
  console.error('EXPLORATION_RUN_CONFIG is required');
  process.exit(1);
}

const child = spawn(process.execPath, [scriptPath], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

child.on('close', (code) => process.exit(code ?? 1));
