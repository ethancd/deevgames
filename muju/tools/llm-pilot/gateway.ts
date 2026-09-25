// Room+seat-scoped stdio MCP gateway for one LLM pilot player (SPEC.md, Component B).
//
// Spawned by the player adapter as that model's MCP server:
//   node --import tsx tools/llm-pilot/gateway.ts --game-dir <dir>
// Reads `<gameDir>/secrets/seat.json` ({serverUrl, roomId, seatToken, tier}) and never prints
// its contents. Builds a MatchScope from the LIVE room (roomId + its immutable matchPolicy,
// server/matchScope.ts) and wraps an HTTP RoomBackend with `scopeBackend`/`createMcpServer`
// (server/mcp.ts) so only the configured tier's tools are ever registered — bare has no
// rules-oracle or analysis, harnessed adds rules-oracle, centaur adds hosted analysis,
// tool-builder keeps rules-oracle but never analysis (server/matchPolicy.ts already encodes
// exactly this per-capability split; nothing here re-derives it). create/join are refused by
// `scopeBackend` itself, so this gateway never registers those tools for any tier.
//
// Token injection: the seat token from secrets/seat.json is injected into every outgoing
// request regardless of what the model passed as `token` — the model never needs to see or
// remember the real seat token.
//
// Idempotent play: `muju_play`'s requestId is replaced with a deterministic hash of
// (roomId, expectedRevision, actions) before it reaches the server, so a model that retries an
// identical play after an uncertain network outcome can never double-submit even if it forgot
// to reuse its own requestId text. Every ACCEPTED muju_play is appended to
// `<gameDir>/actions.jsonl` with its resulting revision, the (deterministic) requestId and a
// hash of the resulting state.
//
// `pilot_memory` is a passive, read-only tool returning the pair's frozen memory snapshot
// (playbook + recent experiences) — never live advice.
//
// Throttle: outgoing HTTP calls are rate-limited to ~2 req/s and every call (latency, status)
// is logged to `<gameDir>/http.jsonl`; 429/5xx responses are retried with backoff and still
// logged on every attempt.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type RoomBackend } from '../../server/mcp';
import { RoomError, roomIdSchema, tokenSchema } from '../../server/schema';
import { matchScopeFor, type MatchScope } from '../../server/matchScope';
import type { RoomChange, RoomSnapshot } from '../../src/online/types';
import type { RoomMoveHistory } from '../../src/game/moveHistory';
import type { StagingResult, StagingStatus } from '../../src/online/staging';
import { runSandboxedHelper } from './sandbox';

export const seatConfigSchema = z.object({
  serverUrl: z.string().url().transform(value => value.replace(/\/$/, '')),
  roomId: roomIdSchema,
  seatToken: tokenSchema,
  tier: z.enum(['bare', 'harnessed', 'centaur', 'tool-builder']),
}).strict();
export type SeatConfig = z.infer<typeof seatConfigSchema>;
export type GatewayLog = (event: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Throttled, logged HTTP client (~2 req/s; retries 429/5xx with backoff).
// ---------------------------------------------------------------------------
/** Transport-failure retries per request (1s, 2s, 4s ... capped 30s: about 2.5 minutes). */
const TRANSPORT_RETRIES = 9;
export function createHttpClient(serverUrl: string, logHttp: GatewayLog, minIntervalMs = 500) {
  let nextAt = 0;
  async function request<T>(path: string, body?: unknown, token?: string, signal?: AbortSignal, timeoutMs = 10000, attempt = 0): Promise<T> {
    const wait = nextAt - Date.now();
    if (wait > 0) await delay(wait);
    nextAt = Date.now() + minIntervalMs;
    const method = body === undefined ? 'GET' : 'POST';
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(`${serverUrl}/api/muju/rooms${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      logHttp({ at: new Date().toISOString(), method, path, attempt, latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Request failed.' });
      // A transport failure (network loss, DNS, reset) is retried for ~2.5 min so a short outage
      // looks like a slow tool call, not an error the model gives up on. Plays are safe to repeat:
      // the requestId is deterministic and the server treats an identical retry as idempotent.
      if (signal?.aborted || attempt >= TRANSPORT_RETRIES) throw error;
      await delay(Math.min(30_000, 1000 * 2 ** attempt));
      return request<T>(path, body, token, signal, timeoutMs, attempt + 1);
    }
    const latencyMs = Date.now() - startedAt;
    logHttp({ at: new Date().toISOString(), method, path, attempt, status: response.status, latencyMs });
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await delay(Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250));
      return request<T>(path, body, token, signal, timeoutMs, attempt + 1);
    }
    const data = await response.json();
    if (!response.ok) throw new RoomError(response.status, data.code ?? String(response.status), data.error ?? 'Request failed', data.room);
    return data as T;
  }
  return request;
}

// Same wire contract as server/stdio.ts's local `backend`, just built on the throttled client.
export function createHttpBackend(request: ReturnType<typeof createHttpClient>): RoomBackend {
  return {
    create: () => { throw new Error('This gateway is scoped to one room; it never creates rooms.'); },
    join: () => { throw new Error('This gateway is scoped to one room; it never joins rooms.'); },
    get: (id, token) => request<RoomSnapshot>(`/${id}`, undefined, token),
    moveHistory: (id, query = {}) => request<RoomMoveHistory>(`/${id}/history?${new URLSearchParams(
      Object.entries(query).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
        .map(([key, value]) => [key, String(value)]))}`),
    wait: (id, afterRevision, timeoutMs, signal) => request<RoomChange>(`/${id}/changes?afterRevision=${afterRevision}&timeoutMs=${timeoutMs}`, undefined, undefined, signal, 30000),
    act: (id, token, input, preview) => request<RoomSnapshot>(`/${id}/${preview ? 'preview' : 'actions'}`, input, token),
    stage: (id, token, input) => request<StagingResult>(`/${id}/stage`, input, token),
    cancelStage: (id, token, input) => request<StagingResult>(`/${id}/stage/cancel`, input, token),
    staged: (id, token, stageId) => request<StagingStatus>(`/${id}/stage${stageId ? `?stageId=${encodeURIComponent(stageId)}` : ''}`, undefined, token),
  };
}

// ---------------------------------------------------------------------------
// Token injection + deterministic-idempotent play + actions.jsonl recording.
// ---------------------------------------------------------------------------
const hashOf = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const playRequestShape = z.object({ expectedRevision: z.number().int().nonnegative(), requestId: z.string(), actions: z.array(z.unknown()).min(1) });

/** The requestId a retried play with the same (roomId, expectedRevision, actions) always gets,
 * regardless of what the model sent — a forgotten/garbled retry id cannot double-submit. */
export function deterministicPlayRequestId(roomId: string, expectedRevision: number, actions: unknown[]): string {
  return hashOf({ kind: 'muju_play', roomId, expectedRevision, actions });
}

/** Wraps a RoomBackend so every call uses the configured seat's real token (never the model's),
 * `act` play requests get a deterministic requestId, and accepted plays are journaled. */
export function withGatewayGuarantees(inner: RoomBackend, config: SeatConfig, logActions: GatewayLog): RoomBackend {
  return {
    ...inner,
    get: (id, _token) => inner.get(id, config.seatToken),
    moveHistory: (id, query) => inner.moveHistory(id, query),
    act: async (id, _token, input, preview) => {
      const parsed = playRequestShape.parse(input);
      const requestId = preview ? parsed.requestId : deterministicPlayRequestId(id, parsed.expectedRevision, parsed.actions);
      const room = await inner.act(id, config.seatToken, { ...parsed, requestId }, preview);
      if (!preview) logActions({ at: new Date().toISOString(), revision: room.revision, requestId,
        actions: parsed.actions, stateHash: hashOf(room.state) });
      return room;
    },
    stage: (id, _token, input) => inner.stage(id, config.seatToken, input),
    cancelStage: (id, _token, input) => inner.cancelStage(id, config.seatToken, input),
    staged: (id, _token, stageId) => inner.staged(id, config.seatToken, stageId),
  };
}

// ---------------------------------------------------------------------------
// MatchScope, pinned from the live room rather than trusted from config alone.
// ---------------------------------------------------------------------------
/** Polls the live room until it is an admitted, active, v1-policy match, then pins the scope
 * from it. Player and engine seats can be prepared before both are admitted, so this tolerates
 * `room.ready === false` up to `timeoutMs` rather than failing immediately. */
export async function resolveMatchScope(config: SeatConfig, backend: RoomBackend,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}): Promise<MatchScope> {
  const pollIntervalMs = options.pollIntervalMs ?? 1000, deadline = Date.now() + (options.timeoutMs ?? 120000);
  for (;;) {
    const room = await backend.get(config.roomId, config.seatToken);
    if (room.ready && !room.archivedAt && room.state.phase === 'playing' && room.matchPolicy?.version === 1) {
      const scope = matchScopeFor(room);
      if (scope.matchPolicy.toolTier !== config.tier) {
        throw new Error(`Room's live match tier "${scope.matchPolicy.toolTier}" does not match configured tier "${config.tier}".`);
      }
      return scope;
    }
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the room to become an active, policy-scoped match.');
    await delay(pollIntervalMs);
  }
}

// ---------------------------------------------------------------------------
// pilot_memory: passive read-only access to the pair's frozen memory snapshot.
// ---------------------------------------------------------------------------
// Only the snapshot's version name is returned, never its absolute path (the campaign dir sits under the repo tree).
interface PilotMemory { available: boolean; snapshot?: string; playbook?: string; experiences?: Record<string, unknown>[]; olderExperiences?: number }
function findSnapshotDir(gameDir: string): string | undefined {
  const pilotDir = process.env.MUJU_PILOT_DIR ?? resolve(gameDir, '..', '..');
  let version: number | undefined;
  try {
    const manifest = JSON.parse(readFileSync(join(gameDir, 'manifest.json'), 'utf8'));
    if (typeof manifest.snapshotVersion === 'number') version = manifest.snapshotVersion;
  } catch { /* no manifest yet, or no snapshotVersion recorded */ }
  const snapshotsDir = join(pilotDir, 'memory', 'snapshots');
  if (version === undefined) {
    if (!existsSync(snapshotsDir)) return undefined;
    const versions = readdirSync(snapshotsDir)
      .map(name => /^v(\d+)$/.exec(name)?.[1]).filter((value): value is string => value !== undefined).map(Number);
    if (versions.length === 0) return undefined;
    version = Math.max(...versions);
  }
  const dir = join(snapshotsDir, `v${version}`);
  return existsSync(dir) ? dir : undefined;
}
/** Experience records served in full; older ones are distilled into the playbook. Wave 1 served every
 * record (~170 KB by the end), the largest single input in slow players' context. */
export const PILOT_MEMORY_RECENT_EXPERIENCES = 6;
const SERVED_EXPERIENCE_FIELDS = ['gameId', 'model', 'effort', 'toolTier', 'llmSeat', 'handicap', 'result', 'turns', 'engineSourceSha256', 'engineProfile', 'facts', 'reflection'];
export function readPilotMemory(gameDir: string): PilotMemory {
  const snapshotDir = findSnapshotDir(gameDir);
  if (!snapshotDir) return { available: false };
  const playbookPath = join(snapshotDir, 'playbook.md');
  const playbook = existsSync(playbookPath) ? readFileSync(playbookPath, 'utf8') : undefined;
  const experiencesPath = join(snapshotDir, 'experiences.jsonl');
  const experiences = existsSync(experiencesPath)
    ? readFileSync(experiencesPath, 'utf8').split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(entry => entry !== null)
    : [];
  const recent = experiences.slice(-PILOT_MEMORY_RECENT_EXPERIENCES).map(entry =>
    Object.fromEntries(SERVED_EXPERIENCE_FIELDS.filter(key => key in entry).map(key => [key, entry[key]])));
  return { available: true, snapshot: basename(snapshotDir), playbook, experiences: recent, olderExperiences: experiences.length - recent.length };
}
export function attachPilotMemoryTool(server: McpServer, gameDir: string): void {
  server.registerTool('pilot_memory', { description: `Read-only: this pair’s shared strategy playbook and the ${PILOT_MEMORY_RECENT_EXPERIENCES} most recent evidence-linked reflections (older ones are distilled into the playbook), frozen before this game started. Read once before playing. No live advice, and this tool never changes as the game progresses.`,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
    async () => {
      const memory = readPilotMemory(gameDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(memory) }] };
    });
}

// ---------------------------------------------------------------------------
// tool-builder only: sandboxed helper execution + a workspace-confined file write, in place of
// any native shell/exec tool (see sandbox.ts's header for why). Both tools take only paths
// relative to `workspaceDir` (resolved and re-checked to stay inside it — no `..`/absolute
// escape) — the sandbox profile is the OS-enforced backstop, this is defense in depth against a
// helper simply being pointed at an absolute path.
// ---------------------------------------------------------------------------
function resolveInWorkspace(workspaceDir: string, relPath: string): string {
  const resolved = resolve(workspaceDir, relPath);
  const root = resolve(workspaceDir);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(`Path "${relPath}" resolves outside the workspace; only workspace-relative paths are allowed.`);
  }
  return resolved;
}
export function attachHelperTools(server: McpServer, gameDir: string, workspaceDir: string, gameId = basename(gameDir)): void {
  server.registerTool('muju_run_helper', {
    description: 'tool-builder only: runs a helper command (e.g. `node helper.js`, `python3 helper.py`) you wrote in '
      + 'your workspace, inside a macOS sandbox with NO network access and NO read/write access to anything outside '
      + 'your workspace (in particular, no access to this engine\'s source or any game\'s secrets). Capped at 60 CPU '
      + 'seconds per run and gated on the shared 2-slot heavy-compute queue used by the engine itself, so a run may '
      + 'wait if both slots are busy. `command` and `args` are passed straight to the sandboxed process; `cwd` is '
      + 'always your workspace. Returns stdout/stderr (truncated if huge), the exit code, and CPU seconds used.',
    inputSchema: { command: z.string().min(1), args: z.array(z.string()).default([]) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ command, args }) => {
    const result = await runSandboxedHelper(command, args, { cwd: workspaceDir, gameDir, label: `tool-builder-helper:${gameId}` });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: { ...result } };
  });
  server.registerTool('muju_write_file', {
    description: 'tool-builder only: writes UTF-8 text to a file at a path relative to your workspace (creating '
      + 'parent directories as needed). Use this to author helper scripts before running them with `muju_run_helper`.',
    inputSchema: { path: z.string().min(1), content: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ path: relPath, content }) => {
    const target = resolveInWorkspace(workspaceDir, relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    return { content: [{ type: 'text' as const, text: JSON.stringify({ wrote: relPath, bytes: Buffer.byteLength(content) }) }] };
  });
}

// ---------------------------------------------------------------------------
// Assembly + CLI entrypoint.
// ---------------------------------------------------------------------------
export async function createGatewayServer(config: SeatConfig, options: { gameDir: string; scope?: MatchScope; minIntervalMs?: number; workspaceDir?: string }): Promise<McpServer> {
  mkdirSync(options.gameDir, { recursive: true, mode: 0o700 });
  const appendLog = (path: string): GatewayLog => event => appendFileSync(path, `${JSON.stringify(event)}\n`);
  const logHttp = appendLog(join(options.gameDir, 'http.jsonl'));
  const logActions = appendLog(join(options.gameDir, 'actions.jsonl'));
  const rawBackend = createHttpBackend(createHttpClient(config.serverUrl, logHttp, options.minIntervalMs));
  const scope = options.scope ?? await resolveMatchScope(config, rawBackend);
  const backend = withGatewayGuarantees(rawBackend, config, logActions);
  const server = createMcpServer(backend, config.serverUrl, scope);
  attachPilotMemoryTool(server, options.gameDir);
  if (config.tier === 'tool-builder') {
    const workspaceDir = options.workspaceDir ?? process.env.MUJU_PILOT_WORKSPACE_DIR;
    if (!workspaceDir) throw new Error('tool-builder gateway requires a workspaceDir (MUJU_PILOT_WORKSPACE_DIR env or options.workspaceDir) to sandbox helper execution.');
    attachHelperTools(server, options.gameDir, resolve(workspaceDir), basename(options.gameDir));
  }
  return server;
}

/** Prefers `MUJU_PILOT_GAME_DIR` (set on this process's own env by the player adapter, inherited
 * from the parent CLI — see players.ts) over `--game-dir` argv, so a real pilot game's gameDir
 * (and therefore its secrets/ path) never has to be written into a player-readable file. `--game-dir`
 * stays supported for policy-check.ts and manual/test invocations that spawn this gateway directly. */
function readGameDirArg(argv: string[]): string {
  const fromEnv = process.env.MUJU_PILOT_GAME_DIR;
  if (fromEnv) return resolve(fromEnv);
  const index = argv.indexOf('--game-dir');
  if (index === -1 || !argv[index + 1]) throw new Error('Usage: node --import tsx tools/llm-pilot/gateway.ts --game-dir <dir> (or MUJU_PILOT_GAME_DIR env)');
  return resolve(argv[index + 1]);
}
/** Drops `structuredContent` from outgoing tool results that also carry text content. The server's
 * tools put the same JSON in both (server/mcp.ts `output`) and declare no output schema, and Codex
 * hands both copies to the model: wave 1's LU05-B read every muju_play/analyze result twice. The
 * text copy is complete, so this halves the players' tool payloads without changing any fact. */
export function stripDuplicateStructuredContent(message: unknown): unknown {
  const result = (message as { result?: { content?: unknown[]; structuredContent?: unknown } } | null)?.result;
  if (result && Array.isArray(result.content) && result.content.length > 0 && 'structuredContent' in result) delete result.structuredContent;
  return message;
}
async function main() {
  const gameDir = readGameDirArg(process.argv.slice(2));
  const seatPath = join(gameDir, 'secrets', 'seat.json');
  if (!existsSync(seatPath)) throw new Error(`No seat file at ${seatPath}.`);
  const config = seatConfigSchema.parse(JSON.parse(readFileSync(seatPath, 'utf8')));
  const server = await createGatewayServer(config, { gameDir });
  const transport = new StdioServerTransport();
  const send = transport.send.bind(transport);
  transport.send = message => send(stripDuplicateStructuredContent(message) as typeof message);
  await server.connect(transport);
}
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(error => { console.error(error instanceof Error ? error.message : 'Gateway failed.'); process.exitCode = 1; });
