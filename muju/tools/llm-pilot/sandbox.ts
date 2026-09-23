/**
 * Sandboxed helper execution for the `tool-builder` tier (SPEC.md Component B/C follow-up:
 * "make tool-builder safe to admit").
 *
 * The tool-builder player may write and run its own helper code in its workspace. Two things
 * must never be true of that code: it must not be able to read this repo's source
 * (`/Users/ashkie/src`, which also contains the campaign dir and every game's `secrets/` —
 * same-user Unix file permissions do NOT stop a process running as the operator's own account
 * from reading a 0700 dir it owns) and it must not reach the network. Neither the CLI's own
 * built-in file tools nor a bare shell can be trusted to enforce that (Codex's `workspace-write`
 * sandbox restricts WRITES to the workspace but leaves reads unrestricted; a Claude `Bash` tool
 * has no read restriction at all). So no native shell/exec tool is exposed to tool-builder in
 * either CLI (see `players.ts`); all helper execution goes through this module's
 * `runSandboxedHelper`, wired up as the MCP tool `muju_run_helper` (gateway.ts).
 *
 * Isolation mechanism: macOS Seatbelt (`sandbox-exec`), OS-enforced and independent of Unix file
 * modes or the CLI's own path bookkeeping — `(deny file-read* (subpath "/Users/ashkie/src"))` +
 * `(deny file-write* ...)` + `(deny network*)`, `(allow default)` for everything else (so the
 * helper can still read the interpreter binaries, dynamic libraries, its own workspace files
 * etc.) The campaign dir and every game's `secrets/` live under `/Users/ashkie/src`, so the one
 * rule covers both "no engine source" and "no seat tokens" without hard-coding the campaign
 * path. The workspace itself is always OUTSIDE `/Users/ashkie/src` (`ensureOutsideRepo`), so it
 * is unaffected.
 *
 * CPU bound: every helper run goes through the shared heavy-work queue
 * (`lab/hard-ai/ladder/heavy.ts`, `MUJU_HEAVY_SLOTS=2` — never bypassed, never raised here) AND a
 * hard per-run CPU cap (`ulimit -t 60`, i.e. 60 CPU seconds, SIGXCPU on breach) applied inside the
 * sandboxed shell, `nice`d down. CPU seconds actually used are recorded to
 * `<gameDir>/player/helper-usage.jsonl` for the game's usage record.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireHeavySlot } from '../../lab/hard-ai/ladder/heavy';

/** Everything under here (including the campaign dir and every game's secrets/) is off limits to
 * a sandboxed helper. Kept as one constant so the deny rule and `ensureOutsideRepo`'s workspace
 * check (players.ts) can never silently drift apart. */
export const REPO_SRC_ROOT = '/Users/ashkie/src';
/** Hard per-helper-run CPU cap (ulimit -t is CPU seconds, not wall clock). */
export const HELPER_CPU_LIMIT_SECONDS = 60;
/** Ceiling on captured stdout/stderr so a runaway helper can't blow up the transcript/log. */
const OUTPUT_CAP_BYTES = 64 * 1024;

export function buildSandboxProfile(denySubpath: string = REPO_SRC_ROOT): string {
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    `(deny file-read* (subpath "${denySubpath}"))`,
    `(deny file-write* (subpath "${denySubpath}"))`,
  ].join('\n');
}

/** Writes a fresh sandbox profile to a private temp file and returns the full argv for
 * `sandbox-exec`: deny-profile -> `ulimit -t` inside a bash wrapper -> `nice` -> the real command.
 * Pure argv construction (no spawn), so it's unit-testable without actually running a process. */
export function buildSandboxedArgv(command: string, args: string[], opts: { cpuLimitSeconds?: number; denySubpath?: string } = {}): { bin: string; argv: string[]; profilePath: string } {
  const cpuLimitSeconds = opts.cpuLimitSeconds ?? HELPER_CPU_LIMIT_SECONDS;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'muju-helper-sandbox-'));
  const profilePath = path.join(dir, 'profile.sb');
  writeFileSync(profilePath, buildSandboxProfile(opts.denySubpath));
  return {
    bin: '/usr/bin/sandbox-exec',
    argv: ['-f', profilePath, '/usr/bin/time', '-l', 'bash', '-c',
      `ulimit -t ${cpuLimitSeconds}; exec nice -n 10 "$@"`, 'muju-helper', command, ...args],
    profilePath,
  };
}

/** Parses BSD `/usr/bin/time -l`'s trailer ("        0.02 real         0.01 user         0.00 sys")
 * for the CPU seconds actually spent (user + sys). Returns null if the line is missing/unparsable
 * (e.g. the process was killed by SIGXCPU before `time` could report). */
export function parseTimeCpuSeconds(timeOutput: string): number | null {
  const match = /([\d.]+)\s+user\s+([\d.]+)\s+sys/.exec(timeOutput);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]);
}

export interface HelperRunResult {
  command: string; args: string[]; exitCode: number | null; cpuSeconds: number | null;
  wallMs: number; stdout: string; stderr: string; timedOut: boolean;
}

function truncate(text: string): string {
  return text.length > OUTPUT_CAP_BYTES ? `${text.slice(0, OUTPUT_CAP_BYTES)}\n…[truncated]` : text;
}

/** Runs one helper command sandboxed (no repo read/write, no network), CPU-capped, and gated on
 * the shared heavy-work queue. `label` identifies the holder in `heavy.ts --status`
 * (`tool-builder-helper:<gameId>`). Every call is logged to `<gameDir>/player/helper-usage.jsonl`
 * regardless of outcome, so a killed/failed helper still shows up in the usage record. */
export async function runSandboxedHelper(command: string, args: string[], opts: { cwd: string; gameDir: string; label: string; wallTimeoutMs?: number }): Promise<HelperRunResult> {
  const release = await acquireHeavySlot(opts.label);
  const startedAt = Date.now();
  try {
    const { bin, argv } = buildSandboxedArgv(command, args);
    const result = await new Promise<HelperRunResult>(resolve => {
      const child = spawn(bin, argv, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', timedOut = false;
      const wallTimeoutMs = opts.wallTimeoutMs ?? (HELPER_CPU_LIMIT_SECONDS + 30) * 1000;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, wallTimeoutMs);
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('close', exitCode => {
        clearTimeout(timer);
        resolve({ command, args, exitCode, cpuSeconds: parseTimeCpuSeconds(stderr), wallMs: Date.now() - startedAt,
          stdout: truncate(stdout), stderr: truncate(stderr), timedOut });
      });
    });
    mkdirSync(path.join(opts.gameDir, 'player'), { recursive: true });
    appendFileSync(path.join(opts.gameDir, 'player', 'helper-usage.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), command: result.command, args: result.args,
        exitCode: result.exitCode, cpuSeconds: result.cpuSeconds, wallMs: result.wallMs, timedOut: result.timedOut })}\n`);
    return result;
  } finally {
    release();
  }
}

/** Sum of every recorded helper run's CPU seconds for a game (null entries — a run that never
 * reached `/usr/bin/time`'s trailer, e.g. killed by SIGXCPU/SIGKILL before exit — count as 0, not
 * "unknown", since the ceiling on their CPU use is still the enforced cap). Used to fold helper
 * CPU time into `player/usage.json`. */
export function sumHelperCpuSeconds(gameDir: string): { totalCpuSeconds: number; runs: number } {
  const p = path.join(gameDir, 'player', 'helper-usage.jsonl');
  if (!existsSync(p)) return { totalCpuSeconds: 0, runs: 0 };
  let total = 0, runs = 0;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const entry = JSON.parse(line) as { cpuSeconds?: number | null }; total += entry.cpuSeconds ?? 0; runs += 1; } catch { /* skip */ }
  }
  return { totalCpuSeconds: total, runs };
}
