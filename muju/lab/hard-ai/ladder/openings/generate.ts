/** P1 scripted Phasing opening generator. Each candidate completes White's
 * first Act -> mine/upkeep -> Prepare -> handoff, ending at Black's Act root.
 * h0/h3 share that shape; Black has not spent its different initial bank yet.
 * Old Standard generation is reproducible at standard-final, not with these bots.
 * Use split.ts to allocate P1; never write a pooled or sealed file into the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { legalActions } from '../../../harness/legal';
import { buildView } from '../../../harness/runner';
import { createBot } from '../../../harness/bots';
import { mulberry32, deriveSeed, type Rng } from '../../../harness/rng';
import { applyAction } from '../../../../src/ai/simulate';
import { defaultUpkeepAction } from '../../../../src/game/upkeep';
import {
  actionToOpeningAction,
  applyOpening as applyStandardOpening,
  gameplayDigest as standardDigest,
  loadOpenings,
  withOpeningRules,
  type OpeningAction,
  type OpeningSpec,
} from '../openings';
import { applyOpening, gameplayDigest, initialStateFor } from './phasing';
import { phaseEndAction, isLegalAction } from '../../../../src/game/legality';
import type { AIAction } from '../../../../src/ai/types';

/** Number of Act decisions to permit before ending Act; Prepare always completes. */
export const ACT_TARGETS: readonly number[] = [1, 2, 3, 4];
/** Historical E0 lengths, retained only for archive tests. */
export const PLY_TARGETS: readonly number[] = [2, 3, 4, 5];

/**
 * Scripted bots used to drive candidates, White only: an opening is cut at the
 * handover, so Black never acts in a candidate. All are cheap (no search), all
 * take their randomness from the harness `Rng` handed to `chooseAction`, so the
 * whole generator is reproducible from one seed.
 */
export const DRIVER_BOTS: readonly string[] = ['Random', 'Rush', 'Greedy', 'Expand', 'Balanced'];

/** Handicaps every emitted opening must replay legally under. */
export const REQUIRED_HANDICAPS: readonly number[] = [0, 3];

/**
 * Shortest opening the set will emit. A one-ply opening is the initial
 * position with a single unit displaced; it is a distinct position, but it is
 * too close to `initial` to be worth a line in an opening book.
 */
export const MIN_PLIES = 2;

/**
 * What an `--id-prefix` may contain. An opening id is a path segment of every
 * replay filename and the first field of every `pairId`
 * (`openings.ts#OPENING_ID_RE`), so a prefix is held to the same alphabet; the
 * length cap leaves room for the `g<plies>-s<attempt>` body inside 64
 * characters. P1 prefixes must start with `p1-`; Standard generation belongs to standard-final.
 */
export const ID_PREFIX_RE = /^[A-Za-z0-9_-]{0,32}$/;

export interface GenerateOptions {
  /** Openings to emit. The generator fails rather than emit fewer. */
  count: number;
  /** Root seed; every draw descends from it. */
  seed: number;
  /** Candidates tried before giving up (guards against an over-constrained request). */
  maxAttempts?: number;
  /**
   * Prepended to every emitted id. Ids are `g<plies>-s<attempt>` and the
   * attempt counter restarts at every generation, so a second pool generated
   * at a different seed would mint ids the E0 file already uses — and a
   * `pairId` embeds the opening id, so colliding ids across two files collide
   * in run artifacts. Defaults to `p1-`; old prefixes are refused.
   */
  idPrefix?: string;
  /**
   * Openings from other committed files that this pool must stay disjoint
   * from. A candidate is refused when its handicap-0 `gameplayDigest` matches
   * one of these, or when its action list stands in a prefix relation with
   * one — the same two rules the generator already applies WITHIN a file,
   * extended across P1 files. Archived Standard exclusions are supported only
   * for historical structural tests, under their original rules.
   */
  exclude?: readonly ExcludedOpening[];
}

/** One opening from an `--exclude` file, with the handicap-0 digest a candidate is compared against. */
export interface ExcludedOpening {
  /** Id as it appears in the excluded file, used only in messages. */
  id: string;
  actions: readonly OpeningAction[];
  /** `gameplayDigest` of the position it reaches at handicap 0. */
  digest: string;
  /** File it was read from, used only in messages. */
  source: string;
}

/**
 * Reads `--exclude` files and digests every row at handicap 0. Throws if a row
 * does not replay: an exclusion list that silently dropped a row would let the
 * new pool duplicate exactly the openings the operator meant to exclude.
 */
export function loadExclusions(paths: readonly string[]): ExcludedOpening[] {
  const out: ExcludedOpening[] = [];
  for (const filePath of paths) {
    const file = loadOpenings(filePath);
    for (const opening of file.openings) {
      out.push({
        id: opening.id,
        actions: opening.actions,
        digest: opening.id.startsWith('p1-')
          ? gameplayDigest(applyOpening(opening, { blackCrystalHandicap: REQUIRED_HANDICAPS[0] }))
          : standardDigest(applyStandardOpening(opening, { blackCrystalHandicap: REQUIRED_HANDICAPS[0] })),
        source: filePath,
      });
    }
  }
  return out;
}

export interface GeneratedOpening {
  spec: OpeningSpec;
  /** `gameplayDigest` of the position the opening reaches at handicap 0. */
  digest: string;
  /** All recorded decisions through the first complete White turn. */
  plies: number;
  /**
   * Name of the bot that produced it. White only: an opening is cut at the
   * handover (module doc), so no bot ever moves for Black in a candidate.
   */
  driver: string;
}

export interface GenerateResult {
  openings: GeneratedOpening[];
  /** Candidates generated, accepted or not. */
  attempts: number;
  /** Rejections by reason, for the run log. */
  rejected: Record<string, number>;
  /** Recorded ply count -> number of emitted openings. */
  plyDistribution: Record<number, number>;
  /** Openings loaded from `--exclude` files and held against every candidate. */
  excluded: number;
}

function rejectionKey(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split(';')[0].slice(0, 120);
}

/**
 * Plays one candidate. Mirrors `harness/runner.ts#playGameInner`'s scripted
 * branch: upkeep is answered by `defaultUpkeepAction` while it is pending,
 * otherwise the bot picks from the authoritative legal set. Act stops at its
 * decision target; Prepare always continues to the handoff.
 */
function playCandidate(actDecisions: number, whiteBot: string, seed: number): OpeningAction[] {
  const bot = createBot(whiteBot);
  if (bot.kind !== 'scripted') throw new Error(`generate: driver "${bot.name}" is not scripted`);
  const rng: Rng = mulberry32(deriveSeed(seed, 0));
  bot.onGameStart?.('white', deriveSeed(seed, 0));
  const recorded: OpeningAction[] = [];
  let state = initialStateFor();
  let acted = 0;
  // 100 board squares bound promotions and commitments separately, plus Act
  // and phase/upkeep controls. Hitting this guard invalidates the candidate.
  for (let i = 0; i < 207; i++) {
    if (state.phase !== 'playing') return [];
    if (state.turn.currentPlayer === 'black') return recorded;
    const legal = legalActions(state, 'white');
    let action: AIAction;
    if (state.upkeepPending) action = defaultUpkeepAction(state, false);
    else if (state.turn.phase === 'action' && acted >= actDecisions) action = phaseEndAction(state);
    else action = bot.chooseAction({ view: buildView(state, 'white'), legal, rng }) ?? phaseEndAction(state);
    if (!isLegalAction(state, action, 'white')) throw new Error(`generate: ${bot.name} emitted an illegal action`);
    const next = applyAction(state, action);
    if (next === state) throw new Error(`generate: ${bot.name} emitted a no-op`);
    if (state.turn.phase === 'action' && action.type !== 'END_ACTION_PHASE') acted++;
    recorded.push(actionToOpeningAction(state, action, `generate: ply ${i}`));
    state = next;
  }
  throw new Error('generate: first-turn decision guard exceeded');
}

function isPrefixOf(shorter: readonly OpeningAction[], longer: readonly OpeningAction[]): boolean {
  if (shorter.length > longer.length) return false;
  return shorter.every((a, i) => serializeAction(a) === serializeAction(longer[i]));
}

/**
 * Generates `count` openings deterministically from `seed`. Throws when the
 * attempt budget runs out first: emitting fewer than asked would silently
 * shrink the variety a run believes it has.
 */
export function generateOpenings(options: GenerateOptions): GenerateResult {
  const maxAttempts = options.maxAttempts ?? Math.max(200, options.count * 20);
  const idPrefix = options.idPrefix ?? 'p1-';
  if (!ID_PREFIX_RE.test(idPrefix) || !idPrefix.startsWith('p1-')) {
    throw new Error(`generate: --id-prefix "${idPrefix}" must start with p1- and match ${String(ID_PREFIX_RE)}`);
  }
  const exclude = options.exclude ?? [];
  const excludedDigests = new Set(exclude.map(e => e.digest));
  const accepted: GeneratedOpening[] = [];
  const digests = new Set<string>();
  const rejected: Record<string, number> = {};
  const reject = (reason: string): void => { rejected[reason] = (rejected[reason] ?? 0) + 1; };
  let attempts = 0;

  while (accepted.length < options.count && attempts < maxAttempts) {
    const s = attempts;
    attempts++;
    const plies = ACT_TARGETS[s % ACT_TARGETS.length];
    const whiteBot = DRIVER_BOTS[s % DRIVER_BOTS.length];
    const seed = deriveSeed(options.seed, s);
    const actions = withOpeningRules({}, () => playCandidate(plies, whiteBot, seed));
    if (actions.length < MIN_PLIES) { reject(`shorter than ${MIN_PLIES} plies`); continue; }

    // IDs report all decisions, including upkeep, Prepare and both phase ends.
    const spec: OpeningSpec = { id: `${idPrefix}g${actions.length}-s${s}`, actions };
    let digest: string;
    try {
      digest = gameplayDigest(applyOpening(spec, { blackCrystalHandicap: REQUIRED_HANDICAPS[0] }));
      for (const handicap of REQUIRED_HANDICAPS.slice(1)) {
        applyOpening(spec, { blackCrystalHandicap: handicap });
      }
    } catch (err) {
      reject(`invalid replay: ${rejectionKey(err)}`);
      continue;
    }
    if (digests.has(digest)) { reject('duplicate digest'); continue; }
    if (excludedDigests.has(digest)) { reject('duplicate digest of an excluded opening'); continue; }
    if (accepted.some(a => isPrefixOf(a.spec.actions, actions) || isPrefixOf(actions, a.spec.actions))) {
      reject('prefix of an accepted opening');
      continue;
    }
    if (exclude.some(e => isPrefixOf(e.actions, actions) || isPrefixOf(actions, e.actions))) {
      reject('prefix of an excluded opening');
      continue;
    }
    digests.add(digest);
    accepted.push({ spec, digest, plies: actions.length, driver: whiteBot });
  }

  if (accepted.length < options.count) {
    throw new Error(
      `generate: only ${accepted.length} of ${options.count} openings after ${attempts} attempts ` +
        `(rejections: ${JSON.stringify(rejected)}); raise --max-attempts or lower --count`,
    );
  }
  assertDiverse(accepted, exclude);
  const plyDistribution: Record<number, number> = {};
  for (const o of accepted) plyDistribution[o.plies] = (plyDistribution[o.plies] ?? 0) + 1;
  return { openings: accepted, attempts, rejected, plyDistribution, excluded: exclude.length };
}

/**
 * The two diversity properties the set is allowed to claim, re-checked over
 * the finished set rather than trusted from the accept loop: N openings, N
 * distinct h0 digests, and no opening a prefix of another. The test asserts
 * the same two properties against the committed bytes.
 */
export function assertDiverse(openings: readonly GeneratedOpening[], exclude: readonly ExcludedOpening[] = []): void {
  const digests = new Set(openings.map(o => o.digest));
  if (digests.size !== openings.length) {
    throw new Error(`generate: ${openings.length} openings resolve to only ${digests.size} distinct h0 digests`);
  }
  for (let i = 0; i < openings.length; i++) {
    for (let k = 0; k < openings.length; k++) {
      if (i === k) continue;
      if (isPrefixOf(openings[i].spec.actions, openings[k].spec.actions)) {
        throw new Error(`generate: opening "${openings[i].spec.id}" is a prefix of "${openings[k].spec.id}"`);
      }
    }
  }
  // The same two properties across files, so a second pool cannot re-name a
  // position an earlier frozen file already holds (ALLOCATION.md states this
  // as tested).
  const excludedByDigest = new Map(exclude.map(e => [e.digest, e] as const));
  for (const o of openings) {
    const clash = excludedByDigest.get(o.digest);
    if (clash) {
      throw new Error(`generate: opening "${o.spec.id}" reaches the same h0 position as excluded "${clash.id}" (${clash.source})`);
    }
    for (const e of exclude) {
      if (isPrefixOf(e.actions, o.spec.actions) || isPrefixOf(o.spec.actions, e.actions)) {
        throw new Error(`generate: opening "${o.spec.id}" stands in a prefix relation with excluded "${e.id}" (${e.source})`);
      }
    }
  }
}

/**
 * One action as JSON with a fixed key order. `JSON.stringify` follows
 * insertion order, so the file's bytes must not depend on the order the
 * simulator happened to build an object in.
 */
export function serializeAction(action: OpeningAction): string {
  switch (action.type) {
    case 'MOVE': return JSON.stringify({ type: 'MOVE', from: { x: action.from.x, y: action.from.y }, to: { x: action.to.x, y: action.to.y } });
    case 'ATTACK': return JSON.stringify({ type: 'ATTACK', from: { x: action.from.x, y: action.from.y }, targetPosition: { x: action.targetPosition.x, y: action.targetPosition.y } });
    case 'PROMOTE_UNIT': return JSON.stringify({ type: 'PROMOTE_UNIT', from: { x: action.from.x, y: action.from.y } });
    case 'BUY_UNIT': return JSON.stringify({ type: 'BUY_UNIT', definitionId: action.definitionId, position: { x: action.position.x, y: action.position.y } });
    case 'PAY_UPKEEP': return JSON.stringify({ type: 'PAY_UPKEEP', keep: action.keep.map(p => ({ x: p.x, y: p.y })) });
    case 'END_PLACE_PHASE': return JSON.stringify({ type: 'END_PLACE_PHASE' });
    case 'END_ACTION_PHASE': return JSON.stringify({ type: 'END_ACTION_PHASE' });
  }
}

/**
 * The exact bytes of an openings file: one `{id, actions}` row per line,
 * trailing newline, no comments (the format `openings.ts#parseOpenings`
 * accepts). Split files are written through this too, so a stratum file's row
 * is byte-identical with the pool row it was drawn from.
 */
export function renderOpeningSpecs(openings: readonly OpeningSpec[]): string {
  return openings
    .map(o => `{"id":${JSON.stringify(o.id)},"actions":[${o.actions.map(serializeAction).join(',')}]}`)
    .join('\n') + '\n';
}

/** The exact bytes of the openings file: one `{id, actions}` row per line, trailing newline, no comments. */
export function renderOpeningsFile(openings: readonly GeneratedOpening[]): string {
  return renderOpeningSpecs(openings.map(o => o.spec));
}

interface Cli { count: number; seed: number; out: string; maxAttempts?: number; idPrefix: string; exclude: string[] }

export function parseArgs(argv: readonly string[]): Cli {
  let count = 48;
  let seed = 20260954;
  let out = 'lab/hard-ai/ladder/openings/p1-dev-candidate.jsonl';
  let maxAttempts: number | undefined;
  let idPrefix = 'p1-';
  const exclude: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const need = (): string => {
      if (value === undefined) throw new Error(`generate: ${flag} needs a value`);
      i++;
      return value;
    };
    const num = (name: string): number => {
      const n = Number(need());
      if (!Number.isFinite(n)) throw new Error(`generate: ${name} must be a number`);
      return n;
    };
    switch (flag) {
      case '--count': count = num('--count'); break;
      case '--seed': seed = num('--seed'); break;
      case '--max-attempts': maxAttempts = num('--max-attempts'); break;
      case '--out': out = need(); break;
      case '--id-prefix': idPrefix = need(); break;
      case '--exclude': exclude.push(need()); break;
      default: throw new Error(`generate: unknown flag ${flag}`);
    }
  }
  if (!Number.isInteger(count) || count < 1) throw new Error('generate: --count must be a positive integer');
  if (!Number.isInteger(seed)) throw new Error('generate: --seed must be an integer');
  if (!ID_PREFIX_RE.test(idPrefix) || !idPrefix.startsWith('p1-')) throw new Error(`generate: --id-prefix "${idPrefix}" must start with p1- and match ${String(ID_PREFIX_RE)}`);
  return { count, seed, out, maxAttempts, idPrefix, exclude };
}

function main(argv: readonly string[]): void {
  const cli = parseArgs(argv);
  const exclude = loadExclusions(cli.exclude.map(p => path.resolve(p)));
  const result = generateOpenings({
    count: cli.count,
    seed: cli.seed,
    maxAttempts: cli.maxAttempts,
    idPrefix: cli.idPrefix,
    exclude,
  });
  const text = renderOpeningsFile(result.openings);
  const outPath = path.resolve(cli.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, text, { flag: 'wx' });
  const dist = Object.keys(result.plyDistribution)
    .map(Number)
    .sort((a, b) => a - b)
    .map(k => `${k} plies: ${result.plyDistribution[k]}`)
    .join(', ');
  process.stdout.write(
    `openings: wrote ${result.openings.length} openings to ${outPath}\n` +
      `openings: seed ${cli.seed}, ${result.attempts} candidates tried, rejections ${JSON.stringify(result.rejected)}\n` +
      `openings: id prefix ${JSON.stringify(cli.idPrefix)}; ${result.excluded} openings excluded from ` +
      `${cli.exclude.length} file(s)${cli.exclude.length > 0 ? ` (${cli.exclude.join(', ')})` : ''}\n` +
      `openings: ply distribution — ${dist}\n` +
      `openings: distinct h0 digests ${new Set(result.openings.map(o => o.digest)).size}/${result.openings.length}\n` +
      `openings: validated at handicaps ${REQUIRED_HANDICAPS.join(', ')}\n`,
  );
  for (const o of result.openings) {
    process.stdout.write(`  ${o.spec.id}  plies=${o.plies}  driver=${o.driver}  h0=${o.digest.slice(0, 12)}\n`);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main(process.argv.slice(2));
