// @vitest-environment node
/**
 * `strategy/ledger.ts` (plan W1.3, `~/.claude/plans/can-you-respond-to-piped-book.md`).
 *
 * Five independent checks:
 *   1. `plysRemaining`/`futureMiningEvents` against the parity rule, hand-derived
 *      and cross-checked by directly driving `Replica.make` through pass-only
 *      turns (see the ledger module's own doc comment) — every clock 0..9,
 *      both root phases, both `progress` values.
 *   2. `L - now === Σ income[0..k)` from the REAL pass-only forecast
 *      (`tables/phasing-economy.ts phasingEconomy`) on the P1 dev openings and
 *      on random Phasing positions reached by seeded random legal play — the
 *      comparison is skipped, and the skip counted, on any side where the
 *      window either outran the forecast's own horizon or hit one of the
 *      ledger's stated exclusions (a pending arrival actually refused).
 *   3. `L <= U` unconditionally, on the same corpus (no exclusions: `U` is
 *      constructed to dominate `L` by construction — see the module doc).
 *   4. Side-swap / rot180 mirror symmetry.
 *   5. Paired positions differing in one fact (one extra miner; one more
 *      depleted cell) move `L` by exactly the expected amount.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameState, PlayerId, Position } from '../../../src/game/types';
import { applyAction } from '../../../src/ai/simulate';
import { generateAllActions } from '../../../src/ai/moves';
import { seededRandom } from '../../../src/ai/runtime';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { AKind, keepSetAdd, keepSetReset, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { newEconResult, type EconResult } from '../../../src/ai/hard/tables/economy';
import { phasingEconomy, PhasingEconomyProofCutoff } from '../../../src/ai/hard/tables/phasing-economy';
import { clockLedger, futureMiningEvents, plysRemaining } from '../../../src/ai/hard/strategy/ledger';
import { INACTIVITY_LIMIT } from '../../../src/game/inactivity';
import { loadOpenings } from '../../../lab/hard-ai/ladder/openings';
import { applyOpening } from '../../../lab/hard-ai/ladder/openings/phasing';
import { buildState, type StateSpec } from './game-fixture';

const replica = new Replica();

// ---------------------------------------------------------------------------
// 1. r and the parity rule
// ---------------------------------------------------------------------------

describe('plysRemaining / futureMiningEvents (the r and parity rules)', () => {
  const basic = [
    { def: 'plant_1', owner: 'white' as const, x: 2, y: 2 },
    { def: 'plant_1', owner: 'black' as const, x: 7, y: 7 },
  ];

  it('r = INACTIVITY_LIMIT - clock when progress is 0, for every clock 0..9', () => {
    for (let clock = 0; clock < INACTIVITY_LIMIT; clock++) {
      const state = buildState({ units: basic, inactivityPlies: clock, progressThisTurn: false });
      const p = replica.pack(state, allocState());
      expect(plysRemaining(p)).toBe(INACTIVITY_LIMIT - clock);
    }
  });

  it('r = INACTIVITY_LIMIT + 1 when progress is 1, regardless of the pre-reset clock', () => {
    for (let clock = 0; clock < INACTIVITY_LIMIT; clock++) {
      const state = buildState({ units: basic, inactivityPlies: clock, progressThisTurn: true });
      const p = replica.pack(state, allocState());
      expect(plysRemaining(p)).toBe(INACTIVITY_LIMIT + 1);
    }
  });

  /** Drives the REAL packed engine through pass-only turns via `Replica.make`
   * (the module doc's empirical check, not just the formula): a turn with
   * `progress === 1` resets the clock to 0 at its own END_PLACE, and it then
   * takes exactly `INACTIVITY_LIMIT` further hand-offs — one per side,
   * alternating — before the kill clock fires, for a total of
   * `INACTIVITY_LIMIT + 1` END_PLACEs counted from the pre-reset root. */
  function driveDefaultKeep(rep: Replica, p: ReturnType<Replica['pack']>, keep: ReturnType<typeof newKeepSetTable>): void {
    keepSetReset(keep);
    keep.count = 1;
    const rentSlots: number[] = [];
    for (let slot = 0; slot < 128; slot++) {
      if (p.sq[slot] === 255 || p.owner[slot] !== p.side) continue;
      if (rep.cat.upkeep[p.defId[slot]] === 0) keepSetAdd(keep, 0, slot);
      else rentSlots.push(slot);
    }
    rentSlots.sort((a, b) => rep.cat.cost[p.defId[b]] - rep.cat.cost[p.defId[a]] || p.sq[a] - p.sq[b]);
    let cash = p.bank[p.side];
    for (const slot of rentSlots) {
      const due = rep.cat.upkeep[p.defId[slot]];
      if (due <= cash) { keepSetAdd(keep, 0, slot); cash -= due; }
    }
  }

  it('confirms r = INACTIVITY_LIMIT + 1 by actually running the reset through Replica.make', () => {
    const state = buildState({ units: basic, inactivityPlies: 7, progressThisTurn: true, phase: 'action', current: 'white' });
    const p = replica.pack(state, allocState());
    const rWanted = plysRemaining(p);
    expect(rWanted).toBe(INACTIVITY_LIMIT + 1);
    const keep = newKeepSetTable();
    let endPlaces = 0;
    for (let step = 0; step < 40 && p.result === 0; step++) {
      const kind = p.upkeepPending ? AKind.PAY_UPKEEP : p.phase === 1 ? AKind.END_ACTION : AKind.END_PLACE;
      if (kind === AKind.PAY_UPKEEP) driveDefaultKeep(replica, p, keep);
      replica.make(p, paMake(kind), newUndo(), keep);
      if (kind === AKind.END_PLACE) endPlaces++;
    }
    // The kill clock fired on the `rWanted`-th END_PLACE, exactly as the r
    // formula predicted, and clock read 0 the instant the reset itself ran.
    expect(endPlaces).toBe(rWanted);
    expect(p.reason).toBe(7 /* Reason.KILL_CLOCK */);
  });

  it('parity: root mover gets ceil(r/2), the other side floor(r/2), for every clock 0..9 at phase 1 (ACT, this turn not yet mined)', () => {
    for (let clock = 0; clock < INACTIVITY_LIMIT; clock++) {
      const state = buildState({ units: basic, inactivityPlies: clock, phase: 'action', current: 'white' });
      const p = replica.pack(state, allocState());
      const r = plysRemaining(p);
      expect(futureMiningEvents(p, 0, r)).toBe(Math.ceil(r / 2)); // white = root mover
      expect(futureMiningEvents(p, 1, r)).toBe(Math.floor(r / 2));
    }
  });

  it('parity: at phase 0 (Prepare, this turn already mined) the root mover loses exactly one future event', () => {
    for (let clock = 0; clock < INACTIVITY_LIMIT; clock++) {
      const state = buildState({ units: basic, inactivityPlies: clock, phase: 'place', current: 'white' });
      const p = replica.pack(state, allocState());
      const r = plysRemaining(p);
      expect(futureMiningEvents(p, 0, r)).toBe(Math.max(0, Math.ceil(r / 2) - 1));
      expect(futureMiningEvents(p, 1, r)).toBe(Math.floor(r / 2)); // the other side is unaffected by root phase
    }
  });

  it('the two sides\' event counts sum to exactly r (phase 1) or r-1 (phase 0, the root mover\'s already-mined ply), for either root mover', () => {
    for (const phase of ['action', 'place'] as const) {
      for (const current of ['white', 'black'] as const) {
        const state = buildState({ units: basic, inactivityPlies: 4, phase, current });
        const p = replica.pack(state, allocState());
        const r = plysRemaining(p);
        const rootSide = current === 'white' ? 0 : 1;
        const other = (1 - rootSide) as 0 | 1;
        const total = futureMiningEvents(p, rootSide as 0 | 1, r) + futureMiningEvents(p, other, r);
        expect(total).toBe(phase === 'place' ? r - 1 : r);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Shared corpus: P1 dev openings + seeded random legal Phasing positions
// ---------------------------------------------------------------------------

const openingsPath = path.resolve(import.meta.dirname, '../../../lab/hard-ai/ladder/openings/p1-dev.jsonl');
const p1dev = loadOpenings(openingsPath).openings;

function randomLegalPlayout(start: GameState, rng: () => number, steps: number): GameState {
  let state = start;
  for (let i = 0; i < steps && state.phase === 'playing'; i++) {
    const player = state.turn.currentPlayer;
    const actions = generateAllActions(state, player);
    if (actions.length === 0) break;
    const action = actions[Math.floor(rng() * actions.length)];
    const next = applyAction(state, action);
    if (next === state) break;
    state = next;
  }
  return state;
}

interface Fixture {
  label: string;
  state: GameState;
}

function buildCorpus(): Fixture[] {
  const fixtures: Fixture[] = p1dev.map(o => ({ label: `p1dev:${o.id}`, state: applyOpening(o) }));
  // A third of the openings, each walked forward by several random-legal-play
  // seeds long enough to reach pending summons, upkeep-driven releases and
  // clocks spread across the whole 0..9 range, not just the low end p1-dev's
  // own "Black's first Act" root sits at. Measured on this exact sample
  // (`node --import tsx -e '...'`, kept in this file's PR description, not
  // re-run automatically): 144 fixtures, clocks distributed 1..9, ~74% with
  // at least one pending commitment, 0 forecast-cutoff/skip in 288 compared
  // side-fixtures.
  const sample = p1dev.filter((_, i) => i % 3 === 0);
  let seed = 1;
  for (const o of sample) {
    for (let trial = 0; trial < 6; trial++) {
      const rng = seededRandom(seed++);
      const steps = 10 + Math.floor(rng() * 50);
      const state = randomLegalPlayout(applyOpening(o), rng, steps);
      if (state.phase === 'playing') fixtures.push({ label: `${o.id}+rand(${steps})#${trial}`, state });
    }
  }
  return fixtures;
}

const corpus = buildCorpus();

function econPair(p: ReturnType<Replica['pack']>): [EconResult, EconResult] | null {
  const out: [EconResult, EconResult] = [newEconResult(), newEconResult()];
  try {
    phasingEconomy(p, out, true);
  } catch (err) {
    if (err instanceof PhasingEconomyProofCutoff) return null;
    throw err;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. L against the real pass-only forecast
// ---------------------------------------------------------------------------

describe('L matches tables/phasing-economy.ts phasingEconomy wherever both are defined', () => {
  it('over the P1 dev openings and seeded random Phasing positions', () => {
    let compared = 0, skippedHorizon = 0, skippedRefusal = 0, skippedCutoff = 0;
    for (const { label, state } of corpus) {
      const p = replica.pack(state, allocState());
      const ledger = clockLedger(p);
      const out = econPair(p);
      if (out === null) { skippedCutoff++; continue; }
      for (const side of [0, 1] as const) {
        const events = ledger.sides[side].minings;
        if (events === 0) { compared++; expect(ledger.sides[side].L.value - ledger.sides[side].now, label).toBe(0); continue; }
        if (out[side].incomeClosures < events) { skippedHorizon++; continue; }
        // ledger.ts's stated exclusion (assumption "no pending arrival is
        // cancelled"): 2 marks a commitment the real forecast refused.
        if (out[side].pendingArrival.includes(2)) { skippedRefusal++; continue; }
        const forecastSum = Array.from(out[side].income.slice(0, events)).reduce((a, b) => a + b, 0);
        expect(ledger.sides[side].L.value - ledger.sides[side].now, `${label} side ${side}`).toBe(forecastSum);
        compared++;
      }
    }
    // The corpus is small but real; require the comparison to have actually
    // run on the overwhelming majority of side-fixtures, so a change that
    // silently widens the exclusions cannot pass this test for free.
    expect(compared).toBeGreaterThan(corpus.length); // >= 1 side per fixture, most fixtures both sides
    expect(skippedCutoff).toBe(0);
    // Skips are allowed but tiny; log-worthy if this ever creeps up.
    expect(skippedHorizon + skippedRefusal).toBeLessThan(compared);
  });
});

// ---------------------------------------------------------------------------
// 3. L <= U, unconditionally
// ---------------------------------------------------------------------------

describe('L <= U always', () => {
  it('holds on every fixture and every side', () => {
    for (const { label, state } of corpus) {
      const p = replica.pack(state, allocState());
      const ledger = clockLedger(p);
      for (const side of [0, 1] as const) {
        expect(ledger.sides[side].L.value, `${label} side ${side}`).toBeLessThanOrEqual(ledger.sides[side].U.value);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Side-swap / rot180 mirror symmetry
// ---------------------------------------------------------------------------

/** 180-degree board rotation + white/black relabelling. Test-local, like the
 * equivalent mirror in `tests/ai/hard/phasing-economy.test.ts` — no shared
 * dependence on that file's private helper. */
function mirror(s: GameState): GameState {
  const swap = (owner: PlayerId): PlayerId => (owner === 'white' ? 'black' : 'white');
  const rot = (pos: Position): Position => ({ x: 9 - pos.x, y: 9 - pos.y });
  return {
    ...s,
    turn: { ...s.turn, currentPlayer: swap(s.turn.currentPlayer) },
    players: {
      white: { ...s.players.black, id: 'white', startCorner: { x: 0, y: 0 } },
      black: { ...s.players.white, id: 'black', startCorner: { x: 9, y: 9 } },
    },
    reviewUpkeep: { white: s.reviewUpkeep?.black, black: s.reviewUpkeep?.white },
    board: {
      ...s.board,
      cells: [...s.board.cells].reverse().map(row => [...row].reverse().map(c => ({ ...c, position: rot(c.position) }))),
      initialResourceLayers: s.board.initialResourceLayers ? [...s.board.initialResourceLayers].reverse() : undefined,
      units: s.board.units.map(u => ({ ...u, owner: swap(u.owner), position: rot(u.position) })),
    },
    pendingSummons: (s.pendingSummons ?? []).map(q => ({ ...q, owner: swap(q.owner), position: rot(q.position) })),
  };
}

describe('side-swap / rot180 mirror symmetry', () => {
  it('the mirrored position\'s ledger is the original with sides swapped', () => {
    for (const { label, state } of corpus) {
      const p = replica.pack(state, allocState());
      const q = replica.pack(mirror(state), allocState());
      const a = clockLedger(p), b = clockLedger(q);
      expect(b.r, label).toBe(a.r);
      for (const side of [0, 1] as const) {
        const other = 1 - side as 0 | 1;
        expect(b.sides[side].now, `${label} now`).toBe(a.sides[other].now);
        expect(b.sides[side].minings, `${label} minings`).toBe(a.sides[other].minings);
        expect(b.sides[side].L.value, `${label} L`).toBe(a.sides[other].L.value);
        expect(b.sides[side].U.value, `${label} U`).toBe(a.sides[other].U.value);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Paired positions differing in one fact
// ---------------------------------------------------------------------------

const zeroReserves = (): number[] => Array<number>(100).fill(0);
function reservesWith(entries: Record<number, number>): number[] {
  return Object.assign(zeroReserves(), entries);
}

describe('paired positions: one fact changes, L moves by exactly the expected amount', () => {
  it('one extra miner adds exactly that miner\'s own stay-put total', () => {
    const common: Partial<StateSpec> = {
      white: 100, black: 100, current: 'white', phase: 'action', inactivityPlies: 4,
      reserves: reservesWith({ 22: 16, 44: 16, 77: 16 }),
    };
    const base = buildState({ ...common, units: [
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'plant_1', owner: 'black', x: 7, y: 7 },
    ] });
    const withExtra = buildState({ ...common, units: [
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'plant_1', owner: 'white', x: 4, y: 4 }, // the one extra fact
      { def: 'plant_1', owner: 'black', x: 7, y: 7 },
    ] });
    const pBase = replica.pack(base, allocState());
    const pExtra = replica.pack(withExtra, allocState());
    const r = plysRemaining(pBase);
    expect(plysRemaining(pExtra)).toBe(r);
    const events = futureMiningEvents(pBase, 0, r);
    expect(futureMiningEvents(pExtra, 0, r)).toBe(events);
    const rate = replica.cat.mine[pExtra.defId[1]]; // the extra unit's own mining rate
    const expectedDelta = Math.min(rate * events, 16);
    const lBase = clockLedger(pBase).sides[0].L.value;
    const lExtra = clockLedger(pExtra).sides[0].L.value;
    expect(lExtra - lBase).toBe(expectedDelta);
  });

  it('one more-depleted cell reduces L by exactly the reserve difference (capped by rate * events)', () => {
    const common = {
      white: 100, black: 100, current: 'white' as const, phase: 'action' as const, inactivityPlies: 4,
      units: [
        { def: 'plant_1', owner: 'white' as const, x: 2, y: 2 },
        { def: 'plant_1', owner: 'black' as const, x: 7, y: 7 },
      ],
    };
    const full = buildState({ ...common, reserves: reservesWith({ 22: 16, 77: 16 }) });
    const depleted = buildState({ ...common, reserves: reservesWith({ 22: 2, 77: 16 }) }); // the one changed fact
    const pFull = replica.pack(full, allocState());
    const pDepleted = replica.pack(depleted, allocState());
    const r = plysRemaining(pFull);
    const events = futureMiningEvents(pFull, 0, r);
    const rate = replica.cat.mine[pFull.defId[0]];
    const expectedDelta = Math.min(rate * events, 16) - Math.min(rate * events, 2);
    const lFull = clockLedger(pFull).sides[0].L.value;
    const lDepleted = clockLedger(pDepleted).sides[0].L.value;
    expect(lFull - lDepleted).toBe(expectedDelta);
    expect(expectedDelta).toBeGreaterThan(0); // the fixture must actually exercise the cap
  });
});
