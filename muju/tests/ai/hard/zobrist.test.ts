// @vitest-environment node
/**
 * `core/zobrist.ts` (DESIGN §3.3; M4 gate: "`buildZobrist` is deterministic
 * across two builds"). The interesting content is the KEYING RULES: which
 * fields land in `Kpos`, which only in `Kturn`, and that everything is keyed
 * by square rather than by slot so buy-order permutations transpose (JF §2.3).
 *
 * M2 adds the `pend` plane for Phasing commitments. Two properties are pinned:
 * it is folded into `Kpos` (so it reaches every TT, book and perft key), and it
 * is APPEND-ONLY — every earlier plane draws exactly the words it drew before
 * `pend` existed, so a position with no commitment keeps its pre-M2 key.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  Z,
  ZOBRIST_SEED,
  buildZobrist,
  recomputeKpos,
  recomputeKturn,
  recomputeOccHash,
  zPend,
  zPiece,
  type ZobristTables,
} from '../../../src/ai/hard/core/zobrist';
import { seededRandom } from '../../../src/ai/runtime';
import { NDEF } from '../../../src/ai/hard/core/catalog';
import { UFLAGS_MASK, type Key, type PackedState } from '../../../src/ai/hard/types';
import { allocPacked, clonePacked, putPending, putUnit } from './packed-fixture';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

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
  ['pend', 2 * NDEF * 100],
];

/** `TABLE_KEYS` is also the FILL ORDER: `buildZobrist` draws the planes in this
 * sequence from one `seededRandom` stream, and `pend` is last by construction. */
const FILL_ORDER = TABLE_KEYS;

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

  it('the pend plane is APPENDED: every earlier plane keeps its pre-M2 words', () => {
    // Redraw the stream in the documented fill order. If `pend` were inserted
    // anywhere but last, every plane after the insertion point would shift and
    // every key of every position — including one with no commitment at all —
    // would change, invalidating the book, the perft fixtures and the suites.
    const rng = seededRandom(ZOBRIST_SEED);
    for (const [name, keys] of FILL_ORDER) {
      const plane = new Uint32Array(keys * 2);
      for (let i = 0; i < plane.length; i++) plane[i] = (rng() * 0x100000000) >>> 0;
      expect([...Z[name]], name).toEqual([...plane]);
    }
    // ...and `pend` really is the LAST plane: the stream is now exhausted as far
    // as `buildZobrist` is concerned, which the equality above already proves
    // for every plane before it.
    expect(FILL_ORDER[FILL_ORDER.length - 1][0]).toBe('pend');
  });

  it('a position with no commitment has the very same Kpos it had before the plane existed', () => {
    // The plane contributes nothing when `pendDef` is empty, so `Kpos` reduces
    // to the pre-M2 XOR exactly. Stated as the one thing a test can check
    // without a stored table: adding and then removing a commitment is a no-op.
    const p = sample();
    const before = recomputeKpos(p);
    const withOne = clonePacked(p);
    putPending(withOne, { side: 0, defId: 3, sq: 42, cost: 4 });
    expect(keyEquals(recomputeKpos(withOne), before)).toBe(false);
    withOne.pendDef[42] = 0;
    withOne.pendCost[42] = 0;
    expect(keyEquals(recomputeKpos(withOne), before)).toBe(true);
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
    ['a pending summon appearing', p => { putPending(p, { side: 0, defId: 0, sq: 7, cost: 3 }); }],
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

  it('Kpos separates commitments by side, square and DEFINITION — but not by cost', () => {
    const base = sample();
    const white7 = putPending(clonePacked(base), { side: 0, defId: 0, sq: 7, cost: 3 });
    const black7 = putPending(clonePacked(base), { side: 1, defId: 0, sq: 7, cost: 3 });
    const white8 = putPending(clonePacked(base), { side: 0, defId: 0, sq: 8, cost: 3 });
    const whiteOther = putPending(clonePacked(base), { side: 0, defId: 4, sq: 7, cost: 5 });
    const keys = [white7, black7, white8, whiteOther].map(recomputeKpos);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) expect(keyEquals(keys[i], keys[j]), `${i} vs ${j}`).toBe(false);
    }
    // The cost is a function of the definition (`pack` rejects any other
    // combination), so it is deliberately NOT part of the key.
    const sameDefOtherCost = putPending(clonePacked(base), { side: 0, defId: 0, sq: 7, cost: 11 });
    expect(keyEquals(recomputeKpos(sameDefOtherCost), keys[0])).toBe(true);

    // A commitment is not a unit: it keys the `pend` plane, never `piece`.
    expect(keyEquals(recomputeKpos(white7), recomputeKpos(putUnit(clonePacked(base), { slot: 9, side: 0, defId: 0, sq: 7 })))).toBe(false);
    expect(recomputeOccHash(white7)).toBe(recomputeOccHash(base));
  });

  it('a commitment is square-keyed, so two plane entries in either write order agree', () => {
    const a = clonePacked(sample());
    putPending(a, { side: 0, defId: 2, sq: 13 });
    putPending(a, { side: 0, defId: 5, sq: 31 });
    const b = clonePacked(sample());
    putPending(b, { side: 0, defId: 5, sq: 31 });
    putPending(b, { side: 0, defId: 2, sq: 13 });
    expect(keyEquals(recomputeKpos(a), recomputeKpos(b))).toBe(true);
    expect(keyEquals(recomputeKturn(a), recomputeKturn(b))).toBe(true);
  });

  it('the pend plane is a Kpos plane, not a Kturn extra', () => {
    const p = sample();
    const delta = xorKeys(recomputeKturn(p), recomputeKpos(p));
    const q = putPending(clonePacked(p), { side: 1, defId: 7, sq: 64, cost: 3 });
    expect(keyEquals(xorKeys(recomputeKturn(q), recomputeKpos(q)), delta)).toBe(true);
  });

  it('zPend indexes (side, definition, square) with two lanes per key', () => {
    expect(zPend(0, 0, 0)).toBe(0);
    expect(zPend(0, 0, 1)).toBe(2);
    expect(zPend(0, 1, 0)).toBe(200);
    expect(zPend(1, 0, 0)).toBe(2 * NDEF * 100);
    expect(zPend(1, NDEF - 1, 99)).toBe(Z.pend.length - 2);
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
