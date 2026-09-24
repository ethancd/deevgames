// @vitest-environment node
/**
 * `strategy/clock.ts clockReading` (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part B.1's `clock.ts`
 * row, step W1.5).
 *
 * What these tests challenge, rather than restate:
 *
 *   - the FULL VERDICT TABLE on hand-built states, including an EXACT TIE
 *     (which must read `open`, never a win for either side — a tie is a
 *     draw, per `core/state.ts makeEndPlace`'s own `white > black ? ... :
 *     black > white ? ... : DRAW`);
 *   - the KILL-CLOCK-BOUND GATE: two positions with the IDENTICAL mined-total
 *     interval (`L`/`U` for both sides), differing only in whether a kill is
 *     reachable within `r`, must land on opposite sides of proven/bounded;
 *   - the HOME-VICTORY GATE, the same way, isolated from the kill gate: same
 *     interval, same killETA-ruled-out status, differing only in whether an
 *     invader could reach the enemy corner within `r`;
 *   - the UPKEEP-ELIMINATION GATE: a side's own tier-1 body, alone, is what
 *     the module claims rules the whole channel out forever — replacing it
 *     with a tier-2 body (nothing else different) must downgrade a proven
 *     verdict to bounded;
 *   - SIDE-SWAP MIRROR: reading the identical position from the other side
 *     flips win/loss, negates the margins, and flips the posture;
 *   - PAIRED ONE-FACT FLIPS — the clock value, the mined lead, one unit added
 *     near a corner — each moving the verdict the way the isolated rule says
 *     it must;
 *   - `killeta.ts clockPliesLeft(p) === ledger.ts pliesRemaining(p)` (both
 *     handle the extra ply after a kill — `strategy/types.ts
 *     ClockReadingCore.r`'s own doc calls this out) and `L <= U` for both
 *     sides, over the P4 determinism corpus (`lab/hard-ai/positions/
 *     p4-determinism.jsonl` — the same corpus the Strategos clock reading is
 *     designed around, per that file's own generator comment);
 *   - NO PROVEN VERDICT CONTRADICTED by a real, kill-free (pass-only)
 *     `Replica` walk to the clock's end: exercised directly against this
 *     file's own proven fixtures (the corpus itself currently has none —
 *     `Expect proven verdicts mostly when few plies remain`, plan B.1b — so a
 *     corpus-only check would be vacuous) and, generically, against any
 *     corpus row that does turn out proven, so a future corpus addition is
 *     still covered.
 */
import { describe, expect, it } from 'vitest';
import { AKind, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { Reason, Result, type PackedState, type Side } from '../../../src/ai/hard/types';
import { newUndo, Replica } from '../../../src/ai/hard/core/state';
import { clockPliesLeft } from '../../../src/ai/hard/strategy/killeta';
import { pliesRemaining } from '../../../src/ai/hard/strategy/ledger';
import { clockReading, homeVictoryEta, upkeepEliminationRuledOut, type ClockReading } from '../../../src/ai/hard/strategy/clock';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { buildState, type StateSpec } from './game-fixture';

const rep = new Replica();
const W: Side = 0;
const B: Side = 1;

/** Every reserve square empty: `ledger.ts`'s `L`/`U` both collapse to exactly
 * `p.gained[side]` (no future mining event can take anything), so a test can
 * pin the mined-total interval by choosing `whiteGained`/`blackGained` alone,
 * independent of unit placement. */
const NO_RESERVES: readonly number[] = Array(100).fill(0);

function pack(spec: StateSpec): PackedState {
  return rep.pack(buildState({ reserves: NO_RESERVES, inactivityPlies: 7, white: 999, black: 999, ...spec }));
}

// ---------------------------------------------------------------------------
// fixtures shared across sections
// ---------------------------------------------------------------------------

/**
 * Two `plant_1`s that can never meet in time (the exact pattern
 * `tests/ai/hard/strategy-killeta.test.ts quietSpec` documents as such):
 * `clock = 7` (`r = 3`) rules out a kill AND a home invasion for both sides
 * (calibrated: `killEta`/`homeVictoryEta` both `4 > r`), so with White ahead
 * on mined total this is `proven-win` for White — the baseline every gate
 * test below breaks exactly one exclusion away from.
 */
function quietPairSpec(whiteGained: number, blackGained: number, clock = 7): StateSpec {
  return {
    units: [
      { def: 'plant_1', owner: 'white', x: 0, y: 1 },
      { def: 'plant_1', owner: 'black', x: 9, y: 8 },
    ],
    whiteGained,
    blackGained,
    inactivityPlies: clock,
  };
}

// ---------------------------------------------------------------------------
// the verdict table
// ---------------------------------------------------------------------------

describe('the ClockVerdict table', () => {
  it('proven-win: disjoint in White\'s favour, kill and home both ruled out', () => {
    const p = pack(quietPairSpec(100, 0));
    const r = clockReading(p, W);
    expect(r.verdict).toBe('proven-win');
    expect(r.posture).toBe('hold');
    expect(r.claim.status).toBe('proven');
    expect(r.marginL).toBe(100);
  });

  it('proven-loss: the mirror, read from White (Black is ahead)', () => {
    const p = pack(quietPairSpec(0, 100));
    const r = clockReading(p, W);
    expect(r.verdict).toBe('proven-loss');
    expect(r.posture).toBe('force-contact');
    expect(r.claim.status).toBe('proven');
    expect(r.marginL).toBe(-100);
  });

  it('bounded-win: disjoint, but a kill is not ruled out (adjacent zero-power bodies)', () => {
    // plant_1 (ATK 0) can never kill metal_1 (killEtaExhaustiveCases'
    // 'zero-power-adjacent' fact), so it is White's killETA that stays
    // ruled out; it is Black's own killETA the adjacency breaks (metal_1's
    // own power against plant_1 is nonzero) — either direction not ruled
    // out is enough to cap the grade at bounded (module doc: "both killETA
    // > r").
    const p = pack({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'black', x: 5, y: 4 },
      ],
      whiteGained: 100,
      blackGained: 0,
    });
    const r = clockReading(p, W);
    expect(r.verdict).toBe('bounded-win');
    expect(r.posture).toBe('hold');
    expect(r.claim.status).toBe('bounded');
  });

  it('bounded-loss: the mirror of the kill-gate case', () => {
    const p = pack({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'black', x: 5, y: 4 },
      ],
      whiteGained: 0,
      blackGained: 100,
    });
    const r = clockReading(p, W);
    expect(r.verdict).toBe('bounded-loss');
    expect(r.posture).toBe('force-contact');
    expect(r.claim.status).toBe('bounded');
  });

  it('open on an EXACT TIE — never a win for either side, whatever the gates say', () => {
    const p = pack(quietPairSpec(50, 50));
    const r = clockReading(p, W);
    expect(r.verdict).toBe('open');
    expect(r.posture).toBe('none');
    expect(r.claim.status).toBe('projected');
    expect(r.marginL).toBe(0);
  });

  it('open on a genuine (non-tie) OVERLAP, not just a tie: reserves give U > L', () => {
    // A single reserve of 5 under White's miner: L stays at `now` (0, since
    // no bank to invest and one event's mine is capped by the reserve only
    // via U, not L, at events=0) once `r` is small; give both sides one
    // living miner and a wide-open ceiling on each side so the two U's both
    // exceed the other's L. `plant_1` mines 3/event; with white ahead by a
    // small in-`now` amount but Black's ceiling still reaching up to White's
    // floor, the intervals overlap without being equal.
    const reserves = Array(100).fill(0);
    reserves[sqOf(0, 1)] = 16; // MAX_RESERVE
    reserves[sqOf(9, 8)] = 16;
    const p = rep.pack(
      buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 0, y: 1 },
          { def: 'plant_1', owner: 'black', x: 9, y: 8 },
        ],
        reserves,
        inactivityPlies: 0, // r = 10: plenty of future events to widen U
        whiteGained: 10,
        blackGained: 0,
        white: 0,
        black: 0,
      }),
    );
    const r = clockReading(p, W);
    expect(r.ledger.sides[W].L.value).toBeLessThan(r.ledger.sides[W].U.value);
    expect(r.ledger.sides[W].L.value).toBeGreaterThan(r.ledger.sides[B].L.value); // White really is ahead on the floor
    expect(r.verdict).toBe('open'); // yet Black's ceiling still reaches White's floor
    expect(r.claim.status).toBe('projected');
  });
});

function sqOf(x: number, y: number): number {
  return y * 10 + x;
}

// ---------------------------------------------------------------------------
// the killETA gate, isolated: same L/U interval both cases
// ---------------------------------------------------------------------------

describe('the killETA gate (same L/U interval; killETA <= r -> bounded, > r -> proven)', () => {
  it('same interval, ruled out (far apart) -> proven-win', () => {
    const p = pack(quietPairSpec(100, 0));
    const r = clockReading(p, W);
    expect(r.killEta[W].plies).toBeGreaterThan(r.r);
    expect(r.killEta[B].plies).toBeGreaterThan(r.r);
    expect(r.ledger.sides[W].L.value).toBe(100);
    expect(r.ledger.sides[B].L.value).toBe(0);
    expect(r.verdict).toBe('proven-win');
  });

  it('same interval, NOT ruled out (adjacent) -> bounded-win', () => {
    const p = pack({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'black', x: 5, y: 4 },
      ],
      whiteGained: 100,
      blackGained: 0,
    });
    const r = clockReading(p, W);
    expect(r.killEta[W].plies).toBeLessThanOrEqual(r.r);
    expect(r.ledger.sides[W].L.value).toBe(100);
    expect(r.ledger.sides[B].L.value).toBe(0);
    expect(r.verdict).toBe('bounded-win');
  });
});

// ---------------------------------------------------------------------------
// the home-victory gate, isolated: same interval, kill still ruled out
// ---------------------------------------------------------------------------

describe('the home-victory gate (kill ruled out throughout; homeVictoryEta gates alone)', () => {
  it('both invaders pinned at their OWN corner -> ruled out -> proven-win', () => {
    const p = pack({
      units: [
        { def: 'metal_1', owner: 'white', x: 0, y: 0 },
        { def: 'metal_1', owner: 'black', x: 9, y: 9 },
      ],
      whiteGained: 100,
      blackGained: 0,
    });
    const r = clockReading(p, W);
    expect(homeVictoryEta(p, W, r.r)).toBeGreaterThan(r.r);
    expect(homeVictoryEta(p, B, r.r)).toBeGreaterThan(r.r);
    expect(r.killEta[W].plies).toBeGreaterThan(r.r);
    expect(r.killEta[B].plies).toBeGreaterThan(r.r);
    expect(r.verdict).toBe('proven-win');
  });

  it('the SAME position with White\'s body moved toward Black\'s corner -> not ruled out -> bounded-win', () => {
    const p = pack({
      units: [
        { def: 'metal_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'black', x: 9, y: 9 },
      ],
      whiteGained: 100,
      blackGained: 0,
    });
    const r = clockReading(p, W);
    expect(homeVictoryEta(p, W, r.r)).toBeLessThanOrEqual(r.r);
    // The kill gate is UNCHANGED by this move (both bodies are still far
    // enough apart, and `metal_1`'s own killETA logic is unaffected by
    // moving further from the enemy CORNER specifically): this position
    // isolates the home gate, not a confound of both.
    expect(r.killEta[W].plies).toBeGreaterThan(r.r);
    expect(r.killEta[B].plies).toBeGreaterThan(r.r);
    expect(r.verdict).toBe('bounded-win');
  });
});

// ---------------------------------------------------------------------------
// the upkeep-elimination gate, isolated: same interval, kill and home both
// ruled out throughout — only whether Black holds a living tier-1 body moves
// ---------------------------------------------------------------------------

describe('the upkeep-elimination gate (a living tier-1 body alone rules it out forever)', () => {
  it('Black holds a tier-1 body -> ruled out -> proven-win (the baseline)', () => {
    const p = pack(quietPairSpec(100, 0));
    expect(upkeepEliminationRuledOut(p, B)).toBe(true);
    expect(clockReading(p, W).verdict).toBe('proven-win');
  });

  it('Black\'s ONLY body is tier-2 instead — nothing else differs -> not ruled out -> bounded-win', () => {
    const p = pack({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 1 },
        { def: 'plant_2', owner: 'black', x: 9, y: 8 },
      ],
      whiteGained: 100,
      blackGained: 0,
    });
    expect(upkeepEliminationRuledOut(p, B)).toBe(false);
    const r = clockReading(p, W);
    // The kill/home gates are unaffected by a tier change alone at this
    // distance (still far apart): only the upkeep gate moved.
    expect(r.killEta[W].plies).toBeGreaterThan(r.r);
    expect(r.killEta[B].plies).toBeGreaterThan(r.r);
    expect(r.verdict).toBe('bounded-win');
  });
});

// ---------------------------------------------------------------------------
// side-swap mirror
// ---------------------------------------------------------------------------

describe('side-swap mirror', () => {
  it('reading the identical position from the other side flips win/loss, negates the margins, flips the posture', () => {
    const p = pack(quietPairSpec(100, 0));
    const white = clockReading(p, W);
    const black = clockReading(p, B);
    expect(white.r).toBe(black.r);
    expect(white.verdict).toBe('proven-win');
    expect(black.verdict).toBe('proven-loss');
    expect(black.marginL).toBe(-white.marginL);
    expect(black.marginMid).toBe(-white.marginMid);
    expect(white.posture).toBe('hold');
    expect(black.posture).toBe('force-contact');
  });

  it('mirrors an open verdict too (open has no side to flip, but the reading is symmetric)', () => {
    const p = pack(quietPairSpec(50, 50));
    const white = clockReading(p, W);
    const black = clockReading(p, B);
    expect(white.verdict).toBe('open');
    expect(black.verdict).toBe('open');
    expect(black.marginL).toBe(0);
    expect(white.marginL).toBe(0);
    expect(white.posture).toBe('none');
    expect(black.posture).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// paired one-fact flips
// ---------------------------------------------------------------------------

describe('paired one-fact flips', () => {
  it('the CLOCK VALUE alone: r = 3 leaves a kill not-ruled-out (bounded); r = 2 rules it out (proven)', () => {
    const spec: StateSpec = {
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'black', x: 5, y: 4 },
      ],
      whiteGained: 100,
      blackGained: 0,
    };
    const bounded = clockReading(pack({ ...spec, inactivityPlies: 7 }), W); // r = 3
    const proven = clockReading(pack({ ...spec, inactivityPlies: 8 }), W); // r = 2
    expect(bounded.r).toBe(3);
    expect(bounded.verdict).toBe('bounded-win');
    expect(proven.r).toBe(2);
    expect(proven.verdict).toBe('proven-win');
  });

  it('the MINED LEAD alone: White ahead by 100 is proven-win; an exact tie at the SAME position is open', () => {
    const win = clockReading(pack(quietPairSpec(100, 0)), W);
    const tie = clockReading(pack(quietPairSpec(50, 50)), W);
    expect(win.verdict).toBe('proven-win');
    expect(tie.verdict).toBe('open');
  });

  it('ONE UNIT MORE (an anchor added near the enemy corner): breaks both the kill and home exclusions it is close enough to reach', () => {
    const baseline = clockReading(pack(quietPairSpec(100, 0)), W);
    expect(baseline.verdict).toBe('proven-win');
    const withAnchor = pack({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 1 },
        { def: 'plant_1', owner: 'black', x: 9, y: 8 },
        { def: 'metal_1', owner: 'white', x: 4, y: 4 }, // the added anchor
      ],
      whiteGained: 100,
      blackGained: 0,
    });
    const r = clockReading(withAnchor, W);
    expect(r.verdict).toBe('bounded-win'); // downgraded by the one extra body
    expect(r.ledger.sides[W].L.value).toBe(100); // the interval itself is untouched
    expect(r.ledger.sides[B].L.value).toBe(0);
  });

  it('the same body REMOVED again returns to proven-win (the flip is reversible)', () => {
    const r = clockReading(pack(quietPairSpec(100, 0)), W);
    expect(r.verdict).toBe('proven-win');
  });
});

// ---------------------------------------------------------------------------
// r agreement and L <= U, over the P4 determinism corpus
// ---------------------------------------------------------------------------

describe('r agreement and interval soundness over lab/hard-ai/positions/p4-determinism.jsonl', () => {
  const rows = readPositions('lab/hard-ai/positions/p4-determinism.jsonl');

  it('is not vacuous: the corpus has rows, and every one is exercised below', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('clockPliesLeft(p) === pliesRemaining(p) on every row (both handle the extra ply after a kill)', () => {
    for (const row of rows) {
      const p = rep.pack(row.state);
      expect(clockPliesLeft(p)).toBe(pliesRemaining(p));
    }
  });

  it('L <= U for both sides, the verdict is one of the five, and claim.status matches it', () => {
    const valid = new Set(['proven-win', 'proven-loss', 'bounded-win', 'bounded-loss', 'open']);
    for (const row of rows) {
      const p = rep.pack(row.state);
      const r = clockReading(p, p.side);
      expect(r.ledger.sides[W].L.value).toBeLessThanOrEqual(r.ledger.sides[W].U.value);
      expect(r.ledger.sides[B].L.value).toBeLessThanOrEqual(r.ledger.sides[B].U.value);
      expect(valid.has(r.verdict)).toBe(true);
      const expectedStatus =
        r.verdict === 'open' ? 'projected' : r.verdict === 'proven-win' || r.verdict === 'proven-loss' ? 'proven' : 'bounded';
      expect(r.claim.status).toBe(expectedStatus);
      expect(r.claim.assumptions.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// no proven verdict contradicted by a real kill-free walk to the clock's end
// ---------------------------------------------------------------------------

/** Drives the REAL packed replica through `plies` PASS-ONLY turns (no ATTACK
 * ever generated — this loop only ever calls END_ACTION/PAY_UPKEEP/END_PLACE,
 * so it is kill-free BY CONSTRUCTION, the strongest and simplest witness of
 * `ledger.ts`'s own "no unit dies" premise), or until the game decides itself.
 * Pattern: `tests/ai/hard/strategy-killeta.test.ts passUntilOver`. */
function passOnlyWalk(p: PackedState, plies: number): { pliesPlayed: number; result: Result; reason: Reason } {
  const undo = newUndo();
  const keep = newKeepSetTable();
  let played = 0;
  while (p.result === Result.ONGOING && played < plies) {
    undo.top = 0;
    if (p.phase === 1) rep.make(p, paMake(AKind.END_ACTION), undo);
    if (p.upkeepPending === 1) {
      expect(rep.genKeepSets(p, keep)).toBeGreaterThan(0);
      rep.make(p, paMake(AKind.PAY_UPKEEP, 0), undo, keep);
    }
    if (p.result !== Result.ONGOING) break;
    rep.make(p, paMake(AKind.END_PLACE), undo);
    played++;
  }
  return { pliesPlayed: played, result: p.result, reason: p.reason };
}

/** A proven verdict must survive a real kill-free walk to the clock's end:
 * the walk must reach exactly `r.r` plies (nothing decides it earlier) and
 * land on `Reason.KILL_CLOCK` with the winner the verdict predicted. */
function assertProvenSurvivesWalk(p: PackedState, r: ClockReading): void {
  if (r.claim.status !== 'proven') return;
  const walk = passOnlyWalk(p, r.r);
  expect(walk.pliesPlayed).toBe(r.r);
  expect(walk.reason).toBe(Reason.KILL_CLOCK);
  const sideWins = r.verdict === 'proven-win';
  const wantWhite = sideWins === (r.side === W);
  expect(walk.result).toBe(wantWhite ? Result.WHITE_WIN : Result.BLACK_WIN);
}

describe('no proven verdict is contradicted by a real kill-free walk to the clock\'s end', () => {
  it('the proven-win/-loss fixtures above actually walk out that way', () => {
    assertProvenSurvivesWalk(pack(quietPairSpec(100, 0)), clockReading(pack(quietPairSpec(100, 0)), W));
    assertProvenSurvivesWalk(pack(quietPairSpec(0, 100)), clockReading(pack(quietPairSpec(0, 100)), W));
    const cornerPin = (): StateSpec => ({
      units: [
        { def: 'metal_1', owner: 'white', x: 0, y: 0 },
        { def: 'metal_1', owner: 'black', x: 9, y: 9 },
      ],
      whiteGained: 100,
      blackGained: 0,
    });
    assertProvenSurvivesWalk(pack(cornerPin()), clockReading(pack(cornerPin()), W));
  });

  it('generically, over the P4 determinism corpus (currently vacuous — 0 proven rows — but wired for the next one)', () => {
    const rows = readPositions('lab/hard-ai/positions/p4-determinism.jsonl');
    for (const row of rows) {
      const p = rep.pack(row.state);
      const r = clockReading(p, p.side);
      assertProvenSurvivesWalk(rep.pack(row.state), r);
    }
  });
});
