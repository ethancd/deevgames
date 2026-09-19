/** The v2 authoring lane: the re-authored release the free-win veto can pass.
 *
 * v1 is frozen. Nothing here reads, rewrites or reinterprets a v1 fixture; the
 * v1 builders still produce the v1 documents byte-identically when called with
 * no argument, and this module adds a SECOND composition beside them.
 *
 * What v2 changes, and why, is declared in
 * `author-inputs/new-candidates-v2.json` (byte-pinned like every other author
 * input) and in `docs/hard-ai/phasing/M5-FLOOR-PREREGISTRATION-v2.md`:
 *
 *  1. The nine summon-disruption roots on which the mover had an uncredited
 *     home-checkmate win are re-authored — eight by garrisoning the defender's
 *     own home corner with an inert Plant I, `M5-SD-28` by redesign, because its
 *     objective WAS the home entry and a garrison would remove the objective.
 *  2. Every disruption decision takes the intruder-survival horizon (one further
 *     pass-only hand-off) and must show, by canonical replay at that horizon,
 *     that the accepted answer is strictly better than the rejected one.
 *  3. The four two-lane tactics roots lose their free win the same way.
 *  4. The four multi-answer plugged tactics roots accept `any-of@1` over the
 *     canonically removable targets, recomputed here and refused on mismatch.
 *  5. The eight flagged home-mate invader roots credit the mover win the veto
 *     found, explicitly and per case.
 *  6. The invariants split into fifteen gating `search-gap` pairs at a fixed
 *     work per member and three non-gating diagnostics.
 *
 * Every expectation below is RE-DERIVED canonically in this process from the
 * shipped rules. No Hard engine, corpus, opening, sealed set or measured answer
 * is read anywhere in this file.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Unit } from '../../../../src/game/types';
import { applyAction } from '../../../../src/ai/simulate';
import { isLegalAction } from '../../../../src/game/legality';
import { getValidMoves } from '../../../../src/game/movement';
import { DEFAULT_RULES } from '../../positions/corpus';
import { continueHorizon, makePosition, positionRef, replayMacro, replayTrace, semanticHash, sha256, sourceBinding, withRules } from './canonical';
import { buildEconomy } from './build-economy';
import { buildInvariants } from './build-invariants';
import { buildHomeMateSuite } from './build-home-mate';
import { buildTacticsSuite } from './build-tactics';
import { NEW_CANDIDATES_SHA } from './build-new-families';
import { assertsIntruderSurvival, intruderPresentFact, intruderSurvivalHorizon } from './format';
import type {
  AIAction, CanonicalCoverage, Family, GameState, MacroDecision, PlayerId,
  Position, PredicateSpec, ProbeSpec, SourceBinding, StateFact, SuiteDocument,
} from './format';

const V1_INPUT = fileURLToPath(new URL('./author-inputs/new-candidates-v1.json', import.meta.url));
const V2_INPUT = fileURLToPath(new URL('./author-inputs/new-candidates-v2.json', import.meta.url));
const EXPOSURE = 'Original canonical authored candidates re-authored for v2. M4 legality-only acceptance used the v1 roots; aggregate legality/undo/depth/cap counts were inspected, not strategic answers or per-root Hard choices. Every v2 expectation is recomputed canonically at author time from the shipped rules, never from a measured Hard answer or a v1 outcome row.';

/* ------------------------------------------------------------------ inputs */

export interface V2DisruptionEdit {
  id: string; newId?: string; disposition: 'reauthored' | 'replacement';
  defect: string; fix: 'relocate-garrison' | 'add-garrison' | 'redesign' | 'horizon-only';
  intent?: string; tags?: string[];
  move?: { unitId: string; to: Position }[];
  add?: { id: string; definitionId: string; owner: PlayerId; position: Position }[];
  branches?: { name: string; witnessActions: AIAction[] }[];
  positiveBranch?: number;
  intruderId: string;
  measure: 'denied-arrival' | 'terminal-win' | 'avoided-loss';
}
export interface V2AuthorInput {
  schema: 'muju-m5-authored-candidates-v2'; revision: string;
  basedOn: { newCandidatesV1Sha256: string; note: string };
  rulesRevision: string;
  summonDisruption: { garrison: { definitionId: string; squareIsDefenderHomeCorner: boolean; rationale: string }; edits: V2DisruptionEdit[] };
  tactics: {
    twoLaneGarrison: { rationale: string; garrison: { id: string; definitionId: string; position: Position }; oldIds: string[] };
    multiAnswer: { rationale: string; cases: { oldId: string; targets: string[]; reason: string }[] };
    uniqueAnswer: { rationale: string; cases: { oldId: string; targets: string[]; reason: string }[] };
  };
  homeMate: { explicitlyCredited: { rationale: string; oldIds: string[]; acceptReasons: ('home-checkmate' | 'elimination')[] } };
  invariants: { work: number; gating: number[]; structural: number[]; diagnostic: { invariant: number; id: string; reason: string }[]; rationaleRecheck: string };
  economy: { reDerivation: string; changed: string[]; why: string };
  droppedCases: string[];
  notes: string;
}
export function v2AuthorInput(file = V2_INPUT): V2AuthorInput {
  const input = JSON.parse(readFileSync(file, 'utf8')) as V2AuthorInput;
  if (input.schema !== 'muju-m5-authored-candidates-v2') throw new Error('v2 author input schema mismatch');
  if (input.basedOn.newCandidatesV1Sha256 !== NEW_CANDIDATES_SHA) throw new Error('v2 author input names a different v1 candidate file');
  if (input.rulesRevision !== 'muju-phasing-2') throw new Error('v2 author input names a different rules revision');
  return input;
}

/* ---------------------------------------------------------- v1 candidates */

interface V1Branch { name: string; witnessActions: AIAction[] }
interface V1Candidate {
  id: string; family: 'SUMMON-DISRUPTION' | 'HOME-FORTIFY'; intent: string; tags: string[];
  seedDescription: string; seedState: GameState; setupActions: AIAction[];
  legalityProbes: { action: AIAction; expected: boolean }[]; branches: V1Branch[];
}
function v1Candidates(file = V1_INPUT): V1Candidate[] {
  const bytes = readFileSync(file);
  if (sha256(bytes) !== NEW_CANDIDATES_SHA) throw new Error('New-family candidate input hash mismatch');
  const input = JSON.parse(bytes.toString()) as { schema: string; cases: V1Candidate[] };
  if (input.schema !== 'muju-m5-authored-candidates-v1' || input.cases.length !== 40 || new Set(input.cases.map(c => c.id)).size !== 40)
    throw new Error('New-family candidate inventory mismatch');
  return input.cases;
}

/* ------------------------------------------------------------- predicates */

const all = (...predicates: PredicateSpec[]): PredicateSpec => ({ kind: 'all@1', predicates });
const endFacts = (rows: StateFact[]): PredicateSpec => ({ kind: 'state-facts@1', at: 'endpoint', facts: rows });
const living = (): PredicateSpec => endFacts([
  { kind: 'game-phase', value: 'playing' },
  { kind: 'army-count', player: 'white', value: { min: 1 } },
  { kind: 'army-count', player: 'black', value: { min: 1 } },
]);
const ownWin = (player: PlayerId, reason?: GameState['victoryReason']): PredicateSpec => endFacts([
  { kind: 'game-phase', value: 'victory' }, { kind: 'terminal', winner: player, ...(reason ? { reason } : {}) },
]);
const other = (side: PlayerId): PlayerId => side === 'white' ? 'black' : 'white';
const armyOf = (state: GameState, player: PlayerId): number => state.board.units.filter(u => u.owner === player).length;

/** The full canonical snapshot a recorded endpoint asserts. Re-derived here from
 * THIS build's replay rather than read from a frozen observation record, which
 * is the point of v2: a root that moved must not keep v1's expectations. */
function recordedFacts(root: GameState, end: GameState): PredicateSpec {
  const rows: StateFact[] = [{ kind: 'game-phase', value: end.phase }];
  end.board.cells.forEach((row, y) => row.forEach((cell, x) => rows.push({ kind: 'reserve', position: { x, y }, value: { eq: cell.resourceLayers } })));
  if (end.phase === 'victory') rows.push({ kind: 'terminal', winner: end.winner, ...(end.victoryReason ? { reason: end.victoryReason } : {}) });
  else rows.push({ kind: 'turn', player: end.turn.currentPlayer, phase: end.turn.phase, actionsRemaining: end.turn.actionsRemaining, upkeepPending: !!end.upkeepPending });
  for (const player of ['white', 'black'] as const) {
    rows.push({ kind: 'bank', player, value: { eq: end.players[player].resources } },
      { kind: 'army-count', player, value: { eq: armyOf(end, player) } },
      { kind: 'pending-count', player, value: { eq: (end.pendingSummons ?? []).filter(p => p.owner === player).length } });
  }
  for (const id of new Set([...root.board.units, ...end.board.units].map(u => u.id))) {
    const unit = end.board.units.find(u => u.id === id);
    rows.push(unit ? { kind: 'unit', id, present: true, owner: unit.owner, definitionId: unit.definitionId, position: unit.position }
      : { kind: 'unit', id, present: false });
    if (unit) {
      rows.push({ kind: 'damage', id, value: { eq: unit.damageTaken } });
      for (const flag of ['hasMoved', 'hasAttacked', 'canActThisTurn', 'placedThisTurn', 'promotedThisPlacement'] as const)
        rows.push({ kind: 'unit-flag', id, flag, value: !!unit[flag] });
    }
  }
  for (const id of new Set([...(root.pendingSummons ?? []), ...(end.pendingSummons ?? [])].map(p => p.id))) {
    const pending = (end.pendingSummons ?? []).find(p => p.id === id);
    rows.push(pending ? { kind: 'pending', id, present: true, owner: pending.owner, definitionId: pending.definitionId, position: pending.position, cost: pending.cost }
      : { kind: 'pending', id, present: false });
  }
  return endFacts(rows);
}

/* ----------------------------------------------------- summon-disruption */

const DECISION_SD = new Set([1, 2, 3, 4, 5, 6, 7, 9, 10, 13, 14, 18, 28, 30]);
const DECISION_HF = new Set([1, 2, 3, 4, 8, 9]);
const V2_POSITIVE_INDEX: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 0, 5: 1, 6: 0, 7: 0, 9: 0, 10: 0, 13: 1, 14: 0, 18: 1, 28: 0, 30: 1 };

const blankUnit = (u: { id: string; definitionId: string; owner: PlayerId; position: Position }): Unit => ({
  id: u.id, definitionId: u.definitionId, owner: u.owner, position: { ...u.position },
  hasMoved: false, hasAttacked: false, attackedThisTurn: [], lastAttackKilled: false,
  canActThisTurn: true, damageTaken: 0, placedThisTurn: false, promotedThisPlacement: false,
});

/** The candidate's seed with the declared v2 edits applied. Garrison edits are
 * applied to the SEED, so the root is re-derived by replaying the same authored
 * setup actions through canonical rules rather than patched after the fact. */
function editedSeed(candidate: V1Candidate, edit: V2DisruptionEdit | undefined): GameState {
  const state: GameState = { ...structuredClone(candidate.seedState),
    victoryRule: candidate.seedState.victoryRule ?? 'home-or-elimination',
    inactivityRule: candidate.seedState.inactivityRule ?? 'on' };
  for (const relocation of edit?.move ?? []) {
    const unit = state.board.units.find(u => u.id === relocation.unitId);
    if (!unit) throw new Error(`${candidate.id}: garrison relocation names no unit ${relocation.unitId}`);
    if (state.board.units.some(u => u.id !== unit.id && u.position.x === relocation.to.x && u.position.y === relocation.to.y))
      throw new Error(`${candidate.id}: garrison square is occupied`);
    unit.position = { ...relocation.to };
  }
  for (const addition of edit?.add ?? []) {
    if (state.board.units.some(u => u.id === addition.id)) throw new Error(`${candidate.id}: duplicate garrison id ${addition.id}`);
    if (state.board.units.some(u => u.position.x === addition.position.x && u.position.y === addition.position.y))
      throw new Error(`${candidate.id}: garrison square is occupied`);
    state.board.units.push(blankUnit(addition));
  }
  return state;
}

/** The mover's corner garrison must actually be the defender's own home square,
 * and it must be a body the mover cannot clear. Both are checked canonically. */
function assertGarrison(candidate: V1Candidate, edit: V2DisruptionEdit, root: GameState, definitionId: string): void {
  if (edit.fix !== 'relocate-garrison' && edit.fix !== 'add-garrison' && edit.fix !== 'redesign') return;
  const mover = root.turn.currentPlayer, defender = other(mover);
  const corner = defender === 'white' ? { x: 0, y: 0 } : { x: 9, y: 9 };
  const unit = root.board.units.find(u => u.position.x === corner.x && u.position.y === corner.y);
  if (!unit || unit.owner !== defender) throw new Error(`${candidate.id}: the defender's home corner is not garrisoned`);
  if (unit.definitionId !== definitionId) throw new Error(`${candidate.id}: garrison is ${unit.definitionId}, not the declared ${definitionId}`);
}

interface ReplayedBranch { name: string; actions: AIAction[]; states: GameState[]; endpoint: GameState }
function replayBranch(root: GameState, branch: V1Branch): ReplayedBranch {
  const trace = replayTrace(root, branch.witnessActions, 'coverage-sequence');
  return { name: branch.name, actions: structuredClone(branch.witnessActions), states: trace.steps.map(s => s.after), endpoint: trace.endpoint };
}
/** The prefix of a recorded branch that is exactly one complete macro. */
function completeWitness(candidate: V1Candidate, root: GameState, branch: ReplayedBranch): { actions: AIAction[]; endpoint: GameState } {
  const i = branch.states.findIndex(s => s.phase === 'victory' || s.turn.currentPlayer !== root.turn.currentPlayer);
  if (i < 0) throw new Error(`${candidate.id}: no complete macro in ${branch.name}`);
  return { actions: branch.actions.slice(0, i + 1), endpoint: branch.states[i] };
}

export function buildNewFamiliesV2(input: V2AuthorInput = v2AuthorInput()): [SuiteDocument, SuiteDocument] {
  const candidates = v1Candidates();
  const binding = sourceBinding(DEFAULT_RULES);
  const edits = new Map(input.summonDisruption.edits.map(e => [e.id, e]));
  const horizon = intruderSurvivalHorizon();
  const disruption: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'summon-disruption', positions: [], cases: [] };
  const fortify: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'home-fortify', positions: [], cases: [] };

  for (const candidate of candidates) {
    const doc = candidate.family === 'SUMMON-DISRUPTION' ? disruption : fortify;
    const number = Number(candidate.id.match(/-(?:SD|HF)-(\d+)-/)?.[1]);
    if (!Number.isInteger(number)) throw new Error(`Invalid candidate ID ${candidate.id}`);
    const isDecision = (doc === disruption ? DECISION_SD : DECISION_HF).has(number);
    const edit = edits.get(candidate.id);
    if (doc === disruption && isDecision && !edit) throw new Error(`v2 input declares no disposition for disruption decision ${candidate.id}`);
    if (edit && !isDecision) throw new Error(`v2 input edits a non-decision candidate ${candidate.id}`);

    const seedState = editedSeed(candidate, edit);
    const rootState = replayTrace(seedState, candidate.setupActions, 'coverage-sequence').endpoint;
    if (edit) assertGarrison(candidate, edit, rootState, input.summonDisruption.garrison.definitionId);
    const id = edit?.newId ?? candidate.id;
    const intent = edit?.intent ?? candidate.intent;
    const seed = makePosition(`${id}-seed`, seedState, binding, { kind: 'authored-diagram',
      rationale: `${candidate.seedDescription}${edit && edit.fix !== 'horizon-only' ? ` v2 re-authoring: ${edit.defect} ${input.summonDisruption.garrison.rationale}` : ''}` });
    const root = makePosition(`${id}-root`, rootState, binding,
      { kind: 'legal-prefix', seed: positionRef(seed), actions: structuredClone(candidate.setupActions), seedReachability: 'authored-diagram' });
    doc.positions.push(seed, root);

    const branchInputs: V1Branch[] = edit?.branches ?? candidate.branches.map(b => ({ name: b.name, witnessActions: b.witnessActions }));
    const branches = branchInputs.map(b => replayBranch(rootState, b));
    const coverage: ProbeSpec[] = branches.map(b => ({ kind: 'legal-trace@1', actions: structuredClone(b.actions), endpoint: 'coverage-sequence',
      assert: recordedFacts(rootState, b.endpoint) }));
    for (const probe of candidate.legalityProbes) {
      // Re-check the recorded expectation against the re-derived root: an edit
      // that changed a legality silently would otherwise ship v1's answer.
      if (isLegalAction(rootState, probe.action) !== probe.expected) throw new Error(`${id}: recorded legality probe no longer holds`);
      coverage.push({ kind: 'legality@1', action: probe.action, expected: probe.expected });
    }
    const common = { id, family: doc.family, rationale: intent,
      tags: [...(edit?.tags ?? candidate.tags), 'limited-canonical-objective', 'v2'],
      authoredFrom: { id: candidate.id, revision: input.revision, disposition: edit?.disposition ?? 'reauthored' as const } };

    if (!isDecision) {
      doc.cases.push({ ...common, kind: 'canonical-coverage', root: positionRef(root), probes: coverage, engineReplay: { required: false },
        evidence: { positive: coverage, negative: [],
          rationale: 'Canonical timing, legality or control observations, re-derived in this build; no strategic preference or decision point is inferred from the witness.', exposure: EXPOSURE } } satisfies CanonicalCoverage);
      continue;
    }

    const mover = rootState.turn.currentPlayer, defender = other(mover);
    const positiveIndex = edit?.positiveBranch ?? (doc === fortify ? 1 : V2_POSITIVE_INDEX[number]);
    const positive = completeWitness(candidate, rootState, branches[positiveIndex]);
    const caseHorizon = doc === fortify ? { kind: 'first-handoff-or-terminal' as const } : horizon;
    const negativeActions = doc === disruption && number === 14
      ? [{ type: 'END_ACTION_PHASE' } as AIAction, { type: 'END_PLACE_PHASE' } as AIAction]
      : completeWitness(candidate, rootState, branches[positiveIndex === 0 ? 1 : 0]).actions;
    const acceptedEnd = continueHorizon(replayMacro(rootState, positive.actions), caseHorizon).endpoint;
    const rejectedEnd = continueHorizon(replayMacro(rootState, negativeActions), caseHorizon).endpoint;

    let accept: PredicateSpec, rationale: string;
    if (doc === fortify) {
      accept = ownWin(mover, 'home-checkmate');
      rationale = 'The named complete canonical witness attains the declared fortification objective and a separately declared complete control misses it. The case credits the mover win explicitly through terminalPolicy allow-root-mover-win, so the free-win veto passes it by construction rather than by exemption.';
    } else {
      const survival = intruderPresentFact(edit!.intruderId, mover);
      const acceptedArmy = armyOf(acceptedEnd, defender), rejectedArmy = armyOf(rejectedEnd, defender);
      if (edit!.measure === 'denied-arrival') {
        if (acceptedEnd.phase !== 'playing') throw new Error(`${id}: a denied-arrival objective must leave a playing endpoint`);
        if (!acceptedEnd.board.units.some(u => u.id === edit!.intruderId && u.owner === mover)) throw new Error(`${id}: the intruder does not survive the accepted line`);
        if (rejectedArmy <= acceptedArmy) throw new Error(`${id}: the accepted line is not strictly better at the survival horizon (defender army ${acceptedArmy} vs ${rejectedArmy})`);
        const base: PredicateSpec[] = [living(), resolution(rootState, id, 0, 'disrupted')];
        if (number === 7) base.push(resolution(rootState, id, 1, 'arrived'));
        if (number === 9) base.push(resolution(rootState, id, 1, 'disrupted'));
        if (number === 10) base.push(endFacts([{ kind: 'unit', id: 'fallback', present: true }]));
        accept = all(...base, endFacts([survival, { kind: 'army-count', player: defender, value: { max: acceptedArmy } }]));
        rationale = `${intent} Scored at the intruder-survival horizon (one further pass-only hand-off): the commitment is denied, ${edit!.intruderId} is still on the board and still owned by ${mover}, and the opponent's tempo loss is real — its army at that horizon is ${acceptedArmy} in the accepted line against ${rejectedArmy} in the rejected one, so the accepted answer is strictly better on a stated measure and not merely equal on material plus bank.`;
      } else if (edit!.measure === 'terminal-win') {
        if (!(acceptedEnd.phase === 'victory' && acceptedEnd.winner === mover)) throw new Error(`${id}: the declared terminal win does not occur`);
        if (rejectedEnd.phase !== 'playing') throw new Error(`${id}: the rejected control is not a playing endpoint`);
        accept = all(ownWin(mover, 'elimination'), endFacts([survival]));
        rationale = `${intent} Scored at the intruder-survival horizon with the capturing body present at the endpoint. The measure here is terminal rather than tempo: the accepted line ends the game in the mover's favour while the rejected control leaves a playing position in which the defender's commitment arrives (defender army ${rejectedArmy}).`;
      } else {
        if (!(rejectedEnd.phase === 'victory' && rejectedEnd.winner === defender)) throw new Error(`${id}: the rejected control is not a canonical loss for the mover`);
        if (acceptedEnd.phase !== 'playing') throw new Error(`${id}: the accepted line is not a playing endpoint`);
        accept = all(living(), { kind: 'target-removed@1', targetId: 'invader', cause: 'own-act-attack', survivingIds: ['guard'], survivingSides: ['white', 'black'] }, endFacts([survival]));
        rationale = `${intent} Scored at the intruder-survival horizon with ${edit!.intruderId}, the body that clears the mover's own corner, present at the endpoint. The measure here is terminal rather than tempo: the rejected control is a canonical LOSS for the mover at this horizon, so equality on material plus bank cannot arise.`;
      }
    }

    const positiveProbe: ProbeSpec = { kind: 'legal-trace@1', actions: positive.actions, endpoint: 'first-handoff-or-terminal', assert: accept, horizon: caseHorizon };
    const negativeProbe: ProbeSpec = { kind: 'legal-trace@1', actions: structuredClone(negativeActions), endpoint: 'first-handoff-or-terminal', assert: recordedFacts(rootState, rejectedEnd), horizon: caseHorizon };
    const entry: MacroDecision = { ...common, kind: 'macro-decision', root: positionRef(root), work: 120_000, horizon: caseHorizon,
      terminalPolicy: doc === fortify || number === 14 ? 'allow-root-mover-win' : 'predicate-only', accept,
      evidence: { positive: [positiveProbe, ...coverage], negative: [negativeProbe],
        rationale: `${rationale} Other legal completions satisfying the same predicate are accepted. Full recorded coverage sequences additionally establish timing; they are not searched macros or best keys.`, exposure: EXPOSURE } };
    if (doc === disruption && !assertsIntruderSurvival(entry, edit!.intruderId, mover))
      throw new Error(`${id}: v2 disruption decision does not assert intruder survival`);
    doc.cases.push(entry);
  }
  if (disruption.cases.length !== 30 || fortify.cases.length !== 10) throw new Error('Family counts drifted');
  return [disruption, fortify];
}

function resolution(root: GameState, id: string, index: number, outcome: 'arrived' | 'disrupted'): PredicateSpec {
  const pending = root.pendingSummons?.[index];
  if (!pending) throw new Error(`${id}: missing bound root commitment ${index}`);
  return { kind: 'summon-resolution@1', commitment: { kind: 'root', id: pending.id }, player: pending.owner, outcome, window: 1 };
}

/* ------------------------------------------------------------ tactics v2 */

/** Every enemy body the mover can remove from this root by a complete own-Act
 * line, enumerated canonically over MOVE/ATTACK within the root's AP. This is
 * what decides whether a case has several equally valid answers; the declared
 * target set in the v2 input must equal it exactly. */
export function canonicallyRemovableTargets(root: GameState): string[] {
  const mover = root.turn.currentPlayer, removable = new Set<string>();
  const seen = new Set<string>([semanticHash(root)]);
  let frontier: GameState[] = [root];
  for (let depth = 0; depth < root.turn.actionsRemaining && frontier.length; depth++) {
    const next: GameState[] = [];
    for (const state of frontier) {
      if (state.phase !== 'playing' || state.turn.currentPlayer !== mover || state.turn.phase !== 'action') continue;
      const actions: AIAction[] = [];
      for (const unit of state.board.units.filter(u => u.owner === mover)) {
        for (const to of getValidMoves(unit, state.board)) actions.push({ type: 'MOVE', unitId: unit.id, to });
        for (const enemy of state.board.units.filter(u => u.owner !== mover)) actions.push({ type: 'ATTACK', unitId: unit.id, targetPosition: enemy.position });
      }
      for (const action of actions) {
        if (!isLegalAction(state, action)) continue;
        const after = applyAction(state, action), key = semanticHash(after);
        if (key === semanticHash(state) || seen.has(key)) continue;
        seen.add(key);
        for (const unit of state.board.units) if (unit.owner !== mover && !after.board.units.some(u => u.id === unit.id)) removable.add(unit.id);
        next.push(after);
      }
    }
    frontier = next;
  }
  return [...removable].sort();
}

export function buildTacticsSuiteV2(input: V2AuthorInput = v2AuthorInput()): SuiteDocument {
  const garrison = input.tactics.twoLaneGarrison, lanes = new Set(garrison.oldIds);
  const answers = new Map([...input.tactics.multiAnswer.cases, ...input.tactics.uniqueAnswer.cases].map(c => [c.oldId, c]));
  const multi = new Set(input.tactics.multiAnswer.cases.map(c => c.oldId));
  const seenLanes = new Set<string>(), seenAnswers = new Set<string>();
  const document = buildTacticsSuite({
    patchState(oldId, state) {
      if (!lanes.has(oldId)) return null;
      seenLanes.add(oldId);
      const corner = garrison.garrison.position;
      const defender = other(state.turn.currentPlayer);
      if (state.players[defender].startCorner.x !== corner.x || state.players[defender].startCorner.y !== corner.y)
        throw new Error(`${oldId}: the two-lane garrison square is not the defender's home corner`);
      if (state.board.units.some(u => u.position.x === corner.x && u.position.y === corner.y)) throw new Error(`${oldId}: two-lane garrison square is occupied`);
      state.board.units.push(blankUnit({ id: garrison.garrison.id, definitionId: garrison.garrison.definitionId, owner: defender, position: corner }));
      return garrison.rationale;
    },
    decisionAccept(oldId, state, fallback) {
      const declared = answers.get(oldId);
      if (!declared) return null;
      seenAnswers.add(oldId);
      const canonical = canonicallyRemovableTargets(state);
      if (JSON.stringify(canonical) !== JSON.stringify([...declared.targets].sort()))
        throw new Error(`${oldId}: declared targets ${declared.targets.join(',')} disagree with the canonical removable set ${canonical.join(',')}`);
      const branch = (targetId: string): PredicateSpec => ({ kind: 'target-removed@1', targetId, cause: 'own-act-attack', survivingSides: [state.turn.currentPlayer] });
      const accept: PredicateSpec = canonical.length > 1 ? { kind: 'any-of@1', predicates: canonical.map(branch) } : branch(canonical[0]);
      if (canonical.length === 1 && JSON.stringify(accept) !== JSON.stringify(fallback)) throw new Error(`${oldId}: single-answer accept drifted from the authored target`);
      return { accept, rationale: multi.has(oldId)
        ? `v2 multi-answer accept: ${declared.reason} The accept is an any-of@1 over the canonically removable targets ${canonical.join(', ')}; scoring one of several equally valid answers as the only correct answer is the v1 defect this removes.`
        : `v2 uniqueness argument: ${declared.reason} The canonical enumeration over this root's four AP removes only ${canonical.join(', ')}, so the single named target stands.` };
    },
  });
  if (seenLanes.size !== lanes.size) throw new Error('v2 two-lane garrison list names a case the tactics builder never built');
  if (seenAnswers.size !== answers.size) throw new Error('v2 plugged answer list names a case the tactics builder never built');
  return document;
}

/* ---------------------------------------------------------- home-mate v2 */

export function buildHomeMateSuiteV2(input: V2AuthorInput = v2AuthorInput()): SuiteDocument {
  const credited = new Set(input.homeMate.explicitlyCredited.oldIds), seen = new Set<string>();
  const reasons = input.homeMate.explicitlyCredited.acceptReasons;
  const document = buildHomeMateSuite({
    invaderDecision(oldId, fallback, invader) {
      if (!credited.has(oldId)) return null;
      seen.add(oldId);
      if (reasons.length < 2) throw new Error('an explicitly credited invader decision must name more than one canonical win');
      const branches: PredicateSpec[] = reasons.map(reason =>
        ({ kind: 'state-facts@1', at: 'endpoint', facts: [{ kind: 'terminal', winner: invader, reason }] }));
      // The v1 objective is WIDENED, never replaced: the authored home-checkmate
      // branch must still be one of the accepted answers.
      if (!branches.some(b => JSON.stringify(b) === JSON.stringify(fallback))) throw new Error(`${oldId}: the widened accept drops the authored home-checkmate answer`);
      const accept: PredicateSpec = { kind: 'any-of@1', predicates: branches };
      return { terminalPolicy: 'allow-root-mover-win', accept, rationale:
        `v2 explicit credit, decided per case: ${input.homeMate.explicitlyCredited.rationale} The canonical wins this accept credits are ${reasons.join(' and ')}.` };
    },
  });
  if (seen.size !== credited.size) throw new Error('v2 home-mate credit list names a case the home-mate builder never built');
  return document;
}

/* --------------------------------------------------------- the v2 lineup */

export function buildInvariantsV2(binding: SourceBinding, input: V2AuthorInput = v2AuthorInput()): SuiteDocument {
  const document = buildInvariants(binding, { work: input.invariants.work, diagnostic: input.invariants.diagnostic.map(d => d.invariant) });
  const gating = document.cases.filter(c => c.kind === 'invariant-pair' && c.classification === 'preference');
  const diagnostics = document.cases.filter(c => c.kind === 'invariant-pair' && c.classification === 'diagnostic');
  if (gating.length !== input.invariants.gating.length) throw new Error(`v2 invariants declare ${input.invariants.gating.length} gating pairs but built ${gating.length}`);
  if (diagnostics.length !== input.invariants.diagnostic.length) throw new Error('v2 invariants diagnostic count mismatch');
  for (const c of document.cases) if (c.kind === 'invariant-pair' && c.classification !== 'structural' && c.primaryMetric !== 'search-gap')
    throw new Error(`v2 invariant ${c.id} does not use the searched preference metric`);
  return document;
}

/** The six v2 family builders, in the shape `authorBundle` consumes. */
export function v2Builders(input: V2AuthorInput = v2AuthorInput()): Record<Family, (binding: SourceBinding) => SuiteDocument> {
  let families: [SuiteDocument, SuiteDocument] | null = null;
  const newFamilies = (): [SuiteDocument, SuiteDocument] => (families ??= buildNewFamiliesV2(input));
  return {
    tactics: () => buildTacticsSuiteV2(input),
    'home-mate': () => buildHomeMateSuiteV2(input),
    economy: binding => withRules(binding, () => buildEconomy(binding), binding),
    invariants: binding => withRules(binding, () => buildInvariantsV2(binding, input), binding),
    'summon-disruption': binding => withRules(binding, () => newFamilies()[0], binding),
    'home-fortify': binding => withRules(binding, () => newFamilies()[1], binding),
  };
}
