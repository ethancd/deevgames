// @vitest-environment node
/**
 * ONE quiet game, TWO readers of the same clock (rules revision
 * `muju-phasing-3`, owner decision 2026-09-22 — the KILL CLOCK).
 *
 * This file predates the kill clock: it used to walk the twenty-ply
 * inactivity DRAW across four readers (canonical, the Hard replica, the
 * legacy AIEngineV2 terminal oracle and the server observation surface). The
 * server/V2 readers are out of this lane's ownership (`muju/server/**`,
 * `muju/src/ai/*` outside `hard/`) and are not re-asserted here; this file now
 * pins what lane 2 owns — the CANONICAL engine (`src/ai/simulate.ts` /
 * `src/game`, read-only, FINAL for this campaign) against the Hard REPLICA
 * (`src/ai/hard`) — across the new rule:
 *
 *   1. the limit is back to TEN plies (it was `muju-phasing-1`'s number too;
 *      `muju-phasing-2`'s twenty was itself a temporary widening);
 *   2. the tenth kill-free ply no longer draws automatically: the higher
 *      MINED TOTAL wins (Black's starting handicap counts toward Black's
 *      total), and only a tie draws;
 *   3. a home-checkmate `#` is withheld once the invader's next turn start is
 *      no longer guaranteed (`c >= limit - 1`, i.e. `c >= 9`).
 *
 * The negative half is still the point: the game must still be PLAYING at
 * each of plies 1..9, and decided at exactly ply 10 — never earlier, never
 * later, and never (except on an exact mined-total tie) by a neutral draw.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { Reason, Result } from '../../../src/ai/hard/types';
import { AKind, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING, LEGACY_INACTIVITY_LIMIT, minedTotal } from '../../../src/game/inactivity';
import { buildState } from './game-fixture';
import type { GameState } from '../../../src/game/types';

// E0.5 floor; this file's own measured ceiling. The 10-ply walk packs and
// digests two states per ply.
vi.setConfig({ testTimeout: 30_000 });

const replica = new Replica();

/**
 * A genuinely quiet Phasing position: two tier-1 pieces, three squares apart, so
 * neither can reach the other with four AP and neither owes rent at its own
 * `END_ACTION`. Neither stands on a home corner (A1 = 0,0; J10 = 9,9), so no
 * occupation or home checkmate can interrupt the clock, and the squares are
 * mining-neutral (zero reserve) so the walk stays an exact mined-total TIE —
 * the negative control this file's first walk needs. White moves first, and
 * the only actions the script plays are the two phase ends — which is exactly
 * what "quiet" means under J-019: only an attack that removes a unit resets
 * the clock, and nothing here removes anything or mines anything.
 */
function quietGame(): GameState {
  const reserves = new Array<number>(100).fill(0);
  return buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 2, y: 6, id: 'w0' },
      { def: 'fire_1', owner: 'black', x: 6, y: 2, id: 'b0' },
    ],
    current: 'white',
    phase: 'action',
    actions: 4,
    turnNumber: 4,
    reserves,
  });
}

describe('the ten-ply kill clock across canonical and the Hard replica', () => {
  it('pins the constants this cross-engine walk is written against', () => {
    expect(INACTIVITY_LIMIT).toBe(10);
    expect(INACTIVITY_WARNING).toBe(7);
    expect(INACTIVITY_LIMIT - INACTIVITY_WARNING).toBe(3);
    // The `muju-phasing-2` limit survives only as an archive-replay pin, never
    // as live play; `muju-phasing-1`'s ten plies is (coincidentally) the same
    // number the kill clock uses, but the VERDICT differs (mined total, not an
    // automatic draw) — `LEGACY_INACTIVITY_LIMIT` names the retired limit, not
    // the retired verdict.
    expect(LEGACY_INACTIVITY_LIMIT).toBe(20);
    expect(LEGACY_INACTIVITY_LIMIT).toBeGreaterThan(INACTIVITY_LIMIT);
  });

  it('is PLAYING in both engines at every one of plies 1..9, and TIES at exactly ply 10 on equal mined totals', () => {
    let canonical = quietGame();
    const packed = replica.pack(canonical);
    const scratch = allocState();
    const undos: ReturnType<typeof newUndo>[] = [];

    for (let ply = 1; ply <= INACTIVITY_LIMIT; ply++) {
      // END_ACTION: income and upkeep. It must NOT touch the clock, in either
      // engine — that split is what makes a "ply" a hand-off and not an action.
      canonical = applyAction(canonical, { type: 'END_ACTION_PHASE' });
      expect(canonical.phase, `ply ${ply}: END_ACTION must not end the game`).toBe('playing');
      expect(canonical.inactivityPlies, `ply ${ply}: END_ACTION must not advance the clock`).toBe(ply - 1);
      const endAction = newUndo();
      replica.make(packed, paMake(AKind.END_ACTION), endAction);
      undos.push(endAction);
      expect(packed.result, `ply ${ply}: replica after END_ACTION`).toBe(Result.ONGOING);
      expect(packed.clock, `ply ${ply}: replica clock after END_ACTION`).toBe(ply - 1);
      expect(replica.digest(packed), `ply ${ply}: engines disagree after END_ACTION`)
        .toBe(replica.digest(replica.pack(canonical, scratch)));

      // END_PLACE: the hand-off. The clock advances here, then the kill clock resolves.
      canonical = applyAction(canonical, { type: 'END_PLACE_PHASE' });
      const endPlace = newUndo();
      replica.make(packed, paMake(AKind.END_PLACE), endPlace);
      undos.push(endPlace);

      expect(canonical.inactivityPlies, `ply ${ply}: canonical clock`).toBe(ply);
      expect(packed.clock, `ply ${ply}: replica clock`).toBe(ply);
      // Nothing in this fixture ever mines: both mined totals stay exactly 0,
      // so a decided verdict at the limit would be a bug, not just a surprise.
      expect(minedTotal(canonical, 'white'), `ply ${ply}: white mined total`).toBe(0);
      expect(minedTotal(canonical, 'black'), `ply ${ply}: black mined total`).toBe(0);
      expect(replica.digest(packed), `ply ${ply}: engines disagree after END_PLACE`)
        .toBe(replica.digest(replica.pack(canonical, scratch)));

      if (ply < INACTIVITY_LIMIT) {
        expect(canonical.phase, `ply ${ply}: canonical must still be playing`).toBe('playing');
        expect(canonical.victoryReason, `ply ${ply}`).toBeUndefined();
        expect(packed.result, `ply ${ply}: replica must still be ongoing`).toBe(Result.ONGOING);
        expect(packed.reason, `ply ${ply}`).toBe(Reason.NONE);
      } else {
        expect(canonical).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'kill-clock' });
        expect(packed.result).toBe(Result.DRAW);
        expect(packed.reason).toBe(Reason.KILL_CLOCK);
      }
    }

    // The replica unwinds the whole game back to the start position: the rule
    // reversion did not break the undo record at any of the values it touches.
    const start = replica.digest(replica.pack(quietGame(), scratch));
    for (const undo of undos.reverse()) replica.unmake(packed, undo);
    expect(packed.result).toBe(Result.ONGOING);
    expect(packed.clock).toBe(0);
    expect(replica.digest(packed)).toBe(start);
  });

  it('walks a position to the tenth kill-free ply with UNEQUAL mined totals: both engines agree on winner and reason', () => {
    // Same shape as `quietGame`, but White's tier-1 sits on a five-crystal
    // reserve it mines every END_ACTION while Black's mirrors onto a bare
    // square — never an attack, so the clock counts the whole walk down
    // without ever resetting, and White pulls strictly ahead on mined total.
    const reserves = new Array<number>(100).fill(0);
    reserves[2 + 6 * 10] = 5; // White's square (2,6): a real reserve to mine.
    let canonical = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 2, y: 6, id: 'w0' },
        { def: 'fire_1', owner: 'black', x: 6, y: 2, id: 'b0' },
      ],
      current: 'white',
      phase: 'action',
      actions: 4,
      turnNumber: 4,
      reserves,
    });
    const packed = replica.pack(canonical);
    const scratch = allocState();

    for (let ply = 1; ply <= INACTIVITY_LIMIT; ply++) {
      canonical = applyAction(canonical, { type: 'END_ACTION_PHASE' });
      replica.make(packed, paMake(AKind.END_ACTION), newUndo());
      expect(replica.digest(packed), `ply ${ply}: engines disagree after END_ACTION`)
        .toBe(replica.digest(replica.pack(canonical, scratch)));
      canonical = applyAction(canonical, { type: 'END_PLACE_PHASE' });
      replica.make(packed, paMake(AKind.END_PLACE), newUndo());
      expect(replica.digest(packed), `ply ${ply}: engines disagree after END_PLACE`)
        .toBe(replica.digest(replica.pack(canonical, scratch)));
    }

    const white = minedTotal(canonical, 'white'), black = minedTotal(canonical, 'black');
    expect(white).toBeGreaterThan(black);
    expect(canonical).toMatchObject({ phase: 'victory', winner: 'white', victoryReason: 'kill-clock' });
    expect(packed.result).toBe(Result.WHITE_WIN);
    expect(packed.reason).toBe(Reason.KILL_CLOCK);
    expect(packed.gained[0]).toBe(white);
    expect(packed.gained[1]).toBe(black);
  });

  it("Black's starting handicap counts toward Black's mined total in both engines, including a tie it creates", () => {
    // No units mine anything (zero reserves); a bare hand-off at the limit
    // with Black's handicap alone must tip the verdict to Black.
    const reserves = new Array<number>(100).fill(0);
    const withHandicap: GameState = {
      ...buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 2, y: 6, id: 'w0' },
          { def: 'fire_1', owner: 'black', x: 6, y: 2, id: 'b0' },
        ],
        current: 'black',
        phase: 'place',
        actions: 0,
        inactivityPlies: INACTIVITY_LIMIT - 1,
        turnNumber: 12,
        reserves,
        handicap: 3,
      }),
    };
    const canonicalEnded = applyAction(withHandicap, { type: 'END_PLACE_PHASE' });
    expect(minedTotal(withHandicap, 'black')).toBe(3);
    expect(minedTotal(withHandicap, 'white')).toBe(0);
    expect(canonicalEnded).toMatchObject({ phase: 'victory', winner: 'black', victoryReason: 'kill-clock' });

    const p = replica.pack(withHandicap);
    expect(p.handicap).toBe(3);
    expect(p.gained[1]).toBe(3); // minedTotal folded the handicap in
    replica.make(p, paMake(AKind.END_PLACE), newUndo());
    expect(p.result).toBe(Result.BLACK_WIN);
    expect(p.reason).toBe(Reason.KILL_CLOCK);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonicalEnded, allocState())));

    // Equalise White's mined total against the SAME handicap and the clock
    // ties instead — the handicap is not merely a Black bonus, it is folded
    // into an ordinary comparison either side can match.
    const tied: GameState = { ...withHandicap, players: { ...withHandicap.players, white: { ...withHandicap.players.white, resourcesGained: 3 } } };
    const canonicalTied = applyAction(tied, { type: 'END_PLACE_PHASE' });
    expect(minedTotal(tied, 'white')).toBe(minedTotal(tied, 'black'));
    expect(canonicalTied).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'kill-clock' });
    const q = replica.pack(tied);
    replica.make(q, paMake(AKind.END_PLACE), newUndo());
    expect(q.result).toBe(Result.DRAW);
    expect(q.reason).toBe(Reason.KILL_CLOCK);
    expect(replica.digest(q)).toBe(replica.digest(replica.pack(canonicalTied, allocState())));
  });

  it('the c >= 9 home-checkmate gate agrees between engines: awarded at c = 8, withheld at c = 9', () => {
    // A lone tier-1 invader one step from White's corner; White's only unit
    // has an empty bank, so its Phasing rescue set (act only) is empty and the
    // occupation is unanswerable whenever the gate lets the prover run at all.
    const base = (clock: number): GameState =>
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 1, y: 0, id: 'b0' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'black',
        phase: 'action',
        actions: 4,
        inactivityPlies: clock,
        turnNumber: 12,
      });

    // c = clock + 1 (no kill this turn): 8 is awarded, 9 is withheld.
    for (const [clock, expectMate] of [[INACTIVITY_LIMIT - 3, true], [INACTIVITY_LIMIT - 2, false]] as const) {
      const state = base(clock);
      const moved = applyAction(state, { type: 'MOVE', unitId: 'b0', to: { x: 0, y: 0 } });
      const canonicalEnded = applyAction(moved, { type: 'END_ACTION_PHASE' });
      const p = replica.pack(moved);
      replica.make(p, paMake(AKind.END_ACTION), newUndo());
      if (expectMate) {
        expect(canonicalEnded, `clock ${clock}`).toMatchObject({ phase: 'victory', winner: 'black', victoryReason: 'home-checkmate' });
        expect(p.result, `clock ${clock}`).toBe(Result.BLACK_WIN);
        expect(p.reason, `clock ${clock}`).toBe(Reason.HOME_CHECKMATE);
      } else {
        expect(canonicalEnded.phase, `clock ${clock}`).toBe('playing');
        expect(p.result, `clock ${clock}`).toBe(Result.ONGOING);
        expect(p.reason, `clock ${clock}`).toBe(Reason.NONE);
      }
      expect(replica.digest(p), `clock ${clock}: engines disagree`).toBe(replica.digest(replica.pack(canonicalEnded, allocState())));
    }
  });
});
