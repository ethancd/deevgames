// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { summarize, summaryToCsv } from '../../lab/harness/summary';
import { sanityBands } from '../../lab/harness/phasing-round-robin';
import { HARNESS_RULES_VERSION, type GameRecord } from '../../lab/harness/types';

const root = path.resolve(import.meta.dirname, '../..');

/**
 * The scripted reference campaigns, one per rules revision.
 *
 * `p1-scripted-2026-09-18` is the T1 reference, and the bands Gate 1 was to be
 * judged against until preregistration amendment A4 (2026-09-19) moved the
 * inactivity draw clock from 10 plies to 20. The draw rate is a direct function
 * of that clock, so A4 voided the row and the bands frozen from it, and
 * `p2-scripted-2026-09-19` replaces them: same fifteen bots, same seed 20260955
 * and seed derivation, same mirroring, same h0/h3, same 840 games, same band
 * FORMULA — only the rule underneath was re-measured.
 *
 * BOTH directories keep full coverage. Voiding a row for POOLING does not make
 * it acceptable for its stored summary to stop matching its stored games: it is
 * still evidence, and it still has to re-derive from its own raw records.
 */
const CAMPAIGNS = [
  { dir: 'lab/harness/results/p1-scripted-2026-09-18', rulesVersion: 'muju-phasing-1', current: false },
  { dir: 'lab/harness/results/p2-scripted-2026-09-19', rulesVersion: 'muju-phasing-2', current: true },
] as const;

/**
 * The `lab/harness/**` files amendment A4 changed, and why each one had to move.
 *
 * The 2026-09-18 manifest pinned the harness bytes that produced its 840 games.
 * Those bytes are history and are never edited, but the tree moved on, so a
 * bare "current bytes equal archived hash" check would now fail on the archive
 * for reasons that are correct. It is not relaxed into silence: every harness
 * file must STILL match its archived hash unless it is named here, and this
 * list must be exactly the set that differs — an undeclared harness edit fails
 * this test as loudly as before, and a declared one that turns out not to
 * differ fails too.
 */
const A4_HARNESS_EDITS: Record<string, string> = {
  'lab/harness/types.ts':
    'holds HARNESS_RULES_VERSION, the single source of the rules revision, now muju-phasing-2; GameRecord.rulesVersion widened so both revisions can be read',
  'lab/harness/runner.ts':
    'stamps HARNESS_RULES_VERSION on every GameRecord instead of a hard-coded muju-phasing-1 string',
  'lab/harness/phasing-round-robin.ts':
    'defaults to the p2 results directory, takes its run id from that directory, records the inactivity limit in the manifest and re-checks source identity after the run; the band formula is untouched',
};

describe.each(CAMPAIGNS)('scripted reference $dir', ({ dir: relDir, rulesVersion, current }) => {
  const dir = path.join(root, relDir);
  const records = (): GameRecord[] =>
    fs.readFileSync(path.join(dir, 'games.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));

  it('re-derives the frozen scripted summary and baseline bands from all 840 raw games', () => {
    const recs = records();
    expect(recs).toHaveLength(840);
    for (const r of recs) {
      expect(r.rulesVersion).toBe(rulesVersion);
      expect(r.invariantViolation).toBeNull();
      expect(r.anomalies).toEqual([]);
      expect(r.adjudicated).toBe(false);
      expect(r.players.white.illegalActions + r.players.black.illegalActions).toBe(0);
    }
    const rows = summarize(recs);
    expect(rows).toHaveLength(210);
    expect(rows.every(r => r.games === 4 && r.gamesAasWhite === 2 && r.gamesAasBlack === 2)).toBe(true);
    expect(summaryToCsv(rows)).toBe(fs.readFileSync(path.join(dir, 'summary.csv'), 'utf8'));
    expect(sanityBands(recs)).toEqual(JSON.parse(fs.readFileSync(path.join(dir, 'sanity-bands.json'), 'utf8')));
  });

  /**
   * A campaign is one population or it is not a reference. These are the
   * properties that make its 840 rows comparable with each other — and, field
   * by field, comparable with the other revision's campaign, which is the only
   * reason "the draw rate fell from 49.5% to 27.0%" is a statement about the
   * RULE rather than about two differently-run experiments.
   */
  it('is one homogeneous population: one revision, one run id, one seed policy, one set of bots', () => {
    const recs = records();
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    expect(manifest.rulesVersion).toBe(rulesVersion);
    expect([...new Set(recs.map(r => r.rulesVersion))]).toEqual([rulesVersion]);
    expect(manifest.seed).toBe(20260955);
    expect(manifest.bots).toHaveLength(15);
    expect(manifest.handicaps).toEqual([0, 3]);
    expect(manifest.mirrored).toBe(true);
    expect(manifest.repeats).toBe(2);
    // The band formula is the part A4 forbade changing between references.
    expect(manifest.bandRule).toBe(
      'purchase per seat [0.5 * minimum L2/h mean, 2 * maximum L2/h mean]; inactivity [0, min(1, max L2/h Wilson95 upper + .05)]',
    );
    // The manifest is written BEFORE the first game, so no band can have been
    // fitted to a result that did not exist yet.
    const totals = JSON.parse(fs.readFileSync(path.join(dir, 'totals.json'), 'utf8'));
    expect(Date.parse(manifest.startedAt)).toBeLessThan(Date.parse(totals.completedAt));
    expect(totals.games).toBe(840);
    expect(totals.illegalActions).toBe(0);
    expect(totals.invariantFailures).toBe(0);
    expect(totals.adjudications).toBe(0);
    expect(totals.inactivityDraws).toBe(recs.filter(r => r.inactivityDraw).length);
  });

  it('pins the harness and canonical source bytes used for the scripted campaign', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const moved: string[] = [];
    for (const [file, hash] of Object.entries(manifest.sources as Record<string, string>)) {
      // Other lanes port AI code. Canonical/harness hashes bind THIS row,
      // while future engine hashes are naturally allowed to change.
      if (!file.startsWith('lab/harness/')) continue;
      const live = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
      if (live === hash) continue;
      // The CURRENT reference must match the tree exactly: its bands describe
      // this harness, and a drifted harness means they were frozen from
      // something that no longer exists and the campaign owes a re-run. A
      // superseded reference may differ only where A4 says it does.
      expect(current ? undefined : A4_HARNESS_EDITS[file], `${relDir}: ${file} drifted from its manifest`).toBeDefined();
      moved.push(file);
    }
    // Exactly the declared set for the superseded row: nothing silently added,
    // nothing declared that did not actually move.
    if (current) expect(moved).toEqual([]);
    else expect(moved.sort()).toEqual(Object.keys(A4_HARNESS_EDITS).sort());
  });

  if (current) {
    /**
     * Only the current reference makes a claim about THIS tree, so only it can
     * be held against the live constants and the live revision.
     */
    it('is the reference this tree plays under, measured at the clock this tree enforces', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const totals = JSON.parse(fs.readFileSync(path.join(dir, 'totals.json'), 'utf8'));
      expect(manifest.rulesVersion).toBe(HARNESS_RULES_VERSION);
      expect(manifest.inactivity).toEqual({ limitPlies: 20, warningPlies: 17, resetBy: 'an attack that removes a unit' });
      expect(manifest.runId).toBe(path.basename(dir));
      // No source that decides a scripted game moved while the 840 games ran,
      // in a worktree several lanes were editing at the time.
      expect(totals.changedDuringRun).toEqual([]);
      const recs = records();
      expect([...new Set(recs.map(r => r.runId))]).toEqual([path.basename(dir)]);
      // No game outlived the clock it was played under, and every inactivity
      // draw fired exactly at it rather than early or late.
      for (const r of recs) expect(r.maxInactivityPlies ?? 0, `seed ${r.seed}`).toBeLessThanOrEqual(20);
      for (const r of recs.filter(x => x.inactivityDraw)) expect(r.maxInactivityPlies, `seed ${r.seed}`).toBe(20);
    });
  }
});
