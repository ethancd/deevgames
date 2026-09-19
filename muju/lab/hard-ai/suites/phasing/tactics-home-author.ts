/** Author-only finite diagram inputs. No v1 loader, Hard result, or corpus access. */
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import type { Unit } from '../../../../src/game/types';
import { applyAction } from '../../../../src/ai/simulate';
import { isLegalAction, phaseEndAction } from '../../../../src/game/legality';
import { defaultUpkeepAction } from '../../../../src/game/upkeep';
import { isMacroEndpoint, replayMacro, semanticHash, sourceBinding, withRules } from './canonical';
import type { AIAction, GameState, PhasingCase, PlayerId, PredicateSpec, ProbeSpec, RulesBlock, SourceBinding, SuiteDocument } from './format';

export const AUTHOR_REVISION = '2026-09-19-author-v2-pre-scoring';
export const EXPOSURE = 'Original finite v1 suite inputs and the recorded canonical triage were read. Forty other new candidate positions were exposed to M4 legality/undo/cap/depth acceptance in the shared project; no recorded per-root Hard strategic choices were consulted for these definitions. No opening, sealed, validation, or strength outcomes were read.';
export const WORK = 120000;
interface Diagram {
  rules: RulesBlock; units: Unit[]; reserves: number[]; players: GameState['players'];
}
export interface TacticInput extends Diagram {
  oldId: string; id: string; rationale: string; sourceRationale: string; tags: string[];
  turn: GameState['turn']; upkeepPending: boolean; reviewUpkeep: GameState['reviewUpkeep'];
  inactivityPlies: number; progressThisTurn: boolean; witness: AIAction[] | null;
  timingAction?: AIAction; kind: 'macro-decision' | 'canonical-coverage'; disposition: 'replacement' | 'reauthored';
}
export interface HomeInput extends Diagram {
  baseId: string; turnNumber: number; expectedDefense: 'rescue' | 'mate'; witness: AIAction[] | null;
  entry: { action: AIAction; legal: boolean }[];
}
export interface LedgerRow {
  oldId: string; id: string; family: 'tactics' | 'home-mate'; kind: 'macro-decision' | 'canonical-coverage';
  disposition: 'replacement' | 'reauthored'; rationale: string; homeFraming?: 'rescue' | 'invader'; expectedDefense?: 'rescue' | 'mate';
}
export interface AuthorCorrections {
  schema: 'muju-phasing-tactics-home-author-corrections-v2'; revision: string;
  bankChanges: { oldId: string; player: PlayerId; from: number; to: number; rationale: string }[];
  homeCounterfactualPass: { oldIds: string[]; expectedTerminalReason: 'home-occupation'; rationale: string };
  homeWinningEntry: { oldIds: string[]; expectedEntryPhase: 'playing'; expectedTerminalReason: 'home-checkmate'; rationale: string };
}
const directory = new NodeURL('./author-inputs/', import.meta.url);
export function authorCorrections(): AuthorCorrections {
  const data = JSON.parse(readFileSync(new NodeURL('tactics-home-corrections-v2.json', directory), 'utf8'));
  if (data.schema !== 'muju-phasing-tactics-home-author-corrections-v2' || data.revision !== AUTHOR_REVISION || data.bankChanges.length !== 2 || data.homeCounterfactualPass.oldIds.length !== 12 || data.homeWinningEntry.oldIds.length !== 12) throw new Error('invalid pre-scoring correction ledger');
  return data;
}
export function authorInputs(): { tactics: TacticInput[]; home: HomeInput[] } {
  const data = JSON.parse(readFileSync(new NodeURL('tactics-home-diagrams-v1.json', directory), 'utf8'));
  if (data.schema !== 'muju-phasing-tactics-home-diagrams-v1' || data.tactics.length !== 79 || data.home.length !== 28) throw new Error('wrong finite author inventory');
  return data;
}
export function classification(): LedgerRow[] {
  const ledger = JSON.parse(readFileSync(new NodeURL('tactics-home-classification-v1.json', directory), 'utf8'));
  if (ledger.schema !== 'muju-phasing-tactics-home-author-classification-v1' || ledger.cases.length !== 135) throw new Error('wrong frozen classification ledger');
  return ledger.cases;
}
export function ledgerFor(oldId: string): LedgerRow {
  const found = classification().find(row => row.oldId === oldId);
  if (!found) throw new Error(`unmapped author ID ${oldId}`);
  return found;
}
/** Construct a new explicit Phasing diagram from finite authored components.
 * Historical full GameStates are not inputs to this function. */
export function diagram(input: Diagram, mover: PlayerId, phase: 'action' | 'place', turnNumber = 1): GameState {
  if (input.reserves.length !== 100) throw new Error('diagram requires 100 finite reserve cells');
  return {
    ruleset: 'phasing', actionsPerTurn: 4, blackCrystalHandicap: input.rules.handicap,
    victoryRule: input.rules.victoryRule, inactivityRule: input.rules.inactivityRule,
    pendingSummons: [], upkeepPending: false, reviewUpkeep: { white: false, black: false },
    inactivityPlies: 0, progressThisTurn: false, phase: 'playing', winner: null,
    board: { cells: Array.from({ length: 10 }, (_, y) => Array.from({ length: 10 }, (_, x) => ({ position: { x, y }, resourceLayers: input.reserves[y * 10 + x] }))), units: structuredClone(input.units), initialResourceLayers: [...input.reserves] },
    players: structuredClone(input.players), turn: { currentPlayer: mover, phase, actionsRemaining: phase === 'action' ? 4 : 0, turnNumber },
    selectedUnit: null, validMoves: [], validAttacks: [],
  };
}
export const other = (side: PlayerId): PlayerId => side === 'white' ? 'black' : 'white';
export const facts = (items: Extract<PredicateSpec, { kind: 'state-facts@1' }>['facts'], at: 'root' | 'endpoint' = 'endpoint'): PredicateSpec => ({ kind: 'state-facts@1', at, facts: items });
export const all = (...predicates: PredicateSpec[]): PredicateSpec => ({ kind: 'all@1', predicates });
export function complete(root: GameState, prefix: AIAction[] = []): AIAction[] {
  let state = root;
  const line: AIAction[] = [];
  for (const action of prefix) {
    if (isMacroEndpoint(root, state)) throw new Error('authored prefix continues after terminal/handoff');
    if (!isLegalAction(state, action)) throw new Error(`illegal authored prefix ${JSON.stringify(action)}`);
    const next = applyAction(state, action);
    if (semanticHash(state) === semanticHash(next)) throw new Error('authored prefix no-op');
    line.push(action); state = next;
  }
  for (let i = 0; !isMacroEndpoint(root, state) && i < 4; i++) {
    const action = state.upkeepPending ? defaultUpkeepAction(state, true) : phaseEndAction(state);
    if (!isLegalAction(state, action)) throw new Error('illegal completion');
    const next = applyAction(state, action);
    if (semanticHash(state) === semanticHash(next)) throw new Error('completion no-op');
    line.push(action); state = next;
  }
  replayMacro(root, line); // Fail closed; never emit incomplete witness actions.
  return line;
}
export const probe = (actions: AIAction[], assert: PredicateSpec, endpoint: 'intermediate' | 'first-handoff-or-terminal' = 'first-handoff-or-terminal'): ProbeSpec => ({ kind: 'legal-trace@1', actions, endpoint, assert });
export function buildBound<T>(rules: RulesBlock, build: (binding: SourceBinding) => T): T {
  const binding = sourceBinding(rules);
  // Author processes are sequential; explicitly install and restore this same known context.
  return withRules(binding, () => build(binding), binding);
}
export function checkFrozen(doc: SuiteDocument): void {
  const rows = classification().filter(row => row.family === doc.family);
  if (rows.length !== doc.cases.length) throw new Error('frozen family count changed');
  const seen = new Set<string>();
  for (const c of doc.cases) {
    const row = rows.find(r => r.id === c.id);
    if (!row || seen.has(c.id) || row.kind !== c.kind || row.oldId !== c.authoredFrom.id || row.disposition !== c.authoredFrom.disposition || row.homeFraming !== c.homeFraming) throw new Error(`frozen classification changed: ${c.id}`);
    seen.add(c.id);
  }
}
export function common(row: LedgerRow): Pick<PhasingCase, 'id' | 'family' | 'rationale' | 'tags' | 'authoredFrom'> {
  return { id: row.id, family: row.family, rationale: row.rationale, tags: ['phasing', row.family, row.kind], authoredFrom: { id: row.oldId, revision: AUTHOR_REVISION, disposition: row.disposition } };
}
/** Keep failed predicate facts, but never dump hundreds of full board frames. */
export function compactAuthorEvidence(value: unknown): string {
  const state = (s: GameState) => ({ phase: s.phase, winner: s.winner, reason: s.victoryReason, turn: s.turn, upkeepPending: !!s.upkeepPending,
    bank: { white: s.players.white.resources, black: s.players.black.resources },
    units: s.board.units.map(u => ({ id: u.id, owner: u.owner, definitionId: u.definitionId, position: u.position, damage: u.damageTaken })),
    pending: s.pendingSummons?.map(p => p.id) ?? [] });
  return JSON.stringify(value, (key, val) => key === 'trace' && val?.root && val?.endpoint
    ? { boundary: val.boundary, actionCount: val.steps.length, root: state(val.root), endpoint: state(val.endpoint) } : val);
}
