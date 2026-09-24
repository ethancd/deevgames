// @vitest-environment node
/**
 * STRATEGOS W1.4 — `src/ai/hard/strategy/killeta.ts`, the lower bound on the
 * plies until a side can kill (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * Part B.1 and B.1b; step W1.4's acceptance).
 *
 * What these tests challenge, rather than restate:
 *
 *   - the PLY CONVENTION, against the replica's own hand-offs: the kill clock
 *     must end the game exactly at the hand-off of ply `clockPliesLeft(p)`,
 *     including the mid-turn-after-a-kill case where `INACTIVITY_LIMIT −
 *     clock` is off by one;
 *   - the "no terrain" assumption behind empty-board distances, against both
 *     `core/movement.ts bfsFrom` and the canonical `getMoveCost`;
 *   - the plan's acceptance anchors, over openings, played-out prefixes and
 *     sparse random boards: `killTable('current')` for the mover ⇒ ≤ 1,
 *     `killTable('nextAct')` for the other side ⇒ ≤ 2 (and the mover's own
 *     `'nextAct'` ⇒ ≤ 3, the other side's `'current'` ⇒ ≤ 2), with the number
 *     of positive cases asserted so the implication cannot pass vacuously;
 *   - PAIRED positions that differ in one fact — a square of distance, a
 *     0-power attacker, a crystal banked or mined, a promotion's price, a
 *     commitment, the enemy's means to buy a victim, a point of damage, the
 *     phase, the actions left, a spent attack — each moving the bound the way
 *     the rule it isolates says it must;
 *   - that every kind of victim (live unit, commitment, purchase) actually
 *     decides bounds in the corpus, so no clause is dead code;
 *   - side-swap symmetry on every generated position.
 *
 * The playout and exhaustive-search oracle (`lab/hard-ai/oracles/killeta.ts`)
 * runs in `tests/lab/killeta-oracle.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GameState, PlayerId } from '../../../src/game/types';
import { getMoveCost } from '../../../src/game/movement';
import { AKind, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { Scratch, bbNew } from '../../../src/ai/hard/core/bits';
import { bfsFrom } from '../../../src/ai/hard/core/movement';
import { newSpawnInfo, spawnInfo } from '../../../src/ai/hard/core/spawn';
import { INACTIVITY_LIMIT, Replica, newUndo } from '../../../src/ai/hard/core/state';
import { MANHATTAN } from '../../../src/ai/hard/core/tables';
import { killTable, newKillTable, type KillContext, type KillOpts } from '../../../src/ai/hard/tables/kill';
import { Reason, Result, type PackedState, type Side } from '../../../src/ai/hard/types';
import {
  KILL_ETA_ASSUMPTIONS,
  KILL_ETA_EVIDENCE,
  KILL_ETA_HORIZON,
  clockPliesLeft,
  killEta,
  killEtaBoth,
  newKillEtaScratch,
} from '../../../src/ai/hard/strategy/killeta';
import {
  authoredState,
  openingStarts,
  sampledStarts,
  sparseStarts,
  type AuthoredSpec,
  type StartPosition,
} from '../../../lab/hard-ai/oracles/killeta';

// The corpus below is built once (~1 s); the anchor sweep is the slowest test
// (~2 s locally). 60 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 60_000 });

const W: Side = 0;
const B: Side = 1;
const BEYOND = KILL_ETA_HORIZON + 1;
const rep = new Replica();

function pack(spec: AuthoredSpec): PackedState {
  return rep.pack(authoredState(spec));
}

function eta(p: PackedState, side: Side): number {
  return killEta(p, side).plies;
}

/** The corpus every sweep below walks: all 96 dev-book starts, prefixes played
 * out of them (mid-Act, Prepare and upkeep roots included) and sparse boards. */
const OPENINGS = openingStarts();
const CORPUS: StartPosition[] = [
  ...OPENINGS,
  ...sampledStarts(OPENINGS, 160, 20260924),
  ...sparseStarts(200, 20260924),
];

// ---------------------------------------------------------------------------
// the ply convention
// ---------------------------------------------------------------------------

/** Pass every ply (END_ACTION, then the automatic upkeep, then END_PLACE)
 * until the game ends; returns the ply whose hand-off ended it. */
function passUntilOver(p: PackedState, maxPlies = 30): number {
  const undo = newUndo();
  const keep = newKeepSetTable();
  let ply = 1;
  while (p.result === Result.ONGOING && ply <= maxPlies) {
    undo.top = 0;
    if (p.phase === 1) rep.make(p, paMake(AKind.END_ACTION), undo);
    if (p.upkeepPending === 1) {
      expect(rep.genKeepSets(p, keep)).toBeGreaterThan(0);
      rep.make(p, paMake(AKind.PAY_UPKEEP, 0), undo, keep);
    }
    rep.make(p, paMake(AKind.END_PLACE), undo);
    if (p.result !== Result.ONGOING) return ply;
    ply++;
  }
  return Infinity;
}

/** Two bodies that can never meet in time, on an empty-reserve board. */
function quietSpec(over: Partial<AuthoredSpec> = {}): AuthoredSpec {
  return {
    units: [
      { def: 'plant_1', owner: 'white', x: 0, y: 1 },
      { def: 'plant_1', owner: 'black', x: 9, y: 8 },
    ],
    ...over,
  };
}

describe('killEta — the ply convention against the replica\'s hand-offs', () => {
  for (const current of ['white', 'black'] as PlayerId[]) {
    for (const clock of [0, 3, 7, 8, 9]) {
      it(`${current} to move at clock ${clock}: the clock ends at the hand-off of ply clockPliesLeft = ${INACTIVITY_LIMIT - clock}`, () => {
        const p = pack(quietSpec({ clock, current }));
        expect(p.progress).toBe(0);
        const left = clockPliesLeft(p);
        expect(left).toBe(INACTIVITY_LIMIT - clock);
        expect(passUntilOver(p)).toBe(left);
        expect(p.reason).toBe(Reason.KILL_CLOCK);
      });
    }
  }

  it('after a kill this turn (progress 1, clock 0) the clock runs one ply longer than INACTIVITY_LIMIT − clock', () => {
    const p = pack({
      clock: 6,
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
    });
    const undo = newUndo();
    rep.make(p, paMake(AKind.ATTACK, p.pieceAt[44], 45), undo);
    expect(p.progress).toBe(1);
    expect(p.clock).toBe(0);
    expect(clockPliesLeft(p)).toBe(INACTIVITY_LIMIT + 1);
    expect(INACTIVITY_LIMIT - p.clock).toBe(INACTIVITY_LIMIT); // the naive r understates by one
    expect(passUntilOver(p)).toBe(INACTIVITY_LIMIT + 1);
    expect(p.reason).toBe(Reason.KILL_CLOCK);
  });

  it('the kill clock off means no clock ending at all', () => {
    const state: GameState = { ...authoredState(quietSpec()), inactivityRule: 'off' };
    const p = rep.pack(state);
    expect(p.drawRuleOn).toBe(0);
    expect(clockPliesLeft(p)).toBe(Number.POSITIVE_INFINITY);
  });

  it('KILL_ETA_HORIZON covers the longest clockPliesLeft any root can have', () => {
    expect(KILL_ETA_HORIZON).toBe(INACTIVITY_LIMIT + 1);
    for (const { p } of CORPUS) {
      const left = clockPliesLeft(p);
      if (Number.isFinite(left)) expect(left).toBeLessThanOrEqual(KILL_ETA_HORIZON);
    }
  });
});

// ---------------------------------------------------------------------------
// the distance assumption
// ---------------------------------------------------------------------------

describe('killEta — empty-board distances are Manhattan distances (no terrain)', () => {
  it('core/movement bfsFrom on an empty board equals MANHATTAN from every square', () => {
    const empty = bbNew();
    const out = new Int8Array(100);
    for (let s = 0; s < 100; s++) {
      bfsFrom(empty, s, out);
      for (let q = 0; q < 100; q++) expect(out[q]).toBe(MANHATTAN[s * 100 + q]);
    }
  });

  it('the canonical getMoveCost on an empty board is ceil(Manhattan / speed), and a blocker only lengthens it', () => {
    const base = authoredState({ units: [] }).board;
    const walled = { ...base, units: [
      { id: 'wall', definitionId: 'metal_1', owner: 'white' as PlayerId, position: { x: 4, y: 5 }, hasMoved: false, hasAttacked: false, lastAttackKilled: false, canActThisTurn: true, damageTaken: 0 },
    ] };
    for (const [from, to] of [[0, 99], [44, 46], [4, 94], [45, 65], [11, 88]]) {
      for (const speed of [1, 2, 3]) {
        const a = { x: from % 10, y: Math.floor(from / 10) };
        const b = { x: to % 10, y: Math.floor(to / 10) };
        expect(getMoveCost(a, b, speed, base)).toBe(Math.ceil(MANHATTAN[from * 100 + to] / speed));
        const blocked = getMoveCost(a, b, speed, walled);
        if (blocked !== null) expect(blocked).toBeGreaterThanOrEqual(Math.ceil(MANHATTAN[from * 100 + to] / speed));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// the claim
// ---------------------------------------------------------------------------

describe('killEta — the claim it returns', () => {
  it('is a bounded lower bound with its evidence tag and its relaxations as assumptions', () => {
    const r = killEta(OPENINGS[0].p, W);
    expect(r.claim.status).toBe('bounded');
    expect(r.claim.evidence).toBe(KILL_ETA_EVIDENCE);
    expect(KILL_ETA_EVIDENCE).toBe('killeta.lowerBound');
    expect(r.claim.assumptions).toBe(KILL_ETA_ASSUMPTIONS);
    expect(r.claim.assumptions[0]).toMatch(/^lower bound only/);
    expect(r.plies).toBe(r.claim.value);
    expect(r.side).toBe(W);
    expect(r.limit).toBe(KILL_ETA_HORIZON);
  });

  it('a limit only truncates: killEta(p, s, {limit: r}) = min(killEta(p, s), r + 1)', () => {
    for (const { p } of CORPUS.slice(0, 120)) {
      for (const side of [W, B]) {
        const full = eta(p, side);
        for (const r of [0, 1, 2, 3, 5]) {
          const cut = killEta(p, side, { limit: r });
          expect(cut.plies).toBe(Math.min(full, r + 1));
          expect(cut.limit).toBe(r);
          expect(cut.firstNotRuledOut === null).toBe(full > r);
        }
      }
    }
  });

  it('is deterministic and a reused scratch carries nothing from one position to the next', () => {
    const ws = newKillEtaScratch();
    for (const { p } of CORPUS.slice(0, 80)) {
      const shared = killEtaBoth(p, {}, ws);
      const fresh = killEtaBoth(p);
      expect(shared.map(r => [r.plies, r.firstNotRuledOut])).toEqual(fresh.map(r => [r.plies, r.firstNotRuledOut]));
    }
  });

  it('a decided game has no further plies, so nothing is ever killed in it', () => {
    const p = pack({ units: [{ def: 'fire_1', owner: 'white', x: 4, y: 4 }, { def: 'plant_1', owner: 'black', x: 5, y: 4 }] });
    rep.make(p, paMake(AKind.ATTACK, p.pieceAt[44], 45), newUndo());
    expect(p.result).toBe(Result.WHITE_WIN);
    expect(eta(p, W)).toBe(BEYOND);
    expect(eta(p, B)).toBe(BEYOND);
  });
});

// ---------------------------------------------------------------------------
// the acceptance anchors
// ---------------------------------------------------------------------------

function killContext(p: PackedState): KillContext {
  const white = newSpawnInfo();
  const black = newSpawnInfo();
  spawnInfo(p, W, white);
  spawnInfo(p, B, black);
  return { dist: rep.dist, spawn: [white, black] };
}

function tableOpts(budget: number, horizon: 'current' | 'nextAct'): KillOpts {
  return { actionBudget: budget, crystalBudget: 0, allowBuys: false, allowPromotes: false, maxLanes: 4, horizon };
}

describe('killEta — the killTable anchors (plan W1.4 acceptance)', () => {
  it('over openings, played-out prefixes and sparse boards: current ⇒ ≤ 1, nextAct(other) ⇒ ≤ 2, and the two corollaries', () => {
    const sc = new Scratch(1, 2, 2, 2);
    const table = newKillTable();
    const positives = { currentMover: 0, nextOther: 0, nextMover: 0, currentOther: 0 };
    let positions = 0;
    let phases = { act: 0, prepare: 0 };
    for (const { id, p } of CORPUS) {
      if (p.result !== Result.ONGOING) continue;
      positions++;
      if (p.phase === 1) phases.act++;
      else phases.prepare++;
      const t = killContext(p);
      const mover = p.side;
      const other = (1 - mover) as Side;
      const [ew, eb] = killEtaBoth(p);
      const e = [ew.plies, eb.plies];
      const moverBudget = p.phase === 0 ? 0 : p.actions;

      killTable(p, t, mover, tableOpts(moverBudget, 'current'), sc, 0, table);
      if (table.count > 0) {
        positives.currentMover++;
        expect(e[mover], `${id}: current kill for the mover`).toBeLessThanOrEqual(1);
      }
      killTable(p, t, other, tableOpts(4, 'nextAct'), sc, 0, table);
      if (table.count > 0) {
        positives.nextOther++;
        expect(e[other], `${id}: nextAct kill for the other side`).toBeLessThanOrEqual(2);
      }
      killTable(p, t, mover, tableOpts(4, 'nextAct'), sc, 0, table);
      if (table.count > 0) {
        positives.nextMover++;
        expect(e[mover], `${id}: nextAct kill for the mover`).toBeLessThanOrEqual(3);
      }
      killTable(p, t, other, tableOpts(4, 'current'), sc, 0, table);
      if (table.count > 0) {
        positives.currentOther++;
        expect(e[other], `${id}: current-board kill for the other side`).toBeLessThanOrEqual(2);
      }
    }
    // Non-vacuous: every implication fired many times, on both phases.
    expect(positions).toBeGreaterThan(400);
    expect(phases.act).toBeGreaterThan(100);
    expect(phases.prepare).toBeGreaterThan(20);
    expect(positives.currentMover).toBeGreaterThan(30);
    expect(positives.nextOther).toBeGreaterThan(30);
    expect(positives.nextMover).toBeGreaterThan(30);
    expect(positives.currentOther).toBeGreaterThan(30);
  });

  it('every kind of victim — a live unit, a paid commitment, a purchase — decides some bound in the corpus', () => {
    const kinds = new Map<string, number>();
    for (const { p } of CORPUS) {
      for (const r of killEtaBoth(p)) {
        const k = r.firstNotRuledOut?.target ?? 'none';
        kinds.set(k, (kinds.get(k) ?? 0) + 1);
      }
    }
    expect(kinds.get('unit') ?? 0).toBeGreaterThan(400);
    expect(kinds.get('pending') ?? 0).toBeGreaterThan(0);
    expect(kinds.get('arrival') ?? 0).toBeGreaterThan(0);
    expect(kinds.get('none') ?? 0).toBeGreaterThan(0);
  });

  it('the side to move can never kill in an even ply, nor the other side in an odd one', () => {
    for (const { p } of CORPUS) {
      if (p.result !== Result.ONGOING) continue;
      const [ew, eb] = killEtaBoth(p);
      for (const r of [ew, eb]) {
        if (r.plies > KILL_ETA_HORIZON) continue;
        const moverOwns = (r.plies & 1) === 1;
        expect(moverOwns).toBe(r.side === p.side);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// authored fixtures: far apart, close, and paired one-fact changes
// ---------------------------------------------------------------------------

describe('killEta — far-apart fixtures give killETA > r', () => {
  it('two 0-power plants in opposite corners with no crystals: no kill ever, so > r at every clock', () => {
    for (const clock of [0, 5, 8, 9]) {
      const p = pack(quietSpec({ clock }));
      const r = clockPliesLeft(p);
      expect(eta(p, W)).toBe(BEYOND);
      expect(eta(p, B)).toBe(BEYOND);
      expect(eta(p, W)).toBeGreaterThan(r);
    }
  });

  it('two water_1 fourteen squares apart, no crystals: White ≥ 5, Black ≥ 4 — a provable clock at r ≤ 3, not at r = 4', () => {
    // water → water is neutral, 2 ≥ DEF 2: one hit kills once adjacent. Each
    // body closes four squares per turn. Black's ply 4 needs 14 − 4 (its
    // ply 2) − 8 (White's plies 1 and 3) = 2 → one step and the hit; White's
    // ply 3 still needs 14 − 4 − 4 = 6 → five steps and the hit, too many.
    const spec: AuthoredSpec = { units: [
      { def: 'water_1', owner: 'white', x: 1, y: 1 },
      { def: 'water_1', owner: 'black', x: 8, y: 8 },
    ] };
    const at7 = pack({ ...spec, clock: 7 });
    expect(clockPliesLeft(at7)).toBe(3);
    expect(eta(at7, W)).toBe(5);
    expect(eta(at7, B)).toBe(4);
    const at6 = pack({ ...spec, clock: 6 });
    expect(clockPliesLeft(at6)).toBe(4);
    expect(eta(at6, B)).toBeLessThanOrEqual(clockPliesLeft(at6));
  });

  it('a speed-0 attacker never closes: metal_1 two squares from its prey stays out of reach', () => {
    // metal_1 → water_1 is 1 + 1 = 2 ≥ DEF 2, but metal_1 cannot move and the
    // water_1 target can: it is Black's to walk in, so White's bound is 3 (the
    // target may step adjacent in ply 2), not 1.
    const p = pack({ units: [
      { def: 'metal_1', owner: 'white', x: 4, y: 4 },
      { def: 'water_1', owner: 'black', x: 6, y: 4 },
    ] });
    expect(eta(p, W)).toBe(3);
  });
});

describe('killEta — close fixtures give small values', () => {
  it('an adjacent lethal hit is ply 1 for the mover', () => {
    const p = pack({ units: [{ def: 'fire_1', owner: 'white', x: 4, y: 4 }, { def: 'plant_1', owner: 'black', x: 5, y: 4 }] });
    const r = killEta(p, W);
    expect(r.plies).toBe(1);
    expect(r.firstNotRuledOut).toMatchObject({ ply: 1, target: 'unit', square: 45, need: 3 });
  });

  it('the reply that walks three squares and hits is ply 2', () => {
    const p = pack({ units: [{ def: 'plant_1', owner: 'white', x: 4, y: 4 }, { def: 'fire_1', owner: 'black', x: 4, y: 8 }] });
    expect(eta(p, B)).toBe(2);
    expect(eta(p, W)).toBe(BEYOND); // plant_1 → fire_1 is 0 − 1 → 0
  });

  it('two attackers assembling one kill inside one Act is ply 1; split across turns it would heal', () => {
    // water_1 → metal_1 is 2 − 1 = 1 each; metal_1 has DEF 3. Three adjacent
    // water_1 reach 3 in three actions; two reach only 2, and the damage heals
    // before White's next Act, so two never kill.
    const three = pack({ units: [
      { def: 'water_1', owner: 'white', x: 4, y: 4 },
      { def: 'water_1', owner: 'white', x: 6, y: 4 },
      { def: 'water_1', owner: 'white', x: 5, y: 3 },
      { def: 'metal_1', owner: 'black', x: 5, y: 4 },
    ] });
    expect(eta(three, W)).toBe(1);
    const two = pack({ units: [
      { def: 'water_1', owner: 'white', x: 4, y: 4 },
      { def: 'water_1', owner: 'white', x: 6, y: 4 },
      { def: 'metal_1', owner: 'black', x: 5, y: 4 },
    ] });
    expect(eta(two, W)).toBe(BEYOND);
  });
});

describe('killEta — paired fixtures that differ in one fact', () => {
  it('one square closer: water_1 five squares from a fire_1 is ply 3, four squares is ply 1', () => {
    const at = (y: number) => pack({ units: [{ def: 'water_1', owner: 'white', x: 2, y: 2 }, { def: 'fire_1', owner: 'black', x: 2, y }] });
    expect(eta(at(7), W)).toBe(3);
    expect(eta(at(6), W)).toBe(1);
  });

  it('a 0-power attacker: plant_1 adjacent to metal_1 never kills; a fire_1 in its place kills at once', () => {
    const withAttacker = (def: string) => pack({ units: [{ def, owner: 'white', x: 4, y: 4 }, { def: 'metal_1', owner: 'black', x: 5, y: 4 }] });
    expect(eta(withAttacker('plant_1'), W)).toBe(BEYOND);
    expect(eta(withAttacker('fire_1'), W)).toBe(1);
  });

  it('an affordable fast purchase: three crystals bring the bound from never to ply 3', () => {
    const withBank = (white: number) => pack({ white, units: [
      { def: 'metal_1', owner: 'white', x: 4, y: 4 },
      { def: 'plant_1', owner: 'black', x: 7, y: 7 },
    ] });
    expect(eta(withBank(0), W)).toBe(BEYOND);
    expect(eta(withBank(2), W)).toBe(BEYOND); // the cheapest body costs 3
    const bought = killEta(withBank(3), W);
    expect(bought.plies).toBe(3);
  });

  it('income counts: the same three crystals, mined in ply 1 instead of banked, buy the same ply-3 kill', () => {
    // metal_1 mines 3 a turn; a reserve of 3 under it pays for a fire_1 by
    // White's Prepare in ply 1.
    const withReserve = (reserve: number) => pack({ reserve, units: [
      { def: 'metal_1', owner: 'white', x: 4, y: 4 },
      { def: 'plant_1', owner: 'black', x: 7, y: 7 },
    ] });
    expect(eta(withReserve(0), W)).toBe(BEYOND);
    expect(eta(withReserve(3), W)).toBe(3);
  });

  it('an affordable promotion: plant_1 → plant_2 turns 1 damage into 2 against a water_1', () => {
    // plant → water is +1: plant_1 hits for 1 < DEF 2, plant_2 for 2. The
    // promotion costs 4; with 2 crystals nothing at all is affordable.
    const withBank = (white: number) => pack({ white, units: [
      { def: 'plant_1', owner: 'white', x: 4, y: 4 },
      { def: 'water_1', owner: 'black', x: 5, y: 4 },
    ] });
    expect(eta(withBank(2), W)).toBe(BEYOND);
    expect(eta(withBank(4), W)).toBe(3);
  });

  it('a paid commitment: Black\'s pending fire_1 two squares from White\'s plant_1 makes ply 2; without it, never', () => {
    const units: AuthoredSpec['units'] = [
      { def: 'plant_1', owner: 'white', x: 5, y: 5 },
      { def: 'metal_1', owner: 'black', x: 5, y: 6 },
    ];
    const without = pack({ units });
    const withPending = pack({ units, pending: [{ def: 'fire_1', owner: 'black', x: 6, y: 6 }] });
    expect(eta(without, B)).toBe(BEYOND);
    const r = killEta(withPending, B);
    expect(r.plies).toBe(2);
  });

  it('an enemy purchase is a target: Black\'s three crystals offer White a ply-4 kill its broke twin never does', () => {
    // White's water_1 cannot hurt Black's metal_1 (2 − 1 = 1 < DEF 3) and has
    // no crystals. A body Black buys in ply 1 arrives at ply 3 somewhere in the
    // rectangle from (9,9) to the metal_1 — four squares from the water_1 at
    // its nearest — and a tier-1 body dies to one water_1 hit (lightning_1,
    // DEF 1, takes 2 + 1).
    const withBlackBank = (black: number) => pack({ current: 'black', black, units: [
      { def: 'water_1', owner: 'white', x: 1, y: 9 },
      { def: 'metal_1', owner: 'black', x: 5, y: 0 },
    ] });
    expect(eta(withBlackBank(0), W)).toBe(BEYOND);
    const r = killEta(withBlackBank(3), W);
    expect(r.plies).toBe(4);
    expect(r.firstNotRuledOut?.target).toBe('arrival');
  });

  it('damage lands within one Act: a chipped metal_1 dies to one water_1 now, an unchipped one never', () => {
    // water_1 → metal_1 is 1. With 2 damage already this turn, need is 1.
    const withDamage = (damage: number) => pack({ units: [
      { def: 'water_1', owner: 'white', x: 4, y: 4 },
      { def: 'metal_1', owner: 'black', x: 5, y: 4, damage },
    ] });
    expect(eta(withDamage(2), W)).toBe(1);
    expect(eta(withDamage(0), W)).toBe(BEYOND);
  });

  it('the damage heals at its owner\'s turn start: the same chipped metal_1 seen from White\'s Prepare is never killed', () => {
    const state = authoredState({ units: [
      { def: 'water_1', owner: 'white', x: 4, y: 4 },
      { def: 'metal_1', owner: 'black', x: 5, y: 4, damage: 2 },
    ] });
    const act = rep.pack(state);
    const prepare = rep.pack({ ...state, turn: { ...state.turn, phase: 'place', actionsRemaining: 0 } });
    expect(eta(act, W)).toBe(1);
    expect(eta(prepare, W)).toBe(BEYOND);
  });

  it('fewer actions left in the turn in progress push the ply-1 kill out', () => {
    const withActions = (actions: number) => rep.pack({
      ...authoredState({ units: [{ def: 'water_1', owner: 'white', x: 2, y: 2 }, { def: 'fire_1', owner: 'black', x: 2, y: 6 }] }),
      turn: { currentPlayer: 'white', phase: 'action', actionsRemaining: actions, turnNumber: 1 },
    });
    expect(eta(withActions(4), W)).toBe(1); // three steps and the hit
    expect(eta(withActions(3), W)).toBe(3);
  });

  it('a unit that already attacked this turn without killing cannot hit again in ply 1', () => {
    const state = authoredState({ units: [{ def: 'fire_1', owner: 'white', x: 4, y: 4 }, { def: 'plant_1', owner: 'black', x: 5, y: 4 }] });
    const spent = rep.pack({ ...state, board: { ...state.board, units: state.board.units.map(u =>
      u.owner === 'white' ? { ...u, hasAttacked: true, attackedThisTurn: ['elsewhere'], lastAttackKilled: false } : u) } });
    const chained = rep.pack({ ...state, board: { ...state.board, units: state.board.units.map(u =>
      u.owner === 'white' ? { ...u, hasAttacked: true, attackedThisTurn: ['elsewhere'], lastAttackKilled: true } : u) } });
    expect(eta(spent, W)).toBe(3);
    expect(eta(chained, W)).toBe(1); // Cleave: the last attack killed
  });
});

// ---------------------------------------------------------------------------
// symmetry
// ---------------------------------------------------------------------------

/** The 180° board rotation with the colours swapped (and the side to move). */
function mirrorState(input: GameState): GameState {
  const s = structuredClone(input);
  const swap = (p: PlayerId): PlayerId => (p === 'white' ? 'black' : 'white');
  const flip = (q: { x: number; y: number }) => ({ x: 9 - q.x, y: 9 - q.y });
  s.turn.currentPlayer = swap(s.turn.currentPlayer);
  s.players = {
    white: { ...s.players.black, id: 'white', startCorner: { x: 0, y: 0 } },
    black: { ...s.players.white, id: 'black', startCorner: { x: 9, y: 9 } },
  };
  s.board.cells = s.board.cells.reverse().map(row => row.reverse().map(c => ({ ...c, position: flip(c.position) })));
  s.board.initialResourceLayers = s.board.initialResourceLayers ? [...s.board.initialResourceLayers].reverse() : undefined;
  s.board.units = s.board.units.map(u => ({ ...u, owner: swap(u.owner), position: flip(u.position) }));
  s.pendingSummons = s.pendingSummons?.map(q => ({ ...q, owner: swap(q.owner), position: flip(q.position) }));
  s.reviewUpkeep = { white: s.reviewUpkeep?.black, black: s.reviewUpkeep?.white };
  s.blackCrystalHandicap = 0;
  s.players.white.resourcesGained = 0;
  s.players.black.resourcesGained = 0;
  return s;
}

describe('killEta — side-swap symmetry', () => {
  it('rotating the board 180° and swapping the colours swaps the two bounds exactly', () => {
    let compared = 0;
    for (const { id, p } of CORPUS) {
      if (p.result !== Result.ONGOING) continue;
      const mirrored = rep.pack(mirrorState(rep.unpack(p)));
      for (const side of [W, B]) {
        const a = killEta(p, side);
        const b = killEta(mirrored, (1 - side) as Side);
        expect(b.plies, `${id} side ${side}`).toBe(a.plies);
        expect(b.firstNotRuledOut?.ply ?? null).toBe(a.firstNotRuledOut?.ply ?? null);
      }
      compared++;
    }
    expect(compared).toBeGreaterThan(400);
  });

});
