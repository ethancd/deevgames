/**
 * `node --import tsx lab/hard-ai/analyze/from-room.ts --room <id> --engine-seat white|black [--handicap <n>] --out <file>`
 * `node --import tsx lab/hard-ai/analyze/from-room.ts --game-dir <waveGameDir> [--out <file>]`
 * `node --import tsx lab/hard-ai/analyze/from-room.ts --campaign <waveDir> [--losses-only] [--out-dir <dir>]`
 * `node --import tsx lab/hard-ai/analyze/from-room.ts --bundle <file.room.json> --engine-seat white|black --out <file>`
 *
 * THE BRIDGE from an online room (an LLM-vs-Hard game played on the production
 * server) to a `muju-lab-replay-v2` file that `hard:analyze --replay` and
 * `hard:exam:from-loss` consume unchanged, so every online game Hard lost or
 * misplayed can be re-examined without playing it again.
 *
 * WHAT THE SERVER PUBLISHES. Three public, read-only GETs and nothing else:
 *   - `/api/muju/rooms/<id>/history?after=<seq>&limit=200` — the room's move
 *     history (`server/rooms.ts moveHistory`), undone entries omitted. Each entry
 *     is a DESCRIPTIVE event written by `src/game/moveHistory.ts
 *     describeTransition(before, action, after)`: a move with its path, an
 *     attack with defence before/after, a purchase (a public summon commitment),
 *     a promotion, mining with every take, upkeep with kept/released, the next
 *     seat's arrivals, the result. It is NOT the action list: phase ends are not
 *     events, and an `END_PLACE_PHASE` whose hand-off summons nothing leaves no
 *     trace at all.
 *   - `/api/muju/rooms/<id>` — the final snapshot (state, handicap, and the raw
 *     `history` of the last 100 commands, see CROSS-CHECKS).
 *   - `/api/muju/rooms/<id>/positions/0` — the stored root position (the state
 *     before the first command), used to prove the room started where the lab
 *     starts.
 *
 * THE RECONSTRUCTION. Starting from the lab's own Phasing initial state at the
 * room's Black crystal handicap (`ladder/ruleset.ts initialStateForRules`, the
 * same call `analyze/replay.ts` makes for opening `initial`), the next event
 * names the next action:
 *
 *   move / attack / purchase / promotion  -> MOVE / ATTACK / BUY_UNIT / PROMOTE_UNIT
 *   mining                                -> END_ACTION_PHASE (it collects income and,
 *                                            unless upkeep must be chosen, settles it)
 *   upkeep with `automatic: false`        -> PAY_UPKEEP with the event's kept list
 *   arrivals, or any event of the OTHER   -> END_PLACE_PHASE (the hand-off; the next
 *   seat, while the mover is in Prepare      seat's summons resolve as it starts)
 *   result `resignation`                  -> RESIGN
 *   any other rules result                -> the phase end that produced it
 *   result `timeout` / `abandoned`        -> no action: the server's clock or archive
 *
 * VERIFICATION IS THE WHOLE POINT. Every inferred action must be legal
 * (`isLegalAction`) and is applied through the canonical `applyAction`; then the
 * SERVER'S OWN event writer, `describeTransition`, is run on the rebuilt
 * before/after pair, and every event it produces must equal the next recorded
 * event field for field — bank before and after, every mining take and the
 * reserves it left, attack power, defence before and after, the kill, squares
 * and paths, arrivals and disruptions with refunds, upkeep paid, kept and
 * released, the winner and the victory reason — and must carry the recorded
 * revision's turn (`positionTurn`). An event the rebuild does not produce, or a
 * recorded event it cannot account for, refuses the room at that event. The
 * start is compared with the stored root position, the final rebuilt state
 * with the snapshot's final state, the inferred action list with the server's
 * raw command log (the snapshot's `history`: the exact applied actions of the
 * last ≤ 100 commands, phase ends included, so it checks every phase end this
 * tool inferred inside that window), and — with `--game-dir` — the engine seat's
 * turns with its own submission log, matched by revision. Finally the written
 * file is loaded back through `analyze/replay.ts` and must reconstruct to the
 * same result. A replay that does not reproduce its own result is worthless;
 * this tool never writes one. Only `notation`/`description` strings (display
 * text) are compared loosely: a difference there is reported as a note, never
 * used as evidence.
 *
 * UNIT IDS. The six starting units carry the server's stamped ids
 * (`white_fire_1_<ms>_<rand>`); the rebuild's own differ. They are paired by
 * (owner, starting definition), exactly as `analyze/replay.ts buildIdMap` does,
 * and the file records the SERVER'S ids so its actions cross-reference with the
 * room's logs. Bought units are `unit-<side>-<turn>-<n>` on both sides.
 *
 * THE FILE. A `muju-lab-replay-v2` (`ReplayFile` plus `opening`): opening
 * `initial`, `meta.rulesVersion` the room's revision, `meta.options` the lab
 * defaults (which are the production rules) plus the handicap, the Hard seat
 * labelled `hard@<profile>` (`hard@desktop` for the wave engine) and the LLM seat
 * `llm@<model>`, one snapshot per applied action, and — from `--game-dir` — the
 * engine's per-turn search wall as `players[seat].turnMs` with its allowance as
 * `meta.decisionMs`. One TOP-LEVEL field, `source`, records the room, the
 * server, the checks and the notes; `loadReplay` ignores it. What online play
 * has and a lab game never does:
 *   - the upkeep REVIEW preference (`SET_UPKEEP_REVIEW`) is a room setting, not
 *     an action, yet it decides whether an affordable upkeep settles inside
 *     `END_ACTION_PHASE` or waits for a chosen `PAY_UPKEEP` that may release
 *     units (and the Hard replica folds it into its position key). This is the
 *     ONE format extension: an optional `ReplayStep.reviewUpkeep`, written only
 *     on a step where the preference changed and installed by
 *     `analyze/replay.ts` before that step's action. Where the raw command log
 *     covers the toggle it sits at the logged position; before the log's window
 *     it is inferred at the `END_ACTION_PHASE` whose upkeep event it decided
 *     (automatic vs chosen with the bank covering it) — the only moment it has
 *     any effect on play. Replays without the field read exactly as before.
 *   - a `timeout`/`abandoned` ending leaves the final position still playing;
 *     `meta.winType` records it and `analyze/replay.ts` does not assert it.
 *   - `kill-clock` endings are rules verdicts and ARE asserted
 *     (`analyze/replay.ts RULE_WIN_TYPES`).
 *
 * NETWORK. Sequential GETs at most two per second; never a POST. The fetched
 * bundle (minus the snapshot's `lastTurnReplay` animation) is written next to
 * the replays (`<replays>/../rooms/<gameId>.room.json`), is reused by later runs
 * unless `--refetch`, and can be converted offline with `--bundle`.
 *
 * DOWNSTREAM. `hard:analyze --run <dir>` reads `<dir>/replays`; a loss becomes
 * an exam case with `hard:exam:from-loss --analysis <a> --replay <r> --stratum
 * dev --out <file>` (opening `initial` belongs to no stratum file, so the
 * stratum must be named; the case carries `setup.ruleset: 'phasing'` and its
 * recipe replays from the Phasing start).
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { describeTransition, type MoveEvent, type MoveHistoryEntry } from '../../../src/game/moveHistory';
import { getUnitDefinition } from '../../../src/game/units';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';
import type { GameState, PlayerId, Position, VictoryReason } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import {
  DEFAULT_MATCH_OPTIONS,
  HARNESS_RULES_VERSION,
  type GameRecord,
  type MatchOptions,
  type PlayerGameStats,
  type ReplayStep,
  type RulesVersion,
  type WinType,
} from '../../harness/types';
import { initialStateForRules } from '../ladder/ruleset';
import { REPLAY_SCHEMA, buildIdMap, loadReplay, reconstruct, withMatchRules, type StoredReplay } from './replay';

/**
 * A copy of `lab/harness/runner.ts snapshotStep` (not exported there). runner.ts's bytes are pinned by the
 * p2/p3 scripted-campaign manifests (`tests/lab/phasing-evidence.test.ts`), so it can't gain an export for
 * this tool. Drift between the two is caught anyway: every replay this tool writes must pass
 * `analyze/replay.ts reconstruct`, which compares each step against its own rebuilt snapshot.
 */
function snapshotStep(state: GameState, ply: number, actor: PlayerId, action: AIAction | null): ReplayStep {
  const cells = state.board.cells.flat().map(cell => cell.resourceLayers);
  const res = {} as ReplayStep['res'];
  for (const p of ['white', 'black'] as PlayerId[]) {
    const ps = state.players[p];
    res[p] = { r: ps.resources, g: ps.resourcesGained, s: ps.resourcesGained - ps.resources };
  }
  return {
    ply,
    turn: state.turn.turnNumber,
    player: actor,
    phase: state.turn.phase,
    actionsRemaining: state.turn.actionsRemaining,
    action,
    units: state.board.units.map((u) => ({
      o: u.owner,
      d: u.definitionId,
      x: u.position.x,
      y: u.position.y,
      dmg: u.damageTaken,
    })),
    pendingSummons: (state.pendingSummons ?? []).map(s => ({ o: s.owner, d: s.definitionId, x: s.position.x, y: s.position.y, cost: s.cost })),
    cells,
    res,
  };
}

export const DEFAULT_SERVER = 'https://deevgames-muju.onrender.com';
export const ROOM_BUNDLE_SCHEMA = 'muju-room-bundle-v1';
/** `server/schema.ts historyQuerySchema`'s maximum page. */
export const HISTORY_PAGE_LIMIT = 200;
/** ≤ 2 requests per second against the production host. */
export const MIN_REQUEST_INTERVAL_MS = 500;

export class RoomReplayError extends Error {}

function refuse(where: string, detail: string): never {
  throw new RoomReplayError(`${where}: ${detail}`);
}

// --- the bundle -------------------------------------------------------------

/** The slice of the public room snapshot this tool reads. */
export interface RoomSnapshotLike {
  id: string;
  revision: number;
  createdAt?: string;
  updatedAt?: string;
  timeControl?: unknown;
  matchPolicy?: unknown;
  state: GameState;
  history: { revision: number; player: PlayerId; actions: ({ type: string } & Record<string, unknown>)[]; result?: { winner: PlayerId | null; reason: VictoryReason } }[];
}

/** Everything fetched from the server for one room, stored verbatim. */
export interface RoomBundle {
  schema: typeof ROOM_BUNDLE_SCHEMA;
  roomId: string;
  server: string;
  fetchedAt: string;
  room: RoomSnapshotLike;
  /** `/positions/0`: the state before the first command, or null when absent. */
  root: GameState | null;
  history: {
    recordingStart: { revision: number; turnNumber: number; player: PlayerId; complete: boolean };
    total: number;
    entries: MoveHistoryEntry[];
  };
}

type Fetcher = (url: string) => Promise<unknown>;

async function defaultFetcher(url: string): Promise<unknown> {
  const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status} ${await res.text().then(t => t.slice(0, 200)).catch(() => '')}`);
  return res.json();
}

/**
 * Fetches a room's snapshot, root position and whole move history,
 * sequentially and at most one request per `intervalMs`. GET only.
 */
export async function fetchRoomBundle(
  roomId: string,
  opts: { server?: string; fetcher?: Fetcher; intervalMs?: number; log?: (line: string) => void } = {},
): Promise<RoomBundle> {
  if (!/^[0-9a-f]{32}$/.test(roomId)) throw new Error(`room id must be 32 lowercase hex characters, got ${roomId}`);
  const server = (opts.server ?? DEFAULT_SERVER).replace(/\/+$/, '');
  const fetcher = opts.fetcher ?? defaultFetcher;
  const interval = opts.intervalMs ?? MIN_REQUEST_INTERVAL_MS;
  let last = 0;
  const get = async (url: string): Promise<unknown> => {
    const wait = last + interval - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    last = Date.now();
    opts.log?.(`GET ${url}`);
    return fetcher(url);
  };
  const base = `${server}/api/muju/rooms/${roomId}`;
  // `lastTurnReplay` is an animation recording of the last turn (often most of
  // the snapshot's bytes); nothing here reads it, so the bundle does not keep it.
  const { lastTurnReplay: _animation, ...room } = (await get(base)) as RoomSnapshotLike & { lastTurnReplay?: unknown };
  void _animation;
  let root: GameState | null = null;
  try {
    root = ((await get(`${base}/positions/0`)) as { state: GameState }).state ?? null;
  } catch (err) {
    opts.log?.(`root position unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
  const entries: MoveHistoryEntry[] = [];
  let after = 0;
  let recordingStart: RoomBundle['history']['recordingStart'] | null = null;
  let total = 0;
  for (;;) {
    const page = (await get(`${base}/history?after=${after}&limit=${HISTORY_PAGE_LIMIT}`)) as {
      recordingStart: RoomBundle['history']['recordingStart'];
      total: number;
      entries: MoveHistoryEntry[];
      hasLater: boolean;
    };
    recordingStart ??= page.recordingStart;
    total = page.total;
    entries.push(...page.entries);
    if (!page.hasLater || page.entries.length === 0) break;
    after = page.entries[page.entries.length - 1].sequence;
  }
  if (recordingStart === null) throw new Error(`${roomId}: the history response carried no recordingStart`);
  return { schema: ROOM_BUNDLE_SCHEMA, roomId, server, fetchedAt: new Date().toISOString(), room, root, history: { recordingStart, total, entries } };
}

export function readBundle(file: string): RoomBundle {
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8')) as RoomBundle;
  if (bundle.schema !== ROOM_BUNDLE_SCHEMA) throw new Error(`${file}: schema ${String(bundle.schema)}, expected ${ROOM_BUNDLE_SCHEMA}`);
  return bundle;
}

// --- squares and ids --------------------------------------------------------

export function parseSquare(square: string, where: string): Position {
  const m = /^([A-J])(10|[1-9])$/.exec(square);
  if (m === null) refuse(where, `"${square}" is not a board square`);
  return { x: m[1].charCodeAt(0) - 65, y: Number(m[2]) - 1 };
}

/** `analyze/replay.ts STAMPED_ID`: a starting unit's nondeterministic id. */
const STAMPED_ID = /^(white|black)_(.+)_\d{8,}_[a-z0-9]+$/;

/** Server id <-> rebuilt id, for the six stamped starting units. */
class IdBridge {
  private readonly byKey: Map<string, string>;
  private readonly serverByLocal = new Map<string, string>();

  constructor(initial: GameState, where: string) {
    this.byKey = buildIdMap(initial, where);
  }

  /** The rebuilt id of a server id. Deterministic ids pass through. */
  local(serverId: string, where: string): string {
    const m = STAMPED_ID.exec(serverId);
    if (m === null) return serverId;
    const local = this.byKey.get(`${m[1]}|${m[2]}`);
    if (local === undefined) refuse(where, `server unit id ${serverId} has no starting unit to pair with`);
    const known = this.serverByLocal.get(local);
    if (known !== undefined && known !== serverId) refuse(where, `two server ids (${known}, ${serverId}) pair with one starting unit`);
    this.serverByLocal.set(local, serverId);
    return local;
  }

  /** The server id of a rebuilt id, once the server has named it. */
  server(localId: string, where: string): string {
    if (STAMPED_ID.exec(localId) === null) return localId;
    const id = this.serverByLocal.get(localId);
    if (id === undefined) refuse(where, `rebuilt starting unit ${localId} was never named by a server event`);
    return id;
  }
}

function mapAction(action: AIAction, idOf: (id: string) => string): AIAction {
  switch (action.type) {
    case 'MOVE':
      return { type: 'MOVE', unitId: idOf(action.unitId), to: { ...action.to } };
    case 'ATTACK':
      return { type: 'ATTACK', unitId: idOf(action.unitId), targetPosition: { ...action.targetPosition } };
    case 'PROMOTE_UNIT':
      return { type: 'PROMOTE_UNIT', unitId: idOf(action.unitId) };
    case 'PAY_UPKEEP':
      return { type: 'PAY_UPKEEP', keepUnitIds: action.keepUnitIds.map(idOf) };
    case 'BUY_UNIT':
      return { type: 'BUY_UNIT', definitionId: action.definitionId, position: { ...action.position } };
    default:
      return { ...action };
  }
}

// --- event comparison -------------------------------------------------------

/** Display text: compared loosely, reported as a note when it differs. */
const DISPLAY_FIELDS = new Set(['notation', 'description']);
/** Bookkeeping the server adds to a stored event. */
const ENTRY_FIELDS = new Set(['sequence', 'revision', 'timestamp', 'undoneAtRevision', 'positionTurn']);

function canonical(value: unknown, idOf: (id: string) => string, keyName = ''): unknown {
  if (Array.isArray(value)) return value.map(v => canonical(v, idOf));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (ENTRY_FIELDS.has(key) || DISPLAY_FIELDS.has(key)) continue;
      out[key] = canonical((value as Record<string, unknown>)[key], idOf, key);
    }
    return out;
  }
  if (keyName === 'id' && typeof value === 'string') return idOf(value);
  return value;
}

/** The first path at which two canonical values differ, or null. */
function firstDifference(a: unknown, b: unknown, at = ''): { path: string; rebuilt: unknown; recorded: unknown } | null {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return { path: `${at}.length`, rebuilt: a.length, recorded: b.length };
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${at}[${i}]`);
      if (d !== null) return d;
    }
    return null;
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at === '' ? k : `${at}.${k}`);
      if (d !== null) return d;
    }
    return null;
  }
  return Object.is(a, b) ? null : { path: at === '' ? '(value)' : at, rebuilt: a, recorded: b };
}

function describeEntry(e: MoveHistoryEntry): string {
  return `seq ${e.sequence} (rev ${e.revision}, ${e.player} T${e.turnNumber} ${e.kind} "${e.notation}")`;
}

// --- the conversion ---------------------------------------------------------

export interface EngineSubmission {
  revision: number;
  actions: AIAction[];
}

export interface ConvertOptions {
  /** The seat the Hard engine played. */
  engineSeat: PlayerId;
  /** The `hard@<profile>` label; `hard@desktop` for the wave engine. */
  engineLabel?: string;
  /** The other seat's label; must not start with `hard@`. */
  opponentLabel?: string;
  /** Asserted against the room when given (a manifest's `blackCrystalHandicap`). */
  handicap?: number;
  /** Asserted against the recorded result when given. */
  expectedWinner?: PlayerId | null;
  expectedReason?: string;
  /** Rules revision the room was played under (a manifest's `engine.rulesId`). */
  rulesVersion?: RulesVersion;
  /** Game id used as the replay's file id and in provenance. */
  gameId?: string;
  campaign?: string | null;
  engineHash?: string;
  seed?: number;
  startedAt?: string;
  finishedAt?: string;
  /** The engine seat's accepted submissions, in order (`engine/engine-seat.jsonl`). */
  engineSubmissions?: EngineSubmission[];
  /** The engine seat's per-turn search wall times, keyed by turn number. */
  engineTurnMs?: Map<number, number>;
  /** The engine's per-turn wall allowance, recorded as `meta.decisionMs`. */
  engineAllowanceMs?: number;
}

export interface ConversionReport {
  roomId: string;
  gameId: string;
  events: number;
  actions: number;
  inferredPhaseEnds: number;
  winner: PlayerId | null;
  winType: WinType;
  finalTurn: number;
  checks: string[];
  notes: string[];
}

export interface Conversion {
  replay: StoredReplay & { source: Record<string, unknown> };
  report: ConversionReport;
}

const SERVER_VERDICTS = new Set<VictoryReason>(['timeout', 'abandoned']);

/**
 * Rebuilds the room through the canonical engine, verifying every event, and
 * returns the lab replay. Throws `RoomReplayError` at the first disagreement.
 */
export function convertRoom(bundle: RoomBundle, opts: ConvertOptions): Conversion {
  const gameId = opts.gameId ?? `room-${bundle.roomId.slice(0, 12)}`;
  const W = gameId;
  const room = bundle.room;
  const finalState = room.state;
  const checks: string[] = [];
  const notes: string[] = [];

  // --- the room's identity --------------------------------------------------
  if (room.id !== bundle.roomId) refuse(W, `snapshot is for room ${room.id}, not ${bundle.roomId}`);
  if (finalState.ruleset !== 'phasing') refuse(W, `the room's ruleset is ${String(finalState.ruleset)}, not phasing`);
  const handicap = finalState.blackCrystalHandicap ?? 0;
  if (opts.handicap !== undefined && opts.handicap !== handicap) {
    refuse(W, `the room's Black crystal handicap is ${handicap}, the caller expected ${opts.handicap}`);
  }
  const start = bundle.history.recordingStart;
  if (!start.complete || start.revision !== 0 || start.turnNumber !== 1 || start.player !== 'white') {
    refuse(W, `the history does not start at the beginning of the game (recordingStart ${JSON.stringify(start)})`);
  }
  const entries = [...bundle.history.entries].sort((a, b) => a.sequence - b.sequence);
  if (entries.length !== bundle.history.total) {
    refuse(W, `fetched ${entries.length} history entries but the server counts ${bundle.history.total}`);
  }
  for (const e of entries) if (e.undoneAtRevision !== null && e.undoneAtRevision !== undefined) refuse(W, `${describeEntry(e)} is an undone entry; fetch without includeUndone`);
  const layout = finalState.board.initialResourceLayers;
  if (layout !== undefined && (layout.length !== UNEQUAL_ROUTES_MAP.length || layout.some((n, i) => n !== UNEQUAL_ROUTES_MAP[i]))) {
    refuse(W, 'the room was created on a resource layout other than the production map; the lab option would have to carry it');
  }
  const rulesVersion: RulesVersion = opts.rulesVersion ?? HARNESS_RULES_VERSION;

  const options: MatchOptions = {
    ...DEFAULT_MATCH_OPTIONS,
    recordReplay: true,
    blackCrystalHandicap: handicap,
    ...(finalState.actionsPerTurn !== undefined ? { actionsPerTurn: finalState.actionsPerTurn } : {}),
    ...(finalState.victoryRule !== undefined ? { victoryRule: finalState.victoryRule } : {}),
    ...(finalState.inactivityRule !== undefined ? { inactivityRule: finalState.inactivityRule } : {}),
  };

  // Pass 1 infers every upkeep-review change from the upkeep events. When the
  // raw command log logs a SET_UPKEEP_REVIEW, pass 2 places it exactly.
  const inferOnly: ReviewPlan = { exact: new Map(), inferBefore: Number.POSITIVE_INFINITY };
  let built = withMatchRules(options, () => rebuild(bundle, entries, options, opts, W, checks, notes, inferOnly));
  const logged = reviewPlanFromLog(bundle, built.serverActionCount);
  if (logged !== null && logged.exact.size > 0) {
    checks.length = 0;
    notes.length = 0;
    built = withMatchRules(options, () => rebuild(bundle, entries, options, opts, W, checks, notes, logged));
  }

  // --- meta -----------------------------------------------------------------
  const engineLabel = opts.engineLabel ?? 'hard@desktop';
  if (!engineLabel.startsWith('hard@')) refuse(W, `engine label ${engineLabel} must be hard@<profile>`);
  const opponentLabel = opts.opponentLabel ?? 'llm@unknown';
  if (opponentLabel.startsWith('hard@')) refuse(W, `opponent label ${opponentLabel} must not be a hard@ label`);
  const opponent: PlayerId = opts.engineSeat === 'white' ? 'black' : 'white';
  const labels: Record<PlayerId, string> = { [opts.engineSeat]: engineLabel, [opponent]: opponentLabel } as Record<PlayerId, string>;

  const { winner, winType } = built;
  if (opts.expectedWinner !== undefined && opts.expectedWinner !== winner) {
    refuse(W, `the history ends with winner ${String(winner)}, the manifest records ${String(opts.expectedWinner)}`);
  }
  if (opts.expectedReason !== undefined && opts.expectedReason !== winType) {
    refuse(W, `the history ends by ${winType}, the manifest records ${opts.expectedReason}`);
  }

  const stats = gameStats(built.steps, built.actors, built.events, labels, built.final);
  if (opts.engineTurnMs !== undefined) {
    const seatTurns = built.turnsBySide[opts.engineSeat];
    const turnMs: number[] = [];
    let complete = true;
    for (const t of seatTurns) {
      const ms = opts.engineTurnMs.get(t);
      if (ms === undefined) { complete = false; break; }
      turnMs.push(Math.round(ms));
    }
    if (complete) {
      stats[opts.engineSeat].turnMs = turnMs;
      stats[opts.engineSeat].decisionMs = turnMs.reduce((a, b) => a + b, 0);
      checks.push(`engine turnMs: one search per ${opts.engineSeat} turn (${turnMs.length})`);
    } else {
      notes.push('the engine log does not have exactly one search per engine turn; players[engineSeat].turnMs omitted');
    }
  }

  const startedAt = opts.startedAt ?? room.createdAt ?? bundle.fetchedAt;
  const finishedAt = opts.finishedAt ?? room.updatedAt ?? bundle.fetchedAt;
  const firstKill = built.events.find(e => e.kind === 'attack' && e.killed);
  const meta: GameRecord = {
    schema: 'muju-lab-game-v3',
    rulesVersion,
    engineHash: opts.engineHash ?? 'online-room',
    runId: opts.campaign ? `${opts.campaign}/${gameId}` : `room/${bundle.roomId}`,
    experiment: opts.campaign ?? null,
    seed: opts.seed ?? 0,
    startedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) || 0,
    options,
    winner,
    winType,
    turns: built.final.turn.turnNumber,
    plies: built.steps.length - 1,
    firstBlood: firstKill === undefined ? null : { by: firstKill.player, turn: firstKill.turnNumber },
    players: stats,
    ...(opts.engineAllowanceMs !== undefined && stats[opts.engineSeat].turnMs !== undefined ? { decisionMs: opts.engineAllowanceMs } : {}),
    handicap,
    incomeCurve: [],
    round90Exhaustion: null,
    purchases: built.events.filter(e => e.kind === 'purchase').map(e => ({ player: e.player, turn: e.turnNumber, definitionId: (e as Extract<MoveEvent, { kind: 'purchase' }>).unit.definitionId })),
    promotionEvents: built.events
      .filter((e): e is Extract<MoveEvent, { kind: 'promotion' }> => e.kind === 'promotion')
      .map(e => ({ player: e.player, turn: e.turnNumber, unitId: e.unit.id, definitionId: e.unit.definitionId })),
    placedAndAttackedKills: 0,
    materialCurve: built.materialCurve,
    invariantViolation: null,
    anomalies: [],
  };

  const source = {
    kind: 'online-room',
    note: 'Converted by lab/hard-ai/analyze/from-room.ts from the public move history; every event was re-derived through describeTransition and matched.',
    server: bundle.server,
    roomId: bundle.roomId,
    fetchedAt: bundle.fetchedAt,
    gameId,
    campaign: opts.campaign ?? null,
    engineSeat: opts.engineSeat,
    finalRevision: room.revision,
    historyEntries: entries.length,
    inferredPhaseEnds: built.inferredPhaseEnds,
    checks,
    notes,
    unrepresented: ['incomeCurve', 'placedAndAttackedKills'],
  };

  const replay: StoredReplay & { source: Record<string, unknown> } = {
    schema: REPLAY_SCHEMA,
    meta,
    steps: built.steps,
    opening: { id: 'initial', actions: [] },
    source,
  };
  return {
    replay,
    report: {
      roomId: bundle.roomId,
      gameId,
      events: entries.length,
      actions: built.steps.length - 1,
      inferredPhaseEnds: built.inferredPhaseEnds,
      winner,
      winType,
      finalTurn: built.final.turn.turnNumber,
      checks,
      notes,
    },
  };
}

interface Built {
  steps: ReplayStep[];
  actors: PlayerId[];
  events: MoveEvent[];
  final: GameState;
  winner: PlayerId | null;
  winType: WinType;
  inferredPhaseEnds: number;
  turnsBySide: Record<PlayerId, number[]>;
  materialCurve: GameRecord['materialCurve'];
  serverActionCount: number;
}

function rebuild(
  bundle: RoomBundle,
  entries: MoveHistoryEntry[],
  options: MatchOptions,
  opts: ConvertOptions,
  W: string,
  checks: string[],
  notes: string[],
  plan: ReviewPlan,
): Built {
  let state = initialStateForRules('phasing', {
    blackCrystalHandicap: options.blackCrystalHandicap,
    actionsPerTurn: options.actionsPerTurn,
    resourceLayout: options.resourceLayout,
    elementGraph: options.elementGraph,
    upkeep: options.upkeep,
    handicap: options.handicap,
  });
  state.victoryRule = options.victoryRule;
  state.inactivityRule = options.inactivityRule;
  const ids = new IdBridge(state, `${W}: initial position`);

  // --- the start ------------------------------------------------------------
  if (bundle.root !== null) {
    compareStates(state, bundle.root, ids, `${W}: root position (positions/0)`, { registerIds: true });
    checks.push('root position (positions/0) equals the lab Phasing initial state at this handicap');
  } else {
    notes.push('the server returned no root position; the start is verified only by the first events');
  }

  const steps: ReplayStep[] = [snapshotStep(state, 0, state.turn.currentPlayer, null)];
  const actors: PlayerId[] = [state.turn.currentPlayer];
  const serverActions: AIAction[] = [];
  const recordedActions: PlayedAction[] = [];
  const events: MoveEvent[] = [];
  const turnsBySide: Record<PlayerId, number[]> = { white: [], black: [] };
  const materialCurve: GameRecord['materialCurve'] = [];
  const sampleMaterial = (s: GameState): void => {
    const mat = (p: PlayerId): number => s.board.units.filter(u => u.owner === p).reduce((n, u) => n + getUnitDefinition(u.definitionId).cost, 0);
    materialCurve.push({ turn: s.turn.turnNumber, white: mat('white'), black: mat('black'), whiteRes: s.players.white.resources, blackRes: s.players.black.resources });
  };
  const noteTurn = (s: GameState): void => {
    const list = turnsBySide[s.turn.currentPlayer];
    if (s.phase === 'playing' && list[list.length - 1] !== s.turn.turnNumber) {
      list.push(s.turn.turnNumber);
      if (s.turn.currentPlayer === 'white') sampleMaterial(s);
    }
  };
  noteTurn(state);

  let i = 0;
  let inferredPhaseEnds = 0;
  let silentInARow = 0;
  let reviewToggles = 0;
  let reviewInferred = 0;
  let serverVerdict: MoveHistoryEntry | null = null;
  const displayDiffs: string[] = [];

  while (i < entries.length) {
    const e = entries[i];
    const where = `${W}: ${describeEntry(e)}`;
    if (state.phase === 'victory') refuse(where, `the rebuilt game already ended (${state.victoryReason}, winner ${String(state.winner)}) but the history continues`);

    if (e.kind === 'result' && SERVER_VERDICTS.has(e.reason)) {
      if (e.player !== state.turn.currentPlayer || e.turnNumber !== state.turn.turnNumber) {
        refuse(where, `a ${e.reason} verdict against ${e.player} T${e.turnNumber}, but ${state.turn.currentPlayer} T${state.turn.turnNumber} is on move in the rebuild`);
      }
      const expectedWinner = e.reason === 'timeout' ? (e.player === 'white' ? 'black' : 'white') : null;
      if (e.winner !== expectedWinner) refuse(where, `a ${e.reason} verdict names winner ${String(e.winner)}, the clock rule gives ${String(expectedWinner)}`);
      serverVerdict = e;
      i++;
      if (i < entries.length) refuse(where, `${entries.length - i} event(s) follow the server's ${e.reason} verdict`);
      break;
    }

    const inferred = inferAction(state, e, where);
    const localAction = mapAction(inferred.action, id => ids.local(id, where));
    const actor = state.turn.currentPlayer;
    const actorTurn = state.turn.turnNumber;
    const actionIndex = steps.length - 1;

    // The upkeep REVIEW preference in force for this action (see the header).
    const before: Record<PlayerId, boolean> = { white: state.reviewUpkeep?.white === true, black: state.reviewUpkeep?.black === true };
    const pref = { ...before };
    for (const t of plan.exact.get(actionIndex) ?? []) pref[t.player] = t.enabled;
    if (localAction.type === 'END_ACTION_PHASE' && e.kind === 'mining') {
      const probe = applyAction({ ...state, reviewUpkeep: { ...pref, [actor]: false } }, localAction);
      // Only an AFFORDABLE upkeep is decided by the preference; an unaffordable
      // one is chosen by hand whatever it says.
      if (probe !== state && probe.upkeepPending !== true) {
        const next = entries[i + 1];
        const automatic = next !== undefined && next.kind === 'upkeep' && next.player === actor && next.turnNumber === e.turnNumber && next.automatic;
        if (pref[actor] === automatic) {
          pref[actor] = !automatic;
          if (actionIndex >= plan.inferBefore) {
            notes.push(`${where}: ${actor}'s upkeep review preference was inferred ${!automatic ? 'on' : 'off'} inside the raw command log's window without a logged toggle`);
          }
          reviewInferred++;
        }
      }
    }
    let reviewStep: Record<PlayerId, boolean> | undefined;
    if (pref.white !== before.white || pref.black !== before.black) {
      state = { ...state, reviewUpkeep: { ...pref } };
      reviewStep = { ...pref };
      reviewToggles++;
    }
    if (!isLegalAction(state, localAction, actor)) {
      refuse(where, `the inferred ${inferred.action.type} (${JSON.stringify(inferred.action)}) is illegal for ${actor} T${state.turn.turnNumber} in phase ${state.turn.phase}${state.upkeepPending ? ' with upkeep pending' : ''}`);
    }
    const after = applyAction(state, localAction);
    if (after === state) refuse(where, `the canonical engine refused the inferred ${inferred.action.type} it reported legal`);
    const generated = describeTransition(state, localAction, after);

    // Match every generated event against the next recorded one.
    let revision: number | null = null;
    for (let k = 0; k < generated.length; k++) {
      const g = generated[k];
      const r = entries[i + k];
      const at = r === undefined ? `${W}: after ${describeEntry(entries[entries.length - 1])}` : `${W}: ${describeEntry(r)}`;
      if (r === undefined) refuse(at, `the rebuilt ${inferred.action.type} also produces a ${g.kind} event ("${g.notation}") that the history does not record`);
      if (r.kind === 'result' && SERVER_VERDICTS.has(r.reason) && g.kind !== 'result') {
        refuse(at, `the rebuilt ${inferred.action.type} produces a ${g.kind} event ("${g.notation}") where the history records the server's ${r.reason} verdict`);
      }
      const rebuiltCanon = canonical(g, x => x);
      const recordedCanon = canonical(r, id => ids.local(id, at));
      const diff = firstDifference(rebuiltCanon, recordedCanon);
      if (diff !== null) {
        refuse(at, `the rebuilt ${inferred.action.type} disagrees with the recorded ${r.kind} event at ${diff.path}: rebuilt ${JSON.stringify(diff.rebuilt)}, recorded ${JSON.stringify(diff.recorded)}`);
      }
      if (g.notation !== r.notation || g.description !== r.description) {
        displayDiffs.push(`${at}: display text differs (rebuilt "${g.notation}" / "${g.description}")`);
      }
      if (r.positionTurn !== undefined && (r.positionTurn.player !== after.turn.currentPlayer || r.positionTurn.turnNumber !== after.turn.turnNumber)) {
        refuse(at, `recorded positionTurn ${r.positionTurn.player} T${r.positionTurn.turnNumber}, the rebuild leaves ${after.turn.currentPlayer} T${after.turn.turnNumber} on move`);
      }
      if (revision === null) revision = r.revision;
      else if (r.revision !== revision) refuse(at, `one ${inferred.action.type} produced events recorded under two revisions (${revision}, ${r.revision})`);
      events.push(g);
    }
    if (generated.length === 0) {
      silentInARow++;
      if (silentInARow > 1) refuse(where, 'two event-less actions in a row: the history cannot be explaining the rebuild');
    } else {
      silentInARow = 0;
    }
    if (inferred.phaseEnd) inferredPhaseEnds++;
    i += generated.length;

    // The server's-id form is what the file records.
    const recordedAction = mapAction(localAction, id => ids.server(id, where));
    const ply = steps.length;
    steps.push(reviewStep === undefined ? snapshotStep(after, ply, actor, recordedAction) : { ...snapshotStep(after, ply, actor, recordedAction), reviewUpkeep: reviewStep });
    actors.push(actor);
    serverActions.push(recordedAction);
    recordedActions.push({ actor, turn: actorTurn, action: recordedAction, revision });
    state = after;
    noteTurn(state);
  }

  if (reviewToggles > 0) {
    notes.push(`${reviewToggles} upkeep-review preference change(s) carried on replay steps (${reviewToggles - reviewInferred} at the raw command log's SET_UPKEEP_REVIEW position, ${reviewInferred} inferred at the END_ACTION_PHASE whose upkeep they decided)`);
  }
  if (displayDiffs.length > 0) notes.push(`${displayDiffs.length} event(s) matched on every fact but differ in display text; first: ${displayDiffs[0]}`);

  // --- the end --------------------------------------------------------------
  let winner: PlayerId | null;
  let winType: WinType;
  if (serverVerdict !== null) {
    if (serverVerdict.kind !== 'result') throw new Error('unreachable');
    winner = serverVerdict.winner;
    winType = serverVerdict.reason as WinType;
    notes.push(`the game ended on the server's ${serverVerdict.reason} verdict against ${serverVerdict.player}; the final lab position is still playing and the winner is not rules-derived`);
  } else if (state.phase === 'victory') {
    winner = state.winner;
    winType = (state.victoryReason ?? 'elimination') as WinType;
  } else {
    refuse(W, `the history ends without a result: the rebuilt game is still playing (${state.turn.currentPlayer} T${state.turn.turnNumber}, ${state.turn.phase}); convert finished rooms only`);
  }
  checks.push(`${entries.length} history events re-derived through describeTransition and matched field for field`);

  const endState: GameState = serverVerdict === null
    ? state
    : { ...state, phase: 'victory', winner, victoryReason: serverVerdict.kind === 'result' ? serverVerdict.reason : state.victoryReason };
  compareStates(endState, bundle.room.state, ids, `${W}: final position (room snapshot)`, { registerIds: false });
  checks.push('final rebuilt position equals the room snapshot (units, damage, reserves, banks, pending summons, turn, kill clock, result)');

  crossCheckCommandLog(bundle, serverActions, W, checks, notes);
  if (opts.engineSubmissions !== undefined) crossCheckEngine(opts.engineSubmissions, recordedActions, opts.engineSeat, winner, W, checks, notes);

  return {
    steps,
    actors,
    events,
    final: state,
    winner,
    winType,
    inferredPhaseEnds,
    turnsBySide,
    materialCurve,
    serverActionCount: serverActions.length,
  };
}

/**
 * Where the upkeep review preference changes. `exact` comes from the raw
 * command log's `SET_UPKEEP_REVIEW` commands (applied before the action at that
 * index); outside the log's window the change is inferred at the
 * `END_ACTION_PHASE` whose upkeep it decided. `inferBefore` is the log window's
 * first action index (an inference at or after it is noted).
 */
interface ReviewPlan {
  exact: Map<number, { player: PlayerId; enabled: boolean }[]>;
  inferBefore: number;
}

/** The exact toggle positions, given how many actions the whole game has. */
function reviewPlanFromLog(bundle: RoomBundle, totalActions: number): ReviewPlan | null {
  const log = bundle.room.history ?? [];
  const all = log.flatMap(h => h.actions.map(a => ({ player: h.player, action: a })));
  if (all.some(a => a.action.type === 'UNDO')) return null;
  const flatLen = all.filter(a => a.action.type !== 'SET_UPKEEP_REVIEW').length;
  const windowStart = totalActions - flatLen;
  if (windowStart < 0) return null;
  const exact = new Map<number, { player: PlayerId; enabled: boolean }[]>();
  let k = 0;
  for (const { player, action } of all) {
    if (action.type === 'SET_UPKEEP_REVIEW') {
      const at = windowStart + k;
      exact.set(at, [...(exact.get(at) ?? []), { player, enabled: action.enabled === true }]);
    } else {
      k++;
    }
  }
  return { exact, inferBefore: windowStart };
}

/** Picks the canonical action the next recorded event implies. */
function inferAction(state: GameState, e: MoveHistoryEntry, where: string): { action: AIAction; phaseEnd: boolean } {
  const mover = state.turn.currentPlayer;
  const turn = state.turn.turnNumber;
  const phase = state.turn.phase;
  const inPrepare = phase === 'place' && !state.upkeepPending;
  const handOff = (why: string): { action: AIAction; phaseEnd: boolean } => {
    if (!inPrepare) {
      refuse(where, `${why}, which needs ${mover}'s hand-off (END_PLACE_PHASE), but the rebuild is in ${phase}${state.upkeepPending ? ' with upkeep pending' : ''} — an action-phase end would have recorded a mining event first`);
    }
    return { action: { type: 'END_PLACE_PHASE' }, phaseEnd: true };
  };

  if (e.kind === 'summoning') return handOff(`arrivals for ${e.player} T${e.turnNumber}`);
  if (e.kind === 'result') {
    if (e.reason === 'resignation') return { action: { type: 'RESIGN' }, phaseEnd: false };
    if (phase === 'action' && !state.upkeepPending) return { action: { type: 'END_ACTION_PHASE' }, phaseEnd: true };
    return handOff(`a ${e.reason} result with nothing left to produce it`);
  }
  if (e.player !== mover || e.turnNumber !== turn) return handOff(`an event of ${e.player} T${e.turnNumber} while ${mover} T${turn} is on move`);

  switch (e.kind) {
    case 'move':
      return { action: { type: 'MOVE', unitId: e.unit.id, to: parseSquare(e.to, where) }, phaseEnd: false };
    case 'attack':
      return { action: { type: 'ATTACK', unitId: e.unit.id, targetPosition: parseSquare(e.target.square, where) }, phaseEnd: false };
    case 'purchase':
      return { action: { type: 'BUY_UNIT', definitionId: e.unit.definitionId, position: parseSquare(e.unit.square, where) }, phaseEnd: false };
    case 'promotion':
      return { action: { type: 'PROMOTE_UNIT', unitId: e.unit.id }, phaseEnd: false };
    case 'mining':
      return { action: { type: 'END_ACTION_PHASE' }, phaseEnd: true };
    case 'upkeep':
      if (e.automatic) refuse(where, 'an automatic upkeep event with no END_ACTION_PHASE before it');
      if (!state.upkeepPending) {
        refuse(where, `a chosen upkeep payment (released ${e.released.length}) where the rebuild settled upkeep automatically; a review-preference release cannot be represented in a lab replay`);
      }
      return { action: { type: 'PAY_UPKEEP', keepUnitIds: e.kept.map(u => u.id) }, phaseEnd: false };
  }
}

// --- whole-state comparison -------------------------------------------------

function compareStates(rebuilt: GameState, recorded: GameState, ids: IdBridge, where: string, opts: { registerIds: boolean }): void {
  const localId = (id: string): string => ids.local(id, where);
  const unitLine = (u: GameState['board']['units'][number], id: string) =>
    `${id}|${u.owner}|${u.definitionId}|${u.position.x},${u.position.y}|dmg${u.damageTaken}`;
  const rebuiltUnits = rebuilt.board.units.map(u => unitLine(u, u.id)).sort();
  const recordedUnits = recorded.board.units.map(u => unitLine(u, opts.registerIds || STAMPED_ID.test(u.id) ? localId(u.id) : u.id)).sort();
  const d = firstDifference(rebuiltUnits, recordedUnits, 'units');
  if (d !== null) refuse(where, `units differ\n  rebuilt : ${rebuiltUnits.join(' ')}\n  recorded: ${recordedUnits.join(' ')}`);
  const cells = (s: GameState) => s.board.cells.flat().map(c => c.resourceLayers);
  const dc = firstDifference(cells(rebuilt), cells(recorded), 'reserves');
  if (dc !== null) refuse(where, `board reserves differ at ${dc.path}: rebuilt ${String(dc.rebuilt)}, recorded ${String(dc.recorded)}`);
  const pending = (s: GameState) => (s.pendingSummons ?? []).map(p => `${p.id}|${p.owner}|${p.definitionId}|${p.position.x},${p.position.y}|${p.cost}`).sort();
  const dp = firstDifference(pending(rebuilt), pending(recorded), 'pendingSummons');
  if (dp !== null) refuse(where, `pending summons differ\n  rebuilt : ${pending(rebuilt).join(' ')}\n  recorded: ${pending(recorded).join(' ')}`);
  for (const p of ['white', 'black'] as PlayerId[]) {
    const a = rebuilt.players[p];
    const b = recorded.players[p];
    if (a.resources !== b.resources || a.resourcesGained !== b.resourcesGained) {
      refuse(where, `${p} bank differs: rebuilt ${a.resources} (mined ${a.resourcesGained}), recorded ${b.resources} (mined ${b.resourcesGained})`);
    }
  }
  const scalar = (s: GameState) => ({
    phase: s.phase,
    winner: s.winner ?? null,
    victoryReason: s.victoryReason ?? null,
    currentPlayer: s.turn.currentPlayer,
    turnNumber: s.turn.turnNumber,
    turnPhase: s.turn.phase,
    actionsRemaining: s.turn.actionsRemaining,
    killClock: s.inactivityPlies ?? 0,
    upkeepPending: s.upkeepPending === true,
    blackCrystalHandicap: s.blackCrystalHandicap ?? 0,
    ruleset: s.ruleset,
  });
  const ds = firstDifference(scalar(rebuilt), scalar(recorded));
  if (ds !== null) refuse(where, `${ds.path} differs: rebuilt ${JSON.stringify(ds.rebuilt)}, recorded ${JSON.stringify(ds.recorded)}`);
}

// --- cross-checks -----------------------------------------------------------

function sameAction(a: AIAction, b: { type: string } & Record<string, unknown>): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'PAY_UPKEEP') {
    const keep = (b.keepUnitIds as string[] | undefined) ?? [];
    return JSON.stringify([...a.keepUnitIds].sort()) === JSON.stringify([...keep].sort());
  }
  return firstDifference(canonical(a, x => x), canonical(b, x => x)) === null;
}

/**
 * The snapshot's `history` is the server's raw log of the last ≤ 100 commands
 * (`server/rooms.ts applyCommand`): the exact applied action lists, phase ends
 * included. Concatenated, they must equal the tail of the inferred sequence —
 * which checks every phase end this tool inferred inside that window.
 */
function crossCheckCommandLog(bundle: RoomBundle, inferred: AIAction[], W: string, checks: string[], notes: string[]): void {
  const log = bundle.room.history ?? [];
  const flat = log.flatMap(h => h.actions).filter(a => a.type !== 'SET_UPKEEP_REVIEW');
  if (flat.some(a => a.type === 'UNDO')) {
    notes.push('the raw command log contains UNDO; the command-log cross-check was skipped (undone events are already excluded from the history)');
    return;
  }
  if (flat.length > inferred.length) refuse(W, `the raw command log holds ${flat.length} actions, more than the ${inferred.length} inferred`);
  const tail = inferred.slice(inferred.length - flat.length);
  for (let k = 0; k < flat.length; k++) {
    if (!sameAction(tail[k], flat[k])) {
      refuse(W, `raw command log disagrees at its action ${k} (of ${flat.length}, first logged revision ${log[0]?.revision}): logged ${JSON.stringify(flat[k])}, inferred ${JSON.stringify(tail[k])}`);
    }
  }
  const covered = log.length > 0 ? `revisions ${log[0].revision}-${log[log.length - 1].revision}` : 'no revisions';
  checks.push(`raw command log (${covered}, ${flat.length} actions${flat.length === inferred.length ? ', the whole game' : `, the last ${flat.length} of ${inferred.length}`}) equals the inferred actions, phase ends included`);
}

/** One applied action, with the revision of the events it produced (null when it produced none). */
interface PlayedAction {
  actor: PlayerId;
  turn: number;
  action: AIAction;
  revision: number | null;
}

/**
 * The engine seat's own submissions must equal what the rebuild says it
 * played. Each submission carries the revision it produced, and every engine
 * turn produces at least one event (its END_ACTION_PHASE mines), so a
 * submission is matched to the rebuilt turn whose events carry its revision
 * and compared action for action, phase ends included. A turn the log has no
 * submission for (the runner's `recovered-submission` after a restart logs the
 * request id, not the actions) is reported as unverified here — the events,
 * the final position and the raw command log still cover it.
 */
function crossCheckEngine(
  submissions: EngineSubmission[],
  played: PlayedAction[],
  seat: PlayerId,
  winner: PlayerId | null,
  W: string,
  checks: string[],
  notes: string[],
): void {
  const turns: { turn: number; actions: AIAction[]; revisions: Set<number> }[] = [];
  for (const p of played) {
    if (p.actor !== seat) continue;
    let t = turns[turns.length - 1];
    if (t === undefined || t.turn !== p.turn) {
      t = { turn: p.turn, actions: [], revisions: new Set() };
      turns.push(t);
    }
    t.actions.push(p.action);
    if (p.revision !== null) t.revisions.add(p.revision);
  }
  const byTurn = new Map<number, EngineSubmission[]>();
  for (const sub of submissions) {
    const t = turns.find(x => x.revisions.has(sub.revision));
    if (t === undefined) refuse(W, `the engine's submission producing revision ${sub.revision} matches no rebuilt ${seat} turn`);
    byTurn.set(t.turn, [...(byTurn.get(t.turn) ?? []), sub]);
  }
  let compared = 0;
  const unverified: number[] = [];
  for (const t of turns) {
    const subs = byTurn.get(t.turn);
    if (subs === undefined) {
      unverified.push(t.turn);
      continue;
    }
    const submitted = subs.flatMap(sub => sub.actions);
    const n = Math.min(submitted.length, t.actions.length);
    for (let k = 0; k < n; k++) {
      if (!sameAction(t.actions[k], submitted[k] as AIAction & Record<string, unknown>)) {
        refuse(W, `engine log disagrees on ${seat} T${t.turn} at action ${k}: submitted ${JSON.stringify(submitted[k])}, rebuilt ${JSON.stringify(t.actions[k])}`);
      }
    }
    if (t.actions.length > submitted.length) refuse(W, `the rebuild has ${t.actions.length} ${seat} actions on T${t.turn} but the engine submitted ${submitted.length}`);
    if (submitted.length > t.actions.length) {
      // `applyCommand` drops the rest of a command after a proven home checkmate.
      if (winner === null || t !== turns[turns.length - 1]) {
        refuse(W, `the engine submitted ${submitted.length} actions on T${t.turn} but the rebuild applied ${t.actions.length}, and the game did not end in that command`);
      }
      notes.push(`the engine's last submission (T${t.turn}) was cut ${submitted.length - t.actions.length} action(s) short by the game ending`);
    }
    compared += t.actions.length;
  }
  if (unverified.length > 0) {
    notes.push(`the engine log holds no submission for ${seat} turn(s) ${unverified.join(', ')} (a restarted runner logs a recovered request without its actions); those turns rest on the events, the final position and the raw command log`);
  }
  checks.push(`engine submission log (${submissions.length} submissions, ${compared} actions over ${turns.length - unverified.length} of ${turns.length} ${seat} turns) equals the rebuilt actions, matched by revision`);
}

// --- stats ------------------------------------------------------------------

function gameStats(
  steps: ReplayStep[],
  actors: PlayerId[],
  events: MoveEvent[],
  labels: Record<PlayerId, string>,
  final: GameState,
): Record<PlayerId, PlayerGameStats> {
  const out = {} as Record<PlayerId, PlayerGameStats>;
  for (const p of ['white', 'black'] as PlayerId[]) {
    const other: PlayerId = p === 'white' ? 'black' : 'white';
    const tierUsage: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const elementPurchased: Record<string, number> = {};
    let placed = 0;
    let promotions = 0;
    let upkeepPaid = 0;
    for (const e of events) {
      if (e.player !== p) continue;
      if (e.kind === 'purchase') {
        placed++;
        const def = getUnitDefinition(e.unit.definitionId);
        tierUsage[def.tier as 1 | 2 | 3 | 4]++;
        elementPurchased[def.element] = (elementPurchased[def.element] ?? 0) + 1;
      } else if (e.kind === 'promotion') {
        promotions++;
        tierUsage[getUnitDefinition(e.unit.definitionId).tier as 1 | 2 | 3 | 4]++;
      } else if (e.kind === 'upkeep') {
        upkeepPaid += e.paid;
      }
    }
    const kills = (by: PlayerId) => events.filter(e => e.kind === 'attack' && e.killed && e.player === by).length;
    const turns = new Set<number>();
    for (let k = 1; k < steps.length; k++) if (actors[k] === p) turns.add(steps[k].turn);
    const ps = final.players[p];
    out[p] = {
      bot: labels[p],
      upkeepPaid,
      finalResources: ps.resources,
      resourcesGained: ps.resourcesGained,
      resourcesSpent: ps.resourcesGained - ps.resources,
      finalPendingCost: (final.pendingSummons ?? []).filter(s => s.owner === p).reduce((n, s) => n + s.cost, 0),
      finalMaterial: final.board.units.filter(u => u.owner === p).reduce((n, u) => n + getUnitDefinition(u.definitionId).cost, 0),
      unitsPlaced: placed,
      promotions,
      tierUsage,
      elementPurchased,
      unitsLost: kills(other),
      unitsKilled: kills(p),
      illegalActions: 0,
      plies: actors.slice(1).filter(a => a === p).length,
      turnsTaken: turns.size,
    };
  }
  return out;
}

// --- CLI --------------------------------------------------------------------

interface Manifest {
  gameId: string;
  roomId: string;
  blackCrystalHandicap: number;
  llmSeat: PlayerId;
  engineSeat: PlayerId;
  cliModel?: string;
  model?: string;
  campaign?: string;
  winner?: PlayerId | null;
  victoryReason?: string;
  startedAt?: string;
  finishedAt?: string;
  engine?: { profile?: string; rulesId?: string; sourceSha256?: string; seed?: number; deadlineMs?: number };
}

export function readManifest(gameDir: string): Manifest {
  const file = path.join(gameDir, 'manifest.json');
  if (!fs.existsSync(file)) throw new Error(`${gameDir}: no manifest.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
}

/** `engine/engine-seat.jsonl`: accepted submissions and per-turn search wall. */
export function readEngineLog(gameDir: string): { submissions: EngineSubmission[]; turnMs: Map<number, number>; allowanceMs: number | null } | null {
  const file = path.join(gameDir, 'engine', 'engine-seat.jsonl');
  if (!fs.existsSync(file)) return null;
  const submissions: EngineSubmission[] = [];
  const turnMs = new Map<number, number>();
  let duplicateTurn = false;
  let allowanceMs: number | null = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const row = JSON.parse(line) as { event: string; revision?: number; actions?: AIAction[]; turn?: number; elapsedMs?: number; allowanceMs?: number };
    if (row.event === 'submitted' && Array.isArray(row.actions)) submissions.push({ revision: row.revision ?? -1, actions: row.actions });
    if (row.event === 'search' && typeof row.turn === 'number' && typeof row.elapsedMs === 'number') {
      if (turnMs.has(row.turn)) duplicateTurn = true;
      turnMs.set(row.turn, row.elapsedMs);
      if (typeof row.allowanceMs === 'number') allowanceMs = row.allowanceMs;
    }
  }
  return { submissions, turnMs: duplicateTurn ? new Map() : turnMs, allowanceMs };
}

export function optionsFromManifest(m: Manifest, gameDir: string | null): ConvertOptions {
  const log = gameDir === null ? null : readEngineLog(gameDir);
  const rulesId = m.engine?.rulesId;
  return {
    engineSeat: m.engineSeat,
    engineLabel: `hard@${m.engine?.profile ?? 'desktop'}`,
    opponentLabel: `llm@${m.cliModel ?? m.model ?? 'unknown'}`,
    handicap: m.blackCrystalHandicap,
    expectedWinner: m.winner,
    expectedReason: m.victoryReason,
    rulesVersion: rulesId === undefined ? undefined : (rulesId as RulesVersion),
    gameId: m.gameId,
    campaign: m.campaign ?? null,
    engineHash: m.engine?.sourceSha256,
    seed: m.engine?.seed,
    startedAt: m.startedAt,
    finishedAt: m.finishedAt,
    engineSubmissions: log?.submissions,
    engineTurnMs: log !== null && log.turnMs.size > 0 ? log.turnMs : undefined,
    engineAllowanceMs: log?.allowanceMs ?? undefined,
  };
}

/** Writes the replay atomically, then proves `analyze/replay.ts` accepts it. */
export function writeAndVerify(conversion: Conversion, outFile: string): { plies: number; turns: number; notes: string[] } {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const tmp = `${outFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(conversion.replay)}\n`);
  try {
    const loaded = loadReplay(tmp);
    const recon = reconstruct({ ...loaded, fileId: path.basename(outFile).replace(/\.json$/i, '') });
    if (recon.winner !== conversion.report.winner && conversion.report.winType !== 'timeout' && conversion.report.winType !== 'abandoned') {
      throw new RoomReplayError(`${outFile}: analyze/replay.ts rebuilds winner ${String(recon.winner)}, the conversion says ${String(conversion.report.winner)}`);
    }
    fs.renameSync(tmp, outFile);
    return { plies: recon.plies, turns: recon.turns.length, notes: recon.notes };
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

interface CliArgs {
  room: string | null;
  bundle: string | null;
  gameDir: string | null;
  campaign: string | null;
  lossesOnly: boolean;
  engineSeat: PlayerId | null;
  handicap: number | null;
  engineLabel: string | null;
  out: string | null;
  outDir: string | null;
  server: string;
  refetch: boolean;
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
  const a: CliArgs = { room: null, bundle: null, gameDir: null, campaign: null, lossesOnly: false, engineSeat: null, handicap: null, engineLabel: null, out: null, outDir: null, server: DEFAULT_SERVER, refetch: false };
  for (let k = 0; k < argv.length; k++) {
    const flag = argv[k];
    const next = (): string => {
      const v = argv[++k];
      if (v === undefined) throw new Error(`${flag}: missing value`);
      return v;
    };
    switch (flag) {
      case '--room': a.room = next(); break;
      case '--bundle': a.bundle = next(); break;
      case '--game-dir': a.gameDir = next(); break;
      case '--campaign': a.campaign = next(); break;
      case '--losses-only': a.lossesOnly = true; break;
      case '--all': a.lossesOnly = false; break;
      case '--engine-seat': {
        const v = next();
        if (v !== 'white' && v !== 'black') throw new Error(`--engine-seat: expected white or black, got ${v}`);
        a.engineSeat = v;
        break;
      }
      case '--handicap': a.handicap = Number(next()); break;
      case '--engine': a.engineLabel = next(); break;
      case '--out': a.out = next(); break;
      case '--out-dir': a.outDir = next(); break;
      case '--server': a.server = next(); break;
      case '--refetch': a.refetch = true; break;
      default: throw new Error(`unknown argument ${flag}`);
    }
  }
  const modes = [a.room, a.bundle, a.gameDir, a.campaign].filter(m => m !== null).length;
  if (modes !== 1) throw new Error('exactly one of --room <id>, --bundle <file>, --game-dir <dir> or --campaign <dir> is required');
  if ((a.room !== null || a.bundle !== null) && a.engineSeat === null) throw new Error('--room/--bundle need --engine-seat white|black');
  if ((a.room !== null || a.bundle !== null) && a.out === null) throw new Error('--room/--bundle need --out <file>');
  return a;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

/** `<campaign>/wave-1` -> `lab/results/llm-wave-1/replays`: outside the campaign
 * directory, which this tool never writes. */
export function defaultReplaysDir(waveDir: string): string {
  return path.join(REPO_ROOT, 'lab/results', `llm-${path.basename(path.resolve(waveDir))}`, 'replays');
}

function roomsDirFor(replaysDir: string): string {
  return path.join(path.dirname(path.resolve(replaysDir)), 'rooms');
}

async function bundleFor(roomId: string, cacheFile: string | null, args: CliArgs): Promise<RoomBundle> {
  if (cacheFile !== null && fs.existsSync(cacheFile) && !args.refetch) return readBundle(cacheFile);
  const bundle = await fetchRoomBundle(roomId, { server: args.server, log: line => console.error(`  ${line}`) });
  if (cacheFile !== null) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, `${JSON.stringify(bundle)}\n`);
  }
  return bundle;
}

function printResult(file: string, c: Conversion, v: { plies: number; turns: number }): void {
  const r = c.report;
  console.log(`${r.gameId}: ${r.events} events -> ${r.actions} actions (${r.inferredPhaseEnds} inferred phase ends), ${r.winType}, winner ${String(r.winner)}, final turn ${r.finalTurn}; analyze/replay.ts rebuilds ${v.plies} plies / ${v.turns} turns`);
  for (const check of r.checks) console.log(`  ok   ${check}`);
  for (const note of r.notes) console.log(`  note ${note}`);
  console.log(`  wrote ${path.relative(process.cwd(), file)}`);
}

async function convertGameDir(gameDir: string, args: CliArgs, outFile: string | null, outDir: string): Promise<{ file: string; conversion: Conversion }> {
  const manifest = readManifest(gameDir);
  const opts = optionsFromManifest(manifest, gameDir);
  if (args.engineLabel !== null) opts.engineLabel = args.engineLabel;
  const file = outFile ?? path.join(outDir, `${manifest.gameId}.json`);
  const bundle = await bundleFor(manifest.roomId, path.join(roomsDirFor(path.dirname(file)), `${manifest.gameId}.room.json`), args);
  const conversion = convertRoom(bundle, opts);
  const v = writeAndVerify(conversion, file);
  printResult(file, conversion, v);
  return { file, conversion };
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`hard:analyze:from-room: ${err instanceof Error ? err.message : String(err)}`);
    console.error('usage: node --import tsx lab/hard-ai/analyze/from-room.ts --room <id> --engine-seat white|black [--handicap <n>] [--engine hard@<profile>] --out <file>');
    console.error('       node --import tsx lab/hard-ai/analyze/from-room.ts --bundle <file.room.json> --engine-seat white|black --out <file>');
    console.error('       node --import tsx lab/hard-ai/analyze/from-room.ts --game-dir <waveGameDir> [--out <file>]');
    console.error('       node --import tsx lab/hard-ai/analyze/from-room.ts --campaign <waveDir> [--losses-only] [--out-dir <dir>]');
    process.exitCode = 2;
    return;
  }
  if (args.room !== null || args.bundle !== null) {
    const out = path.resolve(args.out as string);
    const bundle = args.bundle !== null
      ? readBundle(args.bundle)
      : await bundleFor(args.room as string, path.join(roomsDirFor(path.dirname(out)), `${path.basename(out).replace(/\.json$/i, '')}.room.json`), args);
    const conversion = convertRoom(bundle, {
      engineSeat: args.engineSeat as PlayerId,
      engineLabel: args.engineLabel ?? undefined,
      handicap: args.handicap ?? undefined,
      gameId: path.basename(out).replace(/\.json$/i, ''),
    });
    printResult(out, conversion, writeAndVerify(conversion, out));
    return;
  }

  if (args.gameDir !== null) {
    const gameDir = path.resolve(args.gameDir);
    await convertGameDir(gameDir, args, args.out === null ? null : path.resolve(args.out), path.resolve(args.outDir ?? defaultReplaysDir(path.dirname(path.dirname(gameDir)))));
    return;
  }

  const waveDir = path.resolve(args.campaign as string);
  const gamesDir = path.join(waveDir, 'games');
  const outDir = path.resolve(args.outDir ?? defaultReplaysDir(waveDir));
  if (outDir.startsWith(waveDir + path.sep)) throw new Error(`--out-dir ${outDir} is inside the campaign directory, which is read-only to this tool`);
  const dirs = fs.readdirSync(gamesDir).filter(d => fs.existsSync(path.join(gamesDir, d, 'manifest.json'))).sort();
  const converted: string[] = [];
  const skipped: string[] = [];
  const refused: string[] = [];
  for (const d of dirs) {
    const m = readManifest(path.join(gamesDir, d));
    const hardLost = m.winner !== null && m.winner !== undefined && m.winner !== m.engineSeat;
    if (args.lossesOnly && !hardLost) {
      skipped.push(`${d} (Hard ${m.winner === m.engineSeat ? 'won' : 'drew or unfinished'})`);
      continue;
    }
    try {
      await convertGameDir(path.join(gamesDir, d), args, null, outDir);
      converted.push(d);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      refused.push(`${d}: ${msg}`);
      console.error(`${d}: REFUSED ${msg}`);
    }
  }
  console.log(`\nconverted ${converted.length}: ${converted.join(', ') || '(none)'}`);
  console.log(`skipped ${skipped.length}${skipped.length > 0 ? `: ${skipped.join(', ')}` : ''}`);
  console.log(`refused ${refused.length}`);
  for (const r of refused) console.log(`  ${r}`);
  if (refused.length > 0) process.exitCode = 1;
}

const INVOKED_DIRECTLY = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (INVOKED_DIRECTLY) {
  void main().catch((err: unknown) => {
    console.error(`hard:analyze:from-room: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  });
}
