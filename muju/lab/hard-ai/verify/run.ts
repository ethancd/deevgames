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
 * Every other piece (e.g. `npm run hard:perft -- --check --out <path>`) is
 * run as given and is expected to merge its own numbers into `gate.artifact`
 * itself; after the whole chain finishes, that file (if present) is merged
 * into `metrics` too, so its fields overlay/complete the picture.
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
  // vitest steps: request the JSON reporter so results are parseable, without
  // changing the human-readable command string recorded in the artifact.
  const isVitest = /(^|\s)npx vitest run\b/.test(step);
  const shellCommand = isVitest ? `${step} --reporter=json` : step;
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

function extractVitestMetrics(stdout: string): Record<string, unknown> {
  try {
    // vitest's JSON reporter can print non-JSON progress lines before the
    // report; the report itself is the last top-level JSON object.
    const lines = stdout.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      const parsed = JSON.parse(line) as { numFailedTests?: number; numFailedTestSuites?: number };
      if (typeof parsed.numFailedTests === 'number') {
        return { vitestFailures: parsed.numFailedTests + (parsed.numFailedTestSuites ?? 0) };
      }
    }
  } catch {
    // fall through
  }
  return {};
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
    if (outcome.exitCode !== 0) failed = true;
  }

  const artifactPath = gate.artifact ? path.resolve(REPO_ROOT, gate.artifact) : null;
  if (artifactPath && fs.existsSync(artifactPath)) {
    try {
      Object.assign(metrics, JSON.parse(fs.readFileSync(artifactPath, 'utf8')));
    } catch {
      // leave metrics as gathered from stdout
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
