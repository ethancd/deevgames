/**
 * EMBER — live LLM-pilot evaluation harness (scripts/llm-eval.ts).
 *
 * Run with:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/llm-eval.ts
 *   npx tsx scripts/llm-eval.ts --dry-run     (no key needed, fake transport)
 *
 * What this does: for every PROMPT_VARIANT (src/pilot/prompts.ts) x every
 * one of the 4 demo scenario ids (src/scenarios), across N=3 seeds each, it
 * spins up a fresh Sim (src/engine) piloted by createLLMPilot
 * (src/pilot/llm.ts) over the real Anthropic transport (createSdkTransport,
 * src/pilot/sdkTransport.ts), runs it for a bounded number of ticks, and
 * reports a pass-rate / intent-validity-rate / mean-latency table. Every
 * trial's recorded intents are also written to scripts/fixtures/ for CI
 * replay (see "FIXTURES & REPLAY" below).
 *
 * WHY THIS DOESN'T CALL src/scenarios' SCENARIOS[i].run() DIRECTLY
 * -----------------------------------------------------------------------
 * `Scenario.run()` is pinned (src/core/types.ts) to take zero arguments,
 * and every scenario module under src/scenarios/ hardcodes
 * `createScriptedPilot()` internally with no pilot-injection point — by
 * design, per PLAN.md, scenario assertions are meant to hold with the
 * deterministic ScriptedPilot so they're CI-stable. There is no contract
 * seam to swap in createLLMPilot() through that interface, and
 * src/scenarios/ is not this agent's directory (module ownership, WF3
 * brief) so its internals can't be reached into either.
 *
 * Instead, this file follows the SAME convention src/ui/presets.ts already
 * established for the identical problem (see that file's header comment):
 * it duplicates the small amount of staging logic locally (a
 * findPassableNear BFS-ring helper, a worldPatch + bodyOverrides pair per
 * scenario id) rather than importing scenario internals, while still
 * legitimately `import { SCENARIOS } from '../src/scenarios'` for the
 * canonical list of 4 scenario ids + descriptions, so the two can't
 * silently drift apart (this file throws at startup if SCENARIOS' ids ever
 * stop matching the STAGINGS table below).
 *
 * The "pass" heuristic here is consequently NOT a reimplementation of each
 * scenario's own multi-part CI assertion (those check ScriptedPilot-specific
 * behavioral facts like exact intent ordering) — it's a simpler, uniform
 * survival heuristic (no forced collapse, ember not near-dead) applied
 * identically across all 4 staged situations, appropriate for comparing
 * prompt variants rather than for asserting scenario correctness. See
 * `computePass` below.
 *
 * FIXTURES & REPLAY
 * -----------------------------------------------------------------------
 * Each trial writes scripts/fixtures/<variant>__<scenarioId>__seed<seed>.json
 * containing { seed, bodyOverrides, intents, ... }. Because this staging
 * uses an arbitrary `worldPatch` function (not just a seed), the pinned
 * `ReplayFile` type (src/ui/contracts.ts) can't losslessly represent it —
 * ReplayFile's `presetId` only names one of src/ui/presets.ts's 3 UI
 * presets, none of which are these 4 scenario ids. So a fixture here is
 * deliberately its OWN shape, not a ReplayFile. To replay one exactly:
 * `import { STAGINGS } from './llm-eval'`, then
 *   createSim({
 *     seed: fixture.seed,
 *     pilot: createScriptedPilot(),       // any Pilot works: intents are
 *                                          // pre-recorded, never consulted
 *     worldPatch: STAGINGS[fixture.scenarioId].worldPatch,
 *     bodyOverrides: fixture.bodyOverrides,
 *     recordedIntents: fixture.intents,
 *   })
 * and run() it — replay is exact because recordedIntents bypasses pilot
 * consultation entirely (PLAN.md §3's replay rule), regardless of how
 * nondeterministic the LLM was when the fixture was generated live.
 *
 * WHAT IS MOCKED VS LIVE (see also ember/README.md's fuller section)
 * -----------------------------------------------------------------------
 * This script CANNOT be live-tested in this environment: there is no
 * Anthropic API key here, and this agent must never attempt a live call
 * (WF3 brief). Everything below the CLI-arg/env-key gate has only been
 * exercised via `--dry-run`, which swaps in a small local fake transport
 * (`makeDryRunTransport`, defined in this file — NOT imported from any
 * *.test.ts, per instructions) that returns hand-built, schema-valid
 * `tool_use` responses. `--dry-run` proves the harness's plumbing end to
 * end (Sim wiring, onEvent bookkeeping, table math, fixture writing); it
 * says nothing about real model behavior or prompt-variant quality.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import type {
  BodyState,
  DeadwoodEntity,
  Intent,
  SkillName,
  Vec,
  WorldState,
} from '../src/core/types';
import { createSim } from '../src/engine';
import { isPassable } from '../src/sim';
import { SCENARIOS } from '../src/scenarios';
import { createLLMPilot } from '../src/pilot/llm';
import { createSdkTransport } from '../src/pilot/sdkTransport';
import { PROMPT_VARIANTS } from '../src/pilot/prompts';
import { DEFAULT_LLM_MODEL } from '../src/pilot/llmContracts';
import type {
  LLMModelId,
  LLMPilotEvent,
  LLMRequest,
  LLMResponseLike,
  LLMTransport,
  PromptVariantId,
} from '../src/pilot/llmContracts';

// --------------------------------------------------------------- constants

/** The 4 pinned scenario ids (src/scenarios/index.ts / PLAN.md §5). */
type ScenarioId =
  | 'rested-vs-depleted'
  | 'anticipatory-shelter'
  | 'dim-ember-wolf'
  | 'miscalibrated-interoception';

const PROMPT_VARIANT_IDS = Object.keys(PROMPT_VARIANTS) as PromptVariantId[];
const KNOWN_MODEL_IDS: readonly LLMModelId[] = [
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'claude-opus-4-8',
];

const SEEDS_PER_TRIAL = 3;
const DEFAULT_TICKS = 48; // 6 pilot consultations at PILOT_PERIOD=8, per trial
const FIXTURES_DIR = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  'fixtures',
);

// ------------------------------------------------------------ local utils
//
// Duplicated in this file rather than imported from src/scenarios/support.ts
// or src/ui/presets.ts, for the same module-ownership reason src/ui/presets.ts
// documents for its own copy: this agent's assigned files don't include
// either directory. See file header.

/** Nearest passable tile to `from` (BFS ring search, deterministic tie-break
 *  by row-major order). Returns `from` itself if already passable. */
function findPassableNear(world: WorldState, from: Vec, maxRadius = 8): Vec {
  if (isPassable(world, from)) return from;
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p: Vec = { x: from.x + dx, y: from.y + dy };
        if (p.x < 0 || p.x >= world.width || p.y < 0 || p.y >= world.height) continue;
        if (isPassable(world, p)) return p;
      }
    }
  }
  return from;
}

function deadwoodNear(near: Vec, offset: Vec, id: string): DeadwoodEntity {
  return { id, pos: { x: near.x + offset.x, y: near.y + offset.y }, fuel: 1 };
}

/** The map corner farthest (Manhattan distance) from the den — used to
 *  stage the ember "afield" for the anticipatory-shelter analogue. */
function farthestCornerFromDen(world: WorldState): Vec {
  const corners: Vec[] = [
    { x: 1, y: 1 },
    { x: 1, y: world.height - 2 },
    { x: world.width - 2, y: 1 },
    { x: world.width - 2, y: world.height - 2 },
  ];
  let best = corners[0];
  let bestDist = -1;
  for (const c of corners) {
    const d = Math.abs(c.x - world.denPos.x) + Math.abs(c.y - world.denPos.y);
    if (d > bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// -------------------------------------------------------------- stagings
//
// One worldPatch + bodyOverrides pair per scenario id, each aiming to put
// the LLM pilot in a situation analogous to the matching CI scenario
// (PLAN.md §5) without depending on that scenario module's internals.

interface Staging {
  id: ScenarioId;
  seed: number;
  worldPatch: (world: WorldState) => void;
  bodyOverrides: Partial<BodyState>;
}

const RESTED_VS_DEPLETED: Staging = {
  id: 'rested-vs-depleted',
  seed: 4242,
  worldPatch: (world) => {
    world.tick = 0; // day, keep heat out of it
    world.weather = 'clear';
    const pos = findPassableNear(world, { x: world.ember.pos.x + 2, y: world.ember.pos.y }, 6);
    world.deadwood.push(deadwoodNear(pos, { x: 0, y: 0 }, 'eval-rvsd-deadwood'));
  },
  bodyOverrides: { fuel: 0.15, heat: 0.7, damage: 0, fatigue: 0.1, activation: 0.05 },
};

const ANTICIPATORY_SHELTER: Staging = {
  id: 'anticipatory-shelter',
  seed: 909,
  worldPatch: (world) => {
    world.tick = 200; // day but dusk (tick 240) is approaching
    world.weather = 'clear';
    world.ember.pos = findPassableNear(world, farthestCornerFromDen(world), 10);
  },
  bodyOverrides: { fuel: 0.7, heat: 0.65, damage: 0, fatigue: 0.15, activation: 0.05 },
};

const DIM_EMBER_WOLF: Staging = {
  id: 'dim-ember-wolf',
  seed: 1717,
  worldPatch: (world) => {
    world.tick = 250; // night; glowRadius(0.3) < WOLF_STALK_GLOW already
    world.weather = 'clear';
    world.ember.pos = findPassableNear(world, { x: 2, y: 2 }, 8);
    const target: Vec = {
      x: Math.min(world.width - 1, world.ember.pos.x + 5),
      y: Math.min(world.height - 1, world.ember.pos.y + 5),
    };
    world.wolf.pos = findPassableNear(world, target, 8);
    world.wolf.state = 'PATROL';
    world.wolf.stateTicks = 0;
  },
  bodyOverrides: { fuel: 0.3, heat: 0.6, damage: 0, fatigue: 0.1, activation: 0.05 },
};

const MISCALIBRATED_INTEROCEPTION: Staging = {
  id: 'miscalibrated-interoception',
  seed: 3131,
  worldPatch: (world) => {
    world.tick = 40; // day
    world.weather = 'clear';
    const pos = findPassableNear(world, { x: world.ember.pos.x - 3, y: world.ember.pos.y + 2 }, 6);
    world.deadwood.push(deadwoodNear(pos, { x: 0, y: 0 }, 'eval-mci-deadwood'));
  },
  // High fatigue widens interoception noise + lowers confidence (see
  // src/body/index.ts's computeInteroception doc) without the pilot being
  // told so directly — the point of this scenario.
  bodyOverrides: { fuel: 0.4, heat: 0.7, damage: 0, fatigue: 0.75, activation: 0.1 },
};

export const STAGINGS: Record<ScenarioId, Staging> = {
  'rested-vs-depleted': RESTED_VS_DEPLETED,
  'anticipatory-shelter': ANTICIPATORY_SHELTER,
  'dim-ember-wolf': DIM_EMBER_WOLF,
  'miscalibrated-interoception': MISCALIBRATED_INTEROCEPTION,
};

function orderedStagings(): Staging[] {
  const ids = SCENARIOS.map((s) => s.id);
  const missing = ids.filter((id) => !(id in STAGINGS));
  if (missing.length > 0) {
    throw new Error(
      `llm-eval.ts's STAGINGS table is missing scenario id(s) ${missing.join(', ')} that ` +
        `src/scenarios/index.ts's SCENARIOS now exports — update STAGINGS to match.`,
    );
  }
  return ids.map((id) => STAGINGS[id as ScenarioId]);
}

// ------------------------------------------------------------- dry-run fake
//
// A small, local, hand-built fake transport — NOT imported from any
// *.test.ts (per instructions). Cycles through a handful of structurally
// valid `tool_use` responses so --dry-run exercises the full pipeline
// (transport -> LLMPilot structural validation -> engine arbiter ->
// fixture write) without ever touching the network or a real key.

function makeDryRunTransport(): LLMTransport {
  const canned: Array<{ skill: SkillName; params: Record<string, unknown> }> = [
    { skill: 'wait', params: { flare: null } },
    { skill: 'move_to', params: { dest: { x: 4, y: 4 }, style: 'cautious' } },
    { skill: 'focus', params: { region: 'fuel' } },
    { skill: 'rest', params: { duration: 10 } },
  ];
  let call = 0;
  return async (_req: LLMRequest): Promise<LLMResponseLike> => {
    call += 1;
    const pick = canned[call % canned.length];
    return {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          name: 'submit_intent',
          input: {
            goal: `dry-run canned decision #${call}`,
            skill: pick.skill,
            params: pick.params,
            interruptConditions: ['threat_above_0.4'],
            thought: 'dry-run',
          },
        },
      ],
    };
  };
}

// ------------------------------------------------------------------ trials

interface TrialResult {
  scenarioId: ScenarioId;
  variant: PromptVariantId;
  seed: number;
  pass: boolean;
  consultOk: number;
  consultFailed: number; // includes auth_error
  latenciesMs: number[];
  intents: Intent[];
  finalTick: number;
  bodyOverrides: Partial<BodyState>;
}

/** Uniform survival heuristic across all 4 stagings — see file header for
 *  why this is deliberately simpler than each scenario's own CI assertion. */
function computePass(sim: { log: { all(): readonly { topic: string }[] }; body: BodyState }): boolean {
  const collapsed = sim.log.all().some((e) => e.topic === 'reflex.collapse');
  return !collapsed && sim.body.damage < 0.9;
}

async function runOneTrial(
  staging: Staging,
  variant: PromptVariantId,
  seedOffset: number,
  transport: LLMTransport,
  model: LLMModelId,
  apiKey: string,
  ticks: number,
): Promise<TrialResult> {
  const seed = staging.seed + seedOffset;
  let consultOk = 0;
  let consultFailed = 0;
  const latenciesMs: number[] = [];

  const pilot = createLLMPilot({
    apiKey,
    model,
    promptVariant: variant,
    transport,
    onEvent: (e: LLMPilotEvent) => {
      if (e.kind === 'consult_ok') {
        consultOk += 1;
        if (e.latencyMs !== undefined) latenciesMs.push(e.latencyMs);
      } else if (e.kind === 'consult_failed' || e.kind === 'auth_error') {
        consultFailed += 1;
        if (e.latencyMs !== undefined) latenciesMs.push(e.latencyMs);
      }
    },
  });

  const sim = createSim({
    seed,
    pilot,
    worldPatch: staging.worldPatch,
    bodyOverrides: staging.bodyOverrides,
  });

  await sim.run(ticks);

  return {
    scenarioId: staging.id,
    variant,
    seed,
    pass: computePass(sim),
    consultOk,
    consultFailed,
    latenciesMs,
    intents: sim.intents,
    finalTick: sim.world.tick,
    bodyOverrides: staging.bodyOverrides,
  };
}

// ------------------------------------------------------------- reporting

interface CellStats {
  trials: number;
  passRate: number;
  validityRate: number | null;
  meanLatencyMs: number | null;
  consultations: number;
}

function summarize(trials: TrialResult[]): CellStats {
  const passCount = trials.filter((t) => t.pass).length;
  const totalOk = trials.reduce((n, t) => n + t.consultOk, 0);
  const totalFailed = trials.reduce((n, t) => n + t.consultFailed, 0);
  const totalConsultations = totalOk + totalFailed;
  const allLatencies = trials.flatMap((t) => t.latenciesMs);
  return {
    trials: trials.length,
    passRate: trials.length > 0 ? passCount / trials.length : 0,
    validityRate: totalConsultations > 0 ? totalOk / totalConsultations : null,
    meanLatencyMs:
      allLatencies.length > 0
        ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
        : null,
    consultations: totalConsultations,
  };
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function fmtPct(n: number | null): string {
  return n === null ? 'n/a' : `${(n * 100).toFixed(0)}%`;
}

function fmtMs(n: number | null): string {
  return n === null ? 'n/a' : `${Math.round(n)}ms`;
}

function printTable(byCell: Map<string, TrialResult[]>): void {
  const cols = [
    ['variant', 10],
    ['scenario', 26],
    ['trials', 7],
    ['pass-rate', 10],
    ['intent-validity', 16],
    ['mean-latency', 13],
  ] as const;

  const header = cols.map(([label, w]) => pad(label, w)).join(' | ');
  console.log(header);
  console.log(cols.map(([, w]) => '-'.repeat(w)).join('-+-'));

  for (const variant of PROMPT_VARIANT_IDS) {
    for (const staging of orderedStagings()) {
      const key = `${variant}::${staging.id}`;
      const trials = byCell.get(key) ?? [];
      const stats = summarize(trials);
      const row = [
        pad(variant, 10),
        pad(staging.id, 26),
        pad(String(stats.trials), 7),
        pad(fmtPct(stats.passRate), 10),
        pad(fmtPct(stats.validityRate), 16),
        pad(fmtMs(stats.meanLatencyMs), 13),
      ].join(' | ');
      console.log(row);
    }
  }
}

// -------------------------------------------------------------- fixtures

function writeFixture(trial: TrialResult, model: LLMModelId): void {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const filename = `${trial.variant}__${trial.scenarioId}__seed${trial.seed}.json`;
  const filePath = path.join(FIXTURES_DIR, filename);
  const payload = {
    version: 1,
    kind: 'ember-llm-eval-fixture',
    note:
      'Not a src/ui/contracts.ts ReplayFile (worldPatch cannot serialize). Replay via ' +
      "STAGINGS[scenarioId].worldPatch exported from scripts/llm-eval.ts — see that file's header.",
    promptVariant: trial.variant,
    scenarioId: trial.scenarioId,
    model,
    seed: trial.seed,
    bodyOverrides: trial.bodyOverrides,
    finalTick: trial.finalTick,
    pass: trial.pass,
    consultOk: trial.consultOk,
    consultFailed: trial.consultFailed,
    latenciesMs: trial.latenciesMs,
    intents: trial.intents,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

// ------------------------------------------------------------------- cli

interface CliOptions {
  dryRun: boolean;
  ticks: number;
  model: LLMModelId;
}

function parseArgs(argv: string[]): CliOptions {
  const dryRun = argv.includes('--dry-run');
  const ticksArg = argv.find((a) => a.startsWith('--ticks='));
  const ticks = ticksArg ? Number(ticksArg.slice('--ticks='.length)) : DEFAULT_TICKS;
  const modelArg = argv.find((a) => a.startsWith('--model='))?.slice('--model='.length);
  const envModel = process.env.EMBER_EVAL_MODEL;
  const requestedModel = modelArg ?? envModel ?? DEFAULT_LLM_MODEL;
  const model = (KNOWN_MODEL_IDS as readonly string[]).includes(requestedModel)
    ? (requestedModel as LLMModelId)
    : DEFAULT_LLM_MODEL;
  return {
    dryRun,
    ticks: Number.isFinite(ticks) && ticks > 0 ? Math.floor(ticks) : DEFAULT_TICKS,
    model,
  };
}

// ------------------------------------------------------------------- main

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.dryRun && !apiKey) {
    console.log(
      'EMBER llm-eval: set ANTHROPIC_API_KEY in your environment to run this against the ' +
        'real Anthropic API, e.g.:\n' +
        '  ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/llm-eval.ts\n' +
        'Or run `npx tsx scripts/llm-eval.ts --dry-run` to exercise the harness end-to-end ' +
        'with a fake transport (no key, no network, no cost).',
    );
    process.exit(0);
    return;
  }

  const stagings = orderedStagings();
  const transport: LLMTransport = opts.dryRun
    ? makeDryRunTransport()
    : createSdkTransport({ apiKey: apiKey as string });
  const trialApiKey = apiKey ?? 'dry-run-placeholder-key';

  console.log(
    `EMBER llm-eval: ${opts.dryRun ? 'DRY RUN (fake transport)' : `LIVE (model ${opts.model})`}, ` +
      `${PROMPT_VARIANT_IDS.length} prompt variant(s) x ${stagings.length} scenario(s) x ` +
      `${SEEDS_PER_TRIAL} seed(s), ${opts.ticks} ticks/trial.`,
  );
  if (!opts.dryRun) {
    console.log(
      `EMBER llm-eval: this makes real, billed Anthropic API calls (roughly ` +
        `${PROMPT_VARIANT_IDS.length * stagings.length * SEEDS_PER_TRIAL} trials x ` +
        `up to ${Math.ceil(opts.ticks / 8)} consultations each). Costs are yours — see README.md.`,
    );
  }
  console.log('');

  const byCell = new Map<string, TrialResult[]>();
  const allTrials: TrialResult[] = [];
  const startedAt = Date.now();
  let trialIndex = 0;
  const totalTrials = PROMPT_VARIANT_IDS.length * stagings.length * SEEDS_PER_TRIAL;

  for (const variant of PROMPT_VARIANT_IDS) {
    for (const staging of stagings) {
      const key = `${variant}::${staging.id}`;
      const trials: TrialResult[] = [];
      for (let seedOffset = 0; seedOffset < SEEDS_PER_TRIAL; seedOffset++) {
        trialIndex += 1;
        // eslint-disable-next-line no-await-in-loop -- intentionally sequential (bounded API cost)
        const trial = await runOneTrial(
          staging,
          variant,
          seedOffset,
          transport,
          opts.model,
          trialApiKey,
          opts.ticks,
        );
        trials.push(trial);
        allTrials.push(trial);
        writeFixture(trial, opts.model);
        console.log(
          `[${trialIndex}/${totalTrials}] ${pad(variant, 10)} ${pad(staging.id, 26)} ` +
            `seed=${trial.seed} pass=${trial.pass} ok=${trial.consultOk} failed=${trial.consultFailed}`,
        );
      }
      byCell.set(key, trials);
    }
  }

  console.log('');
  printTable(byCell);
  console.log('');
  console.log(
    `EMBER llm-eval: ${allTrials.length} trial(s) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s. ` +
      `Fixtures written to ${path.relative(process.cwd(), FIXTURES_DIR)}/.`,
  );
}

const isMainModule = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === url.pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main().catch((err) => {
    console.error('EMBER llm-eval: fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
