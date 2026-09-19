// Reproduce from muju/: node --import tsx lab/ai/results/t2b-gate1-pilot-2026-09-19/audit.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createInitialGameState } from '../../../../src/game/board.ts';
import { applyAction } from '../../../../src/ai/simulate.ts';
import { isLegalAction } from '../../../../src/game/legality.ts';
import { checkInvariants } from '../../../harness/invariants.ts';
import { withHeavySlot } from '../../../hard-ai/ladder/heavy.ts';
import { summarize } from '../../gate1-report.ts';

const out = 'lab/ai/results/t2b-gate1-pilot-2026-09-19';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const sha = s => createHash('sha256').update(s).digest('hex');
const normalize = s => ({
  units: s.board.units.map(u => ({ o: u.owner, d: u.definitionId, x: u.position.x, y: u.position.y, dmg: u.damageTaken })),
  pendingSummons: (s.pendingSummons ?? []).map(p => ({ o: p.owner, d: p.definitionId, x: p.position.x, y: p.position.y, cost: p.cost })),
  cells: s.board.cells.flat().map(c => c.resourceLayers),
});
await withHeavySlot('gate1-evidence-replay-audit', async () => {
  const manifest = read(`${out}/manifest.json`), identity = read(`${out}/identity.json`);
  assert.equal(manifest.status, 'complete');
  assert.equal(sha(readFileSync(`${out}/identity.json`)), manifest.identityHash);
  for (const [file, hash] of Object.entries(identity.files)) assert.equal(sha(readFileSync(file)), hash, file);
  const entries = readFileSync(`${out}/games.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
  const bands = read('lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json');
  const refs = read('lab/ai/gate1-references.json');
  // Normalize JSON number semantics: Elo can produce -0, which serializes as 0.
  const recomputed = JSON.parse(JSON.stringify(summarize(entries, 'pilot', manifest.identityHash, bands, refs.proposedElo)));
  assert.deepEqual(recomputed, read(`${out}/summary.json`));
  let actions = 0, workTurns = 0, maxHardWork = 0, maxMediumWork = 0;
  for (const e of entries) {
    const replay = read(`${out}/replays/${e.task.id}.json`);
    const trace = replay.steps.slice(1).map(s => s.action);
    assert.equal(sha(JSON.stringify(trace)), e.traceSha256);
    let state = createInitialGameState(undefined, 4, e.task.handicap, 'phasing');
    state.board.units.forEach((u, i) => { u.id = `initial-${i}`; });
    state.victoryRule = e.record.options.victoryRule;
    state.inactivityRule = e.record.options.inactivityRule;
    for (const step of replay.steps.slice(1)) {
      assert.equal(state.turn.currentPlayer, step.player);
      assert.ok(isLegalAction(state, step.action), `${e.task.id} ply ${step.ply}`);
      const before = state; state = applyAction(state, step.action); assert.notEqual(state, before);
      checkInvariants(state, e.task.id);
      assert.deepEqual(normalize(state), { units: step.units, pendingSummons: step.pendingSummons, cells: step.cells });
      actions++;
    }
    assert.equal(state.winner, e.record.winner); assert.equal(state.phase, 'victory');
    for (const difficulty of ['hard', 'medium']) {
      const decisions = e.telemetry[difficulty]; if (!decisions) continue;
      const limit = difficulty === 'hard' ? 6000 : 3000;
      let turn = -1, remaining = limit, spent = 0;
      for (const d of decisions) {
        if (d.turn !== turn) { turn = d.turn; remaining = limit; spent = 0; workTurns++; }
        assert.ok(d.requested >= 0 && Number.isInteger(d.requested));
        remaining -= d.requested; spent += d.requested;
        assert.ok(remaining >= 0); assert.equal(d.remaining, remaining);
        assert.notEqual(d.stopReason, 'deadline');
        if (difficulty === 'hard') maxHardWork = Math.max(maxHardWork, spent);
        else maxMediumWork = Math.max(maxMediumWork, spent);
      }
    }
  }
  const report = { checkedAt: new Date().toISOString(), sourceHashesVerified: Object.keys(identity.files).length,
    games: entries.length, legalReplayActions: actions, replaySnapshotsMatched: true,
    summaryRecomputed: true, identityHashVerified: true, workTurnsAudited: workTurns,
    maxHardRequestedWork: maxHardWork, maxMediumRequestedWork: maxMediumWork };
  writeFileSync(`${out}/replay-audit.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
});
