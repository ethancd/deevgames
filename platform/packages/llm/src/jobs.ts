// runImplementJob: the guarded agent implement-job pipeline, generalized
// from lution/server/claude.ts's implementCards (the Claude Agent SDK half
// of that file — see its "implementCards -- Claude Agent SDK" section).
//
// Two house lessons baked in:
//   1. The repository state is never the agent's to manage. Lution's own
//      comment: "a stray `git stash` from a confused attempt once swept up
//      the whole working tree." Both disallowed-tools spellings are merged
//      in UNCONDITIONALLY, regardless of what the caller passes, so a
//      caller can never accidentally weaken this guarantee by supplying
//      their own disallowedTools array without git in it.
//   2. The Claude Agent SDK must never be resolved at module load or in
//      keyless/mock-runner test runs. `runner` is the injectable seam;
//      the DEFAULT runner dynamically `await import(...)`s the SDK inside
//      the function body — only real jobs (which supply no runner) ever
//      touch that import. The type-only import below costs nothing at
//      runtime or module load.

import type { Options as ClaudeAgentSdkOptions } from '@anthropic-ai/claude-agent-sdk';

export interface JobRunnerOptions {
  prompt: string;
  cwd: string;
  allowedTools: string[];
  disallowedTools: string[];
  maxTurns: number;
}

export interface JobRunnerResult {
  output: string;
}

export type JobRunner = (opts: JobRunnerOptions) => Promise<JobRunnerResult>;

export interface GateResult {
  pass: boolean;
  feedback?: string;
}

export interface RunImplementJobParams {
  prompt: string;
  cwd: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  attempts?: number;
  gate: () => Promise<GateResult>;
  runner?: JobRunner;
}

export interface RunImplementJobResult {
  success: boolean;
  attempts: number;
  log: string[];
}

const DEFAULT_ALLOWED_TOOLS: readonly string[] = ['Read', 'Write', 'Edit', 'Bash', 'Glob'];
const DEFAULT_MAX_TURNS = 50;
const DEFAULT_ATTEMPTS = 3;

// BOTH spellings, always, deduped, regardless of caller input. Two spellings
// because different tool-permission matchers in the wild key on one or the
// other (see lution/server/claude.ts's own comment: `['Bash(git *)',
// 'Bash(git*)']` — this package also merges the colon spelling per the spec,
// belt-and-suspenders against whichever matcher a given harness version
// uses).
const REQUIRED_DISALLOWED_GIT: readonly string[] = ['Bash(git *)', 'Bash(git:*)'];

function mergeDisallowedTools(callerSupplied: string[] | undefined): string[] {
  const merged = new Set<string>(callerSupplied ?? []);
  for (const spelling of REQUIRED_DISALLOWED_GIT) merged.add(spelling);
  return [...merged];
}

/**
 * The default runner: dynamically imports the Claude Agent SDK and drives
 * query() to completion, concatenating whatever it streams back into a
 * single log string. Only ever invoked when a caller does NOT supply their
 * own `runner` — mock-runner tests and keyless CI never reach this
 * function, so they never resolve the SDK.
 */
const defaultRunner: JobRunner = async (opts: JobRunnerOptions): Promise<JobRunnerResult> => {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  const options: ClaudeAgentSdkOptions = {
    cwd: opts.cwd,
    allowedTools: opts.allowedTools,
    disallowedTools: opts.disallowedTools,
    maxTurns: opts.maxTurns,
    permissionMode: 'acceptEdits',
  };

  const session = query({ prompt: opts.prompt, options });

  const lines: string[] = [];
  for await (const message of session) {
    // Message shapes vary across SDK versions/message types; best-effort
    // stringify so the job log always has something to show, without this
    // module owning a full parser for the SDK's message union (that's
    // implementCards' job in the reference implementation, out of scope for
    // this generic package).
    lines.push(JSON.stringify(message));
  }
  return { output: lines.join('\n') };
};

/**
 * Runs an agent implement-job up to `attempts` times, gating each attempt's
 * result with the caller-supplied `gate()` (typically: run the game's own
 * test suite / structural checks). On a failing gate, the next attempt's
 * prompt has the gate's feedback appended so the agent can course-correct —
 * mirrors implementCards' "prior failure output" retry loop, generalized to
 * an arbitrary caller-defined pass/fail signal instead of a hardcoded
 * vitest-shaped check.
 */
export async function runImplementJob(params: RunImplementJobParams): Promise<RunImplementJobResult> {
  const allowedTools = params.allowedTools ?? [...DEFAULT_ALLOWED_TOOLS];
  const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS;
  const attempts = params.attempts ?? DEFAULT_ATTEMPTS;
  const runner = params.runner ?? defaultRunner;
  const disallowedTools = mergeDisallowedTools(params.disallowedTools);

  const log: string[] = [];
  let currentPrompt = params.prompt;
  let attemptsRun = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    attemptsRun = attempt;
    log.push(`--- implement attempt ${attempt}/${attempts} ---`);

    const result = await runner({
      prompt: currentPrompt,
      cwd: params.cwd,
      allowedTools,
      disallowedTools,
      maxTurns,
    });
    log.push(result.output);

    const gateResult = await params.gate();
    if (gateResult.pass) {
      log.push(`attempt ${attempt} passed the gate.`);
      return { success: true, attempts: attemptsRun, log };
    }

    log.push(
      `attempt ${attempt} failed the gate.${gateResult.feedback ? ` Feedback: ${gateResult.feedback}` : ''}`
    );
    if (gateResult.feedback) {
      currentPrompt = `${params.prompt}\n\nA previous attempt failed. Feedback: ${gateResult.feedback}`;
    }
  }

  return { success: false, attempts: attemptsRun, log };
}
