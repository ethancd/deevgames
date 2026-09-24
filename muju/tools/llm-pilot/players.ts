/**
 * Player adapters (SPEC.md Component C). Runs ONE CLI session per game that plays Muju to completion
 * against the frozen Hard engine through the room-scoped gateway (Component B), then — same session,
 * same effort — writes a reflection. See prompts/player.md and prompts/reflection.md.
 *
 * Durable and re-attachable: every CLI phase is spawned DETACHED with stdout/stderr written straight
 * to files under `<gameDir>/player/`, and the phase list (pid, transcript, session id, workspace) is
 * persisted to `player/state.json` before and after each phase. A dispatcher that dies or is killed
 * does not take the player with it; `runPlayer` called again for the same game (dispatch --resume)
 * waits for a still-running phase by pid, or — if the phase died — resumes the SAME CLI session
 * (`claude --resume` / `codex exec resume`) with a continuation prompt. It never re-joins a seat and
 * never replays a move itself: the gateway's deterministic requestIds make a retried play idempotent.
 *
 * A session that stops while the room is still `playing` (the model ended its turn early, a timeout,
 * a kill) gets up to `maxContinuations` resumed "keep playing" phases before the game is reported
 * failed. The reflection runs only once the authoritative room reports a terminal phase.
 */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CODEX_BIN, readCodexRollout, stripApiKeys } from './auth';
import { sumHelperCpuSeconds } from './sandbox';
import { prepareReflectionFacts } from './facts';
import {
  PILOT_TIME_CONTROL,
  MODEL_CLI_ID, MODEL_FAMILY, pairById, parseGameId, readJson, writeJson,
  type Effort, type GameId, type ModelId, type Seat, type ToolTier,
} from './pilot';

export type PlayerKind = 'claude' | 'codex';
export type Phase = 'play' | 'continue' | 'reflect';

/** The room clock this game was admitted with (manifest.json), for the prompt, plus the prompt's
 * per-turn cap: the free delay and a tenth of the bank (the cap the prompt asks for on turn 1). */
export function clockVars(gameDir: string): { delaySeconds: string; bankSeconds: string; bankTenthSeconds: string; turnCapSeconds: string } {
  let clock = PILOT_TIME_CONTROL;
  try { clock = JSON.parse(readFileSync(path.join(gameDir, 'manifest.json'), 'utf8')).timeControl ?? clock; } catch { /* not yet written */ }
  const bankTenth = Math.floor(clock.bankSeconds / 10);
  return { delaySeconds: String(clock.delaySeconds), bankSeconds: String(clock.bankSeconds),
    bankTenthSeconds: String(bankTenth), turnCapSeconds: String(clock.delaySeconds + bankTenth) };
}
/** Identity fields the reflection template asks for, from manifest.json (no secrets). */
function identityVars(gameDir: string): { engineIdentity: string; snapshotVersion: string } {
  try {
    const manifest = JSON.parse(readFileSync(path.join(gameDir, 'manifest.json'), 'utf8'));
    const engine = manifest.engine ?? {};
    return { snapshotVersion: `v${manifest.snapshotVersion ?? '?'}`,
      engineIdentity: `${engine.name ?? 'Hard'} ${engine.profile ?? ''} ${engine.targetMs ?? '?'}ms target / ${engine.deadlineMs ?? '?'}ms deadline, rules ${engine.rulesId ?? '?'}, source ${String(engine.sourceSha256 ?? '?').slice(0, 12)}` };
  } catch { return { engineIdentity: 'unknown', snapshotVersion: 'unknown' }; }
}

export interface RunPlayerArgs {
  gameDir: string;
  gameId: GameId;
  model: ModelId;
  effort: Effort;
  tier: ToolTier;
  seat: Seat;
  /** Frozen memory snapshot directory for this pair (logged for cross-checking; the gateway's
   * `pilot_memory` resolves the snapshot from manifest.json's `snapshotVersion`). */
  snapshotDir: string;
  brief: string;
  /** Overrides the pair table's handicap in the prompt (smoke runs only). */
  handicap?: number;
  gatewayPath?: string;
  workspaceRoot?: string;
  reflectionTemplatePath?: string;
  /** Ceiling per play/continue phase (ms). Default 3h. */
  playTimeoutMs?: number;
  reflectTimeoutMs?: number;
  /** Resumed "keep playing" phases allowed after the first play phase. Default 6. */
  maxContinuations?: number;
  /** Authoritative terminal check. Defaults to reading the room with `secrets/seat.json`. */
  isGameOver?: () => Promise<boolean>;
  /** Called with each spawned phase's pid (process-group leader) so the dispatcher can --kill it. */
  onSpawn?: (pid: number) => void;
  /** Play→reflect hook: writes the game's fact sheet (facts.json/facts.md) and copies facts.md into
   * the workspace; resolves false on failure (the reflection proceeds anyway). Default: facts.ts. */
  prepareFacts?: (workspace: string) => Promise<boolean>;
}

export interface PlayerResult {
  outcome: 'completed' | 'failed';
  turns: number;
  citedRevisions: number[];
  reflectionText: string;
  detail?: string;
}

const REPO_SRC_ROOT = '/Users/ashkie/src';
/** What the model passes as `token` (the schema needs 32–128 chars); the gateway replaces it. */
export const PLACEHOLDER_TOKEN = 'gateway-supplies-the-real-seat-token-0000';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GATEWAY_PATH = path.join(HERE, 'gateway.ts');
const DEFAULT_REFLECTION_TEMPLATE = path.resolve(HERE, '../../../outputs/muju-llm-opponent-campaign-2026-09-23/reflection-template.md');
/** Absolute ESM loader URL: the gateway is launched from the player's workspace (outside the repo),
 * where a bare `--import tsx` would not resolve. */
const TSX_LOADER = import.meta.resolve('tsx');

export function playerKindForModel(model: ModelId): PlayerKind {
  if (Object.hasOwn(MODEL_FAMILY, model)) return MODEL_FAMILY[model];
  throw new Error(`Unknown model id "${model}": cannot pick a CLI for it. Never substitute a different model silently.`);
}
function billingRouteFor(kind: PlayerKind) { return kind === 'claude' ? 'claude.ai subscription' : 'ChatGPT subscription'; }

/** Built-in tools per tier (claude). The gateway itself enforces the Muju tool tier.
 * `tool-builder` gets NO native shell: a bare `Bash` tool has no read restriction at all (it
 * would see anything the operator's own account can, including /Users/ashkie/src and every
 * game's secrets/), so tool-builder's "write and run your own helper code" instead goes through
 * the gateway's `muju_run_helper`/`muju_write_file` MCP tools (sandbox.ts), never a real shell. */
export function claudeToolsFor(_tier: ToolTier): string[] {
  return ['Read', 'Write'];
}
/** Codex sandbox mode: `read-only` for every tier. `workspace-write` restricts WRITES to the
 * workspace but leaves READS unrestricted (verified live), so it is never used even for
 * tool-builder — that tier has no exec/shell tool at all (see `CODEX_SHELL_FEATURES` below) and
 * writes its own files through the gateway's `muju_write_file` MCP tool instead. */
export function codexSandboxFor(_tier: ToolTier): 'read-only' | 'workspace-write' {
  return 'read-only';
}
/** The exact command a player CLI uses to launch this game's gateway.
 * `includeGameDirArg: false` omits `--game-dir` from argv (the gateway then requires
 * `MUJU_PILOT_GAME_DIR` in its own process env instead) — used for real pilot games so the
 * absolute path to the game's `secrets/` never appears in a player-readable file (Claude writes
 * `--mcp-config`'s JSON straight into the workspace, where the tier's own `Read` tool can open
 * it). Defaults to true (unchanged) for policy-check.ts/tests, which spawn the gateway directly
 * and are not a player-readable surface. */
export function gatewayCommand(gameDir: string, gatewayPath = DEFAULT_GATEWAY_PATH, opts: { includeGameDirArg?: boolean } = {}): { command: string; args: string[] } {
  const args = ['--import', TSX_LOADER, gatewayPath];
  if (opts.includeGameDirArg ?? true) args.push('--game-dir', gameDir);
  return { command: process.execPath, args };
}

/** `claude -p` arguments. (`--safe-mode` is NOT used: it also drops `--mcp-config` servers, verified
 * live.) `--strict-mcp-config` keeps only the gateway; `--tools` leaves only Read/Write(/Bash), so no
 * Skill/Agent/Web tools; `--restricted` ignores user/project settings and confines file tools to the workspace; `dontAsk` +
 * `--permission-prompts none` denies anything not in `--allowedTools`. A fresh play phase pins its
 * own `--session-id` so the id is durable before the CLI prints anything. Never `--bare` (it skips
 * the subscription credentials). */
export function claudeArgs(opts: { prompt: string; model: string; effort: string; cwd: string; mcpConfigPath: string; tier: ToolTier; resumeSessionId?: string; sessionId?: string }): string[] {
  const tools = claudeToolsFor(opts.tier);
  return [
    '-p', opts.prompt, '--model', opts.model, '--effort', opts.effort,
    '--output-format', 'stream-json', '--verbose',
    '--mcp-config', opts.mcpConfigPath, '--strict-mcp-config',
    '--restricted', '--tools', tools.join(','), '--add-dir', opts.cwd,
    '--allowedTools', ['mcp__muju', ...tools].join(','),
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    ...(opts.resumeSessionId ? ['--resume', opts.resumeSessionId] : opts.sessionId ? ['--session-id', opts.sessionId] : []),
  ];
}
function toml(value: string | string[]): string {
  return Array.isArray(value) ? `[${value.map(v => JSON.stringify(v)).join(',')}]` : JSON.stringify(value);
}
/** `codex exec` arguments. ChatGPT login forced; the operator's ~/.codex/config.toml (its own MCP
 * servers, plugins, node_repl, computer-use) and exec-policy rules are ignored so the player sees
 * only the gateway; gateway tools are auto-approved since exec mode has nobody to answer a prompt. */
/** Codex feature names (verified live via `codex features list`) that, if left on, give a player
 * shell/command execution independent of the MCP gateway's tool-tier scoping — a `bare` seat could
 * `cat` the repo's Hard-engine source, the campaign's secrets/seat.json (same-user file
 * permissions do not block this), or run local analysis the tier is supposed to lack. Disabled for
 * EVERY tier including `tool-builder` (review fix: `workspace-write` sandbox restricts writes to
 * the workspace but leaves reads unrestricted, so a native shell under it could still `cat`
 * anything readable by the operator's account). tool-builder's own local code runs only through
 * the gateway's sandboxed `muju_run_helper`/`muju_write_file` MCP tools (sandbox.ts), never this. */
const CODEX_SHELL_FEATURES = ['shell_tool', 'unified_exec', 'unified_exec_tty', 'multi_agent', 'multi_agent_v2'];
export function codexArgs(opts: { prompt: string; model: string; effort: string; cwd: string; gameDir: string; gatewayPath?: string; tier: ToolTier; resumeSessionId?: string; gatewayEnv?: Record<string, string> }): string[] {
  const gateway = gatewayCommand(opts.gameDir, opts.gatewayPath, { includeGameDirArg: false });
  // Codex does not pass its own env through to MCP servers, so hand the gateway its dirs
  // explicitly (process argv only; never written into the player's workspace).
  const gatewayEnv = opts.gatewayEnv ?? { MUJU_PILOT_GAME_DIR: opts.gameDir, MUJU_PILOT_WORKSPACE_DIR: opts.cwd };
  const envTable = `{${Object.entries(gatewayEnv).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(',')}}`;
  const common = [
    '-m', opts.model,
    '-c', `model_reasoning_effort=${toml(opts.effort)}`,
    '-c', `forced_login_method=${toml('chatgpt')}`,
    '-c', `mcp_servers.muju.command=${toml(gateway.command)}`,
    '-c', `mcp_servers.muju.args=${toml(gateway.args)}`,
    '-c', `mcp_servers.muju.env=${envTable}`,
    '-c', 'mcp_servers.muju.startup_timeout_sec=150',
    '-c', 'mcp_servers.muju.tool_timeout_sec=900',
    '-c', `mcp_servers.muju.default_tools_approval_mode=${toml('approve')}`,
    '-c', `sandbox_mode=${toml(codexSandboxFor(opts.tier))}`,
    '--ignore-user-config', '--ignore-rules', '--json', '--skip-git-repo-check',
    ...CODEX_SHELL_FEATURES.flatMap(feature => ['--disable', feature]),
  ];
  return opts.resumeSessionId
    ? ['exec', 'resume', ...common, opts.resumeSessionId, opts.prompt]
    : ['exec', ...common, '-C', opts.cwd, '--sandbox', codexSandboxFor(opts.tier), opts.prompt];
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in vars)) throw new Error(`Prompt template references unknown var "${key}"`);
    return vars[key];
  });
}
export async function ensureOutsideRepo(dir: string): Promise<void> {
  const resolved = path.resolve(dir);
  if (resolved === REPO_SRC_ROOT || resolved.startsWith(`${REPO_SRC_ROOT}${path.sep}`)) {
    throw new Error(`Player workspace "${resolved}" resolves under ${REPO_SRC_ROOT}; isolation requires a workspace outside the repo tree.`);
  }
}

/** Revisions cited in reflection prose ("revision 12", "revision #42", "revisions 12, 14 and 19", "rev 7"). */
export function extractCitedRevisions(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(/\brevisions?\b[^\d]{0,12}(\d+(?:\s*(?:,|and|to|-|–)\s*\d+)*)/gi)) {
    for (const n of match[1].matchAll(/\d+/g)) found.add(Number(n[0]));
  }
  for (const match of text.matchAll(/\brev\.?\s*#?(\d+)/gi)) found.add(Number(match[1]));
  return [...found].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Transcript parsing (after a phase exits, or on re-attach)
// ---------------------------------------------------------------------------
interface UsageTotals {
  inputTokens: number; outputTokens: number; cacheReadInputTokens: number;
  cacheCreationInputTokens: number; reasoningOutputTokens: number;
  /** Claude Code's list-price figure; NOT a bill under subscription auth (apiKeySource "none"). */
  notionalCostUsd: number | null;
}
export interface TranscriptSummary {
  sessionId: string | null; reportedModels: string[]; apiKeySource: string | null; finalText: string;
  totals: UsageTotals; rateLimitInfo?: unknown; auditFlags: string[]; toolCalls: number; isError: boolean;
}
export function parseTranscript(kind: PlayerKind, raw: string): TranscriptSummary {
  const summary: TranscriptSummary = {
    sessionId: null, reportedModels: [], apiKeySource: null, finalText: '', toolCalls: 0, isError: false, auditFlags: [],
    totals: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, reasoningOutputTokens: 0, notionalCostUsd: null },
  };
  const models = new Set<string>();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    if (line.includes(REPO_SRC_ROOT)) summary.auditFlags.push(line.length > 400 ? `${line.slice(0, 400)}…` : line);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: Record<string, any>;
    try { event = JSON.parse(line); } catch { continue; }
    if (kind === 'claude') {
      if (event.type === 'system' && event.subtype === 'init') {
        if (typeof event.session_id === 'string') summary.sessionId = event.session_id;
        if (typeof event.apiKeySource === 'string') summary.apiKeySource = event.apiKeySource;
      }
      if (event.type === 'rate_limit_event') summary.rateLimitInfo = event.rate_limit_info ?? event;
      if (event.type === 'assistant') {
        for (const block of event.message?.content ?? []) if (block?.type === 'tool_use') summary.toolCalls += 1;
      }
      if (event.type === 'result') {
        const usage = event.usage ?? {};
        summary.totals.inputTokens += usage.input_tokens ?? 0;
        summary.totals.outputTokens += usage.output_tokens ?? 0;
        summary.totals.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
        summary.totals.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
        if (typeof event.total_cost_usd === 'number') summary.totals.notionalCostUsd = (summary.totals.notionalCostUsd ?? 0) + event.total_cost_usd;
        for (const model of Object.keys(event.modelUsage ?? {})) models.add(model);
        if (typeof event.result === 'string') summary.finalText = event.result;
        summary.isError = Boolean(event.is_error);
      }
    } else {
      if (event.type === 'thread.started' && typeof event.thread_id === 'string') summary.sessionId = event.thread_id;
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') summary.finalText = event.item.text;
      if (event.type === 'item.started' && event.item?.type === 'mcp_tool_call') summary.toolCalls += 1;
      if (event.type === 'turn.completed') {
        const usage = event.usage ?? {};
        summary.totals.inputTokens += usage.input_tokens ?? 0;
        summary.totals.outputTokens += usage.output_tokens ?? 0;
        summary.totals.cacheReadInputTokens += usage.cached_input_tokens ?? 0;
        summary.totals.cacheCreationInputTokens += usage.cache_write_input_tokens ?? 0;
        summary.totals.reasoningOutputTokens += usage.reasoning_output_tokens ?? 0;
      }
      if (event.type === 'turn.failed' || event.type === 'error') summary.isError = true;
    }
  }
  summary.reportedModels = [...models];
  return summary;
}

// ---------------------------------------------------------------------------
// Durable phase bookkeeping
// ---------------------------------------------------------------------------
interface PhaseRecord {
  phase: Phase; transcript: string; pid: number; startedAt: string;
  endedAt?: string; exitCode?: number | null; lost?: boolean; sessionId?: string | null;
  reportedModels?: string[]; apiKeySource?: string | null; totals?: UsageTotals; rateLimitInfo?: unknown;
  toolCalls?: number; elapsedMs?: number; billingRoute: string;
}
interface PlayerState { gameId: GameId; kind: PlayerKind; cliModel: string; workspace: string; sessionId: string | null; phases: PhaseRecord[] }

export function pidAlive(pid: number): boolean {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
async function waitForPid(pid: number, pollMs = 2000): Promise<void> {
  while (pidAlive(pid)) await new Promise(resolve => setTimeout(resolve, pollMs));
}

/** Spawns a detached CLI phase with stdout -> transcript file; resolves with its exit code.
 * `extraEnv` is merged in AFTER `stripApiKeys()` (never the reverse — it must never reintroduce a
 * forbidden var) — used to hand the gateway subprocess `MUJU_PILOT_GAME_DIR`/`MUJU_PILOT_WORKSPACE_DIR`
 * via inherited process env, so those absolute paths never have to appear in a player-readable
 * file (`gatewayCommand`'s `includeGameDirArg: false`). */
function spawnPhase(command: string, args: string[], cwd: string, transcript: string, timeoutMs: number, onPid: (pid: number) => void, extraEnv: Record<string, string> = {}): Promise<number | null> {
  const { env } = stripApiKeys();
  Object.assign(env, extraEnv);
  const out = openSync(transcript, 'a'), err = openSync(`${transcript}.stderr`, 'a');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', out, err] });
    closeSync(out); closeSync(err);
    if (child.pid) onPid(child.pid);
    const timer = setTimeout(() => { try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* already gone */ } }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
}

async function defaultIsGameOver(gameDir: string): Promise<boolean> {
  const seat = JSON.parse(readFileSync(path.join(gameDir, 'secrets', 'seat.json'), 'utf8')) as { serverUrl: string; roomId: string; seatToken: string };
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${seat.serverUrl}/api/muju/rooms/${seat.roomId}`, { headers: { Authorization: `Bearer ${seat.seatToken}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const room = await response.json() as { state: { phase: string } };
      return room.state.phase !== 'playing';
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
}

async function countTurnsFromActionsLog(logPath: string): Promise<number> {
  let raw: string;
  try { raw = await readFile(logPath, 'utf8'); } catch { return 0; }
  let turns = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as { actions?: Array<{ type?: string }> };
      if (entry.actions?.some(action => action.type === 'END_PLACE_PHASE' || action.type === 'RESIGN')) turns += 1;
    } catch { /* skip malformed line */ }
  }
  return turns;
}

/** How long the room may stay unreadable (network outage) before the player gives up. */
const OUTAGE_PATIENCE_MS = 6 * 60 * 60 * 1000;
/** A CLI phase shorter than this is treated as a fast failure (provider/network), not a choice. */
const SHORT_PHASE_MS = 3 * 60 * 1000;
/** Consecutive fast-failing phases tolerated (with 15s..120s backoff between them: ~1h). */
const MAX_SHORT_PHASES = 30;

const CONTINUE_PROMPT = `The Muju game in this session is NOT over yet: the authoritative room is still playing.
Re-orient with muju_observe (and muju_clock), then keep playing exactly as instructed at the start of this
session — use muju_wait_for_change while the engine is on move, and continue until muju_play or
muju_wait_for_change reports a terminal result. Any muju_play you already sent was recorded; if you are
unsure whether a play landed, observe first — a retried identical play is idempotent. Time kept running
while this session was down: read the clock before anything else and keep to the per-turn cap from the start
of the session. Do not write the reflection yet.`;

/** Plays (or re-attaches to) one whole game, then writes the reflection. See the file header. */
export async function runPlayer(args: RunPlayerArgs): Promise<PlayerResult> {
  const kind = playerKindForModel(args.model);
  const cliModel = MODEL_CLI_ID[args.model];
  const artifactDir = path.join(args.gameDir, 'player');
  await mkdir(artifactDir, { recursive: true });
  const statePath = path.join(artifactDir, 'state.json');
  const existing = readJson<PlayerState>(statePath);
  if (existing && (existing.kind !== kind || existing.cliModel !== cliModel)) throw new Error(`player/state.json is for ${existing.cliModel}, not ${cliModel}; refusing to mix sessions.`);
  const state: PlayerState = existing ?? {
    gameId: args.gameId, kind, cliModel, sessionId: null, phases: [],
    workspace: path.join(args.workspaceRoot ?? path.join(os.tmpdir(), 'muju-llm-pilot'), `${args.gameId}-player-${randomUUID().slice(0, 8)}`),
  };
  const save = () => writeJson(statePath, state);
  const workspace = state.workspace;
  await ensureOutsideRepo(workspace);
  await mkdir(workspace, { recursive: true });
  save();

  const handicap = args.handicap ?? pairById(parseGameId(args.gameId).pairId).blackCrystalHandicap;
  const { roomId } = JSON.parse(readFileSync(path.join(args.gameDir, 'secrets', 'seat.json'), 'utf8')) as { roomId: string };
  const vars = { gameId: args.gameId, roomId, placeholderToken: PLACEHOLDER_TOKEN, seat: args.seat, seatColor: args.seat === 'white' ? 'White' : 'Black',
    handicap: String(handicap), tier: args.tier, model: cliModel, effort: args.effort, brief: args.brief,
    ...clockVars(args.gameDir), ...identityVars(args.gameDir) };
  const templatePath = args.reflectionTemplatePath ?? DEFAULT_REFLECTION_TEMPLATE;
  await writeFile(path.join(workspace, 'reflection-template.md'), await readFile(templatePath, 'utf8'), 'utf8');
  const playPrompt = renderTemplate(await readFile(path.join(HERE, 'prompts', 'player.md'), 'utf8'), vars);
  const reflectPrompt = renderTemplate(await readFile(path.join(HERE, 'prompts', 'reflection.md'), 'utf8'), vars);
  // `includeGameDirArg: false`: the gateway learns gameDir/workspace from this CLI phase's own
  // process env (set below on every spawnPhase call, inherited by the gateway subprocess), never
  // from an argv baked into mcp-config.json — that file sits in the workspace where even a
  // `tool-builder` seat's (unrestricted-outside-workspace) `Read` tool can open it, and the
  // absolute path to `secrets/` (seat tokens, the engine's own token) must never be discoverable
  // there (review finding).
  const gateway = gatewayCommand(args.gameDir, args.gatewayPath, { includeGameDirArg: false });
  const mcpConfigPath = path.join(workspace, 'mcp-config.json');
  await writeFile(mcpConfigPath, JSON.stringify({ mcpServers: { muju: { command: gateway.command, args: gateway.args } } }, null, 2), 'utf8');
  const gatewayEnv = { MUJU_PILOT_GAME_DIR: args.gameDir, MUJU_PILOT_WORKSPACE_DIR: workspace };
  const isGameOver = args.isGameOver ?? (() => defaultIsGameOver(args.gameDir));
  const maxContinuations = args.maxContinuations ?? 8;

  const finishPhase = async (record: PhaseRecord, exitCode: number | null, lost = false) => {
    const summary = parseTranscript(kind, existsSync(record.transcript) ? await readFile(record.transcript, 'utf8') : '');
    let reportedModels = summary.reportedModels, rateLimitInfo = summary.rateLimitInfo;
    if (kind === 'codex' && summary.sessionId) {
      const rollout = await readCodexRollout(summary.sessionId);
      if (rollout) { reportedModels = rollout.models; rateLimitInfo = rollout.rateLimits ?? rateLimitInfo; }
    }
    const endedAt = new Date().toISOString();
    Object.assign(record, { endedAt, exitCode, lost, sessionId: summary.sessionId, reportedModels,
      apiKeySource: summary.apiKeySource, totals: summary.totals, rateLimitInfo, toolCalls: summary.toolCalls,
      elapsedMs: Date.parse(endedAt) - Date.parse(record.startedAt) });
    state.sessionId ??= summary.sessionId;
    if (summary.auditFlags.length > 0) {
      await appendFile(path.join(artifactDir, 'audit.log'), summary.auditFlags.map(line => `${endedAt} [${record.phase}] ${line}\n`).join(''), 'utf8');
    }
    save();
  };
  const runPhase = async (phase: Phase, prompt: string, timeoutMs: number) => {
    const index = state.phases.filter(p => p.phase === phase).length;
    const transcript = path.join(artifactDir, `transcript.${phase}${index ? `-${index + 1}` : ''}.jsonl`);
    const record: PhaseRecord = { phase, transcript, pid: -1, startedAt: new Date().toISOString(), billingRoute: billingRouteFor(kind) };
    state.phases.push(record);
    save();
    const resumeSessionId = phase === 'play' ? undefined : state.sessionId ?? undefined;
    if (phase === 'play' && kind === 'claude') { state.sessionId = randomUUID(); save(); }
    const [command, cliArgs] = kind === 'claude'
      ? ['claude', claudeArgs({ prompt, model: cliModel, effort: args.effort, cwd: workspace, mcpConfigPath, tier: args.tier, resumeSessionId, sessionId: state.sessionId ?? undefined })]
      : [CODEX_BIN, codexArgs({ prompt, model: cliModel, effort: args.effort, cwd: workspace, gameDir: args.gameDir, gatewayPath: args.gatewayPath, tier: args.tier, resumeSessionId, gatewayEnv })];
    const exitCode = await spawnPhase(command, cliArgs, workspace, transcript, timeoutMs, pid => { record.pid = pid; save(); args.onSpawn?.(pid); }, gatewayEnv);
    await finishPhase(record, exitCode);
    return record;
  };

  // Re-attach: a phase recorded as started but never finished belongs to a previous dispatcher.
  const open = state.phases.find(p => !p.endedAt);
  if (open) {
    if (pidAlive(open.pid)) { args.onSpawn?.(open.pid); await waitForPid(open.pid); }
    await finishPhase(open, null, true);
  }

  let detail: string | undefined;
  const note = (text: string) => { detail = detail ? `${detail} ${text}` : text; };
  let consecutiveReadFailures = 0;
  let readFailingSince: number | undefined;
  const reflectionFile = path.join(workspace, 'reflection.md');
  const reflectionTextOf = async (phase: PhaseRecord | undefined): Promise<string> => {
    if (!phase) return '';
    if (existsSync(reflectionFile) && statSync(reflectionFile).mtimeMs >= Date.parse(phase.startedAt) - 1000) return readFile(reflectionFile, 'utf8');
    return parseTranscript(kind, existsSync(phase.transcript) ? await readFile(phase.transcript, 'utf8') : '').finalText.trim();
  };
  for (;;) {
    const reflects = state.phases.filter(p => p.phase === 'reflect' && p.endedAt);
    // A reflection lost to a provider/network failure is retried (same session) up to 3 times.
    if (reflects.length > 0 && ((await reflectionTextOf(reflects.at(-1))) || reflects.length >= 3)) break;
    if (reflects.length > 0) await new Promise(resolve => setTimeout(resolve, 60_000 * reflects.length));
    let over: boolean;
    try { over = await isGameOver(); consecutiveReadFailures = 0; readFailingSince = undefined; }
    catch (error) {
      // An unreadable room is an UNKNOWN state, not "the game is over" or "give up on this game" —
      // `isGameOver` (dispatch.ts's `readSeatRoom`) already retries internally; a failure reaching
      // here means that whole bounded retry was exhausted. Still worth a few more spaced attempts
      // before this game is reported failed, so one bad network minute cannot lose a real result
      // or its reflection (review finding).
      // A network outage is a pause, not a failure (the pilot lost three games to giving up after
      // five tries): keep retrying at a capped 60s backoff for up to OUTAGE_PATIENCE_MS; once the
      // network returns, the authoritative room says whether the game is still on.
      consecutiveReadFailures += 1;
      readFailingSince ??= Date.now();
      if (consecutiveReadFailures === 1 || consecutiveReadFailures % 10 === 0) note(`Could not read the room (attempt ${consecutiveReadFailures}): ${(error as Error).message}.`);
      if (Date.now() - readFailingSince > OUTAGE_PATIENCE_MS) {
        note(`Room unreadable for ${Math.round((Date.now() - readFailingSince) / 60000)} min; giving up.`);
        return { outcome: 'failed', turns: await countTurnsFromActionsLog(path.join(args.gameDir, "actions.jsonl")), citedRevisions: [], reflectionText: '', detail };
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(5000 * 2 ** Math.min(consecutiveReadFailures - 1, 4), 60_000)));
      continue;
    }
    if (over) {
      if (!state.sessionId) { note('Game ended but no CLI session id was captured; cannot reflect in the same session.'); break; }
      // Mechanical fact sheet for the reflection (facts.ts); never blocks the reflection.
      if (!(await (args.prepareFacts ?? (ws => prepareReflectionFacts(args.gameDir, ws)))(workspace))) note('Fact sheet unavailable (see player/facts.log); reflected without it.');
      await runPhase('reflect', reflectPrompt, args.reflectTimeoutMs ?? 15 * 60 * 1000);
      break;
    }
    if (!state.phases.some(p => p.phase === 'play')) { await runPhase('play', playPrompt, args.playTimeoutMs ?? 3 * 60 * 60 * 1000); continue; }
    if (!state.sessionId) { note('Play phase produced no session id; cannot resume it.'); break; }
    // A phase that dies within SHORT_PHASE_MS is almost always the provider or the network failing
    // fast (an outage), not the model choosing to stop; those get their own larger, backed-off
    // budget so an outage cannot burn the real continuation budget in a few minutes.
    const continued = state.phases.filter(p => p.phase === 'continue');
    const isShort = (p: PhaseRecord) => (p.elapsedMs ?? 0) < SHORT_PHASE_MS;
    const longContinuations = continued.filter(p => !isShort(p)).length;
    const lastPhase = state.phases.at(-1);
    let trailingShort = 0;
    for (const p of [...state.phases].reverse()) { if (p.phase === 'reflect' || !isShort(p)) break; trailingShort += 1; }
    if (longContinuations >= maxContinuations) { note(`Room still playing after ${longContinuations} resumed phases; giving up (game left to its clock).`); break; }
    if (trailingShort >= MAX_SHORT_PHASES) { note(`${trailingShort} consecutive phases failed within ${SHORT_PHASE_MS / 1000}s; giving up (game left to its clock).`); break; }
    if (lastPhase && isShort(lastPhase)) await new Promise(resolve => setTimeout(resolve, Math.min(15_000 * 2 ** Math.min(trailingShort - 1, 3), 120_000)));
    await runPhase('continue', CONTINUE_PROMPT, args.playTimeoutMs ?? 3 * 60 * 60 * 1000);
  }

  // Reflection text: the workspace file if the CLI could write one, else the final message.
  const reflectPhase = state.phases.filter(p => p.phase === 'reflect').at(-1);
  const reflectionText = await reflectionTextOf(reflectPhase);
  if (reflectPhase && !reflectionText) note('Reflection turn produced no text.');

  const billingViolations = state.phases.filter(p => p.apiKeySource && p.apiKeySource !== 'none').map(p => `${p.phase}:${p.apiKeySource}`);
  if (billingViolations.length) note(`BILLING ROUTE VIOLATION: claude reported apiKeySource ${billingViolations.join(', ')}.`);
  const wrongModel = [...new Set(state.phases.flatMap(p => p.reportedModels ?? []).filter(m => m !== cliModel))];
  if (wrongModel.length) note(`MODEL MISMATCH: served by ${wrongModel.join(', ')}, requested ${cliModel}.`);
  const auditPath = path.join(artifactDir, 'audit.log');
  const auditFlagCount = existsSync(auditPath) ? (await readFile(auditPath, 'utf8')).split('\n').filter(Boolean).length : 0;
  if (auditFlagCount) note(`${auditFlagCount} repo-path reference(s) in the player's stream; see player/audit.log.`);

  // tool-builder only: every sandboxed helper run's CPU seconds, recorded independently by the
  // gateway's `muju_run_helper` tool (sandbox.ts) to `player/helper-usage.jsonl`, folded into the
  // game's usage record here.
  const helperUsage = args.tier === 'tool-builder' ? sumHelperCpuSeconds(args.gameDir) : undefined;
  await writeFile(path.join(artifactDir, 'usage.json'), JSON.stringify({
    gameId: args.gameId, model: cliModel, kind, tier: args.tier, seat: args.seat, workspace, snapshotDir: args.snapshotDir,
    sessionId: state.sessionId, phases: state.phases, auditFlagCount, billingViolations, wrongModel, helperUsage,
  }, null, 2), 'utf8');

  const turns = await countTurnsFromActionsLog(path.join(args.gameDir, "actions.jsonl"));
  const outcome: PlayerResult['outcome'] = reflectionText.length > 0 && !billingViolations.length && !wrongModel.length ? 'completed' : 'failed';
  if (outcome === 'failed' && !detail) detail = 'No reflection was produced.';
  return { outcome, turns, citedRevisions: extractCitedRevisions(reflectionText), reflectionText, detail };
}

/** Best-effort cleanup of an ephemeral workspace once its artifacts are in gameDir. */
export async function cleanupWorkspace(workspace: string): Promise<void> {
  await ensureOutsideRepo(workspace);
  await rm(workspace, { recursive: true, force: true });
}
