/**
 * `muju-suite-v1` — the test-suite container (DESIGN §7.5).
 *
 * ```
 * {"schema":"muju-suite-v1","name","version","cases":[
 *   {id, position:"<file>#<id>", best:[Kpos hex...], avoid:[...],
 *    budget:{work}, points, tags, rationale, authoredFrom}]}
 * ```
 *
 * A case passes when the engine's chosen turn ends on a position whose `Kpos`
 * is in `best` and not in `avoid`. End POSITIONS, never sequences: the initial
 * position alone has 14,959 action sequences over 797 end positions, so a
 * suite keyed on sequences would be scoring the generator's tie-breaking
 * rather than its judgement.
 *
 * Two shapes of key are in the tree already — `tactics`/`economy` were frozen
 * with a `0x` prefix, `home-mate`/`invariants`/`spawn-strike` without — and
 * two shapes of position reference, repo-relative (`lab/hard-ai/suites/x.jsonl`)
 * and bare (`tactics.jsonl`, resolved against `lab/hard-ai/positions/`).
 * `normalizeKey` and `resolvePositionRef` accept both, so a suite file is
 * never rewritten to suit the runner.
 *
 * `points: 0` marks a COVERAGE row: a position where no answer is better than
 * another (`home-mate`'s lost defences), kept so the engine is still required
 * to return a legal turn there. Such a row contributes to the case COUNT and
 * not to the point share, which is why DESIGN §7.5 sizes `home-mate` at 56
 * cases and M14's gate asserts `suite.homeMate === 56` — every case, scored or
 * coverage.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SUITE_SCHEMA = 'muju-suite-v1';

export interface SuiteCase {
  id: string;
  /** `<file>#<position id>`. */
  position: string;
  best: string[];
  avoid: string[];
  budget: { work: number };
  points: number;
  tags: string[];
  rationale?: string;
  authoredFrom?: string;
  /** `invariants` rows carry the SU §7 invariant they pin down. */
  invariant?: number;
  side?: string;
}

export interface Suite {
  schema: typeof SUITE_SCHEMA;
  name: string;
  version: number;
  cases: SuiteCase[];
}

export class SuiteFormatError extends Error {}

/** Lower-case, `0x`-free, 16 hex digits. */
export function normalizeKey(key: string): string {
  const raw = key.trim().toLowerCase();
  const body = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-f]{1,16}$/.test(body)) throw new SuiteFormatError(`normalizeKey: "${key}" is not a Kpos hex key`);
  return body.padStart(16, '0');
}

export function readSuite(file: string): Suite {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Suite;
  if (parsed.schema !== SUITE_SCHEMA) throw new SuiteFormatError(`${file}: schema "${parsed.schema}" is not ${SUITE_SCHEMA}`);
  if (!Array.isArray(parsed.cases)) throw new SuiteFormatError(`${file}: no cases array`);
  for (const c of parsed.cases) {
    if (typeof c.id !== 'string' || typeof c.position !== 'string') throw new SuiteFormatError(`${file}: malformed case ${JSON.stringify(c).slice(0, 120)}`);
    if (!Array.isArray(c.best) || !Array.isArray(c.avoid)) throw new SuiteFormatError(`${file}#${c.id}: best/avoid must be arrays`);
  }
  return parsed;
}

export function writeSuite(file: string, suite: Suite): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(suite, null, 1) + '\n');
}

export interface PositionRef {
  /** Absolute path of the `muju-position-v1` file. */
  file: string;
  id: string;
}

/**
 * Resolves `"<file>#<id>"`. A reference containing a `/` is repo-relative;
 * a bare file name is looked for next to the suite first and then in
 * `lab/hard-ai/positions/`.
 */
export function resolvePositionRef(ref: string, repoRoot: string, suitesDir: string, positionsDir: string): PositionRef {
  const hash = ref.lastIndexOf('#');
  if (hash < 0) throw new SuiteFormatError(`resolvePositionRef: "${ref}" has no #id`);
  const filePart = ref.slice(0, hash);
  const id = ref.slice(hash + 1);
  const candidates = filePart.includes('/')
    ? [path.resolve(repoRoot, filePart)]
    : [path.resolve(suitesDir, filePart), path.resolve(positionsDir, filePart)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { file: candidate, id };
  }
  throw new SuiteFormatError(`resolvePositionRef: none of ${candidates.join(', ')} exists (from "${ref}")`);
}

/** DESIGN §7.5's scoring rule, on already-normalised keys. */
export function caseVerdict(c: SuiteCase, endKey: string): boolean {
  const key = normalizeKey(endKey);
  for (const bad of c.avoid) if (normalizeKey(bad) === key) return false;
  if (c.best.length === 0) return true;
  for (const good of c.best) if (normalizeKey(good) === key) return true;
  return false;
}

/** `spawn-strike` -> `spawnStrike`; the metric name M14's gate reads. */
export function metricName(suiteName: string): string {
  return suiteName.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}
