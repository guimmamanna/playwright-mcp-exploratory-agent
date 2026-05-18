#!/usr/bin/env node
/**
 * Distributed exploratory exploration CLI.
 *
 * Usage:
 *   npm run explore:distributed
 *   npm run explore:distributed -- --workers=2 --max-steps=3
 *   BASE_URL=http://localhost:3000 npm run explore:distributed
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--workers=')) options.maxWorkers = arg.split('=')[1];
    if (arg.startsWith('--parallel=')) options.maxParallelWorkers = arg.split('=')[1];
    if (arg.startsWith('--max-steps=')) options.maxStepsPerWorker = arg.split('=')[1];
    if (arg.startsWith('--output=')) options.outputDirectory = arg.split('=')[1];
    if (arg === '--headed') options.headless = 'false';
  }
  return options;
}

const cliOptions = parseArgs(process.argv.slice(2));
const env = {
  ...process.env,
  DISTRIBUTED_EXPLORATION: '1',
  DISTRIBUTED_CLI_OPTIONS: JSON.stringify(cliOptions),
};

const result = spawnSync(
  'npx',
  ['playwright', 'test', 'tests/exploratory/distributed-exploration.harness.spec.ts', '--project=chromium'],
  {
    cwd: root,
    stdio: 'inherit',
    env,
  },
);

process.exit(result.status ?? 1);
