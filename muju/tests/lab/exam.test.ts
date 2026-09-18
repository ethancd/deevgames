// @vitest-environment node
/**
 * `lab/hard-ai/exam/**` — the Muju examination set (EPIC-PLAN §4 E1.2).
 *
 * The set's whole claim is a separation: EXACT cases are decided by the
 * canonical rules and JUDGMENT cases are somebody's labelled preference, and
 * nothing may cross the line or be added across it. So the tests pin the line
 * from both sides:
 *
 *  1 FORMAT. A well-formed case of each kind loads; a judgment wearing the
 *    `exact` label is refused, and so is an exact witness whose "method" is not
 *    a canonical check. This is the invariant the format exists for.
 *
 *  2 RECIPES. A recipe is replayed through the shipped rules, so a case whose
 *    line has stopped being legal is REFUSED rather than reconstructed into
 *    some other position, and a recorded digest that disagrees with the rebuilt
 *    position is refused too.
 *
 *  3 EXTRACTOR. The real pilot analysis produces a judgment at its first
 *    consequential turn (`reply-missed`, turn 6) and an EXACT case at turn 9,
 *    where the adviser's mate score is confirmed by canonical replay. The
 *    second is the only path by which anything in this set becomes exact.
 *
 *  4 RUNNER. Three cases against a stubbed engine, with the two tallies checked
 *    independently — and an explicit assertion that a matched judgment is never
 *    counted as an exact pass.
 *
 *  5 SEEDED SET. The committed `cases/dev.jsonl` loads, every case
 *    reconstructs, and every exact case's witness still verifies against the
 *    canonical rules.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { GameState } from '../../src/game/types';
import type { RootResult } from '../../src/ai/hard/search/root';
import { newSearchStats } from '../../src/ai/hard/search/pvs';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';
import {
  EXAM_SCHEMA,
  ExamFormatError,
  loadCase,
  loadCaseState,
  loadStratum,
  readCases,
  validateCaseShape,
  withExamRules,
  writeCases,
  type ExamCase,
} from '../../lab/hard-ai/exam/format';
import { claimHolds, enumerateTurnEnds, verifyCaseWitness } from '../../lab/hard-ai/exam/witness';
import { analysisFilesIn, extractCase, readAnalysis, resolveReplayPath, runPathFor, upsertCase } from '../../lab/hard-ai/exam/from-loss';
import { loadReplay } from '../../lab/hard-ai/analyze/replay';
import type { AnalysisResult } from '../../lab/hard-ai/analyze/analyze';
import { parseArgs, proveDead, renderMarkdown, runExam, selectCases, type ExamArgs, type ExamEngineFactory } from '../../lab/hard-ai/exam/run';

const REPO = path.resolve(import.meta.dirname, '../..');
const CASES_DIR = path.resolve(REPO, 'lab/hard-ai/exam/cases');
const PILOT_ANALYSIS = path.resolve(REPO, 'lab/results/hard-ai-e1/analyze/g3-s1_0_1-B-white.json');

const tmpDirs: string[] = [];
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-exam-'));
  tmpDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function rules() {
  return { ...DEFAULT_RULES, combatHandicap: { ...DEFAULT_RULES.combatHandicap } };
}

/** A minimal legal recipe: the canonical initial position, no actions. */
function initialCase(over: Partial<ExamCase> = {}): ExamCase {
  return {
    schema: EXAM_SCHEMA,
    id: 'test-initial',
    version: 1,
    source: { kind: 'authored', from: 'tests/lab/exam.test.ts#initial' },
    demand: 'shared-actions',
    kind: 'judgment',
    rules: rules(),
    position: { kind: 'recipe', openingId: 'initial', openingPlies: 0, actions: [] },
    sideToMove: 'white',
    witness: { label: 'judgment', preferredKeys: ['0'.repeat(16)], avoidKeys: [], reason: 'a test preference', by: 'author' },
    stratum: 'dev',
    tags: ['test'],
    ...over,
  } as ExamCase;
}

// ---------------------------------------------------------------------------

describe('exam format: the exact/judgment line', () => {
  it('loads a judgment case and a canonically-witnessed exact case', () => {
    const judgment = loadCase(initialCase(), 'judgment');
    expect(judgment.case.kind).toBe('judgment');
    expect(judgment.state.turn.currentPlayer).toBe('white');

    const exact = initialCase({
      id: 'test-exact',
      kind: 'exact',
      witness: {
        label: 'exact',
        claim: 'win',
        method: 'canonical-enumeration',
        endKeys: ['00000000deadbeef'],
        avoidKeys: [],
        complete: true,
        note: 'enumerated',
        verifiedAt: new Date().toISOString(),
        verifiedBy: 'the test',
      },
    });
    expect(loadCase(exact, 'exact').case.witness.label).toBe('exact');
  });

  it('refuses a judgment presented as an exact case, and an exact case presented as a judgment', () => {
    const dressed = initialCase({ kind: 'exact' }); // still carries the judgment witness
    expect(() => validateCaseShape(dressed, 'dressed')).toThrow(ExamFormatError);
    expect(() => validateCaseShape(dressed, 'dressed')).toThrow(/an exact case needs an exact \(canonical\) witness/);

    const understated = initialCase({
      kind: 'judgment',
      witness: {
        label: 'exact',
        claim: 'win',
        method: 'canonical-replay',
        endKeys: ['00000000deadbeef'],
        avoidKeys: [],
        complete: false,
        line: [],
        note: 'replayed',
        verifiedAt: new Date().toISOString(),
        verifiedBy: 'the test',
      },
    });
    expect(() => validateCaseShape(understated, 'understated')).toThrow(ExamFormatError);
  });

  it('refuses an exact witness whose method is not a canonical check', () => {
    const asserted = initialCase({
      kind: 'exact',
      witness: {
        label: 'exact',
        claim: 'win',
        method: 'because-i-say-so' as unknown as 'canonical-replay',
        endKeys: ['00000000deadbeef'],
        avoidKeys: [],
        complete: true,
        note: 'no',
        verifiedAt: new Date().toISOString(),
        verifiedBy: 'nobody',
      },
    });
    expect(() => validateCaseShape(asserted, 'asserted')).toThrow(/never by assertion/);
  });

  it('refuses a case whose demand is not an EPIC-PLAN §1 row and a stratum that is not one of the three', () => {
    expect(() => validateCaseShape(initialCase({ demand: 'vibes' as never }), 'bad-demand')).toThrow(/§1 row/);
    expect(() => validateCaseShape(initialCase({ stratum: 'prod' as never }), 'bad-stratum')).toThrow(/dev, val, sealed/);
  });
});

describe('exam format: recipes are replayed, never assumed', () => {
  it('refuses an illegal recipe', () => {
    // White has no unit on (5,5) in the initial position, so the MOVE names an
    // empty square and `applyOpening` refuses it.
    const illegal = initialCase({
      id: 'test-illegal',
      position: {
        kind: 'recipe',
        openingId: 'initial',
        openingPlies: 0,
        actions: [{ type: 'MOVE', from: { x: 5, y: 5 }, to: { x: 5, y: 4 } }],
      },
    });
    expect(() => loadCaseState(illegal)).toThrow(ExamFormatError);
    expect(() => loadCaseState(illegal)).toThrow(/recipe does not replay/);
  });

  it('refuses a recipe whose side to move is not the one the case claims', () => {
    expect(() => loadCaseState(initialCase({ sideToMove: 'black' }))).toThrow(/white is to move/);
  });

  it('refuses a recipe that reconstructs to a different position than the recorded digest', () => {
    expect(() => loadCaseState(initialCase({ stateDigest: 'not-the-digest' }))).toThrow(/has drifted and must be re-authored, not repaired/);
  });

  it('round-trips through a JSONL file and refuses duplicate ids', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'dev.jsonl');
    writeCases(file, [initialCase(), initialCase({ id: 'test-two' })]);
    expect(readCases(file).map(c => c.id)).toEqual(['test-initial', 'test-two']);
    writeCases(file, [initialCase(), initialCase()]);
    expect(() => readCases(file)).toThrow(/duplicate case id/);
  });

  it('refuses a case whose own stratum disagrees with the file it sits in', () => {
    const dir = tmpDir();
    writeCases(path.join(dir, 'dev.jsonl'), [initialCase({ stratum: 'sealed' })]);
    expect(() => loadStratum('dev', dir)).toThrow(/is stratum "sealed" in the "dev" file/);
  });
});

// ---------------------------------------------------------------------------

describe('exam extractor: one classified loss becomes one case', () => {
  const analysis = JSON.parse(fs.readFileSync(PILOT_ANALYSIS, 'utf8')) as AnalysisResult;
  const replay = loadReplay(resolveReplayPath(analysis, null));

  it('emits a JUDGMENT at the first consequential turn, with the adviser as the source of the preference', () => {
    const { case: c } = extractCase(analysis, replay);
    expect(c.kind).toBe('judgment');
    expect(c.source.kind).toBe('loss');
    if (c.source.kind !== 'loss') throw new Error('unreachable');
    expect(c.source.turnNumber).toBe(analysis.firstConsequential.turn);
    expect(c.source.openingId).toBe('g3-s1');
    // The E0 opening set is the DEVELOPMENT stratum (AMENDMENTS-DECIDED.md).
    expect(c.stratum).toBe('dev');
    if (c.witness.label !== 'judgment') throw new Error('expected a judgment witness');
    const row = analysis.turns.find(t => t.turnNumber === analysis.firstConsequential.turn);
    expect(c.witness.preferredKeys).toEqual([row?.adviser.endKey]);
    expect(c.witness.classification).toBe('reply-missed');
    expect(c.witness.by).toBe('adviser');
    expect(c.witness.reason).toContain('adviser, not an oracle');
  });

  it('upgrades to EXACT only where a canonical check proves the win', () => {
    // A small enumeration budget on purpose: this late-game position has far
    // too many turns to close, which is exactly the branch that falls through
    // to the canonical-REPLAY witness. The full-budget run behaves the same way
    // (300,000 calls do not close it either), only slower.
    const { case: c, exactAttempt } = extractCase(analysis, replay, { turn: 9, budget: 20_000 });
    expect(c.kind).toBe('exact');
    expect(exactAttempt).toBeNull();
    if (c.witness.label !== 'exact') throw new Error('expected an exact witness');
    expect(c.witness.claim).toBe('win');
    expect(c.witness.method).toBe('canonical-replay');
    expect(c.witness.line?.length).toBeGreaterThan(0);
    // The replay witness is one line, so the key set is explicitly NOT closed.
    expect(c.witness.complete).toBe(false);

    // And the claim is true of the position the case rebuilds, checked here
    // rather than taken from the extractor's word for it.
    const state = loadCaseState(c);
    const check = withExamRules(c, () => verifyCaseWitness(c, state));
    expect(check.ok).toBe(true);
    expect(check.confirmed).toEqual(c.witness.endKeys);
  }, 60_000);

  it('rebuilds the position from the recipe alone', () => {
    const { case: c } = extractCase(analysis, replay);
    const state = loadCaseState(c);
    expect(state.turn.turnNumber).toBe(6);
    expect(state.turn.currentPlayer).toBe('black');
    if (c.position.kind !== 'recipe') throw new Error('expected a recipe');
    expect(c.position.actions.length).toBeGreaterThan(c.position.openingPlies);
  });

  it('records which analyser schema the verdict came from', () => {
    const { case: c } = extractCase(analysis, replay);
    if (c.source.kind !== 'loss') throw new Error('unreachable');
    // v1 and v2 carry the same per-turn fields this extractor reads, but NOT
    // the same class vocabulary (`reply-outside-beam` replaces `reply-missed`),
    // so a classification only means what it says next to its schema.
    expect(c.source.analysisSchema).toBe(String(analysis.schema));
  });

  it('names a run by its lab/results path, whichever worktree the replay lives in', () => {
    expect(runPathFor('/somewhere/else/muju/lab/results/hard-ai-e1/e1.1-diag/replays/x.json')).toBe('lab/results/hard-ai-e1/e1.1-diag');
    expect(runPathFor(path.resolve(REPO, 'lab/results/hard-ai-e0/pilot2-h0/replays/x.json'))).toBe('lab/results/hard-ai-e0/pilot2-h0');
  });

  it('lists a directory of analyses without its summary, and refuses an unknown schema', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'summary.json'), '{}');
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ schema: 'muju-hard-analyze-v2' }));
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ schema: 'muju-hard-analyze-v9' }));
    fs.writeFileSync(path.join(dir, 'notes.md'), '# not an artifact');
    expect(analysisFilesIn(dir).map(f => path.basename(f))).toEqual(['a.json', 'b.json']);
    expect(() => readAnalysis(path.join(dir, 'a.json'))).toThrow(/is not one of/);
    expect(readAnalysis(path.join(dir, 'b.json')).schema).toBe('muju-hard-analyze-v2');
  });

  it('upserts into a stratum file, bumping the version instead of duplicating the id', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'dev.jsonl');
    const { case: c } = extractCase(analysis, replay);
    expect(upsertCase(file, c).added).toBe(true);
    expect(upsertCase(file, c).added).toBe(false);
    const rows = readCases(file);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(2);
  });
});

// ---------------------------------------------------------------------------

const ABSENT = 'f'.repeat(16);

function rootResult(over: Partial<RootResult>): RootResult {
  return { actions: [], scoreCc: 0, depth: 1, work: 1, stats: newSearchStats(), source: 'search', endKey: ABSENT, ...over };
}

/** Returns the scripted results in order, repeating the last. */
function scripted(script: readonly RootResult[]): ExamEngineFactory {
  let i = 0;
  return () => ({
    searchTurn: (_state: GameState) => Promise.resolve(script[Math.min(i++, script.length - 1)]),
  });
}

function args(over: Partial<ExamArgs> = {}): ExamArgs {
  // `deadCheck` is OFF here and ON in the CLI: these fixtures are the canonical
  // initial position, whose enumeration the proof cannot afford, and the tests
  // that mean to exercise A7-3 turn it on by hand.
  return { stratum: 'dev', engine: 'hard@desktop', work: 1, casesDir: CASES_DIR, out: null, md: null, ids: null, tag: null, demand: null, limit: null, heavy: false, deadCheck: false, ...over };
}

describe('exam runner: two tallies that are never added up', () => {
  const exactHit = initialCase({
    id: 'run-exact-hit',
    kind: 'exact',
    witness: { label: 'exact', claim: 'win', method: 'canonical-enumeration', endKeys: ['000000000000aaaa'], avoidKeys: [], complete: true, note: 'n', verifiedAt: 'x', verifiedBy: 'y' },
  });
  const exactMiss = initialCase({
    id: 'run-exact-miss',
    kind: 'exact',
    witness: { label: 'exact', claim: 'kill', method: 'canonical-enumeration', endKeys: ['000000000000bbbb'], avoidKeys: [], complete: true, note: 'n', verifiedAt: 'x', verifiedBy: 'y' },
  });
  const judgmentHit = initialCase({
    id: 'run-judgment-hit',
    kind: 'judgment',
    witness: { label: 'judgment', preferredKeys: ['000000000000cccc'], avoidKeys: [], reason: 'preference', by: 'adviser' },
  });

  it('scores exact cases against the witness and judgments separately, and never sums them', async () => {
    const factory = scripted([
      rootResult({ endKey: '000000000000aaaa' }),
      rootResult({ endKey: ABSENT }),
      rootResult({ endKey: '000000000000cccc' }),
    ]);
    const run = await runExam([exactHit, exactMiss, judgmentHit], args(), { engineFactory: factory });

    expect(run.exact).toMatchObject({ cases: 2, passed: 1, failed: 1 });
    expect(run.judgment).toMatchObject({ cases: 1, matched: 1, unmatched: 0 });
    expect(run.errors).toEqual([]);

    // THE ASSERTION THIS SUITE EXISTS FOR: a matched judgment is not an exact
    // pass, is not counted in the exact tally, and no field anywhere sums them.
    expect(run.exact.passed).toBe(1);
    expect(run.exact.cases + run.judgment.cases).toBe(3);
    expect(run.exact.passed).not.toBe(run.exact.passed + run.judgment.matched);
    const flat = JSON.stringify({ exact: run.exact, judgment: run.judgment });
    expect(flat).not.toContain('"total"');
    for (const row of run.results) {
      if (row.kind === 'exact') {
        expect(typeof row.passed).toBe('boolean');
        expect(row.matched).toBeNull();
      } else {
        expect(typeof row.matched).toBe('boolean');
        expect(row.passed).toBeNull();
        expect(row.note).toContain('never a pass');
      }
    }
  });

  it('counts a judgment the engine disagreed with as unmatched, not as a failure', async () => {
    const run = await runExam([judgmentHit], args(), { engineFactory: scripted([rootResult({ endKey: ABSENT })]) });
    expect(run.judgment).toMatchObject({ cases: 1, matched: 0, unmatched: 1 });
    expect(run.exact).toMatchObject({ cases: 0, passed: 0, failed: 0, passRate: null });
  });

  it('renders markdown that reports the two tallies apart', async () => {
    const run = await runExam([exactHit, judgmentHit], args(), { engineFactory: scripted([rootResult({ endKey: '000000000000aaaa' })]) });
    const md = renderMarkdown(run);
    expect(md).toContain('## Exact cases (canonical witness)');
    expect(md).toContain('## Judgment cases (stated preference)');
    expect(md).toContain('never added to the exact tally');
  });

  it('parses its arguments and selects by id, tag and limit', () => {
    const parsed = parseArgs(['--stratum', 'val', '--engine', 'hard@lab', '--work', '1234', '--tag', 'authored', '--limit', '3']);
    expect(parsed).toMatchObject({ stratum: 'val', engine: 'hard@lab', work: 1234, tag: 'authored', limit: 3 });
    expect(() => parseArgs(['--stratum', 'production'])).toThrow(/--stratum must be one of/);
    const pool = [exactHit, exactMiss, judgmentHit];
    expect(selectCases(pool, args({ ids: ['run-exact-miss'] })).map(c => c.id)).toEqual(['run-exact-miss']);
    expect(selectCases(pool, args({ limit: 2 }))).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

describe('exam runner: a judgment turn that wins the game is its own outcome (A7-2)', () => {
  // The two rows lane 7 named (amendments/lane7.md A7-2). Both are scored by the
  // REAL champion at the exam's own 25,000-unit budget, because the adjudication
  // replays the engine's own actions through the canonical rules and a scripted
  // `RootResult` carries no actions to replay.
  const WON_IDS = ['authored-home-mate-cheap-invasion-one-attack-mate-preference', 'e21-purchase-plus-promotion'];

  it('reports them as won, not as misses, and never as matches', async () => {
    const cases = loadStratum('dev', CASES_DIR).filter(c => WON_IDS.includes(c.id));
    expect(cases).toHaveLength(2);
    const run = await runExam(cases, args({ work: 25_000, engine: 'hard@desktop' }));

    expect(run.errors).toEqual([]);
    expect(run.judgment).toMatchObject({ cases: 2, matched: 0, unmatched: 0, won: 2, comparable: 0 });
    expect(run.judgment.wonCases).toEqual(WON_IDS.slice().sort());
    for (const row of run.results) {
      expect(row.kind).toBe('judgment');
      expect(row.wonOutright, row.id).toBe(true);
      expect(row.outcome, row.id).toBe('won');
      // `matched` is null, not false: the preference was never put to the test.
      expect(row.matched, row.id).toBeNull();
      expect(row.passed, row.id).toBeNull();
      expect(row.note, row.id).toContain('WINS the game outright');
    }
  }, 60_000);

  it('is a change of outcome: one of the two winning keys sits in the case\'s own avoidKeys', () => {
    const cases = loadStratum('dev', CASES_DIR);
    const cheap = cases.find(c => c.id === WON_IDS[0]);
    const e21 = cases.find(c => c.id === WON_IDS[1]);
    expect(cheap?.witness.label).toBe('judgment');
    expect(e21?.witness.label).toBe('judgment');
    if (cheap?.witness.label !== 'judgment' || e21?.witness.label !== 'judgment') throw new Error('unreachable');
    // The keys the champion reaches at 25,000 units (E3.1-JUDGMENT-CASES.md §1.2).
    expect(cheap.witness.avoidKeys).toContain('ee6291a21d7ef452');
    expect(e21.witness.preferredKeys).not.toContain('c2eb8e48fcd82e18');
    expect(e21.witness.avoidKeys).not.toContain('c2eb8e48fcd82e18');
    // Under the pre-A7-2 rule (`preferred && !avoided`) both were unmatched.
  });

  it('leaves a judgment row that did not win on the matched/unmatched line', async () => {
    const judgmentHit = initialCase({
      id: 'a72-judgment-hit',
      kind: 'judgment',
      witness: { label: 'judgment', preferredKeys: ['000000000000cccc'], avoidKeys: [], reason: 'preference', by: 'adviser' },
    });
    const run = await runExam([judgmentHit], args(), { engineFactory: scripted([rootResult({ endKey: '000000000000cccc' })]) });
    expect(run.judgment).toMatchObject({ cases: 1, matched: 1, unmatched: 0, won: 0, comparable: 1 });
    expect(run.results[0].outcome).toBe('matched');
    expect(run.results[0].matched).toBe(true);
  });
});

describe('exam runner: a judgment case on a dead position is its own outcome (A7-3)', () => {
  // The four rows lane 7 named (amendments/lane7.md A7-3): `witness.ts
  // deadPosition` proves every one of their 17 or 18 legal turn ends hands the
  // opponent a win on the spot. Two were counted as MATCHES in the 4/22 tally
  // and two as MISSES, and neither number meant anything.
  const DEAD_IDS = [
    'authored-home-mate-clear-an-adjacent-lane-mate-preference',
    'authored-home-mate-clear-an-adjacent-lane-rotated-black-mate-preference',
    'authored-home-mate-zero-attack-occupier-mate-preference',
    'authored-home-mate-zero-attack-occupier-rotated-black-mate-preference',
  ];

  it('proves all four roots dead from the canonical rules alone', () => {
    const cases = loadStratum('dev', CASES_DIR);
    for (const id of DEAD_IDS) {
      const c = cases.find(x => x.id === id);
      expect(c, id).toBeDefined();
      if (c === undefined) throw new Error('unreachable');
      const state = loadCaseState(c);
      expect(withExamRules(c, () => proveDead(state)), id).toBe('dead');
    }
  }, 60_000);

  it('reports them as dead, counted as neither matched nor missed', async () => {
    const cases = loadStratum('dev', CASES_DIR).filter(c => DEAD_IDS.includes(c.id));
    expect(cases).toHaveLength(4);
    const run = await runExam(cases, args({ work: 25_000, engine: 'hard@desktop', deadCheck: true }));

    expect(run.errors).toEqual([]);
    expect(run.judgment).toMatchObject({ cases: 4, matched: 0, unmatched: 0, won: 0, dead: 4, comparable: 0 });
    expect(run.judgment.deadCases).toEqual(DEAD_IDS.slice().sort());
    for (const row of run.results) {
      expect(row.outcome, row.id).toBe('dead');
      expect(row.deadProof, row.id).toBe('dead');
      expect(row.matched, row.id).toBeNull();
      expect(row.note, row.id).toContain('win on the spot');
    }
  }, 120_000);

  it('is a change of outcome: two of the four were matches and two were misses', async () => {
    const cases = loadStratum('dev', CASES_DIR).filter(c => DEAD_IDS.includes(c.id));
    // The pre-A7-3 rule, reproduced by turning the proof off.
    const run = await runExam(cases, args({ work: 25_000, engine: 'hard@desktop', deadCheck: false }));
    const before = new Map<string, boolean>();
    for (const row of run.results) {
      expect(row.deadProof, row.id).toBe('not-checked');
      expect(row.outcome === 'matched' || row.outcome === 'unmatched', row.id).toBe(true);
      before.set(row.id, row.outcome === 'matched');
    }
    expect([...before.values()].filter(Boolean)).toHaveLength(2);
    expect(before.get('authored-home-mate-zero-attack-occupier-mate-preference')).toBe(true);
    expect(before.get('authored-home-mate-zero-attack-occupier-rotated-black-mate-preference')).toBe(true);
    expect(before.get('authored-home-mate-clear-an-adjacent-lane-mate-preference')).toBe(false);
    expect(before.get('authored-home-mate-clear-an-adjacent-lane-rotated-black-mate-preference')).toBe(false);
  }, 120_000);

  it('never calls a position alive it could not afford to prove: the CLI default is on', () => {
    expect(parseArgs([]).deadCheck).toBe(true);
    expect(parseArgs(['--no-dead-check']).deadCheck).toBe(false);
    // A root the quadratic proof cannot afford is skipped, not called alive.
    const loss = loadStratum('dev', CASES_DIR).find(c => c.id === 'loss-g4-s6_3_5-B-white-t1');
    expect(loss).toBeDefined();
    if (loss === undefined) throw new Error('unreachable');
    const state = loadCaseState(loss);
    // 3,673 end positions, a complete enumeration, past DEAD_CHECK_MAX_ENDS.
    expect(withExamRules(loss, () => proveDead(state))).toBe('skipped-too-many-ends');
  }, 60_000);
});

describe('the seeded dev stratum', () => {
  const cases = loadStratum('dev', CASES_DIR);

  it('is non-empty and holds both kinds', () => {
    expect(cases.length).toBeGreaterThan(50);
    expect(cases.some(c => c.kind === 'exact')).toBe(true);
    expect(cases.some(c => c.kind === 'judgment')).toBe(true);
    expect(cases.some(c => c.source.kind === 'loss')).toBe(true);
  });

  it('reconstructs every position', () => {
    for (const c of cases) expect(() => loadCaseState(c), c.id).not.toThrow();
  });

  it('re-verifies every exact witness against the canonical rules', () => {
    for (const c of cases) {
      if (c.witness.label !== 'exact') continue;
      const state = loadCaseState(c);
      const check = withExamRules(c, () => verifyCaseWitness(c, state));
      expect(check.ok, `${c.id}: ${check.rejected.map(r => `${r.key} ${r.reason}`).join('; ')}`).toBe(true);
    }
  }, 120_000);

  it('never claims a witness key that the canonical rules do not back', () => {
    // One case, fully: the enumeration itself, not the stored note.
    const c = cases.find(x => x.witness.label === 'exact' && x.witness.method === 'canonical-enumeration');
    expect(c).toBeDefined();
    if (c === undefined || c.witness.label !== 'exact') throw new Error('unreachable');
    const witness = c.witness;
    const state = loadCaseState(c);
    withExamRules(c, () => {
      const { ends, complete } = enumerateTurnEnds(state);
      expect(complete).toBe(true);
      for (const key of witness.endKeys) {
        const end = ends.get(key);
        expect(end, `${c.id}: ${key} is not an end position of any legal turn`).toBeDefined();
        expect(claimHolds(witness.claim, state, end as GameState, c.sideToMove)).toBe(true);
      }
      // And the claim discriminates: some legal turn does NOT satisfy it.
      expect(witness.endKeys.length).toBeLessThan(ends.size);
    });
  });
});
