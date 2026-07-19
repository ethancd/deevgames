// The puzzle pack: starting positions shipped in the self-describing CSV
// format and machine-verified (LUMENGRID discipline via @deev/content).

import { z } from 'zod';
import { defineContent, parseContentCsv, defineVerifier, solvable, notPreSolved } from '@deev/content';
import { runMatch, type Policy } from '@deev/core';
import { pebbleDuel, perfectMove, type PebbleState, type PebbleMove } from './game.ts';

export const puzzleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  heaps: z.array(z.number().int().nonnegative()).length(3),
});

export type Puzzle = z.infer<typeof puzzleSchema>;

export function parsePuzzleCsv(text: string): { puzzles: Puzzle[]; warnings: string[] } {
  const parsed = parseContentCsv(text, {
    // The 'int' pseudo-model: natural keys are just decimal strings.
    resolveFk: (type, key) => {
      if (type === 'int') return Number(key);
      throw new Error(`unknown fk type '${type}'`);
    },
  });
  const puzzles: Puzzle[] = [];
  const warnings = [...parsed.warnings];
  for (const record of parsed.records) {
    if (record.type !== 'puzzle') {
      warnings.push(`unexpected record type '${record.type}'`);
      continue;
    }
    const result = puzzleSchema.safeParse(record.fields);
    if (result.success) puzzles.push(result.data);
    else warnings.push(`puzzle failed schema: ${result.error.message}`);
  }
  return { puzzles, warnings };
}

export const puzzleContent = (fixtures: Puzzle[]) =>
  defineContent({
    name: 'pebble-puzzles',
    schema: puzzleSchema,
    fixtures,
    seams: [
      {
        name: 'unique-ids',
        check: (items: Puzzle[]) => {
          const ids = new Set(items.map((p) => p.id));
          if (ids.size !== items.length) throw new Error('duplicate puzzle ids');
        },
      },
    ],
  });

const perfect: Policy<PebbleState, PebbleMove> = {
  choose: (view, _seat, legal) => perfectMove(view, legal),
};

/**
 * Verifier: every shipped starting position must be (a) not already over and
 * (b) winnable by the first player under perfect play — proven by actually
 * playing the game, seeded.
 */
export const puzzleVerifier = defineVerifier<Puzzle>({
  name: 'pebble-puzzle-verifier',
  checks: [
    notPreSolved({ isSolved: (p) => p.heaps.every((h) => h === 0) }),
    solvable({
      seeds: [1, 2, 3],
      solver: (p, seed) => {
        const transcript = runMatch(
          pebbleDuel,
          { heaps: p.heaps },
          seed,
          { first: perfect, second: perfect },
        );
        return transcript.result.winner === 'first';
      },
    }),
  ],
});
