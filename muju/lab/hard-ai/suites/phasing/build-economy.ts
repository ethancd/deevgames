/** New Phasing authoring; never reads or overwrites historical suite files.
 * Passive extraction is a limited objective, not adversarial optimality.
 * All expected arithmetic comes from catalogue mining/cost/rent, never Hard. */
import type { Unit, PendingSummon } from '../../../../src/game/types';
import { getUnitDefinition, getNextTierDefinition } from '../../../../src/game/units';
import { upkeepForTier } from '../../../../src/game/upkeep';
import { makePosition, positionRef } from './canonical';
import type { AIAction, GameState, PlayerId, Position, SourceBinding, SuiteDocument, PredicateSpec, ProbeSpec, LedgerFact, StateFact, Horizon, CommonCase } from './format';

export const HISTORICAL_REVISION = '70ba9dc676d42ddd5e8f44db80cb7faed381caa0';
const EXPOSURE = 'Historical authored economy/invariant fixtures and canonical rules inspected; no measured Hard choices, evaluation outcomes, openings or sealed data used to author this case.';
const END_ACT: AIAction = { type: 'END_ACTION_PHASE' };
const END_PREPARE: AIAction = { type: 'END_PLACE_PHASE' };
const BOTH: PlayerId[] = ['white', 'black'];

/** Lane-local explicit Phasing diagram helper, also used by invariant authoring.
 * A synthetic diagram is not claimed reachable from the initial position. */
export interface AuthoredUnit { id: string; def: string; owner: PlayerId; x: number; y: number }
export function authoredState(binding: SourceBinding, opts: {
  units: AuthoredUnit[]; current?: PlayerId; phase?: 'action' | 'place'; actions?: number;
  white?: number; black?: number; clock?: number; reserves?: { x: number; y: number; amount: number }[];
  pending?: PendingSummon[];
}): GameState {
  const reserves = new Array<number>(100).fill(0);
  for (const r of opts.reserves ?? []) reserves[r.y * 10 + r.x] = r.amount;
  const units: Unit[] = opts.units.map(u => ({ id: u.id, definitionId: u.def, owner: u.owner,
    position: { x: u.x, y: u.y }, hasMoved: false, hasAttacked: false, attackedThisTurn: [],
    lastAttackKilled: false, canActThisTurn: true, damageTaken: 0, placedThisTurn: false, promotedThisPlacement: false }));
  return {
    ruleset: 'phasing', actionsPerTurn: 4, blackCrystalHandicap: binding.rules.handicap,
    victoryRule: binding.rules.victoryRule, inactivityRule: binding.rules.inactivityRule,
    phase: 'playing', winner: null, upkeepPending: false, reviewUpkeep: { white: false, black: false },
    inactivityPlies: opts.clock ?? 0, progressThisTurn: false,
    pendingSummons: structuredClone(opts.pending ?? []),
    board: { units, initialResourceLayers: [...reserves], cells: Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 10 }, (_, x) => ({ position: { x, y }, resourceLayers: reserves[y * 10 + x] }))) },
    players: {
      white: { id: 'white', startCorner: { x: 0, y: 0 }, resources: opts.white ?? 8, resourcesGained: 0, resourcesUpkeep: 0 },
      black: { id: 'black', startCorner: { x: 9, y: 9 }, resources: opts.black ?? 0, resourcesGained: 0, resourcesUpkeep: 0 },
    },
    turn: { currentPlayer: opts.current ?? 'white', phase: opts.phase ?? 'action',
      actionsRemaining: opts.actions ?? (opts.phase === 'place' ? 0 : 4), turnNumber: 6 },
    selectedUnit: null, validMoves: [], validAttacks: [],
  };
}

export const stateFacts = (at: 'root' | 'endpoint', ...facts: StateFact[]): PredicateSpec => ({ kind: 'state-facts@1', at, facts });
export const ledger = (...facts: LedgerFact[]): PredicateSpec => ({ kind: 'economy-ledger@1', surviveThroughout: [...BOTH], facts });
export const all = (...predicates: PredicateSpec[]): PredicateSpec => ({ kind: 'all@1', predicates });
export const passive = (additionalHandoffs: number): Horizon => additionalHandoffs === 0 ? { kind: 'first-handoff-or-terminal' }
  : { kind: 'scripted', policy: 'pass-only@1', additionalHandoffs, homeFirst: false };
export const probe = (actions: AIAction[], assert: PredicateSpec, horizon?: Horizon,
  endpoint: 'intermediate' | 'first-handoff-or-terminal' | 'coverage-sequence' = 'first-handoff-or-terminal'): ProbeSpec => ({ kind: 'legal-trace@1', actions, assert, endpoint, ...(horizon ? { horizon } : {}) });
export function authorCommon(id: string, family: 'economy' | 'invariants', rationale: string,
  positive: ProbeSpec[], negative: ProbeSpec[], oldId = id): CommonCase {
  return { id, family, rationale, tags: [family, 'phasing', 'canonical-authored'],
    authoredFrom: { id: oldId, revision: HISTORICAL_REVISION, disposition: oldId === id ? 'reauthored' : 'replacement' },
    evidence: { positive, negative, rationale, exposure: EXPOSURE } };
}

const REMOTE: AuthoredUnit = { id: 'opponent', def: 'metal_1', owner: 'black', x: 9, y: 9 };
interface Relocation { id: string; def: string; from: Position; rich: Position; richReserve: number; poor: Position }
function relocations(): Relocation[] {
  const rows: Relocation[] = [];
  // Preserve the twelve legal historical east/south arrangements. Metal I's
  // two impossible speed-zero moves get separately named replacements below.
  for (const [index, def] of ['fire_1', 'water_1', 'plant_1', 'plant_2', 'plant_3', 'metal_1', 'metal_2'].entries()) {
    if (def === 'metal_1') continue;
    const x = index + 2;
    rows.push({ id: `relocate-${def}-e`, def, from: { x, y: 5 }, rich: { x: x + 1, y: 5 }, poor: { x: x - 1, y: 5 }, richReserve: 16 });
    rows.push({ id: `relocate-${def}-s`, def, from: { x, y: index + 1 }, rich: { x, y: index + 2 }, poor: { x, y: index }, richReserve: 16 });
  }
  for (const [i, richReserve] of [8, 12, 16, 10, 14, 8, 12, 16].entries()) rows.push({
    id: `muju-onto-4-${i}`, def: 'plant_1', from: { x: i + 1, y: 8 }, rich: { x: i + 2, y: 8 }, poor: { x: i, y: 8 }, richReserve,
  });
  return rows;
}

/** Pure builder: caller installs binding.rules around author validation. */
export function buildEconomy(binding: SourceBinding): SuiteDocument {
  const out: SuiteDocument = { schema: 'muju-phasing-suite-v1', family: 'economy', positions: [], cases: [] };
  const root = (id: string, state: GameState, rationale: string) => {
    const p = makePosition(id, state, binding, { kind: 'authored-diagram', rationale }); out.positions.push(p); return positionRef(p);
  };
  for (const row of relocations()) {
    const mining = getUnitDefinition(row.def).mining;
    const harvests = Math.floor(4 / mining) + 1, horizon = passive(2 * (harvests - 1));
    const rationale = `Retained ${row.id} motif: the named miner must extract more than the poor cell's finite four crystals. ` +
      `The earliest distinguishing horizon is ${harvests} own harvests (${2 * (harvests - 1)} additional pass-only handoffs). ` +
      'Both armies must survive. This passive finite-extraction objective does not claim optimality against active replies; bank8 keeps the rent-bearing negative branch alive.';
    const state = authoredState(binding, { units: [{ id: 'miner', def: row.def, owner: 'white', ...row.from }, REMOTE], white: 8,
      reserves: [{ ...row.rich, amount: row.richReserve }, { ...row.poor, amount: 4 }] });
    const accept = ledger({ player: 'white', metric: 'mined', unitId: 'miner', value: { min: 5 } },
      { player: 'white', metric: 'incomeWindows', value: { eq: harvests } });
    const positive = probe([{ type: 'MOVE', unitId: 'miner', to: row.rich }, END_ACT, END_PREPARE], accept, horizon);
    const negative = probe([{ type: 'MOVE', unitId: 'miner', to: row.poor }, END_ACT, END_PREPARE], ledger(
      { player: 'white', metric: 'mined', unitId: 'miner', value: { eq: 4 } },
      { player: 'white', metric: 'incomeWindows', value: { eq: harvests } }), horizon);
    out.cases.push({ ...authorCommon(row.id, 'economy', rationale, [positive], [negative]), kind: 'macro-decision',
      root: root(row.id, state, rationale), work: 50_000, horizon, terminalPolicy: 'predicate-only', accept });
  }

  const promotions = [
    ['plant_1', 16, 3, 3], ['plant_1', 8, 4, 3], ['plant_2', 16, 5, 3], ['metal_1', 16, 6, 3],
    ['metal_2', 16, 7, 3], ['shadow_1', 16, 3, 4], ['shadow_2', 16, 4, 4], ['water_2', 16, 5, 4],
  ] as const;
  for (const [index, [def, reserve, x, y]] of promotions.entries()) {
    const old = getUnitDefinition(def), next = getNextTierDefinition(def)!;
    const cost = next.cost - old.cost, bank = cost + 3, id = `promote-${def}-${reserve}-${index}`;
    const rationale = 'Preserve settled Prepare promotion-versus-bank timing, with a surviving opponent. ' +
      'Promotion spends the catalogue difference now and adds neither mining nor retroactive rent now. ' +
      'Only the next own outgoing Act collects the promoted rate before the new rent. Finite reserves, actual cash and rent are reported; the old PST profitability claim is not a canonical theorem.';
    const state = authoredState(binding, { phase: 'place', white: bank, units: [{ id: 'miner', def, owner: 'white', x, y }, REMOTE], reserves: [{ x, y, amount: reserve }] });
    const promotion: AIAction = { type: 'PROMOTE_UNIT', unitId: 'miner' };
    const immediate = probe([promotion], all(
      ledger({ player: 'white', metric: 'promotionSpent', value: { eq: cost } }, { player: 'white', metric: 'mined', value: { eq: 0 } },
        { player: 'white', metric: 'upkeep', value: { eq: 0 } }, { player: 'white', metric: 'incomeWindows', value: { eq: 0 } }, { player: 'white', metric: 'bank', value: { eq: 3 } }),
      stateFacts('endpoint', { kind: 'unit', id: 'miner', present: true, definitionId: next.id })), undefined, 'intermediate');
    const future = (promoted: boolean) => {
      const d = promoted ? next : old, spent = promoted ? cost : 0, mined = Math.min(d.mining, reserve), rent = upkeepForTier(d.tier);
      return ledger({ player: 'white', metric: 'promotionSpent', value: { eq: spent } },
        { player: 'white', metric: 'mined', unitId: 'miner', value: { eq: mined } }, { player: 'white', metric: 'upkeep', value: { eq: rent } },
        { player: 'white', metric: 'incomeWindows', value: { eq: 1 } }, { player: 'white', metric: 'bank', value: { eq: bank - spent + mined - rent } });
    };
    const positive = probe([promotion, END_PREPARE], future(true), passive(2));
    const negative = probe([END_PREPARE], future(false), passive(2));
    out.cases.push({ ...authorCommon(id, 'economy', rationale, [immediate, positive], [negative]), kind: 'canonical-coverage',
      root: root(id, state, rationale), probes: [immediate, positive, negative], engineReplay: { required: false } });
  }

  {
    const id = 'metal-1-delayed-harvest', rationale = 'Replace impossible Metal-I east relocation with a separately authored stationary paid-miner timing case. ' +
      'A supported B2 commitment contributes no body/mining now, arrives at next White Act, and only then mines3 at that Act end; the no-buy control remains dry.';
    const state = authoredState(binding, { phase: 'place', white: 5, units: [{ id: 'anchor', def: 'water_1', owner: 'white', x: 2, y: 2 }, REMOTE], reserves: [{ x: 1, y: 1, amount: 9 }] });
    const buy: AIAction = { type: 'BUY_UNIT', definitionId: 'metal_1', position: { x: 1, y: 1 } };
    const immediate = probe([buy, END_PREPARE], all(
      stateFacts('endpoint', { kind: 'army-count', player: 'white', value: { eq: 1 } }, { kind: 'pending-count', player: 'white', value: { eq: 1 } }),
      ledger({ player: 'white', metric: 'mined', value: { eq: 0 } }, { player: 'white', metric: 'commitmentSpent', value: { eq: 5 } })));
    const positive = probe([buy, END_PREPARE], all(
      { kind: 'summon-resolution@1', commitment: { kind: 'buy-event', actionIndex: 0, owner: 'white', definitionId: 'metal_1', position: { x: 1, y: 1 } }, outcome: 'arrived', player: 'white', window: 1 },
      ledger({ player: 'white', metric: 'mined', value: { eq: 3 } }, { player: 'white', metric: 'incomeWindows', value: { eq: 1 } },
        { player: 'white', metric: 'bank', value: { eq: 3 } }, { player: 'white', metric: 'upkeep', value: { eq: 0 } })), passive(2));
    const negative = probe([END_PREPARE], ledger({ player: 'white', metric: 'mined', value: { eq: 0 } }, { player: 'white', metric: 'bank', value: { eq: 5 } }), passive(2));
    out.cases.push({ ...authorCommon(id, 'economy', rationale, [immediate, positive], [negative], 'relocate-metal_1-e'),
      kind: 'canonical-coverage', root: root(id, state, rationale), probes: [immediate, positive, negative], engineReplay: { required: false } });
  }
  {
    const id = 'metal-1-promote-mobile-next-act', rationale = 'Replace impossible Metal-I south relocation with future mobility unlocked by an actual Prepare promotion. ' +
      'A promoted Metal II still cannot move in Prepare; after a legal opponent pass it can relocate to D3 and mine4 before paying rent1. The equal-horizon unpromoted Metal I remains immobile. This is an explicit scripted rule witness, not a preferred investment or adversarial forecast.';
    const state = authoredState(binding, { phase: 'place', white: 7, units: [{ id: 'miner', def: 'metal_1', owner: 'white', x: 2, y: 2 }, REMOTE], reserves: [{ x: 3, y: 2, amount: 8 }] });
    const promote: AIAction = { type: 'PROMOTE_UNIT', unitId: 'miner' };
    const relocation: AIAction = { type: 'MOVE', unitId: 'miner', to: { x: 3, y: 2 } };
    const positive = probe([promote, END_PREPARE], all(
      stateFacts('endpoint', { kind: 'unit', id: 'miner', present: true, definitionId: 'metal_2' }, { kind: 'mobility-count', unitId: 'miner', value: { min: 1 } },
        { kind: 'turn', player: 'white', phase: 'action', actionsRemaining: 4 }),
      { kind: 'action-legality@1', at: 'endpoint', action: relocation, expected: true },
      ledger({ player: 'white', metric: 'promotionSpent', value: { eq: 4 } }, { player: 'white', metric: 'mined', value: { eq: 0 } }, { player: 'white', metric: 'bank', value: { eq: 3 } })), passive(1));
    const negative = probe([END_PREPARE], all(stateFacts('endpoint', { kind: 'unit', id: 'miner', present: true, definitionId: 'metal_1' },
      { kind: 'mobility-count', unitId: 'miner', value: { eq: 0 } }), ledger({ player: 'white', metric: 'promotionSpent', value: { eq: 0 } })), passive(1));
    const illegal: ProbeSpec = { kind: 'legality@1', action: relocation, expected: false };
    const stillPrepare = probe([promote], { kind: 'action-legality@1', at: 'endpoint', action: relocation, expected: false }, undefined, 'intermediate');
    const actual = probe([promote, END_PREPARE, END_ACT, END_PREPARE, relocation, END_ACT, END_PREPARE], all(
      stateFacts('endpoint', { kind: 'unit', id: 'miner', present: true, definitionId: 'metal_2', position: { x: 3, y: 2 } }),
      ledger({ player: 'white', metric: 'promotionSpent', value: { eq: 4 } }, { player: 'white', metric: 'mined', unitId: 'miner', value: { eq: 4 } },
        { player: 'white', metric: 'upkeep', value: { eq: 1 } }, { player: 'white', metric: 'bank', value: { eq: 6 } })), undefined, 'coverage-sequence');
    out.cases.push({ ...authorCommon(id, 'economy', rationale, [positive, actual], [negative], 'relocate-metal_1-s'), kind: 'canonical-coverage',
      root: root(id, state, rationale), probes: [illegal, stillPrepare, positive, actual, negative], engineReplay: { required: false } });
  }
  return out;
}
