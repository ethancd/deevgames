// Config sweeps over runSeries: same bots/games, different configs, results
// keyed and ordered by variant label as given.

import type { GameDef, Result } from '@deev/core';
import type { Bot } from './bots.ts';
import { runSeries, type Legality, type RunSeriesHooks, type SeriesResult } from './runner.ts';

export interface ExperimentVariant<C> {
  label: string;
  config: C;
}

export interface RunExperimentOptions<S, A, C, O> {
  name: string;
  game: GameDef<S, A, C, O>;
  variants: Array<ExperimentVariant<C>>;
  gamesPerVariant: number;
  bots: Array<Bot<S, A, O>>;
  seedStart: number;
  seatRotation?: boolean;
  maxPlies?: number;
  adjudicate?: (state: S) => Result;
  invariants?: Array<(state: S) => void>;
  legality?: Legality;
  hooks?: RunSeriesHooks;
}

export interface ExperimentVariantResult {
  label: string;
  series: SeriesResult;
}

export interface ExperimentResult {
  name: string;
  variants: ExperimentVariantResult[];
}

export async function runExperiment<S, A, C, O>(
  opts: RunExperimentOptions<S, A, C, O>,
): Promise<ExperimentResult> {
  const variants: ExperimentVariantResult[] = [];
  for (const variant of opts.variants) {
    const series = await runSeries({
      game: opts.game,
      config: variant.config,
      bots: opts.bots,
      games: opts.gamesPerVariant,
      seedStart: opts.seedStart,
      seatRotation: opts.seatRotation,
      maxPlies: opts.maxPlies,
      adjudicate: opts.adjudicate,
      invariants: opts.invariants,
      legality: opts.legality,
      hooks: opts.hooks,
    });
    variants.push({ label: variant.label, series });
  }
  return { name: opts.name, variants };
}
