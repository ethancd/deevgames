// @vitest-environment node
/** The author-time free-win veto (v2 authoring contract).
 *
 * v1 shipped macro-decisions whose root handed the mover a canonical win the
 * case's own accept predicate refuses to credit, so an engine that wins the
 * game outright scores zero on that case. These tests pin the defect: the veto
 * must refuse every one of those roots, and must not refuse the sound ones.
 * They read the v1 documents only to prove the refusal; no v1 fixture byte,
 * classification or floor is changed by this file.
 */
import { describe, expect, it } from 'vitest';
import { buildNewFamilies } from '../../lab/hard-ai/suites/phasing/build-new-families';
import { buildTacticsSuite } from '../../lab/hard-ai/suites/phasing/build-tactics';
import { buildHomeMateSuite } from '../../lab/hard-ai/suites/phasing/build-home-mate';
import { positionRef, sourceBinding, withRules } from '../../lab/hard-ai/suites/phasing/canonical';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';
import { applyAction, transitionWithoutCheckmate } from '../../src/ai/simulate';
import { analyzeHomeDefense } from '../../src/game/homeCheckmate';
import { assertNoUncreditedWin, establishesHomeMate, uncreditedMoverWins, VetoError, VETO_BOUNDS, VETO_PROMOTION_UNIT_BOUND, VETO_PROOF_NODES, VETO_STATE_BUDGET, VETO_UPKEEP_UNIT_BOUND } from '../../lab/hard-ai/suites/phasing/veto';
import { vetoDocument } from '../../lab/hard-ai/suites/phasing/run';
import type { AIAction, GameState, Horizon, MacroDecision, PlayerId, SuiteDocument } from '../../lab/hard-ai/suites/phasing/format';
import type { Unit } from '../../src/game/types';

/** The horizon item (3) gives every summon-disruption decision in v2: one more
 * scripted hand-off, so "disrupts and is immediately captured" cannot score. */
const INTRUDER_HORIZON: Horizon = { kind: 'scripted', policy: 'pass-only@1', additionalHandoffs: 1, homeFirst: true };

/** Eight v1 disruption roots where the raider simply walks into the defender's
 * home corner and mates inside its own Act, while accept demands 'playing'. */
const MATE_IN_ACT = [
  'M5-SD-01-occupied-low-cost', 'M5-SD-02-occupied-miner', 'M5-SD-03-interior-block',
  'M5-SD-04-inclusive-edge', 'M5-SD-06-temporary-intrusion', 'M5-SD-07-split-rectangles',
  'M5-SD-09-shared-intersection', 'M5-SD-18-arrival-immediate-attack',
];
/** The ninth. The single-stage probe found nothing here at v1's first-hand-off
 * horizon, and only saw the conversion to home-occupation once the
 * intruder-survival horizon was applied. The two-stage probe shows the case is
 * worse than that: the raider reaches White's corner in three moves and MATES
 * at v1's own horizon after one Prepare promotion, which is the HOME_FORTIFY
 * motif a BFS bounded by `actionsRemaining` structurally cannot reach. */
const CONVERTS_AT_EXTENDED_HORIZON = 'M5-SD-28-home-blocks-all-rectangles';
/** Sound disruption decisions: no mover unit can reach the defender's corner. */
const SOUND_DISRUPTION = [
  'M5-SD-05-remote-landing-reachable-blocker', 'M5-SD-10-capture-only-reaching-anchor',
  'M5-SD-13-cleave-two-anchors', 'M5-SD-14-pending-does-not-save-elimination',
  'M5-SD-30-home-win-before-arrivals',
];
/** Four tactics roots whose spare lane unit walks into the enemy corner and
 * mates, while accept requires the named target to fall to an own-Act attack. */
const DEFECTIVE_TACTICS = [
  'phasing-tactics-two-lanes-fire_2-vs-water_2', 'phasing-tactics-two-lanes-shadow_1-vs-water_2',
  'phasing-tactics-two-lane-approach-fire_2-vs-water_2', 'phasing-tactics-two-lane-approach-shadow_1-vs-water_2',
];
/** Found by this veto and not by either independent review: eight home-mate
 * invader decisions where the invader can simply eliminate the defender's last
 * unit, which the home-defence proof predicate cannot score because it refuses
 * a terminal snapshot. They are re-authoring work in the same class. */
const DEFECTIVE_HOME_INVADER = [
  'phasing-promotion-dependent-rescue-mate', 'phasing-promotion-dependent-rescue-rotated-black-mate',
  'phasing-public-bank-no-promotion-money-mate', 'phasing-public-bank-no-promotion-money-rotated-black-mate',
  'phasing-newly-placed-unit-cannot-promote-mate', 'phasing-newly-placed-unit-cannot-promote-rotated-black-mate',
  'phasing-at-most-one-promotion-mate', 'phasing-at-most-one-promotion-rotated-black-mate',
];

function decisions(doc: SuiteDocument, ids: readonly string[]): { c: MacroDecision; state: Parameters<typeof uncreditedMoverWins>[1] }[] {
  return ids.map(id => {
    const c = doc.cases.find(entry => entry.id === id);
    if (!c || c.kind !== 'macro-decision') throw new Error(`missing decision ${id}`);
    const position = doc.positions.find(p => p.id === c.root.id);
    if (!position || positionRef(position).sha256 !== c.root.sha256) throw new Error(`root binding mismatch ${id}`);
    return { c, state: position.state };
  });
}

describe('author-time free-win veto', () => {
  const [disruption] = buildNewFamilies();

  it('refuses the eight v1 disruption roots that mate inside the mover’s own Act', () => {
    const binding = disruption.positions[0].binding;
    withRules(binding, () => {
      for (const { c, state } of decisions(disruption, MATE_IN_ACT)) {
        const outcome = uncreditedMoverWins(c, state);
        expect(outcome.exhausted, `${c.id} must be answered within the probe budget`).toBe(false);
        expect(outcome.wins.length, `${c.id} must expose at least one uncredited mover win`).toBeGreaterThan(0);
        // The win is a home entry the accept predicate scores as a miss.
        expect(outcome.wins.every(w => w.reason === 'home-checkmate' || w.reason === 'home-mate')).toBe(true);
        // Runtime check of the invariant UncreditedWin.acceptStatus encodes in
        // its type: the probe only records a win the accept predicate refuses.
        // Widened to string so the compiler does not reject the comparison as
        // impossible — the assertion still runs and still has to hold.
        expect(outcome.wins.every(w => (w.acceptStatus as string) !== 'pass')).toBe(true);
        expect(() => assertNoUncreditedWin(c, state)).toThrow(VetoError);
      }
    }, binding);
  }, 240_000);

  it('refuses the ninth disruption root at v1’s own horizon, via a Prepare promotion', () => {
    const binding = disruption.positions[0].binding;
    withRules(binding, () => {
      const [{ c, state }] = decisions(disruption, [CONVERTS_AT_EXTENDED_HORIZON]);
      // The single-stage probe found nothing here at the declared horizon: the
      // endpoint is 'playing' and the occupation is answerable. The two-stage
      // probe crosses END_ACTION_PHASE and promotes the raider in Prepare,
      // where canonical re-adjudication awards home-checkmate outright. This is
      // the one v1 case the wider enumeration flags that the narrow one did not.
      const declared = uncreditedMoverWins(c, state);
      expect(declared.exhausted, declared.exhaustedReason).toBe(false);
      expect(declared.wins.length).toBeGreaterThan(0);
      expect(declared.wins.every(w => w.stage === 'prepare')).toBe(true);
      expect(declared.wins.every(w => w.reason === 'home-checkmate')).toBe(true);
      expect(declared.wins.every(w => w.actions.some(a => a.type === 'PROMOTE_UNIT'))).toBe(true);
      expect(() => assertNoUncreditedWin(c, state)).toThrow(VetoError);
      // And it is still refused under the intruder-survival horizon, where the
      // same occupation additionally converts to home-occupation.
      const extended: MacroDecision = { ...c, horizon: INTRUDER_HORIZON };
      const outcome = uncreditedMoverWins(extended, state);
      expect(outcome.exhausted).toBe(false);
      expect(outcome.wins.length).toBeGreaterThan(0);
      expect(outcome.wins.some(w => w.reason === 'home-occupation')).toBe(true);
      expect(() => assertNoUncreditedWin(extended, state)).toThrow(VetoError);
    }, binding);
  }, 240_000);

  it('does not refuse the disruption decisions whose roots hand the mover nothing', () => {
    const binding = disruption.positions[0].binding;
    withRules(binding, () => {
      for (const { c, state } of decisions(disruption, SOUND_DISRUPTION)) {
        expect(() => assertNoUncreditedWin(c, state), c.id).not.toThrow();
        // Sound at the declared horizon and at the v2 intruder-survival horizon.
        expect(uncreditedMoverWins({ ...c, horizon: INTRUDER_HORIZON }, state).wins, c.id).toHaveLength(0);
      }
    }, binding);
  }, 240_000);

  it('refuses the four v1 tactics roots that offer a home mate instead of the named capture', () => {
    const tactics = buildTacticsSuite(), binding = tactics.positions[0].binding;
    withRules(binding, () => {
      for (const { c, state } of decisions(tactics, DEFECTIVE_TACTICS)) {
        const outcome = uncreditedMoverWins(c, state);
        expect(outcome.exhausted, c.id).toBe(false);
        expect(outcome.wins.length, c.id).toBeGreaterThan(0);
        expect(() => assertNoUncreditedWin(c, state)).toThrow(VetoError);
      }
    }, binding);
  }, 240_000);

  it('refuses the eight home-mate invader roots that can simply eliminate the defender', () => {
    const home = buildHomeMateSuite(), binding = home.positions[0].binding;
    withRules(binding, () => {
      for (const { c, state } of decisions(home, DEFECTIVE_HOME_INVADER)) {
        const outcome = uncreditedMoverWins(c, state);
        expect(outcome.exhausted, c.id).toBe(false);
        expect(outcome.wins.some(w => w.reason === 'elimination'), c.id).toBe(true);
        expect(() => assertNoUncreditedWin(c, state)).toThrow(VetoError);
      }
    }, binding);
  }, 240_000);

  it('credits a win when the case says the mover may win, so the veto is not a blanket refusal', () => {
    const [, fortify] = buildNewFamilies(), binding = fortify.positions[0].binding;
    withRules(binding, () => {
      const wins = fortify.cases.filter(c => c.kind === 'macro-decision') as MacroDecision[];
      expect(wins.length).toBe(6);
      // Every home-fortify decision is allow-root-mover-win: the mover's win is
      // exactly the objective, so evaluateDecision credits it and nothing is
      // refused. This is the control that the probe finds wins at all.
      expect(wins.every(c => c.terminalPolicy === 'allow-root-mover-win')).toBe(true);
      for (const c of wins) {
        const position = fortify.positions.find(p => p.id === c.root.id)!;
        expect(() => assertNoUncreditedWin(c, position.state), c.id).not.toThrow();
      }
    }, binding);
  }, 240_000);
});

/** ------------------------------------------------------------------------
 * Two-stage enumeration: wins that need the mover's own Prepare phase.
 *
 * The single-stage probe this replaces bounded its BFS by
 * `root.turn.actionsRemaining` and `continue`d at that depth, so on a Prepare
 * root (canonical Phasing sets `actionsRemaining` to 0 on entering Prepare,
 * and all six v1 Prepare roots have AP 0) it expanded nothing at all and its
 * PROMOTE_UNIT branch was dead code; from an Act root it only ever emitted
 * MOVE and ATTACK, completing the turn with pass-only phase ends, so a line
 * that enters the corner and then BUYS the occupier's survival with a
 * promotion was never tried.
 *
 * Each root below is constructed, not taken from v1, and each was confirmed to
 * produce ZERO wins under the previous implementation (`git show
 * HEAD:...veto.ts`, same probe calls, same states) and to be vetoed here. The
 * structural assertion that stands in for that check in CI is `stage ===
 * 'prepare'` together with a PROMOTE_UNIT/PAY_UPKEEP in the winning line:
 * neither could be produced by an enumeration over MOVE/ATTACK alone.
 * ------------------------------------------------------------------------ */
const EMPTY_BOARD = () => Array.from({ length: 10 }, (_, y) =>
  Array.from({ length: 10 }, (_, x) => ({ position: { x, y }, resourceLayers: 0 })));
const piece = (id: string, definitionId: string, owner: PlayerId, x: number, y: number): Unit =>
  ({ id, definitionId, owner, position: { x, y }, hasMoved: false, hasAttacked: false, canActThisTurn: true, damageTaken: 0 });
/** A minimal canonical Phasing state with White to move and no reserves, so
 * end-of-turn income cannot quietly change what White can afford. */
function constructed(o: { units: Unit[]; white: number; phase: 'action' | 'place'; ap: number; upkeepPending?: boolean; victoryRule?: GameState['victoryRule'] }): GameState {
  return {
    ruleset: 'phasing', actionsPerTurn: 4, blackCrystalHandicap: 0, pendingSummons: [],
    victoryRule: o.victoryRule ?? 'home-or-elimination', inactivityRule: 'on', inactivityPlies: 0,
    upkeepPending: !!o.upkeepPending, phase: 'playing',
    board: { cells: EMPTY_BOARD(), units: o.units },
    players: { white: { id: 'white', resources: o.white, startCorner: { x: 0, y: 0 }, resourcesGained: 0 },
      black: { id: 'black', resources: 0, startCorner: { x: 9, y: 9 }, resourcesGained: 0 } },
    turn: { currentPlayer: 'white', phase: o.phase, actionsRemaining: o.ap, turnNumber: 3 },
    winner: null, selectedUnit: null, validMoves: [], validAttacks: [],
  };
}
/** Accept demands a non-terminal endpoint, exactly like the v1 disruption and
 * tactics predicates: winning the game therefore scores zero. */
const uncredited = (id: string): MacroDecision => ({
  id, family: 'summon-disruption', kind: 'macro-decision', rationale: 'constructed veto regression root', tags: [],
  authoredFrom: { id, revision: 'veto-regression', disposition: 'new' },
  evidence: { positive: [], negative: [], rationale: 'probe-only; never authored into a bundle', exposure: 'constructed in this test' },
  root: { id: 'constructed', sha256: '0'.repeat(64) }, work: 1, horizon: { kind: 'first-handoff-or-terminal' },
  terminalPolicy: 'predicate-only',
  accept: { kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'game-phase', value: 'playing' }] },
});
/** An accept predicate no endpoint of these roots can satisfy, so any win the
 * probe finds is by construction uncredited. Used where the interesting
 * question is whether the probe finds a win AT ALL, rather than whether the
 * case's own accept happens to score it. */
const neverAccepts = (id: string): MacroDecision => ({ ...uncredited(id),
  accept: { kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'unit', id: 'no-such-unit', present: true }] } });
const lineOf = (w: { actions: AIAction[] }) => w.actions.map(a => a.type);

describe('free-win veto: wins that need the mover’s Prepare phase', () => {
  const binding = sourceBinding(DEFAULT_RULES);
  const scoped = <T>(body: () => T): T => withRules(binding, body, binding);

  it('vetoes a Prepare root whose occupier mates after one promotion', () => scoped(() => {
    // White already sits on Black's corner with a Water-I (defense 2), which
    // Black's Metal-I removes (attack 1, +1 against water). Promoting to
    // Water-II (defense 3) puts it out of a single tier-1 attack's reach, and
    // canonical re-adjudicates home checkmate on that promotion.
    const root = constructed({ phase: 'place', ap: 0, white: 4,
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('b-def', 'metal_1', 'black', 8, 9)] });
    // The root itself is NOT a mate: the probe must find the promotion.
    expect(analyzeHomeDefense(root, 'white', transitionWithoutCheckmate)).toBe('rescue');
    const outcome = uncreditedMoverWins(uncredited('prepare-one-promotion'), root);
    expect(outcome.exhausted, outcome.exhaustedReason).toBe(false);
    expect(outcome.wins.length).toBeGreaterThan(0);
    expect(outcome.wins.every(w => w.stage === 'prepare')).toBe(true);
    expect(outcome.wins.some(w => w.reason === 'home-checkmate')).toBe(true);
    expect(outcome.wins.map(lineOf)).toContainEqual(['PROMOTE_UNIT']);
    expect(() => assertNoUncreditedWin(uncredited('prepare-one-promotion'), root)).toThrow(VetoError);
  }), 120_000);

  it('vetoes an Act root that enters the corner and then promotes', () => scoped(() => {
    const root = constructed({ phase: 'action', ap: 4, white: 4,
      units: [piece('w-occ', 'water_1', 'white', 9, 8), piece('b-def', 'metal_1', 'black', 8, 9)] });
    const outcome = uncreditedMoverWins(uncredited('act-enter-then-promote'), root);
    expect(outcome.exhausted, outcome.exhaustedReason).toBe(false);
    expect(outcome.wins.length).toBeGreaterThan(0);
    // Every win needs the Act->Prepare boundary and a promotion after it: the
    // pass-only completion of the same entry is only 'rescue'.
    expect(outcome.wins.every(w => w.stage === 'prepare')).toBe(true);
    expect(outcome.wins.every(w => lineOf(w).includes('END_ACTION_PHASE') && lineOf(w).includes('PROMOTE_UNIT'))).toBe(true);
    expect(outcome.wins.map(lineOf)).toContainEqual(['MOVE', 'END_ACTION_PHASE', 'PROMOTE_UNIT']);
    expect(() => assertNoUncreditedWin(uncredited('act-enter-then-promote'), root)).toThrow(VetoError);
  }), 120_000);

  it('vetoes a fortify mate that needs two promotions, and one alone does not mate', () => scoped(() => {
    // Black's Water-I on (9,8) can chip the occupier; its Fire-II on (7,9) can
    // clear the (8,9) blocker, step in and finish. Promoting only the occupier
    // leaves that second route open; promoting the blocker as well closes it.
    const root = constructed({ phase: 'place', ap: 0, white: 8,
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('w-block', 'water_1', 'white', 8, 9),
        piece('b1', 'water_1', 'black', 9, 8), piece('b2', 'fire_2', 'black', 7, 9)] });
    expect(analyzeHomeDefense(root, 'white', transitionWithoutCheckmate)).toBe('rescue');
    const onePromotion = applyAction(root, { type: 'PROMOTE_UNIT', unitId: 'w-occ' });
    expect(onePromotion.phase).toBe('playing');
    expect(analyzeHomeDefense(onePromotion, 'white', transitionWithoutCheckmate)).toBe('rescue');
    const outcome = uncreditedMoverWins(uncredited('two-promotion-fortify'), root);
    expect(outcome.exhausted, outcome.exhaustedReason).toBe(false);
    expect(outcome.wins.length).toBeGreaterThan(0);
    expect(outcome.wins.every(w => lineOf(w).filter(type => type === 'PROMOTE_UNIT').length === 2)).toBe(true);
    expect(() => assertNoUncreditedWin(uncredited('two-promotion-fortify'), root)).toThrow(VetoError);
  }), 120_000);

  it('vetoes a root whose mate is only affordable after an upkeep release', () => scoped(() => {
    // White owes 1 rent on its Fire-II and holds exactly the 4 crystals the
    // promotion costs. Keeping the whole army pays the rent and the promotion
    // becomes unaffordable, so only a keep-set that RELEASES the renter wins:
    // the default "keep everything you can afford" upkeep never finds it.
    const root = constructed({ phase: 'place', ap: 0, white: 4, upkeepPending: true,
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('w-rent', 'fire_2', 'white', 1, 0),
        piece('b-def', 'water_1', 'black', 9, 8)] });
    const outcome = uncreditedMoverWins(uncredited('upkeep-release-then-promote'), root);
    expect(outcome.exhausted, outcome.exhaustedReason).toBe(false);
    expect(outcome.wins.length).toBeGreaterThan(0);
    expect(outcome.wins.every(w => lineOf(w).join(',') === 'PAY_UPKEEP,PROMOTE_UNIT')).toBe(true);
    for (const win of outcome.wins) {
      const upkeep = win.actions[0];
      if (upkeep.type !== 'PAY_UPKEEP') throw new Error('expected an upkeep choice');
      // The winning line releases the renter rather than paying for it.
      expect(upkeep.keepUnitIds).not.toContain('w-rent');
    }
    expect(() => assertNoUncreditedWin(uncredited('upkeep-release-then-promote'), root)).toThrow(VetoError);
  }), 120_000);

  it('does not refuse the same Prepare root when the promotion is unaffordable', () => scoped(() => {
    // The control for all four: one crystal short, and nothing is flagged, so
    // the refusals above come from the promotion and not from the new stages
    // flagging every occupation they see.
    const root = constructed({ phase: 'place', ap: 0, white: 3,
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('b-def', 'metal_1', 'black', 8, 9)] });
    const outcome = uncreditedMoverWins(uncredited('prepare-unaffordable'), root);
    expect(outcome.exhausted, outcome.exhaustedReason).toBe(false);
    expect(outcome.wins).toHaveLength(0);
    expect(() => assertNoUncreditedWin(uncredited('prepare-unaffordable'), root)).not.toThrow();
  }), 120_000);

  it('credits the same promotion mate when the case says the mover may win', () => scoped(() => {
    const root = constructed({ phase: 'place', ap: 0, white: 4,
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('b-def', 'metal_1', 'black', 8, 9)] });
    const allowed: MacroDecision = { ...uncredited('prepare-allowed-win'), terminalPolicy: 'allow-root-mover-win' };
    expect(uncreditedMoverWins(allowed, root).wins).toHaveLength(0);
    expect(() => assertNoUncreditedWin(allowed, root)).not.toThrow();
  }), 120_000);
});

describe('free-win veto: every declared bound fails closed', () => {
  const binding = sourceBinding(DEFAULT_RULES);
  const scoped = <T>(body: () => T): T => withRules(binding, body, binding);

  it('reports the bounds it enforces', () => {
    expect(VETO_BOUNDS).toEqual({ states: VETO_STATE_BUDGET, proofNodes: VETO_PROOF_NODES,
      upkeepUnits: VETO_UPKEEP_UNIT_BOUND, promotableUnits: VETO_PROMOTION_UNIT_BOUND });
  });

  it('refuses rather than clears when the state budget runs out', () => scoped(() => {
    const root = constructed({ phase: 'action', ap: 4, white: 4,
      units: [piece('w-occ', 'water_1', 'white', 9, 8), piece('b-def', 'metal_1', 'black', 8, 9)] });
    const outcome = uncreditedMoverWins(uncredited('budget'), root, 1);
    expect(outcome.exhausted).toBe(true);
    expect(outcome.exhaustedReason).toMatch(/state budget 1/);
    expect(() => assertNoUncreditedWin(uncredited('budget'), root, 1)).toThrow(/probe bound/);
  }), 60_000);

  it('refuses a Prepare root with more promotable units than the subset bound', () => scoped(() => {
    const many = Array.from({ length: VETO_PROMOTION_UNIT_BOUND + 1 }, (_, i) => piece(`w${i}`, 'water_1', 'white', i, 0));
    const root = constructed({ phase: 'place', ap: 0, white: 400,
      units: [...many, piece('b-def', 'metal_1', 'black', 0, 5)] });
    const outcome = uncreditedMoverWins(uncredited('promotion-bound'), root);
    expect(outcome.exhausted).toBe(true);
    expect(outcome.exhaustedReason).toMatch(/promotable units 13 exceeds/);
    expect(() => assertNoUncreditedWin(uncredited('promotion-bound'), root)).toThrow(VetoError);
  }), 60_000);

  /* --------------------------------------------------------------------- *
   * The home-defence proof cap was the ONE bound in this probe that failed
   * OPEN. `establishesHomeMate` collapsed the canonical tri-state
   * ('mate' | 'rescue' | 'unknown') to `result === 'mate'`, so a root whose
   * defence could not be decided inside the proof budget was reported as "no
   * uncredited win" — a clean bill of health produced by running out of
   * search, which is exactly what every other bound here refuses to do.
   *
   * The budget is injectable so this is testable at all. On the PREVIOUS
   * implementation these two tests fail: with a 1-node proof budget the
   * two-promotion fortify root returned `wins: []`, `exhausted: false`, and
   * `assertNoUncreditedWin` did not throw. Checked by restoring the boolean
   * `analyzeHomeDefenseEvidence(...).result === 'mate'` body and re-running:
   * `exhausted` came back false and the assertion passed.
   * --------------------------------------------------------------------- */
  it('treats an undecided home-defence proof as a bound hit, not as a clean root', () => scoped(() => {
    // The same fortify root the suite above vetoes at the full 20 000-node
    // budget. At one node the defence is UNKNOWN, and unknown must refuse.
    const root = constructed({ phase: 'place', ap: 0, white: 8,
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('w-block', 'water_1', 'white', 8, 9),
        piece('b1', 'water_1', 'black', 9, 8), piece('b2', 'fire_2', 'black', 7, 9)] });
    const decided = uncreditedMoverWins(uncredited('proof-cap-decided'), root, VETO_STATE_BUDGET, VETO_PROOF_NODES);
    expect(decided.exhausted, decided.exhaustedReason).toBe(false);
    expect(decided.wins.length).toBeGreaterThan(0);
    // One node cannot decide it, and the probe says so instead of clearing it.
    const starved = uncreditedMoverWins(uncredited('proof-cap-starved'), root, VETO_STATE_BUDGET, 1);
    expect(starved.exhausted).toBe(true);
    expect(starved.exhaustedReason).toMatch(/home-defence proof budget 1 nodes exhausted/);
    expect(starved.wins).toHaveLength(0);
    expect(() => assertNoUncreditedWin(uncredited('proof-cap-starved'), root, VETO_STATE_BUDGET, 1)).toThrow(/probe bound/);
  }), 120_000);

  it('never turns a refusal into a clean bill when the proof budget shrinks', () => scoped(() => {
    // The Prepare-promotion root of the suite above. Its mate is proved by the
    // canonical damage bound at zero search nodes, so shrinking the budget to
    // one node must still refuse — by the win, not by exhaustion.
    const root = constructed({ phase: 'place', ap: 0, white: 4,
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('b-def', 'metal_1', 'black', 8, 9)] });
    for (const proofNodes of [1, VETO_PROOF_NODES]) {
      const outcome = uncreditedMoverWins(uncredited('proof-cap-monotone'), root, VETO_STATE_BUDGET, proofNodes);
      expect(outcome.wins.length, `proofNodes=${proofNodes}`).toBeGreaterThan(0);
      expect(() => assertNoUncreditedWin(uncredited('proof-cap-monotone'), root, VETO_STATE_BUDGET, proofNodes)).toThrow(VetoError);
    }
  }), 120_000);

  /* --------------------------------------------------------------------- *
   * The other half of the same shortcut: `establishesHomeMate` asked the
   * defence analysis directly, skipping the two guards `resolveHomeCheckmate`
   * applies BEFORE it awards a mate. A line canonical will not award is not a
   * win any accept predicate has to credit, so flagging it refused sound
   * roots.
   *
   * Both roots below are constructed so the promotion that mates under the
   * shipped rules produces NO canonical award, verified in-line by applying
   * the promotion and reading `phase`/`winner` off the result.
   * --------------------------------------------------------------------- */
  it('does not flag a home occupation under elimination-only victory, which never awards one', () => scoped(() => {
    const root = constructed({ phase: 'place', ap: 0, white: 4, victoryRule: 'elimination',
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('b-def', 'metal_1', 'black', 8, 9)] });
    // Canonical does not end the game on the promotion here...
    const promoted = applyAction(root, { type: 'PROMOTE_UNIT', unitId: 'w-occ' });
    expect(promoted.phase).toBe('playing');
    expect(promoted.winner).toBeNull();
    // ...while the defence analysis, asked on its own, still says 'mate'. That
    // gap is what the previous implementation reported as a free win.
    expect(analyzeHomeDefense(promoted, 'white', transitionWithoutCheckmate)).toBe('mate');
    const outcome = uncreditedMoverWins(neverAccepts('elimination-rule'), root);
    expect(outcome.exhausted, outcome.exhaustedReason).toBe(false);
    expect(outcome.wins).toHaveLength(0);
    expect(() => assertNoUncreditedWin(neverAccepts('elimination-rule'), root)).not.toThrow();
  }), 120_000);

  it('honours the counter-invasion guard: an occupied own corner blocks the award', () => scoped(() => {
    const root = constructed({ phase: 'place', ap: 0, white: 4,
      units: [piece('w-occ', 'water_1', 'white', 9, 9), piece('b-def', 'metal_1', 'black', 8, 9),
        piece('b-inv', 'water_1', 'black', 0, 0)] });
    const promoted = applyAction(root, { type: 'PROMOTE_UNIT', unitId: 'w-occ' });
    expect(promoted.phase).toBe('playing');
    expect(promoted.winner).toBeNull();
    expect(analyzeHomeDefense(promoted, 'white', transitionWithoutCheckmate)).toBe('mate');
    const outcome = uncreditedMoverWins(neverAccepts('counter-invasion'), root);
    expect(outcome.exhausted, outcome.exhaustedReason).toBe(false);
    expect(outcome.wins).toHaveLength(0);
    expect(() => assertNoUncreditedWin(neverAccepts('counter-invasion'), root)).not.toThrow();
  }), 120_000);

  it('reports the canonical tri-state rather than a boolean', () => scoped(() => {
    const mating = constructed({ phase: 'place', ap: 0, white: 8,
      units: [piece('w-occ', 'water_2', 'white', 9, 9), piece('b-def', 'metal_1', 'black', 8, 9)] });
    expect(establishesHomeMate(mating, 'white')).toBe('mate');
    expect(establishesHomeMate(mating, 'white', 1)).toBe('mate');
    const fortify = constructed({ phase: 'place', ap: 0, white: 8,
      units: [piece('w-occ', 'water_2', 'white', 9, 9), piece('w-block', 'water_2', 'white', 8, 9),
        piece('b1', 'water_1', 'black', 9, 8), piece('b2', 'fire_2', 'black', 7, 9)] });
    expect(establishesHomeMate(fortify, 'white', 1)).toBe('unknown');
    const none = constructed({ phase: 'place', ap: 0, white: 0,
      units: [piece('w1', 'water_1', 'white', 5, 5), piece('b-def', 'metal_1', 'black', 8, 9)] });
    expect(establishesHomeMate(none, 'white')).toBe('rescue');
  }), 120_000);

  it('refuses a pending upkeep with more rent-bearing units than the keep-set bound', () => scoped(() => {
    const many = Array.from({ length: VETO_UPKEEP_UNIT_BOUND + 1 }, (_, i) => piece(`w${i}`, 'fire_2', 'white', i, 0));
    const root = constructed({ phase: 'place', ap: 0, white: 2, upkeepPending: true,
      units: [...many, piece('b-def', 'metal_1', 'black', 0, 5)] });
    const outcome = uncreditedMoverWins(uncredited('upkeep-bound'), root);
    expect(outcome.exhausted).toBe(true);
    expect(outcome.exhaustedReason).toMatch(/rent-bearing units 13 exceeds/);
    expect(() => assertNoUncreditedWin(uncredited('upkeep-bound'), root)).toThrow(VetoError);
  }), 60_000);
});

/** The veto wired into the AUTHOR path, where a v2 bundle has to pass it.
 *
 * `vetoDocument` collects instead of throwing, so one run names every defective
 * root in a document rather than stopping at the first. These two families are
 * the pair that makes the distinction real: `summon-disruption` carries nine
 * roots that hand the mover an uncredited win, and `home-fortify` carries six
 * decisions whose accept CREDITS the win (`allow-root-mover-win`), so it must
 * come back clean — by construction, not by exemption.
 *
 * This is also the regression that would catch the veto going blind again: a
 * probe that silently stopped enumerating would report an empty list here, which
 * is indistinguishable from a sound bundle at the call site.
 */
describe('the author-time veto over built v1 documents', () => {
  const binding = sourceBinding(DEFAULT_RULES);
  const documents = (): [SuiteDocument, SuiteDocument] => buildNewFamilies();

  it('names exactly the nine defective disruption roots and clears home-fortify', () => {
    const [disruption, fortify] = documents();
    const flagged = vetoDocument(disruption, binding);
    expect(flagged.map(f => f.id).sort()).toEqual([
      'M5-SD-01-occupied-low-cost', 'M5-SD-02-occupied-miner', 'M5-SD-03-interior-block',
      'M5-SD-04-inclusive-edge', 'M5-SD-06-temporary-intrusion', 'M5-SD-07-split-rectangles',
      'M5-SD-09-shared-intersection', 'M5-SD-18-arrival-immediate-attack',
      'M5-SD-28-home-blocks-all-rectangles',
    ]);
    // Every one is a refused win, not a bound the probe ran out of.
    for (const finding of flagged) expect(finding.reason).not.toMatch(/budget|exceeds|exhaust/i);
    for (const finding of flagged) expect(finding.family).toBe('summon-disruption');
    // `allow-root-mover-win` decisions pass because evaluateDecision scores the
    // win, which is the claim the preregistration makes about them.
    expect(vetoDocument(fortify, binding)).toEqual([]);
  }, 300_000);

  it('turns a starved proof budget into findings rather than a clean list', () => {
    // The fail-closed proof cap, seen through the author path: with one node the
    // probe cannot decide any home defence, so it must report MORE findings than
    // the full budget does, never fewer.
    const [disruption] = documents();
    const full = vetoDocument(disruption, binding).length;
    const starved = vetoDocument(disruption, binding, 1).length;
    expect(full).toBe(9);
    expect(starved).toBeGreaterThanOrEqual(full);
  }, 300_000);
});
