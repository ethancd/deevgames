// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  applyOpening,
  gameplayDigest,
  loadOpenings,
  validateOpenings,
  type OpeningSpec,
} from '../../lab/hard-ai/ladder/openings';
import {
  REQUIRED_HANDICAPS,
  assertDiverse,
  generateOpenings,
  loadExclusions,
  parseArgs,
  renderOpeningSpecs,
} from '../../lab/hard-ai/ladder/openings/generate';
import {
  BASELINE_SIZE,
  E0_BASELINE_INDICES,
  E0_E1_1_INDICES,
  E0_PILOT_INDICES,
  E1_SEED,
  FILE_NAMES,
  buildAllocation,
  renderAllocation,
  seededShuffle,
  splitShuffled,
} from '../../lab/hard-ai/ladder/openings/split';

/**
 * The frozen E1 opening allocation (AMENDMENTS-DECIDED A15 and "Two E1
 * decisions taken with these"; EPIC-PLAN E1.2). `ALLOCATION.md` is the freeze;
 * this file is what makes the freeze checkable. Every number the document
 * states about the committed bytes is PARSED OUT OF THE DOCUMENT and compared
 * with the bytes, so an edit to either side that is not made to both fails
 * here rather than at the first preregistered pair.
 *
 * Cost: the regeneration case rebuilds the whole 112-opening pool in-process
 * (1,056 candidates replayed through the real rules) and re-runs the split.
 * Measured at 118 ms of the file's 165 ms of test time on an M2 Max, so it
 * needs no separate budget. The timeout below is a wide guard, not a
 * measurement.
 */
vi.setConfig({ testTimeout: 60_000 });

const DIR = path.resolve(__dirname, '../../lab/hard-ai/ladder/openings');
const ALLOCATION = path.join(DIR, 'ALLOCATION.md');
const README = path.join(DIR, 'README.md');
const E0 = 'e0-openings.jsonl';

/** Files whose rows are the allocation itself. `e1-baseline.jsonl` is a copy of rows from two of them, so it is not a source of new positions. */
const VAL2 = 'e1-val2.jsonl';
const POOL_FILES = [E0, FILE_NAMES.dev, FILE_NAMES.val, FILE_NAMES.sealed, VAL2] as const;
const ALL_FILES = [...POOL_FILES, FILE_NAMES.baseline] as const;

interface DeclaredFile {
  name: string;
  rows: number;
  bytes: number;
  sha256: string;
}

/** Reads ALLOCATION.md's "Files" table. The document is the source of these numbers; the test never restates them. */
function declaredFiles(): Map<string, DeclaredFile> {
  const text = fs.readFileSync(ALLOCATION, 'utf8');
  const out = new Map<string, DeclaredFile>();
  const row = /^\| `([a-z0-9-]+\.jsonl)` \| (\d+) \| (\d+) \| `([0-9a-f]{64})` \|$/gm;
  for (const m of text.matchAll(row)) {
    out.set(m[1], { name: m[1], rows: Number(m[2]), bytes: Number(m[3]), sha256: m[4] });
  }
  return out;
}

const declared = declaredFiles();
const committed = new Map(ALL_FILES.map(name => [name, fs.readFileSync(path.join(DIR, name))] as const));
const parsed = new Map(ALL_FILES.map(name => [name, loadOpenings(path.join(DIR, name)).openings] as const));

describe('E1 allocation: ALLOCATION.md describes the committed bytes', () => {
  it('names every allocation file and nothing else', () => {
    expect([...declared.keys()].sort()).toEqual([...ALL_FILES].sort());
  });

  for (const name of ALL_FILES) {
    it(`${name}: sha256, byte size and row count match the frozen constants`, () => {
      const bytes = committed.get(name)!;
      const entry = declared.get(name);
      expect(entry, `ALLOCATION.md must have a row for ${name}`).toBeDefined();
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(entry!.sha256);
      expect(bytes.length).toBe(entry!.bytes);
      expect(parsed.get(name)!.length).toBe(entry!.rows);
    });
  }

  it('states the split the files actually hold', () => {
    expect(parsed.get(FILE_NAMES.dev)!.length).toBe(48);
    expect(parsed.get(FILE_NAMES.val)!.length).toBe(32);
    expect(parsed.get(FILE_NAMES.sealed)!.length).toBe(32);
    expect(parsed.get(FILE_NAMES.baseline)!.length).toBe(BASELINE_SIZE);
  });

  it('is pointed at from the openings README, which retires the 8/4/4 proposal', () => {
    const readme = fs.readFileSync(README, 'utf8');
    expect(readme).toContain('ALLOCATION.md');
    expect(readme).toMatch(/SUPERSEDED/);
  });
});

describe('E1 allocation: every committed opening is playable', () => {
  for (const name of ALL_FILES) {
    it(`${name}: every row replays legally at handicaps ${REQUIRED_HANDICAPS.join(' and ')}`, () => {
      expect(() => validateOpenings(parsed.get(name)!, REQUIRED_HANDICAPS)).not.toThrow();
    });
  }
});

describe('E1 allocation: the strata name disjoint positions', () => {
  const rows = POOL_FILES.flatMap(name =>
    parsed.get(name)!.map(o => ({ file: name, id: o.id, digest: gameplayDigest(applyOpening(o, { blackCrystalHandicap: 0 })) })),
  );

  it('holds one handicap-0 position per row across all five files', () => {
    expect(rows.length).toBe(16 + 48 + 32 + 32 + 32);
    expect(new Set(rows.map(r => r.digest)).size).toBe(rows.length);
  });

  it('holds one id per row across all five files', () => {
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
  });

  it('keeps the E1 ids namespaced away from the E0 ids', () => {
    for (const name of [FILE_NAMES.dev, FILE_NAMES.val, FILE_NAMES.sealed]) {
      for (const o of parsed.get(name)!) expect(o.id.startsWith('e1-'), `${name}: ${o.id}`).toBe(true);
    }
    for (const o of parsed.get(E0)!) expect(o.id.startsWith('e1-')).toBe(false);
  });
});

describe('E1 allocation: the baseline set', () => {
  const baseline = parsed.get(FILE_NAMES.baseline)!;
  const e0 = parsed.get(E0)!;
  const dev = parsed.get(FILE_NAMES.dev)!;
  const serialize = (o: OpeningSpec): string => JSON.stringify(o.actions);

  it('is 6 unclaimed E0 openings followed by the first 44 development rows, in that order', () => {
    expect(baseline.length).toBe(BASELINE_SIZE);
    const head = E0_BASELINE_INDICES.map(i => e0[i]);
    expect(baseline.slice(0, head.length).map(o => o.id)).toEqual(head.map(o => o.id));
    expect(baseline.slice(0, head.length).map(serialize)).toEqual(head.map(serialize));
    const tail = dev.slice(0, BASELINE_SIZE - head.length);
    expect(baseline.slice(head.length).map(o => o.id)).toEqual(tail.map(o => o.id));
    expect(baseline.slice(head.length).map(serialize)).toEqual(tail.map(serialize));
  });

  it('holds no id the pilot or E1.1 claims', () => {
    const reserved = new Set([...E0_PILOT_INDICES, ...E0_E1_1_INDICES].map(i => e0[i].id));
    expect(reserved.size).toBe(10);
    for (const o of baseline) expect(reserved.has(o.id), `${o.id} is reserved`).toBe(false);
  });

  it('borrows nothing from validation or sealed', () => {
    const offLimits = new Set([...parsed.get(FILE_NAMES.val)!, ...parsed.get(FILE_NAMES.sealed)!].map(o => o.id));
    for (const o of baseline) expect(offLimits.has(o.id), `${o.id} came from a held-out stratum`).toBe(false);
  });

  it('reaches 50 distinct handicap-0 positions', () => {
    const digests = baseline.map(o => gameplayDigest(applyOpening(o, { blackCrystalHandicap: 0 })));
    expect(new Set(digests).size).toBe(BASELINE_SIZE);
  });

  it('covers 100 pairs at two handicaps with no opening reuse (A15 capacity guard)', () => {
    expect(baseline.length * REQUIRED_HANDICAPS.length).toBe(100);
  });
});

describe('E1 allocation: regeneration', () => {
  it('reproduces all four files byte for byte from seed 2027', () => {
    const allocation = buildAllocation({ dir: DIR });
    expect(allocation.pool.length).toBe(112);
    const rendered = renderAllocation(allocation);
    for (const name of [FILE_NAMES.dev, FILE_NAMES.val, FILE_NAMES.sealed, FILE_NAMES.baseline]) {
      expect(rendered[name], `${name} regenerated`).toBe(committed.get(name)!.toString('utf8'));
    }
  });

  it('cuts a shuffled pool 3:2:2 with the remainder going to development', () => {
    const fake = (n: number): OpeningSpec[] => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, actions: [] }));
    expect(Object.values(splitShuffled(fake(112))).map(s => s.length)).toEqual([48, 32, 32]);
    const short = splitShuffled(fake(100));
    expect([short.dev.length, short.val.length, short.sealed.length]).toEqual([44, 28, 28]);
    expect(short.dev.length + short.val.length + short.sealed.length).toBe(100);
  });

  it('shuffles deterministically from the seed, without mutating the input', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const once = seededShuffle(input, E1_SEED);
    expect(seededShuffle(input, E1_SEED)).toEqual(once);
    expect(input).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(once).not.toEqual(input);
    expect([...once].sort((a, b) => a - b)).toEqual(input);
  });
});

describe('generate.ts: --id-prefix', () => {
  it('prepends the prefix to every emitted id and changes nothing else', () => {
    const plain = generateOpenings({ count: 4, seed: 4242 });
    const prefixed = generateOpenings({ count: 4, seed: 4242, idPrefix: 'e1-' });
    expect(prefixed.openings.map(o => o.spec.id)).toEqual(plain.openings.map(o => `e1-${o.spec.id}`));
    expect(prefixed.openings.map(o => o.digest)).toEqual(plain.openings.map(o => o.digest));
  });

  it('defaults to empty, which is what keeps the E0 file reproducible', () => {
    expect(parseArgs([]).idPrefix).toBe('');
    expect(parseArgs(['--id-prefix', 'e1-']).idPrefix).toBe('e1-');
  });

  it('refuses a prefix that would break the opening-id alphabet', () => {
    expect(() => parseArgs(['--id-prefix', '../'])).toThrow(/--id-prefix/);
    expect(() => generateOpenings({ count: 1, seed: 1, idPrefix: 'a/b' })).toThrow(/--id-prefix/);
  });
});

describe('generate.ts: --exclude', () => {
  const excluded = loadExclusions([path.join(DIR, E0)]);

  it('loads and digests every row of the excluded file', () => {
    expect(excluded.length).toBe(parsed.get(E0)!.length);
    expect(new Set(excluded.map(e => e.digest)).size).toBe(excluded.length);
  });

  it('collects across repeated files', () => {
    expect(parseArgs(['--exclude', 'a.jsonl', '--exclude', 'b.jsonl']).exclude).toEqual(['a.jsonl', 'b.jsonl']);
    expect(parseArgs([]).exclude).toEqual([]);
  });

  it('refuses a candidate that reproduces an excluded opening', () => {
    // The same seed twice: without exclusions the second run is the first run.
    // Feeding the first run back in as exclusions must therefore change every row.
    const first = generateOpenings({ count: 6, seed: 5150 });
    const asExclusions = first.openings.map(o => ({ id: o.spec.id, actions: o.spec.actions, digest: o.digest, source: 'first' }));
    const second = generateOpenings({ count: 6, seed: 5150, maxAttempts: 4000, exclude: asExclusions });
    const firstDigests = new Set(first.openings.map(o => o.digest));
    for (const o of second.openings) expect(firstDigests.has(o.digest), `${o.spec.id} repeats an excluded position`).toBe(false);
    expect(second.excluded).toBe(6);
    expect(second.rejected['duplicate digest of an excluded opening'] ?? 0).toBeGreaterThan(0);
  });

  it('refuses a candidate standing in a prefix relation with an excluded opening', () => {
    const pool = generateOpenings({ count: 8, seed: 5150 });
    const asExclusions = pool.openings.map(o => ({ id: o.spec.id, actions: o.spec.actions, digest: o.digest, source: 'pool' }));
    const fresh = generateOpenings({ count: 8, seed: 5150, maxAttempts: 4000, exclude: asExclusions });
    const serialized = (actions: readonly unknown[]): string[] => actions.map(a => JSON.stringify(a));
    for (const o of fresh.openings) {
      for (const e of asExclusions) {
        const a = serialized(o.spec.actions);
        const b = serialized(e.actions);
        const short = a.length <= b.length ? a : b;
        const long = a.length <= b.length ? b : a;
        expect(short.every((x, i) => x === long[i]), `${o.spec.id} vs excluded ${e.id}`).toBe(false);
      }
    }
  });

  it('reports a cross-file collision rather than emitting it', () => {
    const pool = generateOpenings({ count: 3, seed: 777 });
    const asExclusions = pool.openings.map(o => ({ id: o.spec.id, actions: o.spec.actions, digest: o.digest, source: 'pool' }));
    expect(() => assertDiverse(pool.openings, asExclusions)).toThrow(/same h0 position as excluded/);
    expect(() => assertDiverse(pool.openings)).not.toThrow();
  });

  it('holds the committed E1 pool disjoint from E0 under both rules', () => {
    const e1 = [FILE_NAMES.dev, FILE_NAMES.val, FILE_NAMES.sealed].flatMap(n => parsed.get(n)!);
    const e1Digests = new Set(e1.map(o => gameplayDigest(applyOpening(o, { blackCrystalHandicap: 0 }))));
    for (const e of excluded) expect(e1Digests.has(e.digest), `${e.id} reappears in the E1 pool`).toBe(false);
  });
});

describe('E1 allocation: the rendered rows are the pool rows', () => {
  it('writes a stratum row with the same bytes the pool row has', () => {
    const dev = parsed.get(FILE_NAMES.dev)!;
    expect(renderOpeningSpecs(dev)).toBe(committed.get(FILE_NAMES.dev)!.toString('utf8'));
  });
});
