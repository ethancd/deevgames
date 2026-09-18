// @vitest-environment node
/**
 * `lab/hard-ai/analyze/replay.ts withMatchRules` — the rules globals must stay
 * installed for as long as the callback runs, including across an `await`.
 *
 * `setElementGraph`, `setUpkeepVariant` and `setCombatHandicap` are module
 * globals in `src/game`, and both the canonical engine and the packed replica
 * read them. `analyzeReplay` wraps its whole per-turn loop — every adviser and
 * production search — in one `withMatchRules` scope with an `async` callback.
 * An `async` callback returns a pending promise at its first `await`, so a
 * plain `try/finally` would restore the SHIPPED defaults right there and hand
 * every later search the wrong rules. That is invisible on a run whose options
 * happen to BE the defaults (E0 and E1.1 both are), which is exactly why it
 * needs a test rather than an eyeball.
 */
import { describe, expect, it } from 'vitest';
import { getElementGraph } from '../../src/game/elements';
import { setUpkeepVariant, upkeepForTier } from '../../src/game/upkeep';
import { withMatchRules } from '../../lab/hard-ai/analyze/replay';
import { DEFAULT_MATCH_OPTIONS, type MatchOptions } from '../../lab/harness/types';

/** Options that differ from the shipped defaults in both observable globals. */
const NON_DEFAULT: MatchOptions = {
  ...DEFAULT_MATCH_OPTIONS,
  elementGraph: 'none',
  upkeep: 'off',
  handicap: { white: 0, black: 0 },
};

function globals(): { graph: string; upkeepTier2: number } {
  return { graph: getElementGraph(), upkeepTier2: upkeepForTier(2) };
}

const SHIPPED = { graph: 'double-thick', upkeepTier2: 1 };
const INSTALLED = { graph: 'none', upkeepTier2: 0 };

describe('withMatchRules', () => {
  it('installs the run\'s rules and restores the shipped defaults around a synchronous callback', () => {
    expect(globals()).toEqual(SHIPPED);
    const seen = withMatchRules(NON_DEFAULT, () => globals());
    expect(seen).toEqual(INSTALLED);
    expect(globals()).toEqual(SHIPPED);
  });

  it('keeps the rules installed ACROSS an await inside an async callback', async () => {
    const seen: ReturnType<typeof globals>[] = [];
    const promise = withMatchRules(NON_DEFAULT, async () => {
      seen.push(globals()); // before any await
      await Promise.resolve();
      seen.push(globals()); // after one microtask
      await new Promise(resolve => setTimeout(resolve, 5));
      seen.push(globals()); // after a real macrotask
      return globals();
    });
    // The rules are STILL installed while that promise is pending.
    expect(globals()).toEqual(INSTALLED);
    const returned = await promise;
    expect(seen).toEqual([INSTALLED, INSTALLED, INSTALLED]);
    expect(returned).toEqual(INSTALLED);
    // And restored once it settles.
    expect(globals()).toEqual(SHIPPED);
  });

  it('restores the shipped defaults when an async callback rejects', async () => {
    await expect(
      withMatchRules(NON_DEFAULT, async () => {
        await Promise.resolve();
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(globals()).toEqual(SHIPPED);
  });

  it('restores the shipped defaults when a synchronous callback throws', () => {
    expect(() => withMatchRules(NON_DEFAULT, () => {
      throw new Error('boom');
    })).toThrow('boom');
    expect(globals()).toEqual(SHIPPED);
    setUpkeepVariant('shipped');
  });
});
