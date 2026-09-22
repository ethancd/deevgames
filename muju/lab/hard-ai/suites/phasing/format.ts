/** Versioned, canonical Phasing authoring contract. Historical v1 is separate. */
import type { AIAction } from '../../../../src/ai/types';
import type { GameState, PlayerId, Position } from '../../../../src/game/types';
import type { RulesBlock } from '../../positions/corpus';
import { z } from 'zod';
import { getUnitDefinition } from '../../../../src/game/units';
import { boundaryOf, hashJson, positionRef, RULES_VERSIONS, verifySourceBinding } from './canonical';
import type { RulesVersion } from './canonical';

export type { AIAction, GameState, PlayerId, Position, RulesBlock };
export const FAMILIES = ['tactics', 'invariants', 'home-mate', 'economy', 'summon-disruption', 'home-fortify'] as const;
export type Family = typeof FAMILIES[number];
/** Every Phasing rules revision a suite document may be authored under.
 *
 * This was the literal `'muju-phasing-1'`, both here and in the zod schema
 * below, which made a v2 document inexpressible: v2 is authored under
 * `muju-phasing-2` (the 20-ply inactivity clock, reset only by a capture). The
 * list is widened so BOTH still PARSE — the frozen v1 documents must keep
 * loading byte-identically — while `verifySourceBinding` still demands that a
 * document's recorded revision be the one this worktree implements. A v1
 * document therefore parses here and fails verification, which is the intended
 * split and is exactly what the v2 preregistration says to expect. */
export { RULES_VERSIONS, CURRENT_RULES_VERSION } from './canonical';
export type { RulesVersion } from './canonical';
export interface SourceBinding {
  ruleset: 'phasing'; rulesVersion: RulesVersion; rules: RulesBlock;
  rulesSourcesSha256: string; catalogueSha256: string;
}
export interface Boundary {
  kind: 'act' | 'prepare' | 'terminal'; currentPlayer: PlayerId;
  actionsRemaining: number; upkeepPending: boolean;
}
export interface PositionRef { id: string; sha256: string }
export interface PhasingPosition {
  schema: 'muju-phasing-position-v1'; id: string; binding: SourceBinding;
  boundary: Boundary; state: GameState;
  origin:
    | { kind: 'authored-diagram'; rationale: string }
    | { kind: 'legal-prefix'; seed: PositionRef; actions: AIAction[]; seedReachability: 'authored-diagram' | 'initial-game' }
    | { kind: 'counterfactual-defense'; rationale: string };
}
export type Compare = { eq: number } | { min: number } | { max: number };
export type StateFact =
  | { kind: 'unit'; id: string; present: boolean; owner?: PlayerId; definitionId?: string; position?: Position }
  | { kind: 'pending'; id: string; present: boolean; owner?: PlayerId; definitionId?: string; position?: Position; cost?: number }
  | { kind: 'army-count'; player: PlayerId; value: Compare }
  | { kind: 'pending-count' | 'spawn-area'; player: PlayerId; value: Compare }
  | { kind: 'mobility-count' | 'unit-attack-count'; unitId: string; value: Compare }
  | { kind: 'inactivity-plies'; value: Compare }
  | { kind: 'game-phase'; value: GameState['phase'] }
  | { kind: 'bank'; player: PlayerId; value: Compare }
  | { kind: 'reserve'; position: Position; value: Compare }
  | { kind: 'turn'; player: PlayerId; phase: 'action' | 'place'; actionsRemaining?: number; upkeepPending?: boolean }
  | { kind: 'terminal'; winner: PlayerId | null; reason?: GameState['victoryReason'] }
  | { kind: 'unit-flag'; id: string; flag: 'hasMoved' | 'hasAttacked' | 'canActThisTurn' | 'placedThisTurn' | 'promotedThisPlacement' | 'lastAttackKilled'; value: boolean }
  | { kind: 'damage'; id: string; value: Compare };
export type LedgerMetric = 'bank' | 'mined' | 'upkeep' | 'refund' | 'commitmentSpent' | 'promotionSpent' | 'incomeWindows';
export interface LedgerFact { player: PlayerId; metric: LedgerMetric; value: Compare; /** Only mined supports a root-bound individual miner. */ unitId?: string }
export type CommitmentSelector = { kind: 'root'; id: string } | { kind: 'buy-event'; /** Zero-based action index in the full canonical trace. */ actionIndex: number; owner: PlayerId; definitionId: string; position: Position };
export type PredicateSpec =
  | { kind: 'all@1'; predicates: PredicateSpec[] }
  /** Multi-answer accept: several canonically correct answers, any one of which
   * scores. Authored for tactics positions with equally valid targets, where v1
   * scored one of them as if it were the only correct answer. An any-of is only
   * indeterminate when no branch passes and at least one is indeterminate. */
  | { kind: 'any-of@1'; predicates: PredicateSpec[] }
  | { kind: 'action-legality@1'; at: 'root' | 'endpoint'; action: AIAction; expected: boolean }
  | { kind: 'state-facts@1'; at: 'root' | 'endpoint'; facts: StateFact[] }
  | { kind: 'target-removed@1'; targetId: string; cause?: 'own-act-attack'; survivingIds?: string[]; survivingSides?: PlayerId[] }
  | { kind: 'summon-resolution@1'; commitment: CommitmentSelector; outcome: 'arrived' | 'disrupted'; player: PlayerId; /** One-based arrival window for this player, not turn number. */ window?: number }
  | { kind: 'economy-ledger@1'; surviveThroughout: PlayerId[]; facts: LedgerFact[] }
  | { kind: 'home-defense@1'; at: 'root' | 'endpoint'; invader: PlayerId; expected: 'mate' | 'rescue'; maxNodes: number }
  /** Structural budget behavior only; forbidden in strategic decision/preference predicates. */
  | { kind: 'home-proof-budget@1'; at: 'root' | 'endpoint'; invader: PlayerId; expected: 'unknown'; maxNodes: number };
export type Horizon = { kind: 'first-handoff-or-terminal' } | { kind: 'scripted'; policy: 'pass-only@1'; additionalHandoffs: number; homeFirst: boolean };
export type ProbeSpec =
  | { kind: 'legal-trace@1'; actions: AIAction[]; endpoint: 'intermediate' | 'first-handoff-or-terminal' | 'coverage-sequence'; assert: PredicateSpec; horizon?: Horizon }
  | { kind: 'legality@1'; action: AIAction; expected: boolean }
  | { kind: 'resolve-batch@1'; player: PlayerId; assert: PredicateSpec };
export type EvidenceProbe = ProbeSpec & { member?: 'violating' | 'correct' };
export interface AuthorEvidence {
  /** Concrete canonical witness/probe, independent of measured Hard choice. */ positive: EvidenceProbe[];
  /** Required for decisions; counterexample must fail the decision predicate. */ negative: EvidenceProbe[];
  rationale: string;
  exposure: string;
}
export interface CommonCase {
  id: string; family: Family; rationale: string; tags: string[];
  authoredFrom: { id: string; revision: string; disposition: 'reauthored' | 'replacement' | 'new' };
  evidence: AuthorEvidence;
  /** Mandatory rescue/invader partition for home-mate. */ homeFraming?: 'rescue' | 'invader';
}
export interface MacroDecision extends CommonCase {
  kind: 'macro-decision'; root: PositionRef; work: number; horizon: Horizon;
  terminalPolicy: 'predicate-only' | 'allow-root-mover-win'; accept: PredicateSpec;
}
export interface CanonicalCoverage extends CommonCase {
  kind: 'canonical-coverage'; root: PositionRef; probes: ProbeSpec[];
  engineReplay: { required: false } | { required: true; work: number };
}
export interface InvariantPair extends CommonCase {
  kind: 'invariant-pair'; family: 'invariants'; invariant: number;
  violating: PositionRef; correct: PositionRef; perspective: PlayerId;
  premise: { violating: PredicateSpec; correct: PredicateSpec };
  probes?: { violating: ProbeSpec[]; correct: ProbeSpec[] };
  /** How the pair participates in the floor.
   * - `preference` gates: it offers one point and the primary metric must be
   *   strictly positive for the correct member.
   * - `diagnostic` is measured and reported at the same fixed work, and its
   *   premises still have to hold, but it OFFERS ZERO POINTS: the metric is
   *   recorded on the case result and never converted into a pass/fail
   *   predicate, so a pair whose own rationale refuses to claim a strict
   *   preference cannot gate a release.
   * - `structural` carries no metric at all and earns nothing. */
  classification: 'preference' | 'structural' | 'diagnostic';
  primaryMetric: 'eval-gap' | 'search-gap' | 'none';
  /** The fixed work a `search-gap` metric is measured at, per member. Required
   * for search-gap (preference or diagnostic); optional for a searched
   * eval-gap pair that also wants a reported search reading. */ work?: number;
}
export type PhasingCase = MacroDecision | CanonicalCoverage | InvariantPair;
export interface SuiteDocument {
  schema: 'muju-phasing-suite-v1'; family: Family; positions: PhasingPosition[]; cases: PhasingCase[];
}

/** The minimum intruder-survival continuation the v2 summon-disruption family
 * requires: one further pass-only hand-off past the mover's macro endpoint, so
 * a raider that disrupts a commitment and is then released by its own upkeep,
 * or answered, no longer scores. */
export const INTRUDER_SURVIVAL_HANDOFFS = 1;
export const intruderSurvivalHorizon = (homeFirst = true, additionalHandoffs: number = INTRUDER_SURVIVAL_HANDOFFS): Horizon =>
  ({ kind: 'scripted', policy: 'pass-only@1', additionalHandoffs, homeFirst });
/** The endpoint fact that makes the horizon load-bearing: the named intruder is
 * still on the board, still owned by the raider, once the horizon has run. */
export const intruderPresentFact = (unitId: string, owner: PlayerId): StateFact =>
  ({ kind: 'unit', id: unitId, present: true, owner });
export const hasIntruderSurvivalHorizon = (c: MacroDecision): boolean =>
  c.horizon.kind === 'scripted' && c.horizon.policy === 'pass-only@1' && c.horizon.additionalHandoffs >= INTRUDER_SURVIVAL_HANDOFFS;
/** Does this predicate demand the named unit at the endpoint on every branch it
 * can accept on? An `all@1` needs one such conjunct; an `any-of@1` needs the
 * fact in EVERY branch, or the multi-answer accept would have a branch that
 * scores a raid whose intruder is gone. */
export function requiresUnitAtEndpoint(p: PredicateSpec, unitId: string, owner?: PlayerId): boolean {
  if (p.kind === 'all@1') return p.predicates.some(child => requiresUnitAtEndpoint(child, unitId, owner));
  if (p.kind === 'any-of@1') return p.predicates.length > 0 && p.predicates.every(child => requiresUnitAtEndpoint(child, unitId, owner));
  return p.kind === 'state-facts@1' && p.at === 'endpoint'
    && p.facts.some(f => f.kind === 'unit' && f.id === unitId && f.present && (owner === undefined || f.owner === owner));
}
/** The v2 summon-disruption authoring rule, as a checkable predicate. It is
 * deliberately NOT enforced inside validateSuiteDocument: the v1 documents must
 * keep loading byte-identically, and no v1 disruption case carries it. A v2
 * builder calls this per case instead. */
export const assertsIntruderSurvival = (c: MacroDecision, unitId: string, owner: PlayerId): boolean =>
  hasIntruderSurvivalHorizon(c) && requiresUnitAtEndpoint(c.accept, unitId, owner);

const text = z.string().min(1), side = z.enum(['white', 'black']);
const integer = z.number().int().nonnegative(), amount = z.number().finite().nonnegative();
const square = z.object({ x: integer.max(9), y: integer.max(9) }).strict();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const definition = text.refine(id => { try { getUnitDefinition(id); return true; } catch { return false; } }, 'unknown canonical definition');
const ref = z.object({ id: text, sha256: sha }).strict();
const comparison = z.union([z.object({ eq: z.number().finite() }).strict(), z.object({ min: z.number().finite() }).strict(), z.object({ max: z.number().finite() }).strict()]);
const rules = z.object({ elementGraph: z.enum(['double-thick', 'dual-triangle', 'rush-edge-only', 'none']), upkeep: z.enum(['shipped', 'steep', 'off']), inactivityRule: z.enum(['on', 'off']), victoryRule: z.enum(['elimination', 'home-or-elimination']), handicap: integer.max(20), combatHandicap: z.object({ white: z.number().int(), black: z.number().int() }).strict() }).strict();
const binding = z.object({ ruleset: z.literal('phasing'), rulesVersion: z.enum(RULES_VERSIONS), rules, rulesSourcesSha256: sha, catalogueSha256: sha }).strict();
const unit = z.object({ id: text, definitionId: definition, owner: side, position: square, hasMoved: z.boolean(), hasAttacked: z.boolean(), canActThisTurn: z.boolean(), damageTaken: integer, promotedThisPlacement: z.boolean().optional(), placedThisTurn: z.boolean().optional(), attackedThisTurn: z.array(text).optional(), lastAttackKilled: z.boolean().optional() }).strict();
const pending = z.object({ id: text, definitionId: definition, owner: side, position: square, cost: amount }).strict();
const player = z.object({ id: side, resources: amount, startCorner: square, resourcesGained: amount, resourcesUpkeep: amount.optional() }).strict();
// 'kill-clock' added 2026-09-22 (muju-phasing-3, the KILL CLOCK); 'inactivity'
// stays for archived muju-phasing-1/-2 authored evidence.
const reason = z.enum(['elimination', 'home-occupation', 'home-checkmate', 'resignation', 'inactivity', 'kill-clock', 'upkeep-elimination', 'timeout', 'abandoned']);
const state = z.object({
  ruleset: z.literal('phasing'), actionsPerTurn: z.literal(4), blackCrystalHandicap: integer,
  pendingSummons: z.array(pending), lastSummoning: z.object({ player: side, turnNumber: integer, summoned: z.array(pending), disrupted: z.array(pending) }).strict().optional(),
  lastIncome: z.object({ player: side, turnNumber: integer, total: amount, takes: z.array(z.object({ unitId: text, definitionId: definition, position: square, amount }).strict()) }).strict().optional(),
  lastUpkeep: z.object({ player: side, turnNumber: integer, paid: amount, released: z.array(z.object({ id: text, definitionId: definition, tier: integer.min(1).max(3) }).strict()) }).strict().optional(),
  victoryRule: z.enum(['elimination', 'home-or-elimination']), inactivityRule: z.enum(['on', 'off']), victoryReason: reason.optional(),
  upkeepPending: z.boolean().optional(), reviewUpkeep: z.object({ white: z.boolean().optional(), black: z.boolean().optional() }).strict().optional(), inactivityPlies: integer.optional(), progressThisTurn: z.boolean().optional(),
  phase: z.enum(['playing', 'victory']), board: z.object({ cells: z.array(z.array(z.object({ position: square, resourceLayers: integer }).strict()).length(10)).length(10), units: z.array(unit), initialResourceLayers: z.array(integer).length(100).optional() }).strict(),
  players: z.object({ white: player, black: player }).strict(), turn: z.object({ currentPlayer: side, phase: z.enum(['action', 'place']), actionsRemaining: integer.max(4), turnNumber: integer }).strict(), winner: side.nullable(), selectedUnit: text.nullable(), validMoves: z.array(square), validAttacks: z.array(square),
}).strict();
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MOVE'), unitId: text, to: square }).strict(),
  z.object({ type: z.literal('ATTACK'), unitId: text, targetPosition: square }).strict(),
  z.object({ type: z.literal('END_PLACE_PHASE') }).strict(), z.object({ type: z.literal('END_ACTION_PHASE') }).strict(),
  z.object({ type: z.literal('BUY_UNIT'), definitionId: definition, position: square }).strict(),
  z.object({ type: z.literal('PROMOTE_UNIT'), unitId: text }).strict(),
  z.object({ type: z.literal('PAY_UPKEEP'), keepUnitIds: z.array(text) }).strict(), z.object({ type: z.literal('RESIGN') }).strict(),
]);
const entityFact = { id: text, present: z.boolean(), owner: side.optional(), definitionId: definition.optional(), position: square.optional() };
const factSchema: z.ZodType<StateFact> = z.union([
  z.object({ kind: z.literal('unit'), ...entityFact }).strict(), z.object({ kind: z.literal('pending'), ...entityFact, cost: amount.optional() }).strict(),
  z.object({ kind: z.enum(['army-count', 'pending-count', 'spawn-area', 'bank']), player: side, value: comparison }).strict(),
  z.object({ kind: z.enum(['mobility-count', 'unit-attack-count']), unitId: text, value: comparison }).strict(),
  z.object({ kind: z.literal('inactivity-plies'), value: comparison }).strict(), z.object({ kind: z.literal('game-phase'), value: z.enum(['setup', 'playing', 'victory']) }).strict(),
  z.object({ kind: z.literal('reserve'), position: square, value: comparison }).strict(),
  z.object({ kind: z.literal('turn'), player: side, phase: z.enum(['action', 'place']), actionsRemaining: integer.max(4).optional(), upkeepPending: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('terminal'), winner: side.nullable(), reason: reason.optional() }).strict(),
  z.object({ kind: z.literal('unit-flag'), id: text, flag: z.enum(['hasMoved', 'hasAttacked', 'canActThisTurn', 'placedThisTurn', 'promotedThisPlacement', 'lastAttackKilled']), value: z.boolean() }).strict(),
  z.object({ kind: z.literal('damage'), id: text, value: comparison }).strict(),
]);
const ledgerFact = z.object({ player: side, metric: z.enum(['bank', 'mined', 'upkeep', 'refund', 'commitmentSpent', 'promotionSpent', 'incomeWindows']), value: comparison, unitId: text.optional() }).strict().refine(f => !f.unitId || f.metric === 'mined', 'only mined supports unitId');
const commitment = z.union([z.object({ kind: z.literal('root'), id: text }).strict(), z.object({ kind: z.literal('buy-event'), actionIndex: integer.max(511), owner: side, definitionId: definition, position: square }).strict()]);
export const predicateSchema: z.ZodType<PredicateSpec> = z.lazy(() => z.union([
  z.object({ kind: z.literal('all@1'), predicates: z.array(predicateSchema).min(1).max(64) }).strict(),
  z.object({ kind: z.literal('any-of@1'), predicates: z.array(predicateSchema).min(1).max(64) }).strict(),
  z.object({ kind: z.literal('action-legality@1'), at: z.enum(['root', 'endpoint']), action: actionSchema, expected: z.boolean() }).strict(),
  z.object({ kind: z.literal('state-facts@1'), at: z.enum(['root', 'endpoint']), facts: z.array(factSchema).min(1).max(512) }).strict(),
  z.object({ kind: z.literal('target-removed@1'), targetId: text, cause: z.literal('own-act-attack').optional(), survivingIds: z.array(text).optional(), survivingSides: z.array(side).optional() }).strict(),
  z.object({ kind: z.literal('summon-resolution@1'), commitment, outcome: z.enum(['arrived', 'disrupted']), player: side, window: integer.min(1).max(20).optional() }).strict(),
  z.object({ kind: z.literal('economy-ledger@1'), surviveThroughout: z.array(side).max(2), facts: z.array(ledgerFact).min(1).max(64) }).strict(),
  z.object({ kind: z.literal('home-defense@1'), at: z.enum(['root', 'endpoint']), invader: side, expected: z.enum(['mate', 'rescue']), maxNodes: integer.min(1).max(200000) }).strict(),
  z.object({ kind: z.literal('home-proof-budget@1'), at: z.enum(['root', 'endpoint']), invader: side, expected: z.literal('unknown'), maxNodes: integer.min(1).max(200000) }).strict(),
]));
export const horizonSchema: z.ZodType<Horizon> = z.union([z.object({ kind: z.literal('first-handoff-or-terminal') }).strict(), z.object({ kind: z.literal('scripted'), policy: z.literal('pass-only@1'), additionalHandoffs: integer.min(1).max(10), homeFirst: z.boolean() }).strict()]);
const probeObjects = [
  z.object({ kind: z.literal('legal-trace@1'), actions: z.array(actionSchema).min(1).max(512), endpoint: z.enum(['intermediate', 'first-handoff-or-terminal', 'coverage-sequence']), assert: predicateSchema, horizon: horizonSchema.optional() }).strict(),
  z.object({ kind: z.literal('legality@1'), action: actionSchema, expected: z.boolean() }).strict(),
  z.object({ kind: z.literal('resolve-batch@1'), player: side, assert: predicateSchema }).strict(),
] as const;
export const probeSchema: z.ZodType<ProbeSpec> = z.union(probeObjects);
const evidenceProbe = z.union([probeObjects[0].extend({ member: z.enum(['violating', 'correct']).optional() }), probeObjects[1].extend({ member: z.enum(['violating', 'correct']).optional() }), probeObjects[2].extend({ member: z.enum(['violating', 'correct']).optional() })]);
const common = { id: text, family: z.enum(FAMILIES), rationale: text, tags: z.array(text), authoredFrom: z.object({ id: text, revision: text, disposition: z.enum(['reauthored', 'replacement', 'new']) }).strict(), evidence: z.object({ positive: z.array(evidenceProbe).min(1), negative: z.array(evidenceProbe), rationale: text, exposure: text }).strict(), homeFraming: z.enum(['rescue', 'invader']).optional() };
const caseSchema: z.ZodType<PhasingCase> = z.union([
  z.object({ ...common, kind: z.literal('macro-decision'), root: ref, work: integer.min(1), horizon: horizonSchema, terminalPolicy: z.enum(['predicate-only', 'allow-root-mover-win']), accept: predicateSchema }).strict(),
  z.object({ ...common, kind: z.literal('canonical-coverage'), root: ref, probes: z.array(probeSchema).min(1), engineReplay: z.union([z.object({ required: z.literal(false) }).strict(), z.object({ required: z.literal(true), work: integer.min(1) }).strict()]) }).strict(),
  z.object({ ...common, kind: z.literal('invariant-pair'), family: z.literal('invariants'), invariant: integer.min(1).max(20), violating: ref, correct: ref, perspective: side, premise: z.object({ violating: predicateSchema, correct: predicateSchema }).strict(), probes: z.object({ violating: z.array(probeSchema), correct: z.array(probeSchema) }).strict().optional(), classification: z.enum(['preference', 'structural', 'diagnostic']), primaryMetric: z.enum(['eval-gap', 'search-gap', 'none']), work: integer.min(1).optional() }).strict(),
]);
const positionSchema = z.object({ schema: z.literal('muju-phasing-position-v1'), id: text, binding, boundary: z.object({ kind: z.enum(['act', 'prepare', 'terminal']), currentPlayer: side, actionsRemaining: integer.max(4), upkeepPending: z.boolean() }).strict(), state, origin: z.union([z.object({ kind: z.literal('authored-diagram'), rationale: text }).strict(), z.object({ kind: z.literal('counterfactual-defense'), rationale: text }).strict(), z.object({ kind: z.literal('legal-prefix'), seed: ref, actions: z.array(actionSchema).min(1).max(512), seedReachability: z.enum(['authored-diagram', 'initial-game']) }).strict()]) }).strict();

export const caseMembers = (c: PhasingCase): PositionRef[] => c.kind === 'invariant-pair' ? [c.violating, c.correct] : [c.root];
/** Scored units a case offers. Only a macro-decision and a GATING preference
 * pair offer one; `diagnostic` and `structural` pairs and coverage offer zero,
 * which is what makes a diagnostic measured-and-reported but non-gating. */
export const decisionUnits = (c: PhasingCase): 0 | 1 => c.kind === 'macro-decision' || (c.kind === 'invariant-pair' && c.classification === 'preference') ? 1 : 0;
export function containsBudgetProbe(p: PredicateSpec): boolean { return p.kind === 'home-proof-budget@1' || ((p.kind === 'all@1' || p.kind === 'any-of@1') && p.predicates.some(containsBudgetProbe)); }
function predicateDepth(p: PredicateSpec, depth = 0): void { if (depth > 8) throw new Error('predicate nesting exceeds 8'); if (p.kind === 'all@1' || p.kind === 'any-of@1') p.predicates.forEach(child => predicateDepth(child, depth + 1)); }

export function validateSuiteDocument(input: unknown): SuiteDocument {
  // Bound recursive input before z.lazy traverses it.
  const walk = (x: unknown, depth = 0): void => { if (depth > 40) throw new Error('document nesting exceeds 40'); if (x && typeof x === 'object') Object.values(x).forEach(v => walk(v, depth + 1)); };
  walk(input);
  const doc: SuiteDocument = z.object({ schema: z.literal('muju-phasing-suite-v1'), family: z.enum(FAMILIES), positions: z.array(positionSchema).min(1), cases: z.array(caseSchema).min(1) }).strict().parse(input);
  const positions = new Map<string, PhasingPosition>();
  const verifiedBindings = new Set<string>();
  for (const p of doc.positions) {
    if (positions.has(p.id)) throw new Error(`duplicate position ${p.id}`);
    positions.set(p.id, p); const bindingKey = hashJson(p.binding); if (!verifiedBindings.has(bindingKey)) { verifySourceBinding(p.binding); verifiedBindings.add(bindingKey); }
    const s = p.state, r = p.binding.rules;
    if (hashJson(p.boundary) !== hashJson(boundaryOf(s))) throw new Error(`boundary mismatch ${p.id}`);
    if (s.blackCrystalHandicap !== r.handicap || s.inactivityRule !== r.inactivityRule || s.victoryRule !== r.victoryRule) throw new Error(`embedded rules mismatch ${p.id}`);
    if ((s.phase === 'playing' && s.winner !== null) || (s.upkeepPending && s.turn.phase !== 'place')) throw new Error(`inconsistent phase ${p.id}`);
    const ids = [...s.board.units, ...(s.pendingSummons ?? [])].map(u => u.id);
    if (new Set(ids).size !== ids.length) throw new Error(`duplicate live/pending IDs ${p.id}`);
    const pendingSquares = new Set<string>();
    for (const summon of s.pendingSummons ?? []) {
      const definition = getUnitDefinition(summon.definitionId);
      if (definition.tier !== 1 || summon.cost !== definition.cost) throw new Error(`pending purchase tier/cost mismatch ${p.id}`);
      const key = `${summon.owner}:${summon.position.x},${summon.position.y}`;
      if (pendingSquares.has(key)) throw new Error(`duplicate owned commitment square ${p.id}`);
      pendingSquares.add(key);
    }
    const squares = s.board.units.map(u => `${u.position.x},${u.position.y}`);
    if (new Set(squares).size !== squares.length) throw new Error(`overlapping live units ${p.id}`);
    for (const owner of ['white', 'black'] as const) { if (s.players[owner].id !== owner) throw new Error(`player identity ${p.id}`); const corner = owner === 'white' ? 0 : 9; if (s.players[owner].startCorner.x !== corner || s.players[owner].startCorner.y !== corner) throw new Error(`home corner ${p.id}`); }
    s.board.cells.forEach((row, y) => row.forEach((cell, x) => { if (cell.position.x !== x || cell.position.y !== y) throw new Error(`cell coordinates ${p.id}`); }));
  }
  const resolve = (r: PositionRef): PhasingPosition => { const p = positions.get(r.id); if (!p || positionRef(p).sha256 !== r.sha256) throw new Error(`missing/hash-mismatched position ${r.id}`); return p; };
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (p: PhasingPosition): void => { if (visiting.has(p.id)) throw new Error('cyclic position provenance'); if (visited.has(p.id)) return; visiting.add(p.id); if (p.origin.kind === 'legal-prefix') { const seed = resolve(p.origin.seed); if (hashJson(seed.binding) !== hashJson(p.binding)) throw new Error('provenance rule mismatch'); visit(seed); } visiting.delete(p.id); visited.add(p.id); };
  doc.positions.forEach(visit);
  const ids = new Set<string>();
  for (const c of doc.cases) {
    if (ids.has(c.id) || c.family !== doc.family) throw new Error(`duplicate/misfiled case ${c.id}`); ids.add(c.id);
    if (c.family === 'home-mate' ? !c.homeFraming : !!c.homeFraming) throw new Error(`home framing ${c.id}`);
    if (c.family === 'invariants' && c.kind !== 'invariant-pair') throw new Error('invariants require pairs');
    const members = caseMembers(c).map(resolve);
    if (c.kind !== 'canonical-coverage' && !(c.kind === 'invariant-pair' && c.classification === 'structural') && members.some(p => p.boundary.kind === 'terminal' || p.origin.kind === 'counterfactual-defense')) throw new Error('terminal/counterfactual roots are coverage/structural only');
    const evidence = [...c.evidence.positive, ...c.evidence.negative];
    if (c.kind === 'invariant-pair') {
      if (hashJson(members[0].binding) !== hashJson(members[1].binding) || hashJson(members[0].boundary) !== hashJson(members[1].boundary)) throw new Error(`pair context mismatch ${c.id}`);
      if (evidence.some(p => !p.member)) throw new Error('pair evidence requires member');
      // structural <-> no metric. A preference and a diagnostic are both
      // measured, so both must name a metric, and a search-gap metric must name
      // the fixed work per member it is measured at.
      if ((c.classification === 'structural') !== (c.primaryMetric === 'none') || (c.primaryMetric === 'search-gap' && !c.work)) throw new Error('invalid pair scoring contract');
      if ([15, 18].includes(c.invariant) && c.classification !== 'structural') throw new Error('invariants 15/18 are structural');
      if (c.classification !== 'structural' && [c.premise.correct, c.premise.violating].some(containsBudgetProbe)) throw new Error('budget proof cannot define a preference');
      predicateDepth(c.premise.correct); predicateDepth(c.premise.violating);
    } else if (evidence.some(p => p.member)) throw new Error('non-pair evidence cannot select pair member');
    if (c.kind === 'macro-decision') {
      if (!c.evidence.negative.length) throw new Error('decision requires counterexample');
      if (containsBudgetProbe(c.accept)) throw new Error('budget proof cannot define a decision');
      predicateDepth(c.accept);
    }
    for (const p of [...evidence, ...(c.kind === 'canonical-coverage' ? c.probes : []), ...(c.kind === 'invariant-pair' ? [...(c.probes?.correct ?? []), ...(c.probes?.violating ?? [])] : [])]) { if (p.kind !== 'legality@1') predicateDepth(p.assert); if (p.kind === 'legal-trace@1' && p.horizon && p.endpoint !== 'first-handoff-or-terminal') throw new Error('horizon requires complete probe'); }
  }
  return doc;
}
