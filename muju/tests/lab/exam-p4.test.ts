// @vitest-environment node
/**
 * `lab/hard-ai/exam/cases-p4` — the wave-1 plan-level examination set
 * (STRATEGOS Workflow 1, plan step W1.13).
 *
 * Current rules only: this file deliberately does NOT import the frozen
 * Metal v2.8 catalogue the historical exam tests use; every case is a
 * `muju-phasing-4` position from a real LLM-vs-Hard room.
 *
 *  1 THE SET. Every case loads, reconstructs to its pinned digest and to the
 *    clock and mined totals its witness records, and is exactly what
 *    `build-p4.ts` produces from the committed replays.
 *
 *  2 THE PREDICATES. For every case an authored GOOD turn satisfies the
 *    predicate and an authored BAD turn does not, both replayed through the
 *    canonical rules. Where a predicate has a near miss worth pinning — a
 *    zero-power attack, an attack on the wrong unit, a kill on the last ply, a
 *    move that falls one turn short of contact, buying the one open square —
 *    it is a second BAD (or, for the Hold, a second GOOD) turn. Hard's own
 *    recorded reply is checked against `witness.played.holds`. Contact never
 *    counts a zero-power strike, this turn or after the passive reply (the
 *    second pinned by a one-fact flip of AS01-W's board: White's elements), and
 *    a turn is judged only for the side to move and only up to its hand-off.
 *
 *  3 THE FORMAT. A plan case's shape rules: label and kind agree, the side is
 *    the side to move, contact-in-n takes n in {1, 3}, only damaging-attack
 *    takes a target, a plan witness cites its evidence, and a drifted clock or
 *    mined total is refused like a drifted digest.
 *
 *  4 THE RUNNER. `--cases-dir lab/hard-ai/exam/cases-p4` is accepted; a stub
 *    engine playing the GOOD (then the BAD) turns is scored into the `plan`
 *    tally, never into `exact` or `judgment`, with the expected-fail row
 *    reported as unexpected when it passes; a mixed set (a plan row beside a
 *    judgment row) keeps each row in its own tally.
 *
 * Engine scores are NOT asserted here. They are an artifact of
 * `npm run hard:exam -- --cases-dir lab/hard-ai/exam/cases-p4 ...`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { GameState, Position } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import { applyAction } from '../../src/ai/simulate';
import { phaseEndAction } from '../../src/game/legality';
import { getUnitAt } from '../../src/game/board';
import { calculateAttackPower } from '../../src/game/combat';
import { findAttackApproach } from '../../src/game/movement';
import type { RootResult } from '../../src/ai/hard/search/root';
import { newSearchStats } from '../../src/ai/hard/search/pvs';
import { resolveOpeningAction, type OpeningAction } from '../../lab/hard-ai/ladder/openings';
import {
  CASES_P4_DIR,
  ExamFormatError,
  caseDigest,
  loadCaseState,
  loadStratum,
  planReading,
  stratumFile,
  validateCaseShape,
  withExamRules,
  type ExamCase,
  type PlanWitness,
} from '../../lab/hard-ai/exam/format';
import { evaluatePlan, type PlanCheck } from '../../lab/hard-ai/exam/witness';
import { buildP4, P4_SPECS } from '../../lab/hard-ai/exam/build-p4';
import { defaultOutFor, parseArgs, renderMarkdown, runExam, type ExamArgs, type ExamEngineFactory } from '../../lab/hard-ai/exam/run';

vi.setConfig({ testTimeout: 60_000 });

const REPO = path.resolve(import.meta.dirname, '../..');

// --- square-based turns -----------------------------------------------------

function sq(name: string): Position {
  const m = /^([A-J])(10|[1-9])$/.exec(name);
  if (m === null) throw new Error(`bad square ${name}`);
  return { x: m[1].charCodeAt(0) - 65, y: Number(m[2]) - 1 };
}
const mv = (from: string, to: string): OpeningAction => ({ type: 'MOVE', from: sq(from), to: sq(to) });
const atk = (from: string, to: string): OpeningAction => ({ type: 'ATTACK', from: sq(from), targetPosition: sq(to) });
const promo = (at: string): OpeningAction => ({ type: 'PROMOTE_UNIT', from: sq(at) });
const buy = (definitionId: string, at: string): OpeningAction => ({ type: 'BUY_UNIT', definitionId, position: sq(at) });
const EA: OpeningAction = { type: 'END_ACTION_PHASE' };
const EP: OpeningAction = { type: 'END_PLACE_PHASE' };

// --- the set ----------------------------------------------------------------

const CASES = loadStratum('dev', CASES_P4_DIR);
const byId = new Map(CASES.map(c => [c.id, c]));

function caseOf(id: string): ExamCase & { witness: PlanWitness } {
  const c = byId.get(id);
  if (c === undefined || c.witness.label !== 'plan') throw new Error(`no plan case ${id}`);
  return c as ExamCase & { witness: PlanWitness };
}

function playedLine(id: string): OpeningAction[] {
  const played = caseOf(id).witness.played;
  if (played === undefined) throw new Error(`${id}: no played line`);
  return played.line.map(a => structuredClone(a));
}

/** Hard's reply with `extra` inserted right after its END_ACTION_PHASE. */
function playedWith(id: string, extra: OpeningAction[]): OpeningAction[] {
  const line = playedLine(id);
  const at = line.findIndex(a => a.type === 'END_ACTION_PHASE');
  return [...line.slice(0, at + 1), ...extra, ...line.slice(at + 1)];
}

/** The PAY_UPKEEP of Hard's reply, with some kept squares renamed. */
function playedUpkeep(id: string, rename: Record<string, string> = {}): OpeningAction {
  const u = playedLine(id).find(a => a.type === 'PAY_UPKEEP');
  if (u === undefined || u.type !== 'PAY_UPKEEP') throw new Error(`${id}: the reply pays no chosen upkeep`);
  const name = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
  return { type: 'PAY_UPKEEP', keep: u.keep.map(p => (rename[name(p)] !== undefined ? sq(rename[name(p)]) : p)) };
}

function judge(id: string, line: readonly OpeningAction[]): PlanCheck {
  const c = caseOf(id);
  const state = loadCaseState(c);
  return withExamRules(c, () => evaluatePlan(c.witness, state, { line }, `${id} test turn`));
}

interface Pair {
  why: string;
  good: { name: string; line: () => OpeningAction[] }[];
  bad: { name: string; line: () => OpeningAction[] }[];
}

/**
 * GOOD and BAD turns per case. Each is written in squares from the case's
 * board; "Hard's reply" is `witness.played.line`, recorded from the room.
 */
const PAIRS: Record<string, Pair> = {
  'wave1-AS01-W-t3': {
    why: 'Lightning G6 can reach B4 and strike the Plant on B3; a zero-power strike on the Water at C2 is not a damaging attack',
    good: [{ name: 'Lightning G6-B4, strikes Plant B3', line: () => [mv('G6', 'B4'), atk('B4', 'B3'), EA, EP] }],
    bad: [
      { name: "Hard's reply: a full pass", line: () => playedLine('wave1-AS01-W-t3') },
      { name: 'Lightning G6-C3, zero-power strike on Water C2', line: () => [mv('G6', 'C3'), atk('C3', 'C2'), EA, EP] },
    ],
  },
  'wave1-OP01-W-t1': {
    why: 'moving the Fire out to H8 widens the J10 rectangle so buying on J10 still leaves squares; buying the one open square without moving jams it',
    good: [{ name: 'Fire I10-H8, buy Fire on J10', line: () => [mv('I10', 'H8'), EA, buy('fire_1', 'J10'), EP] }],
    bad: [
      { name: "Hard's reply: the jam", line: () => playedLine('wave1-OP01-W-t1') },
      { name: 'no move, buy the only open square J10', line: () => [EA, buy('fire_1', 'J10'), EP] },
    ],
  },
  'wave1-OP01-W-t2': {
    why: 'Fire I9-E5 (four actions) leaves White\'s Fire on D3 one move and a strike away next turn; one step to H9 does not',
    good: [{ name: 'Fire I9-E5', line: () => [mv('I9', 'E5'), EA, EP] }],
    bad: [
      { name: "Hard's reply: a full pass", line: () => playedLine('wave1-OP01-W-t2') },
      { name: 'Fire I9-H9 only', line: () => [mv('I9', 'H9'), EA, EP] },
    ],
  },
  'wave1-SO02-B-t37': {
    why: 'the Plant on E10 already touches the Water on D10 (power 1); Lightning into F7 strikes the other Water at power 0',
    good: [
      {
        name: "Hard's plant move plus Plant E10 strikes Water D10",
        line: () => [mv('C5', 'C3'), atk('E10', 'D10'), EA, playedUpkeep('wave1-SO02-B-t37'), EP],
      },
    ],
    bad: [
      { name: "Hard's reply: one quiet move", line: () => playedLine('wave1-SO02-B-t37') },
      {
        name: 'Lightning G7-F7, zero-power strike on Water F6',
        line: () => [mv('C5', 'C3'), mv('G7', 'F7'), atk('F7', 'F6'), EA, playedUpkeep('wave1-SO02-B-t37', { G7: 'F7' }), EP],
      },
    ],
  },
  'wave1-FB01-B-t18': {
    why: 'the same turn with the Fire on C5 promoted before the four Shadow buys',
    good: [{ name: "Hard's reply plus PROMOTE C5", line: () => playedWith('wave1-FB01-B-t18', [promo('C5')]) }],
    bad: [{ name: "Hard's reply: four tier-1 buys, no promotion", line: () => playedLine('wave1-FB01-B-t18') }],
  },
  'wave1-SN05-W-t5': {
    why: 'the pass (and a strike that does not kill) keeps the clock counting to a won hand-off; killing the Fire on C3 resets it',
    good: [
      { name: "Hard's reply: a pass", line: () => playedLine('wave1-SN05-W-t5') },
      { name: 'Fire E5-D2 strikes Water C2 at power 1 (no kill)', line: () => [mv('E5', 'D2'), atk('D2', 'C2'), EA, EP] },
    ],
    bad: [{ name: 'Fire E5-C4 kills the Fire on C3', line: () => [mv('E5', 'C4'), atk('C4', 'C3'), EA, EP] }],
  },
  'wave1-OP02-W-t6': {
    why: 'the same turn with the Water on J4 promoted before the four Plant buys',
    good: [{ name: "Hard's reply plus PROMOTE J4", line: () => playedWith('wave1-OP02-W-t6', [promo('J4')]) }],
    bad: [{ name: "Hard's reply: four tier-1 buys, no promotion", line: () => playedLine('wave1-OP02-W-t6') }],
  },
  'wave1-SO01-B-t11': {
    why: 'the Water on C2 strikes the intruding tier-3 Water on C3; killing the Fire on F6 is a damaging attack on the wrong unit',
    good: [{ name: 'Water C2 strikes Water C3', line: () => [atk('C2', 'C3'), EA, EP] }],
    bad: [
      { name: "Hard's reply: no attack", line: () => playedLine('wave1-SO01-B-t11') },
      { name: 'Fire B8-F7 kills the Fire on F6 instead', line: () => [mv('B8', 'F7'), atk('F7', 'F6'), EA, EP] },
    ],
  },
};

describe('cases-p4: the wave-1 plan set', () => {
  it('holds the eight cases W1.13 names, all plan cases in the dev stratum', () => {
    expect(CASES.map(c => c.id)).toEqual(P4_SPECS.map(s => s.id));
    expect(CASES).toHaveLength(8);
    for (const c of CASES) {
      expect(c.kind).toBe('plan');
      expect(c.stratum).toBe('dev');
      expect(c.setup?.ruleset).toBe('phasing');
      expect(c.position.kind).toBe('recipe');
      expect(c.source.kind).toBe('room');
    }
    const predicates = new Set(CASES.map(c => (c.witness as PlanWitness).predicate));
    expect([...predicates].sort()).toEqual(['contact-in-n', 'damaging-attack', 'no-clock-reset', 'promotion-made', 'spawn-area-open']);
    expect(CASES.filter(c => (c.witness as PlanWitness).expected === 'fail').map(c => c.id)).toEqual(['wave1-SO01-B-t11']);
  });

  it('every case reconstructs to its pinned digest and to the clock and mined totals it records', () => {
    for (const c of CASES) {
      const state = loadCaseState(c);
      expect(caseDigest(c, state), c.id).toBe(c.stateDigest);
      expect(planReading(state, c.sideToMove), c.id).toEqual((c.witness as PlanWitness).at);
      expect(state.turn.currentPlayer).toBe(c.sideToMove);
    }
  });

  it('pins each position as the evidence describes it', () => {
    const at = (id: string) => caseOf(id).witness.at;
    expect(at('wave1-AS01-W-t3')).toMatchObject({ clock: 5, pliesLeft: 5, mined: { white: 30, black: 13 } });
    expect(at('wave1-OP01-W-t2')).toMatchObject({ clock: 3, mined: { white: 14, black: 15 } });
    expect(at('wave1-SO02-B-t37')).toMatchObject({ clock: 4, pliesLeft: 6, mined: { white: 250, black: 248 } });
    expect(at('wave1-SN05-W-t5')).toMatchObject({ clock: 9, pliesLeft: 1, mined: { white: 34, black: 73 } });
    expect(caseOf('wave1-OP02-W-t6').witness.at.bank).toBe(32);
    expect(caseOf('wave1-SO01-B-t11').witness.target).toEqual(sq('C3'));
    const rev = (id: string) => {
      const s = caseOf(id).source;
      if (s.kind !== 'room') throw new Error('not a room case');
      return [s.revision, s.replyRevision];
    };
    // "AS01-W r6" is the position after revision 6; Hard's pass is revision 7 (DIGEST errata).
    expect(rev('wave1-AS01-W-t3')).toEqual([6, 7]);
    // "OP01-W r3" and "r6" are Hard's own replies.
    expect(rev('wave1-OP01-W-t1')).toEqual([2, 3]);
    expect(rev('wave1-OP01-W-t2')).toEqual([5, 6]);
    expect(rev('wave1-SO01-B-t11')).toEqual([21, 22]);
    expect(rev('wave1-OP02-W-t6')).toEqual([18, 19]);
  });

  it('is exactly what build-p4.ts produces from the committed replays', () => {
    const { cases } = buildP4();
    const built = cases.map(c => JSON.stringify(c)).join('\n') + '\n';
    expect(built).toBe(fs.readFileSync(stratumFile('dev', CASES_P4_DIR), 'utf8'));
  });
});

describe('cases-p4: each predicate holds on a GOOD turn and fails on a BAD one', () => {
  it('has a GOOD/BAD pair for every case', () => {
    expect(Object.keys(PAIRS).sort()).toEqual(CASES.map(c => c.id).sort());
  });

  for (const [id, pair] of Object.entries(PAIRS)) {
    describe(`${id}: ${pair.why}`, () => {
      for (const g of pair.good) {
        it(`GOOD — ${g.name}`, () => {
          const check = judge(id, g.line());
          expect(check.replayed, check.evidence).toBe(true);
          expect(check.holds, check.evidence).toBe(true);
        });
      }
      for (const b of pair.bad) {
        it(`BAD — ${b.name}`, () => {
          const check = judge(id, b.line());
          expect(check.replayed, check.evidence).toBe(true);
          expect(check.holds, check.evidence).toBe(false);
        });
      }
    });
  }

  it("Hard's recorded reply gets the verdict the case records: every one fails except SN05-W's Hold", () => {
    for (const c of CASES) {
      const w = c.witness as PlanWitness;
      const check = judge(c.id, playedLine(c.id));
      expect(check.replayed, `${c.id}: ${check.evidence}`).toBe(true);
      expect(check.holds, `${c.id}: ${check.evidence}`).toBe(w.played?.holds);
      expect(check.holds, c.id).toBe(c.id === 'wave1-SN05-W-t5');
    }
  });

  it('reads the facts it claims: power, kill, clock, spawn squares, contact', () => {
    const zero = judge('wave1-AS01-W-t3', [mv('G6', 'C3'), atk('C3', 'C2'), EA, EP]);
    expect(zero.facts.attacks).toEqual([expect.objectContaining({ attacker: 'lightning_1', defender: 'water_1', power: 0, killed: false })]);

    const kill = judge('wave1-SN05-W-t5', [mv('E5', 'C4'), atk('C4', 'C3'), EA, EP]);
    expect(kill.facts.kills).toBe(1);
    expect(kill.facts.clockAfter).toBe(0);
    expect(kill.wonOutright).toBe(false);

    const hold = judge('wave1-SN05-W-t5', playedLine('wave1-SN05-W-t5'));
    expect(hold.facts.clockAfter).toBe(10);
    expect(hold.wonOutright).toBe(true);
    expect(hold.end?.victoryReason).toBe('kill-clock');

    expect(judge('wave1-OP01-W-t1', playedLine('wave1-OP01-W-t1')).facts.spawnSquaresAfter).toBe(0);
    expect(judge('wave1-OP01-W-t1', [mv('I10', 'H8'), EA, buy('fire_1', 'J10'), EP]).facts.spawnSquaresAfter).toBeGreaterThan(0);

    const contact = judge('wave1-OP01-W-t2', [mv('I9', 'E5'), EA, EP]);
    expect(contact.facts.contact).toMatch(/after a passive reply fire_1@E5 .*strikes fire_1@D3/);

    const offTarget = judge('wave1-SO01-B-t11', [mv('B8', 'F7'), atk('F7', 'F6'), EA, EP]);
    expect(offTarget.facts.attacks).toEqual([expect.objectContaining({ power: 2, killed: true, onTarget: false })]);
  });

  it('contact-in-1 counts a standing adjacency only against a unit the side could damage', () => {
    // AS01-W's board: a Lightning on D2 touches only White's Water on C2, which it
    // strikes at power 0; on B4 it touches the Plant on B3, which it strikes at 2.
    const c = caseOf('wave1-AS01-W-t3');
    const state = loadCaseState(c);
    const w: PlanWitness = { ...c.witness, predicate: 'contact-in-n', n: 1 };
    const judgeN1 = (line: OpeningAction[]) => withExamRules(c, () => evaluatePlan(w, state, { line }, 'contact-in-1'));
    const harmless = judgeN1([mv('G6', 'D2'), EA, EP]);
    expect(harmless.replayed, harmless.evidence).toBe(true);
    expect(harmless.holds, harmless.evidence).toBe(false);
    const threat = judgeN1([mv('G6', 'B4'), EA, EP]);
    expect(threat.holds, threat.evidence).toBe(true);
    expect(threat.facts.contact).toMatch(/lightning_1@B4 stands adjacent to plant_1@B3 \(power 2\)/);
    // n = 1 never looks past the turn: the Lightning left on G6 could strike next turn, but that is n = 3.
    expect(judgeN1([EA, EP]).holds).toBe(false);
    expect(withExamRules(c, () => evaluatePlan({ ...w, n: 3 }, state, { line: [EA, EP] }, 'contact-in-3')).holds).toBe(true);
  });

  it('contact-in-n never counts a zero-power strike, this turn or after the passive reply', () => {
    const c = caseOf('wave1-AS01-W-t3');
    const state = loadCaseState(c);
    const w1: PlanWitness = { ...c.witness, predicate: 'contact-in-n', n: 1 };
    const w3: PlanWitness = { ...w1, n: 3 };
    const pass = [EA, EP];

    // This turn: the Lightning on D2 strikes the Water on C2 at power 0 and touches nothing else.
    const zeroNow = withExamRules(c, () => evaluatePlan(w1, state, { line: [mv('G6', 'D2'), atk('D2', 'C2'), EA, EP] }, 'zero now'));
    expect(zeroNow.replayed, zeroNow.evidence).toBe(true);
    expect(zeroNow.facts.attacks).toEqual([expect.objectContaining({ attacker: 'lightning_1', defender: 'water_1', power: 0 })]);
    expect(zeroNow.holds, zeroNow.evidence).toBe(false);

    // Next turn, one fact flipped: every White unit, on the board and pending,
    // becomes a Water. The Lightning on G6 still reaches B3 after a passive
    // reply, but now strikes it at power 0 instead of 2, so the pass loses its
    // contact-in-3.
    const allWater: GameState = {
      ...state,
      pendingSummons: (state.pendingSummons ?? []).map(p => (p.owner === 'white' ? { ...p, definitionId: 'water_1' } : p)),
      board: { ...state.board, units: state.board.units.map(u => (u.owner === 'white' ? { ...u, definitionId: 'water_1' } : u)) },
    };
    // What the Lightning on G6 can do to B3 once White has passed back.
    const reachB3 = (end: GameState | null) =>
      withExamRules(c, () => {
        if (end === null) throw new Error('the pass did not replay');
        let s = end;
        while (s.turn.currentPlayer !== 'black') s = applyAction(s, phaseEndAction(s));
        const lightning = getUnitAt(s.board, sq('G6'));
        const target = getUnitAt(s.board, sq('B3'));
        if (lightning === null || target === null) throw new Error('fixture moved');
        return { power: calculateAttackPower(lightning, target), approach: findAttackApproach(lightning, target, s.board, s.turn.actionsRemaining) };
      });
    const real = withExamRules(c, () => evaluatePlan(w3, state, { line: pass }, 'real'));
    expect(real.holds, real.evidence).toBe(true);
    expect(reachB3(real.end)).toMatchObject({ power: 2, approach: expect.any(Array) });
    const flipped = withExamRules(c, () => evaluatePlan(w3, allWater, { line: pass }, 'all water'));
    expect(flipped.replayed, flipped.evidence).toBe(true);
    expect(reachB3(flipped.end)).toMatchObject({ power: 0, approach: expect.any(Array) });
    expect(flipped.holds, flipped.evidence).toBe(false);
  });

  it('judges only the side to move, and only up to the hand-off', () => {
    const c = caseOf('wave1-SO01-B-t11');
    const state = loadCaseState(c);
    expect(() => withExamRules(c, () => evaluatePlan({ ...c.witness, side: 'black' }, state, { line: [EA, EP] }, 't'))).toThrow(/judges black, but white is to move/);
    const past = judge('wave1-SO01-B-t11', [atk('C2', 'C3'), EA, EP, EA]);
    expect(past.replayed).toBe(false);
    expect(past.holds).toBe(false);
    expect(past.evidence).toMatch(/action 3 follows the end of the turn/);
  });

  it('a turn that does not replay satisfies nothing and says why', () => {
    const shortLine = judge('wave1-FB01-B-t18', [promo('C5')]);
    expect(shortLine.replayed).toBe(false);
    expect(shortLine.holds).toBe(false);
    expect(shortLine.evidence).toMatch(/illegal/);

    const noHandOff = judge('wave1-SO01-B-t11', [atk('C2', 'C3'), EA]);
    expect(noHandOff.replayed).toBe(false);
    expect(noHandOff.evidence).toMatch(/does not reach the hand-off/);
  });
});

describe('cases-p4: plan witness shape rules', () => {
  const base = () => structuredClone(caseOf('wave1-AS01-W-t3')) as ExamCase & { witness: PlanWitness };

  it('refuses a plan witness under another kind, and another witness under kind plan', () => {
    expect(() => validateCaseShape({ ...base(), kind: 'judgment' }, 't')).toThrow(/witness labelled "plan"/);
    const j = base() as unknown as Record<string, unknown>;
    j.witness = { label: 'judgment', preferredKeys: ['0'.repeat(16)], avoidKeys: [], reason: 'r', by: 'author' };
    expect(() => validateCaseShape(j, 't')).toThrow(ExamFormatError);
  });

  it('refuses a side that is not the side to move, bad ply counts, stray targets, missing citations and adviser authorship', () => {
    const side = base();
    side.witness.side = 'white';
    expect(() => validateCaseShape(side, 't')).toThrow(/judges the side to move/);

    const contact = structuredClone(caseOf('wave1-OP01-W-t2')) as ExamCase & { witness: PlanWitness };
    contact.witness.n = 2;
    expect(() => validateCaseShape(contact, 't')).toThrow(/n in \{1, 3\}/);
    delete contact.witness.n;
    expect(() => validateCaseShape(contact, 't')).toThrow(/n in \{1, 3\}/);

    const stray = base();
    stray.witness.n = 3;
    expect(() => validateCaseShape(stray, 't')).toThrow(/only contact-in-n/);

    const target = structuredClone(caseOf('wave1-FB01-B-t18')) as ExamCase & { witness: PlanWitness };
    target.witness.target = sq('C3');
    expect(() => validateCaseShape(target, 't')).toThrow(/only damaging-attack names a target/);

    const uncited = base();
    uncited.witness.cites = [];
    expect(() => validateCaseShape(uncited, 't')).toThrow(/must cite/);

    const adviser = base() as unknown as { witness: Record<string, unknown> };
    adviser.witness.by = 'adviser';
    expect(() => validateCaseShape(adviser, 't')).toThrow(/by must be "author"/);

    const pred = base() as unknown as { witness: Record<string, unknown> };
    pred.witness.predicate = 'wins-eventually';
    expect(() => validateCaseShape(pred, 't')).toThrow(/is not one of/);
  });

  it('refuses a case whose position no longer reads as recorded (clock, mined totals, bank)', () => {
    for (const mutate of [
      (w: PlanWitness) => { w.at.clock += 1; },
      (w: PlanWitness) => { w.at.mined.white += 1; },
      (w: PlanWitness) => { w.at.bank += 1; },
    ]) {
      const c = base();
      mutate(c.witness);
      expect(() => loadCaseState(validateCaseShape(c, 't'))).toThrow(/the plan was chosen for a different position/);
    }
  });

  it('refuses a room source whose revisions are not consecutive', () => {
    const c = base();
    if (c.source.kind !== 'room') throw new Error('unreachable');
    c.source.replyRevision = c.source.revision + 2;
    expect(() => validateCaseShape(c, 't')).toThrow(/must be consecutive/);
  });

  it('evaluatePlan refuses a target square with no enemy unit on it', () => {
    const c = caseOf('wave1-SO01-B-t11');
    const state = loadCaseState(c);
    const w: PlanWitness = { ...c.witness, target: sq('E5') };
    expect(() => withExamRules(c, () => evaluatePlan(w, state, { line: [EA, EP] }, 't'))).toThrow(/no enemy unit stands on the target square E5/);
  });
});

// --- the runner --------------------------------------------------------------

function rootResult(actions: AIAction[]): RootResult {
  return { actions, scoreCc: 0, depth: 1, work: 1, stats: newSearchStats(), source: 'search', endKey: '0'.repeat(16) };
}

/** A stub engine that plays, for each case (in order), the chosen square line
 * resolved against the runner's own state. The runner has the case's rules
 * installed while it searches, so the replay here uses them too. */
function playing(lines: OpeningAction[][]): ExamEngineFactory {
  let i = 0;
  return () => ({
    searchTurn: (state: GameState) => {
      const line = lines[i++];
      const actions: AIAction[] = [];
      let s = state;
      for (const a of line) {
        const action = resolveOpeningAction(s, a, 'stub');
        actions.push(action);
        s = applyAction(s, action);
      }
      return Promise.resolve(rootResult(actions));
    },
  });
}

function args(over: Partial<ExamArgs> = {}): ExamArgs {
  return { stratum: 'dev', engine: 'hard@desktop', work: 1, casesDir: CASES_P4_DIR, out: null, md: null, ids: null, tag: null, demand: null, limit: null, heavy: false, deadCheck: false, ...over };
}

describe('cases-p4: the runner scores plan cases in their own tally', () => {
  it('accepts --cases-dir lab/hard-ai/exam/cases-p4 and writes its artifact outside the E1 path', () => {
    const parsed = parseArgs(['--cases-dir', 'lab/hard-ai/exam/cases-p4', '--stratum', 'dev', '--engine', 'hard@strategos', '--work', '60000']);
    expect(parsed.casesDir).toBe(path.resolve('lab/hard-ai/exam/cases-p4'));
    expect(loadStratum(parsed.stratum, parsed.casesDir).map(c => c.id)).toEqual(CASES.map(c => c.id));
    expect(path.relative(REPO, defaultOutFor(parsed))).toBe('lab/results/exam-cases-p4/dev-strategos-fixed60000.json');
    expect(path.relative(REPO, defaultOutFor(args({ casesDir: path.resolve(REPO, 'lab/hard-ai/exam/cases') })))).toBe('lab/results/hard-ai-e1/exam/dev.json');
  });

  it('GOOD turns pass every case (the expected-fail row becomes unexpected); the tallies are never summed', async () => {
    const run = await runExam(CASES, args(), { engineFactory: playing(CASES.map(c => PAIRS[c.id].good[0].line())) });
    expect(run.errors).toEqual([]);
    expect(run.exact.cases).toBe(0);
    expect(run.judgment.cases).toBe(0);
    expect(run.plan).toMatchObject({ cases: 8, passed: 8, failed: 0, expectedFail: 1, asExpected: 7, unexpected: ['wave1-SO01-B-t11'] });
    // SN05-W's pass satisfies the predicate itself, so no adjudication was needed.
    expect(run.plan.wonOutrightAdjudications).toBe(0);
    for (const r of run.results) {
      expect(r.kind).toBe('plan');
      expect(r.matched).toBeNull();
      expect(r.evidence).not.toBeNull();
      expect(r.line).not.toBeNull();
    }
    expect(run.byDemand['quiet-clock']).toMatchObject({ planCases: 4, planPassed: 4, exactCases: 0, judgmentCases: 0 });
    const md = renderMarkdown(run);
    expect(md).toContain('## Plan cases (canonical predicate, authored choice)');
    expect(md).toContain('`wave1-SO01-B-t11`');
    expect(md).toContain('PASS (unexpected)');
  });

  it('BAD turns fail every case except by the win adjudication; the expected-fail row is then as expected', async () => {
    const run = await runExam(CASES, args(), { engineFactory: playing(CASES.map(c => PAIRS[c.id].bad[0].line())) });
    expect(run.errors).toEqual([]);
    expect(run.plan).toMatchObject({ cases: 8, passed: 0, failed: 8, asExpected: 1, wonOutrightAdjudications: 0 });
    expect(run.plan.unexpected).toHaveLength(7);
    expect(run.results.find(r => r.id === 'wave1-SO01-B-t11')?.asExpected).toBe(true);
  });

  it('a turn that wins outright passes whatever the predicate says, and is counted as an adjudication', async () => {
    // SN05-W's pass ends the game on the clock in Hard's favour; judged against a
    // predicate it does not satisfy, the row still passes (a case cannot ask an
    // engine to decline winning), and says so.
    const c = structuredClone(caseOf('wave1-SN05-W-t5'));
    c.witness = { ...c.witness, predicate: 'promotion-made' };
    const run = await runExam([c], args(), { engineFactory: playing([playedLine('wave1-SN05-W-t5')]) });
    expect(run.results[0].passed).toBe(true);
    expect(run.results[0].evidence).toBe('no promotion in the turn');
    expect(run.results[0].note).toMatch(/wins the game outright/);
    expect(run.plan.wonOutrightAdjudications).toBe(1);
  });

  it('a mixed set keeps the tallies apart: a judgment row never enters plan, a plan row never enters judgment', async () => {
    const plan = caseOf('wave1-SN05-W-t5');
    const judgment = {
      ...structuredClone(plan),
      id: 'mixed-judgment-row',
      kind: 'judgment',
      witness: { label: 'judgment', preferredKeys: ['0'.repeat(16)], avoidKeys: [], reason: 'a stub preference', by: 'author' },
    } as ExamCase;
    const run = await runExam([plan, judgment], args(), { engineFactory: playing([playedLine(plan.id), playedLine(plan.id)]) });
    expect(run.errors).toEqual([]);
    expect(run.results.map(r => r.kind)).toEqual(['plan', 'judgment']);
    expect(run.plan).toMatchObject({ cases: 1, passed: 1, failed: 0, asExpected: 1, unexpected: [] });
    expect(run.judgment.cases).toBe(1);
    expect(run.exact.cases).toBe(0);
    expect(run.results[1]).toMatchObject({ predicate: null, expected: null, asExpected: null, at: null, line: null, evidence: null });
    expect(run.byDemand['quiet-clock']).toMatchObject({ planCases: 1, planPassed: 1, judgmentCases: 1, exactCases: 0 });
  });

  it('an engine turn that does not replay is a failed row with a note, not an error', async () => {
    const one = [caseOf('wave1-SO01-B-t11')];
    const run = await runExam(one, args(), { engineFactory: playing([[atk('C2', 'C3'), EA]]) });
    expect(run.plan.unreplayed).toEqual(['wave1-SO01-B-t11']);
    expect(run.results[0].passed).toBe(false);
    expect(run.results[0].note).toMatch(/do not replay to the hand-off/);
  });
});
