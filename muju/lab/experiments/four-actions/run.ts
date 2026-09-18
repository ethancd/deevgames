import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MAX_ACTIONS_PER_TURN } from './.sandbox/src/game/board';
import { getUnitDefinition } from './.sandbox/src/game/units';
import { playGame } from './.sandbox/lab/harness/runner';
import { deriveSeed } from './.sandbox/lab/harness/rng';
import { makeHomeBot } from './.sandbox/lab/experiments/home-policies';

const OUT = new URL('../../results/four-actions-2026-09-12/', import.meta.url);
const n = Number(process.argv[2] ?? 10), label = process.argv[3] ?? 'paired';
if (!Number.isInteger(n) || n < 1) throw Error('Expected positive seed count');
mkdirSync(OUT, { recursive: true });
const output = new URL(`${label}-${MAX_ACTIONS_PER_TURN}.jsonl`, OUT);
if (existsSync(output) || existsSync(new URL(`${label}-${MAX_ACTIONS_PER_TURN}.jsonl.gz`, OUT))) throw Error('Refusing to overwrite previous games');
export const pairs = [
  ['Aware:Rush', 'Aware:Expand'],
  ['Aware:Rush', 'Aware:AntiRush'],
  ['Aware:Balanced', 'Aware:Turtle'],
  ['Invade:MiningDenial', 'Guard:AntiRush'],
  ['Siege:3', 'Guard:AntiRush'],
  ['Siege:3', 'Aware:Rush'],
  ['Aware:Rush', 'Aware:Rush'],
  ['Aware:Balanced', 'Aware:Balanced'],
];
const sourceHash = createHash('sha256').update(readFileSync(new URL('source-manifest.json', OUT))).digest('hex');
writeFileSync(new URL(`${label}-${MAX_ACTIONS_PER_TURN}-manifest.json`, OUT), JSON.stringify({
  actions: MAX_ACTIONS_PER_TURN, n, pairs, seedBase: 9122026, maxTurns: 120, maxPlies: 8000,
  sourceHash, policy: 'Existing scripted policies, unchanged; home-aware wrappers use bounded search.',
  capPolicy: 'Caps are recorded as unresolved, regardless of harness adjudication.',
  started: new Date().toISOString(),
}, null, 2));
const started = Date.now();
let count = 0;
for (let cell = 0; cell < pairs.length; cell++) {
  const [a,b] = pairs[cell];
  for (let i = 0; i < n; i++) for (const swapped of [false,true]) {
    if (a === b && swapped) continue; // A mirror's color swap is the identical game.
    const seed = deriveSeed(9122026 + cell, i);
    const telemetry = {
      movementAP: 0, attacks: 0, completedTurns: 0, unusedAP: 0, damageHealed: 0,
      homeEntries: 0, homeClears: 0, peakArmy: 3, totalArmyAtEnd: 0,
      multiKillTurns: 0, threeKillTurns: 0, killsThisTurn: 0,
    };
    const id = `${label}-${MAX_ACTIONS_PER_TURN}-${cell}-${i}-${Number(swapped)}`;
    const result = await playGame({
      bots: { white: makeHomeBot(swapped ? b : a), black: makeHomeBot(swapped ? a : b) },
      seed, engineHash: sourceHash, runId: id, experiment: 'four-actions',
      options: { maxTurns: 120, maxPlies: 8000, legality: 'strict', checkInvariants: true,
        recordReplay: i === 0, upkeep: 'shipped', inactivityRule: 'on' },
      onAction(before, after, action, player) {
        if (before === after) throw Error(`Rejected action ${id}: ${JSON.stringify(action)}`);
        if (after.turn.actionsRemaining > MAX_ACTIONS_PER_TURN) throw Error('Budget reset incorrectly');
        if (action.type === 'MOVE') telemetry.movementAP += before.turn.actionsRemaining - after.turn.actionsRemaining;
        if (action.type === 'ATTACK') {
          telemetry.attacks++;
          telemetry.killsThisTurn += before.board.units.length - after.board.units.length;
          const home = before.players[player].startCorner;
          if (action.targetPosition.x === home.x && action.targetPosition.y === home.y && after.board.units.length < before.board.units.length) telemetry.homeClears++;
        }
        if (action.type === 'MOVE') {
          const home = before.players[player === 'white' ? 'black' : 'white'].startCorner;
          if (action.to.x === home.x && action.to.y === home.y) telemetry.homeEntries++;
        }
        if (action.type === 'END_ACTION_PHASE') {
          telemetry.completedTurns++;
          telemetry.unusedAP += before.turn.actionsRemaining;
          telemetry.totalArmyAtEnd += before.board.units.filter(u => u.owner === player).length;
          if (telemetry.killsThisTurn >= 2) telemetry.multiKillTurns++;
          if (telemetry.killsThisTurn >= 3) telemetry.threeKillTurns++;
          telemetry.killsThisTurn = 0;
        }
        for (const u of after.board.units) {
          const old = before.board.units.find(v => v.id === u.id);
          if (old && u.damageTaken < old.damageTaken) telemetry.damageHealed += old.damageTaken - u.damageTaken;
        }
        for (const p of ['white','black'] as const) {
          telemetry.peakArmy = Math.max(telemetry.peakArmy, after.board.units.filter(u => u.owner === p).length);
          for (const u of after.board.units.filter(u => u.owner === p)) getUnitDefinition(u.definitionId);
        }
      },
    });
    const r = result.record;
    const capped = r.turns > 120 || r.plies >= 8000;
    const invalid = !!r.invariantViolation || r.players.white.illegalActions + r.players.black.illegalActions > 0 || r.anomalies.length > 0;
    appendFileSync(output, JSON.stringify({ id, actions: MAX_ACTIONS_PER_TURN, cell, a, b, i, swapped, capped, invalid, telemetry, ...r }) + '\n');
    if (result.replay) writeFileSync(new URL(`replay-${id}.json`, OUT), JSON.stringify(result.replay));
    if (invalid) throw Error(`Invalid game ${id}`);
    count++;
  }
  console.log(JSON.stringify({ actions: MAX_ACTIONS_PER_TURN, cell, a, b, count, seconds: Math.round((Date.now()-started)/1000) }));
}
console.log('DONE', MAX_ACTIONS_PER_TURN, count);
