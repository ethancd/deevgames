// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ARMS,
  ARM_HASH_WORK,
  BASE_WEIGHTS_LABEL,
  ablationConfigFor,
  armEngineName,
  armHardConfig,
  armLadderSeed,
  armNames,
  factorsOf,
  findArm,
  maskFactor,
  requireArm,
  searchFixKey,
} from '../../lab/hard-ai/ablate/arms';
import {
  LADDER_OPENINGS,
  LADDER_PAIRS_PER_HANDICAP,
  SELECTIVE_REFERENCE_LABEL,
  comparisonRow,
  formatComparison,
  type ComparisonRow,
  ladderCommand,
  ladderPlan,
  parseArgs,
  rulesFromOptions,
  runArm,
  type AblateArgs,
  type ArmRun,
} from '../../lab/hard-ai/ablate/run';
import { canonicalJson, resolvedConfig, resolvedConfigHash, type ResolvedHardConfig } from '../../lab/hard-ai/ladder/identity';
import { resolveEngine, parseWorkSpec } from '../../lab/hard-ai/ladder/engines';
import { hardConfigFor, hardEnginePatch } from '../../lab/hard-ai/bots/hard';
import { recallEnginePatch } from '../../lab/hard-ai/recall/run';
import { DESKTOP } from '../../src/ai/hard/config';
import { HardEngine } from '../../src/ai/hard/engine';
import { DEFAULT_WEIGHTS, WEIGHTS_VERSION, weightsHash } from '../../src/ai/hard/eval/weights';
import { F, FEATURE_COUNT } from '../../src/ai/hard/eval/features';
import { EVAL_GROUPS, INVARIANT_FEATURES, STAGE2_FEATURES } from '../../lab/hard-ai/audit/eval-groups';
import { WORK_LADDER, WORK_LADDER_FINE, chooseWork } from '../../src/ai/hard/search/time';
import { DEFAULT_MATCH_OPTIONS, type MatchOptions } from '../../lab/harness/types';
import type { GameState } from '../../src/game/types';
import type { ReleaseSlot } from '../../lab/hard-ai/ladder/heavy';
import { BOOTSTRAP_M6_NONZERO, HAND_PRIORS_NONZERO, sparseWeights } from '../ai/hard/fixtures/hand-priors-nonzero';

/**
 * E1.3 "Controlled ablations" (EPIC-PLAN §4 E1.3, §5 campaign 3). Three things
 * are pinned here:
 *
 * 1. ONE FACTOR PER ARM. E1.3's acceptance evidence is literally "one factor
 *    changes per arm; full configurations recorded", so every arm is checked
 *    both ways — the four named knobs differ in exactly one place, AND masking
 *    that knob back to `base`'s value makes the WHOLE resolved configuration
 *    identical to `base`'s. The second check is what catches an arm that also
 *    moved something the four knobs do not name.
 * 2. `hard@desktop` IS UNTOUCHED. `bots/hard.ts` grew an `ablate:<arm>` branch;
 *    the literal hash below is the one a recorded E1.1 run already carries, so
 *    a drift here invalidates evidence that exists on disk.
 * 3. THE RUNNER'S TABLE, on a stubbed recall artifact — no search, no child
 *    process, no heavy slot.
 */

const BASE = armHardConfig('base');

/** E3.1 lane 5's weight-group arms, in registry order. */
const WEIGHT_ARMS = [
  'eval-no-economy',
  'eval-no-home',
  'eval-no-safety',
  'eval-no-space',
  'eval-no-invariants',
  'eval-stage01',
] as const;

/** E3.2 lane 11's safety sub-arms, in registry order (they follow the six). */
const SAFETY_SUBARMS = ['eval-no-threat-stack', 'eval-no-anchor', 'eval-no-safety-inv'] as const;

/** Every `weights` arm this file pins, group arms first. */
const ALL_WEIGHT_ARMS = [...WEIGHT_ARMS, ...SAFETY_SUBARMS] as const;

/**
 * The feature indices each weight arm zeroes. The six group arms take them from
 * the coordinator's partition; the three safety sub-arms are spelled out from
 * `F` exactly as `arms.ts` spells them, so this file and the registry agree
 * only if both name the same features — and the partition test below checks the
 * three against `EVAL_GROUPS.safety` rather than against the registry.
 */
/** E3.2 lane 12's correctness arms, in registry order (factor `evalFix`). */
const CORRECT_ARMS = [
  'eval-fix-b1',
  'eval-fix-b2',
  'eval-fix-b3',
  'eval-fix-b4',
  'eval-fix-b5',
  'eval-fix-b6',
  'eval-correct-v1',
] as const;

const WEIGHT_ARM_GROUPS: Record<(typeof ALL_WEIGHT_ARMS)[number], readonly number[]> = {
  'eval-no-economy': EVAL_GROUPS.economy,
  'eval-no-home': EVAL_GROUPS.home,
  'eval-no-safety': EVAL_GROUPS.safety,
  'eval-no-space': EVAL_GROUPS.space,
  'eval-no-invariants': INVARIANT_FEATURES,
  'eval-stage01': STAGE2_FEATURES,
  'eval-no-threat-stack': [
    F.Exposure,
    F.Hanging,
    F.HangingBuy,
    F.ApproachRetreat,
    F.ApproachStrand,
    F.StrandPunish,
    F.KillAvailable,
    F.CleaveExposure,
    // M6 (Phasing) added two cc-scale threat terms to `EVAL_GROUPS.safety`.
    // They are threat-stack terms, not anchor terms and not §5.13 invariants,
    // so the partition test below is what keeps the registry honest about them.
    F.ArrivalThreat,
    F.DisruptPressure,
  ],
  'eval-no-anchor': [F.AnchorFragility, F.BlockingDeficit, F.Inv6FragileAnchor],
  'eval-no-safety-inv': [
    F.Inv3RetreatSquare,
    F.Inv4StrandUnpunished,
    F.Inv8NoPreAdjacency,
    F.Inv9ChipAcrossTurn,
    F.Inv12CleaveLine,
    F.Inv17SelfBlock,
    F.Inv19SoftMinerExposed,
    F.Inv20StrandNoRetreat,
  ],
};

/**
 * The label `zeroWeights` builds for an arm: `<base vector>-no-<group>`.
 *
 * The prefix used to be the literal `default-v1`. M6 replaced `DEFAULT_WEIGHTS`
 * with the Phasing accounting bootstrap, so the arms derive the prefix from
 * `DEFAULT_WEIGHTS.label` now (`arms.ts BASE_WEIGHTS_LABEL`) and this helper
 * does the same — spelling `default-v1` here again would only re-freeze a name
 * that no longer describes the vector, and would collide by label with the
 * Standard rows under `lab/results/hard-ai-e3/**`.
 */
function weightArmLabel(name: (typeof ALL_WEIGHT_ARMS)[number]): string {
  return `${BASE_WEIGHTS_LABEL}-no-${name === 'eval-stage01' ? 'stage2' : name.slice('eval-no-'.length)}`;
}

/**
 * `hard@lab`/`hard@desktop` at `wall:3000`. `LAB` and `DESKTOP` are the same
 * shape, so the two labels share it.
 *
 * THIS VALUE MOVED WHEN PHASING BECAME THE LADDER'S RULE SET, and the move is
 * the point. `ladder/identity.ts` now carries the RULES REVISION inside every
 * resolved configuration (see its module header, clause 3): `hard@desktop` at
 * `wall:3000` plays a different game under Standard and under Phasing, from a
 * different opening book, for a different result, with every `HardConfig` field
 * identical — so before this the two hashed the same and anything pooling rows
 * by configuration hash would have merged them silently.
 *
 * The STANDARD-era value was
 * `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`, and it is
 * what `lab/results/hard-ai-e1/analyze/g3-s1_0_1-B-white.json`
 * (`recordedEngineConfigHash`, black seat) and the E4 ablation manifests under
 * `lab/results/hard-ai-e4/ablate/**` record. Those artifacts are Standard rows
 * and this tree cannot mint their identity any more, which is the separation
 * working rather than a regression: a Phasing tree must not be ABLE to. The
 * value below is the `muju-phasing-1` identity of the same arm.
 *
 * IT MOVED A SECOND TIME AT M6, AND FOR THE SAME REASON. `resolvedConfig`
 * hashes the configuration the ladder adapter APPLIES, and that includes the
 * evaluation weights `hardEnginePatch` substitutes for DESKTOP's version-0
 * placeholder (`ladder/identity.ts hardResolvedConfig`). M6 replaced
 * `DEFAULT_WEIGHTS` — M4's `placeholder-m4` era vector gave way to the Phasing
 * accounting bootstrap (`phasing-accounting-bootstrap-v1`, commit e701ccc0,
 * `docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md`) — so `hard@desktop` at
 * `wall:3000` now evaluates positions with a different vector and is a
 * different engine. This is a SCHEMA/EVALUATION MIGRATION, not a pin fitted to
 * code: the hash is supposed to move when the champion's judgment does, which
 * is the whole reason it is computed instead of declared. Both superseded
 * values are kept below so a reader of any recorded manifest can place the row
 * it quotes.
 *
 * IT MOVED A THIRD TIME AT `muju-phasing-2`, AND FOR THE FIRST REASON AGAIN.
 * Preregistration amendment A4 (2026-09-19) took the inactivity draw clock from
 * 10 plies to 20 and advanced the rules revision, and the revision is the first
 * field of every resolved configuration. `hard@desktop` at `wall:3000` plays a
 * different game under the two limits — a position it would have drawn now has
 * ten more plies to win in — so it is a different engine and says so. Nothing
 * about the configuration itself changed: forcing `rulesVersion` back to
 * `muju-phasing-1` on today's resolved configuration reproduces the superseded
 * value below byte for byte, which is how this move was attributed to A4 rather
 * than to any concurrent edit under `src/ai/hard/**`.
 */
const DESKTOP_WALL3000_HASH = '2c485153f22afad810639da52dc59a3e7e13c1187cc2cce9cb0bf9611e90abdd';
/**
 * The same arm under the M6 accounting bootstrap: identical configuration, the
 * five-nonzero `DEFAULT_WEIGHTS` that 2026-09-20's `phasing-hand-priors-v1`
 * replaced (`docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md`). Every E1/E4
 * manifest recorded between `e701ccc0` and `71b41a39` quotes it, so it is kept
 * here to stay findable; substituting the bootstrap vector on today's resolved
 * configuration reproduces it byte for byte.
 */
const DESKTOP_WALL3000_HASH_BOOTSTRAP_M6 = '4464b19120dcda961f119f47e79c8d16640313365bac50975ddd75693ca69318';
/** The same arm under `muju-phasing-1` (the 10-ply clock), M6 weights and all;
 * every Phasing row recorded before 2026-09-19 quotes it. */
const DESKTOP_WALL3000_HASH_PHASING_1 = '7bc3711a6c5468a9cc972eb38801c045e816a356428f284d0e60b8e7313eeb0e';
/** The Phasing identity this arm carried between d403a08e (rules binding) and
 * e701ccc0 (the M6 accounting bootstrap): same rules, `placeholder-m4`-era
 * `DEFAULT_WEIGHTS`. M4-era Phasing rows quote it. */
const DESKTOP_WALL3000_HASH_PHASING_M4 = '7be9acc41692edfc956f91bd5c4ce59282d4113aa4a18ba495491649e5dd8eab';
/** The same arm's Standard identity, kept so the two can never be confused and
 * so a reader of an E1/E4 manifest can find the hash it quotes. */
const DESKTOP_WALL3000_HASH_STANDARD = '4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd';

function hardConfigOf(name: string): ResolvedHardConfig['config'] {
  const resolved = resolvedConfig(name, ARM_HASH_WORK);
  if (resolved.engine !== 'hard') throw new Error(`${name} did not resolve to a hard engine`);
  return resolved.config;
}

describe('ablation arm registry (E1.3: one factor per arm, full configurations recorded)', () => {
  it('starts at base and base is DESKTOP unchanged', () => {
    expect(ARMS[0].name).toBe('base');
    expect(ARMS[0].factor).toBe('none');
    expect(canonicalJson(BASE)).toBe(canonicalJson({ ...DESKTOP }));
  });

  /**
   * Each `combined` arm names its own pair of moved factors: `work-fit-deep`
   * (E2 lane 1) moves `time` + `iterationGate`, `combined` (E4 lane 7) moves
   * `weights` + `evalFix`. Keyed by arm name, not assumed from the registry's
   * only `combined` arm, so a third combined arm added later fails loudly
   * here instead of silently reusing someone else's pair.
   */
  const COMBINED_ARM_FACTORS: Record<string, string[]> = {
    'work-fit-deep': ['time', 'iterationGate'],
    combined: ['weights', 'evalFix'],
  };

  it('moves exactly one NAMED factor per arm', () => {
    const baseFactors = factorsOf(BASE);
    for (const arm of ARMS) {
      const moved = (Object.keys(baseFactors) as (keyof typeof baseFactors)[]).filter(
        k => factorsOf(armHardConfig(arm.name))[k] !== baseFactors[k],
      );
      // A `combined` arm declares that it moves more than one factor; it names
      // which in `change`, and `maskFactor` restores all of them below.
      const expected =
        arm.factor === 'none'
          ? []
          : arm.factor === 'combined'
            ? (COMBINED_ARM_FACTORS[arm.name] ?? (() => { throw new Error(`no COMBINED_ARM_FACTORS entry for ${arm.name}`); })())
            : [arm.factor];
      expect([...moved].sort(), `${arm.name} moved ${moved.join('+')}`).toEqual([...expected].sort());
    }
  });

  it('moves NOTHING ELSE in the whole resolved configuration', () => {
    for (const arm of ARMS) {
      const masked = maskFactor(hardConfigOf(armEngineName(arm.name)), arm.factor, hardConfigOf('hard@desktop'));
      expect(canonicalJson(masked), `${arm.name} differs outside ${arm.factor}`).toBe(canonicalJson(hardConfigOf('hard@desktop')));
    }
  });

  it('gives every arm a distinct resolved-configuration hash', () => {
    const hashes = ARMS.map(a => a.configHash);
    expect(new Set(hashes).size).toBe(ARMS.length);
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records the hash identity.ts computes, and memoises it', () => {
    for (const arm of ARMS) {
      expect(arm.configHash).toBe(resolvedConfigHash(armEngineName(arm.name), ARM_HASH_WORK));
      expect(arm.configHash).toBe(arm.configHash);
    }
  });

  it('applies the campaign-3 step sizes', () => {
    expect([armHardConfig('k48').K, armHardConfig('k48').gen.K]).toEqual([48, 48]);
    expect([armHardConfig('k96').K, armHardConfig('k96').gen.K]).toEqual([96, 96]);
    // K is ROOT-only by decision: kInterior is held so root breadth and reply
    // breadth stay separable (see the arms.ts header).
    expect(armHardConfig('k96').kInterior).toBe(DESKTOP.kInterior);
    expect(armHardConfig('k96').genInterior.K).toBe(DESKTOP.genInterior.K);
    expect([...armHardConfig('action-width-wide').gen.action.widths]).toEqual([8, 6, 4, 3]);
    expect([...armHardConfig('action-width-narrow').gen.action.widths]).toEqual([4, 3, 2, 1]);
    expect([armHardConfig('place-wide').gen.maxPlacePlans, armHardConfig('place-wide').genInterior.maxPlacePlans]).toEqual([32, 16]);
    expect([armHardConfig('place-narrow').gen.maxPlacePlans, armHardConfig('place-narrow').genInterior.maxPlacePlans]).toEqual([8, 4]);
    // The reply node is `genInterior` (`search/pvs.ts generateAt`), so the
    // reply arm is the interior list and nothing else.
    expect([armHardConfig('reply-wide').kInterior, armHardConfig('reply-wide').genInterior.K]).toEqual([32, 32]);
    expect(armHardConfig('reply-wide').gen.K).toBe(DESKTOP.gen.K);
  });

  /**
   * E2.2's two arms. Both move the INTERIOR half of a shape knob and leave the
   * root half at DESKTOP's value, which is what the stage trace pointed at:
   * 28 of 28 root targets were already in the root list, so a root-side
   * widening cannot recover an analysed loss
   * (`docs/hard-ai/e2/E2.2-COVERAGE-TRACE.md`).
   */
  it('applies the E2.2 interior-only step sizes and leaves the root alone', () => {
    const iaw = armHardConfig('interior-action-wide');
    expect([...iaw.genInterior.action.widths]).toEqual([10, 6, 4, 2]);
    expect([...iaw.gen.action.widths]).toEqual([...DESKTOP.gen.action.widths]);
    expect(iaw.gen.maxPlacePlans).toBe(DESKTOP.gen.maxPlacePlans);
    expect([iaw.K, iaw.kInterior]).toEqual([DESKTOP.K, DESKTOP.kInterior]);

    const ipw = armHardConfig('interior-place-wide');
    expect(ipw.genInterior.maxPlacePlans).toBe(12);
    expect(ipw.gen.maxPlacePlans).toBe(DESKTOP.gen.maxPlacePlans);
    expect([...ipw.genInterior.action.widths]).toEqual([...DESKTOP.genInterior.action.widths]);
    expect([ipw.K, ipw.kInterior]).toEqual([DESKTOP.K, DESKTOP.kInterior]);

    // Both are distinct engines, and neither is the champion.
    const hashes = [requireArm('interior-action-wide').configHash, requireArm('interior-place-wide').configHash];
    expect(new Set(hashes).size).toBe(2);
    for (const h of hashes) expect(h).not.toBe(requireArm('base').configHash);
  });

  it('marks the arms a ROOT recall item cannot see, and no longer counts the weights and evalFix arms among them', () => {
    // `reply-wide` and E2.2's two `interior-*` arms move `genInterior` only,
    // which no root item uses; `calib` (E1.5) and `work-fit` (E2 lane 1) move
    // time allocation, which a fixed-work recall item cannot see anywhere —
    // `work-fit` doubly so, since `chooseWork` is never called under fixed
    // work, and `work-fit-deep` carries `work-fit`'s half. `deep-gate` is the
    // exception among the allocation arms: `iterationGate` is a SEARCH field,
    // so it applies under fixed work and a recall item can see it. Every other
    // arm moves a knob `gen` reads at the root.
    //
    // E3 lane 15, amendment A13-1: the `weights` and `evalFix` arms used to sit
    // in this list because the recall instrument built its own
    // `new Evaluator(this.rep)` and its own `allocTables()`, carrying neither
    // the arm's weight vector nor its `evalFix` block. Lane 13's A8 / L5-A1 fix
    // resolves and stamps both, so those arms move root AND reply columns and
    // are NOT invisible; the list below is the generator-and-allocation arms
    // only.
    const invisible = [
      'reply-wide',
      'interior-action-wide',
      'interior-place-wide',
      'calib',
      'work-fit',
      'work-fit-deep',
    ];
    for (const name of invisible) expect(requireArm(name).rootDiagnostic).toBe(false);
    for (const name of armNames().filter(n => !invisible.includes(n))) {
      expect(requireArm(name).rootDiagnostic).toBe(true);
    }
    // Stated the other way round, so a re-added `rootDiagnostic: false` on a
    // weights or evalFix arm fails here whatever the list above says: the flag
    // follows the FACTOR, not the arm name.
    for (const arm of ARMS) {
      if (arm.factor === 'weights' || arm.factor === 'evalFix' || arm.factor === 'searchFix') expect(arm.rootDiagnostic).toBe(true);
    }
    expect([...ALL_WEIGHT_ARMS, ...CORRECT_ARMS].every(n => requireArm(n).rootDiagnostic)).toBe(true);
  });

  /**
   * E1.5, the patch E1.4 §5 chose. `calib` is the first arm whose factor is
   * not a generator knob: it turns `time.calibrateCold` on and nothing else,
   * so `hard@ablate:calib` is a distinct engine with its own hash while
   * `hard@desktop` stays byte-for-byte the configuration every E1 row was
   * measured under.
   */
  it('registers calib as the one time-allocation arm', () => {
    const arm = requireArm('calib');
    expect(arm.factor).toBe('time');
    expect(armHardConfig('calib').time.calibrateCold).toBe(true);
    // The rest of the TimeConfig block is the champion's.
    expect(armHardConfig('calib').time.minMs).toBe(DESKTOP.time.minMs);
    expect(armHardConfig('calib').time.maxMs).toBe(DESKTOP.time.maxMs);
    expect(armHardConfig('calib').time.baseMs).toBe(DESKTOP.time.baseMs);
    expect(armHardConfig('calib').time.abortFactor).toBe(DESKTOP.time.abortFactor);
    // Absent, not `false`: an explicit `false` would serialise into every
    // resolved configuration and move the frozen champion's hash.
    expect(DESKTOP.time.calibrateCold).toBeUndefined();
    expect('calibrateCold' in DESKTOP.time).toBe(false);
    expect(arm.configHash).not.toBe(DESKTOP_WALL3000_HASH);
    expect(hardConfigFor('ablate:calib').time?.calibrateCold).toBe(true);
  });

  /**
   * E2 lane 1. The second time-allocation arm, and the one that moves the RUNG
   * rather than when it is measured: `chooseWork` quantises onto
   * `WORK_LADDER_FINE` instead of `WORK_LADDER`. Same absent-not-false
   * discipline as `calibrateCold`, so the champion's hash does not move.
   */
  it('registers work-fit as the ladder-step arm', () => {
    const arm = requireArm('work-fit');
    expect(arm.factor).toBe('time');
    expect(armHardConfig('work-fit').time.ladderStep).toBe('sqrt2');
    // The rest of the TimeConfig block is the champion's, calibrateCold included.
    expect(armHardConfig('work-fit').time.minMs).toBe(DESKTOP.time.minMs);
    expect(armHardConfig('work-fit').time.maxMs).toBe(DESKTOP.time.maxMs);
    expect(armHardConfig('work-fit').time.baseMs).toBe(DESKTOP.time.baseMs);
    expect(armHardConfig('work-fit').time.abortFactor).toBe(DESKTOP.time.abortFactor);
    expect(armHardConfig('work-fit').time.calibrateCold).toBeUndefined();
    // Absent on the champion, not `'2'` or `false`.
    expect(DESKTOP.time.ladderStep).toBeUndefined();
    expect('ladderStep' in DESKTOP.time).toBe(false);
    expect(arm.configHash).not.toBe(DESKTOP_WALL3000_HASH);
    expect(arm.configHash).not.toBe(requireArm('calib').configHash);
    expect(hardConfigFor('ablate:work-fit').time?.ladderStep).toBe('sqrt2');
  });

  /**
   * The ladder itself, where the arm's whole behaviour lives. `WORK_LADDER_FINE`
   * must contain every `WORK_LADDER` rung — otherwise the arm would move budgets
   * that the ×2 ladder already fitted — and must never choose a rung the ×2
   * ladder would not have reached from a LARGER budget.
   */
  it('the fine ladder is the coarse one interleaved, and only ever fits tighter', () => {
    for (const rung of WORK_LADDER) expect(WORK_LADDER_FINE).toContain(rung);
    expect(WORK_LADDER_FINE[0]).toBe(WORK_LADDER[0]);
    expect(WORK_LADDER_FINE[WORK_LADDER_FINE.length - 1]).toBe(WORK_LADDER[WORK_LADDER.length - 1]);
    for (let i = 1; i < WORK_LADDER_FINE.length; i++) {
      expect(WORK_LADDER_FINE[i]).toBeGreaterThan(WORK_LADDER_FINE[i - 1]);
    }
    const fine = armHardConfig('work-fit').time;
    const coarse = DESKTOP.time;
    for (let ms = 50; ms <= 40_000; ms += 50) {
      for (const unitsPerMs of [40, 100, 200, 700]) {
        const profile = { unitsPerMs, samples: 4 };
        const a = chooseWork(profile, ms, coarse);
        const b = chooseWork(profile, ms, fine);
        // Never smaller than the champion's rung, never over the budget.
        expect(b).toBeGreaterThanOrEqual(a);
        expect(b).toBeLessThanOrEqual(Math.max(WORK_LADDER[0], unitsPerMs * ms));
        // And never more than one √2 step above it.
        expect(b).toBeLessThanOrEqual(a * 1.5);
      }
    }
    // The champion's call sites are untouched: no `time`, no change.
    expect(chooseWork({ unitsPerMs: 100, samples: 4 }, 3000)).toBe(chooseWork({ unitsPerMs: 100, samples: 4 }, 3000, coarse));
    expect(chooseWork({ unitsPerMs: 100, samples: 4 }, 3000)).toBe(200_000);
    expect(chooseWork({ unitsPerMs: 100, samples: 4 }, 3000, fine)).toBe(283_000);
  });

  /**
   * E2 lane 1's second pair. `deep-gate` moves the DEEPENING GATE and nothing
   * else; `work-fit-deep` is the declared two-factor combination of it with
   * `work-fit`. Both leave the champion's hash where it is, by the same
   * absent-means-default discipline.
   */
  it('registers deep-gate and work-fit-deep', () => {
    const gate = requireArm('deep-gate');
    expect(gate.factor).toBe('iterationGate');
    expect(armHardConfig('deep-gate').iterationGate).toBe('predicted');
    // A search field, so it is NOT wall-mode only: a fixed-work item sees it.
    expect(gate.rootDiagnostic).toBe(true);
    expect(armHardConfig('deep-gate').time.ladderStep).toBeUndefined();

    const both = requireArm('work-fit-deep');
    expect(both.factor).toBe('combined');
    expect(armHardConfig('work-fit-deep').iterationGate).toBe('predicted');
    expect(armHardConfig('work-fit-deep').time.ladderStep).toBe('sqrt2');

    // Absent on the champion, not `'fixed45'`.
    expect(DESKTOP.iterationGate).toBeUndefined();
    expect('iterationGate' in DESKTOP).toBe(false);
    for (const a of [gate, both]) expect(a.configHash).not.toBe(DESKTOP_WALL3000_HASH);
    expect(new Set([gate.configHash, both.configHash, requireArm('work-fit').configHash]).size).toBe(3);
    expect(hardConfigFor('ablate:deep-gate').iterationGate).toBe('predicted');
    expect(hardConfigFor('ablate:work-fit-deep').time?.ladderStep).toBe('sqrt2');
  });

  /**
   * E4.3 candidate B (lane 5). `search-iter-fit` moves the whole `searchFix`
   * block and nothing else, and the block is ABSENT on the champion — the same
   * absent-means-default discipline `evalFix`, `iterationGate` and
   * `time.ladderStep` carry, and the reason `hard@desktop`'s hash is still the
   * one pinned at the top of this file.
   */
  it('registers search-iter-fit and leaves the champion where it is', () => {
    const arm = requireArm('search-iter-fit');
    expect(arm.factor).toBe('searchFix');
    expect(armHardConfig('search-iter-fit').searchFix).toEqual({ iterFit: true });
    // A SEARCH field, so a fixed-work instrument sees it — unlike the two
    // `time` arms, which only exist in wall mode.
    expect(arm.rootDiagnostic).toBe(true);
    // One factor and nothing else: the rest of the allocation machinery is
    // untouched, so this arm is not a second `work-fit` or `deep-gate`.
    expect(armHardConfig('search-iter-fit').iterationGate).toBeUndefined();
    expect(armHardConfig('search-iter-fit').time.ladderStep).toBeUndefined();
    expect(armHardConfig('search-iter-fit').evalFix).toBeUndefined();

    // Absent on the champion, not `{}` and not `{ iterFit: false }`.
    expect(DESKTOP.searchFix).toBeUndefined();
    expect('searchFix' in DESKTOP).toBe(false);
    expect(searchFixKey(undefined)).toBe('absent');
    expect(searchFixKey({})).toBe('none');
    expect(searchFixKey({ iterFit: true })).toBe('iterFit');

    expect(arm.configHash).not.toBe(DESKTOP_WALL3000_HASH);
    // Standard-era value: a1ea79648ff83c6920fe63be751bf350f0630ffffa5dd3dd017c704ddaea30e7
    // (see DESKTOP_WALL3000_HASH's note: the rules revision is in the hash now).
    // M4-era Phasing value: 6d2e074cf7e446506cf240ecf0788b9b90d2c5994d599ec7f3213a42ca54565a
    // — superseded by M6's DEFAULT_WEIGHTS, which every hard@* configuration
    // carries (same migration as DESKTOP_WALL3000_HASH's second move).
    // `muju-phasing-1` value: 17b02fe2e6bc19b091eabece38aba660a8cac368b3ba544128005336c14acb20
    // — superseded by A4's 20-ply draw clock (DESKTOP_WALL3000_HASH's third
    // move); forcing the revision back on today's configuration reproduces it.
    // M6-bootstrap value: a18b84f8f89e57281c49139959fd9563865bee5461a0c10211e44897259b8b11
    // — superseded by the 2026-09-20 hand priors (DESKTOP_WALL3000_HASH's
    // fourth move), which every hard@* configuration carries.
    expect(arm.configHash).toBe('6c8f9bb176bf1f365d6a4e6ca2e285c8117e3d5d7b73b6bb963d974cd562754e');
    expect(hardConfigFor('ablate:search-iter-fit').searchFix?.iterFit).toBe(true);
    expect(hardConfigFor('desktop').searchFix).toBeUndefined();
  });

  /**
   * E4.3 candidate C (lane 8). `search-reach-cache` is the one arm in the
   * registry that is a PURE OPTIMISATION: it moves the whole `searchFix` block
   * and nothing else, and its fixed-work output is required to equal the
   * champion's on every golden row (`docs/hard-ai/e4/E4.3-REACH-CACHE.md`).
   */
  it('registers search-reach-cache and leaves the champion where it is', () => {
    const arm = requireArm('search-reach-cache');
    expect(arm.factor).toBe('searchFix');
    expect(armHardConfig('search-reach-cache').searchFix).toEqual({ reachCache: true });
    expect(arm.rootDiagnostic).toBe(true);
    expect(armHardConfig('search-reach-cache').iterationGate).toBeUndefined();
    expect(armHardConfig('search-reach-cache').time.ladderStep).toBeUndefined();
    expect(armHardConfig('search-reach-cache').evalFix).toBeUndefined();
    expect(armHardConfig('search-reach-cache').weights).toBe(DESKTOP.weights);
    // One flag, not a bundle: the two other searchFix flags stay absent.
    expect(armHardConfig('search-reach-cache').searchFix?.iterFit).toBeUndefined();
    expect(armHardConfig('search-reach-cache').searchFix?.tieBreak).toBeUndefined();

    expect(searchFixKey({ reachCache: true })).toBe('reachCache');
    expect(searchFixKey({ iterFit: true, reachCache: true })).toBe('iterFit+reachCache');

    expect(arm.configHash).not.toBe(DESKTOP_WALL3000_HASH);
    // Standard-era value: 5ba2c2fc352d4715f790f9ce0fdb6e1b4926d1c49edce923f8169f88fdad0a51.
    // M4-era Phasing value: 2e54160e9e7cf293af49ec2dcc17e3666974fa86295a0fd1391a15845087493a
    // — superseded by M6's DEFAULT_WEIGHTS, as above.
    // `muju-phasing-1` value: 9f6014597d880b049418c4ceafd29306b6d54c824abe630d109836a8dafc7f12
    // — superseded by A4's 20-ply draw clock, as above.
    // M6-bootstrap value: 1aef0a8b094f9bf5dd1c8fc8ba9efe5aaa7975078cfa5127152727f45f79c99e
    // — superseded by the 2026-09-20 hand priors, as above.
    expect(arm.configHash).toBe('6e3d2936d0564c13b331fe5435da15452e4ae4572636cdb898bfd045bd52973c');
    expect(hardConfigFor('ablate:search-reach-cache').searchFix?.reachCache).toBe(true);
    expect(hardConfigFor('desktop').searchFix).toBeUndefined();
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ARMS)).toBe(true);
    expect(() => {
      (ARMS[1] as { name: string }).name = 'hijacked';
    }).toThrow();
  });

  it('derives a ladder seed from the arm NAME, not its position', () => {
    const seeds = ARMS.map(a => armLadderSeed(a.name));
    expect(new Set(seeds).size).toBe(ARMS.length);
    expect(armLadderSeed('k96')).toBe(armLadderSeed('k96'));
    for (const s of seeds) expect(Number.isInteger(s)).toBe(true);
  });
});

/**
 * E3.1 lane 5's weight-group arms (`docs/hard-ai/e3/E3-PLAN.md`, slice row 5).
 *
 * Four things are pinned here, on top of the registry-wide invariants above
 * (one factor per arm, nothing else moved, distinct hashes, frozen):
 *
 * 1. THE ARM ZEROES ITS GROUP AND NOTHING ELSE. Every `w[]` entry outside the
 *    group equals `DEFAULT_WEIGHTS`', and the 18 `material` params are
 *    untouched — the arms ablate JUDGMENT, never the engine's ability to count
 *    material.
 * 2. THE VECTOR REACHES THE ENGINE. `hardEnginePatch` substitutes
 *    `DEFAULT_WEIGHTS` for a `version: 0` vector, so an arm vector that lost
 *    its version would silently play as the champion (E0's I2 lesson). The arm
 *    is therefore built the way the ladder builds it and the LIVE evaluator's
 *    `currentWeights` is read back.
 * 3. `hard@desktop` DOES NOT MOVE. Asserted registry-wide below; restated here
 *    because a `weights` key in a patch is the first thing in the registry that
 *    could have touched the champion's resolved configuration.
 * 4. THE SIX ARE NOT DISJOINT, and the test says by how much: the two
 *    cross-cutting arms overlap the four group arms on purpose.
 */
/**
 * E4.2 lane 3. The first arm whose factor is `searchFix`: it moves the ROOT's
 * tie policy and nothing else. Same absent-not-false discipline as
 * `calibrateCold`, `ladderStep` and `evalFix`, so `hard@desktop`'s hash stays
 * where every E1/E2/E3 row was measured.
 */
describe('E4.2 search arms (factor `searchFix`)', () => {
  it('registers search-tie-break as the one root tie-policy arm', () => {
    const arm = requireArm('search-tie-break');
    expect(arm.factor).toBe('searchFix');
    expect(armHardConfig('search-tie-break').searchFix?.tieBreak).toBe('end-key');
    expect(hardConfigFor('ablate:search-tie-break').searchFix?.tieBreak).toBe('end-key');
    // It runs on the CHAMPION's evaluator, so the search effect is attributable
    // (E4-PLAN, "Rules every lane runs under").
    expect(armHardConfig('search-tie-break').weights).toBe(DESKTOP.weights);
    expect(armHardConfig('search-tie-break').evalFix).toBeUndefined();
  });

  it('leaves the block ABSENT on the champion, so the frozen hash does not move', () => {
    expect(DESKTOP.searchFix).toBeUndefined();
    expect('searchFix' in DESKTOP).toBe(false);
    expect(canonicalJson(DESKTOP)).not.toContain('searchFix');
    expect(resolvedConfigHash('hard@desktop', { mode: 'wall', ms: 3000 })).toBe(DESKTOP_WALL3000_HASH);
    expect(requireArm('base').configHash).toBe(DESKTOP_WALL3000_HASH);
    // The Standard identity of the same arm is a DIFFERENT hash, and this tree
    // can no longer produce it (`ladder/identity.ts`, clause 3). Neither is the
    // M4-era Phasing identity, nor the `muju-phasing-1` identity it carried
    // until A4 moved the draw clock, nor the M6-bootstrap identity it carried
    // until the 2026-09-20 hand priors replaced `DEFAULT_WEIGHTS`. All four are
    // kept so a reader of an older manifest can find the hash it quotes.
    for (const superseded of [DESKTOP_WALL3000_HASH_STANDARD, DESKTOP_WALL3000_HASH_PHASING_M4,
      DESKTOP_WALL3000_HASH_PHASING_1, DESKTOP_WALL3000_HASH_BOOTSTRAP_M6]) {
      expect(DESKTOP_WALL3000_HASH).not.toBe(superseded);
      expect(requireArm('base').configHash).not.toBe(superseded);
    }
    expect(requireArm('search-tie-break').configHash).not.toBe(DESKTOP_WALL3000_HASH);
  });

  it('serialises the whole block in factorsOf, and masks back to the champion', () => {
    expect(factorsOf(BASE).searchFix).toBe('absent');
    expect(factorsOf(armHardConfig('search-tie-break')).searchFix).toBe('tieBreak=end-key');
    const masked = maskFactor(hardConfigOf(armEngineName('search-tie-break')), 'searchFix', hardConfigOf('hard@desktop'));
    expect(canonicalJson(masked)).toBe(canonicalJson(hardConfigOf('hard@desktop')));
  });
});

describe('E3.1 weight-group arms (factor `weights`)', () => {
  it('registers the six group arms and then the three safety sub-arms, in plan order', () => {
    const weightArms = armNames().filter(n => requireArm(n).factor === 'weights');
    // A PREFIX check, not an equality: lane 5's six come first, lane 11's three
    // immediately after, and a later lane may append further `weights` arms at
    // the end of `SPECS` without silently reordering these nine.
    expect(weightArms.slice(0, ALL_WEIGHT_ARMS.length)).toEqual([...ALL_WEIGHT_ARMS]);
  });

  it('zeroes exactly its group and leaves every other weight at default-v1', () => {
    for (const name of ALL_WEIGHT_ARMS) {
      const w = armHardConfig(name).weights;
      const group = new Set(WEIGHT_ARM_GROUPS[name]);
      for (let i = 0; i < FEATURE_COUNT; i++) {
        const expected = group.has(i) ? 0 : DEFAULT_WEIGHTS.w[i];
        expect(w.w[i], `${name} w[${i}]`).toBe(expected);
      }
      expect(w.label).toBe(weightArmLabel(name));
    }
  });

  it('never blinds material: the 18 catalogue params and w[F.Material] stay at default-v1', () => {
    for (const name of ALL_WEIGHT_ARMS) {
      const w = armHardConfig(name).weights;
      expect([...w.material], `${name} material`).toEqual([...DEFAULT_WEIGHTS.material]);
      // `w[F.Material]` is inert in the evaluator (`eval/evaluate.ts` scores the
      // material block from `weights.material`), but it is still the champion's
      // value here: no arm claims to have moved it.
      expect(w.w[F.Material], `${name} w[Material]`).toBe(DEFAULT_WEIGHTS.w[F.Material]);
    }
  });

  it('carries a non-zero weights version, so hardEnginePatch keeps the arm vector', () => {
    for (const name of ALL_WEIGHT_ARMS) {
      const arm = armHardConfig(name).weights;
      expect(arm.version).toBe(WEIGHTS_VERSION);
      expect(arm.version).not.toBe(0);
      // The adapter path the ladder, the exam and the probes all take.
      const patched = hardEnginePatch(`ablate:${name}`).weights;
      expect(patched?.label, `${name} through hardEnginePatch`).toBe(arm.label);
      expect(patched?.w[WEIGHT_ARM_GROUPS[name][0]]).toBe(0);
    }
    // The control: `base` carries DESKTOP's `placeholder-m4` (version 0) and is
    // substituted, which is what makes every non-weights arm play the champion's
    // evaluation.
    expect(armHardConfig('base').weights.version).toBe(0);
    expect(hardEnginePatch('ablate:base').weights?.label).toBe(DEFAULT_WEIGHTS.label);
  });

  it('reaches a LIVE evaluator with the arm vector (engine.ctx.eval.currentWeights)', () => {
    for (const name of ALL_WEIGHT_ARMS) {
      const engine = new HardEngine(hardEnginePatch(`ablate:${name}`));
      const live = engine.ctx.eval.currentWeights;
      expect(live.label, `${name} live label`).toBe(weightArmLabel(name));
      expect(live.version).toBe(WEIGHTS_VERSION);
      for (const i of WEIGHT_ARM_GROUPS[name]) expect(live.w[i], `${name} live w[${i}]`).toBe(0);
      expect([...live.material]).toEqual([...DEFAULT_WEIGHTS.material]);
      // And the champion's own build is unaffected in the same process.
      const champion = new HardEngine(hardEnginePatch('desktop'));
      expect(champion.ctx.eval.currentWeights.label).toBe(DEFAULT_WEIGHTS.label);
    }
  });

  it('gives every weight arm a hash of its own, and none is the champion hash', () => {
    const hashes = ALL_WEIGHT_ARMS.map(n => requireArm(n).configHash);
    expect(new Set(hashes).size).toBe(ALL_WEIGHT_ARMS.length);
    for (const h of hashes) {
      expect(h).not.toBe(DESKTOP_WALL3000_HASH);
      expect(h).not.toBe(requireArm('base').configHash);
    }
    expect(resolvedConfigHash('hard@desktop', ARM_HASH_WORK)).toBe(DESKTOP_WALL3000_HASH);
  });

  /**
   * The two cross-cutting arms overlap the four group arms by construction, and
   * the group sizes are not the counts a row's report may quote: what a weights
   * arm actually REMOVES is the subset of its indices that the base vector sets
   * to something other than 0.
   *
   * THE GROUP SIZES MOVED AT M6 and so did every live count, for two separate
   * reasons that this test keeps apart:
   *
   *  - `EVAL_GROUPS` grew four Phasing features. Economy went 13 -> 15
   *    (`PendingValue`, `RentShortfall`), safety 19 -> 21 (`ArrivalThreat`,
   *    `DisruptPressure`), `FEATURE_COUNT` 58 -> 62, so `STAGE2_FEATURES` went
   *    35 -> 39. The `home` (11) and `space` (14) groups are unchanged.
   *  - `DEFAULT_WEIGHTS` moved twice. M6 replaced the Standard champion with the
   *    hand-derived accounting bootstrap
   *    (`docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md`), which set exactly FIVE
   *    entries: Material(0), BankLiquid(2), BankExcess(3), EconDelta(23) and
   *    PendingValue(58); everything else was a deliberate zero. On 2026-09-20
   *    the repair replaced THAT with `phasing-hand-priors-v1`, which prices 43
   *    of 62 — the accounting core, a 25 cc bank discount, and the Standard-era
   *    `default-v1` values for every feature whose meaning survives Phasing
   *    (`docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md`).
   *
   * THE E3 INSTRUMENT IS LIVE AGAIN. Under the bootstrap most weight arms zeroed
   * weights that were already zero and were therefore byte-identical players to
   * `base` — the "silent A/A row" `arms.ts` refuses to register an
   * `eval-no-material` arm to avoid (E0's I2 lesson). The list below recorded
   * which, and said it was expected to shrink to nothing when a priced Phasing
   * vector landed. It has: every one of the nine arms now removes live weight.
   * The counts are still not the group sizes — five invariants and several
   * economy terms are deliberately 0 — so they stay derived and pinned.
   */
  it('counts the LIVE weights each arm removes, overlaps included', () => {
    const live = (name: (typeof ALL_WEIGHT_ARMS)[number]): number =>
      WEIGHT_ARM_GROUPS[name].filter(i => DEFAULT_WEIGHTS.w[i] !== 0).length;
    // Standard-era sizes/live counts, for a reader of an E3 report:
    // economy 13/13, home 11/11, safety 19/19, space 14/10, invariants 20/18,
    // stage2 35/33. M6-bootstrap live counts: economy 4, stage01 2, everything
    // else 0.
    expect(WEIGHT_ARM_GROUPS['eval-no-economy'].length).toBe(15);
    expect(live('eval-no-economy')).toBe(6);
    expect(WEIGHT_ARM_GROUPS['eval-no-home'].length).toBe(11);
    expect(live('eval-no-home')).toBe(10);
    expect(WEIGHT_ARM_GROUPS['eval-no-safety'].length).toBe(21);
    expect(live('eval-no-safety')).toBe(17);
    expect(WEIGHT_ARM_GROUPS['eval-no-space'].length).toBe(14);
    expect(live('eval-no-space')).toBe(9);
    expect(WEIGHT_ARM_GROUPS['eval-no-invariants'].length).toBe(20);
    expect(live('eval-no-invariants')).toBe(15);
    expect(WEIGHT_ARM_GROUPS['eval-stage01'].length).toBe(35 + (FEATURE_COUNT - 58));
    expect(live('eval-stage01')).toBe(26);
    expect(live('eval-no-threat-stack')).toBe(7);
    expect(live('eval-no-anchor')).toBe(3);
    expect(live('eval-no-safety-inv')).toBe(7);
    // The two cross-cutting arms are nested, and both cut across the groups.
    const inv = new Set(INVARIANT_FEATURES);
    expect([...inv].every(i => STAGE2_FEATURES.includes(i))).toBe(true);
    expect(EVAL_GROUPS.economy.some(i => inv.has(i))).toBe(true);
    expect(EVAL_GROUPS.home.some(i => inv.has(i))).toBe(true);
    expect(EVAL_GROUPS.safety.some(i => inv.has(i))).toBe(true);
    expect(EVAL_GROUPS.space.some(i => inv.has(i))).toBe(true);
  });

  /**
   * The honesty clause for the paragraph above. An arm that removes no LIVE
   * weight plays exactly as `base` does: same search, same scores, same moves,
   * a different configuration hash and label only. Recording which arms are in
   * that state is the difference between a known limitation of the M6 bootstrap
   * and a silently vacuous experiment.
   *
   * The list was expected to SHRINK to nothing when a priced Phasing vector
   * landed; an arm leaving it is a pass, an arm joining it is a regression worth
   * failing over. `phasing-hand-priors-v1` emptied it on 2026-09-20 — under the
   * M6 bootstrap it held seven arms (anchor, home, invariants, safety,
   * safety-inv, space, threat-stack) and only `eval-no-economy` and
   * `eval-stage01` bit. That is the designed success signal, so the test now
   * asserts emptiness, and the identity loop below is kept for the day an arm
   * rejoins.
   */
  it('names the weight arms that are A/A against the default vector, rather than hiding them', () => {
    const live = (name: (typeof ALL_WEIGHT_ARMS)[number]): number =>
      WEIGHT_ARM_GROUPS[name].filter(i => DEFAULT_WEIGHTS.w[i] !== 0).length;
    const vacuous = ALL_WEIGHT_ARMS.filter(n => live(n) === 0);
    expect(vacuous).toEqual([]);
    // Were one to rejoin, it would still differ from `base` by IDENTITY, so a
    // row can never be mistaken for a champion row even while it plays like one.
    for (const name of vacuous) {
      expect(armHardConfig(name).weights.label).not.toBe(BASE_WEIGHTS_LABEL);
      expect(requireArm(name).configHash).not.toBe(requireArm('base').configHash);
    }
    // Every weight arm bites: the E3 instrument measures something again.
    expect(ALL_WEIGHT_ARMS.filter(n => live(n) > 0).sort()).toEqual([...ALL_WEIGHT_ARMS].sort());
  });

  it('is a stage-2-only cut for eval-stage01: stage 0 and stage 1 are untouched', () => {
    const w = armHardConfig('eval-stage01').weights;
    for (let i = 0; i < F.EconDelta; i++) expect(w.w[i], `stage 0/1 w[${i}]`).toBe(DEFAULT_WEIGHTS.w[i]);
    for (let i = F.EconDelta; i < FEATURE_COUNT; i++) expect(w.w[i], `stage 2 w[${i}]`).toBe(0);
  });

  /**
   * E3.2 lane 11. The three sub-arms exist to say which part of `eval-no-safety`
   * carries lane 5's +338, so their union must be `eval-no-safety`'s cut exactly
   * — no safety feature unmeasured, no feature outside the group touched, and no
   * feature in two sub-arms (which would make two rows price the same weight).
   */
  it('the three safety sub-arms partition the safety group exactly', () => {
    const parts = SAFETY_SUBARMS.map(n => WEIGHT_ARM_GROUPS[n]);
    const union = parts.flat();
    expect(union.length, 'no feature in two sub-arms').toBe(new Set(union).size);
    expect([...union].sort((a, b) => a - b)).toEqual([...EVAL_GROUPS.safety].sort((a, b) => a - b));
    // Standard-era split was [8, 3, 8]; M6's two Phasing threat terms joined
    // the threat stack (see `SAFETY_THREAT_STACK`'s note in `arms.ts`).
    expect(parts.map(p => p.length)).toEqual([10, 3, 8]);
    expect(union.length).toBe(EVAL_GROUPS.safety.length);
    expect(union.length).toBe(21);
    // Under Standard every one of the 19 was LIVE in `default-v1`, so each
    // sub-arm removed what its size said (lane 5's "live weights removed"
    // column). Under the M6 accounting bootstrap NONE of the 21 was live and
    // all three sub-arms were A/A; that tripwire was written to fire the day a
    // priced Phasing vector landed, and it did. `phasing-hand-priors-v1` prices
    // 17 of the 21 — ArrivalThreat, DisruptPressure, HangingBuy and Inv17 stay
    // 0 by contract — so the live count replaces the all-zero assertion.
    const liveSafety = union.filter(i => DEFAULT_WEIGHTS.w[i] !== 0);
    expect(liveSafety, `${BASE_WEIGHTS_LABEL} live safety weights`).toHaveLength(17);
    expect(union.filter(i => DEFAULT_WEIGHTS.w[i] === 0).sort((a, b) => a - b))
      .toEqual([F.HangingBuy, F.Inv17SelfBlock, F.ArrivalThreat, F.DisruptPressure].sort((a, b) => a - b));
  });

  /**
   * The sum of the three sub-arms' zeroed weights is `eval-no-safety`'s vector,
   * checked on the registry's own objects rather than on this file's index
   * lists: zeroing the union of the three sub-blocks reproduces the group arm's
   * `w[]` exactly.
   */
  it('the three sub-arms together reproduce eval-no-safety\'s vector', () => {
    const full = armHardConfig('eval-no-safety').weights;
    const cut = new Set(SAFETY_SUBARMS.flatMap(n => [...WEIGHT_ARM_GROUPS[n]]));
    for (let i = 0; i < FEATURE_COUNT; i++) {
      expect(full.w[i], `eval-no-safety w[${i}]`).toBe(cut.has(i) ? 0 : DEFAULT_WEIGHTS.w[i]);
    }
    // And each sub-arm leaves the other two sub-blocks at their default values.
    for (const name of SAFETY_SUBARMS) {
      const w = armHardConfig(name).weights;
      const mine = new Set(WEIGHT_ARM_GROUPS[name]);
      for (const i of cut) {
        if (mine.has(i)) continue;
        expect(w.w[i], `${name} leaves w[${i}] alone`).toBe(DEFAULT_WEIGHTS.w[i]);
      }
    }
  });
});

/**
 * E4 lane 7 (E3 follow-on arms; `docs/hard-ai/e4/E4-PLAN.md` row "E3 follow-on
 * arms"; `docs/hard-ai/e3/E3-CLOSE.md` Candidate 1 "Next bounded task";
 * `docs/hard-ai/e3/AMENDMENTS-E3.md` A-E3-8).
 *
 * Two things are pinned here, on top of the registry-wide invariants above
 * (one factor per arm or a declared `combined` pair, nothing else moved,
 * distinct hashes, frozen, champion untouched):
 *
 * 1. THE COMBINED ARM carries `eval-no-safety`'s weight vector exactly and
 *    `eval-correct-v1`'s five `evalFix` flags exactly — not a recomputation
 *    that could drift from either single-factor arm — and reports both
 *    factors moved.
 * 2. EACH KEEP ARM differs from `eval-no-safety` in EXACTLY the one restored
 *    index, and at that index equals `default-v1` (not some other number,
 *    and not still zero).
 */
/**
 * The 2026-09-20 repair, as ablations OF the shipped vector.
 *
 * The four arms these replaced (`hand-priors`, `hand-priors-pc`,
 * `bootstrap-pc`, `bank25-pc`) were written while `DEFAULT_WEIGHTS` was still
 * the M6 bootstrap and the within-turn pending credit was gated on a `+pc`
 * label. After `71b41a39` made both the default, three of the four were
 * byte-identical to `hard@desktop` and the fourth was the default with
 * BankExcess back at 100 despite being named `bootstrap-pc`. An arm whose name
 * lies is worse than no arm, so they were replaced by three that subtract.
 */
describe('the hand-prior repair arms (factor `weights`)', () => {
  const REPAIR_ARMS = ['weights-bootstrap-m6', 'weights-bank100', 'weights-no-priors'] as const;

  it('retired the four scratch arms whose names stopped being true', () => {
    for (const gone of ['hand-priors', 'hand-priors-pc', 'bootstrap-pc', 'bank25-pc']) {
      expect(findArm(gone), gone).toBeUndefined();
    }
    for (const name of REPAIR_ARMS) expect(requireArm(name).factor).toBe('weights');
  });

  it('weights-bootstrap-m6 IS the retired bootstrap, built from the list and not from the default', () => {
    const w = armHardConfig('weights-bootstrap-m6').weights;
    expect([...w.w].flatMap((value, index) => value ? [[index, value]] : []))
      .toEqual(BOOTSTRAP_M6_NONZERO.map(pair => [...pair]));
    // The same five entries `tests/ai/hard/fixtures/hand-priors-nonzero.ts`
    // holds for the eval tests: one bootstrap, two copies, asserted equal.
    expect(weightsHash(w)).toBe(weightsHash(sparseWeights(BOOTSTRAP_M6_NONZERO, w.label)));
    // And it is emphatically NOT the default, which is the bug in the arms it
    // replaced: three of those four hashed to the champion.
    expect(weightsHash(w)).not.toBe(weightsHash(DEFAULT_WEIGHTS));
    expect(requireArm('weights-bootstrap-m6').configHash).not.toBe(DESKTOP_WALL3000_HASH);
  });

  it('weights-bank100 moves the bank discount and nothing else', () => {
    const w = armHardConfig('weights-bank100').weights;
    expect(w.w[F.BankExcess]).toBe(100);
    expect(DEFAULT_WEIGHTS.w[F.BankExcess]).toBe(25);
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (i === F.BankExcess) continue;
      expect(w.w[i], `bank100 leaves w[${i}] alone`).toBe(DEFAULT_WEIGHTS.w[i]);
    }
  });

  it('weights-no-priors keeps the discount and drops the 38 tactical coefficients', () => {
    const w = armHardConfig('weights-no-priors').weights;
    expect([...w.w].flatMap((value, index) => value ? [[index, value]] : [])).toEqual([
      [F.Material, 100], [F.BankLiquid, 100], [F.BankExcess, 25], [F.EconDelta, 100], [F.PendingValue, 1],
    ]);
    // It differs from the bootstrap arm in exactly one entry: the discount.
    const bootstrap = armHardConfig('weights-bootstrap-m6').weights;
    const differing = [...w.w].flatMap((value, index) => value === bootstrap.w[index] ? [] : [index]);
    expect(differing).toEqual([F.BankExcess]);
    // And from the default in the 38 priors the repair added beside the discount.
    expect(HAND_PRIORS_NONZERO).toHaveLength(43);
    const fromDefault = [...w.w].flatMap((value, index) => value === DEFAULT_WEIGHTS.w[index] ? [] : [index]);
    expect(fromDefault).toHaveLength(38);
  });

  it('gives all three a hash of their own, distinct from each other and the champion', () => {
    const hashes = REPAIR_ARMS.map(n => requireArm(n).configHash);
    expect(new Set(hashes).size).toBe(REPAIR_ARMS.length);
    for (const h of hashes) {
      expect(h).not.toBe(DESKTOP_WALL3000_HASH);
      expect(h).not.toBe(requireArm('base').configHash);
    }
    for (const name of REPAIR_ARMS) {
      expect(armHardConfig(name).weights.label).not.toBe(BASE_WEIGHTS_LABEL);
      expect(armHardConfig(name).weights.version).toBe(WEIGHTS_VERSION);
      // An arm prices a judgment change, never a catalogue one.
      expect([...armHardConfig(name).weights.material]).toEqual([...DEFAULT_WEIGHTS.material]);
    }
  });
});

describe('E4 lane 7: the combined arm and the per-weight safety keep arms', () => {
  it("combined carries eval-no-safety's weight vector and eval-correct-v1's evalFix bundle, and reports two factors", () => {
    const arm = requireArm('combined');
    expect(arm.factor).toBe('combined');
    const cfg = armHardConfig('combined');
    const safetyVector = armHardConfig('eval-no-safety').weights;
    expect([...cfg.weights.w]).toEqual([...safetyVector.w]);
    expect(cfg.weights.label).toBe(`${BASE_WEIGHTS_LABEL}-no-safety`);
    expect(cfg.weights.version).toBe(WEIGHTS_VERSION);
    expect(cfg.evalFix).toEqual(armHardConfig('eval-correct-v1').evalFix);
    expect(cfg.evalFix).toEqual({
      rot180TieOrder: true,
      infiltrationPerAnchor: true,
      inv3RetreatConjunct: true,
      rentOnce: true,
      approachTieOrder: true,
    });
    expect(arm.configHash).not.toBe(requireArm('eval-no-safety').configHash);
    expect(arm.configHash).not.toBe(requireArm('eval-correct-v1').configHash);
    expect(arm.configHash).not.toBe(DESKTOP_WALL3000_HASH);
  });

  it('registers one single-weight keep arm per safety weight, in EVAL_GROUPS.safety order', () => {
    // `\d+` excludes the follow-up `eval-no-safety-keep-anchor` (three
    // weights, not indexed by a single `F.*` position), pinned separately
    // below.
    const keepArms = armNames().filter(n => /^eval-no-safety-keep-\d+$/.test(n));
    expect(keepArms).toEqual(EVAL_GROUPS.safety.map(i => `eval-no-safety-keep-${i}`));
    // 19 under Standard; M6's `ArrivalThreat` and `DisruptPressure` made it 21.
    expect(keepArms.length).toBe(21);
    expect(keepArms.length).toBe(EVAL_GROUPS.safety.length);
    for (const name of keepArms) expect(requireArm(name).factor).toBe('weights');
  });

  it('each keep arm differs from eval-no-safety in exactly the restored index, and equals default-v1 there', () => {
    const noSafety = armHardConfig('eval-no-safety').weights;
    for (const i of EVAL_GROUPS.safety) {
      const w = armHardConfig(`eval-no-safety-keep-${i}`).weights;
      for (let f = 0; f < FEATURE_COUNT; f++) {
        if (f === i) {
          expect(w.w[f], `keep-${i} w[${f}] (the restored weight)`).toBe(DEFAULT_WEIGHTS.w[f]);
        } else {
          expect(w.w[f], `keep-${i} w[${f}]`).toBe(noSafety.w[f]);
        }
      }
      expect(w.label).toBe(`${BASE_WEIGHTS_LABEL}-no-safety-keep-${i}`);
      expect(w.version).toBe(WEIGHTS_VERSION);
      expect(w.version).not.toBe(0);
      expect([...w.material]).toEqual([...DEFAULT_WEIGHTS.material]);
    }
  });

  it('gives every keep arm (and combined) a hash of its own, distinct from every other arm and from the champion', () => {
    const names = ['combined', ...EVAL_GROUPS.safety.map(i => `eval-no-safety-keep-${i}`)];
    const hashes = names.map(n => requireArm(n).configHash);
    expect(new Set(hashes).size).toBe(names.length);
    for (const h of hashes) {
      expect(h).not.toBe(DESKTOP_WALL3000_HASH);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
    // The champion itself is untouched by any of this section.
    expect(resolvedConfigHash('hard@desktop', ARM_HASH_WORK)).toBe(DESKTOP_WALL3000_HASH);
    expect(requireArm('base').configHash).toBe(DESKTOP_WALL3000_HASH);
  });

  it('reaches a LIVE evaluator with the restored weight (engine.ctx.eval.currentWeights)', () => {
    const sample = EVAL_GROUPS.safety[0];
    const engine = new HardEngine(hardEnginePatch(`ablate:eval-no-safety-keep-${sample}`));
    const live = engine.ctx.eval.currentWeights;
    expect(live.label).toBe(`${BASE_WEIGHTS_LABEL}-no-safety-keep-${sample}`);
    expect(live.version).toBe(WEIGHTS_VERSION);
    expect(live.w[sample]).toBe(DEFAULT_WEIGHTS.w[sample]);
    for (const i of EVAL_GROUPS.safety) if (i !== sample) expect(live.w[i]).toBe(0);
    // The champion's own build is unaffected in the same process.
    const champion = new HardEngine(hardEnginePatch('desktop'));
    expect(champion.ctx.eval.currentWeights.label).toBe(DEFAULT_WEIGHTS.label);
  });

  /**
   * Coordinator follow-up after phase 1 of `chain-followon.sh` ran (the 19
   * single-weight keep arms, `spawn-strike-400k`): restoring any ONE of F35
   * `AnchorFragility`, F36 `BlockingDeficit`, F43 `Inv6FragileAnchor` alone
   * wins `spawn-strike-purchase-1` back; `eval-no-safety-keep-anchor`
   * restores all three together. Pinned the same way the 19 single-weight
   * arms are above: exact-diff from `eval-no-safety`, `default-v1` at the
   * restored indices, a hash of its own.
   */
  it('eval-no-safety-keep-anchor restores F35+F36+F43 together and differs from eval-no-safety only there', () => {
    const ANCHOR_INDICES: number[] = [F.AnchorFragility, F.BlockingDeficit, F.Inv6FragileAnchor];
    expect(ANCHOR_INDICES).toEqual([35, 36, 43]);
    const arm = requireArm('eval-no-safety-keep-anchor');
    expect(arm.factor).toBe('weights');
    const noSafety = armHardConfig('eval-no-safety').weights;
    const w = armHardConfig('eval-no-safety-keep-anchor').weights;
    for (let f = 0; f < FEATURE_COUNT; f++) {
      if (ANCHOR_INDICES.includes(f)) {
        expect(w.w[f], `keep-anchor w[${f}] (a restored weight)`).toBe(DEFAULT_WEIGHTS.w[f]);
      } else {
        expect(w.w[f], `keep-anchor w[${f}]`).toBe(noSafety.w[f]);
      }
    }
    expect(w.label).toBe(`${BASE_WEIGHTS_LABEL}-no-safety-keep-anchor`);
    expect(w.version).toBe(WEIGHTS_VERSION);
    expect(w.version).not.toBe(0);
    expect([...w.material]).toEqual([...DEFAULT_WEIGHTS.material]);

    // Distinct from every one of the 19 single-weight keep arms, from
    // eval-no-safety itself, from combined, and from the champion.
    const otherHashes = [
      ...EVAL_GROUPS.safety.map(i => requireArm(`eval-no-safety-keep-${i}`).configHash),
      requireArm('eval-no-safety').configHash,
      requireArm('combined').configHash,
      DESKTOP_WALL3000_HASH,
    ];
    expect(otherHashes).not.toContain(arm.configHash);
    expect(arm.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(resolvedConfigHash('hard@desktop', ARM_HASH_WORK)).toBe(DESKTOP_WALL3000_HASH);
  });
});

describe('hard@ablate:<arm> label resolution (additive to the profile labels)', () => {
  it('resolves through hardConfigFor, the ladder registry and identity.ts', () => {
    expect(hardConfigFor('ablate:k96').gen?.K).toBe(96);
    expect(resolveEngine('hard@ablate:k96').name).toBe('hard@ablate:k96');
    expect(resolveEngine('hard@ablate:k96').configHash(parseWorkSpec('wall:3000'))).toBe(
      `hard:ablate:k96:wall:3000#${resolvedConfigHash('hard@ablate:k96', ARM_HASH_WORK)}`,
    );
  });

  it('refuses an unknown arm with the list of known ones', () => {
    expect(() => hardConfigFor('ablate:nope')).toThrow(/unknown arm "nope"/);
    expect(() => hardConfigFor('ablate:nope')).toThrow(/k96/);
    expect(() => resolveEngine('hard@ablate:')).toThrow(/unknown arm/);
  });

  it('is not an ablation label unless it says ablate:', () => {
    expect(ablationConfigFor('desktop')).toBeNull();
    expect(ablationConfigFor('lab-400k')).toBeNull();
    expect(findArm('desktop')).toBeUndefined();
  });

  it('leaves hard@desktop exactly as it was', () => {
    expect(resolvedConfigHash('hard@desktop', ARM_HASH_WORK)).toBe(DESKTOP_WALL3000_HASH);
    expect(resolvedConfigHash('hard@lab', ARM_HASH_WORK)).toBe(DESKTOP_WALL3000_HASH);
    // `base` IS desktop, which is the point of having it: the arm that changes
    // nothing must be indistinguishable from the profile it ablates.
    expect(requireArm('base').configHash).toBe(DESKTOP_WALL3000_HASH);
    expect(resolveEngine('hard@desktop').configHash(parseWorkSpec('wall:3000'))).toBe(
      `hard:desktop:wall:3000#${DESKTOP_WALL3000_HASH}`,
    );
  });
});

// --- the runner --------------------------------------------------------------

function stubArgs(over: Partial<AblateArgs> = {}): AblateArgs {
  return { ...parseArgs([]), heavy: false, ...over };
}

function stubRun(arm: string, metrics: Record<string, unknown>): ArmRun {
  const a = requireArm(arm);
  return {
    arm: a.name,
    factor: a.factor,
    change: a.change,
    engine: armEngineName(a.name),
    configHash: a.configHash,
    wallMs: 12_345,
    artifact: `lab/results/hard-ai-e1/ablate/${a.name}/recall.json`,
    metrics,
  };
}

const STUB_METRICS = {
  top1: 0.5125,
  top3: 0.7,
  top1Share: 0.8,
  regret_p50: 140,
  regret_p90: 620,
  ceilingTop1: 0.64,
  replyTop1: 0.41,
  illegalTurns: 0,
  emptyLists: 0,
  positions: 80,
  replyPositions: 40,
};

describe('the comparison table (E1.3: compare diagnostic quality)', () => {
  it('reads every reported column off the recall artifact', () => {
    const row = comparisonRow(stubRun('k96', STUB_METRICS));
    expect(row).toMatchObject({
      arm: 'k96',
      factor: 'K',
      top1: 0.5125,
      top3: 0.7,
      top1Share: 0.8,
      regretP50: 140,
      regretP90: 620,
      ceilingTop1: 0.64,
      replyTop1: 0.41,
      illegalTurns: 0,
      emptyLists: 0,
      positions: 80,
      replyPositions: 40,
      wallMs: 12_345,
    });
    expect(row.configHash).toBe(requireArm('k96').configHash);
  });

  it('treats a missing metric as 0 rather than NaN or undefined', () => {
    const row = comparisonRow(stubRun('base', {}));
    expect(Object.values(row).every(v => typeof v !== 'number' || Number.isFinite(v))).toBe(true);
    expect(row.top1).toBe(0);
  });

  it('labels the reference SELECTIVE in the table itself', () => {
    const table = formatComparison([comparisonRow(stubRun('base', STUB_METRICS))]);
    expect(table).toContain(SELECTIVE_REFERENCE_LABEL);
    expect(table).toContain('120,000-node cap');
  });

  it('renders one aligned row per arm, with the config hash', () => {
    const table = formatComparison([
      comparisonRow(stubRun('base', STUB_METRICS)),
      comparisonRow(stubRun('k96', { ...STUB_METRICS, top1: 0.6 })),
    ]);
    const lines = table.split('\n');
    expect(lines[0]).toContain('arm');
    expect(lines[0]).toContain('configHash');
    expect(lines[2]).toContain('base');
    expect(lines[3]).toContain('k96');
    expect(lines[3]).toContain('0.6000');
    expect(lines[2]).toContain(requireArm('base').configHash.slice(0, 12));
    expect(new Set(lines.slice(0, 4).map(l => l.length)).size).toBe(1);
  });

  it('says an interior-only arm cannot move a root column, and says it of the interior arm ONLY', () => {
    const table = formatComparison([
      comparisonRow(stubRun('base', STUB_METRICS)),
      comparisonRow(stubRun('reply-wide', STUB_METRICS)),
      // A13-1: a weights arm and an evalFix arm are root-diagnostic now, so the
      // footnote must not sweep them into the interior-only list and tell their
      // reader to "read replyTop1" — every one of their columns moves.
      comparisonRow(stubRun('eval-no-safety', STUB_METRICS)),
      comparisonRow(stubRun('eval-correct-v1', STUB_METRICS)),
    ]);
    const footnote = table.split('\n').find(l => l.startsWith("root columns are base's by construction for"))!;
    expect(footnote).toBeDefined();
    expect(footnote).toContain('reply-wide');
    expect(footnote).not.toContain('eval-no-safety');
    expect(footnote).not.toContain('eval-correct-v1');
    expect(footnote).toContain('read replyTop1');
    // A13-2: what a weights/evalFix arm gets instead — every column moves, and
    // the depth-2 truth moves with it, so two such arms share no yardstick.
    const scored = table.split('\n').find(l => l.includes('score the depth-2 leaves with their own evaluator'))!;
    expect(scored).toBeDefined();
    expect(scored.startsWith('eval-no-safety, eval-correct-v1:')).toBe(true);
    expect(scored).not.toContain('reply-wide');
    expect(scored).toContain('never against each other');
  });

  it('says so when an arm reached no reply node at all', () => {
    const table = formatComparison([comparisonRow(stubRun('base', { ...STUB_METRICS, replyPositions: 0 }))]);
    expect(table).toContain('no reply node was reached for: base');
  });
});

describe('runArm (the child process and the heavy slot are seams)', () => {
  it('passes the arm, the corpus, the budget and the interior reply node to recall', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablate-test-'));
    try {
      let seen: string[] = [];
      const run = await runArm(
        stubArgs({ outDir: dir, replyPositions: 7, deep: 111, shards: 1 }),
        requireArm('k48'),
        '/corpus/derived.jsonl',
        23,
        {
          spawn: async (argv: string[]) => {
            seen = argv;
            const out = path.join(dir, 'k48', 'recall.json');
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, JSON.stringify(STUB_METRICS));
          },
        },
      );
      expect(seen).toContain('--arm');
      expect(seen[seen.indexOf('--arm') + 1]).toBe('k48');
      expect(seen[seen.indexOf('--corpus') + 1]).toBe('/corpus/derived.jsonl');
      expect(seen[seen.indexOf('--positions') + 1]).toBe('23');
      expect(seen[seen.indexOf('--reply-positions') + 1]).toBe('7');
      expect(seen[seen.indexOf('--deep') + 1]).toBe('111');
      expect(seen[seen.indexOf('--reply-node-gen') + 1]).toBe('interior');
      expect(run.configHash).toBe(requireArm('k48').configHash);
      expect(run.metrics.top1).toBe(0.5125);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('holds one heavy slot per arm and hands it to the child', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablate-test-'));
    try {
      let released = 0;
      let reassignedTo = 0;
      const release: ReleaseSlot = () => {
        released++;
      };
      await runArm(stubArgs({ outDir: dir, heavy: true }), requireArm('base'), '/c.jsonl', 4, {
        acquireSlot: async () => release,
        reassign: (_r, pid) => {
          reassignedTo = pid;
          return true;
        },
        spawn: async (_argv, onSpawn) => {
          onSpawn?.(4242);
          const out = path.join(dir, 'base', 'recall.json');
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, JSON.stringify(STUB_METRICS));
        },
      });
      expect(reassignedTo).toBe(4242);
      expect(released).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the equal-time pricing plan (E1.3: survive an equal-time contest)', () => {
  it('prices every arm against hard@desktop on the VALIDATION stratum', () => {
    const cmd = ladderCommand('k96');
    expect(cmd).toContain('--a hard@ablate:k96 --b hard@desktop');
    expect(cmd).toContain('--work wall:3000');
    expect(cmd).toContain('--handicaps 0,3');
    expect(cmd).toContain(`--pairs ${LADDER_PAIRS_PER_HANDICAP * 2}`);
    expect(cmd).toContain('--shards 2');
    expect(cmd).toContain(`--openings ${LADDER_OPENINGS}`);
    expect(cmd).toContain(`--seed ${armLadderSeed('k96')}`);
    expect(cmd).toContain('--out lab/results/hard-ai-e1/ablate/k96/ladder');
  });

  it('never prices against the sealed or development strata', () => {
    const plan = ladderPlan(armNames());
    expect(plan).not.toContain('e1-sealed');
    expect(plan).not.toContain('e1-dev');
    expect(plan).toContain('e1-val.jsonl');
  });

  it('flags base as the A/A control it is', () => {
    expect(ladderPlan(['base'])).toContain('A/A control');
  });

  it('prints and runs nothing else', () => {
    const plan = ladderPlan(armNames());
    for (const name of armNames()) expect(plan).toContain(armEngineName(name));
  });
});

describe('argument parsing and the corpus rules block', () => {
  it('defaults to every arm and the derived corpus', () => {
    const args = parseArgs([]);
    expect(args.corpus).toBe('derived');
    expect(args.arms).toEqual(armNames());
    expect(args.heavy).toBe(true);
    expect(args.positions).toBeNull();
  });

  it('refuses to shard under the heavy queue', () => {
    expect(() => parseArgs(['--shards', '2'])).toThrow(/--shards > 1 needs --no-heavy/);
    expect(parseArgs(['--shards', '2', '--no-heavy']).shards).toBe(2);
  });

  it('refuses an unknown arm before any work happens', () => {
    expect(() => parseArgs(['--arms', 'k96,nope'])).toThrow(/unknown arm "nope"/);
    expect(() => parseArgs(['--nope'])).toThrow(/unrecognised argument/);
  });

  it('carries every rules knob a stored position needs out of MatchOptions', () => {
    const options: MatchOptions = {
      ...DEFAULT_MATCH_OPTIONS,
      elementGraph: 'dual-triangle',
      upkeep: 'steep',
      inactivityRule: 'off',
      victoryRule: 'elimination',
      blackCrystalHandicap: 4,
      handicap: { white: 1, black: 2 },
    };
    expect(rulesFromOptions(options, { victoryRule: 'home-or-elimination' } as GameState)).toEqual({
      elementGraph: 'dual-triangle',
      upkeep: 'steep',
      inactivityRule: 'off',
      victoryRule: 'elimination',
      handicap: 4,
      combatHandicap: { white: 1, black: 2 },
    });
    // Defaults fall back to the position's own rule, then to the shipped one.
    expect(rulesFromOptions(DEFAULT_MATCH_OPTIONS, { victoryRule: 'elimination' } as GameState).victoryRule).toBe('elimination');
    expect(rulesFromOptions(DEFAULT_MATCH_OPTIONS, {} as GameState).upkeep).toBe('shipped');
  });
});

/**
 * E3 lane 13, after A8 / L5-A1 landed in `lab/hard-ai/recall/run.ts`.
 *
 * L5-A1 proposed defaulting `hard:ablate --arms` to the arms whose factor is
 * not `weights`, because the recall instrument could not see a weight change
 * and `npm run hard:ablate` with no `--arms` would spend six heavy-slot recall
 * runs reproducing `base`'s numbers. Lane 12's A8 said the same of the six
 * `evalFix` arms. That premise is gone: `recallEnginePatch(arm)` now resolves
 * the arm's weight vector and `evalFix` block and stamps them on the evaluator
 * and both `NodeTables`, so those fifteen arms (nine `weights`, six `evalFix`) move real recall columns
 * (measured on 20 root + 10 reply positions of `fuzz-1000.jsonl`:
 * `eval-no-safety` top1 .30 -> .35, replyTop1 .20 -> .30, regret_p90
 * 1,432 -> 931 cc; `eval-correct-v1` top3 .50 -> .45).
 *
 * So the default list is LEFT ALONE and this block records why.
 *
 * The two things lane 13 could not apply from here, because `ablate/arms.ts`
 * and `formatComparison` were not its files, are applied by E3 lane 15:
 * A13-1 flipped `rootDiagnostic` to `true` on every `weights` and `evalFix` arm
 * (sixteen now: nine `weights`, seven `evalFix` — lane 14's `eval-fix-b6`
 * joined after lane13.md counted fifteen), and A13-2 replaced
 * `formatComparison`'s "read replyTop1" advice for them with the depth-2-truth
 * sentence. Both are asserted below.
 */
describe('hard:ablate keeps every arm in its default list (L5-A1 / A8 resolved)', () => {
  it('defaults --arms to every registered arm, weights and evalFix included', () => {
    const args = parseArgs([]);
    expect(args.arms).toEqual(armNames());
    for (const name of [...ALL_WEIGHT_ARMS, ...CORRECT_ARMS]) expect(args.arms).toContain(name);
  });

  it('is justified because a weights arm is no longer an A/A recall run', () => {
    const base = recallEnginePatch('base');
    const arm = recallEnginePatch('eval-no-safety');
    expect(base.weights?.label).toBe(BASE_WEIGHTS_LABEL);
    expect(arm.weights?.label).toBe(`${BASE_WEIGHTS_LABEL}-no-safety`);
    expect(arm.weights).not.toBe(base.weights);
  });

  it('is justified for an evalFix arm too', () => {
    expect(recallEnginePatch('base').evalFix).toBeUndefined();
    expect(recallEnginePatch('eval-fix-b5').evalFix).toEqual({ rentOnce: true });
  });

  it('records the two amendments as APPLIED: the arms are root-diagnostic and the footnote no longer names them', () => {
    // A13-1, applied in `ablate/arms.ts` by lane 15.
    for (const name of [...ALL_WEIGHT_ARMS, ...CORRECT_ARMS]) {
      expect(requireArm(name).rootDiagnostic).toBe(true);
    }
    // A13-2: the "root columns are base's by construction" footnote is what
    // `rootDiagnostic: false` prints, so it must not name any of them now.
    const rows: ComparisonRow[] = [...ALL_WEIGHT_ARMS, ...CORRECT_ARMS].map(name => ({
      arm: name,
      factor: requireArm(name).factor,
      change: requireArm(name).change,
      top1: 0,
      top3: 0,
      top1Share: 0,
      regretP50: 0,
      regretP90: 0,
      ceilingTop1: 0,
      replyTop1: 0,
      illegalTurns: 0,
      emptyLists: 0,
      positions: 1,
      replyPositions: 1,
      wallMs: 0,
      configHash: requireArm(name).configHash,
    }));
    const table = formatComparison(rows);
    expect(table).not.toContain('root columns are base\'s by construction for');
    // A13-2: the sentence that replaced that advice for them, naming them all.
    expect(table).toContain('score the depth-2 leaves with their own evaluator');
    for (const name of [...ALL_WEIGHT_ARMS, ...CORRECT_ARMS]) expect(table).toContain(name);
  });
});
