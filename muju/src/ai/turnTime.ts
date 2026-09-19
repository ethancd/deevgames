import type { AIDifficulty } from './types';

/**
 * How long an AI seat may think per TURN. Difficulty picks the engine and its
 * tactical understanding; pace picks how much of the clock it is given. The
 * two are independent, so Easy at `deep` can outplay Medium at `quick`.
 */
export type AIPace = 'quick' | 'normal' | 'deep';

export const AI_PACES: readonly AIPace[] = ['quick', 'normal', 'deep'];

/** Omitted in a config or a save written before paces existed. */
export const DEFAULT_AI_PACE: AIPace = 'quick';

/** Whole-turn allowance in seconds, per difficulty and pace. */
export const AI_TURN_SECONDS: Record<AIDifficulty, Record<AIPace, number>> = {
  easy: { quick: 1, normal: 3, deep: 10 },
  medium: { quick: 3, normal: 10, deep: 30 },
  hard: { quick: 10, normal: 30, deep: 60 },
};

export const AI_PACE_LABEL: Record<AIPace, string> = { quick: 'Quick', normal: 'Normal', deep: 'Deep' };

export const isAIPace = (value: unknown): value is AIPace =>
  value === 'quick' || value === 'normal' || value === 'deep';

/** Whole-turn allowance in milliseconds. */
export const aiTurnBudgetMs = (difficulty: AIDifficulty, pace: AIPace = DEFAULT_AI_PACE): number =>
  AI_TURN_SECONDS[difficulty][pace] * 1000;

/** "10 s", "1 min" — for option labels and the timer's accessible name. */
export const formatTurnSeconds = (seconds: number): string =>
  seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
