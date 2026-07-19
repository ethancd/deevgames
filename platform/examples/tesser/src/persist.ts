// Save envelope for the web UI (Stage D): version 1, zod-validated state.

import { definePersistence } from '@deev/core';
import { z } from 'zod';
import type { TesserState } from './game.ts';

const seatSchema = z.enum(['south', 'north']);

const pieceSchema = z
  .object({
    id: z.string().min(1),
    seat: seatSchema,
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().min(1),
    d: z.number().int().min(1),
    h: z.number().int().min(1),
    measure: z.number().int().min(1),
  })
  .strict();

export const tesserStateSchema = z
  .object({
    pieces: z.array(pieceSchema),
    current: seatSchema,
    ply: z.number().int().min(0),
    plyCap: z.number().int().min(1),
  })
  .strict();

export const persistence = definePersistence<TesserState>({
  version: 1,
  validate: (data): data is TesserState => tesserStateSchema.safeParse(data).success,
});
