import { z } from 'zod';
import { TIME_CONTROL_PRESETS } from '../src/online/timeControl';
import type { RoomSnapshot } from '../src/online/types';

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
  z.object({ type: z.literal('UNDO') }).strict(),
]);
export const actionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().min(8).max(100),
  actions: z.array(actionSchema).min(1).max(32),
}).strict();
export const stageVersionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const stageIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const stageRequestSchema = z.object({
  requestId: actionRequestSchema.shape.requestId,
  expectedTurnNumber: z.number().int().positive(),
  expectedStageVersion: stageVersionSchema,
  commitWhenRemainingMs: z.number().int().positive().max(15000000)
    .describe('Total milliseconds until flag-fall (delay plus bank). Positive, no greater than this turn’s starting allowance. Already due fires now; 5000 can spend almost your entire bank.'),
  actions: actionRequestSchema.shape.actions,
  fallbacks: z.array(actionRequestSchema.shape.actions).max(3).default([])
    .describe('Up to three complete fallback batches, tried in exactly this order after the primary batch.'),
}).strict();
export const cancelStageSchema = stageRequestSchema.pick({ requestId: true, expectedTurnNumber: true, expectedStageVersion: true });
export const createSchema = z.object({ name: nameSchema, side: z.enum(['white', 'black']).default('white'),
  actionsPerTurn: z.literal(4).default(4),
  timeControl: z.union([
    z.enum(['blitz', 'rapid', 'classical']).transform(key => {
      const { delaySeconds, bankSeconds } = TIME_CONTROL_PRESETS[key];
      return { delaySeconds, bankSeconds };
    }),
    z.object({
      delaySeconds: z.number().int().min(0).max(600).describe('Free seconds per full player turn (0–600). Unused delay never accumulates.'),
      bankSeconds: z.number().int().min(1).max(14400).describe('Personal bank in seconds per player (1–14400); used only after the turn delay.'),
    }).strict(),
  ]).nullable().optional().describe('Creation only. Omit/null for untimed, select blitz (10s/2min), rapid (30s/10min), classical (60s/30min), or supply custom delaySeconds/bankSeconds. Starts on join; running out loses.'),
}).strict();
export const joinSchema = z.object({ name: nameSchema, inviteCode: tokenSchema }).strict();
export const historyQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  includeUndone: z.union([z.boolean(), z.enum(['true', 'false']).transform(value => value === 'true')]).default(false),
}).strict();

export class RoomError extends Error {
  constructor(public status: number, public code: string, message: string, public room?: RoomSnapshot) { super(message); }
}
