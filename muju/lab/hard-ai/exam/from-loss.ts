/**
 * `npm run hard:exam:from-loss -- --analysis <file> [--replay <file>] [--turn <n>]
 *   [--stratum dev|val|sealed] [--demand <row>] [--out <file>] [--budget <calls>]
 *   [--dry-run]`
 *
 * Turns one classified loss into one examination case (EPIC-PLAN §4 E1.2,
 * deliverable 3).
 *
 * The input is a `muju-hard-analyze-v1` or `-v2` artifact from `npm run hard:analyze`.
 * That tool already did the hard part: it rebuilt the game through the canonical
 * engine, found the FIRST CONSEQUENTIAL TURN — the first of the seat's turns
 * whose swing reaches the threshold — and classified it. This one takes the
 * position at that turn and writes it down as a case.
 *
 * DEFAULT: `kind: 'judgment'`. The adviser's best end key becomes the PREFERRED
 * answer and the classification becomes the reason. That is all it can honestly
 * be: ANALYZE.md is explicit that "a deeper selective search is an adviser, not
 * an exact oracle", and a swing is evidence that a deeper search of the SAME
 * evaluation disagrees with a shallower one, not that the played turn was
 * objectively bad. A case built on that is a labelled opinion.
 *
 * THE ONLY UPGRADE TO `exact` is a canonical proof, and the tool performs it
 * rather than accepting a claim. It is attempted only when the adviser's root
 * score is a mate score (`>= WIN_CC - MATE_PLY_CC * MATE_SCORE_PLIES`), because
 * anything else cannot be a win inside the turn and enumerating would be wasted
 * work. Then `witness.ts` enumerates every legal turn from the position through
 * `src/game` and asks which end positions are victories for the seat. The case
 * becomes exact only if ALL of these hold:
 *
 *   - the enumeration completed inside its call budget (the key set is closed);
 *   - the adviser's own end key is one of the winning end positions;
 *   - at least one legal turn does NOT win (otherwise the claim is vacuous and
 *     the case would pass on any legal turn).
 *
 * The witness is then the whole winning set, not just the adviser's key: the
 * canonical fact is "these turns win", and requiring the engine to pick the
 * adviser's particular win would smuggle a preference back in. If any condition
 * fails the case stays a judgment and says why in its reason.
 *
 * STRATUM BY INHERITANCE. A loss case inherits the stratum of the opening its
 * game was played from, resolved by reading the frozen opening files themselves
 * (`ladder/openings/ALLOCATION.md`: `e0-openings` and `e1-dev` are development,
 * `e1-val` validation, `e1-sealed` sealed). An opening the files do not name has
 * no stratum and the tool refuses to guess — `--stratum` must then be explicit.
 *
 * THE POSITION IS STORED AS A RECIPE: the opening's actions followed by every
 * ply actually played, each rewritten into the square-based `OpeningAction` form
 * so it is portable between processes. The tool re-materialises the recipe
 * before writing anything and compares `gameplayDigest` with the reconstruction;
 * a recipe that does not reproduce the position is an error, never a case.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PlayerId } from '../../../src/game/types';
import { applyAction } from '../../../src/ai/simulate';
import { MATE_PLY_CC, WIN_CC } from '../../../src/ai/hard/types';
import {
  actionToOpeningAction,
  loadOpenings,
  type OpeningAction,
} from '../ladder/openings';
import { hardSeat, loadReplay, reconstruct, withMatchRules, type LoadedReplay, type ReconstructedTurn } from '../analyze/replay';
import type { AnalysisResult, TurnRow } from '../analyze/analyze';
import { RECLASSIFIABLE_SCHEMAS } from '../analyze/reclassify';
import type { RulesBlock } from '../positions/corpus';
import {
  EXAM_SCHEMA,
  EXAM_DEMANDS,
  EXAM_STRATA,
  caseDigest,
  installExamRules,
  loadCaseState,
  normalizeKey,
  readCases,
  restoreShippedRules,
  stratumFile,
  validateCaseShape,
  writeCases,
  type ExamCase,
  type ExamDemand,
  type ExamStratum,
} from './format';
import { DEFAULT_ENUM_BUDGET, claimHolds, enumerateTurnEnds, replayLine } from './witness';

const HERE = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(HERE, '../../..');
const OPENINGS_DIR = path.resolve(HERE, '../ladder/openings');

/**
 * A score at or above this is a mate score and nothing else: `terminalScore`
 * hands back `WIN_CC - MATE_PLY_CC * ply`, so even a deep mate stays far above
 * any evaluation term. Only such a row is worth an enumeration.
 */
export const MATE_SCORE_FLOOR = WIN_CC - MATE_PLY_CC * 64;

/** `ALLOCATION.md`'s stratum rule, as files. */
export const OPENING_STRATUM_FILES: { file: string; stratum: ExamStratum }[] = [
  { file: 'e0-openings.jsonl', stratum: 'dev' },
  { file: 'e1-dev.jsonl', stratum: 'dev' },
  { file: 'e1-val.jsonl', stratum: 'val' },
  { file: 'e1-sealed.jsonl', stratum: 'sealed' },
];

/** Opening id -> stratum, read from the frozen files rather than hard-coded. */
export function openingStrata(dir: string = OPENINGS_DIR): Map<string, ExamStratum> {
  const map = new Map<string, ExamStratum>();
  for (const { file, stratum } of OPENING_STRATUM_FILES) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    for (const opening of loadOpenings(full).openings) {
      // `e1-baseline.jsonl` re-lists rows of the other files; first writer wins
      // and the files above never overlap (ALLOCATION.md's split is disjoint).
      if (!map.has(opening.id)) map.set(opening.id, stratum);
    }
  }
  return map;
}

/** The §1 row a loss most plausibly exercises, from how the game ended. */
export function demandForWinType(winType: string): ExamDemand {
  switch (winType) {
    case 'home-checkmate':
    case 'home-occupation':
      return 'home-and-spawn';
    case 'upkeep-elimination':
      return 'recurring-upkeep';
    case 'inactivity':
    case 'kill-clock': // `muju-phasing-3`+: the same clock, decided on mined totals
      return 'quiet-clock';
    default:
      return 'healing';
  }
}

export function rulesFromReplay(replay: LoadedReplay): RulesBlock {
  const o = replay.options;
  return {
    elementGraph: o.elementGraph,
    upkeep: o.upkeep ?? 'shipped',
    inactivityRule: o.inactivityRule ?? 'on',
    victoryRule: o.victoryRule ?? 'home-or-elimination',
    handicap: o.blackCrystalHandicap ?? 0,
    combatHandicap: { white: o.handicap.white, black: o.handicap.black },
  };
}

/**
 * Every action of the game up to (not including) `target`, rewritten into the
 * portable square-based form. Runs inside the reconstruction's rules.
 */
export function recipeActionsBefore(turns: readonly ReconstructedTurn[], target: ReconstructedTurn, where: string): OpeningAction[] {
  const out: OpeningAction[] = [];
  for (const turn of turns) {
    if (turn.startPly >= target.startPly) break;
    let state: GameState = turn.startState;
    for (let i = 0; i < turn.actions.length; i++) {
      const action = turn.actions[i];
      out.push(actionToOpeningAction(state, action, `${where}: turn ${turn.turnNumber} action ${i}`));
      const next = applyAction(state, action);
      if (next === state) throw new Error(`${where}: turn ${turn.turnNumber} action ${i} replays as a no-op; the reconstruction and the recipe disagree`);
      state = next;
    }
  }
  return out;
}

/** The turn's own actions, in the portable square-based form. */
export function linePlayed(turn: ReconstructedTurn, where: string): OpeningAction[] {
  const out: OpeningAction[] = [];
  let state: GameState = turn.startState;
  for (let i = 0; i < turn.actions.length; i++) {
    out.push(actionToOpeningAction(state, turn.actions[i], `${where} action ${i}`));
    const next = applyAction(state, turn.actions[i]);
    if (next === state) throw new Error(`${where}: action ${i} replays as a no-op`);
    state = next;
  }
  return out;
}

/**
 * The run directory a replay belongs to, written the way every worktree spells
 * it. The E1 campaigns run from their own checkouts, so a plain
 * `path.relative(REPO_ROOT, ...)` would record a `../../deevgames-e1-run/...`
 * path that means nothing here and less somewhere else; the `lab/results/...`
 * suffix is the same in all of them and is the run's actual identity.
 */
export function runPathFor(replayPath: string): string {
  const dir = path.resolve(path.dirname(replayPath), '..');
  const marker = dir.indexOf(`${path.sep}lab${path.sep}results${path.sep}`);
  if (marker >= 0) return dir.slice(marker + 1).split(path.sep).join('/');
  return path.relative(REPO_ROOT, dir);
}

export interface ExtractOptions {
  /** Seat turn NUMBER to take the case at; defaults to the analysis's first consequential turn. */
  turn?: number;
  /** Recorded on the case: which analyser schema the verdict came from. */
  analysisSchema?: string;
  stratum?: ExamStratum;
  demand?: ExamDemand;
  budget?: number;
  /** Where the run directory lives, for provenance. */
  run?: string;
  openingsDir?: string;
}

export interface Extraction {
  case: ExamCase;
  /** Why the case is a judgment, when an exact upgrade was attempted and refused. */
  exactAttempt: string | null;
  row: TurnRow;
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]+/g, '_');
}

/**
 * Builds one exam case from an analysis artifact and its replay.
 *
 * Both are needed: the analysis names the turn and carries the adviser's
 * verdict, and the replay is the only thing that can rebuild the position.
 */
export function extractCase(analysis: AnalysisResult, replay: LoadedReplay, opts: ExtractOptions = {}): Extraction {
  const side: PlayerId = analysis.side ?? hardSeat(replay.meta) ?? 'white';
  const wantTurn = opts.turn ?? analysis.firstConsequential.turn;
  if (wantTurn === null || wantTurn === undefined) {
    throw new Error(`${analysis.fileId}: the analysis found no consequential turn at its threshold; pass --turn <n> to take a case anyway`);
  }
  const row = analysis.turns.find(t => t.turnNumber === wantTurn && t.side === side);
  if (row === undefined) throw new Error(`${analysis.fileId}: no analysed turn ${wantTurn} for ${side}`);

  const recon = reconstruct(replay);
  const target = recon.bySide[side].find(t => t.turnNumber === wantTurn);
  if (target === undefined) throw new Error(`${replay.fileId}: the reconstruction has no ${side} turn ${wantTurn}`);

  const rules = rulesFromReplay(replay);
  const setup: NonNullable<ExamCase['setup']> = {
    actionsPerTurn: replay.options.actionsPerTurn as number | undefined,
    resourceLayout: replay.options.resourceLayout === undefined ? undefined : [...replay.options.resourceLayout],
    // A Phasing game's recipe replays from the Phasing start (`format.ts
    // loadCaseState`); a Standard one keeps the historical shape exactly.
    ...(replay.ruleset === 'phasing' ? { ruleset: 'phasing' as const } : {}),
  };

  const openingActions = replay.opening.actions ?? [];
  const playedActions = withMatchRules(replay.options, () => recipeActionsBefore(recon.turns, target, replay.fileId));
  const actions = [...openingActions, ...playedActions];

  const strata = openingStrata(opts.openingsDir);
  const stratum = opts.stratum ?? strata.get(replay.opening.id);
  if (stratum === undefined) {
    throw new Error(
      `${replay.fileId}: opening "${replay.opening.id}" is in none of ${OPENING_STRATUM_FILES.map(f => f.file).join(', ')}, so its stratum cannot be inherited; pass --stratum explicitly`,
    );
  }

  const demand = opts.demand ?? demandForWinType(analysis.outcome.winType);
  const id = `loss-${sanitize(analysis.fileId)}-t${wantTurn}`;
  const adviserKey = normalizeKey(row.adviser.endKey, `${id}: adviser end key`);

  // --- the exact upgrade, or the reason there is none ----------------------
  let exactAttempt: string | null = null;
  let witness: ExamCase['witness'] = {
    label: 'judgment',
    preferredKeys: [adviserKey],
    avoidKeys: row.played.endKey === null ? [] : [normalizeKey(row.played.endKey, `${id}: played end key`)],
    reason:
      `hard:analyze classified this turn "${wantTurn === analysis.firstConsequential.turn ? analysis.firstConsequential.klass : 'selected by --turn'}": ` +
      `${wantTurn === analysis.firstConsequential.turn ? analysis.firstConsequential.evidence : `swing ${row.swingCc} cc against the played turn`}. ` +
      `The preferred end key is the ADVISER's best at ${row.adviser.work} units — an adviser, not an oracle (docs/hard-ai/e1/ANALYZE.md).`,
    by: 'adviser',
    classification: wantTurn === analysis.firstConsequential.turn ? analysis.firstConsequential.klass : undefined,
    swingCc: row.swingCc,
    adviserWork: row.adviser.work,
  };
  let kind: ExamCase['kind'] = 'judgment';

  if (row.adviser.scoreCc >= MATE_SCORE_FLOOR) {
    const budget = opts.budget ?? DEFAULT_ENUM_BUDGET;
    installExamRules({ rules, setup });
    try {
      // FIRST, the strong witness: the whole set of canonically winning turns.
      const { ends, complete, calls } = enumerateTurnEnds(target.startState, budget);
      const winning: string[] = [];
      for (const [key, end] of ends) if (claimHolds('win', target.startState, end, side)) winning.push(key);
      winning.sort();
      if (complete && winning.includes(adviserKey) && winning.length < ends.size) {
        kind = 'exact';
        witness = {
          label: 'exact',
          claim: 'win',
          method: 'canonical-enumeration',
          endKeys: winning,
          avoidKeys: [],
          complete: true,
          note:
            `the adviser's plan scores ${row.adviser.scoreCc} cc (a mate score) and the canonical rules confirm it: enumerating every legal turn from this position ` +
            `(${ends.size} distinct end positions, ${calls} canonical calls) finds ${winning.length} that end the game with ${side} as winner, and the adviser's own end key ${adviserKey} is one of them. ` +
            `The witness is the whole winning set, so the case asks the engine to win, not to agree with the adviser about HOW.`,
          verifiedAt: new Date().toISOString(),
          verifiedBy: 'lab/hard-ai/exam/from-loss.ts (witness.ts enumerateTurnEnds/claimHolds)',
        };
      } else {
        exactAttempt = !complete
          ? `the canonical enumeration of every legal turn hit its ${budget}-call budget after ${ends.size} end positions, so no CLOSED winning set exists here`
          : !winning.includes(adviserKey)
            ? `the adviser's end key ${adviserKey} is not among the ${winning.length} canonically winning end positions of this turn`
            : `every one of the ${ends.size} legal turns from this position wins, so "win within the turn" asks the engine for nothing`;

        // SECOND, the weaker but still canonical witness: ONE line, replayed.
        // Available only when the adviser agreed with the turn actually played,
        // because that is the only line of the adviser's this artifact carries
        // in a replayable form (the analysis renders plans as prose).
        const playedKey = row.played.endKey === null ? null : normalizeKey(row.played.endKey, `${id}: played end key`);
        if (playedKey === adviserKey && target.terminal) {
          const line = linePlayed(target, `${id}: played line`);
          const replayed = replayLine(target.startState, line, `${id}: played line`);
          if (replayed.ok && replayed.end !== null && replayed.endKey === adviserKey && claimHolds('win', target.startState, replayed.end, side)) {
            kind = 'exact';
            witness = {
              label: 'exact',
              claim: 'win',
              method: 'canonical-replay',
              endKeys: [adviserKey],
              avoidKeys: [],
              complete: false,
              line,
              note:
                `the adviser's best turn IS the turn played here (same end key ${adviserKey}) and scores ${row.adviser.scoreCc} cc, a mate score. ` +
                `The canonical rules confirm it by REPLAY: the ${line.length} actions below are legal one by one, end the turn, and leave the game won by ${side}. ` +
                `The witness is not complete — ${exactAttempt} — so a turn outside this single key may win too, which is why the runner's "a win is never a miss" adjudication still applies.`,
              verifiedAt: new Date().toISOString(),
              verifiedBy: 'lab/hard-ai/exam/from-loss.ts (witness.ts replayLine/claimHolds)',
            };
            exactAttempt = null;
          } else {
            exactAttempt = `${exactAttempt}; the played line does not replay into a canonical win either (${replayed.reason ?? 'claim not satisfied'})`;
          }
        }
      }
    } finally {
      restoreShippedRules();
    }
    if (exactAttempt !== null && witness.label === 'judgment') witness.reason = `${witness.reason} Exact upgrade refused: ${exactAttempt}.`;
  }

  const draft: ExamCase = {
    schema: EXAM_SCHEMA,
    id,
    version: 1,
    source: {
      kind: 'loss',
      run: opts.run ?? runPathFor(replay.path),
      pairId: replay.fileId.replace(/-(A|B)-white$/, ''),
      orientation: /-(A|B)-white$/.exec(replay.fileId)?.[0].slice(1) ?? 'unknown',
      ply: target.startPly,
      turnNumber: target.turnNumber,
      seatTurnIndex: target.seatTurnIndex,
      analysis: analysis.fileId,
      analysisSchema: opts.analysisSchema ?? String(analysis.schema),
      openingId: replay.opening.id,
    },
    demand,
    kind,
    rules,
    setup: setup.actionsPerTurn === undefined && setup.resourceLayout === undefined && setup.ruleset === undefined ? undefined : setup,
    position: { kind: 'recipe', openingId: replay.opening.id, openingPlies: openingActions.length, actions },
    sideToMove: side,
    witness,
    stratum,
    tags: ['loss', analysis.outcome.winType, `class:${analysis.firstConsequential.klass}`, `opening:${replay.opening.id}`],
    stateDigest: caseDigest({ setup }, target.startState),
    rationale:
      `${analysis.fileId}, ${side} to move on turn ${wantTurn} (ply ${target.startPly}). ` +
      `The game ended ${analysis.outcome.winType} after ${analysis.outcome.turns} turns; this seat ${analysis.outcome.sideResult}.`,
  };

  // The recipe must reproduce the position it claims, or there is no case.
  const checked = validateCaseShape(draft, `${id} (extractor output)`);
  const rebuilt = loadCaseState(checked);
  const rebuiltDigest = caseDigest(checked, rebuilt);
  if (rebuiltDigest !== draft.stateDigest) {
    throw new Error(`${id}: the recipe rebuilds digest ${rebuiltDigest}, not the reconstruction's ${draft.stateDigest}`);
  }

  return { case: checked, exactAttempt, row };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * The analysis records an ABSOLUTE replay path from the box it ran on, which is
 * frequently a DIFFERENT worktree — the E1 campaigns run from their own
 * checkouts. THIS checkout's copy is preferred: the run directories have the
 * same `lab/results/...` layout everywhere, the emitted case records a
 * repo-relative provenance that means something here, and nothing reads another
 * session's tree when it does not have to. The recorded absolute path is the
 * fallback, and `--replay` overrides both.
 */
export function resolveReplayPath(analysis: AnalysisResult, override: string | null): string {
  if (override !== null) return path.resolve(override);
  const marker = analysis.replay.indexOf('lab/results/');
  if (marker >= 0) {
    const rebased = path.resolve(REPO_ROOT, analysis.replay.slice(marker));
    if (fs.existsSync(rebased)) return rebased;
  }
  if (fs.existsSync(analysis.replay)) return analysis.replay;
  throw new Error(`${analysis.fileId}: the replay ${analysis.replay} does not exist here; pass --replay <file>`);
}

interface Args {
  /** One analysis artifact. Empty when `--dir` is used. */
  analysis: string;
  /** A directory of analysis artifacts; every loss in it becomes a case. */
  dir: string | null;
  /** With `--dir`: take every game, not only the seat's losses. */
  all: boolean;
  replay: string | null;
  turn: number | null;
  stratum: ExamStratum | null;
  demand: ExamDemand | null;
  out: string | null;
  casesDir: string | null;
  budget: number;
  dryRun: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = { analysis: '', dir: null, all: false, replay: null, turn: null, stratum: null, demand: null, out: null, casesDir: null, budget: DEFAULT_ENUM_BUDGET, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`hard:exam:from-loss: ${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--analysis':
        args.analysis = path.resolve(next());
        break;
      case '--dir':
        args.dir = path.resolve(next());
        break;
      case '--all':
        args.all = true;
        break;
      case '--replay':
        args.replay = path.resolve(next());
        break;
      case '--turn':
        args.turn = Number(next());
        break;
      case '--stratum': {
        const v = next() as ExamStratum;
        if (!EXAM_STRATA.includes(v)) throw new Error(`--stratum must be one of ${EXAM_STRATA.join(', ')}`);
        args.stratum = v;
        break;
      }
      case '--demand': {
        const v = next() as ExamDemand;
        if (!EXAM_DEMANDS.includes(v)) throw new Error(`--demand must be one of ${EXAM_DEMANDS.join(', ')}`);
        args.demand = v;
        break;
      }
      case '--out':
        args.out = path.resolve(next());
        break;
      case '--cases-dir':
        args.casesDir = path.resolve(next());
        break;
      case '--budget':
        args.budget = Number(next());
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        throw new Error(`hard:exam:from-loss: unknown argument ${a}`);
    }
  }
  if (args.analysis === '' && args.dir === null) throw new Error('hard:exam:from-loss: --analysis <file> or --dir <dir> is required');
  if (args.analysis !== '' && args.dir !== null) throw new Error('hard:exam:from-loss: --analysis and --dir are exclusive');
  return args;
}

/** Adds (or replaces, by id) one case in a stratum file. */
export function upsertCase(file: string, c: ExamCase): { added: boolean } {
  const existing = fs.existsSync(file) ? readCases(file) : [];
  const at = existing.findIndex(e => e.id === c.id);
  if (at >= 0) {
    existing[at] = { ...c, version: existing[at].version + 1 };
    writeCases(file, existing);
    return { added: false };
  }
  writeCases(file, [...existing, c]);
  return { added: true };
}

/** Reads and schema-checks one `hard:analyze` artifact. */
export function readAnalysis(file: string): AnalysisResult {
  const analysis = JSON.parse(fs.readFileSync(file, 'utf8')) as AnalysisResult;
  // v1 artifacts (pre-`reply-outside-beam`) carry the same per-turn fields this
  // extractor reads; `analyze/reclassify.ts` owns the v1 -> v2 upgrade.
  const schema = String(analysis.schema);
  if (!RECLASSIFIABLE_SCHEMAS.includes(schema)) throw new Error(`${file}: schema ${schema} is not one of ${RECLASSIFIABLE_SCHEMAS.join(', ')}`);
  return analysis;
}

/** Every analysis artifact in a directory, `summary.json` excluded, sorted. */
export function analysisFilesIn(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== 'summary.json')
    .sort()
    .map(f => path.join(dir, f));
}

function emit(analysis: AnalysisResult, args: Args): void {
  const replay = loadReplay(resolveReplayPath(analysis, args.replay));
  const extraction = extractCase(analysis, replay, {
    turn: args.turn ?? undefined,
    stratum: args.stratum ?? undefined,
    demand: args.demand ?? undefined,
    budget: args.budget,
  });
  const c = extraction.case;
  console.log(`${c.id}: ${c.kind} case, demand ${c.demand}, stratum ${c.stratum} (opening ${c.source.kind === 'loss' ? c.source.openingId : '-'}, ${String(analysis.schema)})`);
  if (extraction.exactAttempt !== null) console.log(`  exact upgrade refused: ${extraction.exactAttempt}`);
  if (c.witness.label === 'exact') console.log(`  witness: ${c.witness.endKeys.length} canonically winning end position(s), complete=${c.witness.complete}`);
  else console.log(`  preference: ${c.witness.preferredKeys.join(', ')} (${c.witness.classification ?? 'no class'}, swing ${c.witness.swingCc ?? '?'} cc)`);

  if (args.dryRun) {
    console.log(`  ${JSON.stringify(c).slice(0, 240)} ...`);
    return;
  }
  const file = args.out ?? stratumFile(c.stratum, args.casesDir ?? undefined);
  const { added } = upsertCase(file, c);
  console.log(`  ${added ? 'added to' : 'replaced in'} ${path.relative(REPO_ROOT, file)}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.dir !== null) {
    const files = analysisFilesIn(args.dir);
    if (files.length === 0) throw new Error(`${args.dir}: no analysis artifacts`);
    let emitted = 0;
    let skipped = 0;
    const failures: string[] = [];
    for (const file of files) {
      let analysis: AnalysisResult;
      try {
        analysis = readAnalysis(file);
      } catch (err) {
        failures.push(`${path.basename(file)}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      // `--run` writes an artifact per LOSS by default, but `--all` runs exist;
      // the exam set is built from losses unless the caller says otherwise.
      if (!args.all && analysis.outcome.sideResult !== 'loss') {
        console.log(`${analysis.fileId}: ${analysis.outcome.sideResult}, skipped (pass --all to take it anyway)`);
        skipped++;
        continue;
      }
      try {
        emit(analysis, args);
        emitted++;
      } catch (err) {
        failures.push(`${analysis.fileId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`\n${emitted} case(s) emitted, ${skipped} non-loss skipped, ${failures.length} failed`);
    for (const f of failures) console.log(`  FAILED ${f}`);
    if (failures.length > 0) process.exitCode = 1;
    return;
  }

  emit(readAnalysis(args.analysis), args);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(HERE, 'from-loss.ts');
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  }
}
