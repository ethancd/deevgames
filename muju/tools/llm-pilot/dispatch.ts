/**
 * Dispatcher (SPEC.md Component D): schedules the 16-game pilot, admits games two-per-model, freezes
 * memory snapshots per pair, creates rooms on the live server, launches the engine seat and the
 * player, cross-checks results, and hands finished games to the publisher.
 *
 * CLI (from muju/; see SPEC.md "D: operator commands"):
 *   node --import tsx tools/llm-pilot/dispatch.ts --dry-run     # schedule + admission order, no network
 *   node --import tsx tools/llm-pilot/dispatch.ts --preflight   # auth routing + model probes -> preflight.json
 *   node --import tsx tools/llm-pilot/dispatch.ts               # run: re-attach live games, then admit
 *   node --import tsx tools/llm-pilot/dispatch.ts --resume      # same as run (explicit re-attach)
 *   node --import tsx tools/llm-pilot/dispatch.ts --status
 *   node --import tsx tools/llm-pilot/dispatch.ts --kill        # SIGTERM dispatcher, players, engine seats
 *   MUJU_PILOT_CAMPAIGN_DIR=<pilot>/smoke node --import tsx tools/llm-pilot/dispatch.ts --smoke --only P02-W [--handicap 1] [--smoke-turns 3]
 *
 * Every child (engine seat, player CLI) is spawned DETACHED with its output going to files, so a
 * dispatcher that dies or is --kill'ed never takes a game down with it by accident, and a restarted
 * dispatcher re-attaches: an engine seat still running is left alone (else respawned from its own
 * journal — `mode: "pinned"` never joins), and a player still running is waited on by pid (else its
 * CLI session is resumed). Seats are never re-joined; an in-flight game whose room/seat is uncertain
 * is reported `interrupted`, never replaced.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readdirSync, rmSync, statSync, appendFileSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerId } from '../../src/game/types';
import type { RoomAdmission, RoomSnapshot } from '../../src/online/types';
import { roomRequest } from '../../src/online/client';
import { observerUrl } from '../../src/online/invitations';
import { PHASING_RULES_VERSION } from '../../server/rooms';
import { readSlots, slotCount } from '../../lab/hard-ai/ladder/heavy';
import { researchReadinessSchema } from '../engine-seat/contract';
import { runAuthPreflight, readCodexRollout, type CodexRateLimits } from './auth';
import {
  ALL_GAME_IDS, CAMPAIGN_DIR, ENGINE_DISPLAY_NAME, MAX_PLAYER_TURNS, MODEL_CLI_ID, perModelCap,
  PILOT_TIME_CONTROL, PROTOCOL_ID, activeCountFor, admissionTrace, buildSchedule, ensureCampaignDirs,
  ensureGameDirs, engineConfigPath, engineDir, engineStatePath, gameDir, llmDisplayName, loadOrInitSchedule,
  nextAdmissible, pairById, parseGameId, pidsJsonPath, playerDir, progressMdPath, readJson, readStatus,
  saveSchedule, seatSecretPath, snapshotDir, stopFilePath, writeFileAtomic, writeJson, writeStatus, memoryDir,
  gameIsSettled, type GameId, type Schedule, type ScheduleGame, type StatusSnapshot,
} from './pilot';
import { appendExperience, curatePlaybook, freezeSnapshot, type ExperienceRecord } from './publish';
import { pidAlive, runPlayer, type PlayerResult, type RunPlayerArgs } from './players';

const SERVER_URL = process.env.MUJU_SERVER_URL ?? 'https://deevgames-muju.onrender.com';
const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const MUJU_ROOT = resolve(TOOLS_DIR, '../..');
const PRODUCTION_CAMPAIGN_DIR = '/Users/ashkie/src/deevgames/outputs/muju-llm-opponent-campaign-2026-09-23/pilot';
/** Stop admitting Luna games once the ChatGPT weekly window is this full (headroom before any
 * paid-credit fallback could engage). */
const GPT_MAX_USED_PERCENT = Number(process.env.MUJU_PILOT_GPT_MAX_USED_PERCENT ?? 70);
const PREFLIGHT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Engine-seat research readiness (Component A `researchReadiness`; never "M7-passed").
// `engineSourceSha256` uses the SAME walk as engine-seat main.ts#sourceIdentity(), which refuses to
// start on a mismatch, so a stale checkout is caught before any search.
// ---------------------------------------------------------------------------
function engineSourceSha256(): string {
  const files: Record<string, string> = {};
  const walk = (directory: string) => {
    for (const entry of readdirSync(join(MUJU_ROOT, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) files[path] = createHash('sha256').update(readFileSync(join(MUJU_ROOT, path))).digest('hex');
    }
  };
  for (const directory of ['src/game', 'src/ai', 'lab/hard-ai/bots', 'lab/hard-ai/ablate', 'tools/engine-seat']) walk(directory);
  files['package-lock.json'] = createHash('sha256').update(readFileSync(join(MUJU_ROOT, 'package-lock.json'))).digest('hex');
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
function engineReadinessClaim(): { researchReadiness: ReturnType<typeof researchReadinessSchema.parse> } {
  return {
    researchReadiness: researchReadinessSchema.parse({
      kind: 'research',
      campaign: 'muju-llm-pilot-2026-09-23',
      rulesId: PHASING_RULES_VERSION,
      engineSourceSha256: engineSourceSha256(),
      readinessEvidence: 'Engine-seat runner with per-search heavy-slot acquisition and verifyTurn-checked idempotent '
        + 'submission (tools/engine-seat/{contract,runner,verify}.ts, tests/lab/engine-seat.test.ts). No Phasing '
        + 'ladder/strength claim implied; research-only readiness for this pilot, not an M7 release-gate pass.',
    }),
  };
}

// ---------------------------------------------------------------------------
// Launch gate: production rules revision must equal this checkout's pinned revision.
// ---------------------------------------------------------------------------
export async function productionRulesId(): Promise<string> {
  const response = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'muju_rules', arguments: {} } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Production rules probe failed: HTTP ${response.status}`);
  const body = await response.json() as { result?: { structuredContent?: { ruleset?: { revision?: string } } } };
  const revision = body.result?.structuredContent?.ruleset?.revision;
  if (!revision) throw new Error(`Production rules probe returned no ruleset.revision: ${JSON.stringify(body)}`);
  return revision;
}
export async function assertProductionRulesGate(): Promise<void> {
  const live = await productionRulesId();
  if (live !== PHASING_RULES_VERSION) {
    throw new Error(`Launch gate closed: production rules revision is "${live}", this checkout's engine seat is pinned to "${PHASING_RULES_VERSION}". `
      + 'No pilot game may be admitted until the uncapped-Cleave rules land in production and this branch is rebased onto them (SPEC.md launch gate).');
  }
}

// ---------------------------------------------------------------------------
// Site health / GPT quota gating
// ---------------------------------------------------------------------------
interface HttpSample { at: string; status: number; latencyMs: number; path?: string }
export function siteHealthOk(samples: HttpSample[], opts: { errorRateThreshold?: number; p95LatencyMsThreshold?: number } = {}): { ok: boolean; detail: string } {
  const errorRateThreshold = opts.errorRateThreshold ?? 0.2;
  const p95LatencyMsThreshold = opts.p95LatencyMsThreshold ?? 5000;
  if (samples.length === 0) return { ok: true, detail: 'no samples yet' };
  // Long-polls (/changes, muju_wait_for_change) are slow by design; they count for errors, not latency.
  const recent = samples.slice(-50);
  const timed = recent.filter(s => !s.path?.includes('/changes'));
  const errorRate = recent.filter(s => s.status === 429 || s.status >= 500).length / recent.length;
  const sortedLatency = [...timed.map(s => s.latencyMs)].sort((a, b) => a - b);
  const p95 = sortedLatency[Math.floor(sortedLatency.length * 0.95)] ?? 0;
  if (errorRate > errorRateThreshold) return { ok: false, detail: `429/5xx rate ${(errorRate * 100).toFixed(0)}% over last ${recent.length} requests` };
  if (p95 > p95LatencyMsThreshold) return { ok: false, detail: `p95 latency ${p95}ms over last ${recent.length} requests` };
  return { ok: true, detail: `error rate ${(errorRate * 100).toFixed(0)}%, p95 ${p95}ms` };
}
function readHttpSamples(id: GameId): HttpSample[] {
  const path = `${gameDir(id)}/http.jsonl`;
  if (!existsSync(path)) return [];
  // Only recent traffic matters for throttling (last 10 minutes).
  const since = Date.now() - 10 * 60_000;
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line) as HttpSample; } catch { return null; }
  }).filter((s): s is HttpSample => s !== null && typeof s.status === 'number' && Date.parse(s.at) >= since);
}
function currentSiteHealth(): { ok: boolean; detail: string } {
  return siteHealthOk(ALL_GAME_IDS.flatMap(readHttpSamples).sort((a, b) => a.at.localeCompare(b.at)));
}
/** Latest ChatGPT-subscription usage signal: the newest rate_limits among finished Luna phases
 * (from Codex's session rollout) or the preflight baseline. Blocks new Luna admissions when the
 * weekly window is >= GPT_MAX_USED_PERCENT, a limit was reached, or the credits balance moved
 * (i.e. something may have been billed to paid credits). */
export function gptQuotaDecision(latest: CodexRateLimits | undefined, baseline: CodexRateLimits | undefined, maxUsed = GPT_MAX_USED_PERCENT): { ok: boolean; detail: string } {
  if (!latest) return { ok: true, detail: 'no ChatGPT usage signal yet' };
  const used = latest.primary?.used_percent ?? 0, secondary = latest.secondary?.used_percent ?? 0;
  if (latest.rate_limit_reached_type) return { ok: false, detail: `Codex rate limit reached (${latest.rate_limit_reached_type})` };
  if (Math.max(used, secondary) >= maxUsed) return { ok: false, detail: `ChatGPT window ${Math.max(used, secondary)}% used (cap ${maxUsed}%); queued until reset` };
  const before = baseline?.credits?.balance, after = latest.credits?.balance;
  if (before !== undefined && after !== undefined && Number(after) < Number(before)) {
    return { ok: false, detail: `Codex credits balance dropped ${before} -> ${after}: possible paid-credit use; Luna admission halted` };
  }
  return { ok: true, detail: `ChatGPT window ${used}% used` };
}
async function gptQuotaOk(): Promise<{ ok: boolean; detail: string }> {
  const preflight = readJson<{ codex?: { probe?: { rateLimits?: CodexRateLimits } } }>(join(CAMPAIGN_DIR, 'preflight.json'));
  const baseline = preflight?.codex?.probe?.rateLimits;
  let latest: { at: string; limits: CodexRateLimits } | undefined;
  for (const id of ALL_GAME_IDS) {
    if (pairById(parseGameId(id).pairId).model !== 'luna') continue;
    const state = readJson<{ sessionId?: string | null; phases?: Array<{ endedAt?: string; rateLimitInfo?: CodexRateLimits }> }>(`${playerDir(id)}/state.json`);
    // A live game's rollout is the freshest signal.
    if (state?.sessionId) {
      const rollout = await readCodexRollout(state.sessionId);
      if (rollout?.rateLimits) {
        const at = statSync(rollout.file).mtime.toISOString();
        if (!latest || at > latest.at) latest = { at, limits: rollout.rateLimits };
      }
    }
  }
  return gptQuotaDecision(latest?.limits ?? baseline, baseline);
}

// ---------------------------------------------------------------------------
// Room / seat setup
// ---------------------------------------------------------------------------
function seedFor(id: GameId, salt = ''): number {
  return createHash('sha256').update(`${id}${salt}`).digest().readUInt32BE(0);
}
interface PilotRoomAdmission extends RoomAdmission { credentials: { roomId: string; player: PlayerId; token: string } }
/** Creates the room as the ENGINE's seat (issued credentials; `mode: "pinned"` never joins) and
 * joins the player's seat here, before either process starts (the second join starts the clocks). */
async function createPilotRoom(game: ScheduleGame): Promise<PilotRoomAdmission> {
  const admission = await roomRequest<RoomAdmission>(SERVER_URL, '', {
    name: ENGINE_DISPLAY_NAME, side: game.engineSeat,
    matchPolicy: { version: 1 as const, toolTier: game.toolTier, protocolId: PROTOCOL_ID },
    blackCrystalHandicap: game.blackCrystalHandicap, timeControl: PILOT_TIME_CONTROL,
  });
  if (admission.room.timeControl?.delaySeconds !== PILOT_TIME_CONTROL.delaySeconds ||
      admission.room.timeControl?.bankSeconds !== PILOT_TIME_CONTROL.bankSeconds) {
    throw new Error(`Room ${admission.room.id} did not accept the pilot's custom time control; got ${JSON.stringify(admission.room.timeControl)}.`);
  }
  return admission as PilotRoomAdmission;
}
function watchUrlFor(room: RoomSnapshot): string { return observerUrl(SERVER_URL, room.id, room.watchCode); }

export function buildEngineConfig(game: ScheduleGame, roomId: string, credentials: { player: PlayerId; token: string }, salt = ''): object {
  return {
    mode: 'pinned', serverUrl: SERVER_URL, roomId, seed: seedFor(game.gameId, salt), stateFile: engineStatePath(game.gameId),
    credentials: { roomId, player: credentials.player, token: credentials.token },
    expectedMatchPolicy: { version: 1, toolTier: game.toolTier, protocolId: PROTOCOL_ID },
    expectedTimeControl: PILOT_TIME_CONTROL, expectedHandicap: game.blackCrystalHandicap,
    ...engineReadinessClaim(),
  };
}

interface Prep { roomId: string; watchUrl: string; snapshotVersion: number; enginePlayer: PlayerId; llmPlayer: PlayerId; preparedAt: string }
async function prepareGame(game: ScheduleGame, snapshotVersion: number): Promise<Prep> {
  ensureGameDirs(game.gameId);
  writeStatus(game.gameId, 'preparing', 'creating room');
  const created = await createPilotRoom(game);
  const roomId = created.room.id;
  // Recorded before anything else can fail, so an interrupted preparation names its room.
  writeJson(`${gameDir(game.gameId)}/prep.partial.json`, { roomId, watchUrl: watchUrlFor(created.room), createdAt: new Date().toISOString() });
  writeJson(engineConfigPath(game.gameId), buildEngineConfig(game, roomId, created.credentials, isSmoke() ? `smoke-${roomId}` : ''), 0o600);
  if (!created.inviteCode) throw new Error(`Room ${roomId} did not return an invitation for the player seat.`);
  const joined = await roomRequest<RoomAdmission>(SERVER_URL, `/${roomId}/join`, { name: llmDisplayName(game.model, game.effort), inviteCode: created.inviteCode });
  writeJson(seatSecretPath(game.gameId), { serverUrl: SERVER_URL, roomId, seatToken: joined.credentials.token, tier: game.toolTier }, 0o600);
  const prep: Prep = { roomId, watchUrl: watchUrlFor(joined.room), snapshotVersion, enginePlayer: created.credentials.player,
    llmPlayer: joined.credentials.player, preparedAt: new Date().toISOString() };
  writeJson(`${gameDir(game.gameId)}/prep.json`, prep);
  // manifest.json's snapshotVersion pins gateway.ts's pilot_memory to this pair's frozen snapshot.
  writeJson(`${gameDir(game.gameId)}/manifest.json`, {
    ...(isSmoke() ? { label: 'SMOKE' } : {}),
    gameId: game.gameId, pairId: game.pairId, model: game.model, cliModel: MODEL_CLI_ID[game.model], effort: game.effort,
    toolTier: game.toolTier, blackCrystalHandicap: game.blackCrystalHandicap, llmSeat: game.llmSeat, engineSeat: game.engineSeat,
    displayName: llmDisplayName(game.model, game.effort), roomId, watchUrl: prep.watchUrl, snapshotVersion,
    engine: { name: ENGINE_DISPLAY_NAME, profile: 'desktop', targetMs: 55_000, deadlineMs: 60_000, rulesId: PHASING_RULES_VERSION,
      sourceSha256: engineSourceSha256(), seed: seedFor(game.gameId, isSmoke() ? `smoke-${roomId}` : '') },
    timeControl: PILOT_TIME_CONTROL, protocolId: PROTOCOL_ID, startedAt: prep.preparedAt,
  });
  return prep;
}

// ---------------------------------------------------------------------------
// Process tracking (pids.json): dispatcher, engine seats, player CLI phases
// ---------------------------------------------------------------------------
interface PidRecord { gameId?: GameId; pid: number; role: 'dispatcher' | 'engine-seat' | 'player'; startedAt: string }
function readPids(): PidRecord[] { return readJson<PidRecord[]>(pidsJsonPath()) ?? []; }
function trackPid(record: PidRecord): void {
  writeJson(pidsJsonPath(), [...readPids().filter(r => !(r.role === record.role && r.gameId === record.gameId)), record]);
}
function untrackPid(role: PidRecord['role'], gameId?: GameId): void {
  writeJson(pidsJsonPath(), readPids().filter(r => !(r.role === role && r.gameId === gameId)));
}
function signalGroup(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  try { process.kill(-pid, signal); return true; } catch { try { process.kill(pid, signal); return true; } catch { return false; } }
}

/** Restart budget for a crashing engine seat while its room is still `playing`. Capped exponential
 * backoff (3s, 6s, 12s, 24s, 48s, then 60s) comfortably rides out a site deploy/restart lasting
 * 20-30s — the scenario a fixed "3 tries, 3s apart" budget (~9s total) could not, which let the
 * room's own clock hand the LLM a false win once the engine seat gave up for good. 20 restarts at
 * a 60s-capped backoff is >20 minutes of retrying before this gives up entirely. */
const ENGINE_RESTART_BUDGET = 20;
const ENGINE_RESTART_BACKOFF_BASE_MS = 3_000;
const ENGINE_RESTART_BACKOFF_CAP_MS = 60_000;

/** Starts (or re-attaches to) the game's engine seat; resolves when it exits for good.
 * Returns `gaveUp: true` when a non-zero exit while the room still plays spent the whole restart
 * budget — `finishGame` must never record that game's result as a clean win/loss when this fires,
 * since the room's clock (not a real move) is what ended the game underneath a dead engine. */
async function superviseEngine(gameId: GameId, isOver: () => Promise<boolean>): Promise<{ gaveUp: boolean }> {
  let restarts = 0;
  for (;;) {
    const existing = readPids().find(r => r.role === 'engine-seat' && r.gameId === gameId);
    let exitCode: number | null;
    if (existing && pidAlive(existing.pid)) {
      while (pidAlive(existing.pid)) await new Promise(resolve => setTimeout(resolve, 2000));
      exitCode = null;
    } else {
      const lock = `${engineStatePath(gameId)}.lock`;
      if (existsSync(lock)) rmSync(lock, { recursive: true, force: true }); // no live engine process holds it
      const log = openSync(`${engineDir(gameId)}/spawn.log`, 'a');
      const child = spawn(process.execPath, ['--import', 'tsx', resolve(MUJU_ROOT, 'tools/engine-seat/main.ts'), engineConfigPath(gameId)],
        { cwd: MUJU_ROOT, detached: true, stdio: ['ignore', log, log] });
      closeSync(log);
      trackPid({ gameId, pid: child.pid ?? -1, role: 'engine-seat', startedAt: new Date().toISOString() });
      exitCode = await new Promise<number | null>(done => child.on('exit', code => done(code)));
    }
    untrackPid('engine-seat', gameId);
    if (stopping || retiredEngines.has(gameId)) return { gaveUp: false };
    let over = false;
    try { over = await isOver(); } catch { /* unknown: fall through to respawn policy */ }
    if (over || exitCode === 0) return { gaveUp: false };
    if (++restarts > ENGINE_RESTART_BUDGET) {
      appendFileSync(`${engineDir(gameId)}/spawn.log`, `[dispatch] engine seat exited ${exitCode}; restart budget (${ENGINE_RESTART_BUDGET}) spent\n`);
      return { gaveUp: true };
    }
    const backoffMs = Math.min(ENGINE_RESTART_BACKOFF_BASE_MS * 2 ** (restarts - 1), ENGINE_RESTART_BACKOFF_CAP_MS);
    appendFileSync(`${engineDir(gameId)}/spawn.log`, `[dispatch] engine seat exited ${exitCode} with the room still playing; respawning from journal in ${backoffMs}ms (${restarts}/${ENGINE_RESTART_BUDGET})\n`);
    await new Promise(resolve => setTimeout(resolve, backoffMs));
  }
}

// ---------------------------------------------------------------------------
// Result cross-check, manifest, publication
// ---------------------------------------------------------------------------
/** Bounded retry/backoff around the one HTTP call every room read boils down to. A single
 * transient failure here must never look like "the game is over" or "kill the engine" — it is
 * just an unknown room state, worth one more try (review finding: an unretried read used to end
 * the player and, if `finishGame`'s own read also failed once, leave the game's real result never
 * written at all). */
async function readSeatRoom(gameId: GameId): Promise<RoomSnapshot> {
  const seat = readJson<{ roomId: string; seatToken: string }>(seatSecretPath(gameId))!;
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await roomRequest<RoomSnapshot>(SERVER_URL, `/${seat.roomId}`, undefined, seat.seatToken); }
    catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 10_000))); }
  }
  throw lastError;
}
/** A manifest's `result` is wider than a published `ExperienceRecord['result']`: `engine-failure`
 * and `provider-failure` mark a game whose outcome the frozen Hard engine (or the player's own
 * CLI harness) did not fairly decide, so it must never be counted as a real win/loss/draw and
 * must never reach the shared playbook (see `finishGame`). */
export type ManifestResult = ExperienceRecord['result'] | 'engine-failure' | 'provider-failure';
export function resultFromRoom(room: RoomSnapshot, llmSeat: PlayerId): ExperienceRecord['result'] {
  if (room.state.phase !== 'victory') return 'truncated';
  if (room.state.winner === null) return 'draw';
  return room.state.winner === llmSeat ? 'win' : 'loss';
}
/**
 * Overrides `resultFromRoom` with `engine-failure` whenever the outcome cannot be trusted as a
 * genuine engine result (review finding: a dead engine seat let its room clock hand the LLM a
 * "win" that nothing flagged): the LLM won on the ENGINE's clock running out (only the engine
 * seat's own bank exhausting counts — `victoryReason 'timeout'` with the engine, not the LLM, as
 * the loser), or the engine seat spent its whole restart budget before the room finished at all.
 * A `loss`/`draw` result the LLM earned is left alone even if the engine restarted along the way.
 */
export function classifyResult(result: ExperienceRecord['result'], room: RoomSnapshot, game: ScheduleGame, engineGaveUp: boolean, player: PlayerResult): ManifestResult {
  if (result === 'win' && room.state.victoryReason === 'timeout' && room.state.winner === game.llmSeat) return 'engine-failure';
  if (engineGaveUp && result === 'win') return 'engine-failure';
  // Same class of problem on the player's own side: a harness crash (dead CLI session, unreadable
  // room) can burn the LLM's clock instead of the engine's, producing an identical false "loss".
  if (result === 'loss' && player.outcome === 'failed' && room.state.victoryReason === 'timeout' && room.state.winner === game.engineSeat) return 'provider-failure';
  return result;
}
function jsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line) as T]; } catch { return []; } });
}
/** Copies the engine journal log into engine/ with every seat token redacted. */
function publishRedactedEngineLog(gameId: GameId): void {
  const source = `${engineStatePath(gameId)}.jsonl`;
  if (!existsSync(source)) return;
  const tokens = [readJson<{ credentials?: { token?: string } }>(engineConfigPath(gameId))?.credentials?.token,
    readJson<{ seatToken?: string }>(seatSecretPath(gameId))?.seatToken].filter((t): t is string => Boolean(t));
  let text = readFileSync(source, 'utf8');
  for (const token of tokens) text = text.split(token).join('[redacted]');
  writeFileAtomic(`${engineDir(gameId)}/engine-seat.jsonl`, text);
}
export interface HistoryEntryLite { revision: number; player: PlayerId; turnNumber: number }
/** Every recorded room_moves entry (live play AND fired `muju_stage` commits go through the same
 * server-side write path — SPEC.md/finding: staged batches never pass through the gateway's own
 * `actions.jsonl`, so that log alone undercounts turns for the harnessed/centaur/tool-builder
 * tiers). Paginates with `after` until `hasLater` is false; this is the one authoritative source
 * for "how many turns did each seat actually take". */
async function fetchFullHistory(roomId: string): Promise<{ total: number; entries: HistoryEntryLite[] }> {
  const entries: HistoryEntryLite[] = [];
  let after = 0, total = 0;
  for (;;) {
    const page = await roomRequest<{ total: number; hasLater: boolean; entries: Array<{ revision: number; player: PlayerId; turnNumber: number; sequence: number }> }>(
      SERVER_URL, `/${roomId}/history?after=${after}&limit=200`);
    total = page.total;
    entries.push(...page.entries.map(e => ({ revision: e.revision, player: e.player, turnNumber: e.turnNumber })));
    if (!page.hasLater || page.entries.length === 0) break;
    after = page.entries.at(-1)!.sequence;
  }
  return { total, entries };
}
/** Distinct turns a seat actually completed, from the authoritative history (not the gateway's
 * own log, which misses staged commits). */
export function turnsFromHistory(entries: HistoryEntryLite[], seat: PlayerId): number {
  return new Set(entries.filter(e => e.player === seat).map(e => e.turnNumber)).size;
}
async function finishGame(game: ScheduleGame, player: PlayerResult, engineGaveUp: boolean): Promise<void> {
  const id = game.gameId;
  const room = await readSeatRoom(id);
  const history = await fetchFullHistory(room.id).catch(() => undefined);
  publishRedactedEngineLog(id);
  const actions = jsonl<{ revision: number; requestId: string }>(`${gameDir(id)}/actions.jsonl`);
  const engineEvents = jsonl<{ event: string; revision?: number; queueDelayMs?: number; elapsedMs?: number }>(`${engineDir(id)}/engine-seat.jsonl`);
  const requestIds = actions.map(a => a.requestId);
  const llmHistoryTurns = history ? turnsFromHistory(history.entries, game.llmSeat) : null;
  // actions.jsonl only records ordinary muju_play commits; a fired muju_stage batch never goes
  // through withGatewayGuarantees.act (see gateway.ts), so it is expected to be MISSING from this
  // log even in a fully healthy game whenever the tier used staging — that is exactly what this
  // count surfaces for the operator, not a defect to silently reconcile away.
  const llmActionsLogRevisions = new Set(actions.map(a => a.revision));
  const llmHistoryRevisionsMissingFromLog = history
    ? history.entries.filter(e => e.player === game.llmSeat && !llmActionsLogRevisions.has(e.revision)).length : null;
  const turns = llmHistoryTurns ?? player.turns;
  const crossCheck = {
    finalRevision: room.revision, historyEntries: history?.total ?? null, llmBatchesLogged: actions.length,
    llmHistoryTurns, llmHistoryRevisionsMissingFromLog,
    engineSubmissions: engineEvents.filter(e => e.event === 'submitted').length,
    duplicateRequestIds: requestIds.length - new Set(requestIds).size,
    actionsBeyondFinalRevision: actions.filter(a => a.revision > room.revision).length,
    engineSearches: engineEvents.filter(e => e.event === 'search').length,
    maxEngineQueueDelayMs: Math.max(0, ...engineEvents.map(e => e.queueDelayMs ?? 0)),
    maxEngineSearchMs: Math.max(0, ...engineEvents.filter(e => e.event === 'search').map(e => e.elapsedMs ?? 0)),
  };
  const terminal = room.state.phase !== 'playing';
  const rawResult = terminal ? resultFromRoom(room, game.llmSeat) : 'invalid';
  const result: ManifestResult = terminal ? classifyResult(rawResult, room, game, engineGaveUp, player) : 'invalid';
  const manifest = {
    ...readJson<Record<string, unknown>>(`${gameDir(id)}/manifest.json`),
    revision: room.revision, turnNumber: room.state.turn.turnNumber, llmTurns: turns, result,
    winner: room.state.winner ?? null, victoryReason: room.state.victoryReason ?? null,
    finishedAt: new Date().toISOString(), truncated: turns >= MAX_PLAYER_TURNS, playerOutcome: player.outcome,
    playerDetail: player.detail, engineGaveUp, crossCheck,
  };
  writeJson(`${gameDir(id)}/manifest.json`, manifest);
  if (player.reflectionText) writeFileAtomic(`${gameDir(id)}/reflection.md`, player.reflectionText);
  const quotaHalt = readJson<{ at: string; detail: string }>(`${playerDir(id)}/quota-halt.json`);
  if (quotaHalt) { writeStatus(id, 'interrupted', `provider interruption (Luna quota, billing-safety stop): ${quotaHalt.detail}`); return; }
  if (!terminal) { writeStatus(id, 'failed', `player ended with the room still playing (${player.detail ?? 'no detail'})`); return; }
  // A genuine terminal result stands even when the reflection failed; it is simply not published.
  if (player.outcome === 'failed' || !player.reflectionText) { writeStatus(id, 'finished', `result ${result}; reflection not published: ${player.detail ?? 'none'}`); return; }
  // engine-failure / provider-failure are not a fair sporting outcome (the frozen engine or the
  // harness broke, not "lost"/"won" the game) — never let them into the shared playbook.
  if (result === 'engine-failure' || result === 'provider-failure') {
    writeStatus(id, 'finished', `result ${result}: not published (see SPEC.md launch gate / crossCheck; playerDetail: ${player.detail ?? 'none'})`);
    return;
  }
  const record = await appendExperience({
    gameId: id, pairId: game.pairId, model: game.model, effort: game.effort, toolTier: game.toolTier,
    llmSeat: game.llmSeat, handicap: game.blackCrystalHandicap, result, turns,
    citedRevisions: player.citedRevisions, finalRevision: room.revision, reflection: player.reflectionText,
    writtenAt: new Date().toISOString(), ...(isSmoke() ? { label: 'SMOKE' } : {}),
  });
  let curation = 'playbook curated';
  try { const curated = await curatePlaybook(); curation = `playbook v${curated.nextVersion}`; }
  catch (error) { curation = `playbook curation failed: ${(error as Error).message}`; }
  writeStatus(id, 'finished', `result ${result}; published (${record.citedRevisions.length} citations, ${record.droppedCitations?.length ?? 0} dropped); ${curation}`);
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
function fmtElapsed(ms: number): string { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`; }
export function formatProgress(schedule: Schedule, gameIds: readonly GameId[] = ALL_GAME_IDS): string {
  const rows = schedule.games.filter(g => gameIds.includes(g.gameId)).map(g => {
    const status = readStatus(g.gameId);
    const manifest = readJson<{ watchUrl?: string; result?: string; llmTurns?: number; turnNumber?: number; startedAt?: string; finishedAt?: string }>(`${gameDir(g.gameId)}/manifest.json`);
    const turns = manifest?.turnNumber ?? '-';
    const elapsed = manifest?.startedAt ? fmtElapsed(Date.parse(manifest.finishedAt ?? new Date().toISOString()) - Date.parse(manifest.startedAt)) : '-';
    return `| ${g.gameId} | ${llmDisplayName(g.model, g.effort)} | ${g.toolTier} | ${g.blackCrystalHandicap} | ${g.llmSeat} | ${status.state} | ${manifest?.watchUrl ?? '-'} | ${manifest?.result ?? '-'} | ${turns} | ${elapsed} |`;
  });
  return [
    `# Pilot progress${isSmoke() ? ' (SMOKE)' : ''} — updated ${new Date().toISOString()}`, '',
    '| Game | Player | Tier | Black +crystals | LLM seat | State | Watch | Result | Turn | Elapsed |',
    '|---|---|---|---:|---|---|---|---|---:|---:|', ...rows, '',
    `Stop admitting: \`touch ${stopFilePath()}\` · Hard stop: \`node --import tsx tools/llm-pilot/dispatch.ts --kill\` · Resume: \`node --import tsx tools/llm-pilot/dispatch.ts --resume\` (from muju/)`, '',
  ].join('\n');
}
function refreshProgress(): void { writeFileAtomic(progressMdPath(), formatProgress(loadOrInitSchedule(), scopeIds())); }

// ---------------------------------------------------------------------------
// Smoke mode (never part of the 16): its own campaign dir, one game, launch gate bypassed.
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const argValue = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
function isSmoke(): boolean { return argv.includes('--smoke'); }
function scopeIds(): readonly GameId[] {
  const only = argValue('--only');
  return only ? only.split(',') as GameId[] : ALL_GAME_IDS;
}
function smokeBrief(turns: number): string {
  return `SMOKE TEST of the pilot harness (not a rated game; this instruction overrides "do not resign"). `
    + `Read pilot_memory and muju_rules as usual, then play exactly ${turns} of your own turns normally (each ending with `
    + `END_PLACE_PHASE), waiting for the engine between them with muju_wait_for_change. On your turn number ${turns + 1}, commit `
    + `a single muju_play with the action RESIGN and stop.`;
}
function assertSmokeDir(): void {
  if (resolve(CAMPAIGN_DIR) === resolve(PRODUCTION_CAMPAIGN_DIR) || basename(CAMPAIGN_DIR) !== 'smoke') {
    throw new Error(`--smoke requires MUJU_PILOT_CAMPAIGN_DIR=<pilot>/smoke (got ${CAMPAIGN_DIR}); smoke games never enter the pilot's own dirs.`);
  }
}

// ---------------------------------------------------------------------------
// Main admit/run loop
// ---------------------------------------------------------------------------
const inflight = new Map<GameId, Promise<void>>();
let stopping = false;
/** Games whose engine seat the dispatcher stopped on purpose (never respawned). */
const retiredEngines = new Set<GameId>();

/** A pair's snapshot is frozen once, when its first leg starts; the second leg reuses it. */
function snapshotVersionFor(game: ScheduleGame): number {
  for (const leg of ['W', 'B'] as const) {
    const prep = readJson<{ snapshotVersion?: number }>(`${gameDir(`${game.pairId}-${leg}`)}/prep.json`)
      ?? readJson<{ snapshotVersion?: number }>(`${gameDir(`${game.pairId}-${leg}`)}/snapshot.json`);
    if (prep?.snapshotVersion) return prep.snapshotVersion;
  }
  const root = join(memoryDir(), 'snapshots');
  const versions = existsSync(root) ? readdirSync(root).map(name => /^v(\d+)$/.exec(name)?.[1]).filter(Boolean).map(Number) : [];
  const version = Math.max(0, ...versions) + 1;
  freezeSnapshot(version);
  ensureGameDirs(game.gameId);
  writeJson(`${gameDir(game.gameId)}/snapshot.json`, { snapshotVersion: version, frozenAt: new Date().toISOString() });
  return version;
}

async function runGame(game: ScheduleGame, reattach: boolean): Promise<void> {
  const id = game.gameId;
  try {
    let prep = readJson<Prep>(`${gameDir(id)}/prep.json`);
    if (!reattach) prep = await prepareGame(game, snapshotVersionFor(game));
    if (!prep || !existsSync(seatSecretPath(id))) throw new Error('re-attach found no prepared room/seat; never re-joining');
    writeStatus(id, 'live', `room ${prep.roomId}`);
    refreshProgress();
    // The 200-turn safety ceiling is enforced live off the room's own turnNumber (not the
    // gateway's actions.jsonl, which can undercount staged commits — see finishGame), so a stuck
    // game stops admitting further "keep playing" phases instead of only being labeled truncated
    // after the fact.
    const isOver = async () => {
      const room = await readSeatRoom(id);
      return room.state.phase !== 'playing' || room.state.turn.turnNumber >= MAX_PLAYER_TURNS;
    };
    const engine = superviseEngine(id, isOver);
    const smokeTurns = Number(argValue('--smoke-turns') ?? 3);
    const playerArgs: RunPlayerArgs = {
      gameDir: gameDir(id), gameId: id, model: game.model, effort: game.effort, tier: game.toolTier, seat: game.llmSeat,
      snapshotDir: snapshotDir(prep.snapshotVersion), handicap: game.blackCrystalHandicap,
      brief: isSmoke() ? smokeBrief(smokeTurns)
        : `Pair ${game.pairId}: you play ${game.llmSeat} with the ${game.toolTier} tool tier at ${game.effort} effort; Black starts with ${game.blackCrystalHandicap} extra crystals. Play to win.`,
      isGameOver: isOver,
      onSpawn: pid => trackPid({ gameId: id, pid, role: 'player', startedAt: new Date().toISOString() }),
    };
    const player = await runPlayer(playerArgs);
    untrackPid('player', id);
    if (stopping) return; // --kill: leave status live for --resume
    const over = await isOver().catch(() => false);
    if (!over) {
      retiredEngines.add(id);
      const engineRecord = readPids().find(r => r.role === 'engine-seat' && r.gameId === id);
      if (engineRecord) signalGroup(engineRecord.pid);
    }
    const { gaveUp: engineGaveUp } = await engine;
    await finishGame(game, player, engineGaveUp);
  } catch (error) {
    if (!stopping) writeStatus(id, reattach ? 'interrupted' : 'failed', error instanceof Error ? error.message : String(error));
  } finally {
    if (!stopping) refreshProgress();
  }
}

let gateCache: { ok: boolean; detail: string; checkedAt: number } | undefined;
async function launchGateStatus(): Promise<{ ok: boolean; detail: string }> {
  if (isSmoke()) return { ok: true, detail: 'bypassed for a labeled SMOKE game (not part of the pilot)' };
  if (gateCache && Date.now() - gateCache.checkedAt < 60_000) return gateCache;
  try {
    await assertProductionRulesGate();
    gateCache = { ok: true, detail: `production rules match ${PHASING_RULES_VERSION}`, checkedAt: Date.now() };
  } catch (error) {
    gateCache = { ok: false, detail: error instanceof Error ? error.message : String(error), checkedAt: Date.now() };
  }
  return gateCache;
}

/** Games whose Luna player was killed mid-game because the ChatGPT-subscription quota tripwire
 * fired while it was already running (never resumed automatically — a billing-safety stop, not a
 * transient failure). Checked every tick, independent of admission, since the owner's requirement
 * ("no paid-credit fallback") covers the whole game including its reflection, not just admission. */
const haltedLuna = new Set<GameId>();
async function enforceLunaQuota(schedule: Schedule): Promise<void> {
  const quota = await gptQuotaOk();
  if (quota.ok) return;
  for (const record of readPids().filter(r => r.role === 'player' && r.gameId)) {
    const id = record.gameId!;
    const game = schedule.games.find(g => g.gameId === id);
    if (!game || game.model !== 'luna' || haltedLuna.has(id)) continue;
    haltedLuna.add(id);
    ensureGameDirs(id);
    writeJson(`${playerDir(id)}/quota-halt.json`, { at: new Date().toISOString(), detail: quota.detail });
    signalGroup(record.pid);
    appendFileSync(join(CAMPAIGN_DIR, 'admission.log'), `${new Date().toISOString()} Luna game ${id} halted mid-game (provider interruption, billing-safety stop): ${quota.detail}\n`);
  }
}
async function tick(schedule: Schedule): Promise<void> {
  if (existsSync(stopFilePath())) return;
  const ids = scopeIds();
  const snapshot: StatusSnapshot = Object.fromEntries(ALL_GAME_IDS.map(id => [id, ids.includes(id) ? readStatus(id).state : 'finished'])) as StatusSnapshot;
  const gate = await launchGateStatus();
  if (!gate.ok) { writeFileAtomic(join(CAMPAIGN_DIR, 'launch-gate.txt'), `${new Date().toISOString()} CLOSED: ${gate.detail}\n`); return; }
  const health = currentSiteHealth();
  if (!health.ok) { appendFileSync(join(CAMPAIGN_DIR, 'admission.log'), `${new Date().toISOString()} site degraded, not admitting: ${health.detail}\n`); return; }
  await enforceLunaQuota(schedule);
  for (const model of ['luna', 'sonnet'] as const) {
    if (model === 'luna') {
      const quota = await gptQuotaOk();
      if (!quota.ok) { appendFileSync(join(CAMPAIGN_DIR, 'admission.log'), `${new Date().toISOString()} Luna held: ${quota.detail}\n`); continue; }
    }
    const cap = perModelCap(finishedSinceRamp(model, schedule));
    while (activeCountFor(model, snapshot) < cap) {
      const id = nextAdmissible(model, snapshot);
      if (!id) break;
      const game = schedule.games.find(g => g.gameId === id)!;
      // Review findings (blocker: isolation; major: no compute cap): tool-builder players get
      // Bash/workspace-write shell access with no real sandbox (same-user file permissions do not
      // stop them reading the campaign's secrets or the engine source) AND no CPU/heavy-slot cap
      // on whatever they run there. Neither is implemented; hold P07/P08 out of the 16 until both
      // are, per the findings' own "at minimum" floor. MUJU_PILOT_ALLOW_TOOL_BUILDER=1 is the
      // explicit, deliberate override once both exist (never set by default).
      if (game.toolTier === 'tool-builder' && process.env.MUJU_PILOT_ALLOW_TOOL_BUILDER !== '1') {
        if (readStatus(id).detail !== 'tool-builder-held') {
          appendFileSync(join(CAMPAIGN_DIR, 'admission.log'),
            `${new Date().toISOString()} ${id} NOT admitted: tool-builder tier has no verified sandbox isolation `
            + '(secrets/engine-source readable same-user); set MUJU_PILOT_ALLOW_TOOL_BUILDER=1 once fixed.\n');
          writeStatus(id, 'pending', 'tool-builder-held');
        }
        break; // held, not admitted; stop this model's admission loop for this tick (queue order preserved)
      }
      snapshot[id] = 'preparing';
      appendFileSync(join(CAMPAIGN_DIR, 'admission.log'), `${new Date().toISOString()} admit ${id}\n`);
      inflight.set(id, runGame(game, false).finally(() => inflight.delete(id)));
    }
  }
}

/** Samples the machine-wide heavy slots so the two-search cap is observable in the campaign dir. */
function sampleHeavySlots(): void {
  const held = readSlots().filter(s => s.record && !s.stale).map(s => ({ index: s.index, pid: s.record!.pid, label: s.record!.label }));
  appendFileSync(join(CAMPAIGN_DIR, 'heavy-slots.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), cap: slotCount(), held })}\n`);
}

async function ensurePreflight(): Promise<void> {
  const path = join(CAMPAIGN_DIR, 'preflight.json');
  const existing = readJson<{ at: string }>(path);
  if (existing && Date.now() - Date.parse(existing.at) < PREFLIGHT_MAX_AGE_MS) return;
  await preflight();
}
async function preflight(): Promise<void> {
  const probeWorkspace = '/tmp/muju-llm-pilot/preflight';
  const { mkdirSync } = await import('node:fs');
  mkdirSync(probeWorkspace, { recursive: true });
  const result = await runAuthPreflight({ claudeModel: MODEL_CLI_ID.sonnet, codexModel: MODEL_CLI_ID.luna, codexEffort: 'low', probeWorkspace });
  const record = { at: new Date().toISOString(), claude: { authMethod: result.claude.authMethod, probe: result.claude.probe }, codex: result.codex };
  ensureCampaignDirs();
  writeJson(join(CAMPAIGN_DIR, 'preflight.json'), record);
  console.log(JSON.stringify(record, null, 2));
}

async function runLoop(): Promise<void> {
  ensureCampaignDirs();
  const other = readPids().find(r => r.role === 'dispatcher' && r.pid !== process.pid && pidAlive(r.pid));
  if (other) throw new Error(`Another dispatcher (pid ${other.pid}) is running for ${CAMPAIGN_DIR}; refusing to start a second one.`);
  trackPid({ pid: process.pid, role: 'dispatcher', startedAt: new Date().toISOString() });
  process.once('SIGTERM', () => { stopping = true; process.exit(0); });
  process.once('SIGINT', () => { stopping = true; process.exit(0); });
  if (isSmoke()) assertSmokeDir();
  await ensurePreflight();
  const schedule = loadOrInitSchedule();
  if (isSmoke()) {
    const handicap = argValue('--handicap');
    for (const g of schedule.games) if (handicap !== undefined && scopeIds().includes(g.gameId)) g.blackCrystalHandicap = Number(handicap);
  }
  saveSchedule(schedule);
  // Re-attach whatever a previous dispatcher left in flight. Never re-join a seat.
  for (const id of scopeIds()) {
    const status = readStatus(id);
    if (status.state !== 'live' && status.state !== 'preparing') continue;
    const game = schedule.games.find(g => g.gameId === id)!;
    if (!existsSync(`${gameDir(id)}/prep.json`) || !existsSync(seatSecretPath(id))) {
      writeStatus(id, 'interrupted', `dispatcher stopped during preparation (${status.detail ?? ''}); room/seat uncertain, not re-joined — see prep.partial.json`);
      continue;
    }
    appendFileSync(join(CAMPAIGN_DIR, 'admission.log'), `${new Date().toISOString()} re-attach ${id}\n`);
    inflight.set(id, runGame(game, true).finally(() => inflight.delete(id)));
  }
  const sampler = setInterval(sampleHeavySlots, 2000);
  for (;;) {
    await tick(schedule);
    refreshProgress();
    const settled = scopeIds().every(id => gameIsSettled(readStatus(id).state));
    if (inflight.size === 0 && (settled || existsSync(stopFilePath()))) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  clearInterval(sampler);
  untrackPid('dispatcher');
  refreshProgress();
  console.log(existsSync(stopFilePath()) ? 'STOP present and no games in flight; dispatcher exiting.' : 'All scheduled games settled.');
}

// ---------------------------------------------------------------------------
// --kill / --status / --dry-run
// ---------------------------------------------------------------------------
function kill(): void {
  const records = readPids();
  // Dispatcher first, so it cannot react to its children dying by finishing/marking games.
  for (const role of ['dispatcher', 'player', 'engine-seat'] as const) {
    for (const record of records.filter(r => r.role === role)) {
      const ok = pidAlive(record.pid) && signalGroup(record.pid);
      console.log(`${ok ? 'SIGTERM sent to' : 'not running:'} ${role} pid ${record.pid}${record.gameId ? ` (${record.gameId})` : ''}`);
    }
  }
  writeJson(pidsJsonPath(), []);
  console.log('Game statuses, journals and transcripts are preserved; `--resume` re-attaches (engine from its journal, player by resuming its CLI session).');
}
async function status(): Promise<void> {
  refreshProgress();
  const gate = await launchGateStatus();
  console.log(`Launch gate: ${gate.ok ? 'OPEN' : 'CLOSED'} — ${gate.detail}`);
  console.log(`Site health: ${currentSiteHealth().detail}; GPT quota: ${(await gptQuotaOk()).detail}`);
  const held = readSlots().filter(s => s.record && !s.stale);
  console.log(`Heavy slots: ${held.length}/${slotCount()} held${held.length ? ` (${held.map(s => s.record!.label).join(', ')})` : ''}`);
  const live = readPids().filter(r => pidAlive(r.pid));
  console.log(`Processes: ${live.map(r => `${r.role}${r.gameId ? `:${r.gameId}` : ''}=${r.pid}`).join(' ') || 'none'}${existsSync(stopFilePath()) ? ' · STOP present' : ''}\n`);
  console.log(readFileSync(progressMdPath(), 'utf8'));
}
function dryRun(): void {
  const schedule = buildSchedule();
  console.log('Schedule (16 games):');
  for (const g of schedule.games) console.log(`  ${g.gameId}  model=${g.model} tier=${g.toolTier} effort=${g.effort} handicap=${g.blackCrystalHandicap} llmSeat=${g.llmSeat}`);
  console.log('\nAdmission order (2-per-model concurrency, started-pair-remaining-leg priority):');
  for (const id of admissionTrace()) console.log(`  ${id}`);
  console.log('\nNo network calls or processes were started (--dry-run).');
}

async function main(): Promise<void> {
  if (argv.includes('--dry-run')) return dryRun();
  if (argv.includes('--kill')) return kill();
  if (argv.includes('--status')) return status();
  if (argv.includes('--preflight')) return preflight();
  return runLoop(); // plain run and --resume both re-attach in-flight games first
}
const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });/** Games of this model whose status turned terminal after MUJU_PILOT_RAMP_FROM (see perModelCap). */
function finishedSinceRamp(model: string, schedule: Schedule): number {
  const from = process.env.MUJU_PILOT_RAMP_FROM;
  if (!from) return 0;
  const since = Date.parse(from);
  return schedule.games.filter(g => g.model === model).filter(g => {
    const status = readStatus(g.gameId) as { state: string; updatedAt?: string };
    return ['finished', 'failed', 'interrupted'].includes(status.state) && Date.parse(status.updatedAt ?? '') > since;
  }).length;
}

