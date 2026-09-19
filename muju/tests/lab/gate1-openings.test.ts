// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  DEV_BOOK_DISTINCT_START_POSITIONS, DEV_BOOK_PATH, DEV_BOOK_ROWS, DEV_BOOK_SHA256, HANDICAPS,
  KNOWN_START_COLLISIONS, assertDevBookPath, assertKnownStartCollisions, computeStartPositions,
  gate1StartState, loadGate1Book, normalizeOpeningIds, openingsDigest, scheduleOpenings,
} from '../../lab/ai/gate1-openings';
import {
  canonicalStartPosition, canonicalStep, createTraceHasher, startPositionDigest,
} from '../../lab/ai/gate1-trace';
import { gameplayDigest } from '../../lab/hard-ai/ladder/openings/phasing';
import { applyAction } from '../../src/ai/simulate';
import { phaseEndAction } from '../../src/game/legality';

const book = loadGate1Book();

describe('the Gate 1 opening book (preregistration A3 §1)', () => {
  it('is the frozen 48-row dev book, pinned by the hash A3 quotes', () => {
    expect(book.path).toBe(DEV_BOOK_PATH);
    expect(book.sha256).toBe(DEV_BOOK_SHA256);
    expect(book.sha256.startsWith('a58ca9d8') && book.sha256.endsWith('5c7')).toBe(true);
    expect(book.sha256).toBe(createHash('sha256').update(readFileSync(DEV_BOOK_PATH)).digest('hex'));
    expect(book.openings).toHaveLength(DEV_BOOK_ROWS);
    expect(new Set(book.openings.map(o => o.id)).size).toBe(DEV_BOOK_ROWS);
    expect(book.openings.every(o => o.id.startsWith('p1-'))).toBe(true);
    expect(book.openings.every(o => o.actions.length > 0)).toBe(true);
  });

  it('refuses every other corpus, above all p1-val and the sealed book', () => {
    for (const path of [
      'lab/hard-ai/ladder/openings/p1-val.jsonl',
      '/Users/ashkie/src/deevgames-wizards/sealed/p1-sealed.jsonl',
      'lab/hard-ai/ladder/openings/p1-sealed.jsonl',
      'lab/hard-ai/ladder/openings/e1-dev.jsonl',
      'lab/hard-ai/ladder/openings/../openings/p1-val.jsonl',
      '',
    ]) {
      expect(() => assertDevBookPath(path)).toThrow(/p1-dev\.jsonl only/);
      expect(() => loadGate1Book(path)).toThrow(/p1-dev\.jsonl only/);
    }
    // An equivalent spelling of the dev book itself is still the dev book.
    expect(() => assertDevBookPath('./lab/hard-ai/ladder/openings/p1-dev.jsonl')).not.toThrow();
  });

  it('replays every row at both handicaps into a playable Phasing position', () => {
    const digests = new Set<string>();
    for (const opening of book.openings) {
      for (const handicap of HANDICAPS) {
        const state = gate1StartState(opening, handicap);
        expect(state.ruleset).toBe('phasing');
        expect(state.phase).toBe('playing');
        expect(state.turn.phase).toBe('action');
        expect(state.turn.currentPlayer).toBe('black'); // ALLOCATION-P1: openings end at Black's first Act root
        expect(state.turn.actionsRemaining).toBe(4);
        digests.add(`${handicap}:${gameplayDigest(state)}`);
      }
    }
    // The LADDER's diagnostic digest sees 48 of 48, because it hashes `hasMoved`
    // — a field no rule reads. The semantic digest the row's effective sample
    // size depends on sees 47. Both facts are asserted so neither can move
    // silently; the next block is about the difference.
    expect(digests.size).toBe(DEV_BOOK_ROWS * HANDICAPS.length);
    for (const handicap of HANDICAPS) {
      expect(book.distinctStartPositions[handicap]).toBe(DEV_BOOK_DISTINCT_START_POSITIONS);
    }
  });

  it('mints deterministic ids so two replays of one opening are byte-identical', () => {
    const a = gate1StartState(book.openings[3], 3);
    const b = gate1StartState(book.openings[3], 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.board.units.every(u => /^p1o-u\d+$/.test(u.id))).toBe(true);
    expect((a.pendingSummons ?? []).every(s => /^p1o-s\d+$/.test(s.id))).toBe(true);
    const ids = new Set([...a.board.units.map(u => u.id), ...(a.pendingSummons ?? []).map(s => s.id)]);
    expect(ids.size).toBe(a.board.units.length + (a.pendingSummons?.length ?? 0));
    // The raw book keeps the wall-clock ids `createInitialGameState` mints, and
    // those would otherwise differ on every replay.
    expect(() => normalizeOpeningIds(gate1StartState(book.openings[3], 3))).not.toThrow();
  });

  it('digests the opening order so a reordered book cannot masquerade as this one', () => {
    const ids = book.openings.map(o => o.id);
    expect(openingsDigest(ids)).not.toBe(openingsDigest([...ids].reverse()));
    expect(openingsDigest(ids)).toBe(openingsDigest([...ids]));
  });
});

describe('game hashing (preregistration A3 §2)', () => {
  it('names squares, never minted ids, so a replay of the same game hashes the same', () => {
    const state = gate1StartState(book.openings[0], 0);
    const unit = state.board.units.find(u => u.owner === 'black')!;
    const action = { type: 'PROMOTE_UNIT', unitId: unit.id } as const;
    const step = canonicalStep(state, action);
    expect(step).toContain(`${unit.position.x},${unit.position.y}`);
    expect(step).not.toContain(unit.id);
    const renamed = { ...state, board: { ...state.board, units: state.board.units.map(u => ({ ...u, id: `x-${u.id}` })) } };
    expect(canonicalStep(renamed, { type: 'PROMOTE_UNIT', unitId: `x-${unit.id}` })).toBe(step);
  });

  it('separates two games that differ in their start position, their handicap or one action', () => {
    const state = gate1StartState(book.openings[0], 0);
    const end = phaseEndAction(state);
    const of = (startSha256: string, extra = false) => {
      const h = createTraceHasher(startSha256);
      h.push(state, end);
      if (extra) h.push(applyAction(state, end), phaseEndAction(applyAction(state, end)));
      return h.digest();
    };
    const base = of(book.startSha256(book.openings[0].id, 0));
    expect(of(book.startSha256(book.openings[0].id, 0))).toBe(base);
    expect(of(book.startSha256(book.openings[1].id, 0))).not.toBe(base);
    expect(of(book.startSha256(book.openings[0].id, 3))).not.toBe(base);
    expect(of(book.startSha256(book.openings[0].id, 0), true)).not.toBe(base);
    // A trace can only be keyed by a real start hash, never by a label.
    expect(() => createTraceHasher(book.openings[0].id)).toThrow(/start-position sha256/);
  });

  it('refuses to hash an action whose unit is not on the board', () => {
    const state = gate1StartState(book.openings[0], 0);
    expect(() => canonicalStep(state, { type: 'MOVE', unitId: 'ghost', to: { x: 0, y: 0 } })).toThrow(/no unit ghost/);
  });
});

/**
 * The defect this block exists for. The game digest used to include the OPENING
 * ID, which made A3 §2's "distinct pairs only" a no-op in a full row (one
 * opening per pair, so no two pairs could ever share a key) and hid the dev
 * book's one real transposition. `p1-g5-s245` walks a unit out and back before
 * ending its phases; `p1-g3-s3` just ends them. The only field that survives the
 * round trip is `hasMoved`, which no rule reads, so both ids reach the SAME
 * position — and at a fixed work budget `AIEngineV2` plays it the same way
 * twice. Each test below states the old behaviour next to the new one.
 */
describe('transposing openings (the dev book is 48 ids, 47 positions)', () => {
  const [A, B] = ['p1-g5-s245', 'p1-g3-s3'];
  const openingOf = (id: string) => book.openings.find(o => o.id === id)!;

  it('gives the two transposing ids one start hash, at both handicaps', () => {
    expect(openingOf(A)).toBeDefined();
    expect(openingOf(B)).toBeDefined();
    for (const handicap of HANDICAPS) {
      const a = startPositionDigest(gate1StartState(openingOf(A), handicap), handicap);
      const b = startPositionDigest(gate1StartState(openingOf(B), handicap), handicap);
      expect(a).toBe(b);
      expect(book.startSha256(A, handicap)).toBe(book.startSha256(B, handicap));
    }
    // Every other pair of rows still reaches its own position.
    for (const handicap of HANDICAPS) {
      const hashes = book.openings.map(o => book.startSha256(o.id, handicap));
      expect(new Set(hashes).size).toBe(DEV_BOOK_ROWS - 1);
    }
  });

  it('collapses two identical games from them, where the id-keyed digest did not', () => {
    const handicap = 0;
    const state = gate1StartState(openingOf(A), handicap);
    const steps = [phaseEndAction(state)];
    const digest = (id: string) => {
      const h = createTraceHasher(book.startSha256(id, handicap));
      for (const step of steps) h.push(state, step);
      return h.digest();
    };
    expect(digest(A)).toBe(digest(B)); // one game, counted once

    // What the previous implementation computed, reproduced here exactly:
    // `sha256(JSON.stringify({ opening, handicap, steps }))` over the same steps.
    const legacy = (id: string) => createHash('sha256').update(JSON.stringify({
      opening: id, handicap, steps: steps.map(s => canonicalStep(state, s)),
    })).digest('hex');
    expect(legacy(A)).not.toBe(legacy(B)); // two games, counted twice — the defect
  });

  it('ignores the flag no rule reads, and nothing else', () => {
    const state = gate1StartState(book.openings[0], 0);
    const moved = { ...state, board: { ...state.board,
      units: state.board.units.map((u, i) => (i === 0 ? { ...u, hasMoved: !u.hasMoved } : u)) } };
    expect(startPositionDigest(moved, 0)).toBe(startPositionDigest(state, 0));
    // Each of these IS read by a rule (`legality.ts`, `combat.ts`, `turn.ts`),
    // so flipping it from whatever this position holds must change the hash.
    const unit = state.board.units[0];
    const flags: Record<string, unknown>[] = [
      { canActThisTurn: !unit.canActThisTurn }, { damageTaken: unit.damageTaken + 1 },
      { placedThisTurn: unit.placedThisTurn !== true },
      { promotedThisPlacement: unit.promotedThisPlacement !== true },
      { lastAttackKilled: unit.lastAttackKilled !== true }, { hasAttacked: unit.hasAttacked !== true },
    ];
    for (const patch of flags) {
      const changed = { ...state, board: { ...state.board,
        units: state.board.units.map((u, i) => (i === 0 ? { ...u, ...patch } : u)) } };
      expect(startPositionDigest(changed, 0), JSON.stringify(patch)).not.toBe(startPositionDigest(state, 0));
    }
    // So are the banks, the clock, the side to move and the crystals on the board.
    const bank = { ...state, players: { ...state.players,
      white: { ...state.players.white, resources: state.players.white.resources + 1 } } };
    expect(startPositionDigest(bank, 0)).not.toBe(startPositionDigest(state, 0));
    const clock = { ...state, inactivityPlies: (state.inactivityPlies ?? 0) + 1 };
    expect(startPositionDigest(clock, 0)).not.toBe(startPositionDigest(state, 0));
    // And a position never carries a minted id into its own fingerprint.
    expect(JSON.stringify(canonicalStartPosition(state, 0))).not.toContain(state.board.units[0].id);
  });

  it('refuses a handicap the position does not carry', () => {
    const state = gate1StartState(book.openings[0], 3);
    expect(() => startPositionDigest(state, 0)).toThrow(/handicap 3 is not the 0/);
  });

  it('pins the collision it finds, and names the ids when the set changes', () => {
    expect(KNOWN_START_COLLISIONS.map(c => [...c.openingIds])).toEqual([[A, B], [A, B]]);
    expect(book.collisions.map(c => ({ handicap: c.handicap, openingIds: c.openingIds })))
      .toEqual([{ handicap: 0, openingIds: [A, B] }, { handicap: 3, openingIds: [A, B] }]);
    expect(() => assertKnownStartCollisions([])).toThrow(/Found \(none\); pinned/);
    expect(() => assertKnownStartCollisions([...book.collisions,
      { handicap: 0, sha256: 'x', openingIds: ['p1-a', 'p1-b'] }])).toThrow(/p1-a = p1-b/);
    // A book with no collision at all passes its own assertion, so the pin is
    // about THIS book rather than about collisions being mandatory.
    const two = computeStartPositions(book.openings.slice(0, 2), [0]);
    expect(two.collisions).toEqual([]);
    expect(two.distinctStartPositions[0]).toBe(2);
  });

  it('hands the schedule a start hash per opening and handicap', () => {
    const openings = scheduleOpenings(book);
    expect(openings).toHaveLength(DEV_BOOK_ROWS);
    for (const opening of openings) {
      for (const handicap of HANDICAPS) {
        expect(opening.starts[handicap]).toBe(book.startSha256(opening.id, handicap));
      }
    }
    expect(() => book.startSha256(A, 7)).toThrow(/No start position/);
  });
});
