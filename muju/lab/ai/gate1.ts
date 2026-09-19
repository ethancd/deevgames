/** Gate 1 baseline-sanity runner, preregistration amendment A3.
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
 * A full row is fifteen hours of games, so it may be run in pieces:
 *
 *   node --import tsx lab/ai/gate1.ts --mode full --shard 3/8 --calibration C --out DIR
 *   node --import tsx lab/ai/gate1.ts --merge DIR
 *
 * Each shard plays a deterministic share of the schedule into its own files and
 * resumes where it stopped; `--merge` checks that the pieces are pieces of ONE
 * row and only then writes the summary (`gate1-shard.ts`). `lab/ai/gate1-launch.ts`
 * prints the commands and the expected wall time for a given layout.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg, cpus, platform, arch } from 'node:os';
import { pathToFileURL } from 'node:url';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { DEFAULT_WEIGHTS } from '../../src/ai/types';
import { playGame } from '../harness/runner';
import { createRushBot, createExpandBot, createBalancedBot } from '../harness/bots/archetypes';
import { DEFAULT_MATCH_OPTIONS } from '../harness/types';
import { withHeavySlot, heavyBypassed, heavyDir, slotCount } from '../hard-ai/ladder/heavy';
import { createGateBot, type GateBudgets, type GateDifficulty } from './gate1-bot';
import { loadCalibration, machineIdentity, type Calibration } from './gate1-calibrate';
import {
  DEV_BOOK_PATH, HANDICAPS, gate1StartState, loadGate1Book, openingsDigest, scheduleOpenings, type Gate1Book,
} from './gate1-openings';
import { createTraceHasher, startPositionDigest } from './gate1-trace';
import {
  BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH, driftedSources, sha, sourceFileHashes, sourceIdentitySha256,
} from './gate1-sources';
import {
  WHOLE_ROW, mergeShards, parseShardSpec, patchShardManifest, peekRowIdentity, runShardGames, shardGamesFile,
  shardStem, tasksForShard, type RowIdentity, type ShardSpec,
} from './gate1-shard';
import {
  schedule, summarize, AMENDMENT, PAIRS, SEEDS,
  type Task, type Mode, type Entry, type Bands, type ReportMeta,
} from './gate1-report';
import type { OpeningSpec } from '../hard-ai/ladder/openings';

export { BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH, sha };
const json = (s: unknown) => JSON.stringify(s, null, 2) + '\n';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
/**
 * How long a shard may wait for one of the shared heavy slots. The default is 30
 * minutes, which is right for a benchmark and wrong for this: with 8 shards and
 * 2 slots, six of them wait through three waves of hours-long work and would all
 * die before starting. A day is longer than any layout this row supports.
 */
export const SHARD_SLOT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Read the adopted document by commit, independently of later working-copy edits.
 * Historical calibration hashes are audit metadata, no longer prerequisites. */
export function adoptedProtocol() {
  const references = JSON.parse(readFileSync(REFERENCE_PATH, 'utf8'));
  const amendment = references.amendment;
  if (references.status !== 'adopted' || references.rulesVersion !== 'muju-phasing-1' || amendment?.id !== AMENDMENT) {
    throw new Error(`Gate 1 requires adopted amendment ${AMENDMENT}`);
  }
  const document = execFileSync('git', ['show', `${amendment.commit}:${amendment.path}`], { encoding: 'utf8' });
  if (sha(document) !== amendment.sha256) throw new Error('Adopted preregistration hash mismatch');
  return { references, amendment, document };
}

export async function resolvedConfigs(solver: TacticalSolver, budgets: GateBudgets, opening: OpeningSpec) {
  // Fresh throw-away engines expose their ACTUAL resolved defaults via debug.
  // No duplicated difficulty preset table; the live game engines are seeded afresh.
  const configs = {} as Record<GateDifficulty, ReturnType<ReturnType<typeof createGateBot>['resolvedConfig']>>;
  for (const difficulty of ['hard', 'medium'] as const) {
    const seat = createGateBot(difficulty, solver, budgets[difficulty]);
    seat.bot.onGameStart('white', 1);
    const state = gate1StartState(opening, 0);
    await seat.bot.nextAction(state, state.turn.currentPlayer);
    configs[difficulty] = seat.resolvedConfig();
  }
  return configs;
}

export async function runTask(task: Task, solver: TacticalSolver, identityHash: string,
  configs: Awaited<ReturnType<typeof resolvedConfigs>>, runId: string, budgets: GateBudgets, book: Gate1Book) {
  const opening = book.openings[task.openingIndex];
  if (!opening || opening.id !== task.openingId) throw new Error(`Opening mismatch for ${task.id}`);
  const hard = createGateBot('hard', solver, budgets.hard);
  const medium = task.opponent === 'aiv2-medium' ? createGateBot('medium', solver, budgets.medium) : null;
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
  const startLoad = loadavg();
  const { record, replay } = await playGame({ bots, seed: task.seed, runId, engineHash: identityHash,
    experiment: `gate1-${AMENDMENT}`, initialState,
    options: { ...DEFAULT_MATCH_OPTIONS, blackCrystalHandicap: task.handicap,
      actionsPerTurn: 4, upkeep: 'shipped', inactivityRule: 'on', recordReplay: true },
    onAction(before, after, action) {
      trace.push(before, action);
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
    hardSeat: task.hardSeat, otherSeat }, load: { before: startLoad, after: loadavg() },
  gameSha256: trace.digest(), startSha256, plies: trace.steps.length, replay };
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
  acceptLoadedCalibration: boolean;
}

export function parseArgs(args: string[]): Gate1Args {
  let mode: Mode = 'pilot', modeExplicit = false, out: string | undefined, calibration: string | undefined, plan = false;
  let book = DEV_BOOK_PATH, shard: ShardSpec = WHOLE_ROW, merge: string | undefined;
  let acceptLoadedCalibration = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Repeated option ${flag}`);
    seen.add(flag);
    if (flag === '--plan') plan = true;
    else if (flag === '--accept-loaded-calibration') acceptLoadedCalibration = true;
    else if (flag === '--mode') {
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
    if (out || calibration || plan || shard !== WHOLE_ROW) {
      throw new Error('--merge takes the row directory alone (plus --mode); the shards carry everything else');
    }
    return { mode, modeExplicit, book, plan, shard, merge, acceptLoadedCalibration };
  }
  if (!plan && !out) throw new Error('Provide --out <new directory> or --plan');
  // A3 §3: no row runs on asserted budgets. A plan may be printed without one.
  if (!plan && !calibration) throw new Error('Provide --calibration <calibration.json> (preregistration A3 §3)');
  if (shard.count > 1 && mode !== 'full') throw new Error('--shard is for a full row; a pilot runs in one process');
  return { mode, modeExplicit, out, calibration, book, plan, shard, acceptLoadedCalibration };
}

/** What every shard of this row must agree on before its games may be pooled. */
function rowIdentity(mode: Mode, identityHash: string, calibration: Calibration,
  sourceIdentity: string, openingIds: readonly string[]): RowIdentity {
  return { identityHash, mode, seed: SEEDS[mode], calibrationSha256: calibration.sha256,
    sourceIdentitySha256: sourceIdentity, openingsDigest: openingsDigest(openingIds) };
}

function reportMeta(calibration: Calibration | null, shards: number | null): ReportMeta {
  return {
    calibration: calibration ? {
      path: calibration.path, sha256: calibration.sha256,
      accepted: calibration.acceptance.overridden.length > 0,
      acceptedReasons: calibration.acceptance.overridden,
    } : undefined,
    shards: shards ?? undefined,
  };
}

/**
 * `--merge DIR`: verify the shards are one row, then write its summary. The mode
 * comes from the shards' own identity, not from the command line — a mistyped
 * `--mode` would otherwise report the whole row as missing.
 */
export function mergeRow(dir: string, requestedMode: Mode | undefined, book: Gate1Book, bands: Bands) {
  const mode = peekRowIdentity(dir).mode;
  if (requestedMode && requestedMode !== mode) {
    throw new Error(`${dir} holds a ${mode} row, not a ${requestedMode} one`);
  }
  const openings = scheduleOpenings(book);
  const tasks = schedule(mode, openings);
  const merged = mergeShards(dir, tasks);
  const first = merged.manifests[0] as { calibration?: ReportMeta['calibration'] };
  const summary = summarize(merged.entries as unknown as Entry[], mode, merged.identity.identityHash, bands, openings,
    { calibration: first.calibration, shards: merged.shards.length });
  writeFileSync(`${dir}/summary.json`, json(summary));
  writeFileSync(`${dir}/merged-manifest.json`, json({
    schema: 'muju-gate1-merge-v1', mergedAt: new Date().toISOString(), dir, mode,
    identity: merged.identity, shards: merged.perShard, games: merged.entries.length,
    expectedGames: tasks.length, gate1: summary.gate1, errors: summary.errors,
    invalidCells: summary.invalidCells, bookStartPositions: summary.bookStartPositions,
    calibration: first.calibration ?? null,
  }));
  return summary;
}

export async function main(args: string[]) {
  const { mode, modeExplicit, out, calibration: calibrationPath, book: bookPath, plan, shard, merge,
    acceptLoadedCalibration } = parseArgs(args);
  const book = loadGate1Book(bookPath); // refuses p1-val, p1-sealed and any other corpus
  const openings = scheduleOpenings(book);
  const openingIds = book.openings.map(o => o.id);
  const bands = JSON.parse(readFileSync(BANDS_PATH, 'utf8')) as Bands;
  if (merge) {
    const summary = mergeRow(merge, modeExplicit ? mode : undefined, book, bands);
    console.log(json({ merged: merge, mode: summary.mode, games: summary.games, gate1: summary.gate1,
      errors: summary.errors }));
    if (summary.errors.length) throw new Error(summary.errors.join('\n'));
    return;
  }
  const tasks = schedule(mode, openings);
  const protocol = adoptedProtocol();
  const fileHashes = sourceFileHashes();
  const sourceIdentity = sourceIdentitySha256(fileHashes);
  const calibration: Calibration | null = calibrationPath
    ? loadCalibration(calibrationPath, { accept: acceptLoadedCalibration, sourceIdentitySha256: sourceIdentity })
    : null;
  if (plan) {
    console.log(json({ status: 'adopted', amendment: protocol.amendment, mode, games: tasks.length,
      pairsPerOpponentAndHandicap: PAIRS[mode], seed: SEEDS[mode],
      workPerTurn: calibration?.budgets ?? 'calibration manifest required (A3 §3)',
      calibration: calibration ? { path: calibration.path, sha256: calibration.sha256,
        acceptedDespite: calibration.acceptance.overridden } : null,
      openings: { path: book.path, sha256: book.sha256, rows: book.openings.length,
        distinctStartPositions: book.distinctStartPositions, collisions: book.collisions,
        used: openingIds.slice(0, PAIRS[mode]) },
      schedule: tasks }));
    return;
  }
  if (heavyBypassed()) throw new Error('Gate 1 refuses MUJU_HEAVY_BYPASS');
  const budgets = calibration!.budgets;
  const sharded = shard.count > 1;
  // Evidence is never overwritten. A fresh row demands a new directory; a shard
  // run may re-enter one, and `gate1-shard.ts` refuses to mix identities in it.
  if (!sharded) mkdirSync(out!);
  else if (!existsSync(out!)) mkdirSync(out!, { recursive: true });
  await withHeavySlot(`gate1-${mode}-${shardStem(shard)}`, async () => {
    mkdirSync(`${out}/replays`, { recursive: true });
    const mine = tasksForShard(tasks, shard);
    // One manifest per shard, shared with `gate1-shard.ts`: it patches in the
    // row identity and the game counters, this file owns everything else. A
    // whole-row run keeps a copy under the familiar `manifest.json`.
    const manifest: Record<string, unknown> = { schema: 'muju-gate1-v4', status: 'initializing', amendment: AMENDMENT,
      startedAt: new Date().toISOString(), mode, shard, expectedGames: mine.length, rowGames: tasks.length,
      gamesFile: shardGamesFile(shard), schedule: mine,
      openings: { path: book.path, sha256: book.sha256, rows: book.openings.length, digest: openingsDigest(openingIds),
        distinctStartPositions: book.distinctStartPositions, collisions: book.collisions },
      calibration: { path: calibration!.path, sha256: calibration!.sha256, budgets,
        machine: calibration!.manifest.machine, load: calibration!.manifest.load,
        accepted: calibration!.acceptance.overridden.length > 0,
        acceptedReasons: calibration!.acceptance.overridden },
      host: machineIdentity(),
      git: git('rev-parse', 'HEAD'), gitStatus: git('status', '--porcelain'),
      sourceIdentity: { sha256: sourceIdentity, files: Object.keys(fileHashes).length },
      node: process.version, device: `${cpus()[0]?.model} / ${platform()}/${arch()}`, cpuCount: cpus().length,
      loadBefore: loadavg(), queue: { directory: heavyDir(), slots: slotCount() },
      note: 'A3 allocation (distinct dev START POSITIONS, hashed games, calibrated budgets) with unchanged A1 ' +
        'acceptance; pilots are ineligible. No worker unlock or responsiveness claim.' };
    const saveManifest = () => {
      patchShardManifest(out!, shard, manifest);
      if (!sharded) writeFileSync(`${out}/manifest.json`, json(patchShardManifest(out!, shard, {})));
    };
    saveManifest();
    let activeTask: Task | undefined;
    let identityHash = '';
    let entries: Entry[] = [];
    try {
      const solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));
      const configs = await resolvedConfigs(solver, budgets, book.openings[0]);
      const { references, amendment, document } = adoptedProtocol();
      if (references.bandsSha256 !== fileHashes[BANDS_PATH]) throw new Error('Frozen band hash mismatch');
      writeFileSync(`${out}/preregistration-${AMENDMENT}.md`, document);
      writeFileSync(`${out}/calibration.json`, json(calibration!.manifest));
      const identity = { rulesVersion: 'muju-phasing-1', preregistration: amendment, abi: 7, files: fileHashes, configs,
        configHashes: Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, sha(json(v))])),
        weights: DEFAULT_WEIGHTS, hardWeightsVersion: null, hardBookMagic: null,
        hardIdentityNote: 'Hard replica is not an arm in Gate 1 and is never instantiated',
        options: DEFAULT_MATCH_OPTIONS,
        openings: { path: book.path, sha256: book.sha256, order: 'file order, one opening per pair',
          handicaps: HANDICAPS, digest: openingsDigest(openingIds),
          distinctStartPositions: book.distinctStartPositions },
        calibration: { path: calibration!.path, sha256: calibration!.sha256 },
        workPerTurn: budgets };
      // The identity deliberately does NOT mention the shard: every shard of a
      // row computes the same hash, which is what makes the merge check mean
      // something.
      identityHash = sha(json(identity));
      Object.assign(manifest, { status: 'running', identityHash });
      writeFileSync(`${out}/identity.json`, json(identity));
      saveManifest();
      const result = await runShardGames({
        out: out!, shard, tasks, play: async (task: Task) => {
          activeTask = task;
          const { replay, ...entry } = await runTask(task, solver, identityHash, configs, out!, budgets, book);
          writeFileSync(`${out}/replays/${task.id}.json`, json(replay));
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
      const drifted = driftedSources(fileHashes, sourceFileHashes());
      if (drifted.length) {
        Object.assign(manifest, { sourceDrift: drifted });
        throw new Error(`Sources changed during row; row void: ${drifted.join(', ')}`);
      }
      Object.assign(manifest, { status: 'complete', completedGames: entries.length,
        playedGames: result.played.length, resumedGames: result.resumed.length });
      if (sharded) {
        console.log(json({ shard: shardStem(shard), games: entries.length, played: result.played.length,
          resumed: result.resumed.length,
          next: `node --import tsx lab/ai/gate1.ts --merge ${out} --mode ${mode}` }));
      } else {
        const summary = summarize(entries, mode, identityHash, bands, openings, reportMeta(calibration, null));
        writeFileSync(`${out}/summary.json`, json(summary));
        if (summary.errors.length) throw new Error(summary.errors.join('\n'));
        Object.assign(manifest, { gate1: summary.gate1, invalidCells: summary.invalidCells });
      }
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      appendFileSync(`${out}/failures.jsonl`, JSON.stringify({ shard, task: activeTask, error: message }) + '\n');
      // The games that were played stay inspectable, under a name that can never
      // be read as a row result: a void row is void whatever its numbers say.
      if (entries.length && !sharded) {
        try {
          writeFileSync(`${out}/summary-void.json`, json({ void: message,
            ...summarize(entries, mode, identityHash, bands, openings, reportMeta(calibration, null)) }));
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
