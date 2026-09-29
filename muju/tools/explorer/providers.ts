import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExplorerPlayer } from '../../src/explorer/types';

export const RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['assess', 'turn', 'branch', 'preview'] },
    whiteWin: { type: ['number', 'null'] },
    pressure: { type: ['string', 'null'], enum: [null, 'white-dominating', 'white-edge', 'balanced', 'black-edge', 'black-dominating'] },
    counterplay: { type: 'string' }, explanation: { type: 'string' }, memory: { type: 'string' },
    checkpointId: { type: ['string', 'null'] },
    // A JSON string avoids provider differences in recursive/discriminated action schemas.
    actionsJson: { type: 'string', description: 'JSON array of canonical Muju actions. Use [] for an assessment or initial legal-actions query.' },
    offset: { type: 'integer' },
  }, required: ['kind', 'whiteWin', 'pressure', 'counterplay', 'explanation', 'memory', 'checkpointId', 'actionsJson', 'offset'],
};
export interface ModelReply {
  kind: 'assess' | 'turn' | 'branch' | 'preview'; whiteWin: number | null; pressure: string | null;
  counterplay: string; explanation: string; memory: string; checkpointId: string | null; actionsJson: string; offset: number;
}
export interface ProcessResult { stdout: string; stderr: string }
export type RunProcess = (command: string, args: string[], input: string, options: { cwd: string; signal?: AbortSignal; timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<ProcessResult>;
/** Shell-free spawning: game/model text is stdin, never executable command text. */
export const runProcess: RunProcess = (command, args, input, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let stdout = '', stderr = '', failure: Error | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const kill = (signal: NodeJS.Signals) => { try { if (process.platform === 'win32') child.kill(signal); else if (child.pid) process.kill(-child.pid, signal); } catch { /* already exited */ } };
  const stop = (message: string) => { failure ??= new Error(message); kill('SIGTERM'); killTimer ??= setTimeout(() => kill('SIGKILL'), 1500); };
  const abort = () => stop('Model call cancelled.');
  const timer = setTimeout(() => stop('Model call timed out; the experiment can be resumed.'), options.timeoutMs);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const cleanup = () => { clearTimeout(timer); if (killTimer) clearTimeout(killTimer); options.signal?.removeEventListener('abort', abort); };
  child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 4_000_000) stop('Model output exceeded the runner limit.'); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
  child.on('error', error => { cleanup(); reject(error); });
  child.on('close', code => { cleanup(); if (failure) reject(failure); else if (code !== 0) reject(new Error(`${command} exited ${code}: ${(stderr || stdout).slice(-1500)}`)); else resolve({ stdout, stderr }); });
  child.stdin.on('error', () => { /* an early CLI exit is reported above */ });
  child.stdin.end(input);
});

/** Never silently switch this subscription workflow to API billing/provider gateways. */
export function subscriptionEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|OPENAI_BASE_URL|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_USE_|ANTHROPIC_DEFAULT_)/.test(key)) delete env[key];
  // A child is an independent print invocation, not a nested interactive agent.
  delete env.CLAUDECODE;
  return env;
}
export async function preflight(players: ExplorerPlayer[], run: RunProcess = runProcess) {
  const env = subscriptionEnv(), options = { cwd: tmpdir(), timeoutMs: 30000, env };
  for (const provider of new Set(players.map(p => p.provider))) {
    if (provider === 'codex') {
      const status = await run('codex', ['login', 'status'], '', options);
      if (!/ChatGPT/i.test(status.stdout + status.stderr)) throw new Error('Codex needs subscription login. Run codex login, then retry.');
    } else {
      const status = await run('claude', ['auth', 'status', '--json'], '', options);
      const auth = JSON.parse(status.stdout);
      if (!auth.loggedIn || !['claude.ai', 'oauth', 'subscription'].includes(auth.authMethod)) throw new Error('Claude Code needs subscription login. Run claude auth login, then retry.');
    }
  }
}
export async function invokeModel(player: ExplorerPlayer, prompt: string, signal?: AbortSignal, run: RunProcess = runProcess) {
  const dir = await mkdtemp(join(tmpdir(), 'muju-player-'));
  const env = subscriptionEnv(), started = Date.now();
  try {
    const options = { cwd: dir, signal, timeoutMs: 300000, env };
    if (player.provider === 'claude') {
      const result = await run('claude', ['-p', '--model', player.model, '--effort', player.effort,
        '--output-format', 'json', '--json-schema', JSON.stringify(RESPONSE_SCHEMA), '--tools', '', '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}', '--safe-mode', '--permission-mode', 'dontAsk', '--no-session-persistence'], prompt, options);
      const parsed = JSON.parse(result.stdout);
      if (parsed.is_error || !parsed.structured_output) throw new Error(`Claude did not return a structured result: ${String(parsed.result ?? parsed.subtype).slice(0,800)}`);
      const models = Object.keys(parsed.modelUsage ?? {});
      if (models.length && models.some(m => !m.startsWith(player.model))) throw new Error('Claude changed model during this call; result rejected to preserve experiment identity.');
      return { reply: parsed.structured_output as ModelReply, usage: { model: models[0] ?? player.model,
        inputTokens: parsed.usage?.input_tokens, outputTokens: parsed.usage?.output_tokens, elapsedMs: Date.now() - started } };
    }
    const schemaPath = join(dir, 'response-schema.json'), outputPath = join(dir, 'result.json');
    await writeFile(schemaPath, JSON.stringify(RESPONSE_SCHEMA));
    // Disable every configured MCP server without copying credentials or altering user settings.
    const inventory = await run('codex', ['--disable', 'plugins', 'mcp', 'list', '--json'], '', options);
    const servers = JSON.parse(inventory.stdout) as { name: string }[];
    if (servers.some(s => !/^[A-Za-z0-9_-]+$/.test(s.name))) throw new Error('Rename nonstandard MCP server keys before using the isolated game runner.');
    const args = ['exec', '--model', player.model, '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
      '--disable', 'shell_tool', '--disable', 'multi_agent', '--disable', 'plugins',
      '-c', 'web_search="disabled"', '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"',
      '-c', 'project_doc_max_bytes=0', '-c', 'model_reasoning_effort="high"', '-c', 'approval_policy="never"',
      ...servers.flatMap(s => ['-c', `mcp_servers.${s.name}.enabled=false`]),
      '--output-schema', schemaPath, '--output-last-message', outputPath, '--json', '-'];
    const result = await run('codex', args, prompt, options);
    const events = result.stdout.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } });
    if (events.some(e => /command_execution|mcp_tool_call|web_search|file_change/.test(e?.item?.type ?? ''))) throw new Error('Codex used an external tool; this experiment only permits the supplied Muju interface.');
    const usage = events.findLast(e => e?.type === 'turn.completed')?.usage;
    return { reply: JSON.parse(await readFile(outputPath, 'utf8')) as ModelReply,
      usage: { model: player.model, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens, elapsedMs: Date.now() - started } };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
