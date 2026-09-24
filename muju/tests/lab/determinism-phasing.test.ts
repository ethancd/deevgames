// @vitest-environment node
/**
 * Strategos W1.11: the Phasing determinism corpus
 * (`lab/hard-ai/positions/p4-determinism.jsonl`) and its `--positions-file`
 * flag on `lab/hard-ai/verify/determinism.ts`.
 *
 * Four things this checks, matching the plan's acceptance clause verbatim:
 *   1. the corpus loads;
 *   2. every position is a valid, in-progress Phasing state under the live
 *      rules revision (never a state the clock has already ended);
 *   3. it parses with the SAME loader `determinism.ts` uses — proven by
 *      running the real CLI, not a re-implementation of its reader;
 *   4. a short determinism check (small work budget, few positions) passes
 *      for `hard@desktop`.
 * Plus the corpus's own shape guarantees (Part B.2's "positions" bullet):
 * spread across the kill clock's range, several rows at `inactivityPlies`
 * >= 5, a couple at 8-9, and a few with a legal ATTACK on the board (units in
 * contact) — checked by REPLAYING legality (`lab/harness/legal.ts`), not by
 * trusting this file's own tags, so a stale tag would fail loudly.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { readPositions } from '../../lab/hard-ai/positions/corpus';
import { checkInvariants } from '../../lab/harness/invariants';
import { legalActions } from '../../lab/harness/legal';
import { INACTIVITY_LIMIT } from '../../src/game/inactivity';
import { setElementGraph } from '../../src/game/elements';
import { setUpkeepVariant } from '../../src/game/upkeep';
import { setCombatHandicap, resetCombatHandicap } from '../../src/game/combat';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const CORPUS_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/positions/p4-determinism.jsonl');
const DETERMINISM_SCRIPT = path.resolve(REPO_ROOT, 'lab/hard-ai/verify/determinism.ts');

describe('p4-determinism corpus (Strategos W1.11)', () => {
  it('loads: 24 muju-position-v1 rows, distinct ids', () => {
    const positions = readPositions(CORPUS_PATH);
    expect(positions).toHaveLength(24);
    for (const p of positions) {
      expect(p.schema).toBe('muju-position-v1');
      expect(p.id).toMatch(/^p4-det-\d{3}$/);
    }
    expect(new Set(positions.map(p => p.id)).size).toBe(positions.length);
  });

  it('every position is a valid, in-progress Phasing state under the live rules revision', () => {
    const positions = readPositions(CORPUS_PATH);
    for (const p of positions) {
      expect(p.state.ruleset, p.id).toBe('phasing');
      // A stored decision point is always mid-game: the clock has not fired
      // (it would have ended the game, `phase !== 'playing'`), and it is
      // strictly below the limit that would fire it on the NEXT hand-off.
      expect(p.state.phase, p.id).toBe('playing');
      expect(p.state.inactivityPlies ?? 0, p.id).toBeLessThan(INACTIVITY_LIMIT);
      expect(p.rules.elementGraph, p.id).toBe('double-thick');
      expect(p.rules.upkeep, p.id).toBe('shipped');
      expect(p.rules.inactivityRule, p.id).toBe('on');
      expect(p.rules.victoryRule, p.id).toBe('home-or-elimination');
      // `checkInvariants` is the harness's own per-action check (occupancy,
      // resource conservation, pending-summon shape); every position here was
      // already checked once when it was generated, so this is a REPLAY of
      // that guarantee against the committed bytes, not a first-time check.
      expect(() => checkInvariants(p.state, p.id)).not.toThrow();
    }
  });

  it('spans the kill clock: several rows at inactivityPlies >= 5, a couple at 8-9', () => {
    const positions = readPositions(CORPUS_PATH);
    const clocks = positions.map(p => p.state.inactivityPlies ?? 0);
    expect(Math.min(...clocks)).toBeLessThanOrEqual(1);
    expect(Math.max(...clocks)).toBeGreaterThanOrEqual(8);
    const atLeast5 = clocks.filter(c => c >= 5);
    expect(atLeast5.length).toBeGreaterThanOrEqual(6);
    const edge = clocks.filter(c => c === 8 || c === 9);
    expect(edge.length).toBeGreaterThanOrEqual(2);
  });

  it('has a few positions with units genuinely in contact — a legal ATTACK, not just a tag', () => {
    const positions = readPositions(CORPUS_PATH);
    const tagged = positions.filter(p => p.tags?.includes('contact'));
    expect(tagged.length).toBeGreaterThanOrEqual(3);
    for (const p of tagged) {
      setElementGraph(p.rules.elementGraph);
      setUpkeepVariant(p.rules.upkeep);
      setCombatHandicap('white', p.rules.combatHandicap.white);
      setCombatHandicap('black', p.rules.combatHandicap.black);
      try {
        const legal = legalActions(p.state, p.state.turn.currentPlayer);
        expect(legal.some(a => a.type === 'ATTACK'), p.id).toBe(true);
      } finally {
        setElementGraph('double-thick');
        setUpkeepVariant('shipped');
        resetCombatHandicap();
      }
    }
    // And the converse, on a handful of the non-contact rows: this corpus
    // should not accidentally have made EVERY position a contact position.
    const untagged = positions.filter(p => !p.tags?.includes('contact')).slice(0, 5);
    for (const p of untagged) {
      setElementGraph(p.rules.elementGraph);
      setUpkeepVariant(p.rules.upkeep);
      setCombatHandicap('white', p.rules.combatHandicap.white);
      setCombatHandicap('black', p.rules.combatHandicap.black);
      try {
        const legal = legalActions(p.state, p.state.turn.currentPlayer);
        expect(legal.some(a => a.type === 'ATTACK'), p.id).toBe(false);
      } finally {
        setElementGraph('double-thick');
        setUpkeepVariant('shipped');
        resetCombatHandicap();
      }
    }
  });

  it(
    'hard@desktop passes a short determinism check on this corpus, via --positions-file (the real CLI, same loader)',
    () => {
      const outPath = path.join(os.tmpdir(), `p4-determinism-test-${process.pid}-${Date.now()}.json`);
      try {
        const stdout = execFileSync(
          process.execPath,
          [
            '--import', 'tsx', DETERMINISM_SCRIPT,
            '--engine', 'hard@desktop',
            '--work', '2000',
            '--positions-file', CORPUS_PATH,
            '--positions', '3', // small work budget, 2-3 positions (plan's acceptance wording)
            '--shards', '1',
            '--out', outPath,
          ],
          { cwd: REPO_ROOT, encoding: 'utf8' },
        );
        expect(stdout).toContain('"identical":true');
        const written = JSON.parse(fs.readFileSync(outPath, 'utf8')) as {
          determinism: { identical: boolean; decisions: number; mismatches: unknown[] };
        };
        expect(written.determinism.identical).toBe(true);
        expect(written.determinism.decisions).toBe(3);
        expect(written.determinism.mismatches).toHaveLength(0);
      } finally {
        fs.rmSync(outPath, { force: true });
      }
    },
    30_000, // subprocess spin-up (tsx) + 3 in-process runs + 1 fresh-process run; still seconds, not minutes.
  );
});
