/**
 * `npm run hard:deps` (DESIGN §2). Two checks over `src/ai/hard/**`:
 *
 * 1. Layering: each module may only import the modules DESIGN §2 lists for
 *    its layer, plus a couple of named exceptions from outside `src/ai/hard/`
 *    (`src/game/*`, `src/ai/simulate.ts`). `src/ai/moves.ts` is also allowed
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
  const top = fileRelToHard.split(path.sep)[0];
  if (['core', 'tables', 'gen', 'tactics', 'eval', 'search', 'book', 'verify'].includes(top)) return top as Layer;
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
  search: ['core', 'tables', 'gen', 'tactics', 'eval', 'types', 'config'],
  book: ['core', 'gen', 'types', 'config'],
  verify: ['core', 'gen', 'types', 'config'],
  engine: ['core', 'tables', 'gen', 'tactics', 'eval', 'search', 'book', 'verify', 'types', 'config'],
};

/** Named exceptions outside src/ai/hard/, per layer. Keyed by the module's
 * repo-relative posix path (no extension). */
const EXTERNAL_ALLOWS: Partial<Record<Layer, string[]>> = {
  core: ['src/game'],
  verify: ['src/game', 'src/ai/simulate', 'src/ai/moves'],
  engine: ['src/game', 'src/ai/simulate', 'src/ai/moves'],
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
        const allowed = LAYER_ALLOWS[layer] ?? [];
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
      const externalAllows = EXTERNAL_ALLOWS[layer] ?? [];
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
