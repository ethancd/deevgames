import { z } from 'zod';
import { agentAction, agentPosition } from '../agentSchema';
import { roomIdSchema } from '../schema';

export const topics = ['economy', 'units', 'matchups', 'spawn', 'reach', 'mobility', 'threats', 'opportunities', 'exchange', 'checkmate', 'survival', 'reply'] as const;
const player = z.enum(['white', 'black']);
export const analysisSchema = z.object({
  roomId: roomIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  player,
  topics: z.array(z.enum(topics)).min(1).max(topics.length),
  targets: z.object({
    unitIds: z.array(z.string().min(1).max(100)).max(20).optional(),
    squares: z.array(agentPosition).max(12).optional(),
    regions: z.array(z.object({ from: agentPosition, to: agentPosition }).strict()).max(8).optional(),
    defenders: z.array(z.object({ square: agentPosition, owner: player, definitionId: z.string().max(40),
      unitId: z.string().min(1).max(100).optional(), damageTaken: z.number().int().nonnegative().max(4).optional(),
    }).strict()).max(6).optional(),
  }).strict().default({}),
  hypotheticalActions: z.array(agentAction).max(32).default([]),
  stateKind: z.enum(['current', 'opponentNextTurn']).default('current'),
  detail: z.enum(['headline', 'standard', 'full']).default('standard'),
  limit: z.number().int().min(1).max(50).default(3),
  searchBudget: z.object({ maxNodes: z.number().int().min(0).max(20000).default(2000),
    maxMs: z.number().int().min(1).max(750).default(150) }).strict().default({}),
  categories: z.array(z.enum(['existing', 'promotion', 'purchase', 'combined'])).min(1).max(4)
    .default(['existing', 'promotion', 'purchase', 'combined']),
  deep: z.boolean().default(false),
  replies: z.boolean().default(true),
  objective: z.enum(['killTarget', 'capturedValue', 'occupyHome', 'blockPurchases']).default('killTarget'),
  horizon: z.number().int().min(1).max(40).default(12),
  actions: z.number().int().min(0).max(4).default(4),
  sinceRevision: z.number().int().nonnegative().optional(),
}).strict();
export type AnalysisInput = z.output<typeof analysisSchema>;
export type Category = AnalysisInput['categories'][number];
