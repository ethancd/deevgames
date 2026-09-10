import { z } from 'zod';

export const roomIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const tokenSchema = z.string().min(32).max(128);
export const nameSchema = z.string().trim().min(1).max(40);
const unitId = z.string().min(1).max(100);
export const positionSchema = z.object({ x: z.number().int().min(0).max(9), y: z.number().int().min(0).max(9) }).strict();
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MOVE'), unitId, to: positionSchema }).strict(),
  z.object({ type: z.literal('ATTACK'), unitId, targetPosition: positionSchema }).strict(),
  z.object({ type: z.literal('BUY_UNIT'), definitionId: z.string().max(40), position: positionSchema }).strict(),
  z.object({ type: z.literal('PROMOTE_UNIT'), unitId }).strict(),
  z.object({ type: z.literal('PAY_UPKEEP'), keepUnitIds: z.array(unitId).max(100) }).strict(),
  z.object({ type: z.literal('SET_UPKEEP_REVIEW'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('END_PLACE_PHASE') }).strict(),
  z.object({ type: z.literal('END_ACTION_PHASE') }).strict(),
  z.object({ type: z.literal('RESIGN') }).strict(),
]);
export const actionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().min(8).max(100),
  actions: z.array(actionSchema).min(1).max(32),
}).strict();
export const createSchema = z.object({ name: nameSchema, side: z.enum(['white', 'black']).default('white') }).strict();
export const joinSchema = z.object({ name: nameSchema, inviteCode: tokenSchema }).strict();

export class RoomError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
