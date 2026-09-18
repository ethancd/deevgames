/**
 * Builds the `home-mate` suite (DESIGN §7.5): the 28 `lab/ai/fixtures.ts`
 * tactical fixtures, each framed twice — once as a RESCUE the defender must
 * find, once as a MATE the invader must (or must not) walk into.
 *
 * `node --import tsx lab/hard-ai/suites/build-home-mate.ts`
 *
 * Both framings come out of the same board, and both are scored the way
 * §7.5 scores every suite: on the END POSITION of the chosen turn, never on a
 * sequence. The two roots are
 *
 *   - `<id>-rescue`: the defender's reply position — upkeep pending, place
 *     phase, four actions, the invader sitting on the defender's corner. This
 *     is exactly the position `analyzeHomeDefense` adjudicates, and exactly
 *     the position `homeWitness`'s line replays from.
 *   - `<id>-mate`: the same board with the invader backed off onto an adjacent
 *     empty square and the move handed to the invader, so that stepping in is
 *     a choice rather than a fact.
 *
 * What the engine has to get right depends on what the canonical prover says
 * about the fixture, and the generator reads that answer rather than assuming
 * it:
 *
 *   - a fixture the defender CAN answer gives a rescue case whose `best` is
 *     every end position with the corner cleared, and a mate case whose
 *     `avoid` is every end position that steps into the refuted invasion;
 *   - a fixture the defender CANNOT answer gives a mate case whose `best` is
 *     every end position that wins on the spot by home checkmate, and a rescue
 *     case that is a `points: 0` coverage row — there is no correct defensive
 *     turn in a lost position, and a suite row that pretends otherwise would
 *     be scoring noise. See DEVIATIONS.md under M10.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PlayerId, Position } from '../../../src/game/types';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import { transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { analyzeHomeDefense } from '../../../src/game/homeCheckmate';
import { getAdjacentPositions } from '../../../src/game/board';
import { getUnitDefinition } from '../../../src/game/units';
import { getHomeOccupier } from '../../../src/game/victory';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { kposHex } from '../../../src/ai/hard/verify/perft';
import { DEFAULT_RULES, writePositions, type StoredPosition } from '../positions/corpus';
import { tacticalFixtures } from '../../ai/fixtures';

const HERE = path.resolve(import.meta.dirname);
const SUITE_PATH = path.join(HERE, 'home-mate.suite.json');
const POSITIONS_PATH = path.join(HERE, 'home-mate.positions.jsonl');
/** `muju-position-v1` file the suite's `position` references point into. */
const POSITIONS_REF = 'lab/hard-ai/suites/home-mate.positions.jsonl';

const MAX_CALLS = 400_000;

export interface SuiteCase {
  id: string;
  /** `"<file>#<id>"` (DESIGN §7.5). */
  position: string;
  best: string[];
  avoid: string[];
  budget: { work: number };
  points: number;
  tags: string[];
  rationale: string;
  authoredFrom: string;
}

export interface Suite {
  schema: 'muju-suite-v1';
  name: string;
  version: number;
  cases: SuiteCase[];
}

const replica = new Replica();
const packed = allocState();
const endPacked = allocState();

interface EndPosition {
  key: string;
  /** The invader still holds the defender's corner at the end of the turn. */
  occupied: boolean;
  /** The turn ended the game as a home checkmate for the invader. */
  homeCheckmate: boolean;
}

/**
 * Every end position of one macro-turn from `root`, keyed by `Kpos`
 * (`verify/perft.ts enumerateTurn`'s own definition of "end": the game ended,
 * or the side to move / turn number changed).
 */
function endPositions(root: GameState, invader: PlayerId): Map<string, EndPosition> {
  const out = new Map<string, EndPosition>();
  const rootPlayer = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;
  // Mid-turn states transpose heavily (perft: 14,959 sequences over 1,053
  // mid-states on the initial position), and only the END positions matter
  // here, so visiting each distinct `Kturn` once turns an intractable
  // sequence enumeration into a tractable state enumeration.
  const seen = new Set<string>();
  let calls = 0;

  const visit = (state: GameState): void => {
    if (++calls > MAX_CALLS) throw new Error(`build-home-mate: exceeded ${MAX_CALLS} DFS calls`);
    const p = replica.pack(state, packed);
    const turnKey = `${(p.kturnHi >>> 0).toString(16)}${(p.kturnLo >>> 0).toString(16)}`;
    if (seen.has(turnKey)) return;
    seen.add(turnKey);
    for (const action of generateAllActions(state, state.turn.currentPlayer)) {
      const next = applyAction(state, action);
      if (next === state) continue;
      const done = next.phase !== 'playing' || next.turn.currentPlayer !== rootPlayer || next.turn.turnNumber !== rootTurnNumber;
      if (!done) {
        visit(next);
        continue;
      }
      const key = kposHex(replica.pack(next, endPacked));
      if (out.has(key)) continue;
      out.set(key, {
        key,
        occupied: getHomeOccupier(next.board, invader) !== undefined,
        homeCheckmate: next.phase === 'victory' && next.victoryReason === 'home-checkmate' && next.winner === invader,
      });
    }
  };

  visit(root);
  return out;
}

function storedPosition(id: string, state: GameState, tags: string[], rationale: string): StoredPosition {
  return {
    schema: 'muju-position-v1',
    id,
    tags,
    rationale,
    depth: 4,
    rules: { ...DEFAULT_RULES, victoryRule: state.victoryRule ?? 'home-or-elimination', handicap: state.blackCrystalHandicap ?? 0 },
    state,
  };
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function invaderOf(state: GameState): PlayerId {
  if (getHomeOccupier(state.board, 'white')) return 'white';
  if (getHomeOccupier(state.board, 'black')) return 'black';
  throw new Error('build-home-mate: fixture has no home occupier');
}

/** The fixture as the defender's reply position: upkeep pending, place phase. */
function rescueRoot(state: GameState, invader: PlayerId): GameState {
  const defender: PlayerId = invader === 'white' ? 'black' : 'white';
  return { ...state, upkeepPending: true, turn: { ...state.turn, currentPlayer: defender, phase: 'place', actionsRemaining: 4 } };
}

/**
 * The nearest empty square from which the occupier could still walk onto the
 * corner inside one turn: a BFS from the corner over squares nobody else
 * stands on, which is the same connectivity `getMovementRange` walks. Returns
 * null when the corner is walled off — the two corner neighbours are the only
 * ways in, and a fixture may have a defender on both.
 */
function stagingSquare(state: GameState, corner: Position, occupierId: string, budget: number): Position | null {
  const blocked = new Set<number>();
  for (const u of state.board.units) if (u.id !== occupierId) blocked.add(u.position.y * 10 + u.position.x);
  const start = corner.y * 10 + corner.x;
  if (blocked.has(start)) return null;
  const dist = new Map<number, number>([[start, 0]]);
  const queue: number[] = [start];
  let best: { sq: number; d: number } | null = null;
  for (let head = 0; head < queue.length; head++) {
    const sq = queue[head];
    const d = dist.get(sq) as number;
    if (d > 0 && (best === null || d < best.d)) best = { sq, d };
    if (d >= budget) continue;
    for (const p of getAdjacentPositions({ x: sq % 10, y: (sq / 10) | 0 })) {
      const n = p.y * 10 + p.x;
      if (blocked.has(n) || dist.has(n)) continue;
      dist.set(n, d + 1);
      queue.push(n);
    }
  }
  return best === null ? null : { x: best.sq % 10, y: (best.sq / 10) | 0 };
}

/**
 * The fixture with the invasion NOT yet played: the occupier is backed off
 * onto the nearest square it can still reach the corner from, and the move is
 * the invader's — so stepping in is a choice rather than a fact.
 *
 * When the corner is walled off entirely (a defender on each of its two
 * neighbours) there is no such square. The fixture then keeps the occupation
 * as it stands and the case becomes the other half of the same judgement:
 * a standing occupation that survives to the invader's next `startTurn` wins
 * outright (turn.ts:23-27), so the invader must not walk off it.
 */
function mateRoot(state: GameState, invader: PlayerId): { state: GameState; framing: 'step-in' | 'hold' } {
  const occupier = getHomeOccupier(state.board, invader);
  if (!occupier) throw new Error('build-home-mate: fixture has no home occupier');
  const speed = getUnitDefinition(occupier.definitionId).speed;
  const staging = stagingSquare(state, occupier.position, occupier.id, speed * 4);
  const asInvader = (units: GameState['board']['units']): GameState => ({
    ...state,
    upkeepPending: false,
    board: { ...state.board, units },
    turn: { ...state.turn, currentPlayer: invader, phase: 'action', actionsRemaining: 4 },
  });
  if (staging === null) {
    return {
      state: asInvader(state.board.units.map(u => (u.id === occupier.id ? { ...u, canActThisTurn: true } : u))),
      framing: 'hold',
    };
  }
  return {
    state: asInvader(
      state.board.units.map(u => (u.id === occupier.id ? { ...u, position: staging, canActThisTurn: true, damageTaken: 0 } : u)),
    ),
    framing: 'step-in',
  };
}

function main(): void {
  const positions: StoredPosition[] = [];
  const cases: SuiteCase[] = [];

  for (const fixture of tacticalFixtures()) {
    const id = slug(fixture.name);
    const invader = invaderOf(fixture.state);
    const defender: PlayerId = invader === 'white' ? 'black' : 'white';
    const verdict = analyzeHomeDefense(fixture.state, invader, transitionWithoutCheckmate);

    // --- the rescue framing ---
    const rescue = rescueRoot(fixture.state, invader);
    const rescueEnds = endPositions(rescue, invader);
    const cleared = [...rescueEnds.values()].filter(e => !e.occupied).map(e => e.key).sort();
    positions.push(
      storedPosition(
        `${id}-rescue`,
        rescue,
        ['home', 'rescue', verdict],
        `${fixture.name}: ${defender}'s reply to the occupation of its corner; the canonical prover calls it "${verdict}".`,
      ),
    );
    cases.push(
      cleared.length > 0
        ? {
            id: `${id}-rescue`,
            position: `${POSITIONS_REF}#${id}-rescue`,
            best: cleared,
            avoid: [],
            budget: { work: 400_000 },
            points: 1,
            tags: ['home', 'rescue'],
            rationale: `The occupation is answerable (${verdict}); the turn must end with ${defender}'s corner clear.`,
            authoredFrom: `lab/ai/fixtures.ts: ${fixture.name}`,
          }
        : {
            id: `${id}-rescue`,
            position: `${POSITIONS_REF}#${id}-rescue`,
            best: [...rescueEnds.keys()].sort(),
            avoid: [],
            budget: { work: 400_000 },
            points: 0,
            tags: ['home', 'rescue', 'no-rescue'],
            rationale:
              `No turn clears the corner (the prover calls it "${verdict}"), so there is no correct defensive turn to score. ` +
              'Kept as a coverage row: the engine must still return a legal turn in a lost position.',
            authoredFrom: `lab/ai/fixtures.ts: ${fixture.name}`,
          },
    );

    // --- the mate framing ---
    const mate = mateRoot(fixture.state, invader);
    const mateEnds = endPositions(mate.state, invader);
    const mating = [...mateEnds.values()].filter(e => e.homeCheckmate).map(e => e.key).sort();
    const occupying = [...mateEnds.values()].filter(e => e.occupied || e.homeCheckmate).map(e => e.key).sort();
    const rest = [...mateEnds.keys()].filter(k => !occupying.includes(k)).sort();
    positions.push(
      storedPosition(
        `${id}-mate`,
        mate.state,
        ['home', 'mate', mate.framing, verdict],
        mate.framing === 'step-in'
          ? `${fixture.name}: ${invader} a step from ${defender}'s corner, with the invasion still a choice.`
          : `${fixture.name}: ${invader} already holds ${defender}'s corner and must not walk off it.`,
      ),
    );
    const mateCase = (best: string[], avoid: string[], tags: string[], rationale: string): SuiteCase => ({
      id: `${id}-mate`,
      position: `${POSITIONS_REF}#${id}-mate`,
      best,
      avoid,
      budget: { work: 400_000 },
      points: best.length > 0 ? 1 : 0,
      tags: ['home', 'mate', ...tags],
      rationale,
      authoredFrom: `lab/ai/fixtures.ts: ${fixture.name}`,
    });
    if (mating.length > 0) {
      cases.push(mateCase(mating, [], [mate.framing], `Holding ${defender}'s corner wins on the spot: no reply removes the occupier.`));
    } else if (mate.framing === 'hold') {
      cases.push(
        mateCase(
          occupying,
          rest,
          ['hold'],
          `The occupation is answerable, but walking off ${defender}'s corner surrenders it for nothing: an occupation that survives to ${invader}'s next startTurn wins (turn.ts:23-27).`,
        ),
      );
    } else {
      cases.push(
        mateCase(
          rest,
          occupying,
          ['refuted'],
          `${defender} answers the occupation, so stepping onto the corner throws the unit away for nothing.`,
        ),
      );
    }
  }

  const suite: Suite = { schema: 'muju-suite-v1', name: 'home-mate', version: 1, cases };
  fs.writeFileSync(SUITE_PATH, JSON.stringify(suite, null, 2) + '\n');
  writePositions(POSITIONS_PATH, positions);
  const empty = cases.filter(c => c.best.length === 0);
  console.log(
    JSON.stringify({
      cases: cases.length,
      positions: positions.length,
      scored: cases.filter(c => c.points > 0).length,
      coverage: cases.filter(c => c.points === 0).length,
      unsolvable: empty.length,
      suite: path.relative(path.resolve(HERE, '../../..'), SUITE_PATH),
    }),
  );
  if (empty.length > 0) {
    for (const c of empty) console.error(`[build-home-mate] case ${c.id} has an empty best set`);
    process.exitCode = 1;
  }
}

main();
