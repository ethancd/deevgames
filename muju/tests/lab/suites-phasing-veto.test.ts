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
import { positionRef, withRules } from '../../lab/hard-ai/suites/phasing/canonical';
import { assertNoUncreditedWin, uncreditedMoverWins, VetoError } from '../../lab/hard-ai/suites/phasing/veto';
import type { Horizon, MacroDecision, SuiteDocument } from '../../lab/hard-ai/suites/phasing/format';

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
/** The ninth: the occupation is answerable, so it is not a win at the v1
 * first-hand-off horizon, but it converts to home-occupation as soon as the
 * intruder-survival horizon of item (3) is applied. */
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

  it('refuses the ninth disruption root once the intruder-survival horizon is applied', () => {
    const binding = disruption.positions[0].binding;
    withRules(binding, () => {
      const [{ c, state }] = decisions(disruption, [CONVERTS_AT_EXTENDED_HORIZON]);
      // v1's first-hand-off horizon hides the conversion: the endpoint is still
      // 'playing', so the v1 probe alone cannot see it.
      expect(uncreditedMoverWins(c, state).wins).toHaveLength(0);
      const extended: MacroDecision = { ...c, horizon: INTRUDER_HORIZON };
      const outcome = uncreditedMoverWins(extended, state);
      expect(outcome.exhausted).toBe(false);
      expect(outcome.wins.length).toBeGreaterThan(0);
      expect(outcome.wins.some(w => w.reason === 'home-occupation')).toBe(true);
      expect(() => assertNoUncreditedWin(extended, state)).toThrow(VetoError);
    }, binding);
  }, 120_000);

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
