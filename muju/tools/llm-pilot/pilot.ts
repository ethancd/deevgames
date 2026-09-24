/**
 * Shared pilot table, path layout and pure scheduling logic for the LLM-vs-Hard
 * pilot (SPEC.md). Component D (dispatch.ts, publish.ts) is the only consumer
 * today; Components B/C may import the path helpers too.
 *
 * Kept dependency-free of the live server / child processes so its scheduling
 * logic (`nextAdmissible`, `buildSchedule`) is unit-testable without a network
 * or a spawned CLI.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MAX_BLACK_CRYSTAL_HANDICAP } from '../../src/game/rules';

export type ModelId = 'sonnet' | 'luna' | 'sol' | 'astra' | 'opus' | 'fable';
export type Family = 'claude' | 'codex';
export type ToolTier = 'bare' | 'harnessed' | 'centaur' | 'tool-builder';
export type Effort = 'low' | 'medium' | 'high' | 'max';
export type Seat = 'white' | 'black';
/** A ticket (pair or single) id: letters/digits only, since `-` separates it from the leg. */
export type PairId = string;
export type LegKey = 'W' | 'B'; // which seat the LLM occupies, not white/black literally
export type GameId = `${string}-${LegKey}`;
export interface TimeControl { delaySeconds: number; bankSeconds: number }

/** One scheduled ticket: a seat-swapped pair (legs W and B) or a single leg. Wave files
 * (`<campaign>/wave.json`) list these; the pilot used the fixed `PILOT_TABLE` below. */
export interface Pair {
  id: PairId;
  model: ModelId;
  blackCrystalHandicap: number;
  toolTier: ToolTier;
  effort: Effort;
  /** Legs to play, in admission order. Default both, W first. */
  legs?: LegKey[];
  /** Investigation brief shown to the player. Default: a plain "play to win" line. */
  brief?: string;
  /** Room clock "delay/bank" for this ticket. Default: MUJU_PILOT_CLOCK. */
  clock?: string;
  /** Set to a reason to keep the ticket out of admission (e.g. an investigation awaiting its brief). */
  hold?: string;
  /** Operator note: why this ticket exists / what changed. Recorded, never shown to the player. */
  note?: string;
}

/** The pilot pair schedule (claude-pilot-prompt.md). Order matters: it is the
 * admission priority within each model's queue. Used when the campaign dir has no wave.json. */
export const PILOT_TABLE: readonly Pair[] = [
  { id: 'P01', model: 'luna', blackCrystalHandicap: 1, toolTier: 'bare', effort: 'low' },
  { id: 'P02', model: 'sonnet', blackCrystalHandicap: 2, toolTier: 'bare', effort: 'low' },
  { id: 'P03', model: 'luna', blackCrystalHandicap: 3, toolTier: 'harnessed', effort: 'medium' },
  { id: 'P04', model: 'sonnet', blackCrystalHandicap: 4, toolTier: 'harnessed', effort: 'medium' },
  { id: 'P05', model: 'luna', blackCrystalHandicap: 5, toolTier: 'centaur', effort: 'high' },
  { id: 'P06', model: 'sonnet', blackCrystalHandicap: 6, toolTier: 'centaur', effort: 'high' },
  { id: 'P07', model: 'luna', blackCrystalHandicap: 9, toolTier: 'tool-builder', effort: 'high' },
  { id: 'P08', model: 'sonnet', blackCrystalHandicap: 12, toolTier: 'tool-builder', effort: 'high' },
];

const MODELS: readonly ModelId[] = ['sonnet', 'luna', 'sol', 'astra', 'opus', 'fable'];
const TIERS: readonly ToolTier[] = ['bare', 'harnessed', 'centaur', 'tool-builder'];
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'max'];
/** Throws on anything the runner could not play exactly as written (never coerces). */
export function validateTickets(tickets: readonly Pair[]): void {
  const seen = new Set<string>();
  for (const t of tickets) {
    if (!/^[A-Za-z0-9]+$/.test(t.id)) throw new Error(`Ticket id "${t.id}" must be letters/digits only.`);
    if (seen.has(t.id)) throw new Error(`Duplicate ticket id "${t.id}".`);
    seen.add(t.id);
    if (!MODELS.includes(t.model)) throw new Error(`Ticket ${t.id}: unknown model "${t.model}".`);
    if (!TIERS.includes(t.toolTier)) throw new Error(`Ticket ${t.id}: unknown tool tier "${t.toolTier}".`);
    if (!EFFORTS.includes(t.effort)) throw new Error(`Ticket ${t.id}: unknown effort "${t.effort}".`);
    if (!Number.isInteger(t.blackCrystalHandicap) || t.blackCrystalHandicap < 0 || t.blackCrystalHandicap > MAX_BLACK_CRYSTAL_HANDICAP) {
      throw new Error(`Ticket ${t.id} handicap ${t.blackCrystalHandicap} is outside 0..MAX_BLACK_CRYSTAL_HANDICAP (${MAX_BLACK_CRYSTAL_HANDICAP}).`);
    }
    const legs = t.legs ?? ['W', 'B'];
    if (legs.length === 0 || legs.some(l => l !== 'W' && l !== 'B') || new Set(legs).size !== legs.length) throw new Error(`Ticket ${t.id}: legs must be a non-empty subset of W/B.`);
    if (t.clock !== undefined) parseClock(t.clock);
  }
}
validateTickets(PILOT_TABLE);

/** The current campaign's tickets: `<campaign>/wave.json` when present, else the pilot table.
 * Re-read on every call (cheap, and lets the operator add or re-brief pending tickets mid-wave). */
export function loadTickets(): Pair[] {
  const wave = readJson<{ tickets: Pair[] }>(waveJsonPath());
  const tickets = wave ? wave.tickets : [...PILOT_TABLE];
  validateTickets(tickets);
  return tickets;
}
export function pairById(id: PairId): Pair {
  const pair = loadTickets().find(p => p.id === id);
  if (!pair) throw new Error(`Unknown pair id "${id}".`);
  return pair;
}
/** LLM's seat for each leg: W = LLM plays White, B = LLM plays Black. Both legs
 * keep the same crystal grant (a room property, not seat-specific) — only the
 * LLM's seat changes. */
export function llmSeatFor(leg: LegKey): Seat { return leg === 'W' ? 'white' : 'black'; }
export function engineSeatFor(leg: LegKey): Seat { return leg === 'W' ? 'black' : 'white'; }
export function gameId(pairId: PairId, leg: LegKey): GameId { return `${pairId}-${leg}`; }
export function parseGameId(id: GameId): { pairId: PairId; leg: LegKey } {
  const [pairId, leg] = id.split('-') as [PairId, LegKey];
  return { pairId, leg };
}
export const ALL_GAME_IDS: readonly GameId[] = PILOT_TABLE.flatMap(pair => [gameId(pair.id, 'W'), gameId(pair.id, 'B')]);

/** Player display name shown as the LLM seat's in-game name: "Sonnet 5 Low",
 * "Luna 6 Medium", etc. Table so new models/efforts are a one-line addition,
 * per the owner's "Player display names" note in SPEC.md. */
const MODEL_DISPLAY: Record<ModelId, string> = {
  sonnet: 'Sonnet 5', luna: 'Luna 6', sol: 'Sol 6', astra: 'Astra 6', opus: 'Opus 5.5', fable: 'Fable 5.1',
};
/** Full model id strings the player adapters (Component C, `players.ts`)
 * expect — `playerKindForModel` picks the CLI from this exact string. */
export const MODEL_CLI_ID: Record<ModelId, string> = {
  sonnet: 'claude-sonnet-5', luna: 'gpt-6-luna', sol: 'gpt-6-sol', astra: 'gpt-6-astra', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1',
};
/** Which CLI (and subscription) serves each model. */
export const MODEL_FAMILY: Record<ModelId, Family> = {
  sonnet: 'claude', opus: 'claude', fable: 'claude', luna: 'codex', sol: 'codex', astra: 'codex',
};
function titleCase(effort: Effort): string { return effort.charAt(0).toUpperCase() + effort.slice(1); }
export function llmDisplayName(model: ModelId, effort: Effort): string {
  const name = `${MODEL_DISPLAY[model]} ${titleCase(effort)}`;
  if (name.length > 40) throw new Error(`Display name "${name}" exceeds the room's 40-character name limit.`);
  return name;
}
/** The engine seat's existing in-game name (unchanged by this pilot). */
export const ENGINE_DISPLAY_NAME = 'Hard';

/** Public, non-secret identifier for this frozen experiment protocol (matchPolicy.protocolId). */
export const PROTOCOL_ID = 'muju-llm-pilot-2026-09-23';
/** Default room clock for newly admitted games. The 16-game pilot ran at 600s delay / 3600s bank; the
 * owner set 60s / 1800s for later waves (2026-09-23), selected with MUJU_PILOT_CLOCK="60/1800". A ticket
 * may override it (`clock`). Each game records its own clock in manifest.json, so resumed games keep theirs. */
export const PILOT_TIME_CONTROL: TimeControl = parseClock(process.env.MUJU_PILOT_CLOCK) ?? { delaySeconds: 600, bankSeconds: 3600 };
export function parseClock(value?: string): TimeControl | undefined {
  if (!value) return undefined;
  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (!match) throw new Error(`MUJU_PILOT_CLOCK must be "<delaySeconds>/<bankSeconds>", got "${value}".`);
  const [delaySeconds, bankSeconds] = [Number(match[1]), Number(match[2])];
  if (delaySeconds > 600 || bankSeconds < 1 || bankSeconds > 14400) throw new Error('MUJU_PILOT_CLOCK is outside the server limits (delay 0-600, bank 1-14400).');
  return { delaySeconds, bankSeconds };
}
/** Safety ceiling: report truncation rather than let a stuck game run forever. */
export const MAX_PLAYER_TURNS = 200;
/** Live games at once across every model (owner, 2026-09-24: 12). */
export const MAX_LIVE_GAMES = Number(process.env.MUJU_MAX_LIVE ?? 12);
/** Live games at once per CLI family, so both families stay interleaved under the global cap. */
export const FAMILY_CAP = Number(process.env.MUJU_FAMILY_CAP ?? 7);

export type GameLifecycle = 'pending' | 'preparing' | 'live' | 'finished' | 'failed' | 'interrupted';
export interface StatusRecord { state: GameLifecycle; detail?: string; updatedAt: string }

// ---------------------------------------------------------------------------
// Campaign directory layout
// ---------------------------------------------------------------------------

/** Overridable only for tests; production always uses the literal path named
 * in SPEC.md (outside git, shared by all components, in the MAIN checkout —
 * never the worktree — per the operator's "creating files under .../pilot/"
 * carve-out). */
export const CAMPAIGN_DIR = process.env.MUJU_CAMPAIGN_DIR ?? process.env.MUJU_PILOT_CAMPAIGN_DIR
  ?? '/Users/ashkie/src/deevgames/outputs/muju-llm-opponent-campaign-2026-09-23/pilot';

export const scheduleJsonPath = () => join(CAMPAIGN_DIR, 'schedule.json');
export const waveJsonPath = () => join(CAMPAIGN_DIR, 'wave.json');
export const progressMdPath = () => join(CAMPAIGN_DIR, 'progress.md');
export const stopFilePath = () => join(CAMPAIGN_DIR, 'STOP');
export const pidsJsonPath = () => join(CAMPAIGN_DIR, 'pids.json');
export const memoryDir = () => join(CAMPAIGN_DIR, 'memory');
export const experiencesPath = () => join(memoryDir(), 'experiences.jsonl');
export const playbookPath = () => join(memoryDir(), 'playbook.md');
export const publishLockPath = () => join(memoryDir(), '.publish.lock');
export const snapshotDir = (version: number) => join(memoryDir(), 'snapshots', `v${version}`);
export const gameDir = (id: GameId) => join(CAMPAIGN_DIR, 'games', id);
export const secretsDir = (id: GameId) => join(gameDir(id), 'secrets');
export const engineDir = (id: GameId) => join(gameDir(id), 'engine');
export const playerDir = (id: GameId) => join(gameDir(id), 'player');
export const manifestPath = (id: GameId) => join(gameDir(id), 'manifest.json');
export const actionsLogPath = (id: GameId) => join(gameDir(id), 'actions.jsonl');
export const reflectionPath = (id: GameId) => join(gameDir(id), 'reflection.md');
export const statusPath = (id: GameId) => join(gameDir(id), 'status.json');
export const httpLogPath = (id: GameId) => join(gameDir(id), 'http.jsonl');
export const seatSecretPath = (id: GameId) => join(secretsDir(id), 'seat.json');
export const engineConfigPath = (id: GameId) => join(secretsDir(id), 'engine-config.json');
export const engineStatePath = (id: GameId) => join(secretsDir(id), 'engine-state.json');

export function ensureCampaignDirs(): void {
  mkdirSync(CAMPAIGN_DIR, { recursive: true, mode: 0o755 });
  mkdirSync(join(memoryDir(), 'snapshots'), { recursive: true, mode: 0o755 });
  mkdirSync(join(CAMPAIGN_DIR, 'games'), { recursive: true, mode: 0o755 });
}
export function ensureGameDirs(id: GameId): void {
  mkdirSync(gameDir(id), { recursive: true, mode: 0o755 });
  mkdirSync(secretsDir(id), { recursive: true, mode: 0o700 });
  mkdirSync(engineDir(id), { recursive: true, mode: 0o755 });
  mkdirSync(playerDir(id), { recursive: true, mode: 0o755 });
}

/** Atomic write: never leaves a half-written schedule/status/progress file for
 * a concurrent reader (dispatcher's own loop, `--status`, or a person tailing
 * progress.md). */
export function writeFileAtomic(path: string, content: string, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, content, mode !== undefined ? { mode } : undefined);
  renameSync(tmp, path);
}
export function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
export function writeJson(path: string, value: unknown, mode?: number): void {
  writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`, mode);
}
export function readStatus(id: GameId): StatusRecord {
  return readJson<StatusRecord>(statusPath(id)) ?? { state: 'pending', updatedAt: new Date(0).toISOString() };
}
export function writeStatus(id: GameId, state: GameLifecycle, detail?: string): void {
  ensureGameDirs(id);
  writeJson(statusPath(id), { state, ...(detail ? { detail } : {}), updatedAt: new Date().toISOString() } satisfies StatusRecord);
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export interface ScheduleGame {
  gameId: GameId;
  pairId: PairId;
  model: ModelId;
  toolTier: ToolTier;
  effort: Effort;
  blackCrystalHandicap: number;
  llmSeat: Seat;
  engineSeat: Seat;
  /** Absent on pilot-era schedule.json entries (their prompt used a generated line). */
  brief?: string;
  timeControl?: TimeControl;
  hold?: string;
}
export interface Schedule { generatedAt: string; games: ScheduleGame[] }

export function defaultBrief(game: Pick<ScheduleGame, 'pairId' | 'llmSeat' | 'toolTier' | 'effort' | 'blackCrystalHandicap'>): string {
  return `Pair ${game.pairId}: you play ${game.llmSeat} with the ${game.toolTier} tool tier at ${game.effort} effort; Black starts with ${game.blackCrystalHandicap} extra crystals. Play to win.`;
}
export function gamesForTicket(pair: Pair): ScheduleGame[] {
  return (pair.legs ?? ['W', 'B']).map(leg => ({
    gameId: gameId(pair.id, leg), pairId: pair.id, model: pair.model, toolTier: pair.toolTier, effort: pair.effort,
    blackCrystalHandicap: pair.blackCrystalHandicap, llmSeat: llmSeatFor(leg), engineSeat: engineSeatFor(leg),
    ...(pair.brief ? { brief: pair.brief } : {}), timeControl: parseClock(pair.clock) ?? PILOT_TIME_CONTROL,
    ...(pair.hold ? { hold: pair.hold } : {}),
  }));
}
export function buildSchedule(tickets: readonly Pair[] = loadTickets()): Schedule {
  return { generatedAt: new Date().toISOString(), games: tickets.flatMap(gamesForTicket) };
}
export function loadOrInitSchedule(): Schedule {
  return readJson<Schedule>(scheduleJsonPath()) ?? buildSchedule();
}
export function saveSchedule(schedule: Schedule): void { writeJson(scheduleJsonPath(), schedule); }
/**
 * Merges the current tickets into the saved schedule: a game that has left `pending` keeps its
 * saved (frozen) entry, so editing a ticket never changes a game already started; pending games
 * take the ticket's current setup; pending games whose ticket was removed are dropped. Returns the
 * merged schedule and one line per change, for the operator's record.
 */
export function syncSchedule(saved: Schedule | undefined, tickets: readonly Pair[], stateOf: (id: GameId) => GameLifecycle): { schedule: Schedule; changes: string[] } {
  const fresh = buildSchedule(tickets).games;
  const savedById = new Map((saved?.games ?? []).map(g => [g.gameId, g]));
  const changes: string[] = [];
  const games: ScheduleGame[] = [];
  for (const g of fresh) {
    const old = savedById.get(g.gameId);
    savedById.delete(g.gameId);
    if (old && stateOf(g.gameId) !== 'pending') { games.push(old); continue; }
    if (!old) changes.push(`added ${g.gameId}: ${JSON.stringify(g)}`);
    else if (JSON.stringify(old) !== JSON.stringify(g)) changes.push(`changed ${g.gameId}: ${JSON.stringify(old)} -> ${JSON.stringify(g)}`);
    games.push(g);
  }
  for (const [id, old] of savedById) {
    if (stateOf(id) !== 'pending') games.push(old); // started games never leave the record
    else changes.push(`removed pending ${id}`);
  }
  return { schedule: { generatedAt: saved?.generatedAt ?? new Date().toISOString(), games }, changes };
}

// ---------------------------------------------------------------------------
// Admission (pure: takes a state snapshot, returns a decision — no I/O)
// ---------------------------------------------------------------------------

export type StatusSnapshot = Partial<Record<GameId, GameLifecycle>>;

function isActive(state: GameLifecycle): boolean { return state === 'preparing' || state === 'live'; }
function isSettled(state: GameLifecycle): boolean { return state === 'finished' || state === 'failed' || state === 'interrupted'; }

export function activeCount(games: readonly ScheduleGame[], snapshot: StatusSnapshot): number {
  return games.filter(g => isActive(snapshot[g.gameId] ?? 'pending')).length;
}

/**
 * The next game to admit from `games` (one family's or one model's queue, in schedule order), or
 * null. A started pair's remaining leg beats starting a new ticket; within a ticket, legs in their
 * listed order; tickets in schedule order. Held games are skipped. A pair with a
 * `failed`/`interrupted` leg still owes its sibling leg admission; this never re-admits a settled leg.
 */
export function nextAdmissible(games: readonly ScheduleGame[], snapshot: StatusSnapshot): GameId | null {
  const state = (id: GameId) => snapshot[id] ?? 'pending';
  const pairIds = [...new Set(games.map(g => g.pairId))];
  const legsOf = (pairId: PairId) => games.filter(g => g.pairId === pairId);
  const started = pairIds.filter(p => legsOf(p).some(g => state(g.gameId) !== 'pending'));
  for (const pairId of started) {
    for (const g of legsOf(pairId)) if (state(g.gameId) === 'pending' && !g.hold) return g.gameId;
  }
  for (const pairId of pairIds) {
    if (started.includes(pairId)) continue;
    const first = legsOf(pairId).find(g => !g.hold);
    if (first) return first.gameId;
  }
  return null;
}

/** Pure trace of admission order: families alternate one game at a time (codex, claude, ...),
 * each admitted game assumed to settle at once — queue order, not real concurrency (`--dry-run`). */
export function admissionTrace(schedule: Schedule = buildSchedule()): GameId[] {
  const snapshot: StatusSnapshot = {};
  const trace: GameId[] = [];
  for (;;) {
    let admittedAny = false;
    for (const family of ['codex', 'claude'] as const) {
      const next = nextAdmissible(schedule.games.filter(g => MODEL_FAMILY[g.model] === family), snapshot);
      if (next) { trace.push(next); snapshot[next] = 'finished'; admittedAny = true; }
    }
    if (!admittedAny) break;
  }
  return trace;
}

export function allSettled(snapshot: StatusSnapshot, ids: readonly GameId[] = ALL_GAME_IDS): boolean {
  return ids.every(id => isSettled(snapshot[id] ?? 'pending'));
}
export { isActive as gameIsActive, isSettled as gameIsSettled };
