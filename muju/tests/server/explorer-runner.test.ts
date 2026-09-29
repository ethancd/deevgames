// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { ExplorerStore } from '../../server/explorer/store';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import { runExperiment, modelResult } from '../../tools/explorer/runner';
import { invokeModel, preflight, subscriptionEnv, type ModelReply, type RunProcess } from '../../tools/explorer/providers';
const noop = '[{"type":"END_ACTION_PHASE"},{"type":"END_PLACE_PHASE"}]';
const reply: ModelReply = { kind: 'assess', whiteWin: 0.5, pressure: 'balanced', counterplay: 'Both can act.', explanation: 'Test', memory: '', checkpointId: null, actionsJson: '[]', offset: 0 };
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
it('uses pinned subscription CLI models, high effort, disabled tools and structured outputs', async () => {
  const calls: { command: string; args: string[]; input: string }[] = [];
  const run: RunProcess = async (command, args, input) => {
    calls.push({ command, args, input });
    if (args.includes('list')) return { stdout: '[{"name":"private-mcp"}]', stderr: '' };
    if (command === 'codex') { await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(reply)); return { stdout: '{"type":"turn.completed","usage":{"input_tokens":22,"output_tokens":9}}', stderr: '' }; }
    return { stdout: JSON.stringify({ structured_output: reply, modelUsage: { 'claude-opus-5-5': {} }, usage: { input_tokens: 12, output_tokens: 5 } }), stderr: '' };
  };
  const codex = await invokeModel({ provider: 'codex', model: 'gpt-6-astra', effort: 'high' }, 'untrusted $(shell) game text', undefined, run);
  expect(codex.reply).toEqual(reply); expect(codex.usage.outputTokens).toBe(9);
  const args = calls.find(c => c.args.includes('exec'))!.args;
  expect(args).toContain('mcp_servers.private-mcp.enabled=false'); expect(args).toContain('model_reasoning_effort="high"');
  expect(args).not.toContain('untrusted $(shell) game text'); expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  const claude = await invokeModel({ provider: 'claude', model: 'claude-opus-5-5', effort: 'high' }, 'prompt', undefined, run);
  expect(claude.reply).toEqual(reply); expect(calls.at(-1)!.args).toContain('--safe-mode'); expect(calls.at(-1)!.args).toContain('--no-session-persistence');
});
it('refuses API billing, missing subscription login, malformed actions and model fallback', async () => {
  expect(subscriptionEnv({ PATH: 'test', OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', ANTHROPIC_BASE_URL: 'gateway' })).toEqual({ PATH: 'test' });
  await expect(preflight([{ provider: 'codex', model: 'gpt-6-astra', effort: 'high' }], async () => ({ stdout: 'Logged in using API key', stderr: '' }))).rejects.toThrow('subscription login');
  expect(() => modelResult({ ...reply, actionsJson: '{}' })).toThrow('array');
  await expect(invokeModel({ provider: 'claude', model: 'claude-opus-5-5', effort: 'high' }, 'prompt', undefined, async () => ({ stdout: JSON.stringify({ structured_output: reply, modelUsage: { 'claude-opus-4-8': {} } }), stderr: '' }))).rejects.toThrow('changed model');
});
it('automatically drives two independent players over HTTP and stops at the shared move budget', async () => {
  const explorer = new ExplorerStore(), rooms = new RoomStore(); cleanup.push(() => { rooms.close(); explorer.close(); });
  const server = createApp(rooms, { publicUrl: 'http://localhost', explorer }).listen(0, '127.0.0.1'); cleanup.push(() => server.close());
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const { experiment, token } = explorer.create({ maxPlies: 2 });
  const prompts: string[] = [];
  await runExperiment({ server: `http://127.0.0.1:${(server.address() as { port: number }).port}`, experimentId: experiment.id, token, workerId: 'runner-test' }, new AbortController().signal,
    async (_player, prompt) => { prompts.push(prompt); const assessment = prompt.includes('"task":"assess"');
      return { reply: { ...reply, kind: assessment ? 'assess' : 'turn', actionsJson: assessment ? '[]' : noop }, usage: { model: _player.model, inputTokens: 10, outputTokens: 10, elapsedMs: 1 } }; });
  const done = explorer.get(experiment.id);
  expect(done).toMatchObject({ status: 'complete', stopReason: 'move-budget', plies: 2, modelCalls: 6 });
  expect(done.usage).toHaveLength(6); expect(prompts.filter(p => p.includes('"task":"turn"'))).toHaveLength(2);
});
