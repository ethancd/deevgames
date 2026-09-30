// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { ExplorerStore } from '../../server/explorer/store';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import { runExperiment, modelResult } from '../../tools/explorer/runner';
import { invokeModel, ModelCallTimeoutError, preflight, processFailure, runProcess, subscriptionEnv, type ModelReply, type RunProcess } from '../../tools/explorer/providers';
import { enforcePolicy, policyId, policyReview, prepareDecision, runnerPolicySchema } from '../../tools/explorer/policy';
import type { ExplorerJob } from '../../src/explorer/types';
import { isLegalAction } from '../../src/game/legality';
import type { AIAction } from '../../src/ai/types';
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

const policy = runnerPolicySchema.parse({ version: 2, retryThreshold: 0.45, paceAfterMs: 300000, blackTarget: 0.6 });
it('selects the latest qualifying own checkpoint, enforces it for previews and forks, and records honest strategic learning', () => {
  const explorer = new ExplorerStore(); cleanup.push(() => explorer.close());
  const { experiment } = explorer.create({});
  const job: ExplorerJob = { id: 'lease', kind: 'branch', player: 'black', checkpointId: 'lost-position', leaseUntil: Date.now() + 360000, config: experiment.config,
    prompt: 'For turn: choose moves. For branch: prefer ownWin >= 0.33.\n' + JSON.stringify({ memory: 'Black private lessons', playedTurns: ['game1', 'game2', 'game3'], candidates: [
      { id: 'turn5', ownWin: 0.33 }, { id: 'turn4', ownWin: 0.4 }, { id: 'turn3', ownWin: 0.66 }, { id: 'turn2', ownWin: 0.77 },
    ] }) };
  const prepared = prepareDecision(job, policy);
  expect(prepared.checkpointId).toBe('turn3');
  expect(prepared.prompt).not.toContain('0.33'); expect(prepared.prompt).not.toContain('turn4');
  expect(prepared.prompt).toContain('Black private lessons'); expect(prepared.prompt).toContain('game1'); expect(prepared.prompt).toContain('game3');
  expect(prepared.prompt).toContain('White: try your hardest to win'); expect(prepared.prompt).toContain('never use the target as an estimate floor');
  expect(enforcePolicy({ ...reply, kind: 'preview' }, job, prepared.checkpointId, policy).checkpointId).toBe('turn3');
  expect(() => enforcePolicy({ ...reply, kind: 'preview', checkpointId: 'turn5' }, job, prepared.checkpointId, policy)).toThrow('selected');
  expect(() => enforcePolicy({ ...reply, kind: 'branch', checkpointId: 'turn4' }, job, prepared.checkpointId, policy)).toThrow('selected retry');
  expect(() => enforcePolicy({ ...reply, kind: 'branch', checkpointId: 'turn3' }, job, prepared.checkpointId, policy)).toThrow('Lesson:');
  const branch = enforcePolicy({ ...reply, kind: 'branch', checkpointId: 'turn3', explanation: 'Lesson: exposed recruits were lost. Strategy: protect the recruiting square first.', memory: 'Earlier attempts lost recruits; now protect the square.' }, job, prepared.checkpointId, policy);
  expect(branch.explanation).toContain(`[${policyId(policy)}]`);
  const boundaryJob = { ...job, prompt: 'Context\n' + JSON.stringify({ candidates: [{ id: 'boundary', ownWin: 1 - 0.55 }] }) };
  expect(prepareDecision(boundaryJob, policy).checkpointId).toBe('boundary');
  expect(() => prepareDecision({ ...job, prompt: 'Context\n{"candidates":[{"id":"weak","ownWin":0.44}]}' }, policy)).toThrow('No own decision checkpoint');
  const original = structuredClone(experiment);
  const review = policyReview(policy, { ...experiment, review: 'Operator note.' });
  expect(review).toContain('Operator note.'); expect(review).toContain('0.45');
  expect(policyReview(policy, { ...experiment, review })).toBe(review);
  expect(experiment).toEqual(original); expect(experiment.config.retryThreshold).toBe(0.33);
  expect(() => runnerPolicySchema.parse({ ...policy, paceAfterMs: 300001 })).toThrow();
  expect(() => runnerPolicySchema.parse({ version: 1, retryThreshold: 0.45, decisionTimeMs: 300000, blackTarget: 0.6 })).toThrow();
  expect(policyId(policy)).toBe('runner-policy-f19e6cf8f9639a13');
  const openingPolicy = runnerPolicySchema.parse({ ...policy, version: 3, noEligibleCheckpoint: 'opening' });
  expect(prepareDecision(job, openingPolicy).checkpointId).toBe('turn3');
  expect(prepareDecision(job, openingPolicy).retryNote).toBeUndefined();
});

it.each(['white', 'black'] as const)('falls back to the earliest own decision for %s without inventing a qualifying forecast', player => {
  const explorer = new ExplorerStore(); cleanup.push(() => explorer.close());
  const { experiment } = explorer.create({});
  const openingPolicy = runnerPolicySchema.parse({ ...policy, version: 3, noEligibleCheckpoint: 'opening' });
  const job: ExplorerJob = { id: 'lease', kind: 'branch', player, checkpointId: 'lost', leaseUntil: Date.now() + 360000, config: experiment.config,
    prompt: 'For turn: choose moves. For branch: retry later.\n' + JSON.stringify({ memory: 'My lessons', playedTurns: ['prior-game'], candidates: [
      { id: 'latest', ownWin: 0.06 }, { id: 'strongest', ownWin: 0.44 }, { id: 'opening', ownWin: 0.2 },
    ] }) };
  const prepared = prepareDecision(job, openingPolicy);
  expect(prepared.checkpointId).toBe('opening'); expect(prepared.retryNote).toContain('no own turn-start forecast met 45%');
  expect(prepared.prompt).toContain('My lessons'); expect(prepared.prompt).toContain('prior-game');
  expect(prepared.prompt).not.toContain('ownWin >= 0.45');
  const branch = enforcePolicy({ ...reply, kind: 'branch', checkpointId: 'opening', explanation: 'Lesson: my economy was too slow. Strategy: contest mining before the opponent expands.', memory: 'Try early mining pressure.' }, job, prepared.checkpointId, openingPolicy, prepared.retryNote);
  expect(branch.explanation).toContain('Opening fallback:');
  expect(() => enforcePolicy({ ...branch, checkpointId: 'strongest' }, job, prepared.checkpointId, openingPolicy, prepared.retryNote)).toThrow('selected retry');
  const finishPolicy = runnerPolicySchema.parse({ ...openingPolicy, noEligibleCheckpoint: 'finish' });
  expect(prepareDecision(job, finishPolicy).finishReason).toBe('no-qualifying-retry-checkpoint');
  expect(policyReview(openingPolicy, experiment)).toContain('earliest own turn-start');
  expect(policyReview(finishPolicy, experiment)).toContain('finish normally');
});

it.each(['opening', 'finish'] as const)('handles an entire losing game below 45%% over HTTP: %s', async noEligibleCheckpoint => {
  const explorer = new ExplorerStore(), rooms = new RoomStore(); cleanup.push(() => { rooms.close(); explorer.close(); });
  const server = createApp(rooms, { publicUrl: 'http://localhost', explorer }).listen(0, '127.0.0.1'); cleanup.push(() => server.close());
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const { experiment, token } = explorer.create({ handicap: 18.5, terminalOnly: true, maxPlies: 11, maxGames: 5, retryThreshold: 0.45 });
  const id = experiment.id;
  for (let turn = 0; turn < 10; turn++) {
    for (let seat = 0; seat < 2; seat++) {
      const job = explorer.claim(id, token, 'fixture')!;
      explorer.submit(id, token, job.id, modelResult({ ...reply, whiteWin: 0.2, memory: `Lessons for ${job.player}.` }));
    }
    const job = explorer.claim(id, token, 'fixture')!;
    explorer.submit(id, token, job.id, modelResult({ ...reply, kind: 'turn', actionsJson: noop, memory: `Lessons for ${job.player}.` }));
  }
  const before = explorer.get(id), original = structuredClone(before.games[0]);
  expect(original.outcome).toMatchObject({ kind: 'rules', winner: 'black' });
  const cp = before.checkpoints[0];
  let move: AIAction | undefined;
  for (const unit of cp.state.board.units.filter(u => u.owner === 'white')) {
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) {
      const candidate: AIAction = { type: 'MOVE', unitId: unit.id, to: { x, y } };
      if (isLegalAction(cp.state, candidate)) move ??= candidate;
    }
  }
  expect(move).toBeDefined();
  const amended = runnerPolicySchema.parse({ ...policy, version: 3, noEligibleCheckpoint });
  let calls = 0;
  await runExperiment({ server: `http://127.0.0.1:${(server.address() as { port: number }).port}`, experimentId: id, token, workerId: 'fallback-test' }, new AbortController().signal,
    async (player, prompt) => {
      calls++; expect(noEligibleCheckpoint).toBe('opening');
      expect(prompt).toContain('Opening fallback:'); expect(prompt).toContain('Lessons for white.');
      if (calls === 3) expect(prompt).toContain('already explored');
      return { reply: { ...reply, kind: 'branch', checkpointId: calls === 1 ? before.checkpoints[8].id : cp.id,
        actionsJson: calls <= 2 ? noop : JSON.stringify([move!, ...JSON.parse(noop)]),
        explanation: 'Lesson: passive play lost the race. Strategy: develop a different mining route with pressure.', memory: 'Earlier passive route lost; trying a new opening.' }, usage: { model: player.model, elapsedMs: 1 } };
    }, amended);
  const done = explorer.get(id);
  expect(done.games[0]).toEqual(original); expect(done.config).toEqual(before.config);
  expect(done.status).toBe('complete'); expect(done.review).toContain(policyId(amended));
  if (noEligibleCheckpoint === 'opening') {
    expect(calls).toBe(3); expect(done).toMatchObject({ plies: 11, modelCalls: 3, stopReason: 'move-budget' });
    expect(done.games).toHaveLength(2); expect(done.games[1]).toMatchObject({ parentId: original.id, forkCheckpoint: cp.id });
    expect(done.games[1].forkReason).toContain('Opening fallback:');
    expect(done.checkpoints.at(-1)!.state.blackCrystalHandicap).toBe(18.5);
  } else {
    expect(calls).toBe(0); expect(done).toMatchObject({ plies: 10, modelCalls: 0, stopReason: 'no-qualifying-retry-checkpoint' });
    expect(done.games).toHaveLength(1);
  }
});

it('reminds after five minutes across previews and accepts the decision without pausing or aborting', async () => {
  const explorer = new ExplorerStore(), rooms = new RoomStore(); cleanup.push(() => { rooms.close(); explorer.close(); });
  const server = createApp(rooms, { publicUrl: 'http://localhost', explorer }).listen(0, '127.0.0.1'); cleanup.push(() => server.close());
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const { experiment, token } = explorer.create({ maxPlies: 1 });
  let now = Date.now(), calls = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const prompts: string[] = [];
  await runExperiment({ server: `http://127.0.0.1:${(server.address() as { port: number }).port}`, experimentId: experiment.id, token, workerId: 'pacing-test' }, new AbortController().signal,
    async (_player, prompt, signal) => {
      prompts.push(prompt); calls++; now += 200000;
      expect(signal?.aborted).toBe(false);
      const kind = calls <= 2 ? 'preview' : prompt.includes('"task":"assess"') ? 'assess' : 'turn';
      return { reply: { ...reply, kind, actionsJson: kind === 'turn' ? noop : '[]' }, usage: { model: _player.model, elapsedMs: 200000 } };
    }, policy);
  expect(calls).toBe(5); expect(prompts[0]).not.toContain('PACING REMINDER:');
  expect(prompts[2]).toContain('400s elapsed'); expect(prompts[2]).toContain('PACING REMINDER:');
  expect(prompts[3]).toContain('0s elapsed'); expect(prompts[3]).not.toContain('PACING REMINDER:');
  const done = explorer.get(experiment.id);
  expect(done).toMatchObject({ status: 'complete', stopReason: 'move-budget', plies: 1, modelCalls: 5 });
  expect(done.usage).toHaveLength(5); expect(done.review).toContain(policyId(policy));
});

it.each(['recover', 'exhaust', 'authentication', 'operator-stop'] as const)('handles timed-out calls within the existing decision budget: %s', async mode => {
  const explorer = new ExplorerStore(), rooms = new RoomStore(); cleanup.push(() => { rooms.close(); explorer.close(); });
  const server = createApp(rooms, { publicUrl: 'http://localhost', explorer }).listen(0, '127.0.0.1'); cleanup.push(() => server.close());
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const { experiment, token } = explorer.create({ maxPlies: 1 });
  let now = Date.now(), calls = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const controller = new AbortController(), prompts: string[] = [];
  const running = runExperiment({ server: `http://127.0.0.1:${(server.address() as { port: number }).port}`, experimentId: experiment.id, token, workerId: 'timeout-test' }, controller.signal,
    async (player, prompt) => {
      calls++; prompts.push(prompt);
      if (mode === 'operator-stop') controller.abort();
      if (mode === 'authentication') throw new Error('Subscription login required.');
      if (mode !== 'recover' || calls <= 2) { now += 300000; throw new ModelCallTimeoutError(); }
      const assess = prompt.includes('"task":"assess"');
      return { reply: { ...reply, kind: assess ? 'assess' : 'turn', actionsJson: assess ? '[]' : noop }, usage: { model: player.model, elapsedMs: 1 } };
    }, policy);
  if (mode === 'recover') {
    await running;
    expect(calls).toBe(5); expect(prompts[2]).toContain('previous model call timed out'); expect(prompts[2]).toContain('PACING REMINDER:');
    expect(explorer.get(experiment.id)).toMatchObject({ status: 'complete', plies: 1, modelCalls: 5 });
  } else {
    await expect(running).rejects.toThrow(mode === 'exhaust' ? 'exhausted 12 attempts' : mode === 'authentication' ? 'Subscription login required' : 'Runner stopped by operator');
    expect(calls).toBe(mode === 'exhaust' ? 12 : 1);
    const state = explorer.get(experiment.id);
    expect(state).toMatchObject({ status: 'paused', plies: 0, modelCalls: calls });
    expect(state.games[0].outcome).toBeUndefined(); expect(state.usage).toHaveLength(0);
    if (mode === 'exhaust') expect(prompts[11]).toContain('Only 1 model call(s) remain');
  }
});

it('includes CLI setup time in the five-minute model-call ceiling', async () => {
  let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
  await invokeModel({ provider: 'codex', model: 'gpt-6-astra', effort: 'high' }, 'prompt', undefined, async (_command, args, _input, options) => {
    if (args.includes('list')) { expect(options.timeoutMs).toBe(300000); now += 20000; return { stdout: '[]', stderr: '' }; }
    expect(options.timeoutMs).toBe(280000);
    await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(reply));
    return { stdout: '{"type":"turn.completed"}', stderr: '' };
  });
});

it('reports actionable JSON stdout failures ahead of stderr warnings and cancels child processes', async () => {
  const stdout = '{"type":"turn.failed","error":{"message":"upstream connection closed"}}\n';
  expect(processFailure(stdout, 'WARN database discrepancy')).toMatch(/^upstream connection closed\nWARN database discrepancy/);
  await expect(runProcess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({type:"error",message:"actual failure"})); process.stderr.write("incidental warning"); process.exitCode=1'], '',
    { cwd: process.cwd(), timeoutMs: 1000, env: process.env })).rejects.toThrow('actual failure');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Operator stopped the model.')), 50);
  try {
    await expect(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], '',
      { cwd: process.cwd(), timeoutMs: 1000, env: process.env, signal: controller.signal })).rejects.toThrow('Operator stopped the model');
  } finally { clearTimeout(timer); }
  await expect(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], '',
    { cwd: process.cwd(), timeoutMs: 50, env: process.env })).rejects.toBeInstanceOf(ModelCallTimeoutError);
});
