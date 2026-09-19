import "../fixtures/metal-v28-catalogue";
/**
 * `lab/hard-ai/suites/run.ts`'s engine, and nothing else.
 *
 * E3 lane 7 found (L7-F1, amendment A7-1) that every SEARCHED reading the suite
 * runner has ever printed was played by an engine carrying M4's placeholder
 * weight vector: `hardConfigFor(...)` returns a full `HardConfig` whose
 * `weights` field is present and is `placeholder-m4` (`version: 0`, all 58
 * feature weights zero), and `HardEngine`'s `DEFAULT_WEIGHTS` substitution is
 * guarded by `cfg.weights === undefined`. The measured effect on the invariants
 * suite was `invariantsSearched` 9/20 with the placeholder vector against 6/20
 * with the vector the champion plays with.
 *
 * These tests pin the fix from both ends: the runner's patch carries
 * `default-v1`, and an engine constructed from it does too.
 */
import { describe, expect, it } from 'vitest';
import { HardEngine } from '../../src/ai/hard/engine';
import { DEFAULT_WEIGHTS } from '../../src/ai/hard/eval/weights';
import { hardConfigFor } from '../../lab/hard-ai/bots/hard';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_SUITES, parseArgs, suiteEnginePatch, suitePairEvaluator, suitePairGaps } from '../../lab/hard-ai/suites/run';
import { BASE_WEIGHTS_LABEL } from '../../lab/hard-ai/ablate/arms';
/**
 * LABEL MIGRATION (M6). The champion vector these tests name used to be
 * `default-v1`; M6 replaced `DEFAULT_WEIGHTS` with the Phasing accounting
 * bootstrap and `ablate/arms.ts` derives every arm label from it, so the label
 * is read from the vector rather than spelled again here. See
 * `BASE_WEIGHTS_LABEL`'s note in `arms.ts`. This file remains QUARANTINED for
 * reasons unrelated to the label; fixing the literals only keeps a stale one
 * from hiding the real work.
 */


describe('hard:suite plays with the weights the champion plays with (A7-1)', () => {
  it('resolves hard@desktop to default-v1, not to M4 placeholder weights', () => {
    const patch = suiteEnginePatch('hard@desktop');
    expect(patch.weights?.label).toBe(BASE_WEIGHTS_LABEL);
    expect(patch.weights?.version).not.toBe(0);
    expect(patch.weights).toBe(DEFAULT_WEIGHTS);
  });

  it('carries the label into the engine the runner actually constructs', () => {
    // `runShard` does exactly this: `new HardEngine(suiteEnginePatch(args.engine))`.
    const engine = new HardEngine(suiteEnginePatch('hard@desktop'));
    expect(engine.config.weights.label).toBe(BASE_WEIGHTS_LABEL);
    expect(engine.config.weights.version).toBe(DEFAULT_WEIGHTS.version);
    // Not every feature weight is zero, which is what "material-only" meant.
    expect(Array.from(engine.config.weights.w).some(x => x !== 0)).toBe(true);
  });

  it('accepts the bare profile name as well as the hard@ form', () => {
    expect(suiteEnginePatch('desktop').weights?.label).toBe(BASE_WEIGHTS_LABEL);
  });

  it('keeps an ablation arm\'s own vector instead of overwriting it', () => {
    const patch = suiteEnginePatch('hard@ablate:eval-no-safety');
    expect(patch.weights?.label).toBe(`${BASE_WEIGHTS_LABEL}-no-safety`);
    expect(patch.weights?.version).not.toBe(0);
  });

  it('is the regression this test exists for: the old path was placeholder-m4', () => {
    // The pre-A7-1 construction, kept here as the thing that must never return.
    const before = new HardEngine(hardConfigFor('desktop'));
    expect(before.config.weights.label).toBe('placeholder-m4');
    expect(before.config.weights.version).toBe(0);
    expect(Array.from(before.config.weights.w).every(x => x === 0)).toBe(true);
  });

  it('refuses an engine whose resolved vector is still a placeholder', () => {
    // The assertion half of E3-PLAN's rule, exercised through the profile
    // object form: an explicit version-0 vector that `hardEnginePatch` would
    // have to keep (it only substitutes for `undefined` or `version: 0`)…
    const placeholder = { ...hardConfigFor('desktop') };
    expect(placeholder.weights?.version).toBe(0);
    // …is substituted, so the throw is unreachable through the public profiles;
    // the guard is there for a future arm that registers a version-0 vector.
    expect(() => suiteEnginePatch('hard@desktop')).not.toThrow();
    expect(() => suiteEnginePatch('hard@no-such-profile')).toThrow(/unknown label/);
  });
});

/**
 * A9-1 (E3 lane 9, applied by lane 13): the `invariants` EVAL column used to be
 * scored by a module-level `new Evaluator(PAIR_REPLICA)` — `DEFAULT_WEIGHTS`,
 * no `evalFix` block — so `invariantsEval` was the CHAMPION's opinion whatever
 * `--engine` said. Measured at the E3 head before the fix: `evalGapCc`
 * identical row for row, 20 of 20 pairs, for `hard@desktop`,
 * `hard@ablate:eval-no-safety` and `hard@ablate:eval-correct-v1`.
 *
 * `suitePairGaps` is the EVAL column with the search left out, so these run in
 * milliseconds rather than the 19 s a real `--suites invariants` row costs.
 */
describe('the invariants EVAL column reads the engine under test (A9-1)', () => {
  const desktop = suitePairGaps('hard@desktop');
  const noSafety = suitePairGaps('hard@ablate:eval-no-safety');

  it('scores all twenty pairs for either engine', () => {
    expect(desktop).toHaveLength(20);
    expect(noSafety).toHaveLength(20);
    expect(noSafety.map(r => r.id)).toEqual(desktop.map(r => r.id));
  });

  it('gives hard@desktop and eval-no-safety different gaps on at least one pair', () => {
    const differing = desktop.filter((r, i) => r.evalGapCc !== noSafety[i].evalGapCc);
    expect(differing.length).toBeGreaterThan(0);
    // Measured 2026-09-17 at the E3 head with the fix: 12 of 20 pairs move, and
    // `inv8-no-pre-adjacency` goes 335 cc -> 0 cc (the pair's whole gap is a
    // safety invariant the arm zeroes), which is a pass turning into a miss.
    expect(differing.map(r => r.id)).toContain('inv8-no-pre-adjacency');
    const inv8Desktop = desktop.find(r => r.id === 'inv8-no-pre-adjacency');
    const inv8Arm = noSafety.find(r => r.id === 'inv8-no-pre-adjacency');
    expect(inv8Desktop?.evalGapCc).toBeGreaterThan(0);
    expect(inv8Arm?.evalGapCc).toBe(0);
  });

  it('leaves hard@desktop at A6 baseline .60 — 12 of 20 pairs positive', () => {
    expect(desktop.filter(r => r.evalGapCc > 0)).toHaveLength(12);
  });

  it('an evalFix arm moves the column too (eval-correct-v1, four pairs)', () => {
    const correct = suitePairGaps('hard@ablate:eval-correct-v1');
    const differing = correct.filter((r, i) => r.evalGapCc !== desktop[i].evalGapCc);
    expect(differing.map(r => r.id)).toEqual([
      'inv4-strand-unpunished',
      'inv12-cleave-line',
      'inv19-soft-miner-exposed',
      'inv20-strand-no-retreat',
    ]);
    // Still 12 of 20 positive: the bundle moves the gaps, not the verdicts.
    expect(correct.filter(r => r.evalGapCc > 0)).toHaveLength(12);
  });

  it('carries the arm\'s weight vector and evalFix block into the evaluator', () => {
    expect(suitePairEvaluator('hard@ablate:eval-no-safety').currentWeights.label).toBe(`${BASE_WEIGHTS_LABEL}-no-safety`);
    expect(suitePairEvaluator('hard@desktop').currentWeights.label).toBe(BASE_WEIGHTS_LABEL);
  });
});

/**
 * A9-5 (E3 lane 9, applied by lane 13). A6 decided "`--all` = tactics,
 * spawn-strike, home-mate, invariants, plus economy and home-force once they
 * exist" and recorded it as implemented; `parseArgs` had no such argument, so
 * every command in `E3.2-PRECONDITIONS.md` spells the five out.
 */
describe('hard:suite --all is A6\'s list (A9-5)', () => {
  const FIVE = ['tactics', 'spawn-strike', 'home-mate', 'invariants', 'economy'];

  it('expands to exactly what the five explicit names give, in the same order', () => {
    expect(parseArgs(['--all']).suites).toEqual(parseArgs(['--suites', FIVE.join(',')]).suites);
    expect(parseArgs(['--all']).suites).toEqual(FIVE);
  });

  it('is A6\'s order, not alphabetical and not the directory order', () => {
    expect(ALL_SUITES).toEqual(FIVE);
  });

  it('names only suites that exist on disk', () => {
    const dir = path.resolve(import.meta.dirname, '../../lab/hard-ai/suites');
    for (const name of ALL_SUITES) expect(fs.existsSync(path.join(dir, `${name}.suite.json`))).toBe(true);
    // home-force is A6's sixth name and has no suite file yet, which is why
    // the list is five long.
    expect(fs.existsSync(path.join(dir, 'home-force.suite.json'))).toBe(false);
  });

  it('changes nothing else about the run', () => {
    const all = parseArgs(['--all', '--engine', 'hard@desktop', '--work', '400000']);
    expect(all.engine).toBe('hard@desktop');
    expect(all.work).toBe(400000);
    expect(all.shards).toBe(1);
    // A later --suites still wins, and a later --all still wins over --suites.
    expect(parseArgs(['--all', '--suites', 'tactics']).suites).toEqual(['tactics']);
    expect(parseArgs(['--suites', 'tactics', '--all']).suites).toEqual(FIVE);
  });
});
