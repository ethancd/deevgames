// @vitest-environment node
/** Canonical authoring tests only. No Hard, evaluation weights or outcome floors. */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { URL as NodeURL } from 'node:url';
import { buildTacticsSuite } from '../../lab/hard-ai/suites/phasing/build-tactics';
import { buildHomeMateSuite, entryDiagram } from '../../lab/hard-ai/suites/phasing/build-home-mate';
import { authorCorrections, authorInputs, classification, checkFrozen } from '../../lab/hard-ai/suites/phasing/tactics-home-author';
import { positionRef, replayMacro, replayTrace, semanticHash, withRules } from '../../lab/hard-ai/suites/phasing/canonical';
import { evaluateDecision, validateAuthorEvidence, validateProvenance } from '../../lab/hard-ai/suites/phasing/predicates';
import { decisionUnits, validateSuiteDocument, type AIAction, type MacroDecision, type PhasingPosition, type SuiteDocument } from '../../lab/hard-ai/suites/phasing/format';
import { isLegalAction } from '../../src/game/legality';
import { calculateAttackPower, calculateDefense } from '../../src/game/combat';
import { getNextTierDefinition } from '../../src/game/units';
import { analyzeHomeDefenseEvidence } from '../../src/game/homeCheckmate';
import { transitionWithoutCheckmate } from '../../src/ai/simulate';

let tactics: SuiteDocument, home: SuiteDocument;
beforeAll(() => { tactics = buildTacticsSuite(); home = buildHomeMateSuite(); }, 120000);
function resolve(doc: SuiteDocument, id: string): PhasingPosition {
  const found = doc.positions.find(p => p.id === id); if (!found) throw new Error(id); return found;
}
function inRules<T>(doc: SuiteDocument, fn: () => T): T {
  const binding = doc.positions[0].binding;
  return withRules(binding, fn, binding);
}
function witness(c: MacroDecision, which: 'positive' | 'negative'): AIAction[] {
  const p = c.evidence[which].find(p => p.kind === 'legal-trace@1' && p.endpoint === 'first-handoff-or-terminal');
  if (!p || p.kind !== 'legal-trace@1') throw new Error('missing complete witness'); return p.actions;
}

describe('versioned tactics/home author inventory', () => {
  it('retains the pre-execution ledger bytes, IDs and fixed classifications', () => {
    const bytes = readFileSync(new NodeURL('../../lab/hard-ai/suites/phasing/author-inputs/tactics-home-classification-v1.json', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('289bceb9e37e0d13b8cefc34854ce7522137bef50b4e4d291b8cde370819629e');
    const correctionBytes = readFileSync(new NodeURL('../../lab/hard-ai/suites/phasing/author-inputs/tactics-home-corrections-v2.json', import.meta.url));
    expect(createHash('sha256').update(correctionBytes).digest('hex')).toBe('c77766dcd830fff4bc96ea90b23853472a827b12db82d331990922f5f213828e');
    expect(classification()).toHaveLength(135);
    expect(tactics.cases).toHaveLength(79); expect(home.cases).toHaveLength(56);
    expect(tactics.cases.reduce((n, c) => n + decisionUnits(c), 0)).toBe(63);
    expect(home.cases.reduce((n, c) => n + decisionUnits(c), 0)).toBe(28);
    expect(home.cases.filter(c => c.homeFraming === 'rescue')).toHaveLength(28);
    expect(home.cases.filter(c => c.homeFraming === 'invader')).toHaveLength(28);
    expect(home.cases.filter(c => c.homeFraming === 'rescue' && c.kind === 'macro-decision')).toHaveLength(16);
    expect(home.cases.filter(c => c.homeFraming === 'invader' && c.kind === 'macro-decision')).toHaveLength(12);
    for (const doc of [tactics, home]) expect(() => checkFrozen(doc)).not.toThrow();
  });

  it('makes every reference local, hash-bound, explicit Phasing, with legal provenance', () => {
    for (const doc of [tactics, home]) inRules(doc, () => {
      expect(() => validateSuiteDocument(doc)).not.toThrow();
      expect(() => validateProvenance(doc)).not.toThrow();
      for (const p of doc.positions) {
        expect(p.state.ruleset).toBe('phasing'); expect(p.state.pendingSummons).toBeDefined();
        expect(p.binding.rulesSourcesSha256).toMatch(/^[a-f0-9]{64}$/);
        if (p.origin.kind === 'legal-prefix') {
          const seed = resolve(doc, p.origin.seed.id);
          expect(positionRef(seed)).toEqual(p.origin.seed);
          expect(p.origin.seedReachability).toBe('authored-diagram');
        }
      }
    });
  });

  it('has a positive and a distinguishing complete negative macro for every decision', () => {
    for (const doc of [tactics, home]) inRules(doc, () => {
      for (const c of doc.cases) {
        expect(validateAuthorEvidence(c, ref => resolve(doc, ref.id)).status, c.id).toBe('pass');
        if (c.kind !== 'macro-decision') continue;
        const root = resolve(doc, c.root.id).state;
        expect(evaluateDecision(c, replayMacro(root, witness(c, 'positive'))).status, `${c.id} positive`).toBe('pass');
        expect(evaluateDecision(c, replayMacro(root, witness(c, 'negative'))).status, `${c.id} negative`).toBe('fail');
      }
    });
  });

  it('fails a changed classification, deleted witness, or overwritten source-bound state', () => {
    const changed = structuredClone(tactics); changed.cases.pop();
    expect(() => checkFrozen(changed)).toThrow(/count/);
    const changedState = structuredClone(tactics); changedState.positions[0].state.board.units[0].damageTaken++;
    expect(() => validateSuiteDocument(changedState)).toThrow(/hash/);
    const decision = structuredClone(tactics.cases.find(c => c.kind === 'macro-decision')!);
    decision.evidence.positive = [];
    inRules(tactics, () => expect(() => validateAuthorEvidence(decision, ref => resolve(tactics, ref.id))).toThrow(/lacks complete/));
  });
});

describe('tactics retain actual Act and Prepare semantics', () => {
  it('preserves all 58 Act geometries/flags/reserves and banks except the two documented rent corrections', () => {
    const inputs = authorInputs().tactics.filter(i => i.kind === 'macro-decision' && i.disposition === 'reauthored');
    expect(inputs).toHaveLength(58);
    for (const input of inputs) {
      const p = resolve(tactics, `${input.id}-root`);
      expect(p.state.board.units, input.id).toEqual(input.units);
      const expectedPlayers = structuredClone(input.players);
      const funding = authorCorrections().bankChanges.find(c => c.oldId === input.oldId);
      if (funding) expectedPlayers[funding.player].resources = funding.to;
      expect(p.state.players, input.id).toEqual(expectedPlayers);
      expect(p.state.board.cells.flat().map(c => c.resourceLayers)).toEqual(input.reserves);
      expect(p.state.turn).toEqual(input.turn);
      expect(p.binding.rules).toEqual(input.rules);
      expect(p.state.victoryRule).toBe(input.rules.victoryRule);
    }
  });

  it('funds exactly the two otherwise released plugged attackers and retains them through outgoing rent', () => inRules(tactics, () => {
    const funding = authorCorrections().bankChanges;
    expect(funding.map(c => c.oldId).sort()).toEqual(['tactics-plugged-fire_3-vs-fire_3', 'tactics-plugged-lightning_2-vs-fire_3']);
    const altered = authorInputs().tactics.filter(input => resolve(tactics, `${input.id}-root`).state.players.white.resources !== input.players.white.resources);
    expect(altered.map(i => i.oldId).sort()).toEqual(funding.map(c => c.oldId).sort());
    for (const input of altered) {
      const c = tactics.cases.find(c => c.id === input.id)!;
      if (c.kind !== 'macro-decision') throw new Error('funded decision');
      const root = resolve(tactics, c.root.id).state;
      expect(root.players.white.resources).toBe(1);
      const end = replayMacro(root, witness(c, 'positive')).endpoint;
      expect(end.phase).toBe('playing'); expect(end.turn.currentPlayer).toBe('black');
      expect(end.board.units.some(u => u.id === 'u0')).toBe(false);
      expect(end.board.units.find(u => u.id === 'u4')?.definitionId).toBe(input.units.find(u => u.id === 'u4')!.definitionId);
      expect(end.lastUpkeep?.released).toEqual([]);
      expect(end.lastUpkeep?.paid).toBe(input.oldId.includes('fire_3-vs') ? 2 : 1);
      expect(end.players.white.resources).toBe(0);
      expect(evaluateDecision(c, replayMacro(root, witness(c, 'positive'))).status).toBe('pass');
    }
  }));

  it('preserves the eight intentional elimination-only corner rule bindings', () => {
    const roots = tactics.positions.filter(p => p.id.endsWith('-root') && p.binding.rules.victoryRule === 'elimination');
    expect(roots).toHaveLength(8);
    for (const p of roots) { expect(p.state.victoryRule).toBe('elimination'); expect(p.id).toContain('corner'); }
  });

  it('replaces the five false Metal-II premises with actual current-stat damage witnesses', () => inRules(tactics, () => {
    const inputs = authorInputs().tactics.filter(i => i.disposition === 'replacement');
    expect(inputs).toHaveLength(5);
    for (const input of inputs) {
      const c = tactics.cases.find(c => c.authoredFrom.id === input.oldId)!;
      expect(c.kind).toBe('macro-decision'); if (c.kind !== 'macro-decision') throw new Error('classification');
      const root = resolve(tactics, c.root.id).state, target = root.board.units.find(u => u.id === 'u0')!;
      const attackers = root.board.units.filter(u => u.owner === root.turn.currentPlayer);
      expect(attackers.every(u => u.definitionId === 'metal_2')).toBe(true);
      const actions = witness(c, 'positive');
      const hits = actions.filter(a => a.type === 'ATTACK');
      const total = hits.reduce((n, a) => n + calculateAttackPower(root.board.units.find(u => u.id === a.unitId)!, target), 0);
      expect(total, input.id).toBe(calculateDefense(target));
      expect(target.definitionId).toBe(input.oldId.includes('three-lanes') ? 'metal_3' : 'water_3');
      expect(target.damageTaken).toBe(input.oldId.includes('chipped') || input.oldId.includes('three-lanes') ? 2 : 0);
      if (input.oldId.includes('two-lane-approach')) expect(actions.filter(a => a.type === 'MOVE' || a.type === 'ATTACK')).toHaveLength(4);
      expect(replayMacro(root, actions).endpoint.board.units.some(u => u.id === 'u0')).toBe(false);
    }
  }));

  it('keeps all 16 former summon/promotion tactics at Prepare zero AP with post-action attack refusal', () => inRules(tactics, () => {
    const inputs = authorInputs().tactics.filter(i => i.kind === 'canonical-coverage');
    expect(inputs).toHaveLength(16);
    expect(inputs.filter(i => i.timingAction?.type === 'BUY_UNIT')).toHaveLength(8);
    for (const input of inputs) {
      const c = tactics.cases.find(c => c.id === input.id)!;
      expect(c.kind).toBe('canonical-coverage');
      const root = resolve(tactics, `${input.id}-root`).state, after = resolve(tactics, `${input.id}-after-prepare-action`).state;
      expect(root.turn.phase).toBe('place'); expect(root.turn.actionsRemaining).toBe(0);
      expect(after.turn).toEqual(root.turn);
      const action = input.timingAction!;
      const target = root.board.units.find(u => u.owner !== root.turn.currentPlayer)!;
      if (action.type === 'BUY_UNIT') {
        expect(after.board.units).toEqual(root.board.units);
        const commitment = after.pendingSummons![0]; expect(commitment.definitionId).toBe(action.definitionId);
        expect(isLegalAction(after, { type: 'ATTACK', unitId: commitment.id, targetPosition: target.position })).toBe(false);
        expect(isLegalAction(after, { type: 'MOVE', unitId: commitment.id, to: { x: 0, y: 1 } })).toBe(false);
      } else if (action.type === 'PROMOTE_UNIT') {
        const original = root.board.units.find(u => u.id === action.unitId)!;
        expect(after.board.units.find(u => u.id === original.id)!.definitionId).toBe(getNextTierDefinition(original.definitionId)!.id);
        expect(isLegalAction(after, { type: 'ATTACK', unitId: original.id, targetPosition: target.position })).toBe(false);
      } else throw new Error('wrong timing action');
      expect(isLegalAction(after, { type: 'END_ACTION_PHASE' })).toBe(false);
      const handoff = replayMacro(root, [action, { type: 'END_PLACE_PHASE' }]).endpoint;
      expect(handoff.turn.currentPlayer).not.toBe(root.turn.currentPlayer);
      expect(handoff.turn.phase).toBe('action'); expect(handoff.turn.actionsRemaining).toBe(4);
      expect(handoff.board.units.some(u => u.id === target.id)).toBe(true);
    }
  }));
});

describe('home mate/rescue provenance and limited objectives', () => {
  it('derives the 16 rescue roots through canonical incoming reset, preserving all invader damage', () => inRules(home, () => {
    const cases = home.cases.filter(c => c.kind === 'macro-decision' && c.homeFraming === 'rescue');
    expect(cases).toHaveLength(16);
    for (const c of cases) {
      if (c.kind !== 'macro-decision') throw new Error('classification');
      const p = resolve(home, c.root.id); expect(p.origin.kind).toBe('legal-prefix');
      if (p.origin.kind !== 'legal-prefix') throw new Error('provenance');
      const seed = resolve(home, p.origin.seed.id);
      expect(seed.state.turn.phase).toBe('place'); expect(seed.state.turn.actionsRemaining).toBe(0);
      expect(semanticHash(replayMacro(seed.state, p.origin.actions).endpoint)).toBe(semanticHash(p.state));
      expect(p.state.board.units.find(u => u.id === 'invader')).toEqual(seed.state.board.units.find(u => u.id === 'invader'));
      for (const u of p.state.board.units.filter(u => u.owner === p.state.turn.currentPlayer)) {
        expect(u.damageTaken).toBe(0); expect(u.canActThisTurn).toBe(true);
        expect(u.attackedThisTurn).toEqual([]); expect(u.placedThisTurn).toBe(false); expect(u.promotedThisPlacement).toBe(false);
      }
      if (c.id.includes('damage-remains')) expect(p.state.board.units.find(u => u.id === 'invader')!.damageTaken).toBe(2);
    }
  }));

  it('proves all 12 new legal entry decisions on the unadjudicated occupied board, with exact relocation', () => inRules(home, () => {
    const inputs = authorInputs().home.filter(i => i.expectedDefense === 'mate'); expect(inputs).toHaveLength(12);
    for (const input of inputs) {
      const { state, entry, relocation } = entryDiagram(input);
      expect(relocation).toBe('defender-1'); expect(isLegalAction(state, entry)).toBe(true);
      const moved = state.board.units.find(u => u.id === relocation)!;
      const coordinate = input.units.find(u => u.id === 'invader')!.position.x === 0 ? 1 : 8;
      expect(moved.position).toEqual({ x: coordinate, y: coordinate });
      expect(state.board.units.map(u => ({ ...u, position: undefined }))).toEqual(input.units.map(u => ({ ...u, position: undefined })));
      const occupied = transitionWithoutCheckmate(state, entry);
      expect(occupied.phase).toBe('playing');
      const invader = input.units.find(u => u.id === 'invader')!.owner;
      const proof = analyzeHomeDefenseEvidence(occupied, invader, transitionWithoutCheckmate, 20000);
      expect(proof.result, input.baseId).toBe('mate'); expect(proof.cutoffReason).toBeNull();
      const entered = replayTrace(state, [entry]).endpoint;
      expect(entered.phase).toBe('playing'); expect(entered.turn.phase).toBe('action');
      expect(entered.turn.currentPlayer).toBe(invader); expect(entered.turn.actionsRemaining).toBe(3);
      const c = home.cases.find(c => c.authoredFrom.id === `${input.baseId}-mate`)!;
      if (c.kind !== 'macro-decision') throw new Error('winning entry decision');
      const actions = witness(c, 'positive');
      expect(actions).toEqual([entry, { type: 'END_ACTION_PHASE' }]);
      const canonical = replayMacro(state, actions).endpoint;
      expect(canonical.phase).toBe('victory'); expect(canonical.winner).toBe(invader); expect(canonical.victoryReason).toBe('home-checkmate');
      expect(canonical.turn.phase).toBe('place'); expect(canonical.upkeepPending).toBe(false);
      expect(canonical.lastUpkeep?.player).toBe(invader); expect(canonical.lastUpkeep?.paid).toBe(2); expect(canonical.lastUpkeep?.released).toEqual([]);
    }
  }));

  it('marks the 12 impossible rescue roots as counterfactual coverage and keeps all 16 rescuable entries unscored', () => {
    const counterfactual = home.positions.filter(p => p.origin.kind === 'counterfactual-defense'); expect(counterfactual).toHaveLength(12);
    for (const p of counterfactual) {
      const c = home.cases.find(c => c.kind !== 'invariant-pair' && c.root.id === p.id)!;
      expect(c.kind).toBe('canonical-coverage'); expect(decisionUnits(c)).toBe(0);
      if (c.kind === 'canonical-coverage') expect(c.engineReplay.required).toBe(false);
    }
    const entries = home.cases.filter(c => c.homeFraming === 'invader' && c.kind === 'canonical-coverage'); expect(entries).toHaveLength(16);
    for (const c of entries) expect(decisionUnits(c)).toBe(0);
  });

  it('keeps counterfactual mate proof distinct from the granted defender pass ending in home occupation', () => inRules(home, () => {
    const cases = home.cases.filter(c => c.kind === 'canonical-coverage' && c.homeFraming === 'rescue');
    expect(cases).toHaveLength(12);
    for (const c of cases) {
      if (c.kind !== 'canonical-coverage') throw new Error('counterfactual coverage');
      const p = resolve(home, c.root.id), invader = p.state.board.units.find(u => u.id === 'invader')!.owner;
      expect(p.origin.kind).toBe('counterfactual-defense');
      expect(analyzeHomeDefenseEvidence(p.state, invader, transitionWithoutCheckmate, 20000).result).toBe('mate');
      const positive = c.evidence.positive[0]; if (positive.kind !== 'legal-trace@1') throw new Error('counterfactual pass');
      const end = replayMacro(p.state, positive.actions).endpoint;
      expect(end.phase).toBe('victory'); expect(end.winner).toBe(invader); expect(end.victoryReason).toBe('home-occupation');
    }
  }));

  it('retains damage in both mirrored invader entry controls rather than reproducing the old reset', () => inRules(home, () => {
    const cases = home.cases.filter(c => c.id.includes('damage-remains') && c.homeFraming === 'invader'); expect(cases).toHaveLength(2);
    for (const c of cases) {
      if (c.kind !== 'canonical-coverage') throw new Error('damage control must remain coverage');
      const root = resolve(home, c.root.id).state;
      expect(root.board.units.find(u => u.id === 'invader')!.damageTaken).toBe(2);
      const positive = c.evidence.positive[0]; if (positive.kind !== 'legal-trace@1') throw new Error('trace');
      const after = replayMacro(root, positive.actions).endpoint;
      expect(after.phase).toBe('playing'); expect(after.board.units.find(u => u.id === 'invader')!.damageTaken).toBe(2);
    }
  }));

  it('rejects continuing the winning-entry witness after canonical terminal', () => inRules(home, () => {
    const c = home.cases.find(c => c.kind === 'macro-decision' && c.homeFraming === 'invader')!;
    if (c.kind !== 'macro-decision') throw new Error('decision');
    const root = resolve(home, c.root.id).state;
    expect(() => replayTrace(root, [...witness(c, 'positive'), { type: 'END_ACTION_PHASE' }])).toThrow(/after first handoff or terminal/);
  }));
});
