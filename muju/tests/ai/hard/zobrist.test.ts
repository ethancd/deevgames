// @vitest-environment node
/**
 * `core/zobrist.ts` (DESIGN §3.3; M4 gate: "`buildZobrist` is deterministic
 * across two builds"). The interesting content is the KEYING RULES: which
 * fields land in `Kpos`, which only in `Kturn`, and that everything is keyed
 * by square rather than by slot so buy-order permutations transpose (JF §2.3).
 */
import { describe, expect, it } from 'vitest';
import {
  Z,
  ZOBRIST_SEED,
  buildZobrist,
  recomputeKpos,
  recomputeKturn,
  recomputeOccHash,
  zPiece,
  type ZobristTables,
} from '../../../src/ai/hard/core/zobrist';
import { NDEF } from '../../../src/ai/hard/core/catalog';
import { UFLAGS_MASK, type Key, type PackedState } from '../../../src/ai/hard/types';
import { allocPacked, clonePacked, putUnit } from './packed-fixture';

const TABLE_KEYS: readonly (readonly [keyof ZobristTables, number])[] = [
  ['piece', 2 * NDEF * 100],
  ['reserve', 100 * 17],
  ['damage', 100 * 5],
  ['atkCount', 100 * 4],
  ['uflags', 100 * 16],
  ['side', 1],
  ['phase', 1],
  ['actions', 5],
  ['clock', 11],
  ['bankLo', 2 * 64],
  ['bankHi', 2 * 16],
  ['upkeep', 1],
  ['rules', 8],
  ['handicap', 21],
];

function sample(): PackedState {
  const p = allocPacked();
  putUnit(p, { slot: 0, side: 0, defId: 0, sq: 11, originId: 'w0' });
  putUnit(p, { slot: 1, side: 0, defId: 6, sq: 12, damage: 1, originId: 'w1' });
  putUnit(p, { slot: 2, side: 1, defId: 12, sq: 88, atkCount: 1, uflags: UFLAGS_MASK, originId: 'b0' });
  for (let s = 0; s < 100; s++) p.reserve[s] = (s * 7) % 17;
  p.bank[0] = 13;
  p.bank[1] = 200;
  p.clock = 3;
  p.handicap = 5;
  p.actions = 2;
  p.phase = 1;
  return p;
}

function keyEquals(a: Key, b: Key): boolean {
  return a.lo === b.lo && a.hi === b.hi;
}

function xorKeys(a: Key, b: Key): Key {
  return { lo: (a.lo ^ b.lo) >>> 0, hi: (a.hi ^ b.hi) >>> 0 };
}

describe('core/zobrist: table construction', () => {
  it('every plane has the DESIGN §3.3 size, in two uint32 lanes', () => {
    for (const [name, keys] of TABLE_KEYS) expect(Z[name].length, name).toBe(keys * 2);
  });

  it('is deterministic across two builds with the same seed and differs with another', () => {
    const a = buildZobrist(ZOBRIST_SEED);
    const b = buildZobrist(ZOBRIST_SEED);
    for (const [name] of TABLE_KEYS) expect([...a[name]], name).toEqual([...b[name]]);
    expect([...a.piece]).toEqual([...Z.piece]);

    const other = buildZobrist(ZOBRIST_SEED + 1);
    expect([...other.piece]).not.toEqual([...a.piece]);
  });

  it('the shipped seed is 0x4d554a55 ("MUJU"), identical on every client', () => {
    expect(ZOBRIST_SEED).toBe(0x4d554a55);
  });

  it('draws no zero words and no duplicate piece keys', () => {
    const seen = new Set<string>();
    for (let i = 0; i < Z.piece.length; i += 2) {
      const key = `${Z.piece[i]}:${Z.piece[i + 1]}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(Z.piece[i] | Z.piece[i + 1]).not.toBe(0);
    }
  });
});

describe('core/zobrist: Kpos membership', () => {
  const mutations: readonly (readonly [string, (p: PackedState) => void])[] = [
    ['a unit moving square', p => { p.pieceAt[p.sq[0]] = 255; p.sq[0] = 55; p.pieceAt[55] = 0; }],
    ['a unit changing definition', p => { p.defId[0] = 1; }],
    ['a unit changing owner', p => { p.owner[0] = 1; }],
    ['a unit dying', p => { p.sq[0] = 255; }],
    ['a reserve depleting', p => { p.reserve[40] = 0; }],
    ['damage appearing', p => { p.damage[0] = 2; }],
    ['the side to move', p => { p.side = 1; }],
    ['the inactivity clock', p => { p.clock = 4; }],
    ['a bank low bit', p => { p.bank[0] = 14; }],
    ['a bank high bit', p => { p.bank[0] = 13 + 64; }],
    ['upkeepPending', p => { p.upkeepPending = 1; }],
    ['victoryHome', p => { p.victoryHome = 0; }],
    ['drawRuleOn', p => { p.drawRuleOn = 0; }],
    ['reviewUpkeep[0]', p => { p.reviewUpkeep[0] = 1; }],
    ['reviewUpkeep[1]', p => { p.reviewUpkeep[1] = 1; }],
    ['the handicap', p => { p.handicap = 6; }],
  ];

  for (const [what, mutate] of mutations) {
    it(`Kpos changes with ${what}`, () => {
      const base = sample();
      const before = recomputeKpos(base);
      const after = clonePacked(base);
      mutate(after);
      expect(keyEquals(recomputeKpos(after), before)).toBe(false);
    });
  }

  const turnOnly: readonly (readonly [string, (p: PackedState) => void])[] = [
    ['the phase', p => { p.phase = 0; }],
    ['actions remaining', p => { p.actions = 1; }],
    ['an attack count', p => { p.atkCount[0] = 2; }],
    ['unit flags', p => { p.uflags[0] = UFLAGS_MASK; }],
  ];

  for (const [what, mutate] of turnOnly) {
    it(`Kpos ignores ${what} but Kturn does not`, () => {
      const base = sample();
      const beforePos = recomputeKpos(base);
      const beforeTurn = recomputeKturn(base);
      const after = clonePacked(base);
      mutate(after);
      expect(keyEquals(recomputeKpos(after), beforePos)).toBe(true);
      expect(keyEquals(recomputeKturn(after), beforeTurn)).toBe(false);
    });
  }

  it('Kturn is Kpos xor the turn-only planes, so Kturn xor Kpos is phase/actions/atkCount/uflags only', () => {
    const p = sample();
    const delta = xorKeys(recomputeKturn(p), recomputeKpos(p));
    // With phase = action, actions = 2, atkCount/uflags as in `sample()`, the
    // delta must be reproducible from a state whose Kpos-relevant fields differ.
    const q = clonePacked(p);
    q.reserve[3] = 16;
    q.bank[1] = 7;
    q.handicap = 1;
    expect(keyEquals(xorKeys(recomputeKturn(q), recomputeKpos(q)), delta)).toBe(true);
  });

  it('damage 0 hashes to nothing: clearing damage equals a state that never had it', () => {
    const withDamage = sample();
    const cleared = clonePacked(withDamage);
    cleared.damage[1] = 0;
    const never = sample();
    never.damage[1] = 0;
    expect(keyEquals(recomputeKpos(cleared), recomputeKpos(never))).toBe(true);
    expect(keyEquals(recomputeKpos(cleared), recomputeKpos(withDamage))).toBe(false);
  });
});

describe('core/zobrist: square keying', () => {
  it('two states that differ only by which slot holds which unit share a Kpos and a Kturn', () => {
    const a = allocPacked();
    putUnit(a, { slot: 0, side: 0, defId: 3, sq: 21 });
    putUnit(a, { slot: 1, side: 0, defId: 9, sq: 34 });

    const b = allocPacked();
    putUnit(b, { slot: 7, side: 0, defId: 9, sq: 34 });
    putUnit(b, { slot: 2, side: 0, defId: 3, sq: 21 });

    expect(keyEquals(recomputeKpos(a), recomputeKpos(b))).toBe(true);
    expect(keyEquals(recomputeKturn(a), recomputeKturn(b))).toBe(true);
    expect(recomputeOccHash(a)).toBe(recomputeOccHash(b));
  });

  it('occHash is owner- and definition-independent and depends only on the occupied set', () => {
    const a = allocPacked();
    putUnit(a, { slot: 0, side: 0, defId: 0, sq: 5 });
    putUnit(a, { slot: 1, side: 1, defId: 17, sq: 60 });

    const b = allocPacked();
    putUnit(b, { slot: 0, side: 1, defId: 11, sq: 60 });
    putUnit(b, { slot: 1, side: 0, defId: 4, sq: 5 });

    expect(recomputeOccHash(a)).toBe(recomputeOccHash(b));
    expect(recomputeOccHash(a)).toBe((Z.piece[zPiece(0, 0, 5)] ^ Z.piece[zPiece(0, 0, 60)]) >>> 0);

    const c = clonePacked(a);
    c.sq[0] = 6;
    expect(recomputeOccHash(c)).not.toBe(recomputeOccHash(a));
    expect(recomputeOccHash(allocPacked())).toBe(0);
  });

  it('recompute* are pure: repeated calls on the same state agree', () => {
    const p = sample();
    const first = recomputeKpos(p);
    expect(keyEquals(recomputeKpos(p), first)).toBe(true);
    expect(keyEquals(recomputeKturn(p), recomputeKturn(p))).toBe(true);
    expect(recomputeOccHash(p)).toBe(recomputeOccHash(p));
  });
});
