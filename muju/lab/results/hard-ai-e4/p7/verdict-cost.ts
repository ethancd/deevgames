/**
 * E4 lane 6 (P7): cost attribution of the CANONICAL home verdict.
 *
 * Read-only instrumentation. Nothing under `src/` is modified or patched: the
 * script (a) times `applyAction` action by action over a reconstructed recorded
 * turn, (b) re-runs, on the same states, the gate `resolveHomeCheckmate`
 * applies and times the `analyzeHomeDefense` call it would make, and (c) runs an
 * INSTRUMENTED COPY of `searchHomeDefense`/`enoughPossibleDamage`
 * (`src/game/homeCheckmate.ts`, copied verbatim below with counters added) whose
 * verdict is compared against the canonical one on every single call — a
 * mismatch aborts the run. The copy is what attributes time inside the verdict;
 * it never feeds a number back into the engine.
 *
 * node --import tsx lab/results/hard-ai-e4/p7/verdict-cost.ts \
 *   --turns <replay>#<side>#<seatTurnIndex>[,...] --label <id> [--out <file>]
 *   [--set ordinary]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadReplay, reconstruct, withMatchRules } from '../../../hard-ai/analyze/replay';
import { applyAction, transitionWithoutCheckmate } from '../../../../src/ai/simulate';
import { analyzeHomeDefense } from '../../../../src/game/homeCheckmate';
import { getHomeOccupier, getOpponent } from '../../../../src/game/victory';
import { manhattanDistance, resetUnitActions } from '../../../../src/game/board';
import { calculateAttackPower, calculateDefense, canAttack, getAttackCount, getValidAttacks } from '../../../../src/game/combat';
import { getValidMoves } from '../../../../src/game/movement';
import { getNextTierDefinition, getUnitDefinition } from '../../../../src/game/units';
import { getActionsPerTurn, isPhasing } from '../../../../src/game/rules';
import { unitUpkeep } from '../../../../src/game/upkeep';
import type { GameState, PlayerId, Unit } from '../../../../src/game/types';
import type { AIAction } from '../../../../src/ai/types';
import { readPositions, type StoredPosition } from '../../../hard-ai/positions/corpus';
import { setElementGraph } from '../../../../src/game/elements';
import { setUpkeepVariant } from '../../../../src/game/upkeep';
import { setCombatHandicap, resetCombatHandicap } from '../../../../src/game/combat';

/** A stored position carries its own rules block; install it exactly as the
 * suites do, and restore the shipped defaults afterwards. */
function withPositionRules<T>(pos: StoredPosition, fn: () => T): T {
  const rules = pos.rules;
  try {
    setElementGraph(rules.elementGraph);
    setUpkeepVariant(rules.upkeep);
    setCombatHandicap('white', rules.combatHandicap.white);
    setCombatHandicap('black', rules.combatHandicap.black);
    return fn();
  } finally {
    setElementGraph('double-thick');
    setUpkeepVariant('shipped');
    resetCombatHandicap();
  }
}

const REPO = path.resolve(import.meta.dirname, '../../../..');
const PROOF_NODES = 20000;

// --- instrumented copy of src/game/homeCheckmate.ts (verdict path only) ------

interface Counters {
  nodes: number;
  boundCallsTop: number; boundMsTop: number;
  boundCallsAct: number; boundMsAct: number; boundUnitsAct: number;
  failedHits: number; failedInserts: number;
  keyCalls: number; keyMs: number;
  transitions: number; transitionMs: number;
  moveGen: number; moveGenMs: number;
  attackGen: number; attackGenMs: number;
  prepareNodes: number;
}
const newCounters = (): Counters => ({
  nodes: 0, boundCallsTop: 0, boundMsTop: 0, boundCallsAct: 0, boundMsAct: 0, boundUnitsAct: 0,
  failedHits: 0, failedInserts: 0, keyCalls: 0, keyMs: 0, transitions: 0, transitionMs: 0,
  moveGen: 0, moveGenMs: 0, attackGen: 0, attackGenMs: 0, prepareNodes: 0,
});
const addC = (a: Counters, b: Counters): void => {
  for (const k of Object.keys(a) as (keyof Counters)[]) a[k] += b[k];
};
const now = (): number => Number(process.hrtime.bigint()) / 1e6;

/** homeCheckmate.ts:27-49, verbatim apart from the counter. */
function enoughPossibleDamage(state: GameState, target: Unit, preparing: boolean, c: Counters): boolean {
  const actions = state.turn.actionsRemaining, cash = state.players[state.turn.currentPlayer].resources;
  let power = Array.from({ length: 3 }, () => Array<number>(actions + 1).fill(-Infinity)); power[0][0] = 0;
  for (const unit of state.board.units) {
    if (unit.owner !== state.turn.currentPlayer || (!preparing && (!canAttack(unit) || unit.attackedThisTurn?.includes(target.id)))) continue;
    c.boundUnitsAct++;
    const rent = preparing ? unitUpkeep(unit) : 0;
    if (rent > cash) continue;
    const choices = [unit], next = getNextTierDefinition(unit.definitionId);
    if (preparing && next && rent + next.cost - getUnitDefinition(unit.definitionId).cost <= cash) choices.push({ ...unit, definitionId: next.id });
    const updated = power.map(row => [...row]);
    for (const attacker of choices) {
      const distance = Math.max(0, manhattanDistance(attacker.position, target.position) - 1);
      const cost = Math.ceil(distance / getUnitDefinition(attacker.definitionId).speed) + 1;
      for (let hits = 1; hits <= 2; hits++) for (let used = cost; used <= actions; used++) {
        updated[hits][used] = Math.max(updated[hits][used], power[hits - 1][used - cost] + calculateAttackPower(attacker, target));
      }
    }
    power = updated;
  }
  return power.slice(1).some(row => row.some(damage => damage >= calculateDefense(target)));
}

/** homeCheckmate.ts:68-171 with `includeWitness = false`, plus counters. */
function instrumentedVerdict(state: GameState, invader: PlayerId, maxNodes: number, c: Counters): 'rescue' | 'mate' | 'unknown' {
  const target = getHomeOccupier(state.board, invader);
  if (!target) return 'rescue';
  const defender = getOpponent(invader), actions = getActionsPerTurn(state);
  const ready: GameState = { ...state, board: resetUnitActions(state.board, defender), upkeepPending: false,
    turn: { ...state.turn, currentPlayer: defender, phase: 'action', actionsRemaining: actions } };
  let t = now();
  const top = enoughPossibleDamage(ready, target, !isPhasing(state), c);
  c.boundMsTop += now() - t; c.boundCallsTop++;
  if (!top) return 'mate';

  let nodes = 0, exhausted = false;
  const spend = () => { if (nodes >= maxNodes) { exhausted = true; return false; } nodes++; return true; };
  const failed = new Set<string>();
  const indices = new Map(state.board.units.map((unit, index) => [unit.id, index]));
  const key = (s: GameState) => `${s.turn.actionsRemaining}:` + s.board.units.map(u =>
    `${indices.get(u.id)},${u.definitionId},${u.position.x + 10 * u.position.y},${u.damageTaken},${getAttackCount(u)},${+!!u.lastAttackKilled},${(u.attackedThisTurn ?? []).map(id => indices.get(id)).join('.')}`).join(';');

  const act = (s: GameState): boolean => {
    const occupier = s.board.units.find(u => u.id === target.id);
    if (!occupier) return true;
    let t2 = now();
    const ok = s.phase === 'playing' && enoughPossibleDamage(s, occupier, false, c);
    c.boundMsAct += now() - t2; c.boundCallsAct++;
    if (!ok) return false;
    t2 = now();
    const signature = key(s);
    c.keyMs += now() - t2; c.keyCalls++;
    if (failed.has(signature)) { c.failedHits++; return false; }
    if (!spend()) return false;
    const owned = s.board.units.filter(u => u.owner === defender);
    t2 = now();
    const attacks = owned.flatMap(u => getValidAttacks(u, s.board).map(position => ({ type: 'ATTACK' as const, unitId: u.id, targetPosition: position })));
    attacks.sort((a, b) => manhattanDistance(a.targetPosition, target.position) - manhattanDistance(b.targetPosition, target.position));
    c.attackGenMs += now() - t2; c.attackGen++;
    for (const action of attacks) {
      t2 = now();
      const next = transitionWithoutCheckmate(s, action);
      c.transitionMs += now() - t2; c.transitions++;
      if (next !== s && act(next)) return true;
      if (exhausted) return false;
    }
    if (s.turn.actionsRemaining > 1) {
      t2 = now();
      const moves = owned.flatMap(u => getValidMoves(u, s.board).map(to => ({ type: 'MOVE' as const, unitId: u.id, to })));
      moves.sort((a, b) => manhattanDistance(a.to, target.position) - manhattanDistance(b.to, target.position));
      c.moveGenMs += now() - t2; c.moveGen++;
      for (const action of moves) {
        t2 = now();
        const next = transitionWithoutCheckmate(s, action);
        c.transitionMs += now() - t2; c.transitions++;
        if (next !== s && act(next)) return true;
        if (exhausted) return false;
      }
    }
    failed.add(signature); c.failedInserts++;
    return false;
  };

  const owned = ready.board.units.filter(u => u.owner === defender)
    .sort((a, b) => manhattanDistance(a.position, target.position) - manhattanDistance(b.position, target.position));
  const enemy = ready.board.units.filter(u => u.owner !== defender);
  const prepare = (index: number, cash: number, kept: Unit[]): boolean => {
    if (!spend()) return false;
    c.prepareNodes++;
    if (index === owned.length) {
      return act({ ...ready, board: { ...ready.board, units: [...enemy, ...kept] },
        players: { ...ready.players, [defender]: { ...ready.players[defender], resources: cash } } });
    }
    const unit = owned[index], definition = getUnitDefinition(unit.definitionId), rent = unitUpkeep(unit);
    if (rent <= cash) {
      if (prepare(index + 1, cash - rent, [...kept, unit])) return true;
      if (exhausted) return false;
      const promoted = getNextTierDefinition(definition.id), cost = promoted ? promoted.cost - definition.cost : Infinity;
      if (promoted && rent + cost <= cash && prepare(index + 1, cash - rent - cost,
        [...kept, { ...unit, definitionId: promoted.id, promotedThisPlacement: true }])) return true;
      if (exhausted) return false;
    }
    return definition.tier > 1 && prepare(index + 1, cash, kept);
  };
  const rescued = isPhasing(state) ? act(ready) : prepare(0, ready.players[defender].resources, []);
  c.nodes += nodes;
  return rescued ? 'rescue' : exhausted ? 'unknown' : 'mate';
}

// --- the gate and the proposed cache key ------------------------------------

/** homeCheckmate.ts:173-181: does `resolveHomeCheckmate` reach the prover? */
function gateReachesProver(state: GameState): boolean {
  const invader = state.turn.currentPlayer;
  if (state.phase !== 'playing' || state.upkeepPending || state.victoryRule === 'elimination' || !getHomeOccupier(state.board, invader)) return false;
  if (isPhasing(state) && state.turn.phase !== 'place') return false;
  if (getHomeOccupier(state.board, getOpponent(invader))) return false;
  return true;
}

/** The lane's proposed key, computed from the fields §2 of the design enumerates. */
function verdictKey(state: GameState, invader: PlayerId): string {
  const defender = getOpponent(invader);
  const size = state.board.cells.length;
  const attackers: string[] = [], defenders: string[] = [];
  for (const u of state.board.units) {
    const square = u.position.x + size * u.position.y;
    if (u.owner === invader) attackers.push(`${square}.${u.definitionId}.${u.damageTaken}`);
    else defenders.push(`${square}.${u.definitionId}`);
  }
  attackers.sort(); defenders.sort();
  return [invader, size, getActionsPerTurn(state), state.ruleset ?? 'standard',
    state.players[defender].resources, 'A', attackers.join('|'), 'D', defenders.join('|')].join('/');
}

// --- driver ------------------------------------------------------------------

interface CallRecord {
  actionIndex: number; actionType: string; site: 'pre' | 'post';
  verdict: string; ms: number; key: string;
  nodes: number; boundCallsAct: number; boundMsAct: number; boundMsTop: number;
  failedHits: number; transitions: number; transitionMs: number;
  moveGenMs: number; attackGenMs: number; keyMs: number; prepareNodes: number;
}

function measureTurn(startState: GameState, actions: AIAction[]): {
  perAction: { i: number; type: string; applyMs: number; verdictCalls: number }[];
  calls: CallRecord[]; applyTotalMs: number;
} {
  const perAction: { i: number; type: string; applyMs: number; verdictCalls: number }[] = [];
  const calls: CallRecord[] = [];
  let state = startState;
  let applyTotalMs = 0;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    let verdictCalls = 0;
    // The two sites `applyAction` can adjudicate at (simulate.ts:29-34).
    const sites: { site: 'pre' | 'post'; state: GameState }[] = [];
    if (action.type === 'END_ACTION_PHASE') sites.push({ site: 'pre', state });
    const next = transitionWithoutCheckmate(state, action);
    if (next !== state) sites.push({ site: 'post', state: next });
    for (const s of sites) {
      if (!gateReachesProver(s.state)) continue;
      verdictCalls++;
      const invader = s.state.turn.currentPlayer;
      const t = now();
      const canonical = analyzeHomeDefense(s.state, invader, transitionWithoutCheckmate);
      const ms = now() - t;
      const c = newCounters();
      const mirror = instrumentedVerdict(s.state, invader, PROOF_NODES, c);
      if (mirror !== canonical) throw new Error(`instrumented copy disagreed: ${mirror} vs ${canonical} at action ${i}`);
      calls.push({ actionIndex: i, actionType: action.type, site: s.site, verdict: canonical, ms,
        key: verdictKey(s.state, invader), nodes: c.nodes, boundCallsAct: c.boundCallsAct,
        boundMsAct: c.boundMsAct, boundMsTop: c.boundMsTop, failedHits: c.failedHits,
        transitions: c.transitions, transitionMs: c.transitionMs, moveGenMs: c.moveGenMs,
        attackGenMs: c.attackGenMs, keyMs: c.keyMs, prepareNodes: c.prepareNodes });
    }
    const t0 = now();
    const applied = applyAction(state, action);
    const applyMs = now() - t0;
    applyTotalMs += applyMs;
    perAction.push({ i, type: action.type, applyMs, verdictCalls });
    if (applied === state) break;
    state = applied;
  }
  return { perAction, calls, applyTotalMs };
}

/** Suite/corpus mode: one verdict per stored position whose gate reaches the prover. */
function measurePositions(file: string): unknown {
  const stored = readPositions(path.resolve(REPO, file));
  const rows: unknown[] = [];
  const keys = new Map<string, number>();
  let total = 0, gated = 0;
  for (const pos of stored) {
    const state = pos.state as GameState;
    const run = () => {
      if (!gateReachesProver(state)) return null;
      const invader = state.turn.currentPlayer;
      const t = now();
      const verdict = analyzeHomeDefense(state, invader, transitionWithoutCheckmate);
      const ms = now() - t;
      const c = newCounters();
      const mirror = instrumentedVerdict(state, invader, PROOF_NODES, c);
      if (mirror !== verdict) throw new Error(`instrumented copy disagreed on ${pos.id}`);
      return { verdict, ms, c, key: verdictKey(state, invader) };
    };
    const r = withPositionRules(pos, run);
    if (r === null) continue;
    gated++; total += r.ms;
    keys.set(r.key, (keys.get(r.key) ?? 0) + 1);
    rows.push({ id: pos.id, bodies: state.board.units.length, verdict: r.verdict, ms: round(r.ms),
      nodes: r.c.nodes, boundCallsTop: r.c.boundCallsTop, boundMsTop: round(r.c.boundMsTop),
      boundCallsAct: r.c.boundCallsAct, boundMsAct: round(r.c.boundMsAct),
      failedHits: r.c.failedHits, transitions: r.c.transitions, key: hash(r.key) });
  }
  const ms = rows.map(r => (r as { ms: number }).ms).sort((a, b) => a - b);
  return { file: path.basename(file), positions: stored.length, gated,
    totalMs: round(total), medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : 0,
    maxMs: ms.length ? ms[ms.length - 1] : 0, distinctKeys: keys.size, rows };
}

/**
 * One `searchTurn` at a wall allowance on a reconstructed turn, then the
 * canonical cost and the memo keys of the plan it returns — the post-search
 * half of the loop (`lab/harness/runner.ts:266` applies the same plan again).
 */
async function measureWall(spec: Spec, wallMs: number, engineName: string): Promise<unknown> {
  const { HardEngine } = await import('../../../../src/ai/hard/engine');
  const { hardEnginePatch } = await import('../../../hard-ai/bots/hard');
  const replay = loadReplay(path.resolve(REPO, spec.replay));
  const recon = reconstruct(replay);
  const turn = recon.bySide[spec.side].find(t => t.seatTurnIndex === spec.index);
  if (!turn) throw new Error(`turn ${spec.side}#${spec.index} not in ${spec.replay}`);
  return await withMatchRules(replay.options, async () => {
    const engine = new HardEngine(hardEnginePatch(engineName));
    engine.setSeed(replay.meta.seed ?? 1);
    const t0 = now();
    const r = await engine.searchTurn(turn.startState, { targetMs: wallMs, deadlineMs: wallMs });
    const searchTurnMs = now() - t0;
    const m = measureTurn(turn.startState, r.actions);
    const keys = new Set(m.calls.map(c => c.key));
    return { mode: `wall:${wallMs}`, engine: `hard@${engineName}`, replay: path.basename(spec.replay),
      side: spec.side, seatTurnIndex: spec.index, gameTurn: turn.turnNumber,
      searchTurnMs: round(searchTurnMs), stopReason: r.stats.stopReason, depth: r.depth,
      nodes: r.stats.nodes, turnNodes: r.stats.turnNodes, work: r.work, source: r.source,
      plan: r.actions.map(a => a.type), planApplyMs: round(m.applyTotalMs),
      verdictCalls: m.calls.length, distinctKeys: keys.size,
      verdictMs: round(m.calls.reduce((s, c) => s + c.ms, 0)),
      calls: m.calls.map(c => ({ actionIndex: c.actionIndex, actionType: c.actionType, site: c.site,
        verdict: c.verdict, ms: round(c.ms), nodes: c.nodes, key: hash(c.key) })),
      perAction: m.perAction.map(a => ({ i: a.i, type: a.type, applyMs: round(a.applyMs), verdictCalls: a.verdictCalls })) };
  });
}

interface Spec { replay: string; side: PlayerId; index: number }

/** Whole-game mode: every turn of a reconstructed replay, in order. */
function measureGame(file: string): unknown {
  const replay = loadReplay(path.resolve(REPO, file));
  const recon = reconstruct(replay);
  return withMatchRules(replay.options, () => {
    const perTurn: unknown[] = [];
    const keys = new Map<string, number>();
    let applyTotal = 0, verdictTotal = 0, calls = 0;
    for (const turn of recon.turns) {
      const m = measureTurn(turn.startState, turn.actions);
      applyTotal += m.applyTotalMs;
      verdictTotal += m.calls.reduce((s, c) => s + c.ms, 0);
      calls += m.calls.length;
      for (const c of m.calls) keys.set(c.key, (keys.get(c.key) ?? 0) + 1);
      if (m.calls.length > 0 || m.applyTotalMs > 1) {
        perTurn.push({ side: turn.side, seatTurnIndex: turn.seatTurnIndex, gameTurn: turn.turnNumber,
          applyMs: round(m.applyTotalMs), verdictCalls: m.calls.length,
          verdictMs: round(m.calls.reduce((s, c) => s + c.ms, 0)),
          verdicts: m.calls.map(c => c.verdict), nodes: m.calls.map(c => c.nodes) });
      }
    }
    const repeated = [...keys.values()].filter(n => n > 1);
    return { game: path.basename(file), plies: recon.plies, turns: recon.turns.length,
      winner: recon.winner, applyTotalMs: round(applyTotal), verdictCalls: calls,
      verdictTotalMs: round(verdictTotal), distinctKeys: keys.size,
      duplicateCalls: calls - keys.size, repeatedKeys: repeated.length,
      maxRepeat: repeated.length ? Math.max(...repeated) : 0, perTurn };
  });
}

function parseTurns(value: string): Spec[] {
  return value.split(',').filter(Boolean).map(entry => {
    const [replay, side, index] = entry.split('#');
    return { replay, side: side as PlayerId, index: Number(index) };
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let turns: Spec[] = [], label = 'run', out: string | null = null, games: string[] = [], positions: string[] = [];
  let wall = 0, engineName = 'desktop';
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case '--turns': turns = parseTurns(v); i++; break;
      case '--positions': positions = v.split(',').filter(Boolean); i++; break;
      case '--games': games = v.split(',').filter(Boolean); i++; break;
      case '--wall': wall = Number(v); i++; break;
      case '--engine': engineName = v.replace(/^hard@/, ''); i++; break;
      case '--label': label = v; i++; break;
      case '--out': out = v; i++; break;
      default: throw new Error(`verdict-cost: unknown argument ${argv[i]}`);
    }
  }
  const results: unknown[] = [];
  for (const file of games) results.push(measureGame(file));
  for (const file of positions) results.push(measurePositions(file));
  if (wall > 0) {
    for (const spec of turns) results.push(await measureWall(spec, wall, engineName));
    turns = [];
  }
  for (const spec of turns) {
    const replay = loadReplay(path.resolve(REPO, spec.replay));
    const recon = reconstruct(replay);
    const turn = recon.bySide[spec.side].find(t => t.seatTurnIndex === spec.index);
    if (!turn) throw new Error(`turn ${spec.side}#${spec.index} not in ${spec.replay}`);
    const measured = withMatchRules(replay.options, () => measureTurn(turn.startState, turn.actions));
    const bodies = turn.startState.board.units.length;
    const keys = new Set(measured.calls.map(c => c.key));
    results.push({
      replay: path.basename(spec.replay), side: spec.side, seatTurnIndex: spec.index,
      gameTurn: turn.turnNumber, phase: turn.startState.turn.phase,
      bodies, whiteBodies: turn.startState.board.units.filter(u => u.owner === 'white').length,
      blackBodies: turn.startState.board.units.filter(u => u.owner === 'black').length,
      bank: { white: turn.startState.players.white.resources, black: turn.startState.players.black.resources },
      ruleset: turn.startState.ruleset ?? 'standard',
      recordedTurnMs: (replay.meta.players[spec.side].turnMs ?? [])[spec.index] ?? null,
      actions: measured.perAction.map(a => a.type),
      applyTotalMs: round(measured.applyTotalMs),
      perAction: measured.perAction.map(a => ({ i: a.i, type: a.type, applyMs: round(a.applyMs), verdictCalls: a.verdictCalls })),
      verdictCalls: measured.calls.length,
      verdictTotalMs: round(measured.calls.reduce((s, c) => s + c.ms, 0)),
      distinctKeys: keys.size,
      calls: measured.calls.map(c => ({ ...c, ms: round(c.ms), boundMsAct: round(c.boundMsAct),
        boundMsTop: round(c.boundMsTop), transitionMs: round(c.transitionMs), moveGenMs: round(c.moveGenMs),
        attackGenMs: round(c.attackGenMs), keyMs: round(c.keyMs), key: hash(c.key), keyLength: c.key.length })),
    });
  }
  const payload = { label, stamp: new Date().toISOString(), node: process.version, results };
  const text = JSON.stringify(payload, null, 2) + '\n';
  console.log(text);
  if (out) { fs.mkdirSync(path.dirname(path.resolve(REPO, out)), { recursive: true }); fs.writeFileSync(path.resolve(REPO, out), text); }
}

const round = (x: number): number => Math.round(x * 1000) / 1000;
function hash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0; }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

main().catch(err => { console.error(err); process.exit(1); });
