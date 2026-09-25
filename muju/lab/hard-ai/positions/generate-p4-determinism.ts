/**
 * Generator for `lab/hard-ai/positions/p4-determinism.jsonl` (Strategos W1.11,
 * `~/.claude/plans/can-you-respond-to-piped-book.md` Part B.2).
 *
 * Run with: `node --import tsx lab/hard-ai/positions/generate-p4-determinism.ts`.
 * `buildP4DeterminismCorpus()` is exported so `tests/lab/determinism-phasing.test.ts`
 * can re-run this recipe in-process and hold the committed file to it.
 *
 * WHAT A ROW IS. Every row is a FRESH ACT ROOT: the state right after an
 * `END_PLACE_PHASE` hand-off, so the side to move has all `actionsPerTurn`
 * actions, no unit has acted and `progressThisTurn` is false. That is the
 * position `searchTurn` is handed at the start of every engine turn, and the
 * root the Strategos clock reading (ledger, killETA, verdict, posture) and its
 * ply-0 plan injection are designed around. A mid-turn re-search root is a
 * real engine input too (`bots/hard.ts` re-searches a stale plan), but it is
 * not what this corpus is for: a corpus that mixed the two without saying so
 * would let a later step read "clock 3, contact" off a row whose mover had one
 * action left.
 *
 * REPRODUCIBILITY. Every choice this script makes is a fixed constant (never
 * `Date.now`/`Math.random` here), so a re-run picks the same 24 openings, the
 * same buckets, the same seeds, and lands on the same Act root per slot. The
 * BYTES are not identical run to run: `src/game/board.ts#createUnit` mints
 * every unit id from `Date.now()`/`Math.random()` (documented in
 * `lab/hard-ai/exam/format.ts`'s module doc), and those ids are woven through
 * the stored `GameState` (`unit.id`, `lastIncome.takes[].unitId`, …). That is
 * process-global game code this step may not edit. What IS pinned: the test
 * regenerates the corpus and requires it to equal the committed file once each
 * id is replaced by its order of first appearance (so which unit a reference
 * points at is still compared; only the minted spelling is not). This is also
 * why the output is committed as a fixture rather than regenerated on demand,
 * as `positions/openings.jsonl` and `positions/authored.jsonl` are.
 *
 * RECIPE (so the file can be regenerated from this comment alone):
 *
 * 1. Read `lab/hard-ai/ladder/openings/p1-dev.jsonl` (48 rows) with
 *    `loadOpenings`, and take every 2nd row by file order — indices
 *    0, 2, 4, …, 46 — giving 24 openings, spread across the whole file rather
 *    than clustered at the front.
 * 2. Replay each with `applyLadderOpening` (muju-phasing-4, handicap 0,
 *    shipped upkeep, double-thick element graph — the same defaults
 *    `DEFAULT_RULES`/`DEFAULT_MATCH_OPTIONS` name). That is a Phasing Act root
 *    a few plies deep, `inactivityPlies` 0 or 1 (P1's own invariant,
 *    documented in `ladder/openings/phasing.ts`).
 * 3. Each of the 24 slots gets a BUCKET (by position in the selected list):
 *      - slots 0-5   ("root"):    the opening root itself, no continuation.
 *      - slots 6-11  ("mid"):     continue play (`Random` on both seats), stop
 *                                 at the first Act root whose `inactivityPlies`
 *                                 equals the slot's target from [2,3,2,3,2,3].
 *      - slots 12-17 ("high"):    same, target from [5,6,7,5,6,7] — "several
 *                                 with inactivity clock >= 5".
 *      - slots 18-19 ("edge"):    same, target [8,9] — "a couple at 8-9".
 *      - slots 20-23 ("contact"): continue play, stop at the first Act root
 *                                 whose `inactivityPlies` equals the slot's
 *                                 target AND whose side to move has a legal
 *                                 ATTACK (`lab/harness/legal.ts#legalActions`)
 *                                 — "units in contact". Targets and bots are
 *                                 [6 Rush, 2 Rush, 9 Random, 8 Random]: early,
 *                                 middle and late on the clock, including its
 *                                 last kill-free turn.
 *    "Continue play" runs `lab/harness/runner.ts#playGame` from the opening
 *    root with two seeded scripted bots of one kind, the harness's own
 *    deterministic legal-play driver — no game logic is reimplemented here.
 *    `Random` (`lab/harness/bots/random.ts`) keeps the armies apart, so the
 *    kill clock climbs cleanly through every value and the armies meet only as
 *    it runs out — late-clock contact, where Hold vs ForceContact is decided.
 *    `Rush` (mass `fire_1`, floods forward and attacks on sight,
 *    `lab/harness/bots/archetypes.ts`) is what brings units together while the
 *    clock is still low. Only Act roots of a game still in progress
 *    (`phase === 'playing'`) and no later than turn `MAX_TURNS` are
 *    candidates: uncapped, slot 20's first Rush contact at clock 7 came at turn
 *    67 with one unit a side, which is not a position anyone plays.
 * 4. SEED: `4004000 + selectedIndex` for a slot's first attempt; on a miss the
 *    seed is bumped by `97 * attempt` up to `MAX_ATTEMPTS` tries. A slot that
 *    exhausts every attempt makes the generator fail loudly rather than ship
 *    fewer than the 24 documented positions.
 * 5. TAGS are computed, never asserted: `bucket:<b>`, `clock:<inactivityPlies>`,
 *    and `contact` on EVERY row (whatever its bucket) whose side to move has a
 *    legal ATTACK at the root — so `contact` means exactly that, and the test
 *    re-derives it from legality against the committed bytes.
 * 6. Every produced state is re-checked with the harness's own
 *    `checkInvariants` before it is written (`playGame` already checks after
 *    every action with `checkInvariants: true`).
 *
 * Ids are `p4-det-000` .. `p4-det-023` in slot order. `rules` is
 * `DEFAULT_RULES` verbatim (the only rules this script ever installs).
 */
import path from 'node:path';
import type { GameState } from '../../../src/game/types';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { setCombatHandicap, resetCombatHandicap } from '../../../src/game/combat';
import { loadOpenings, type OpeningSpec } from '../ladder/openings';
import { applyLadderOpening } from '../ladder/ruleset';
import { playGame } from '../../harness/runner';
import { createRandomBot } from '../../harness/bots/random';
import { createRushBot } from '../../harness/bots/archetypes';
import type { Bot } from '../../harness/types';
import { checkInvariants } from '../../harness/invariants';
import { legalActions } from '../../harness/legal';
import { writePositions, DEFAULT_RULES, type RulesBlock, type StoredPosition } from './corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const P1_DEV_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/ladder/openings/p1-dev.jsonl');
export const P4_DETERMINISM_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/positions/p4-determinism.jsonl');
const SELF = path.resolve(import.meta.dirname, 'generate-p4-determinism.ts');

/** CHOICE (arbitrary, fixed so a regeneration draws the same games; falsifier:
 * none needed — any constant works, a new one only draws different games). */
const SEED_BASE = 4004000;
/** CHOICE (a fixed stride decorrelates retry attempts without a second RNG;
 * falsifier: none needed, same as `SEED_BASE`). */
const SEED_STRIDE = 97;
/** CHOICE (the costliest slot today needs 19 attempts of a ~5 ms Random game;
 * falsifier: a harness or rules change that makes some slot exhaust it — the
 * generator then throws). */
const MAX_ATTEMPTS = 60;
/** CHOICE (keeps every row in the opening or middlegame of a game someone
 * would play: every hit today comes by turn 7, and the cap exists for Rush
 * games, which otherwise run on into degenerate late stalemates — slot 20
 * uncapped took a clock-7 contact at turn 67 with one unit a side; falsifier:
 * a slot whose only matches lie past it throws on `MAX_ATTEMPTS`). */
const MAX_TURNS = 12;
/** CHOICE (the harness's emergency per-decision cap, far above what 12 turns
 * can spend; falsifier: a `ply-cap` anomaly in a generation game). */
const MAX_PLIES = 20000;

/** DERIVED (plan B.2 W1.11: "about 24 positions … several with inactivity
 * clock >= 5 and a couple at 8-9, and a few with units in contact"): 6 roots,
 * 6 mid, 6 high, 2 edge, 4 contact. The target values inside each bucket are
 * CHOICE (spread over the bucket's range; for "contact", an early, a middle
 * and two late clocks, each paired with the bot whose games reach it from that
 * slot's opening within a few seeds; falsifier: a target no seed reaches
 * throws on `MAX_ATTEMPTS`). */
const ROOT_COUNT = 6;
const MID_TARGETS = [2, 3, 2, 3, 2, 3];
const HIGH_TARGETS = [5, 6, 7, 5, 6, 7];
const EDGE_TARGETS = [8, 9];
const CONTACT_TARGETS: ReadonlyArray<{ target: number; bot: 'Rush' | 'Random' }> = [
  { target: 6, bot: 'Rush' },
  { target: 2, bot: 'Rush' },
  { target: 9, bot: 'Random' },
  { target: 8, bot: 'Random' },
];
export const P4_DETERMINISM_SIZE =
  ROOT_COUNT + MID_TARGETS.length + HIGH_TARGETS.length + EDGE_TARGETS.length + CONTACT_TARGETS.length;

type Bucket = 'root' | 'mid' | 'high' | 'edge' | 'contact';

interface Slot {
  /** Index into the selected (every-2nd) opening list; also the seed offset. */
  index: number;
  bucket: Bucket;
  /** Target `inactivityPlies` for every continued bucket. */
  target?: number;
  /** Which scripted bot plays both seats of a continued bucket. */
  bot?: 'Rush' | 'Random';
}

function buildSlots(): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < ROOT_COUNT; i++) slots.push({ index: i, bucket: 'root' });
  const push = (bucket: Bucket, targets: readonly number[]): void => {
    for (const target of targets) slots.push({ index: slots.length, bucket, target, bot: 'Random' });
  };
  push('mid', MID_TARGETS);
  push('high', HIGH_TARGETS);
  push('edge', EDGE_TARGETS);
  for (const { target, bot } of CONTACT_TARGETS) slots.push({ index: slots.length, bucket: 'contact', target, bot });
  return slots;
}

function selectOpenings(all: readonly OpeningSpec[]): OpeningSpec[] {
  const selected: OpeningSpec[] = [];
  for (let i = 0; i < all.length; i += 2) selected.push(all[i]);
  return selected;
}

/** Does the side to move have a legal ATTACK at this root? Installs the row's
 * process-global rules for the check and restores the defaults after (the
 * harness's own pattern, `runner.ts#playGame`). The test re-derives this from
 * `legalActions` itself rather than importing it, so a wrong tag here cannot
 * vouch for itself. */
function hasLegalAttack(state: GameState, rules: RulesBlock): boolean {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
  try {
    return legalActions(state, state.turn.currentPlayer).some(a => a.type === 'ATTACK');
  } finally {
    setUpkeepVariant('shipped');
    setElementGraph('double-thick');
    resetCombatHandicap();
  }
}

interface RootSnapshot {
  state: GameState;
  inactivityPlies: number;
  contact: boolean;
}

/** One continuation game from `root`, recording every in-progress Act root in
 * ply order (the state right after an `END_PLACE_PHASE`). `contact` is read
 * inside `onAction`, where `playGame` has this game's rules installed. */
async function traceFrom(root: GameState, seed: number, botFactory: () => Bot): Promise<RootSnapshot[]> {
  const roots: RootSnapshot[] = [];
  await playGame({
    bots: { white: botFactory(), black: botFactory() },
    seed,
    engineHash: 'p4-determinism-generator',
    runId: `p4-determinism-seed-${seed}`,
    initialState: root,
    options: {
      victoryRule: DEFAULT_RULES.victoryRule,
      inactivityRule: DEFAULT_RULES.inactivityRule,
      upkeep: DEFAULT_RULES.upkeep,
      elementGraph: DEFAULT_RULES.elementGraph,
      handicap: { ...DEFAULT_RULES.combatHandicap },
      checkInvariants: true,
      recordReplay: false,
      maxTurns: MAX_TURNS,
      maxPlies: MAX_PLIES,
    },
    onAction: (_before, after, action) => {
      if (action.type !== 'END_PLACE_PHASE' || after.phase !== 'playing') return;
      const contact = legalActions(after, after.turn.currentPlayer).some(a => a.type === 'ATTACK');
      roots.push({ state: after, inactivityPlies: after.inactivityPlies ?? 0, contact });
    },
  });
  return roots;
}

async function resolveSlot(opening: OpeningSpec, slot: Slot): Promise<{ state: GameState; note: string }> {
  const root = applyLadderOpening(opening);
  if (slot.bucket === 'root') {
    return { state: root, note: `opening root, no continuation (inactivityPlies=${root.inactivityPlies ?? 0})` };
  }
  const contactBucket = slot.bucket === 'contact';
  const botFactory: () => Bot = slot.bot === 'Rush' ? () => createRushBot() : createRandomBot;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seed = SEED_BASE + slot.index + SEED_STRIDE * attempt;
    const roots = await traceFrom(root, seed, botFactory);
    const hit = roots.find(r => r.inactivityPlies === slot.target && (!contactBucket || r.contact));
    if (hit) {
      const what = contactBucket ? 'first Act root with a legal ATTACK at' : 'first Act root at';
      return { state: hit.state, note: `${slot.bot} seed ${seed}, attempt ${attempt}: ${what} inactivityPlies=${slot.target}` };
    }
  }
  throw new Error(
    `generate-p4-determinism: opening "${opening.id}" (slot ${slot.index}, bucket ${slot.bucket}, target ${slot.target}) ` +
      `found no matching Act root in ${MAX_ATTEMPTS} attempts`,
  );
}

/** The whole recipe, in memory. `log` receives one line per slot. */
export async function buildP4DeterminismCorpus(log: (line: string) => void = () => {}): Promise<StoredPosition[]> {
  const selected = selectOpenings(loadOpenings(P1_DEV_PATH).openings);
  const slots = buildSlots();
  if (slots.length !== P4_DETERMINISM_SIZE) {
    throw new Error(`generate-p4-determinism: expected ${P4_DETERMINISM_SIZE} slots, built ${slots.length}`);
  }

  const out: StoredPosition[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const opening = selected[slot.index];
    if (!opening) throw new Error(`generate-p4-determinism: slot ${slot.index} has no selected opening (only ${selected.length} selected)`);
    const { state, note } = await resolveSlot(opening, slot);
    if (state.ruleset !== 'phasing') throw new Error(`generate-p4-determinism: ${opening.id} produced a non-Phasing state`);
    checkInvariants(state, `generate-p4-determinism: ${opening.id} slot ${i}`);
    const rules: RulesBlock = { ...DEFAULT_RULES, combatHandicap: { ...DEFAULT_RULES.combatHandicap } };
    const clock = state.inactivityPlies ?? 0;
    const contact = hasLegalAttack(state, rules);
    if (slot.bucket === 'contact' && !contact) throw new Error(`generate-p4-determinism: contact slot ${i} has no legal ATTACK`);
    const tags = ['phasing', 'determinism-corpus', `bucket:${slot.bucket}`, `clock:${clock}`];
    if (contact) tags.push('contact');
    out.push({
      schema: 'muju-position-v1',
      id: `p4-det-${String(i).padStart(3, '0')}`,
      tags,
      rationale:
        `Strategos W1.11 determinism corpus, slot ${i}/${slots.length} (bucket ${slot.bucket}). ` +
        `From p1-dev opening "${opening.id}" (selected index ${slot.index} of every-2nd-of-48). ${note}. ` +
        `inactivityPlies=${clock}${contact ? ', side to move has a legal ATTACK' : ''}.`,
      rules,
      state,
    });
    log(`slot ${i} (${slot.bucket}): ${opening.id} -> inactivityPlies=${clock}${contact ? ' contact' : ''} (${note})`);
  }
  return out;
}

async function main(): Promise<void> {
  const out = await buildP4DeterminismCorpus(line => console.log(line));
  writePositions(P4_DETERMINISM_PATH, out);
  console.log(`generate-p4-determinism: wrote ${out.length} positions to ${P4_DETERMINISM_PATH}`);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === SELF;
if (invokedDirectly) {
  main().catch(err => {
    console.error(`generate-p4-determinism: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  });
}
