/**
 * `muju-exam-case-v1` — the Muju examination set's case container
 * (EPIC-PLAN §4 E1.2).
 *
 * E1.2 asks for "a small versioned tactical/economic corpus from authored cases
 * and real losses", and its acceptance clause draws the line this file exists to
 * enforce:
 *
 * > Every exact case has a canonical witness; strategic preferences are labeled
 * > judgments; entire games/opening families split into development, validation
 * > and sealed acceptance sets.
 *
 * Three ideas carry that clause into a data format.
 *
 * **1. `kind` and `witness.label` are the same fact, written twice.** A case is
 * `exact` only when a `witness` labelled `exact` names a CANONICAL check —
 * `canonical-enumeration` or `canonical-replay`, both decided by `src/game`
 * through `generateAllActions`/`isLegalAction`/`applyAction`, never by the
 * engine under test. A case is `judgment` when its witness is labelled
 * `judgment`, and a judgment carries an author's (or an adviser's) REASON
 * instead of a proof. `validateCaseShape` refuses every other combination, so
 * "a preference dressed as a fact" cannot be written down here at all, and the
 * runner cannot sum the two because it never sees a judgment wearing the exact
 * label. Upgrading a judgment to exact by assertion is not a policy this format
 * asks anyone to respect; it is a shape it rejects.
 *
 * **2. A position is stored as a RECIPE wherever one exists.** `createUnit`
 * mints unit ids from `Date.now()` and `Math.random()` (`src/game/board.ts`), so
 * an `AIAction` naming a unit by id is portable to no other process. The
 * ladder's `OpeningAction` (`lab/hard-ai/ladder/openings.ts`) names units by the
 * square they stand on and is resolved against the live position as it is
 * replayed, so a recipe — the opening's actions followed by the plies actually
 * played — reconstructs the position through the shipped rules, and a recipe
 * that has stopped being legal is REFUSED rather than silently repaired. That
 * is `applyOpening`'s own contract and this module reuses it verbatim: legality
 * check, simulator refusal check, harness invariants, and no action that ends
 * the game. An embedded `state` stays available for the authored corpus, whose
 * positions (`lab/hard-ai/positions/*.jsonl`) were authored directly and have no
 * line of play behind them.
 *
 * **3. The stratum is part of the case.** `dev` may be inspected and tuned
 * against, `val` drives champion/challenger contests and is never tuned
 * against, `sealed` is run only by E6.2 (`AMENDMENTS-DECIDED.md`, "Two E1
 * decisions taken with these"). A case knows its own stratum, `loadStratum`
 * refuses a file whose rows disagree with its name, and the runner takes one
 * stratum per invocation so a sealed case cannot be swept up by a dev run.
 *
 * **4. A plan case asks for a KIND OF TURN, not a key** (STRATEGOS Workflow 1,
 * plan W1.13, 2026-09-24). Wave 1's LLM-vs-Hard losses were plan failures —
 * no contact while losing the kill clock, no promotion with idle crystals, every
 * placement square filled — and no single end key says "made contact". So
 * `kind: 'plan'` carries a `PlanWitness`: a PREDICATE over the engine's turn,
 * decided by the canonical rules alone (`witness.ts evaluatePlan` replays the
 * turn through `isLegalAction`/`applyAction`), plus an author's reason for
 * choosing that predicate at that position. The two halves have different
 * strength and the format keeps both visible: whether the turn satisfies the
 * predicate is a fact; that the predicate is the right plan there is a labelled
 * judgment (`by: 'author'`, `reason`, `cites`). The runner therefore reports a
 * third tally that is never added to the exact or judgment ones, and a case may
 * record that the author EXPECTS the engine to fail it (`expected: 'fail'`), so
 * a known gap is scored as known rather than hidden. A plan case also pins the
 * clock and mined totals it was chosen for (`at`), and `loadCaseState` refuses a
 * recipe that no longer reproduces them, exactly as it refuses a drifted digest.
 *
 * RULES ARE PROCESS-GLOBAL. `setElementGraph`, `setUpkeepVariant` and
 * `setCombatHandicap` are module-level in `src/game`, so every consumer must
 * install a case's `rules` block around whatever it does with the position.
 * `withExamRules` does that and restores the shipped defaults afterwards, the
 * way `playGame` and `applyOpening` do. DO NOT NEST IT: the `finally` restores
 * the SHIPPED defaults, not the caller's, exactly as those two do. In
 * particular `loadCaseState` installs and restores rules on its own (it goes
 * through `applyOpening`), so it must be called OUTSIDE a `withExamRules`
 * scope, never inside one.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PlayerId, Position } from '../../../src/game/types';
import { setElementGraph } from '../../../src/game/elements';
import { INACTIVITY_LIMIT, minedTotal } from '../../../src/game/inactivity';
import { BOARD_SIZE } from '../../../src/game/board';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { setCombatHandicap, resetCombatHandicap } from '../../../src/game/combat';
import {
  applyOpening,
  gameplayDigest,
  withOpeningRules,
  type OpeningAction,
  type OpeningStateOptions,
} from '../ladder/openings';
import { DEFAULT_RULES, type RulesBlock } from '../positions/corpus';
import { gameplayDigest as phasingGameplayDigest, replayPhasingRecipe } from '../ladder/openings/phasing';

export const EXAM_SCHEMA = 'muju-exam-case-v1';

export class ExamFormatError extends Error {}

// ---------------------------------------------------------------------------
// The §1 demands
// ---------------------------------------------------------------------------

/**
 * One row of EPIC-PLAN §1's "What Muju demands" table. A case names the demand
 * it exercises so a stratum's coverage can be read as "which of the eight
 * things Hard must mean does this set actually test", rather than as a bag of
 * positions. `person-waiting` is deliberately present and deliberately hard to
 * test here: it is about latency and cancellation (E5), so a case claiming it
 * is expected to be rare.
 */
export type ExamDemand =
  | 'shared-actions'
  | 'immediate-action'
  | 'finite-crystals'
  | 'recurring-upkeep'
  | 'healing'
  | 'home-and-spawn'
  | 'quiet-clock'
  | 'person-waiting';

/** The §1 table row each demand names, verbatim, so an artifact never has to
 * be read next to the plan to be understood. */
export const DEMAND_ROWS: Record<ExamDemand, string> = {
  'shared-actions': 'Four shared actions — coordinate movement, multiple attackers and Cleave; spend actions on a coherent turn',
  'immediate-action': 'Immediate action after purchasing/promoting — see summon-and-strike, combined purchases/promotions and multiple promotions',
  'finite-crystals': 'Finite crystal reserves — expand and relocate before mining stalls; distinguish future income from money already banked',
  'recurring-upkeep': 'Recurring upkeep — finance the next turn and choose a useful army, including forced releases',
  healing: 'Healing each turn — prefer real kills and threats over damage that disappears',
  'home-and-spawn': 'Home occupation and spawn geometry — defend, invade, block spawning and recognize races',
  'quiet-clock': 'Ten turns without a kill cause a draw — seek a draw when losing and avoid accidental draws when winning',
  'person-waiting': 'A person is waiting — return legal, understandable play within budget; cancel immediately when the game changes',
};

export const EXAM_DEMANDS = Object.keys(DEMAND_ROWS) as ExamDemand[];

// ---------------------------------------------------------------------------
// Strata
// ---------------------------------------------------------------------------

export type ExamStratum = 'dev' | 'val' | 'sealed';

export const EXAM_STRATA: readonly ExamStratum[] = ['dev', 'val', 'sealed'];

/** What each stratum may be used for, from `AMENDMENTS-DECIDED.md`. Printed in
 * every artifact the runner writes. */
export const STRATUM_RULES: Record<ExamStratum, string> = {
  dev: 'development — may be inspected, debugged against and tuned against',
  val: 'validation — drives champion/challenger equal-time contests in E2-E4; never tuned against, and no case is inspected while iterating',
  sealed: 'sealed acceptance — run only by E6.2; any earlier run voids it as acceptance evidence',
};

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface AuthoredSource {
  kind: 'authored';
  /** `<repo-relative file>#<id>` of the suite case or position it was carried from. */
  from: string;
  /** The suite/position file's sha256 at carry-over time. */
  sha256?: string;
}

export interface LossSource {
  kind: 'loss';
  /** The run directory the replay came from, repo-relative where possible. */
  run: string;
  pairId: string;
  /** `A-white` / `B-white`, as `ladder/worker.ts replayFileName` spells it. */
  orientation: string;
  /** Ply index of the position the case is taken at (the turn's first ply). */
  ply: number;
  turnNumber: number;
  /** Index among the seat's own turns; indexes `players[side].turnMs`. */
  seatTurnIndex: number;
  /** `fileId` of the `hard:analyze` artifact this came from. */
  analysis?: string;
  /**
   * The ANALYSER SCHEMA the case was extracted from: `muju-hard-analyze-v1`
   * or `-v2`. The two carry the same per-turn fields this set reads, but they
   * do not carry the same class vocabulary — v2's `reply-outside-beam`
   * replaces v1's `reply-missed` — so a judgment's `classification` only means
   * what it says next to the schema that produced it.
   */
  analysisSchema?: string;
  /** The opening id the game was played from; the stratum is inherited from it. */
  openingId?: string;
}

/**
 * A position taken from an ONLINE game (an LLM-vs-Hard room) through its
 * verified lab replay (`analyze/from-room.ts`). Unlike `LossSource` it does not
 * presume the engine lost: wave 1's SN05-W final ply is a case exactly because
 * Hard WON it by holding.
 */
export interface RoomSource {
  kind: 'room';
  /** The results directory the replay lives in, repo-relative (`lab/results/llm-wave-1`). */
  run: string;
  /** The campaign's game id (`SN05-W`), which is also the replay's file id. */
  gameId: string;
  /** The production room (32 hex). */
  roomId: string;
  /** The room revision AFTER which this position stands, with the engine to move. */
  revision: number;
  /** The revision of the engine's own recorded reply (always `revision + 1`). */
  replyRevision: number;
  /** Ply index of the position in the replay (the turn's first ply). */
  ply: number;
  turnNumber: number;
  /** Index among the seat's own turns. */
  seatTurnIndex: number;
  /** How the online game ended, from the replay's `meta`. */
  outcome: { winner: PlayerId | null; winType: string };
  openingId: string;
}

export type ExamSource = AuthoredSource | LossSource | RoomSource;

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/** A position authored directly, with no line of play behind it. */
export interface StatePosition {
  kind: 'state';
  state: GameState;
}

/**
 * A position named by the moves that reach it. `actions` is the opening's
 * actions followed by the plies played after it; `openingPlies` says where the
 * opening ended, which is provenance only — the replay does not care.
 */
export interface RecipePosition {
  kind: 'recipe';
  openingId: string;
  openingPlies: number;
  actions: OpeningAction[];
}

export type ExamPosition = StatePosition | RecipePosition;

// ---------------------------------------------------------------------------
// Witnesses
// ---------------------------------------------------------------------------

export type ExactClaim = 'win' | 'kill' | 'home-clear';

/** What each claim asserts about an end position, in the words the checker
 * (`witness.ts`) implements. */
export const CLAIM_RULES: Record<ExactClaim, string> = {
  win: 'the end position is `phase === "victory"` with the side to move as `winner`',
  kill: 'the end position holds strictly fewer enemy units than the root did',
  'home-clear': 'no enemy unit stands on the side-to-move\'s own start corner in the end position',
};

export type ExactMethod = 'canonical-enumeration' | 'canonical-replay';

export interface ExactWitness {
  label: 'exact';
  claim: ExactClaim;
  method: ExactMethod;
  /** End-position `Kpos` keys (16 lower-case hex digits) that satisfy `claim`. */
  endKeys: string[];
  /** Keys the engine must not reach. May be empty. */
  avoidKeys: string[];
  /**
   * True only when the canonical enumeration of every legal turn from the root
   * COMPLETED, so `endKeys` is the whole set of end positions satisfying the
   * claim. False means the list is a set of witnesses, not a closed set: a turn
   * outside it may satisfy the claim too, so a miss is weaker evidence.
   */
  complete: boolean;
  /** For `canonical-replay`: the line, square-based, that the checker replays. */
  line?: OpeningAction[];
  /** How it was verified, in prose, for a reader of the artifact. */
  note: string;
  verifiedAt: string;
  /** The command or module that performed the check. */
  verifiedBy: string;
}

export interface JudgmentWitness {
  label: 'judgment';
  /** The end position(s) the author (or the adviser) prefers. */
  preferredKeys: string[];
  avoidKeys: string[];
  /** Why. This is an OPINION and the format says so; nothing proves it. */
  reason: string;
  /** Who formed the preference. */
  by: 'adviser' | 'author';
  /** `hard:analyze`'s class at this turn, when the case came from a loss. */
  classification?: string;
  swingCc?: number;
  adviserWork?: number;
}

/**
 * The plan predicates (STRATEGOS W1.13). Each is a fact about ONE turn of the
 * side to move, checked by replaying that turn from the case position through
 * the canonical rules (`witness.ts evaluatePlan`); none of them reads the
 * engine under test. `PLAN_RULES` is the definition, word for word what the
 * checker implements.
 */
export type PlanPredicate = 'damaging-attack' | 'no-clock-reset' | 'spawn-area-open' | 'promotion-made' | 'contact-in-n';

export const PLAN_RULES: Record<PlanPredicate, string> = {
  'damaging-attack':
    'the turn contains an ATTACK by one of the side\'s units whose attack power against its defender (`src/game/combat.ts calculateAttackPower`: ' +
    'base attack, element modifier and combat handicap, clamped at 0) is greater than 0 at the moment it is made. With `target`, the defender ' +
    'must be the enemy unit that stood on that square at the root, followed by unit id. The attack need not kill: damage heals at the hand-off, ' +
    'so this is the contract\'s contact predicate, not a kill claim (`kind: "exact", claim: "kill"` is the set\'s kill predicate)',
  'no-clock-reset':
    'the turn contains no kill: no ATTACK removes its defender from the board. A kill is the only event that resets the kill clock ' +
    '(`src/game/inactivity.ts`: "only an attack that removes a unit resets it"), so the turn leaves the clock counting. An upkeep release or a ' +
    'disrupted summon removes a unit without resetting it and is not a kill',
  'spawn-area-open':
    'at the turn\'s end position (the first position with the other side on move, after the hand-off has resolved that side\'s arrivals) ' +
    '`src/game/summoning.ts getPurchasePositions(end, side)` is non-empty: some empty square lies in the rectangle between the side\'s start ' +
    'corner and one of its units, no enemy unit stands in that rectangle, and no pending summon of the side is on it. Those are exactly the ' +
    'squares `isLegalAction` would accept for BUY_UNIT in the side\'s Prepare phase',
  'promotion-made':
    'the turn contains a PROMOTE_UNIT of one of the side\'s units that the canonical rules accept (`isLegalAction`, then `applyAction` changes the state)',
  'contact-in-n':
    '`n` counts plies — one seat\'s whole turn, the unit the kill clock counts — and is 1 or 3. CONTACT means a damaging strike (as in ' +
    'damaging-attack) or a unit of the side standing orthogonally adjacent to an enemy unit it could damage (attack power > 0). n = 1: the turn ' +
    'makes a damaging strike or its end position holds such an adjacency. n = 3: the n = 1 test, or, after the opponent plays the PASSIVE ' +
    'scripted reply (phase ends only, `src/game/legality.ts phaseEndAction`, which pays the default upkeep), the side has a WITNESSED damaging ' +
    'strike in its next turn: one unit\'s shortest approach (`src/game/movement.ts findAttackApproach`) played as one MOVE and then the ATTACK, ' +
    'replayed through the canonical rules. The grade is "witnessed against a passive reply" (STRATEGOS Part A item 1), never "forced"; a strike ' +
    'that needs a second unit to clear the path first is not searched, so a FAIL means "no single-unit strike line", not a proof that none exists',
};

export const PLAN_PREDICATES = Object.keys(PLAN_RULES) as PlanPredicate[];

/**
 * The plies `contact-in-n` accepts. CHOICE (plan W1.13): 1 is the engine's own
 * turn; 3 adds the opponent's passive reply and the side's next turn, the
 * shortest horizon over which "build contact" differs from "strike now".
 * Anything longer needs a policy for the side's OWN intermediate turn, which is
 * a plan, not a check. Falsifier: a wave-1 case whose right answer is contact
 * reachable only in two own turns — none of the cases-p4 positions is one.
 */
export const CONTACT_PLIES: readonly number[] = [1, 3];

/** What the position was when the author chose the predicate. Recomputed from
 * the reconstructed state by `loadCaseState`, which refuses a drift. */
export interface PlanReading {
  /** `state.inactivityPlies` at the root: kill-free plies already counted. */
  clock: number;
  /** `INACTIVITY_LIMIT - clock`: plies left before the clock decides, this one included. */
  pliesLeft: number;
  /** `src/game/inactivity.ts minedTotal` per side (Black's handicap folded in). */
  mined: { white: number; black: number };
  /** The side's bank at the root (before this turn's mining). */
  bank: number;
}

/** Hard's own reply in the online game the case came from. */
export interface PlayedTurn {
  /** Room revision of the reply (`RoomSource.replyRevision`). */
  revision: number;
  /** The reply, square-based, exactly as the replay records it. */
  line: OpeningAction[];
  /** Whether the reply satisfies the predicate (verified by the builder and the test). */
  holds: boolean;
}

export interface PlanWitness {
  label: 'plan';
  predicate: PlanPredicate;
  /** `contact-in-n` only: one of `CONTACT_PLIES`. */
  n?: number;
  /** The side whose turn is judged; always the case's `sideToMove`. */
  side: PlayerId;
  /** `damaging-attack` only: the root square of the one enemy unit the attack must hit. */
  target?: Position;
  at: PlanReading;
  /**
   * What the AUTHOR expects of the engine at the time of writing. `fail`
   * records a known gap (SO01-B's home defence is outside Workflow 1) so the
   * runner can report it as expected instead of hiding it; the pass/fail itself
   * is still computed, never assumed.
   */
  expected: 'pass' | 'fail';
  /** Why this predicate is the right plan here. An OPINION, labelled as one. */
  reason: string;
  /** Where the evidence is written down (`DIGEST.md`, `engine-evidence.md`, ...). */
  cites: string[];
  played?: PlayedTurn;
  by: 'author';
}

export type ExamWitness = ExactWitness | JudgmentWitness | PlanWitness;

export type ExamKind = 'exact' | 'judgment' | 'plan';

// ---------------------------------------------------------------------------
// The case
// ---------------------------------------------------------------------------

export interface ExamCase {
  schema: typeof EXAM_SCHEMA;
  /** Unique across the whole set, not just its file. */
  id: string;
  /** Bumped whenever anything about the case changes; a new version is a new case. */
  version: number;
  source: ExamSource;
  demand: ExamDemand;
  kind: ExamKind;
  rules: RulesBlock;
  /**
   * Board setup knobs `RulesBlock` does not carry. `ruleset: 'phasing'` marks a
   * case whose recipe was recorded under Phasing (a loss taken from a Phasing
   * replay by `from-loss.ts`): it is replayed from the Phasing initial state and
   * digested with the Phasing digest, which covers the public pending summons.
   * Absent means the historical Standard corpus, read exactly as before.
   */
  setup?: { actionsPerTurn?: number; resourceLayout?: number[]; ruleset?: 'phasing' };
  position: ExamPosition;
  sideToMove: PlayerId;
  witness: ExamWitness;
  stratum: ExamStratum;
  tags: string[];
  /** `gameplayDigest` of the materialised position; recomputed by the loader. */
  stateDigest?: string;
  /** Free prose for a reader; never read by code. */
  rationale?: string;
}

// ---------------------------------------------------------------------------
// Rules plumbing
// ---------------------------------------------------------------------------

export function openingOptionsFor(c: Pick<ExamCase, 'rules' | 'setup'>): OpeningStateOptions {
  return {
    blackCrystalHandicap: c.rules.handicap,
    actionsPerTurn: c.setup?.actionsPerTurn as GameState['actionsPerTurn'] | undefined,
    resourceLayout: c.setup?.resourceLayout,
    elementGraph: c.rules.elementGraph,
    upkeep: c.rules.upkeep,
    handicap: c.rules.combatHandicap,
  };
}

/**
 * Installs the case's rules globals for `fn` and restores the SHIPPED defaults
 * afterwards. DO NOT NEST (see the module header): `loadCaseState` installs its
 * own, so materialise first and check inside this.
 *
 * SYNCHRONOUS `fn` ONLY. `withOpeningRules`' `finally` fires when `fn` RETURNS,
 * and an `async fn` returns a pending promise at its first `await` — everything
 * after that await would run under the shipped defaults instead of the case's
 * rules. An awaited engine search must therefore use `installExamRules` /
 * `restoreShippedRules` instead, which is the pattern `suites/run.ts` uses for
 * the same reason.
 */
export function withExamRules<T>(c: Pick<ExamCase, 'rules' | 'setup'>, fn: () => T): T {
  return withOpeningRules(openingOptionsFor(c), fn);
}

/**
 * The same three globals, installed WITHOUT a scope, for a caller that has to
 * `await` between installing and using them (an engine search). The caller owns
 * the restore — `restoreShippedRules` — and must do it before anything that
 * expects the shipped defaults, including the next case's `loadCaseState`.
 */
export function installExamRules(c: Pick<ExamCase, 'rules' | 'setup'>): void {
  setUpkeepVariant(c.rules.upkeep);
  setElementGraph(c.rules.elementGraph);
  setCombatHandicap('white', c.rules.combatHandicap.white);
  setCombatHandicap('black', c.rules.combatHandicap.black);
}

/** Restores what `playGame`, `applyOpening` and `withExamRules` all restore. */
export function restoreShippedRules(): void {
  setUpkeepVariant('shipped');
  setElementGraph('double-thick');
  resetCombatHandicap();
}

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

const KEY_RE = /^[0-9a-f]{1,16}$/;

/** Lower-case, `0x`-free, 16 hex digits — `suites/format.ts normalizeKey`'s
 * rule, repeated here so an exam case and a suite case spell a `Kpos` the same
 * way and the two corpora can be compared key for key. */
export function normalizeKey(key: string, where: string): string {
  const raw = String(key).trim().toLowerCase();
  const body = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!KEY_RE.test(body)) throw new ExamFormatError(`${where}: "${key}" is not a Kpos hex key`);
  return body.padStart(16, '0');
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ExamFormatError(`${where}: expected a non-empty string`);
  return value;
}

function requireKeys(value: unknown, where: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value)) throw new ExamFormatError(`${where}: expected an array of Kpos keys`);
  if (!allowEmpty && value.length === 0) throw new ExamFormatError(`${where}: must name at least one Kpos key`);
  return value.map((k, i) => normalizeKey(k as string, `${where}[${i}]`));
}

function validateRules(raw: unknown, where: string): RulesBlock {
  if (raw === undefined || raw === null) return { ...DEFAULT_RULES, combatHandicap: { ...DEFAULT_RULES.combatHandicap } };
  const r = raw as Partial<RulesBlock>;
  if (typeof r.elementGraph !== 'string') throw new ExamFormatError(`${where}.rules: missing elementGraph`);
  if (r.upkeep !== 'shipped' && r.upkeep !== 'steep' && r.upkeep !== 'off') throw new ExamFormatError(`${where}.rules: bad upkeep ${String(r.upkeep)}`);
  if (r.inactivityRule !== 'on' && r.inactivityRule !== 'off') throw new ExamFormatError(`${where}.rules: bad inactivityRule ${String(r.inactivityRule)}`);
  if (r.victoryRule !== 'elimination' && r.victoryRule !== 'home-or-elimination') throw new ExamFormatError(`${where}.rules: bad victoryRule ${String(r.victoryRule)}`);
  if (typeof r.handicap !== 'number') throw new ExamFormatError(`${where}.rules: missing handicap`);
  if (r.combatHandicap === undefined || typeof r.combatHandicap.white !== 'number' || typeof r.combatHandicap.black !== 'number') {
    throw new ExamFormatError(`${where}.rules: missing combatHandicap`);
  }
  return r as RulesBlock;
}

/** A loose view of an unvalidated row. `Partial<A & B>` collapses to `never`
 * when `A` and `B` carry conflicting discriminants, so the raw shapes are
 * spelled out field by field instead. */
interface RawPosition {
  kind?: unknown;
  state?: GameState;
  openingId?: unknown;
  openingPlies?: unknown;
  actions?: unknown;
}

interface RawWitness {
  label?: unknown;
  claim?: unknown;
  method?: unknown;
  endKeys?: unknown;
  avoidKeys?: unknown;
  complete?: unknown;
  line?: unknown;
  note?: unknown;
  verifiedAt?: unknown;
  verifiedBy?: unknown;
  preferredKeys?: unknown;
  reason?: unknown;
  by?: unknown;
  classification?: unknown;
  swingCc?: unknown;
  adviserWork?: unknown;
  predicate?: unknown;
  n?: unknown;
  side?: unknown;
  target?: unknown;
  at?: unknown;
  expected?: unknown;
  cites?: unknown;
  played?: unknown;
}

function validatePosition(raw: unknown, where: string): ExamPosition {
  const p = raw as RawPosition;
  if (p === undefined || p === null) throw new ExamFormatError(`${where}.position: missing`);
  if (p.kind === 'state') {
    if (p.state === undefined || p.state === null) throw new ExamFormatError(`${where}.position: kind "state" needs a state`);
    return { kind: 'state', state: p.state };
  }
  if (p.kind === 'recipe') {
    requireString(p.openingId, `${where}.position.openingId`);
    if (!Array.isArray(p.actions)) throw new ExamFormatError(`${where}.position.actions: expected an array of OpeningActions`);
    if (typeof p.openingPlies !== 'number' || p.openingPlies < 0 || p.openingPlies > p.actions.length) {
      throw new ExamFormatError(`${where}.position.openingPlies: ${String(p.openingPlies)} is not a prefix length of ${p.actions.length} actions`);
    }
    return { kind: 'recipe', openingId: p.openingId as string, openingPlies: p.openingPlies, actions: p.actions as OpeningAction[] };
  }
  throw new ExamFormatError(`${where}.position.kind: ${JSON.stringify(p.kind)} is neither "state" nor "recipe"`);
}

function validateWitness(raw: unknown, kind: ExamKind, where: string): ExamWitness {
  const w = raw as RawWitness;
  if (w === undefined || w === null) throw new ExamFormatError(`${where}.witness: missing`);

  // THE ONE RULE THIS FORMAT EXISTS FOR: the label and the kind are the same
  // fact. A judgment can never be presented as an exact case.
  if (w.label !== kind) {
    throw new ExamFormatError(
      `${where}: kind "${kind}" with a witness labelled "${String(w.label)}" — an exact case needs an exact (canonical) witness and a judgment must be labelled judgment`,
    );
  }

  if (kind === 'exact') {
    if (w.method !== 'canonical-enumeration' && w.method !== 'canonical-replay') {
      throw new ExamFormatError(`${where}.witness.method: ${JSON.stringify(w.method)} is not a canonical check; an exact case is proved by enumeration or by replay, never by assertion`);
    }
    if (w.claim !== 'win' && w.claim !== 'kill' && w.claim !== 'home-clear') {
      throw new ExamFormatError(`${where}.witness.claim: ${JSON.stringify(w.claim)} is not a canonical claim`);
    }
    if (typeof w.complete !== 'boolean') throw new ExamFormatError(`${where}.witness.complete: expected a boolean`);
    if (w.method === 'canonical-replay' && !Array.isArray(w.line)) {
      throw new ExamFormatError(`${where}.witness.line: a canonical-replay witness must carry the line it replays`);
    }
    return {
      label: 'exact',
      claim: w.claim as ExactClaim,
      method: w.method as ExactMethod,
      endKeys: requireKeys(w.endKeys, `${where}.witness.endKeys`, false),
      avoidKeys: requireKeys(w.avoidKeys ?? [], `${where}.witness.avoidKeys`, true),
      complete: w.complete,
      line: w.line as OpeningAction[] | undefined,
      note: requireString(w.note, `${where}.witness.note`),
      verifiedAt: requireString(w.verifiedAt, `${where}.witness.verifiedAt`),
      verifiedBy: requireString(w.verifiedBy, `${where}.witness.verifiedBy`),
    };
  }

  if (kind === 'plan') return validatePlanWitness(w, where);

  if (w.by !== 'adviser' && w.by !== 'author') throw new ExamFormatError(`${where}.witness.by: ${JSON.stringify(w.by)} is neither "adviser" nor "author"`);
  return {
    label: 'judgment',
    preferredKeys: requireKeys(w.preferredKeys, `${where}.witness.preferredKeys`, false),
    avoidKeys: requireKeys(w.avoidKeys ?? [], `${where}.witness.avoidKeys`, true),
    reason: requireString(w.reason, `${where}.witness.reason`),
    by: w.by,
    classification: w.classification as string | undefined,
    swingCc: w.swingCc as number | undefined,
    adviserWork: w.adviserWork as number | undefined,
  };
}

function isSquare(v: unknown): v is Position {
  const p = v as Position;
  return p !== null && typeof p === 'object' && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < BOARD_SIZE && p.y >= 0 && p.y < BOARD_SIZE;
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function validatePlanWitness(w: RawWitness, where: string): PlanWitness {
  const at = `${where}.witness`;
  if (!PLAN_PREDICATES.includes(w.predicate as PlanPredicate)) {
    throw new ExamFormatError(`${at}.predicate: ${JSON.stringify(w.predicate)} is not one of ${PLAN_PREDICATES.join(', ')}`);
  }
  const predicate = w.predicate as PlanPredicate;
  if (w.side !== 'white' && w.side !== 'black') throw new ExamFormatError(`${at}.side: expected "white" or "black"`);
  if (predicate === 'contact-in-n') {
    if (typeof w.n !== 'number' || !CONTACT_PLIES.includes(w.n)) throw new ExamFormatError(`${at}.n: contact-in-n needs n in {${CONTACT_PLIES.join(', ')}}, got ${JSON.stringify(w.n)}`);
  } else if (w.n !== undefined) {
    throw new ExamFormatError(`${at}.n: only contact-in-n takes a ply count`);
  }
  if (w.target !== undefined) {
    if (predicate !== 'damaging-attack') throw new ExamFormatError(`${at}.target: only damaging-attack names a target`);
    if (!isSquare(w.target)) throw new ExamFormatError(`${at}.target: expected a board square {x, y}`);
  }
  const r = w.at as Partial<PlanReading> | undefined;
  if (r === undefined || r === null || !isCount(r.clock) || !isCount(r.pliesLeft) || !isCount(r.bank) || r.mined === undefined || !isCount(r.mined.white) || !isCount(r.mined.black)) {
    throw new ExamFormatError(`${at}.at: expected { clock, pliesLeft, mined: { white, black }, bank } as non-negative integers`);
  }
  if (w.expected !== 'pass' && w.expected !== 'fail') throw new ExamFormatError(`${at}.expected: expected "pass" or "fail"`);
  if (!Array.isArray(w.cites) || w.cites.length === 0 || w.cites.some(c => typeof c !== 'string' || c.length === 0)) {
    throw new ExamFormatError(`${at}.cites: a plan case must cite where its evidence is written down`);
  }
  // The predicate is a fact the rules decide; the CHOICE of predicate is not,
  // so it is always an author's and always says why.
  if (w.by !== 'author') throw new ExamFormatError(`${at}.by: a plan witness is an author's choice of predicate, so by must be "author"`);
  let played: PlayedTurn | undefined;
  if (w.played !== undefined) {
    const p = w.played as Partial<PlayedTurn>;
    if (!isCount(p.revision) || !Array.isArray(p.line) || typeof p.holds !== 'boolean') throw new ExamFormatError(`${at}.played: expected { revision, line, holds }`);
    played = { revision: p.revision, line: p.line as OpeningAction[], holds: p.holds };
  }
  return {
    label: 'plan',
    predicate,
    ...(predicate === 'contact-in-n' ? { n: w.n as number } : {}),
    side: w.side,
    ...(w.target !== undefined ? { target: { x: (w.target as Position).x, y: (w.target as Position).y } } : {}),
    at: { clock: r.clock, pliesLeft: r.pliesLeft, mined: { white: r.mined.white, black: r.mined.black }, bank: r.bank },
    expected: w.expected,
    reason: requireString(w.reason, `${at}.reason`),
    cites: w.cites as string[],
    ...(played !== undefined ? { played } : {}),
    by: 'author',
  };
}

/** Pure shape validation: no engine, no replay. `loadCaseState` does the rest. */
export function validateCaseShape(raw: unknown, where: string): ExamCase {
  const c = raw as Partial<ExamCase>;
  if (c === undefined || c === null) throw new ExamFormatError(`${where}: not an object`);
  if (c.schema !== EXAM_SCHEMA) throw new ExamFormatError(`${where}: schema ${JSON.stringify(c.schema)} is not ${EXAM_SCHEMA}`);
  const id = requireString(c.id, `${where}.id`);
  const at = `${where} (${id})`;
  if (typeof c.version !== 'number' || !Number.isInteger(c.version) || c.version < 1) throw new ExamFormatError(`${at}.version: expected a positive integer`);
  if (c.source === undefined || (c.source.kind !== 'authored' && c.source.kind !== 'loss' && c.source.kind !== 'room')) {
    throw new ExamFormatError(`${at}.source.kind: expected "authored", "loss" or "room"`);
  }
  if (c.source.kind === 'room') {
    requireString(c.source.run, `${at}.source.run`);
    requireString(c.source.gameId, `${at}.source.gameId`);
    // RULE (server room ids, `analyze/from-room.ts fetchRoomBundle`): 32 lower-case hex digits.
    if (typeof c.source.roomId !== 'string' || !/^[0-9a-f]{32}$/.test(c.source.roomId)) throw new ExamFormatError(`${at}.source.roomId: expected 32 lower-case hex digits`);
    if (!isCount(c.source.revision) || c.source.replyRevision !== c.source.revision + 1) {
      throw new ExamFormatError(`${at}.source: revision ${String(c.source.revision)} and replyRevision ${String(c.source.replyRevision)} must be consecutive`);
    }
    if (typeof c.source.ply !== 'number') throw new ExamFormatError(`${at}.source.ply: expected a number`);
  } else if (c.source.kind === 'loss') {
    requireString(c.source.run, `${at}.source.run`);
    requireString(c.source.pairId, `${at}.source.pairId`);
    requireString(c.source.orientation, `${at}.source.orientation`);
    if (typeof c.source.ply !== 'number') throw new ExamFormatError(`${at}.source.ply: expected a number`);
  } else {
    requireString(c.source.from, `${at}.source.from`);
  }
  if (!EXAM_DEMANDS.includes(c.demand as ExamDemand)) throw new ExamFormatError(`${at}.demand: ${JSON.stringify(c.demand)} is not a EPIC-PLAN §1 row (${EXAM_DEMANDS.join(', ')})`);
  if (c.kind !== 'exact' && c.kind !== 'judgment' && c.kind !== 'plan') throw new ExamFormatError(`${at}.kind: expected "exact", "judgment" or "plan"`);
  if (c.sideToMove !== 'white' && c.sideToMove !== 'black') throw new ExamFormatError(`${at}.sideToMove: expected "white" or "black"`);
  if (c.kind === 'plan' && (c.witness as { side?: unknown } | undefined)?.side !== c.sideToMove) {
    throw new ExamFormatError(`${at}.witness.side: a plan predicate judges the side to move (${c.sideToMove}), not ${JSON.stringify((c.witness as { side?: unknown } | undefined)?.side)}`);
  }
  if (!EXAM_STRATA.includes(c.stratum as ExamStratum)) throw new ExamFormatError(`${at}.stratum: ${JSON.stringify(c.stratum)} is not one of ${EXAM_STRATA.join(', ')}`);
  if (!Array.isArray(c.tags)) throw new ExamFormatError(`${at}.tags: expected an array`);
  return {
    schema: EXAM_SCHEMA,
    id,
    version: c.version,
    source: c.source as ExamSource,
    demand: c.demand as ExamDemand,
    kind: c.kind,
    rules: validateRules(c.rules, at),
    setup: c.setup,
    position: validatePosition(c.position, at),
    sideToMove: c.sideToMove,
    witness: validateWitness(c.witness, c.kind, at),
    stratum: c.stratum as ExamStratum,
    tags: c.tags as string[],
    stateDigest: c.stateDigest,
    rationale: c.rationale,
  };
}

// ---------------------------------------------------------------------------
// Materialisation
// ---------------------------------------------------------------------------

/**
 * The canonical `GameState` a case is about.
 *
 * A RECIPE is replayed through `applyOpening`, which refuses an action that is
 * illegal for the side to move, that the simulator turns into a no-op, that
 * breaks a harness invariant, or that ends the game. So a recipe that no longer
 * reconstructs a legal position throws instead of producing a position nobody
 * can reach — E1's "do not manufacture variety through unreachable or silently
 * rebalanced positions", applied to the exam set.
 *
 * INSTALLS AND RESTORES the rules globals itself (through `applyOpening`), so
 * call it OUTSIDE a `withExamRules` scope. The returned state is stamped with
 * the case's `victoryRule`/`inactivityRule`, which live on the state rather than
 * in a global, exactly as `analyze/replay.ts reconstruct` stamps them.
 */
export function loadCaseState(c: ExamCase): GameState {
  let state: GameState;
  if (c.position.kind === 'state') {
    state = c.position.state;
  } else {
    const spec = { id: c.position.openingId, actions: c.position.actions };
    try {
      state = c.setup?.ruleset === 'phasing'
        ? replayPhasingRecipe(spec.actions, openingOptionsFor(c), `${c.id} recipe`)
        : applyOpening(spec, openingOptionsFor(c));
    } catch (err) {
      throw new ExamFormatError(`${c.id}: recipe does not replay: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  state = { ...state, victoryRule: c.rules.victoryRule, inactivityRule: c.rules.inactivityRule };
  if (state.phase !== 'playing') throw new ExamFormatError(`${c.id}: the position is ${state.phase}, not a playable position`);
  if (state.turn.currentPlayer !== c.sideToMove) {
    throw new ExamFormatError(`${c.id}: sideToMove is ${c.sideToMove} but ${state.turn.currentPlayer} is to move in the position`);
  }
  const digest = caseDigest(c, state);
  if (c.stateDigest !== undefined && c.stateDigest !== digest) {
    throw new ExamFormatError(`${c.id}: the position reconstructs to digest ${digest}, not the recorded ${c.stateDigest}; the case has drifted and must be re-authored, not repaired`);
  }
  if (c.witness.label === 'plan') {
    const got = planReading(state, c.sideToMove);
    const want = c.witness.at;
    if (got.clock !== want.clock || got.pliesLeft !== want.pliesLeft || got.mined.white !== want.mined.white || got.mined.black !== want.mined.black || got.bank !== want.bank) {
      throw new ExamFormatError(`${c.id}: the position reads ${JSON.stringify(got)}, not the recorded ${JSON.stringify(want)}; the plan was chosen for a different position`);
    }
  }
  return state;
}

/**
 * The clock and economy a plan case pins (`PlanWitness.at`). `pliesLeft` is
 * `INACTIVITY_LIMIT - clock` at a fresh root: the plies, this one included,
 * whose hand-offs still count before the clock decides on mined totals.
 */
export function planReading(state: GameState, side: PlayerId): PlanReading {
  const clock = state.inactivityPlies ?? 0;
  return {
    clock,
    pliesLeft: INACTIVITY_LIMIT - clock,
    mined: { white: minedTotal(state, 'white'), black: minedTotal(state, 'black') },
    bank: state.players[side].resources,
  };
}

/** The digest a case's `stateDigest` is written in: Phasing's for a Phasing case. */
export function caseDigest(c: Pick<ExamCase, 'setup'>, state: GameState): string {
  return c.setup?.ruleset === 'phasing' ? phasingGameplayDigest(state) : gameplayDigest(state);
}

/** Shape validation followed by a real reconstruction. */
export function loadCase(raw: unknown, where: string): { case: ExamCase; state: GameState } {
  const c = validateCaseShape(raw, where);
  return { case: c, state: loadCaseState(c) };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const CASES_DIR = path.resolve(import.meta.dirname, 'cases');

/** STRATEGOS W1.13's wave-1 plan-level set, Phasing (`muju-phasing-4`) only. */
export const CASES_P4_DIR = path.resolve(import.meta.dirname, 'cases-p4');

export function stratumFile(stratum: ExamStratum, dir: string = CASES_DIR): string {
  return path.join(dir, `${stratum}.jsonl`);
}

/** Reads a JSONL file of cases, shape-validating every row. */
export function readCases(file: string): ExamCase[] {
  const text = fs.readFileSync(file, 'utf8');
  const out: ExamCase[] = [];
  const seen = new Set<string>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new ExamFormatError(`${file}:${i + 1}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
    }
    const c = validateCaseShape(parsed, `${file}:${i + 1}`);
    if (seen.has(c.id)) throw new ExamFormatError(`${file}:${i + 1}: duplicate case id ${c.id}`);
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export function writeCases(file: string, cases: readonly ExamCase[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = cases.map(c => JSON.stringify(c)).join('\n');
  fs.writeFileSync(file, cases.length > 0 ? body + '\n' : '');
}

/**
 * Every case of one stratum. Refuses a row whose own `stratum` disagrees with
 * the file it sits in, so a sealed case cannot be smuggled into a dev run by
 * editing one field.
 */
export function loadStratum(stratum: ExamStratum, dir: string = CASES_DIR): ExamCase[] {
  const file = stratumFile(stratum, dir);
  if (!fs.existsSync(file)) return [];
  const cases = readCases(file);
  for (const c of cases) {
    if (c.stratum !== stratum) throw new ExamFormatError(`${file}: case ${c.id} is stratum "${c.stratum}" in the "${stratum}" file`);
  }
  return cases;
}

/** Every case of every stratum, with cross-file id uniqueness enforced. */
export function loadAllStrata(dir: string = CASES_DIR): ExamCase[] {
  const out: ExamCase[] = [];
  const seen = new Set<string>();
  for (const stratum of EXAM_STRATA) {
    for (const c of loadStratum(stratum, dir)) {
      if (seen.has(c.id)) throw new ExamFormatError(`${dir}: case id ${c.id} appears in more than one stratum`);
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}
