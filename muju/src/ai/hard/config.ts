/**
 * `HardConfig` and the four device profiles (DESIGN §4.17, §6.3, §8).
 *
 * DESIGN §4 exports the component config shapes from the modules that consume
 * them (`SearchConfig`/`QuiesceConfig`/`TimeConfig`/`DeviceProfile` from
 * `search/*`, `GenConfig`/`ActionSearchConfig`/`PurchaseConfig` from `gen/*`,
 * `DfpnConfig` from `tactics/dfpn.ts`, `Weights` from `eval/weights.ts`,
 * `Book` from `book/format.ts`). `HardConfig extends SearchConfig` and embeds
 * all of them, but DESIGN §2's layering lets `config.ts` import `types.ts` and
 * nothing else — importing `search`/`gen`/`eval`/`book` from here would be a
 * layering violation (and a cycle: those layers import `config`). The shapes
 * are therefore DECLARED here, once, and the modules DESIGN names MUST
 * re-export them (`export type { SearchConfig } from '../config'`) so §4's
 * stated export sites stay exact. See DEVIATIONS.md under M4.
 *
 * Numbers are DESIGN §8's table and §6.3's profile table. Two groups are
 * provisional and owned by a later milestone, marked PROVISIONAL below:
 * `PurchaseWeights` (M13 `gen/purchase.ts`; DESIGN §5.5 names the terms but
 * gives no coefficients) and `weights` (M12 `eval/weights.ts` supplies
 * `DEFAULT_WEIGHTS`; until then every feature weight is 0 and only the
 * `cost × 100` material priors of F9 are populated).
 */

/**
 * DESIGN §6.4's RELEASE flag: whether difficulty "Hard" runs the real
 * `HardEngine` for an ordinary player. `false` through E5 (`HardEngine` was
 * reachable only through `src/ai/hardOptIn.ts`'s development opt-in); **true**
 * as of the E6 release decision of 2026-09-18, evidence in
 * `docs/hard-ai/RELEASE-2026-09-18.md`.
 *
 * It is a routing flag and NOTHING else. No search, evaluation, profile,
 * weight or arm reads it — `resolvedConfigHash('hard@desktop', ...)`
 * (`lab/hard-ai/ladder/identity.ts`) hashes the resolved ENGINE configuration
 * and is unmoved by this constant, so every ladder row measured before the
 * flip still names the engine that ships. The only reader is
 * `src/ai/hardOptIn.ts`'s `resolveHardAiRoute()`, which `useAI.ts` consults
 * once per game; the worker still never reads a global flag, only the
 * `engine` field of the request it is handed (`worker/protocol.ts`).
 *
 * Opting OUT stays available and wins over this flag: `?hardAi=0` on the page
 * URL, or `localStorage['muju.hardAi'] = '0'`, routes Hard back to the legacy
 * `AIEngineV2` (`hardOptIn.ts`).
 */
// Annotated `boolean`, not left to infer the literal `true`: a revert to
// `false` must stay a one-character edit rather than turning every
// `hardEnabled || ...` into code TypeScript can prove unreachable.
export const hardEnabled: boolean = true;

// --- gen/actionsearch.ts ---
export interface ActionSearchConfig {
  /** per-action-index beam widths, ET §3.5. */
  widths: Int32Array;
  keep: number;
  ttBits: number;
}

// --- gen/purchase.ts ---
export interface PurchaseWeights {
  mineCc: number;
  safeCc: number;
  blockCc: number;
  strikeCc: number;
  anchorCc: number;
  zeroSpawnCc: number;
  liquidityCc: number;
  homeRaceCc: number;
}

export interface PurchaseConfig {
  maxBodies: number;
  maxMultisets: number;
  maxPlans: number;
  /** top-S squares of `spawn.legal` considered per multiset. */
  squares: number;
  keepPerMultiset: number;
  weights: PurchaseWeights;
}

// --- gen/generate.ts ---
export interface GenConfig {
  K: number;
  maxPlacePlans: number;
  action: ActionSearchConfig;
  purchase: PurchaseConfig;
  maxPromotions: number;
  reference: boolean;
}

// --- tactics/dfpn.ts ---
export interface DfpnConfig {
  maxTurns: number;
  /** Absolute cap; `search/root.ts` further clamps it to `meter.limit / 16` (DESIGN §8). */
  nodeBudget: number;
  /** ε in Q2 fixed point: 5 = 1.25. */
  epsilonQ2: number;
  ttBits: number;
}

// --- search/quiesce.ts ---
export interface QuiesceConfig {
  maxPly: number;
  deltaMarginCc: number;
  maxCandidates: number;
}

// --- search/time.ts ---
export interface DeviceProfile {
  unitsPerMs: number;
  samples: number;
}

export interface TimeConfig {
  minMs: number;
  maxMs: number;
  baseMs: number;
  abortFactor: number;
  /**
   * E1.5, the E1.4 §5 patch, OFF everywhere by default. When true, a
   * wall-funded `searchTurn` on an engine whose profile has measured nothing
   * (`profile.samples === 0`) runs `HardEngine.calibrate()` once before it
   * picks the work rung, so the first search is sized for the box instead of
   * for `INITIAL_UNITS_PER_MS`.
   *
   * OPTIONAL, AND ABSENT MEANS FALSE. Writing `calibrateCold: false` into
   * `makeConfig` would put the key into every resolved configuration and so
   * change `hard@desktop`'s configuration hash
   * (`lab/hard-ai/ladder/identity.ts` serialises the whole `HardConfig`;
   * `tests/lab/ablate.test.ts` pins the hash at
   * `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`), which
   * would make the frozen champion a different engine for no behaviour change
   * and orphan every E1 row measured under it. The field is therefore left
   * UNSET on every shipped shape — `canonicalJson` drops a key that is not
   * there — and only `hard@ablate:calib` sets it. Read it as `=== true`.
   */
  calibrateCold?: boolean;
  /**
   * E2 lane 1's work-fit arm, OFF everywhere by default. Which WORK LADDER
   * `search/time.ts chooseWork` quantises the rung onto: absent (the shipped
   * champion) is `WORK_LADDER`, `25e3 × 2^k`; `'sqrt2'` is
   * `WORK_LADDER_FINE`, the same ladder interleaved at √2 so no budget can
   * leave more than 29% of itself unspent instead of 50%.
   *
   * OPTIONAL, AND ABSENT MEANS THE ×2 LADDER, for the same reason
   * `calibrateCold` is optional: `canonicalJson` drops a key that is not
   * there, so an unset field leaves `hard@desktop`'s configuration hash at
   * `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd` and the
   * frozen champion stays the engine every E1 row was measured under
   * (`tests/lab/ablate.test.ts`). Only `hard@ablate:work-fit` sets it.
   *
   * A STRING AND NOT THE NUMBER 2 / √2: the rung has to be identical on every
   * box (DESIGN F18), and a ladder computed as `25e3 × step^k` would put
   * `Math.pow` on a float in the middle of that promise. The named ladders are
   * integer literals.
   */
  ladderStep?: 'sqrt2';
}

// --- eval/weights.ts ---
export interface Weights {
  /** [FEATURE_COUNT] cc. */
  w: Int32Array;
  /** [NDEF] cc material priors — `cost × 100`, no rent term (DESIGN F9). */
  material: Int32Array;
  version: number;
  label: string;
}

// --- book/format.ts ---
export interface BookEntry {
  keyLo: number;
  keyHi: number;
  turnLo: number;
  turnHi: number;
  /** bit0 negated, bit1 exact. */
  flags: number;
  score: number;
  count: number;
}

export interface Book {
  lookup(lo: number, hi: number): BookEntry | null;
  size: number;
  handicap: number;
  mapHash: number;
  weightsVersion: number;
}

// --- search/{order,root}.ts (E4.2 lane 3) ---
/**
 * The E4 SEARCH flags. Each turns ONE named search behaviour into a proposed
 * alternative, and each is OFF everywhere by default.
 *
 * OPTIONAL, AND ABSENT MEANS THE CHAMPION'S BEHAVIOUR — the same contract
 * `time.calibrateCold`, `time.ladderStep`, `iterationGate` and `evalFix` carry,
 * and for the same reason: `lab/hard-ai/ladder/identity.ts canonicalJson` DROPS
 * a key whose value is `undefined`, so a block that `makeConfig` never writes
 * leaves `hard@desktop`'s resolved configuration hash at
 * `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`
 * (`tests/lab/ablate.test.ts` pins it) and the frozen champion stays the engine
 * every E1/E2/E3 row was measured under. Writing `searchFix: {}` into a profile
 * would put the key INTO the serialisation and move that hash for no behaviour
 * change, so no profile carries it; only `hard@ablate:search-*` arms set it.
 * Every read is against the named value (`=== true` for booleans), never
 * against truthiness.
 *
 * WHERE IT IS READ. `HardConfig extends SearchConfig`, and `search/pvs.ts`'s
 * `SearchContext.cfg` IS the `SearchConfig` the engine resolved, so
 * `search/order.ts` and `search/root.ts` take the block from `s.cfg.searchFix`
 * the way the four `evalFix` readers take theirs from `NodeTables.evalFix`. No
 * signature in DESIGN §4.16 changes.
 */
export interface SearchFix {
  /**
   * E4.2 lane 3. How the ROOT resolves two candidates whose SEARCHED scores are
   * equal (`docs/hard-ai/e4/E4.2-LEAF-TIE.md`).
   *
   *   absent (the champion) — nothing resolves them explicitly.
   *     `search/pvs.ts rootIteration` keeps the first candidate in the ordering
   *     on a strict `score > best`, and `search/order.ts scoreTurns` puts the
   *     transposition table's move first with `ORDER_TT` (+2,000,000), so on a
   *     total tie the root returns the PREVIOUS iteration's best. The answer at
   *     a tie is then a function of whichever iteration last broke one — at
   *     `g2-s20_3_15-A-white` white t3 the depth-2 verdict, re-served unchanged
   *     by the depth-3 iteration in which all 28 candidates score 1,870 cc.
   *   `'end-key'` — at ply 0 the `ORDER_TT` bonus is WITHHELD and candidates
   *     that tie on the ordering score are ordered by their canonical end key
   *     (`Turn.endHi`, then `Turn.endLo`, unsigned, ascending). The root's list
   *     order — and so its answer whenever the searched scores tie — becomes a
   *     function of the POSITION alone instead of of the search's own history.
   *     Ply >= 1 is untouched, so the TT move still leads every interior node,
   *     where its cutoffs are actually earned; what the root gives up is
   *     searching the previous iteration's best first.
   */
  tieBreak?: 'end-key';

  /**
   * E4.3 candidate B, lane 5. Replaces DESIGN §5.11.2's "start the next
   * iteration while `used ≤ 0.45 × limit`" — and E2 lane 1's `predicted`
   * gate, a single previous-iteration cost ratio clamped at 6 — with a
   * per-STEP prediction taken from this turn's own completed iterations, with
   * the previous wall-funded turn's measurement of the same step as a prior;
   * and, when the next iteration is predicted not to fit, spends the remainder
   * of the rung on a partial iteration that may publish only if it completed
   * its principal variation. The rule is stated in full at
   * `search/pvs.ts iterFitVerdict` and in `docs/hard-ai/e4/E4.3-ITER-FIT.md`.
   *
   * It moves fixed-work output when ON (it changes how many iterations are
   * funded at a given rung), so the arm carries its own determinism pin; the
   * champion, with the key absent, is byte-identical.
   */
  iterFit?: boolean;

  /**
   * E4.3 candidate C, lane 8. A second-level memo for the movement BFS
   * (`core/movement.ts ReachMemo`), shared by every `DistanceCache` the engine
   * owns — the per-ply `NodeTables`, the `Evaluator`'s own tables and the
   * `Replica`'s — so that a `(occupancy, origin)` or `(occupancy, sources)`
   * pair computed at one ply is not recomputed at another, and so that
   * multi-source calls are cached at all (they never have been).
   *
   * IT IS A PURE OPTIMISATION AND MUST NEVER MOVE OUTPUT. `bfsFrom` and
   * `bfsMulti` are pure functions of their inputs; the memo verifies the whole
   * key on every probe (four occupancy words plus the origin square or the
   * four source words), so a hit returns exactly the bytes the BFS it replaces
   * would have written, and it is consulted only AFTER the existing per-tables
   * cache misses, so that cache's own behaviour — its `occHash` key included —
   * is unchanged. Fixed-work output with the flag on is identical to the
   * flag-absent output on all 48 `hard:cross-commit` rows
   * (`docs/hard-ai/e4/E4.3-REACH-CACHE.md`); the champion's determinism pin is
   * untouched and the arm needs none of its own.
   *
   * Cost when ON: 16.6 MB per engine, allocated once at construction. Cost
   * when absent: nothing — no memo is allocated and every `DistanceCache` is
   * constructed exactly as before.
   */
  reachCache?: boolean;

  /**
   * E4.3 candidate A, the P8 rescue cap (`docs/hard-ai/e3/P8-SLOW-TURNS.md`
   * §6, `docs/hard-ai/e4/E4.3-RESCUE-CAP.md`). The maximum number of DESIGN
   * §5.6 injection-4 rescue witnesses (`tactics/prover.ts homeWitness`, taken
   * structurally through `gen/generate.ts setRescueWitness`) that ONE
   * `HardEngine.searchTurn` may run, across every generator and every node of
   * that turn.
   *
   * ABSENT MEANS NO CAP — the champion's behaviour, in which the injection is
   * unbounded and unmetered: on the P8 home race it ran 92 witnesses of 683 ms
   * each, every one of them stopping at the prover's `PROOF_NODES` cutoff
   * without proving a rescue, for 62.8 s of a single 82.2 s fixed:100,000
   * search. A positive value caps those calls, prices each one it allows
   * through `WorkClass.PROVER`, and marks the generation whose call it refused
   * so the node cannot publish to the transposition table (the P6 lane-9
   * shape). Only `hard@ablate:search-rescue-cap` sets it.
   */
  rescueCap?: number;
}

// --- search/pvs.ts ---
export interface SearchConfig {
  maxDepth: number;
  aspirationCc: number;
  lmrRank1: number;
  lmrRank2: number;
  futilityMarginCc: number;
  useLmr: boolean;
  useAspiration: boolean;
  useFutility: boolean;
  useExtensions: boolean;
  quiesce: QuiesceConfig;
  gen: GenConfig;
  genInterior: GenConfig;
  ttBits: number;
  dfpn: DfpnConfig;
  useDfpn: boolean;
  /**
   * E2 lane 1's deepening gate, OFF everywhere by default. Which rule
   * `search/pvs.ts iterativeDeepening` uses to decide whether to START the
   * next iteration:
   *
   *   absent / `'fixed45'` — DESIGN §5.11.2's constant: refuse once
   *     `used > 0.45 × limit`. A branching factor above ~2.2 makes that the
   *     right guess and below it leaves the rung unspent; it does not look at
   *     what this position's iterations actually cost.
   *   `'predicted'` — refuse only when the next iteration is predicted not to
   *     FIT: `used + lastIterationWork × ratio > limit`, with `ratio` the
   *     measured cost ratio of the last two completed iterations clamped to
   *     [2, 6], or 3 when only one has completed.
   *
   * OPTIONAL, AND ABSENT MEANS `'fixed45'`, for the reason `time.calibrateCold`
   * and `time.ladderStep` are optional: `canonicalJson` drops a key that is not
   * there, so an unset field leaves `hard@desktop`'s configuration hash at
   * `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`. Only
   * `hard@ablate:deep-gate` and `hard@ablate:work-fit-deep` set it.
   */
  iterationGate?: 'fixed45' | 'predicted';
  /**
   * The LOWER clamp on `predicted`'s measured cost ratio; absent means 2.
   * Meaningless without `iterationGate: 'predicted'`.
   *
   * The floor is what decides whether the gate is more or less permissive than
   * the 0.45 rule it replaces: E2 lane 1's first probe measured
   * depth-over-depth cost ratios frequently BELOW 2, so a floor of 2 made the
   * prediction pessimistic and refused depths that would have completed
   * (`docs/hard-ai/e2/E2-LANE1-DEEP-GATE.md` §C). It is a plain number and not
   * a ladder: a multiply and a compare are exactly specified by IEEE-754, so a
   * float floor is machine-independent in a way `Math.pow` would not be.
   *
   * OPTIONAL, AND ABSENT MEANS 2, so `hard@desktop`'s hash does not move and
   * neither do the already-registered `deep-gate` / `work-fit-deep`.
   */
  iterationGateFloor?: number;
  /**
   * E4's search-side fixes. OPTIONAL, AND ABSENT ON EVERY PROFILE:
   * `makeConfig` never writes it, so `canonicalJson` never sees the key and
   * `hard@desktop`'s configuration hash does not move. See `SearchFix`.
   *
   * IT IS DECLARED ON `SearchConfig` AND NOT ON `HardConfig` (where the E4
   * plan's lane table names it) for one reason: `search/pvs.ts`'s
   * `SearchContext.cfg` is a `SearchConfig`, which is how `iterationGate` —
   * the field this one replaces — is reachable from the search at all.
   * `HardConfig extends SearchConfig`, so `HardConfig.searchFix` is the same
   * key and every profile, arm, patch and hash behaves exactly as the plan
   * describes (`docs/hard-ai/e4/amendments/lane5.md`).
   */
  searchFix?: SearchFix;
}

// --- eval/{features,invariants}.ts, tables/{economy,context}.ts (E3.2 lane 12) ---
/**
 * The five correctness flags of `docs/hard-ai/e3/E3.1-SYNTHESIS.md` §5, B1–B5.
 * Each turns ONE engine defect into its fixed form; each is a bug by a
 * canonical fact or by the engine's own specification, and each is OFF
 * everywhere by default.
 *
 * OPTIONAL, AND ABSENT MEANS FALSE — the same contract `time.calibrateCold`,
 * `time.ladderStep` and `iterationGate` carry, and for the same reason:
 * `lab/hard-ai/ladder/identity.ts canonicalJson` DROPS a key whose value is
 * `undefined`, so a block that is never written into `makeConfig` leaves
 * `hard@desktop`'s resolved configuration hash at
 * `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`
 * (`tests/lab/ablate.test.ts` pins it) and the frozen champion stays the engine
 * every E1/E2 row was measured under. Writing `evalFix: {}` or
 * `evalFix: { rentOnce: false }` into a profile would put the key INTO the
 * serialisation and move that hash for no behaviour change, so no profile
 * carries it; only `hard@ablate:eval-fix-b1…b5` and
 * `hard@ablate:eval-correct-v1` set it. Every read is `=== true`.
 *
 * WHERE EACH ONE IS READ. `HardEngine`'s constructor copies the block onto the
 * `NodeTables` it allocates and hands it to its `Evaluator`
 * (`eval/evaluate.ts`), which copies it onto its own tables; the four readers
 * take it from `NodeTables.evalFix`, so no signature in DESIGN §4.8/§4.12/
 * §4.15 changes and every existing caller of `buildTables`/`extract`/
 * `invariantBits`/`economyDP` keeps compiling and keeps the champion's
 * behaviour.
 */
export interface EvalFix {
  /**
   * B3. `Infiltration` (feature 11) counts ordered (own unit, enemy anchor)
   * pairs, and that relation is symmetric under the two corners, so the
   * symmetric difference is identically zero on every legal position
   * (E3.1-FEATURE-AUDIT §(b), proved on all 10,000 square pairs). True counts
   * the quantity DESIGN §5.8 and `core/spawn.ts anchorsVoidedBy` define — how
   * many of the ENEMY's unblocked anchors my bodies void, per anchor and not
   * per pair.
   */
  infiltrationPerAnchor?: boolean;
  /**
   * B4. `Inv3RetreatSquare` (`eval/invariants.ts`) drops DESIGN §5.13 row 3's
   * second conjunct "and the attacker has `retreats > 0`"; `t.retreats[slot]`
   * is computed and never read. True restores the conjunct.
   */
  inv3RetreatConjunct?: boolean;
  /**
   * B5. `tables/economy.ts` subtracts the SAME standing upkeep bill the `Rent`
   * feature already charges on all six horizon turns of `stream`, so a crystal
   * per turn of rent costs 1.72 × the `RENT_PV` DESIGN.md:1348 says is
   * "charged **once**, as `Rent`". True drops the upkeep leg from `stream`
   * and leaves `Rent` as the single charge. It also moves
   * `turnsToInsolvency` — which reads the same running balance — and is
   * therefore read there too (see `runEconomy`).
   */
  rentOnce?: boolean;
  /**
   * B1. The relocation DP relocates a miner only when its cell is completely
   * dry (`take === 0`), so a board that strictly GAINS a crystal can project
   * less income (E3.1-ECONOMY-AUDIT, −130 cc on one added crystal). True
   * triggers the relocation by comparing staying with relocating instead.
   */
  relocationCompare?: boolean;
  /**
   * B2. `bestRelocationTarget` breaks an exact argmax tie by the lowest square
   * INDEX, and `s ↦ 99 − s` reverses that order, so `EconDelta`,
   * `DepletionWaste` and `RelocationDebt` disagree with their own rot180
   * mirror on 585 of 1,000 fuzz positions (E3.1-CONTRIBUTIONS `violations.json`).
   * True breaks the tie in the mover's OWN corner-relative frame, which the
   * mirror carries with it.
   */
  rot180TieOrder?: boolean;
  /**
   * B6. `tables/approach.ts classifyFrom` picks the attacker's attack square by
   * an ascending scan over the target's empty neighbours and keeps the FIRST of
   * any pair that ties on cost and class; `s ↦ 99 − s` reverses that order, so
   * `retreats` — and hence `Inv3RetreatSquare` with `inv3RetreatConjunct` on —
   * disagrees with the rot180 mirror on 5 of 1,000 fuzz positions, 250 cc each
   * (`amendments/lane12.md` A2, `E3.2-CORRECTNESS-B6.md`). True breaks that tie
   * in the ATTACKER's own corner-relative frame, the order B2 uses. It moves
   * `retreats` only, and `t.retreats[slot]` is read only under
   * `inv3RetreatConjunct`, so with B4 off this flag changes nothing.
   */
  approachTieOrder?: boolean;
}

// --- search/{pvs,time,order}.ts, gen/generate.ts (E4 lanes 3, 4, 5) ---

export interface HardConfig extends SearchConfig {
  time: TimeConfig;
  profile: DeviceProfile;
  ttBitsMacro: number;
  ttBitsTurn: number;
  K: number;
  kInterior: number;
  weights: Weights;
  book: Book | null;
  /**
   * The E3.2 correctness flags (B1-B5). OPTIONAL, AND ABSENT ON EVERY PROFILE:
   * `makeConfig` never writes it, so `canonicalJson` never sees the key and
   * `hard@desktop`'s configuration hash does not move. See `EvalFix`.
   */
  evalFix?: EvalFix;
  /**
   * The E4 search flags. OPTIONAL, AND ABSENT ON EVERY PROFILE: `makeConfig`
   * never writes it, so `canonicalJson` never sees the key and
   * `hard@desktop`'s configuration hash does not move. See `SearchFix`.
   */
  searchFix?: SearchFix;
}

/** DESIGN §4.15 `FEATURE_COUNT`; `eval/features.ts` (M12) is the authority and
 * `tests/ai/hard/interfaces.test.ts` cross-checks it once that module lands. */
const FEATURE_COUNT = 58;

/**
 * `cost × 100` in catalogue order (units.ts:8-222) — the material priors of
 * DESIGN F9, with no rent term (`Rent` is its own feature, `RENT_PV = 422`).
 * `tests/ai/hard/catalog.test.ts` pins these against `catalog.cost`.
 */
export const DEFAULT_MATERIAL_CC: readonly number[] = [
  300, 700, 1500, // fire 1/2/3
  300, 700, 1500, // lightning 1/2/3
  400, 800, 1600, // water 1/2/3
  400, 800, 1600, // shadow 1/2/3
  500, 900, 1700, // plant 1/2/3
  500, 900, 1700, // metal 1/2/3
];

/** PROVISIONAL (M13 owns the shipped values; DESIGN §5.5 names the terms only). */
function purchaseWeights(): PurchaseWeights {
  return {
    mineCc: 1,
    safeCc: 100,
    blockCc: 200,
    strikeCc: 300,
    anchorCc: 20,
    zeroSpawnCc: 400,
    liquidityCc: 50,
    homeRaceCc: 5000,
  };
}

/** PROVISIONAL (M12 `eval/weights.ts` replaces this with `DEFAULT_WEIGHTS`). */
export function placeholderWeights(): Weights {
  return {
    w: new Int32Array(FEATURE_COUNT),
    material: Int32Array.from(DEFAULT_MATERIAL_CC),
    version: 0,
    label: 'placeholder-m4',
  };
}

function purchaseConfig(): PurchaseConfig {
  // `maxBodies` 4, S = 8 squares, keep 3 per multiset (DESIGN §8, §5.5);
  // ≤ 35 multisets and ≤ 12 purchase plans are §5.5's own bounds.
  return { maxBodies: 4, maxMultisets: 35, maxPlans: 12, squares: 8, keepPerMultiset: 3, weights: purchaseWeights() };
}

function genConfig(K: number, maxPlacePlans: number, widths: readonly number[], ttBits: number): GenConfig {
  return {
    K,
    maxPlacePlans,
    action: { widths: Int32Array.from(widths), keep: 4, ttBits },
    purchase: purchaseConfig(),
    maxPromotions: 8,
    reference: false,
  };
}

interface ProfileShape {
  K: number;
  kInterior: number;
  widths: readonly number[];
  placePlansRoot: number;
  placePlansInterior: number;
  quiesceMaxPly: number;
  ttBitsMacro: number;
  ttBitsTurn: number;
  minMs: number;
  maxMs: number;
  baseMs: number;
  unitsPerMs: number;
}

/** DESIGN §6.3's profile table, verbatim. */
const DESKTOP_SHAPE: ProfileShape = {
  K: 24, kInterior: 16, widths: [6, 4, 3, 2], placePlansRoot: 16, placePlansInterior: 8,
  quiesceMaxPly: 4, ttBitsMacro: 19, ttBitsTurn: 18, minMs: 2000, maxMs: 6000, baseMs: 3000, unitsPerMs: 600,
};
const MIDRANGE_SHAPE: ProfileShape = {
  K: 16, kInterior: 12, widths: [5, 3, 2, 2], placePlansRoot: 12, placePlansInterior: 6,
  quiesceMaxPly: 3, ttBitsMacro: 18, ttBitsTurn: 17, minMs: 1500, maxMs: 4000, baseMs: 2500, unitsPerMs: 400,
};
const PHONE_SHAPE: ProfileShape = {
  K: 12, kInterior: 8, widths: [4, 3, 2, 1], placePlansRoot: 8, placePlansInterior: 4,
  quiesceMaxPly: 2, ttBitsMacro: 15, ttBitsTurn: 16, minMs: 1200, maxMs: 2500, baseMs: 1800, unitsPerMs: 200,
};

/** Pessimistic first-turn throughput until `calibrate()`/`updateProfile` measures one (DESIGN §8). */
export const INITIAL_UNITS_PER_MS = 200;

function makeConfig(shape: ProfileShape, book: Book | null): HardConfig {
  return {
    maxDepth: 12,
    aspirationCc: 200,
    lmrRank1: 6,
    lmrRank2: 12,
    futilityMarginCc: 200,
    // DESIGN §5.11.5: every refinement ships behind its own flag and is
    // SPRT-gated separately at M20. M17 builds them; they stay off until then.
    useLmr: false,
    useAspiration: false,
    useFutility: false,
    useExtensions: false,
    quiesce: { maxPly: shape.quiesceMaxPly, deltaMarginCc: 300, maxCandidates: 8 },
    gen: genConfig(shape.K, shape.placePlansRoot, shape.widths, shape.ttBitsTurn),
    genInterior: genConfig(shape.kInterior, shape.placePlansInterior, shape.widths, shape.ttBitsTurn),
    ttBits: shape.ttBitsMacro,
    dfpn: { maxTurns: 3, nodeBudget: 4000, epsilonQ2: 5, ttBits: 17 },
    // M16 builds `tactics/dfpn.ts`; the flag turns on when its gate is green.
    useDfpn: false,
    time: { minMs: shape.minMs, maxMs: shape.maxMs, baseMs: shape.baseMs, abortFactor: 3 },
    profile: { unitsPerMs: INITIAL_UNITS_PER_MS, samples: 0 },
    ttBitsMacro: shape.ttBitsMacro,
    ttBitsTurn: shape.ttBitsTurn,
    K: shape.K,
    kInterior: shape.kInterior,
    weights: placeholderWeights(),
    book,
  };
}

export const DESKTOP: HardConfig = makeConfig(DESKTOP_SHAPE, null);
export const MIDRANGE: HardConfig = makeConfig(MIDRANGE_SHAPE, null);
export const PHONE: HardConfig = makeConfig(PHONE_SHAPE, null);
/** Fixed work; identical search shape to DESKTOP, book supplied per run. */
export const LAB: HardConfig = makeConfig(DESKTOP_SHAPE, null);

/**
 * DESIGN §6.3's trigger column: PHONE below 250 units/ms or with ≤ 2 GB of
 * device memory, MIDRANGE from 250 to below 600, DESKTOP at 600 and above.
 * A fresh config object is returned each call, so callers may mutate it.
 */
export function profileFor(unitsPerMs: number, deviceMemoryGb: number | undefined): HardConfig {
  const shape =
    unitsPerMs < 250 || (deviceMemoryGb !== undefined && deviceMemoryGb <= 2)
      ? PHONE_SHAPE
      : unitsPerMs < 600
        ? MIDRANGE_SHAPE
        : DESKTOP_SHAPE;
  const cfg = makeConfig(shape, null);
  cfg.profile = { unitsPerMs, samples: 0 };
  return cfg;
}
