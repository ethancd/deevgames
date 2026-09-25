// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { armNames } from '../../lab/hard-ai/ablate/arms';
import { hardConfigFor, hardEnginePatch } from '../../lab/hard-ai/bots/hard';
import { canonicalJson, resolvedConfig, resolvedConfigHash, type ResolvedHardConfig } from '../../lab/hard-ai/ladder/identity';
import type { WorkSpec } from '../../lab/hard-ai/ladder/engines';
import { DESKTOP, LAB, MIDRANGE, PHONE, strategosPatch, type EvalFix, type HardConfig, type SearchFix } from '../../src/ai/hard/config';
import { WEIGHTS_VERSION } from '../../src/ai/hard/eval/weights';

/**
 * STRATEGOS W1.1 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * B.2 step W1.1). Four things pinned here, each an acceptance item of that
 * step:
 *
 * 1. `hard@strategos`'s resolved-configuration hash differs from
 *    `hard@desktop`'s frozen one (`tests/lab/ablate.test.ts`'s
 *    `DESKTOP_WALL3000_HASH`), and `hard@desktop`'s own hash and canonical
 *    JSON are UNCHANGED by strategos existing at all.
 * 2. `hard@strategos`'s resolved weights are real: `weights.version !==
 *    0` — `hardEnginePatch`'s placeholder-vs-`DEFAULT_WEIGHTS` substitution
 *    reaches strategos exactly as it reaches desktop, since `strategosPatch()`
 *    carries no `weights` key of its own.
 * 3. The six new flags (`SearchFix.pruneZeroDamage/strategyPlans/
 *    strategyVeto/killClockPolicy`, `EvalFix.clockLedger/promoteExhaustive`)
 *    are absent from every SHIPPED profile and every OTHER `hardConfigFor`
 *    label — `DESKTOP`, `MIDRANGE`, `PHONE`, `LAB` as objects, plus every
 *    string label `hardConfigFor` accepts, `ablate:<arm>` included.
 * 4. `hard@strategos`'s resolved `HardConfig` differs from `hard@desktop`'s in
 *    EXACTLY those six keys — "strategos = desktop + exactly these six
 *    flags, nothing else" (plan B.2, `strategosPatch`'s own doc comment).
 */

const DESKTOP_WALL3000_HASH = '5de7ae20ba0b448a632d159a1633f73c8dc3c4ec628bf9658b18f6c970673a0d';
const WALL: WorkSpec = { mode: 'wall', ms: 3000 };

/** Every string label `lab/hard-ai/bots/hard.ts hardConfigFor` accepts today
 * that is NOT `strategos`, static names first, then every registered
 * `ablate:<arm>` (plan W1.1's "every other hardConfigFor label"). */
function everyOtherLabel(): string[] {
  const static_ = ['', 'lab', 'lab-dfpn', 'lab-refined', 'desktop', 'env', 'midrange', 'phone', 'mobile'];
  return [...static_, ...armNames().map(name => `ablate:${name}`)];
}

/** Whether any of the six STRATEGOS flags is set on a resolved config. */
function hasAnyStrategosFlag(cfg: Partial<HardConfig>): boolean {
  const sf = cfg.searchFix as SearchFix | undefined;
  const ef = cfg.evalFix as EvalFix | undefined;
  return (
    sf?.pruneZeroDamage !== undefined ||
    sf?.strategyPlans !== undefined ||
    sf?.strategyVeto !== undefined ||
    sf?.killClockPolicy !== undefined ||
    ef?.clockLedger !== undefined ||
    ef?.promoteExhaustive !== undefined
  );
}

describe('hard@strategos identity (STRATEGOS W1.1)', () => {
  it("differs from hard@desktop's frozen hash, which is itself unmoved", () => {
    expect(resolvedConfigHash('hard@desktop', WALL)).toBe(DESKTOP_WALL3000_HASH);
    expect(resolvedConfigHash('hard@strategos', WALL)).not.toBe(DESKTOP_WALL3000_HASH);
    expect(resolvedConfigHash('hard@strategos', WALL)).not.toBe(resolvedConfigHash('hard@desktop', WALL));
  });

  it("hard@desktop's canonical JSON is byte-identical to before strategos existed", () => {
    // DESKTOP itself: no searchFix/evalFix key at all, so a strategos patch
    // sharing config.ts cannot have smuggled a key onto the shipped object.
    expect('searchFix' in DESKTOP).toBe(false);
    expect('evalFix' in DESKTOP).toBe(false);
    expect(canonicalJson(DESKTOP)).not.toContain('searchFix');
    expect(canonicalJson(DESKTOP)).not.toContain('evalFix');
    // And the resolved hard@desktop configuration the ladder actually plays.
    const resolved = resolvedConfig('hard@desktop', WALL) as ResolvedHardConfig;
    expect('searchFix' in resolved.config).toBe(false);
    expect('evalFix' in resolved.config).toBe(false);
  });

  it('resolves real (non-placeholder) weights, the same check the ablate arms carry', () => {
    const resolved = resolvedConfig('hard@strategos', WALL) as ResolvedHardConfig;
    expect(resolved.config.weights.version).toBe(WEIGHTS_VERSION);
    expect(resolved.config.weights.version).not.toBe(0);
    // hardEnginePatch's placeholder substitution, exercised directly (the
    // path every hard@* bot and every ladder row actually takes).
    const patched = hardEnginePatch('strategos').weights;
    expect(patched?.version).not.toBe(0);
    expect(patched?.label).not.toBe('placeholder-phasing');
  });

  it('the six flags are absent from DESKTOP, MIDRANGE, PHONE and LAB as objects', () => {
    for (const profile of [DESKTOP, MIDRANGE, PHONE, LAB]) {
      expect(hasAnyStrategosFlag(profile)).toBe(false);
    }
  });

  it('the six flags are absent from every hardConfigFor label except strategos', () => {
    for (const label of everyOtherLabel()) {
      const cfg = hardConfigFor(label);
      expect(hasAnyStrategosFlag(cfg), `label "${label || '(default)'}"`).toBe(false);
    }
  });

  it("strategosPatch() sets exactly the six flags and carries no weights key", () => {
    const patch = strategosPatch();
    expect(patch.weights).toBeUndefined();
    expect(patch.searchFix).toEqual({
      pruneZeroDamage: true,
      strategyPlans: true,
      strategyVeto: true,
      killClockPolicy: 'ledger',
    });
    expect(patch.evalFix).toEqual({ clockLedger: true, promoteExhaustive: true });
  });

  it('hard@strategos merges strategosPatch() onto hard@desktop\'s own resolution', () => {
    const desktop = hardConfigFor('desktop') as HardConfig;
    const strategos = hardConfigFor('strategos') as HardConfig;
    // Everything BUT searchFix/evalFix is byte-identical (the "desktop +"
    // half of "strategos = desktop + exactly these six flags").
    const strip = (cfg: HardConfig): Omit<HardConfig, 'searchFix' | 'evalFix'> => {
      const { searchFix: _searchFix, evalFix: _evalFix, ...rest } = cfg;
      return rest;
    };
    expect(canonicalJson(strip(strategos))).toBe(canonicalJson(strip(desktop)));
    // ...and the "exactly these six flags" half: desktop carries neither
    // block, strategos carries both, fully.
    expect(desktop.searchFix).toBeUndefined();
    expect(desktop.evalFix).toBeUndefined();
    expect(strategos.searchFix).toEqual({
      pruneZeroDamage: true,
      strategyPlans: true,
      strategyVeto: true,
      killClockPolicy: 'ledger',
    });
    expect(strategos.evalFix).toEqual({ clockLedger: true, promoteExhaustive: true });
  });

  it('MERGES onto, rather than replaces, whatever DESKTOP.searchFix/evalFix carry (not just today\'s empty case)', () => {
    // DESKTOP carries neither block today (asserted above), so this exercises
    // the merge branch a future DESKTOP addition would take: mutate the real
    // singleton `strategosPatch()` reads, call the REAL function, and confirm
    // it preserved the pre-existing key rather than clobbering the block —
    // then restore DESKTOP exactly, in a `finally`, so no other test in this
    // file or this worker sees the mutation.
    const priorSearchFix: SearchFix = { reachCache: true };
    const priorEvalFix: EvalFix = { rentOnce: true };
    expect(DESKTOP.searchFix).toBeUndefined();
    expect(DESKTOP.evalFix).toBeUndefined();
    try {
      DESKTOP.searchFix = priorSearchFix;
      DESKTOP.evalFix = priorEvalFix;
      const patch = strategosPatch();
      expect(patch.searchFix).toEqual({
        reachCache: true,
        pruneZeroDamage: true,
        strategyPlans: true,
        strategyVeto: true,
        killClockPolicy: 'ledger',
      });
      expect(patch.evalFix).toEqual({ rentOnce: true, clockLedger: true, promoteExhaustive: true });
    } finally {
      // `delete`, not `= undefined`: DESKTOP carries neither KEY today, and an
      // own key holding `undefined` would make `'searchFix' in DESKTOP` true.
      delete DESKTOP.searchFix;
      delete DESKTOP.evalFix;
    }
    expect('searchFix' in DESKTOP).toBe(false);
    expect('evalFix' in DESKTOP).toBe(false);
  });
});
