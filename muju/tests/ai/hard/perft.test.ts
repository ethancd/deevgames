// @vitest-environment node
/**
 * Phasing macro-turn perft (DESIGN §7.2) and position-corpus sanity checks
 * (§7.5). The frozen numbers themselves are re-verified end-to-end by
 * `npm run hard:perft -- --check` (canonical) and
 * `npm run hard:perft -- --check --engine replica` (the replica-parity
 * differential); this file pins the seed values at the unit-test level, proves
 * the premise the Prepare-phase canonicalisation rests on, and exercises
 * `corpus.ts` (`readPositions`/`mirror180`).
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createInitialGameState } from '../../../src/game/board';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { getHomeOccupier } from '../../../src/game/victory';
import type { AIAction } from '../../../src/ai/types';
import type { GameState } from '../../../src/game/types';
import {
  ACT_CAP,
  DEFAULT_LIMITS,
  DEFAULT_MAX_ACTIONS,
  DEFAULT_PREPARE_CAP,
  enumerateTurn,
  maxDepthOf,
  pendKeyCanonical,
  perftActions,
  perftMidStates,
  perftReplica,
  perftTurns,
  type PerftLimits,
} from '../../../src/ai/hard/verify/perft';
import {
  PHASING_FIXTURES,
  buildFixture,
  pendingsOf,
  positionCanonicalString,
  type BuiltFixture,
} from '../../../lab/hard-ai/perft/phasing-fixtures';
import { readPositions, mirror180, type StoredPosition } from '../../../lab/hard-ai/positions/corpus';

// E0.5 timeout budget: the whole Phasing fixture set is ~3.5 s canonical
// (2026-09-18 survey, M2 Max); 60 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 60_000 });

const POSITIONS_DIR = path.resolve(__dirname, '../../../lab/hard-ai/positions');
const AUTHORED_PATH = path.join(POSITIONS_DIR, 'authored.jsonl');
const OPENINGS_PATH = path.join(POSITIONS_DIR, 'openings.jsonl');
const FIXTURES_JSON = path.resolve(__dirname, '../../../lab/hard-ai/perft/fixtures.json');

const PHASING_INITIAL_LIMITS: PerftLimits = { act: 4, prepare: 0 };

function phasingInitial(): GameState {
  return createInitialGameState(undefined, 4, 0, 'phasing');
}

interface FixturesFile {
  schema: string;
  ruleset: string;
  replicaAgreed: boolean;
  standardInitial: { maxActions: number; actions: number; midStates: number; turns: number };
  initial: { limits: PerftLimits; actions: number; midStates: number; turns: number };
  fixtures: Array<{ id: string; digest: string; limits: PerftLimits; actions: number; midStates: number; endPositions: number }>;
}

const frozen = JSON.parse(fs.readFileSync(FIXTURES_JSON, 'utf8')) as FixturesFile;

describe('per-phase perft limits (the Phasing turn shape)', () => {
  it('re-derives the DFS depth from the Act → END_ACTION → [PAY_UPKEEP] → Prepare → END_PLACE shape', () => {
    // Four Act actions, one END_ACTION_PHASE, at most one PAY_UPKEEP, the
    // Prepare commitments, one END_PLACE_PHASE.
    expect(ACT_CAP).toBe(4);
    expect(DEFAULT_LIMITS).toEqual({ act: ACT_CAP, prepare: DEFAULT_PREPARE_CAP });
    expect(maxDepthOf(DEFAULT_LIMITS)).toBe(ACT_CAP + DEFAULT_PREPARE_CAP + 3);
    expect(DEFAULT_MAX_ACTIONS).toBe(maxDepthOf(DEFAULT_LIMITS));
  });

  it('a plain number means both caps', () => {
    const initial = phasingInitial();
    expect(enumerateTurn(initial, 0)).toEqual(enumerateTurn(initial, { act: 0, prepare: 0 }));
  });
});

describe('canonical Phasing perft seed values', () => {
  const initial = phasingInitial();

  it('matches the frozen initial triple at act 4 / prepare 0', () => {
    const r = enumerateTurn(initial, PHASING_INITIAL_LIMITS);
    expect(r.sequences).toBe(frozen.initial.actions);
    expect(r.midStates).toBe(frozen.initial.midStates);
    expect(r.endPositions).toBe(frozen.initial.turns);
  });

  it('has the same Act tree as Standard: a Phasing turn just ends two actions later', () => {
    // With no Prepare commitments explored, every Act prefix that plays
    // END_ACTION_PHASE continues to exactly one END_PLACE_PHASE, so the
    // sequence count is Standard's 14,959 and so is the end-position count.
    expect(frozen.initial.actions).toBe(frozen.standardInitial.actions);
    expect(frozen.initial.turns).toBe(frozen.standardInitial.turns);
    // ...but the Prepare phase adds mid-turn states Standard never had.
    expect(frozen.initial.midStates).toBeGreaterThan(frozen.standardInitial.midStates);
  });

  it('still reproduces the canonical STANDARD triple (14959 / 1053 / 797)', () => {
    const standard = createInitialGameState();
    const limits: PerftLimits = { act: 4, prepare: 0 };
    expect(perftActions(standard, limits)).toBe(14959);
    expect(perftMidStates(standard, limits)).toBe(1053);
    expect(perftTurns(standard, limits)).toBe(797);
  });

  it('is deterministic across repeated calls', () => {
    const a = enumerateTurn(initial, PHASING_INITIAL_LIMITS);
    const b = enumerateTurn(initial, PHASING_INITIAL_LIMITS);
    expect(b).toEqual(a);
  });

  it('counts exactly one sequence at zero budget: END_ACTION_PHASE then END_PLACE_PHASE', () => {
    // A player may pass with actions unused, and Prepare must still be ended
    // explicitly, so the empty turn is one sequence — not zero, and not two.
    const r = enumerateTurn(initial, { act: 0, prepare: 0 });
    expect(r.sequences).toBe(1);
    expect(r.endPositions).toBe(1);
  });
});

describe('Prepare is enumerated as an unordered SET', () => {
  const built = buildFixture(PHASING_FIXTURES.find(f => f.id === 'prepare-rich')!);
  const state = built.state;
  const mover = state.turn.currentPlayer;
  const prepare = generateAllActions(state, mover).filter(a => a.type === 'BUY_UNIT' || a.type === 'PROMOTE_UNIT');

  it('the fixture really offers several commitments', () => {
    expect(state.turn.phase).toBe('place');
    expect(state.upkeepPending).toBeFalsy();
    expect(prepare.length).toBeGreaterThan(4);
  });

  it('every pair of Prepare commitments commutes (the premise of the canonicalisation)', () => {
    let pairs = 0;
    for (let i = 0; i < prepare.length; i++) {
      for (let j = i + 1; j < prepare.length; j++) {
        const forward = applyPair(state, prepare[i], prepare[j]);
        const backward = applyPair(state, prepare[j], prepare[i]);
        expect(forward === null).toBe(backward === null);
        if (forward === null || backward === null) continue;
        pairs++;
        // Same board, same commitments, same bank, same phase — the ORDER of the
        // canonical `pendingSummons` array is the only thing that differs, and no
        // rule and no packed field reads it.
        expect(positionCanonicalString(forward)).toBe(positionCanonicalString(backward));
      }
    }
    expect(pairs).toBeGreaterThan(4);
  });

  it('counts each jointly legal PAIR once, not twice', () => {
    const one = enumerateTurn(state, { act: 0, prepare: 1 }).sequences;
    const two = enumerateTurn(state, { act: 0, prepare: 2 }).sequences;
    // prepare:1 counts the empty set plus every singleton.
    expect(one).toBe(1 + prepare.length);
    let pairs = 0;
    for (let i = 0; i < prepare.length; i++) {
      for (let j = i + 1; j < prepare.length; j++) {
        if (applyPair(state, prepare[i], prepare[j]) !== null) pairs++;
      }
    }
    expect(two - one).toBe(pairs);
    // A permuted enumeration would have counted 2 * pairs.
    expect(two).toBeLessThan(one + 2 * pairs);
  });
});

/** Applies two Prepare commitments in order, or null when the pair is not jointly legal. */
function applyPair(state: GameState, first: AIAction, second: AIAction): GameState | null {
  if (!isLegalAction(state, first)) return null;
  const mid = applyAction(state, first);
  if (mid === state) return null;
  if (!isLegalAction(mid, second)) return null;
  const end = applyAction(mid, second);
  return end === mid ? null : end;
}

describe('Phasing perft fixtures (lab/hard-ai/perft/phasing-fixtures.ts)', () => {
  const built: BuiltFixture[] = PHASING_FIXTURES.map(buildFixture);
  const byId = new Map(built.map(b => [b.spec.id, b]));

  it('fixtures.json is the v2 Phasing schema and names exactly these fixtures', () => {
    expect(frozen.schema).toBe('muju-perft-fixtures-v2');
    expect(frozen.ruleset).toBe('phasing');
    expect(frozen.fixtures.map(f => f.id)).toEqual(PHASING_FIXTURES.map(f => f.id));
  });

  it('every recipe rebuilds the frozen position (digest) and its frozen counts', () => {
    for (const record of frozen.fixtures) {
      const b = byId.get(record.id);
      expect(b, `fixture ${record.id}`).toBeDefined();
      expect(b!.digest, `fixture ${record.id} position drifted`).toBe(record.digest);
      const r = enumerateTurn(b!.state, record.limits);
      expect(r.sequences, `${record.id}.actions`).toBe(record.actions);
      expect(r.midStates, `${record.id}.midStates`).toBe(record.midStates);
      expect(r.endPositions, `${record.id}.endPositions`).toBe(record.endPositions);
    }
  });

  it('every fixture is a legal, playing Phasing state with a well-formed rules block', () => {
    for (const b of built) {
      expect(b.state.phase).toBe('playing');
      expect(b.state.ruleset).toBe('phasing');
      expect(Array.isArray(b.state.pendingSummons)).toBe(true);
      expect(generateAllActions(b.state, b.state.turn.currentPlayer).length).toBeGreaterThan(0);
      expect(b.rules.combatHandicap).toEqual({ white: 0, black: 0 });
      expect(['on', 'off']).toContain(b.rules.inactivityRule);
      expect(['elimination', 'home-or-elimination']).toContain(b.rules.victoryRule);
    }
  });

  it('every stored pending summon carries its catalogue cost (pack rejects anything else)', () => {
    for (const b of built) {
      for (const s of b.state.pendingSummons ?? []) {
        expect(s.cost).toBeGreaterThan(0);
        expect(pendKeyCanonical(b.state)).toContain(`${s.definitionId}.${s.cost}`);
      }
    }
  });

  it('prepare-broke: nothing is affordable, so END_PLACE_PHASE is the only action', () => {
    const b = byId.get('prepare-broke')!;
    const actions = generateAllActions(b.state, b.state.turn.currentPlayer);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('END_PLACE_PHASE');
    // Preparation always ends explicitly, even when nothing is affordable.
    expect(pendingsOf(b.state, b.state.turn.currentPlayer).length).toBeGreaterThan(0);
  });

  it('pendings-both-sides: a commitment is outstanding for each side at once', () => {
    const b = byId.get('pendings-both-sides')!;
    expect(pendingsOf(b.state, 'white').length).toBeGreaterThan(0);
    expect(pendingsOf(b.state, 'black').length).toBeGreaterThan(0);
  });

  it('arrival-and-refund: the hand-off both materialises a unit and refunds a cost', () => {
    const b = byId.get('arrival-and-refund')!;
    const after = applyAction(b.state, { type: 'END_PLACE_PHASE' });
    expect(after).not.toBe(b.state);
    // The hand-off must not end the game first: `handOffTurn` runs the
    // inactivity draw test, and `startTurn` adjudicates home occupation and
    // elimination, all BEFORE `resolveSummons`.
    expect(after.phase).toBe('playing');
    expect(after.lastSummoning).toBeDefined();
    expect(after.lastSummoning).not.toBe(b.state.lastSummoning);
    expect(after.lastSummoning!.summoned.length).toBeGreaterThan(0);
    expect(after.lastSummoning!.disrupted.length).toBeGreaterThan(0);
    const refund = after.lastSummoning!.disrupted.reduce((sum, s) => sum + s.cost, 0);
    const owner = after.lastSummoning!.player;
    expect(after.players[owner].resources).toBe(b.state.players[owner].resources + refund);
    // Arrivals may act and may promote on their arrival turn.
    for (const s of after.lastSummoning!.summoned) {
      const unit = after.board.units.find(u => u.id === s.id);
      expect(unit).toBeDefined();
      expect(unit!.placedThisTurn).toBe(false);
      expect(unit!.canActThisTurn).toBe(true);
    }
  });

  it('upkeep-review-pending: only PAY_UPKEEP is legal, with more than one choice', () => {
    const b = byId.get('upkeep-review-pending')!;
    expect(b.state.upkeepPending).toBe(true);
    const actions = generateAllActions(b.state, b.state.turn.currentPlayer);
    expect(actions.length).toBeGreaterThan(1);
    expect(actions.every(a => a.type === 'PAY_UPKEEP')).toBe(true);
  });

  it('home-occupation: an invader sits on the defender\'s corner and the defender is to move', () => {
    const b = byId.get('home-occupation')!;
    const invader = b.state.turn.currentPlayer === 'white' ? 'black' : 'white';
    expect(getHomeOccupier(b.state.board, invader)).toBeDefined();
    expect(b.state.turn.phase).toBe('action');
    expect(b.state.turn.actionsRemaining).toBe(4);
  });

  it('the packed replica reproduces every fixture\'s three numbers (the M2 differential)', () => {
    for (const record of frozen.fixtures) {
      const b = byId.get(record.id)!;
      const r = perftReplica(b.state, record.limits);
      expect(r.sequences, `${record.id}.actions (replica)`).toBe(record.actions);
      expect(r.midStates, `${record.id}.midStates (replica)`).toBe(record.midStates);
      expect(r.endPositions, `${record.id}.endPositions (replica)`).toBe(record.endPositions);
    }
    const initial = perftReplica(phasingInitial(), PHASING_INITIAL_LIMITS);
    expect(initial.sequences).toBe(frozen.initial.actions);
    expect(initial.midStates).toBe(frozen.initial.midStates);
    expect(initial.endPositions).toBe(frozen.initial.turns);
  });

  it('the Phasing-only replica refuses a Standard position rather than reinterpreting it', () => {
    expect(() => perftReplica(createInitialGameState(), { act: 0, prepare: 0 })).toThrow(/phasing/i);
  });

  it('full-turn: a fresh Act phase, so the whole Phasing turn shape is enumerated', () => {
    const b = byId.get('full-turn')!;
    expect(b.state.turn.phase).toBe('action');
    expect(b.state.turn.actionsRemaining).toBe(4);
    expect(b.state.upkeepPending).toBeFalsy();
  });
});

describe('dedup keys carry the pending summons', () => {
  it('two positions that differ only in a commitment are counted separately', () => {
    const initial = phasingInitial();
    const withCommitment: GameState = {
      ...initial,
      pendingSummons: [{ id: 'x', owner: 'white', definitionId: 'fire_1', position: { x: 1, y: 0 }, cost: 3 }],
    };
    expect(pendKeyCanonical(initial)).toBe('');
    expect(pendKeyCanonical(withCommitment)).toBe('0.01.fire_1.3');
    // Same board, same banks, same turn — only the commitment differs, and the
    // end-position sets must not be merged.
    const a = enumerateTurn(initial, { act: 0, prepare: 0 });
    const b = enumerateTurn(withCommitment, { act: 0, prepare: 0 });
    expect(a.endPositions).toBe(1);
    expect(b.endPositions).toBe(1);
    expect(pendKeyCanonical(initial)).not.toBe(pendKeyCanonical(withCommitment));
  });
});

describe('openings.jsonl (797 Standard census end positions)', () => {
  const positions = readPositions(OPENINGS_PATH);

  it('has exactly 797 entries, all schema muju-position-v1', () => {
    expect(positions).toHaveLength(797);
    for (const p of positions) expect(p.schema).toBe('muju-position-v1');
  });

  it('every opening hands the turn to Black at a legal, playing GameState', () => {
    for (const p of positions) {
      expect(p.state.phase).toBe('playing');
      expect(p.state.turn.currentPlayer).toBe('black');
      expect(p.state.turn.phase).toBe('action');
    }
  });

  it('ids are unique and sequential opening-001..opening-797', () => {
    const ids = positions.map(p => p.id).sort();
    const expected = Array.from({ length: 797 }, (_, i) => `opening-${String(i + 1).padStart(3, '0')}`).sort();
    expect(ids).toEqual(expected);
  });
});

describe('authored.jsonl (the retired Standard corpus)', () => {
  // These eleven positions were the pre-M2 perft fixtures. They are STANDARD
  // positions and are no longer the perft set (the frozen numbers they indexed
  // are retrievable from git at tag `standard-final`), but they remain a valid
  // corpus and still exercise `corpus.ts` and the canonical engine.
  const positions = readPositions(AUTHORED_PATH);

  it('still reads as eleven muju-position-v1 Standard positions', () => {
    expect(positions).toHaveLength(11);
    for (const p of positions) {
      expect(p.schema).toBe('muju-position-v1');
      expect(p.state.ruleset ?? 'standard').toBe('standard');
      expect(p.state.phase).toBe('playing');
    }
  });

  it('enumerates without throwing under the canonical engine', () => {
    for (const p of positions) {
      const n = enumerateTurn(p.state, { act: p.depth ?? 2, prepare: 1 }).sequences;
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('corpus.ts mirror180 (DESIGN F10, core/tables.ts rot180)', () => {
  it('flips every unit\'s square (99 - s) and swaps owner', () => {
    const initial = createInitialGameState();
    const mirrored = mirror180(initial);
    expect(mirrored.board.units).toHaveLength(initial.board.units.length);
    for (const u of initial.board.units) {
      const flipped = mirrored.board.units.find(v => v.id === u.id);
      expect(flipped).toBeDefined();
      expect(flipped!.position).toEqual({ x: 9 - u.position.x, y: 9 - u.position.y });
      expect(flipped!.owner).toBe(u.owner === 'white' ? 'black' : 'white');
    }
  });

  it('swaps currentPlayer and player resource pools', () => {
    const initial = createInitialGameState();
    const withBank = { ...initial, players: { white: { ...initial.players.white, resources: 5 }, black: { ...initial.players.black, resources: 9 } } };
    const mirrored = mirror180(withBank);
    expect(mirrored.turn.currentPlayer).toBe('black');
    expect(mirrored.players.white.resources).toBe(9);
    expect(mirrored.players.black.resources).toBe(5);
  });

  it('is an involution (mirror180(mirror180(s)) deep-equals s) on every authored fixture', () => {
    const positions: StoredPosition[] = readPositions(AUTHORED_PATH);
    for (const p of positions) {
      expect(mirror180(mirror180(p.state))).toEqual(p.state);
    }
  });

  it('mirrors resourceLayers per-cell (cell (x,y) <- cell (9-x,9-y))', () => {
    const initial = createInitialGameState();
    const mirrored = mirror180(initial);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        expect(mirrored.board.cells[y][x].resourceLayers).toBe(initial.board.cells[9 - y][9 - x].resourceLayers);
      }
    }
  });

  it('does NOT yet mirror pendingSummons: Phasing positions must not be mirrored', () => {
    // Recorded as a known gap rather than silently producing a wrong position:
    // `mirror180` predates Phasing and leaves `pendingSummons` untouched, so a
    // mirrored Phasing position would keep white's commitments on white's
    // squares while the units moved. Any Phasing symmetry work must extend it.
    const phasing: GameState = {
      ...phasingInitial(),
      pendingSummons: [{ id: 'x', owner: 'white', definitionId: 'fire_1', position: { x: 1, y: 0 }, cost: 3 }],
    };
    const mirrored = mirror180(phasing);
    expect(mirrored.pendingSummons).toEqual(phasing.pendingSummons);
  });
});
