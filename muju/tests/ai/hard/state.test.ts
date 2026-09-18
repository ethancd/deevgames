// @vitest-environment node
/**
 * `Replica.isLegal` / `genActions` / `genPlace` / `genKeepSets` / `check` /
 * `rehash` / `digest` (DESIGN §4.4).
 *
 * `isLegal` is checked the only way that means anything: as a TOTAL function
 * over the whole packed action space of a position — every MOVE, every ATTACK,
 * every BUY, every PROMOTE and both phase-enders — against
 * `isLegalAction` on the same canonical state. That catches an action the
 * replica wrongly ACCEPTS as readily as one it wrongly rejects, which a
 * generator-only comparison cannot.
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { createInitialGameState } from '../../../src/game/board';
import { isLegalAction } from '../../../src/game/legality';
import { upkeepActions } from '../../../src/game/upkeep';
import { getMovementRange } from '../../../src/game/movement';
import { getUnitDefinition, UNIT_DEFINITIONS } from '../../../src/game/units';
import { generateAllActions } from '../../../src/ai/moves';
import { seededRandom } from '../../../src/ai/runtime';
import { MAX_SLOTS, type PackedState } from '../../../src/ai/hard/types';
import {
  AKind,
  KEEP_SET_CAPACITY,
  newKeepSetTable,
  paKind,
  paMake,
  toAIAction,
  type KeepSetTable,
} from '../../../src/ai/hard/core/action';
import { DEF_ID } from '../../../src/ai/hard/core/catalog';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { recomputeKpos, recomputeKturn, recomputeOccHash } from '../../../src/ai/hard/core/zobrist';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { buildState, randomState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.4 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const CORPUS_DIR = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions');
const GEN_BUFFER = new Int32Array(4 + MAX_SLOTS * 104);

function normalize(a: ReturnType<typeof toAIAction>): string {
  switch (a.type) {
    case 'MOVE':
      return `M:${a.unitId}:${a.to.y * 10 + a.to.x}`;
    case 'ATTACK':
      return `A:${a.unitId}:${a.targetPosition.y * 10 + a.targetPosition.x}`;
    case 'BUY_UNIT':
      return `B:${a.definitionId}:${a.position.y * 10 + a.position.x}`;
    case 'PROMOTE_UNIT':
      return `P:${a.unitId}`;
    case 'PAY_UPKEEP':
      return `U:${[...a.keepUnitIds].sort().join(',')}`;
    case 'END_PLACE_PHASE':
      return 'EP';
    case 'END_ACTION_PHASE':
      return 'EA';
    default:
      return `R`;
  }
}

/** Every `PA` the replica could possibly be handed for this position. */
function everyPackedAction(p: PackedState): number[] {
  const out: number[] = [paMake(AKind.END_PLACE), paMake(AKind.END_ACTION), paMake(AKind.RESIGN)];
  for (let slot = 0; slot < p.slotCount; slot++) {
    out.push(paMake(AKind.PROMOTE, slot));
    for (let s = 0; s < 100; s++) {
      out.push(paMake(AKind.MOVE, slot, s));
      out.push(paMake(AKind.ATTACK, slot, s));
    }
  }
  for (let def = 0; def < DEF_ID.length; def++) for (let s = 0; s < 100; s++) out.push(paMake(AKind.BUY, def, s));
  return out;
}

/** The canonical verdict for a decoded action, or `false` when it cannot decode. */
function canonicalVerdict(p: PackedState, pa: number, keep: KeepSetTable, state: ReturnType<typeof buildState>): boolean {
  let action;
  try {
    action = toAIAction(p, pa, keep);
  } catch {
    return false;
  }
  return isLegalAction(state, action);
}

describe('Replica.isLegal', () => {
  it('agrees with isLegalAction over the ENTIRE packed action space', () => {
    const rng = seededRandom(0x4c45474c);
    const keep = newKeepSetTable();
    let accepted = 0;
    let rejected = 0;
    let positions = 0;
    for (let i = 0; i < 120; i++) {
      const phase = rng() < 0.5 ? 'place' : 'action';
      const state = randomState(rng, 2 + Math.floor(rng() * 6), {
        phase,
        actions: Math.floor(rng() * 5),
        white: Math.floor(rng() * 12),
        black: Math.floor(rng() * 12),
        current: rng() < 0.5 ? 'white' : 'black',
      });
      const p = replica.pack(state);
      for (const pa of everyPackedAction(p)) {
        const mine = replica.isLegal(p, pa, keep);
        const theirs = canonicalVerdict(p, pa, keep, state);
        if (mine !== theirs) {
          throw new Error(
            `isLegal mismatch on ${JSON.stringify(toAIAction(p, pa, keep))} (replica ${mine}, canonical ${theirs})`,
          );
        }
        if (mine) accepted++;
        else rejected++;
      }
      positions++;
    }
    expect(positions).toBe(120);
    expect(accepted).toBeGreaterThan(2000);
    expect(rejected).toBeGreaterThan(100_000);
  });

  it('accepts multi-action MOVEs that generateAllActions does not emit', () => {
    const state = buildState({
      units: [{ def: 'lightning_1', owner: 'white', x: 0, y: 0 }, { def: 'plant_1', owner: 'black', x: 9, y: 9 }],
      actions: 4,
    });
    const p = replica.pack(state);
    // Radi has speed 3, so (0,6) is distance 6 = two actions away.
    const target = 60;
    const pa = paMake(AKind.MOVE, 0, target);
    expect(replica.isLegal(p, pa)).toBe(true);
    expect(isLegalAction(state, { type: 'MOVE', unitId: 'u0', to: { x: 0, y: 6 } })).toBe(true);
    // ...but the canonical GENERATOR only lists one-action destinations.
    const listed = generateAllActions(state, 'white').some(a => a.type === 'MOVE' && a.to.x === 0 && a.to.y === 6);
    expect(listed).toBe(false);
    // With only one action left it is no longer legal.
    const tight = replica.pack({ ...state, turn: { ...state.turn, actionsRemaining: 1 } });
    expect(replica.isLegal(tight, pa)).toBe(false);
  });

  it('honours F_CAN_ACT, the attack budget and the cleave unlock', () => {
    const base = buildState({
      units: [
        { def: 'fire_3', owner: 'white', x: 0, y: 0 },
        { def: 'plant_1', owner: 'black', x: 1, y: 0 },
      ],
    });
    const attack = paMake(AKind.ATTACK, 0, 1);
    expect(replica.isLegal(replica.pack(base), attack)).toBe(true);

    // canActThisTurn cleared -> no MOVE and no ATTACK (DESIGN F2).
    const asleep = { ...base, board: { ...base.board, units: base.board.units.map((u, i) => (i === 0 ? { ...u, canActThisTurn: false } : u)) } };
    const pAsleep = replica.pack(asleep);
    expect(replica.isLegal(pAsleep, attack)).toBe(false);
    expect(replica.isLegal(pAsleep, paMake(AKind.MOVE, 0, 10))).toBe(false);

    // One attack spent without a kill: tier 3 allows 3 attacks, but only a kill unlocks the next.
    const spentNoKill = {
      ...base,
      board: { ...base.board, units: base.board.units.map((u, i) => (i === 0 ? { ...u, hasAttacked: true, attackedThisTurn: ['ghost'], lastAttackKilled: false } : u)) },
    };
    expect(replica.isLegal(replica.pack(spentNoKill), attack)).toBe(false);

    const spentWithKill = {
      ...base,
      board: { ...base.board, units: base.board.units.map((u, i) => (i === 0 ? { ...u, hasAttacked: true, attackedThisTurn: ['ghost'], lastAttackKilled: true } : u)) },
    };
    expect(replica.isLegal(replica.pack(spentWithKill), attack)).toBe(true);

    // At the tier cap (3 attacks for a tier-3 unit) even a kill does not unlock a fourth.
    const capped = {
      ...base,
      board: { ...base.board, units: base.board.units.map((u, i) => (i === 0 ? { ...u, hasAttacked: true, attackedThisTurn: ['a', 'b', 'c'], lastAttackKilled: true } : u)) },
    };
    expect(replica.isLegal(replica.pack(capped), attack)).toBe(false);
  });

  it('rejects everything but RESIGN and PAY_UPKEEP while upkeep is pending', () => {
    const state = buildState({
      units: [
        { def: 'water_2', owner: 'white', x: 0, y: 1 },
        { def: 'plant_1', owner: 'white', x: 1, y: 0 },
        { def: 'fire_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 0,
      phase: 'place',
      upkeepPending: true,
    });
    const p = replica.pack(state);
    const keep = newKeepSetTable();
    expect(replica.genKeepSets(p, keep)).toBeGreaterThan(0);
    expect(replica.isLegal(p, paMake(AKind.RESIGN))).toBe(true);
    expect(replica.isLegal(p, paMake(AKind.END_PLACE))).toBe(false);
    expect(replica.isLegal(p, paMake(AKind.BUY, 0, 5))).toBe(false);
    expect(replica.isLegal(p, paMake(AKind.PROMOTE, 1))).toBe(false);
    expect(replica.isLegal(p, paMake(AKind.PAY_UPKEEP, 0), keep)).toBe(true);
    // Index past the table's end is not an action at this node.
    expect(replica.isLegal(p, paMake(AKind.PAY_UPKEEP, keep.count), keep)).toBe(false);
    // No table at all -> no PAY_UPKEEP is decidable.
    expect(replica.isLegal(p, paMake(AKind.PAY_UPKEEP, 0))).toBe(false);
  });

  it('a terminal position has no legal action at all', () => {
    const p = replica.pack({ ...createInitialGameState(), phase: 'victory', winner: 'white', victoryReason: 'elimination' });
    for (const pa of everyPackedAction(p)) expect(replica.isLegal(pa === 0 ? p : p, pa)).toBe(false);
  });
});

describe('Replica generators', () => {
  it('genActions + genPlace equal the canonical set (MOVEs expanded) on the corpus', () => {
    const positions = [
      ...readPositions(path.join(CORPUS_DIR, 'authored.jsonl')),
      ...readPositions(path.join(CORPUS_DIR, 'fuzz-1000.jsonl')),
    ];
    const keep = newKeepSetTable();
    let checked = 0;
    for (const stored of positions) {
      const state = stored.state;
      if (state.phase !== 'playing' || state.upkeepPending) continue;
      const p = replica.pack(state);
      const n = p.phase === 0 ? replica.genPlace(p, GEN_BUFFER) : replica.genActions(p, GEN_BUFFER);
      const mine: string[] = [];
      for (let i = 0; i < n; i++) mine.push(normalize(toAIAction(p, GEN_BUFFER[i], keep)));
      mine.sort();

      const theirs: string[] = [];
      for (const a of generateAllActions(state, state.turn.currentPlayer)) {
        if (a.type === 'MOVE') continue;
        theirs.push(normalize(a));
      }
      if (state.turn.phase === 'action' && state.turn.actionsRemaining > 0) {
        for (const u of state.board.units) {
          if (u.owner !== state.turn.currentPlayer || !u.canActThisTurn) continue;
          const speed = getUnitDefinition(u.definitionId).speed;
          for (const r of getMovementRange(u.position, speed, state.turn.actionsRemaining, state.board)) {
            if (state.turn.actionsRemaining - r.actionsRemaining < 1) continue;
            theirs.push(`M:${u.id}:${r.position.y * 10 + r.position.x}`);
          }
        }
      }
      theirs.sort();
      expect(mine).toEqual(theirs);
      checked++;
    }
    expect(checked).toBeGreaterThan(600);
  });

  it('genActions emits attacks before moves, both slot- then square-ascending, and always ends the phase', () => {
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 1, y: 1 },
        { def: 'water_1', owner: 'white', x: 5, y: 5 },
        { def: 'plant_1', owner: 'black', x: 1, y: 0 },
        { def: 'plant_1', owner: 'black', x: 0, y: 1 },
      ],
    });
    const p = replica.pack(state);
    const n = replica.genActions(p, GEN_BUFFER);
    expect(paKind(GEN_BUFFER[n - 1])).toBe(AKind.END_ACTION);
    const kinds: number[] = [];
    for (let i = 0; i < n; i++) kinds.push(paKind(GEN_BUFFER[i]));
    expect(kinds.indexOf(AKind.ATTACK)).toBe(0);
    expect(kinds.lastIndexOf(AKind.ATTACK)).toBeLessThan(kinds.indexOf(AKind.MOVE));
    // The two attack targets are (1,0) = 1 and (0,1) = 10, ascending.
    expect([GEN_BUFFER[0], GEN_BUFFER[1]]).toEqual([paMake(AKind.ATTACK, 0, 1), paMake(AKind.ATTACK, 0, 10)]);
    // With no actions left, only END_ACTION.
    const spent = replica.pack({ ...state, turn: { ...state.turn, actionsRemaining: 0 } });
    expect(replica.genActions(spent, GEN_BUFFER)).toBe(1);
    expect(paKind(GEN_BUFFER[0])).toBe(AKind.END_ACTION);
  });

  it('genPlace emits BUY defId-ascending then square-ascending, then promotions, then END_PLACE', () => {
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 1, y: 0 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 5,
      phase: 'place',
    });
    const p = replica.pack(state);
    const n = replica.genPlace(p, GEN_BUFFER);
    expect(paKind(GEN_BUFFER[n - 1])).toBe(AKind.END_PLACE);
    let lastDef = -1;
    let lastSquare = -1;
    let promotions = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = GEN_BUFFER[i];
      if (paKind(a) === AKind.PROMOTE) {
        promotions++;
        continue;
      }
      expect(paKind(a)).toBe(AKind.BUY);
      expect(promotions).toBe(0);
      const def = (a >>> 3) & 0x7f;
      const square = (a >>> 10) & 0x7f;
      if (def === lastDef) expect(square).toBeGreaterThan(lastSquare);
      else expect(def).toBeGreaterThan(lastDef);
      lastDef = def;
      lastSquare = square;
    }
    // 5 crystals affords fire_1 (3), lightning_1 (3), water_1 (4), shadow_1 (4), plant_1 (5), metal_1 (5).
    const affordable = UNIT_DEFINITIONS.filter(d => d.tier === 1 && d.cost <= 5).length;
    expect(affordable).toBe(6);
    // Promotion needs 4 crystals and the unit must not have been placed this turn.
    expect(promotions).toBe(1);
  });

  it('genKeepSets reproduces upkeepActions exactly when it does not truncate', () => {
    const rng = seededRandom(0x4b454550);
    const keep = newKeepSetTable();
    let compared = 0;
    let truncated = 0;
    for (let i = 0; i < 4000; i++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 10), {
        phase: 'place',
        upkeepPending: true,
        white: Math.floor(rng() * 12),
        black: Math.floor(rng() * 12),
        current: rng() < 0.5 ? 'white' : 'black',
      });
      const p = replica.pack(state);
      const n = replica.genKeepSets(p, keep);
      const mine: string[] = [];
      for (let k = 0; k < n; k++) {
        const action = toAIAction(p, paMake(AKind.PAY_UPKEEP, k), keep);
        expect(isLegalAction(state, action)).toBe(true);
        mine.push(normalize(action));
      }
      if (n >= KEEP_SET_CAPACITY) {
        truncated++;
        continue;
      }
      const theirs = upkeepActions(state).filter(a => isLegalAction(state, a)).map(normalize).sort();
      expect(mine.slice().sort()).toEqual(theirs);
      compared++;
    }
    expect(compared).toBeGreaterThan(3000);
    // The ranked-and-capped branch must actually be exercised somewhere.
    expect(truncated).toBeGreaterThan(0);
  });

  it('genKeepSets is empty when no upkeep is pending, and always keeps every tier-1 unit', () => {
    const keep = newKeepSetTable();
    const settled = replica.pack(buildState({ units: [{ def: 'water_2', owner: 'white', x: 0, y: 0 }], phase: 'place' }));
    expect(replica.genKeepSets(settled, keep)).toBe(0);

    const pending = replica.pack(
      buildState({
        units: [
          { def: 'water_2', owner: 'white', x: 0, y: 0 },
          { def: 'plant_1', owner: 'white', x: 1, y: 0 },
          { def: 'fire_1', owner: 'black', x: 9, y: 9 },
        ],
        white: 1,
        phase: 'place',
        upkeepPending: true,
      }),
    );
    const n = replica.genKeepSets(pending, keep);
    // Rent-bearing units: the Straumr (tier 2, rent 1). Affordable subsets: {} and {it}.
    expect(n).toBe(2);
    for (let i = 0; i < n; i++) {
      const ids = toAIAction(pending, paMake(AKind.PAY_UPKEEP, i), keep);
      expect(ids.type).toBe('PAY_UPKEEP');
      if (ids.type === 'PAY_UPKEEP') expect(ids.keepUnitIds).toContain('u1');
    }
  });
});

describe('Replica maintenance', () => {
  it('rehash reproduces every incremental field from the unit arrays alone', () => {
    const rng = seededRandom(0x52454841);
    for (let i = 0; i < 400; i++) {
      const p = replica.pack(randomState(rng, 1 + Math.floor(rng() * 12)));
      const before = replica.digest(p);
      // Corrupt every derived field, then rebuild.
      p.kposLo = 0;
      p.kposHi = 0;
      p.kturnLo = 0;
      p.kturnHi = 0;
      p.occHash = 0;
      p.occ.fill(0);
      p.occBy.fill(0);
      p.occTier.fill(0);
      p.pieceAt.fill(255);
      p.materialCc.fill(0);
      p.pstSumCc.fill(0);
      replica.rehash(p);
      expect(replica.digest(p)).toBe(before);
      const kpos = recomputeKpos(p);
      const kturn = recomputeKturn(p);
      expect([p.kposLo, p.kposHi]).toEqual([kpos.lo, kpos.hi]);
      expect([p.kturnLo, p.kturnHi]).toEqual([kturn.lo, kturn.hi]);
      expect(p.occHash).toBe(recomputeOccHash(p));
      replica.check(p);
    }
  });

  it('check throws on each invariant it names', () => {
    const p = replica.pack(buildState({ units: [{ def: 'metal_3', owner: 'white', x: 3, y: 3 }] }));
    replica.check(p);

    const brokenPieceAt = replica.pack(buildState({ units: [{ def: 'metal_3', owner: 'white', x: 3, y: 3 }] }));
    brokenPieceAt.pieceAt[33] = 255;
    expect(() => replica.check(brokenPieceAt)).toThrow(/pieceAt/);

    const brokenDamage = replica.pack(buildState({ units: [{ def: 'metal_3', owner: 'white', x: 3, y: 3 }] }));
    brokenDamage.damage[0] = 5;
    expect(() => replica.check(brokenDamage)).toThrow(/damage/);

    const brokenAtk = replica.pack(buildState({ units: [{ def: 'fire_1', owner: 'white', x: 3, y: 3 }] }));
    brokenAtk.atkCount[0] = 2;
    expect(() => replica.check(brokenAtk)).toThrow(/atkCount/);

    const brokenConservation = replica.pack(buildState({ units: [{ def: 'metal_3', owner: 'white', x: 3, y: 3 }] }));
    brokenConservation.reserve[0] -= 1;
    expect(() => replica.check(brokenConservation)).toThrow(/conservation/);

    const brokenActions = replica.pack(buildState({ units: [{ def: 'metal_3', owner: 'white', x: 3, y: 3 }] }));
    brokenActions.actions = 5;
    expect(() => replica.check(brokenActions)).toThrow(/actions/);

    const brokenOcc = replica.pack(buildState({ units: [{ def: 'metal_3', owner: 'white', x: 3, y: 3 }] }));
    brokenOcc.occ[0] ^= 1;
    expect(() => replica.check(brokenOcc)).toThrow(/occ/);
  });

  it('digest is square-keyed, so slot order never shows through', () => {
    const a = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 1, y: 1, id: 'alpha' },
        { def: 'water_1', owner: 'black', x: 8, y: 8, id: 'beta' },
      ],
    });
    const b = buildState({
      units: [
        { def: 'water_1', owner: 'black', x: 8, y: 8, id: 'beta' },
        { def: 'fire_1', owner: 'white', x: 1, y: 1, id: 'alpha' },
      ],
    });
    const pa = replica.pack(a);
    const pb = replica.pack(b, allocState());
    expect(replica.digest(pb)).toBe(replica.digest(pa));
    expect([pb.kposLo, pb.kposHi]).toEqual([pa.kposLo, pa.kposHi]);
    expect(replica.digest(pa).split('|')).toHaveLength(24);
  });
});
