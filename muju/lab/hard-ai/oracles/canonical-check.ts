/**
 * `node --import tsx lab/hard-ai/oracles/canonical-check.ts --fixtures <names>
 *  --corpus <file> --corpus-positions <n> --max-own-units <n> [--shards <n>]
 *  [--node-budget <n>] [--out <path>] [--prune-zero-damage]`
 *  (DESIGN §5.3/§5.4, MILESTONES.md M11).
 *
 * The F1 gate. `gen/actionsearch.ts` collapses the action phase with three
 * rules — C0 promotions by slot, C1 footprint independence, C2 the within-turn
 * TT — and the only thing that makes those rules safe is that they never drop
 * an END POSITION. So this oracle runs, per position, three enumerations of
 * the same macro turn and compares their end-position `Kpos` SETS:
 *
 *   naive    `ActionSearch.enumerateAll` — every legal sequence, no ordering,
 *            no widening, no TT;
 *   canon    `ActionSearch.run` with widths `[∞,∞,∞,∞]` and `ttBits: 0` — C1
 *            only. `endSetMismatch` counts positions where this set differs
 *            from `naive`'s in either direction;
 *   canon+TT the same `run` with the turn TT on. `ttEndSetMismatch` counts
 *            positions where the TT lost an end position `canon` found — a
 *            probe hit must mean "this exact `Kturn` was already expanded with
 *            at least this many actions left", never "close enough".
 *
 * Set equality, not multiset: a pruned order whose swapped form reaches the
 * same squares with more actions left reaches a SUPERSET of end positions,
 * which is the entire point of the canonicalisation (DESIGN §5.3).
 *
 * **Action budgets.** The naive tree is not enumerable at four actions for a
 * real mid-game position: root branching runs to ~800 with multi-action moves
 * (measured over `fuzz-1000.jsonl`), so the four-action tree is ~10^11 nodes.
 * Every position is therefore checked at the LARGEST action budget whose naive
 * tree fits `--node-budget` nodes, found by lowering `p.actions` (a perfectly
 * ordinary mid-turn state) and re-deriving the hashes with `Replica.rehash`.
 * C1 is a rule about ADJACENT pairs in the DFS, so a two-action budget already
 * exercises it exhaustively; the fixtures and the initial position, which are
 * small, are checked at their full depth. See DEVIATIONS.md under M11.
 *
 * **The initial position** is measured separately and reported on its own:
 * `initialEndPositions` (797, ET §1.4 / DESIGN §7.2), `initialMidStates` (the
 * canonical+TT mid-turn state count, 1,053) and `ttReduction`
 * (`initialNaiveSequences / initialMidStates`).
 *
 * `--shards N` runs the work list in N child processes of this same file
 * (`--shard-index`/`--shard-count`, disjoint strides of one deterministic
 * list) and merges their partial artifacts, exactly as `ladder/shard.ts` does.
 *
 * **`--prune-zero-damage`** (STRATEGOS W1.7, plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md` B.2 step W1.7) turns
 * `gen/actionsearch.ts ActionSearch.setPruneZeroDamage` (the prune
 * `config.ts SearchFix.pruneZeroDamage` selects) ON for `canon`, `canon+TT`
 * and the shipped-TT search only — `naive` stays the unpruned ground truth —
 * so `endSetMismatch`/`ttEndSetMismatch` become exactly the prune's own
 * soundness test: a zero-power ATTACK dropped from the candidate set must
 * never remove a reachable end position. The default `authored`/`canonical`
 * sets are Standard-ruleset rows the Phasing-only replica skips (as is the
 * `initial` item), so without more fixtures the flag would prove nothing: it
 * pulls in the `zero-damage` set (`positions/zero-damage.jsonl`,
 * `positions/generate-zero-damage.ts` has the recipe) unless the caller
 * names its own `--fixtures`. `--corpus p4-determinism.jsonl
 * --corpus-positions 24 --max-own-units 40` adds real Phasing Act roots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createInitialGameState } from '../../../src/game/board';
import type { GameState } from '../../../src/game/types';
import { ACTIONS_PER_TURN, Replica, allocState, newUndo, type Undo } from '../../../src/ai/hard/core/state';
import { AKind, newKeepSetTable, paMake, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { Result, type PackedState } from '../../../src/ai/hard/types';
import { ActionSearch, UNLIMITED_WORK, neutralTables } from '../../../src/ai/hard/gen/actionsearch';
import { TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import { readPositions } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const SELF = path.resolve(import.meta.dirname, 'canonical-check.ts');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/canonical.json');
const MAX_REPORTED_MISMATCHES = 20;

/** Fixture-set names accepted by `--fixtures`. */
const FIXTURE_FILES: Readonly<Record<string, string>> = {
  authored: 'authored.jsonl',
  canonical: 'canonical-fixtures.jsonl',
  openings: 'openings.jsonl',
  /** STRATEGOS W1.7: zero-power attacker/defender pairs (`generate-zero-damage.ts`
   * has the recipe), plus one paired position whose power is 1 so the same run
   * proves the prune does NOT also drop chip damage. */
  'zero-damage': 'zero-damage.jsonl',
};

/** Unbounded widening: larger than any node's action list (`4 + 128 * 104`). */
const UNBOUNDED_WIDTH = 1 << 24;
/**
 * TT size for the initial-position mid-state count. The table is direct-mapped
 * on `keyLo`, so at the shipped 18 bits two index collisions re-expand a state
 * that was already searched (1,054 nodes instead of 1,053) without changing a
 * single result; 20 bits reproduces DESIGN §5.3's number exactly. Both are
 * reported.
 */
const MEASURE_TT_BITS = 20;
const SHIPPED_TT_BITS = 18;

interface Args {
  fixtures: string[];
  corpus: string;
  corpusPositions: number;
  maxOwnUnits: number;
  nodeBudget: number;
  shards: number;
  shardIndex: number;
  shardCount: number;
  out: string;
  /** STRATEGOS W1.7 (`SearchFix.pruneZeroDamage`). See `CanonicalChecker`. */
  pruneZeroDamage: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fixtures: ['authored', 'canonical'],
    corpus: 'fuzz-1000.jsonl',
    corpusPositions: 200,
    maxOwnUnits: 10,
    nodeBudget: 500_000,
    shards: 1,
    shardIndex: -1,
    shardCount: 1,
    out: DEFAULT_OUT,
    pruneZeroDamage: false,
  };
  let fixturesGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixtures') {
      args.fixtures = argv[++i].split(',').map(s => s.trim()).filter(s => s.length > 0);
      fixturesGiven = true;
    } else if (a === '--corpus') args.corpus = argv[++i];
    else if (a === '--corpus-positions') args.corpusPositions = Number(argv[++i]);
    else if (a === '--max-own-units') args.maxOwnUnits = Number(argv[++i]);
    else if (a === '--node-budget') args.nodeBudget = Number(argv[++i]);
    else if (a === '--shards') args.shards = Number(argv[++i]);
    else if (a === '--shard-index') args.shardIndex = Number(argv[++i]);
    else if (a === '--shard-count') args.shardCount = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--prune-zero-damage') args.pruneZeroDamage = true;
    else throw new Error(`oracles/canonical-check: unrecognised argument "${a}"`);
  }
  // `--prune-zero-damage` with the default fixtures would silently prove
  // nothing (`authored`/`canonical` are Standard rows the Phasing-only
  // replica skips), so the flag pulls in `zero-damage` unless the caller
  // named its own `--fixtures`.
  if (args.pruneZeroDamage && !fixturesGiven && !args.fixtures.includes('zero-damage')) {
    args.fixtures = [...args.fixtures, 'zero-damage'];
  }
  for (const name of args.fixtures) {
    if (!(name in FIXTURE_FILES)) {
      throw new Error(`oracles/canonical-check: unknown fixture set "${name}" (have ${Object.keys(FIXTURE_FILES).join(', ')})`);
    }
  }
  return args;
}

// --- the work list -------------------------------------------------------------

type ItemKind = 'initial' | 'fixture' | 'corpus';

interface WorkItem {
  kind: ItemKind;
  id: string;
  /** Upper bound on the action budget; the real one can only be lower. */
  maxActions: number;
  state: GameState;
}

/** Own units of the side to move, counted on the `GameState` so the work list
 * can be built identically in every shard without packing anything. */
function ownUnits(state: GameState): number {
  const me = state.turn.currentPlayer;
  let n = 0;
  for (const u of state.board.units) if (u.owner === me) n++;
  return n;
}

/**
 * The deterministic work list every shard computes: the initial position, then
 * each named fixture file in order, then the first `corpusPositions` corpus
 * entries that are ongoing and within `maxOwnUnits`.
 */
function buildWorkList(args: Args): WorkItem[] {
  const items: WorkItem[] = [
    { kind: 'initial', id: 'initial', maxActions: ACTIONS_PER_TURN, state: createInitialGameState() },
  ];
  for (const name of args.fixtures) {
    const file = path.join(POSITIONS_DIR, FIXTURE_FILES[name]);
    if (!fs.existsSync(file)) throw new Error(`oracles/canonical-check: missing fixture file ${file}`);
    for (const sp of readPositions(file)) {
      items.push({ kind: 'fixture', id: `${name}#${sp.id}`, maxActions: clampActions(sp.depth), state: sp.state });
    }
  }
  const corpusPath = path.join(POSITIONS_DIR, args.corpus);
  if (!fs.existsSync(corpusPath)) throw new Error(`oracles/canonical-check: missing corpus ${corpusPath}`);
  let taken = 0;
  for (const sp of readPositions(corpusPath)) {
    if (taken >= args.corpusPositions) break;
    if (sp.state.phase !== 'playing') continue;
    if (ownUnits(sp.state) > args.maxOwnUnits) continue;
    items.push({ kind: 'corpus', id: `corpus#${sp.id}`, maxActions: ACTIONS_PER_TURN, state: sp.state });
    taken++;
  }
  return items;
}

function clampActions(depth: number | undefined): number {
  if (depth === undefined || !Number.isInteger(depth) || depth < 1) return ACTIONS_PER_TURN;
  return depth > ACTIONS_PER_TURN ? ACTIONS_PER_TURN : depth;
}

// --- one position ---------------------------------------------------------------

interface Mismatch {
  kind: string;
  id: string;
  detail: string;
}

interface InitialMetrics {
  initialNaiveSequences: number;
  initialEndPositions: number;
  initialMidStates: number;
  initialMidStatesShippedTt: number;
  initialDistinctMidStates: number;
  ttReduction: number;
}

interface Partial {
  checked: number;
  checkedByKind: Record<ItemKind, number>;
  skipped: number;
  skippedIds: string[];
  endSetMismatch: number;
  ttEndSetMismatch: number;
  budgetHistogram: Record<number, number>;
  naiveSequences: number;
  endPositions: number;
  mismatches: Mismatch[];
  initial: InitialMetrics | null;
}

function newPartial(): Partial {
  return {
    checked: 0,
    checkedByKind: { initial: 0, fixture: 0, corpus: 0 },
    skipped: 0,
    skippedIds: [],
    endSetMismatch: 0,
    ttEndSetMismatch: 0,
    budgetHistogram: {},
    naiveSequences: 0,
    endPositions: 0,
    mismatches: [],
    initial: null,
  };
}

function keyOf(lo: number, hi: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

/** `a \ b`, capped — only used to describe a failure. */
function difference(a: ReadonlySet<string>, b: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const k of a) {
    if (b.has(k)) continue;
    out.push(k);
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * One checker, reused across the whole shard: the replica, one `ActionSearch`
 * per TT configuration (the TT lives on the instance) and the scratch they
 * share. Nothing here is per-position state.
 */
class CanonicalChecker {
  private readonly rep = new Replica();
  private readonly pool = new TurnPool(8);
  private readonly sc = new Scratch(1, 1, 1, 1);
  private readonly undo: Undo = newUndo();
  private readonly keep: KeepSetTable = newKeepSetTable();
  private readonly prefix = new Int32Array(8);
  private readonly out: Turn[] = [];
  private readonly naiveSearch: ActionSearch;
  private readonly canonSearch: ActionSearch;
  private readonly ttSearch: ActionSearch;
  private readonly shippedTtSearch: ActionSearch;

  /**
   * `pruneZeroDamage` (STRATEGOS W1.7, `SearchFix.pruneZeroDamage`): turns the
   * prune ON for `canonSearch`/`ttSearch`/`shippedTtSearch` only.
   * `naiveSearch` NEVER gets it — it stays the ground truth `enumerateAll`
   * enumeration DESIGN §5.3 already defines it as (see this file's module
   * doc), so comparing its end-position set against the pruned searches'
   * is the soundness test itself: identical sets on every fixture means the
   * prune never drops a reachable position, only a redundant branch.
   */
  constructor(private readonly nodeBudget: number, pruneZeroDamage: boolean = false) {
    const widths = new Int32Array([UNBOUNDED_WIDTH, UNBOUNDED_WIDTH, UNBOUNDED_WIDTH, UNBOUNDED_WIDTH]);
    // `keep: 0` — the gate reads end-position SETS off the observer, and the
    // pool never has to hold a turn.
    this.naiveSearch = new ActionSearch(this.rep, { widths, keep: 0, ttBits: 0 }, this.pool, this.sc);
    this.canonSearch = new ActionSearch(this.rep, { widths, keep: 0, ttBits: 0 }, this.pool, this.sc);
    this.ttSearch = new ActionSearch(this.rep, { widths, keep: 0, ttBits: MEASURE_TT_BITS }, this.pool, this.sc);
    this.shippedTtSearch = new ActionSearch(this.rep, { widths, keep: 0, ttBits: SHIPPED_TT_BITS }, this.pool, this.sc);
    if (pruneZeroDamage) {
      this.canonSearch.setPruneZeroDamage(true);
      this.ttSearch.setPruneZeroDamage(true);
      this.shippedTtSearch.setPruneZeroDamage(true);
    }
  }

  /**
   * Packs `state`, applies the minimal place-phase prefix (`PAY_UPKEEP` of the
   * first keep set, then `END_PLACE`) and returns the action-phase state, or
   * `null` with a reason when the turn has no action phase at all — an upkeep
   * payment that wipes the side out is a real, legal outcome (see
   * `authored.jsonl#upkeep-pending`), not a failure.
   */
  private toActionPhase(state: GameState): { p: PackedState; prefixLen: number } | { reason: string } {
    let p: PackedState;
    try {
      p = this.rep.pack(state, allocState());
    } catch (err) {
      return { reason: `pack: ${(err as Error).message}` };
    }
    if (p.result !== Result.ONGOING) return { reason: 'position is already terminal' };
    this.undo.top = 0;
    let prefixLen = 0;
    if (p.upkeepPending === 1) {
      if (this.rep.genKeepSets(p, this.keep) === 0) return { reason: 'no legal keep set' };
      const a = paMake(AKind.PAY_UPKEEP, 0, 0, 0);
      this.prefix[prefixLen++] = a;
      this.rep.make(p, a, this.undo, this.keep);
    }
    if (p.result === Result.ONGOING && p.phase === 0) {
      const a = paMake(AKind.END_PLACE, 0, 0, 0);
      this.prefix[prefixLen++] = a;
      this.rep.make(p, a, this.undo, this.keep);
    }
    if (p.result !== Result.ONGOING) return { reason: 'the place phase ended the game' };
    if (p.phase !== 1) return { reason: `phase ${p.phase} is not the action phase` };
    if (p.actions <= 0) return { reason: 'no actions remain' };
    return { p, prefixLen };
  }

  /** Every end-position `Kpos` a `run` of `search` reaches, as a set. */
  private endSetOf(search: ActionSearch, p: PackedState, prefixLen: number): Set<string> {
    const keys = new Set<string>();
    search.setEndObserver((lo, hi) => {
      keys.add(keyOf(lo, hi));
    });
    search.run(p, neutralTables(), this.prefix, prefixLen, -1, () => 0, UNLIMITED_WORK, 0, this.out);
    search.setEndObserver(null);
    return keys;
  }

  check(item: WorkItem, acc: Partial): void {
    const prepared = this.toActionPhase(item.state);
    if ('reason' in prepared) {
      acc.skipped++;
      if (acc.skippedIds.length < MAX_REPORTED_MISMATCHES) acc.skippedIds.push(`${item.id}: ${prepared.reason}`);
      return;
    }
    const { p, prefixLen } = prepared;

    // Largest action budget whose naive tree fits `nodeBudget`.
    let budget = Math.min(p.actions, item.maxActions);
    let naiveKeys = new Set<string>();
    let sequences = -1;
    for (; budget >= 1; budget--) {
      if (p.actions !== budget) {
        p.actions = budget;
        this.rep.rehash(p);
      }
      naiveKeys = new Set<string>();
      sequences = this.naiveSearch.enumerateAll(
        p,
        this.prefix,
        prefixLen,
        (lo, hi) => {
          naiveKeys.add(keyOf(lo, hi));
        },
        this.nodeBudget,
      );
      if (sequences >= 0) break;
    }
    if (sequences < 0) {
      acc.skipped++;
      if (acc.skippedIds.length < MAX_REPORTED_MISMATCHES) {
        acc.skippedIds.push(`${item.id}: naive tree exceeds ${this.nodeBudget} nodes at one action`);
      }
      return;
    }

    const canonKeys = this.endSetOf(this.canonSearch, p, prefixLen);
    const ttKeys = this.endSetOf(this.ttSearch, p, prefixLen);

    acc.checked++;
    acc.checkedByKind[item.kind]++;
    acc.budgetHistogram[budget] = (acc.budgetHistogram[budget] ?? 0) + 1;
    acc.naiveSequences += sequences;
    acc.endPositions += naiveKeys.size;

    if (!sameSet(naiveKeys, canonKeys)) {
      acc.endSetMismatch++;
      if (acc.mismatches.length < MAX_REPORTED_MISMATCHES) {
        acc.mismatches.push({
          kind: 'end-set',
          id: item.id,
          detail:
            `budget ${budget}: naive ${naiveKeys.size} vs canonical ${canonKeys.size}; ` +
            `naive-only [${difference(naiveKeys, canonKeys).join(' ')}] canonical-only [${difference(canonKeys, naiveKeys).join(' ')}]`,
        });
      }
    }
    if (!sameSet(canonKeys, ttKeys)) {
      acc.ttEndSetMismatch++;
      if (acc.mismatches.length < MAX_REPORTED_MISMATCHES) {
        acc.mismatches.push({
          kind: 'tt-end-set',
          id: item.id,
          detail:
            `budget ${budget}: canonical ${canonKeys.size} vs canonical+TT ${ttKeys.size}; ` +
            `lost [${difference(canonKeys, ttKeys).join(' ')}] gained [${difference(ttKeys, canonKeys).join(' ')}]`,
        });
      }
    }

    if (item.kind === 'initial') {
      const distinct = new Set<string>();
      this.ttSearch.setNodeObserver((lo, hi, actions) => {
        distinct.add(`${keyOf(lo, hi)}:${actions}`);
      });
      this.endSetOf(this.ttSearch, p, prefixLen);
      this.ttSearch.setNodeObserver(null);
      const midStates = this.ttSearch.nodes;
      this.endSetOf(this.shippedTtSearch, p, prefixLen);
      acc.initial = {
        initialNaiveSequences: sequences,
        initialEndPositions: naiveKeys.size,
        initialMidStates: midStates,
        initialMidStatesShippedTt: this.shippedTtSearch.nodes,
        initialDistinctMidStates: distinct.size,
        ttReduction: midStates > 0 ? Math.round((sequences / midStates) * 100) / 100 : 0,
      };
    }
  }
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

// --- shard plumbing --------------------------------------------------------------

function shardOutPath(out: string, index: number): string {
  const dir = path.dirname(out);
  const stem = path.basename(out, '.json');
  return path.join(dir, `${stem}.shard-${index}.json`);
}

function runShard(args: Args): Partial {
  const items = buildWorkList(args);
  const checker = new CanonicalChecker(args.nodeBudget, args.pruneZeroDamage);
  const acc = newPartial();
  for (let i = 0; i < items.length; i++) {
    if (args.shardCount > 1 && i % args.shardCount !== args.shardIndex) continue;
    checker.check(items[i], acc);
  }
  return acc;
}

function mergePartials(parts: readonly Partial[]): Partial {
  const merged = newPartial();
  for (const part of parts) {
    merged.checked += part.checked;
    for (const kind of ['initial', 'fixture', 'corpus'] as const) merged.checkedByKind[kind] += part.checkedByKind[kind];
    merged.skipped += part.skipped;
    merged.endSetMismatch += part.endSetMismatch;
    merged.ttEndSetMismatch += part.ttEndSetMismatch;
    merged.naiveSequences += part.naiveSequences;
    merged.endPositions += part.endPositions;
    for (const [budget, n] of Object.entries(part.budgetHistogram)) {
      const b = Number(budget);
      merged.budgetHistogram[b] = (merged.budgetHistogram[b] ?? 0) + n;
    }
    for (const m of part.mismatches) if (merged.mismatches.length < MAX_REPORTED_MISMATCHES) merged.mismatches.push(m);
    for (const s of part.skippedIds) if (merged.skippedIds.length < MAX_REPORTED_MISMATCHES) merged.skippedIds.push(s);
    if (part.initial !== null) merged.initial = part.initial;
  }
  return merged;
}

function spawnShard(args: Args, index: number, count: number): Promise<void> {
  const cliArgs = [
    '--import', 'tsx', SELF,
    '--fixtures', args.fixtures.join(','),
    '--corpus', args.corpus,
    '--corpus-positions', String(args.corpusPositions),
    '--max-own-units', String(args.maxOwnUnits),
    '--node-budget', String(args.nodeBudget),
    '--shard-index', String(index),
    '--shard-count', String(count),
    '--out', path.relative(REPO_ROOT, shardOutPath(args.out, index)),
    ...(args.pruneZeroDamage ? ['--prune-zero-damage'] : []),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cliArgs, { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => {
      stderr += String(d);
    });
    child.on('error', reject);
    child.on('exit', code => {
      // A shard exits 1 when ITS slice found a mismatch; that is data, not a
      // crash, and the merged artifact carries it. Anything else is a crash.
      if (code === 0 || code === 1) resolve();
      else reject(new Error(`canonical-check shard ${index}/${count} exited ${String(code)}:\n${stderr.slice(-4000)}`));
    });
  });
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function writeArtifact(out: string, body: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(body, null, 2) + '\n');
}

function summarise(args: Args, merged: Partial): Record<string, unknown> {
  const initial = merged.initial ?? {
    initialNaiveSequences: 0,
    initialEndPositions: 0,
    initialMidStates: 0,
    initialMidStatesShippedTt: 0,
    initialDistinctMidStates: 0,
    ttReduction: 0,
  };
  return {
    ...initial,
    endSetMismatch: merged.endSetMismatch,
    ttEndSetMismatch: merged.ttEndSetMismatch,
    positionsChecked: merged.checked,
    fixturesChecked: merged.checkedByKind.fixture,
    corpusChecked: merged.checkedByKind.corpus,
    positionsSkipped: merged.skipped,
    skipped: merged.skippedIds,
    naiveSequences: merged.naiveSequences,
    endPositions: merged.endPositions,
    budgetHistogram: merged.budgetHistogram,
    mismatches: merged.mismatches,
    fixtureSets: args.fixtures,
    pruneZeroDamage: args.pruneZeroDamage,
    corpus: args.corpus,
    corpusPositionsRequested: args.corpusPositions,
    maxOwnUnits: args.maxOwnUnits,
    nodeBudget: args.nodeBudget,
    shards: args.shards,
    git: gitRevision(),
    node: process.version,
    at: new Date().toISOString(),
  };
}

function failed(merged: Partial): boolean {
  return (
    merged.endSetMismatch > 0 ||
    merged.ttEndSetMismatch > 0 ||
    merged.initial === null ||
    merged.initial.initialEndPositions !== 797 ||
    merged.initial.initialMidStates > 1053 ||
    merged.initial.ttReduction < 10
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Child shard: run our slice, write the partial, exit 0. Only the parent
  // applies the gate criterion — a shard's slice is half the evidence.
  if (args.shardIndex >= 0) {
    const part = runShard(args);
    writeArtifact(args.out, part as unknown as Record<string, unknown>);
    return;
  }

  let merged: Partial;
  const shardCount = Math.max(1, Math.floor(args.shards));
  if (shardCount <= 1) {
    merged = runShard({ ...args, shardIndex: 0, shardCount: 1 });
  } else {
    await Promise.all(
      Array.from({ length: shardCount }, (_, i) => spawnShard(args, i, shardCount)),
    );
    const parts: Partial[] = [];
    for (let i = 0; i < shardCount; i++) {
      const p = shardOutPath(args.out, i);
      if (!fs.existsSync(p)) throw new Error(`oracles/canonical-check: shard ${i} wrote no artifact at ${p}`);
      parts.push(JSON.parse(fs.readFileSync(p, 'utf8')) as Partial);
      fs.rmSync(p);
    }
    merged = mergePartials(parts);
  }

  const metrics = summarise(args, merged);
  writeArtifact(args.out, metrics);
  console.log(`oracles/canonical-check: wrote ${args.out}`);
  console.log(
    JSON.stringify({
      endSetMismatch: metrics.endSetMismatch,
      ttEndSetMismatch: metrics.ttEndSetMismatch,
      initialEndPositions: metrics.initialEndPositions,
      initialMidStates: metrics.initialMidStates,
      ttReduction: metrics.ttReduction,
      positionsChecked: metrics.positionsChecked,
      fixturesChecked: metrics.fixturesChecked,
      corpusChecked: metrics.corpusChecked,
      positionsSkipped: metrics.positionsSkipped,
    }),
  );
  if (failed(merged)) process.exitCode = 1;
}

void main();
