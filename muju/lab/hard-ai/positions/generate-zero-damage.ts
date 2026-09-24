/**
 * Generator for `lab/hard-ai/positions/zero-damage.jsonl` (Strategos W1.7,
 * `~/.claude/plans/can-you-respond-to-piped-book.md` Part B.2 step W1.7).
 *
 * Run with: `node --import tsx lab/hard-ai/positions/generate-zero-damage.ts`.
 *
 * WHAT THIS FIXTURE SET IS FOR. `lab/hard-ai/oracles/canonical-check.ts
 * --prune-zero-damage` needs authored positions where the side to move has an
 * adjacent ATTACK whose packed power is exactly 0 (`src/ai/hard/core/catalog.ts
 * power[...]`, the same table `core/state.ts Replica.makeAttack` reads), so the
 * end-position-SET check actually exercises the prune rather than vacuously
 * passing on positions with no zero-power pair at all.
 *
 * THREE ROWS, chosen from the catalogue (`src/game/units.ts`,
 * `src/game/elements.ts`'s `double-thick` graph — fire&lightning beat
 * plant&metal beat water&shadow beat fire&lightning, same-pair is neutral):
 *
 *   zd-neutral-plant-metal      plant_1 (Muju, attack 0) vs metal_1 (Poṉ):
 *                                same pair (plant-metal), neutral modifier;
 *                                power = max(0, 0 + 0) = 0 from the attacker's
 *                                base ATTACK STAT alone, no element math needed.
 *   zd-disadvantage-metal-fire  metal_1 (attack 1) vs fire_1 (Hi): metal is in
 *                                the plant-metal pair, which fire-lightning
 *                                beats, so metal is DISADVANTAGED (-1);
 *                                power = max(0, 1 - 1) = 0 — the other way a
 *                                packed power clamps to 0 (element modifier,
 *                                not a zero base stat).
 *   zd-paired-power1-plant-water same attacker as the first row (plant_1) but
 *                                the defender is water_1: plant-metal beats
 *                                water-shadow, so the attacker now has
 *                                ADVANTAGE (+1); power = max(0, 0 + 1) = 1.
 *                                Paired with `zd-neutral-plant-metal` by
 *                                changing exactly one fact (the defender's
 *                                element) so `tests/ai/hard/
 *                                zero-damage-prune.test.ts` can assert this
 *                                one is NOT pruned while the first one is.
 *
 * Every row also carries one more unit per side, away from the pair and from
 * both home corners, so the search has real MOVE/ATTACK combinations to
 * enumerate around the zero-power pair (a bare 1v1 would under-exercise C1
 * footprint independence and the within-turn TT the prune sits next to).
 * White is always the side to move, with the zero-power pair adjacent at
 * (4,4)/(4,5) — central, away from either corner, so no path this small
 * board can reach touches home-checkmate machinery.
 *
 * `ruleset: 'phasing'`, `actionsPerTurn: 4`, full `UNEQUAL_ROUTES_MAP`
 * resources (the shipped layout `createInitialGameState`'s default arg
 * already is) so mining/reserve math sees a realistic board, not an
 * artificial all-zero one. `rules` is `DEFAULT_RULES` verbatim — inert here,
 * since `canonical-check.ts` never installs it (it packs `state` as-is), but
 * every other fixture file in this directory carries it, and a reader relies
 * on it being present (`positions/corpus.ts parseLine` requires the field).
 */
import path from 'node:path';
import { createInitialGameState, createUnit, getUnitAt } from '../../../src/game/board';
import { calculateAttackPower } from '../../../src/game/combat';
import { checkInvariants } from '../../harness/invariants';
import { writePositions, DEFAULT_RULES, type StoredPosition } from './corpus';

const OUT_PATH = path.resolve(import.meta.dirname, 'zero-damage.jsonl');

interface Row {
  id: string;
  rationale: string;
  /** [attacker defId, defender defId] — White attacks Black at (4,5) from (4,4). */
  pair: [string, string];
  /** Reported power, purely descriptive — this row is a REGRESSION FIXTURE:
   * a catalogue change that moves it off 0 (or off 1, for the paired row)
   * would silently defeat what this row is for, so the generator verifies it
   * against the packed table itself rather than trusting this comment. */
  expectZeroPower: boolean;
  tags: string[];
}

const ROWS: readonly Row[] = [
  {
    id: 'zd-neutral-plant-metal',
    rationale:
      "White plant_1 (Muju, base attack 0) attacks Black metal_1 (Poṉ): same element pair (plant-metal), " +
      'neutral modifier, so packed power = max(0, 0 + 0) = 0 from the base stat alone — ' +
      'W1.7\'s prune must drop this ATTACK from the candidate set.',
    pair: ['plant_1', 'metal_1'],
    expectZeroPower: true,
    tags: ['phasing', 'zero-damage', 'w1.7'],
  },
  {
    id: 'zd-disadvantage-metal-fire',
    rationale:
      'White metal_1 (base attack 1) attacks Black fire_1 (Hi): metal is in the plant-metal pair, which the ' +
      'fire-lightning pair beats, so the attacker is elementally DISADVANTAGED (-1); packed power = ' +
      'max(0, 1 - 1) = 0 — the OTHER way a packed power clamps to 0 (an element modifier, not a zero base ' +
      "stat), so the fixture set does not depend on plant_1's attack alone.",
    pair: ['metal_1', 'fire_1'],
    expectZeroPower: true,
    tags: ['phasing', 'zero-damage', 'w1.7'],
  },
  {
    id: 'zd-paired-power1-plant-water',
    rationale:
      "Paired with zd-neutral-plant-metal by ONE changed fact: same attacker (White plant_1), but the " +
      'defender is water_1 instead of metal_1. Plant-metal beats water-shadow, so the attacker now has ' +
      'ADVANTAGE (+1); packed power = max(0, 0 + 1) = 1 — nonzero, so W1.7\'s prune must NOT drop this ATTACK ' +
      '(the condition is power === 0, never power < effectiveDef: this is chip damage, not a kill, and it ' +
      'still changes Kpos).',
    pair: ['plant_1', 'water_1'],
    expectZeroPower: false,
    tags: ['phasing', 'zero-damage', 'w1.7', 'paired'],
  },
];

/** The zero-power pair sits at these two central, off-corner squares; the
 * extra unit per side sits near that side's OWN corner (harmless — only an
 * ENEMY corner triggers home-checkmate machinery), well clear of the pair. */
const ATTACKER_SQ = { x: 4, y: 4 };
const DEFENDER_SQ = { x: 4, y: 5 };
const WHITE_EXTRA_SQ = { x: 1, y: 1 };
const BLACK_EXTRA_SQ = { x: 8, y: 8 };
const WHITE_EXTRA_DEF = 'water_1';
const BLACK_EXTRA_DEF = 'shadow_1';

/** `createUnit` names a unit from `Date.now()` and `Math.random()`, so the
 * file would change on every regeneration; a fixture is rewritten with ids
 * fixed by owner, definition and square instead, so rerunning this script
 * reproduces `zero-damage.jsonl` byte for byte. */
function fixedUnit(def: string, owner: 'white' | 'black', at: { x: number; y: number }) {
  return { ...createUnit(def, owner, at), id: `${owner}-${def}-${at.x}${at.y}` };
}

function buildRow(row: Row): StoredPosition {
  const base = createInitialGameState(undefined, 4, 0, 'phasing');
  let board = { ...base.board, units: [] as typeof base.board.units };
  board = { ...board, units: [...board.units, fixedUnit(row.pair[0], 'white', ATTACKER_SQ)] };
  board = { ...board, units: [...board.units, fixedUnit(row.pair[1], 'black', DEFENDER_SQ)] };
  board = { ...board, units: [...board.units, fixedUnit(WHITE_EXTRA_DEF, 'white', WHITE_EXTRA_SQ)] };
  board = { ...board, units: [...board.units, fixedUnit(BLACK_EXTRA_DEF, 'black', BLACK_EXTRA_SQ)] };

  const state = {
    ...base,
    board,
    turn: { currentPlayer: 'white' as const, phase: 'action' as const, actionsRemaining: 4, turnNumber: 1 },
  };
  checkInvariants(state, `generate-zero-damage: ${row.id}`);

  const attacker = getUnitAt(state.board, ATTACKER_SQ);
  const defender = getUnitAt(state.board, DEFENDER_SQ);
  if (attacker === null || defender === null) throw new Error(`generate-zero-damage: ${row.id} lost its own units`);

  // Ground-truth check against `src/game/combat.ts calculateAttackPower`
  // itself — the function `core/catalog.ts`'s packed `power` table is BUILT
  // FROM (its own module doc), so a catalogue or element-graph change that
  // moved this row off the power this generator was written for fails LOUDLY
  // here rather than silently shipping a fixture that no longer exercises
  // what its id and rationale claim.
  const power = calculateAttackPower(attacker, defender);
  const isZero = power === 0;
  if (isZero !== row.expectZeroPower) {
    throw new Error(
      `generate-zero-damage: ${row.id} expected ${row.expectZeroPower ? 'zero' : 'nonzero'} power, ` +
        `calculateAttackPower(${row.pair[0]} -> ${row.pair[1]}) = ${power}`,
    );
  }

  const rules = { ...DEFAULT_RULES, combatHandicap: { ...DEFAULT_RULES.combatHandicap } };
  return {
    schema: 'muju-position-v1',
    id: row.id,
    tags: row.tags,
    rationale: row.rationale,
    depth: 4,
    rules,
    state,
  };
}

function main(): void {
  const out = ROWS.map(buildRow);
  writePositions(OUT_PATH, out);
  console.log(`generate-zero-damage: wrote ${out.length} positions to ${OUT_PATH}`);
}

main();
