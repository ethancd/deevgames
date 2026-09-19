/** Canonical authored disruption/fortification inputs, never Hard-selected answers. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RULES } from '../../positions/corpus';
import { makePosition, positionRef, sha256, sourceBinding } from './canonical';
import type {
  AIAction, CanonicalCoverage, GameState, MacroDecision, PhasingCase,
  PlayerId, PredicateSpec, ProbeSpec, StateFact, SuiteDocument,
} from './format';

export const NEW_CANDIDATES_SHA = '86512dc5573b1283be2c4c28644ea28dadc0f6caaf83f5271cc31091e37b6b72';
const INPUT = fileURLToPath(new URL('./author-inputs/new-candidates-v1.json', import.meta.url));
const EXPOSURE = 'Original canonical authored candidates; M4 legality-only acceptance used these roots. Aggregate legality/undo/depth/cap counts were inspected, not strategic answers or per-root Hard choices. Classification and predicates derive from canonical witnesses before M5 scoring.';
interface Observation {
  gamePhase: GameState['phase']; turn: GameState['turn']; winner: GameState['winner'];
  victoryReason: GameState['victoryReason']; resources: Record<PlayerId, number>;
  upkeepPending: boolean; boardUnits: GameState['board']['units'];
  pendingSummons: NonNullable<GameState['pendingSummons']>;
  reserves?: number[][];
}
interface FrozenBranch {
  name: string; witnessActions: AIAction[];
  trace: { action: AIAction; observed: Observation }[];
  endpointState: GameState;
  legalityProbes: { action: AIAction; expected: boolean }[];
}
interface Candidate {
  id: string; family: 'SUMMON-DISRUPTION' | 'HOME-FORTIFY'; intent: string; tags: string[];
  seedDescription: string; seedState: GameState; setupActions: AIAction[]; rootState: GameState;
  legalityProbes: { action: AIAction; expected: boolean }[]; branches: FrozenBranch[];
}
const all = (...predicates: PredicateSpec[]): PredicateSpec => ({ kind: 'all@1', predicates });
const facts = (rows: StateFact[]): PredicateSpec => ({ kind: 'state-facts@1', at: 'endpoint', facts: rows });
const living = (): PredicateSpec => facts([
  { kind: 'game-phase', value: 'playing' },
  { kind: 'army-count', player: 'white', value: { min: 1 } },
  { kind: 'army-count', player: 'black', value: { min: 1 } },
]);
const ownWin = (player: PlayerId, reason?: GameState['victoryReason']): PredicateSpec => facts([
  { kind: 'game-phase', value: 'victory' }, { kind: 'terminal', winner: player, ...(reason ? { reason } : {}) },
]);
const quiet: AIAction[] = [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];

function observed(state: GameState): Observation {
  return { gamePhase: state.phase, turn: state.turn, winner: state.winner,
    victoryReason: state.victoryReason, resources: { white: state.players.white.resources, black: state.players.black.resources },
    upkeepPending: !!state.upkeepPending, boardUnits: state.board.units, pendingSummons: state.pendingSummons ?? [],
    reserves: state.board.cells.map(row => row.map(cell => cell.resourceLayers)) };
}

/** Expectations come from the pinned prior canonical record, not this build's execution. */
function recordedFacts(c: Candidate, end: Observation): PredicateSpec {
  const rows: StateFact[] = [{ kind: 'game-phase', value: end.gamePhase }];
  end.reserves?.forEach((row, y) => row.forEach((reserve, x) => rows.push({ kind: 'reserve', position: { x, y }, value: { eq: reserve } })));
  if (end.gamePhase === 'victory') rows.push({ kind: 'terminal', winner: end.winner, ...(end.victoryReason ? { reason: end.victoryReason } : {}) });
  else rows.push({ kind: 'turn', player: end.turn.currentPlayer, phase: end.turn.phase,
    actionsRemaining: end.turn.actionsRemaining, upkeepPending: end.upkeepPending });
  for (const player of ['white', 'black'] as const) {
    rows.push({ kind: 'bank', player, value: { eq: end.resources[player] } },
      { kind: 'army-count', player, value: { eq: end.boardUnits.filter(u => u.owner === player).length } },
      { kind: 'pending-count', player, value: { eq: end.pendingSummons.filter(p => p.owner === player).length } });
  }
  const ids = new Set([...c.rootState.board.units, ...end.boardUnits].map(u => u.id));
  for (const id of ids) {
    const unit = end.boardUnits.find(u => u.id === id);
    rows.push(unit ? { kind: 'unit', id, present: true, owner: unit.owner, definitionId: unit.definitionId, position: unit.position }
      : { kind: 'unit', id, present: false });
    if (unit) {
      rows.push({ kind: 'damage', id, value: { eq: unit.damageTaken } });
      for (const flag of ['hasMoved', 'hasAttacked', 'canActThisTurn', 'placedThisTurn', 'promotedThisPlacement'] as const)
        rows.push({ kind: 'unit-flag', id, flag, value: !!unit[flag] });
    }
  }
  const pendingIds = new Set([...(c.rootState.pendingSummons ?? []), ...end.pendingSummons].map(p => p.id));
  for (const id of pendingIds) {
    const pending = end.pendingSummons.find(p => p.id === id);
    rows.push(pending ? { kind: 'pending', id, present: true, owner: pending.owner, definitionId: pending.definitionId, position: pending.position, cost: pending.cost }
      : { kind: 'pending', id, present: false });
  }
  return facts(rows);
}

function completeWitness(c: Candidate, branch: FrozenBranch): { actions: AIAction[]; endpoint: Observation } {
  const i = branch.trace.findIndex(t => t.observed.gamePhase === 'victory'
    || t.observed.turn.currentPlayer !== c.rootState.turn.currentPlayer);
  if (i < 0) throw new Error(`${c.id}: no recorded complete macro in ${branch.name}`);
  return { actions: branch.witnessActions.slice(0, i + 1), endpoint: branch.trace[i].observed };
}
function branchCoverage(c: Candidate, branch: FrozenBranch): ProbeSpec {
  const conditions = [recordedFacts(c, observed(branch.endpointState))];
  for (const probe of branch.legalityProbes ?? []) conditions.push({ kind: 'action-legality@1', at: 'endpoint', action: probe.action, expected: probe.expected });
  // Explicit coverage may include the opponent's subsequent attack or mining.
  return { kind: 'legal-trace@1', actions: structuredClone(branch.witnessActions), endpoint: 'coverage-sequence', assert: all(...conditions) };
}
function resolution(c: Candidate, index: number, outcome: 'arrived' | 'disrupted'): PredicateSpec {
  const pending = c.rootState.pendingSummons?.[index];
  if (!pending) throw new Error(`${c.id}: missing bound root commitment ${index}`);
  return { kind: 'summon-resolution@1', commitment: { kind: 'root', id: pending.id }, player: pending.owner, outcome, window: 1 };
}
const decisionSD = new Set([1, 2, 3, 4, 5, 6, 7, 9, 10, 13, 14, 18, 28, 30]);
const decisionHF = new Set([1, 2, 3, 4, 8, 9]);
const positiveIndex: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 0, 5: 1, 6: 0, 7: 0, 9: 0, 10: 0, 13: 1, 14: 0, 18: 1, 28: 0, 30: 1 };

function decisionPredicate(c: Candidate, number: number): PredicateSpec {
  if (c.family === 'HOME-FORTIFY') return ownWin(c.rootState.turn.currentPlayer, 'home-checkmate');
  if (number === 14) return ownWin(c.rootState.turn.currentPlayer, 'elimination');
  if (number === 30) return all(living(), { kind: 'target-removed@1', targetId: 'invader', cause: 'own-act-attack', survivingIds: ['guard'], survivingSides: ['white', 'black'] });
  const result = [living(), resolution(c, 0, 'disrupted')];
  if (number === 7) result.push(resolution(c, 1, 'arrived'));
  if (number === 9) result.push(resolution(c, 1, 'disrupted'));
  if (number === 10) result.push(facts([{ kind: 'unit', id: 'fallback', present: true }]));
  return all(...result);
}

export function buildNewFamilies(inputFile = INPUT): [SuiteDocument, SuiteDocument] {
  const bytes = readFileSync(inputFile);
  if (sha256(bytes) !== NEW_CANDIDATES_SHA) throw new Error('New-family candidate input hash mismatch');
  const input = JSON.parse(bytes.toString()) as { schema: string; cases: Candidate[] };
  if (input.schema !== 'muju-m5-authored-candidates-v1' || input.cases.length !== 40 || new Set(input.cases.map(c => c.id)).size !== 40)
    throw new Error('New-family candidate inventory mismatch');
  const binding = sourceBinding(DEFAULT_RULES);
  // The pinned Phasing snapshots omit these two optional canonical fields.
  // Make their existing default meaning explicit for the strict new schema;
  // preserve phase/AP/units and replay every setup from the equally explicit seed.
  const explicitDefaults = (state: GameState): GameState => ({ ...structuredClone(state),
    victoryRule: state.victoryRule ?? 'home-or-elimination', inactivityRule: state.inactivityRule ?? 'on' });
  const disruption: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'summon-disruption', positions: [], cases: [] };
  const fortify: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'home-fortify', positions: [], cases: [] };
  for (const c of input.cases) {
    const doc = c.family === 'SUMMON-DISRUPTION' ? disruption : fortify;
    const number = Number(c.id.match(/-(?:SD|HF)-(\d+)-/)?.[1]);
    if (!Number.isInteger(number)) throw new Error(`Invalid candidate ID ${c.id}`);
    const seed = makePosition(`${c.id}-seed`, explicitDefaults(c.seedState), binding,
      { kind: 'authored-diagram', rationale: c.seedDescription });
    const root = makePosition(`${c.id}-root`, explicitDefaults(c.rootState), binding,
      { kind: 'legal-prefix', seed: positionRef(seed), actions: structuredClone(c.setupActions), seedReachability: 'authored-diagram' });
    doc.positions.push(seed, root);
    const coverage = c.branches.map(b => branchCoverage(c, b));
    coverage.push(...c.legalityProbes.map(p => ({ kind: 'legality@1' as const, action: p.action, expected: p.expected })));
    const common = {
      id: c.id, family: doc.family, rationale: c.intent, tags: [...c.tags, 'limited-canonical-objective'],
      authoredFrom: { id: c.id, revision: NEW_CANDIDATES_SHA, disposition: 'new' as const },
    };
    const isDecision = (doc === disruption ? decisionSD : decisionHF).has(number);
    let entry: PhasingCase;
    if (!isDecision) {
      entry = { ...common, kind: 'canonical-coverage', root: positionRef(root), probes: coverage,
        engineReplay: { required: false }, evidence: { positive: coverage, negative: [],
          rationale: 'Canonical timing, legality or control observations; no strategic preference or decision point is inferred from the witness.', exposure: EXPOSURE } } satisfies CanonicalCoverage;
    } else {
      const accept = decisionPredicate(c, number);
      const posIndex = doc === fortify ? 1 : positiveIndex[number];
      const positive = completeWitness(c, c.branches[posIndex]);
      const pos: ProbeSpec = { kind: 'legal-trace@1', actions: positive.actions, endpoint: 'first-handoff-or-terminal', assert: accept };
      let neg: ProbeSpec;
      if (doc === disruption && (number === 14 || number === 28)) {
        neg = { kind: 'legal-trace@1', actions: structuredClone(quiet), endpoint: 'first-handoff-or-terminal', assert: all(living(), resolution(c, 0, 'arrived')) };
      } else {
        const negative = completeWitness(c, c.branches[posIndex === 0 ? 1 : 0]);
        neg = { kind: 'legal-trace@1', actions: negative.actions, endpoint: 'first-handoff-or-terminal', assert: recordedFacts(c, negative.endpoint) };
      }
      entry = { ...common, kind: 'macro-decision', root: positionRef(root), work: 120_000,
        horizon: { kind: 'first-handoff-or-terminal' },
        terminalPolicy: doc === fortify || number === 14 ? 'allow-root-mover-win' : 'predicate-only', accept,
        evidence: { positive: [pos, ...coverage], negative: [neg], rationale:
          'The named complete canonical witness attains the stated limited objective and a separately declared complete control misses it. Other legal completions satisfying the same predicate are accepted. Full recorded coverage sequences additionally establish timing; they are not searched macros or best keys.', exposure: EXPOSURE },
      } satisfies MacroDecision;
    }
    doc.cases.push(entry);
  }
  if (disruption.cases.length !== 30 || fortify.cases.length !== 10) throw new Error('Family counts drifted');
  return [disruption, fortify];
}
