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

export type ModelId = 'sonnet' | 'luna';
export type ToolTier = 'bare' | 'harnessed' | 'centaur' | 'tool-builder';
export type Effort = 'low' | 'medium' | 'high';
export type Seat = 'white' | 'black';
export type PairId = 'P01' | 'P02' | 'P03' | 'P04' | 'P05' | 'P06' | 'P07' | 'P08';
export type LegKey = 'W' | 'B'; // which seat the LLM occupies, not white/black literally
export type GameId = `${PairId}-${LegKey}`;

export interface Pair {
  id: PairId;
  model: ModelId;
  blackCrystalHandicap: number;
  toolTier: ToolTier;
  effort: Effort;
}

/** The pilot pair schedule (claude-pilot-prompt.md). Order matters: it is the
 * admission priority within each model's queue. */
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
for (const pair of PILOT_TABLE) {
  if (pair.blackCrystalHandicap < 0 || pair.blackCrystalHandicap > MAX_BLACK_CRYSTAL_HANDICAP) {
    throw new Error(`Pair ${pair.id} handicap ${pair.blackCrystalHandicap} exceeds MAX_BLACK_CRYSTAL_HANDICAP (${MAX_BLACK_CRYSTAL_HANDICAP}).`);
  }
}
export function pairById(id: PairId): Pair {
  const pair = PILOT_TABLE.find(p => p.id === id);
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
const MODEL_DISPLAY: Record<ModelId, string> = { sonnet: 'Sonnet 5', luna: 'Luna 6' };
/** Full model id strings the player adapters (Component C, `players.ts`)
 * expect — `playerKindForModel` picks the CLI from this exact string. */
export const MODEL_CLI_ID: Record<ModelId, string> = { sonnet: 'claude-sonnet-5', luna: 'gpt-6-luna' };
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
/** Immutable room clocks for every pilot game (SPEC.md Component D). Within the
 * server's custom timeControl bounds (delaySeconds <= 600, bankSeconds <= 14400). */
export const PILOT_TIME_CONTROL = { delaySeconds: 600, bankSeconds: 3600 } as const;
/** Safety ceiling: report truncation rather than let a stuck game run forever. */
export const MAX_PLAYER_TURNS = 200;
/** Two active games per model, four total. */
export const PER_MODEL_CONCURRENCY = 2;

export type GameLifecycle = 'pending' | 'preparing' | 'live' | 'finished' | 'failed' | 'interrupted';
export interface StatusRecord { state: GameLifecycle; detail?: string; updatedAt: string }

// ---------------------------------------------------------------------------
// Campaign directory layout
// ---------------------------------------------------------------------------

/** Overridable only for tests; production always uses the literal path named
 * in SPEC.md (outside git, shared by all components, in the MAIN checkout —
 * never the worktree — per the operator's "creating files under .../pilot/"
 * carve-out). */
export const CAMPAIGN_DIR = process.env.MUJU_PILOT_CAMPAIGN_DIR
  ?? '/Users/ashkie/src/deevgames/outputs/muju-llm-opponent-campaign-2026-09-23/pilot';

export const scheduleJsonPath = () => join(CAMPAIGN_DIR, 'schedule.json');
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
}
export interface Schedule { generatedAt: string; games: ScheduleGame[] }

export function buildSchedule(): Schedule {
  const games: ScheduleGame[] = PILOT_TABLE.flatMap(pair => (['W', 'B'] as const).map(leg => ({
    gameId: gameId(pair.id, leg), pairId: pair.id, model: pair.model, toolTier: pair.toolTier, effort: pair.effort,
    blackCrystalHandicap: pair.blackCrystalHandicap, llmSeat: llmSeatFor(leg), engineSeat: engineSeatFor(leg),
  })));
  return { generatedAt: new Date().toISOString(), games };
}
export function loadOrInitSchedule(): Schedule {
  return readJson<Schedule>(scheduleJsonPath()) ?? buildSchedule();
}
export function saveSchedule(schedule: Schedule): void { writeJson(scheduleJsonPath(), schedule); }

// ---------------------------------------------------------------------------
// Admission (pure: takes a state snapshot, returns a decision — no I/O)
// ---------------------------------------------------------------------------

export type StatusSnapshot = Partial<Record<GameId, GameLifecycle>>;

function isActive(state: GameLifecycle): boolean { return state === 'preparing' || state === 'live'; }
function isSettled(state: GameLifecycle): boolean { return state === 'finished' || state === 'failed' || state === 'interrupted'; }

export function activeCountFor(model: ModelId, snapshot: StatusSnapshot): number {
  return PILOT_TABLE.filter(p => p.model === model)
    .flatMap(p => [gameId(p.id, 'W'), gameId(p.id, 'B')])
    .filter(id => isActive(snapshot[id] ?? 'pending')).length;
}

/**
 * The next game to admit for `model`, or null when its whole queue is either
 * active or settled. Priority (SPEC.md Component D): a started pair's
 * remaining leg beats starting a new pair; within a pair, W before B; pairs
 * in table order. A pair with a `failed`/`interrupted` leg still owes its
 * sibling leg admission — the operator resolves the failure separately
 * (`--resume`/manual retry of the failed one); this function only decides
 * what starts next, never re-admits a settled leg.
 */
export function nextAdmissible(model: ModelId, snapshot: StatusSnapshot): GameId | null {
  const pairs = PILOT_TABLE.filter(p => p.model === model);
  const legsOf = (p: Pair) => [gameId(p.id, 'W'), gameId(p.id, 'B')] as const;
  const startedPairs = pairs.filter(p => legsOf(p).some(id => (snapshot[id] ?? 'pending') !== 'pending'));
  for (const pair of startedPairs) {
    for (const id of legsOf(pair)) if ((snapshot[id] ?? 'pending') === 'pending') return id;
  }
  for (const pair of pairs) {
    if (startedPairs.includes(pair)) continue;
    return legsOf(pair)[0];
  }
  return null;
}

/** Pure trace of what dispatch WOULD admit next, model by model, assuming each
 * admitted game immediately settles before the next admission — i.e. the
 * queue order, not real concurrency. Used by `--dry-run`. */
export function admissionTrace(): GameId[] {
  const snapshot: StatusSnapshot = {};
  const trace: GameId[] = [];
  for (;;) {
    let admittedAny = false;
    for (const model of ['luna', 'sonnet'] as const) {
      const next = nextAdmissible(model, snapshot);
      if (next) { trace.push(next); snapshot[next] = 'finished'; admittedAny = true; }
    }
    if (!admittedAny) break;
  }
  return trace;
}

export function allSettled(snapshot: StatusSnapshot): boolean {
  return ALL_GAME_IDS.every(id => isSettled(snapshot[id] ?? 'pending'));
}
export { isActive as gameIsActive, isSettled as gameIsSettled };
