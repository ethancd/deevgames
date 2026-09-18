// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  applyOpening,
  gameplayDigest,
  parseOpenings,
  type OpeningSpec,
} from '../../lab/hard-ai/ladder/openings';
import {
  MIN_PLIES,
  PLY_TARGETS,
  REQUIRED_HANDICAPS,
  generateOpenings,
  renderOpeningsFile,
  serializeAction,
} from '../../lab/hard-ai/ladder/openings/generate';

/**
 * The committed E0 opening set (lab/hard-ai/ladder/openings/). The set is the
 * ladder's only variance source against two deterministic engines
 * (E0-PILOT-REPORT §7 P1), so what it claims about itself — legal at both
 * handicaps, all positions distinct, reproducible from its seed — is asserted
 * here against the committed bytes rather than trusted from the generator run
 * that produced them.
 *
 * Measured at 23 ms of test time on an M2 Max (the regeneration case, which
 * replays 46 candidate openings through the real rules, is 9 ms of it). The
 * timeout is a wide guard, not a measurement.
 */
vi.setConfig({ testTimeout: 20_000 });

const DIR = path.resolve(__dirname, '../../lab/hard-ai/ladder/openings');
const JSONL = path.join(DIR, 'e0-openings.jsonl');
const README = path.join(DIR, 'README.md');
const SEED = 2026;
const COUNT = 16;

const bytes = fs.readFileSync(JSONL);
const text = bytes.toString('utf8');
const openings = parseOpenings(text, JSONL);

describe('E0 opening set: the committed file', () => {
  it('parses, and holds at least the 12 openings E0 asks for', () => {
    expect(openings.length).toBe(COUNT);
    expect(openings.length).toBeGreaterThanOrEqual(12);
    expect(new Set(openings.map(o => o.id)).size).toBe(openings.length);
  });

  it('replays at every handicap the E0 runs use', () => {
    for (const opening of openings) {
      for (const handicap of REQUIRED_HANDICAPS) {
        expect(() => applyOpening(opening, { blackCrystalHandicap: handicap }), `${opening.id} at h${handicap}`).not.toThrow();
      }
    }
  });

  it('reaches a distinct position from every other opening at handicap 0', () => {
    const digests = openings.map(o => gameplayDigest(applyOpening(o, { blackCrystalHandicap: 0 })));
    expect(new Set(digests).size).toBe(openings.length);
  });

  it('holds no opening that is a prefix of another', () => {
    const serialized = openings.map(o => o.actions.map(serializeAction));
    for (let i = 0; i < serialized.length; i++) {
      for (let k = 0; k < serialized.length; k++) {
        if (i === k) continue;
        const isPrefix = serialized[i].length <= serialized[k].length && serialized[i].every((a, n) => a === serialized[k][n]);
        expect(isPrefix, `${openings[i].id} is a prefix of ${openings[k].id}`).toBe(false);
      }
    }
  });

  it('spreads its openings over more than one length', () => {
    const lengths = openings.map(o => o.actions.length);
    for (const n of lengths) {
      expect(n).toBeGreaterThanOrEqual(MIN_PLIES);
      expect(n).toBeLessThanOrEqual(Math.max(...PLY_TARGETS));
    }
    expect(new Set(lengths).size).toBeGreaterThan(1);
  });
});

describe('E0 opening set: the README describes this file', () => {
  const readme = fs.readFileSync(README, 'utf8');

  it('records the sha256 the committed bytes actually have', () => {
    const declared = /sha256[^`]*`([0-9a-f]{64})`/.exec(readme);
    expect(declared, 'README must state the sha256 of e0-openings.jsonl').not.toBeNull();
    expect(declared?.[1]).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
  });

  it('records the size the committed bytes actually have', () => {
    const declared = /- (\d+) bytes, (\d+) lines/.exec(readme);
    expect(declared, 'README must state the byte and line count').not.toBeNull();
    expect(Number(declared?.[1])).toBe(bytes.length);
    expect(Number(declared?.[2])).toBe(text.trimEnd().split('\n').length);
  });
});

describe('E0 opening set: regeneration', () => {
  it('produces the committed bytes again from the same seed', () => {
    const regenerated = generateOpenings({ count: COUNT, seed: SEED });
    expect(renderOpeningsFile(regenerated.openings)).toBe(text);
  });
});

describe('E0 opening set: why an opening stops at the handover', () => {
  /**
   * The reproducer behind `PLY_TARGETS`' five-ply ceiling. Black's first turn
   * opens in the ACTION phase at handicap 0 (no crystals, nothing placeable)
   * and in the PLACE phase at handicap 3 (a tier-1 unit is affordable), so an
   * opening whose second ply is a Black MOVE is legal at h0 and illegal at h3.
   * Were this to change, the generator could record deeper openings.
   */
  const intoBlacksTurn: OpeningSpec = {
    id: 'reproducer-black-ply',
    actions: [
      { type: 'END_ACTION_PHASE' },
      { type: 'MOVE', from: { x: 8, y: 9 }, to: { x: 7, y: 8 } },
    ],
  };

  it('is legal at handicap 0 and refused at handicap 3', () => {
    expect(() => applyOpening(intoBlacksTurn, { blackCrystalHandicap: 0 })).not.toThrow();
    expect(() => applyOpening(intoBlacksTurn, { blackCrystalHandicap: 3 })).toThrow(/illegal for black/);
  });

  it('is why no committed opening contains a Black ply', () => {
    for (const opening of openings) {
      const afterWhiteHandsOver = opening.actions.findIndex(a => a.type === 'END_ACTION_PHASE');
      if (afterWhiteHandsOver >= 0) {
        expect(afterWhiteHandsOver, `${opening.id} plays on after the handover`).toBe(opening.actions.length - 1);
      }
    }
  });
});
