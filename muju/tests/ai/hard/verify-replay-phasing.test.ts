// @vitest-environment node
/**
 * `verify/replay.ts` under PHASING, without the turn generator (M2).
 *
 * `tests/ai/hard/replay.test.ts` is the file that normally covers `verifyTurn`,
 * and it is quarantined for M2 (see `vitest.config.ts`): every one of its cases
 * reaches `verifyTurn` through `search-fixture.ts`, which builds a `HardEngine`
 * and asks `gen/**` for candidates — and `gen/**` still models Standard. That
 * would have left `verify/replay.ts`, which IS in the M2 replica lane, with no
 * Phasing coverage at all while the turn shape changed underneath it.
 *
 * So this file builds its `Turn` records by hand: a legal line is walked with
 * the REPLICA's own generators (`genActions`/`genPlace`/`genKeepSets`), the
 * packed actions are copied into a `Turn` and `endLo`/`endHi` are read off the
 * replica's own end position. That is exactly the contract `verifyTurn` checks —
 * "the canonical engine accepts this line and lands on the `Kpos` the replica
 * recorded" — with the generator's opinion left out of it.
 *
 * The Phasing-specific thing being pinned is the macro turn's new SHAPE: a turn
 * crosses END_ACTION_PHASE into Prepare and out again through END_PLACE_PHASE,
 * it may hold a BUY that records a commitment rather than placing a unit, and
 * its hand-off may resolve the OTHER side's commitments into arrivals. Every
 * one of those is a position `pack` has to agree about, and the `Kpos`
 * comparison is the only check that can see a pending-plane divergence.
 *
 * NOTHING IS TOLERATED. Every qualifying walked turn must verify: the canonical
 * engine must accept every action of the line and must land on the exact `Kpos`
 * the replica recorded. There is no allowance, no counter and no cap.
 *
 * This file used to carry one — `knownProverGap`, which excused a failed
 * `verifyTurn` whenever the canonical engine had awarded a `home-checkmate`
 * victory somewhere inside the line, and let the first test through with up to
 * 11 such failures. That exemption existed because `tactics/prover.ts` searched
 * STANDARD's rescue (upkeep releases plus pre-action promotions) while the
 * replica was already Phasing, so the packed prover adjudicated home checkmate
 * at the wrong boundary and the replica walked on past a decided position.
 * Round 4 ported the prover to Phasing's act-only rescue
 * (`homeCheckmate.ts:160`), which removed the cause, and round 5 removes the
 * allowance: measured on these seeds, ZERO turns fail, and the exemption was
 * only ever hiding the fact that the two engines disagreed about when the game
 * was over.
 *
 * So what this file now proves is the whole contract, adjudication included:
 * for a line the replica's own generators produced, the canonical engine agrees
 * action for action — including that the game is NOT over at each step and IS
 * over where the replica says it is — and ends in the same packed position. The
 * first test additionally counts the turns whose line reaches a canonical
 * VICTORY (home-checkmate among them, which is precisely the class the old
 * exemption absorbed) and requires at least one, so "no failures" cannot be
 * true vacuously by never reaching the boundary.
 */
import { describe, expect, it, vi } from 'vitest';
import { AKind, newKeepSetTable, paMake, paKind } from '../../../src/ai/hard/core/action';
import { MAX_SLOTS, Result, type PackedState } from '../../../src/ai/hard/types';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { MAX_TURN_ACTIONS } from '../../../src/ai/hard/types';
import type { Turn } from '../../../src/ai/hard/gen/turn';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { seededRandom } from '../../../src/ai/runtime';
import { asPhasing, buildState, randomState } from './game-fixture';
import type { GameState } from '../../../src/game/types';

// E0.5 timeout budget: slowest test 2.6 s measured on this box under load; 30 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 30_000 });

const replica = new Replica();
const GEN = new Int32Array(4 + MAX_SLOTS * 104);

/** A hand-built `Turn` carrying `actions`, with every other field neutral. */
function handTurn(actions: number[], endLo: number, endHi: number): Turn {
  const buf = new Int32Array(MAX_TURN_ACTIONS);
  for (let i = 0; i < actions.length; i++) buf[i] = actions[i];
  return { actions: buf, count: actions.length, endLo, endHi, sig: 0, flags: 0, gainCc: 0, place: -1, hangCc: 0 };
}

interface Walked {
  turn: Turn;
  kinds: number[];
  ended: boolean;
}

/**
 * Walks ONE macro turn from `p` with the replica's own generators, stopping
 * after the END_PLACE_PHASE that hands off (or earlier if the line ends the
 * game). `bias` picks a kind to prefer when it is available, which is how a
 * line is steered through a BUY. `p` is mutated and left at the end position.
 */
function walkTurn(p: PackedState, rng: () => number, keep: ReturnType<typeof newKeepSetTable>, bias: number | null): Walked {
  const undo = newUndo();
  undo.top = 0;
  replica.resetUndoScratch();
  const actions: number[] = [];
  const kinds: number[] = [];
  let ended = false;
  for (let step = 0; step < MAX_TURN_ACTIONS; step++) {
    let n: number;
    if (p.upkeepPending === 1) {
      n = replica.genKeepSets(p, keep);
      for (let i = 0; i < n; i++) GEN[i] = paMake(AKind.PAY_UPKEEP, i);
    } else if (p.phase === 0) {
      n = replica.genPlace(p, GEN);
    } else {
      n = replica.genActions(p, GEN);
    }
    if (n === 0) break;
    let pick = -1;
    if (bias !== null) {
      for (let i = 0; i < n; i++) {
        if (paKind(GEN[i]) === bias) {
          pick = i;
          break;
        }
      }
    }
    if (pick < 0) pick = Math.floor(rng() * n);
    const a = GEN[pick];
    actions.push(a);
    kinds.push(paKind(a));
    // Forward-only: `verifyTurn` replays the line from the ROOT state, so the
    // undo stack is dropped rather than unwound (this is what `decodeTurn` does).
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(p, a, undo, keep);
    if (p.result !== Result.ONGOING) {
      ended = true;
      break;
    }
    if (paKind(a) === AKind.END_PLACE) break;
  }
  return { turn: handTurn(actions, p.kposLo, p.kposHi), kinds, ended };
}

/** The mover's position after `state`'s turn, walked once, plus the root pack. */
function prepareWalk(state: GameState, rng: () => number, bias: number | null) {
  const keep = newKeepSetTable();
  const root = replica.pack(state, allocState());
  const scratch = replica.pack(state, allocState());
  const walked = walkTurn(scratch, rng, keep, bias);
  return { keep, root, walked };
}

describe('verify/replay.ts under Phasing', () => {
  it('verifies a hand-built macro turn that crosses END_ACTION and END_PLACE', () => {
    const rng = seededRandom(0x56455231);
    let crossed = 0;
    let verifiedTurns = 0;
    let terminalLines = 0;
    let homeCheckmates = 0;
    for (let trial = 0; trial < 120; trial++) {
      const state = randomState(rng, 3 + Math.floor(rng() * 6), {
        phase: 'action',
        white: Math.floor(rng() * 20),
        black: Math.floor(rng() * 20),
      });
      const { keep, root, walked } = prepareWalk(state, rng, null);
      if (walked.turn.count === 0) continue;
      const check = verifyTurn(replica, state, root, walked.turn, keep);
      expect(check.reason).toBeUndefined();
      expect(check.divergedAt).toBe(-1);
      expect(check.verified).toBe(true);
      expect(check.actions.length).toBe(walked.turn.count);
      verifiedTurns++;
      if (check.endState.phase !== 'playing') {
        terminalLines++;
        if (check.endState.victoryReason === 'home-checkmate') homeCheckmates++;
      }
      if (walked.kinds.includes(AKind.END_ACTION) && walked.kinds.includes(AKind.END_PLACE)) crossed++;
    }
    // The shape this file exists for: most walked turns really do cross both
    // phase boundaries, so the assertions above are not all about short lines.
    expect(verifiedTurns).toBe(120);
    expect(crossed).toBeGreaterThan(50);
    // Not vacuous: some of those lines run INTO a canonical victory, and the
    // replica agreed about where it was. Measured on this seed: 13 terminal
    // lines, of which 2 are `home-checkmate` — the exact class the deleted
    // `knownProverGap` allowance used to absorb.
    expect(terminalLines).toBeGreaterThanOrEqual(5);
    expect(homeCheckmates).toBeGreaterThanOrEqual(1);
  });

  it('verifies a turn whose Prepare phase records a commitment', () => {
    const rng = seededRandom(0x56455232);
    let withBuy = 0;
    for (let trial = 0; trial < 120; trial++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 5), {
        phase: 'action',
        // Enough crystals that a tier-1 BUY is affordable once income lands.
        white: 8 + Math.floor(rng() * 14),
        black: 8 + Math.floor(rng() * 14),
      });
      const { keep, root, walked } = prepareWalk(state, rng, AKind.BUY);
      if (!walked.kinds.includes(AKind.BUY)) continue;
      const check = verifyTurn(replica, state, root, walked.turn, keep);
      withBuy++;
      expect(check.reason).toBeUndefined();
      expect(check.verified).toBe(true);
      // The commitment is public in the canonical end state and placed no unit.
      const end = check.endState;
      expect(end.ruleset).toBe('phasing');
      expect(end.pendingSummons ?? []).not.toHaveLength(0);
    }
    expect(withBuy).toBeGreaterThan(40);
  });

  it('verifies a hand-off that resolves the other side\'s commitments into arrivals', () => {
    const rng = seededRandom(0x56455233);
    let resolved = 0;
    for (let trial = 0; trial < 120; trial++) {
      // Black holds commitments on its own back rank; White's turn hands off to
      // Black, whose turn start resolves them against one arrival board.
      const state = randomState(rng, 2 + Math.floor(rng() * 4), {
        phase: 'action',
        current: 'white',
        white: Math.floor(rng() * 12),
        black: Math.floor(rng() * 12),
        pendingSummons: [
          { def: 'fire_1', owner: 'black', x: 9, y: 9 - (trial % 3) },
          { def: 'plant_1', owner: 'black', x: 8 - (trial % 3), y: 9 },
        ],
      });
      const { keep, root, walked } = prepareWalk(state, rng, null);
      if (!walked.kinds.includes(AKind.END_PLACE) || walked.ended) continue;
      const check = verifyTurn(replica, state, root, walked.turn, keep);
      expect(check.reason).toBeUndefined();
      expect(check.verified).toBe(true);
      // Black's plane is empty afterwards: each commitment either materialised
      // or refunded. Either way the Kpos above already had to agree about it.
      expect((check.endState.pendingSummons ?? []).filter(s => s.owner === 'black')).toEqual([]);
      resolved++;
    }
    expect(resolved).toBeGreaterThan(60);
  });

  it('truncates at the first action the canonical engine refuses', () => {
    const rng = seededRandom(0x56455234);
    const state = buildState({
      units: [
        { def: 'lightning_1', owner: 'white', x: 0, y: 0 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      phase: 'action',
      actions: 4,
      white: 12,
      black: 12,
    });
    const { keep, root, walked } = prepareWalk(state, rng, null);
    expect(walked.turn.count).toBeGreaterThan(1);
    // An ATTACK on an empty square is illegal in the canonical engine at any
    // point, so the line must be cut at index 1 rather than dispatched whole.
    const tampered = handTurn([walked.turn.actions[0], paMake(AKind.ATTACK, 0, 55)], walked.turn.endLo, walked.turn.endHi);
    const check = verifyTurn(replica, state, root, tampered, keep);
    expect(check.verified).toBe(false);
    expect(check.divergedAt).toBe(1);
    expect(check.actions.length).toBe(1);
    expect(check.reason).toBeDefined();
  });

  it('catches a wrong end position even when every action is legal', () => {
    const rng = seededRandom(0x56455235);
    const state = asPhasing(
      buildState({
        units: [
          { def: 'lightning_1', owner: 'white', x: 0, y: 0 },
          { def: 'plant_1', owner: 'black', x: 9, y: 9 },
        ],
        phase: 'action',
        actions: 4,
        white: 12,
        black: 12,
      }),
    );
    const { keep, root, walked } = prepareWalk(state, rng, null);
    expect(walked.turn.count).toBeGreaterThan(0);
    // Same legal line, one bit wrong in the claimed Kpos: only the re-pack
    // comparison can see this, and it must.
    const lied = handTurn(
      Array.from(walked.turn.actions.subarray(0, walked.turn.count)),
      walked.turn.endLo ^ 1,
      walked.turn.endHi,
    );
    const check = verifyTurn(replica, state, root, lied, keep);
    expect(check.verified).toBe(false);
    expect(check.divergedAt).toBe(-1);
    expect(check.reason).toMatch(/Kpos mismatch/);
    expect(check.actions.length).toBe(walked.turn.count);
  });
});
