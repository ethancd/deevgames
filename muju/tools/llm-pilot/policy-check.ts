/**
 * Live policy-enforcement check (SPEC.md verification list): creates one throwaway room per tier on the
 * live server, admits both seats with the checker's own credentials (no engine), starts the real gateway
 * as a stdio subprocess from a cwd OUTSIDE the repo (exactly how a player CLI launches it), lists its
 * tools, probes token hiding, then RESIGNs the room so it ends immediately.
 *   node --import tsx tools/llm-pilot/policy-check.ts <outDir> [tier...]
 * Writes <outDir>/<tier>/{secrets/seat.json (0600), http.jsonl, actions.jsonl} and prints a JSON report
 * (room ids, tool lists, checks) — never a token.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { roomRequest } from '../../src/online/client';
import type { RoomAdmission, RoomSnapshot } from '../../src/online/types';
import { spawn } from 'node:child_process';
import { claudeArgs, codexArgs, gatewayCommand, parseTranscript, PLACEHOLDER_TOKEN } from './players';
import { CODEX_BIN, readCodexRollout, stripApiKeys } from './auth';
import { PROTOCOL_ID } from './pilot';

const SERVER_URL = process.env.MUJU_SERVER_URL ?? 'https://deevgames-muju.onrender.com';
type Tier = 'bare' | 'harnessed' | 'centaur' | 'tool-builder';

async function checkTier(outDir: string, tier: Tier) {
  const created = await roomRequest<RoomAdmission>(SERVER_URL, '', { name: 'Policy Check', side: 'white',
    matchPolicy: { version: 1, toolTier: tier, protocolId: `${PROTOCOL_ID}-policy-check` }, timeControl: { delaySeconds: 600, bankSeconds: 3600 } });
  const joined = await roomRequest<RoomAdmission>(SERVER_URL, `/${created.room.id}/join`, { name: 'Policy Check B', inviteCode: created.inviteCode });
  const gameDir = join(outDir, tier);
  mkdirSync(join(gameDir, 'secrets'), { recursive: true, mode: 0o700 });
  writeFileSync(join(gameDir, 'secrets', 'seat.json'), JSON.stringify({ serverUrl: SERVER_URL, roomId: created.room.id, seatToken: created.credentials.token, tier }), { mode: 0o600 });
  const { command, args } = gatewayCommand(gameDir);
  const transport = new StdioClientTransport({ command, args, cwd: '/tmp', stderr: 'pipe' });
  const client = new Client({ name: 'policy-check', version: '1' });
  const report: Record<string, unknown> = { tier, roomId: created.room.id, watch: `${SERVER_URL}/watch/${created.room.watchCode}` };
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map(t => t.name).sort();
    report.tools = tools;
    report.createJoinAbsent = !tools.includes('muju_create_room') && !tools.includes('muju_join_room');
    // Token hiding: the model passes a bogus token; the gateway must substitute the real seat token.
    const bogus = 'x'.repeat(43);
    const observed = await client.callTool({ name: 'muju_observe', arguments: { roomId: created.room.id, token: bogus } });
    const text = JSON.stringify(observed);
    report.observeAuthenticatedWithBogusToken = !observed.isError && /"you"|seat|white/i.test(text);
    report.realTokenNeverEchoed = !text.includes(created.credentials.token) && !JSON.stringify(tools).includes(created.credentials.token);
    const refused = await client.callTool({ name: 'muju_create_room', arguments: { name: 'x' } }).catch(error => ({ isError: true, error: String(error) }));
    report.createRoomRefused = Boolean((refused as { isError?: boolean }).isError);
    if (tools.includes('muju_analyze')) report.analyzeExposed = true;
    if (cliProbe) report.cliProbe = await probeClis(gameDir, created.room.id, tier);
  } finally {
    await client.close().catch(() => undefined);
    // End the throwaway room at once: White resigns with its own (checker-held) credential.
    const room = await roomRequest<RoomSnapshot>(SERVER_URL, `/${created.room.id}`, undefined, created.credentials.token);
    const ended = await roomRequest<RoomSnapshot>(SERVER_URL, `/${created.room.id}/actions`, { expectedRevision: room.revision, requestId: `policy-check-resign-${created.room.id}`, actions: [{ type: 'RESIGN' }] }, created.credentials.token);
    report.endedPhase = ended.state.phase; report.victoryReason = ended.state.victoryReason; report.blackJoinedAs = joined.credentials.player;
  }
  return report;
}

/** Runs each player CLI once, low effort, with the exact flags players.ts uses, against this
 * gateway: proves MCP wiring, non-interactive tool approval and that no other tools leak in. */
async function probeClis(gameDir: string, roomId: string, tier: Tier) {
  const workspace = `/tmp/muju-llm-pilot/policy-probe-${tier}`;
  mkdirSync(workspace, { recursive: true });
  const { command, args } = gatewayCommand(gameDir);
  const mcpConfigPath = join(workspace, 'mcp-config.json');
  writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: { muju: { command, args } } }));
  const prompt = `List the exact names of every tool available to you (all tools, not only muju). Then call muju_observe with roomId ${roomId} and token ${PLACEHOLDER_TOKEN}. Reply with only JSON: {"tools": [...], "observeOk": true|false, "turnNumber": <n>}`;
  const run = (bin: string, cliArgs: string[]) => new Promise<string>(resolve => {
    const child = spawn(bin, cliArgs, { cwd: workspace, env: stripApiKeys().env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 240_000);
    child.on('close', () => { clearTimeout(timer); resolve(out); });
  });
  const claudeRaw = await run('claude', claudeArgs({ prompt, model: 'claude-sonnet-5', effort: 'low', cwd: workspace, mcpConfigPath, tier }));
  const codexRaw = await run(CODEX_BIN, codexArgs({ prompt, model: 'gpt-6-luna', effort: 'low', cwd: workspace, gameDir, tier }));
  writeFileSync(join(gameDir, 'cli-probe.claude.jsonl'), claudeRaw);
  writeFileSync(join(gameDir, 'cli-probe.codex.jsonl'), codexRaw);
  const claude = parseTranscript('claude', claudeRaw), codex = parseTranscript('codex', codexRaw);
  const rollout = codex.sessionId ? await readCodexRollout(codex.sessionId) : undefined;
  return {
    claude: { answer: claude.finalText, apiKeySource: claude.apiKeySource, models: claude.reportedModels, toolCalls: claude.toolCalls, auditFlags: claude.auditFlags.length },
    codex: { answer: codex.finalText, models: rollout?.models, toolCalls: codex.toolCalls, auditFlags: codex.auditFlags.length, weeklyUsedPercent: rollout?.rateLimits?.primary?.used_percent },
  };
}

const cliProbe = process.argv.includes('--cli-probe');
const [outDir, ...tiers] = process.argv.slice(2).filter(arg => arg !== '--cli-probe');
if (!outDir) throw new Error('Usage: policy-check.ts <outDir> [tier...]');
const results = [];
for (const tier of (tiers.length ? tiers : ['bare', 'harnessed', 'centaur', 'tool-builder']) as Tier[]) results.push(await checkTier(resolve(outDir), tier));
console.log(JSON.stringify(results, null, 2));
