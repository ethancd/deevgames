/**
 * `npm run hard:deps` (DESIGN §2). Two checks over `src/ai/hard/**`:
 *
 * 1. Layering: each module may only import the modules DESIGN §2 lists for
 *    its layer, plus a couple of named exceptions from outside `src/ai/hard/`
 *    (`src/game/*`, `src/ai/simulate.ts`), plus the two pure-vocabulary
 *    modules every layer may use (`src/ai/types.ts` for `AIAction`,
 *    `src/ai/runtime.ts` for `seededRandom`; see DEVIATIONS under M4).
 *    `src/ai/moves.ts` is also allowed
 *    from `verify/**` — a deviation from the literal §2 text, needed because
 *    the canonical perft enumerator (`src/ai/hard/verify/perft.ts`, M1) has
 *    no way to generate legal actions otherwise; see
 *    `docs/hard-ai/design/DEVIATIONS.md` under M1. `lab/solver/**`,
 *    `src/ai/engine-v2.ts`, `src/ai/planner/*`, `src/ai/search/*` and
 *    `src/ai/evaluation.ts` are banned everywhere under `src/ai/hard/**`,
 *    regardless of layer.
 * 2. Nondeterminism: `Date.now`, `performance.now`, `Math.random`, `crypto.`
 *    anywhere under `src/ai/hard/**` except `search/time.ts` and `engine.ts`;
 *    `BigInt` anywhere under `src/ai/hard/**`, no exceptions.
 *
 * Must pass cleanly (0 violations) on an empty or missing `src/ai/hard/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const HARD_ROOT = path.join(REPO_ROOT, 'src/ai/hard');

type Layer =
  | 'types'
  | 'config'
  | 'core'
  | 'tables'
  | 'gen'
  | 'tactics'
  | 'eval'
  | 'strategy'
  | 'search'
  | 'book'
  | 'verify'
  | 'engine';

interface Violation {
  kind: 'layering' | 'lab-solver-ban' | 'banned-module' | 'nondeterminism' | 'bigint';
  file: string;
  detail: string;
  line?: number;
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.d.ts')) out.push(full);
    }
  }
  return out.sort();
}

function layerOf(fileRelToHard: string): Layer | null {
  if (fileRelToHard === 'types.ts') return 'types';
  if (fileRelToHard === 'config.ts') return 'config';
  if (fileRelToHard === 'engine.ts') return 'engine';
  // STRATEGOS W1 (2026-09-24): `strategy/types.ts` is pure vocabulary (type
  // aliases and interfaces that import only `types.ts`), so every layer may
  // name its types the way every layer may name `types.ts`'s. The rest of
  // `strategy/` is its own layer, reachable only from `search` and `engine`.
  if (fileRelToHard === path.join('strategy', 'types.ts')) return 'types';
  const top = fileRelToHard.split(path.sep)[0];
  if (['core', 'tables', 'gen', 'tactics', 'eval', 'strategy', 'search', 'book', 'verify'].includes(top)) return top as Layer;
  return null; // e.g. a stray file directly under src/ai/hard/ that isn't types/config/engine
}

/** DESIGN §2's per-layer allow-list, as the set of OTHER src/ai/hard layers reachable. */
const LAYER_ALLOWS: Record<Layer, Layer[]> = {
  types: [],
  config: ['types'],
  core: ['types'],
  tables: ['core', 'types', 'config'],
  gen: ['core', 'tables', 'types', 'config'],
  tactics: ['core', 'tables', 'types', 'config'],
  eval: ['core', 'tables', 'types', 'config'],
  // STRATEGOS W1 (plan W1.3-W1.10): the clock ledger, the kill-ETA bound, the
  // clock reading and the Hold/ForceContact plans read the packed root and the
  // tables, build complete turn lines with `gen`, cross-check against
  // `tactics` and may score with `eval`. `gen` and `eval` never import
  // `strategy`: the root installs what it computes through setters
  // (`gen/generate.ts setStrategyWitness`, `eval/evaluate.ts setKillClockPolicy`).
  strategy: ['core', 'tables', 'gen', 'tactics', 'eval', 'types', 'config'],
  // DESIGN §2's table stops `search` at `eval`, but §4.16 puts `searchRoot`
  // — the must-answer layer — in `search/root.ts`, and §5.10 requires it to
  // replay its FORCED lines through the CANONICAL engine and to probe the
  // book before it searches. Those are `verify/replay.ts`, `book/probe.ts`
  // and `src/game/*`. The two rules cannot both hold, so the narrower one
  // wins: `search` may reach `verify` and `book` (neither of which imports
  // `search`, so no cycle) and, like them, `src/game` and `src/ai/simulate`.
  // See DEVIATIONS.md under M14.
  search: ['core', 'tables', 'gen', 'tactics', 'eval', 'strategy', 'verify', 'book', 'types', 'config'],
  book: ['core', 'gen', 'types', 'config'],
  verify: ['core', 'gen', 'types', 'config'],
  engine: ['core', 'tables', 'gen', 'tactics', 'eval', 'strategy', 'search', 'book', 'verify', 'types', 'config'],
};

/** Named exceptions outside src/ai/hard/, per layer. Keyed by the module's
 * repo-relative posix path (no extension). */
/** Pure-vocabulary modules outside `src/ai/hard/` that any layer may import.
 * `src/ai/types.ts` carries `AIAction`, which DESIGN §3.2/§4.13/§4.17 puts in
 * the signatures of `core/action.ts`, `gen/turn.ts`, `verify/replay.ts` and
 * `search/root.ts`; `src/ai/runtime.ts` carries `seededRandom`, the PRNG
 * DESIGN §3.3 names as the source of the Zobrist tables. Both are imported
 * type-only or as a pure function; neither reaches the banned engines. See
 * `docs/hard-ai/design/DEVIATIONS.md` under M4. */
const UNIVERSAL_EXTERNAL_ALLOWS = ['src/ai/types', 'src/ai/runtime'];

const EXTERNAL_ALLOWS: Partial<Record<Layer, string[]>> = {
  // `src/ai/simulate` is allowed from `core` only for DESIGN §3.4's
  // home-checkmate gate: at `proverMode = 2` `core/state.ts make` calls the
  // canonical `analyzeHomeDefense`, whose third parameter is a `Transition`
  // that only `src/ai/simulate.ts transitionWithoutCheckmate` provides. M10
  // replaces that call with the packed `tactics/prover.ts homeVerdict` and
  // this allowance goes away with it. See DEVIATIONS.md under M5.
  core: ['src/game', 'src/ai/simulate'],
  // `search/root.ts` replays its must-answer lines canonically (see the
  // `search` row of LAYER_ALLOWS).
  search: ['src/game', 'src/ai/simulate'],
  verify: ['src/game', 'src/ai/simulate', 'src/ai/moves'],
  engine: ['src/game', 'src/ai/simulate', 'src/ai/moves'],
};

/**
 * Per-FILE additions to `LAYER_ALLOWS`, keyed by the path relative to
 * `src/ai/hard/`. DESIGN §2's layer table says `core` imports only `types.ts`
 * and `src/game/*`, while DESIGN §3.4 requires `core/state.ts make` to call
 * the packed home-checkmate prover, which §2 itself places in `tactics/`. The
 * two cannot both hold, so the narrower rule wins: exactly `core/state.ts`
 * may reach `tactics` (and does so only for `tactics/prover.ts`, which imports
 * no `core/state.ts` symbol, so there is no module cycle). Every other `core`
 * file is still held to the §2 table. See DEVIATIONS.md under M10.
 */
const FILE_LAYER_ALLOWS: Record<string, Layer[]> = {
  'core/state.ts': ['tactics'],
};

const BANNED_EXTERNAL_PREFIXES = ['src/ai/engine-v2', 'src/ai/planner/', 'src/ai/search/', 'src/ai/evaluation', 'lab/solver/'];

const NONDETERMINISM_PATTERN = /Date\.now|performance\.now|Math\.random|crypto\./;
const NONDETERMINISM_EXEMPT = new Set(['search/time.ts', 'engine.ts']);
const BIGINT_PATTERN = /\bBigInt\b/;

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function collectImportSpecifiers(sourceText: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const specs: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

function resolveRelative(fromFile: string, specifier: string): string {
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return toPosix(path.relative(REPO_ROOT, resolved)).replace(/\.(ts|tsx|js|mjs)$/, '');
}

function checkLayering(files: string[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const rel = path.relative(HARD_ROOT, file);
    const layer = layerOf(rel);
    const text = fs.readFileSync(file, 'utf8');
    const specifiers = collectImportSpecifiers(text, file);
    for (const spec of specifiers) {
      if (!spec.startsWith('.')) continue; // bare/package specifier: always allowed
      const targetPosix = resolveRelative(file, spec);
      const targetRelToHard = targetPosix.startsWith('src/ai/hard/') ? targetPosix.slice('src/ai/hard/'.length) : null;

      if (BANNED_EXTERNAL_PREFIXES.some(p => targetPosix === p.replace(/\/$/, '') || targetPosix.startsWith(p))) {
        violations.push({ kind: 'banned-module', file: toPosix(path.relative(REPO_ROOT, file)), detail: `imports banned module "${targetPosix}"` });
        continue;
      }

      if (targetRelToHard !== null) {
        // Internal src/ai/hard/** import.
        const targetLayer = layerOf(targetRelToHard);
        if (layer === null || targetLayer === null) continue; // stray/unclassified file; not this check's concern
        if (targetLayer === layer) continue; // same-layer imports are always fine
        const allowed = [...(LAYER_ALLOWS[layer] ?? []), ...(FILE_LAYER_ALLOWS[toPosix(rel)] ?? [])];
        if (!allowed.includes(targetLayer)) {
          violations.push({
            kind: 'layering',
            file: toPosix(path.relative(REPO_ROOT, file)),
            detail: `layer "${layer}" may not import layer "${targetLayer}" (${targetPosix})`,
          });
        }
        continue;
      }

      // External (outside src/ai/hard/) relative import: must be in this layer's allow-list.
      if (layer === null) continue;
      const externalAllows = [...UNIVERSAL_EXTERNAL_ALLOWS, ...(EXTERNAL_ALLOWS[layer] ?? [])];
      const ok = externalAllows.some(prefix => targetPosix === prefix || targetPosix.startsWith(prefix + '/'));
      if (!ok) {
        violations.push({
          kind: 'layering',
          file: toPosix(path.relative(REPO_ROOT, file)),
          detail: `layer "${layer}" may not import external module "${targetPosix}"`,
        });
      }
    }
  }
  return violations;
}

function checkNondeterminismAndBigInt(files: string[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const rel = toPosix(path.relative(HARD_ROOT, file));
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    if (!NONDETERMINISM_EXEMPT.has(rel)) {
      for (let i = 0; i < lines.length; i++) {
        if (NONDETERMINISM_PATTERN.test(lines[i])) {
          violations.push({ kind: 'nondeterminism', file: toPosix(path.relative(REPO_ROOT, file)), detail: lines[i].trim(), line: i + 1 });
        }
      }
    }
    for (let i = 0; i < lines.length; i++) {
      if (BIGINT_PATTERN.test(lines[i])) {
        violations.push({ kind: 'bigint', file: toPosix(path.relative(REPO_ROOT, file)), detail: lines[i].trim(), line: i + 1 });
      }
    }
  }
  return violations;
}

function main(): void {
  const files = listFiles(HARD_ROOT);
  const violations = [...checkLayering(files), ...checkNondeterminismAndBigInt(files)];
  const result = {
    filesScanned: files.length,
    violations,
    layeringViolations: violations.filter(v => v.kind === 'layering' || v.kind === 'banned-module').length,
    nondeterminismViolations: violations.filter(v => v.kind === 'nondeterminism').length,
    bigintViolations: violations.filter(v => v.kind === 'bigint').length,
  };
  console.log(JSON.stringify(result));
  if (violations.length > 0) {
    for (const v of violations) console.error(`[hard:deps] ${v.kind}: ${v.file}${v.line ? ':' + v.line : ''} — ${v.detail}`);
    process.exitCode = 1;
  }
}

main();
