// @vitest-environment node
/**
 * `core/income.ts` (DESIGN §4.7, F9).
 *
 * Three things are pinned: the JF §2.1 `PST_MINE` check values byte for byte,
 * `projectedIncome`/`upkeepDue` against the canonical `mining.ts`/`upkeep.ts`
 * on every corpus position and a large random sample, and the no-rent property
 * that makes F9's accounting work (`PST_MINE` is a pure mining sum; rent is
 * `RENT_PV` per crystal/turn in a feature of its own).
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { projectedIncome as canonicalIncome } from '../../../src/game/mining';
import { upkeepDue as canonicalUpkeep, unitUpkeep } from '../../../src/game/upkeep';
import { getUnitDefinition } from '../../../src/game/units';
import { seededRandom } from '../../../src/ai/runtime';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import {
  GAMMA_Q16,
  PST_HORIZON,
  PST_MINE,
  RENT_PV,
  RESERVE_VALUES,
  materialSumOf,
  projectedIncome,
  pstMine,
  pstSumOf,
  rentCc,
  upkeepDue,
} from '../../../src/ai/hard/core/income';
import { Replica } from '../../../src/ai/hard/core/state';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { randomState, buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.2 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const CORPUS_DIR = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions');

function defId(id: string): number {
  return DEF_INDEX.get(id) as number;
}

describe('core/income.ts', () => {
  it('GAMMA_Q16 is round(0.9^t * 65536) for t = 0..12', () => {
    expect(GAMMA_Q16.length).toBe(PST_HORIZON + 1);
    expect(GAMMA_Q16[0]).toBe(65536);
    expect([...GAMMA_Q16]).toEqual([65536, 58982, 53084, 47776, 42998, 38698, 34829, 31346, 28211, 25390, 22851, 20566, 18509]);
  });

  it('PST_MINE reproduces current mining values (Metal v2.9)', () => {
    const row = (id: string, reserve: number): number => pstMine(defId(id), reserve);
    expect([row('fire_1', 16), row('water_1', 16), row('plant_1', 16), row('plant_2', 16), row('plant_3', 16), row('metal_3', 16)])
      .toEqual([646, 1025, 1159, 1285, 1368, 1285]);
    expect([row('fire_1', 8), row('water_1', 8), row('plant_1', 8), row('plant_2', 8), row('plant_3', 8), row('metal_3', 8)])
      .toEqual([513, 619, 659, 693, 720, 693]);
    expect([row('fire_1', 4), row('water_1', 4), row('plant_1', 4), row('plant_2', 4), row('plant_3', 4), row('metal_3', 4)])
      .toEqual([310, 342, 351, 360, 360, 360]);
    for (let r = 0; r <= 16; r++) {
      expect(row('lightning_1', r)).toBe(0);
      expect(row('lightning_2', r)).toBe(0);
      expect(row('lightning_3', r)).toBe(0);
    }
  });

  it('PST_MINE is the discounted mining stream and carries no rent term', () => {
    for (const [id, def] of DEF_INDEX) {
      const mine = getUnitDefinition(id).mining;
      for (let r = 0; r < RESERVE_VALUES; r++) {
        let acc = 0;
        let left = r;
        for (let t = 1; t <= PST_HORIZON; t++) {
          const take = Math.min(mine, left);
          left -= take;
          acc += GAMMA_Q16[t] * take * 100;
        }
        expect(PST_MINE[def * RESERVE_VALUES + r]).toBe((acc + 32768) >> 16);
      }
      // A no-rent table is monotone non-decreasing in the reserve and zero at 0.
      expect(pstMine(def, 0)).toBe(0);
      for (let r = 1; r < RESERVE_VALUES; r++) expect(pstMine(def, r)).toBeGreaterThanOrEqual(pstMine(def, r - 1));
    }
    // metal_3 (tier 3, rent 2) still scores strictly positively at reserve 16:
    // a rent-bearing PST would have subtracted 2 * RENT_PV = 844 from 1285.
    expect(pstMine(defId('metal_3'), 16)).toBe(1285);
    expect(RENT_PV).toBe(422);
  });

  it('projectedIncome and upkeepDue are exact on every authored and fuzz corpus position', () => {
    const positions = [
      ...readPositions(path.join(CORPUS_DIR, 'authored.jsonl')),
      ...readPositions(path.join(CORPUS_DIR, 'fuzz-1000.jsonl')),
    ];
    expect(positions.length).toBeGreaterThan(1000);
    let rentSeen = 0;
    for (const stored of positions) {
      const p = replica.pack(stored.state);
      for (const [side, player] of [[0, 'white'], [1, 'black']] as const) {
        expect(projectedIncome(p, side)).toBe(canonicalIncome(stored.state, player));
        const due = canonicalUpkeep(stored.state, player);
        expect(upkeepDue(p, side)).toBe(due);
        expect(rentCc(p, side)).toBe(due * RENT_PV);
        if (due > 0) rentSeen++;
      }
    }
    expect(rentSeen).toBeGreaterThan(50);
  });

  it('projectedIncome and upkeepDue are exact on random boards', () => {
    const rng = seededRandom(0x494e434f);
    for (let i = 0; i < 3000; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 14));
      const p = replica.pack(state);
      expect(projectedIncome(p, 0)).toBe(canonicalIncome(state, 'white'));
      expect(projectedIncome(p, 1)).toBe(canonicalIncome(state, 'black'));
      expect(upkeepDue(p, 0)).toBe(canonicalUpkeep(state, 'white'));
      expect(upkeepDue(p, 1)).toBe(canonicalUpkeep(state, 'black'));
    }
  });

  it('income is capped by the cell reserve, not by the mining stat', () => {
    // plant_3 mines 8 but the corridor cells hold 0 and a "4" cell holds 4.
    const state = buildState({
      units: [
        { def: 'plant_3', owner: 'white', x: 4, y: 1 }, // corridor: reserve 0
        { def: 'plant_3', owner: 'black', x: 0, y: 3 }, // reserve 4
        { def: 'plant_3', owner: 'black', x: 7, y: 1 }, // reserve 16
      ],
    });
    const p = replica.pack(state);
    expect(p.reserve[14]).toBe(0);
    expect(projectedIncome(p, 0)).toBe(0);
    expect(projectedIncome(p, 1)).toBe(4 + 8);
  });

  it('pstSumOf and materialSumOf are the invariants pack maintains', () => {
    const rng = seededRandom(0x50535453);
    for (let i = 0; i < 500; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 12));
      const p = replica.pack(state);
      expect(p.pstSumCc[0]).toBe(pstSumOf(p, 0));
      expect(p.pstSumCc[1]).toBe(pstSumOf(p, 1));
      expect(p.materialCc[0]).toBe(materialSumOf(p, 0));
      expect(p.materialCc[1]).toBe(materialSumOf(p, 1));
      let material = 0;
      for (const u of state.board.units) if (u.owner === 'white') material += getUnitDefinition(u.definitionId).cost * 100;
      expect(p.materialCc[0]).toBe(material);
      let rent = 0;
      for (const u of state.board.units) if (u.owner === 'black') rent += unitUpkeep(u);
      expect(upkeepDue(p, 1)).toBe(rent);
    }
  });
});
