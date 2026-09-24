/**
 * `node --import tsx lab/hard-ai/exam/build-p4.ts [--check]`
 *
 * Builds `lab/hard-ai/exam/cases-p4/dev.jsonl`, the wave-1 plan-level
 * examination set (STRATEGOS Workflow 1, plan step W1.13, 2026-09-24), from the
 * verified lab replays of the LLM-vs-Hard wave-1 games in
 * `lab/results/llm-wave-1/replays/` (`analyze/from-room.ts`; every event of each
 * room was re-derived through the server's own `describeTransition`).
 *
 * WHAT A CASE HERE IS. A position Hard actually faced online, as a Phasing
 * recipe, with the predicate its turn should have satisfied (`format.ts
 * PLAN_RULES`) and the author's reason, cited to the wave's `DIGEST.md` and
 * `engine-evidence.md`. The recipe, digest, clock, mined totals and the verdict
 * on Hard's own recorded reply are all computed here through the canonical
 * rules (`from-loss.ts extractPlanCase`), never typed in.
 *
 * REVISIONS. The evidence files name room revisions, and name them two ways:
 * "AS01-W r6" is the position AFTER revision 6 (Hard's full pass is revision 7,
 * per the DIGEST errata), "OP01-W r3" is Hard's own reply at revision 3. Each
 * case therefore records both, `source.revision` (the position) and
 * `source.replyRevision` (Hard's reply, always one later), and the builder checks
 * the pair against the room bundle's move history: every non-arrival event of
 * Hard's turn carries `replyRevision`.
 *
 * `--check` rebuilds the set and exits non-zero if it differs from the file.
 * The build is deterministic (no timestamps in a plan case), so `--check` is a
 * byte comparison.
 *
 * The wave-1 campaign directory itself is never read here; everything comes
 * from the committed replays and room bundles. The `cites` strings name files in
 * that directory (`outputs/muju-llm-opponent-campaign-2026-09-23/wave-1/`, in the
 * main checkout, untracked, read-only campaign data) for a human reader.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PlayerId } from '../../../src/game/types';
import { loadReplay } from '../analyze/replay';
import { readBundle } from '../analyze/from-room';
import { CASES_P4_DIR, stratumFile, writeCases, type ExamCase } from './format';
import { extractPlanCase, type PlanCaseSpec, type PlanExtraction } from './from-loss';

const HERE = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(HERE, '../../..');
export const WAVE1_RUN = 'lab/results/llm-wave-1';
const DIGEST = 'outputs/muju-llm-opponent-campaign-2026-09-23/wave-1/DIGEST.md';
const EVIDENCE = 'outputs/muju-llm-opponent-campaign-2026-09-23/wave-1/engine-evidence.md';
const REFLECTION = (game: string) => `outputs/muju-llm-opponent-campaign-2026-09-23/wave-1/games/${game}/reflection.md`;

type Spec = Omit<PlanCaseSpec, 'run' | 'stratum'> & { game: string; planLabel: string };

/**
 * The cases W1.13 names, in the plan's order. `planLabel` is how the plan (and
 * the evidence) refers to the position; `turn` is Hard's turn number there.
 */
export const P4_SPECS: readonly Spec[] = [
  {
    id: 'wave1-AS01-W-t3',
    game: 'AS01-W',
    planLabel: 'AS01-W r6',
    turn: 3,
    revision: 6,
    roomId: '4fac4dfa80eacd839d1fdcb2e9523449',
    predicate: 'damaging-attack',
    expected: 'pass',
    demand: 'quiet-clock',
    reason:
      'Hard trails 13 v 30 on mined totals with 5 plies left on the kill clock, so it must build contact now; its Lightning on G6 can reach and ' +
      'strike this turn, yet it made a full pass (revision 7). A damaging attack is the ForceContact contract\'s end predicate.',
    cites: [`${EVIDENCE} §(3) row AS01-W`, `${DIGEST} "Where it is brittle" 1`, `${DIGEST} Errata (the pass is r7)`],
    tags: ['force-contact'],
    rationale: 'AS01-W (Astra 6 High as White, h1), Hard Black turn 3: the full pass at 13 v 30, clock 5/10. Hard lost 31 v 58 on the clock.',
  },
  {
    id: 'wave1-OP01-W-t1',
    game: 'OP01-W',
    planLabel: 'OP01-W r3',
    turn: 1,
    revision: 2,
    roomId: '03b90c43d03ce3e7a541187fae182961',
    predicate: 'spawn-area-open',
    expected: 'pass',
    demand: 'home-and-spawn',
    reason:
      'Hard\'s first turn moved its starting units to J10, J8 and I9 and bought onto I10 and J9, leaving no square it could place on; it then ' +
      'passed four turns. A turn that keeps at least one placement square open avoids the jam.',
    cites: [`${EVIDENCE} "Defect: Hard blocks its own placement squares, then passes"`, `${DIGEST} "Where it is brittle" 4`],
    tags: ['placement-jam'],
    rationale: 'OP01-W (Opus 5.5 Medium as White, h9), Hard Black turn 1: the self-jam (revision 3). Hard lost 42 v 72 on the clock.',
  },
  {
    id: 'wave1-OP01-W-t2',
    game: 'OP01-W',
    planLabel: 'OP01-W r6',
    turn: 2,
    revision: 5,
    roomId: '03b90c43d03ce3e7a541187fae182961',
    predicate: 'contact-in-n',
    n: 3,
    expected: 'pass',
    demand: 'quiet-clock',
    reason:
      'The first of four full passes (revisions 6, 8, 11, 14). Hard leads 15 v 14 at this instant but White out-mines its jammed corner and ' +
      'wins the clock 72 v 42; no strike is possible this turn, so the plan is to move toward White so that one exists next turn.',
    cites: [`${EVIDENCE} §(3) row OP01-W`, `${EVIDENCE} "Defect: Hard blocks its own placement squares, then passes"`, `${DIGEST} "Where it is brittle" 1`],
    tags: ['force-contact', 'placement-jam'],
    rationale: 'OP01-W, Hard Black turn 2: the first pass (revision 6), five units jammed in the J10 corner, clock 3/10.',
  },
  {
    id: 'wave1-SO02-B-t37',
    game: 'SO02-B',
    planLabel: 'SO02-B late',
    turn: 37,
    revision: 93,
    roomId: 'f370f02c1e6da8613e695152cc900754',
    predicate: 'damaging-attack',
    expected: 'pass',
    demand: 'quiet-clock',
    reason:
      'Hard leads 250 v 248 now, but its mining has stopped (bank 0, an upkeep release this turn) while Black still mines, and 6 plies remain; ' +
      'the projected clock is a loss (it lost 251 v 254) and only a kill resets it. Reading the current lead instead of the projected one is ' +
      'wave 1\'s central failure; a damaging attack is the first step of the contact it never made again.',
    cites: [`${EVIDENCE} §(2) row SO02-B`, `${DIGEST} Outcomes row SO02-B`, 'STRATEGOS plan Context ("reads the current mined lead rather than the projected one")'],
    tags: ['force-contact', 'projected-clock'],
    rationale: 'SO02-B (Sol 6 High as Black, h3), Hard White turn 37: clock 4/10, mined 250 v 248, Hard\'s income gone. Hard lost 251 v 254.',
  },
  {
    id: 'wave1-FB01-B-t18',
    game: 'FB01-B',
    planLabel: 'FB01-B',
    turn: 18,
    revision: 35,
    roomId: 'b1992d54faf5312b33b8f95ee2a3a1ec',
    predicate: 'promotion-made',
    expected: 'pass',
    demand: 'immediate-action',
    reason:
      'Hard promoted once in 31 turns against Fable\'s 13. Here it trails 164 v 230 with 24 crystals in its Prepare phase and 28 promotable ' +
      'units and buys four tier-1 Shadows. Black\'s strength is tier-3 (DEF 4), each needing two or more tier-1 hits in one turn, and in the ' +
      'final clock run (turns 28-31) a search of single-unit approach-and-strike combinations found no kill for White (a search, not a proof). ' +
      'Promoting is how its attackers get strong enough to reset the clock.',
    cites: [`${EVIDENCE} §(2) row FB01-B`, `${DIGEST} "Where it is brittle" 2`],
    tags: ['promotion', 'idle-crystals'],
    rationale: 'FB01-B (Fable 5.1 High as Black, h6), Hard White turn 18: 24 idle crystals after mining, 28 promotable units. Hard lost 212 v 288 on the clock.',
  },
  {
    id: 'wave1-SN05-W-t5',
    game: 'SN05-W',
    planLabel: 'SN05-W final',
    turn: 5,
    revision: 10,
    roomId: 'be3d3d39813599d210b69150ee25e464',
    predicate: 'no-clock-reset',
    expected: 'pass',
    demand: 'quiet-clock',
    reason:
      'Hard leads 73 v 34 with 1 ply left: the hand-off ends the game on mined totals in its favour. Several kills are available, and any of ' +
      'them would reset the clock and throw the win away. Hold is correct; Hard got this right (a pass at revision 11).',
    cites: [`${EVIDENCE} §(3) row "SN05-W, SN02-W, SN01-W, LU02-W | final ply"`, `${DIGEST} Patterns (SN05-W)`],
    tags: ['hold'],
    rationale: 'SN05-W (Sonnet 5 Low as White, h12), Hard Black turn 5, the final ply: clock 9/10, 73 v 34. Hard won 101 v 34 on the clock.',
  },
  {
    id: 'wave1-OP02-W-t6',
    game: 'OP02-W',
    planLabel: 'OP02-W r18',
    turn: 6,
    revision: 18,
    roomId: '8b9046b5b1ab08acdddd51425c400475',
    predicate: 'promotion-made',
    expected: 'pass',
    demand: 'immediate-action',
    reason:
      'Hard held 30-50 idle crystals from about revision 16 and promoted once in 45 turns; its one Veḷḷi then killed three units and blocked ' +
      'summons (revisions 79-103). Here, leading 82 v 57 with 46 crystals after mining and 12 promotable units, it buys four tier-1 Plants.',
    cites: [`${EVIDENCE} §(2) row OP02-W`, `${DIGEST} "Where it is brittle" 2`, REFLECTION('OP02-W')],
    tags: ['promotion', 'idle-crystals'],
    rationale: 'OP02-W (Opus 5.5 High as White, h12), Hard Black turn 6: 46 crystals after mining. Hard lost the 46-turn game on the clock.',
  },
  {
    id: 'wave1-SO01-B-t11',
    game: 'SO01-B',
    planLabel: 'SO01-B r21',
    turn: 11,
    revision: 21,
    roomId: '0315b4aa4f63c6b6fb7add0ece115962',
    predicate: 'damaging-attack',
    target: { x: 2, y: 2 },
    expected: 'fail',
    demand: 'home-and-spawn',
    reason:
      'A promoted tier-3 Water stands on C3 in Hard\'s home quarter; on Black\'s next turn (revision 23) it moved to B2 beside Hard\'s home and ' +
      'Black won by home-checkmate at revision 25. Hard must contest it now; it made no attack at all. A search of single-unit ' +
      'approach-and-strike combinations finds no kill of the Water this turn (a search, not a proof), so the predicate asks only for a damaging ' +
      'attack on it. EXPECTED TO FAIL: Workflow 1 plans Hold and ForceContact on the clock only and adds no home-defence reasoning.',
    cites: [`${EVIDENCE} §(2) row SO01-B`, `${DIGEST} "Where it is brittle" 2`, REFLECTION('SO01-B')],
    tags: ['home-defence', 'expected-fail'],
    rationale: 'SO01-B (Sol 6 Medium as Black, h6), Hard White turn 11: the tier-3 Water on C3 at clock 0. Hard lost by home-checkmate at revision 25.',
  },
];

/** Every non-arrival event of the engine's turn must carry the reply revision. */
function checkRevision(spec: Spec, side: PlayerId): void {
  const bundle = readBundle(path.resolve(REPO_ROOT, WAVE1_RUN, 'rooms', `${spec.game}.room.json`));
  if (bundle.roomId !== spec.roomId) throw new Error(`${spec.id}: the bundle is room ${bundle.roomId}, the spec says ${spec.roomId}`);
  const events = bundle.history.entries.filter(e => e.player === side && e.turnNumber === spec.turn && e.kind !== 'summoning');
  if (events.length === 0) throw new Error(`${spec.id}: the room history has no ${side} turn ${spec.turn}`);
  const revisions = [...new Set(events.map(e => e.revision))];
  if (revisions.length !== 1 || revisions[0] !== spec.revision + 1) {
    throw new Error(`${spec.id}: ${side} turn ${spec.turn} is revision(s) ${revisions.join(', ')} in the room history, not ${spec.revision + 1}`);
  }
}

export function buildP4(): { cases: ExamCase[]; extractions: Map<string, PlanExtraction> } {
  const cases: ExamCase[] = [];
  const extractions = new Map<string, PlanExtraction>();
  for (const spec of P4_SPECS) {
    const replay = loadReplay(path.resolve(REPO_ROOT, WAVE1_RUN, 'replays', `${spec.game}.json`));
    const { game, planLabel, ...rest } = spec;
    const extraction = extractPlanCase(replay, {
      ...rest,
      run: WAVE1_RUN,
      stratum: 'dev',
      tags: ['wave-1', `plan:${planLabel}`, `game:${game}`, spec.predicate, ...spec.tags],
    });
    checkRevision(spec, extraction.case.sideToMove);
    cases.push(extraction.case);
    extractions.set(spec.id, extraction);
  }
  return { cases, extractions };
}

function main(): void {
  const check = process.argv.includes('--check');
  const file = stratumFile('dev', CASES_P4_DIR);
  const { cases, extractions } = buildP4();
  for (const c of cases) {
    if (c.witness.label !== 'plan') continue;
    const e = extractions.get(c.id);
    const at = c.witness.at;
    console.log(
      `${c.id}: ${c.sideToMove} to move, clock ${at.clock} (${at.pliesLeft} left), mined W${at.mined.white} B${at.mined.black}, ` +
        `${c.witness.predicate}${c.witness.n !== undefined ? `-${c.witness.n}` : ''}, expected ${c.witness.expected}; ` +
        `Hard's reply ${c.witness.played?.holds ? 'SATISFIES' : 'fails'} it (${e?.played.evidence ?? '?'})`,
    );
  }
  const body = cases.map(c => JSON.stringify(c)).join('\n') + '\n';
  if (check) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current !== body) {
      console.error(`${path.relative(REPO_ROOT, file)} differs from a fresh build; rerun without --check`);
      process.exitCode = 1;
      return;
    }
    console.log(`${path.relative(REPO_ROOT, file)} is up to date (${cases.length} cases)`);
    return;
  }
  writeCases(file, cases);
  console.log(`wrote ${cases.length} cases to ${path.relative(REPO_ROOT, file)}`);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(HERE, 'build-p4.ts');
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  }
}
