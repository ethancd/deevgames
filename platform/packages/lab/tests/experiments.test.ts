import { describe, expect, it } from 'vitest';
import { runExperiment } from '../src/experiments.ts';
import { randomBot } from '../src/bots.ts';
import { nim } from './fixtures/nim.ts';

describe('runExperiment', () => {
  it('runs each variant and keys/orders results by label as given', async () => {
    const result = await runExperiment({
      name: 'heap-size-sweep',
      game: nim,
      variants: [
        { label: 'small', config: { heaps: [1, 2, 3] } },
        { label: 'large', config: { heaps: [3, 5, 7] } },
      ],
      gamesPerVariant: 10,
      bots: [randomBot('A'), randomBot('B')],
      seedStart: 100,
    });

    expect(result.name).toBe('heap-size-sweep');
    expect(result.variants.map((v) => v.label)).toEqual(['small', 'large']);
    for (const variant of result.variants) {
      expect(variant.series.games).toBe(10);
      expect(variant.series.records).toHaveLength(10);
    }
    // Different configs -> different configHash.
    expect(result.variants[0].series.configHash).not.toBe(result.variants[1].series.configHash);
  });
});
