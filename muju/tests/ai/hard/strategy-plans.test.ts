// @vitest-environment node
/**
 * STRATEGOS W1.9 — plan injection (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, B.1's `contact.ts` and
 * `hold.ts` rows, B.1b, B.2 step W1.9): `strategy/contact.ts` (ForceContact),
 * `strategy/hold.ts` (Hold), `strategy/plan.ts`, `gen/generate.ts
 * setStrategyWitness`/`playStrategyTurn`, `gen/turn.ts TurnFlag.STRATEGY`,
 * `search/root.ts installStrategyWitness` and the Chronicle, and
 * `search/order.ts ORDER_STRATEGY`.
 *
 * What these tests challenge, rather than restate:
 *
 *   - LEGALITY against the canonical engine: every injected line, on every
 *     fixture and every Phasing-corpus root that has a posture, replays
 *     through `verify/replay.ts verifyTurn`, carries `FORCED | STRATEGY`,
 *     and is exactly the set of lines the strategic layer offered (the
 *     generator dropped none and invented none);
 *   - the killETA CLAIMS, recomputed here from the turn the generator
 *     recorded rather than read back from the Chronicle: an approach line
 *     never leaves our killETA above passing's, and strictly below it where
 *     passing cannot make contact in time; a Hold line never leaves the
 *     enemy's below passing's;
 *   - FEASIBILITY GRADES as paired positions that differ in one fact — the
 *     enemy's unit able to outrun us or not — flipping `witnessed` to
 *     `not-ruled-out`; `forced` checked against the engine's own one-turn
 *     kill table where the plies left make that an exact test, and paired
 *     on the clock where the enemy's first possible kill falls one ply after
 *     it ends;
 *   - every ROLLOUT REPLAYED: each rollout's recorded actions are replayed
 *     at the root's full prover; a witnessed one must reach our damaging
 *     attack at exactly the claimed ply, never past the contract's deadline
 *     (roots on the deadline's edge included), any other must contain none,
 *     a zero-power attack never counts as contact, and the scripted replies
 *     play their scripts (`continue` attacks only to kill, `evade` never);
 *     the rollout budget is shown to bind;
 *   - POSTURE as a paired flip: the same board with the mined lead moved
 *     from one side to the other swaps ForceContact for Hold, and a tie
 *     injects nothing;
 *   - FLAG ABSENT ⇒ BYTE-IDENTICAL to `c054136b`: the exposed fixed-work
 *     result (move, score, depth, work, nodes and the whole published
 *     candidate list with its ordering scores and flags) digested and
 *     pinned for `hard@desktop` and for `hard@strategos` without
 *     `strategyPlans`, the digests computed from these exact states against
 *     an archive of `c054136b` before any W1.9 source existed;
 *   - the WORK CHARGE, the ORDERING bonus, the Chronicle's determinism and
 *     the `finally` that clears the source even when the search throws.
 */
import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../../src/game/types';
import { strategosPatch, type HardConfig } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import { STRATEGY_WORK_SHARE, installStrategyWitness, type RootResult } from '../../../src/ai/hard/search/root';
import { NO_PRUNE_FLAGS, NO_REDUCE_FLAGS, PROVER_FULL, buildSearchTables, generateAt } from '../../../src/ai/hard/search/pvs';
import { ORDER_STRATEGY } from '../../../src/ai/hard/search/order';
import { TACTICAL_FLAGS, TurnFlag, type Turn } from '../../../src/ai/hard/gen/turn';
import { firstLegalKeepSet, newStrategyTurn, playStrategyTurn, type StrategyLine } from '../../../src/ai/hard/gen/generate';
import { clockReading } from '../../../src/ai/hard/strategy/clock';
import { clockPliesLeft, killEta } from '../../../src/ai/hard/strategy/killeta';
import { holdEssentialSlots } from '../../../src/ai/hard/strategy/hold';
import { WORK_KILL_ETA, type PlanSet } from '../../../src/ai/hard/strategy/plan';
import type { ContactRollout } from '../../../src/ai/hard/strategy/contact';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { Replica, allocState, copyState, newUndo } from '../../../src/ai/hard/core/state';
import { AKind, newKeepSetTable, paA, paB, paKind, paMake, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { DEF_ID, DEF_INDEX, activeCatalog, powerIndex } from '../../../src/ai/hard/core/catalog';
import { MANHATTAN } from '../../../src/ai/hard/core/tables';
import { Scratch, bbHas } from '../../../src/ai/hard/core/bits';
import { allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { KILL_IMPOSSIBLE, KILL_MAX_LANES, cleavePlan, killTable, newCleavePlan, newKillTable } from '../../../src/ai/hard/tables/kill';
import { getKillClockPolicy, setKillClockPolicy } from '../../../src/ai/hard/eval/evaluate';
import { DEAD, MAX_SLOTS, Result, type PackedState, type Side } from '../../../src/ai/hard/types';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { buildState, type UnitSpec } from './game-fixture';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';
import {
  CORPUS_POSTURE_IDS,
  NO_RESERVES,
  PLAN_FIXTURES,
  contactThisTurn,
  evadeEscapes,
  leadingExposed,
  promoteCrossing,
  resultDigestSource,
  tooFarToReach,
  trailingNoContact,
  withMined,
  type ExposedResultLike,
} from './strategy-plans-fixture';

vi.setConfig({ testTimeout: 120_000 });

/** Mock hooks (the kill-clock-policy test's pattern): `iterativeDeepening`
 * delegates to the real search unless a test asks it to throw AFTER
 * `search/root.ts` has installed the strategy source. */
const hooks = vi.hoisted(() => ({ throwOnIterate: false }));
vi.mock('../../../src/ai/hard/search/pvs', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/ai/hard/search/pvs')>();
  return {
    ...actual,
    iterativeDeepening: (...args: Parameters<typeof actual.iterativeDeepening>) => {
      if (hooks.throwOnIterate) throw new Error('injected for strategy-plans.test.ts');
      return actual.iterativeDeepening(...args);
    },
  };
});

afterEach(() => {
  hooks.throwOnIterate = false;
  setKillClockPolicy(null);
});

const cat = activeCatalog();
const rep = new Replica();
const W: Side = 0;
const B: Side = 1;
const STRATEGY_BITS = TurnFlag.STRATEGY | TurnFlag.FORCED;

/** The rung the flag-absent digests were pinned at (`c054136b`). CHOICE
 * (small enough for a quick file, large enough to complete depth ≥ 1 on
 * every fixture; falsifier: a digest row whose `candidateSource` is not
 * `completed-depth`). */
const DIGEST_WORK = 30_000;
/** The rung the root-list tests search at: A8's R0/R1 rung. */
const SEARCH_WORK = 60_000;

const CORPUS = readPositions(new URL('../../../lab/hard-ai/positions/p4-determinism.jsonl', import.meta.url).pathname);
function corpusState(id: string): GameState {
  const row = CORPUS.find(r => r.id === id);
  if (row === undefined) throw new Error(`missing corpus row ${id}`);
  return row.state;
}

/** Every state these tests sweep: the fixtures and the corpus posture roots. */
const ALL_STATES: ReadonlyArray<readonly [string, () => GameState]> = [
  ...PLAN_FIXTURES,
  ...CORPUS_POSTURE_IDS.map(id => [id, () => corpusState(id)] as const),
];

/** `hard@strategos` with `strategyPlans` removed: the flag-absent twin. */
function noPlans(): Partial<HardConfig> {
  const patch = strategosPatch();
  const searchFix = { ...patch.searchFix };
  delete searchFix.strategyPlans;
  return { ...patch, searchFix };
}

function digest(r: RootResult): string {
  return crypto.createHash('sha256').update(resultDigestSource(r as unknown as ExposedResultLike)).digest('hex').slice(0, 16);
}

/**
 * One ROOT generation exactly as the root runs it (pack, full prover, meter,
 * root tables), with `installStrategyWitness` wired the way `searchRootInner`
 * wires it, and cleared again. Returns copies of the candidates.
 */
function rootGeneration(state: GameState, cfg: Partial<HardConfig> = strategosPatch(), work = SEARCH_WORK) {
  const engine = new HardEngine(cfg);
  const s = engine.ctx;
  const p = s.rep.pack(state, engine.rootState);
  p.proverMode = PROVER_FULL;
  s.root = p.side as Side;
  s.meter.reset(work);
  const t = buildSearchTables(s, p, 0);
  const reading = clockReading(p, p.side as Side);
  const planSet = installStrategyWitness(s, p, reading);
  let n: number;
  let used: number;
  try {
    n = generateAt(s, p, t, 0);
    used = s.meter.used;
  } finally {
    s.gen.setStrategyWitness(null);
  }
  const turns: Turn[] = s.turns[0].slice(0, n).map(turn => ({
    ...turn,
    actions: turn.actions.slice(0, turn.count),
    keepMask: turn.keepMask?.slice(),
  }));
  return { engine, s, p, t, n, turns, reading, planSet: planSet(), used };
}

function keyOf(turn: Turn): string {
  return `${(turn.endHi >>> 0).toString(16).padStart(8, '0')}${(turn.endLo >>> 0).toString(16).padStart(8, '0')}`;
}

/** A fresh copy of `p` with `turn` applied (the generator's own record). */
function applyTurn(p: PackedState, turn: Turn): PackedState {
  const q = allocState();
  copyState(q, p);
  const undo = newUndo();
  const keep: KeepSetTable | undefined = turn.keepMask === undefined ? undefined : { masks: turn.keepMask, count: 1 };
  for (let i = 0; i < turn.count; i++) {
    const a = turn.actions[i];
    expect(rep.isLegal(q, a, keep)).toBe(true);
    rep.make(q, a, undo, keep);
  }
  return q;
}

/** Passing, played independently of the code under test: END_ACTION, the
 * Replica's OWN first legal keep set if a bill is pending, END_PLACE. */
function passPost(p: PackedState): PackedState {
  const q = allocState();
  copyState(q, p);
  const undo = newUndo();
  rep.make(q, paMake(AKind.END_ACTION), undo);
  if (q.upkeepPending === 1) {
    const table = newKeepSetTable();
    const n = rep.genKeepSets(q, table);
    let paid = false;
    for (let i = 0; i < n && !paid; i++) {
      const choice = { masks: table.masks.slice(i * (MAX_SLOTS >>> 5), (i + 1) * (MAX_SLOTS >>> 5)), count: 1 };
      if (!rep.isLegal(q, paMake(AKind.PAY_UPKEEP, 0), choice)) continue;
      rep.make(q, paMake(AKind.PAY_UPKEEP, 0), undo, choice);
      paid = true;
    }
    expect(paid).toBe(true);
  }
  if (q.result === Result.ONGOING) rep.make(q, paMake(AKind.END_PLACE), undo);
  return q;
}

function strategyTurns(turns: readonly Turn[]): Turn[] {
  return turns.filter(t => (t.flags & TurnFlag.STRATEGY) !== 0);
}

function lineOf(set: PlanSet | null, turn: Turn) {
  return set?.lines.find(l => l.endKey === keyOf(turn)) ?? null;
}

/**
 * Roots one fact away from a fixture that put a ForceContact witness on the
 * deadline's edge (reviewer, W1.9): `evadeEscapes` with the clock one higher
 * (the chase the mining reply concedes at ply 3 now has deadline 2) and
 * `contactThisTurn` at clock 9 (the hit lands at ply 1 with deadline 0). They
 * pin nothing about the deadline FORMULA — only that no witness is ever
 * graded past the deadline the contract declares.
 */
const DEADLINE_EDGES: ReadonlyArray<readonly [string, () => GameState]> = [
  ['evadeEscapesClock7', () => ({ ...evadeEscapes(), inactivityPlies: 7 })],
  ['contactThisTurnClock9', () => ({ ...contactThisTurn(), inactivityPlies: 9 })],
];

/**
 * `evadeEscapes` plus a contact that is NOT contact (review of W1.9): a White
 * `plant_1` at (4,0) — listed first, so it holds White's lowest slot and the
 * rollout policy meets it first — beside a Black `lightning_1` at (5,0).
 * The plant hits the lightning for 0 (`combat.ts calculateAttackPower`
 * clamps at 0), so that ATTACK is legal but is not a damaging attack
 * (`PlanEndPredicate 'damaging-attack'`); a policy that counted it would
 * witness contact with a hit that does nothing. The lightning hits the plant
 * for 2, below its DEF 3, so the `continue` reply — which attacks only what
 * it kills in one hit — must leave it alone. Every reserve is empty, so the
 * lightning has no richer cell to walk to and stays put under `continue`.
 */
function zeroPowerNeighbours(): GameState {
  const units: UnitSpec[] = [
    { def: 'plant_1', owner: 'white', x: 4, y: 0 },
    { def: 'water_1', owner: 'white', x: 2, y: 4 },
    { def: 'plant_1', owner: 'white', x: 0, y: 0 },
    { def: 'fire_1', owner: 'black', x: 6, y: 6 },
    { def: 'plant_1', owner: 'black', x: 9, y: 9 },
    { def: 'lightning_1', owner: 'black', x: 5, y: 0 },
  ];
  return withMined(
    { units, reserves: NO_RESERVES, white: 0, black: 0, inactivityPlies: 6, turnNumber: 13, current: 'white' },
    0,
    30,
  );
}

/** Does `turn`, played from `p`, make an ATTACK whose power (read before it
 * lands) is nonzero — i.e. a damaging attack? */
function turnDamages(p: PackedState, turn: Turn): boolean {
  const q = allocState();
  copyState(q, p);
  const undo = newUndo();
  const keep: KeepSetTable | undefined = turn.keepMask === undefined ? undefined : { masks: turn.keepMask, count: 1 };
  let damages = false;
  for (let i = 0; i < turn.count; i++) {
    const a = turn.actions[i];
    if (paKind(a) === AKind.ATTACK) {
      const v = q.pieceAt[paB(a)];
      if (cat.power[powerIndex(q.owner[paA(a)] as Side, q.defId[paA(a)], q.defId[v])] > 0) damages = true;
    }
    rep.make(q, a, undo, keep);
  }
  return damages;
}

// ---------------------------------------------------------------------------

describe('gen: TurnFlag.STRATEGY and playStrategyTurn', () => {
  it('STRATEGY is its own bit, not tactical, and every STRATEGY line also carries FORCED (never pruned, never reduced)', () => {
    expect(TurnFlag.STRATEGY).toBe(16384);
    const others = Object.entries(TurnFlag).filter(([k]) => k !== 'STRATEGY').map(([, v]) => v);
    for (const v of others) expect(v & TurnFlag.STRATEGY).toBe(0);
    expect(TACTICAL_FLAGS & TurnFlag.STRATEGY).toBe(0);
    expect(NO_PRUNE_FLAGS & TurnFlag.FORCED).toBe(TurnFlag.FORCED);
    expect(NO_REDUCE_FLAGS & TurnFlag.FORCED).toBe(TurnFlag.FORCED);
  });

  it('completes a line as END_ACTION → PAY_UPKEEP → BUY → END_PLACE, and drops an illegal one whole, leaving the root untouched', () => {
    // White must review upkeep, so END_ACTION always routes rent to PAY_UPKEEP.
    const state = buildState({
      units: [
        { def: 'plant_2', owner: 'white', x: 1, y: 1 },
        { def: 'fire_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 8, y: 8 },
      ],
      white: 12,
      reviewUpkeep: { white: true },
    });
    const p = rep.pack(state, allocState());
    const before = [p.kposHi, p.kposLo];
    const undo = newUndo();
    const keep = newKeepSetTable();
    const out = newStrategyTurn();
    const buf = new Int32Array(24);
    const t = allocTables();
    const move = paMake(AKind.MOVE, 1, 23, 1); // fire_1 (2,2) -> (3,2)
    expect(rep.isLegal(p, move)).toBe(true);
    const buySquare = firstLegalBuySquare(p, move, 'lightning_1');
    const line: StrategyLine = { act: Int32Array.of(move), prep: Int32Array.of(paMake(AKind.BUY, defOf('lightning_1'), buySquare, 0)) };
    playStrategyTurn(rep, p, t, line, undo, keep, buf, out);
    expect(out.count).toBeGreaterThan(0);
    const kinds = Array.from(buf.subarray(0, out.count), paKind);
    expect(kinds).toEqual([AKind.MOVE, AKind.END_ACTION, AKind.PAY_UPKEEP, AKind.BUY, AKind.END_PLACE]);
    expect(out.keepMask).toBeDefined();
    expect(out.flags).toBe(TurnFlag.PURCHASE);
    expect(p.side).toBe(B); // the turn handed off
    for (let i = 0; i < out.count; i++) rep.unmake(p, undo);
    expect([p.kposHi, p.kposLo]).toEqual(before);

    // Illegal: a BUY in the Act part, a MOVE in the Prepare part, an
    // unaffordable BUY — each dropped whole, nothing left applied.
    const bad: StrategyLine[] = [
      { act: Int32Array.of(line.prep[0]), prep: new Int32Array(0) },
      { act: new Int32Array(0), prep: Int32Array.of(move) },
      { act: new Int32Array(0), prep: Int32Array.of(paMake(AKind.BUY, defOf('lightning_1'), buySquare, 0), paMake(AKind.BUY, defOf('water_1'), buySquare, 0)) },
    ];
    for (const b of bad) {
      playStrategyTurn(rep, p, t, b, undo, keep, buf, out);
      expect(out.count).toBe(-1);
      expect([p.kposHi, p.kposLo]).toEqual(before);
      expect(p.side).toBe(W);
    }

    // Boundary actions smuggled into a line are refused even where the rules
    // would accept them (reviewer, W1.9): with no bill pending,
    // END_ACTION → END_PLACE is a legal complete turn, but a line names only
    // what the plan chooses and `playStrategyTurn` owns the boundaries.
    const quiet = rep.pack(buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 8, y: 8 },
      ],
      white: 12,
    }), allocState());
    const quietBefore = [quiet.kposHi, quiet.kposLo];
    const end = paMake(AKind.END_ACTION);
    const place = paMake(AKind.END_PLACE);
    playStrategyTurn(rep, quiet, t, { act: new Int32Array(0), prep: new Int32Array(0) }, undo, keep, buf, out);
    expect(Array.from(buf.subarray(0, out.count), paKind)).toEqual([AKind.END_ACTION, AKind.END_PLACE]); // the control
    for (let i = 0; i < out.count; i++) rep.unmake(quiet, undo);
    for (const b of [
      { act: Int32Array.of(end, place), prep: new Int32Array(0) },
      { act: new Int32Array(0), prep: Int32Array.of(place) },
    ]) {
      playStrategyTurn(rep, quiet, t, b, undo, keep, buf, out);
      expect(out.count).toBe(-1);
      expect([quiet.kposHi, quiet.kposLo]).toEqual(quietBefore);
      expect(quiet.side).toBe(W);
    }
  });

  it('the source is asked only at an Act ROOT: never at ply 1, never at a Prepare root', () => {
    const engine = new HardEngine(strategosPatch());
    const s = engine.ctx;
    let calls = 0;
    s.gen.setStrategyWitness(() => {
      calls++;
      return [];
    });
    try {
      const p = s.rep.pack(trailingNoContact(), engine.rootState);
      s.meter.reset(SEARCH_WORK);
      const t = buildSearchTables(s, p, 0);
      generateAt(s, p, t, 0);
      expect(calls).toBe(1);
      generateAt(s, p, t, 1, s.gen); // the ROOT generator, asked at ply 1
      expect(calls).toBe(1);
      const prep = s.rep.pack(buildState({ units: trailingNoContact().board.units.map(u => ({ def: u.definitionId, owner: u.owner, x: u.position.x, y: u.position.y })), phase: 'place', white: 9 }), allocState());
      const tp = buildSearchTables(s, prep, 0);
      generateAt(s, prep, tp, 0);
      expect(calls).toBe(1);
    } finally {
      s.gen.setStrategyWitness(null);
    }
  });

  it("installStrategyWitness answers only for the root it was installed for (reviewer, W1.9)", () => {
    const g = rootGeneration(trailingNoContact());
    expect(g.planSet?.lines.length).toBeGreaterThan(0); // the control
    const s = g.s;
    installStrategyWitness(s, g.p, g.reading);
    try {
      const source = (s.gen as unknown as { strategy: (p: PackedState, t: unknown, m: unknown) => readonly unknown[] }).strategy;
      const other = s.rep.pack(evadeEscapes(), allocState()); // another Act root
      expect(other.kposLo !== g.p.kposLo || other.kposHi !== g.p.kposHi).toBe(true);
      expect(source(other, g.t, s.meter)).toEqual([]);
      expect(source(g.p, g.t, s.meter).length).toBe(g.planSet?.lines.length);
    } finally {
      s.gen.setStrategyWitness(null);
    }
  });
});

/** Definition index by id. */
function defOf(id: string): number {
  const d = DEF_INDEX.get(id);
  if (d === undefined) throw new Error(`no def ${id}`);
  return d;
}

/** A square where a `def` BUY is legal after `act` and END_ACTION (and the
 * pending upkeep, paid with the Replica's own first legal keep set). */
function firstLegalBuySquare(root: PackedState, act: number, def: string): number {
  const q = allocState();
  copyState(q, root);
  const undo = newUndo();
  rep.make(q, act, undo);
  rep.make(q, paMake(AKind.END_ACTION), undo);
  if (q.upkeepPending === 1) {
    const table = newKeepSetTable();
    rep.genKeepSets(q, table);
    const choice = { masks: table.masks.slice(0, MAX_SLOTS >>> 5), count: 1 };
    rep.make(q, paMake(AKind.PAY_UPKEEP, 0), undo, choice);
  }
  for (let sq = 0; sq < 100; sq++) if (rep.isLegal(q, paMake(AKind.BUY, defOf(def), sq, 0))) return sq;
  throw new Error('no legal buy square');
}

// ---------------------------------------------------------------------------

describe('every injected line is a legal complete turn, and the generator agrees with the strategic layer', () => {
  it.each(ALL_STATES.map(([name, build]) => [name, build] as const))('%s', (_name, build) => {
    const state = build();
    const g = rootGeneration(state);
    const injected = strategyTurns(g.turns);
    const offered = g.planSet?.lines ?? [];
    // Exactly the offered lines, no more, no fewer.
    expect(injected.map(keyOf).sort()).toEqual([...new Set(offered.map(l => l.endKey))].sort());
    for (const turn of injected) {
      expect(turn.flags & STRATEGY_BITS).toBe(STRATEGY_BITS);
      const check = verifyTurn(g.s.rep, state, g.p, turn, g.s.keep[0]);
      expect(check.verified, check.reason).toBe(true);
      // A complete turn: it ends at a hand-off (or a decided game).
      const post = applyTurn(g.p, turn);
      expect(post.result !== Result.ONGOING || post.side !== g.p.side).toBe(true);
      const line = lineOf(g.planSet, turn);
      expect(line).not.toBeNull();
      if ((turn.flags & TurnFlag.PURCHASE) !== 0) expect(Array.from(turn.actions, paKind)).toContain(AKind.BUY);
      if ((turn.flags & TurnFlag.PROMOTION) !== 0) expect(Array.from(turn.actions, paKind)).toContain(AKind.PROMOTE);
    }
    // A posture with an Act root always yields at least one line.
    if (g.reading.posture !== 'none') expect(injected.length).toBeGreaterThan(0);
    else expect(injected).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('ForceContact (strategy/contact.ts)', () => {
  it('a wave-1 bounded-loss root (behind, clock >= 4, units and cash, no contact) gets ForceContact lines including a complete buy turn in the searched root list', async () => {
    const state = trailingNoContact();
    const p = rep.pack(state, allocState());
    const reading = clockReading(p, W);
    expect(reading.verdict).toBe('bounded-loss');
    expect(p.clock).toBeGreaterThanOrEqual(4);
    expect(p.bank[W]).toBeGreaterThan(0);
    // No contact: no damaging attack is available to White this turn.
    for (let u = 0; u < MAX_SLOTS; u++) {
      if (p.sq[u] === DEAD || p.owner[u] !== W) continue;
      for (let v = 0; v < MAX_SLOTS; v++) {
        if (p.sq[v] === DEAD || p.owner[v] !== B) continue;
        expect(MANHATTAN[p.sq[u] * 100 + p.sq[v]]).toBeGreaterThan(8);
      }
    }
    const r = await new HardEngine(strategosPatch()).searchTurn(state, { work: SEARCH_WORK, expose: true });
    const st = r.strategy;
    expect(st).toBeDefined();
    expect(st?.posture).toBe('force-contact');
    expect(st?.injected.length).toBeGreaterThanOrEqual(2);
    for (const plan of st?.injected ?? []) expect(plan.contract.kind).toBe('force-contact');
    const buy = st?.injected.find(i => i.label.includes('+buy:'));
    expect(buy).toBeDefined();
    const cand = (r.candidates ?? []).find(c => c.endKey === buy?.endKey);
    expect(cand).toBeDefined();
    expect((cand?.flags ?? 0) & (STRATEGY_BITS | TurnFlag.PURCHASE)).toBe(STRATEGY_BITS | TurnFlag.PURCHASE);
    // The buy line, read off the generator: act, END_ACTION, BUY, END_PLACE.
    const g = rootGeneration(state);
    const turn = g.turns.find(t => keyOf(t) === buy?.endKey) as Turn;
    const kinds = Array.from(turn.actions, paKind);
    const at = kinds.indexOf(AKind.BUY);
    expect(kinds.slice(0, kinds.indexOf(AKind.END_ACTION)).every(k => k === AKind.MOVE || k === AKind.ATTACK)).toBe(true);
    expect(kinds[at - 1] === AKind.END_ACTION || kinds[at - 1] === AKind.PAY_UPKEEP).toBe(true);
    expect(kinds[kinds.length - 1]).toBe(AKind.END_PLACE);
    // The bought body stands on a legal spawn square nearest the enemy: no
    // square where the same BUY is legal after the same prefix is closer
    // (Manhattan) to a live Black unit.
    const def = paA(turn.actions[at]);
    const prefix = allocState();
    copyState(prefix, g.p);
    const prefixUndo = newUndo();
    const prefixKeep: KeepSetTable | undefined = turn.keepMask === undefined ? undefined : { masks: turn.keepMask, count: 1 };
    for (let i = 0; i < at; i++) rep.make(prefix, turn.actions[i], prefixUndo, prefixKeep);
    const toEnemy = (sq: number): number => {
      let best = 100;
      for (let v = 0; v < MAX_SLOTS; v++) if (prefix.sq[v] !== DEAD && prefix.owner[v] === B) best = Math.min(best, MANHATTAN[sq * 100 + prefix.sq[v]]);
      return best;
    };
    let nearest = 100;
    for (let sq = 0; sq < 100; sq++) if (rep.isLegal(prefix, paMake(AKind.BUY, def, sq, 0))) nearest = Math.min(nearest, toEnemy(sq));
    expect(toEnemy(paB(turn.actions[at]))).toBe(nearest);
    // The bought body is the fastest class that can damage the target.
    const target = st?.queries.find(q => q.name === 'contact.target')?.result as { def: string } | null;
    expect(target).not.toBeNull();
    for (let d = 0; d < DEF_ID.length; d++) {
      if (cat.tier[d] !== 1 || cat.cost[d] > p.bank[W] + 30) continue;
      const tdef = defOf(target?.def ?? '');
      if (cat.power[powerIndex(W, d, tdef)] > 0 && cat.cost[d] <= cat.cost[def]) expect(cat.spd[d]).toBeLessThanOrEqual(cat.spd[def]);
    }
  });

  it("approach lines never leave our killEta above passing's — and strictly below it where passing cannot reach in time", () => {
    let strict = 0;
    let checked = 0;
    for (const [, build] of ALL_STATES) {
      const g = rootGeneration(build());
      if (g.reading.posture !== 'force-contact') continue;
      const me = g.p.side as Side;
      const pass = killEta(passPost(g.p), me, { limit: g.reading.r }).plies;
      for (const turn of strategyTurns(g.turns)) {
        const line = lineOf(g.planSet, turn);
        if (line === null || line.prep.length !== 0 || line.act.length === 0) continue;
        const eta = killEta(applyTurn(g.p, turn), me, { limit: g.reading.r }).plies;
        expect(eta).toBeLessThanOrEqual(pass);
        checked++;
        if (eta < pass) strict++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
    expect(strict).toBeGreaterThanOrEqual(2);
  });

  it('the approach chosen is the killEta-minimising one: strictly below passing where passing cannot reach (paired roots)', () => {
    // tooFarToReach: passing reads 3, the approach 2. promoteCrossing: passing
    // reads 4 and one candidate (walking the plant) also reads 4 — the fire's
    // approach reads 2 and must be the one offered.
    for (const [build, pass, best] of [[tooFarToReach, 3, 2], [promoteCrossing, 4, 2]] as const) {
      const g = rootGeneration(build());
      const me = g.p.side as Side;
      expect(killEta(passPost(g.p), me, { limit: g.reading.r }).plies).toBe(pass);
      const approach = strategyTurns(g.turns).find(t => lineOf(g.planSet, t)?.prep.length === 0) as Turn;
      expect(killEta(applyTurn(g.p, approach), me, { limit: g.reading.r }).plies).toBe(best);
    }
  });

  it('the approach closes on the target it names (Manhattan distance to the target shrinks)', () => {
    const g = rootGeneration(trailingNoContact());
    const target = g.planSet?.queries.find(q => q.name === 'contact.target')?.result as { slot: number };
    const tsq = g.p.sq[target.slot];
    const near = (q: PackedState): number => {
      let best = 100;
      for (let u = 0; u < MAX_SLOTS; u++) if (q.sq[u] !== DEAD && q.owner[u] === W && cat.atk[q.defId[u]] > 0) best = Math.min(best, MANHATTAN[q.sq[u] * 100 + tsq]);
      return best;
    };
    const approach = strategyTurns(g.turns).find(t => lineOf(g.planSet, t)?.prep.length === 0) as Turn;
    expect(approach).toBeDefined();
    expect(near(applyTurn(g.p, approach))).toBeLessThan(near(g.p));
  });

  it('feasibility is witnessed only when BOTH scripted replies witness contact; a paired enemy that cannot outrun us flips it', () => {
    const run = (state: GameState) => rootGeneration(state).planSet as PlanSet;
    const escapes = run(evadeEscapes());
    const approach = escapes.lines.find(l => l.prep.length === 0) as PlanSet['lines'][number];
    expect(approach.queries.map(q => [q.name, q.outcome])).toEqual([
      ['contact.rollout.continue', 'witnessed'],
      ['contact.rollout.evade', 'refuted'],
    ]);
    expect(approach.feasibility).toBe('not-ruled-out');

    // One fact changed: Black's fire_1 (speed 2) becomes a metal_1 (speed 0),
    // which cannot leave a water_1's reach at all; water still damages it
    // (2 − 1 = 1 > 0: plant/metal beat water/shadow).
    const slow = evadeEscapes();
    const units = slow.board.units.map(u => (u.owner === 'black' && u.definitionId === 'fire_1' ? { ...u, definitionId: 'metal_1' } : u));
    const pinned = run({ ...slow, board: { ...slow.board, units } });
    const pinnedApproach = pinned.lines.find(l => l.prep.length === 0) as PlanSet['lines'][number];
    expect(pinnedApproach.queries.map(q => q.outcome)).toEqual(['witnessed', 'witnessed']);
    expect(pinnedApproach.feasibility).toBe('witnessed');

    // Contact in the line itself: witnessed at ply 1 against both, for free.
    const now = run(contactThisTurn());
    for (const l of now.lines) {
      expect(l.feasibility).toBe('witnessed');
      for (const q of l.queries) expect(q.result).toMatchObject({ ply: 1 });
    }
    // Deadline ply 1 and no reach: refuted by both, never better than unknown.
    const far = run(tooFarToReach());
    for (const l of far.lines) {
      expect(l.queries.map(q => q.outcome)).toEqual(['refuted', 'refuted']);
      expect(l.feasibility).toBe('unknown');
    }
  });

  it('never claims forced, and every grade is exactly what its two rollouts say', () => {
    for (const [, build] of ALL_STATES) {
      const set = rootGeneration(build()).planSet;
      for (const l of set?.lines ?? []) {
        if (l.contract.kind !== 'force-contact') continue;
        expect(l.feasibility).not.toBe('forced');
        const witnessed = l.queries.filter(q => q.outcome === 'witnessed').length;
        expect(l.feasibility).toBe(witnessed === 2 ? 'witnessed' : witnessed === 1 ? 'not-ruled-out' : 'unknown');
        expect(l.queries.map(q => q.name)).toEqual(['contact.rollout.continue', 'contact.rollout.evade']);
      }
    }
  });

  it("every witness is a replayable line: the recorded rollout replays at the root's full prover to our damaging attack at exactly the claimed ply, never past the deadline", () => {
    // Every rollout is replayed, not only the witnesses: a refuted or
    // unresolved one must contain no damaging attack of ours, and the scripted
    // replies must have played exactly their scripts — `continue` attacks
    // only a unit it removes in that hit, `evade` never attacks (reviewer,
    // W1.9: neither was pinned; `zeroPowerNeighbours` exercises both).
    let replayed = 0;
    let inLine = 0;
    let zeroSeen = 0;
    for (const [name, build] of [...ALL_STATES, ...DEADLINE_EDGES, ['zeroPowerNeighbours', zeroPowerNeighbours] as const]) {
      const g = rootGeneration(build());
      const me = g.p.side as Side;
      for (const l of g.planSet?.lines ?? []) {
        if (l.contract.kind !== 'force-contact') continue;
        const turn = g.turns.find(t => keyOf(t) === l.endKey) as Turn;
        for (const q of l.queries) {
          const res = q.result as ContactRollout;
          const witnessed = q.outcome === 'witnessed';
          if (witnessed) {
            expect(res.ply, `${name} ${l.label} ${q.name}`).not.toBeNull();
            expect(res.ply as number, `${name} ${l.label} ${q.name}`).toBeLessThanOrEqual(l.contract.deadlinePly);
          } else {
            expect(res.ply, `${name} ${l.label} ${q.name}`).toBeNull();
          }
          if (witnessed && res.ply === 1) {
            // Contact in the line itself: the recorded turn makes it.
            expect(turnDamages(g.p, turn), `${name} ${l.label}`).toBe(true);
            expect(res.actions).toEqual([]);
            inLine++;
            continue;
          }
          // Replayed from the position the generator's own turn reaches, at
          // the ROOT's prover mode (the rollout ran at the admissible bound),
          // every rent paid with the rule the rollout used.
          const b = applyTurn(g.p, turn);
          expect(b.proverMode).toBe(PROVER_FULL);
          const undo = newUndo();
          const table = newKeepSetTable();
          let ply = 2;
          let hit = -1;
          for (let i = 0; i < res.actions.length; i++) {
            expect(b.result, `${name} ${l.label}: the game ended inside the rollout`).toBe(Result.ONGOING);
            const a = res.actions[i];
            const keep = paKind(a) === AKind.PAY_UPKEEP ? (firstLegalKeepSet(rep, b, g.t, table) ?? undefined) : undefined;
            expect(rep.isLegal(b, a, keep), `${name} ${l.label} action ${i}`).toBe(true);
            let victim = -1;
            if (paKind(a) === AKind.ATTACK) {
              victim = b.pieceAt[paB(a)];
              const power = cat.power[powerIndex(b.side as Side, b.defId[paA(a)], b.defId[victim])];
              if (b.side === me && power > 0) {
                hit = ply;
                expect(i).toBe(res.actions.length - 1); // the first contact ends the witness
              }
              if (b.side === me && power === 0) zeroSeen++;
              if (b.side !== me) expect(res.reply, `${name} ${l.label}: evade attacked`).toBe('continue');
            }
            const mover = b.side;
            undo.top = 0;
            rep.resetUndoScratch();
            rep.make(b, a, undo, keep);
            if (victim >= 0 && mover !== me) expect(b.sq[victim], `${name} ${l.label}: continue attacked without killing`).toBe(DEAD);
            if (b.side !== mover) ply++;
          }
          expect(hit, `${name} ${l.label} ${q.name}`).toBe(witnessed ? res.ply : -1);
          if (witnessed) replayed++;
        }
      }
    }
    expect(replayed).toBeGreaterThanOrEqual(3);
    expect(inLine).toBeGreaterThanOrEqual(3);
    expect(zeroSeen).toBe(0);
  });

  it('a zero-power neighbour is not contact: the paired root still grades on real damage', () => {
    // Control for `zeroPowerNeighbours`: it is a ForceContact root with lines,
    // and its plant/lightning pair is adjacent and zero-power one way.
    const g = rootGeneration(zeroPowerNeighbours());
    expect(g.reading.posture).toBe('force-contact');
    expect(g.planSet?.lines.length).toBeGreaterThan(0);
    const plant = g.p.pieceAt[4]; // (4,0)
    const bolt = g.p.pieceAt[5]; // (5,0)
    expect(DEF_ID[g.p.defId[plant]]).toBe('plant_1');
    expect(DEF_ID[g.p.defId[bolt]]).toBe('lightning_1');
    expect(cat.power[powerIndex(W, g.p.defId[plant], g.p.defId[bolt])]).toBe(0);
    expect(cat.power[powerIndex(B, g.p.defId[bolt], g.p.defId[plant])]).toBeGreaterThan(0);
  });

  it('the rollout budget binds: at a rung whose sixteenth the plan layer has spent before any rollout, every rollout is unresolved and no grade is claimed', () => {
    // A rung of 384 units: its sixteenth is one `killEta`, which passing's own
    // `killEta` spends before the first rollout starts.
    const STARVED = 384;
    expect(Math.floor(STARVED / STRATEGY_WORK_SHARE)).toBe(WORK_KILL_ETA);
    const starved = rootGeneration(evadeEscapes(), strategosPatch(), STARVED).planSet as PlanSet;
    const rollouts = starved.queries.filter(q => q.name.startsWith('contact.rollout.'));
    expect(rollouts.length).toBeGreaterThan(0);
    for (const q of rollouts) expect(q.outcome).toBe('unresolved');
    for (const l of starved.lines) expect(l.feasibility).toBe('unknown');
    // The same root at the ladder's rung resolves both (the control).
    const fed = rootGeneration(evadeEscapes()).planSet as PlanSet;
    expect(fed.queries.filter(q => q.name.startsWith('contact.rollout.')).map(q => q.outcome)).toEqual(['witnessed', 'refuted']);
  });

  it('the promote line crosses a one-shot threshold against the target, as a complete PROMOTION turn', () => {
    const g = rootGeneration(promoteCrossing());
    const target = g.planSet?.queries.find(q => q.name === 'contact.target')?.result as { slot: number };
    const tdef = g.p.defId[target.slot];
    const promo = strategyTurns(g.turns).find(t => (t.flags & TurnFlag.PROMOTION) !== 0) as Turn;
    expect(promo).toBeDefined();
    const a = Array.from(promo.actions).find(x => paKind(x) === AKind.PROMOTE) as number;
    const def = g.p.defId[paA(a)];
    expect(cat.power[powerIndex(W, def, tdef)]).toBeLessThan(cat.def[tdef]);
    expect(cat.power[powerIndex(W, cat.nextDef[def], tdef)]).toBeGreaterThanOrEqual(cat.def[tdef]);
  });

  it('declares its contract: deadline r − 1, damaging-attack, no essentials, one body plus spend and the costliest unit', () => {
    // White's costliest unit is a plant_1 (5) on both boards; promoteCrossing's
    // lines include a PROMOTE, trailingNoContact's a BUY.
    for (const build of [trailingNoContact, promoteCrossing]) {
    const g = rootGeneration(build());
    const costliest = cat.cost[defOf('plant_1')];
    expect(g.planSet?.lines.some(l => l.prep.length > 0)).toBe(true);
    for (const l of g.planSet?.lines ?? []) {
      expect(l.contract.deadlinePly).toBe(g.reading.r - 1);
      expect(l.contract.endPredicate).toBe('damaging-attack');
      expect(l.contract.essentialSlots).toEqual([]);
      // The Prepare's price at root prices: a BUY's class cost, a PROMOTE's
      // promotion cost of the slot's current class.
      let spend = 0;
      for (const a of Array.from(l.prep)) spend += paKind(a) === AKind.BUY ? cat.cost[paA(a)] : cat.promoCost[g.p.defId[paA(a)]];
      expect(l.contract.permittedLoss).toEqual({ units: 1, crystals: spend + costliest });
    }
    }
  });
});

// ---------------------------------------------------------------------------

describe('Hold (strategy/hold.ts)', () => {
  it('a bounded-win root gets Hold lines in the searched root list: the pass (merged with injection 1), a retreat and a chain break', async () => {
    const state = leadingExposed();
    const p = rep.pack(state, allocState());
    expect(clockReading(p, W).verdict).toBe('bounded-win');
    const r = await new HardEngine(strategosPatch()).searchTurn(state, { work: SEARCH_WORK, expose: true });
    const st = r.strategy;
    expect(st?.posture).toBe('hold');
    const labels = (st?.injected ?? []).map(i => i.label);
    expect(labels[0]).toBe('hold:pass');
    expect(labels.some(l => l.startsWith('hold:retreat('))).toBe(true);
    expect(labels.some(l => l.startsWith('hold:break-chain('))).toBe(true);
    for (const plan of st?.injected ?? []) {
      expect(plan.contract.kind).toBe('hold');
      const cand = (r.candidates ?? []).find(c => c.endKey === plan.endKey);
      expect(cand).toBeDefined();
      expect((cand?.flags ?? 0) & STRATEGY_BITS).toBe(STRATEGY_BITS);
    }
    // The pass line is injection 1's own pass: one candidate, flags merged.
    const g = rootGeneration(state);
    const pass = g.turns.filter(t => Array.from(t.actions, paKind).every(k => k === AKind.END_ACTION || k === AKind.PAY_UPKEEP || k === AKind.END_PLACE));
    expect(pass).toHaveLength(1);
    expect(pass[0].flags & (STRATEGY_BITS | TurnFlag.QUIET)).toBe(STRATEGY_BITS | TurnFlag.QUIET);
  });

  // On today's lines the filter behind this is a GUARD, not a choice: a
  // retreat or chain break is offered only for a unit the enemy can kill
  // next turn, so passing already leaves the enemy's killEta at its floor
  // (1). The property is asserted on every line anyway, recomputed from the
  // recorded turn.
  it("Hold lines never leave the enemy's killEta below passing's", () => {
    let checked = 0;
    for (const [, build] of ALL_STATES) {
      const g = rootGeneration(build());
      if (g.reading.posture !== 'hold') continue;
      const opp = (1 - g.p.side) as Side;
      const base = passPost(g.p);
      const pass = killEta(base, opp, { limit: clockPliesLeft(base) }).plies;
      for (const turn of strategyTurns(g.turns)) {
        const post = applyTurn(g.p, turn);
        expect(killEta(post, opp, { limit: clockPliesLeft(post) }).plies).toBeGreaterThanOrEqual(pass);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it('the retreat moves exposed killable units outside the enemy strike area, most expensive first; the chain break strictly reduces the chain', () => {
    const g = rootGeneration(leadingExposed());
    const exposure = g.t.exposure[W];
    const retreat = (g.planSet?.lines ?? []).find(l => l.label.startsWith('hold:retreat(')) as PlanSet['lines'][number];
    for (const a of Array.from(retreat.act)) {
      expect(paKind(a)).toBe(AKind.MOVE);
      expect(bbHas(exposure, g.p.sq[paA(a)])).toBe(true);
      expect(g.t.killActions[paA(a)]).toBeLessThanOrEqual(4);
      expect(bbHas(exposure, paB(a))).toBe(false);
    }
    // The chain: Black's fire from (4,5) Cleaves both plants before, one after.
    const chain = (g.planSet?.lines ?? []).find(l => l.label.startsWith('hold:break-chain(')) as PlanSet['lines'][number];
    const sc = new Scratch(1, 0, 1, 0);
    const ctxTables = allocTables();
    const plan = newCleavePlan();
    const fire = g.p.pieceAt[55];
    buildTables(g.p, new Scratch(4, 8, 4, 4), 0, 1, ctxTables);
    expect(cleavePlan(g.p, ctxTables, fire, sc, 0, plan).valueCc).toBeGreaterThan(0);
    expect(plan.kills).toBe(2);
    const turn = g.turns.find(t => keyOf(t) === chain.endKey) as Turn;
    const post = applyTurn(g.p, turn);
    buildTables(post, new Scratch(4, 8, 4, 4), 0, 1, ctxTables);
    cleavePlan(post, ctxTables, fire, sc, 0, plan);
    expect(plan.kills).toBeLessThan(2);
  });

  it("forced is exactly 'the enemy killEta exceeds the plies left', checked against the engine's own one-turn kill table", () => {
    // p4-det-018: r = 2, so after our turn one enemy turn is all that is left.
    const g = rootGeneration(corpusState('p4-det-018'));
    expect(g.reading.posture).toBe('hold');
    const grades = new Map<string, string>();
    for (const l of g.planSet?.lines ?? []) {
      const turn = g.turns.find(t => keyOf(t) === l.endKey) as Turn;
      const post = applyTurn(g.p, turn);
      const left = clockPliesLeft(post);
      const eta = killEta(post, post.side as Side, { limit: left }).plies;
      expect(l.feasibility).toBe(eta > left ? 'forced' : 'unknown');
      grades.set(l.label.split('(')[0], l.feasibility);
      if (l.feasibility === 'forced' && left === 1) {
        // Exact here: one enemy Act remains, and the kill table finds no kill in it.
        const tables = allocTables();
        buildTables(post, new Scratch(4, 8, 4, 4), 0, 1, tables);
        const table = newKillTable();
        killTable(post, tables, post.side as Side, { actionBudget: 4, crystalBudget: post.bank[post.side], allowBuys: false, allowPromotes: false, horizon: 'current', maxLanes: KILL_MAX_LANES }, new Scratch(4, 8, 4, 4), 0, table);
        for (let v = 0; v < MAX_SLOTS; v++) if (post.sq[v] !== DEAD && post.owner[v] !== post.side) expect(table.entry[v].minActions).toBe(KILL_IMPOSSIBLE);
      }
    }
    // Paired lines, one fact apart (the retreated unit): pass unknown, retreat forced.
    expect(grades.get('hold:pass')).toBe('unknown');
    expect(grades.get('hold:retreat')).toBe('forced');
  });

  it('a kill first possible one ply after the clock ends is too late: the same far board is forced at clock 7 and unknown at clock 5', () => {
    // Black's only striker, a fire_1 on (9,9), cannot reach any White body in
    // its next Act; its first possible kill (the bound's first window) is its
    // second Act, ply 3 counted from the position the pass reaches.
    const far = (clock: number): GameState => {
      const units: UnitSpec[] = [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'white', x: 4, y: 6 },
        { def: 'plant_1', owner: 'white', x: 0, y: 1 },
        { def: 'fire_1', owner: 'white', x: 6, y: 2 },
        { def: 'fire_1', owner: 'black', x: 9, y: 9 },
        { def: 'plant_1', owner: 'black', x: 9, y: 0 },
      ];
      return withMined({ units, reserves: UNEQUAL_ROUTES_MAP, white: 5, black: 3, inactivityPlies: clock, turnNumber: 13, current: 'white' }, 50, 10);
    };
    for (const [clock, left, grade] of [[7, 2, 'forced'], [5, 4, 'unknown']] as const) {
      const g = rootGeneration(far(clock));
      expect(g.reading.posture).toBe('hold');
      const pass = (g.planSet?.lines ?? []).find(l => l.label === 'hold:pass') as PlanSet['lines'][number];
      const post = applyTurn(g.p, g.turns.find(t => keyOf(t) === pass.endKey) as Turn);
      expect(clockPliesLeft(post)).toBe(left);
      // The bound's first window is ply 3 whatever the limit, so only the
      // plies left decide the grade.
      expect(killEta(post, B, { limit: left + 1 }).plies).toBe(3);
      expect(pass.feasibility).toBe(grade);
      expect(pass.queries[0].result).toEqual({ plies: Math.min(3, left + 1), left });
    }
  });

  it("a nearly spent cell caps a unit's share: a plant on a cell with one crystal left is not essential where the same plant on a full cell is", () => {
    // leadingExposed(w, 10) with (4,4) — slot 0's cell — holding 1 crystal
    // instead of 8, the map's initial reserve moved with it so the
    // conservation invariant still holds. Slot 0 mines min(3·2, 1) = 1.
    const spent = (whiteGained: number): GameState => {
      const base = leadingExposed(whiteGained, 10);
      const cells = base.board.cells.map(row => row.map(c => ({ ...c })));
      const initial = [...(base.board.initialResourceLayers ?? [])];
      initial[44] -= cells[4][4].resourceLayers - 1;
      cells[4][4] = { ...cells[4][4], resourceLayers: 1 };
      return { ...base, board: { ...base.board, cells, initialResourceLayers: initial } };
    };
    for (const [w, expected] of [[9, [1, 2, 3]], [11, [1, 2]]] as const) {
      const p = rep.pack(spent(w), allocState());
      const reading = clockReading(p, W);
      expect(reading.verdict).toBe('bounded-win');
      const L = reading.ledger.sides[W].L.value;
      const U = reading.ledger.sides[B].U.value;
      // w = 9: L 24, U 22 — slot 0 (share 1) leaves 23 > 22, the fire (share
      // 2) exactly 22, a tie, so the fire is essential and slot 0 is not;
      // w = 11: L 26 — only the two full-cell plants (share 6) are.
      expect(L - U).toBe(w - 7);
      expect(holdEssentialSlots(p, reading)).toEqual(expected);
    }
  });

  it('essential slots are exactly the units whose stay-put share would cost the clock win (paired margins, a tie included)', () => {
    // leadingExposed(w, 10): Black's ceiling U_b is 22; White's floor is
    // w + 20 (three plants mining 6 each over two events, the fire 2).
    const essential = (whiteGained: number) => {
      const p = rep.pack(leadingExposed(whiteGained, 10), allocState());
      const reading = clockReading(p, W);
      expect(reading.verdict).toBe('bounded-win');
      const L = reading.ledger.sides[W].L.value;
      const U = reading.ledger.sides[B].U.value;
      const oracle: number[] = [];
      for (let u = 0; u < MAX_SLOTS; u++) {
        if (p.sq[u] === DEAD || p.owner[u] !== W) continue;
        const share = Math.min(cat.mine[p.defId[u]] * reading.ledger.sides[W].minings, p.reserve[p.sq[u]]);
        if (L - share <= U) oracle.push(u);
      }
      const got = holdEssentialSlots(p, reading);
      expect(got).toEqual(oracle);
      return { got, L, U, r: reading.r };
    };
    expect(essential(50)).toMatchObject({ got: [], L: 70, U: 22 }); // a wide lead: nobody
    expect(essential(6)).toMatchObject({ got: [0, 1, 2], L: 26, U: 22 }); // a plant's 6 would cost it; the fire's 2 would not
    // A TIE is a draw, not a win: losing the fire (share 2) leaves 22 = U_b.
    expect(essential(4)).toMatchObject({ got: [0, 1, 2, 3], L: 24, U: 22 });
    const set = rootGeneration(leadingExposed(6, 10)).planSet;
    expect(set?.lines.length).toBeGreaterThan(0);
    for (const l of set?.lines ?? []) {
      expect(l.contract).toMatchObject({ kind: 'hold', endPredicate: 'enemy-killeta-exceeds-r', deadlinePly: 4, permittedLoss: { units: 0, crystals: 0 } });
      expect(l.contract.essentialSlots).toEqual([0, 1, 2]);
    }
  });
});

// ---------------------------------------------------------------------------

describe('posture drives the plan kind (paired one-fact flips)', () => {
  it('moving the mined lead across swaps Hold for ForceContact on the same board; a tie injects nothing', () => {
    const kinds = (state: GameState) => {
      const g = rootGeneration(state);
      return { posture: g.reading.posture, kinds: [...new Set((g.planSet?.lines ?? []).map(l => l.contract.kind))], n: strategyTurns(g.turns).length };
    };
    expect(kinds(leadingExposed(50, 10))).toMatchObject({ posture: 'hold', kinds: ['hold'] });
    expect(kinds(leadingExposed(10, 50))).toMatchObject({ posture: 'force-contact', kinds: ['force-contact'] });
    expect(kinds(trailingNoContact(12, 45))).toMatchObject({ posture: 'force-contact', kinds: ['force-contact'] });
    expect(kinds(trailingNoContact(40, 40))).toEqual({ posture: 'none', kinds: [], n: 0 });
  });
});

// ---------------------------------------------------------------------------

describe('the root: flag absent, ordering, charging, Chronicle', () => {
  /**
   * `resultDigestSource` digests of the exposed fixed-work `RootResult`
   * (`DIGEST_WORK`), computed from these exact states against an archive of
   * `c054136b` (`git archive c054136b`, before any W1.9 source existed) and
   * reproduced by the tree without `strategyPlans`.
   */
  const PINNED: Record<'desktop' | 'strategosNoPlans', Record<string, string>> = {
    desktop: {
      trailingNoContact: 'daa6dceb7ec68a31',
      trailingNoContactTied: '3d87a521e2da1bbd',
      leadingExposed: 'b7827937c58febcc',
      leadingExposedFlipped: '1378e83ec6eca1a1',
      promoteCrossing: 'fab897f0a8e1fe52',
      contactThisTurn: '110b7db2ace59ede',
      evadeEscapes: '55b4a721fe489a7c',
      tooFarToReach: 'c025965dfef7d566',
      'p4-det-015': '942eea8ae05c0926',
      'p4-det-018': 'e429b49e0e7f7610',
      'p4-det-019': '999713a8eba58c2e',
      'p4-det-022': '8cc024c509438994',
      'p4-det-023': 'f7004edce23dcaa2',
    },
    strategosNoPlans: {
      trailingNoContact: '6cd11c712c49e61d',
      trailingNoContactTied: 'af8e07ced05477e7',
      leadingExposed: '0ed335303a27ef1a',
      leadingExposedFlipped: '527794742b45ffc4',
      promoteCrossing: '5da3d9c9c1f5ce94',
      contactThisTurn: 'd65380c675398064',
      evadeEscapes: '4b0fcbc4ed15d802',
      tooFarToReach: 'f4f8411a839c9789',
      'p4-det-015': '7a387e62977a5fd3',
      'p4-det-018': 'a23f3f732b6259ec',
      'p4-det-019': 'abd3658622e3ce87',
      'p4-det-022': 'fdc72822485b6047',
      'p4-det-023': '4c42f60dd730045e',
    },
  };

  it('flag absent: hard@desktop and hard@strategos-without-strategyPlans are byte-identical to c054136b', async () => {
    for (const [cfgName, cfg] of [['desktop', undefined], ['strategosNoPlans', noPlans()]] as const) {
      for (const [name, build] of ALL_STATES) {
        const r = await new HardEngine(cfg).searchTurn(build(), { work: DIGEST_WORK, expose: true });
        expect(r.strategy, `${cfgName}/${name}`).toBeUndefined();
        expect(`${cfgName}/${name}:${digest(r)}`).toBe(`${cfgName}/${name}:${PINNED[cfgName][name]}`);
      }
    }
  });

  it('control: with strategyPlans the same exposed result differs wherever a posture injects lines', async () => {
    for (const name of ['trailingNoContact', 'leadingExposed', 'p4-det-023']) {
      const build = ALL_STATES.find(([n]) => n === name)?.[1] as () => GameState;
      const r = await new HardEngine(strategosPatch()).searchTurn(build(), { work: DIGEST_WORK, expose: true });
      expect(digest(r)).not.toBe(PINNED.strategosNoPlans[name]);
    }
  });

  it('the plan work is charged to the meter once, at the first root generation, and bounded by the share cap', () => {
    for (const name of ['trailingNoContact', 'leadingExposed', 'evadeEscapes']) {
      const build = ALL_STATES.find(([n]) => n === name)?.[1] as () => GameState;
      const engine = new HardEngine(strategosPatch());
      const s = engine.ctx;
      const p = s.rep.pack(build(), engine.rootState);
      p.proverMode = PROVER_FULL;
      s.root = p.side as Side;
      s.meter.reset(SEARCH_WORK);
      const t = buildSearchTables(s, p, 0);
      const ref = installStrategyWitness(s, p, clockReading(p, p.side as Side));
      try {
        const u0 = s.meter.used;
        generateAt(s, p, t, 0);
        const first = s.meter.used - u0;
        const set = ref() as PlanSet;
        const u1 = s.meter.used;
        generateAt(s, p, t, 0);
        const second = s.meter.used - u1;
        expect(set.work).toBeGreaterThan(0);
        expect(first - second).toBe(set.work);
        expect(set.queries.reduce((a, q) => a + q.workCost, 0)).toBeLessThanOrEqual(set.work);
        expect(set.work).toBeLessThanOrEqual(Math.floor(SEARCH_WORK / 16) + 1000);
      } finally {
        s.gen.setStrategyWitness(null);
      }
    }
  });

  it('plan lines outrank every candidate without a tactical ordering bonus (the TT move aside)', async () => {
    // `ORDER_STRATEGY` sits below the TT move, a home rescue/entry and a
    // many-anchor denial, and above everything else; a candidate carrying
    // none of the bonus-bearing flags can only be ahead of a plan line as the
    // previous iteration's TT move.
    const BONUS = TurnFlag.KILL | TurnFlag.SPAWN_DENY | TurnFlag.HOME_RESCUE | TurnFlag.HOME_ENTRY | TurnFlag.HOME_FORTIFY | TurnFlag.CLEAVE_CHAIN;
    let plain = 0;
    for (const name of ['trailingNoContact', 'leadingExposed', 'p4-det-018', 'p4-det-023']) {
      const build = ALL_STATES.find(([n]) => n === name)?.[1] as () => GameState;
      const r = await new HardEngine(strategosPatch()).searchTurn(build(), { work: DIGEST_WORK, expose: true });
      expect(r.candidateSource).toBe('completed-depth');
      const list = r.candidates ?? [];
      const plans = list.flatMap((c, i) => ((c.flags & TurnFlag.STRATEGY) !== 0 ? [i] : []));
      expect(plans.length, name).toBeGreaterThan(0);
      const lastPlan = plans[plans.length - 1];
      const plainAhead = list.slice(0, lastPlan).filter(c => (c.flags & (TurnFlag.STRATEGY | BONUS)) === 0);
      expect(plainAhead.length, name).toBeLessThanOrEqual(1);
      plain += list.slice(lastPlan + 1).filter(c => (c.flags & BONUS) === 0).length;
      for (const i of plans) expect(list[i].genRankCc).toBeGreaterThan(ORDER_STRATEGY / 2);
    }
    // Non-vacuous: plain candidates exist and all of them rank behind.
    expect(plain).toBeGreaterThan(10);
  });

  it('the Chronicle is JSON-serialisable, deterministic across engines, and names what the root played', async () => {
    for (const name of ['trailingNoContact', 'evadeEscapes', 'leadingExposed', 'p4-det-019']) {
      const build = ALL_STATES.find(([n]) => n === name)?.[1] as () => GameState;
      const a = await new HardEngine(strategosPatch()).searchTurn(build(), { work: DIGEST_WORK });
      const b = await new HardEngine(strategosPatch()).searchTurn(build(), { work: DIGEST_WORK });
      expect(JSON.stringify(a.strategy)).toBe(JSON.stringify(b.strategy));
      expect(a.endKey).toBe(b.endKey);
      const st = a.strategy;
      expect(st).toBeDefined();
      expect(JSON.parse(JSON.stringify(st))).toEqual(st);
      expect(Object.keys(st?.reading ?? {}).sort()).toEqual(['marginL', 'marginMid', 'r', 'side', 'verdict']);
      const plan = st?.injected.find(i => i.endKey === a.endKey);
      expect(st?.chosen?.endKey).toBe(a.endKey);
      expect(st?.chosen?.source).toBe(plan !== undefined ? 'plan' : 'search');
      expect(st?.chosen?.planLabel).toBe(plan?.label);
    }
  });

  it('clears the source and restores the policy in the finally, even when the search throws', async () => {
    const engine = new HardEngine(strategosPatch());
    const gen = engine.ctx.gen as unknown as { strategy: unknown };
    const ok = await engine.searchTurn(trailingNoContact(), { work: SEARCH_WORK });
    expect(ok.strategy?.injected.length).toBeGreaterThan(0); // the source ran...
    expect(gen.strategy).toBeNull(); // ...and is gone
    const prior = { rootClock: 7, reading: null };
    setKillClockPolicy(prior);
    hooks.throwOnIterate = true;
    const thrown = await engine.searchTurn(trailingNoContact(), { work: SEARCH_WORK });
    // `engine.ts` turns the throw into a fallback (kill-clock-policy.test.ts).
    expect(thrown.fallback).toBe('engine-error');
    expect(gen.strategy).toBeNull();
    expect(getKillClockPolicy()).toEqual(prior);
  });
});

