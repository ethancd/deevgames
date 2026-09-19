/** 28 rescue + 28 invader framings with frozen Phasing classifications. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetUnitActions } from '../../../../src/game/board';
import { applyAction, transitionWithoutCheckmate } from '../../../../src/ai/simulate';
import { analyzeHomeDefenseEvidence } from '../../../../src/game/homeCheckmate';
import { getHomeOccupier } from '../../../../src/game/victory';
import { makePosition, positionRef, replayMacro, replayTrace } from './canonical';
import { validateSuiteDocument, type AIAction, type CanonicalCoverage, type GameState, type MacroDecision, type PlayerId, type PredicateSpec, type SuiteDocument } from './format';
import { validateAuthorEvidence, validateProvenance } from './predicates';
import { all, authorCorrections, authorInputs, buildBound, checkFrozen, common, compactAuthorEvidence, complete, diagram, EXPOSURE, facts, ledgerFor, other, probe, WORK, type HomeInput, type V2HomeHooks } from './tactics-home-author';

const PROOF_CAP = 20000;
const END_PREPARE: AIAction = { type: 'END_PLACE_PHASE' };
function invaderOf(input: HomeInput): PlayerId {
  const invader = input.units.find(u => u.id === 'invader');
  if (!invader) throw new Error('home diagram requires named invader');
  return invader.owner;
}
/** Open one actual entry lane. The only moved defender goes to the inward
 * diagonal: (1,1) for White home or (8,8) for Black home. Preserve every unit's
 * definition, damage, bank and flags. This is an explicit new authored diagram,
 * not a claim that the old fully occupied full-Act state was reachable. */
export function entryDiagram(input: HomeInput): { state: GameState; entry: AIAction; relocation: string | null } {
  const invader = invaderOf(input), state = diagram(input, invader, 'action', input.turnNumber);
  const unit = state.board.units.find(u => u.id === 'invader')!;
  const home = { ...unit.position }, step = home.x === 0 ? 1 : -1;
  const neighbors = [{ x: home.x + step, y: home.y }, { x: home.x, y: home.y + step }];
  const occupied = (q: { x: number; y: number }) => state.board.units.find(u => u.id !== unit.id && u.position.x === q.x && u.position.y === q.y);
  let stage = neighbors.find(q => !occupied(q));
  let relocation: string | null = null;
  if (!stage) {
    stage = neighbors[0];
    const blocker = occupied(stage)!;
    const diagonal = { x: home.x + step, y: home.y + step };
    if (occupied(diagonal)) throw new Error(`entry diagonal is occupied ${input.baseId}`);
    relocation = blocker.id; blocker.position = diagonal;
  }
  unit.position = stage;
  return { state, entry: { type: 'MOVE', unitId: unit.id, to: home }, relocation };
}
function requireDefense(state: GameState, invader: PlayerId, expected: 'rescue' | 'mate', id: string): void {
  if (!getHomeOccupier(state.board, invader)) throw new Error(`proof has no actual occupation ${id}`);
  const result = analyzeHomeDefenseEvidence(state, invader, transitionWithoutCheckmate, PROOF_CAP);
  if (result.result !== expected || result.cutoffReason !== null) throw new Error(`frozen home defense premise failed ${id}: ${JSON.stringify(result)}`);
  if (expected === 'rescue' && !result.witness?.length) throw new Error(`rescue lacks canonical witness ${id}`);
}

export function buildHomeMateSuite(hooks: V2HomeHooks = {}): SuiteDocument {
  const inputs = authorInputs().home;
  const corrections = authorCorrections();
  return buildBound(inputs[0].rules, binding => {
    const doc: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'home-mate', positions: [], cases: [] };
    for (const input of inputs) {
      const invader = invaderOf(input), defender = other(invader), oldRescue = `${input.baseId}-rescue`, rescueRow = ledgerFor(oldRescue);
      const defense: PredicateSpec = { kind: 'home-defense@1', at: 'root', invader, expected: input.expectedDefense, maxNodes: PROOF_CAP };
      if (input.expectedDefense === 'rescue') {
        // A declared post-Act Prepare diagram avoids the impossible full-own-Act
        // occupier root. The legal handoff performs the actual incoming reset.
        const seedState = diagram(input, invader, 'place', input.turnNumber);
        const seed = makePosition(`${rescueRow.id}-prepare-seed`, seedState, binding, { kind: 'authored-diagram', rationale: 'Explicit synthetic post-Act invader Prepare snapshot, with outgoing rent already settled and the original occupied-home geometry. This is not asserted reachable from an initial game. END_PLACE canonically creates the defender’s incoming Act, including healing/action reset only for the defender.' });
        const ready = replayMacro(seedState, [END_PREPARE]).endpoint;
        if (ready.phase !== 'playing' || ready.turn.currentPlayer !== defender || ready.turn.phase !== 'action') throw new Error(`rescue handoff not an incoming Act ${input.baseId}`);
        const root = makePosition(`${rescueRow.id}-root`, ready, binding, { kind: 'legal-prefix', seed: positionRef(seed), actions: [END_PREPARE], seedReachability: 'authored-diagram' });
        requireDefense(ready, invader, 'rescue', oldRescue);
        if (!input.witness?.length) throw new Error(`missing declared rescue witness ${oldRescue}`);
        const accept: PredicateSpec = { kind: 'target-removed@1', targetId: 'invader', cause: 'own-act-attack', survivingSides: [defender] };
        const positive = probe(complete(ready, input.witness), all(defense, accept));
        const negative = probe(complete(ready), facts([{ kind: 'unit', id: 'invader', present: true }, { kind: 'terminal', winner: invader }]));
        const c: MacroDecision = { ...common(rescueRow), kind: 'macro-decision', homeFraming: 'rescue', root: positionRef(root), work: WORK,
          horizon: { kind: 'first-handoff-or-terminal' }, terminalPolicy: 'predicate-only', accept,
          evidence: { positive: [positive], negative: [negative], rationale: 'The actual canonical incoming defender reset creates the declared four-AP rescue. A complete attack witness removes the invader; declining the rescue loses to occupation or upkeep elimination. This is a concrete rescue objective, not global move optimality.', exposure: EXPOSURE } };
        doc.positions.push(seed, root); doc.cases.push(c);
      } else {
        if (!corrections.homeCounterfactualPass.oldIds.includes(oldRescue)) throw new Error(`unmapped counterfactual pass correction ${oldRescue}`);
        rescueRow.rationale += ` ${corrections.homeCounterfactualPass.rationale}`;
        const state = diagram(input, defender, 'action', input.turnNumber);
        state.board = resetUnitActions(state.board, defender);
        const root = makePosition(`${rescueRow.id}-root`, state, binding, { kind: 'counterfactual-defense', rationale: 'Explicit hypothetical fresh defender Act against an already proved Phasing mate. Canonical adjudication would terminate before granting this turn; retained as structural coverage only. Reset only defender flags/damage and preserve the invader’s original damage.' });
        requireDefense(state, invader, 'mate', oldRescue);
        const positive = probe(complete(state), all(defense, facts([{ kind: 'terminal', winner: invader, reason: corrections.homeCounterfactualPass.expectedTerminalReason }])));
        const negative = { kind: 'legality@1' as const, action: { type: 'PROMOTE_UNIT' as const, unitId: 'defender-1' }, expected: false };
        const c: CanonicalCoverage = { ...common(rescueRow), kind: 'canonical-coverage', homeFraming: 'rescue', root: positionRef(root), engineReplay: { required: false }, probes: [positive, negative],
          evidence: { positive: [positive], negative: [negative], rationale: 'Canonical bounded proof must conclusively report mate, separately from playing this impossible granted defender turn. Its pass reaches the original invader’s start and wins by home-occupation. Banked promotion money and old placement flags do not create pre-Act promotion. No nonexistent rescue receives decision credit; classification was frozen before execution.', exposure: EXPOSURE } };
        doc.positions.push(root); doc.cases.push(c);
      }

      const oldInvader = `${input.baseId}-mate`, row = ledgerFor(oldInvader);
      const { state, entry, relocation } = entryDiagram(input);
      const root = makePosition(`${row.id}-root`, state, binding, { kind: 'authored-diagram', rationale: `Actual pre-entry Act diagram with invader on a free adjacent square. ${relocation ? `${relocation} is explicitly relocated from the entry square to the inward diagonal; this changes the diagram and is not a historical move claim.` : 'The original free entry lane needs no defender relocation.'} All unit definitions, banks, ordered army and invader damage are preserved. No initial-game reachability claim.` });
      // The analysis transition leaves an unadjudicated playing state. Prove on
      // that state, not on a terminal state whose phase alone could end DFS.
      const unadjudicated = transitionWithoutCheckmate(state, entry);
      if (unadjudicated === state) throw new Error(`illegal entry ${oldInvader}`);
      requireDefense(unadjudicated, invader, input.expectedDefense, oldInvader);
      const entered = applyAction(state, entry);
      const landing = makePosition(`${row.id}-after-entry`, entered, binding, { kind: 'legal-prefix', seed: positionRef(root), actions: [entry], seedReachability: 'authored-diagram' });
      const negative = probe(complete(state), facts([{ kind: 'game-phase', value: 'playing' }, { kind: 'unit', id: 'invader', present: true, position: state.board.units.find(u => u.id === 'invader')!.position }, { kind: 'turn', player: defender, phase: 'action', actionsRemaining: 4 }]));
      if (input.expectedDefense === 'mate') {
        if (!corrections.homeWinningEntry.oldIds.includes(oldInvader)) throw new Error(`unmapped entry timing correction ${oldInvader}`);
        if (entered.phase !== corrections.homeWinningEntry.expectedEntryPhase) throw new Error(`entry prematurely adjudicated ${oldInvader}`);
        row.rationale += ` ${corrections.homeWinningEntry.rationale}`;
        const fallback = facts([{ kind: 'terminal', winner: invader, reason: corrections.homeWinningEntry.expectedTerminalReason }]);
        // Keyed on the SHIPPED case id, which is what the v2 preregistration
        // names, not on the historical author id.
        const credited = hooks.invaderDecision?.(row.id, fallback, invader);
        if (credited) row.rationale += ` ${credited.rationale}`;
        const accept = credited?.accept ?? fallback;
        const positive = probe(complete(state, [entry]), accept);
        const c: MacroDecision = { ...common(row), kind: 'macro-decision', homeFraming: 'invader', root: positionRef(root), work: WORK,
          horizon: { kind: 'first-handoff-or-terminal' }, terminalPolicy: credited?.terminalPolicy ?? 'predicate-only', accept,
          evidence: { positive: [positive], negative: [negative], rationale: `Legal entry remains Act. After the invader mines and survives outgoing rent, settled Prepare wins by canonical home checkmate; quiet handoff does not. ${relocation} moves to the inward diagonal only in this newly authored pre-entry diagram. An independent bounded canonical proof on the unadjudicated occupied board must still conclude mate: the original attack-power or corner-rotation limit is rechecked, never assumed.`, exposure: EXPOSURE } };
        doc.cases.push(c);
      } else {
        const positive = probe(complete(state, [entry]), all({ kind: 'home-defense@1', at: 'endpoint', invader, expected: 'rescue', maxNodes: PROOF_CAP }, facts([{ kind: 'game-phase', value: 'playing' }, { kind: 'unit', id: 'invader', present: true }, { kind: 'damage', id: 'invader', value: { eq: input.units.find(u => u.id === 'invader')!.damageTaken } }, { kind: 'turn', player: defender, phase: 'action', actionsRemaining: 4 }])));
        // Confirm actual entry is a legal intermediate state, retaining its
        // damage; the complete probe above also proves outgoing rent survival.
        replayTrace(state, [entry]);
        const c: CanonicalCoverage = { ...common(row), kind: 'canonical-coverage', homeFraming: 'invader', root: positionRef(root), engineReplay: { required: true, work: WORK }, probes: [positive, negative],
          evidence: { positive: [positive], negative: [negative], rationale: `The canonical reply can remove this invader after legal entry and outgoing upkeep; quiet handoff leaves the home unoccupied. ${relocation ? `The entry blocker ${relocation} is moved diagonally in the authored seed and the reply proof is rederived.` : 'The original free lane is retained.'} A rescuable entry alone does not prove global strategic inferiority, so no decision preference is invented.`, exposure: EXPOSURE } };
        doc.cases.push(c);
      }
      doc.positions.push(root, landing);
    }
    checkFrozen(doc);
    const checked = validateSuiteDocument(doc);
    validateProvenance(checked);
    const byId = new Map(checked.positions.map(p => [p.id, p]));
    for (const c of checked.cases) {
      const result = validateAuthorEvidence(c, ref => byId.get(ref.id)!);
      if (result.status !== 'pass') throw new Error(`home author evidence ${c.id}: ${compactAuthorEvidence(result)}`);
    }
    return checked;
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out' || !args[1]) throw new Error('usage: build-home-mate.ts --out <fresh-output-path>');
  const document = buildHomeMateSuite();
  writeFileSync(resolve(args[1]), `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ family: document.family, cases: document.cases.length, positions: document.positions.length })}\n`);
}
