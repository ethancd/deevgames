/**
 * `node --import tsx lab/hard-ai/exam/seed.ts [--out-dir <dir>] [--budget <calls>]
 *   [--report <path>] [--dry-run]`
 *
 * `--dry-run` (E3 lane 13, for A9-4) writes NO `dev.jsonl`: it writes the same
 * report plus a `reseed` block saying what a re-seed WOULD change against the
 * committed file — every row that would be dropped with its reason, every row
 * that would be added, the judgment denominator before and after, and the
 * authored-exact count on both sides. It is evidence for the exam-set owner's
 * ruling, not the ruling.
 *
 * Carries authored suite cases into the examination set (EPIC-PLAN §4 E1.2,
 * deliverable 5a) and writes the audit that says which ones could NOT be
 * carried and why.
 *
 * THE BAR. A suite case becomes an EXACT exam case only when the canonical
 * rules, enumerating every legal turn from its position, confirm a claim that
 * actually DISCRIMINATES:
 *
 *   - the enumeration completed inside the call budget (so the key set is
 *     closed: a turn outside it provably does not satisfy the claim), and
 *   - at least one end position satisfies the claim, and
 *   - at least one does NOT. A claim every legal turn satisfies is vacuous —
 *     it asks the engine for nothing but a legal turn — and a "case" resting on
 *     one would report a pass that means nothing.
 *
 * The claim is chosen by strength: `win` (the turn ends the game in the mover's
 * favour) over `home-clear` (the mover's own corner ends free of the invader)
 * over `kill` (an enemy unit died).
 *
 * THE WITNESS IS RE-DERIVED, NOT COPIED. The carried `endKeys` are the keys the
 * enumeration itself confirmed, not the suite's `best` list. Those two differ,
 * and the difference is the audit: `suites/run.ts`'s own header records that
 * two `home-mate` rows and four `spawn-strike` rows put a winning turn in
 * `avoid`, and the enumeration finds winning end positions outside `best` in
 * several `tactics` rows as well. An exam case that copied `best` would inherit
 * those; one that re-derives from the rules cannot. Every case records the
 * comparison in its witness note, and no suite file is edited — E1.2's rule is
 * that a fixture is never "repaired" because something disagrees with it.
 *
 * A DEAD POSITION IS NOT CARRIED, AS EITHER KIND (E3 lane 7's A7-3, applied
 * 2026-09-17). The proof below the `picked` block refuses to author an EXACT
 * case on a root where every legal turn hands the opponent a win on the spot.
 * The JUDGMENT carry above it reached that proof through no path at all — it
 * ends in a `push`, and the exact path's `continue` sits between them — so four
 * `home-mate` rows whose roots the canonical rules prove dead were carried as
 * preferences. The same proof, under the same `DEAD_CHECK_MAX_ENDS` guard, now
 * runs before a judgment carry; a refusal is a `dead-position-judgment` row in
 * the report, and a carry records what the proof said in `deadProof`. The four
 * cases already in `cases/dev.jsonl` are NOT edited out of it — a fixture is
 * never repaired because something disagrees with it — and `exam/run.ts` reports
 * them under its own `dead` outcome.
 *
 * WHAT IS NOT CARRIED is as much of the deliverable as what is. The report names
 * every skipped case with its reason; §1 of `docs/hard-ai/e1/E1.2-EXAM-SET.md`
 * summarises it.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PlayerId } from '../../../src/game/types';
import { gameplayDigest } from '../ladder/openings';
import { findPosition, readPositions, type StoredPosition } from '../positions/corpus';
import { normalizeKey as normalizeSuiteKey, readSuite, resolvePositionRef, type SuiteCase } from '../suites/format';
import {
  EXAM_SCHEMA,
  withExamRules,
  writeCases,
  type ExamCase,
  type ExamDemand,
  type ExactClaim,
  type ExamStratum,
} from './format';
import { DEFAULT_ENUM_BUDGET, claimHolds, deadPosition, enumerateTurnEnds } from './witness';

const HERE = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(HERE, '../../..');
const SUITES_DIR = path.resolve(HERE, '../suites');
const POSITIONS_DIR = path.resolve(HERE, '../positions');
const DEFAULT_OUT_DIR = path.resolve(HERE, 'cases');
const DEFAULT_REPORT = path.resolve(HERE, 'seed-report.json');

/** Authored cases are development unless a SEALED test depends on them. None
 * does today: the only tests that read these corpora are `tests/ai/hard/*`
 * unit tests, which are development checks. */
const AUTHORED_STRATUM: ExamStratum = 'dev';

/**
 * A position with more end positions than this is not put through the
 * dead-position proof: that proof enumerates a whole opponent turn from EVERY
 * end position, so it is quadratic in this number and the `spawn-strike` rows
 * (up to 7,072 ends) would cost hours. Such a case is carried with the tag
 * `dead-check-skipped` and the runner's "a win is never a miss" adjudication
 * still covers the case that matters most.
 */
const DEAD_CHECK_MAX_ENDS = 400;

/** Calls the dead-position proof may spend. Separate from the enumeration
 * budget because the proof is a nest of enumerations. */
const DEAD_CHECK_BUDGET = 2_000_000;

interface SuitePlan {
  suite: string;
  demand: (c: SuiteCase) => ExamDemand;
  /** Suite cases whose authored preference is carried as a JUDGMENT case. */
  judgmentTag?: string;
  judgmentReason?: string;
}

const PLAN: SuitePlan[] = [
  {
    suite: 'tactics',
    demand: c => {
      const tags = c.tags ?? [];
      if (tags.includes('purchase') || tags.includes('promotion')) return 'immediate-action';
      if (tags.some(t => t === 'lanes' || t === 'two-lanes' || t === 'three-lanes')) return 'shared-actions';
      return 'healing';
    },
  },
  { suite: 'spawn-strike', demand: () => 'immediate-action' },
  {
    suite: 'home-mate',
    demand: () => 'home-and-spawn',
    judgmentTag: 'refuted',
    judgmentReason:
      'build-home-mate.ts\'s authored preference for a REFUTED invasion: step onto the corner only along a line the defender cannot answer. The canonical rules confirm the key set is reachable; which of the reachable turns is better is the authors\' strategic reading, not a rules fact.',
  },
  { suite: 'economy', demand: () => 'finite-crystals' },
];

interface SkipRow {
  suite: string;
  id: string;
  reason: string;
  detail: string;
}

interface CarryRow {
  suite: string;
  id: string;
  examId: string;
  kind: 'exact' | 'judgment';
  claim?: ExactClaim;
  /** Judgment carries only (A7-3): what the dead-position proof said. */
  deadProof?: 'alive' | 'unknown-proof-budget' | 'skipped-too-many-ends' | 'enumeration-incomplete';
  ends: number;
  keys: number;
  suiteBest: number;
  suiteBestReached: number;
  suiteBestOutsideWitness: number;
  witnessOutsideSuiteBest: number;
}

function parseArgs(argv: string[]): { outDir: string; budget: number; report: string; dryRun: boolean } {
  let outDir = DEFAULT_OUT_DIR;
  let budget = DEFAULT_ENUM_BUDGET;
  let report: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out-dir') outDir = path.resolve(argv[++i]);
    else if (a === '--budget') budget = Number(argv[++i]);
    else if (a === '--report') report = path.resolve(argv[++i]);
    else if (a === '--dry-run') dryRun = true;
    else throw new Error(`seed: unknown argument ${a}`);
  }
  // A dry run never writes over the committed `seed-report.json` either: an
  // unnamed report lands beside it under its own name.
  const fallback = dryRun ? DEFAULT_REPORT.replace(/\.json$/, '.dry-run.json') : DEFAULT_REPORT;
  return { outDir, budget, report: report ?? fallback, dryRun };
}

/**
 * A9-4's dry run: what a re-seed of `cases/dev.jsonl` WOULD change, without
 * changing it. Compares the rows this run carried with the rows the committed
 * file holds, names every row that would be dropped and why, and restates the
 * judgment denominator. E3-PLAN forbids repairing a fixture because something
 * disagrees with it; this report is the evidence a ruling needs, not the
 * ruling. `--dry-run` writes NO `dev.jsonl`.
 */
interface ReseedDiff {
  committed: { file: string; total: number; exact: number; judgment: number; authoredExact: number; authoredJudgment: number; lossExact: number; lossJudgment: number };
  wouldWrite: { total: number; exact: number; judgment: number; carriedExact: number; carriedJudgment: number; lossPreserved: number };
  droppedRows: { id: string; kind: string; sourceKind: string; reason: string }[];
  addedRows: { id: string; kind: string }[];
  judgmentDenominator: { committed: number; afterReseed: number };
  authoredExactCount: { committed: number; seederCarries: number };
}

function reseedDiff(
  outDir: string,
  carried: readonly ExamCase[],
  keptLossCases: readonly ExamCase[],
  skipped: readonly SkipRow[],
): ReseedDiff {
  const file = path.join(outDir, 'dev.jsonl');
  const committed: ExamCase[] = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l) as ExamCase)
    : [];
  const wouldWrite = [...carried, ...keptLossCases];
  const wouldById = new Map(wouldWrite.map(c => [c.id, c]));
  const committedById = new Map(committed.map(c => [c.id, c]));
  // A skip row is keyed by suite + suite-case id; the exam id is the seeder's
  // own `examIdFor`, and a JUDGMENT carry appends `-preference` to it (see the
  // carry below), so a dropped judgment row is looked up under both spellings.
  const skipReason = new Map<string, string>();
  for (const r of skipped) {
    skipReason.set(examIdFor(r.suite, r.id), r.reason);
    skipReason.set(`${examIdFor(r.suite, r.id)}-preference`, r.reason);
  }
  const droppedRows = committed
    .filter(c => !wouldById.has(c.id))
    .map(c => ({
      id: c.id,
      kind: c.kind,
      sourceKind: c.source.kind,
      reason: skipReason.get(c.id) ?? 'not-produced-by-this-seeder-run',
    }));
  const addedRows = wouldWrite.filter(c => !committedById.has(c.id)).map(c => ({ id: c.id, kind: c.kind }));
  const count = (rows: readonly ExamCase[], src: string, kind: string): number =>
    rows.filter(c => c.source.kind === src && c.kind === kind).length;
  return {
    committed: {
      file: path.relative(REPO_ROOT, file),
      total: committed.length,
      exact: committed.filter(c => c.kind === 'exact').length,
      judgment: committed.filter(c => c.kind === 'judgment').length,
      authoredExact: count(committed, 'authored', 'exact'),
      authoredJudgment: count(committed, 'authored', 'judgment'),
      lossExact: count(committed, 'loss', 'exact'),
      lossJudgment: count(committed, 'loss', 'judgment'),
    },
    wouldWrite: {
      total: wouldWrite.length,
      exact: wouldWrite.filter(c => c.kind === 'exact').length,
      judgment: wouldWrite.filter(c => c.kind === 'judgment').length,
      carriedExact: carried.filter(c => c.kind === 'exact').length,
      carriedJudgment: carried.filter(c => c.kind === 'judgment').length,
      lossPreserved: keptLossCases.length,
    },
    droppedRows,
    addedRows,
    judgmentDenominator: {
      committed: committed.filter(c => c.kind === 'judgment').length,
      afterReseed: wouldWrite.filter(c => c.kind === 'judgment').length,
    },
    authoredExactCount: {
      committed: count(committed, 'authored', 'exact'),
      seederCarries: carried.filter(c => c.kind === 'exact').length,
    },
  };
}

function examIdFor(suite: string, caseId: string): string {
  return `authored-${suite}-${caseId}`;
}

interface ClaimSets {
  ends: number;
  allKeys: Set<string>;
  win: string[];
  kill: string[];
  homeClear: string[];
}

function claimSets(root: GameState, mover: PlayerId, budget: number): { sets: ClaimSets; complete: boolean; calls: number } {
  const { ends, complete, calls } = enumerateTurnEnds(root, budget);
  const win: string[] = [];
  const kill: string[] = [];
  const homeClear: string[] = [];
  for (const [key, end] of ends) {
    if (claimHolds('win', root, end, mover)) win.push(key);
    if (claimHolds('kill', root, end, mover)) kill.push(key);
    if (claimHolds('home-clear', root, end, mover)) homeClear.push(key);
  }
  win.sort();
  kill.sort();
  homeClear.sort();
  return { sets: { ends: ends.size, allKeys: new Set(ends.keys()), win, kill, homeClear }, complete, calls };
}

function pickClaim(sets: ClaimSets): { claim: ExactClaim; keys: string[] } | null {
  const order: { claim: ExactClaim; keys: string[] }[] = [
    { claim: 'win', keys: sets.win },
    { claim: 'home-clear', keys: sets.homeClear },
    { claim: 'kill', keys: sets.kill },
  ];
  for (const candidate of order) {
    if (candidate.keys.length > 0 && candidate.keys.length < sets.ends) return candidate;
  }
  return null;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const carried: ExamCase[] = [];
  const carryRows: CarryRow[] = [];
  const skipped: SkipRow[] = [];
  const positionCache = new Map<string, StoredPosition[]>();
  const at = new Date().toISOString();

  for (const plan of PLAN) {
    const suiteFile = path.join(SUITES_DIR, `${plan.suite}.suite.json`);
    const suite = readSuite(suiteFile);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(suiteFile)).digest('hex');
    for (const c of suite.cases) {
      let ref;
      try {
        ref = resolvePositionRef(c.position, REPO_ROOT, SUITES_DIR, POSITIONS_DIR);
      } catch (err) {
        skipped.push({ suite: plan.suite, id: c.id, reason: 'position-unresolvable', detail: err instanceof Error ? err.message : String(err) });
        continue;
      }
      if (!positionCache.has(ref.file)) positionCache.set(ref.file, readPositions(ref.file));
      let stored: StoredPosition;
      try {
        stored = findPosition(positionCache.get(ref.file)!, ref.id);
      } catch (err) {
        skipped.push({ suite: plan.suite, id: c.id, reason: 'position-missing', detail: err instanceof Error ? err.message : String(err) });
        continue;
      }

      const shell = { rules: stored.rules, setup: undefined };
      const state: GameState = { ...stored.state, victoryRule: stored.rules.victoryRule, inactivityRule: stored.rules.inactivityRule };
      const mover = state.turn.currentPlayer;
      const suiteBest = c.best.map(k => normalizeSuiteKey(k));

      const outcome = withExamRules(shell, () => claimSets(state, mover, args.budget));
      const digest = gameplayDigest(state);
      const reached = suiteBest.filter(k => outcome.sets.allKeys.has(k)).length;

      // A carried JUDGMENT is still required to be about REACHABLE positions:
      // a preferred end key no legal turn produces is not a preference, it is a
      // broken row. The economy suite is exactly that case and carries none.
      if (plan.judgmentTag !== undefined && (c.tags ?? []).includes(plan.judgmentTag) && reached === suiteBest.length && suiteBest.length > 0) {
        // A7-3: and it is required to be about a position that is still ALIVE.
        // The dead-position proof below sits on the EXACT path at the `picked`
        // block, after a `continue` this path never reaches, so four `home-mate`
        // rows whose every legal turn hands the opponent a win on the spot were
        // carried as preferences and scored 2 matches and 2 misses. The proof
        // and its guard are the same ones the exact path uses; a proof that
        // could not be afforded is recorded, never assumed alive.
        const judgmentDead = !outcome.complete
          ? 'enumeration-incomplete'
          : outcome.sets.ends > DEAD_CHECK_MAX_ENDS
            ? 'skipped-too-many-ends'
            : withExamRules(shell, () => deadPosition(state, DEAD_CHECK_BUDGET));
        if (judgmentDead === true) {
          skipped.push({
            suite: plan.suite,
            id: c.id,
            reason: 'dead-position-judgment',
            detail:
              `every one of the ${outcome.sets.ends} end positions of this turn hands the opponent a win on the spot, so the authored ` +
              `preference asks the engine to prefer one way of losing over another (suites/run.ts's second canonical adjudication ` +
              `demotes the matching suite row to a coverage row, and build-home-mate.ts refuses to author one)`,
          });
          continue;
        }
        const deadProof =
          judgmentDead === false
            ? 'alive'
            : judgmentDead === null
              ? 'unknown-proof-budget'
              : judgmentDead;
        const preferred = suiteBest.slice().sort();
        carried.push({
          schema: EXAM_SCHEMA,
          id: `${examIdFor(plan.suite, c.id)}-preference`,
          version: 1,
          source: { kind: 'authored', from: `lab/hard-ai/suites/${plan.suite}.suite.json#${c.id}`, sha256 },
          demand: plan.demand(c),
          kind: 'judgment',
          rules: stored.rules,
          position: { kind: 'state', state },
          sideToMove: mover,
          witness: {
            label: 'judgment',
            preferredKeys: preferred,
            avoidKeys: c.avoid.map(k => normalizeSuiteKey(k)).sort(),
            reason: plan.judgmentReason ?? 'authored strategic preference carried from the suite row',
            by: 'author',
          },
          stratum: AUTHORED_STRATUM,
          tags: ['authored', plan.suite, 'preference', ...(c.tags ?? [])],
          stateDigest: digest,
          rationale: c.rationale,
        });
        carryRows.push({
          suite: plan.suite,
          id: c.id,
          examId: `${examIdFor(plan.suite, c.id)}-preference`,
          kind: 'judgment',
          deadProof,
          ends: outcome.sets.ends,
          keys: preferred.length,
          suiteBest: suiteBest.length,
          suiteBestReached: reached,
          suiteBestOutsideWitness: 0,
          witnessOutsideSuiteBest: 0,
        });
      }
      if (!outcome.complete) {
        skipped.push({
          suite: plan.suite,
          id: c.id,
          reason: 'enumeration-incomplete',
          detail: `the canonical enumeration hit the ${args.budget}-call budget after ${outcome.sets.ends} end positions; without a closed key set the witness would not be exact`,
        });
        continue;
      }

      const picked = pickClaim(outcome.sets);
      if (picked === null) {
        const vacuous = outcome.sets.win.length === outcome.sets.ends ? 'every legal turn already satisfies "win"' : 'no canonical claim separates one turn from another here';
        skipped.push({
          suite: plan.suite,
          id: c.id,
          reason: 'no-discriminating-claim',
          detail: `${outcome.sets.ends} end positions: win ${outcome.sets.win.length}, home-clear ${outcome.sets.homeClear.length}, kill ${outcome.sets.kill.length} — ${vacuous}`,
        });
        continue;
      }

      // A CLAIM THAT ONLY WINS IS NEVER DEAD. Otherwise ask the canonical rules
      // whether every turn from here loses on the spot: in such a position no
      // answer is better than another, and `suites/run.ts` already demotes the
      // matching suite rows to coverage. Carrying one as an exact case would
      // require the engine to prefer one way of losing over another.
      let deadNote = '';
      if (picked.claim !== 'win') {
        if (outcome.sets.ends > DEAD_CHECK_MAX_ENDS) {
          deadNote = ` The dead-position proof was skipped: ${outcome.sets.ends} end positions is past the ${DEAD_CHECK_MAX_ENDS} the quadratic proof can afford.`;
        } else {
          const dead = withExamRules(shell, () => deadPosition(state, DEAD_CHECK_BUDGET));
          if (dead === true) {
            skipped.push({
              suite: plan.suite,
              id: c.id,
              reason: 'dead-position',
              detail: `every one of the ${outcome.sets.ends} end positions of this turn hands the opponent a win on the spot, so no turn is better than another (suites/run.ts's second canonical adjudication demotes the matching suite row to a coverage row)`,
            });
            continue;
          }
          deadNote = dead === null ? ` The dead-position proof ran out of budget, so "this position is still alive" is unproved.` : ` The canonical rules confirm the position is not dead.`;
        }
      }

      const witnessSet = new Set(picked.keys);
      const bestOutside = suiteBest.filter(k => !witnessSet.has(k));
      const witnessOutsideBest = picked.keys.filter(k => !suiteBest.includes(k));

      carried.push({
        schema: EXAM_SCHEMA,
        id: examIdFor(plan.suite, c.id),
        version: 1,
        source: { kind: 'authored', from: `lab/hard-ai/suites/${plan.suite}.suite.json#${c.id}`, sha256 },
        demand: plan.demand(c),
        kind: 'exact',
        rules: stored.rules,
        position: { kind: 'state', state },
        sideToMove: mover,
        witness: {
          label: 'exact',
          claim: picked.claim,
          method: 'canonical-enumeration',
          endKeys: picked.keys,
          avoidKeys: [],
          complete: true,
          note:
            `canonical enumeration of every legal turn from this position (${outcome.sets.ends} distinct end positions, ${outcome.calls} canonical calls): ` +
            `${picked.keys.length} satisfy "${picked.claim}" and ${outcome.sets.ends - picked.keys.length} do not. ` +
            `The suite row lists ${suiteBest.length} "best" keys, ${reached} of them reachable by canonical play; ${bestOutside.length} are outside this witness and ${witnessOutsideBest.length} witness keys are outside the suite's best list. ` +
            `The suite file is unchanged: the difference is recorded, not repaired.` + deadNote,
          verifiedAt: at,
          verifiedBy: 'lab/hard-ai/exam/seed.ts (witness.ts enumerateTurnEnds/claimHolds)',
        },
        stratum: AUTHORED_STRATUM,
        tags: [
          'authored',
          plan.suite,
          ...(deadNote.includes('skipped') ? ['dead-check-skipped'] : []),
          ...(deadNote.includes('ran out of budget') ? ['dead-check-inconclusive'] : []),
          ...(c.tags ?? []),
        ],
        stateDigest: digest,
        rationale: c.rationale,
      });
      carryRows.push({
        suite: plan.suite,
        id: c.id,
        examId: examIdFor(plan.suite, c.id),
        kind: 'exact',
        claim: picked.claim,
        ends: outcome.sets.ends,
        keys: picked.keys.length,
        suiteBest: suiteBest.length,
        suiteBestReached: reached,
        suiteBestOutsideWitness: bestOutside.length,
        witnessOutsideSuiteBest: witnessOutsideBest.length,
      });

    }
  }

  const existing = fs.existsSync(path.join(args.outDir, 'dev.jsonl'))
    ? fs.readFileSync(path.join(args.outDir, 'dev.jsonl'), 'utf8').split('\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l) as ExamCase)
    : [];
  const keptLossCases = existing.filter(c => c.source.kind === 'loss');
  const diff = args.dryRun ? reseedDiff(args.outDir, carried, keptLossCases, skipped) : null;
  if (args.dryRun) {
    console.log(`exam seed: DRY RUN — ${path.join(path.relative(REPO_ROOT, args.outDir), 'dev.jsonl')} is NOT written`);
  } else {
    writeCases(path.join(args.outDir, 'dev.jsonl'), [...carried, ...keptLossCases]);
  }

  const report = {
    schema: 'muju-exam-seed-v1',
    at,
    budget: args.budget,
    dryRun: args.dryRun,
    carried: carryRows,
    skipped,
    counts: {
      carriedExact: carryRows.filter(r => r.kind === 'exact').length,
      carriedJudgment: carryRows.filter(r => r.kind === 'judgment').length,
      skipped: skipped.length,
      lossCasesPreserved: keptLossCases.length,
    },
    ...(diff === null ? {} : { reseed: diff }),
  };
  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, JSON.stringify(report, null, 1) + '\n');

  console.log(`exam seed: ${report.counts.carriedExact} exact, ${report.counts.carriedJudgment} judgment, ${skipped.length} skipped; ${keptLossCases.length} loss cases preserved`);
  const bySuite = new Map<string, { exact: number; judgment: number; skipped: number }>();
  for (const r of carryRows) {
    const e = bySuite.get(r.suite) ?? { exact: 0, judgment: 0, skipped: 0 };
    if (r.kind === 'exact') e.exact++;
    else e.judgment++;
    bySuite.set(r.suite, e);
  }
  for (const s of skipped) {
    const e = bySuite.get(s.suite) ?? { exact: 0, judgment: 0, skipped: 0 };
    e.skipped++;
    bySuite.set(s.suite, e);
  }
  for (const [suite, e] of bySuite) console.log(`  ${suite}: exact ${e.exact}, judgment ${e.judgment}, skipped ${e.skipped}`);
  console.log(`report: ${path.relative(REPO_ROOT, args.report)}`);
}

main();
