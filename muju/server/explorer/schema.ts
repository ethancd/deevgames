import { z } from 'zod';
import { BLACK_CRYSTAL_HANDICAPS } from '../../src/game/rules';
import { actionSchema } from '../schema';
const text = z.string().max(3000);
const player = z.object({ provider: z.enum(['codex', 'claude']), model: z.enum(['gpt-6-astra', 'claude-opus-5-5']), effort: z.literal('high').default('high') }).strict()
  .refine(p => p.provider === 'codex' ? p.model === 'gpt-6-astra' : p.model === 'claude-opus-5-5', 'Provider and model must match.');
export const explorerConfigSchema = z.object({
  handicap: z.number().refine(v => BLACK_CRYSTAL_HANDICAPS.includes(v), 'Use 0.5, 1.5, …, 18.5.').default(9.5),
  maxGames: z.number().int().min(1).max(50).default(5), maxPlies: z.number().int().min(1).max(500).default(100),
  maxModelCalls: z.number().int().min(1).max(5000).default(1000),
  terminalOnly: z.boolean().default(false),
  consensus: z.number().min(0.75).max(1).default(0.9), confirmations: z.number().int().min(1).max(5).default(2),
  retryThreshold: z.number().min(0).max(1).default(0.33),
  players: z.object({ white: player, black: player }).strict().default({
    white: { provider: 'codex', model: 'gpt-6-astra', effort: 'high' },
    black: { provider: 'claude', model: 'claude-opus-5-5', effort: 'high' },
  }),
}).strict();
export const assessmentSchema = z.object({ whiteWin: z.number().min(0).max(1),
  pressure: z.enum(['white-dominating', 'white-edge', 'balanced', 'black-edge', 'black-dominating']),
  counterplay: text, explanation: text }).strict();
export const turnActionsSchema = z.array(actionSchema).min(1).max(32).refine(actions => actions.every(a => a.type !== 'UNDO' && a.type !== 'SET_UPKEEP_REVIEW'), 'Explorer turns cannot undo or change preferences.');
export const resultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('assess'), assessment: assessmentSchema, memory: text }).strict(),
  z.object({ kind: z.literal('turn'), actions: turnActionsSchema, explanation: text, memory: text }).strict(),
  z.object({ kind: z.literal('branch'), checkpointId: z.string().max(40).nullable(), actions: z.array(actionSchema).max(32), explanation: text, memory: text }).strict(),
]);
export const querySchema = z.object({ checkpointId: z.string().max(40).optional(), actions: z.array(actionSchema).max(32).default([]), offset: z.number().int().min(0).default(0) }).strict();
