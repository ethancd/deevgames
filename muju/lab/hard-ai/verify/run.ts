/**
 * `npm run hard:verify -- --gate M<n> | --all` (DESIGN §7.1).
 *
 * For a single gate: runs `gate.command` (a `&&`-chained shell recipe, run
 * verbatim from `muju/`), reads `gate.artifact` (the JSON the recipe's
 * data-producing step wrote), applies `gate.criterion`, and writes the
 * envelope `{gate, pass, command, criterion, metrics, git, wasmSha256, node,
 * device, elapsedMs, at}` to `lab/results/hard-ai-verify-<YYYY-MM-DD>/M<n>.json`.
 * Prints one line and exits 1 on failure.
 *
 * `gate.command` is executed piece by piece (split on ` && `, short-circuiting
 * on the first non-zero exit, matching shell `&&` semantics) rather than
 * handed to a shell verbatim, because two well-known tool shapes need their
 * output turned into metrics the criterion can read even though the command
 * string itself does not redirect them to a file:
 *   - `npm run hard:deps` (no args): stdout is the JSON `deps.ts` prints;
 *     `metrics.depsViolations` is its `violations.length`.
 *   - `npx vitest run ...`: run with `--reporter=json` appended (transparently
 *     — the recorded `command` in the artifact stays the literal, readable
 *     string) so `metrics.vitestFailures` can be read from the JSON report's
 *     `numFailedTests`.
 *   - `npx tsc --noEmit ...` / `npm run hard:types`: `metrics.tscErrors`
 *     accumulates the `error TSxxxx` diagnostics across every typecheck step
 *     in the chain (a non-zero exit with no parseable diagnostic counts as 1).
 * Every other piece (e.g. `npm run hard:perft -- --check --out <path>`) is
 * run as given and is expected to merge its own numbers into `gate.artifact`
 * itself; after the whole chain finishes, that file (if present) is merged
 * into `metrics` too, so its fields overlay/complete the picture.
 *
 * `gate.artifact` may name SEVERAL files, comma-separated, and each may carry a
 * `key=` prefix that nests it (`determinism=lab/results/.../M14-det.json`). A
 * chain whose steps each write their own artifact — M14 runs four of them — is
 * then read into one envelope with no gate-specific code here, and its
 * criterion reads `metrics.determinism.identical`, `metrics.bench.*` and so on.
 * A bare path still merges flat, which is what every M1-M13 row does.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { GATES, type Gate } from './gates';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function wasmSha256(): string | null {
  const wasmPath = path.join(REPO_ROOT, 'src/ai/wasm/tactics.wasm');
  if (!fs.existsSync(wasmPath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex');
}

function device(): string {
  const cpus = os.cpus();
  return `${cpus[0]?.model ?? 'unknown-cpu'} x${cpus.length} (${os.platform()}/${os.arch()})`;
}

/** Splits a `&&`-joined shell recipe into its literal steps. Steps are plain
 * commands (no further shell metacharacters expected in this gate table). */
function splitChain(command: string): string[] {
  return command.split(/\s+&&\s+/).map(s => s.trim()).filter(s => s.length > 0);
}

interface StepOutcome {
  step: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runStep(step: string): StepOutcome {
  // vitest/playwright steps: request the JSON reporter so results are
  // parseable, without changing the human-readable command string recorded
  // in the artifact.
  const isVitest = /(^|\s)npx vitest run\b/.test(step);
  const isPlaywright = /(^|\s)npx playwright test\b/.test(step);
  const shellCommand = isVitest || isPlaywright ? `${step} --reporter=json` : step;
  try {
    const stdout = execFileSync('/bin/sh', ['-c', shellCommand], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { step, exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string; message: string };
    return { step, exitCode: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? e.message };
  }
}

function extractDepsMetrics(stdout: string): Record<string, unknown> {
  try {
    const lastLine = stdout.trim().split('\n').filter(Boolean).pop();
    if (!lastLine) return {};
    const parsed = JSON.parse(lastLine) as { violations?: unknown[] };
    return Array.isArray(parsed.violations) ? { depsViolations: parsed.violations.length } : {};
  } catch {
    return {};
  }
}

/** Counts `error TSxxxx` diagnostics a `tsc --noEmit` step printed. A step that
 * exited non-zero without a parseable diagnostic still counts as one error, so
 * a criterion of `tscErrors === 0` can never pass on a broken typecheck. */
function countTscErrors(outcome: StepOutcome): number {
  const text = `${outcome.stdout}\n${outcome.stderr}`;
  const matches = text.match(/error TS\d+/g);
  const parsed = matches === null ? 0 : matches.length;
  if (parsed === 0 && outcome.exitCode !== 0) return 1;
  return parsed;
}

/**
 * Finds a test runner's JSON report in a step's stdout and reads one metric
 * off it. Both shapes a runner can emit are handled, because the two runners
 * this file parses disagree:
 *   - the whole report on ONE line (vitest's JSON reporter), possibly after
 *     non-JSON progress lines;
 *   - a PRETTY-PRINTED report (Playwright's JSON reporter indents by 2), whose
 *     opening `{` sits alone at column 0 and whose body runs to the end of the
 *     stream. A line-at-a-time scan can never parse this one — every candidate
 *     line is an unbalanced fragment — which is why `e2eFailures` was silently
 *     absent from M3's envelope even on a fully green Playwright run, failing
 *     the criterion's `e2eFailures === 0` clause on a passing suite.
 * Candidates are tried last-to-first, so trailing output wins, and `pick`
 * rejects anything that parses but is not the report (a nested fragment that
 * happens to be valid JSON), letting the scan continue.
 */
function readReport<T>(stdout: string, pick: (report: Record<string, unknown>) => T | undefined): T | undefined {
  const lines = stdout.split('\n');
  const attempt = (text: string): T | undefined => {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
      return pick(parsed as Record<string, unknown>);
    } catch {
      return undefined;
    }
  };
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    if (line.endsWith('}')) {
      const found = attempt(line);
      if (found !== undefined) return found;
    }
    // A pretty-printed report opens at column 0 and closes on the matching
    // `}` at column 0 — usually the end of the stream, but a server the runner
    // shut down afterwards can still print past it, so every column-0 `}` from
    // the last one backwards is tried as the closing brace.
    if (raw.startsWith('{')) {
      for (let j = lines.length - 1; j > i; j--) {
        if (!lines[j].startsWith('}')) continue;
        const found = attempt(lines.slice(i, j + 1).join('\n'));
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

function extractVitestMetrics(stdout: string): Record<string, unknown> {
  const failures = readReport(stdout, report => {
    const { numFailedTests, numFailedTestSuites } = report as { numFailedTests?: number; numFailedTestSuites?: number };
    if (typeof numFailedTests !== 'number') return undefined;
    return numFailedTests + (numFailedTestSuites ?? 0);
  });
  return failures === undefined ? {} : { vitestFailures: failures };
}

/** M3+: a step matching `npx playwright test` (any config/args) gets
 * `metrics.e2eFailures` from `stats.unexpected` of Playwright's JSON reporter
 * report. */
function extractPlaywrightMetrics(stdout: string): Record<string, unknown> {
  const unexpected = readReport(stdout, report => {
    const stats = (report as { stats?: { unexpected?: number } }).stats;
    return typeof stats?.unexpected === 'number' ? stats.unexpected : undefined;
  });
  return unexpected === undefined ? {} : { e2eFailures: unexpected };
}

function runGate(gate: Gate): { pass: boolean; metrics: Record<string, unknown>; steps: StepOutcome[] } {
  const steps = splitChain(gate.command);
  const metrics: Record<string, unknown> = {};
  const outcomes: StepOutcome[] = [];
  let failed = false;

  for (const step of steps) {
    if (failed) break;
    const outcome = runStep(step);
    outcomes.push(outcome);
    process.stdout.write(outcome.stdout);
    if (outcome.stderr) process.stderr.write(outcome.stderr);
    if (/(^|\s)npm run hard:deps\b/.test(step)) Object.assign(metrics, extractDepsMetrics(outcome.stdout));
    if (/(^|\s)npx vitest run\b/.test(step)) Object.assign(metrics, extractVitestMetrics(outcome.stdout));
    if (/(^|\s)npx playwright test\b/.test(step)) Object.assign(metrics, extractPlaywrightMetrics(outcome.stdout));
    // Both `npx tsc --noEmit -p ...` and `npm run hard:types` (which is a tsc
    // invocation) contribute to a single accumulated `tscErrors`.
    if (/(^|\s)npx tsc\b/.test(step) || /(^|\s)npm run hard:types\b/.test(step)) {
      metrics.tscErrors = ((metrics.tscErrors as number | undefined) ?? 0) + countTscErrors(outcome);
    }
    if (outcome.exitCode !== 0) failed = true;
  }

  // The artifact is merged ONLY when the whole chain ran. A chain that
  // short-circuited never reached its artifact-producing step, so any file
  // still at that path belongs to a PREVIOUS run: merging it stamps a red
  // gate's envelope with numbers that were never measured for it (M3's first
  // red envelope carried a five-hour-old ladder's `games`/`elo`/`meanTurnMs`
  // and read as though it had fresh evidence). `pass` was never at risk — it
  // is guarded by `!failed` below — but the record must not mislead either.
  // When the merge does happen, `artifactAt` carries the file's own mtime so
  // any staleness is visible next to the envelope's `at`.
  if (!failed && gate.artifact) {
    for (const spec of gate.artifact.split(',').map(s => s.trim()).filter(Boolean)) {
      const eq = spec.indexOf('=');
      const key = eq < 0 ? null : spec.slice(0, eq);
      const artifactPath = path.resolve(REPO_ROOT, eq < 0 ? spec : spec.slice(eq + 1));
      if (!fs.existsSync(artifactPath)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as Record<string, unknown>;
        if (key === null) Object.assign(metrics, parsed);
        else metrics[key] = parsed;
        metrics.artifactAt = fs.statSync(artifactPath).mtime.toISOString();
      } catch {
        // malformed artifact; leave metrics as gathered from stdout
      }
    }
  }

  let pass = false;
  if (!failed) {
    try {
      pass = gate.criterion(metrics);
    } catch {
      pass = false;
    }
  }
  return { pass, metrics, steps: outcomes };
}

function writeResult(gate: Gate, pass: boolean, metrics: Record<string, unknown>, elapsedMs: number): string {
  const dir = path.join(REPO_ROOT, `lab/results/hard-ai-verify-${today()}`);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${gate.id}.json`);
  const envelope = {
    gate: gate.id,
    pass,
    command: gate.command,
    criterion: gate.description,
    metrics,
    git: gitRevision(),
    wasmSha256: wasmSha256(),
    node: process.version,
    device: device(),
    elapsedMs,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(outPath, JSON.stringify(envelope, null, 2) + '\n');
  return outPath;
}

function runOne(id: string): boolean {
  const gate = GATES.find(g => g.id === id);
  if (!gate) throw new Error(`hard:verify: unknown gate "${id}"`);
  const start = Date.now();
  const { pass, metrics } = runGate(gate);
  const elapsedMs = Date.now() - start;
  const outPath = writeResult(gate, pass, metrics, elapsedMs);
  console.log(`${gate.id}: ${pass ? 'PASS' : 'FAIL'} (${elapsedMs}ms) -> ${path.relative(REPO_ROOT, outPath)}`);
  return pass;
}

/** Topological order over `dependsOn`; throws on a cycle (should never happen — the table is hand-authored). */
function dagOrder(gates: Gate[]): Gate[] {
  const byId = new Map(gates.map(g => [g.id, g]));
  const visited = new Set<string>();
  const order: Gate[] = [];
  const visit = (id: string, stack: string[]): void => {
    if (visited.has(id)) return;
    if (stack.includes(id)) throw new Error(`hard:verify: dependency cycle: ${[...stack, id].join(' -> ')}`);
    const gate = byId.get(id);
    if (!gate) throw new Error(`hard:verify: unknown dependency "${id}"`);
    for (const dep of gate.dependsOn) visit(dep, [...stack, id]);
    visited.add(id);
    order.push(gate);
  };
  for (const g of gates) visit(g.id, []);
  return order;
}

function main(): void {
  const argv = process.argv.slice(2);
  const gateIndex = argv.indexOf('--gate');
  const all = argv.includes('--all');

  if (gateIndex !== -1) {
    const id = argv[gateIndex + 1];
    if (!id) throw new Error('hard:verify: --gate requires an id, e.g. --gate M1');
    const pass = runOne(id);
    process.exitCode = pass ? 0 : 1;
    return;
  }

  if (all) {
    for (const gate of dagOrder(GATES)) {
      const pass = runOne(gate.id);
      if (!pass) {
        process.exitCode = 1;
        return;
      }
    }
    process.exitCode = 0;
    return;
  }

  throw new Error('hard:verify: pass --gate M<n> or --all');
}

main();
