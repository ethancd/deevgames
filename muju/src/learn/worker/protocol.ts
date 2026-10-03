import type { AIAction } from '../../ai/types';
import type { GameState } from '../../game/types';
import type { Verdict } from '../solver';
import type { PuzzleSpec } from '../types';

/** One bounded puzzle search, asked of the worker (or run inline when there is none). */
export type SolverRequest = { id: number; spec: PuzzleSpec; state: GameState; nodeLimit: number } &
  ({ kind: 'win' } | { kind: 'reply' } | { kind: 'line' });

export type SolverResult =
  | { kind: 'win'; verdict: Verdict }
  | { kind: 'reply'; line: AIAction[]; refutes: boolean }
  | { kind: 'line'; line: AIAction[] | null };

export type SolverResponse = { id: number; result: SolverResult } | { id: number; error: string };
