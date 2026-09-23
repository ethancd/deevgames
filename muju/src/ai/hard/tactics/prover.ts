/**
 * The packed home-defence prover (DESIGN §4.14, §5.9).
 *
 * `homeVerdict` is a bit-for-bit replica of `analyzeHomeDefense`
 * (`src/game/homeCheckmate.ts:57-168`) on a `PackedState`. "Bit for bit" here
 * is a strong claim and it is the whole point of the module: `make` calls this
 * instead of the canonical prover at `proverMode = 2` (DESIGN §3.4), so a
 * single disagreement would make the replica adjudicate a game differently
 * from the engine it mirrors.
 *
 * Exactness therefore means more than "same rescue/mate answer on an
 * exhaustive search". The canonical prover has a **node cap** (`PROOF_NODES`),
 * and exhaustion is reported as `UNKNOWN`, never as a win. Two provers that
 * explore the same tree in a different ORDER, or that deduplicate with a
 * different transposition key, burn their 20,000 nodes on different subtrees
 * and disagree exactly on the positions where the cap bites.
 *
 * ## PHASING IS ACT-ONLY (M2)
 *
 * Canonical home defence has two shapes and this module implements exactly one
 * of them, the Phasing one:
 *
 * ```
 * bound   = enoughPossibleDamage(ready, target, !isPhasing(state))   homeCheckmate.ts:78
 * rescued = isPhasing(state) ? act(ready, []) : prepare(0, cash, [], [])  homeCheckmate.ts:160
 * ```
 *
 * Under Phasing the defender ACTS BEFORE it pays: `resolveHomeCheckmate`
 * refuses to adjudicate before the invader's own `END_ACTION` has settled
 * upkeep (`homeCheckmate.ts:179`, the phase gate `needsProof` mirrors), so the
 * reply the prover has to refute is four actions with the defender's PRESENT
 * army — **no purchase budget, no pre-action promotions, no upkeep releases**.
 * `preparing` is therefore constantly `false` here, and there is no `prepare`
 * recursion at all. Both halves of Standard's `preparing = true` used to leak
 * into the replica's transitions (`make` consults this module), in opposite
 * directions: the rent term in the BOUND invented mates against a defender
 * that could not afford its own upkeep, and the promote/release arms of the
 * SEARCH invented defences that let real mates go unclaimed. See
 * `docs/hard-ai/phasing/M2-STATUS.md` §2.
 *
 * So this module reproduces, in order:
 *
 *   - `ready`: heal + reset the defender, `upkeepPending = 0`, action phase,
 *     `actionsRemaining = 4` (`getActionsPerTurn`, frozen at 4);
 *   - the admissible damage bound (`enoughPossibleDamage`, `preparing = false`)
 *     as `damageBound`, whose failure is an immediate MATE (`damage_bound`);
 *   - `act(ready, [])` directly, with the defender's units in BOARD ORDER —
 *     which is `PackedState.ord`, the canonical birth sequence, and NOT the slot
 *     index. Slot order agrees with the canonical array only until the first
 *     arrival reuses a dead slot; taking board order from the slot index instead
 *     was the round-5 defect (M2-STATUS §2.6), and it moved capped verdicts.
 *     Standard's distance sort of the owned list was a separate artefact of
 *     `prepare` rebuilding the board as `[...enemy, ...kept]`; Phasing's `act`
 *     sees the original array, so sorting it by anything here would reorder the
 *     candidate lists and move the node count;
 *   - inside `act`: the damage bound again, a transposition check, then every
 *     legal ATTACK (owned order, then stable-sorted by the target's distance to
 *     the occupied corner) and, while `actionsRemaining > 1`, every legal
 *     one-action MOVE (same ordering, destinations in canonical BFS discovery
 *     order);
 *   - the node accounting: ONE node per `act` node that survives the bound and
 *     the transposition set, and none for anything else — canonical spends a
 *     node only in `act` under Phasing, because `prepare` is never entered —
 *     with exhaustion sticky and never a win.
 *
 * The transposition key is the packed equivalent of `searchHomeDefense`'s
 * `key(s)` string: `actionsRemaining` plus, per living unit, its slot,
 * definition, square, damage, attack count, `lastAttackKilled` and the ORDERED
 * list of units it has attacked this turn. The last component is what
 * `PackedState` deliberately drops (RE §1.7a proves it redundant for
 * LEGALITY), so the prover carries its own `P_VICTIM` log: redundant for
 * legality, but not for reproducing the canonical prover's node count, because
 * two defenders swapping which of two enemies they killed reach the same
 * position under different canonical keys.
 *
 * Nothing here allocates per node: the working position, the per-depth
 * candidate lists, the BFS scratch and the transposition set are module-level
 * pools. Like `core/movement.ts`'s BFS scratch, the module is single-threaded
 * and NOT reentrant — `damageBound`, `homeVerdict` and `homeWitness` all
 * clobber the same working position.
 */
import {
  DEAD,
  F_LAST_KILLED,
  MAX_SLOTS,
  NO_SLOT,
  Result,
  type PackedState,
  type Side,
  type Slot,
  type Square,
} from '../types';
import { seededRandom } from '../../runtime';
import { Scratch } from '../core/bits';
import { ADJ_LIST, BOARD, CORNER, MANHATTAN } from '../core/tables';
import { NDEF, activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { AKind, paMake } from '../core/action';

/** `HomeDefense` as an integer (DESIGN §4.14). */
export const HomeVerdict = { RESCUE: 0, MATE: 1, UNKNOWN: 2 } as const;
export type HomeVerdict = (typeof HomeVerdict)[keyof typeof HomeVerdict];

/** `PROOF_NODES` (homeCheckmate.ts:22). */
export const PROOF_NODES = 20000;

/** `getActionsPerTurn` is frozen at 4 (rules.ts:11-13); `ready` always uses it. */
const READY_ACTIONS = 4;

/** `atkCount` is bounded by the actions, one per attack (combat.ts `canAttack`
 * has had no tier cap since `muju-phasing-4`), so by 4. */
const MAX_ATTACKS = READY_ACTIONS;

/** `act` starts with 4 actions and every action costs at least one. */
const MAX_ACT_DEPTH = 5;

/** `WorkClass.PROVER` (DESIGN §5.11.6: 40 units per full-prover call). */
export const WORK_CLASS_PROVER = 8;

/**
 * Structural stand-in for `search/time.ts WorkMeter` (M14). DESIGN §4.14 types
 * `homeVerdict`'s last parameter as `WorkMeter`, which does not exist until
 * M14 and which `tactics` could not import anyway (DESIGN §2: `tactics`
 * imports `core` and `tables`). The real `WorkMeter` satisfies this shape.
 */
export interface ProverMeter {
  spend(cls: number, n?: number): void;
}

/** Work and cutoff of the most recent `homeVerdict` / `homeWitness` call. */
export interface ProverStats {
  nodes: number;
  /** `true` when the search stopped at `maxNodes` (canonical `cutoffReason`). */
  cutoff: boolean;
  /** 0 = no occupier, 1 = damage bound, 2 = search (canonical `method`). */
  method: 0 | 1 | 2;
}

const STATS: ProverStats = { nodes: 0, cutoff: false, method: 0 };

/** Live view of the last call's work; the object is reused, never copied. */
export function proverStats(): Readonly<ProverStats> {
  return STATS;
}

// --- the working position ----------------------------------------------------

/** `sq` of every slot in the position under search; `DEAD` for released/killed. */
const P_SQ = new Uint8Array(MAX_SLOTS);
const P_DEF = new Uint8Array(MAX_SLOTS);
const P_OWN = new Uint8Array(MAX_SLOTS);
const P_DMG = new Uint8Array(MAX_SLOTS);
const P_ATK = new Uint8Array(MAX_SLOTS);
const P_LK = new Uint8Array(MAX_SLOTS);
/** `P_VICTIM[slot * MAX_ATTACKS + k]` = the slot this unit's k-th attack hit. */
const P_VICTIM = new Uint8Array(MAX_SLOTS * MAX_ATTACKS);
const P_AT = new Uint8Array(BOARD);

/**
 * The defender's units in `act`'s own order — `s.board.units.filter(owner ===
 * defender)`, which is canonical array order, i.e. ascending `PackedState.ord`
 * (see the module header). It is not sorted by anything ELSE: Standard's
 * distance sort belonged to `prepare`, which Phasing never enters, and imposing
 * any other order here would reorder every candidate list below it.
 */
const OWNED = new Int32Array(MAX_SLOTS);

const MAX_ATTACK_CANDIDATES = MAX_SLOTS * 4;
const MAX_MOVE_CANDIDATES = MAX_SLOTS * BOARD;
const ATTACK_CAND = new Int32Array(MAX_ACT_DEPTH * MAX_ATTACK_CANDIDATES);
const ATTACK_KEY = new Int32Array(MAX_ACT_DEPTH * MAX_ATTACK_CANDIDATES);
const MOVE_CAND = new Int32Array(MAX_ACT_DEPTH * MAX_MOVE_CANDIDATES);
const MOVE_KEY = new Int32Array(MAX_ACT_DEPTH * MAX_MOVE_CANDIDATES);

/** `distancesFrom` (movement.ts:240-257): distances, BFS queue, discovery order. */
const BFS_DIST = new Int8Array(BOARD);
const BFS_QUEUE = new Int32Array(BOARD);
const BFS_ORDER = new Int32Array(BOARD);

/** The act line of the current branch, one PA per applied action. */
const ACT_LINE = new Int32Array(MAX_ACT_DEPTH);
/** The act line of the successful branch, copied out by `homeWitness`. */
const WITNESS_ACT = new Int32Array(MAX_ACT_DEPTH);

/** `enoughPossibleDamage`'s knapsack: 3 rows (0..2 hits) x 5 columns (0..4 actions). */
const DP_ROWS = 3;
const DP_COLS = READY_ACTIONS + 1;
const DP_NEG = -0x40000000;
const DP_SCRATCH = new Int32Array(2 * DP_ROWS * DP_COLS);

// --- search state (module-level; the search is not reentrant) -----------------

let cat: Catalog = activeCatalog();
let occupierSlot = NO_SLOT;
let occupierSq = 0;
let defenderSide: Side = 0;
let actionsLeft = 0;
let slotLimit = 0;
let phasePlaying = true;
let nodes = 0;
let nodeLimit = 0;
let exhausted = false;
let collectWitness = false;
let witnessActLength = 0;
let ownedCount = 0;

// --- the transposition set ---------------------------------------------------

/**
 * Open-addressed set of 64-bit keys, cleared in O(1) by bumping a generation
 * stamp. The canonical prover's `failed` is a `Set<string>`; this is the same
 * set with the string replaced by the Zobrist pair below.
 */
class FailedSet {
  private mask = 0;
  // UNSIGNED lanes: `computeKey` produces `>>> 0` halves, and an `Int32Array`
  // would store every key with the high bit set as a negative number that no
  // subsequent `=== lo` comparison could ever match — a half-blind set that
  // silently re-expands transpositions and burns nodes the canonical prover
  // does not.
  private lo = new Uint32Array(0);
  private hi = new Uint32Array(0);
  private stamp = new Int32Array(0);
  private gen = 0;

  /** Sizes the table for `entries` insertions at a load factor of 1/4. */
  ensure(entries: number): void {
    let size = 1 << 16;
    while (size < entries * 4) size <<= 1;
    if (size <= this.mask + 1) return;
    this.mask = size - 1;
    this.lo = new Uint32Array(size);
    this.hi = new Uint32Array(size);
    this.stamp = new Int32Array(size);
    this.gen = 0;
  }

  reset(): void {
    this.gen++;
    if (this.gen >= 0x7fffffff) {
      this.stamp.fill(0);
      this.gen = 1;
    }
  }

  private probe(lo: number, hi: number): number {
    let i = ((Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi, 0x85ebca6b)) >>> 0) & this.mask;
    for (;;) {
      if (this.stamp[i] !== this.gen) return i;
      if (this.lo[i] === lo && this.hi[i] === hi) return i;
      i = (i + 1) & this.mask;
    }
  }

  has(lo: number, hi: number): boolean {
    return this.stamp[this.probe(lo, hi)] === this.gen;
  }

  add(lo: number, hi: number): void {
    const i = this.probe(lo, hi);
    this.stamp[i] = this.gen;
    this.lo[i] = lo;
    this.hi[i] = hi;
  }
}

const FAILED = new FailedSet();

// --- the transposition key ---------------------------------------------------

/** Distinct from `ZOBRIST_SEED`: this key is SLOT-keyed, the position keys are not. */
const PROVER_SEED = 0x50524f56; // "PROV"
/** `damage` is a byte in `PackedState`; give the table its whole domain. */
const DAMAGE_VALUES = 256;
/** `atkCount` is 0..4; 8 leaves room for a malformed fixture. */
const ATK_VALUES = 8;

function randomTable(rng: () => number, entries: number): Uint32Array {
  const out = new Uint32Array(entries * 2);
  for (let i = 0; i < out.length; i++) out[i] = (rng() * 0x100000000) >>> 0;
  return out;
}

const PZ = (() => {
  const rng = seededRandom(PROVER_SEED);
  return {
    sq: randomTable(rng, MAX_SLOTS * BOARD),
    def: randomTable(rng, MAX_SLOTS * NDEF),
    dmg: randomTable(rng, MAX_SLOTS * DAMAGE_VALUES),
    atk: randomTable(rng, MAX_SLOTS * ATK_VALUES),
    lastKill: randomTable(rng, MAX_SLOTS),
    victim: randomTable(rng, MAX_SLOTS * MAX_ATTACKS * MAX_SLOTS),
    actions: randomTable(rng, READY_ACTIONS + 1),
  };
})();

let keyLo = 0;
let keyHi = 0;

function mix(table: Uint32Array, index: number): void {
  keyLo = (keyLo ^ table[index * 2]) >>> 0;
  keyHi = (keyHi ^ table[index * 2 + 1]) >>> 0;
}

/**
 * The packed equivalent of `searchHomeDefense`'s `key(s)`: `actionsRemaining`
 * and, per living unit, (slot, definition, square, damage, attack count,
 * `lastAttackKilled`, ordered attacked slots).
 *
 * The canonical key is keyed by `indices` — the unit's index in the ROOT
 * position's `state.board.units` (homeCheckmate.ts:90), fixed for the whole
 * search — and this one is keyed by the slot, also fixed for the whole search.
 * Slot and canonical index are therefore related by a bijection (`ord`), and
 * BOTH keys are invariant under relabelling through it, so the two sets
 * distinguish exactly the same pairs of nodes and fold exactly the same
 * transpositions. Note this key is an XOR and so does not depend on the
 * iteration ORDER either; canonical's is a `join` over the current array, which
 * within one search differs from this only by a fixed permutation. The one place
 * canonical order is genuinely load-bearing is `buildOwned`'s candidate order.
 */
function computeKey(): void {
  keyLo = 0;
  keyHi = 0;
  mix(PZ.actions, actionsLeft);
  for (let slot = 0; slot < slotLimit; slot++) {
    const s = P_SQ[slot];
    if (s === DEAD) continue;
    mix(PZ.sq, slot * BOARD + s);
    mix(PZ.def, slot * NDEF + P_DEF[slot]);
    mix(PZ.dmg, slot * DAMAGE_VALUES + P_DMG[slot]);
    const count = P_ATK[slot];
    mix(PZ.atk, slot * ATK_VALUES + (count < ATK_VALUES ? count : ATK_VALUES - 1));
    if (P_LK[slot] !== 0) mix(PZ.lastKill, slot);
    // Only the defender's units attack inside the prover, so only their logs
    // move; an invader's `attackedThisTurn` is constant across every node and
    // contributes a constant substring to the canonical key, exactly as its
    // (also constant) `atkCount` does.
    if (P_OWN[slot] !== defenderSide) continue;
    const limit = count < MAX_ATTACKS ? count : MAX_ATTACKS;
    for (let k = 0; k < limit; k++) {
      mix(PZ.victim, (slot * MAX_ATTACKS + k) * MAX_SLOTS + P_VICTIM[slot * MAX_ATTACKS + k]);
    }
  }
}

// --- helpers -----------------------------------------------------------------

/** Stable insertion sort of `cand[base..base+n)` by `key`, ascending. */
function stableSort(cand: Int32Array, key: Int32Array, base: number, n: number): void {
  for (let i = 1; i < n; i++) {
    const value = cand[base + i];
    const k = key[base + i];
    let j = i - 1;
    while (j >= 0 && key[base + j] > k) {
      cand[base + j + 1] = cand[base + j];
      key[base + j + 1] = key[base + j];
      j--;
    }
    cand[base + j + 1] = value;
    key[base + j + 1] = k;
  }
}

/** `canAttack` (combat.ts) on the working position: no tier cap since
 * `muju-phasing-4`. Defenders always can act. */
function canAttack(slot: Slot): boolean {
  return P_ATK[slot] === 0 || P_LK[slot] !== 0;
}

/** `true` when `slot` has already attacked `victim` this turn (getValidAttacks). */
function alreadyAttacked(slot: Slot, victim: Slot): boolean {
  const count = P_ATK[slot];
  const limit = count < MAX_ATTACKS ? count : MAX_ATTACKS;
  for (let k = 0; k < limit; k++) if (P_VICTIM[slot * MAX_ATTACKS + k] === victim) return true;
  return false;
}

/**
 * `distancesFrom` + `reachable` (movement.ts:240-261): BFS over unoccupied
 * squares with the canonical up/down/left/right expansion, writing the
 * DISCOVERY order into `BFS_ORDER` and returning how many squares it found.
 * The discovery order is the order `getValidMoves` returns, and the prover's
 * stable sort keeps it as the tiebreak.
 */
function reachableFrom(origin: Square): number {
  BFS_DIST.fill(-1);
  BFS_DIST[origin] = 0;
  BFS_QUEUE[0] = origin;
  let head = 0;
  let tail = 1;
  let found = 0;
  while (head < tail) {
    const s = BFS_QUEUE[head++];
    const x = s % 10;
    const y = (s / 10) | 0;
    const d = BFS_DIST[s] + 1;
    for (let k = 0; k < 4; k++) {
      const n = k === 0 ? (y > 0 ? s - 10 : -1) : k === 1 ? (y < 9 ? s + 10 : -1) : k === 2 ? (x > 0 ? s - 1 : -1) : x < 9 ? s + 1 : -1;
      if (n < 0 || P_AT[n] !== NO_SLOT || BFS_DIST[n] >= 0) continue;
      BFS_DIST[n] = d;
      BFS_QUEUE[tail++] = n;
      BFS_ORDER[found++] = n;
    }
  }
  return found;
}

// --- the damage bound --------------------------------------------------------

/**
 * `enoughPossibleDamage(state, target, false)` (homeCheckmate.ts:28-50) on the
 * working position.
 *
 * The third argument is `!isPhasing(state)` at the one canonical call site
 * (homeCheckmate.ts:78) and this replica is Phasing-only, so it is constantly
 * `false` and the `preparing` arms are not written down: `rent` is 0 (and so
 * never exceeds a non-negative bank, which `check` guarantees), and the
 * promoted-attacker choice does not exist. What remains of the canonical
 * function with `preparing === false` is exactly the loop below.
 *
 * `dp` holds two 3x5 knapsack planes (`power` and `updated`); the caller owns
 * it so the public `damageBound` can take its buffer from the per-ply
 * `Scratch` DESIGN §4.14 hands it.
 */
function damageBoundCore(dp: Int32Array): boolean {
  const actions = actionsLeft;
  const cur = 0;
  const next = DP_ROWS * DP_COLS;
  for (let i = 0; i < DP_ROWS * DP_COLS; i++) dp[cur + i] = DP_NEG;
  dp[cur] = 0;

  const victimDef = P_DEF[occupierSlot];
  for (let slot = 0; slot < slotLimit; slot++) {
    if (P_SQ[slot] === DEAD || P_OWN[slot] !== defenderSide) continue;
    if (!canAttack(slot) || alreadyAttacked(slot, occupierSlot)) continue;
    const def = P_DEF[slot];
    for (let i = 0; i < DP_ROWS * DP_COLS; i++) dp[next + i] = dp[cur + i];

    const s = P_SQ[slot];
    const raw = MANHATTAN[s * BOARD + occupierSq] - 1;
    const distance = raw > 0 ? raw : 0;
    const speed = cat.spd[def];
    const cost = distance === 0 ? 1 : speed > 0 ? (((distance + speed - 1) / speed) | 0) + 1 : Infinity;
    const power = cat.power[powerIndex(defenderSide, def, victimDef)];
    for (let hits = 1; hits <= 2; hits++) {
      for (let used = cost; used <= actions; used++) {
        const from = dp[cur + (hits - 1) * DP_COLS + (used - cost)];
        if (from === DP_NEG) continue;
        const candidate = from + power;
        if (candidate > dp[next + hits * DP_COLS + used]) dp[next + hits * DP_COLS + used] = candidate;
      }
    }
    for (let i = 0; i < DP_ROWS * DP_COLS; i++) dp[cur + i] = dp[next + i];
  }

  const baseDef = cat.def[victimDef];
  const damage = P_DMG[occupierSlot];
  const needed = baseDef - damage > 0 ? baseDef - damage : 0;
  for (let hits = 1; hits < DP_ROWS; hits++) {
    for (let used = 0; used < DP_COLS; used++) {
      if (dp[cur + hits * DP_COLS + used] >= needed) return true;
    }
  }
  return false;
}

// --- loading the `ready` position --------------------------------------------

/** `getHomeOccupier(board, invader)` (victory.ts:103-106) as a slot, or `NO_SLOT`. */
function occupierOf(p: PackedState, invader: Side): Slot {
  const slot = p.pieceAt[CORNER[1 - invader]];
  if (slot === NO_SLOT || p.owner[slot] !== invader) return NO_SLOT;
  return slot;
}

/**
 * Loads `ready` (homeCheckmate.ts:73-74): the defender heals, its attack
 * history and placement marks clear, `upkeepPending` goes to 0 and the turn
 * becomes the defender's action phase with four actions.
 */
function loadReady(p: PackedState, invader: Side): void {
  cat = activeCatalog();
  defenderSide = (1 - invader) as Side;
  slotLimit = p.slotCount < MAX_SLOTS ? p.slotCount : MAX_SLOTS;
  actionsLeft = READY_ACTIONS;
  phasePlaying = p.result === Result.ONGOING;
  P_AT.fill(NO_SLOT);
  for (let slot = 0; slot < slotLimit; slot++) {
    const s = p.sq[slot];
    P_SQ[slot] = s;
    if (s === DEAD) continue;
    const owner = p.owner[slot];
    P_DEF[slot] = p.defId[slot];
    P_OWN[slot] = owner;
    P_AT[s] = slot;
    if (owner === defenderSide) {
      P_DMG[slot] = 0;
      P_ATK[slot] = 0;
      P_LK[slot] = 0;
    } else {
      P_DMG[slot] = p.damage[slot];
      P_ATK[slot] = p.atkCount[slot];
      P_LK[slot] = (p.uflags[slot] & F_LAST_KILLED) !== 0 ? 1 : 0;
    }
  }
}

/**
 * `owned = s.board.units.filter(u => u.owner === defender)` (homeCheckmate.ts:101)
 * — CANONICAL ARRAY ORDER, and no distance sort (Standard's belonged to
 * `prepare`, which Phasing never enters). `act` recomputes this filter at every
 * node; the list is built once here instead because no defender unit is ever
 * added or removed inside `act` (only the invader's bodies die there), and the
 * `DEAD` guards at the use sites keep that assumption honest.
 *
 * Canonical array order is `PackedState.ord`, NOT the slot index. Round 4 used
 * the slot index on the argument that "`pack` assigns slot `i` to
 * `board.units[i]`", which is true of a freshly packed state and false of every
 * state reached incrementally through an arrival that reused a dead slot — the
 * round-5 defect. Only the ORDER is read here, so the sort is by `ord` and never
 * by the slot that breaks a tie (`Replica.check` forbids a tie).
 */
function buildOwned(p: PackedState): void {
  ownedCount = 0;
  for (let slot = 0; slot < slotLimit; slot++) {
    if (P_SQ[slot] === DEAD || P_OWN[slot] !== defenderSide) continue;
    OWNED[ownedCount++] = slot;
  }
  // Insertion sort: `ownedCount` is a side's living army (≤ 100, in practice a
  // handful) and this runs once per full-prover call, not once per node.
  for (let i = 1; i < ownedCount; i++) {
    const value = OWNED[i];
    const key = p.ord[value];
    let j = i - 1;
    while (j >= 0 && p.ord[OWNED[j]] > key) {
      OWNED[j + 1] = OWNED[j];
      j--;
    }
    OWNED[j + 1] = value;
  }
}

// --- act ---------------------------------------------------------------------

/** `spend()` (homeCheckmate.ts:80-85): sticky exhaustion at the node cap. */
function spend(): boolean {
  if (nodes >= nodeLimit) {
    exhausted = true;
    return false;
  }
  nodes++;
  return true;
}

function act(depth: number): boolean {
  if (P_SQ[occupierSlot] === DEAD) {
    if (collectWitness) {
      witnessActLength = depth;
      for (let i = 0; i < depth; i++) WITNESS_ACT[i] = ACT_LINE[i];
    }
    return true;
  }
  if (!phasePlaying || !damageBoundCore(DP_SCRATCH)) return false;
  computeKey();
  const lo = keyLo;
  const hi = keyHi;
  if (FAILED.has(lo, hi)) return false;
  if (!spend()) return false;

  const attackBase = depth * MAX_ATTACK_CANDIDATES;
  let attacks = 0;
  // `isLegalAction` rejects every ATTACK/MOVE at zero actions (legality.ts:37).
  if (actionsLeft > 0) {
    for (let i = 0; i < ownedCount; i++) {
      const slot = OWNED[i];
      if (P_SQ[slot] === DEAD || !canAttack(slot)) continue;
      const s = P_SQ[slot];
      for (let k = 0; k < 4; k++) {
        const q = ADJ_LIST[s * 4 + k];
        if (q < 0) continue;
        const victim = P_AT[q];
        if (victim === NO_SLOT || P_OWN[victim] === defenderSide) continue;
        if (alreadyAttacked(slot, victim)) continue;
        ATTACK_CAND[attackBase + attacks] = slot * BOARD + q;
        ATTACK_KEY[attackBase + attacks] = MANHATTAN[q * BOARD + occupierSq];
        attacks++;
      }
    }
    stableSort(ATTACK_CAND, ATTACK_KEY, attackBase, attacks);
  }

  for (let i = 0; i < attacks; i++) {
    const encoded = ATTACK_CAND[attackBase + i];
    const slot = (encoded / BOARD) | 0;
    const target = encoded % BOARD;
    const victim = P_AT[target];
    const victimDef = P_DEF[victim];
    const power = cat.power[powerIndex(defenderSide, P_DEF[slot], victimDef)];
    const baseDef = cat.def[victimDef];
    const effective = baseDef - P_DMG[victim] > 0 ? baseDef - P_DMG[victim] : 0;
    const lethal = power >= effective;

    const count = P_ATK[slot];
    const oldLastKill = P_LK[slot];
    const oldDamage = P_DMG[victim];
    if (count < MAX_ATTACKS) P_VICTIM[slot * MAX_ATTACKS + count] = victim;
    P_ATK[slot] = count + 1;
    P_LK[slot] = lethal ? 1 : 0;
    if (lethal) {
      P_AT[target] = NO_SLOT;
      P_SQ[victim] = DEAD;
    } else {
      P_DMG[victim] = oldDamage + power;
    }
    actionsLeft--;
    if (collectWitness) ACT_LINE[depth] = paMake(AKind.ATTACK, slot, target, 0);
    const rescued = act(depth + 1);
    actionsLeft++;
    if (lethal) {
      P_SQ[victim] = target;
      P_AT[target] = victim;
    } else {
      P_DMG[victim] = oldDamage;
    }
    P_ATK[slot] = count;
    P_LK[slot] = oldLastKill;
    if (rescued) return true;
    if (exhausted) return false;
  }

  if (actionsLeft > 1) {
    const moveBase = depth * MAX_MOVE_CANDIDATES;
    let moves = 0;
    for (let i = 0; i < ownedCount; i++) {
      const slot = OWNED[i];
      const from = P_SQ[slot];
      if (from === DEAD) continue;
      const speed = cat.spd[P_DEF[slot]];
      const found = reachableFrom(from);
      for (let j = 0; j < found; j++) {
        const to = BFS_ORDER[j];
        if (BFS_DIST[to] > speed) continue;
        MOVE_CAND[moveBase + moves] = slot * BOARD + to;
        MOVE_KEY[moveBase + moves] = MANHATTAN[to * BOARD + occupierSq];
        moves++;
      }
    }
    stableSort(MOVE_CAND, MOVE_KEY, moveBase, moves);

    for (let i = 0; i < moves; i++) {
      const encoded = MOVE_CAND[moveBase + i];
      const slot = (encoded / BOARD) | 0;
      const to = encoded % BOARD;
      const from = P_SQ[slot];
      P_AT[from] = NO_SLOT;
      P_SQ[slot] = to;
      P_AT[to] = slot;
      actionsLeft--;
      if (collectWitness) ACT_LINE[depth] = paMake(AKind.MOVE, slot, to, 1);
      const rescued = act(depth + 1);
      actionsLeft++;
      P_AT[to] = NO_SLOT;
      P_SQ[slot] = from;
      P_AT[from] = slot;
      if (rescued) return true;
      if (exhausted) return false;
    }
  }

  FAILED.add(lo, hi);
  return false;
}

// --- the public surface ------------------------------------------------------

/**
 * The `resolveHomeCheckmate` short-circuit (homeCheckmate.ts:171-176), DESIGN
 * §3.4: the mover occupies the enemy corner, the opponent does not occupy the
 * mover's, `victoryRule !== 'elimination'`, no pending upkeep — and the game
 * is still running.
 */
export function needsProof(p: PackedState): boolean {
  if (p.result !== Result.ONGOING) return false;
  if (p.victoryHome !== 1 || p.upkeepPending === 1) return false;
  if (occupierOf(p, p.side) === NO_SLOT) return false;
  return occupierOf(p, (1 - p.side) as Side) === NO_SLOT;
}

/**
 * `enoughPossibleDamage(ready, occupier, !isPhasing(state))`
 * (homeCheckmate.ts:78, third argument FALSE under Phasing): the optimistic
 * bound whose FAILURE proves the mate. `true` when the defender could
 * conceivably remove the occupier, so it can only ever under-claim a mate. With
 * no occupier there is nothing to remove and the bound is trivially satisfied.
 */
export function damageBound(p: PackedState, invader: Side, sc: Scratch, ply: number): boolean {
  const slot = occupierOf(p, invader);
  if (slot === NO_SLOT) return true;
  loadReady(p, invader);
  occupierSlot = slot;
  occupierSq = P_SQ[slot];
  return damageBoundCore(sc.i32(ply, 0));
}

function runProver(p: PackedState, invader: Side, maxNodes: number, dp: Int32Array): number {
  STATS.nodes = 0;
  STATS.cutoff = false;
  STATS.method = 0;
  witnessActLength = 0;

  const slot = occupierOf(p, invader);
  if (slot === NO_SLOT) return HomeVerdict.RESCUE;

  loadReady(p, invader);
  occupierSlot = slot;
  occupierSq = P_SQ[slot];
  if (!damageBoundCore(dp)) {
    STATS.method = 1;
    return HomeVerdict.MATE;
  }

  STATS.method = 2;
  buildOwned(p);
  nodes = 0;
  nodeLimit = maxNodes;
  exhausted = false;
  FAILED.ensure(maxNodes);
  FAILED.reset();
  // `isPhasing(state) ? act(ready, []) : prepare(...)` (homeCheckmate.ts:160).
  // ACT-ONLY, and no node is spent getting here: canonical's `spend()` is called
  // from `prepare` and from `act`, and Phasing never enters `prepare`.
  const rescued = act(0);
  STATS.nodes = nodes;
  STATS.cutoff = exhausted;
  return rescued ? HomeVerdict.RESCUE : exhausted ? HomeVerdict.UNKNOWN : HomeVerdict.MATE;
}

/** The prover's own per-ply pool, for callers that have none (`homeWitness`). */
const OWN_SCRATCH = new Scratch(1, 0, 0, 1);

/**
 * `analyzeHomeDefense(state, invader, transitionWithoutCheckmate, maxNodes)`
 * (homeCheckmate.ts:57) on the packed state, node for node.
 */
export function homeVerdict(
  p: PackedState,
  invader: Side,
  maxNodes: number,
  sc: Scratch,
  ply: number,
  meter?: ProverMeter,
): number {
  if (meter !== undefined) meter.spend(WORK_CLASS_PROVER, 1);
  collectWitness = false;
  return runProver(p, invader, maxNodes, sc.i32(ply, 0));
}

/**
 * The defender's rescuing line as PAs, or 0 when no rescue is proved
 * (`analyzeHomeDefenseEvidence`'s `witness`, homeCheckmate.ts:64).
 *
 * Under Phasing the canonical witness is the ACT LINE and nothing else:
 * `witness = line` is assigned inside `act` (homeCheckmate.ts:96) and Phasing
 * calls `act(ready, [])` with no wrapper, so there is no `PAY_UPKEEP`, no
 * promotion prefix and no `END_PLACE`. Replayed from
 * `{...state, board: resetUnitActions(board, defender), upkeepPending: false,
 * turn: {currentPlayer: defender, phase: 'action', actionsRemaining: 4}}` —
 * canonical's `ready` — it is legal action by action and removes the occupier.
 */
export function homeWitness(p: PackedState, invader: Side, maxNodes: number, out: Int32Array): number {
  collectWitness = true;
  const verdict = runProver(p, invader, maxNodes, OWN_SCRATCH.i32(0, 0));
  collectWitness = false;
  // A `RESCUE` from `method: 'no_occupier'` has nothing to rescue and no line.
  if (verdict !== HomeVerdict.RESCUE || STATS.method !== 2) return 0;
  for (let i = 0; i < witnessActLength; i++) out[i] = WITNESS_ACT[i];
  return witnessActLength;
}
