// Read-only post-completion audit; never opens game outcomes for an active run.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createInitialGameState } from './deevgames-gate1-legal-oracle/muju/src/game/board.ts';
import { applyAction } from './deevgames-gate1-legal-oracle/muju/src/ai/simulate.ts';
import { isLegalAction } from './deevgames-gate1-legal-oracle/muju/src/game/legality.ts';
import { getUnitDefinition } from './deevgames-gate1-legal-oracle/muju/src/game/units.ts';
import { checkVictory } from './deevgames-gate1-legal-oracle/muju/src/game/victory.ts';
import { checkInvariants } from './deevgames-gate1-legal-oracle/muju/lab/harness/invariants.ts';
import { deriveSeed } from './deevgames-gate1-legal-oracle/muju/lab/harness/rng.ts';
import { summarize } from './deevgames-gate1-legal-oracle/muju/lab/ai/gate1-report.ts';
import { withHeavySlot, heavyBypassed } from './deevgames-gate1-legal-oracle/muju/lab/hard-ai/ladder/heavy.ts';

const root = '/Users/ashkie/Documents/Codex/2026-09-18/wba/work/deevgames-gate1-legal-oracle/muju';
const fixedCommit = '32f83b88541e8a63ecb9b9f62d468cf17219011e';
const fixedIdentity = '06e4f4dbcfda663e0abf27a3d5211ce96d67f1dfbbe5688e0c305157a2b56e28';
const preregHash = '3140974aa223b820d084c83453a1cf88ea067cabc4b2b003d19f65fa1b08202d';
const [input, output, option] = process.argv.slice(2);
assert(input && output && path.isAbsolute(input) && path.isAbsolute(output), 'Usage: audit <completed-run-dir> <new-output.json> [--pilot-check]');
assert(option === undefined || option === '--pilot-check', 'Unknown option');
assert(!existsSync(output), 'Preserve previous audit: choose a new output path');
const mode = option === '--pilot-check' ? 'pilot' : 'full';
const expectedGames = mode === 'full' ? 1024 : 16;
const read = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const sha = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
const auditSourceHash = sha(readFileSync(process.argv[1]));

// This guard runs BEFORE queue acquisition or any outcome/replay/summary read.
const manifestBytes = readFileSync(`${input}/manifest.json`);
const manifest = JSON.parse(manifestBytes.toString());
assert(manifest.status === 'complete' && manifest.mode === mode && manifest.completedGames === expectedGames && manifest.finishedAt,
  'Refusing outcome access: run is not complete with the required game count');
assert(manifest.git === fixedCommit && manifest.gitStatus === '' && manifest.amendment === 'A2', 'Run source/protocol mismatch');
assert(!heavyBypassed(), 'Audit refuses heavy-queue bypass');

await withHeavySlot(`gate1-a2-${mode}-completed-replay-audit`, async () => {
  const startedAt = new Date().toISOString();
  const issues: any[] = [], audited: any[] = [], evidenceHashes: Record<string, string> = {};
  let actions = 0, frames = 0;
  const add = (where: string, error: unknown) => issues.push({ where, error: error instanceof Error ? error.message : String(error) });
  const bytes = (relative: string) => {
    const value = readFileSync(`${input}/${relative}`); evidenceHashes[relative] = sha(value); return value;
  };
  const sourceHashCheck = (files: Record<string, string>) => {
    for (const [p, h] of Object.entries(files)) assert.equal(sha(readFileSync(`${root}/${p}`)), h, `Source drift: ${p}`);
  };
  const identityBytes = bytes('identity.json'), identity = JSON.parse(identityBytes.toString());
  assert.equal(sha(identityBytes), manifest.identityHash, 'Identity bytes');
  assert.equal(manifest.identityHash, fixedIdentity, 'Frozen A2 identity');
  assert.equal(sha(bytes('preregistration-A2.md')), preregHash, 'Preregistration bytes');
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), fixedCommit, 'Audit source commit');
  sourceHashCheck(identity.files);
  const bandsPath = 'lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json';
  const bands = read(`${root}/${bandsPath}`);
  const references = read(`${root}/lab/ai/gate1-references.json`);
  assert.equal(sha(readFileSync(`${root}/${bandsPath}`)), references.bandsSha256, 'Frozen behavioral bands');
  const entries = bytes('games.jsonl').toString().trim().split('\n').map(line => JSON.parse(line));
  const summary = JSON.parse(bytes('summary.json').toString());

  // Construct the frozen allocation independently of the reporter's schedule().
  const planned: any[] = [];
  const opponents = ['Rush', 'Expand', 'Balanced', 'aiv2-medium'];
  for (const [o, opponent] of opponents.entries()) for (const [h, handicap] of [0, 3].entries()) {
    for (let pair = 0; pair < (mode === 'full' ? 64 : 1); pair++) {
      const pairId = `${opponent}-h${handicap}-p${pair}`;
      const seed = deriveSeed(mode === 'full' ? 20260958 : 20260959, (o * 2 + h) * 64 + pair);
      for (const hardSeat of ['white', 'black']) planned.push({ id: `${pairId}-${hardSeat}`, pairId, opponent, handicap, pair, seed, hardSeat });
    }
  }
  try { assert.deepEqual(manifest.schedule, planned); assert.deepEqual(entries.map(e => e.task), planned); }
  catch (e) { add('frozen allocation / entry ordering', e); }
  try { assert.equal(entries.length, expectedGames); assert.equal(new Set(entries.map(e => e.task.id)).size, expectedGames); }
  catch (e) { add('game count / unique tasks', e); }

  for (const entry of entries) {
    const id = entry.task.id;
    try {
      assert.match(id, /^(Rush|Expand|Balanced|aiv2-medium)-h[03]-p\d+-(white|black)$/);
      const replay = JSON.parse(bytes(`replays/${id}.json`).toString());
      assert.equal(replay.schema, 'muju-lab-replay-v2');
      assert.deepEqual(replay.meta, entry.record, 'Replay/game metadata mismatch');
      assert.equal(entry.identityHash, fixedIdentity);
      assert.equal(entry.record.engineHash, fixedIdentity);
      assert.equal(entry.record.experiment, 'gate1-A2');
      assert.deepEqual(entry.record.options, JSON.parse(JSON.stringify({
        ...identity.options, blackCrystalHandicap: entry.task.handicap,
        actionsPerTurn: 4, upkeep: 'shipped', inactivityRule: 'on', recordReplay: true,
      })), 'Frozen match options');
      const configs = ['white', 'black'].map(seat => seat === entry.task.hardSeat ? identity.configHashes.hard
        : entry.task.opponent === 'aiv2-medium' ? identity.configHashes.medium : sha(json({ engine: 'scripted', bot: entry.task.opponent })));
      assert.equal(entry.record.engineConfigHash, configs.join('|'), 'Resolved configuration identity');
      let state = createInitialGameState(undefined, 4, entry.task.handicap, 'phasing');
      state.board.units.forEach((u, i) => { u.id = `initial-${i}`; });
      const buys: Record<string, number> = { white: 0, black: 0 }, trace: any[] = [];
      const arrivals: Record<string, number> = { white: 0, black: 0 }, refunds = { ...arrivals };
      let completedTurns = 0;
      assert.equal(replay.steps.length, entry.record.plies + 1, 'Replay frame count');
      for (const [index, step] of replay.steps.entries()) {
        if (index === 0) {
          assert.equal(step.action, null, 'Initial replay action');
          assert.equal(step.player, state.turn.currentPlayer, 'Initial replay actor');
          assert.equal(step.ply, 0, 'Initial replay ply');
        } else {
          assert(step.action && typeof step.action === 'object', 'Missing replay action');
          assert.equal(state.phase, 'playing', `Action after terminal at ${step.ply}`);
          assert.equal(checkVictory(state.board).status, 'ongoing', `Action after board terminal at ${step.ply}`);
          assert(state.turn.turnNumber <= entry.record.options.maxTurns && trace.length < entry.record.options.maxPlies,
            `Action after cap at ${step.ply}`);
          assert.equal(step.player, state.turn.currentPlayer, `Actor at ${step.ply}`);
          assert(isLegalAction(state, step.action), `Illegal action at ${step.ply}`);
          const before = state;
          if (step.action.type === 'BUY_UNIT') buys[step.player]++;
          state = applyAction(state, step.action);
          assert.notEqual(state, before, `No-op at ${step.ply}`);
          if (step.action.type === 'END_PLACE_PHASE') completedTurns++;
          for (const pending of before.pendingSummons ?? []) {
            if ((state.pendingSummons ?? []).some(s => s.id === pending.id)) continue;
            if (state.board.units.some(u => u.id === pending.id)) arrivals[pending.owner]++;
            else refunds[pending.owner]++;
          }
          trace.push(step.action); actions++;
        }
        assert.equal(step.ply, trace.length, 'Replay ply sequence');
        checkInvariants(state, `${id}/${step.ply}`);
        const expected: Record<string, unknown> = {
          turn: state.turn.turnNumber, phase: state.turn.phase, actionsRemaining: state.turn.actionsRemaining,
          units: state.board.units.map(u => ({ o: u.owner, d: u.definitionId, x: u.position.x, y: u.position.y, dmg: u.damageTaken })),
          pendingSummons: (state.pendingSummons ?? []).map(s => ({ o: s.owner, d: s.definitionId, x: s.position.x, y: s.position.y, cost: s.cost })),
          cells: state.board.cells.flat().map(c => c.resourceLayers),
          res: Object.fromEntries(['white', 'black'].map(p => [p, { r: state.players[p].resources, g: state.players[p].resourcesGained, s: state.players[p].resourcesGained - state.players[p].resources }])),
        };
        for (const [key, value] of Object.entries(expected)) assert.deepEqual(step[key], value, `Frame ${step.ply}/${key}`);
        frames++;
      }
      assert.equal(sha(JSON.stringify(trace)), entry.traceSha256, 'Action trace hash');
      assert.equal(trace.length, entry.record.plies);
      assert.equal(completedTurns, entry.record.completedTurns);
      assert.equal(state.turn.turnNumber, entry.record.turns);
      assert.equal(!!(state.victoryReason === 'inactivity'), entry.record.inactivityDraw);
      assert.equal(!!entry.record.adjudicated, !!entry.record.capReason);
      for (const side of ['white', 'black']) {
        assert.equal(entry.record.players[side].illegalActions, 0);
        assert.equal(entry.record.players[side].unitsPlaced, buys[side]);
      }
      assert.deepEqual(entry.telemetry.arrivals, arrivals);
      assert.deepEqual(entry.telemetry.refunds, refunds);
      assert(!entry.record.invariantViolation && !entry.record.anomalies.length, 'Recorded correctness veto');
      const vic = checkVictory(state.board);
      let winner = state.winner, reason: string | undefined = state.victoryReason;
      if (entry.record.adjudicated) {
        assert.equal(state.phase, 'playing', 'Adjudicated terminal state');
        assert.equal(vic.status, 'ongoing');
        const plyCap = trace.length >= entry.record.options.maxPlies;
        assert(plyCap || state.turn.turnNumber > entry.record.options.maxTurns, 'Unreached adjudication cap');
        assert.equal(entry.record.capReason, plyCap ? 'ply-cap' : 'round-cap');
        assert.equal(entry.record.adjudicationFormula, 'material+bank+pending-cost');
        const score = (side: string) => state.board.units.filter(u => u.owner === side).reduce((n, u) => n + getUnitDefinition(u.definitionId).cost, 0)
          + state.players[side].resources + (state.pendingSummons ?? []).filter(s => s.owner === side).reduce((n, s) => n + s.cost, 0);
        const w = score('white'), b = score('black');
        winner = w === b ? null : w > b ? 'white' : 'black'; reason = w === b ? 'draw' : 'adjudication';
      } else if (state.phase !== 'victory') {
        assert(vic.status !== 'ongoing', 'Replay stops before a terminal state or cap');
        winner = vic.status === 'victory' ? vic.winner : null; reason = vic.status === 'victory' ? 'elimination' : 'draw';
      }
      assert.equal(entry.record.winner, winner, 'Final winner');
      assert.equal(entry.record.winType, reason, 'Final outcome reason');
      audited.push({ id, actions: trace.length, completedTurns, hardPurchases: buys[entry.task.hardSeat], adjudicated: !!entry.record.adjudicated });
    } catch (e) { add(id, e); }
  }

  // Frozen reporter reproduction is explicitly distinguished from replay auditing.
  let recomputed: any = null, summaryReproduced = false;
  try {
    recomputed = summarize(entries, mode, fixedIdentity, bands);
    // Compare the persisted JSON representation: JSON serializes -0 as 0.
    assert.deepEqual(summary, JSON.parse(JSON.stringify(recomputed)), 'Frozen reporter summary reproduction');
    assert.equal(manifest.gate1, recomputed.gate1);
    assert.deepEqual(recomputed.errors, [], 'Reporter correctness/schedule veto');
    summaryReproduced = true;
  } catch (e) { add('summary reproduction', e); }
  // Gate failure is a valid experimental result: it must not make this audit
  // discard evidence, change bands, require zero adjudications, or start a rerun.
  try {
    assert.equal(sha(readFileSync(process.argv[1])), auditSourceHash, 'Audit script changed during execution');
    sourceHashCheck(identity.files);
    assert.equal(sha(readFileSync(`${input}/manifest.json`)), sha(manifestBytes));
    for (const [p, h] of Object.entries(evidenceHashes)) assert.equal(sha(readFileSync(`${input}/${p}`)), h, `Evidence changed: ${p}`);
  }
  catch (e) { add('source / manifest stability', e); }
  const result = {
    startedAt, finishedAt: new Date().toISOString(), mode, input, sourceCommit: fixedCommit,
    auditScriptSha256: auditSourceHash, manifestSha256: sha(manifestBytes),
    identityHash: fixedIdentity, sourceHashesVerified: Object.keys(identity.files).length,
    expectedGames, games: entries.length, fullyAuditedGames: audited.length, actions, frames,
    correctnessAuditPassed: issues.length === 0, issues, gate1: summary.gate1,
    criteriaMet: summary.criteriaMet, summaryReproduced,
    adjudications: audited.filter(g => g.adjudicated).length,
    minimumHardPurchases: audited.length ? Math.min(...audited.map(g => g.hardPurchases)) : null,
    totalHardPurchases: audited.reduce((n, g) => n + g.hardPurchases, 0),
    failedCriteria: summary.rows.filter((r: any) => (r.strengthGated && !r.strengthMet) || r.behavioralBandsMet === false || !r.mustBuyMet || !r.adjudicationMet),
    scope: 'Independent canonical replay/frame/trace/telemetry audit and frozen allocation checks; summary recomputed using frozen reporter. No new games, altered criteria, responsiveness measurement, worker unlock or Hard gate acceptance.',
    evidenceHashes, audited,
  };
  writeFileSync(output, json(result), { flag: 'wx' });
  console.log(JSON.stringify({ correctnessAuditPassed: result.correctnessAuditPassed, games: result.games, fullyAuditedGames: result.fullyAuditedGames, actions, frames, issues: issues.length, gate1: result.gate1 }));
  if (issues.length) process.exitCode = 1;
});
