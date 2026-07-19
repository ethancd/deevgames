export type { ScriptedBotContext, ScriptedBot, RawBot, Bot } from './bots.ts';
export { isRawBot, randomBot, greedyBot } from './bots.ts';

export type {
  Legality,
  GameRecord,
  RunSeriesHooks,
  RunSeriesOptions,
  BotTally,
  SeriesResult,
} from './runner.ts';
export { runSeries } from './runner.ts';

export { wilson, mean, fmtPct, fmtCI } from './stats.ts';

export { matchupReport, sweepReport } from './report.ts';

export type {
  ExperimentVariant,
  RunExperimentOptions,
  ExperimentVariantResult,
  ExperimentResult,
} from './experiments.ts';
export { runExperiment } from './experiments.ts';
