// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadOpenings, sha256 } from '../../lab/hard-ai/ladder/openings';
import { applyOpening, gameplayDigest, RULES_VERSION } from '../../lab/hard-ai/ladder/openings/phasing';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING } from '../../src/game/inactivity';
import { generateOpenings, renderOpeningsFile, assertDiverse, DRIVER_BOTS } from '../../lab/hard-ai/ladder/openings/generate';
import { seededShuffle } from '../../lab/hard-ai/ladder/openings/split';

const dir = path.resolve(import.meta.dirname, '../../lab/hard-ai/ladder/openings');
const allocation = fs.readFileSync(path.join(dir, 'ALLOCATION-P1.md'), 'utf8');
// Deliberately never load or regenerate the sealed allocation.
const files = ['p1-dev.jsonl', 'p1-val.jsonl'].map(name => loadOpenings(path.join(dir, name)));

describe('P1 unsealed corpus', () => {
  it('matches pinned counts, bytes and hashes in the allocation', () => {
    for (const file of files) {
      const name = path.basename(file.path);
      const declared = allocation.split('\n').find(line => line.startsWith(`| \`${name}\` |`))!.split('|').map(x => x.trim());
      expect(file.openings).toHaveLength(Number(declared[2]));
      expect(fs.statSync(file.path).size).toBe(Number(declared[3]));
      expect(file.sha256).toBe(declared[4].replaceAll('`', ''));
    }
    expect(fs.existsSync(path.join(dir, 'p1-sealed.jsonl'))).toBe(false);
  });

  it('replays both handicaps to Black first Act, with only the bank differing', () => {
    for (const file of files) for (const opening of file.openings) {
      const h0 = applyOpening(opening);
      const h3 = applyOpening(opening, { blackCrystalHandicap: 3 });
      expect(h0.ruleset).toBe('phasing');
      expect(h0.turn).toEqual({ currentPlayer: 'black', phase: 'action', actionsRemaining: 4, turnNumber: 1 });
      expect(opening.actions.at(-1)?.type).toBe('END_PLACE_PHASE');
      expect(h3.players.black.resources - h0.players.black.resources).toBe(3);
      const normalized = { ...h3, players: { ...h3.players, black: { ...h3.players.black, resources: 0 } } };
      expect(gameplayDigest(normalized)).toBe(gameplayDigest(h0));
    }
  });

  /**
   * WHY THE BOOK SURVIVED THE RULES REVISION, measured rather than asserted.
   *
   * Preregistration amendment A4 (2026-09-19) moved the inactivity draw clock
   * from 10 plies to 20 and advanced the rules revision to `muju-phasing-2`,
   * voiding every row measured under `muju-phasing-1`. It did NOT void the
   * opening books, and this is the check behind that claim: by the stop rule
   * recorded in `ALLOCATION-P1.md` every opening ends at Black's first Act root
   * after a single hand-off, so the clock an opening hands to a run is 1 — six
   * short of even the OLD warning threshold and nineteen short of the new
   * limit. No opening position is one the two limits treat differently, so the
   * bytes and hashes pinned above stay valid under either revision and the
   * books were not regenerated.
   *
   * The sealed book is NOT opened to check this, here or anywhere. It shares
   * the generator and the stop rule, and A4 rests on that rule rather than on
   * an inspection of sealed rows.
   */
  it('hands every run a clock of 1, far below either revision limit, which is why the pinned bytes survive A4 and the kill clock', () => {
    // The superseded (A4) limit, written out because the claim is a comparison
    // across revisions. `src/game/inactivity.ts` holds the live one, which is
    // now `muju-phasing-3` (owner decision 2026-09-22, the KILL CLOCK) — back
    // to ten plies, the SAME number `muju-phasing-1` had (verdict differs, but
    // this test only needs the limit and the warning, both of which coincide).
    // `RULES_VERSION` here is `HARNESS_RULES_VERSION`
    // (`lab/harness/types.ts`), which the coordinator advanced to
    // `muju-phasing-3` on 2026-09-22 (the kill clock) — the p2-scripted-
    // 2026-09-19 reference campaign that used to pin it at `muju-phasing-2`
    // is now itself a `current: false` row in
    // `tests/lab/phasing-evidence.test.ts`'s `PHASING3_HARNESS_EDITS` list, so
    // asserting the live constant here is tracking identity, not re-pinning a
    // frozen value that should have stayed put.
    const PHASING_1_LIMIT = 10, PHASING_1_WARNING = 7;
    // `muju-phasing-4` (2026-09-23) keeps the kill clock and only lifts the
    // Cleave tier cap, which no opening's clock of 1 can touch.
    expect(RULES_VERSION).toBe('muju-phasing-4');
    expect(INACTIVITY_LIMIT).toBe(10);
    expect(INACTIVITY_WARNING).toBe(7);

    const clocks: number[] = [];
    for (const file of files) for (const opening of file.openings) for (const blackCrystalHandicap of [0, 3]) {
      const state = applyOpening(opening, { blackCrystalHandicap });
      const clock = state.inactivityPlies ?? 0;
      const where = `${path.basename(file.path)} ${opening.id} h${blackCrystalHandicap}`;
      // One hand-off, and no opening contains an attack that could reset it.
      expect(clock, where).toBe(1);
      // The property A4 actually needs: below every threshold of both
      // revisions, so neither limit can have fired and neither warning shows.
      expect(clock, where).toBeLessThan(Math.min(PHASING_1_WARNING, INACTIVITY_WARNING));
      expect(clock, where).toBeLessThan(Math.min(PHASING_1_LIMIT, INACTIVITY_LIMIT));
      expect(state.progressThisTurn ?? false, where).toBe(false);
      clocks.push(clock);
    }
    // 48 dev + 32 val rows, each replayed at both handicaps.
    expect(clocks).toHaveLength((48 + 32) * 2);
    expect(Math.max(...clocks)).toBe(1);
  });

  it('has distinct IDs, pending-aware positions, and no prefix relation', () => {
    const rows = files.flatMap(f => f.openings).map(spec => ({ spec, digest: gameplayDigest(applyOpening(spec)), plies: spec.actions.length, driver: '' }));
    expect(new Set(rows.map(o => o.spec.id)).size).toBe(80);
    expect(() => assertDiverse(rows)).not.toThrow();
  });

  it('does not collide pending types/costs/squares or depend on generated IDs', () => {
    const state = files.flatMap(f => f.openings).map(o => applyOpening(o)).find(s => s.pendingSummons!.length > 0)!;
    const original = gameplayDigest(state);
    const pending = state.pendingSummons!;
    expect(gameplayDigest({ ...state, pendingSummons: [...pending].reverse().map(s => ({ ...s, id: `new-${s.id}` })) })).toBe(original);
    for (const change of [{ cost: pending[0].cost + 1 }, { definitionId: 'different' }, { position: { x: 9, y: 9 } }, { owner: 'black' as const }]) {
      expect(gameplayDigest({ ...state, pendingSummons: [{ ...pending[0], ...change }, ...pending.slice(1)] })).not.toBe(original);
    }
    expect(() => applyOpening({ id: 'e0-archive', actions: [] })).toThrow(/non-p1/);
    expect(() => gameplayDigest({ ...state, ruleset: 'standard' })).toThrow(/requires Phasing/);
  });
});

describe('P1 generator on independent test seeds', () => {
  it('is deterministic and uses the scripted driver set without an engine', () => {
    const options = { count: 16, seed: 77, idPrefix: 'p1-test-' };
    const a = generateOpenings(options), b = generateOpenings(options);
    expect(sha256(renderOpeningsFile(a.openings))).toBe(sha256(renderOpeningsFile(b.openings)));
    expect(new Set(a.openings.map(o => o.driver))).toEqual(new Set(DRIVER_BOTS));
    const rows = a.openings.map(o => o.spec);
    expect(seededShuffle(rows, 88)).toEqual(seededShuffle(rows, 88));
    expect(rows).toEqual(a.openings.map(o => o.spec));
  });
});
