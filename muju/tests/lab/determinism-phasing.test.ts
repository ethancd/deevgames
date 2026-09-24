// @vitest-environment node
/**
 * Strategos W1.11: the Phasing determinism corpus
 * (`lab/hard-ai/positions/p4-determinism.jsonl`) and its `--positions-file`
 * flag on `lab/hard-ai/verify/determinism.ts`.
 *
 * What this checks, against the plan's acceptance clause:
 *   1. the corpus loads, with the same `readPositions` loader `determinism.ts`
 *      uses;
 *   2. every row is a valid, in-progress Phasing Act root under the live rules
 *      revision — checked three independent ways: the harness's invariants,
 *      the engine's own replica (`Replica.pack` + ET §8.6 `check` + a
 *      pack/unpack round trip on the fuzzer's digest surface), and by
 *      REGENERATING the corpus from its documented recipe under today's rules
 *      and requiring the committed bytes back (modulo `createUnit`'s minted id
 *      spelling, see the generator's header);
 *   3. the corpus's shape claims (plan B.2: spread across the kill clock,
 *      several at `inactivityPlies >= 5`, a couple at 8-9, a few in contact)
 *      hold, with every tag re-derived from the state and from legality
 *      (`lab/harness/legal.ts`) rather than trusted;
 *   4. a short determinism check passes for `hard@desktop` through the real
 *      CLI on rows chosen for the late clock and contact, not the opening
 *      roots that head the file;
 *   5. the flag-absent path keeps its contract (`--positions` still required)
 *      and the flag refuses a selection that would pass vacuously.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, readPositions, writePositions, type RulesBlock, type StoredPosition } from '../../lab/hard-ai/positions/corpus';
import { P4_DETERMINISM_PATH, P4_DETERMINISM_SIZE, buildP4DeterminismCorpus } from '../../lab/hard-ai/positions/generate-p4-determinism';
import { checkInvariants } from '../../lab/harness/invariants';
import { legalActions } from '../../lab/harness/legal';
import { INACTIVITY_LIMIT } from '../../src/game/inactivity';
import { setElementGraph } from '../../src/game/elements';
import { setUpkeepVariant } from '../../src/game/upkeep';
import { setCombatHandicap, resetCombatHandicap } from '../../src/game/combat';
import type { GameState } from '../../src/game/types';
import { Replica } from '../../src/ai/hard/core/state';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const DETERMINISM_SCRIPT = path.resolve(REPO_ROOT, 'lab/hard-ai/verify/determinism.ts');

/** Runs `fn` under a row's process-global rules, restoring the defaults after. */
function underRules<T>(rules: RulesBlock, fn: () => T): T {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
  try {
    return fn();
  } finally {
    setElementGraph('double-thick');
    setUpkeepVariant('shipped');
    resetCombatHandicap();
  }
}

function hasLegalAttack(p: StoredPosition): boolean {
  return underRules(p.rules, () => legalActions(p.state, p.state.turn.currentPlayer).some(a => a.type === 'ATTACK'));
}

function tagValue(p: StoredPosition, key: string): string | undefined {
  return p.tags?.find(t => t.startsWith(`${key}:`))?.slice(key.length + 1);
}

/** `src/game/board.ts#createUnit`'s id: `${owner}_${definitionId}_${Date.now()}_${base36}`. */
const MINTED_ID = /"(?:white|black)_[A-Za-z0-9_]+?_\d{10,}_[a-z0-9]*"/g;

/** One row's JSON with every minted unit id replaced by its order of first
 * appearance, so two rows compare equal exactly when they differ only in how
 * the ids were spelled — which unit each reference points at still counts. */
function canonicalRow(p: StoredPosition): string {
  const names = new Map<string, string>();
  return JSON.stringify(p).replace(MINTED_ID, id => {
    if (!names.has(id)) names.set(id, `"#${names.size}"`);
    return names.get(id)!;
  });
}

/** Spawns the real CLI; returns its exit code, stdout and stderr. */
function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', DETERMINISM_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function tmpPath(stem: string, ext: string): string {
  return path.join(os.tmpdir(), `${stem}-${process.pid}-${Math.floor(Math.random() * 1e9)}.${ext}`);
}

describe('p4-determinism corpus (Strategos W1.11)', () => {
  const positions = readPositions(P4_DETERMINISM_PATH);

  it('loads: the documented number of muju-position-v1 rows, ids in slot order', () => {
    expect(positions).toHaveLength(P4_DETERMINISM_SIZE);
    expect(P4_DETERMINISM_SIZE).toBe(24);
    positions.forEach((p, i) => {
      expect(p.schema).toBe('muju-position-v1');
      expect(p.id).toBe(`p4-det-${String(i).padStart(3, '0')}`);
    });
  });

  it('every row is an in-progress Phasing Act root the harness and the engine replica both accept', () => {
    const replica = new Replica();
    for (const p of positions) {
      const s: GameState = p.state;
      expect(p.rules, p.id).toEqual(DEFAULT_RULES);
      expect(s.ruleset, p.id).toBe('phasing');
      // Mid-game, and the clock has not fired: `phase` would be 'victory' if it
      // had, and `inactivityPlies < INACTIVITY_LIMIT` keeps it from firing
      // before this turn's hand-off.
      expect(s.phase, p.id).toBe('playing');
      expect(s.inactivityPlies ?? 0, p.id).toBeLessThan(INACTIVITY_LIMIT);
      // A FRESH Act root: the start of a turn, the position `searchTurn` is
      // handed at every engine turn and the one Strategos reads its clock on.
      expect(s.turn.phase, p.id).toBe('action');
      expect(s.turn.actionsRemaining, p.id).toBe(s.actionsPerTurn);
      expect(s.progressThisTurn, p.id).toBe(false);
      expect(s.upkeepPending, p.id).toBe(false);
      // The mover's units are fresh (the opponent's keep last turn's flags until their own turn).
      expect(s.board.units.filter(u => u.owner === s.turn.currentPlayer && (u.hasMoved || u.hasAttacked)), p.id).toEqual([]);
      expect(() => checkInvariants(s, p.id)).not.toThrow();
      underRules(p.rules, () => {
        const packed = replica.pack(s);
        expect(() => replica.check(packed), p.id).not.toThrow();
        expect(replica.digest(replica.pack(replica.unpack(packed))), p.id).toBe(replica.digest(packed));
      });
    }
  });

  it('is exactly what its documented recipe produces under the live rules (modulo minted unit ids)', async () => {
    const regenerated = await buildP4DeterminismCorpus();
    expect(regenerated.map(p => p.id)).toEqual(positions.map(p => p.id));
    // A guard on the canonicaliser itself: if `createUnit`'s id format ever
    // changed, MINTED_ID would stop matching and this test would compare raw
    // timestamps (and fail on every run) instead of silently passing.
    expect(canonicalRow(positions[0])).not.toMatch(/_\d{13}_/);
    for (let i = 0; i < positions.length; i++) {
      expect(
        canonicalRow(regenerated[i]),
        `${positions[i].id} drifted from its recipe; regenerate with ` +
          '`node --import tsx lab/hard-ai/positions/generate-p4-determinism.ts` and review the diff',
      ).toBe(canonicalRow(positions[i]));
    }
  });

  it('spans the kill clock, with every clock and bucket tag re-derived from the state', () => {
    for (const p of positions) {
      expect(tagValue(p, 'clock'), p.id).toBe(String(p.state.inactivityPlies ?? 0));
      expect(['root', 'mid', 'high', 'edge', 'contact'], p.id).toContain(tagValue(p, 'bucket'));
    }
    const clocks = positions.map(p => p.state.inactivityPlies ?? 0);
    expect(Math.min(...clocks)).toBeLessThanOrEqual(1);
    expect(clocks.filter(c => c >= 5).length).toBeGreaterThanOrEqual(6); // "several with inactivity clock >= 5"
    expect(clocks.filter(c => c === 8 || c === 9).length).toBeGreaterThanOrEqual(2); // "a couple at 8-9"
    expect(clocks).toContain(INACTIVITY_LIMIT - 1); // the last kill-free turn itself
  });

  it('tags `contact` on exactly the rows whose side to move has a legal ATTACK, early and late on the clock', () => {
    const contact: StoredPosition[] = [];
    for (const p of positions) {
      const legal = hasLegalAttack(p);
      expect(p.tags?.includes('contact') ?? false, `${p.id}: contact tag vs legal ATTACK`).toBe(legal);
      if (tagValue(p, 'bucket') === 'contact') expect(legal, p.id).toBe(true);
      if (legal) contact.push(p);
    }
    expect(contact.length).toBeGreaterThanOrEqual(3); // "a few with units in contact"
    const contactClocks = contact.map(p => p.state.inactivityPlies ?? 0);
    expect(Math.min(...contactClocks)).toBeLessThanOrEqual(3);
    expect(Math.max(...contactClocks)).toBeGreaterThanOrEqual(8);
    // Both movers appear, so a side-dependent path is not exercised from one seat only.
    expect(new Set(contact.map(p => p.state.turn.currentPlayer)).size).toBe(2);
  });

  it(
    'hard@desktop passes a short determinism check via --positions-file on late-clock and contact rows',
    () => {
      // Three rows the later Strategos paths care about most: the last
      // kill-free turn with no contact, the last kill-free turn WITH contact,
      // and the most crowded contact row. Written to a subset file so the CLI
      // reads them through `--positions-file` with `--positions` omitted,
      // which also exercises the "every row in the file" default.
      const byClockDesc = [...positions].sort((a, b) => (b.state.inactivityPlies ?? 0) - (a.state.inactivityPlies ?? 0));
      const lateQuiet = byClockDesc.find(p => !p.tags?.includes('contact'))!;
      const lateContact = byClockDesc.find(p => p.tags?.includes('contact'))!;
      const crowdedContact = positions
        .filter(p => p.tags?.includes('contact') && p !== lateContact)
        .sort((a, b) => b.state.board.units.length - a.state.board.units.length)[0];
      const subset = [lateQuiet, lateContact, crowdedContact];
      expect(new Set(subset.map(p => p.id)).size).toBe(3);
      expect(lateQuiet.state.inactivityPlies).toBe(INACTIVITY_LIMIT - 1);
      expect(lateContact.state.inactivityPlies ?? 0).toBeGreaterThanOrEqual(8);

      const subsetPath = tmpPath('p4-determinism-subset', 'jsonl');
      const outPath = tmpPath('p4-determinism-test', 'json');
      try {
        writePositions(subsetPath, subset);
        const run = runCli(['--engine', 'hard@desktop', '--work', '2000', '--positions-file', subsetPath, '--shards', '1', '--out', outPath]);
        expect(run.code, run.stderr).toBe(0);
        expect(run.stdout).toContain('"identical":true');
        const written = JSON.parse(fs.readFileSync(outPath, 'utf8')) as {
          positions: number;
          positionsFile: string;
          determinism: { identical: boolean; decisions: number; mismatches: unknown[] };
        };
        expect(written.positions).toBe(3);
        expect(path.resolve(REPO_ROOT, written.positionsFile)).toBe(subsetPath);
        expect(written.determinism.identical).toBe(true);
        expect(written.determinism.decisions).toBe(3);
        expect(written.determinism.mismatches).toHaveLength(0);
      } finally {
        fs.rmSync(subsetPath, { force: true });
        fs.rmSync(outPath, { force: true });
      }
    },
    60_000, // one tsx spawn plus its fresh-process child; about two seconds on an idle box.
  );

  it('keeps the flag-absent contract and refuses a selection that would pass vacuously', () => {
    const outPath = tmpPath('p4-determinism-refuse', 'json');
    const emptyPath = tmpPath('p4-determinism-empty', 'jsonl');
    try {
      // Without --positions-file, --positions is still required, as before W1.11.
      const noPositions = runCli(['--engine', 'hard@desktop', '--work', '2000', '--shards', '1', '--out', outPath]);
      expect(noPositions.code).not.toBe(0);
      expect(noPositions.stderr).toContain('missing --positions');
      // An empty corpus would otherwise be zero decisions and `identical: true`.
      fs.writeFileSync(emptyPath, '');
      const empty = runCli(['--engine', 'hard@desktop', '--work', '2000', '--positions-file', emptyPath, '--shards', '1', '--out', outPath]);
      expect(empty.code).not.toBe(0);
      expect(empty.stderr).toContain('selects no positions');
      expect(fs.existsSync(outPath)).toBe(false);
    } finally {
      fs.rmSync(outPath, { force: true });
      fs.rmSync(emptyPath, { force: true });
    }
  }, 60_000);
});
