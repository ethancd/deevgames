// @vitest-environment node
// These rules-bound checks stay active while the legacy Standard search tests
// in analyze.test.ts remain explicitly quarantined for the M4/M5 port.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadReplay, reconstruct, type LoadedReplay } from '../../lab/hard-ai/analyze/replay';
import { playGame } from '../../lab/harness/runner';
import { createBot as createScriptedBot } from '../../lab/harness/bots/index';
import type { AIAction as Action } from '../../src/ai/types';
import type { EngineBot } from '../../lab/harness/types';

const PILOT = path.resolve(import.meta.dirname, '../../lab/results/hard-ai-e0/pilot2-h0/replays');
/** The 9-turn `g3-s1` B orientation: short, and the hard seat is Black. */
const SHORT = path.join(PILOT, 'g3-s1_0_1-B-white.json');

function passBot(name: string): EngineBot {
  return {
    kind: 'engine',
    name,
    onGameStart(): void {
      /* nothing */
    },
    nextAction(): Promise<Action | null> {
      return Promise.resolve(null);
    },
  };
}

/**
 * RULES-BOUND RECONSTRUCTION (Phasing).
 *
 * `analyze/replay.ts` reads a replay's rule set off its own
 * `GameRecord.rulesVersion` — absent means Standard, which is every archived row
 * under `lab/results/**`, and a `muju-phasing-*` string means Phasing.
 * `muju-phasing-1` (10-ply inactivity clock, draw verdict), `muju-phasing-2`
 * (20 plies, draw verdict, amendment A4) and `muju-phasing-3` (10 plies again,
 * mined-total verdict — the revision this tree plays since the 2026-09-22 kill
 * clock) all reconstruct as Phasing: the
 * clock decides which rows may be POOLED, not which rule set replays one, and
 * that is `ladder/ruleset.ts#assertPoolableRevision`'s question rather than
 * this one's. Three things the
 * rule set decides, all of which a Standard-only reconstruction got wrong for a
 * Phasing replay:
 *
 *  1 the start position's `ruleset` field, which is what makes every later phase
 *    transition the recording's own;
 *  2 where a TURN ends — `END_PLACE_PHASE` hands off under Phasing while
 *    `END_ACTION_PHASE` mines and settles upkeep and keeps the same seat on
 *    move, so a segmentation keyed on the action type splits every turn in two
 *    and mis-indexes `players[side].turnMs`;
 *  3 the PENDING SUMMONS, which are public paid position and which the runner
 *    records per ply.
 */
describe('analyze: rules-bound reconstruction of a Phasing replay', () => {
  it('rebuilds a real Phasing game, matches its meta, and segments one turn per seat turn', async () => {
    const { record, replay: file } = await playGame({
      bots: { white: passBot('pass-w'), black: passBot('pass-b') },
      seed: 909,
      engineHash: 'test',
      runId: 'phasing-reconstruct',
      options: { recordReplay: true, maxTurns: 6 },
    });
    expect(file).not.toBeNull();
    // The revision this tree plays and stamps. `muju-phasing-2` since A4
    // (2026-09-19); `muju-phasing-3` since the 2026-09-22 kill clock advanced
    // the revision again (SPEC §2).
    expect(record.rulesVersion).toBe('muju-phasing-3');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-phasing-recon-'));
    try {
      const out = path.join(dir, 'g.json');
      fs.writeFileSync(out, `${JSON.stringify(file)}\n`);
      const loaded = loadReplay(out);
      expect(loaded.ruleset).toBe('phasing');
      const recon = reconstruct(loaded);
      expect(recon.openingState.ruleset).toBe('phasing');
      expect(recon.plies).toBe(record.plies);
      expect(recon.winner).toBe(record.winner);
      // (2): one reconstructed turn per seat turn the runner counted.
      for (const side of ['white', 'black'] as const) {
        expect(recon.bySide[side].length, `${side} turns`).toBe(record.players[side].turnsTaken);
      }
      // Every turn ends where the mover changes, and `END_ACTION_PHASE` — which
      // does NOT hand off under Phasing — never closes one.
      for (const turn of recon.turns) {
        expect(turn.startState.turn.currentPlayer).toBe(turn.side);
        if (!turn.terminal && turn !== recon.turns[recon.turns.length - 1]) {
          expect(turn.endState.turn.currentPlayer).not.toBe(turn.side);
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('REFUSES a Phasing replay whose recorded pending summons the rebuild does not reproduce', async () => {
    // A Rush-vs-Rush game buys, so its steps carry commitments to tamper with.
    const { replay: file } = await playGame({
      bots: { white: createScriptedBot('Rush'), black: createScriptedBot('Rush') },
      seed: 4711,
      engineHash: 'test',
      runId: 'phasing-pending',
      options: { recordReplay: true, maxTurns: 6 },
    });
    expect(file).not.toBeNull();
    const withPending = file!.steps.findIndex(s => (s.pendingSummons ?? []).length > 0);
    expect(withPending, 'a Rush-vs-Rush Phasing game commits to at least one summon').toBeGreaterThan(0);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-pending-'));
    try {
      const out = path.join(dir, 'g.json');
      fs.writeFileSync(out, `${JSON.stringify(file)}\n`);
      const loaded = loadReplay(out);
      expect(() => reconstruct(loaded)).not.toThrow();
      // Move one commitment one square: the board, the banks and the reserves
      // are all untouched, so ONLY the pending check can catch it.
      const tampered: LoadedReplay = {
        ...loaded,
        stored: {
          ...loaded.stored,
          steps: loaded.stored.steps.map((step, i) =>
            i === withPending
              ? { ...step, pendingSummons: step.pendingSummons!.map((s, k) => (k === 0 ? { ...s, x: (s.x + 1) % 10 } : s)) }
              : step,
          ),
        },
      };
      expect(() => reconstruct(tampered)).toThrow(/pending summons diverged/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('reads the rule set off the record and refuses a revision it has not been taught', () => {
    const replay = loadReplay(SHORT);
    expect(replay.meta.rulesVersion).toBeUndefined(); // archived E0 row
    expect(replay.ruleset).toBe('standard');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-revision-'));
    try {
      const out = path.join(dir, 'g.json');
      fs.writeFileSync(out, JSON.stringify({
        ...replay.stored,
        meta: { ...replay.meta, rulesVersion: 'muju-someday-9' },
      }));
      expect(() => loadReplay(out)).toThrow(/unknown rulesVersion/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
