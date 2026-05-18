import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { GeneratedTest, GeneratedTestExecutionResult } from '../types';

const execFileAsync = promisify(execFile);

export interface GeneratedTestExecutionOptions {
  execute?: boolean;
  project?: string;
  reporter?: string;
  cwd?: string;
  retrySelectorHealing?: boolean;
}

function now() {
  return new Date().toISOString();
}

function truncate(value: string | undefined, maxLength = 6000) {
  if (!value) {
    return value;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}\n... truncated ...` : value;
}

function commandFor(filePath: string, options: GeneratedTestExecutionOptions) {
  const args = ['playwright', 'test', filePath];

  if (options.project) {
    args.push(`--project=${options.project}`);
  }

  if (options.reporter) {
    args.push(`--reporter=${options.reporter}`);
  }

  return {
    binary: 'npx',
    args,
    display: `npx ${args.join(' ')}`,
  };
}

async function runGeneratedTest(filePath: string, options: GeneratedTestExecutionOptions, selectorHealingApplied = false): Promise<GeneratedTestExecutionResult> {
  const startedAt = now();
  const command = commandFor(filePath, options);

  try {
    const result = await execFileAsync(command.binary, command.args, {
      cwd: options.cwd || process.cwd(),
      maxBuffer: 1024 * 1024 * 4,
      env: {
        ...process.env,
        PLAYWRIGHT_HTML_OPEN: 'never',
      },
    });

    return {
      status: 'passed',
      startedAt,
      endedAt: now(),
      command: command.display,
      stdout: truncate(result.stdout),
      stderr: truncate(result.stderr),
      selectorHealingApplied,
    };
  } catch (error) {
    const failed = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      status: 'failed',
      startedAt,
      endedAt: now(),
      command: command.display,
      exitCode: failed.code,
      stdout: truncate(failed.stdout),
      stderr: truncate(failed.stderr),
      selectorHealingApplied,
      failureReason: failed.stderr || failed.stdout || failed.message || 'Generated test execution failed.',
    };
  }
}

export async function executeGeneratedTest(
  generatedTest: GeneratedTest,
  options: GeneratedTestExecutionOptions,
  healedSourceFactory?: () => string,
): Promise<GeneratedTest> {
  if (!options.execute) {
    generatedTest.executionResults.push({
      status: 'not-run',
      startedAt: now(),
      endedAt: now(),
      failureReason: 'Generated test execution disabled by configuration.',
    });
    return generatedTest;
  }

  const firstRun = await runGeneratedTest(generatedTest.filePath, options);
  generatedTest.executionResults.push(firstRun);

  if (firstRun.status === 'passed') {
    generatedTest.status = 'passed';
    return generatedTest;
  }

  if (options.retrySelectorHealing && healedSourceFactory) {
    firstRun.retryAttempted = true;
    const healedSource = healedSourceFactory();
    await writeFile(generatedTest.filePath, healedSource, 'utf8');
    generatedTest.source = healedSource;

    const secondRun = await runGeneratedTest(generatedTest.filePath, options, true);
    generatedTest.executionResults.push(secondRun);

    if (secondRun.status === 'passed') {
      generatedTest.status = 'passed';
      return generatedTest;
    }
  }

  generatedTest.status = 'failed';
  generatedTest.failureReason = generatedTest.executionResults.at(-1)?.failureReason || 'Generated test failed.';
  return generatedTest;
}
