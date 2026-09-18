/**
 * E3.1 → E3.2 LOSS JUDGMENT (lane 6 of `docs/hard-ai/e3/E3-PLAN.md`).
 *
 *   node --import tsx lab/hard-ai/audit/loss-judgment.ts \
 *     --exposed lab/results/hard-ai-e2/analysis/e1.1-losses-exposed \
 *     --sweep   lab/results/hard-ai-e2/analysis/e1.1-losses-work-sweep-fresh/sweep.json \
 *     --replays lab/results/hard-ai-e1/e1.1-diag/replays \
 *     --out     lab/results/hard-ai-e3/loss-judgment
 *
 * (No `package.json` line: lane 6 does not own `package.json`. One is proposed
 * in `docs/hard-ai/e3/amendments/lane6.md`.)
 *
 * THE QUESTION. At each analysed loss turn the champion played turn P and the
 * adviser preferred turn A. E2 showed the root generated, listed and searched A
 * every time, so the disagreement is about the SCORE. This tool asks what the
 * score is made of and whether anything other than the champion agrees with it.
 *
 * WHAT IT PRODUCES PER POSITION
 *
 *   (a) STATIC. `Evaluator.full` with `outFeatures` on the played end state and
 *       on the adviser's end state, both FROM THE SEAT'S POINT OF VIEW (not
 *       from the side to move, which is the opponent in both), decomposed into
 *       the 58 features and the five coordinator-owned groups of
 *       `eval-groups.ts`, plus the per-feature and per-group difference
 *       A − P. Next to it the champion's own searched score for both
 *       candidates, read from the E2 exposure. Static and searched can then
 *       disagree in the open.
 *   (b) JUDGE 1, the game outcome. From the replay, the seat's position 3 and 6
 *       of its own turns later, and the game's result: material, bank, upkeep
 *       bill, home state. The question asked of it is whether the later loss is
 *       something the static features of A already priced, and which feature.
 *   (c) JUDGE 2, a foreign engine. `aiv2-hard` — the shipped Hard, the E1
 *       baseline's opponent — driven through the whole turn at the same
 *       reconstructed root under a generous wall allowance, with its end state
 *       decomposed by the same static evaluator.
 *   (d) JUDGE 4, canonical facts. `loss-facts.ts` enumerates kills, upkeep,
 *       home occupancy and spawn squares for both end states from `src/game`
 *       alone, and checks the five features whose definitions are arithmetic on
 *       exactly those facts.
 *
 * THE ADVISER IS NOT A JUDGE. E3-PLAN.md's judge rule: a misjudgment claim
 * names judge 1, 2, 3 or 4. This tool records the adviser's preference as the
 * LOCATOR of the disagreement and never as its resolution.
 *
 * HOW THE ADVISER'S END STATE IS OBTAINED. The E2 exposure artifact stores the
 * adviser's plan only as display strings (`analyze.ts describePlan`), which do
 * not replay. Re-running a 1.6M-unit adviser search at twelve roots to recover
 * them would cost hours. Instead the PRODUCTION generator is re-driven at the
 * root with `gen-view.ts GenFamilyLister` (which is `analyze/engine.ts
 * CandidateLister`'s setup plus `gen/turn.ts decodeTurn`), and the candidate
 * whose `endKey` equals the recorded `adviser.endKey` is decoded into canonical
 * `AIAction`s and applied with `analyze.ts applyPlan`. The end state is then
 * verified by re-packing it and comparing its `Kpos` with the recorded key, so
 * a wrong turn cannot pass silently. E2 established that the adviser's turn IS
 * in the production list at all 14 turns, which is what makes this legal.
 *
 * RULES ARE PROCESS-GLOBAL. `reconstruct` installs and restores the match rules
 * itself; everything after it runs inside ONE `withMatchRules` scope per
 * replay, never nested (the restore puts back the SHIPPED defaults, so a nested
 * scope would silently un-install the game's rules for the rest of the outer
 * body — `replay.ts`'s own warning).
 *
 * WEIGHTS. The evaluator is built by `eval-audit.ts newCtx`, which refuses to
 * run when `DEFAULT_WEIGHTS.version === 0` (E0's I2 lesson). The aiv2 judge is
 * built by `ladder/engines.ts createAiv2Bot`, the ladder's own adapter. No
 * `HardEngine` is constructed here at all.
 *
 * `--arm <name>` (E3.2 lane 10) re-reads the SAME two end states with an
 * ablation arm's weight vector instead of `DEFAULT_WEIGHTS`. The vector comes
 * from `bots/hard.ts hardEnginePatch('ablate:<name>')` — the ladder's own
 * resolution path, the only sanctioned way to get an arm's weights (E0's I2
 * lesson: `armHardConfig()` alone can hand back the version-0 placeholder) —
 * and `armWeights` asserts both `version !== 0` and that the label is the
 * arm's own, not `default-v1`. Nothing else about the run changes: the same
 * roots, the same reconstructed end states, the same judges. Only the price
 * list the static decomposition is read against moves, so `staticDeltaCc`
 * under an arm answers "would this arm's leaf have preferred the adviser's
 * turn", which is the E3.2 reproduction question.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { applyAction } from '../../../src/ai/simulate';
import { phaseEndAction } from '../../../src/game/legality';
import { getUnitDefinition } from '../../../src/game/units';
import { F, FEATURE_COUNT, FEATURE_NAMES } from '../../../src/ai/hard/eval/features';
import { DEFAULT_WEIGHTS, type Weights } from '../../../src/ai/hard/eval/weights';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import type { Side } from '../../../src/ai/hard/types';
import { hardEnginePatch } from '../bots/hard';
import { loadReplay, reconstruct, withMatchRules, hardProfileOf, type ReconstructedTurn } from '../analyze/replay';
import { applyPlan } from '../analyze/analyze';
import { resolveHardConfig, PositionReader, sideOf } from '../analyze/engine';
import { createAiv2Bot } from '../ladder/engines';
import { GenFamilyLister } from './gen-view';
import { newCtx, type Ctx } from './eval-audit';
import { EVAL_GROUP_NAMES, GROUP_OF, type EvalGroup } from './eval-groups';
import { positionFacts, factChecks, type PositionFacts, type FactCheck } from './loss-facts';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface LossArgs {
  exposed: string;
  sweep: string | null;
  replays: string;
  out: string;
  /** Wall allowance handed to the `aiv2-hard` judge for the whole turn. */
  aiv2Ms: number;
  /** Skip judge 2 (the only part that runs an engine). */
  noAiv2: boolean;
  /** Seed for the aiv2 judge's RNG; recorded in every artifact. */
  seed: number;
  /** A label for this set, so a second corpus lands in its own artifacts. */
  label: string;
  /**
   * An `ablate/arms.ts` arm name (e.g. `eval-no-safety`), or null for the
   * champion's `DEFAULT_WEIGHTS`. Only the STATIC decomposition's price list
   * changes; no engine is built from it here.
   */
  arm: string | null;
}

export function parseArgs(argv: readonly string[]): LossArgs {
  let exposed: string | undefined;
  let sweep: string | null = null;
  let replays: string | undefined;
  let out: string | undefined;
  let aiv2Ms = 8000;
  let noAiv2 = false;
  let seed = 20260917;
  let label = 'e1.1';
  let arm: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exposed') exposed = argv[++i];
    else if (a === '--sweep') sweep = argv[++i] ?? null;
    else if (a === '--replays') replays = argv[++i];
    else if (a === '--out') out = argv[++i];
    else if (a === '--aiv2-ms') aiv2Ms = Number(argv[++i]);
    else if (a === '--no-aiv2') noAiv2 = true;
    else if (a === '--seed') seed = Number(argv[++i]);
    else if (a === '--label') label = argv[++i] ?? 'e1.1';
    else if (a === '--arm') arm = argv[++i] ?? null;
    else throw new Error(`loss-judgment: unknown argument ${a}`);
  }
  if (exposed === undefined) throw new Error('loss-judgment: --exposed <dir> is required');
  if (replays === undefined) throw new Error('loss-judgment: --replays <dir> is required');
  if (out === undefined) throw new Error('loss-judgment: --out <dir> is required');
  if (!Number.isFinite(aiv2Ms) || aiv2Ms <= 0) throw new Error('loss-judgment: --aiv2-ms must be positive');
  if (arm !== undefined && arm !== null && arm.length === 0) throw new Error('loss-judgment: --arm needs an arm name');
  return { exposed, sweep, replays, out, aiv2Ms, noAiv2, seed, label, arm };
}

// ---------------------------------------------------------------------------
// Weights: the champion's, or an ablation arm's
// ---------------------------------------------------------------------------

/**
 * The weight vector an arm actually plays with, taken from the LADDER's own
 * resolution path (`hardEnginePatch`), never from `armHardConfig` alone: a
 * full `HardConfig` spread carries `DESKTOP`'s version-0 placeholder weights
 * and silently defeats `HardEngine`'s absent-field default (E0's I2 lesson,
 * repeated in E2). Both assertions below are that lesson written down: the
 * vector must be a real one, and it must be the ARM's, not the champion's
 * under a name that did nothing.
 */
export function armWeights(arm: string | null): Weights {
  if (arm === null) {
    if (DEFAULT_WEIGHTS.version === 0) throw new Error('loss-judgment: DEFAULT_WEIGHTS.version is 0 (placeholder weights); refusing to measure');
    return DEFAULT_WEIGHTS;
  }
  const patch = hardEnginePatch(`ablate:${arm}`);
  const w = patch.weights;
  if (w === undefined) throw new Error(`loss-judgment: hardEnginePatch('ablate:${arm}') resolved no weights`);
  if (w.version === 0) throw new Error(`loss-judgment: arm ${arm} resolved placeholder weights (version 0); refusing to measure`);
  if (w.label === DEFAULT_WEIGHTS.label) {
    throw new Error(`loss-judgment: arm ${arm} resolved the champion's own weights label ${w.label}; the arm's patch did not reach the vector`);
  }
  if (w.w.length !== FEATURE_COUNT) throw new Error(`loss-judgment: arm ${arm} resolved ${w.w.length} weights, expected ${FEATURE_COUNT}`);
  return w;
}

/**
 * `eval-audit.ts newCtx` with an explicit weight vector. `newCtx` is lane 4's
 * and hard-codes `DEFAULT_WEIGHTS`; this is the same construction (same
 * `Replica`, same `Scratch` shape, same `Evaluator`) with the vector supplied,
 * so a `Ctx` built here is interchangeable with one built there.
 */
export function newCtxWithWeights(weights: Weights): Ctx {
  if (weights.version === 0) throw new Error('loss-judgment: refusing to measure with version-0 (placeholder) weights');
  const rep = new Replica();
  return {
    rep,
    sc: new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2),
    ev: new Evaluator(rep, weights),
    fMover: new Int32Array(FEATURE_COUNT),
    fOther: new Int32Array(FEATURE_COUNT),
    fMirror: new Int32Array(FEATURE_COUNT),
  };
}

// ---------------------------------------------------------------------------
// Static decomposition from the seat's point of view
// ---------------------------------------------------------------------------

export interface Decomposition {
  /** `Evaluator.full(p, seat)` in centi-crystals, from the SEAT, not from the mover. */
  score: number;
  /** `Σ_i w[i]·f[i]`; equals `score` when the score identity holds. */
  sumWf: number;
  /** The 58 raw features from the seat's point of view. */
  f: number[];
  /** `w[i]·f[i]` in centi-crystals. */
  c: number[];
  groupSums: Record<EvalGroup, number>;
  /** The side to move in the position that was decomposed (the opponent, at an end state). */
  toMove: Side;
  /** `full(p, 1 − seat)` on the same position. */
  scoreOther: number;
  /**
   * `score === −scoreOther` AND every feature antisymmetric under the point of
   * view. This whole lane reads end states from the SEAT while the side to move
   * is the opponent, so if antisymmetry failed here the reading would be
   * arbitrary. Lane 4's `eval-audit` checks the same identity on its corpora;
   * this records it on the loss positions themselves.
   */
  antisymmetric: boolean;
  /** Feature indices where `f_i(p, seat) !== −f_i(p, 1 − seat)`. */
  sideSwapBad: number[];
}

/**
 * `eval-audit.ts measure` evaluates from the SIDE TO MOVE and does its own
 * rules installation; at a turn's end state the side to move is the opponent,
 * and a loss judgment has to read the position from the seat that has to live
 * in it. This helper therefore calls the same `Evaluator` on the same `Ctx`
 * with `seat` as the point of view, and installs nothing — the caller already
 * holds the match rules open (see the header).
 */
export function decomposeFromSeat(ctx: Ctx, state: GameState, seat: Side, weights: Weights = DEFAULT_WEIGHTS): Decomposition {
  const p = ctx.rep.pack(state);
  const score = ctx.ev.full(p, seat, ctx.sc, 0, ctx.fMover);
  const scoreOther = ctx.ev.full(p, (1 - seat) as Side, ctx.sc, 0, ctx.fOther);
  const sideSwapBad: number[] = [];
  // The vector the `Evaluator` in `ctx` was built with; `score` and `sumWf`
  // must agree, and they only do when this is the same vector.
  const w = weights.w;
  const f: number[] = new Array<number>(FEATURE_COUNT);
  const c: number[] = new Array<number>(FEATURE_COUNT);
  const groupSums = {} as Record<EvalGroup, number>;
  for (const g of EVAL_GROUP_NAMES) groupSums[g] = 0;
  let sumWf = 0;
  for (let i = 0; i < FEATURE_COUNT; i++) {
    const v = ctx.fMover[i];
    const ci = w[i] * v;
    f[i] = v;
    c[i] = ci;
    sumWf += ci;
    groupSums[GROUP_OF[i]] += ci;
    if (ctx.fOther[i] !== -v) sideSwapBad.push(i);
  }
  return {
    score,
    sumWf,
    f,
    c,
    groupSums,
    toMove: p.side as Side,
    scoreOther,
    antisymmetric: score === -scoreOther && sideSwapBad.length === 0,
    sideSwapBad,
  };
}

export interface FeatureDelta {
  index: number;
  name: string;
  group: EvalGroup;
  /** Raw feature at the adviser's end state, seat's view. */
  fAdviser: number;
  fPlayed: number;
  /** `w·f` at each, centi-crystals. */
  cAdviser: number;
  cPlayed: number;
  /** `cAdviser − cPlayed`: positive means the static eval likes the adviser's end state more because of this feature. */
  deltaCc: number;
}

export function featureDeltas(adviser: Decomposition, played: Decomposition): FeatureDelta[] {
  const out: FeatureDelta[] = [];
  for (let i = 0; i < FEATURE_COUNT; i++) {
    if (adviser.c[i] === played.c[i] && adviser.f[i] === played.f[i]) continue;
    out.push({
      index: i,
      name: FEATURE_NAMES[i],
      group: GROUP_OF[i],
      fAdviser: adviser.f[i],
      fPlayed: played.f[i],
      cAdviser: adviser.c[i],
      cPlayed: played.c[i],
      deltaCc: adviser.c[i] - played.c[i],
    });
  }
  out.sort((a, b) => Math.abs(b.deltaCc) - Math.abs(a.deltaCc));
  return out;
}

export function groupDeltas(adviser: Decomposition, played: Decomposition): Record<EvalGroup, number> {
  const out = {} as Record<EvalGroup, number>;
  for (const g of EVAL_GROUP_NAMES) out[g] = adviser.groupSums[g] - played.groupSums[g];
  return out;
}

// ---------------------------------------------------------------------------
// Judge 2: aiv2-hard at the same root
// ---------------------------------------------------------------------------

export interface Aiv2Agreement {
  /** Σ|c_aiv2 − c_played| over the 58 contributions, centi-crystals. */
  l1ToPlayed: number;
  l1ToAdviser: number;
  /** Which of the two candidate end states aiv2's own end state is nearer to in contribution space. */
  nearer: 'played' | 'adviser' | 'tie';
  /** Of the five most contested features, how many aiv2 moved the same way the adviser did. */
  topFeaturesWithAdviser: number;
  topFeaturesWithPlayed: number;
  topFeaturesNeutral: number;
  /** One line per top-five feature: name, adviser direction, aiv2 direction. */
  topFeatureDetail: string[];
}

export interface Aiv2Verdict {
  /** `Kpos` of the position aiv2-hard's whole turn left, or null when it could not be packed. */
  endKey: string | null;
  actions: string[];
  /** Whole-turn wall time actually spent, ms. */
  ms: number;
  /** Decisions the adapter made inside the turn. */
  decisions: number;
  /** The turn was cut off by the iteration guard rather than by the turn ending. */
  guardHit: boolean;
  noops: number;
}

/**
 * `createAiv2Bot('hard', false, wall:<ms>)` is the E1.1 baseline's own opponent
 * adapter: ONE `AIEngineV2` per seat per game, the whole-turn allowance split
 * across the turn's remaining decisions exactly as `useAI.ts` splits it. This
 * driver reproduces `lab/harness/runner.ts playGame`'s inner loop for ONE turn:
 * a null proposal becomes `phaseEndAction`, a refused action is a no-op and
 * three consecutive no-ops force the phase to end.
 */
export async function aiv2AtRoot(root: GameState, seat: PlayerId, ms: number, seed: number): Promise<Aiv2Verdict & { endState: GameState }> {
  const bot = createAiv2Bot('hard', false, { mode: 'wall', ms });
  bot.onGameStart?.(seat, seed);
  const reader = new PositionReader();
  const actions: string[] = [];
  let s = root;
  let noops = 0;
  let decisions = 0;
  let guardHit = true;
  const startedAt = Date.now();
  for (let i = 0; i < 64; i++) {
    if (s.phase === 'victory' || s.turn.currentPlayer !== seat) { guardHit = false; break; }
    let a: AIAction | null = await bot.nextAction(s, seat);
    decisions++;
    if (!a) a = phaseEndAction(s);
    const next = applyAction(s, a);
    if (next === s) {
      noops++;
      if (noops >= 3) {
        s = applyAction(s, s.turn.phase === 'place' ? { type: 'END_PLACE_PHASE' } : { type: 'END_ACTION_PHASE' });
        noops = 0;
      }
      continue;
    }
    noops = 0;
    actions.push(a.type);
    s = next;
  }
  return { endKey: reader.packKey(s), actions, ms: Date.now() - startedAt, decisions, guardHit, noops, endState: s };
}

/**
 * End-key identity is a very strict test for a whole-turn engine: a Muju turn is
 * a joint choice of up to four actions plus purchases, so two engines can
 * strongly agree about what matters and still land on different `Kpos`. This
 * measures the weaker, still-foreign agreement: whose end state aiv2's own end
 * state resembles in the champion's own contribution space, and, on the five
 * features the two candidates disagree about most, which way aiv2 went.
 */
export function aiv2Agreement(aiv2: Decomposition, adviser: Decomposition, played: Decomposition): Aiv2Agreement {
  let l1P = 0;
  let l1A = 0;
  for (let i = 0; i < FEATURE_COUNT; i++) {
    l1P += Math.abs(aiv2.c[i] - played.c[i]);
    l1A += Math.abs(aiv2.c[i] - adviser.c[i]);
  }
  const contested = featureDeltas(adviser, played).slice(0, 5);
  let withAdviser = 0;
  let withPlayed = 0;
  let neutral = 0;
  const detail: string[] = [];
  for (const d of contested) {
    const advDir = Math.sign(d.deltaCc);
    const aiDir = Math.sign(aiv2.c[d.index] - played.c[d.index]);
    if (aiDir === 0) neutral++;
    else if (aiDir === advDir) withAdviser++;
    else withPlayed++;
    detail.push(`${d.name}: adviser ${advDir > 0 ? '+' : '-'}${Math.abs(d.deltaCc)}cc vs played, aiv2 ${aiDir === 0 ? 'equal to played' : `${aiDir > 0 ? '+' : '-'}${Math.abs(aiv2.c[d.index] - played.c[d.index])}cc vs played`}`);
  }
  return {
    l1ToPlayed: l1P,
    l1ToAdviser: l1A,
    nearer: l1P < l1A ? 'played' : l1A < l1P ? 'adviser' : 'tie',
    topFeaturesWithAdviser: withAdviser,
    topFeaturesWithPlayed: withPlayed,
    topFeaturesNeutral: neutral,
    topFeatureDetail: detail,
  };
}

// ---------------------------------------------------------------------------
// Judge 1: the game outcome
// ---------------------------------------------------------------------------

export interface OutcomeSnapshot {
  /** Which of the seat's own turns this is, counted from the decision turn. */
  seatTurnsLater: number;
  /** null when the game ended before that turn. */
  turnNumber: number | null;
  reached: boolean;
  facts: PositionFacts | null;
}

export interface Judge1 {
  result: 'win' | 'loss' | 'draw';
  /** Seat material minus opponent material, catalogue crystals, at the decision's end states and later. */
  materialGap: { played: number; adviser: number; plus3: number | null; plus6: number | null };
  /** Seat bank minus opponent bank, crystals, same three points. */
  bankGap: { played: number; adviser: number; plus3: number | null; plus6: number | null };
  /** `materialGap.plus3 − materialGap.played`: what the material race actually did after the played turn. */
  materialSwing3: number | null;
  materialSwing6: number | null;
  /** The seat's own home was standing on an enemy unit at +3 / +6. */
  homeLost3: boolean | null;
  homeLost6: boolean | null;
  winner: PlayerId | null;
  winType: string | null;
  totalSeatTurns: number;
  atDecision: PositionFacts;
  plus3: OutcomeSnapshot;
  plus6: OutcomeSnapshot;
}

function snapshot(seatTurns: readonly ReconstructedTurn[], index: number, later: number): OutcomeSnapshot {
  const t = seatTurns[index + later];
  if (t === undefined) return { seatTurnsLater: later, turnNumber: null, reached: false, facts: null };
  return { seatTurnsLater: later, turnNumber: t.turnNumber, reached: true, facts: positionFacts(t.startState) };
}

// ---------------------------------------------------------------------------
// Per-position record
// ---------------------------------------------------------------------------

export interface LossPosition {
  /** `Kpos` of the ROOT the decision was made at; the dedupe key. */
  rootKey: string;
  /** Every exposed artifact whose first-consequential turn sits at this root. */
  fileIds: string[];
  seat: PlayerId;
  seatSide: Side;
  opening: string;
  turnNumber: number;
  seatTurnIndex: number;
  klass: string;
  seatBot: string;
  opponentBot: string;
  playedEndKey: string;
  adviserEndKey: string;
  /** Actions of each candidate as the generator decodes them. */
  playedActions: string[];
  adviserActions: string[];
  /** The champion's own per-candidate scores at 400k from the E2 exposure (fail-low bounds; see E2-LANE2-EXPOSED-LOSSES.md finding 2). */
  searched: { adviserCc: number; playedCc: number; adviserIndex: number; playedIndex: number; adviserGenRankCc: number; playedGenRankCc: number; listN: number; completedDepth: number };
  /** The adviser's 1.6M-unit deep scores from the E1 analysis, for the record only. */
  adviser: { deepCc: number; playedDeepCc: number; swingCc: number; scoreCc: number; depth: number; work: number };
  /** The fresh work sweep: the work at which the champion flips to the adviser's turn, or null. */
  flipWork: number | null;
  neverFlips: boolean;
  staticPlayed: Decomposition;
  staticAdviser: Decomposition;
  /** `staticAdviser.score − staticPlayed.score`, centi-crystals, seat's view. */
  staticDeltaCc: number;
  /** `searched.adviserCc − searched.playedCc`. */
  searchedDeltaCc: number;
  /** Which way each meter points, and whether they agree. */
  verdict: 'static-and-search-agree-on-adviser' | 'static-prefers-adviser-search-does-not' | 'static-prefers-played' | 'static-indifferent';
  featureDeltas: FeatureDelta[];
  groupDeltas: Record<EvalGroup, number>;
  judge1: Judge1;
  judge2: Aiv2Verdict & {
    picks: 'played' | 'adviser' | 'third' | 'unknown';
    staticFromSeat: Decomposition | null;
    /** `static(aiv2) − static(played)`, seat's view, centi-crystals. */
    deltaVsPlayedCc: number | null;
    /** `static(aiv2) − static(adviser)`. */
    deltaVsAdviserCc: number | null;
    agreement: Aiv2Agreement | null;
  };
  judge4: {
    played: PositionFacts;
    adviser: PositionFacts;
    checksPlayed: FactCheck[];
    checksAdviser: FactCheck[];
    contradictions: string[];
  };
  notes: string[];
}

function actionText(state: GameState, actions: readonly AIAction[]): string[] {
  const posOf = (unitId: string): string => {
    const u = state.board.units.find(x => x.id === unitId);
    return u ? `${u.position.x},${u.position.y}` : unitId;
  };
  return actions.map(a => {
    switch (a.type) {
      case 'MOVE': return `MOVE ${posOf(a.unitId)}→${a.to.x},${a.to.y}`;
      case 'ATTACK': return `ATK ${posOf(a.unitId)}→${a.targetPosition.x},${a.targetPosition.y}`;
      case 'BUY_UNIT': return `BUY ${a.definitionId}@${a.position.x},${a.position.y}`;
      case 'PROMOTE_UNIT': return `PROMOTE ${posOf(a.unitId)}`;
      default: return a.type;
    }
  });
}

interface SweepTurn {
  fileId: string;
  turnNumber: number;
  role: string;
  flipWork: number | null;
}

function loadSweep(file: string | null): Map<string, SweepTurn> {
  const out = new Map<string, SweepTurn>();
  if (file === null) return out;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { turns?: SweepTurn[] };
  for (const t of raw.turns ?? []) out.set(`${t.fileId}#${t.turnNumber}`, t);
  return out;
}

/** The catalogue-cost material of a seat, crystals, for the outcome tables. */
export function materialCrystals(state: GameState, seat: PlayerId): number {
  return state.board.units.filter(u => u.owner === seat).reduce((n, u) => n + getUnitDefinition(u.definitionId).cost, 0);
}

let sweep = new Map<string, SweepTurn>();

export async function judgeOne(
  ctx: Ctx,
  args: LossArgs,
  exposedFile: string,
  weights: Weights = armWeights(args.arm),
): Promise<LossPosition | { skipped: string; fileId: string }> {
  const art = JSON.parse(fs.readFileSync(exposedFile, 'utf8')) as any;
  const fileId: string = art.fileId;
  const fc = art.firstConsequential;
  if (!fc) return { skipped: 'no first-consequential turn', fileId };
  const turnRecord = art.turns[fc.seatTurnIndex];
  const exposure = turnRecord.exposure;
  if (!exposure) return { skipped: 'no root exposure on the first-consequential turn', fileId };

  const replayPath = path.join(args.replays, `${fileId}.json`);
  const replay = loadReplay(replayPath);
  const recon = reconstruct(replay);
  const seat: PlayerId = art.side;
  const seatTurns = recon.bySide[seat];
  const turn = seatTurns[fc.seatTurnIndex];
  if (turn === undefined) return { skipped: `seat turn ${fc.seatTurnIndex} missing from the reconstruction`, fileId };

  const notes: string[] = [];
  const seatSide = sideOf(seat);
  const profile = hardProfileOf(art.seatBot) ?? 'desktop';
  const cfg = resolveHardConfig(profile);

  return withMatchRules(replay.options, async (): Promise<LossPosition> => {
    const reader = new PositionReader();
    const rootKey = reader.packKey(turn.startState);
    if (rootKey === null) throw new Error(`${fileId}: the root position does not pack`);

    // The production generator's whole list at the root, decoded.
    const lister = new GenFamilyLister(cfg.gen, cfg.weights);
    const list = lister.list(turn.startState, 0);
    if (list === null) throw new Error(`${fileId}: the generator refused the root`);

    const adviserEndKey: string = turnRecord.adviser.endKey;
    const playedEndKey: string = turnRecord.played.endKey;
    const adviserCand = list.turns.find(t => t.endKey === adviserEndKey);
    if (adviserCand === undefined) {
      return { skipped: `the adviser end key ${adviserEndKey} is not in the re-driven generator list`, fileId } as never;
    }
    const playedCand = list.turns.find(t => t.endKey === playedEndKey);

    const adviserPlan = applyPlan(turn.startState, adviserCand.actions);
    if (adviserPlan.applied !== adviserCand.actions.length) {
      notes.push(`the adviser's decoded plan replayed only ${adviserPlan.applied}/${adviserCand.actions.length} actions`);
    }
    const adviserEnd = adviserPlan.state;
    const adviserCheck = reader.packKey(adviserEnd);
    if (adviserCheck !== adviserEndKey) {
      throw new Error(`${fileId}: the replayed adviser turn lands on ${String(adviserCheck)}, not ${adviserEndKey}`);
    }
    const playedEnd = turn.endState;
    const playedCheck = reader.packKey(playedEnd);
    if (playedCheck !== playedEndKey) {
      notes.push(`the reconstructed played end state packs to ${String(playedCheck)}, not the recorded ${playedEndKey}`);
    }

    const staticPlayed = decomposeFromSeat(ctx, playedEnd, seatSide, weights);
    const staticAdviser = decomposeFromSeat(ctx, adviserEnd, seatSide, weights);
    const staticDeltaCc = staticAdviser.score - staticPlayed.score;
    const searchedDeltaCc = exposure.adviserBest.scoreCc - exposure.played.scoreCc;

    const verdict: LossPosition['verdict'] =
      staticDeltaCc > 0 && searchedDeltaCc > 0
        ? 'static-and-search-agree-on-adviser'
        : staticDeltaCc > 0
          ? 'static-prefers-adviser-search-does-not'
          : staticDeltaCc < 0
            ? 'static-prefers-played'
            : 'static-indifferent';

    // Judge 1.
    const plus3 = snapshot(seatTurns, fc.seatTurnIndex, 3);
    const plus6 = snapshot(seatTurns, fc.seatTurnIndex, 6);
    const factsPlayedEarly = positionFacts(playedEnd);
    const factsAdviserEarly = positionFacts(adviserEnd);
    const gap = (f: PositionFacts | null, pick: (s: PositionFacts['white']) => number): number | null =>
      f === null ? null : pick(seat === 'white' ? f.white : f.black) - pick(seat === 'white' ? f.black : f.white);
    const mat = (f: PositionFacts | null): number | null => gap(f, x => x.materialCrystals);
    const bank = (f: PositionFacts | null): number | null => gap(f, x => x.bank);
    const matPlayed = mat(factsPlayedEarly) as number;
    const judge1: Judge1 = {
      result: art.outcome.sideResult,
      winner: art.outcome.winner,
      winType: art.outcome.winType,
      materialGap: { played: matPlayed, adviser: mat(factsAdviserEarly) as number, plus3: mat(plus3.facts), plus6: mat(plus6.facts) },
      bankGap: { played: bank(factsPlayedEarly) as number, adviser: bank(factsAdviserEarly) as number, plus3: bank(plus3.facts), plus6: bank(plus6.facts) },
      materialSwing3: plus3.facts === null ? null : (mat(plus3.facts) as number) - matPlayed,
      materialSwing6: plus6.facts === null ? null : (mat(plus6.facts) as number) - matPlayed,
      homeLost3: plus3.facts === null ? null : (seat === 'white' ? plus3.facts.white : plus3.facts.black).homeOccupied,
      homeLost6: plus6.facts === null ? null : (seat === 'white' ? plus6.facts.white : plus6.facts.black).homeOccupied,
      totalSeatTurns: seatTurns.length,
      atDecision: positionFacts(turn.startState),
      plus3,
      plus6,
    };

    // Judge 2.
    let judge2: LossPosition['judge2'];
    if (args.noAiv2) {
      judge2 = { endKey: null, actions: [], ms: 0, decisions: 0, guardHit: false, noops: 0, picks: 'unknown', staticFromSeat: null, deltaVsPlayedCc: null, deltaVsAdviserCc: null, agreement: null };
    } else {
      const { endState: aiv2EndState, ...v } = await aiv2AtRoot(turn.startState, seat, args.aiv2Ms, args.seed);
      let picks: 'played' | 'adviser' | 'third' | 'unknown' = 'unknown';
      let staticFromSeat: Decomposition | null = null;
      let deltaVsPlayedCc: number | null = null;
      let deltaVsAdviserCc: number | null = null;
      let agreement: Aiv2Agreement | null = null;
      if (v.endKey !== null) {
        picks = v.endKey === playedEndKey ? 'played' : v.endKey === adviserEndKey ? 'adviser' : 'third';
        // The aiv2 turn is replayed through the canonical engine, so its end
        // state is a real position; decompose it from the same seat.
        try {
          staticFromSeat = decomposeFromSeat(ctx, aiv2EndState, seatSide, weights);
          deltaVsPlayedCc = staticFromSeat.score - staticPlayed.score;
          deltaVsAdviserCc = staticFromSeat.score - staticAdviser.score;
          agreement = aiv2Agreement(staticFromSeat, staticAdviser, staticPlayed);
        } catch {
          staticFromSeat = null;
        }
      }
      judge2 = { ...v, picks, staticFromSeat, deltaVsPlayedCc, deltaVsAdviserCc, agreement };
    }

    // Judge 4.
    const factsPlayed = factsPlayedEarly;
    const factsAdviser = factsAdviserEarly;
    const checksPlayed = factChecks(factsPlayed, staticPlayed.f, seat, F as unknown as Record<string, number>);
    const checksAdviser = factChecks(factsAdviser, staticAdviser.f, seat, F as unknown as Record<string, number>);
    const contradictions: string[] = [];
    for (const [label, checks] of [['played', checksPlayed], ['adviser', checksAdviser]] as const) {
      for (const c of checks) {
        if (!c.agrees) contradictions.push(`${label} end state: ${c.feature} says ${c.featureValue}, the rules engine says ${c.canonicalValue} (${c.note})`);
      }
    }

    const sweepKey = `${fileId}#${turnRecord.turnNumber}`;
    const sweepTurn = sweep.get(sweepKey) ?? null;

    return {
      rootKey,
      fileIds: [fileId],
      seat,
      seatSide,
      opening: art.opening,
      turnNumber: turnRecord.turnNumber,
      seatTurnIndex: fc.seatTurnIndex,
      klass: fc.klass,
      seatBot: art.seatBot,
      opponentBot: art.opponentBot,
      playedEndKey,
      adviserEndKey,
      playedActions: playedCand ? actionText(turn.startState, playedCand.actions) : turnRecord.played.actions,
      adviserActions: actionText(turn.startState, adviserCand.actions),
      searched: {
        adviserCc: exposure.adviserBest.scoreCc,
        playedCc: exposure.played.scoreCc,
        adviserIndex: exposure.adviserBest.index,
        playedIndex: exposure.played.index,
        adviserGenRankCc: exposure.adviserBest.genRankCc,
        playedGenRankCc: exposure.played.genRankCc,
        listN: exposure.count,
        completedDepth: exposure.completedDepth,
      },
      adviser: {
        deepCc: turnRecord.adviserBestDeepCc,
        playedDeepCc: turnRecord.playedDeepCc,
        swingCc: turnRecord.swingCc,
        scoreCc: turnRecord.adviser.scoreCc,
        depth: turnRecord.adviser.depth,
        work: turnRecord.adviser.work,
      },
      flipWork: sweepTurn?.flipWork ?? null,
      neverFlips: sweepTurn ? sweepTurn.flipWork === null : false,
      staticPlayed,
      staticAdviser,
      staticDeltaCc,
      searchedDeltaCc,
      verdict,
      featureDeltas: featureDeltas(staticAdviser, staticPlayed),
      groupDeltas: groupDeltas(staticAdviser, staticPlayed),
      judge1,
      judge2,
      judge4: { played: factsPlayed, adviser: factsAdviser, checksPlayed, checksAdviser, contradictions },
      notes,
    };
  });
}

export async function run(args: LossArgs): Promise<{ positions: LossPosition[]; skipped: { fileId: string; skipped: string }[] }> {
  sweep = loadSweep(args.sweep);
  const weights = armWeights(args.arm);
  // `newCtx()` is lane 4's and is exactly `newCtxWithWeights(DEFAULT_WEIGHTS)`;
  // the champion path keeps calling it so the default run is unchanged.
  const ctx = args.arm === null ? newCtx() : newCtxWithWeights(weights);
  const files = fs
    .readdirSync(args.exposed)
    .filter(f => f.endsWith('.json') && f !== 'summary.json')
    .sort()
    .map(f => path.join(args.exposed, f));
  const positions: LossPosition[] = [];
  const skipped: { fileId: string; skipped: string }[] = [];
  for (const file of files) {
    const r = await judgeOne(ctx, args, file, weights);
    if ('skipped' in r) { skipped.push(r as { fileId: string; skipped: string }); continue; }
    const existing = positions.find(p => p.rootKey === r.rootKey && p.playedEndKey === r.playedEndKey && p.adviserEndKey === r.adviserEndKey);
    if (existing) existing.fileIds.push(...r.fileIds);
    else positions.push(r);
    process.stderr.write(`${r.fileIds[0]} t${r.turnNumber} ${r.seat}: static ${r.staticDeltaCc >= 0 ? '+' : ''}${r.staticDeltaCc} searched ${r.searchedDeltaCc >= 0 ? '+' : ''}${r.searchedDeltaCc} aiv2 ${r.judge2.picks}\n`);
  }
  return { positions, skipped };
}

// ---------------------------------------------------------------------------
// The loss-dominant concept
// ---------------------------------------------------------------------------

export interface ConceptRow {
  key: string;
  group: EvalGroup | 'group';
  /** Positions (of the distinct set) where this feature/group moved at all. */
  positions: number;
  /** Positions where it moved in the adviser's favour (`deltaCc > 0`). */
  towardsAdviser: number;
  towardsPlayed: number;
  /** Σ of the signed delta over the positions, centi-crystals. */
  sumDeltaCc: number;
  /** Σ |delta| over the positions, centi-crystals. */
  sumAbsCc: number;
  meanDeltaCc: number;
  /** The single largest |delta| and where it happened. */
  maxAbsCc: number;
  maxAt: string;
}

function rank(positions: readonly LossPosition[], pick: (p: LossPosition) => { key: string; group: EvalGroup | 'group'; delta: number }[]): ConceptRow[] {
  const rows = new Map<string, ConceptRow>();
  for (const p of positions) {
    for (const { key, group, delta } of pick(p)) {
      if (delta === 0) continue;
      let r = rows.get(key);
      if (r === undefined) {
        r = { key, group, positions: 0, towardsAdviser: 0, towardsPlayed: 0, sumDeltaCc: 0, sumAbsCc: 0, meanDeltaCc: 0, maxAbsCc: 0, maxAt: '' };
        rows.set(key, r);
      }
      r.positions++;
      if (delta > 0) r.towardsAdviser++; else r.towardsPlayed++;
      r.sumDeltaCc += delta;
      r.sumAbsCc += Math.abs(delta);
      if (Math.abs(delta) > r.maxAbsCc) { r.maxAbsCc = Math.abs(delta); r.maxAt = `${p.fileIds[0]} t${p.turnNumber}`; }
    }
  }
  const out = [...rows.values()];
  for (const r of out) r.meanDeltaCc = Math.round(r.sumDeltaCc / r.positions);
  out.sort((a, b) => b.sumAbsCc - a.sumAbsCc);
  return out;
}

export function featureRanking(positions: readonly LossPosition[]): ConceptRow[] {
  return rank(positions, p => p.featureDeltas.map(d => ({ key: d.name, group: d.group, delta: d.deltaCc })));
}

export function groupRanking(positions: readonly LossPosition[]): ConceptRow[] {
  return rank(positions, p => EVAL_GROUP_NAMES.map(g => ({ key: g, group: 'group' as const, delta: p.groupDeltas[g] })));
}

export interface LossSummary {
  schema: 'muju-hard-loss-judgment-v1';
  label: string;
  at: string;
  args: LossArgs;
  weightsVersion: number;
  /** `Weights.label` the static decomposition was read against. */
  weightsLabel: string;
  /** The arm whose weights were used, or null for the champion's. */
  arm: string | null;
  turnsRead: number;
  distinctPositions: number;
  duplicates: { rootKey: string; fileIds: string[] }[];
  skipped: { fileId: string; skipped: string }[];
  verdicts: Record<string, number>;
  aiv2Picks: Record<string, number>;
  neverFlip: string[];
  featureRanking: ConceptRow[];
  groupRanking: ConceptRow[];
  featureRankingNeverFlip: ConceptRow[];
  groupRankingNeverFlip: ConceptRow[];
  contradictions: string[];
  /** Positions where the seat-view reading is not the negation of the mover-view reading. */
  antisymmetryFailures: string[];
  wallMs: number;
}

function tally(xs: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

export function summarise(positions: readonly LossPosition[], skipped: { fileId: string; skipped: string }[], args: LossArgs, wallMs: number): LossSummary {
  const never = positions.filter(p => p.neverFlips);
  const weights = armWeights(args.arm);
  return {
    schema: 'muju-hard-loss-judgment-v1',
    label: args.label,
    at: new Date().toISOString(),
    args,
    weightsVersion: weights.version,
    weightsLabel: weights.label,
    arm: args.arm,
    turnsRead: positions.reduce((n, p) => n + p.fileIds.length, 0),
    distinctPositions: positions.length,
    duplicates: positions.filter(p => p.fileIds.length > 1).map(p => ({ rootKey: p.rootKey, fileIds: p.fileIds })),
    skipped,
    verdicts: tally(positions.map(p => p.verdict)),
    aiv2Picks: tally(positions.map(p => p.judge2.picks)),
    neverFlip: never.map(p => `${p.fileIds.join('+')} t${p.turnNumber} ${p.seat}`),
    featureRanking: featureRanking(positions),
    groupRanking: groupRanking(positions),
    featureRankingNeverFlip: featureRanking(never),
    groupRankingNeverFlip: groupRanking(never),
    contradictions: positions.flatMap(p => p.judge4.contradictions.map(c => `${p.fileIds[0]} t${p.turnNumber}: ${c}`)),
    antisymmetryFailures: positions
      .filter(p => !p.staticPlayed.antisymmetric || !p.staticAdviser.antisymmetric)
      .map(p => `${p.fileIds[0]} t${p.turnNumber}: played bad=[${p.staticPlayed.sideSwapBad.join(',')}] adviser bad=[${p.staticAdviser.sideSwapBad.join(',')}]`),
    wallMs,
  };
}

function cc(x: number): string {
  return `${x >= 0 ? '+' : ''}${x}`;
}

export function summaryMarkdown(s: LossSummary, positions: readonly LossPosition[]): string {
  const L: string[] = [];
  L.push(`# E3.1 loss judgment — \`${s.label}\``);
  L.push('');
  L.push(`Generated ${s.at} by \`lab/hard-ai/audit/loss-judgment.ts\`.`);
  L.push(`${s.turnsRead} analysed turns, ${s.distinctPositions} distinct positions, weights \`${s.weightsLabel}\` version ${s.weightsVersion}${s.arm === null ? ' (the champion\'s)' : ` (arm \`${s.arm}\`)`}.`);
  L.push(`Judge 2 allowance: ${s.args.aiv2Ms} ms per turn for \`aiv2-hard\`, seed ${s.args.seed}.`);
  L.push('');
  L.push('All static scores are centi-crystals FROM THE SEAT that lost, at the turn\'s end state.');
  L.push('`static Δ` is adviser minus played; positive means the champion\'s own static evaluation prefers the adviser\'s turn.');
  L.push('`searched Δ` is the same difference in `RootCandidate.scoreCc` at 400k units; those are fail-low bounds, so an exact 0 means "searched, not preferred", not "equal".');
  L.push('');
  L.push('| position | seat | turn | class | static A | static P | static Δ | searched Δ | flip work | aiv2-hard | verdict |');
  L.push('| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const p of positions) {
    L.push(`| \`${p.fileIds.join('` + `')}\` | ${p.seat} | ${p.turnNumber} | ${p.klass} | ${p.staticAdviser.score} | ${p.staticPlayed.score} | ${cc(p.staticDeltaCc)} | ${cc(p.searchedDeltaCc)} | ${p.flipWork === null ? 'never' : p.flipWork} | ${p.judge2.picks} | ${p.verdict} |`);
  }
  L.push('');
  L.push('## Judges, per position');
  L.push('');
  L.push('`mat gap` is seat material minus opponent material in catalogue crystals; `P` at the played end state, then the seat\'s own turn 3 and 6 later.');
  L.push('`aiv2 Δ` is the champion\'s static score of `aiv2-hard`\'s own end state minus its score of the played end state, from the seat.');
  L.push('`nearer` is which candidate end state aiv2\'s lies nearer to in contribution space (L1 over the 58 weighted contributions).');
  L.push('');
  L.push('| position | result | mat gap P | +3 | +6 | home lost +6 | aiv2 Δ vs played | aiv2 Δ vs adviser | nearer | top-5 with adviser |');
  L.push('| --- | --- | ---: | ---: | ---: | :-: | ---: | ---: | --- | ---: |');
  for (const p of positions) {
    const j = p.judge1;
    const a = p.judge2.agreement;
    L.push(`| \`${p.fileIds[0]}\` | ${j.result} ${j.winType ?? ''} | ${cc(j.materialGap.played)} | ${j.materialGap.plus3 === null ? '-' : cc(j.materialGap.plus3)} | ${j.materialGap.plus6 === null ? '-' : cc(j.materialGap.plus6)} | ${j.homeLost6 === null ? '-' : j.homeLost6 ? 'yes' : 'no'} | ${p.judge2.deltaVsPlayedCc === null ? '-' : cc(p.judge2.deltaVsPlayedCc)} | ${p.judge2.deltaVsAdviserCc === null ? '-' : cc(p.judge2.deltaVsAdviserCc)} | ${a?.nearer ?? '-'} | ${a ? `${a.topFeaturesWithAdviser}/5` : '-'} |`);
  }
  L.push('');
  L.push('## Where each position is routed');
  L.push('');
  L.push('- `static-prefers-adviser-search-does-not`: the leaf evaluation already prefers the adviser\'s end state and the depth-3 search does not. That is a search or leaf problem (E4), not a judgment problem.');
  L.push('- `static-prefers-played`: the leaf evaluation prefers the played end state. That is a judgment problem and E3.2 material.');
  L.push('- `static-indifferent`: the two end states score the same statically.');
  L.push('');
  L.push('## Verdict counts');
  L.push('');
  for (const [k, v] of Object.entries(s.verdicts)) L.push(`- ${k}: ${v}`);
  L.push('');
  L.push('## Judge 2 (`aiv2-hard`, foreign engine)');
  L.push('');
  for (const [k, v] of Object.entries(s.aiv2Picks)) L.push(`- picks the ${k}: ${v}`);
  L.push('');
  L.push('## Group ranking (all distinct positions)');
  L.push('');
  L.push('| group | positions | → adviser | → played | Σ Δ cc | Σ \\|Δ\\| cc | mean Δ cc | max \\|Δ\\| | at |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of s.groupRanking) L.push(`| ${r.key} | ${r.positions} | ${r.towardsAdviser} | ${r.towardsPlayed} | ${cc(r.sumDeltaCc)} | ${r.sumAbsCc} | ${cc(r.meanDeltaCc)} | ${r.maxAbsCc} | ${r.maxAt} |`);
  L.push('');
  L.push('## Feature ranking (all distinct positions, top 20 by Σ |Δ|)');
  L.push('');
  L.push('| feature | group | positions | → adviser | → played | Σ Δ cc | Σ \\|Δ\\| cc | max \\|Δ\\| | at |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of s.featureRanking.slice(0, 20)) L.push(`| ${r.key} | ${r.group} | ${r.positions} | ${r.towardsAdviser} | ${r.towardsPlayed} | ${cc(r.sumDeltaCc)} | ${r.sumAbsCc} | ${r.maxAbsCc} | ${r.maxAt} |`);
  L.push('');
  L.push(`## The never-flip positions (${s.neverFlip.length})`);
  L.push('');
  for (const n of s.neverFlip) L.push(`- ${n}`);
  L.push('');
  L.push('| feature | group | positions | → adviser | → played | Σ Δ cc | Σ \\|Δ\\| cc |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of s.featureRankingNeverFlip.slice(0, 15)) L.push(`| ${r.key} | ${r.group} | ${r.positions} | ${r.towardsAdviser} | ${r.towardsPlayed} | ${cc(r.sumDeltaCc)} | ${r.sumAbsCc} |`);
  L.push('');
  L.push('## Side-swap antisymmetry at the 24 end states');
  L.push('');
  if (s.antisymmetryFailures.length === 0) L.push(`All ${s.distinctPositions * 2} end states read the same from either point of view: \`full(p, seat) === −full(p, opponent)\` and every one of the 58 features negates. The seat-view reading used throughout is therefore not a choice.`);
  else for (const a of s.antisymmetryFailures) L.push(`- ${a}`);
  L.push('');
  L.push('## Judge 4: features against the rules engine');
  L.push('');
  L.push('`Rent`, `BankLiquid`, `HomeInvaded`, `HomePlug` and `SpawnZero` are checked for EQUALITY: their definitions are arithmetic on quantities `src/game` also computes, so a disagreement would be an engine bug.');
  L.push('`Hanging` is checked for SIGN ONLY and against a LOWER BOUND: `t.killActions` is built with a full four-action budget, purchases and promotions on and several attack lanes, while the canonical count allows one step of approach and one single attacker with no purchase. A sign disagreement therefore says the feature\'s sign rests on kills the canonical count cannot see; it is not by itself proof of a bug.');
  L.push('');
  if (s.contradictions.length === 0) L.push('No disagreement at any of the 24 end states.');
  else for (const c of s.contradictions) L.push(`- ${c}`);
  if (s.skipped.length > 0) {
    L.push('');
    L.push('## Skipped');
    L.push('');
    for (const k of s.skipped) L.push(`- \`${k.fileId}\`: ${k.skipped}`);
  }
  L.push('');
  return L.join('\n');
}

export function writeArtifacts(out: string, positions: readonly LossPosition[], summary: LossSummary): void {
  fs.mkdirSync(out, { recursive: true });
  for (const p of positions) {
    fs.writeFileSync(path.join(out, `${p.fileIds[0]}.json`), `${JSON.stringify(p, null, 1)}\n`);
  }
  fs.writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
  fs.writeFileSync(path.join(out, 'summary.md'), summaryMarkdown(summary, positions));
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const startedAt = Date.now();
  const { positions, skipped } = await run(args);
  const summary = summarise(positions, skipped, args, Date.now() - startedAt);
  writeArtifacts(args.out, positions, summary);
  process.stderr.write(`loss-judgment: ${summary.distinctPositions} distinct positions from ${summary.turnsRead} turns in ${Math.round(summary.wallMs / 1000)} s -> ${args.out}\n`);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
