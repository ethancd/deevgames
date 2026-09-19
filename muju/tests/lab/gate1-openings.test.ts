// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  DEV_BOOK_PATH, DEV_BOOK_ROWS, DEV_BOOK_SHA256, HANDICAPS,
  assertDevBookPath, gate1StartState, loadGate1Book, normalizeOpeningIds, openingsDigest,
} from '../../lab/ai/gate1-openings';
import { canonicalStep, createTraceHasher } from '../../lab/ai/gate1-trace';
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

  it('replays every row at both handicaps into a distinct, playable Phasing position', () => {
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
    expect(digests.size).toBe(DEV_BOOK_ROWS * HANDICAPS.length);
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

  it('separates two games that differ in their opening, their handicap or one action', () => {
    const state = gate1StartState(book.openings[0], 0);
    const end = phaseEndAction(state);
    const of = (opening: string, handicap: number, extra = false) => {
      const h = createTraceHasher(opening, handicap);
      h.push(state, end);
      if (extra) h.push(applyAction(state, end), phaseEndAction(applyAction(state, end)));
      return h.digest();
    };
    const base = of(book.openings[0].id, 0);
    expect(of(book.openings[0].id, 0)).toBe(base);
    expect(of(book.openings[1].id, 0)).not.toBe(base);
    expect(of(book.openings[0].id, 3)).not.toBe(base);
    expect(of(book.openings[0].id, 0, true)).not.toBe(base);
  });

  it('refuses to hash an action whose unit is not on the board', () => {
    const state = gate1StartState(book.openings[0], 0);
    expect(() => canonicalStep(state, { type: 'MOVE', unitId: 'ghost', to: { x: 0, y: 0 } })).toThrow(/no unit ghost/);
  });
});
