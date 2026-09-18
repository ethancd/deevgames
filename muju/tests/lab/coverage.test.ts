// @vitest-environment node
/**
 * `lab/hard-ai/coverage/run.ts` — E2.2's stage-trace tool.
 *
 * Two things are pinned here. First the ladder itself: `firstRemovingStage`
 * must name the EARLIEST rung that dropped the target, so a target absent from
 * the beam because its combo was cut reports `combo`, not `beam`. Second the
 * committed artifacts under `lab/results/hard-ai-e2/coverage/`, which the
 * report quotes: their schema, their cones, and that every histogram sums to
 * the row count it claims.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AKind, paMake } from '../../src/ai/hard/core/action';
import { firstRemovingStage, newGenTrace, resetGenTrace, GenStage } from '../../src/ai/hard/gen/trace';

const RESULTS = path.resolve(import.meta.dirname, '../../lab/results/hard-ai-e2/coverage');
const RUNS = ['e1.1-losses', 'e1.1-losses-v2', 'recall-replies'];

describe('gen/trace: the stage ladder', () => {
  it('reports PRESENT whenever the target is in the returned list', () => {
    const tr = newGenTrace();
    resetGenTrace(tr, 1, 2);
    // Every earlier rung says "absent"; presence in the final list wins anyway,
    // because a target that came out cannot have been removed.
    tr.beamReached = 0;
    tr.finalRank = 7;
    expect(firstRemovingStage(tr)).toBe(GenStage.PRESENT);
  });

  it('reports the earliest absent rung, not the latest', () => {
    const tr = newGenTrace();
    const line = Int32Array.from([1, 2, 3]);
    resetGenTrace(tr, 1, 2, line, line.length);
    tr.planRank = 3;
    tr.comboRank = -1;
    tr.beamReached = 0;
    // The combo was cut, so the beam never had a chance: `combo`, not `beam`.
    expect(firstRemovingStage(tr)).toBe(GenStage.COMBO);
  });

  it('separates the beam from the per-plan keep and from K', () => {
    const tr = newGenTrace();
    resetGenTrace(tr, 1, 2);
    expect(firstRemovingStage(tr)).toBe(GenStage.BEAM);
    tr.beamReached = 1;
    expect(firstRemovingStage(tr)).toBe(GenStage.KEEP);
    tr.beamEmitted = 1;
    expect(firstRemovingStage(tr)).toBe(GenStage.FINAL_K);
  });

  it('calls a two-promotion target unrepresentable', () => {
    const tr = newGenTrace();
    const line = Int32Array.from([paMake(AKind.PROMOTE, 1), paMake(AKind.PROMOTE, 2)]);
    resetGenTrace(tr, 1, 2, line, line.length);
    expect(tr.targetPromoCount).toBe(2);
    expect(tr.multiPromotion).toBe(1);
    expect(firstRemovingStage(tr)).toBe(GenStage.PROMOTION);
  });
});

describe('E2.2 coverage artifacts', () => {
  for (const run of RUNS) {
    it(`${run}: the committed result is well formed`, () => {
      const file = path.join(RESULTS, run, 'coverage.json');
      expect(fs.existsSync(file)).toBe(true);
      const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        summary: {
          schema: string;
          rows: number;
          rootRows: number;
          replyRows: number;
          cones: { root: string; reply: string };
          histogram: { all: Record<string, number>; root: Record<string, number>; reply: Record<string, number> };
        };
        rows: { kind: string; cone: string; ply: number; stage: string; searched: null }[];
      };
      const s = doc.summary;
      expect(s.schema).toBe('muju-lab-coverage-v1');
      expect(s.cones).toEqual({ root: 'DESKTOP.gen', reply: 'DESKTOP.genInterior' });
      expect(doc.rows.length).toBe(s.rows);
      expect(s.rootRows + s.replyRows).toBe(s.rows);
      const sum = (h: Record<string, number>): number => Object.values(h).reduce((a, b) => a + b, 0);
      expect(sum(s.histogram.all)).toBe(s.rows);
      expect(sum(s.histogram.root)).toBe(s.rootRows);
      expect(sum(s.histogram.reply)).toBe(s.replyRows);
      for (const row of doc.rows) {
        // The cone a row was measured with must match the node it measured.
        expect(row.ply).toBe(row.kind === 'root' ? 0 : 1);
        expect(row.cone).toBe(row.kind === 'root' ? 'root:DESKTOP.gen' : 'reply:DESKTOP.genInterior');
        // The SEARCH rung is lane 1's; it stays null until that merge.
        expect(row.searched).toBeNull();
      }
    });
  }

  it('the reply-node verdict the report quotes is in the data', () => {
    const file = path.join(RESULTS, 'recall-replies', 'coverage.json');
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      summary: { histogram: { reply: Record<string, number> } };
    };
    const h = doc.summary.histogram.reply;
    // At reply nodes the action beam removes the reference-best turn; K removes none.
    expect(h['beam'] ?? 0).toBeGreaterThan(0);
    expect(h['final-k'] ?? 0).toBe(0);
  });
});
