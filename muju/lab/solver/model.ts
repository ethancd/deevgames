/** Deterministic local optimization, not a game-playing bot or a universal power rating. */
import { reserveTake } from '../../src/game/mining';
import { upkeepForTier } from '../../src/game/upkeep';
import type { UnitDefinition } from '../../src/game/types';
import { getAttackModifier } from '../../src/game/elements';

export type Catalogue = readonly UnitDefinition[];
export function validateCatalogue(catalogue: Catalogue): void {
  const elements = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
  const tiers = Math.max(...catalogue.map(d => d.tier));
  if (catalogue.length !== elements.length * tiers || new Set(catalogue.map(d => d.id)).size !== catalogue.length) throw new Error('Expected complete unique element ladders');
  for (const element of elements) for (let tier = 1; tier <= tiers; tier++) {
    const unit = catalogue.find(d => d.id === `${element}_${tier}`);
    if (!unit || unit.element !== element || unit.tier !== tier) throw new Error(`Missing/mismatched ${element}_${tier}`);
    for (const key of ['attack', 'defense', 'speed', 'mining', 'cost'] as const) {
      if (!Number.isInteger(unit[key]) || unit[key] < (key === 'attack' || key === 'mining' ? 0 : 1)) throw new Error(`Invalid ${unit.id}.${key}`);
    }
    if (unit.mining > 5) throw new Error('Catalogue mining is capped at five');
  }
}

export const ACTIONS = 6;
export const MAX_NEIGHBORS = 4;
export const DISTANCES = Array.from({ length: 18 }, (_, i) => i + 1);
export const RESERVES = { ordinary: 4, shelf: 8, rich: 10 };

export function passiveCurve(unit: UnitDefinition, reserve: number, turns = 6): number[] {
  if(!Number.isInteger(reserve)||reserve<0||reserve>10||!Number.isInteger(turns)||turns<0)throw new Error('Valid reserve and horizon required');
  const curve = [0]; let left = reserve;
  for (let turn = 1; turn <= turns; turn++) {
    const take = reserveTake(unit.mining, left); left -= take;
    curve.push(curve[curve.length-1] + take);
  }
  return curve;
}
export function turnsToEmpty(unit: UnitDefinition, reserve: number): number|null {
  return reserve === 0 ? 0 : unit.mining === 0 ? null : Math.ceil(reserve / unit.mining);
}

export function power(attacker: UnitDefinition, defender: UnitDefinition): number {
  return Math.max(0, attacker.attack + getAttackModifier(attacker.element, defender.element));
}

/** Open shortest-path distance. One attack, never repeated on the same target. */
export function strikeActions(unit: UnitDefinition, distance: number): number {
  if (distance < 1 || !Number.isInteger(distance)) throw new Error('Positive integer distance required');
  return Math.ceil((distance - 1) / unit.speed) + 1;
}
export function canKill(unit: UnitDefinition, target: UnitDefinition, distance: number, actions: number): boolean {
  return strikeActions(unit, distance) <= actions && power(unit, target) >= target.defense;
}

export interface KillSolution { cost: number; actions: number; bodies: number; units: string[] }
/** Exact damage/action/cost knapsack under an explicit static formation model:
 * up to four independent approach lanes with the same shortest-path distance.
 * Each body attacks once. Ignores mutual blocking, casualties en route and tech.
 * Returns the cost/actions/bodies Pareto frontier, not just the cheapest swarm.
 */
export function killFrontier(target: UnitDefinition, attackers: Catalogue, distance: number,
  actionBudget = ACTIONS, maxBodies = MAX_NEIGHBORS): KillSolution[] {
  type State = KillSolution & { damage: number };
  let layer: State[] = [{ cost: 0, actions: 0, bodies: 0, units: [], damage: 0 }];
  const winners: KillSolution[] = [];
  for (let bodies = 1; bodies <= maxBodies; bodies++) {
    const next = new Map<string, State>();
    for (const state of layer) for (const unit of attackers) {
      const attack = power(unit, target), actions = state.actions + strikeActions(unit, distance);
      if (!attack || actions > actionBudget) continue;
      const candidate = { cost: state.cost + unit.cost, actions, bodies,
        units: [...state.units, unit.id], damage: Math.min(target.defense, state.damage + attack) };
      if (candidate.damage >= target.defense) winners.push(candidate);
      else {
        const key = `${actions}:${candidate.damage}`;
        if (!next.has(key) || next.get(key)!.cost > candidate.cost) next.set(key, candidate);
      }
    }
    layer = [...next.values()];
  }
  const unique = new Map<string, KillSolution>();
  for (const s of winners) unique.set(`${s.cost}:${s.actions}:${s.bodies}`, s);
  return [...unique.values()].filter(s => !winners.some(o => o.cost <= s.cost && o.actions <= s.actions &&
    o.bodies <= s.bodies && (o.cost < s.cost || o.actions < s.actions || o.bodies < s.bodies)))
    .sort((a, b) => a.cost - b.cost || a.actions - b.actions || a.bodies - b.bodies);
}

export interface AccessPoint { turn: number; resources: number; event: string }
/** Individually financed promotion climb with stipulated external turn-end income.
 * Starting F1/W1/P1 are free. Rent is paid before purchases/promotions. A line
 * unable to pay rent is released, then must start again at tier 1. No combat. */
export function accessTimeline(catalogue: Catalogue, target: UnitDefinition, income: number,
  horizon = 12): { activeTurn: number | null; investment: number; path: AccessPoint[] } {
  if (!Number.isFinite(income) || income < 0) throw new Error('Nonnegative income required');
  const line = catalogue.filter(d => d.element === target.element).sort((a,b)=>a.tier-b.tier);
  if(line.some((d,i)=>i>0 && d.cost<line[i-1].cost))throw new Error('Timeline requires monotone prices');
  const starts=['fire','water','plant'].includes(target.element);
  let tier=starts?1:0,cash=0;
  const path:AccessPoint[]=[],investment=target.cost-(starts?line[0].cost:0);
  for(let turn=1;turn<=horizon;turn++) {
    const rent=upkeepForTier(tier);
    if(cash<rent){tier=0;path.push({turn,resources:cash,event:'release unaffordable unit'});}
    else cash-=rent;
    if(tier===0 && cash>=line[0].cost){cash-=line[0].cost;tier=1;path.push({turn,resources:cash,event:`buy ${line[0].id}`});}
    else if(turn>1 && tier>0 && tier<target.tier) {
      const cost=line[tier].cost-line[tier-1].cost;
      if(cash>=cost){cash-=cost;tier++;path.push({turn,resources:cash,event:`promote ${line[tier-1].id}`});}
    }
    if(tier>=target.tier)return {activeTurn:turn,investment,path};
    cash+=income;
  }
  return {activeTurn:null,investment,path};
}

export function staticDominators(unit: UnitDefinition, catalogue: Catalogue): string[] {
  const positive = ['attack', 'defense', 'speed', 'mining'] as const;
  return catalogue.filter(other => other.id !== unit.id && other.tier === unit.tier &&
    catalogue.every(t => getAttackModifier(other.element, t.element) === getAttackModifier(unit.element, t.element) &&
      getAttackModifier(t.element, other.element) === getAttackModifier(t.element, unit.element)) &&
    other.cost <= unit.cost && positive.every(k => other[k] >= unit[k]) &&
    (other.cost < unit.cost || positive.some(k => other[k] > unit[k])))
    .map(d => d.id);
}

export interface Witness { mission: string; tiedWith: string[]; cost: number; nextBestPrice: number | null }
export interface RoleEvidence { feasible: number; cheapest: number; soleCheapest: number; witnesses: Witness[] }
/** Solve a grid of explicit capability-constrained purchase problems. No unit
 * is forced by name/tier; every catalogue unit competes at its actual price.
 * Witnesses mean cheapest qualifying SINGLE piece in this mission set, not
 * optimal mixed-army play. Counts depend on grid density and are not ratings.
 */
export function solveRoles(catalogue: Catalogue): Record<string, RoleEvidence> {
  const evidence = Object.fromEntries(catalogue.map(d => [d.id, { feasible: 0, cheapest: 0, soleCheapest: 0, witnesses: [] }])) as Record<string, RoleEvidence>;
  const guards = [null, ...catalogue];
  function mission(name: string, predicate: (unit: UnitDefinition) => boolean) {
    const eligible = catalogue.filter(predicate);
    for (const unit of eligible) evidence[unit.id].feasible++;
    if (!eligible.length) return;
    const cost = Math.min(...eligible.map(d => d.cost)), best = eligible.filter(d => d.cost === cost);
    for (const unit of best) {
      const e = evidence[unit.id]; e.cheapest++; if (best.length === 1) e.soleCheapest++;
      const alternatives = eligible.filter(d => d.id !== unit.id);
      const witness = { mission: name, tiedWith: best.filter(d => d.id !== unit.id).map(d => d.id), cost,
        nextBestPrice: alternatives.length ? Math.min(...alternatives.map(d => d.cost)) : null };
      // Prefer sole-cheapest examples, retaining a few distinct mission families.
      if (e.witnesses.length < 3 || (best.length === 1 && e.witnesses.some(w => w.tiedWith.length))) {
        if (e.witnesses.length >= 3) e.witnesses.splice(e.witnesses.findIndex(w => w.tiedWith.length), 1);
        e.witnesses.push(witness);
      }
    }
  }
  for (const target of catalogue) for (const distance of DISTANCES) for (const actions of [1, 2, 3, 4, 5, 6]) {
    for (const mine of [0, 1, 2, 3, 4, 5]) for (const guard of guards) {
      mission(`strike ${target.id} at distance ${distance} within ${actions} actions; mine >=${mine} crystals at turn end on rich ground; survive ${guard?.id ?? 'no'} hit`,
        u => (mine === 0 || u.mining >= mine) && strikeActions(u, distance) <= actions &&
          power(u, target) >= target.defense && (!guard || u.defense > power(guard, u)));
    }
  }
  // Independent finite-cell income tests, with no action cost for collection.
  for(const [name,reserve] of Object.entries(RESERVES))for(let turns=1;turns<=4;turns++) {
    for(let amount=1;amount<=reserve;amount++)for(const guard of guards) {
      mission(`collect >=${amount} on ${name} reserve ${reserve} within ${turns} turns; survive ${guard?.id??'no'} hit`,
        u=>passiveCurve(u,reserve,turns)[turns]>=amount && (!guard||u.defense>power(guard,u)));
    }
  }
  // Anchor occupation need not involve an attack or income.
  for (let distance = 1; distance <= 18; distance++) for (const actions of [1, 2, 3]) for (const guard of guards) {
    mission(`occupy anchor at distance ${distance} within ${actions} moves; survive ${guard?.id ?? 'no'} hit`,
      u => Math.ceil(distance / u.speed) <= actions && (!guard || u.defense > power(guard, u)));
  }
  return evidence;
}

/** Neutral reporting grid; no claim that these situations are equally common. */
export function metrics(unit: UnitDefinition, opponents: Catalogue) {
  let kills = 0, cells = 0, actionTotal = 0, damageTotal = 0;
  for (const target of opponents) for (const distance of DISTANCES) for (const budget of [1, 2, 3]) {
    cells++; if (canKill(unit, target, distance, budget)) kills++;
    if (strikeActions(unit, distance) <= budget) damageTotal += Math.min(power(unit, target), target.defense);
  }
  for (const distance of DISTANCES) actionTotal += strikeActions(unit, distance);
  const defense = [1, 4, 7].map(distance => ({ distance, frontier: killFrontier(unit, opponents, distance) }));
  return { killCells: kills, cells, deliveredDamage: damageTotal / cells,
    meanStrikeActions: actionTotal / DISTANCES.length,
    income: Object.fromEntries(Object.entries(RESERVES).map(([name, reserve]) => [name, passiveCurve(unit, reserve)])),
    turnsToEmpty: Object.fromEntries(Object.entries(RESERVES).map(([name,reserve])=>[name,turnsToEmpty(unit,reserve)])),
    defense };
}

export function squadMarginal(before: UnitDefinition, after: UnitDefinition, targets: Catalogue) {
  let newlyFeasible = 0, jointlyFeasible = 0, crystalsSaved = 0, actionsSaved = 0;
  const examples: { target: string; distance: number; beforeCost: number | null; afterCost: number }[] = [];
  for (const target of targets) for (const distance of [1, 4, 7]) {
    const a = killFrontier(target, [before], distance)[0], b = killFrontier(target, [after], distance)[0];
    if (!a && b) newlyFeasible++;
    if (a && b) { jointlyFeasible++; crystalsSaved += a.cost - b.cost; actionsSaved += a.actions - b.actions; }
    if (b && (!a || a.cost > b.cost) && examples.length < 3) examples.push({ target: target.id, distance, beforeCost: a?.cost ?? null, afterCost: b.cost });
  }
  return { cases: targets.length * 3, newlyFeasible, jointlyFeasible,
    meanCrystalsSaved: jointlyFeasible ? crystalsSaved / jointlyFeasible : null,
    meanActionsSaved: jointlyFeasible ? actionsSaved / jointlyFeasible : null, examples };
}

export function marginalValues(unit: UnitDefinition, opponents: Catalogue) {
  const base = metrics(unit, opponents);
  const changes = Object.fromEntries((['attack', 'defense', 'speed', 'mining'] as const).map(stat => {
    const changed = metrics({ ...unit, [stat]: unit[stat] + 1 }, opponents);
    return [stat, { killCells: changed.killCells - base.killCells,
      squad: squadMarginal(unit, { ...unit, [stat]: unit[stat] + 1 }, opponents),
      strikeActionsSaved: base.meanStrikeActions - changed.meanStrikeActions,
      deliveredDamage: changed.deliveredDamage - base.deliveredDamage,
      incomeAt6: Object.fromEntries(Object.keys(RESERVES).map(name => [name, changed.income[name][6] - base.income[name][6]])),
      defenseKillCost: changed.defense.map((d, i) => ({ distance: d.distance,
        before: base.defense[i].frontier[0]?.cost ?? null, after: d.frontier[0]?.cost ?? null })) }];
  }));
  const plusAttack = { ...unit, attack: unit.attack + 1 }, plusSpeed = { ...unit, speed: unit.speed + 1 };
  const both = { ...plusAttack, speed: plusSpeed.speed };
  const synergy = metrics(both, opponents).killCells - metrics(plusAttack, opponents).killCells -
    metrics(plusSpeed, opponents).killCells + base.killCells;
  let witness: { target: string; distance: number; actions: number } | null = null;
  for (const target of opponents) for (let distance = 1; distance <= 18; distance++) for (let actions = 1; actions <= 6; actions++) {
    if (!witness && canKill(both, target, distance, actions) && !canKill(plusAttack, target, distance, actions) &&
        !canKill(plusSpeed, target, distance, actions)) witness = { target: target.id, distance, actions };
  }
  return { base, changes, attackSpeedSynergy: { extraKillCellsBeyondAdditive: synergy, witness } };
}
