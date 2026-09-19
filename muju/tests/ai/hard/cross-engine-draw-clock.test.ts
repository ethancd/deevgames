// @vitest-environment node
/**
 * ONE quiet game, FOUR readers of the same clock (rules revision
 * `muju-phasing-2`, owner decision 2026-09-19).
 *
 * The inactivity draw moved from ten plies to twenty. Four independent pieces of
 * this repository have to agree about that number, and each of them learned it a
 * different way:
 *
 *   1. the canonical engine — `src/ai/simulate.ts#applyAction`, which reads
 *      `INACTIVITY_LIMIT` through `turn.ts` -> `resolveInactivityDraw`;
 *   2. the Hard replica — `Replica.make`, which re-exports the same constant
 *      through `src/ai/hard/core/state.ts` and keeps the clock in a packed word
 *      with its own 21-key Zobrist plane;
 *   3. the legacy AIEngineV2 search, whose only view of the draw is the terminal
 *      oracle it scores positions with (`victory.ts#getGameResult`, consumed by
 *      `ai/evaluation.ts:34` and `ai/planner/scoring.ts:17`) plus the server
 *      analysis headline's `[quietPlayerTurns, limit]` pair that the V2-era
 *      analysis surface publishes to agents;
 *   4. the online host's observation — `server/observation.ts#observe`, whose
 *      `quietTurns` / `drawAtQuietTurns` pair is what an MCP agent counts with.
 *
 * A single shared constant makes agreement look inevitable. It is not: the
 * replica could pack the clock too narrowly, the analysis pair could be a
 * literal (it WAS one, `server/analysis/index.ts:247`), and the observation
 * could publish a stale copy. So this test walks a scripted quiet game ply by
 * ply and asks all four at every step, rather than asserting the constant four
 * times.
 *
 * The negative half is the point: the game must still be PLAYING at each of
 * plies 10..19 — the whole band that `muju-phasing-1` had already ended — and
 * must draw at exactly ply 20.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { getGameResult } from '../../../src/game/victory';
import { Reason, Result } from '../../../src/ai/hard/types';
import { AKind, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING, LEGACY_INACTIVITY_LIMIT } from '../../../src/game/inactivity';
import { buildState } from './game-fixture';
import { observe } from '../../../server/observation';
import { analysisService } from '../../../server/analysis';
import { snapshot } from '../../fixtures/analysis';
import type { GameState } from '../../../src/game/types';

// E0.5 floor; this file's own measured ceiling. The 20-ply walk packs and
// digests two states per ply and calls the analysis headline four times.
vi.setConfig({ testTimeout: 30_000 });

const replica = new Replica();

/**
 * A genuinely quiet Phasing position: two tier-1 pieces, three squares apart, so
 * neither can reach the other with four AP and neither owes rent at its own
 * `END_ACTION`. Neither stands on a home corner (A1 = 0,0; J10 = 9,9), so no
 * occupation or home checkmate can interrupt the clock. White moves first, and
 * the only actions the script plays are the two phase ends — which is exactly
 * what "quiet" means under J-019: only an attack that removes a unit resets the
 * clock, and nothing here removes anything.
 */
function quietGame(): GameState {
  return buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 2, y: 6, id: 'w0' },
      { def: 'fire_1', owner: 'black', x: 6, y: 2, id: 'b0' },
    ],
    current: 'white',
    phase: 'action',
    actions: 4,
    turnNumber: 4,
  });
}

/** What the V2-era analysis surface publishes as the draw horizon. */
function analysisDrawPair(state: GameState, revision: number): [number, number] {
  const sections = analysisService.headline({ ...snapshot(state, revision), ready: true }).sections;
  return sections.draw as [number, number];
}

describe('the twenty-ply draw clock across canonical, replica, V2 and the host', () => {
  it('pins the constants this cross-engine walk is written against', () => {
    expect(INACTIVITY_LIMIT).toBe(20);
    expect(INACTIVITY_WARNING).toBe(17);
    expect(INACTIVITY_LIMIT - INACTIVITY_WARNING).toBe(3);
    // The old limit survives only as an archive-replay pin, never as live play.
    expect(LEGACY_INACTIVITY_LIMIT).toBe(10);
    expect(LEGACY_INACTIVITY_LIMIT).toBeLessThan(INACTIVITY_LIMIT);
  });

  it('draws at exactly ply 20 in BOTH engines, and at none of plies 1..19', () => {
    let canonical = quietGame();
    const packed = replica.pack(canonical);
    const scratch = allocState();
    // Every `make` gets its own undo record so the whole walk can be rolled back.
    const undos: ReturnType<typeof newUndo>[] = [];
    const drewAt: number[] = [];

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

      // END_PLACE: the hand-off. The clock advances here, then the draw resolves.
      canonical = applyAction(canonical, { type: 'END_PLACE_PHASE' });
      const endPlace = newUndo();
      replica.make(packed, paMake(AKind.END_PLACE), endPlace);
      undos.push(endPlace);

      expect(canonical.inactivityPlies, `ply ${ply}: canonical clock`).toBe(ply);
      expect(packed.clock, `ply ${ply}: replica clock`).toBe(ply);
      expect(replica.digest(packed), `ply ${ply}: engines disagree after END_PLACE`)
        .toBe(replica.digest(replica.pack(canonical, scratch)));

      // (3) The V2 engine's terminal oracle, and the analysis surface's horizon.
      const result = getGameResult(canonical);
      const remaining = INACTIVITY_LIMIT - ply;
      // (4) The host's published pair, asked at every single ply.
      const view = observe({ ...snapshot(canonical, ply + 1), ready: true });
      expect(view.quietTurns, `ply ${ply}: observation quietTurns`).toBe(ply);
      expect(view.drawAtQuietTurns, `ply ${ply}: observation drawAtQuietTurns`).toBe(INACTIVITY_LIMIT);
      expect(view.drawAtQuietTurns - view.quietTurns, `ply ${ply}: plies until draw`).toBe(remaining);

      if (ply < INACTIVITY_LIMIT) {
        expect(canonical.phase, `ply ${ply}: canonical must still be playing`).toBe('playing');
        expect(canonical.victoryReason, `ply ${ply}`).toBeUndefined();
        expect(packed.result, `ply ${ply}: replica must still be ongoing`).toBe(Result.ONGOING);
        expect(packed.reason, `ply ${ply}`).toBe(Reason.NONE);
        expect(result.status, `ply ${ply}: V2 terminal oracle must not see a draw`).not.toBe('draw');
        expect(view.status, `ply ${ply}: host status`).toBe('playing');
      } else {
        expect(canonical).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'inactivity' });
        expect(packed.result).toBe(Result.DRAW);
        expect(packed.reason).toBe(Reason.INACTIVITY);
        expect(result).toMatchObject({ status: 'draw', reason: 'inactivity' });
        expect(view.status).toBe('victory');
        expect(view.winner).toBeNull();
        expect(view.victoryReason).toBe('inactivity');
        expect(remaining).toBe(0);
        drewAt.push(ply);
      }
    }

    // The band `muju-phasing-1` had already ended, walked and survived.
    expect(drewAt).toEqual([INACTIVITY_LIMIT]);
    expect(INACTIVITY_LIMIT - LEGACY_INACTIVITY_LIMIT).toBe(10);

    // The replica unwinds the whole game back to the start position: the clock
    // extension did not break the undo record at any of the new values.
    const start = replica.digest(replica.pack(quietGame(), scratch));
    for (const undo of undos.reverse()) replica.unmake(packed, undo);
    expect(packed.result).toBe(Result.ONGOING);
    expect(packed.clock).toBe(0);
    expect(replica.digest(packed)).toBe(start);
  });

  it('publishes the same horizon to agents at the old limit, in the warning band, and at the draw', () => {
    // Asked on hand-built positions as well as on the walk, so a surface that
    // reads a stale copy of the limit cannot hide behind the walk's own states.
    for (const plies of [0, LEGACY_INACTIVITY_LIMIT, INACTIVITY_WARNING, INACTIVITY_LIMIT - 1]) {
      const state: GameState = { ...quietGame(), inactivityPlies: plies };
      expect(analysisDrawPair(state, plies + 1), `${plies} plies: analysis headline`)
        .toEqual([plies, INACTIVITY_LIMIT]);
      const view = observe({ ...snapshot(state, plies + 1), ready: true });
      expect([view.quietTurns, view.drawAtQuietTurns], `${plies} plies: observation`)
        .toEqual([plies, INACTIVITY_LIMIT]);
      // Nothing in this band is a draw any more, which is the whole change.
      expect(getGameResult(state).status, `${plies} plies`).not.toBe('draw');
      expect(replica.pack(state).result, `${plies} plies: replica`).toBe(Result.ONGOING);
    }
  });
});
