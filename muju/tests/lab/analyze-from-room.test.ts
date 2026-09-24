// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  RoomReplayError,
  convertRoom,
  fetchRoomBundle,
  parseCliArgs,
  parseSquare,
  readBundle,
  writeAndVerify,
  type ConvertOptions,
  type RoomBundle,
} from '../../lab/hard-ai/analyze/from-room';
import { hardSeat, loadReplay, reconstruct, ReplayMismatch } from '../../lab/hard-ai/analyze/replay';
import type { AIAction } from '../../src/ai/types';
import { extractCase } from '../../lab/hard-ai/exam/from-loss';
import { gameplayDigest as phasingDigest } from '../../lab/hard-ai/ladder/openings/phasing';
import { loadCaseState } from '../../lab/hard-ai/exam/format';
import type { AnalysisResult } from '../../lab/hard-ai/analyze/analyze';

vi.setConfig({ testTimeout: 30_000 });

/**
 * `analyze/from-room.ts` turns an online room into a lab replay. The fixture is
 * the real wave-1 game AS01-W (room 4fac4dfa…, Hard as Black at handicap 1,
 * lost on the kill clock at turn 5), fetched from production on 2026-09-24 with
 * the tool's own `fetchRoomBundle`: its public snapshot (minus the animation
 * recording), the root position and all 65 history events.
 *
 * The tamper tests are the point of the file: a converter that accepted a
 * history it could not reproduce would turn a wrong fact into a regression
 * case. Each one alters ONE recorded fact and asserts the refusal names it.
 */
const FIXTURE = path.resolve(__dirname, 'fixtures/from-room/AS01-W.room.json');

const OPTS: ConvertOptions = {
  engineSeat: 'black',
  engineLabel: 'hard@desktop',
  opponentLabel: 'llm@gpt-6-astra',
  handicap: 1,
  expectedWinner: 'white',
  expectedReason: 'kill-clock',
  rulesVersion: 'muju-phasing-4',
  gameId: 'AS01-W',
};

function bundle(): RoomBundle {
  return structuredClone(readBundle(FIXTURE));
}

function entry(b: RoomBundle, sequence: number): Record<string, unknown> {
  const e = b.history.entries.find(x => x.sequence === sequence);
  if (e === undefined) throw new Error(`fixture has no sequence ${sequence}`);
  return e as unknown as Record<string, unknown>;
}

function refusal(b: RoomBundle, opts: ConvertOptions = OPTS): string {
  try {
    convertRoom(b, opts);
  } catch (err) {
    expect(err).toBeInstanceOf(RoomReplayError);
    return (err as Error).message;
  }
  throw new Error('the conversion was expected to refuse');
}

function tempFile(name: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'muju-from-room-')), name);
}

describe('from-room: an online room becomes a verified lab replay', () => {
  it('rebuilds AS01-W through the canonical engine and every cross-check', () => {
    const { replay, report } = convertRoom(bundle(), OPTS);
    expect(report.events).toBe(65);
    expect(report.actions).toBe(57);
    // Ten turns, each ended by an inferred END_ACTION_PHASE and END_PLACE_PHASE.
    expect(report.inferredPhaseEnds).toBe(20);
    expect(report.winner).toBe('white');
    expect(report.winType).toBe('kill-clock');
    expect(report.checks.join('\n')).toMatch(/root position \(positions\/0\) equals the lab Phasing initial state/);
    expect(report.checks.join('\n')).toMatch(/65 history events re-derived/);
    expect(report.checks.join('\n')).toMatch(/final rebuilt position equals the room snapshot/);
    expect(report.checks.join('\n')).toMatch(/raw command log \(revisions 2-11, 57 actions, the whole game\)/);
    expect(replay.meta.rulesVersion).toBe('muju-phasing-4');
    expect(replay.meta.options.blackCrystalHandicap).toBe(1);
    expect(replay.meta.players.black.bot).toBe('hard@desktop');
    expect(replay.meta.players.white.bot).toBe('llm@gpt-6-astra');
    expect(hardSeat(replay.meta)).toBe('black');
    expect(replay.opening).toEqual({ id: 'initial', actions: [] });
    // The file keeps the SERVER's ids for the starting units.
    expect(replay.steps[1].action).toEqual({ type: 'MOVE', unitId: 'white_fire_1_1790236122909_6a9bl', to: { x: 2, y: 5 } });
  });

  it('writes a file analyze/replay.ts reconstructs to the same result, segmented per seat turn', () => {
    const conversion = convertRoom(bundle(), OPTS);
    const file = tempFile('AS01-W.json');
    const v = writeAndVerify(conversion, file);
    expect(v.plies).toBe(57);
    const loaded = loadReplay(file);
    const recon = reconstruct(loaded);
    expect(recon.winner).toBe('white');
    expect(recon.bySide.black.map(t => t.turnNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(recon.bySide.white.map(t => t.turnNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(recon.finalState.victoryReason).toBe('kill-clock');
  });

  it('cross-checks the engine seat against its own submission log', () => {
    const b = bundle();
    const submissions = b.room.history.filter(h => h.player === 'black').map(h => ({ revision: h.revision, actions: h.actions as unknown as AIAction[] }));
    const ok = convertRoom(b, { ...OPTS, engineSubmissions: submissions });
    expect(ok.report.checks.join('\n')).toMatch(/engine submission log \(5 submissions, 25 actions over 5 of 5 black turns\) equals the rebuilt actions, matched by revision/);
    const tampered = structuredClone(submissions);
    tampered[1].actions[0] = { type: 'MOVE', unitId: (tampered[1].actions[0] as { unitId: string }).unitId, to: { x: 0, y: 0 } };
    expect(refusal(b, { ...OPTS, engineSubmissions: tampered })).toMatch(/engine log disagrees on black T2 at action 0: submitted .*"to":\{"x":0,"y":0\}/);
    // A turn the log has no submission for (a restarted runner's recovered
    // request) is reported, not guessed at.
    const gap = convertRoom(b, { ...OPTS, engineSubmissions: submissions.filter((_, k) => k !== 2) });
    expect(gap.report.notes.join('\n')).toMatch(/no submission for black turn\(s\) 3/);
  });
});

describe('from-room: verification refuses a wrong fact', () => {
  it('a mining total one crystal off', () => {
    const b = bundle();
    const mining = entry(b, 2);
    mining.bankAfter = (mining.bankAfter as number) + 1;
    expect(refusal(b)).toMatch(/seq 2 \(rev 2, white T1 mining .*at bankAfter: rebuilt 6, recorded 7/);
  });

  it('a mining take that left different reserves', () => {
    const b = bundle();
    const takes = entry(b, 15).takes as { reservesAfter: number }[];
    takes[0].reservesAfter -= 1;
    expect(refusal(b)).toMatch(/seq 15 .* at takes\[0\]\.reservesAfter/);
  });

  it('an arrival that did not happen', () => {
    const b = bundle();
    const summoning = entry(b, 19);
    summoning.summoned = ['⚡1@J9'];
    expect(refusal(b)).toMatch(/seq 19 .*summoning.* at summoned\.length: rebuilt 2, recorded 1/);
  });

  it('a purchase on a different square', () => {
    const b = bundle();
    const purchase = entry(b, 4);
    (purchase.unit as { square: string }).square = 'J10';
    expect(refusal(b)).toMatch(/seq 4 .*the inferred BUY_UNIT .* is illegal for white T1/);
  });

  it('a missing event (the history skips a move)', () => {
    const b = bundle();
    // Black's J9->I9 plant move is dropped: the rebuild keeps the plant on J9,
    // and the next fact that depends on it, the mining take, gives it away.
    b.history.entries = b.history.entries.filter(e => e.sequence !== 6);
    b.history.total -= 1;
    expect(refusal(b)).toMatch(/seq 8 \(rev 3, black T1 mining .* at takes\[2\]\.unit\.square: rebuilt "J9", recorded "I9"/);
  });

  it('a flipped result', () => {
    const b = bundle();
    const result = entry(b, 65);
    result.winner = 'black';
    expect(refusal(b)).toMatch(/seq 65 .* at winner: rebuilt "white", recorded "black"/);
  });

  it('a final snapshot that disagrees with the rebuild', () => {
    const b = bundle();
    b.room.state.players.black.resources += 1;
    expect(refusal(b)).toMatch(/final position \(room snapshot\): black bank differs/);
  });

  it('a raw command log that disagrees on a phase end', () => {
    const b = bundle();
    const first = b.room.history[0].actions;
    first.splice(first.findIndex(a => a.type === 'END_ACTION_PHASE'), 1, { type: 'END_PLACE_PHASE' });
    expect(refusal(b)).toMatch(/raw command log disagrees at its action 1/);
  });

  it('a room whose handicap is not the one the manifest names', () => {
    expect(refusal(bundle(), { ...OPTS, handicap: 2 })).toMatch(/Black crystal handicap is 1, the caller expected 2/);
  });

  it('a history that does not start at the beginning', () => {
    const b = bundle();
    b.history.recordingStart = { ...b.history.recordingStart, complete: false };
    expect(refusal(b)).toMatch(/does not start at the beginning of the game/);
  });

  it('a manifest result the history does not end with', () => {
    expect(refusal(bundle(), { ...OPTS, expectedReason: 'home-checkmate' })).toMatch(/ends by kill-clock, the manifest records home-checkmate/);
  });
});

describe('from-room: the chain continues into hard:exam:from-loss', () => {
  it('turns a converted Phasing loss into an exam case whose recipe replays under Phasing', () => {
    const file = tempFile('AS01-W.json');
    writeAndVerify(convertRoom(bundle(), OPTS), file);
    const replay = loadReplay(file);
    // The verdict hard:analyze gave this game (lab/results/llm-wave-1/analysis/AS01-W.json),
    // reduced to the fields the extractor reads.
    const analysis = {
      schema: 'muju-hard-analyze-v2',
      fileId: 'AS01-W',
      side: 'black',
      outcome: { winner: 'white', winType: 'kill-clock', turns: 5, plies: 57, sideResult: 'loss' },
      firstConsequential: { turn: 1, seatTurnIndex: 0, klass: 'exposure-inconsistent', rule: '', evidence: 'fixture' },
      turns: [{ turnNumber: 1, side: 'black', swingCc: 1415, played: { endKey: '06fd1a9b1045cfc1' }, adviser: { endKey: 'ebc804a6d88a6b90', scoreCc: 15, work: 1_600_000 } }],
    } as unknown as AnalysisResult;
    const { case: c } = extractCase(analysis, replay, { stratum: 'dev' });
    expect(c.setup?.ruleset).toBe('phasing');
    expect(c.demand).toBe('quiet-clock');
    expect(c.sideToMove).toBe('black');
    expect(c.position.kind === 'recipe' && c.position.actions.length).toBe(4);
    const state = loadCaseState(c);
    expect(state.ruleset).toBe('phasing');
    // Black to move on turn 1 with White's plant commitment on A3 public.
    expect(state.pendingSummons?.map(p => `${p.owner}|${p.definitionId}|${p.position.x},${p.position.y}`)).toEqual(['white|plant_1|0,2']);
    expect(c.stateDigest).toBe(phasingDigest(state));
  });
});

describe('from-room: the upkeep-review step field', () => {
  it('analyze/replay.ts installs ReplayStep.reviewUpkeep before the step action', () => {
    const conversion = convertRoom(bundle(), OPTS);
    // White's first END_ACTION_PHASE (ply 2) settles an affordable upkeep
    // automatically. With review switched on there, upkeep waits for a
    // PAY_UPKEEP, and the recorded BUY_UNIT that follows is refused.
    const step = conversion.replay.steps[2];
    expect(step.action).toEqual({ type: 'END_ACTION_PHASE' });
    step.reviewUpkeep = { white: true, black: false };
    const file = tempFile('AS01-W-review.json');
    fs.writeFileSync(file, JSON.stringify(conversion.replay));
    expect(() => reconstruct(loadReplay(file))).toThrow(ReplayMismatch);
  });
});

describe('from-room: fetching and arguments', () => {
  it('pages the history with GETs only and keeps no animation recording', async () => {
    const b = bundle();
    const seen: string[] = [];
    const roomId = b.roomId;
    const fetcher = async (url: string): Promise<unknown> => {
      seen.push(url);
      if (url.endsWith(`/rooms/${roomId}`)) return { ...b.room, lastTurnReplay: { frames: [] } };
      if (url.endsWith('/positions/0')) return { roomId, revision: b.room.revision, state: b.root };
      const after = Number(/after=(\d+)/.exec(url)?.[1]);
      const page = b.history.entries.filter(e => e.sequence > after).slice(0, 40);
      const last = page[page.length - 1]?.sequence ?? after;
      return { recordingStart: b.history.recordingStart, total: b.history.total, entries: page, hasLater: last < 65 };
    };
    const fetched = await fetchRoomBundle(roomId, { fetcher, intervalMs: 0 });
    expect(fetched.history.entries).toHaveLength(65);
    expect(seen.filter(u => u.includes('/history'))).toEqual([
      `https://deevgames-muju.onrender.com/api/muju/rooms/${roomId}/history?after=0&limit=200`,
      `https://deevgames-muju.onrender.com/api/muju/rooms/${roomId}/history?after=40&limit=200`,
    ]);
    expect('lastTurnReplay' in fetched.room).toBe(false);
    expect(convertRoom(fetched, OPTS).report.actions).toBe(57);
  });

  it('parses squares and refuses a non-square', () => {
    expect(parseSquare('A1', 'x')).toEqual({ x: 0, y: 0 });
    expect(parseSquare('J10', 'x')).toEqual({ x: 9, y: 9 });
    expect(() => parseSquare('K1', 'x')).toThrow(RoomReplayError);
  });

  it('requires exactly one input mode, and a seat and output for a bare room', () => {
    expect(() => parseCliArgs([])).toThrow(/exactly one of/);
    expect(() => parseCliArgs(['--room', 'a'.repeat(32), '--out', 'x.json'])).toThrow(/--engine-seat/);
    expect(parseCliArgs(['--campaign', 'w', '--losses-only']).lossesOnly).toBe(true);
  });
});
