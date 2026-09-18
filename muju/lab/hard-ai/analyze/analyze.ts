/**
 * The per-turn adviser table and the loss classification (EPIC-PLAN §4 E1.1 /
 * E1.4: "Classify losses at the first consequential decision: candidate absent;
 * strong candidate discarded; strong candidate misjudged; reply missed;
 * clock/fallback; or genuinely unclear. A deeper selective search is an
 * adviser, not an exact oracle.").
 *
 * WHAT ONE ROW SAYS. For each turn of the analysed seat, at the state the hard
 * adapter searched from:
 *
 *   played            the actions the seat dispatched, and the `Kpos` of the
 *                     position they left — the same key `RootResult.endKey` and
 *                     `Turn.endLo/endHi` carry, so it is directly comparable.
 *   cheap             the production generator's K list at that root (see
 *                     `./engine.ts`), and whether the played turn and the
 *                     adviser's best turn are in it.
 *   adviser           `HardEngine.searchTurn(state, {work: adviserWork})`.
 *   playedDeepCc      the adviser's assessment OF THE PLAYED TURN: search the
 *                     position the played turn left at the same work and take
 *                     the score from THIS SEAT's point of view (the sign is
 *                     read off `state.turn.currentPlayer`, never assumed).
 *                     `RootResult` exposes no per-candidate scores, so this is
 *                     the only way to ask the adviser what it thinks of a turn
 *                     it did not choose.
 *   adviserBestDeepCc the identical treatment applied to the adviser's OWN best
 *                     turn. It is not the same quantity as `adviser.scoreCc`:
 *                     that is a root score at depth d, this is a root score at
 *                     depth d one ply later. Comparing the played turn's
 *                     one-ply-deeper score with the adviser's SAME-shaped score
 *                     is what makes the swing a like-for-like number rather
 *                     than a depth artefact.
 *
 *   swingCc     = adviserBestDeepCc − playedDeepCc   (the threshold quantity)
 *   swingRootCc = adviser.scoreCc   − playedDeepCc   (E1's literal formula,
 *                                                     reported alongside)
 *
 * WHAT IT CANNOT SAY. `RootResult` is `{actions, scoreCc, depth, work, stats,
 * source, endKey}` and `HardSearchStats` is aggregate counters. Neither carries
 * per-candidate scores nor which candidates the root actually searched, so
 * "strong candidate DISCARDED" (in the list, never searched) and "strong
 * candidate MISJUDGED" (searched, and the engine preferred the played turn)
 * are not separable from outside the engine. They are reported as one class,
 * `strong-candidate-misjudged`, whose rule text says so.
 *
 * The same limit is why the reply class is called `reply-outside-beam` and not
 * "reply missed". The tool can establish that the generator does not offer the
 * adviser's refutation at the reply node — a cheap, exact, repeatable fact. It
 * cannot establish that the SEARCH looked at that node and failed, because
 * nothing reports what the search looked at. The class name says the thing the
 * evidence supports.
 */
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import type { HardConfig } from '../../../src/ai/hard/config';
import type { RootResult } from '../../../src/ai/hard/search/root';
import {
  CandidateLister,
  PositionReader,
  decidedCc,
  defaultAdviserWork,
  defaultEngineFactory,
  ladderWorkRung,
  resolveHardConfig,
  type AdviserEngine,
  type EngineFactory,
} from './engine';
import { reconstruct, hardSeat, hardProfileOf, withMatchRules, type LoadedReplay, type ReconstructedTurn } from './replay';
import { hardConfigHash } from '../bots/hard';
import { resolvedConfigHash } from '../ladder/identity';

/**
 * The swing, in centi-crystals, at which a turn is called consequential. 300 cc
 * is three crystals — the cost of the cheapest tier-1 body — chosen as a
 * STARTING THRESHOLD, not as a measured finding: nothing in E0 or the pilot
 * established where a Muju decision stops being noise. It is a CLI flag
 * (`--swing-cc`) precisely so the sensitivity of a classification to it can be
 * shown rather than assumed.
 */
export const DEFAULT_SWING_CC = 300;

/**
 * Wall-clock slack before a turn counts as an overrun, mirroring
 * `lab/hard-ai/ladder/run.ts`'s proposed `max(10 ms, 1 %)` tolerance so the
 * analyser and the ladder do not disagree about the same turn.
 */
export const OVERRUN_TOLERANCE_MS = 10;
export const OVERRUN_TOLERANCE_PCT = 1;

export type LossClass =
  | 'clock-fallback'
  | 'candidate-absent'
  | 'reply-outside-beam'
  | 'strong-candidate-discarded'
  | 'strong-candidate-misjudged'
  | 'fixed-work-divergence'
  | 'exposure-inconsistent'
  | 'unclear';

/** The rule each class is decided by; emitted verbatim in every artifact so a
 * reader never has to open this file to know what a label means. */
export const CLASS_RULES: Record<LossClass, string> = {
  'clock-fallback':
    'the seat\'s own turn wall time exceeded its allowance (max(10ms, 1%) tolerance), or the turn dispatched nothing but phase ends, or the adviser itself returned a fallback (pack-error / engine-error / divergence). Per-turn wall time is real (players[side].turnMs); the run\'s overruns/budgetExhausted counters are per GAME, so a fallback on a specific turn can be suspected from them but not proved',
  'candidate-absent':
    'the adviser\'s best end key is NOT in the production generator\'s K list at that root, so no search budget could have reached it',
  'reply-outside-beam':
    'the adviser disagreed with the played turn, and its own answer TO the played turn — the refutation — is not in the candidate list the SAME generator configuration that produced it builds at the reply node. The engine had no way to answer this reply because the generator does not offer it there. This is a statement about the generator\'s cone at one node and NOTHING MORE: it is not a claim that the search examined the reply and mis-scored it, nor that the engine "missed" it, because RootResult reports neither',
  'strong-candidate-discarded':
    'the adviser\'s best turn IS in the production generator\'s K list AND in the root\'s own candidate list, and the root never searched it (`searched: false` in `RootResult.candidates`, E2 lane 1\'s `expose`). No search budget reached it, so no evaluation of it was ever wrong: this is an ordering or a beam-width fault, not a scoring one',
  'strong-candidate-misjudged':
    'the adviser\'s best turn IS in the root\'s candidate list, the root DID search it (`searched: true`), and did not prefer it — its score is at or below the played candidate\'s. The search saw the turn and chose another: this is an evaluation or a depth fault. Equality is the usual case and is a FAIL-LOW BOUND, not a tie: a candidate that does not beat the incumbent returns the incumbent\'s score, so the exposure says "searched, not preferred" and cannot say by how much. Before E2 lane 1 this class also swallowed "in the list but never searched", which is now `strong-candidate-discarded`',
  'fixed-work-divergence':
    'the fixed-work re-run did not play what the seat played (`engine.reproducedPlayed` false) AND it scored the adviser\'s best turn strictly above the played candidate. The engine prefers the better turn when it is given this much work; the seat, under a wall clock at a coarser rung, did not. This is a statement about the WORK the seat had, not about its judgement, and it is not evidence that the seat would have found the turn in its allowance — `E2-LANE2-EXPOSED-LOSSES.md`\'s work sweep is what tests that',
  'exposure-inconsistent':
    'the root exposure and the rest of the analysis disagree, so no split is asserted. One of: the adviser\'s best turn is in the generator\'s list but absent from the root\'s published candidate list; the root searched it and scored it strictly ABOVE the played candidate while the re-run DID reproduce the played turn, which contradicts itself (when the re-run did not reproduce it, the class is `fixed-work-divergence`); it ties the played candidate while the played candidate is not the one the root chose; the played turn is absent from the candidate list, so there is nothing to compare against; or the root published a `generator-list` (the must-answer scan, the book probe, `pickUnsearched` or a fallback answered), where every candidate is unsearched by construction. The re-run is FIXED work while the seat played under a wall clock, which is the most likely cause of the first three',
  unclear: 'none of the above separates, or no turn reached the swing threshold',
};

export interface TurnTiming {
  /** `meta.players[side].turnMs[seatTurnIndex]`, or null when absent. */
  turnMs: number | null;
  /** `meta.decisionMs` — the wall allowance per turn, or null in fixed-work runs. */
  budgetMs: number | null;
  overran: boolean;
  /** The seat dispatched nothing but phase ends this turn. */
  emptyPlan: boolean;
}

/** One candidate of the root's published list, as the artifact records it. */
export interface ExposedCandidate {
  index: number;
  endKey: string;
  genRankCc: number;
  flags: number;
  sig: number;
  searched: boolean;
  scoreCc: number | null;
  chosen: boolean;
}

export interface TurnExposure {
  /** Which list the root published (`RootResult.candidateSource`). */
  source: 'completed-depth' | 'partial-iteration' | 'generator-list';
  count: number;
  searchedCount: number;
  /** The deepest iteration the root completed, and where the last one stopped. */
  completedDepth: number | null;
  lastCutoffAt: number | null;
  /** The adviser's best turn, found in the list by end key. */
  adviserBest: ExposedCandidate | null;
  /** The played turn, found in the list by end key. */
  played: ExposedCandidate | null;
  candidates: ExposedCandidate[];
  rootTrace: Array<{ depth: number; n: number; searched: number; completed: boolean; cutoffAt: number; truncated: boolean }>;
}

export interface TurnRow {
  seatTurnIndex: number;
  turnNumber: number;
  side: PlayerId;
  played: {
    actions: string[];
    endKey: string | null;
    inCheapList: boolean;
    endsGame: boolean;
  };
  cheap: {
    count: number;
    containsPlayed: boolean;
    containsAdviserBest: boolean;
  };
  adviser: {
    endKey: string;
    actions: string[];
    scoreCc: number;
    depth: number;
    work: number;
    source: RootResult['source'];
    fallback: RootResult['fallback'] | null;
    /** The adviser agreed with the seat: same end key. */
    agreesWithPlayed: boolean;
  };
  playedDeepCc: number;
  adviserBestDeepCc: number;
  swingCc: number;
  swingRootCc: number;
  engine: {
    /** The production engine re-run at the ladder rung from the same state. */
    scoreCc: number | null;
    endKey: string | null;
    reproducedPlayed: boolean;
  };
  /**
   * E2 lane 1's root exposure, taken from the SAME fixed-work production re-run
   * that produced `engine.scoreCc` (`searchTurn(..., { expose: true })`). It
   * costs no extra search: the re-run happens either way and the instrument
   * only observes.
   *
   * `null` on a row analysed before E2, or when the production result carried
   * no exposure. `adviserBest` and `played` are the two candidates the
   * classification compares; the raw list is kept so a reader can check them.
   *
   * WHAT IT IS NOT. The seat played under `wall:3000` at rungs 200,000-400,000
   * units. This is a FIXED 400,000-unit re-run, so `searched` is what this
   * re-run searched, an approximation of what the seat searched.
   */
  exposure: TurnExposure | null;
  /**
   * The adviser's own answer TO the played turn, and whether the generator
   * offers it at that node.
   *
   * MATCHING MATTERS. The refutation is the best turn of a ROOT search at the
   * reply position, so `search/pvs.ts generateAt` produced it at ply 0 from
   * `cfg.gen` (K=24). Testing that key against a list built from
   * `cfg.genInterior` (K=16) makes ranks 17-24 "absent" by construction and
   * says nothing about the generator. `inRootGenList` is therefore the matched
   * test — same generator, same config, same node — and it is the only one the
   * classification is allowed to use.
   *
   * `inInteriorGenList` is reported ALONGSIDE it, never instead of it: K=16 is
   * what the engine's own search would have used at an interior node, so a
   * refutation present in the root list and absent from the interior one is
   * interesting — but it is a narrower beam answering a wider question, and it
   * is recorded as evidence, not as a rule.
   */
  reply: {
    /** The adviser's best opponent answer to the played turn. */
    refutationKey: string | null;
    /** In `cfg.gen`'s list at the reply node — the matched test. `null` when
     * the node is terminal or the replica refused it. */
    inRootGenList: boolean | null;
    rootGenCount: number;
    /** In `cfg.genInterior`'s list at the reply node. Evidence only. */
    inInteriorGenList: boolean | null;
    interiorGenCount: number;
  };
  timing: TurnTiming;
  notes: string[];
}

export interface Classification {
  turn: number | null;
  seatTurnIndex: number | null;
  klass: LossClass;
  rule: string;
  evidence: string;
}

export interface AnalysisResult {
  schema: 'muju-hard-analyze-v2';
  replay: string;
  fileId: string;
  side: PlayerId;
  seatBot: string;
  opponentBot: string;
  opening: string;
  outcome: { winner: PlayerId | null; winType: string; turns: number; plies: number; sideResult: 'win' | 'loss' | 'draw' };
  config: {
    engineLabel: string;
    adviserWork: number;
    ladderWorkRung: number;
    productionWork: number;
    swingCc: number;
    /** The seat's own hash as the run recorded it. */
    recordedEngineConfigHash: string | null;
    /** The analyser's resolved configuration, hashed the way the ladder does. */
    analyserConfigHash: string;
    genK: number;
    genInteriorK: number;
  };
  reconstruction: { plies: number; winner: PlayerId | null; turnsAnalysed: number; notes: string[] };
  turns: TurnRow[];
  firstConsequential: Classification;
  largestSwing: Classification;
  classRules: Record<LossClass, string>;
  wallMs: number;
  at: string;
}

export interface AnalyzeOptions {
  /** `white` / `black`; defaults to the `hard@*` seat. */
  side?: PlayerId;
  /** `hard@<label>`; defaults to the seat's own bot name. */
  engine?: string;
  adviserWork?: number;
  /** The rung the production re-run searches at; defaults to `ladderWorkRung`. */
  productionWork?: number;
  swingCc?: number;
  /** Stop after this many of the seat's turns (tests and smoke runs). */
  maxTurns?: number;
  engineFactory?: EngineFactory;
  onTurn?: (row: TurnRow) => void;
}

/**
 * A turn rendered as squares rather than unit ids: a reader comparing the
 * played plan with the adviser's needs to see WHERE a body went, and the ids
 * are opaque strings that differ between the recorded process and this one.
 * The plan is walked forward over the canonical engine so a unit bought and
 * then moved inside the same turn resolves to the square it was bought on.
 */
function describeAt(state: GameState, action: AIAction): string {
  const posOf = (unitId: string): string => {
    const unit = state.board.units.find(u => u.id === unitId);
    return unit === undefined ? '?' : `${unit.position.x},${unit.position.y}`;
  };
  switch (action.type) {
    case 'MOVE':
      return `MOVE ${posOf(action.unitId)}→${action.to.x},${action.to.y}`;
    case 'ATTACK':
      return `ATK ${posOf(action.unitId)}→${action.targetPosition.x},${action.targetPosition.y}`;
    case 'BUY_UNIT':
      return `BUY ${action.definitionId}@${action.position.x},${action.position.y}`;
    case 'PROMOTE_UNIT':
      return `PROMOTE ${posOf(action.unitId)}`;
    case 'PAY_UPKEEP':
      return `UPKEEP(keep ${action.keepUnitIds.length})`;
    case 'END_PLACE_PHASE':
      return 'END_PLACE';
    case 'END_ACTION_PHASE':
      return 'END_ACTION';
    default:
      return (action as { type: string }).type;
  }
}

function describePlan(state: GameState, actions: readonly AIAction[]): string[] {
  const out: string[] = [];
  let s = state;
  for (const action of actions) {
    out.push(describeAt(s, action));
    if (s.phase === 'victory' || !isLegalAction(s, action)) break;
    const next = applyAction(s, action);
    if (next === s) break;
    s = next;
  }
  return out;
}

const PHASE_END = new Set(['END_PLACE_PHASE', 'END_ACTION_PHASE']);

export function applyPlan(state: GameState, actions: readonly AIAction[]): { state: GameState; applied: number } {
  let s = state;
  let applied = 0;
  for (const action of actions) {
    if (s.phase === 'victory') break;
    if (!isLegalAction(s, action)) break;
    const next = applyAction(s, action);
    if (next === s) break;
    s = next;
    applied++;
  }
  return { state: s, applied };
}

/**
 * The adviser's opinion of `state`, always FROM `side`'s point of view: read
 * the terminal off it, or search it and fix the sign by who is actually to
 * move.
 *
 * The sign has to be read off the state, not assumed. After a turn that ended
 * normally the opponent is on move and the search's score must be negated —
 * but a plan that did NOT end the turn leaves `side` still on move, and
 * negating there would report a win as a loss. A `RootResult` can be exactly
 * such a plan: a `fallback` hands back a single `phaseEndAction`, which ends a
 * PHASE and not a turn, and `verify/replay.ts` truncates a diverging line at
 * its first bad action.
 */
export async function deepScore(
  engine: AdviserEngine,
  reader: PositionReader,
  state: GameState,
  side: PlayerId,
  work: number,
): Promise<{ cc: number; result: RootResult | null; sideToMove: PlayerId }> {
  const sideToMove = state.turn.currentPlayer;
  if (state.phase === 'victory') return { cc: decidedCc(state.winner, side), result: null, sideToMove };
  const terminal = reader.terminalCc(state, side);
  if (terminal !== null) return { cc: terminal, result: null, sideToMove };
  const result = await engine.searchTurn(state, { work });
  return { cc: sideToMove === side ? result.scoreCc : -result.scoreCc, result, sideToMove };
}

export async function analyzeReplay(replay: LoadedReplay, opts: AnalyzeOptions = {}): Promise<AnalysisResult> {
  const startedAt = Date.now();
  const meta = replay.meta;
  const side = opts.side ?? hardSeat(meta);
  if (side === null) {
    throw new Error(
      `${replay.fileId}: neither seat is a hard@* engine (white=${meta.players.white.bot}, black=${meta.players.black.bot}); pass --side to analyse one anyway`,
    );
  }
  const opponent: PlayerId = side === 'white' ? 'black' : 'white';
  const seatBot = meta.players[side].bot;
  const engineLabel = opts.engine ?? (hardProfileOf(seatBot) === null ? 'hard@desktop' : seatBot);
  const profile = hardProfileOf(engineLabel);
  if (profile === null) throw new Error(`--engine must be hard@<label>, got ${engineLabel}`);

  const config: HardConfig = resolveHardConfig(profile);
  const ladderRung = ladderWorkRung(config);
  const productionWork = opts.productionWork ?? ladderRung;
  const adviserWork = opts.adviserWork ?? defaultAdviserWork(config);
  const swingCc = opts.swingCc ?? DEFAULT_SWING_CC;
  const factory = opts.engineFactory ?? defaultEngineFactory;

  const recon = reconstruct(replay);
  const seatTurns = recon.bySide[side];
  const limit = opts.maxTurns === undefined ? seatTurns.length : Math.min(opts.maxTurns, seatTurns.length);

  const rows: TurnRow[] = await withMatchRules(replay.options, async () => {
    const adviser = factory({ ...config }, 'adviser');
    const production = factory({ ...config }, 'production');
    const reader = new PositionReader();
    // One lister per GenConfig. `rootGen` serves both the turn-start root and
    // the reply node, because the refutation came from a root search and the
    // membership test has to be asked of the generator that produced it.
    const rootGen = new CandidateLister(config.gen, config.weights);
    const interiorGen = new CandidateLister(config.genInterior, config.weights);
    const out: TurnRow[] = [];
    for (let i = 0; i < limit; i++) {
      const row = await analyseTurn({
        turn: seatTurns[i],
        side,
        opponent,
        meta,
        adviser,
        production,
        reader,
        rootGen,
        interiorGen,
        adviserWork,
        productionWork,
      });
      out.push(row);
      opts.onTurn?.(row);
    }
    return out;
  });

  const firstConsequential = classifyFirst(rows, swingCc);
  const largest = classifyLargest(rows, swingCc);
  const sideResult = meta.winner === null ? 'draw' : meta.winner === side ? 'win' : 'loss';

  return {
    schema: 'muju-hard-analyze-v2',
    replay: replay.path,
    fileId: replay.fileId,
    side,
    seatBot,
    opponentBot: meta.players[opponent].bot,
    opening: replay.opening.id,
    outcome: { winner: meta.winner, winType: meta.winType, turns: meta.turns, plies: meta.plies, sideResult },
    config: {
      engineLabel,
      adviserWork,
      ladderWorkRung: ladderRung,
      productionWork,
      swingCc,
      recordedEngineConfigHash: meta.engineConfigHash ?? null,
      analyserConfigHash: analyserConfigHash(profile, adviserWork),
      genK: config.gen.K,
      genInteriorK: config.genInterior.K,
    },
    reconstruction: { plies: recon.plies, winner: recon.winner, turnsAnalysed: rows.length, notes: recon.notes },
    turns: rows,
    firstConsequential,
    largestSwing: largest,
    classRules: CLASS_RULES,
    wallMs: Date.now() - startedAt,
    at: new Date().toISOString(),
  };
}

/**
 * The seat's identity in the ladder's own spelling (`ladder/engines.ts
 * configHash`): the readable label followed by `#<sha256 of the resolved
 * configuration>`. Recording it next to `meta.engineConfigHash` is what lets a
 * reader check that the analyser drove the configuration the seat played, and
 * not merely one with the same name (E0.1).
 */
function analyserConfigHash(profile: string, adviserWork: number): string {
  const work = { mode: 'fixed' as const, units: adviserWork };
  return `${hardConfigHash(profile, work)}#${resolvedConfigHash(`hard@${profile}`, work)}`;
}

interface TurnInputs {
  turn: ReconstructedTurn;
  side: PlayerId;
  opponent: PlayerId;
  meta: LoadedReplay['meta'];
  adviser: AdviserEngine;
  production: AdviserEngine;
  reader: PositionReader;
  rootGen: CandidateLister;
  interiorGen: CandidateLister;
  adviserWork: number;
  productionWork: number;
}

/**
 * Folds a `RootResult`'s exposure into the artifact's own shape and finds the
 * two candidates the classification compares. Returns null when the instrument
 * reported nothing (it was off, or a path that does not carry it answered).
 */
export function buildExposure(result: RootResult, adviserEndKey: string, playedEndKey: string | null): TurnExposure | null {
  const raw = result.candidates;
  const source = result.candidateSource;
  if (raw === undefined || source === undefined) return null;
  const candidates: ExposedCandidate[] = raw.map(c => ({
    index: c.index,
    endKey: c.endKey,
    genRankCc: c.genRankCc,
    flags: c.flags,
    sig: c.sig,
    searched: c.searched,
    scoreCc: c.scoreCc,
    chosen: c.chosen,
  }));
  const trace = (result.rootTrace ?? []).map(r => ({
    depth: r.depth,
    n: r.n,
    searched: r.searched,
    completed: r.completed,
    cutoffAt: r.cutoffAt,
    truncated: r.truncated,
  }));
  const completed = trace.filter(r => r.completed);
  return {
    source,
    count: candidates.length,
    searchedCount: candidates.filter(c => c.searched).length,
    completedDepth: completed.length === 0 ? null : completed[completed.length - 1].depth,
    lastCutoffAt: trace.length === 0 ? null : trace[trace.length - 1].cutoffAt,
    adviserBest: candidates.find(c => c.endKey === adviserEndKey) ?? null,
    played: playedEndKey === null ? null : (candidates.find(c => c.endKey === playedEndKey) ?? null),
    candidates,
    rootTrace: trace,
  };
}

async function analyseTurn(input: TurnInputs): Promise<TurnRow> {
  const { turn, side, meta, adviser, production, reader, rootGen, interiorGen, adviserWork, productionWork } = input;
  const notes: string[] = [];

  const playedEndKey = reader.packKey(turn.endState);
  if (playedEndKey === null) notes.push('the replica could not pack the position the played turn left; its end key is unknown');

  const cheap = rootGen.list(turn.startState, 0);
  if (cheap === null) notes.push('the production generator produced no list at this root (the replica refused the position)');

  const adviserResult = await adviser.searchTurn(turn.startState, { work: adviserWork });
  const adviserPlan = applyPlan(turn.startState, adviserResult.actions);
  if (adviserPlan.applied !== adviserResult.actions.length) {
    notes.push(`the adviser's plan replayed only ${adviserPlan.applied}/${adviserResult.actions.length} actions through the canonical engine`);
  }

  const agrees = playedEndKey !== null && adviserResult.endKey === playedEndKey;

  const played = await deepScore(adviser, reader, turn.endState, side, adviserWork);
  const adviserDeep = agrees ? played : await deepScore(adviser, reader, adviserPlan.state, side, adviserWork);
  if (!agrees && adviserDeep.sideToMove === side && adviserPlan.state.phase !== 'victory') {
    // The plan ended a PHASE, not the turn (a fallback's `phaseEndAction`, or a
    // line truncated by canonical verification). Its score is then a mid-turn
    // root score for our own side rather than the post-turn score the played
    // turn's is, so the swing is not strictly like-for-like on this row.
    notes.push("the adviser's plan did not end the seat's turn; its score is a mid-turn root score and the swing on this row is not like-for-like");
  }

  // `expose: true` on the re-run the analyser already pays for. The instrument
  // observes only (E2 lane 1: same move, score, depth, work, nodes and end key
  // with it on), so `engine.scoreCc` below is the number it always was.
  const productionResult = await production.searchTurn(turn.startState, { work: productionWork, expose: true });
  const exposure = buildExposure(productionResult, adviserResult.endKey, playedEndKey);
  if (exposure === null) notes.push('the production re-run returned no root exposure; the discarded/misjudged split is not available on this row');

  // The adviser's own answer to the played turn IS the refutation. Ask the
  // generator that produced it — `cfg.gen`, because a `searchTurn` root
  // generates at ply 0 — whether it offers that answer at the reply node, and
  // ask `cfg.genInterior` the same question separately as evidence.
  const refutation = played.result;
  const refutationKey = refutation === null ? null : refutation.endKey;
  const replyIsTerminal = turn.endState.phase === 'victory';
  const rootReplyList = replyIsTerminal ? null : rootGen.list(turn.endState, 0);
  const interiorReplyList = replyIsTerminal ? null : interiorGen.list(turn.endState, 1);
  const inRootGenList = refutationKey === null || rootReplyList === null ? null : rootReplyList.set.has(refutationKey);
  const inInteriorGenList = refutationKey === null || interiorReplyList === null ? null : interiorReplyList.set.has(refutationKey);

  const turnMs = meta.players[side].turnMs?.[turn.seatTurnIndex] ?? null;
  const budgetMs = meta.decisionMs ?? null;
  const tolerance = budgetMs === null ? 0 : Math.max(OVERRUN_TOLERANCE_MS, (budgetMs * OVERRUN_TOLERANCE_PCT) / 100);
  const overran = turnMs !== null && budgetMs !== null && turnMs > budgetMs + tolerance;
  const emptyPlan = turn.actions.length > 0 && turn.actions.every(a => PHASE_END.has(a.type));
  if (turn.noops > 0) notes.push(`${turn.noops} action(s) this turn were no-ops the simulator refused`);

  const swingCc = adviserDeep.cc - played.cc;

  return {
    seatTurnIndex: turn.seatTurnIndex,
    turnNumber: turn.turnNumber,
    side,
    played: {
      actions: describePlan(turn.startState, turn.actions),
      endKey: playedEndKey,
      inCheapList: playedEndKey !== null && cheap !== null && cheap.set.has(playedEndKey),
      endsGame: turn.terminal,
    },
    cheap: {
      count: cheap?.keys.length ?? 0,
      containsPlayed: playedEndKey !== null && cheap !== null && cheap.set.has(playedEndKey),
      containsAdviserBest: cheap !== null && cheap.set.has(adviserResult.endKey),
    },
    adviser: {
      endKey: adviserResult.endKey,
      actions: describePlan(turn.startState, adviserResult.actions),
      scoreCc: adviserResult.scoreCc,
      depth: adviserResult.depth,
      work: adviserResult.work,
      source: adviserResult.source,
      fallback: adviserResult.fallback ?? null,
      agreesWithPlayed: agrees,
    },
    playedDeepCc: played.cc,
    adviserBestDeepCc: adviserDeep.cc,
    swingCc,
    swingRootCc: adviserResult.scoreCc - played.cc,
    engine: {
      scoreCc: productionResult.scoreCc,
      endKey: productionResult.endKey,
      reproducedPlayed: playedEndKey !== null && productionResult.endKey === playedEndKey,
    },
    exposure,
    reply: {
      refutationKey,
      inRootGenList,
      rootGenCount: rootReplyList?.keys.length ?? 0,
      inInteriorGenList,
      interiorGenCount: interiorReplyList?.keys.length ?? 0,
    },
    timing: { turnMs, budgetMs, overran, emptyPlan },
    notes,
  };
}

// --- classification ---------------------------------------------------------

function classifyRow(row: TurnRow): Classification {
  const base = { turn: row.turnNumber, seatTurnIndex: row.seatTurnIndex };
  if (row.timing.overran || row.timing.emptyPlan || row.adviser.fallback !== null) {
    const reasons: string[] = [];
    if (row.timing.overran) reasons.push(`the seat spent ${row.timing.turnMs} ms against a ${row.timing.budgetMs} ms allowance`);
    if (row.timing.emptyPlan) reasons.push('the turn dispatched nothing but phase ends');
    if (row.adviser.fallback !== null) reasons.push(`the adviser itself fell back (${row.adviser.fallback})`);
    return { ...base, klass: 'clock-fallback', rule: CLASS_RULES['clock-fallback'], evidence: reasons.join('; ') };
  }
  if (!row.cheap.containsAdviserBest) {
    return {
      ...base,
      klass: 'candidate-absent',
      rule: CLASS_RULES['candidate-absent'],
      evidence: `the adviser's best end key ${row.adviser.endKey} is not among the ${row.cheap.count} candidates the production generator offers at this root (the played turn ${row.cheap.containsPlayed ? 'is' : 'is not'} in that list)`,
    };
  }
  // Checked BEFORE `strong-candidate-misjudged`, which would otherwise swallow
  // it: both describe the same situation and this one names a specific,
  // checkable cause.
  //
  // WHAT THIS RULE DELIBERATELY NO LONGER DOES. It used to require that the
  // production engine had ALSO scored the played turn well above the adviser's
  // assessment of it — "the engine believed it good". That conjunct compared a
  // ~400k root score against a 1.6M score one ply deeper, so it was mostly
  // measuring the horizon: on the first worked example it held on four of the
  // eight non-terminal turns, including one where the adviser had chosen the
  // IDENTICAL turn and the swing was 0. A test that fires when there is nothing
  // to explain is not evidence, so it is gone rather than caveated. What is
  // left is a single factual membership question asked of the generator that
  // produced the refutation, plus the guard that there is a disagreement to
  // explain at all.
  const refutationKey = row.reply.refutationKey;
  if (!row.adviser.agreesWithPlayed && refutationKey !== null && row.reply.inRootGenList === false) {
    const interior =
      row.reply.inInteriorGenList === null
        ? ''
        : `; the engine's own interior generator (K at an interior node, ${row.reply.interiorGenCount} candidates) ${row.reply.inInteriorGenList ? 'does' : 'does not'} offer it either`;
    return {
      ...base,
      klass: 'reply-outside-beam',
      rule: CLASS_RULES['reply-outside-beam'],
      evidence: `the adviser answers the played turn with end key ${refutationKey}, which is not among the ${row.reply.rootGenCount} candidates the SAME generator configuration produces at that reply node${interior}`,
    };
  }
  const inList = `the adviser's best end key ${row.adviser.endKey} IS among the ${row.cheap.count} candidates at this root; the engine played ${row.played.endKey ?? '(unknown)'} instead, worth ${row.playedDeepCc} cc to the adviser against ${row.adviserBestDeepCc} cc`;
  const split = splitByExposure(row);
  if (split !== null) return { ...base, klass: split.klass, rule: CLASS_RULES[split.klass], evidence: `${inList}. ${split.evidence}` };
  return {
    ...base,
    klass: 'strong-candidate-misjudged',
    rule: CLASS_RULES['strong-candidate-misjudged'],
    evidence: `${inList}. No root exposure on this row, so discarded and misjudged do not separate here`,
  };
}

/**
 * The E2 split. `null` when the row carries no exposure, which leaves the
 * caller on the pre-E2 path.
 *
 * The comparison is between the root's OWN two scores — the adviser's best
 * candidate against the played candidate, both `scoreCc` from the mover's view
 * at the root (E2-LANE1-ROOT-EXPOSURE, "Notes an analyser has to know"), so
 * higher is better for the mover and the two are directly comparable. No
 * adviser number enters it; the adviser is used only to say WHICH candidate is
 * the one the engine should have preferred.
 */
export function splitByExposure(row: TurnRow): { klass: LossClass; evidence: string } | null {
  const e = row.exposure;
  if (e === null) return null;
  const where = `root exposure: ${e.count} candidate(s) from a \`${e.source}\` list, ${e.searchedCount} searched, completed depth ${e.completedDepth ?? 'none'}, cutoff at ${e.lastCutoffAt ?? -1}`;
  if (e.source === 'generator-list') {
    return {
      klass: 'exposure-inconsistent',
      evidence: `${where}. The root published its pre-deepening generator list, so every candidate is unsearched by construction and the split says nothing here`,
    };
  }
  const best = e.adviserBest;
  if (best === null) {
    return {
      klass: 'exposure-inconsistent',
      evidence: `${where}. The adviser's best end key ${row.adviser.endKey} is in the generator's list but NOT in the root's published candidate list`,
    };
  }
  if (!best.searched) {
    return {
      klass: 'strong-candidate-discarded',
      evidence: `${where}. The adviser's best turn is candidate #${best.index} (ordering score ${best.genRankCc} cc) and the root never searched it`,
    };
  }
  const played = e.played;
  if (played === null) {
    return {
      klass: 'exposure-inconsistent',
      evidence: `${where}. The adviser's best turn is candidate #${best.index}, searched, scored ${best.scoreCc ?? 'null'} cc — but the played end key ${row.played.endKey ?? '(unknown)'} is not in the candidate list, so there is nothing to compare it against`,
    };
  }
  const bestCc = best.scoreCc;
  const playedCc = played.scoreCc;
  const chosen = e.candidates.find(c => c.chosen) ?? null;
  if (bestCc === null || playedCc === null) {
    return {
      klass: 'exposure-inconsistent',
      evidence: `${where}. Candidate #${best.index} (adviser's best) and #${played.index} (played) do not both carry a score: ${bestCc ?? 'null'} cc against ${playedCc ?? 'null'} cc`,
    };
  }
  if (bestCc > playedCc) {
    return {
      klass: row.engine.reproducedPlayed ? 'exposure-inconsistent' : 'fixed-work-divergence',
      evidence:
        `${where}. The root searched the adviser's best turn (candidate #${best.index}) and scored it ${bestCc} cc, ABOVE the played candidate #${played.index} at ${playedCc} cc — so this re-run did not play what the seat played` +
        `${chosen === null ? '' : ` (it chose candidate #${chosen.index} at ${chosen.scoreCc ?? 'null'} cc)`}. ` +
        `${row.engine.reproducedPlayed ? 'The re-run DID reproduce the played turn, so the score and the returned move disagree' : 'The re-run is fixed work and the seat played under a wall clock, which is the expected cause'}; ` +
        "the exposure describes the re-run, not the seat's own search",
    };
  }
  if (bestCc === playedCc) {
    // A FAIL-LOW BOUND, not a tie. The root searches every candidate after the
    // first against a window opened at the incumbent's score; one that does not
    // beat the incumbent returns that bound, so it is recorded at exactly the
    // incumbent's value. Measured on the E1.1 losses: at every first
    // consequential turn all 18-30 candidates carry one identical score. The
    // engine therefore says "searched, did not prefer it" and says nothing
    // about by how much — which is misjudged, with the margin unmeasurable.
    if (!played.chosen) {
      return {
        klass: 'exposure-inconsistent',
        evidence: `${where}. Candidate #${best.index} (adviser's best) and #${played.index} (played) carry the same score ${bestCc} cc and the played candidate is not the chosen one, so which the root preferred cannot be read off the exposure`,
      };
    }
    return {
      klass: 'strong-candidate-misjudged',
      evidence: `${where}. The root searched the adviser's best turn (candidate #${best.index}) and did not prefer it: its score ${bestCc} cc is the chosen candidate #${played.index}'s own value, i.e. the fail-low bound every candidate that does not beat the incumbent returns, so the margin is not measurable from the exposure`,
    };
  }
  return {
    klass: 'strong-candidate-misjudged',
    evidence: `${where}. The root searched the adviser's best turn (candidate #${best.index}) and scored it ${bestCc} cc, below the played candidate #${played.index} at ${playedCc} cc`,
  };
}

export function classifyFirst(rows: readonly TurnRow[], swingCc: number): Classification {
  for (const row of rows) {
    if (row.swingCc >= swingCc) return classifyRow(row);
  }
  return {
    turn: null,
    seatTurnIndex: null,
    klass: 'unclear',
    rule: CLASS_RULES.unclear,
    evidence: `no consequential decision found at this threshold (no turn reached ${swingCc} cc of swing over ${rows.length} turn(s))`,
  };
}

export function classifyLargest(rows: readonly TurnRow[], swingCc: number): Classification {
  let best: TurnRow | null = null;
  for (const row of rows) if (best === null || row.swingCc > best.swingCc) best = row;
  if (best === null) {
    return { turn: null, seatTurnIndex: null, klass: 'unclear', rule: CLASS_RULES.unclear, evidence: 'no turns were analysed' };
  }
  if (best.swingCc < swingCc) {
    return {
      turn: best.turnNumber,
      seatTurnIndex: best.seatTurnIndex,
      klass: 'unclear',
      rule: CLASS_RULES.unclear,
      evidence: `the largest swing over the game is ${best.swingCc} cc on turn ${best.turnNumber}, below the ${swingCc} cc threshold`,
    };
  }
  return classifyRow(best);
}
