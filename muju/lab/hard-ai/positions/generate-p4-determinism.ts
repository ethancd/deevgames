/**
 * Generator for `lab/hard-ai/positions/p4-determinism.jsonl` (Strategos W1.11,
 * `~/.claude/plans/can-you-respond-to-piped-book.md` Part B.2).
 *
 * Run with: `node --import tsx lab/hard-ai/positions/generate-p4-determinism.ts`.
 * Every choice this script itself makes is a fixed constant (never
 * `Date.now`/`Math.random` here), so a re-run always picks the same 24
 * openings, the same buckets, the same seeds, and lands on the same
 * `inactivityPlies` value (or the same pre-ATTACK ply) per slot. The bytes
 * are NOT byte-identical run to run, though: `src/game/board.ts#createUnit`
 * mints every unit id from `Date.now()`/`Math.random()` (documented in
 * `lab/hard-ai/exam/format.ts`'s module doc), and those ids are woven through
 * the stored `GameState` (`unit.id`, `lastIncome.takes[].unitId`, …) — a
 * process-global fact this script does not touch and could not fix without
 * editing `src/game`, which is out of bounds for this step. Verified: two
 * runs' output is structurally identical once every `id`/`unitId` string is
 * erased. This is why the output is committed as a fixture rather than
 * regenerated on demand — exactly the reason `positions/openings.jsonl` and
 * `positions/authored.jsonl` are fixtures and not build products.
 *
 * RECIPE (so the file can be regenerated from this comment alone):
 *
 * 1. Read `lab/hard-ai/ladder/openings/p1-dev.jsonl` (48 rows) with
 *    `loadOpenings`, and take every 2nd row by file order — indices
 *    0, 2, 4, …, 46 — giving 24 openings, spread across the whole file rather
 *    than clustered at the front.
 * 2. Replay each with `applyLadderOpening` (muju-phasing-4, handicap 0,
 *    shipped upkeep, double-thick element graph — the same defaults
 *    `DEFAULT_RULES`/`DEFAULT_MATCH_OPTIONS` name). That is a Phasing "Act
 *    root" a few plies deep, `inactivityPlies` 0 or 1 (P1's own invariant,
 *    documented in `ladder/openings/phasing.ts`).
 * 3. Each of the 24 slots gets a BUCKET (by position in the selected list):
 *      - slots 0-5   ("root"):    the opening root itself, no continuation.
 *      - slots 6-11  ("mid"):     continue play, stop at the first Act root
 *                                 whose `inactivityPlies` equals the slot's
 *                                 target from [2,3,2,3,2,3].
 *      - slots 12-17 ("high"):    same, target from [5,6,7,5,6,7] — "several
 *                                 with inactivity clock >= 5".
 *      - slots 18-19 ("edge"):    same, target [8,9] — "a couple at 8-9".
 *      - slots 20-23 ("contact"): continue play, stop at the position just
 *                                 BEFORE the first ATTACK either bot chooses
 *                                 (units adjacent and able to strike, attack
 *                                 not yet resolved) — "units in contact".
 *    "Continue play" runs `lab/harness/runner.ts#playGame` from the opening
 *    root with two seeded scripted bots, which is the harness's own
 *    deterministic legal-play driver — no game logic is reimplemented here.
 *    "mid"/"high"/"edge" use `Random` (`lab/harness/bots/random.ts`): armies
 *    stay apart under uniform-random movement, so the inactivity clock climbs
 *    cleanly through every value. "contact" uses `Rush` (mass `fire_1`, floods
 *    forward and attacks on sight, `lab/harness/bots/archetypes.ts`) on both
 *    seats instead — under `Random` no attempt reached adjacency before the
 *    kill clock's own 10-ply inactivity draw ended the game first, which is
 *    itself evidence the "mid"/"high" positions are realistic quiet play.
 *    `onAction` records every Act-root snapshot (the state right after an
 *    `END_PLACE_PHASE`, i.e. the next player's fresh turn) and every
 *    pre-ATTACK snapshot.
 * 4. SEED: `4004000 + selectedIndex` for a slot's first attempt (documented
 *    CHOICE, arbitrary but fixed); on a miss (the target `inactivityPlies`
 *    value, or a contact ply, never appears before the game ends) the seed is
 *    bumped by `+ 97 * attempt` (a fixed stride, decorrelates without a second
 *    RNG) up to `MAX_ATTEMPTS` tries. A slot that exhausts every attempt makes
 *    the generator fail loudly (falsifier: this file would otherwise ship
 *    fewer than the 24 documented positions).
 * 5. Every produced state is re-checked with the harness's own
 *    `checkInvariants` before it is written (belt-and-braces: `playGame`
 *    already checks after every action when `checkInvariants: true`, which is
 *    this script's default).
 *
 * Ids are `p4-det-000` .. `p4-det-023` in slot order. `rules` is
 * `DEFAULT_RULES` verbatim (the only rules this script ever installs).
 */
import path from 'node:path';
import type { GameState } from '../../../src/game/types';
import { loadOpenings, type OpeningSpec } from '../ladder/openings';
import { applyLadderOpening } from '../ladder/ruleset';
import { playGame } from '../../harness/runner';
import { createRandomBot } from '../../harness/bots/random';
import { createRushBot } from '../../harness/bots/archetypes';
import type { Bot } from '../../harness/types';
import { checkInvariants } from '../../harness/invariants';
import { writePositions, DEFAULT_RULES, type StoredPosition } from './corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const P1_DEV_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/ladder/openings/p1-dev.jsonl');
const OUT_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/positions/p4-determinism.jsonl');

const SEED_BASE = 4004000; // CHOICE: arbitrary, fixed so a regeneration picks the same buckets/targets.
const SEED_STRIDE = 97; // CHOICE: decorrelates retry attempts without a second RNG.
const MAX_ATTEMPTS = 60;

type Bucket = 'root' | 'mid' | 'high' | 'edge' | 'contact';

interface Slot {
  index: number; // index into the selected (every-2nd) opening list
  bucket: Bucket;
  target?: number; // target inactivityPlies for 'mid'/'high'/'edge'
}

function buildSlots(): Slot[] {
  const slots: Slot[] = [];
  const midTargets = [2, 3, 2, 3, 2, 3];
  const highTargets = [5, 6, 7, 5, 6, 7];
  const edgeTargets = [8, 9];
  for (let i = 0; i < 6; i++) slots.push({ index: i, bucket: 'root' });
  for (let i = 0; i < 6; i++) slots.push({ index: 6 + i, bucket: 'mid', target: midTargets[i] });
  for (let i = 0; i < 6; i++) slots.push({ index: 12 + i, bucket: 'high', target: highTargets[i] });
  for (let i = 0; i < 2; i++) slots.push({ index: 18 + i, bucket: 'edge', target: edgeTargets[i] });
  for (let i = 0; i < 4; i++) slots.push({ index: 20 + i, bucket: 'contact' });
  return slots;
}

function selectOpenings(all: readonly OpeningSpec[]): OpeningSpec[] {
  const selected: OpeningSpec[] = [];
  for (let i = 0; i < all.length; i += 2) selected.push(all[i]);
  return selected;
}

interface RootSnapshot {
  state: GameState;
  inactivityPlies: number;
}

interface TraceResult {
  roots: RootSnapshot[];
  contact: GameState | null;
}

/** One continuation game from `root`, recording every Act-root snapshot and
 * the first pre-ATTACK snapshot, in ply order. */
async function traceFrom(root: GameState, seed: number, botFactory: () => Bot): Promise<TraceResult> {
  const roots: RootSnapshot[] = [];
  let contact: GameState | null = null;
  await playGame({
    bots: { white: botFactory(), black: botFactory() },
    seed,
    engineHash: 'p4-determinism-generator',
    runId: `p4-determinism-seed-${seed}`,
    initialState: root,
    options: {
      victoryRule: 'home-or-elimination',
      inactivityRule: 'on',
      upkeep: 'shipped',
      elementGraph: 'double-thick',
      handicap: { white: 0, black: 0 },
      checkInvariants: true,
      recordReplay: false,
      maxTurns: 200,
      maxPlies: 20000,
    },
    onAction: (before, after, action) => {
      if (contact === null && action.type === 'ATTACK') contact = before;
      if (action.type === 'END_PLACE_PHASE') roots.push({ state: after, inactivityPlies: after.inactivityPlies ?? 0 });
    },
  });
  return { roots, contact };
}

async function resolveSlot(opening: OpeningSpec, slot: Slot): Promise<{ state: GameState; note: string }> {
  const root = applyLadderOpening(opening);
  if (slot.bucket === 'root') {
    return { state: root, note: `opening root, no continuation (inactivityPlies=${root.inactivityPlies ?? 0})` };
  }
  const botFactory = slot.bucket === 'contact' ? createRushBot : createRandomBot;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seed = SEED_BASE + slot.index + SEED_STRIDE * attempt;
    const { roots, contact } = await traceFrom(root, seed, botFactory);
    if (slot.bucket === 'contact') {
      if (contact) return { state: contact, note: `seed ${seed}, attempt ${attempt}: pre-ATTACK snapshot` };
      continue;
    }
    const hit = roots.find(r => r.inactivityPlies === slot.target);
    if (hit) return { state: hit.state, note: `seed ${seed}, attempt ${attempt}: inactivityPlies=${slot.target}` };
  }
  throw new Error(
    `generate-p4-determinism: opening "${opening.id}" (slot ${slot.index}, bucket ${slot.bucket}` +
      `${slot.target !== undefined ? `, target ${slot.target}` : ''}) found no matching snapshot in ${MAX_ATTEMPTS} attempts`,
  );
}

async function main(): Promise<void> {
  const all = loadOpenings(P1_DEV_PATH).openings;
  const selected = selectOpenings(all);
  const slots = buildSlots();
  if (slots.length !== 24) throw new Error(`generate-p4-determinism: expected 24 slots, built ${slots.length}`);

  const out: StoredPosition[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const opening = selected[slot.index];
    if (!opening) throw new Error(`generate-p4-determinism: slot ${slot.index} has no selected opening (only ${selected.length} selected)`);
    const { state, note } = await resolveSlot(opening, slot);
    if (state.ruleset !== 'phasing') throw new Error(`generate-p4-determinism: ${opening.id} produced a non-Phasing state`);
    checkInvariants(state, `generate-p4-determinism: ${opening.id} slot ${i}`);
    const id = `p4-det-${String(i).padStart(3, '0')}`;
    const tags = ['phasing', 'determinism-corpus', `bucket:${slot.bucket}`, `clock:${state.inactivityPlies ?? 0}`];
    if (slot.bucket === 'contact') tags.push('contact');
    out.push({
      schema: 'muju-position-v1',
      id,
      tags,
      rationale:
        `Strategos W1.11 determinism corpus, slot ${i}/${slots.length} (bucket ${slot.bucket}). ` +
        `From p1-dev opening "${opening.id}" (selected index ${slot.index} of every-2nd-of-48). ${note}. ` +
        `inactivityPlies=${state.inactivityPlies ?? 0}.`,
      rules: { ...DEFAULT_RULES, combatHandicap: { ...DEFAULT_RULES.combatHandicap } },
      state,
    });
    console.log(`slot ${i} (${slot.bucket}): ${opening.id} -> inactivityPlies=${state.inactivityPlies ?? 0} (${note})`);
  }

  writePositions(OUT_PATH, out);
  console.log(`generate-p4-determinism: wrote ${out.length} positions to ${OUT_PATH}`);
}

main().catch(err => {
  console.error(`generate-p4-determinism: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
});
