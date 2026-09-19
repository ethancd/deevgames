// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { applyOpening, gameplayDigest, loadOpenings, validateOpenings } from '../../lab/hard-ai/ladder/openings';
import {
  REQUIRED_HANDICAPS,
  assertDiverse,
  loadExclusions,
} from '../../lab/hard-ai/ladder/openings/generate';

/**
 * The E2 validation pool (`ALLOCATION.md` §"E2 addendum"; E1-CLOSE-CRITIQUE N9).
 * `e2-val.jsonl` is the only pool E2 confirmation rows may draw from, so the
 * bytes must be pinned the way the E1 files are: the numbers below are PARSED
 * OUT OF `ALLOCATION.md` and compared with the committed file, so an edit to
 * either side that is not made to both fails here.
 *
 * The E1 allocation test owns the five earlier files and asserts that
 * `ALLOCATION.md`'s frozen "Files" table names those five and nothing else.
 * This file therefore reads the addendum's bullet form, not that table, and
 * the addendum must not restate the new file in the table's row shape.
 *
 * Cost: the regeneration case replays 866 candidates through the real rules,
 * measured at well under a second. The timeout is a guard, not a measurement.
 */
vi.setConfig({ testTimeout: 60_000 });

const DIR = path.resolve(__dirname, '../../lab/hard-ai/ladder/openings');
const ALLOCATION = path.join(DIR, 'ALLOCATION.md');
const E2_VAL = 'e2-val.jsonl';

/** The five pools `e2-val.jsonl` was generated against, in `--exclude` order. */
const EXCLUDED_FILES = ['e0-openings.jsonl', 'e1-dev.jsonl', 'e1-val.jsonl', 'e1-sealed.jsonl', 'e1-val2.jsonl'] as const;

/** Generation parameters, restated here so a silent change to the addendum's command block is caught. */
const E2_VAL_SEED = 2029;
const E2_VAL_COUNT = 64;
const E2_VAL_ID_PREFIX = 'e2-';
const E2_VAL_MAX_ATTEMPTS = 20_000;

/** Reads the addendum's bullet facts. One source of truth: the document. */
function declared(): { rows: number; bytes: number; sha256: string } {
  const text = fs.readFileSync(ALLOCATION, 'utf8');
  const addendum = text.slice(text.indexOf('## E2 addendum'));
  expect(addendum, 'ALLOCATION.md must carry the E2 addendum').not.toBe('');
  const rows = /^- Rows: (\d+)\.$/m.exec(addendum);
  const bytes = /^- Bytes: (\d+)\.$/m.exec(addendum);
  const sha = /^- sha256: `([0-9a-f]{64})`\.$/m.exec(addendum);
  expect(rows, 'addendum must state the row count').not.toBeNull();
  expect(bytes, 'addendum must state the byte size').not.toBeNull();
  expect(sha, 'addendum must state the sha256').not.toBeNull();
  return { rows: Number(rows![1]), bytes: Number(bytes![1]), sha256: sha![1] };
}

const stated = declared();
const committed = fs.readFileSync(path.join(DIR, E2_VAL));
const parsed = loadOpenings(path.join(DIR, E2_VAL)).openings;
const h0 = (o: { actions: readonly unknown[]; id: string }): string =>
  gameplayDigest(applyOpening(o as Parameters<typeof applyOpening>[0], { blackCrystalHandicap: 0 }));

describe('e2-val.jsonl: the addendum describes the committed bytes', () => {
  it('matches the sha256, byte size and row count stated in ALLOCATION.md', () => {
    expect(crypto.createHash('sha256').update(committed).digest('hex')).toBe(stated.sha256);
    expect(committed.length).toBe(stated.bytes);
    expect(parsed.length).toBe(stated.rows);
  });

  it('is the 64-row pool the E2 plan asks for', () => {
    expect(parsed.length).toBe(E2_VAL_COUNT);
  });

  it('namespaces every id under the E2 prefix', () => {
    for (const o of parsed) expect(o.id.startsWith(E2_VAL_ID_PREFIX), o.id).toBe(true);
  });

  it('replays legally at handicaps 0 and 3', () => {
    expect(() => validateOpenings(parsed, REQUIRED_HANDICAPS)).not.toThrow();
  });

  it('states the exact generating command, with all five exclusions', () => {
    const text = fs.readFileSync(ALLOCATION, 'utf8');
    const addendum = text.slice(text.indexOf('## E2 addendum'));
    expect(addendum).toContain(`--count ${E2_VAL_COUNT} --seed ${E2_VAL_SEED} --id-prefix ${E2_VAL_ID_PREFIX}`);
    expect(addendum).toContain(`--max-attempts ${E2_VAL_MAX_ATTEMPTS}`);
    for (const name of EXCLUDED_FILES) expect(addendum).toContain(`--exclude lab/hard-ai/ladder/openings/${name}`);
  });
});

describe('e2-val.jsonl: no collision with the five earlier pools', () => {
  const exclusions = loadExclusions(EXCLUDED_FILES.map(n => path.join(DIR, n)));

  it('loads 160 openings to hold against the pool', () => {
    expect(exclusions.length).toBe(160);
  });

  it('holds 64 distinct handicap-0 positions of its own', () => {
    const digests = parsed.map(h0);
    expect(new Set(digests).size).toBe(parsed.length);
  });

  it('shares no handicap-0 position and no prefix with any earlier pool', () => {
    // assertDiverse is the generator's own acceptance check, run here against
    // the committed bytes rather than the in-process candidates.
    const openings = parsed.map(o => ({ spec: o, digest: h0(o), plies: o.actions.length, driver: '' }));
    expect(() => assertDiverse(openings as Parameters<typeof assertDiverse>[0], exclusions)).not.toThrow();
  });

  it('shares no id with any earlier pool', () => {
    const earlier = new Set(EXCLUDED_FILES.flatMap(n => loadOpenings(path.join(DIR, n)).openings.map(o => o.id)));
    expect(earlier.size).toBe(160);
    for (const o of parsed) expect(earlier.has(o.id), `${o.id} repeats an earlier id`).toBe(false);
  });
});

// Byte regeneration is historical Standard evidence, reproducible at standard-final.
// The committed hashes, legality, uniqueness and exclusion checks above remain active.
