/** Gate 1 baseline-sanity runner, preregistration amendment A3 under rules
 * revision `muju-phasing-2` (amendment A4).
 *
 * From muju/:
 *   node --import tsx lab/ai/gate1.ts --mode pilot --calibration <dir>/calibration.json --out <NEW directory>
 *
 * `--plan` prints the adopted A3 allocation without playing. Full rows are opt-in.
 *
 * A3 in three lines: each seat-mirrored pair starts from its own dev-book
 * opening (48 pairs per cell), every game is hashed so the report can refuse to
 * read strength out of replication, and the per-turn fixed-work budgets come
 * from a calibration manifest instead of the asserted 6,000/3,000 of A1/A2.
 *
 * A4 in one: the inactivity clock is 20 plies, the rules revision is
 * `muju-phasing-2`, and the purchase/inactivity bands are the ones re-frozen
 * under that clock (`lab/harness/results/p2-scripted-2026-09-19`). Nothing in
 * this lane carries the revision or the bands path as a literal any more — see
 * `gate1-sources.ts` for why fourteen of those literals were a defect rather
 * than a tidiness problem.
 *
 * A full row is fifteen hours of games, so it may be run in pieces:
 *
 *   node --import tsx lab/ai/gate1.ts --mode full --shard 3/8 --calibration C --out DIR
 *   node --import tsx lab/ai/gate1.ts --merge DIR
 *
 * Each shard plays a deterministic share of the schedule into its own files and
 * resumes where it stopped; `--merge` checks that the pieces are pieces of ONE
 * row — and that every one of them finished CLEAN, not merely completely — and
 * only then writes the summary (`gate1-shard.ts`). `lab/ai/gate1-launch.ts`
 * prints the commands and the expected wall time for a given layout.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { loadavg, cpus, platform, arch } from 'node:os';
import { pathToFileURL } from 'node:url';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { DEFAULT_WEIGHTS } from '../../src/ai/types';
import { playGame } from '../harness/runner';
import { createRushBot, createExpandBot, createBalancedBot } from '../harness/bots/archetypes';
import { DEFAULT_MATCH_OPTIONS } from '../harness/types';
import { withHeavySlot, heavyBypassed, heavyDir, slotCount } from '../hard-ai/ladder/heavy';
import { createGateBot, PREPARE_RESERVE_DIVISOR, type GateBudgets, type GateDifficulty } from './gate1-bot';
import {
  loadCalibration, machineIdentity, parseCalibrationOverrides,
  type Calibration, type CalibrationOverride,
} from './gate1-calibrate';
import { WorkMeter } from './gate1-work';
import {
  DEV_BOOK_PATH, HANDICAPS, gate1StartState, loadGate1Book, openingsDigest, scheduleOpenings, type Gate1Book,
} from './gate1-openings';
import { boundaryPositionDigest, createTraceHasher, startPositionDigest } from './gate1-trace';
import {
  BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH, RULES_VERSION, SUPERSEDED_BANDS_PATH,
  driftedSources, sha, sourceFileHashes, sourceIdentitySha256,
} from './gate1-sources';
import {
  WHOLE_ROW, mergeShards, parseShardSpec, patchShardManifest, peekRowIdentity, runShardGames, shardGamesFile,
  shardStem, tasksForShard, writeFileAtomic, writeJsonAtomic, type RowIdentity, type ShardSpec,
} from './gate1-shard';
import {
  schedule, summarize, AMENDMENT, DISTINCTNESS_READING, PAIRS, PILOT_SEED_CHANGE_REASON, SEEDS, VOID_PILOT_SEEDS,
  type Task, type Mode, type Entry, type Bands, type BoundarySample, type CalibrationMeta, type ReportMeta,
} from './gate1-report';
import type { DecisionWork } from './gate1-bot';
import type { OpeningSpec } from '../hard-ai/ladder/openings';

export { BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH, RULES_VERSION, sha };
const json = (s: unknown) => JSON.stringify(s, null, 2) + '\n';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
/**
 * How long a shard may wait for one of the shared heavy slots. The default is 30
 * minutes, which is right for a benchmark and wrong for this: with 8 shards and
 * 2 slots, six of them wait through three waves of hours-long work and would all
 * die before starting. A day is longer than any layout this row supports.
 */
export const SHARD_SLOT_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** The file that pins when a row FIRST started, for the calibration's age check. */
export const ROW_START_FILE = 'row-start.json';

/**
 * Read the adopted documents by commit, independently of later working-copy edits.
 *
 * TWO amendments are verified, not one. A3 fixed the allocation and is pinned at
 * the text it was adopted as; A4 appended to the SAME document, changed the rules
 * revision and voided every Gate 1 game measured before it, and is pinned at the
 * text that includes it. Checking only A3 would let the operative half of the
 * preregistration be rewritten without the runner noticing. The A4 text is what a
 * row copies into its evidence directory, because it is the one in force.
 * Historical calibration hashes are audit metadata, no longer prerequisites.
 */
export function adoptedProtocol() {
  const references = JSON.parse(readFileSync(REFERENCE_PATH, 'utf8'));
  const amendment = references.amendment;
  const rulesAmendment = references.rulesAmendment;
  if (references.status !== 'adopted' || references.rulesVersion !== RULES_VERSION || amendment?.id !== AMENDMENT) {
    throw new Error(`Gate 1 requires adopted amendment ${AMENDMENT} at rules revision ${RULES_VERSION}; ` +
      `${REFERENCE_PATH} says ${JSON.stringify(references.status)} / ${JSON.stringify(references.rulesVersion)} / ` +
      `${JSON.stringify(amendment?.id)}`);
  }
  if (rulesAmendment?.rulesVersion !== RULES_VERSION) {
    throw new Error(`${REFERENCE_PATH} names no rules amendment for ${RULES_VERSION}; A4 is what advanced the ` +
      'revision and it must be pinned before a row may run under it');
  }
  const read = (pin: { commit: string; path: string; sha256: string }, label: string) => {
    const document = execFileSync('git', ['show', `${pin.commit}:${pin.path}`], { encoding: 'utf8' });
    if (sha(document) !== pin.sha256) throw new Error(`Adopted preregistration hash mismatch for ${label}`);
    return document;
  };
  read(amendment, AMENDMENT);
  const document = read(rulesAmendment, rulesAmendment.id);
  return { references, amendment, rulesAmendment, document };
}

/**
 * The frozen behaviour bands this row is scored against, with both ways they can
 * be the wrong ones checked BY NAME.
 *
 * A1 froze the purchase and inactivity bands from the scripted reference. A4
 * changed the inactivity clock, so that reference was re-run and new bands frozen
 * from it; the old bands describe a draw rate this rule set does not produce
 * (Expand h0 fell from 0.70 to 0.55, and the band ceiling from 0.866 to 0.726).
 * A row read against them would be judged against a population that no longer
 * exists — and would pass more easily, which is the direction that matters.
 *
 * Three checks, because each catches a different mistake: the PATH (a runner still
 * pointed at the 2026-09-18 directory), the HASH (a bands file edited in place),
 * and the bands' own `rulesVersion` (the right path holding the wrong file).
 */
export function loadBands(references: { bands?: { path?: string; sha256?: string }; bandsSha256?: string },
  fileHashes: Record<string, string>): Bands {
  if (BANDS_PATH === SUPERSEDED_BANDS_PATH) {
    throw new Error(`Gate 1 is pointed at the superseded bands ${SUPERSEDED_BANDS_PATH}, frozen under the 10-ply ` +
      'inactivity clock A4 replaced. Point BANDS_PATH at the re-frozen reference.');
  }
  const pinned = references.bands;
  if (pinned?.path !== BANDS_PATH) {
    throw new Error(`${REFERENCE_PATH} pins the bands at ${JSON.stringify(pinned?.path)}, but this runner reads ` +
      `${BANDS_PATH}. One of them is wrong; neither frozen bands file may be edited to agree.`);
  }
  const onDisk = fileHashes[BANDS_PATH];
  if (pinned.sha256 !== onDisk || references.bandsSha256 !== onDisk) {
    throw new Error(`Frozen band hash mismatch: ${BANDS_PATH} hashes ${onDisk}, pinned ${pinned.sha256}`);
  }
  const bands = JSON.parse(readFileSync(BANDS_PATH, 'utf8')) as Bands;
  if (bands.rulesVersion !== RULES_VERSION) {
    throw new Error(`${BANDS_PATH} was frozen under ${JSON.stringify(bands.rulesVersion)}, not ${RULES_VERSION}. ` +
      'The inactivity draw rate is a direct function of the clock A4 changed; bands do not cross a revision.');
  }
  return bands;
}

/**
 * When this ROW first started, persisted in its own directory.
 *
 * The calibration's 24-hour freshness window used to be measured against
 * `Date.now()` in each process. A row is up to eight processes that queue behind
 * two heavy slots and can therefore start many hours apart, so the same
 * calibration was fresh for shard 1 and stale for shard 8 — the later shards
 * would refuse a manifest the row had already been built on, or, with the
 * override passed, would stamp a concession the first shards did not make. A
 * row's freshness is a property of the ROW, so it is measured from the first
 * start any process recorded here, written once with `O_EXCL` and read by
 * everyone after.
 */
export function rowFirstStartedAt(out: string, now: () => Date = () => new Date()): string {
  const path = `${out}/${ROW_START_FILE}`;
  try {
    const fd = openSync(path, 'wx');
    const firstStartedAt = now().toISOString();
    try {
      writeSync(fd, json({ schema: 'muju-gate1-row-start-v1', firstStartedAt,
        note: 'The instant this row first started, written once with O_EXCL by whichever shard got here first. ' +
          "The calibration's freshness window is measured from here, not from each shard's own clock, so a row " +
          'that runs its shards over two days is one measurement with one calibration age.' }));
    } finally {
      closeSync(fd);
    }
    return firstStartedAt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { firstStartedAt?: string };
    if (!Number.isFinite(Date.parse(String(parsed.firstStartedAt)))) {
      throw new Error(`${path} holds no usable firstStartedAt; the row's calibration age cannot be established`);
    }
    return parsed.firstStartedAt!;
  }
}

export async function resolvedConfigs(solver: TacticalSolver, budgets: GateBudgets, opening: OpeningSpec,
  meter: WorkMeter) {
  // Fresh throw-away engines expose their ACTUAL resolved defaults via debug.
  // No duplicated difficulty preset table; the live game engines are seeded afresh.
  const configs = {} as Record<GateDifficulty, ReturnType<ReturnType<typeof createGateBot>['resolvedConfig']>>;
  for (const difficulty of ['hard', 'medium'] as const) {
    const seat = createGateBot(difficulty, solver, budgets[difficulty], { meter });
    seat.bot.onGameStart('white', 1);
    const state = gate1StartState(opening, 0);
    await seat.bot.nextAction(state, state.turn.currentPlayer);
    configs[difficulty] = seat.resolvedConfig();
  }
  return configs;
}

export async function runTask(task: Task, solver: TacticalSolver, identityHash: string,
  configs: Awaited<ReturnType<typeof resolvedConfigs>>, runId: string, budgets: GateBudgets, book: Gate1Book,
  meter: WorkMeter) {
  const opening = book.openings[task.openingIndex];
  if (!opening || opening.id !== task.openingId) throw new Error(`Opening mismatch for ${task.id}`);
  const hard = createGateBot('hard', solver, budgets.hard, { meter });
  const medium = task.opponent === 'aiv2-medium' ? createGateBot('medium', solver, budgets.medium, { meter }) : null;
  const other = medium?.bot ?? ({ Rush: createRushBot, Expand: createExpandBot, Balanced: createBalancedBot }
    [task.opponent as 'Rush' | 'Expand' | 'Balanced'])();
  const otherSeat = task.hardSeat === 'white' ? 'black' : 'white';
  const bots = task.hardSeat === 'white' ? { white: hard.bot, black: other } : { white: other, black: hard.bot };
  const initialState = gate1StartState(opening, task.handicap);
  // The game is keyed by the POSITION it starts from, not by the id of the route
  // to it (`gate1-trace.ts`), so the position is re-hashed here and checked
  // against the schedule: a book that replayed differently is caught per game.
  const startSha256 = startPositionDigest(initialState, task.handicap);
  if (startSha256 !== task.startSha256) {
    throw new Error(`Start position for ${task.id} hashed ${startSha256}, not the scheduled ${task.startSha256}`);
  }
  const trace = createTraceHasher(startSha256);
  const arrivals = { white: 0, black: 0 }, refunds = { white: 0, black: 0 };
  // LATER CONVERGENCE (report-only): the position this game handed off in, every
  // time it handed off. Two games of one cell and one seat assignment that reach
  // the same one are playing the same line from there on, whatever their openings
  // were, and A3 §1's independence argument only reaches as far as the opening.
  const boundaries: BoundarySample[] = [];
  const startLoad = loadavg();
  const { record, replay } = await playGame({ bots, seed: task.seed, runId, engineHash: identityHash,
    experiment: `gate1-${AMENDMENT}`, initialState,
    options: { ...DEFAULT_MATCH_OPTIONS, blackCrystalHandicap: task.handicap,
      actionsPerTurn: 4, upkeep: 'shipped', inactivityRule: 'on', recordReplay: true },
    onAction(before, after, action) {
      trace.push(before, action);
      if (after.turn.currentPlayer !== before.turn.currentPlayer && after.phase === 'playing') {
        boundaries.push({ ply: trace.steps.length, digest: boundaryPositionDigest(after, task.handicap) });
      }
      for (const pending of before.pendingSummons ?? []) {
        if ((after.pendingSummons ?? []).some(s => s.id === pending.id)) continue;
        if (after.board.units.some(u => u.id === pending.id)) arrivals[pending.owner]++;
        else refunds[pending.owner]++;
      }
    },
  });
  for (const [difficulty, adapter] of [['hard', hard], ['medium', medium]] as const) {
    if (adapter && JSON.stringify(adapter.resolvedConfig()) !== JSON.stringify(configs[difficulty])) {
      throw new Error(`Resolved config drift: ${difficulty}`);
    }
  }
  const configHash = (difficulty: GateDifficulty) => sha(json(configs[difficulty]));
  const otherConfig = medium ? configHash('medium') : sha(json({ engine: 'scripted', bot: task.opponent }));
  record.engineConfigHash = task.hardSeat === 'white' ? `${configHash('hard')}|${otherConfig}`
    : `${otherConfig}|${configHash('hard')}`;
  return { task, identityHash, record, telemetry: { arrivals, refunds,
    hard: hard.decisions, ...(medium ? { medium: medium.decisions } : {}),
    invalidSuffixes: { hard: hard.invalidSuffixes(), ...(medium ? { medium: medium.invalidSuffixes() } : {}) },
    hardSeat: task.hardSeat, otherSeat }, load: { before: startLoad, after: loadavg() },
  gameSha256: trace.digest(), startSha256, plies: trace.steps.length, boundaries, replay };
}

/**
 * How the ROW's adapter actually paced itself, for the report header next to what
 * the calibration measured. Computed from the stored per-decision ledger, so it is
 * re-derivable from `games.jsonl` alone and is identical whether the row ran in one
 * process or eight.
 */
export function adapterMeta(entries: readonly Entry[]): ReportMeta['adapter'] {
  const searches: Record<string, number[]> = {};
  const suffixes: Record<string, number> = {};
  for (const entry of entries) {
    const telemetry = (entry as unknown as { telemetry?: Record<string, unknown> }).telemetry;
    if (!telemetry) continue;
    for (const engine of ['hard', 'medium'] as const) {
      const decisions = telemetry[engine] as DecisionWork[] | undefined;
      if (!Array.isArray(decisions)) continue;
      const byTurn = new Map<number, number>();
      for (const d of decisions) {
        if (d.kind !== 'search') continue;
        byTurn.set(d.turn, (byTurn.get(d.turn) ?? 0) + 1);
      }
      searches[engine] = [...(searches[engine] ?? []), ...byTurn.values()];
    }
    const invalid = telemetry.invalidSuffixes as Record<string, number> | undefined;
    for (const [engine, count] of Object.entries(invalid ?? {})) {
      suffixes[engine] = (suffixes[engine] ?? 0) + (Number(count) || 0);
    }
  }
  const med = (xs: number[]) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b), mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  return {
    searchesPerTurnInRow: Object.fromEntries(Object.entries(searches).map(([k, v]) => [k, med(v)])),
    invalidSuffixes: suffixes,
    allocation: `one allowance per own turn, spent across Act, upkeep and Prepare; each search is funded with the ` +
      `remainder less floor(budget / ${PREPARE_RESERVE_DIVISOR}) per hand-off segment still to be searched, and is ` +
      'charged what it actually spent (gate1-bot.ts)',
  };
}

export interface Gate1Args {
  mode: Mode;
  /** True when `--mode` was given; a merge cross-checks it, never obeys it. */
  modeExplicit: boolean;
  out?: string;
  calibration?: string;
  book: string;
  plan: boolean;
  shard: ShardSpec;
  merge?: string;
  /** Which kinds of calibration refusal this run accepts, each stamped separately. */
  acceptCalibration: CalibrationOverride[];
  /** Run a PILOT against an explicitly provisional, ineligible calibration. */
  provisionalCalibration: boolean;
}

export function parseArgs(args: string[]): Gate1Args {
  let mode: Mode = 'pilot', modeExplicit = false, out: string | undefined, calibration: string | undefined, plan = false;
  let book = DEV_BOOK_PATH, shard: ShardSpec = WHOLE_ROW, merge: string | undefined;
  let acceptCalibration: CalibrationOverride[] = [];
  let provisionalCalibration = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const name = flag.startsWith('--accept-calibration=') ? '--accept-calibration' : flag;
    if (seen.has(name)) throw new Error(`Repeated option ${name}`);
    seen.add(name);
    if (flag === '--plan') plan = true;
    else if (flag === '--provisional-calibration') provisionalCalibration = true;
    else if (name === '--accept-calibration') {
      // `--accept-calibration=load,age`. The single `--accept-loaded-calibration`
      // switch it replaces could not say WHICH concession was being made.
      const value = flag.startsWith('--accept-calibration=') ? flag.slice('--accept-calibration='.length) : args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--accept-calibration=<load,machine,age,sources> requires at least one kind');
      }
      acceptCalibration = parseCalibrationOverrides(value);
    } else if (flag === '--accept-loaded-calibration') {
      throw new Error('--accept-loaded-calibration was one switch over four unrelated concessions (a loaded box, ' +
        'another machine, a stale measurement, another source tree) and could not say which was being made. Use ' +
        '--accept-calibration=load,machine,age,sources with only the kinds you mean.');
    } else if (flag === '--mode') {
      const value = args[++i];
      if (value !== 'pilot' && value !== 'full') throw new Error('--mode must be pilot or full');
      mode = value;
      modeExplicit = true;
    } else if (flag === '--out') {
      out = args[++i];
      if (!out || out.startsWith('--')) throw new Error('--out requires a new directory');
    } else if (flag === '--calibration') {
      calibration = args[++i];
      if (!calibration || calibration.startsWith('--')) throw new Error('--calibration requires a manifest path');
    } else if (flag === '--shard') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('--shard requires i/n');
      shard = parseShardSpec(value);
    } else if (flag === '--merge') {
      merge = args[++i];
      if (!merge || merge.startsWith('--')) throw new Error('--merge requires the row directory');
    } else if (flag === '--book') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('--book requires a path');
      book = value; // validated against the frozen dev book below; anything else throws
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (merge) {
    if (out || calibration || plan || shard !== WHOLE_ROW || acceptCalibration.length || provisionalCalibration) {
      throw new Error('--merge takes the row directory alone (plus --mode); the shards carry everything else');
    }
    return { mode, modeExplicit, book, plan, shard, merge, acceptCalibration, provisionalCalibration };
  }
  if (!plan && !out) throw new Error('Provide --out <new directory> or --plan');
  // A3 §3: no row runs on asserted budgets. A plan may be printed without one.
  if (!plan && !calibration) throw new Error('Provide --calibration <calibration.json> (preregistration A3 §3)');
  if (shard.count > 1 && mode !== 'full') throw new Error('--shard is for a full row; a pilot runs in one process');
  // A provisional calibration is an admitted non-measurement. A pilot is already
  // ineligible by design, so running one on a provisional budget costs nothing
  // that was not already lost; a FULL row would be a measurement with no budget.
  if (provisionalCalibration && mode !== 'pilot') {
    throw new Error('--provisional-calibration is for a plumbing pilot only: a full row measured against an ' +
      'admittedly provisional budget is not a measurement (A3 §3).');
  }
  return { mode, modeExplicit, out, calibration, book, plan, shard, acceptCalibration, provisionalCalibration };
}

/** What every shard of this row must agree on before its games may be pooled. */
function rowIdentity(mode: Mode, identityHash: string, calibration: Calibration,
  sourceIdentity: string, openingIds: readonly string[]): RowIdentity {
  return { identityHash, mode, seed: SEEDS[mode], calibrationSha256: calibration.sha256,
    sourceIdentitySha256: sourceIdentity, openingsDigest: openingsDigest(openingIds) };
}

/** This process's own calibration provenance, as it goes into its shard manifest. */
function calibrationMeta(calibration: Calibration, shard: ShardSpec, freshnessFrom: string): CalibrationMeta {
  return {
    path: calibration.path, sha256: calibration.sha256,
    accepted: calibration.acceptance.overridden.length > 0,
    acceptedKinds: [...new Set(calibration.acceptance.overridden.map(r => r.kind))],
    acceptedReasons: calibration.acceptance.reasons,
    acceptedByShard: calibration.acceptance.overridden.length
      ? [{ shard: shardStem(shard), kinds: [...new Set(calibration.acceptance.overridden.map(r => r.kind))],
        reasons: calibration.acceptance.reasons }]
      : [],
    budgets: calibration.budgets,
    searchesPerTurnInCalibration: calibration.searchesPerTurn,
    provisional: calibration.provisional !== null,
    ...(calibration.provisional ? { provisionalReason: calibration.provisional } : {}),
    freshnessMeasuredFrom: freshnessFrom,
  };
}

/**
 * The calibration provenance of a MERGED row: the UNION over every shard, saying
 * which shard accepted what.
 *
 * This used to read `merged.manifests[0].calibration` and call that the row's
 * provenance. Eight shards each load the calibration themselves and may each be
 * given a different `--accept-calibration` list, so the first shard's manifest is
 * evidence about the first shard and nothing else: a row where shard 1 ran clean
 * and shard 7 waved through a calibration measured on another machine reported
 * itself clean. Every concession any shard made now appears, attributed to the
 * shard that made it.
 */
export function mergeCalibrationMeta(manifests: readonly Record<string, unknown>[]): CalibrationMeta | undefined {
  const metas = manifests.map(m => (m as { calibration?: CalibrationMeta }).calibration).filter(Boolean) as CalibrationMeta[];
  if (!metas.length) return undefined;
  const byShard = metas.flatMap(m => m.acceptedByShard ?? []);
  const reasons = [...new Set(byShard.flatMap(s => s.reasons))];
  const kinds = [...new Set(byShard.flatMap(s => s.kinds))];
  const paths = [...new Set(metas.map(m => m.path))];
  const shas = [...new Set(metas.map(m => m.sha256))];
  if (shas.length > 1) {
    // The row identity already forbids this; saying so here as well means a
    // hand-assembled directory cannot slip a second calibration into the header.
    throw new Error(`Shards name ${shas.length} different calibrations (${shas.join(', ')}); a row has one budget.`);
  }
  return {
    path: paths.length === 1 ? paths[0] : paths.join(' | '),
    sha256: shas[0],
    accepted: byShard.length > 0,
    acceptedKinds: kinds,
    acceptedReasons: reasons,
    acceptedByShard: byShard.sort((a, b) => (a.shard < b.shard ? -1 : 1)),
    budgets: metas[0].budgets,
    searchesPerTurnInCalibration: metas[0].searchesPerTurnInCalibration,
    provisional: metas.some(m => m.provisional),
    ...(metas.find(m => m.provisionalReason) ? { provisionalReason: metas.find(m => m.provisionalReason)!.provisionalReason } : {}),
    freshnessMeasuredFrom: metas[0].freshnessMeasuredFrom,
  };
}

/**
 * `--merge DIR`: verify the shards are one row, then write its summary. The mode
 * comes from the shards' own identity, not from the command line — a mistyped
 * `--mode` would otherwise report the whole row as missing.
 */
export function mergeRow(dir: string, requestedMode: Mode | undefined, book: Gate1Book, bands: Bands,
  options: Parameters<typeof mergeShards>[2] = {}) {
  const mode = peekRowIdentity(dir).mode;
  if (requestedMode && requestedMode !== mode) {
    throw new Error(`${dir} holds a ${mode} row, not a ${requestedMode} one`);
  }
  const openings = scheduleOpenings(book);
  const tasks = schedule(mode, openings);
  const merged = mergeShards(dir, tasks, options);
  const calibration = mergeCalibrationMeta(merged.manifests);
  const entries = merged.entries as unknown as Entry[];
  const summary = summarize(entries, mode, merged.identity.identityHash, bands, openings,
    { calibration, shards: merged.shards.length, adapter: adapterMeta(entries) });
  writeJsonAtomic(`${dir}/summary.json`, summary);
  writeJsonAtomic(`${dir}/merged-manifest.json`, {
    schema: 'muju-gate1-merge-v2', mergedAt: new Date().toISOString(), dir, mode,
    rulesVersion: RULES_VERSION,
    identity: merged.identity, sourceIdentityAtMerge: merged.sourceIdentityAtMerge,
    shards: merged.perShard, games: merged.entries.length,
    expectedGames: tasks.length, gate1: summary.gate1, errors: summary.errors,
    invalidCells: summary.invalidCells, bookStartPositions: summary.bookStartPositions,
    calibration: calibration ?? null,
  });
  return summary;
}

export async function main(args: string[]) {
  const { mode, modeExplicit, out, calibration: calibrationPath, book: bookPath, plan, shard, merge,
    acceptCalibration, provisionalCalibration } = parseArgs(args);
  const book = loadGate1Book(bookPath); // refuses p1-val, p1-sealed and any other corpus
  const openings = scheduleOpenings(book);
  const openingIds = book.openings.map(o => o.id);
  const protocol = adoptedProtocol();
  const fileHashes = sourceFileHashes();
  const bands = loadBands(protocol.references, fileHashes);
  if (merge) {
    const summary = mergeRow(merge, modeExplicit ? mode : undefined, book, bands);
    console.log(json({ merged: merge, mode: summary.mode, games: summary.games, gate1: summary.gate1,
      errors: summary.errors }));
    if (summary.errors.length) throw new Error(summary.errors.join('\n'));
    return;
  }
  const tasks = schedule(mode, openings);
  const sourceIdentity = sourceIdentitySha256(fileHashes);
  const sharded = shard.count > 1;
  // Evidence is never overwritten. A fresh row demands a new directory; a shard
  // run may re-enter one, and `gate1-shard.ts` refuses to mix identities in it.
  // The directory is created BEFORE the calibration is read, because the row's
  // first start — which is what the freshness window is measured from — lives in
  // it (`rowFirstStartedAt`).
  if (!plan) {
    if (!sharded) mkdirSync(out!);
    else if (!existsSync(out!)) mkdirSync(out!, { recursive: true });
  }
  const freshnessFrom = plan ? new Date().toISOString() : rowFirstStartedAt(out!);
  const calibration: Calibration | null = calibrationPath
    ? loadCalibration(calibrationPath, { accept: acceptCalibration, acceptProvisional: provisionalCalibration,
      sourceIdentitySha256: sourceIdentity, now: Date.parse(freshnessFrom) })
    : null;
  if (plan) {
    console.log(json({ status: 'adopted', rulesVersion: RULES_VERSION, amendment: protocol.amendment,
      rulesAmendment: protocol.rulesAmendment, mode, games: tasks.length,
      pairsPerOpponentAndHandicap: PAIRS[mode], seed: SEEDS[mode],
      ...(mode === 'pilot' ? { pilotSeedChange: PILOT_SEED_CHANGE_REASON, voidPilotSeeds: VOID_PILOT_SEEDS } : {}),
      distinctnessReading: DISTINCTNESS_READING,
      bands: { path: BANDS_PATH, rulesVersion: bands.rulesVersion },
      workPerTurn: calibration?.budgets ?? 'calibration manifest required (A3 §3)',
      calibration: calibration ? { path: calibration.path, sha256: calibration.sha256,
        provisional: calibration.provisional, acceptedDespite: calibration.acceptance.reasons,
        searchesPerTurn: calibration.searchesPerTurn } : null,
      openings: { path: book.path, sha256: book.sha256, rows: book.openings.length,
        distinctStartPositions: book.distinctStartPositions, collisions: book.collisions,
        used: openingIds.slice(0, PAIRS[mode]) },
      schedule: tasks }));
    return;
  }
  if (heavyBypassed()) throw new Error('Gate 1 refuses MUJU_HEAVY_BYPASS');
  const budgets = calibration!.budgets;
  const mine = tasksForShard(tasks, shard);
  await withHeavySlot(`gate1-${mode}-${shardStem(shard)}`, async () => {
    mkdirSync(`${out}/replays`, { recursive: true });
    // One manifest per shard, shared with `gate1-shard.ts`: it patches in the
    // row identity and the game counters, this file owns everything else — and
    // owns `status`, which is the RUNNER's verdict on the whole shard and is what
    // a merge reads first.
    const manifest: Record<string, unknown> = { schema: 'muju-gate1-v5', status: 'initializing',
      rulesVersion: RULES_VERSION, amendment: AMENDMENT, rulesAmendment: protocol.rulesAmendment.id,
      startedAt: new Date().toISOString(), rowFirstStartedAt: freshnessFrom,
      mode, seed: SEEDS[mode], shard, expectedGames: mine.length, rowGames: tasks.length,
      ...(mode === 'pilot' ? { pilotSeedChange: PILOT_SEED_CHANGE_REASON, voidPilotSeeds: VOID_PILOT_SEEDS } : {}),
      gamesFile: shardGamesFile(shard), schedule: mine,
      bands: { path: BANDS_PATH, sha256: fileHashes[BANDS_PATH], rulesVersion: bands.rulesVersion },
      openings: { path: book.path, sha256: book.sha256, rows: book.openings.length, digest: openingsDigest(openingIds),
        distinctStartPositions: book.distinctStartPositions, collisions: book.collisions },
      calibration: calibrationMeta(calibration!, shard, freshnessFrom),
      host: machineIdentity(),
      git: git('rev-parse', 'HEAD'), gitStatus: git('status', '--porcelain'),
      sourceIdentity: { sha256: sourceIdentity, files: Object.keys(fileHashes).length },
      node: process.version, device: `${cpus()[0]?.model} / ${platform()}/${arch()}`, cpuCount: cpus().length,
      loadBefore: loadavg(), queue: { directory: heavyDir(), slots: slotCount() },
      distinctnessReading: DISTINCTNESS_READING,
      note: 'A3 allocation (distinct dev START POSITIONS, hashed games, calibrated budgets) at rules revision ' +
        `${RULES_VERSION} (A4), with unchanged A1 acceptance read against the bands re-frozen under the 20-ply ` +
        'clock; pilots are ineligible. No worker unlock or responsiveness claim.' };
    const saveManifest = () => {
      patchShardManifest(out!, shard, manifest);
      if (!sharded) writeJsonAtomic(`${out}/manifest.json`, patchShardManifest(out!, shard, {}));
    };
    saveManifest();
    let activeTask: Task | undefined;
    let identityHash = '';
    let entries: Entry[] = [];
    const reportMeta = (): ReportMeta => ({
      calibration: calibrationMeta(calibration!, shard, freshnessFrom),
      shards: sharded ? shard.count : undefined,
      adapter: adapterMeta(entries),
    });
    try {
      // ONE METER FOR THE WHOLE ROW. The adapter debits a turn's allowance by the
      // work a search actually spent, which is only readable while the meter is
      // patched in; installing it per game would also mean installing it inside
      // `resolvedConfigs`, whose engines must resolve identically to the row's.
      await WorkMeter.around(async meter => {
        const solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));
        const configs = await resolvedConfigs(solver, budgets, book.openings[0], meter);
        writeFileAtomic(`${out}/preregistration-${protocol.rulesAmendment.id}.md`, protocol.document);
        writeJsonAtomic(`${out}/calibration.json`, calibration!.manifest);
        const identity = { rulesVersion: RULES_VERSION, preregistration: protocol.amendment,
          rulesAmendment: protocol.rulesAmendment, abi: 7, files: fileHashes, configs,
          configHashes: Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, sha(json(v))])),
          weights: DEFAULT_WEIGHTS, hardWeightsVersion: null, hardBookMagic: null,
          hardIdentityNote: 'Hard replica is not an arm in Gate 1 and is never instantiated',
          options: DEFAULT_MATCH_OPTIONS,
          bands: { path: BANDS_PATH, sha256: fileHashes[BANDS_PATH], rulesVersion: bands.rulesVersion },
          openings: { path: book.path, sha256: book.sha256, order: 'file order, one opening per pair',
            handicaps: HANDICAPS, digest: openingsDigest(openingIds),
            distinctStartPositions: book.distinctStartPositions },
          calibration: { path: calibration!.path, sha256: calibration!.sha256,
            provisional: calibration!.provisional },
          workPerTurn: budgets };
        // The identity deliberately does NOT mention the shard: every shard of a
        // row computes the same hash, which is what makes the merge check mean
        // something.
        identityHash = sha(json(identity));
        Object.assign(manifest, { status: 'running', identityHash });
        writeJsonAtomic(`${out}/identity.json`, identity);
        saveManifest();
        const result = await runShardGames({
          out: out!, shard, tasks, play: async (task: Task) => {
            activeTask = task;
            const { replay, ...entry } = await runTask(task, solver, identityHash, configs, out!, budgets, book, meter);
            writeJsonAtomic(`${out}/replays/${task.id}.json`, replay);
            const r = entry.record;
            if (r.invariantViolation || r.anomalies.length || r.players.white.illegalActions + r.players.black.illegalActions) {
              throw new Error(`Correctness veto in ${task.id}; row void`);
            }
            return entry as unknown as Record<string, unknown>;
          },
          identity: rowIdentity(mode, identityHash, calibration!, sourceIdentity, openingIds),
          // No `manifestExtras`: this file has already written the row's
          // provenance — calibration, host, git, sources — into the SAME manifest,
          // and a second copy of it under the same keys would only fight with it.
          onGame(line, info) {
            const r = line.record;
            console.log(JSON.stringify({ id: line.task.id, opening: line.task.openingId, winner: r.winner,
              reason: r.winType, turns: r.completedTurns, purchases: r.players[line.task.hardSeat].unitsPlaced,
              ms: r.durationMs, game: line.gameSha256.slice(0, 12), ...(info.resumed ? { resumed: true } : {}) }));
          },
        });
        entries = result.games as unknown as Entry[];
        // One identity per row. The guard is deliberately blunt — it hashes every
        // source the harness can reach, not only the ones this row's engines
        // import — so it also fires when an unrelated lane edits the tree while a
        // row is running. It names what moved, because "sources changed" alone
        // tells a reader nothing about whether the games are still comparable.
        //
        // This runs AFTER the games are appended, because that is the only time it
        // can run, which is exactly why `mergeShards` now reads `status`,
        // `sourceDrift`, `error` and `failures.jsonl` as well as the games: by the
        // time this throws, `runShardGames` has already recorded a complete shard.
        const drifted = driftedSources(fileHashes, sourceFileHashes());
        if (drifted.length) {
          Object.assign(manifest, { sourceDrift: drifted });
          throw new Error(`Sources changed during row; row void: ${drifted.join(', ')}`);
        }
        Object.assign(manifest, { status: 'complete', completedGames: entries.length,
          playedGames: result.played.length, resumedGames: result.resumed.length,
          adapter: adapterMeta(entries) });
        if (sharded) {
          console.log(json({ shard: shardStem(shard), games: entries.length, played: result.played.length,
            resumed: result.resumed.length,
            next: `node --import tsx lab/ai/gate1.ts --merge ${out} --mode ${mode}` }));
        } else {
          const summary = summarize(entries, mode, identityHash, bands, openings, reportMeta());
          writeJsonAtomic(`${out}/summary.json`, summary);
          if (summary.errors.length) throw new Error(summary.errors.join('\n'));
          Object.assign(manifest, { gate1: summary.gate1, invalidCells: summary.invalidCells });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      // `at` is what lets a merge tell a failure that was RESOLVED by a later
      // re-run from one that still stands; a line without it is never forgiven.
      appendFileSync(`${out}/failures.jsonl`,
        JSON.stringify({ at: new Date().toISOString(), shard, task: activeTask, error: message }) + '\n');
      // The games that were played stay inspectable, under a name that can never
      // be read as a row result: a void row is void whatever its numbers say.
      if (entries.length && !sharded) {
        try {
          writeJsonAtomic(`${out}/summary-void.json`, { void: message,
            ...summarize(entries, mode, identityHash, bands, openings, reportMeta()) });
        } catch { /* a summary of broken evidence must not hide the original failure */ }
      }
      Object.assign(manifest, { status: 'invalid', completedGames: entries.length, error: message });
      throw error;
    } finally {
      Object.assign(manifest, { finishedAt: new Date().toISOString(), loadAfter: loadavg() });
      saveManifest();
    }
  }, { timeoutMs: SHARD_SLOT_TIMEOUT_MS });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exitCode = 1; });
}
