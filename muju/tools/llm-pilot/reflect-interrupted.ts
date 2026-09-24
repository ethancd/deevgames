/**
 * Postgame reflection for games INTERRUPTED by an operator outage (not a playing result).
 *
 * Resumes the player's own saved Codex session (same model and effort, fresh network), tells it
 * the game was cut off by the operator and ended on the clock, and asks for the normal reflection
 * about play UP TO the interruption. The record is published with result `invalid` and label
 * `INTERRUPTED`, so the playbook can use its evidence without counting a result.
 *
 *   node --import tsx tools/llm-pilot/reflect-interrupted.ts P05-W [P05-B ...]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX_BIN, stripApiKeys } from './auth';
import { codexArgs, extractCitedRevisions, parseTranscript } from './players';
import { appendExperience, curatePlaybook } from './publish';
import { MODEL_CLI_ID, gameDir, type GameId } from './pilot';

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function reflect(id: GameId): Promise<void> {
  const dir = gameDir(id);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const state = JSON.parse(readFileSync(path.join(dir, 'player', 'state.json'), 'utf8'));
  if (!state.sessionId || !state.workspace) throw new Error(`${id}: no saved player session.`);
  const actions = readFileSync(path.join(dir, 'actions.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const lastLlmRevision = actions.at(-1)?.revision ?? 0;
  const seat = JSON.parse(readFileSync(path.join(dir, 'secrets', 'seat.json'), 'utf8'));
  const room = await (await fetch(`${seat.serverUrl.replace(/\/$/, '')}/api/muju/rooms/${seat.roomId}`)).json() as { revision: number };
  const outcome = manifest.serverOutcome ?? {};
  const engine = manifest.engine ?? {};
  const vars: Record<string, string> = {
    gameId: id, roomId: manifest.roomId, seat: manifest.llmSeat, handicap: String(manifest.blackCrystalHandicap),
    tier: manifest.toolTier, model: MODEL_CLI_ID[manifest.model as keyof typeof MODEL_CLI_ID], effort: manifest.effort,
    snapshotVersion: `v${manifest.snapshotVersion}`,
    engineIdentity: `${engine.name} ${engine.profile} ${engine.targetMs}ms target / ${engine.deadlineMs}ms deadline, rules ${engine.rulesId}, source ${String(engine.sourceSha256).slice(0, 12)}`,
  };
  const template = readFileSync(path.join(HERE, 'prompts', 'reflection.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  const prompt = `IMPORTANT CONTEXT: this game was INTERRUPTED, not decided by play. The operator's machine lost `
    + `its network connection for about 2.7 hours after your last accepted action (revision ${lastLlmRevision}); `
    + `neither you nor the engine could reach the server, and the room later ended on the clock `
    + `(${outcome.kind ?? 'timeout'}). This is NOT a win or loss and it was not your fault. In your reflection, `
    + `set the result to "interrupted (operator network outage; room ended on clock)" and reflect only on play up `
    + `to revision ${lastLlmRevision}: your plan, the critical positions, what the engine did well, and a `
    + `hypothesis with evidence. Say who stood better at the interruption only as far as the evidence supports it.\n\n${template}`;
  const workspace = state.workspace as string;
  const args = codexArgs({ prompt, model: vars.model, effort: manifest.effort, cwd: workspace, gameDir: dir,
    tier: manifest.toolTier, resumeSessionId: state.sessionId });
  console.log(`${id}: resuming session ${state.sessionId} for reflection...`);
  const run = spawnSync(CODEX_BIN, args, { cwd: workspace, env: stripApiKeys().env, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(path.join(dir, 'player', 'transcript.reflect-interrupted.jsonl'), run.stdout ?? '');
  const reflection = parseTranscript('codex', run.stdout ?? '').finalText.trim();
  if (!reflection) throw new Error(`${id}: no reflection text (exit ${run.status}); see transcript.reflect-interrupted.jsonl`);
  writeFileSync(path.join(dir, 'reflection.md'), reflection);
  const record = await appendExperience({
    gameId: id, pairId: manifest.pairId, model: manifest.model, effort: manifest.effort, toolTier: manifest.toolTier,
    llmSeat: manifest.llmSeat, handicap: manifest.blackCrystalHandicap, result: 'invalid', turns: actions.length,
    citedRevisions: extractCitedRevisions(reflection), finalRevision: room.revision, reflection,
    writtenAt: new Date().toISOString(), label: 'INTERRUPTED',
  });
  console.log(`${id}: published (${record.citedRevisions.length} citations, ${record.droppedCitations?.length ?? 0} dropped).`);
}

const ids = process.argv.slice(2) as GameId[];
if (!ids.length) { console.error('usage: reflect-interrupted.ts <gameId>...'); process.exitCode = 2; }
else {
  const results = await Promise.allSettled(ids.map(reflect));
  results.forEach((r, i) => { if (r.status === 'rejected') console.error(`${ids[i]}: ${(r.reason as Error).message}`); });
  if (results.some(r => r.status === 'fulfilled')) {
    const curated = await curatePlaybook();
    console.log(`Playbook curated to v${curated.nextVersion}.`);
  }
}
