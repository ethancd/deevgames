import { EXPLORER_SOURCE_IDENTITY, isCompatibleExplorerSource } from './provenance';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createInitialGameState } from '../../src/game/board';
import { isLegalAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import type { AIAction } from '../../src/ai/types';
import type { GameState, PlayerId } from '../../src/game/types';
import type { RoomSnapshot } from '../../src/online/types';
import type { ExplorerSnapshot, ExplorerGame, ExplorerJob, Checkpoint } from '../../src/explorer/types';
import { RoomError } from '../schema';
import { PHASING_RULES_VERSION } from '../rooms';
import { observe, legalActions, rules } from '../observation';
import { explorerConfigSchema, resultSchema, querySchema, turnActionsSchema } from './schema';

const uid = () => randomBytes(16).toString('hex');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const opposite = (p: PlayerId): PlayerId => p === 'white' ? 'black' : 'white';
const LEASE_MS = 360_000;
interface Stored extends ExplorerSnapshot {
  tokenHash: string; memory: Record<PlayerId, string>;
  lease?: { id: string; workerId: string; kind: ExplorerJob['kind']; player: PlayerId; checkpointId: string; until: number };
  receipts: { id: string; hash: string }[]; callIds: string[];
}
/** Cosmetic IDs of newly summoned units must not make equivalent plans look different. */
export function positionHash(state: GameState): string {
  const clean = structuredClone(state);
  clean.selectedUnit = null; clean.validMoves = []; clean.validAttacks = [];
  delete clean.lastIncome; delete clean.lastUpkeep; delete clean.lastSummoning;
  const order = (a: { owner: string; position: { x: number; y: number } }, b: { owner: string; position: { x: number; y: number } }) =>
    a.owner.localeCompare(b.owner) || a.position.y - b.position.y || a.position.x - b.position.x;
  clean.board.units.sort(order);
  clean.pendingSummons?.sort(order);
  const ids = [...clean.board.units.map(u => u.id), ...(clean.pendingSummons ?? []).map(u => u.id)];
  let json = JSON.stringify(clean);
  ids.forEach((id, i) => { json = json.split(JSON.stringify(id)).join(JSON.stringify(`piece-${i}`)); });
  return digest(json);
}
function room(cp: Checkpoint): RoomSnapshot {
  return { id: cp.id, revision: 0, ready: true, seats: { white: 'White', black: 'Black' }, state: cp.state,
    updatedAt: '', history: [], canUndo: false, matchPolicy: { version: 1, toolTier: 'harnessed', protocolId: 'advantage-explorer-1' } };
}
function simulate(state: GameState, actions: AIAction[], complete: boolean): GameState {
  const player = state.turn.currentPlayer;
  let next = structuredClone(state);
  for (const [index, action] of actions.entries()) {
    if (next.phase !== 'playing' || next.turn.currentPlayer !== player || next.turn.turnNumber !== state.turn.turnNumber) {
      throw new RoomError(422, 'TURN_ENDED', `Action ${index + 1} is after the turn ended.`);
    }
    if (!isLegalAction(next, action, player)) throw new RoomError(422, 'ILLEGAL_ACTION', `Action ${index + 1} (${action.type}) is illegal. No moves committed.`);
    next = applyAction(next, action);
  }
  if (complete && next.phase === 'playing' && next.turn.currentPlayer === player && next.turn.turnNumber === state.turn.turnNumber)
    throw new RoomError(422, 'INCOMPLETE_TURN', 'Submit the complete turn, including END_ACTION_PHASE and END_PLACE_PHASE when the game remains active.');
  return next;
}

/** Experiments use canonical transitions but their own durable branch tree.
 * No ordinary room credentials or actions can mutate an experiment. */
export class ExplorerStore {
  private db: DatabaseSync;
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS muju_experiments (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
  }
  close() { this.db.close(); }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private read(id: string): Stored {
    const row = this.db.prepare('SELECT data FROM muju_experiments WHERE id = ?').get(id);
    if (!row) throw new RoomError(404, 'EXPERIMENT_NOT_FOUND', 'Experiment not found.');
    return JSON.parse(row.data as string);
  }
  private auth(exp: Stored, token: string) {
    if (!timingSafeEqual(Buffer.from(exp.tokenHash), Buffer.from(digest(token)))) throw new RoomError(403, 'EXPERIMENT_TOKEN_REQUIRED', 'Use the private experiment control token.');
    if (exp.rulesRevision !== PHASING_RULES_VERSION || !isCompatibleExplorerSource(exp.sourceIdentity.sha256)) throw new RoomError(409, 'RULES_CHANGED', 'This experiment belongs to another engine/controller revision and is review-only. Export it and start a new experiment on the current code.');
    if (exp.sourceIdentity.sha256 !== EXPLORER_SOURCE_IDENTITY.sha256 && !exp.compatibleRuntimes?.some(r => r.sourceIdentity.sha256 === EXPLORER_SOURCE_IDENTITY.sha256)) {
      (exp.compatibleRuntimes ??= []).push({ sourceIdentity: EXPLORER_SOURCE_IDENTITY, firstUsedAt: new Date().toISOString(),
        afterPlies: exp.plies, afterModelCalls: exp.modelCalls, reason: 'Audited source compatibility; game mechanics and prior history preserved.' });
    }
  }
  private save(exp: Stored) {
    exp.version++; exp.updatedAt = new Date().toISOString();
    this.db.prepare('INSERT INTO muju_experiments (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(exp.id, JSON.stringify(exp));
  }
  private snapshot(exp: Stored): ExplorerSnapshot {
    const { tokenHash: _tokenHash, memory: _memory, lease, receipts: _receipts, callIds: _callIds, ...value } = structuredClone(exp);
    value.runnerBusy = !!lease && lease.until > Date.now();
    value.checkpoints.forEach(cp => { if (!cp.assessments.white || !cp.assessments.black) cp.assessments = {}; });
    return value;
  }
  get(id: string) { return this.snapshot(this.read(id)); }
  create(input: unknown) {
    const config = explorerConfigSchema.parse(input), token = randomBytes(32).toString('hex');
    return this.transaction(() => {
      const count = this.db.prepare('SELECT COUNT(*) AS n FROM muju_experiments').get()!.n as number;
      if (count >= 1000) throw new RoomError(503, 'EXPERIMENT_LIMIT', 'This host has reached its experiment storage limit.');
      const cp = this.checkpoint(createInitialGameState(undefined, 4, config.handicap, 'phasing'));
      const game: ExplorerGame = { id: uid(), parentId: null, forkCheckpoint: null, forkReason: '', checkpoints: [cp.id], turns: [] };
      const exp: Stored = { id: uid(), version: 0, createdAt: new Date().toISOString(), updatedAt: '', rulesRevision: PHASING_RULES_VERSION,
        setupRevision: 'mandatory-half-komi-1', sourceIdentity: EXPLORER_SOURCE_IDENTITY, config, status: 'running', stopReason: null, plies: 0, modelCalls: 0,
        games: [game], checkpoints: [cp], activeGameId: game.id, runnerBusy: false, tokenHash: digest(token),
        memory: { white: '', black: '' }, receipts: [], callIds: [], review: '', usage: [] };
      this.save(exp); return { experiment: this.snapshot(exp), token };
    });
  }
  private checkpoint(state: GameState): Checkpoint { return { id: uid(), state, hash: positionHash(state), assessments: {} }; }
  private active(exp: Stored) { return exp.games.find(g => g.id === exp.activeGameId)!; }
  private cp(exp: Stored, id: string) {
    const cp = exp.checkpoints.find(c => c.id === id);
    if (!cp) throw new RoomError(422, 'CHECKPOINT_NOT_FOUND', 'Choose a recorded checkpoint.');
    return cp;
  }
  private finish(exp: Stored, reason: string) { exp.status = 'complete'; exp.stopReason = reason; delete exp.lease; }
  private candidates(exp: Stored, loser: PlayerId) {
    return this.active(exp).checkpoints.map(id => this.cp(exp, id)).filter(cp => cp.state.phase === 'playing' && cp.state.turn.currentPlayer === loser).reverse();
  }
  private next(exp: Stored): { kind: ExplorerJob['kind']; player: PlayerId; checkpointId: string } | null {
    if (exp.status !== 'running') return null;
    const game = this.active(exp), cp = this.cp(exp, game.checkpoints.at(-1)!);
    if (game.outcome) {
      if (exp.plies >= exp.config.maxPlies) { this.finish(exp, 'move-budget'); return null; }
      if (exp.games.length >= exp.config.maxGames) { this.finish(exp, 'game-budget'); return null; }
      if (!game.outcome.winner) { this.finish(exp, game.outcome.kind); return null; }
      const loser = opposite(game.outcome.winner);
      if (!this.candidates(exp, loser).length) { this.finish(exp, 'no-decision-checkpoint'); return null; }
      return { kind: 'branch', player: loser, checkpointId: cp.id };
    }
    if (exp.plies >= exp.config.maxPlies) { game.outcome = { kind: 'budget', winner: null, reason: 'Global player-turn limit reached.' }; this.finish(exp, 'move-budget'); return null; }
    for (const player of ['white', 'black'] as const) if (!cp.assessments[player]) return { kind: 'assess', player, checkpointId: cp.id };
    return { kind: 'turn', player: cp.state.turn.currentPlayer, checkpointId: cp.id };
  }
  claim(id: string, token: string, workerId: string): ExplorerJob | null {
    return this.transaction(() => {
      const exp = this.read(id); this.auth(exp, token);
      if (exp.lease && exp.lease.until > Date.now()) return exp.lease.workerId === workerId ? this.job(exp) : null;
      delete exp.lease;
      const next = this.next(exp);
      if (next) exp.lease = { ...next, id: uid(), workerId, until: Date.now() + LEASE_MS };
      this.save(exp); return next ? this.job(exp) : null;
    });
  }
  private job(exp: Stored): ExplorerJob {
    const lease = exp.lease!, cp = this.cp(exp, lease.checkpointId), game = this.active(exp);
    const context = {
      task: lease.kind, side: lease.player, checkpointId: cp.id, stateHash: cp.hash,
      position: observe(room(cp), lease.player), rules,
      currentAssessments: cp.assessments.white && cp.assessments.black ? cp.assessments : undefined,
      limits: { games: `${exp.games.length}/${exp.config.maxGames}`, plies: `${exp.plies}/${exp.config.maxPlies}` },
      memory: exp.memory[lease.player],
      publicHistory: game.checkpoints.slice(0, -1).map(id => { const p = this.cp(exp, id); return { id, turn: p.state.turn, assessments: p.assessments.white && p.assessments.black ? p.assessments : {} }; }),
      playedTurns: exp.games.map(g => ({ id: g.id, parentId: g.parentId, forkReason: g.forkReason, turns: g.turns, outcome: g.outcome })),
      candidates: lease.kind !== 'branch' ? undefined : this.candidates(exp, lease.player).map(p => ({ id: p.id, turn: p.state.turn,
        ownWin: p.assessments[lease.player] ? lease.player === 'white' ? p.assessments[lease.player]!.whiteWin : 1 - p.assessments[lease.player]!.whiteWin : null,
        observation: observe(room(p), lease.player) })),
    };
    return { id: lease.id, kind: lease.kind, player: lease.player, checkpointId: lease.checkpointId, leaseUntil: lease.until, config: exp.config,
      prompt: `Play Muju Hono Irumbu as ${lease.player}. Both models use high effort. Use only the supplied position and rules. No shell, filesystem, browser or external tools.\n` +
      `New games include half-crystal komi, so rule-scored mined totals cannot tie. Estimate actual eventual victory, not material value.\n` +
      `For assess: independently report whiteWin (0..1), pressure, counterplay and a brief explanation. The opponent's current assessment is hidden.\n` +
      `For turn: choose a complete legal turn (including END_ACTION_PHASE and END_PLACE_PHASE unless terminal). For branch: the loser chooses the latest promising OWN turn checkpoint, preferably ownWin >= ${exp.config.retryThreshold}, and a different complete turn. Earlier/lower-estimate choices are allowed with explanation. Null checkpoint means no credible alternative.\n` +
      `You may request a preview with actions (empty actions lists legal options) and optional candidate checkpointId. Coordinates are zero-based numeric x/y. Preview results include legal options in the resulting phase; use them to plan actions and preparation together.\n` +
      `Maintain a short strategic memory for your seat, including lessons from losses. Explain whether both sides have meaningful choices or one feels dominated before a tactical mistake. Do not pronounce the handicap sufficient; the human evaluates that.\n` + JSON.stringify(context) };
  }
  private lease(exp: Stored, jobId: string) {
    if (exp.status !== 'running' || !exp.lease || exp.lease.id !== jobId || exp.lease.until <= Date.now()) throw new RoomError(409, 'STALE_JOB', 'Job expired, was paused, or already completed. Reconnect to the experiment.');
    exp.lease.until = Date.now() + LEASE_MS;
    return exp.lease;
  }
  call(id: string, token: string, jobId: string, callId: string) {
    return this.transaction(() => {
      const exp = this.read(id); this.auth(exp, token); this.lease(exp, jobId);
      if (!exp.callIds.includes(callId)) {
        if (exp.modelCalls >= exp.config.maxModelCalls) {
          exp.status = 'paused'; exp.stopReason = 'model-call-budget'; delete exp.lease; this.save(exp); return { allowed: false };
        }
        exp.modelCalls++; exp.callIds.push(callId);
      }
      this.save(exp); return { allowed: true };
    });
  }
  query(id: string, token: string, jobId: string, input: unknown) {
    const query = querySchema.parse(input);
    return this.transaction(() => {
      const exp = this.read(id); this.auth(exp, token); const lease = this.lease(exp, jobId);
      if (lease.kind === 'assess' && query.actions.length) throw new RoomError(422, 'ASSESSMENT_ONLY', 'Assess the current checkpoint without previewing a different position.');
      const checkpointId = query.checkpointId ?? lease.checkpointId;
      if (checkpointId !== lease.checkpointId && (lease.kind !== 'branch' || !this.candidates(exp, lease.player).some(c => c.id === checkpointId))) throw new RoomError(422, 'INVALID_CANDIDATE', 'Use the current checkpoint or your own branch candidate.');
      const cp = this.cp(exp, checkpointId);
      const state = simulate(cp.state, query.actions as AIAction[], false);
      const projected = room({ ...cp, state });
      this.save(exp);
      return { position: observe(projected, lease.player), legal: legalActions(projected, { offset: query.offset, limit: 100 }) };
    });
  }
  submit(id: string, token: string, jobId: string, input: unknown, usage: ExplorerSnapshot['usage'] = []) {
    const result = resultSchema.parse(input), hash = digest(JSON.stringify(result));
    return this.transaction(() => {
      const exp = this.read(id); this.auth(exp, token);
      const receipt = exp.receipts.find(r => r.id === jobId);
      if (receipt) { if (receipt.hash !== hash) throw new RoomError(409, 'JOB_REUSED', 'This job already has another result.'); return this.snapshot(exp); }
      const lease = this.lease(exp, jobId);
      if (lease.kind !== result.kind) throw new RoomError(422, 'WRONG_RESULT_KIND', 'Return the requested kind of result.');
      let game = this.active(exp);
      if (result.kind === 'assess') {
        this.cp(exp, lease.checkpointId).assessments[lease.player] = result.assessment;
        const fresh = game.checkpoints.slice(game.forkCheckpoint ? game.checkpoints.indexOf(game.forkCheckpoint) + 1 : 0).slice(-exp.config.confirmations);
        if (!exp.config.terminalOnly && fresh.length === exp.config.confirmations) {
          for (const winner of ['white', 'black'] as const) {
            if (fresh.every(id => { const a = this.cp(exp, id).assessments; return a.white && a.black && [a.white.whiteWin, a.black.whiteWin].every(p => (winner === 'white' ? p : 1 - p) >= exp.config.consensus); }))
              game.outcome = { kind: 'consensus', winner, reason: `Both forecasts ≥${exp.config.consensus * 100}% at ${exp.config.confirmations} consecutive checkpoints.` };
          }
        }
      } else if (result.kind === 'branch' && result.checkpointId === null) {
        exp.conclusion = result.explanation;
        this.finish(exp, 'no-credible-alternative');
      } else {
        const checkpointId = result.kind === 'branch' ? result.checkpointId! : lease.checkpointId;
        const cp = this.cp(exp, checkpointId);
        if (result.kind === 'branch' && !this.candidates(exp, lease.player).some(c => c.id === checkpointId)) throw new RoomError(422, 'INVALID_CANDIDATE', 'Choose one of your own decision checkpoints.');
        const actions = turnActionsSchema.parse(result.actions) as AIAction[];
        const state = simulate(cp.state, actions, true), resultHash = positionHash(state);
        if (result.kind === 'branch') {
          if (exp.games.some(g => g.turns.some(t => t.checkpointId === checkpointId && (t.resultHash === resultHash || JSON.stringify(t.actions) === JSON.stringify(actions))))) throw new RoomError(422, 'DUPLICATE_BRANCH', 'That continuation was already explored. Choose a different turn or earlier checkpoint.');
          game = { id: uid(), parentId: game.id, forkCheckpoint: checkpointId, forkReason: result.explanation,
            checkpoints: game.checkpoints.slice(0, game.checkpoints.indexOf(checkpointId) + 1), turns: [] };
          exp.games.push(game); exp.activeGameId = game.id;
        }
        if (exp.plies >= exp.config.maxPlies || exp.games.length > exp.config.maxGames) throw new RoomError(409, 'BUDGET_EXHAUSTED', 'Experiment budget exhausted.');
        const next = this.checkpoint(state); exp.checkpoints.push(next); game.checkpoints.push(next.id);
        game.turns.push({ checkpointId, player: lease.player, actions, resultHash, explanation: result.explanation }); exp.plies++;
        if (state.phase === 'victory') game.outcome = { kind: 'rules', winner: state.winner, reason: state.victoryReason ?? 'victory' };
      }
      exp.memory[lease.player] = result.memory;
      exp.usage.push(...usage.map(u => ({ ...u, player: lease.player, provider: exp.config.players[lease.player].provider })));
      exp.receipts.push({ id: jobId, hash }); delete exp.lease;
      this.next(exp); this.save(exp); return this.snapshot(exp);
    });
  }
  control(id: string, token: string, action: 'pause' | 'resume' | 'stop', reason = '') {
    return this.transaction(() => {
      const exp = this.read(id); this.auth(exp, token);
      if (exp.status === 'complete') throw new RoomError(409, 'EXPERIMENT_COMPLETE', 'This experiment is complete; create a new one.');
      if (action === 'resume' && exp.modelCalls >= exp.config.maxModelCalls) throw new RoomError(409, 'MODEL_BUDGET_EXHAUSTED', 'The model-call budget is exhausted. Export this experiment or start another.');
      exp.status = action === 'resume' ? 'running' : action === 'stop' ? 'complete' : 'paused';
      exp.stopReason = action === 'resume' ? null : reason || (action === 'stop' ? 'operator-stopped' : 'operator-paused');
      if (action === 'stop' && !this.active(exp).outcome) this.active(exp).outcome = { kind: 'stopped', winner: null, reason: 'Operator stopped this attempt before a result.' };
      delete exp.lease; this.save(exp); return this.snapshot(exp);
    });
  }
  review(id: string, token: string, note: string) {
    return this.transaction(() => { const exp = this.read(id); this.auth(exp, token); exp.review = note; this.save(exp); return this.snapshot(exp); });
  }
}
