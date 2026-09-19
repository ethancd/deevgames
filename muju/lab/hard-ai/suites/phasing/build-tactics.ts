/** 79 fresh Phasing cases; five current-stat replacements and 16 timing probes.
 * Output generation is explicit. Canonical evidence, never Hard, chooses labels. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNextTierDefinition, getUnitDefinition } from '../../../../src/game/units';
import { makePosition, positionRef, replayTrace, replayMacro, sourceBinding, withRules } from './canonical';
import { validateSuiteDocument, type AIAction, type CanonicalCoverage, type MacroDecision, type PredicateSpec, type SuiteDocument } from './format';
import { validateAuthorEvidence, validateProvenance } from './predicates';
import { all, authorCorrections, authorInputs, buildBound, checkFrozen, common, compactAuthorEvidence, complete, diagram, EXPOSURE, facts, ledgerFor, other, probe, WORK, type TacticInput } from './tactics-home-author';

function replacement(input: TacticInput, state: ReturnType<typeof diagram>): AIAction[] {
  const target = state.board.units.find(u => u.id === 'u0')!;
  const hit = (unitId: string): AIAction => ({ type: 'ATTACK', unitId, targetPosition: { ...target.position } });
  if (input.oldId === 'tactics-three-lanes-metal_2-vs-metal_3') {
    target.damageTaken = 2;
    return ['u1', 'u2', 'u3'].map(hit);
  }
  target.definitionId = 'water_3';
  target.damageTaken = input.oldId === 'tactics-chipped-metal_2-vs-fire_3' ? 2 : 0;
  if (input.oldId === 'tactics-two-lane-approach-metal_2-vs-fire_3') return [
    { type: 'MOVE', unitId: 'u1', to: { x: 4, y: 5 } }, hit('u1'),
    { type: 'MOVE', unitId: 'u2', to: { x: 6, y: 5 } }, hit('u2'),
  ];
  return input.oldId === 'tactics-chipped-metal_2-vs-fire_3' ? [hit('u1')] : [hit('u1'), hit('u2')];
}

export function buildTacticsSuite(): SuiteDocument {
  const inputs = authorInputs().tactics;
  const corrections = authorCorrections();
  return buildBound(inputs[0].rules, binding => {
    const doc: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'tactics', positions: [], cases: [] };
    for (const input of inputs) {
      const positionBinding = sourceBinding(input.rules);
      withRules(positionBinding, () => {
        const row = ledgerFor(input.oldId);
        const state = diagram(input, input.turn.currentPlayer, input.kind === 'macro-decision' ? 'action' : 'place', input.turn.turnNumber);
        const funding = corrections.bankChanges.find(c => c.oldId === input.oldId);
        if (funding) {
          if (state.players[funding.player].resources !== funding.from) throw new Error(`funding source drift ${input.oldId}`);
          state.players[funding.player].resources = funding.to;
          row.rationale += ` ${funding.rationale}`;
        }
        state.upkeepPending = input.upkeepPending; state.reviewUpkeep = structuredClone(input.reviewUpkeep);
        state.inactivityPlies = input.inactivityPlies; state.progressThisTurn = input.progressThisTurn;
        if (input.kind === 'macro-decision') state.turn.actionsRemaining = input.turn.actionsRemaining;
        const witness = input.disposition === 'replacement' ? replacement(input, state) : input.witness;
        const position = makePosition(`${row.id}-root`, state, positionBinding, { kind: 'authored-diagram', rationale: `${row.rationale} Fresh explicit Phasing diagram reconstructed from finite unit/cash/reserve components; no claim of initial-game reachability. Historical whole-turn keys are discarded.` });
        doc.positions.push(position);
        if (input.kind === 'macro-decision') {
          if (!witness?.length) throw new Error(`missing declared witness ${input.oldId}`);
          const accept: PredicateSpec = { kind: 'target-removed@1', targetId: 'u0', cause: 'own-act-attack', survivingSides: [state.turn.currentPlayer] };
          const positive = probe(complete(state, witness), accept);
          const negative = probe(complete(state), facts([{ kind: 'unit', id: 'u0', present: true }]));
          const c: MacroDecision = { ...common(row), kind: 'macro-decision', root: positionRef(position), work: WORK,
            horizon: { kind: 'first-handoff-or-terminal' }, terminalPolicy: 'predicate-only', accept,
            evidence: { positive: [positive], negative: [negative], rationale: 'A complete canonical own-Act attack removes the named target; a complete quiet alternative retains it. This is the limited target-removal objective, not a claim of global optimality or exhaustive macro enumeration.', exposure: EXPOSURE } };
          doc.cases.push(c);
        } else {
          const action = input.timingAction;
          if (!action || (action.type !== 'BUY_UNIT' && action.type !== 'PROMOTE_UNIT')) throw new Error(`missing timing action ${input.oldId}`);
          const after = replayTrace(state, [action]).endpoint;
          const target = state.board.units.find(u => u.owner !== state.turn.currentPlayer)!;
          const turn = facts([{ kind: 'turn', player: state.turn.currentPlayer, phase: 'place', actionsRemaining: 0, upkeepPending: false }, { kind: 'unit', id: target.id, present: true }]);
          let effect: PredicateSpec, impossible: AIAction;
          if (action.type === 'PROMOTE_UNIT') {
            const before = state.board.units.find(u => u.id === action.unitId)!;
            effect = facts([{ kind: 'unit', id: before.id, present: true, definitionId: getNextTierDefinition(before.definitionId)!.id }, { kind: 'unit-flag', id: before.id, flag: 'promotedThisPlacement', value: true }, { kind: 'bank', player: before.owner, value: { eq: state.players[before.owner].resources - (getNextTierDefinition(before.definitionId)!.cost - getUnitDefinition(before.definitionId).cost) } }]);
            impossible = { type: 'ATTACK', unitId: before.id, targetPosition: target.position };
          } else {
            const pending = after.pendingSummons!.find(p => !state.pendingSummons!.some(old => old.id === p.id));
            if (!pending) throw new Error('buy failed to create its distinct public commitment');
            effect = facts([{ kind: 'pending', id: pending.id, present: true, owner: state.turn.currentPlayer, definitionId: action.definitionId, position: action.position, cost: getUnitDefinition(action.definitionId).cost }, { kind: 'unit', id: pending.id, present: false }, { kind: 'army-count', player: state.turn.currentPlayer, value: { eq: state.board.units.filter(u => u.owner === state.turn.currentPlayer).length } }]);
            impossible = { type: 'ATTACK', unitId: pending.id, targetPosition: target.position };
          }
          const positive = probe([action], all(turn, effect, { kind: 'action-legality@1', at: 'endpoint', action: impossible, expected: false }), 'intermediate');
          const completeLine = complete(state, [action]);
          const endpoint = replayMacro(state, completeLine).endpoint;
          if (endpoint.phase !== 'playing') throw new Error('timing coverage unexpectedly terminal');
          const handoff = probe(completeLine, all(effect, facts([{ kind: 'turn', player: other(state.turn.currentPlayer), phase: 'action', actionsRemaining: 4, upkeepPending: false }, { kind: 'unit', id: target.id, present: true }])));
          // The post-action state is a referenced canonical prefix, so the new
          // commitment/promotion is itself tested for inability to attack now.
          const postPosition = makePosition(`${row.id}-after-prepare-action`, after, positionBinding, { kind: 'legal-prefix', seed: positionRef(position), actions: [action], seedReachability: 'authored-diagram' });
          doc.positions.push(postPosition);
          // The endpoint predicate tests the actual promoted unit or newly
          // created commitment, rather than only an absent pre-purchase ID.
          const c: CanonicalCoverage = { ...common(row), kind: 'canonical-coverage', root: positionRef(position), engineReplay: { required: true, work: WORK }, probes: [positive, handoff],
            evidence: { positive: [positive, handoff], negative: [{ kind: 'legality@1', action: impossible, expected: false }], rationale: 'Prepare keeps zero AP. Promotion changes the live tier only; purchase adds escrow, never a live attacker. END_PLACE hands to the opponent’s full Act. No same-turn kill or unproved future preference receives decision credit.', exposure: EXPOSURE } };
          doc.cases.push(c);
        }
      }, binding);
    }
    checkFrozen(doc);
    const checked = validateSuiteDocument(doc);
    validateProvenance(checked);
    const byId = new Map(checked.positions.map(p => [p.id, p]));
    for (const c of checked.cases) {
      if (c.kind === 'invariant-pair') throw new Error('unexpected tactics pair');
      const result = withRules(byId.get(c.root.id)!.binding, () => validateAuthorEvidence(c, ref => byId.get(ref.id)!), binding);
      if (result.status !== 'pass') throw new Error(`tactics author evidence ${c.id}: ${compactAuthorEvidence(result)}`);
    }
    return checked;
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out' || !args[1]) throw new Error('usage: build-tactics.ts --out <fresh-output-path>');
  const document = buildTacticsSuite();
  writeFileSync(resolve(args[1]), `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ family: document.family, cases: document.cases.length, positions: document.positions.length })}\n`);
}
