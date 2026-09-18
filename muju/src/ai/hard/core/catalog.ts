/**
 * The baked 18-unit catalogue (DESIGN §4.3). Every number is read out of the
 * canonical engine — `UNIT_DEFINITIONS` (units.ts:8-222), `upkeepForTier`
 * (upkeep.ts:12), `getNextTierDefinition`/`getPromotionCost` (units.ts:262-282)
 * and, critically, `calculateAttackPower` (combat.ts:80-91) itself — so the
 * replica's combat arithmetic is the canonical arithmetic by construction.
 *
 * Two power planes are mandatory (JF §2.2): `combatHandicap` is keyed by the
 * ATTACKER's owner (combat.ts:62-66, 90), so `power[side][a][d]` is the damage
 * a unit of definition `a` owned by `side` deals to definition `d`.
 *
 * Three process-global knobs the balance lab can move underneath us —
 * `setElementGraph`, `setUpkeepVariant`, `setCombatHandicap` — change those
 * numbers. `catalogSignature()` hashes all three (plus the static definition
 * table) so `activeCatalog()` can rebuild exactly when one of them moves and
 * return the cached table when it is restored.
 */
import type { DefId, Side } from '../types';
import type { Element, PlayerId, Unit } from '../../../game/types';
import { UNIT_DEFINITIONS, getNextTierDefinition, getPromotionCost, getUnitDefinition } from '../../../game/units';
import { calculateAttackPower } from '../../../game/combat';
import { getElementGraph } from '../../../game/elements';
import { upkeepForTier } from '../../../game/upkeep';

export const NDEF = 18;

/** `element` plane order (DESIGN §4.3). */
const ELEMENT_ORDER: readonly Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
const ELEMENT_INDEX: ReadonlyMap<Element, number> = new Map(ELEMENT_ORDER.map((e, i) => [e, i]));

const SIDE_PLAYER: readonly PlayerId[] = ['white', 'black'];

/** `hitsToKill` sentinel: POWER 0 can never kill (RE §1.7b). */
export const NEVER_KILLS = 255;

export interface Catalog {
  atk: Int8Array;
  def: Int8Array;
  spd: Int8Array;
  mine: Int8Array;
  tier: Int8Array;
  cost: Int8Array;
  /** per defId, from `upkeepForTier` (upkeep.ts:12) — honours `setUpkeepVariant`. */
  upkeep: Int8Array;
  /** 0 fire, 1 lightning, 2 water, 3 shadow, 4 plant, 5 metal. */
  element: Int8Array;
  /** -1 at tier 3 (units.ts:262-273). */
  nextDef: Int8Array;
  /** 4 or 8, 0 at tier 3 (promotion.ts:9-23). */
  promoCost: Int8Array;
  /** the six purchasable defIds ascending by cost then id. */
  tier1: Int8Array;
  /** [2 * NDEF * NDEF] plane per ATTACKING side: `calculateAttackPower` incl. `combatHandicap[side]`. */
  power: Int8Array;
  /** [2 * NDEF * NDEF] `power >= def[d]`. */
  killsInOne: Uint8Array;
  /** [2 * NDEF * NDEF] `ceil(def/power)`, `NEVER_KILLS` when power === 0. */
  hitsToKill: Uint8Array;
  /** `catalogSignature()` at the moment this table was built. */
  signature: number;
}

export const DEF_ID: readonly string[] = UNIT_DEFINITIONS.map(d => d.id);
export const DEF_INDEX: ReadonlyMap<string, DefId> = new Map(DEF_ID.map((id, i) => [id, i]));

if (DEF_ID.length !== NDEF) throw new Error(`catalog: expected ${NDEF} unit definitions, found ${DEF_ID.length}`);

/** `power[side*NDEF*NDEF + attackerDef*NDEF + defenderDef]`. */
export function powerIndex(side: Side, attacker: DefId, defender: DefId): number {
  return (side * NDEF + attacker) * NDEF + defender;
}

function hash32(h: number, value: number): number {
  let x = (h ^ value) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function hashString(h: number, s: string): number {
  let acc = h;
  for (let i = 0; i < s.length; i++) acc = hash32(acc, s.charCodeAt(i));
  return hash32(acc, s.length);
}

/** A `Unit` good enough for `calculateAttackPower`, which reads only
 * `definitionId` and `owner`. The 36 of them are built once at module load so
 * neither `buildCatalog` nor the per-call `catalogSignature()` probe allocates. */
function makeProbeUnit(defId: DefId, owner: PlayerId): Unit {
  return {
    id: `probe-${owner}-${DEF_ID[defId]}`,
    definitionId: DEF_ID[defId],
    owner,
    position: { x: 0, y: 0 },
    hasMoved: false,
    hasAttacked: false,
    lastAttackKilled: false,
    canActThisTurn: true,
    damageTaken: 0,
  };
}

/** `PROBE[owner][defId]`. */
const PROBE: readonly (readonly Unit[])[] = SIDE_PLAYER.map(owner =>
  DEF_ID.map((_, d) => makeProbeUnit(d, owner)),
);

/**
 * `combatHandicap` has setters but no getter (combat.ts:62-70), so it is read
 * back through `calculateAttackPower` itself. fire_3 (ATK 4) against fire_1 is
 * elementally neutral under all four graphs `setElementGraph` can select, so
 * the probe is `max(0, 4 + handicap[side])` and recovers any handicap > -4.
 * The lab only ever sets 0 or +1 (combat.ts:57-60).
 */
const PROBE_ATTACKER: DefId = DEF_INDEX.get('fire_3') as DefId;
const PROBE_DEFENDER: DefId = DEF_INDEX.get('fire_1') as DefId;
const PROBE_BASE_ATK = getUnitDefinition('fire_3').attack;

function probeCombatHandicap(side: Side): number {
  // Only the attacker's owner feeds `combatHandicap` (combat.ts:90); the
  // defender's owner is irrelevant to the returned power.
  return calculateAttackPower(PROBE[side][PROBE_ATTACKER], PROBE[1 - side][PROBE_DEFENDER]) - PROBE_BASE_ATK;
}

/** Hash of the immutable half of the catalogue — every field of every definition, in order. */
const STATIC_DEFS_HASH: number = (() => {
  let h = 0x4d554a43; // "MUJC"
  for (const d of UNIT_DEFINITIONS) {
    h = hashString(h, d.id);
    h = hashString(h, d.element);
    h = hash32(h, d.tier);
    h = hash32(h, d.attack);
    h = hash32(h, d.defense);
    h = hash32(h, d.speed);
    h = hash32(h, d.mining);
    h = hash32(h, d.cost);
  }
  return h;
})();

/**
 * Cheap signature of everything a built `Catalog` depends on: the static
 * definition table, the active element graph, the active upkeep schedule and
 * both combat handicaps. Every derived table is a pure function of those, so
 * hashing them hashes "every table" (DESIGN §4.3) without touching 1,944
 * power entries.
 */
export function catalogSignature(): number {
  let h = STATIC_DEFS_HASH;
  h = hashString(h, getElementGraph());
  for (let tier = 1; tier <= 4; tier++) h = hash32(h, upkeepForTier(tier));
  h = hash32(h, probeCombatHandicap(0) + 128);
  h = hash32(h, probeCombatHandicap(1) + 128);
  return h;
}

export function buildCatalog(): Catalog {
  const atk = new Int8Array(NDEF);
  const def = new Int8Array(NDEF);
  const spd = new Int8Array(NDEF);
  const mine = new Int8Array(NDEF);
  const tier = new Int8Array(NDEF);
  const cost = new Int8Array(NDEF);
  const upkeep = new Int8Array(NDEF);
  const element = new Int8Array(NDEF);
  const nextDef = new Int8Array(NDEF);
  const promoCost = new Int8Array(NDEF);

  for (let d = 0; d < NDEF; d++) {
    const u = UNIT_DEFINITIONS[d];
    atk[d] = u.attack;
    def[d] = u.defense;
    spd[d] = u.speed;
    mine[d] = u.mining;
    tier[d] = u.tier;
    cost[d] = u.cost;
    upkeep[d] = upkeepForTier(u.tier);
    const elementIndex = ELEMENT_INDEX.get(u.element);
    if (elementIndex === undefined) throw new Error(`catalog: unknown element "${u.element}"`);
    element[d] = elementIndex;
    const next = getNextTierDefinition(u.id);
    nextDef[d] = next === null ? -1 : (DEF_INDEX.get(next.id) as DefId);
    promoCost[d] = next === null ? 0 : getPromotionCost(u.id);
  }

  const tier1Ids: DefId[] = [];
  for (let d = 0; d < NDEF; d++) if (tier[d] === 1) tier1Ids.push(d);
  tier1Ids.sort((a, b) => cost[a] - cost[b] || a - b);
  const tier1 = Int8Array.from(tier1Ids);

  const power = new Int8Array(2 * NDEF * NDEF);
  const killsInOne = new Uint8Array(2 * NDEF * NDEF);
  const hitsToKill = new Uint8Array(2 * NDEF * NDEF);
  for (let s = 0; s < 2; s++) {
    const side = s as Side;
    for (let a = 0; a < NDEF; a++) {
      const attacker = PROBE[s][a];
      for (let d = 0; d < NDEF; d++) {
        const p = calculateAttackPower(attacker, PROBE[1 - s][d]);
        const i = powerIndex(side, a, d);
        power[i] = p;
        killsInOne[i] = p >= def[d] ? 1 : 0;
        hitsToKill[i] = p === 0 ? NEVER_KILLS : Math.ceil(def[d] / p);
      }
    }
  }

  return { atk, def, spd, mine, tier, cost, upkeep, element, nextDef, promoCost, tier1, power, killsInOne, hitsToKill, signature: catalogSignature() };
}

let memo: Catalog | null = null;

/** The catalogue for the currently-configured rules, rebuilt only when `catalogSignature()` moves. */
export function activeCatalog(): Catalog {
  const signature = catalogSignature();
  if (memo === null || memo.signature !== signature) memo = buildCatalog();
  return memo;
}
