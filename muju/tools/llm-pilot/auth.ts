import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/** Absolute path to the Codex binary bundled with the ChatGPT desktop app.
 * Not on PATH; every codex invocation in this pilot uses this exact path. */
export const CODEX_BIN = '/Applications/ChatGPT.app/Contents/Resources/codex';

/** Env var names that must never reach a player CLI's child process:
 * - any `*_API_KEY`: a paid-API credential would let a player silently bill
 *   the API instead of using the subscription this pilot is required to run on.
 * - `ANTHROPIC_*` / `OPENAI_*` (beyond `*_API_KEY`): `ANTHROPIC_BASE_URL`,
 *   `ANTHROPIC_AUTH_TOKEN`, `OPENAI_BASE_URL` etc. could reroute billing to a
 *   different account/endpoint even without a bare API key present.
 * - `CLAUDE_CODE_*` / `CLAUDECODE`: this dispatcher is normally launched from
 *   inside an operator Claude Code session's Bash tool, which sets
 *   `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_MESSAGING_SOCKET`
 *   and `CLAUDE_CODE_MESSAGING_TOKEN` in ITS OWN environment; a spawned
 *   player CLI must never inherit the operator's own session identity or
 *   messaging channel, and a Codex player with a shell could otherwise read
 *   the messaging token via `env`. */
const FORBIDDEN_ENV_PATTERN = /(_API_KEY$)|^(ANTHROPIC_|OPENAI_|CLAUDE_CODE_|CLAUDECODE$)/;

export interface CleanEnv { env: NodeJS.ProcessEnv; stripped: string[] }

/** Returns a copy of `process.env` (or a supplied base) with every forbidden
 * variable removed (see `FORBIDDEN_ENV_PATTERN`), plus the names that were
 * removed — for the caller to log (never the values). */
export function stripApiKeys(base: NodeJS.ProcessEnv = process.env): CleanEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  const stripped: string[] = [];
  for (const key of Object.keys(env)) {
    if (FORBIDDEN_ENV_PATTERN.test(key)) { stripped.push(key); delete env[key]; }
  }
  return { env, stripped };
}
/** Asserts none of `FORBIDDEN_ENV_PATTERN` reached a child env — called from
 * preflight so a leak is caught before any game, not discovered later in an
 * audit log. Throws (never silently continues) on any survivor. */
export function assertCleanEnv(env: NodeJS.ProcessEnv): void {
  const leaked = Object.keys(env).filter(key => FORBIDDEN_ENV_PATTERN.test(key));
  if (leaked.length > 0) throw new AuthPreflightError(`Forbidden env var(s) would reach a player child process: ${leaked.join(', ')}.`);
}

export class AuthPreflightError extends Error {}

/** Runs `claude auth status` in a clean (API-key-stripped) env and requires
 * `authMethod: "claude.ai"` — i.e. this call is billed against the Max
 * subscription, never an API key. Returns the account email for the usage
 * record (never a token). */
export async function assertClaudeSubscriptionAuth(): Promise<{ authMethod: string; email?: string }> {
  const { env, stripped } = stripApiKeys();
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('claude', ['auth', 'status'], { env, timeout: 15_000 }));
  } catch (error) {
    throw new AuthPreflightError(`claude auth status failed: ${(error as Error).message}`);
  }
  let status: { loggedIn?: boolean; authMethod?: string; email?: string };
  try { status = JSON.parse(stdout); } catch { throw new AuthPreflightError(`claude auth status returned non-JSON output: ${stdout.slice(0, 200)}`); }
  if (!status.loggedIn) throw new AuthPreflightError('claude auth status reports not logged in.');
  if (status.authMethod !== 'claude.ai') throw new AuthPreflightError(`claude auth status authMethod is "${status.authMethod}", expected "claude.ai" (subscription). API-key auth is forbidden for this pilot.`);
  if (stripped.length > 0) console.error(`[auth] stripped from claude child env: ${stripped.join(', ')}`);
  return { authMethod: status.authMethod, email: status.email };
}

/** Runs `codex login status` and reads `~/.codex/auth.json`'s `auth_mode`
 * directly (never printing token fields) to confirm ChatGPT-subscription
 * auth rather than an API key. */
export async function assertCodexSubscriptionAuth(): Promise<{ authMode: string }> {
  const { env, stripped } = stripApiKeys();
  let output: string;
  try {
    // `codex login status` prints its verdict on STDERR (stdout is empty), so read both.
    const { stdout, stderr } = await execFileAsync(CODEX_BIN, ['login', 'status'], { env, timeout: 15_000 });
    output = `${stdout}\n${stderr}`;
  } catch (error) {
    throw new AuthPreflightError(`codex login status failed: ${(error as Error).message}`);
  }
  if (!/Logged in using ChatGPT/i.test(output)) throw new AuthPreflightError(`codex login status did not report ChatGPT login: ${output.trim()}`);
  const authJsonPath = path.join(process.env.CODEX_HOME ?? path.join(homedir(), '.codex'), 'auth.json');
  let raw: string;
  try { raw = await readFile(authJsonPath, 'utf8'); } catch (error) { throw new AuthPreflightError(`Cannot read ${authJsonPath}: ${(error as Error).message}`); }
  let parsed: { auth_mode?: string; OPENAI_API_KEY?: unknown };
  try { parsed = JSON.parse(raw); } catch { throw new AuthPreflightError(`${authJsonPath} is not valid JSON.`); }
  if (parsed.auth_mode !== 'chatgpt') throw new AuthPreflightError(`${authJsonPath} auth_mode is "${parsed.auth_mode}", expected "chatgpt". API-key auth is forbidden for this pilot.`);
  // A stored API key would be a paid-credit fallback path; require it absent (value never printed).
  if (parsed.OPENAI_API_KEY) throw new AuthPreflightError(`${authJsonPath} stores an OPENAI_API_KEY; remove it so no API-billed fallback exists.`);
  if (stripped.length > 0) console.error(`[auth] stripped from codex child env: ${stripped.join(', ')}`);
  return { authMode: parsed.auth_mode };
}

/** One short, low-effort call to confirm the model id is actually available
 * and actually the one that answers (never silently substituted). Returns the
 * model id the CLI reports serving the request. Costs a small amount of
 * subscription usage — call once per campaign, not per game. */
export async function probeClaudeModel(model: string, cwd: string): Promise<{ available: boolean; reportedModel?: string; error?: string }> {
  const { env } = stripApiKeys();
  try {
    const { stdout } = await execFileAsync('claude', [
      '-p', 'Reply with exactly: PROBE_OK',
      '--model', model, '--effort', 'low',
      '--output-format', 'json', '--strict-mcp-config', '--permission-mode', 'dontAsk',
    ], { env, cwd, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
    const result = JSON.parse(stdout);
    if (result.is_error) return { available: false, error: String(result.result ?? 'error') };
    const reportedModel = result.modelUsage ? Object.keys(result.modelUsage)[0] : undefined;
    if (reportedModel && reportedModel !== model) return { available: false, reportedModel, error: `Served by "${reportedModel}", not requested "${model}".` };
    return { available: true, reportedModel: reportedModel ?? model };
  } catch (error) {
    return { available: false, error: (error as Error).message };
  }
}

/** The subscription usage block Codex records in each session rollout's token_count events. */
export interface CodexRateLimits {
  primary?: { used_percent?: number; window_minutes?: number; resets_at?: number } | null;
  secondary?: { used_percent?: number; window_minutes?: number; resets_at?: number } | null;
  credits?: { has_credits?: boolean; unlimited?: boolean; balance?: string } | null;
  plan_type?: string | null;
  rate_limit_reached_type?: string | null;
}
/** Reads `~/.codex/sessions/**\/rollout-*-<threadId>.jsonl` (Codex's own session log) for the
 * model(s) that actually served the thread and the last observed subscription rate limits.
 * `codex exec --json` exposes neither; the rollout is the only local record of both. */
/** threadId -> rollout path (a session's rollout file never moves once created). */
const rolloutFiles = new Map<string, string>();
export async function readCodexRollout(threadId: string): Promise<{ models: string[]; rateLimits?: CodexRateLimits; file: string } | undefined> {
  const root = path.join(process.env.CODEX_HOME ?? path.join(homedir(), '.codex'), 'sessions');
  const { readdir } = await import('node:fs/promises');
  let file = rolloutFiles.get(threadId);
  if (!file) {
    try {
      for (const entry of await readdir(root, { recursive: true })) {
        if (entry.endsWith(`${threadId}.jsonl`)) { file = path.join(root, entry); break; }
      }
    } catch { return undefined; }
    if (!file) return undefined;
    rolloutFiles.set(threadId, file);
  }
  const models = new Set<string>();
  let rateLimits: CodexRateLimits | undefined;
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as { type?: string; payload?: { type?: string; model?: string; rate_limits?: CodexRateLimits } };
      if (event.type === 'turn_context' && event.payload?.model) models.add(event.payload.model);
      if (event.payload?.rate_limits) rateLimits = event.payload.rate_limits;
    } catch { /* partial line while the session is still writing */ }
  }
  return { models: [...models], rateLimits, file };
}

/** One short, low-effort call to confirm gpt-6-luna is available under the
 * ChatGPT subscription and actually the model that answers. */
export async function probeCodexModel(model: string, effort: string, cwd: string): Promise<{ available: boolean; reportedModel?: string; error?: string; rateLimits?: CodexRateLimits }> {
  const { env } = stripApiKeys();
  try {
    // stdin must be closed: `codex exec` otherwise blocks on "Reading additional input from stdin".
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(CODEX_BIN, [
        'exec', '-m', model, '-c', `model_reasoning_effort="${effort}"`, '-c', 'forced_login_method="chatgpt"',
        '--json', '--skip-git-repo-check', '-C', cwd, '--sandbox', 'read-only',
        'Reply with exactly: PROBE_OK',
      ], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), 90_000);
      child.stdout.on('data', chunk => { out += chunk; });
      child.stderr.on('data', chunk => { err += chunk; });
      child.on('error', reject);
      child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(out); else reject(new Error(`codex exec exited ${code}: ${err.slice(-400)}`)); });
    });
    const lines = stdout.split('\n').filter(Boolean);
    let threadId: string | undefined;
    let sawCompletion = false;
    for (const line of lines) {
      let event: { type?: string; thread_id?: string };
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === 'turn.completed') sawCompletion = true;
      if (event.type === 'thread.started' && event.thread_id) threadId = event.thread_id;
    }
    if (!sawCompletion) return { available: false, error: 'No turn.completed event observed.' };
    // The --json stream never names the serving model; the session rollout's turn_context does.
    const rollout = threadId ? await readCodexRollout(threadId) : undefined;
    const served = rollout?.models ?? [];
    if (served.length === 0) return { available: false, error: 'Could not confirm the serving model from the Codex session rollout.' };
    if (served.some(m => m !== model)) return { available: false, reportedModel: served.join(','), error: `Served by "${served.join(',')}", not requested "${model}".` };
    return { available: true, reportedModel: model, rateLimits: rollout?.rateLimits };
  } catch (error) {
    return { available: false, error: (error as Error).message };
  }
}

/** Full preflight run once at campaign start (not per game): both CLIs are
 * subscription-authenticated, and both target models are actually available.
 * Throws AuthPreflightError on any failure — callers must not substitute a
 * different model or fall back to API billing. */
export async function runAuthPreflight(opts: { claudeModel: string; codexModel: string; codexEffort: string; probeWorkspace: string }): Promise<{
  claude: { authMethod: string; email?: string; probe: Awaited<ReturnType<typeof probeClaudeModel>> };
  codex: { authMode: string; probe: Awaited<ReturnType<typeof probeCodexModel>> };
}> {
  const cleaned = stripApiKeys();
  assertCleanEnv(cleaned.env); // regression guard: every player child spawns through stripApiKeys()
  if (cleaned.stripped.length > 0) console.error(`[auth] preflight: stripped from every player child env: ${cleaned.stripped.join(', ')}`);
  const claudeAuth = await assertClaudeSubscriptionAuth();
  const claudeProbe = await probeClaudeModel(opts.claudeModel, opts.probeWorkspace);
  if (!claudeProbe.available) throw new AuthPreflightError(`Claude model "${opts.claudeModel}" unavailable: ${claudeProbe.error}`);
  const codexAuth = await assertCodexSubscriptionAuth();
  const codexProbe = await probeCodexModel(opts.codexModel, opts.codexEffort, opts.probeWorkspace);
  if (!codexProbe.available) throw new AuthPreflightError(`Codex model "${opts.codexModel}" unavailable: ${codexProbe.error}`);
  return { claude: { ...claudeAuth, probe: claudeProbe }, codex: { ...codexAuth, probe: codexProbe } };
}
