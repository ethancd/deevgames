// Machine verification for content packs: checks that run a solver/simulator
// against each content item and report pass/fail with a human-readable
// reason. RECONSTRUCTED from the dossier's description of LUMENGRID (the
// original artifact is not in this repo — see README's provenance map) rather
// than copied from a source file, unlike schema.ts/csv.ts.
//
// House rule, non-negotiable: every stochastic check requires EXPLICIT seeds
// passed into its own config at construction time. There is no ambient
// Math.random anywhere in this module. A combinator built with zero seeds
// throws immediately when you call it — a "loud configuration error at
// definition time", not a check that silently reports ok:true because it had
// nothing to iterate over.

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** Tiny local mulberry32 — deliberately self-contained (no dependency on
 * @deev/core) since @deev/content's only declared dependency is zod. Callers
 * who want a richer Rng (pick/shuffle/fork/...) can pass their own rngFactory
 * into runVerifier instead of relying on this default. */
export function mulberry32(seed: number): Rng {
  let s = seed | 0;

  const rng: Rng = {
    next(): number {
      s = (s + 0x6d2b79f5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new Error(`mulberry32.int: maxExclusive must be a positive integer, got ${maxExclusive}`);
      }
      return Math.floor(rng.next() * maxExclusive);
    },
  };
  return rng;
}

export interface VerifierContext {
  seeds: number[];
  rng(seed: number): Rng;
}

export type CheckResult = { ok: true } | { ok: false; detail: string };

export interface Check<T> {
  name: string;
  run(item: T, ctx: VerifierContext): CheckResult;
}

export interface Verifier<T> {
  name: string;
  checks: Array<Check<T>>;
}

export interface DefineVerifierOptions<T> {
  name: string;
  checks: Array<Check<T>>;
}

export function defineVerifier<T>(opts: DefineVerifierOptions<T>): Verifier<T> {
  if (opts.checks.length === 0) {
    throw new Error(`defineVerifier(${JSON.stringify(opts.name)}): at least one check is required`);
  }
  return { name: opts.name, checks: opts.checks };
}

function requireSeeds(seeds: number[] | undefined, comboName: string): number[] {
  if (!seeds || seeds.length === 0) {
    throw new Error(
      `${comboName}: requires at least one explicit seed in its config. This is a configuration error, ` +
        'raised at definition time (not run time) so an unseeded stochastic check can never silently pass.',
    );
  }
  return seeds;
}

/** A check that an item is solvable: `solver(item, seed)` must return true
 * for every seed given. Seeds are mandatory and validated eagerly. */
export function solvable<T>(opts: { solver(item: T, seed: number): boolean; seeds: number[] }): Check<T> {
  const seeds = requireSeeds(opts.seeds, 'solvable');
  return {
    name: 'solvable',
    run(item: T): CheckResult {
      for (const seed of seeds) {
        if (!opts.solver(item, seed)) {
          return { ok: false, detail: `unsolvable at seed ${seed}` };
        }
      }
      return { ok: true };
    },
  };
}

/** A check that an item is NOT already solved before play begins — catches
 * puzzle/level content that ships in a trivially-won state. Deterministic:
 * no seeds needed. */
export function notPreSolved<T>(opts: { isSolved(item: T): boolean }): Check<T> {
  return {
    name: 'notPreSolved',
    run(item: T): CheckResult {
      if (opts.isSolved(item)) {
        return { ok: false, detail: 'item is already solved before play begins' };
      }
      return { ok: true };
    },
  };
}

/** A check that an item survives simulated play: `simulate(item, seed)` must
 * return true (survived) for every seed given. Seeds are mandatory and
 * validated eagerly, same as `solvable`. */
export function survivable<T>(opts: { simulate(item: T, seed: number): boolean; seeds: number[] }): Check<T> {
  const seeds = requireSeeds(opts.seeds, 'survivable');
  return {
    name: 'survivable',
    run(item: T): CheckResult {
      for (const seed of seeds) {
        if (!opts.simulate(item, seed)) {
          return { ok: false, detail: `not survivable at seed ${seed}` };
        }
      }
      return { ok: true };
    },
  };
}

export interface VerifierFailure {
  item: string;
  check: string;
  detail: string;
}

export interface VerifierResult {
  pass: boolean;
  failures: VerifierFailure[];
}

export interface RunVerifierOptions<T> {
  itemName(item: T): string;
  /** Default seed pool exposed to checks via ctx.seeds — for hand-written
   * checks that don't go through a combinator. Combinators built via
   * solvable/survivable ignore this and use their own captured seeds. */
  seeds?: number[];
  /** Rng factory exposed to checks via ctx.rng. Defaults to the local
   * mulberry32 above. */
  rngFactory?(seed: number): Rng;
}

export function runVerifier<T>(verifier: Verifier<T>, items: T[], opts: RunVerifierOptions<T>): VerifierResult {
  const ctx: VerifierContext = {
    seeds: opts.seeds ?? [],
    rng: opts.rngFactory ?? mulberry32,
  };

  const failures: VerifierFailure[] = [];

  for (const item of items) {
    const itemLabel = opts.itemName(item);
    for (const check of verifier.checks) {
      const result = check.run(item, ctx);
      if (!result.ok) {
        failures.push({ item: itemLabel, check: check.name, detail: result.detail });
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

/** Plain-text pass/fail report, one line per failure, for CLI use. */
export function formatVerifierReport(result: VerifierResult): string {
  if (result.pass) {
    return 'PASS — all items verified clean.';
  }
  const lines = [`FAIL — ${result.failures.length} issue(s):`];
  for (const failure of result.failures) {
    lines.push(`  ${failure.item} :: ${failure.check} — ${failure.detail}`);
  }
  return lines.join('\n');
}

/** Sugar for test assertions: `expect(verifierIssues(v, items, opts)).toEqual([])`. */
export function verifierIssues<T>(verifier: Verifier<T>, items: T[], opts: RunVerifierOptions<T>): string[] {
  const result = runVerifier(verifier, items, opts);
  return result.failures.map((f) => `${f.item}: ${f.check} — ${f.detail}`);
}
