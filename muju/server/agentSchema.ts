import { z } from 'zod';
import { actionSchema, positionSchema } from './schema';

export const agentPosition = z.union([
  z.string().regex(/^[A-Ja-j](10|[1-9])$/).transform(s => ({ x: s.toUpperCase().charCodeAt(0) - 65, y: Number(s.slice(1)) - 1 })),
  positionSchema,
]);
/** One coordinate/action boundary for play, preview and analysis witnesses. */
export const agentAction = z.union([
  z.object({ type: z.literal('MOVE'), unitId: z.string().min(1).max(100), to: agentPosition }).strict(),
  z.object({ type: z.literal('ATTACK'), unitId: z.string().min(1).max(100), targetPosition: agentPosition }).strict(),
  z.object({ type: z.literal('BUY_UNIT'), definitionId: z.string().max(40), position: agentPosition }).strict(),
  actionSchema,
]);
