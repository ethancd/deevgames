// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadOpenings, sha256 } from '../../lab/hard-ai/ladder/openings';
import { applyOpening, gameplayDigest } from '../../lab/hard-ai/ladder/openings/phasing';
import { generateOpenings, renderOpeningsFile, assertDiverse, DRIVER_BOTS } from '../../lab/hard-ai/ladder/openings/generate';
import { seededShuffle } from '../../lab/hard-ai/ladder/openings/split';

const dir = path.resolve(import.meta.dirname, '../../lab/hard-ai/ladder/openings');
const allocation = fs.readFileSync(path.join(dir, 'ALLOCATION-P1.md'), 'utf8');
// Deliberately never load or regenerate the sealed allocation.
const files = ['p1-dev.jsonl', 'p1-val.jsonl'].map(name => loadOpenings(path.join(dir, name)));

describe('P1 unsealed corpus', () => {
  it('matches pinned counts, bytes and hashes in the allocation', () => {
    for (const file of files) {
      const name = path.basename(file.path);
      const declared = allocation.split('\n').find(line => line.startsWith(`| \`${name}\` |`))!.split('|').map(x => x.trim());
      expect(file.openings).toHaveLength(Number(declared[2]));
      expect(fs.statSync(file.path).size).toBe(Number(declared[3]));
      expect(file.sha256).toBe(declared[4].replaceAll('`', ''));
    }
    expect(fs.existsSync(path.join(dir, 'p1-sealed.jsonl'))).toBe(false);
  });

  it('replays both handicaps to Black first Act, with only the bank differing', () => {
    for (const file of files) for (const opening of file.openings) {
      const h0 = applyOpening(opening);
      const h3 = applyOpening(opening, { blackCrystalHandicap: 3 });
      expect(h0.ruleset).toBe('phasing');
      expect(h0.turn).toEqual({ currentPlayer: 'black', phase: 'action', actionsRemaining: 4, turnNumber: 1 });
      expect(opening.actions.at(-1)?.type).toBe('END_PLACE_PHASE');
      expect(h3.players.black.resources - h0.players.black.resources).toBe(3);
      const normalized = { ...h3, players: { ...h3.players, black: { ...h3.players.black, resources: 0 } } };
      expect(gameplayDigest(normalized)).toBe(gameplayDigest(h0));
    }
  });

  it('has distinct IDs, pending-aware positions, and no prefix relation', () => {
    const rows = files.flatMap(f => f.openings).map(spec => ({ spec, digest: gameplayDigest(applyOpening(spec)), plies: spec.actions.length, driver: '' }));
    expect(new Set(rows.map(o => o.spec.id)).size).toBe(80);
    expect(() => assertDiverse(rows)).not.toThrow();
  });

  it('does not collide pending types/costs/squares or depend on generated IDs', () => {
    const state = files.flatMap(f => f.openings).map(o => applyOpening(o)).find(s => s.pendingSummons!.length > 0)!;
    const original = gameplayDigest(state);
    const pending = state.pendingSummons!;
    expect(gameplayDigest({ ...state, pendingSummons: [...pending].reverse().map(s => ({ ...s, id: `new-${s.id}` })) })).toBe(original);
    for (const change of [{ cost: pending[0].cost + 1 }, { definitionId: 'different' }, { position: { x: 9, y: 9 } }, { owner: 'black' as const }]) {
      expect(gameplayDigest({ ...state, pendingSummons: [{ ...pending[0], ...change }, ...pending.slice(1)] })).not.toBe(original);
    }
    expect(() => applyOpening({ id: 'e0-archive', actions: [] })).toThrow(/non-p1/);
    expect(() => gameplayDigest({ ...state, ruleset: 'standard' })).toThrow(/requires Phasing/);
  });
});

describe('P1 generator on independent test seeds', () => {
  it('is deterministic and uses the scripted driver set without an engine', () => {
    const options = { count: 16, seed: 77, idPrefix: 'p1-test-' };
    const a = generateOpenings(options), b = generateOpenings(options);
    expect(sha256(renderOpeningsFile(a.openings))).toBe(sha256(renderOpeningsFile(b.openings)));
    expect(new Set(a.openings.map(o => o.driver))).toEqual(new Set(DRIVER_BOTS));
    const rows = a.openings.map(o => o.spec);
    expect(seededShuffle(rows, 88)).toEqual(seededShuffle(rows, 88));
    expect(rows).toEqual(a.openings.map(o => o.spec));
  });
});
