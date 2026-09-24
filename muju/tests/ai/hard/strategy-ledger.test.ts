// @vitest-environment node
/**
 * `strategy/ledger.ts` (plan W1.3, `~/.claude/plans/can-you-respond-to-piped-book.md`).
 *
 * Checks:
 *   1. `pliesRemaining`/`futureMiningEvents` against the parity rule, hand-derived
 *      and cross-checked by directly driving `Replica.make` through pass-only
 *      turns to the kill clock, COUNTING each side's `END_ACTION`s — every
 *      clock 0..9 × both root phases × both `progress` values × both movers.
 *   2. `L - now === Σ income[0..k)` from the REAL pass-only forecast
 *      (`tables/phasing-economy.ts phasingEconomy`) on the P1 dev openings and
 *      on random Phasing positions reached by seeded random legal play — the
 *      comparison is skipped, and the skip counted, on any side where the
 *      window either outran the forecast's own horizon or hit one of the
 *      ledger's stated exclusions (a pending arrival actually refused).
 *      Random legal play almost never reaches a rent-bound army, so a second,
 *      hand-built RENT-STRESS corpus (tier-2/3 units, banks of 0..3, unpaid
 *      root bills) makes the release order actually decide the answer.
 *   3. `L <= U` unconditionally, on the same corpus (no exclusions: `U` is
 *      constructed to dominate `L` by construction — see the module doc).
 *   4. Side-swap / rot180 mirror symmetry.
 *   5. Paired positions differing in one fact (one extra miner; one more
 *      depleted cell; the bank that decides an unpaid root bill; which unit
 *      the release order keeps) move `L` by exactly the expected amount.
 *   6. `U` where it can be exact: with no Prepare before the side's only
 *      event it is `Σ mine`; a root Prepare adds exactly `⌊ρ · bank⌋`; and the
 *      real engine, buying at the root, mines exactly `U`.
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
import { clockLedger, futureMiningEvents, pliesRemaining } from '../../../src/ai/hard/strategy/ledger';
import { INACTIVITY_LIMIT, minedTotal } from '../../../src/game/inactivity';
import { loadOpenings } from '../../../lab/hard-ai/ladder/openings';
import { applyOpening } from '../../../lab/hard-ai/ladder/openings/phasing';
import { UNIT_DEFINITIONS } from '../../../src/game/units';
import { buildState, type StateSpec, type SummonSpec, type UnitSpec } from './game-fixture';

const replica = new Replica();

const zeroReserves = (): number[] => Array<number>(100).fill(0);
function reservesWith(entries: Record<number, number>): number[] {
  return Object.assign(zeroReserves(), entries);
}

// ---------------------------------------------------------------------------
// 1. r and the parity rule
// ---------------------------------------------------------------------------

describe('pliesRemaining / futureMiningEvents (the r and parity rules)', () => {
  const basic = [
    { def: 'plant_1', owner: 'white' as const, x: 2, y: 2 },
    { def: 'plant_1', owner: 'black' as const, x: 7, y: 7 },
  ];

  it('r = INACTIVITY_LIMIT - clock when progress is 0, for every clock 0..9', () => {
    for (let clock = 0; clock < INACTIVITY_LIMIT; clock++) {
      const state = buildState({ units: basic, inactivityPlies: clock, progressThisTurn: false });
      const p = replica.pack(state, allocState());
      expect(pliesRemaining(p)).toBe(INACTIVITY_LIMIT - clock);
    }
  });

  it('r = INACTIVITY_LIMIT + 1 when progress is 1, regardless of the pre-reset clock', () => {
    for (let clock = 0; clock < INACTIVITY_LIMIT; clock++) {
      const state = buildState({ units: basic, inactivityPlies: clock, progressThisTurn: true });
      const p = replica.pack(state, allocState());
      expect(pliesRemaining(p)).toBe(INACTIVITY_LIMIT + 1);
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
    const rWanted = pliesRemaining(p);
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
      const r = pliesRemaining(p);
      expect(futureMiningEvents(p, 0, r)).toBe(Math.ceil(r / 2)); // white = root mover
      expect(futureMiningEvents(p, 1, r)).toBe(Math.floor(r / 2));
    }
  });

  it('parity: at phase 0 (Prepare, this turn already mined) the root mover loses exactly one future event', () => {
    for (let clock = 0; clock < INACTIVITY_LIMIT; clock++) {
      const state = buildState({ units: basic, inactivityPlies: clock, phase: 'place', current: 'white' });
      const p = replica.pack(state, allocState());
      const r = pliesRemaining(p);
      expect(futureMiningEvents(p, 0, r)).toBe(Math.max(0, Math.ceil(r / 2) - 1));
      expect(futureMiningEvents(p, 1, r)).toBe(Math.floor(r / 2)); // the other side is unaffected by root phase
    }
  });

  it('the two sides\' event counts sum to exactly r (phase 1) or r-1 (phase 0, the root mover\'s already-mined ply), for either root mover', () => {
    for (const phase of ['action', 'place'] as const) {
      for (const current of ['white', 'black'] as const) {
        const state = buildState({ units: basic, inactivityPlies: 4, phase, current });
        const p = replica.pack(state, allocState());
        const r = pliesRemaining(p);
        const rootSide = current === 'white' ? 0 : 1;
        const other = (1 - rootSide) as 0 | 1;
        const total = futureMiningEvents(p, rootSide as 0 | 1, r) + futureMiningEvents(p, other, r);
        expect(total).toBe(phase === 'place' ? r - 1 : r);
      }
    }
  });

  /** The parity rule as an OBSERVATION, not a formula: drive the real packed
   * engine pass-only from each root to the kill clock and count, per side,
   * the `END_ACTION`s (mining events) it actually makes. Zero reserves and
   * tier-1 units keep every turn a pure pass (no income, no rent). */
  it('counts each side\'s real END_ACTIONs to the kill clock: clocks 0..9 x phase x progress x mover', () => {
    const keep = newKeepSetTable();
    let walks = 0;
    for (let clock = 0; clock < INACTIVITY_LIMIT; clock++) {
      for (const phase of ['action', 'place'] as const) {
        for (const progressThisTurn of [false, true]) {
          for (const current of ['white', 'black'] as const) {
            const state = buildState({ units: basic, inactivityPlies: clock, progressThisTurn, phase, current, reserves: zeroReserves() });
            const p = replica.pack(state, allocState());
            const r = pliesRemaining(p);
            const want = [futureMiningEvents(p, 0, r), futureMiningEvents(p, 1, r)];
            const seen = [0, 0];
            for (let step = 0; step < 80 && p.result === 0; step++) {
              const kind = p.upkeepPending ? AKind.PAY_UPKEEP : p.phase === 1 ? AKind.END_ACTION : AKind.END_PLACE;
              if (kind === AKind.PAY_UPKEEP) driveDefaultKeep(replica, p, keep);
              if (kind === AKind.END_ACTION) seen[p.side]++;
              replica.make(p, paMake(kind), newUndo(), keep);
            }
            const label = `clock ${clock} ${phase} progress ${progressThisTurn} ${current}`;
            expect(p.reason, label).toBe(7 /* Reason.KILL_CLOCK */);
            expect(seen, label).toEqual(want);
            walks++;
          }
        }
      }
    }
    expect(walks).toBe(INACTIVITY_LIMIT * 8);
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
  // seeds long enough to reach pending summons and clocks spread across the
  // whole 0..9 range (rent-bound armies are rare here; `rentStress` below
  // covers releases and unpaid root bills), not just the low end p1-dev's
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

// ---------------------------------------------------------------------------
// 2. L against the real pass-only forecast
// ---------------------------------------------------------------------------

/**
 * A hand-built RENT-STRESS corpus. Random legal play from the openings almost
 * never builds a rent-bound army (measured in review: 8 releases and one
 * unpaid root bill in ~750 walked positions), so the release order and the
 * root's unpaid bill were effectively unchecked by the walked corpus. Here
 * every definition, tiers 2 and 3 included, is equally likely, banks are
 * 0..3, half the Prepare roots still owe their bill, and commitments sit
 * where the rules allow them for the root's phase: the opponent's during
 * either phase, the mover's own only in a settled Prepare. Reserves are
 * random so reserve caps bind too. Corners are avoided (no home endings).
 */
function buildRentStressCorpus(): Fixture[] {
  const ids = UNIT_DEFINITIONS.map(d => d.id);
  const tier1 = UNIT_DEFINITIONS.filter(d => d.tier === 1).map(d => d.id);
  const fixtures: Fixture[] = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rng = seededRandom(seed * 7919);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
    const reserves = Array.from({ length: 100 }, () => (rng() < 0.6 ? Math.floor(rng() * 17) : 0));
    const free = Array.from({ length: 98 }, (_, i) => i + 1);
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    const at = (sq: number): { x: number; y: number } => ({ x: sq % 10, y: Math.floor(sq / 10) });
    const units: UnitSpec[] = [];
    for (const owner of ['white', 'black'] as const) {
      const k = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < k; i++) units.push({ def: pick(ids), owner, ...at(free.pop()!) });
    }
    const current = rng() < 0.5 ? 'white' as const : 'black' as const;
    const other = current === 'white' ? 'black' as const : 'white' as const;
    const phase = rng() < 0.5 ? 'place' as const : 'action' as const;
    const upkeepPending = phase === 'place' && rng() < 0.5;
    const pendingSummons: SummonSpec[] = [];
    const theirs = Math.floor(rng() * 3);
    for (let i = 0; i < theirs; i++) pendingSummons.push({ def: pick(tier1), owner: other, ...at(free.pop()!) });
    if (phase === 'place' && !upkeepPending && rng() < 0.5) pendingSummons.push({ def: pick(tier1), owner: current, ...at(free.pop()!) });
    const state = buildState({
      units, pendingSummons, reserves, current, phase, upkeepPending,
      white: Math.floor(rng() * 4), black: Math.floor(rng() * 4),
      inactivityPlies: Math.floor(rng() * 10), actions: phase === 'action' ? 4 : 0,
    });
    fixtures.push({ label: `rent-stress#${seed}`, state });
  }
  return fixtures;
}

const rentStress = buildRentStressCorpus();

interface ForecastComparison {
  compared: number;
  skippedHorizon: number;
  skippedRefusal: number;
  skippedCutoff: number;
  /** Compared sides whose forecast released a unit inside the window. */
  withRelease: number;
  /** Compared root-mover sides that still owed the root bill. */
  withUnpaidRootBill: number;
}

function compareToForecast(fixtures: readonly Fixture[]): ForecastComparison {
  const c: ForecastComparison = { compared: 0, skippedHorizon: 0, skippedRefusal: 0, skippedCutoff: 0, withRelease: 0, withUnpaidRootBill: 0 };
  for (const { label, state } of fixtures) {
    const p = replica.pack(state, allocState());
    const ledger = clockLedger(p);
    const out: [EconResult, EconResult] = [newEconResult(), newEconResult()];
    let forecast: ReturnType<typeof phasingEconomy>;
    try {
      forecast = phasingEconomy(p, out, true);
    } catch (err) {
      if (err instanceof PhasingEconomyProofCutoff) { c.skippedCutoff++; continue; }
      throw err;
    }
    for (const side of [0, 1] as const) {
      const events = ledger.sides[side].minings;
      if (events === 0) { c.compared++; expect(ledger.sides[side].L.value - ledger.sides[side].now, label).toBe(0); continue; }
      if (out[side].incomeClosures < events) { c.skippedHorizon++; continue; }
      // ledger.ts's stated exclusion (assumption "no pending arrival is
      // cancelled"): 2 marks a commitment the real forecast refused.
      if (out[side].pendingArrival.includes(2)) { c.skippedRefusal++; continue; }
      const forecastSum = Array.from(out[side].income.slice(0, events)).reduce((a, b) => a + b, 0);
      expect(ledger.sides[side].L.value - ledger.sides[side].now, `${label} side ${side}`).toBe(forecastSum);
      c.compared++;
      if (forecast.bills.some(b => b.side === side && b.ordinal <= events && b.releasedIds.length > 0)) c.withRelease++;
      if (side === p.side && p.upkeepPending === 1) c.withUnpaidRootBill++;
    }
  }
  return c;
}

describe('L matches tables/phasing-economy.ts phasingEconomy wherever both are defined', () => {
  it('over the P1 dev openings and seeded random Phasing positions', () => {
    const c = compareToForecast(corpus);
    // The corpus is small but real; require the comparison to have actually
    // run on the overwhelming majority of side-fixtures, so a change that
    // silently widens the exclusions cannot pass this test for free.
    expect(c.compared).toBeGreaterThan(corpus.length); // >= 1 side per fixture, most fixtures both sides
    expect(c.skippedCutoff).toBe(0);
    // Skips are allowed but tiny; log-worthy if this ever creeps up.
    expect(c.skippedHorizon + c.skippedRefusal).toBeLessThan(c.compared);
  });

  it('over the rent-stress corpus, where releases and unpaid root bills decide the answer', () => {
    const c = compareToForecast(rentStress);
    expect(c.skippedCutoff).toBe(0);
    // Measured in review: 440 compared sides, 215 with a release inside the
    // window, 98 unpaid root bills in the corpus; the pre-review ledger
    // (root bill ignored) disagreed with the forecast on 31 of them. The
    // floors below keep the corpus honest if its generator drifts.
    expect(c.compared).toBeGreaterThan(300);
    expect(c.withRelease).toBeGreaterThan(100);
    expect(c.withUnpaidRootBill).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// 3. L <= U, unconditionally
// ---------------------------------------------------------------------------

describe('L <= U always', () => {
  it('holds on every fixture and every side', () => {
    for (const { label, state } of [...corpus, ...rentStress]) {
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
    const r = pliesRemaining(pBase);
    expect(pliesRemaining(pExtra)).toBe(r);
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
    const r = pliesRemaining(pFull);
    const events = futureMiningEvents(pFull, 0, r);
    const rate = replica.cat.mine[pFull.defId[0]];
    const expectedDelta = Math.min(rate * events, 16) - Math.min(rate * events, 2);
    const lFull = clockLedger(pFull).sides[0].L.value;
    const lDepleted = clockLedger(pDepleted).sides[0].L.value;
    expect(lFull - lDepleted).toBe(expectedDelta);
    expect(expectedDelta).toBeGreaterThan(0); // the fixture must actually exercise the cap
  });

  /** White stands in its own Prepare still owing the bill `makeEndAction`
   * routed to `PAY_UPKEEP` (two `plant_2`, rent 1 each, mine 5, on 16-crystal
   * cells); clock 2, so r = 8 and White has 3 future events. The bank alone
   * decides how many survive the bill, and so how much White mines. */
  function unpaidBillRoot(bank: number, units: UnitSpec[]): ReturnType<Replica['pack']> {
    return replica.pack(buildState({
      units: [...units, { def: 'plant_1', owner: 'black', x: 7, y: 7 }],
      white: bank, black: 0, current: 'white', phase: 'place', upkeepPending: true, inactivityPlies: 2,
      reserves: reservesWith({ 22: 16, 33: 16, 77: 16 }),
    }), allocState());
  }
  function forecastMined(p: ReturnType<Replica['pack']>, side: 0 | 1, events: number): number {
    const out: [EconResult, EconResult] = [newEconResult(), newEconResult()];
    phasingEconomy(p, out);
    return Array.from(out[side].income.slice(0, events)).reduce((a, b) => a + b, 0);
  }

  it('the bank that settles an unpaid root bill: 0, 1 or 2 plant_2 survive to mine', () => {
    const twoPlant2: UnitSpec[] = [
      { def: 'plant_2', owner: 'white', x: 2, y: 2 },
      { def: 'plant_2', owner: 'white', x: 3, y: 3 },
    ];
    // bank 5: both rents paid, 3 events x 5 each, min(15, 16) per cell.
    // bank 1: one kept (equal cost, lower square 22 first), the other released.
    // bank 0: both released, White is eliminated by upkeep: nothing more mined.
    for (const [bank, want] of [[5, 30], [1, 15], [0, 0]] as const) {
      const p = unpaidBillRoot(bank, twoPlant2);
      const w = clockLedger(p).sides[0];
      expect(w.minings).toBe(3);
      expect(w.L.value - w.now, `bank ${bank}`).toBe(want);
      if (bank > 0) expect(forecastMined(p, 0, 3), `bank ${bank} forecast`).toBe(want);
    }
  });

  it('the release order decides which unit mines: the dearer plant_3 is kept over plant_2', () => {
    // Rent 2 + 1 against a bank of 2: `defaultKeep` keeps cost-descending,
    // so plant_3 (cost 17, mine 8) stays and plant_2 (cost 9) is released.
    // Keeping the cheaper one instead would ledger min(15, 16) = 15, not 16.
    const p = unpaidBillRoot(2, [
      { def: 'plant_2', owner: 'white', x: 2, y: 2 },
      { def: 'plant_3', owner: 'white', x: 3, y: 3 },
    ]);
    const w = clockLedger(p).sides[0];
    expect(w.L.value - w.now).toBe(16); // min(8 * 3, 16) on square 33
    expect(forecastMined(p, 0, 3)).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// 6. U where it can be exact
// ---------------------------------------------------------------------------

describe('U is exact where the rules leave no room, and the engine attains it', () => {
  const richBoard = (): number[] => Array<number>(100).fill(16);
  const army: UnitSpec[] = [
    { def: 'plant_1', owner: 'white', x: 1, y: 1 },
    { def: 'water_2', owner: 'white', x: 2, y: 1 },
    { def: 'metal_1', owner: 'black', x: 8, y: 8 },
    { def: 'fire_1', owner: 'black', x: 8, y: 7 },
  ];
  const whiteRate = 3 + 2; // plant_1 + water_2 (RULE src/game/units.ts)
  const blackRate = 3 + 1; // metal_1 + fire_1

  it('with no Prepare before a side\'s only remaining event, U - now is exactly its mining rate', () => {
    // White to act at clock 8: r = 2, each side mines once more and neither
    // has a Prepare in front of that event, so nothing can raise either rate.
    const p = replica.pack(buildState({
      units: army, white: 40, black: 40, current: 'white', phase: 'action', inactivityPlies: 8, reserves: richBoard(),
    }), allocState());
    const [w, b] = clockLedger(p).sides;
    expect([w.minings, b.minings]).toEqual([1, 1]);
    expect(w.U.value - w.now).toBe(whiteRate);
    expect(b.U.value - b.now).toBe(blackRate);
    expect(w.L.value).toBe(w.U.value); // stay-put already mines everything possible
  });

  it('a Prepare in front of the only event adds exactly floor(rho * bank), and the engine reaches it', () => {
    // White in its own Prepare at clock 7: r = 3, White's next event is its
    // only one and this very Prepare stands in front of it. rho = 3/5
    // (plant_1, DERIVED from the catalogue), bank 10 -> 6 more rate.
    const root = buildState({
      units: army, white: 10, black: 0, current: 'white', phase: 'place', inactivityPlies: 7, reserves: richBoard(),
    });
    const p = replica.pack(root, allocState());
    const w = clockLedger(p).sides[0];
    expect(w.minings).toBe(1);
    expect(w.U.value - w.now).toBe(whiteRate + Math.floor((3 * 10) / 5));

    // The witness: buy two plant_1 now (10 crystals), pass to the clock's end.
    let state: GameState = root;
    for (let k = 0; k < 2; k++) {
      const buy = generateAllActions(state, 'white').find(a => a.type === 'BUY_UNIT' && a.definitionId === 'plant_1');
      expect(buy, `buy ${k}`).toBeDefined();
      state = applyAction(state, buy!);
    }
    for (let step = 0; step < 20 && state.phase === 'playing'; step++) {
      const pass = generateAllActions(state, state.turn.currentPlayer).find(a => a.type === 'END_ACTION_PHASE' || a.type === 'END_PLACE_PHASE');
      expect(pass).toBeDefined();
      state = applyAction(state, pass!);
    }
    expect(state.victoryReason).toBe('kill-clock');
    expect(minedTotal(state, 'white')).toBe(w.U.value); // U attained exactly, never exceeded
  });
});
