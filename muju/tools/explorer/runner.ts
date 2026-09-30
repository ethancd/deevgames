import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ExplorerJob, ExplorerSnapshot } from '../../src/explorer/types';
import { preflight, invokeModel, ModelCallTimeoutError, type ModelReply } from './providers';
import { MAX_DECISION_CALLS, pacingReminder, enforcePolicy, policyReview, prepareDecision, runnerPolicySchema, type RunnerPolicy } from './policy';

export interface RunnerConnection { server: string; experimentId: string; token: string; workerId: string }
class ApiError extends Error { constructor(message: string, public code: string) { super(message); } }
export function api(connection: Pick<RunnerConnection, 'server' | 'token'>) {
  return async <T>(path: string, body?: unknown): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(`${connection.server}/api/muju/experiments${path}`, { method: body === undefined ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.token}` }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
        const json = await response.json();
        if (!response.ok) throw new ApiError(json.error ?? `HTTP ${response.status}`, json.code ?? 'HTTP_ERROR');
        return json;
      } catch (error) {
        if (error instanceof ApiError || attempt >= 2 || (path === '' && body !== undefined)) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  };
}
export function modelResult(reply: ModelReply) {
  const actions = JSON.parse(reply.actionsJson);
  if (!Array.isArray(actions)) throw new Error('actionsJson must encode an array.');
  if (reply.kind === 'assess') return { kind: 'assess', assessment: { whiteWin: reply.whiteWin, pressure: reply.pressure, counterplay: reply.counterplay, explanation: reply.explanation }, memory: reply.memory };
  if (reply.kind === 'turn') return { kind: 'turn', actions, explanation: reply.explanation, memory: reply.memory };
  if (reply.kind === 'branch') return { kind: 'branch', checkpointId: reply.checkpointId, actions, explanation: reply.explanation, memory: reply.memory };
  return { ...(reply.checkpointId ? { checkpointId: reply.checkpointId } : {}), actions, offset: reply.offset };
}
export async function runExperiment(connection: RunnerConnection, signal: AbortSignal, invoke = invokeModel, policy?: RunnerPolicy) {
  const request = api(connection), path = `/${connection.experimentId}`;
  let activeJob: ExplorerJob | null = null;
  let policyRecorded = false;
  try {
    while (!signal.aborted) {
      const state = await request<ExplorerSnapshot>(path);
      if (state.status === 'complete') { console.log(`Experiment complete: ${state.stopReason}. ${state.games.length} games, ${state.plies} new player-turns.`); return; }
      if (policy && !policyRecorded) {
        const note = policyReview(policy, state);
        if (note !== state.review) await request(`${path}/review`, { note });
        policyRecorded = true;
      }
      if (state.status === 'paused') { await new Promise(resolve => setTimeout(resolve, 2000)); continue; }
      const { job } = await request<{ job: ExplorerJob | null }>(`${path}/claim`, { workerId: connection.workerId });
      if (!job) { await new Promise(resolve => setTimeout(resolve, 2000)); continue; }
      activeJob = job;
      const controller = new AbortController();
      const started = Date.now();
      const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
      let checking = false;
      const monitor = setInterval(async () => {
        if (checking) return; checking = true;
        try { const state = await request<ExplorerSnapshot>(path); if (state.status !== 'running') controller.abort(); } catch { /* bounded request retry; submit still checks lease */ }
        finally { checking = false; }
      }, 3000);
      try {
        const prepared = prepareDecision(job, policy);
        if (prepared.finishReason) {
          await request(`${path}/control`, { action: 'stop', reason: prepared.finishReason });
          console.log(`Experiment complete: ${prepared.finishReason}. The prior game outcome is preserved.`);
          return;
        }
        let prompt = prepared.prompt;
        const usage: ExplorerSnapshot['usage'] = [];
        let submitted = false;
        for (let round = 0; round < MAX_DECISION_CALLS && !signal.aborted; round++) {
          controller.signal.throwIfAborted();
          const { allowed } = await request<{ allowed: boolean }>(`${path}/call`, { jobId: job.id, callId: randomUUID() });
          if (!allowed) return;
          controller.signal.throwIfAborted();
          console.log(`${job.player} · ${job.config.players[job.player].model} · ${job.kind} · call ${round + 1}`);
          let answer: Awaited<ReturnType<typeof invokeModel>>;
          try {
            answer = await invoke(job.config.players[job.player], prompt + pacingReminder(job, Date.now() - started, round, policy?.paceAfterMs), controller.signal);
          } catch (error) {
            controller.signal.throwIfAborted();
            if (!(error instanceof ModelCallTimeoutError)) throw error;
            console.warn(`${job.player} · ${job.kind} · call ${round + 1} timed out; ${MAX_DECISION_CALLS - round - 1} calls remain.`);
            prompt += '\nYour previous model call timed out without a response. No action from that call was submitted. Use the existing position and successful previews to finish promptly; this retry consumes the same decision call budget.';
            continue;
          }
          controller.signal.throwIfAborted();
          usage.push({ player: job.player, provider: job.config.players[job.player].provider, ...answer.usage });
          try {
            const input = modelResult(enforcePolicy(answer.reply, job, prepared.checkpointId, policy, prepared.retryNote));
            if (answer.reply.kind === 'preview') {
              const result = await request(`${path}/query`, { jobId: job.id, input });
              prompt += `\nYour preview request: ${JSON.stringify(answer.reply)}\nAuthoritative preview: ${JSON.stringify(result)}`;
            } else {
              await request(`${path}/submit`, { jobId: job.id, input, usage }); submitted = true; break;
            }
          } catch (error) {
            if (error instanceof ApiError && !['ILLEGAL_ACTION', 'INCOMPLETE_TURN', 'TURN_ENDED', 'DUPLICATE_BRANCH', 'INVALID_CANDIDATE', 'WRONG_RESULT_KIND', 'INVALID_REQUEST', 'ASSESSMENT_ONLY'].includes(error.code)) throw error;
            prompt += `\nYour last response: ${JSON.stringify(answer.reply)}\nCorrection required: ${error instanceof Error ? error.message : String(error)}. Nothing was committed. Return a corrected response.`;
          }
        }
        if (!submitted) throw new Error('Model exhausted 12 attempts for one task. Review and resume the experiment.');
      } catch (error) {
        const state = await request<ExplorerSnapshot>(path).catch(() => null);
        if (!signal.aborted && state?.status !== 'running' && state !== null) continue;
        throw error;
      } finally { clearInterval(monitor); signal.removeEventListener('abort', abort); }
      activeJob = null;
    }
  } catch (error) {
    const message = signal.aborted ? 'Runner stopped by operator.' : error instanceof Error ? error.message : String(error);
    const state = await request<ExplorerSnapshot>(path).catch(() => null);
    if (state?.status === 'running' && activeJob) await request(`${path}/control`, { action: 'pause', reason: message.slice(0,1000) }).catch(() => {});
    throw new Error(message);
  }
}

async function main() {
  const args = process.argv.slice(2), option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--help')) {
    console.log('Create: npm run explorer:runner -- --server http://localhost:3003 --create [--config config.json] [--connection ./muju-runner.private.json]\nResume: npm run explorer:runner -- --connection ./muju-runner.private.json [--policy policy.json]\nA version-3 policy records branching, a search hypothesis and learning instructions in the public review. noEligibleCheckpoint chooses opening fallback or normal completion when no estimate reaches the threshold. Version 2 retains its original pause behavior. Decisions have a five-minute soft pacing target; hard limits are five minutes per call and twelve calls per decision.\nConnect to a browser-created experiment: save its private runner connection file, then use --connection.\nModels: gpt-6-astra / claude-opus-5-5; high effort; existing subscription logins.'); return;
  }
  const connectionFile = resolve(option('--connection') ?? 'muju-runner.private.json');
  const policyInput = option('--policy') ? JSON.parse(await readFile(resolve(option('--policy')!), 'utf8')) : undefined;
  if (policyInput?.version === 1) throw new Error('Policy version 1 used a hard decision deadline. Preserve it as historical evidence and create a version-2 policy with paceAfterMs instead of decisionTimeMs to continue.');
  const policy = policyInput ? runnerPolicySchema.parse(policyInput) : undefined;
  let connection: RunnerConnection;
  if (args.includes('--create')) {
    try { await access(connectionFile); throw new Error(`Connection file already exists: ${connectionFile}. Use it to resume or choose a different --connection path.`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const server = (option('--server') ?? 'http://localhost:3003').replace(/\/$/, '');
    const config = option('--config') ? JSON.parse(await readFile(resolve(option('--config')!), 'utf8')) : {};
    const { explorerConfigSchema } = await import('../../server/explorer/schema');
    const parsed = explorerConfigSchema.parse(config);
    await preflight(Object.values(parsed.players));
    const serverUrl = new URL(server);
    if (!['http:', 'https:'].includes(serverUrl.protocol) || serverUrl.username || serverUrl.password) throw new Error('Use an HTTP(S) host without embedded credentials.');
    const created = await api({ server, token: '' })<{ experiment: ExplorerSnapshot; token: string }>('', parsed);
    connection = { server, experimentId: created.experiment.id, token: created.token, workerId: randomUUID() };
    await writeFile(connectionFile, JSON.stringify(connection, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  } else connection = JSON.parse(await readFile(connectionFile, 'utf8'));
  const state = await api(connection)<ExplorerSnapshot>(`/${connection.experimentId}`);
  await preflight(Object.values(state.config.players));
  console.log(`Watch: ${connection.server}/muju/explorer?experiment=${connection.experimentId}`);
  console.log(`Private runner connection saved at ${connectionFile}. Keep it private.`);
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort());
  await runExperiment(connection, controller.signal, invokeModel, policy);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
