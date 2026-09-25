// @vitest-environment node
/**
 * STRATEGOS W1.10 — the plan-consistency veto and the Chronicle (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part A items 2-3, Part
 * B.1 "Veto rule at the root", B.2 step W1.10): `strategy/veto.ts`,
 * `search/veto.ts`, `search/root.ts`'s wiring, `WorkMeter.setLimit` and
 * `RootProbe.completedScore`.
 *
 * What these tests challenge, rather than restate:
 *
 *   - the DECISION RULE as a table on the pure `vetoVerdict`, edges included:
 *     the terminal threshold's exact boundary, a bounded clock-out
 *     (`BOUNDED_CLOCK_CC`) that must NOT count as a proof, both sides lost,
 *     material alone, a forgone forced win, observed vs inferred reasons,
 *     and a terminal proof outranking a dead essential;
 *   - PAIRED ROOTS that differ in one fact and must flip the veto:
 *     `mateOrMaterial` (one far White plant decides whether the plan line's
 *     unit loss is an elimination or only material) and `essentialOrNot`
 *     (four crystals of mined lead decide whether the plant the plan line
 *     loses is essential) — each vetoed/played claim is then CONFIRMED BY THE
 *     CANONICAL ENGINE: the plan line and the reply the Chronicle names are
 *     regenerated, found by end key and replayed through `verifyTurn`, and
 *     the canonical end state must show the elimination, the lost unit or
 *     the dead essential the Chronicle claims;
 *   - PLAN CONSISTENCY recomputed from the turn itself on every candidate of
 *     every posture root: a ForceContact candidate is consistent iff it is
 *     injected or its Act makes an attack with nonzero power; a Hold
 *     candidate iff it is injected, or kills nothing and leaves the enemy's
 *     killETA above the plies left;
 *   - the RE-SEARCH against an oracle: every `pvs` call it makes is recorded
 *     (a module mock), so its depth (completed depth − 1, floored at 1), its
 *     full window and the reply it names (the first reaching the opponent's
 *     best recorded value, not merely the first searched) are checked on
 *     every posture root; a consistent tactical best is the plan move with
 *     nothing re-searched;
 *   - the RESERVE: deepening leaves it (the meter's limit is lowered and put
 *     back, even when deepening throws), a posture-free root takes none (its
 *     move, score, depth and work equal the veto-off search's), and the
 *     re-search is never cut for budget at A8's rung;
 *   - DETERMINISM and SHAPE: two fixed-work runs agree to the byte,
 *     Chronicle included; the Chronicle survives a JSON round trip;
 *     `hard@desktop` carries no `strategy` key and, like the flag-absent
 *     strategos twin, is byte-identical to `c054136b` on these roots.
 */
import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../../src/game/types';
import { strategosPatch, type HardConfig } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import { installStrategyWitness, type RootResult } from '../../../src/ai/hard/search/root';
import { INF, PROVER_FULL, buildSearchTables, generateAt, makeTurn } from '../../../src/ai/hard/search/pvs';
import { VETO_RESERVE_SHARE, comparePicks, reserveFor, type RankedPick } from '../../../src/ai/hard/search/veto';
import { WorkMeter } from '../../../src/ai/hard/search/time';
import { TurnFlag, type Turn } from '../../../src/ai/hard/gen/turn';
import { clockReading, type ClockReading } from '../../../src/ai/hard/strategy/clock';
import { clockPliesLeft, killEta } from '../../../src/ai/hard/strategy/killeta';
import { holdEssentialSlots } from '../../../src/ai/hard/strategy/hold';
import { newPlanScratch } from '../../../src/ai/hard/strategy/plan';
import { actLength, deadEssentials, planConsistency, terminalLossThreshold, vetoVerdict, type VetoEvidence } from '../../../src/ai/hard/strategy/veto';
import type { StrategyChronicle } from '../../../src/ai/hard/strategy/types';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { Replica, allocState, copyState, newUndo } from '../../../src/ai/hard/core/state';
import { AKind, paA, paB, paKind, paMake, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { activeCatalog, powerIndex } from '../../../src/ai/hard/core/catalog';
import { BOUNDED_CLOCK_CC, setKillClockPolicy } from '../../../src/ai/hard/eval/evaluate';
import { DEAD, MATE_PLY_CC, MAX_SLOTS, NO_SLOT, Reason, Result, WIN_CC, type PackedState, type Side } from '../../../src/ai/hard/types';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { CORPUS_POSTURE_IDS, NO_RESERVES, PLAN_FIXTURES, resultDigestSource, withMined, type ExposedResultLike } from './strategy-plans-fixture';
import { ESSENTIAL_CELL, VETO_FIXTURES, essentialOrNot, mateOrMaterial } from './strategy-veto-fixture';

vi.setConfig({ testTimeout: 180_000 });

/** Mock hooks (the strategy-plans test's pattern): `iterativeDeepening`
 * throws on request, AFTER `search/root.ts` has lowered the meter's limit, or
 * returns no move (the watchdog's "no completed or partial answer" case); and
 * every EXTERNAL call of `pvs` is recorded. `pvs` recurses and `rootIteration`
 * calls it through `pvs.ts`'s own binding, which the mock does not replace, so
 * the only calls recorded are `search/veto.ts`'s re-search's — one or two per
 * ply-1 reply, in reply order. */
const hooks = vi.hoisted(() => ({
  throwOnIterate: false,
  noBest: false,
  pvsCalls: null as null | Array<{ depth: number; alpha: number; beta: number; ply: number; sig: number; score: number }>,
}));
vi.mock('../../../src/ai/hard/search/pvs', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/ai/hard/search/pvs')>();
  return {
    ...actual,
    iterativeDeepening: (...args: Parameters<typeof actual.iterativeDeepening>) => {
      if (hooks.throwOnIterate) throw new Error('injected for strategy-veto.test.ts');
      const r = actual.iterativeDeepening(...args);
      return hooks.noBest ? { ...r, best: null } : r;
    },
    pvs: (...args: Parameters<typeof actual.pvs>) => {
      const score = actual.pvs(...args);
      const [, , depth, alpha, beta, ply, sig] = args;
      hooks.pvsCalls?.push({ depth, alpha, beta, ply, sig, score });
      return score;
    },
  };
});

afterEach(() => {
  hooks.throwOnIterate = false;
  hooks.noBest = false;
  hooks.pvsCalls = null;
  setKillClockPolicy(null);
});

const cat = activeCatalog();
const rep = new Replica();
/** A8's R0/R1 rung. */
const SEARCH_WORK = 60_000;
/** The rung the flag-absent digests were pinned at (`c054136b`), as in the
 * W1.9 test. */
const DIGEST_WORK = 30_000;

const CORPUS = readPositions(new URL('../../../lab/hard-ai/positions/p4-determinism.jsonl', import.meta.url).pathname);
function corpusState(id: string): GameState {
  const row = CORPUS.find(r => r.id === id);
  if (row === undefined) throw new Error(`missing corpus row ${id}`);
  return row.state;
}

/** Every posture root the sweeps visit: this file's pairs, W1.9's fixtures
 * and the corpus's posture roots (the tests re-derive each posture). */
const SWEEP: ReadonlyArray<readonly [string, () => GameState]> = [
  ...VETO_FIXTURES,
  ...PLAN_FIXTURES,
  ...CORPUS_POSTURE_IDS.map(id => [id, () => corpusState(id)] as const),
];

function keyOf(turn: Turn): string {
  return `${(turn.endHi >>> 0).toString(16).padStart(8, '0')}${(turn.endLo >>> 0).toString(16).padStart(8, '0')}`;
}

async function strategos(state: GameState, cfg: Partial<HardConfig> = strategosPatch()): Promise<RootResult & { strategy: StrategyChronicle }> {
  const r = await new HardEngine(cfg).searchTurn(state, { work: SEARCH_WORK });
  expect(r.strategy).toBeDefined();
  return r as RootResult & { strategy: StrategyChronicle };
}

function research(r: RootResult) {
  const q = r.strategy?.queries.find(x => x.name === 'veto.research');
  return q as undefined | { outcome: string; workCost: number; result: Record<string, unknown> & { endKey: string; replyKey: string | null; scoreCc: number; tacticalScoreCc: number; essentialSlots: number[]; essentialLost: number[]; truncated: boolean; planLabel: string } };
}

/** `hard@strategos` with the veto (only) removed. */
function noVeto(): Partial<HardConfig> {
  const patch = strategosPatch();
  const searchFix = { ...patch.searchFix };
  delete searchFix.strategyVeto;
  return { ...patch, searchFix };
}

/** `hard@strategos` with both plan flags removed: the flag-absent twin. */
function noPlans(): Partial<HardConfig> {
  const patch = strategosPatch();
  const searchFix = { ...patch.searchFix };
  delete searchFix.strategyPlans;
  delete searchFix.strategyVeto;
  return { ...patch, searchFix };
}

/**
 * The root position and its ROOT candidate list exactly as a strategos search
 * generates it (pack, full prover, the kill-clock policy with the reading,
 * the plan source installed for the one generation), plus the context to walk
 * a line forward from it. The caller clears the policy (`afterEach`).
 */
function rootList(state: GameState) {
  const engine = new HardEngine(strategosPatch());
  const s = engine.ctx;
  const p = s.rep.pack(state, engine.rootState);
  p.proverMode = PROVER_FULL;
  s.root = p.side as Side;
  s.meter.reset(1e9);
  const reading = clockReading(p, p.side as Side);
  setKillClockPolicy({ rootClock: p.clock, reading });
  const t = buildSearchTables(s, p, 0);
  const planSet = installStrategyWitness(s, p, reading);
  let n: number;
  try {
    n = generateAt(s, p, t, 0);
  } finally {
    s.gen.setStrategyWitness(null);
  }
  const turns: Turn[] = s.turns[0].slice(0, n).map(turn => ({
    ...turn,
    actions: turn.actions.slice(0, turn.count),
    keepMask: turn.keepMask?.slice(),
  }));
  return { engine, s, p, reading, turns, injected: new Set((planSet()?.lines ?? []).map(l => l.endKey)) };
}

/**
 * Walks `planKey` and then the reply `replyKey` forward from `state` the way
 * the veto's re-search generated them (root list, then the interior
 * generator at ply 1), and replays both through the CANONICAL engine.
 * Returns the packed position and the canonical state after each.
 */
function walkLine(state: GameState, planKey: string, replyKey: string) {
  const { s, p } = rootList(state);
  const plan = s.turns[0].find(turn => keyOf(turn) === planKey);
  expect(plan, `plan ${planKey} in the root list`).toBeDefined();
  const planCheck = verifyTurn(s.rep, state, p, plan as Turn, s.keep[0]);
  expect(planCheck.verified).toBe(true);
  p.proverMode = PROVER_FULL;
  expect(makeTurn(s, p, plan as Turn, s.keep[0])).toBe((plan as Turn).count);
  const afterPlan = allocState();
  copyState(afterPlan, p);
  const t1 = buildSearchTables(s, p, 1);
  const n1 = generateAt(s, p, t1, 1);
  const reply = s.turns[1].slice(0, n1).find(turn => keyOf(turn) === replyKey);
  expect(reply, `reply ${replyKey} among the ply-1 replies`).toBeDefined();
  const replyCheck = verifyTurn(s.rep, planCheck.endState, afterPlan, reply as Turn, s.keep[1]);
  expect(replyCheck.verified).toBe(true);
  p.proverMode = PROVER_FULL;
  expect(makeTurn(s, p, reply as Turn, s.keep[1])).toBe((reply as Turn).count);
  const afterReply = allocState();
  copyState(afterReply, p);
  return { afterPlan, afterReply, planState: planCheck.endState, replyState: replyCheck.endState };
}

/** Live units of `owner` in a canonical state. */
function canonicalUnits(g: GameState, owner: 'white' | 'black'): string[] {
  return g.board.units.filter(u => u.owner === owner).map(u => `${u.definitionId}@${u.position.x},${u.position.y}`).sort();
}

// ---------------------------------------------------------------------------
// the rule
// ---------------------------------------------------------------------------

describe('vetoVerdict: the decision rule', () => {
  const MAX_PLY = 20;
  const T = terminalLossThreshold(MAX_PLY);
  const base: VetoEvidence = {
    planScoreCc: -500,
    tacticalScoreCc: 300,
    thresholdCc: T,
    observedReason: null,
    reading: { verdict: 'bounded-loss', r: 4 },
    essentialLost: [],
  };
  const mate = (ply: number) => -(WIN_CC - ply * MATE_PLY_CC);

  it('the threshold is DERIVED: every mate score inside the horizon reaches it, a bounded clock-out does not', () => {
    expect(T).toBe(WIN_CC - MAX_PLY * MATE_PLY_CC);
    for (let ply = 0; ply < MAX_PLY; ply++) expect(-mate(ply)).toBeGreaterThan(T);
    expect(BOUNDED_CLOCK_CC).toBeLessThan(T);
  });

  it('material alone is never a veto, however large', () => {
    expect(vetoVerdict({ ...base, planScoreCc: -90_000, tacticalScoreCc: 5_000 })).toBeNull();
    expect(vetoVerdict({ ...base, planScoreCc: -BOUNDED_CLOCK_CC, tacticalScoreCc: BOUNDED_CLOCK_CC })).toBeNull();
  });

  it('the terminal boundary is exact: -threshold vetoes, one centimo above does not', () => {
    expect(vetoVerdict({ ...base, planScoreCc: -T })?.reason).toBe('mate');
    expect(vetoVerdict({ ...base, planScoreCc: -T + 1 })).toBeNull();
    expect(vetoVerdict({ ...base, tacticalScoreCc: T })?.reason).toBe('forgone-win');
    expect(vetoVerdict({ ...base, tacticalScoreCc: T - 1 })).toBeNull();
  });

  it('a decided loss vetoes only when the tactical best has none', () => {
    expect(vetoVerdict({ ...base, planScoreCc: mate(2) })?.reason).toBe('mate');
    expect(vetoVerdict({ ...base, planScoreCc: mate(2), tacticalScoreCc: mate(4) })).toBeNull();
    expect(vetoVerdict({ ...base, planScoreCc: mate(4), tacticalScoreCc: mate(2) })).toBeNull();
  });

  it('a forgone decided win is terminal-scale worse too (the mirror image), reported as forgone-win', () => {
    const v = vetoVerdict({ ...base, planScoreCc: -800, tacticalScoreCc: -mate(3) });
    expect(v?.reason).toBe('forgone-win');
    expect(v?.detail).toContain('decided win at ply 3');
    expect(vetoVerdict({ ...base, planScoreCc: -mate(5), tacticalScoreCc: -mate(3) })).toBeNull();
    // A plan line that walks into a decided loss is 'mate' even when the
    // tactical best also wins: the loss is the stronger fact.
    expect(vetoVerdict({ ...base, planScoreCc: mate(2), tacticalScoreCc: -mate(3) })?.reason).toBe('mate');
  });

  it('the reason: observed from the terminal the re-search saw, else inferred from the proven clock ply', () => {
    expect(vetoVerdict({ ...base, planScoreCc: mate(2), observedReason: Reason.KILL_CLOCK })?.reason).toBe('proven-clock-loss');
    expect(vetoVerdict({ ...base, planScoreCc: mate(2), observedReason: Reason.ELIMINATION })?.reason).toBe('mate');
    expect(vetoVerdict({ ...base, planScoreCc: mate(2), observedReason: Reason.HOME_CHECKMATE })?.reason).toBe('mate');
    // Inferred: a proven reading and the loss exactly at the clock's last hand-off.
    const proven = { verdict: 'proven-loss' as const, r: 4 };
    expect(vetoVerdict({ ...base, reading: proven, planScoreCc: mate(4) })?.reason).toBe('proven-clock-loss');
    expect(vetoVerdict({ ...base, reading: proven, planScoreCc: mate(4) })?.detail).toContain('inferred');
    expect(vetoVerdict({ ...base, reading: proven, planScoreCc: mate(3) })?.reason).toBe('mate');
    expect(vetoVerdict({ ...base, planScoreCc: mate(4) })?.reason).toBe('mate');
  });

  it('a dead essential vetoes; a terminal proof outranks it', () => {
    expect(vetoVerdict({ ...base, essentialLost: [3] })).toEqual({ reason: 'essential-lost', detail: expect.stringContaining('3') });
    expect(vetoVerdict({ ...base, essentialLost: [3], planScoreCc: mate(2) })?.reason).toBe('mate');
    expect(vetoVerdict({ ...base, essentialLost: [] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// consistency, recomputed
// ---------------------------------------------------------------------------

/** Does replaying the Act prefix make an attack with nonzero power? Computed
 * here from the catalogue's power table, not through `plan.ts`. */
function actHasDamagingAttack(p0: PackedState, turn: Turn): boolean {
  const q = allocState();
  copyState(q, p0);
  const undo = newUndo();
  const n = actLength(turn);
  for (let i = 0; i < n; i++) {
    const a = turn.actions[i];
    if (paKind(a) === AKind.ATTACK) {
      const v = q.pieceAt[paB(a)];
      const u = paA(a);
      if (v !== NO_SLOT && cat.power[powerIndex(q.owner[u] as Side, q.defId[u], q.defId[v])] > 0) return true;
    }
    if (!rep.isLegal(q, a)) return false;
    rep.make(q, a, undo);
  }
  return false;
}

function applyWhole(p0: PackedState, turn: Turn): PackedState {
  const q = allocState();
  copyState(q, p0);
  const undo = newUndo();
  const keep: KeepSetTable | undefined = turn.keepMask === undefined ? undefined : { masks: turn.keepMask, count: 1 };
  for (let i = 0; i < turn.count; i++) {
    expect(rep.isLegal(q, turn.actions[i], keep)).toBe(true);
    rep.make(q, turn.actions[i], undo, keep);
  }
  return q;
}

function live(p: PackedState, side: Side): number {
  let n = 0;
  for (let u = 0; u < MAX_SLOTS; u++) if (p.sq[u] !== DEAD && p.owner[u] === side) n++;
  return n;
}

describe('planConsistency, recomputed from the turn on every posture root', () => {
  it('ForceContact: injected, or the Act makes an attack with nonzero power; Hold: injected, or kill-free with enemy killETA > plies left', () => {
    let seen = { contact: 0, hold: 0, consistent: 0, inconsistent: 0, killsRefused: 0 };
    for (const [name, build] of SWEEP) {
      const { p, reading, turns, injected } = rootList(build());
      if (reading.posture === 'none') continue;
      const scratch = newPlanScratch(cat);
      for (const turn of turns) {
        const key = keyOf(turn);
        const c = planConsistency(p, reading, turn, injected.has(key), scratch);
        let want: boolean;
        if (injected.has(key)) want = true;
        else if (reading.posture === 'force-contact') want = actHasDamagingAttack(p, turn);
        else {
          const after = applyWhole(p, turn);
          const opp = (1 - reading.side) as Side;
          const killed = (turn.flags & TurnFlag.KILL) !== 0 || live(after, opp) < live(p, opp);
          if (killed) seen.killsRefused++;
          const left = clockPliesLeft(after);
          want = !killed && killEta(after, opp, { limit: left }).plies > left;
        }
        expect(c.consistent, `${name} ${key} ${c.why}`).toBe(want);
        if (reading.posture === 'force-contact') seen.contact++;
        else seen.hold++;
        if (c.consistent) seen.consistent++;
        else seen.inconsistent++;
      }
    }
    // The sweep is not vacuous on any side of the rule.
    expect(seen.contact).toBeGreaterThan(0);
    expect(seen.hold).toBeGreaterThan(0);
    expect(seen.consistent).toBeGreaterThan(0);
    expect(seen.inconsistent).toBeGreaterThan(0);
    expect(seen.killsRefused).toBeGreaterThan(0);
  });

  it('Hold: the generator\'s KILL flag and the board\'s own unit count each refuse a kill on their own', () => {
    const { p, reading, turns, injected } = rootList(essentialOrNot(30));
    expect(reading.posture).toBe('hold');
    const scratch = newPlanScratch(cat);
    const kill = turns.find(t => (t.flags & TurnFlag.KILL) !== 0 && !injected.has(keyOf(t)));
    const quiet = turns.find(t => (t.flags & TurnFlag.KILL) === 0 && !injected.has(keyOf(t)));
    expect(kill).toBeDefined();
    expect(quiet).toBeDefined();
    // A kill the generator did not flag is still a kill: the count sees it.
    const unflagged = { ...(kill as Turn), flags: (kill as Turn).flags & ~TurnFlag.KILL };
    expect(planConsistency(p, reading, unflagged, false, scratch)).toEqual({ consistent: false, why: 'contains-kill' });
    // The generator's claim is honoured without a replay.
    const flagged = { ...(quiet as Turn), flags: (quiet as Turn).flags | TurnFlag.KILL };
    expect(planConsistency(p, reading, flagged, false, scratch)).toEqual({ consistent: false, why: 'contains-kill' });
    expect(planConsistency(p, reading, quiet as Turn, false, scratch).why).not.toBe('contains-kill');
  });

  it('ForceContact: a zero-power attack is not contact, a one-power attack is', () => {
    // White plant (attack 0) next to a Black fire (fire beats plant: 0 − 1
    // clamps to 0) and next to a Black water (plant beats water: 0 + 1 = 1).
    const state = withMined(
      {
        units: [
          { def: 'plant_1', owner: 'white', x: 4, y: 4 },
          { def: 'fire_1', owner: 'black', x: 4, y: 5 },
          { def: 'water_1', owner: 'black', x: 5, y: 4 },
          { def: 'plant_1', owner: 'black', x: 9, y: 9 },
        ],
        reserves: NO_RESERVES,
        white: 0,
        black: 0,
        inactivityPlies: 6,
        turnNumber: 13,
        current: 'white',
      },
      0,
      30,
    );
    const { p, reading } = rootList(state);
    expect(reading.posture).toBe('force-contact');
    const plant = p.pieceAt[44];
    const zero = { ...rootList(state).turns[0], actions: Int32Array.of(paMake(AKind.ATTACK, plant, 54, 0)), count: 1, keepMask: undefined };
    const one = { ...zero, actions: Int32Array.of(paMake(AKind.ATTACK, plant, 45, 0)) };
    expect(cat.power[powerIndex(0, p.defId[plant], p.defId[p.pieceAt[54]])]).toBe(0);
    expect(cat.power[powerIndex(0, p.defId[plant], p.defId[p.pieceAt[45]])]).toBeGreaterThan(0);
    const scratch = newPlanScratch(cat);
    expect(planConsistency(p, reading, zero, false, scratch)).toEqual({ consistent: false, why: 'no-damaging-attack' });
    expect(planConsistency(p, reading, one, false, scratch)).toEqual({ consistent: true, why: 'damaging-attack' });
  });

  it('a posture-free reading makes nothing consistent', () => {
    const { p, reading, turns } = rootList(PLAN_FIXTURES.find(([n]) => n === 'trailingNoContactTied')![1]());
    expect(reading.posture).toBe('none');
    const scratch = newPlanScratch(cat);
    for (const turn of turns) expect(planConsistency(p, reading, turn, true, scratch)).toEqual({ consistent: false, why: 'no-posture' });
  });
});

// ---------------------------------------------------------------------------
// the paired roots
// ---------------------------------------------------------------------------

describe('mateOrMaterial: one far body decides whether the plan line is a mate or a material loss', () => {
  it('without it the plan line walks into an elimination: vetoed "mate", the tactical best played', async () => {
    const state = mateOrMaterial(false);
    const r = await strategos(state);
    const st = r.strategy;
    expect(st.posture).toBe('force-contact');
    expect(st.veto?.reason).toBe('mate');
    expect(st.veto?.detail).toContain(`observed (reason ${Reason.ELIMINATION})`);
    expect(st.chosen).toEqual({ endKey: r.endKey, source: 'search', scoreCc: r.scoreCc });
    expect(st.veto?.vetoedEndKey).not.toBe(r.endKey);
    const q = research(r)!;
    expect(q.outcome).toBe('refuted');
    expect(q.result.endKey).toBe(st.veto?.vetoedEndKey);
    expect(q.result.scoreCc).toBeLessThanOrEqual(-terminalLossThreshold(20));
    expect(r.scoreCc).toBeGreaterThan(-BOUNDED_CLOCK_CC);
    // The vetoed line is a plan line: injected, or making contact.
    const inj = st.injected.find(i => i.endKey === st.veto?.vetoedEndKey);
    expect(inj?.contract.kind).toBe('force-contact');
    // Canonical confirmation: the plan line, then the reply the re-search
    // named, ends the game — Black wins by eliminating White.
    const line = walkLine(state, q.result.endKey, q.result.replyKey as string);
    expect(line.afterReply.result).toBe(Result.BLACK_WIN);
    expect(line.afterReply.reason).toBe(Reason.ELIMINATION);
    expect(line.replyState.phase).toBe('victory');
    expect(line.replyState.winner).toBe('black');
    // The premise that makes it an elimination: the fire is White's only unit.
    expect(canonicalUnits(state, 'white')).toEqual(['fire_1@1,1']);
  });

  it('with it the same plan line only loses the fire: NOT vetoed, the plan line is played', async () => {
    const state = mateOrMaterial(true);
    const r = await strategos(state);
    const st = r.strategy;
    expect(st.posture).toBe('force-contact');
    expect(st.veto).toBeUndefined();
    const q = research(r)!;
    expect(q.outcome).toBe('witnessed');
    expect(st.chosen?.source).toBe('plan');
    expect(st.chosen?.endKey).toBe(r.endKey);
    expect(r.endKey).toBe(q.result.endKey);
    expect(r.scoreCc).toBe(q.result.scoreCc);
    expect(st.chosen?.planLabel).toBe(q.result.planLabel);
    // It is a REAL material loss the search saw — the tactical best scored
    // higher — and not a terminal one.
    expect(q.result.scoreCc).toBeLessThan(q.result.tacticalScoreCc);
    expect(q.result.scoreCc).toBeGreaterThan(-BOUNDED_CLOCK_CC);
    // Canonical confirmation: after the plan line and the named reply the
    // game goes on and White's fire is gone (the far plant is not).
    const line = walkLine(state, q.result.endKey, q.result.replyKey as string);
    expect(line.afterReply.result).toBe(Result.ONGOING);
    expect(line.replyState.phase).not.toBe('victory');
    expect(canonicalUnits(line.replyState, 'white')).toEqual(['plant_1@0,9']);
  });
});

describe('essentialOrNot: four crystals of lead decide whether the plant the Hold loses is essential', () => {
  it('essential: the free kill is suppressed, the hold line re-searched, and vetoed "essential-lost"', async () => {
    const state = essentialOrNot(30);
    const r = await strategos(state);
    const st = r.strategy;
    expect(st.posture).toBe('hold');
    const q = research(r)!;
    // The tactical best was the free kill; Hold refused it and re-searched a plan line.
    const classify = st.queries.find(x => x.name === 'veto.classify') as { result: { tacticalBest: string } };
    expect(classify.result.tacticalBest).toBe('contains-kill');
    expect(r.actions.some(a => a.type === 'ATTACK')).toBe(true);
    expect(st.veto?.reason).toBe('essential-lost');
    expect(st.veto?.vetoedEndKey).toBe(q.result.endKey);
    expect(st.chosen).toEqual({ endKey: r.endKey, source: 'search', scoreCc: r.scoreCc });
    expect(q.outcome).toBe('refuted');
    expect(q.result.essentialSlots).toEqual([0]);
    expect(q.result.essentialLost).toEqual([0]);
    // The essential slot is the plant on the paying cell.
    const { p, reading } = rootList(state);
    expect(holdEssentialSlots(p, reading as ClockReading)).toEqual([0]);
    expect(p.sq[0]).toBe(ESSENTIAL_CELL);
    // Canonical confirmation: the named reply kills the plant, and nothing ends.
    const line = walkLine(state, q.result.endKey, q.result.replyKey as string);
    expect(line.afterReply.sq[0]).toBe(DEAD);
    expect(line.afterReply.result).toBe(Result.ONGOING);
    expect(canonicalUnits(line.replyState, 'white')).toEqual(['water_1@3,8']);
    // Not terminal: the veto is the contract's, not a proof of loss.
    expect(q.result.scoreCc).toBeGreaterThan(-BOUNDED_CLOCK_CC);
  });

  it('not essential: the same line, the same reply and the same dead plant are played — material is not a veto', async () => {
    const [a, b] = [await strategos(essentialOrNot(30)), await strategos(essentialOrNot(34))];
    const qa = research(a)!;
    const qb = research(b)!;
    expect(qb.result.essentialSlots).toEqual([]);
    expect(b.strategy.veto).toBeUndefined();
    expect(qb.outcome).toBe('witnessed');
    expect(b.strategy.chosen?.source).toBe('plan');
    expect(b.endKey).toBe(qb.result.endKey);
    // The one fact changed nothing else the veto read: the same plan
    // candidate, the same reply, the plant dead after it.
    expect(qb.result.planLabel).toBe(qa.result.planLabel);
    const line = walkLine(essentialOrNot(34), qb.result.endKey, qb.result.replyKey as string);
    expect(line.afterReply.sq[0]).toBe(DEAD);
    expect(qb.result.scoreCc).toBeLessThan(qb.result.tacticalScoreCc);
  });
});

// ---------------------------------------------------------------------------
// the reserve
// ---------------------------------------------------------------------------

/** The ply-1 replies to the plan candidate `planKey` exactly as the
 * re-search generates them (`walkLine`'s walk), by end key → `Turn.sig`. */
function replySigs(state: GameState, planKey: string): Map<string, number> {
  const { s, p } = rootList(state);
  const plan = s.turns[0].find(turn => keyOf(turn) === planKey) as Turn;
  p.proverMode = PROVER_FULL;
  expect(makeTurn(s, p, plan, s.keep[0])).toBe(plan.count);
  const n1 = generateAt(s, p, buildSearchTables(s, p, 1), 1);
  return new Map(s.turns[1].slice(0, n1).map(turn => [keyOf(turn), turn.sig] as const));
}

describe('the re-search', () => {
  it('is one full-window search at depth − 1, and the contract is read off its PRINCIPAL reply', async () => {
    // Oracle: the recorded `pvs` calls (mock above) give every non-terminal
    // reply's final value; the reply the Chronicle names must be the first
    // one attaining the opponent's best of them, and the re-searched score
    // must be minus that best. Reading the FIRST reply instead of the best
    // one (or the wrong depth, or a null window) fails here.
    let named = 0;
    let notFirst = 0;
    for (const [name, build] of SWEEP) {
      const state = build();
      hooks.pvsCalls = [];
      const r = await new HardEngine(strategosPatch()).searchTurn(state, { work: SEARCH_WORK });
      const calls = hooks.pvsCalls;
      hooks.pvsCalls = null;
      const q = research(r);
      if (q === undefined) {
        expect(calls, name).toEqual([]);
        continue;
      }
      const childDepth = q.result.childDepth as number;
      expect(childDepth, name).toBe(Math.max(1, r.depth - 1));
      // The opponent's node is searched on a FULL window (its beta is +INF),
      // so every child call is either the full window below it or a PVS
      // scout one centimo wide.
      for (const c of calls) {
        expect(c.ply, name).toBe(2);
        expect(c.depth, name).toBe(childDepth - 1);
        expect(c.alpha === -INF || c.alpha === c.beta - 1, `${name} window ${c.alpha},${c.beta}`).toBe(true);
      }
      if (q.outcome === 'unresolved' || q.result.replyKey === null) continue;
      // Final value per reply (a re-search overrides its scout), reply order kept.
      const order: number[] = [];
      const value = new Map<number, number>();
      for (const c of calls) {
        if (!value.has(c.sig)) order.push(c.sig);
        value.set(c.sig, -c.score);
      }
      const sigs = replySigs(state, q.result.endKey);
      const namedSig = sigs.get(q.result.replyKey);
      expect(namedSig, `${name}: the named reply is a ply-1 reply`).toBeDefined();
      if (value.has(namedSig as number)) {
        let bestSig = order[0];
        for (const sig of order) if ((value.get(sig) as number) > (value.get(bestSig) as number)) bestSig = sig;
        expect(namedSig, name).toBe(bestSig);
        expect(q.result.scoreCc, name).toBe(-(value.get(bestSig) as number));
        if (bestSig !== order[0]) notFirst++;
      } else {
        // The named reply ended the game (no `pvs` call): it must beat every
        // searched one, and the canonical engine must agree the game is over.
        for (const v of value.values()) expect(-q.result.scoreCc, name).toBeGreaterThanOrEqual(v);
        expect(walkLine(state, q.result.endKey, q.result.replyKey).afterReply.result, name).not.toBe(Result.ONGOING);
      }
      named++;
    }
    expect(named).toBeGreaterThanOrEqual(4);
    // Not vacuous against "read the first reply": on some roots the best
    // reply is not the first one searched.
    expect(notFirst).toBeGreaterThan(0);
  });

  it('a tactical best that is itself plan-consistent is the plan move: nothing is re-searched', async () => {
    for (const [fixture, why] of [
      ['contactThisTurn', 'damaging-attack'],
      ['trailingNoContact', 'injected'],
    ] as const) {
      const r = await strategos(PLAN_FIXTURES.find(([n]) => n === fixture)![1]());
      const st = r.strategy;
      const classify = st.queries.find(x => x.name === 'veto.classify') as { result: { tacticalBest: string; checked: number } };
      expect(classify.result.tacticalBest, fixture).toBe(why);
      expect(classify.result.checked, fixture).toBe(1);
      expect(research(r), fixture).toBeUndefined();
      expect(st.veto, fixture).toBeUndefined();
      const label = why === 'injected' ? st.injected.find(i => i.endKey === r.endKey)?.label : `${st.posture}:${why}`;
      expect(label, fixture).toBeDefined();
      expect(st.chosen, fixture).toEqual({ endKey: r.endKey, source: 'plan', scoreCc: r.scoreCc, planLabel: label });
    }
  });

  it('deadEssentials: a dead slot and a slot reused by a later arrival are both lost', () => {
    const p = allocState();
    p.sq[1] = 10;
    p.ord[1] = 5;
    p.sq[3] = 20;
    p.ord[3] = 9;
    const rootOrd = p.ord.slice();
    expect(deadEssentials(p, [1, 2, 3], rootOrd)).toEqual([2]);
    rootOrd[3] = 7; // slot 3 held a different unit at the root
    expect(deadEssentials(p, [1, 2, 3], rootOrd)).toEqual([2, 3]);
    expect(deadEssentials(p, [1], rootOrd)).toEqual([]);
  });

  it('the private root instrument leaves no marker on an unexposed result', async () => {
    hooks.noBest = true;
    const a = await new HardEngine(strategosPatch()).searchTurn(mateOrMaterial(true), { work: SEARCH_WORK });
    const b = await new HardEngine(strategosPatch()).searchTurn(mateOrMaterial(true), { work: SEARCH_WORK, expose: true });
    hooks.noBest = false;
    expect(a.depth).toBe(0);
    expect(a.strategy?.posture).toBe('force-contact');
    expect('candidateSource' in a).toBe(false);
    expect(b.candidateSource).toBe('generator-list');
    expect(a.actions).toEqual(b.actions);
  });
});

describe('the pick', () => {
  it('ranks searched before unsearched, then score, then injected lines, then generator order', () => {
    const picks: RankedPick[] = [
      { index: 0, score: null, injected: true },
      { index: 1, score: -300, injected: false },
      { index: 2, score: 120, injected: false },
      { index: 3, score: 120, injected: true },
      { index: 4, score: -300, injected: false },
      { index: 5, score: null, injected: false },
    ];
    const order = [...picks].sort(comparePicks).map(x => x.index);
    expect(order).toEqual([3, 2, 1, 4, 0, 5]);
    // A total order: the reversed input sorts the same way.
    expect([...picks].reverse().sort(comparePicks).map(x => x.index)).toEqual(order);
  });

  it('an unresolved re-search proves nothing: the tactical best is played, with no veto', async () => {
    // At 12,000 units the Hold root's re-search (2,191 units) needs more than
    // its 2,400-unit reserve leaves after the classification is charged.
    for (const w of [30, 34]) {
      const r = await new HardEngine(strategosPatch()).searchTurn(essentialOrNot(w), { work: 12_000 });
      const q = research(r)!;
      expect(q.outcome, `${w}`).toBe('unresolved');
      expect(q.result.truncated).toBe(true);
      expect(r.strategy?.veto).toBeUndefined();
      expect(r.strategy?.chosen).toEqual({ endKey: r.endKey, source: 'search', scoreCc: r.scoreCc });
      expect(r.endKey).not.toBe(q.result.endKey);
      expect(r.actions.some(a => a.type === 'ATTACK')).toBe(true);
    }
  });
});

describe('the reserve', () => {
  it('reserveFor is the documented share', () => {
    expect(VETO_RESERVE_SHARE).toBe(5);
    expect(reserveFor(SEARCH_WORK)).toBe(12_000);
    expect(reserveFor(40_000)).toBe(8_000);
    expect(reserveFor(25_000)).toBe(5_000);
  });

  it('WorkMeter.setLimit moves the budget and keeps what was spent', () => {
    const m = new WorkMeter(100);
    m.spend(0, 10);
    const used = m.used;
    m.setLimit(used);
    expect(m.used).toBe(used);
    expect(m.exhausted()).toBe(true);
    m.setLimit(100);
    expect(m.exhausted()).toBe(false);
    expect(() => m.setLimit(-1)).toThrow(RangeError);
  });

  it('deepening leaves the reserve, the re-search is never cut for budget, and the limit is restored', async () => {
    let researched = 0;
    for (const [name, build] of SWEEP) {
      const engine = new HardEngine(strategosPatch());
      const r = await engine.searchTurn(build(), { work: SEARCH_WORK, expose: true });
      expect(engine.ctx.meter.limit, name).toBe(SEARCH_WORK);
      if (r.strategy?.posture === 'none' || r.source !== 'search') continue;
      // Every completed or truncated iteration ran under the lowered limit:
      // the iterations' own spend never reaches past it by more than the
      // single node that crossed it.
      const iterWork = (r.rootTrace ?? []).reduce((acc, row) => acc + (row.work ?? 0), 0);
      expect(iterWork, name).toBeLessThan(SEARCH_WORK - reserveFor(SEARCH_WORK) + 1_000);
      const q = research(r);
      if (q === undefined) continue;
      researched++;
      expect(q.result.truncated, name).toBe(false);
      expect(q.outcome, name).not.toBe('unresolved');
    }
    expect(researched).toBeGreaterThanOrEqual(4);
  });

  it('the reserve is whole even when deepening overshot its lowered limit', async () => {
    // At 14,000 units deepening's last node carries it past its lowered
    // limit; without the veto's top-up the Hold root's classification and
    // re-search (2,191 units), under the 2,800-unit reserve, are then cut for
    // budget.
    const work = 14_000;
    for (const [w, reason] of [[30, 'essential-lost'], [34, undefined]] as const) {
      const engine = new HardEngine(strategosPatch());
      const r = await engine.searchTurn(essentialOrNot(w), { work });
      const q = research(r)!;
      expect(q.result.truncated, `${w}`).toBe(false);
      expect(q.workCost).toBeLessThanOrEqual(reserveFor(work));
      expect(r.strategy?.veto?.reason).toBe(reason);
      expect(engine.ctx.meter.limit).toBe(work);
    }
  });

  it('the limit is restored even when deepening throws', async () => {
    const engine = new HardEngine(strategosPatch());
    hooks.throwOnIterate = true;
    await engine.searchTurn(mateOrMaterial(true), { work: SEARCH_WORK }).catch(() => undefined);
    hooks.throwOnIterate = false;
    expect(engine.ctx.meter.limit).toBe(SEARCH_WORK);
    expect(engine.ctx.probe).toBeNull();
  });

  it('a posture-free root takes no reserve: move, score, depth and work equal the veto-off search', async () => {
    const roots: GameState[] = [
      PLAN_FIXTURES.find(([n]) => n === 'trailingNoContactTied')![1](),
      ...CORPUS.filter(row => !CORPUS_POSTURE_IDS.includes(row.id)).slice(0, 4).map(row => row.state),
    ];
    for (const state of roots) {
      const on = await new HardEngine(strategosPatch()).searchTurn(state, { work: SEARCH_WORK });
      const off = await new HardEngine(noVeto()).searchTurn(state, { work: SEARCH_WORK });
      expect(on.strategy?.posture).toBe('none');
      expect(on.strategy?.queries.some(q => q.name.startsWith('veto'))).toBe(false);
      expect([on.actions, on.scoreCc, on.depth, on.work, on.stats.nodes]).toEqual([off.actions, off.scoreCc, off.depth, off.work, off.stats.nodes]);
    }
  });
});

// ---------------------------------------------------------------------------
// determinism, shape, identity
// ---------------------------------------------------------------------------

describe('determinism and the Chronicle', () => {
  it('two fixed-work strategos runs are identical, the strategy block included', async () => {
    for (const [name, build] of SWEEP) {
      const a = await new HardEngine(strategosPatch()).searchTurn(build(), { work: SEARCH_WORK });
      const b = await new HardEngine(strategosPatch()).searchTurn(build(), { work: SEARCH_WORK });
      expect(JSON.stringify({ ...b, stats: { ...b.stats, elapsedMs: 0 } }), name).toBe(
        JSON.stringify({ ...a, stats: { ...a.stats, elapsedMs: 0 } }),
      );
    }
  });

  it('an exposed search decides exactly as an unexposed one (the private probe observes only)', async () => {
    for (const [name, build] of VETO_FIXTURES) {
      const a = await new HardEngine(strategosPatch()).searchTurn(build(), { work: SEARCH_WORK });
      const b = await new HardEngine(strategosPatch()).searchTurn(build(), { work: SEARCH_WORK, expose: true });
      expect([b.actions, b.scoreCc, b.depth, b.work, JSON.stringify(b.strategy)], name).toEqual([a.actions, a.scoreCc, a.depth, a.work, JSON.stringify(a.strategy)]);
    }
  });

  it('the Chronicle is JSON-serialisable and says what was played', async () => {
    for (const [name, build] of VETO_FIXTURES) {
      const r = await strategos(build());
      expect(JSON.parse(JSON.stringify(r.strategy)), name).toEqual(r.strategy);
      expect(r.strategy.chosen?.endKey, name).toBe(r.endKey);
      expect(r.strategy.chosen?.scoreCc, name).toBe(r.scoreCc);
      if (r.strategy.veto !== undefined) expect(r.strategy.chosen?.source).toBe('search');
    }
  });
});

describe('flag absent', () => {
  /**
   * `resultDigestSource` digests of the exposed fixed-work `RootResult`
   * (`DIGEST_WORK`) on this file's fixtures, computed against an archive of
   * `c054136b` (`git archive c054136b`, with the two fixture modules copied
   * in) before any W1.10 source existed.
   */
  const PINNED: Record<'desktop' | 'strategosNoPlans', Record<string, string>> = {
    desktop: {
      mate: '9b7987a34616197b',
      material: '162e47619a0b13f5',
      essential: 'a5050188018b82a4',
      notEssential: 'a5050188018b82a4',
    },
    strategosNoPlans: {
      mate: '44d0d5282a7e1bdc',
      material: '06d2bb68ddbc12d7',
      essential: '1422ea686d6db62f',
      notEssential: 'a265cf8fbcd561d4',
    },
  };

  it('hard@desktop has no strategy key and, like the flag-absent strategos twin, is byte-identical to c054136b', async () => {
    for (const [cfgName, cfg] of [['desktop', undefined], ['strategosNoPlans', noPlans()]] as const) {
      for (const [name, build] of VETO_FIXTURES) {
        const r = await new HardEngine(cfg).searchTurn(build(), { work: DIGEST_WORK, expose: true });
        expect('strategy' in r, `${cfgName}/${name}`).toBe(false);
        const d = crypto.createHash('sha256').update(resultDigestSource(r as unknown as ExposedResultLike)).digest('hex').slice(0, 16);
        expect(`${cfgName}/${name}:${d}`).toBe(`${cfgName}/${name}:${PINNED[cfgName][name]}`);
      }
    }
  });

  it('control: the same exposed strategos result differs where the veto acts', async () => {
    const r = await new HardEngine(strategosPatch()).searchTurn(mateOrMaterial(true), { work: DIGEST_WORK, expose: true });
    const d = crypto.createHash('sha256').update(resultDigestSource(r as unknown as ExposedResultLike)).digest('hex').slice(0, 16);
    expect(d).not.toBe(PINNED.strategosNoPlans.material);
  });

  it('strategyVeto without strategyPlans still classifies (and never names an injected line)', async () => {
    const patch = strategosPatch();
    const searchFix = { ...patch.searchFix };
    delete searchFix.strategyPlans;
    const r = await new HardEngine({ ...patch, searchFix }).searchTurn(essentialOrNot(30), { work: SEARCH_WORK });
    expect(r.strategy?.injected).toEqual([]);
    const classify = r.strategy?.queries.find(q => q.name === 'veto.classify') as { outcome: string; result: { tacticalBest: string; consistent: number } };
    // Without the injected pass nothing is consistent here: the Black fire
    // next to the plant keeps the enemy killETA inside the plies left after
    // every kill-free turn. So there is nothing to re-search and the tactical
    // best (the free kill) is played as the search's, with no veto claimed.
    expect(classify.result).toMatchObject({ tacticalBest: 'contains-kill', consistent: 0 });
    expect(classify.outcome).toBe('refuted');
    expect(research(r)).toBeUndefined();
    expect(r.strategy?.veto).toBeUndefined();
    expect(r.strategy?.chosen).toEqual({ endKey: r.endKey, source: 'search', scoreCc: r.scoreCc });
  });
});

// A tiny self-check on the helper the sweeps lean on.
it('walkLine refuses a key the root list does not hold', () => {
  const state = mateOrMaterial(false);
  expect(() => walkLine(state, '0000000000000000', '0000000000000000')).toThrow();
});
