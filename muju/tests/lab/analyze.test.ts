// @vitest-environment node
/**
 * `lab/hard-ai/analyze/**` — the replay analyst's tool (EPIC-PLAN §4 E1.1/E1.4).
 *
 * Three things are worth pinning and one thing is worth smoking:
 *
 *  1 RECONSTRUCTION. The pilot's four replays are rebuilt from their openings
 *    through the canonical engine and must match `meta` — ply for ply, winner
 *    and all. This is not a formality: the six starting units carry
 *    `Date.now()` ids that differ between the recorded process and this one, so
 *    a reconstruction that "works" without the remap would be silently
 *    replaying somebody else's units.
 *
 *  2 CLASSIFICATION. Every branch is forced with a stubbed adviser injected
 *    through `AnalyzeOptions.engineFactory`, on the REAL pilot replay so the
 *    cheap lists, the end keys and the recorded timings are all genuine. Only
 *    the search is fake.
 *
 *  3 `--run` SUMMARY. `analyzeRun` over a directory of replays produces the
 *    class histogram and writes only under `analysis/`.
 *
 *  4 SMOKE. One real `HardEngine` adviser at a tiny work rung on the first two
 *    turns, which is the only test here that proves the fake in (2) stands in
 *    for something that actually runs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameState, PlayerId } from '../../src/game/types';
import type { RootResult } from '../../src/ai/hard/search/root';
import { newSearchStats } from '../../src/ai/hard/search/pvs';
import { loadReplay, reconstruct, hardSeat, withMatchRules, type LoadedReplay } from '../../lab/hard-ai/analyze/replay';
import { CandidateLister, PositionReader, resolveHardConfig, type AdviserEngine, type EngineFactory } from '../../lab/hard-ai/analyze/engine';
import { analyzeReplay, DEFAULT_SWING_CC, type AnalysisResult } from '../../lab/hard-ai/analyze/analyze';
import { analyzeRun, parseArgs } from '../../lab/hard-ai/analyze/run';
import { reclassifyDirectory } from '../../lab/hard-ai/analyze/reclassify';
import { playGame } from '../../lab/harness/runner';
import { createBot as createScriptedBot } from '../../lab/harness/bots/index';
import type { AIAction as Action } from '../../src/ai/types';
import type { EngineBot } from '../../lab/harness/types';

const PILOT = path.resolve(import.meta.dirname, '../../lab/results/hard-ai-e0/pilot2-h0/replays');
const LOSS = path.join(PILOT, 'g3-s1_0_1-A-white.json');
/** The 9-turn `g3-s1` B orientation: short, and the hard seat is Black. */
const SHORT = path.join(PILOT, 'g3-s1_0_1-B-white.json');

const ABSENT_KEY = '0'.repeat(16);

function rootResult(over: Partial<RootResult>): RootResult {
  return {
    actions: [],
    scoreCc: 0,
    depth: 1,
    work: 1,
    stats: newSearchStats(),
    source: 'search',
    endKey: ABSENT_KEY,
    ...over,
  };
}

/** Hands back the scripted results in order, repeating the last one. */
class ScriptedEngine implements AdviserEngine {
  private i = 0;
  constructor(private readonly script: readonly RootResult[]) {}
  searchTurn(): Promise<RootResult> {
    const r = this.script[Math.min(this.i++, this.script.length - 1)];
    return Promise.resolve(r);
  }
}

function factoryOf(adviser: readonly RootResult[], production: readonly RootResult[]): EngineFactory {
  return (_patch, role) => new ScriptedEngine(role === 'adviser' ? adviser : production);
}

describe('analyze: canonical reconstruction', () => {
  const files = fs.readdirSync(PILOT).filter(f => f.endsWith('.json')).sort();

  it('rebuilds every pilot replay and matches its meta', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const replay = loadReplay(path.join(PILOT, file));
      const recon = reconstruct(replay);
      expect(recon.plies, `${file} plies`).toBe(replay.meta.plies);
      expect(recon.winner, `${file} winner`).toBe(replay.meta.winner);
      expect(recon.notes, `${file} notes`).toEqual([]);
      // Every seat turn the game recorded is segmented, so `turnMs` lines up.
      for (const side of ['white', 'black'] as const) {
        expect(recon.bySide[side].length, `${file} ${side} turns`).toBe(replay.meta.players[side].turnsTaken);
      }
    }
  }, 60_000);

  it('refuses a replay whose recorded actions do not rebuild its snapshots', () => {
    const replay = loadReplay(SHORT);
    const tampered: LoadedReplay = {
      ...replay,
      stored: {
        ...replay.stored,
        steps: replay.stored.steps.map((s, i) => (i === 3 ? { ...s, res: { ...s.res, white: { ...s.res.white, r: s.res.white.r + 7 } } } : s)),
      },
    };
    expect(() => reconstruct(tampered)).toThrow(/resources diverged/);
  });

  it('identifies the hard@ seat from the recorded bot names', () => {
    expect(hardSeat(loadReplay(SHORT).meta)).toBe('black');
    expect(hardSeat(loadReplay(LOSS).meta)).toBe('white');
  });
});

describe('analyze: CLI arguments', () => {
  it('requires exactly one of --replay and --run', () => {
    expect(() => parseArgs([])).toThrow(/exactly one/);
    expect(() => parseArgs(['--replay', 'a', '--run', 'b'])).toThrow(/exactly one/);
    expect(parseArgs(['--replay', 'a']).swingCc).toBe(DEFAULT_SWING_CC);
    expect(parseArgs(['--run', 'd', '--all']).lossesOnly).toBe(false);
    expect(parseArgs(['--run', 'd']).lossesOnly).toBe(true);
    expect(parseArgs(['--replay', 'a', '--swing-cc', '900']).swingCc).toBe(900);
  });

  it('rejects an engine that is not hard@<label>', () => {
    expect(() => parseArgs(['--replay', 'a', '--engine', 'aiv2-hard'])).toThrow(/hard@/);
  });
});

/**
 * Real generator lists and real end keys for the first two turns of the short
 * pilot game, so a stubbed adviser can be pointed at a candidate the engine
 * genuinely offered (or at one it genuinely did not).
 */
interface Facts {
  playedKey: string[];
  otherCheapKey: string[];
  /** A key the ROOT generator (`cfg.gen`, the one that produces a refutation)
   * really does offer at the reply node — the matched membership test's
   * positive case. */
  replyRootKey: string[];
}

function gatherFacts(replay: LoadedReplay): Facts {
  const config = resolveHardConfig('lab');
  // `reconstruct` installs the game's rules itself and restores the shipped
  // defaults on the way out, so it runs OUTSIDE this scope rather than inside
  // it (`replay.ts withMatchRules`: do not nest).
  const recon = reconstruct(replay);
  return withMatchRules(replay.options, () => {
    const reader = new PositionReader();
    const lister = new CandidateLister(config.gen, config.weights);
    const playedKey: string[] = [];
    const otherCheapKey: string[] = [];
    const replyRootKey: string[] = [];
    for (let i = 0; i < 2; i++) {
      const turn = recon.bySide.black[i];
      const key = reader.packKey(turn.endState);
      if (key === null) throw new Error('the replica refused a reconstructed position');
      playedKey.push(key);
      const list = lister.list(turn.startState as GameState, 0);
      if (list === null) throw new Error('the generator produced no list');
      const other = list.keys.find(k => k !== key);
      if (other === undefined) throw new Error('the generator offered only one candidate');
      otherCheapKey.push(other);
      // The reply node, listed with the SAME config a root search would use.
      const replyList = lister.list(turn.endState, 0);
      if (replyList === null || replyList.keys.length === 0) throw new Error('the generator produced no reply list');
      replyRootKey.push(replyList.keys[0]);
    }
    return { playedKey, otherCheapKey, replyRootKey };
  });
}

describe('analyze: classification branches (stubbed adviser)', () => {
  let replay: LoadedReplay;
  let facts: Facts;

  beforeAll(() => {
    replay = loadReplay(SHORT);
    facts = gatherFacts(replay);
  }, 60_000);

  /**
   * Turn 1 is scripted to agree with the seat (swing 0, so it is never the
   * consequential turn) and turn 2 to disagree by 1,000 cc.
   *
   * The adviser is asked three times per turn — root, played-deep,
   * adviser-deep — except on a turn where its root agrees with the played end
   * key, which reuses the played-deep answer and so costs two.
   *
   * `deepScore` fixes the sign by who is on move. The played-deep search sees
   * the OPPONENT on move (the seat's turn is over) and is negated; the
   * adviser-deep search sees a stub plan of zero actions, so the seat is still
   * on move and the score is taken as it stands. `played-deep 0` against
   * `adviser-deep +1,000` is therefore a swing of +1,000 cc in the adviser's
   * favour — and every stubbed row carries the "did not end the seat's turn"
   * note, which is the guard against the sign being assumed instead of read.
   */
  function script(turn2Root: Partial<RootResult>, turn2Reply: Partial<RootResult> = {}): readonly RootResult[] {
    return [
      rootResult({ endKey: facts.playedKey[0] }), // t1 root: agrees with the seat
      rootResult({ scoreCc: 0 }), // t1 played-deep (reused as t1 adviser-deep)
      rootResult({ endKey: facts.otherCheapKey[1], ...turn2Root }), // t2 root
      rootResult({ scoreCc: 0, endKey: ABSENT_KEY, ...turn2Reply }), // t2 played-deep
      rootResult({ scoreCc: 1000 }), // t2 adviser-deep
    ];
  }

  async function analyse(adviser: readonly RootResult[], production: readonly RootResult[]): Promise<AnalysisResult> {
    return analyzeReplay(replay, { maxTurns: 2, engineFactory: factoryOf(adviser, production) });
  }

  it('reports "candidate absent" when the adviser\'s best is not in the K list', async () => {
    const result = await analyse(script({ endKey: ABSENT_KEY }), [rootResult({})]);
    expect(result.turns[0].swingCc).toBe(0);
    expect(result.turns[1].swingCc).toBe(1000);
    expect(result.turns[1].notes).toContain("the adviser's plan did not end the seat's turn; its score is a mid-turn root score and the swing on this row is not like-for-like");
    expect(result.firstConsequential.klass).toBe('candidate-absent');
    expect(result.firstConsequential.turn).toBe(2);
    expect(result.firstConsequential.rule).toContain('NOT in the production generator');
  }, 60_000);

  it('reports "strong candidate misjudged" when the adviser\'s best IS in the K list and its refutation IS offered', async () => {
    // The refutation is a key the matched generator really does produce at the
    // reply node, so `reply-outside-beam` cannot fire and the residual class is
    // the one left.
    const result = await analyse(script({}, { endKey: facts.replyRootKey[1] }), [rootResult({ endKey: ABSENT_KEY, scoreCc: 5000 })]);
    expect(result.turns[1].reply.inRootGenList).toBe(true);
    expect(result.firstConsequential.klass).toBe('strong-candidate-misjudged');
    // E2: the class split, and the stub returns no root exposure, so the row
    // takes the documented no-exposure path rather than the discarded/misjudged
    // decision (`tests/lab/analyze-exposure-split.test.ts` covers that).
    expect(result.firstConsequential.rule).toContain('evaluation or a depth fault');
    expect(result.firstConsequential.evidence).toContain('No root exposure on this row');
  }, 60_000);

  it('reports "reply outside beam" when the refutation is not in the MATCHED generator list at the reply node', async () => {
    const result = await analyse(script({}, { endKey: ABSENT_KEY }), [rootResult({ endKey: facts.playedKey[1], scoreCc: 4000 })]);
    expect(result.turns[1].reply.inRootGenList).toBe(false);
    expect(result.turns[1].reply.rootGenCount).toBeGreaterThan(0);
    expect(result.firstConsequential.klass).toBe('reply-outside-beam');
    // The class must not claim anything about what the search examined: the
    // only occurrence of "missed" in the rule is the sentence disclaiming it.
    expect(result.firstConsequential.rule).toContain('NOTHING MORE');
    expect(result.firstConsequential.rule).toContain('nor that the engine "missed" it');
    expect(result.firstConsequential.klass).not.toMatch(/missed/);
  }, 60_000);

  it('does not fire "reply outside beam" on a turn where the adviser played the identical turn', async () => {
    // The old rule did exactly this on turn 8 of the first worked example: the
    // adviser agreed with the seat, the swing was 0, and the score half of the
    // predicate fired anyway. Agreement means there is no refutation story.
    const adviser = [
      rootResult({ endKey: facts.playedKey[0] }), // t1 root: agrees
      rootResult({ scoreCc: 0, endKey: ABSENT_KEY }), // t1 played-deep; refutation absent from every list
    ];
    const result = await analyzeReplay(replay, { maxTurns: 1, engineFactory: factoryOf(adviser, [rootResult({ endKey: facts.playedKey[0], scoreCc: 9000 })]) });
    expect(result.turns[0].adviser.agreesWithPlayed).toBe(true);
    expect(result.turns[0].reply.inRootGenList).toBe(false);
    expect(result.turns[0].swingCc).toBe(0);
    // Turn 1 overran, so the clock rule owns it; what matters is that the reply
    // rule is not what named it.
    expect(result.firstConsequential.klass).not.toBe('reply-outside-beam');
  }, 60_000);

  it('reports "clock/fallback" on a turn the seat overran, ahead of every other rule', async () => {
    // Turn 1 of this game took 4,584 ms against a 3,000 ms allowance. Give it a
    // swing so it becomes the consequential turn, and point the adviser at a
    // candidate that IS in the list so only the clock rule can fire.
    const adviser = [
      rootResult({ endKey: facts.otherCheapKey[0] }), // t1 root
      rootResult({ scoreCc: 0 }), // t1 played-deep
      rootResult({ scoreCc: 1000 }), // t1 adviser-deep
    ];
    const result = await analyzeReplay(replay, { maxTurns: 1, engineFactory: factoryOf(adviser, [rootResult({})]) });
    expect(result.turns[0].timing.overran).toBe(true);
    expect(result.turns[0].swingCc).toBe(1000);
    expect(result.firstConsequential.klass).toBe('clock-fallback');
  }, 60_000);

  it('reports "unclear" when no turn reaches the threshold', async () => {
    const adviser = [
      rootResult({ endKey: facts.playedKey[0] }), // t1 root: agrees
      rootResult({ scoreCc: 0 }), // t1 played-deep
      rootResult({ endKey: facts.playedKey[1] }), // t2 root: agrees
      rootResult({ scoreCc: 0 }), // t2 played-deep
    ];
    const result = await analyzeReplay(replay, { maxTurns: 2, engineFactory: factoryOf(adviser, [rootResult({})]) });
    expect(result.firstConsequential.klass).toBe('unclear');
    expect(result.firstConsequential.evidence).toContain('no consequential decision found at this threshold');
    expect(result.largestSwing.klass).toBe('unclear');
  }, 60_000);
});

describe('analyze: --run summary', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-analyze-'));
    fs.mkdirSync(path.join(dir, 'replays'));
    for (const file of fs.readdirSync(PILOT)) fs.copyFileSync(path.join(PILOT, file), path.join(dir, 'replays', file));
    // A file the tool must refuse loudly rather than skip silently.
    fs.writeFileSync(path.join(dir, 'replays', 'zz-broken.json'), '{"schema":"nope"}');
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{"untouched":true}');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('defaults to the hard@ seat\'s losses and writes a class histogram', async () => {
    const summary = await analyzeRun(dir, {
      maxTurns: 1,
      engineFactory: factoryOf([rootResult({ endKey: ABSENT_KEY }), rootResult({ scoreCc: 0 }), rootResult({ scoreCc: 900 })], [rootResult({})]),
    });
    expect(summary.analysed).toBe(1);
    expect(summary.games[0].fileId).toBe('g3-s1_0_1-A-white');
    expect(summary.games[0].result).toBe('loss');
    expect(Object.values(summary.firstConsequentialHistogram).reduce((a, b) => a + b, 0)).toBe(1);
    expect(Object.keys(summary.largestSwingHistogram)).toHaveLength(1);
    expect(summary.failed.map(f => f.file)).toContain('zz-broken.json');
    expect(summary.skipped.length).toBe(3);
    expect(fs.existsSync(path.join(dir, 'analysis', 'summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'analysis', 'g3-s1_0_1-A-white.json'))).toBe(true);
    // The run's own artifacts are never rewritten.
    expect(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).toBe('{"untouched":true}');
  }, 120_000);

  it('--all analyses every game and histograms all four', async () => {
    const summary = await analyzeRun(dir, {
      lossesOnly: false,
      maxTurns: 1,
      outDir: path.join(dir, 'analysis-all'),
      engineFactory: factoryOf([rootResult({ endKey: ABSENT_KEY }), rootResult({ scoreCc: 0 }), rootResult({ scoreCc: 900 })], [rootResult({})]),
    });
    expect(summary.analysed).toBe(4);
    const total = Object.values(summary.firstConsequentialHistogram).reduce((a, b) => a + b, 0);
    expect(total).toBe(4);
  }, 180_000);
});

describe('analyze: real adviser smoke', () => {
  it('runs a genuine HardEngine at a tiny work rung over the first two turns', async () => {
    const replay = loadReplay(SHORT);
    const result = await analyzeReplay(replay, { adviserWork: 5_000, productionWork: 5_000, maxTurns: 2 });
    expect(result.turns).toHaveLength(2);
    for (const row of result.turns) {
      // The seat played one of its own generator's candidates, every time.
      expect(row.cheap.containsPlayed, `turn ${row.turnNumber} played key in K list`).toBe(true);
      expect(row.cheap.count).toBeGreaterThan(0);
      expect(row.adviser.endKey).toMatch(/^[0-9a-f]{16}$/);
      expect(Number.isFinite(row.swingCc)).toBe(true);
    }
    expect(result.config.adviserWork).toBe(5_000);
    expect(result.reconstruction.winner).toBe(replay.meta.winner);
  }, 120_000);
});

/**
 * A replay that really does contain `runner.ts`'s three-no-op phase-end
 * injection, produced by the REAL runner rather than hand-built: a seat that
 * emits three actions the simulator refuses makes the runner burn three plies
 * on no-ops and then inject a phase end it does NOT record as a step.
 *
 * This is the path the first version of `reconstruct` got wrong — it compared
 * each rebuilt position against the snapshot BEFORE reproducing the injection,
 * while the runner injects BEFORE it snapshots, so every replay containing one
 * failed reconstruction and landed silently in `summary.failed`. The old test
 * only asserted `recon.notes` was empty, which proves the path is never hit.
 */
function stubbornBot(name: string, offenders: number): EngineBot {
  let refusals = 0;
  return {
    kind: 'engine',
    name,
    onGameStart(): void {
      refusals = 0;
    },
    nextAction(state: GameState, player: PlayerId): Promise<Action | null> {
      if (refusals < offenders) {
        refusals++;
        const mine = state.board.units.find(u => u.owner === player);
        if (mine !== undefined) {
          // Far out of any unit's range, so `isLegalAction` refuses and
          // `applyAction` hands back the same state: a no-op that costs a ply.
          const to = player === 'white' ? { x: 9, y: 9 } : { x: 0, y: 0 };
          return Promise.resolve({ type: 'MOVE', unitId: mine.id, to });
        }
      }
      return Promise.resolve(null); // the runner substitutes a phase end
    },
  };
}

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
 * under `lab/results/**`, and `muju-phasing-1` means Phasing. Three things the
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
    expect(record.rulesVersion).toBe('muju-phasing-1');
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

describe('analyze: the runner\'s unrecorded no-op phase-end injection', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-noop-'));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  for (const seat of ['white', 'black'] as const) {
    it(`reconstructs a replay whose ${seat} seat triggered the injection`, async () => {
      const bots = {
        white: seat === 'white' ? stubbornBot('stubborn', 3) : passBot('pass'),
        black: seat === 'black' ? stubbornBot('stubborn', 3) : passBot('pass'),
      };
      const { record, replay: file } = await playGame({
        bots,
        seed: 4242,
        engineHash: 'test',
        runId: 'noop-injection',
        options: { recordReplay: true, maxTurns: 3, legality: 'as-shipped' },
      });
      expect(file).not.toBeNull();
      // The run really did take the path: three no-ops by that seat.
      const noops = record.anomalies.filter(a => a.startsWith(`noop action by ${seat}`));
      expect(noops.length, `${seat} no-op plies`).toBeGreaterThanOrEqual(3);

      const out = path.join(dir, `${seat}.json`);
      fs.writeFileSync(out, `${JSON.stringify(file)}\n`);
      const loaded = loadReplay(out);
      const recon = reconstruct(loaded);

      expect(recon.plies).toBe(record.plies);
      expect(recon.winner).toBe(record.winner);
      expect(recon.notes.some(n => n.includes("the runner's unrecorded phase end was reproduced"))).toBe(true);
    }, 60_000);
  }
});

describe('analyze: --reclassify', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-reclass-'));
    fs.mkdirSync(path.join(dir, 'replays'));
    for (const file of fs.readdirSync(PILOT)) fs.copyFileSync(path.join(PILOT, file), path.join(dir, 'replays', file));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('re-decides a saved analysis from its stored adviser numbers, running no search', async () => {
    const analysisDir = path.join(dir, 'analysis');
    // Produce a saved analysis whose refutation is absent from every list, so
    // the matched test has something to change.
    const adviser = [
      rootResult({ endKey: ABSENT_KEY }), // t1 root: not in the K list
      rootResult({ scoreCc: 0, endKey: ABSENT_KEY }), // t1 played-deep / refutation
      rootResult({ scoreCc: 900 }), // t1 adviser-deep
    ];
    await analyzeRun(dir, {
      lossesOnly: false,
      maxTurns: 1,
      outDir: analysisDir,
      engineFactory: factoryOf(adviser, [rootResult({})]),
    });
    const saved = JSON.parse(fs.readFileSync(path.join(analysisDir, 'g3-s1_0_1-B-white.json'), 'utf8')) as AnalysisResult;

    // An engine factory that throws would fail the test if reclassify searched.
    const outDir = path.join(dir, 'analysis-v2');
    const summary = reclassifyDirectory(analysisDir, { out: outDir });

    expect(summary.reclassified).toBe(4);
    expect(Object.values(summary.afterFirstHistogram).reduce((a, b) => a + b, 0)).toBe(4);
    expect(summary.failed).toEqual([]);
    const after = JSON.parse(fs.readFileSync(path.join(outDir, 'g3-s1_0_1-B-white.json'), 'utf8')) as AnalysisResult;
    expect(after.schema).toBe('muju-hard-analyze-v2');
    // Every search-derived number is carried through untouched.
    expect(after.turns[0].playedDeepCc).toBe(saved.turns[0].playedDeepCc);
    expect(after.turns[0].adviserBestDeepCc).toBe(saved.turns[0].adviserBestDeepCc);
    expect(after.turns[0].adviser.endKey).toBe(saved.turns[0].adviser.endKey);
    // The matched reply list is real and was regenerated.
    expect(after.turns[0].reply.rootGenCount).toBeGreaterThan(0);
    // The reconstruction check covers every replay in the run.
    expect(summary.reconstruction?.total).toBe(4);
    expect(summary.reconstruction?.reconstructs).toBe(4);
    expect(summary.reconstruction?.fails).toEqual([]);
  }, 180_000);

  it('refuses to overwrite its own input directory', async () => {
    const analysisDir = path.join(dir, 'analysis');
    expect(() => reclassifyDirectory(analysisDir, { out: analysisDir })).toThrow(/refuses to write into its own input/);
  });
});
