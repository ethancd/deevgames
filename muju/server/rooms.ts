import { emptyRecording, recordAction, rewindRecording, type ReplayRecording } from '../src/game/replay';
import { describeTransition, movementStep, type HistoryQuery, type HistoryStart, type MoveEvent, type MoveHistoryEntry, type RoomMoveHistory } from '../src/game/moveHistory';
import { deflateSync, inflateSync } from 'node:zlib';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { createInitialGameState } from '../src/game/board';
import { getActionsPerTurn, isActionsPerTurn } from '../src/game/rules';
import { automaticUpkeepUndo } from '../src/game/turn';
import { migrateLegacyGame, type LegacyGameState } from '../src/game/migrate';
import { isLegalAction } from '../src/game/legality';
import { applyAction } from '../src/ai/simulate';
import type { GameState, PlayerId } from '../src/game/types';
import type { ActionRequest, ActiveRoom, RoomAction, RoomAdmission, RoomChange, RoomSnapshot } from '../src/online/types';
import { projectClock, type ClockSnapshot } from '../src/online/timeControl';
import { RoomError, actionRequestSchema, createSchema, joinSchema, roomIdSchema, historyQuerySchema } from './schema';

const RULES_VERSION = 'muju-online-4';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const packState = (state: GameState) => deflateSync(JSON.stringify(state));
const unpackState = (data: Uint8Array) => JSON.parse(inflateSync(data).toString()) as GameState;
interface CapturedMove { event: MoveEvent; before: GameState; after: GameState }
function matches(value: string, hash: string) {
  return timingSafeEqual(Buffer.from(digest(value)), Buffer.from(hash));
}
interface StoredRoom extends RoomSnapshot {
  clockBase?: ClockSnapshot;
  undoHistory?: GameState[];
  replayRecording?: ReplayRecording;
  undoReplayLengths?: number[];
  undoMoveSequences?: number[];
  moveHistoryStart?: HistoryStart;
  rulesVersion: string;
  inviteHash: string | null;
  tokenHashes: Partial<Record<PlayerId, string>>;
  receipts: { id: string; player: PlayerId; fingerprint: string }[];
}

/** SQLite transactions serialize mutations even if more than one process opens the file. */
export class RoomStore {
  private db: DatabaseSync;
  private shutdown = new AbortController();
  private clockTimer: ReturnType<typeof setInterval>;
  constructor(path: string = ':memory:', private maxRooms = 10000) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.db.exec(`CREATE TABLE IF NOT EXISTS room_moves (
      room_id TEXT NOT NULL, sequence INTEGER NOT NULL, revision INTEGER NOT NULL,
      player TEXT NOT NULL, turn_number INTEGER NOT NULL, data TEXT NOT NULL,
      undone_revision INTEGER, before_state BLOB, after_state BLOB NOT NULL, PRIMARY KEY (room_id, sequence)
    )`);
    this.db.exec('CREATE TABLE IF NOT EXISTS room_history_roots (room_id TEXT PRIMARY KEY, state BLOB NOT NULL)');
    this.transaction(() => {
      if (!this.db.prepare('PRAGMA table_info(rooms)').all().some(column => column.name === 'deadline_at')) {
        this.db.exec('ALTER TABLE rooms ADD COLUMN deadline_at REAL');
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS rooms_deadline ON rooms(deadline_at) WHERE deadline_at IS NOT NULL');
    });
    this.expireDue();
    this.clockTimer = setInterval(() => this.expireDue(), 250);
    this.clockTimer.unref();
  }
  close() { clearInterval(this.clockTimer); this.shutdown.abort(); this.db.close(); }
  /** Indexed sweep also adjudicates rooms with no connected clients, including after restart. */
  private expireDue() {
    try {
      const due = this.db.prepare('SELECT id FROM rooms WHERE deadline_at <= ?').all(Date.now());
      for (const row of due) this.transaction(() => this.expire(this.read(row.id as string), Date.now()));
    } catch (error) { console.error('Muju clock adjudication failed:', error instanceof Error ? error.message : error); }
  }
  private expire(room: StoredRoom, now: number) {
    const clock = room.clockBase;
    if (!clock?.runningPlayer || clock.deadlineAtMs === null || now < clock.deadlineAtMs || room.state.phase !== 'playing') return;
    const player = clock.runningPlayer, winner: PlayerId = player === 'white' ? 'black' : 'white';
    const before = room.state;
    room.state = { ...before, phase: 'victory', winner, victoryReason: 'timeout', selectedUnit: null, validMoves: [], validAttacks: [] };
    room.clockBase = { ...projectClock(clock, clock.deadlineAtMs), runningPlayer: null, deadlineAtMs: null };
    room.revision++; room.updatedAt = new Date(clock.deadlineAtMs).toISOString();
    room.undoHistory = []; room.undoReplayLengths = []; room.undoMoveSequences = [];
    const event: MoveEvent = { kind: 'result', player, turnNumber: before.turn.turnNumber, winner, reason: 'timeout',
      notation: `${winner === 'white' ? 'White' : 'Black'} wins on time`, description: `${player === 'white' ? 'White' : 'Black'} ran out of time.` };
    room.moveHistoryStart ??= { revision: room.revision - 1, turnNumber: before.turn.turnNumber, player, complete: false };
    this.db.prepare('INSERT OR IGNORE INTO room_history_roots (room_id, state) VALUES (?, ?)').run(room.id, packState(before));
    this.db.prepare('INSERT INTO room_moves (room_id, sequence, revision, player, turn_number, data, after_state) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(room.id, this.latestMoveSequence(room.id) + 1, room.revision, player, before.turn.turnNumber,
        JSON.stringify({ ...event, timestamp: room.updatedAt, positionTurn: { player, turnNumber: before.turn.turnNumber } }), packState(room.state));
    room.history = [...room.history, { revision: room.revision, player, actions: [], result: { winner, reason: 'timeout' as const } }].slice(-100);
    this.save(room);
  }
  private startClock(room: StoredRoom, now: number) {
    if (!room.clockBase || !room.timeControl) return;
    const player = room.state.turn.currentPlayer;
    room.clockBase = { ...room.clockBase, serverNowMs: now, runningPlayer: player, turnStartedAtMs: now,
      delayRemainingMs: room.timeControl.delaySeconds * 1000,
      deadlineAtMs: now + room.timeControl.delaySeconds * 1000 + room.clockBase.bankRemainingMs[player] };
  }
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private read(id: string): StoredRoom {
    roomIdSchema.parse(id);
    const row = this.db.prepare('SELECT data FROM rooms WHERE id = ?').get(id);
    if (!row) throw new RoomError(404, 'ROOM_NOT_FOUND', 'Room not found. Check the invitation or room ID.');
    const room = JSON.parse(row.data as string) as StoredRoom;
    const legacy = ['muju-online-2', 'muju-online-3'].includes(room.rulesVersion);
    const oldState = room.state as LegacyGameState;
    const validBudget = legacy ? oldState.actionsPerTurn === undefined || [4, 6].includes(oldState.actionsPerTurn) : isActionsPerTurn(getActionsPerTurn(room.state));
    if ((!legacy && room.rulesVersion !== RULES_VERSION) || !validBudget) {
      throw new RoomError(409, 'RULES_CHANGED', 'This room uses older rules. Create a new room.');
    }
    if (legacy) {
      room.state = migrateLegacyGame(oldState);
      room.rulesVersion = RULES_VERSION;
      // Reconnects see a changed revision. No undo or replay may restore the old rules.
      room.revision++;
      room.undoHistory = []; room.undoReplayLengths = []; room.undoMoveSequences = []; room.replayRecording = emptyRecording();
    } else room.state.actionsPerTurn = getActionsPerTurn(room.state);
    return room;
  }
  private save(room: StoredRoom) {
    this.db.prepare('INSERT OR REPLACE INTO rooms (id, data, deadline_at) VALUES (?, ?, ?)').run(room.id, JSON.stringify(room), room.clockBase?.deadlineAtMs ?? null);
  }
  private snapshot(room: StoredRoom): RoomSnapshot {
    return structuredClone({ id: room.id, revision: room.revision, ready: room.ready, seats: room.seats,
      timeControl: room.timeControl ?? null, clock: room.clockBase ? projectClock(room.clockBase, Date.now()) : null,
      lastTurnReplay: room.replayRecording?.last ?? null, canUndo: this.canUndo(room), state: room.state, updatedAt: room.updatedAt, history: room.history });
  }
  private canUndo(room: StoredRoom): boolean {
    const previous = room.undoHistory?.at(-1);
    return room.ready && room.state.phase === 'playing' && !!previous &&
      previous.turn.currentPlayer === room.state.turn.currentPlayer &&
      previous.turn.turnNumber === room.state.turn.turnNumber;
  }
  private authenticate(room: StoredRoom, token: string): PlayerId {
    for (const side of ['white', 'black'] as const) {
      const hash = room.tokenHashes[side];
      if (hash && matches(token, hash)) return side;
    }
    throw new RoomError(403, 'INVALID_SEAT', 'This seat credential is invalid. Reconnect with the credential from create or join.');
  }
  get(id: string, token?: string) {
    return this.transaction(() => {
      const room = this.read(id);
      if (token !== undefined) this.authenticate(room, token);
      this.expire(room, Date.now());
      return this.snapshot(room);
    });
  }
  listActive(): ActiveRoom[] {
    this.expireDue();
    // Extract only public summaries in SQLite: boards, undo histories, and hashes
    // never need to be loaded into the lobby or sent over a phone connection.
    const rows = this.db.prepare(`SELECT id,
      json_extract(data, '$.ready') AS ready,
      json_extract(data, '$.seats') AS seats,
      json_extract(data, '$.state.turn.turnNumber') AS turnNumber,
      json_extract(data, '$.state.turn.currentPlayer') AS currentPlayer,
      json_extract(data, '$.updatedAt') AS updatedAt
      FROM rooms WHERE json_extract(data, '$.state.phase') = 'playing'
      AND ((json_extract(data, '$.rulesVersion') = ? AND COALESCE(json_extract(data, '$.state.actionsPerTurn'), 4) = 4)
        OR (json_extract(data, '$.rulesVersion') IN ('muju-online-2', 'muju-online-3')
          AND COALESCE(json_extract(data, '$.state.actionsPerTurn'), 4) IN (4, 6)))
      ORDER BY ready DESC, updatedAt DESC, id`).all(RULES_VERSION);
    return rows.map(row => ({ id: row.id as string, ready: row.ready === 1,
      seats: JSON.parse(row.seats as string), turnNumber: row.turnNumber as number,
      currentPlayer: row.currentPlayer as PlayerId, updatedAt: row.updatedAt as string }));
  }
  moveHistory(id: string, input: HistoryQuery = {}): RoomMoveHistory {
    const { before, after, limit, includeUndone } = historyQuerySchema.parse(input);
    if (before !== undefined && after !== undefined) throw new RoomError(400, 'INVALID_HISTORY_CURSOR', 'Use before or after, not both.');
    return this.transaction(() => {
      const room = this.read(id);
      this.expire(room, Date.now());
      const visible = includeUndone ? '' : ' AND undone_revision IS NULL';
      const cursor = before !== undefined ? ' AND sequence < ?' : after !== undefined ? ' AND sequence > ?' : '';
      const rows = this.db.prepare(`SELECT sequence, revision, data, undone_revision FROM room_moves WHERE room_id = ?${visible}${cursor}
        ORDER BY sequence ${after !== undefined ? 'ASC' : 'DESC'} LIMIT ?`).all(id, ...((before ?? after) !== undefined ? [before ?? after!] : []), limit);
      const entries = rows.map(row => ({ ...JSON.parse(row.data as string), sequence: row.sequence,
        revision: row.revision, undoneAtRevision: row.undone_revision })) as MoveHistoryEntry[];
      entries.sort((a, b) => a.sequence - b.sequence);
      const count = (condition = '', sequence?: number) => Number(this.db.prepare(`SELECT COUNT(*) AS count FROM room_moves WHERE room_id = ?${visible}${condition}`)
        .get(id, ...(sequence === undefined ? [] : [sequence]))!.count);
      const first = entries[0]?.sequence ?? before ?? after ?? 0, last = entries.at(-1)?.sequence ?? after ?? before ?? 0;
      return { roomId: id, revision: room.revision, recordingStart: room.moveHistoryStart ?? {
        revision: room.revision, turnNumber: room.state.turn.turnNumber, player: room.state.turn.currentPlayer, complete: false,
      }, entries, total: count(), hasEarlier: count(' AND sequence < ?', first) > 0, hasLater: count(' AND sequence > ?', last) > 0 };
    });
  }
  private latestMoveSequence(id: string): number {
    return Number(this.db.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM room_moves WHERE room_id = ?').get(id)!.sequence);
  }
  position(id: string, sequence: number, step?: number): { roomId: string; revision: number; state: GameState } {
    const room = this.get(id);
    if (!Number.isInteger(sequence) || sequence < 0 || (step !== undefined && (!Number.isInteger(step) || step < 1))) {
      throw new RoomError(400, 'INVALID_POSITION', 'Use a nonnegative sequence and a positive step.');
    }
    if (sequence === 0) {
      const root = this.db.prepare('SELECT state FROM room_history_roots WHERE room_id = ?').get(id);
      // Existing rooms can be explored from their present position before their first recorded action.
      return { roomId: id, revision: room.revision, state: root ? unpackState(root.state as Uint8Array) : room.state };
    }
    const row = this.db.prepare('SELECT data, before_state, after_state FROM room_moves WHERE room_id = ? AND sequence = ? AND undone_revision IS NULL').get(id, sequence);
    if (!row) throw new RoomError(404, 'POSITION_NOT_FOUND', 'This move is unavailable or was undone. Refresh the game score.');
    const event = JSON.parse(row.data as string) as MoveEvent;
    const after = unpackState(row.after_state as Uint8Array), steps = event.kind === 'move' ? event.ap : 1;
    if (step !== undefined && step > steps) throw new RoomError(400, 'INVALID_POSITION', 'This move has fewer steps.');
    return { roomId: id, revision: room.revision, state: event.kind === 'move' && step !== undefined && step < steps
      ? movementStep(unpackState(row.before_state as Uint8Array), after, event, step) : after };
  }
  restore(id: string, token: string, player: PlayerId): RoomSnapshot {
    return this.transaction(() => {
      const room = this.read(id);
      if (this.authenticate(room, token) !== player) {
        throw new RoomError(403, 'SEAT_MISMATCH', 'The token belongs to the other side. Copy the complete original credentials.');
      }
      this.expire(room, Date.now());
      return this.snapshot(room);
    });
  }
  async wait(id: string, afterRevision: number, timeoutMs: number, signal?: AbortSignal, token?: string): Promise<RoomChange> {
    const cancellation = signal ? AbortSignal.any([signal, this.shutdown.signal]) : this.shutdown.signal;
    cancellation.throwIfAborted();
    const deadline = Date.now() + timeoutMs;
    let room = this.get(id, token);
    // Check only the revision locally while idle. This also sees writes from another
    // process sharing the SQLite file, without sending full snapshots over the network.
    while (room.revision === afterRevision && room.state.phase !== 'victory' && Date.now() < deadline) {
      await delay(Math.max(1, Math.min(500, deadline - Date.now(), room.clock?.deadlineAtMs ? room.clock.deadlineAtMs - Date.now() : Infinity)), undefined, { signal: cancellation });
      const row = this.db.prepare("SELECT json_extract(data, '$.revision') AS revision FROM rooms WHERE id = ?").get(id);
      if (row?.revision !== afterRevision || (room.clock?.deadlineAtMs !== null && room.clock?.deadlineAtMs !== undefined && Date.now() >= room.clock.deadlineAtMs)) room = this.get(id, token);
    }
    const metadata = { revision: room.revision, phase: room.state.phase };
    return room.revision === afterRevision ? { changed: false, ...metadata,
      ...(room.clock ? { clock: projectClock(room.clock, Date.now()) } : {}) } : { changed: true, ...metadata, room };
  }
  create(input: unknown): RoomAdmission {
    const { name, side, actionsPerTurn, timeControl } = createSchema.parse(input);
    return this.transaction(() => {
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM rooms').get()!.count as number;
      if (count >= this.maxRooms) throw new RoomError(503, 'ROOM_LIMIT', 'This host is at its room limit.');
      const id = randomBytes(16).toString('hex'), token = secret(), inviteCode = secret();
      const room: StoredRoom = { id, revision: 0, ready: false, seats: { white: null, black: null },
        state: createInitialGameState(undefined, actionsPerTurn), canUndo: false, undoHistory: [], updatedAt: new Date().toISOString(), history: [],
        moveHistoryStart: { revision: 0, turnNumber: 1, player: 'white', complete: true },
        rulesVersion: RULES_VERSION, inviteHash: digest(inviteCode), tokenHashes: { [side]: digest(token) }, receipts: [] };
      room.seats[side] = name;
      room.timeControl = timeControl ?? null;
      if (timeControl) room.clockBase = { serverNowMs: Date.now(), runningPlayer: null, turnStartedAtMs: null, deadlineAtMs: null,
        delayRemainingMs: timeControl.delaySeconds * 1000,
        bankRemainingMs: { white: timeControl.bankSeconds * 1000, black: timeControl.bankSeconds * 1000 } };
      this.db.prepare('INSERT INTO room_history_roots (room_id, state) VALUES (?, ?)').run(id, packState(room.state));
      this.save(room);
      return { credentials: { roomId: id, player: side, token }, inviteCode, room: this.snapshot(room) };
    });
  }
  join(id: string, input: unknown): RoomAdmission {
    const { name, inviteCode } = joinSchema.parse(input);
    return this.transaction(() => {
      const room = this.read(id);
      if (!room.inviteHash || !matches(inviteCode, room.inviteHash)) throw new RoomError(403, 'INVALID_INVITE', 'Invitation is invalid or has already been used.');
      const player = room.seats.white === null ? 'white' : 'black', token = secret();
      room.seats[player] = name; room.tokenHashes[player] = digest(token);
      room.ready = true; room.inviteHash = null; room.revision++; room.updatedAt = new Date().toISOString();
      this.startClock(room, Date.now());
      this.save(room);
      return { credentials: { roomId: id, player, token }, room: this.snapshot(room) };
    });
  }
  private simulate(room: StoredRoom, player: PlayerId, actions: RoomAction[]): { state: GameState; turnStartUndo: GameState | null; appliedActions: RoomAction[]; moves: CapturedMove[] } {
    let state = room.state;
    let appliedActions = actions;
    let turnStartUndo: GameState | null = null;
    const moves: CapturedMove[] = [];
    for (const [index, action] of actions.entries()) {
      if (action.type === 'UNDO') {
        if (actions.length !== 1 || player !== state.turn.currentPlayer || !this.canUndo(room)) {
          throw new RoomError(422, 'ILLEGAL_ACTION', 'UNDO must be sent alone by the current player with undo history. It cannot cross a turn boundary or undo a finished game.');
        }
        // Preferences can change independently, including while the other player acts.
        state = { ...room.undoHistory!.at(-1)!, reviewUpkeep: state.reviewUpkeep };
        continue;
      }
      if (action.type === 'SET_UPKEEP_REVIEW') {
        if (actions.length !== 1 || state.phase !== 'playing') throw new RoomError(422, 'ILLEGAL_ACTION', 'Send upkeep preference changes alone during an active game.');
        state = { ...state, reviewUpkeep: { ...state.reviewUpkeep, [player]: action.enabled } };
        continue;
      }
      if (!room.ready) throw new RoomError(409, 'WAITING_FOR_OPPONENT', 'Share the invitation and wait for the other player to join.');
      if (!isLegalAction(state, action, player)) throw new RoomError(422, 'ILLEGAL_ACTION',
        `Action ${index + 1} (${action.type}) is illegal. No actions were applied. Read the current room and legal actions before retrying.`);
      const before = state;
      state = applyAction(state, action);
      const upkeepUndo = automaticUpkeepUndo(before, state);
      moves.push(...describeTransition(before, action, state).map(event => ({ event, before,
        after: event.kind === 'mining' && upkeepUndo ? upkeepUndo : state })));
      turnStartUndo = automaticUpkeepUndo(before, state) ?? turnStartUndo;
      room.replayRecording = recordAction(room.replayRecording ?? emptyRecording(), before, action, state);
      // A newly proven home checkmate cancels queued commands, including an LLM's
      // customary END_ACTION_PHASE. Record only the actions that actually ran.
      if (state.phase === 'victory' && state.victoryReason === 'home-checkmate') {
        appliedActions = actions.slice(0, index + 1);
        break;
      }
    }
    return { state, turnStartUndo, appliedActions, moves };
  }
  act(id: string, token: string, input: unknown, preview = false): RoomSnapshot {
    const request: ActionRequest = actionRequestSchema.parse(input);
    const result = this.transaction(() => {
      const room = this.read(id), player = this.authenticate(room, token);
      const receivedAt = Date.now();
      this.expire(room, receivedAt);
      const fingerprint = digest(JSON.stringify({ revision: request.expectedRevision, actions: request.actions }));
      const receipt = room.receipts.find(r => r.id === request.requestId && r.player === player);
      // Return errors after committing adjudication: an overdue command must never roll back a timeout.
      if (room.state.victoryReason === 'timeout' && (!receipt || preview || receipt.fingerprint !== fingerprint)) {
        return new RoomError(409, 'TIME_EXPIRED', 'The game ended on time. No requested actions were applied.', this.snapshot(room));
      }
      if (receipt && !preview) {
        if (receipt.fingerprint !== fingerprint) throw new RoomError(409, 'REQUEST_ID_REUSED', 'Use a new requestId for a different action.');
        return this.snapshot(room);
      }
      if (room.revision !== request.expectedRevision) throw new RoomError(409, 'STALE_REVISION', `Room is at revision ${room.revision}. Read it again before playing.`);
      const replayLength = room.replayRecording?.current?.frames.length ?? 0;
      const sequence = this.latestMoveSequence(id);
      const { state, turnStartUndo, appliedActions, moves } = this.simulate(room, player, request.actions);
      const undoSequence = room.undoMoveSequences?.at(-1) ?? 0;
      room.moveHistoryStart ??= { revision: room.revision, turnNumber: room.state.turn.turnNumber,
        player: room.state.turn.currentPlayer, complete: false };
      if (request.actions[0].type === 'UNDO') {
        room.undoHistory!.pop();
        room.undoMoveSequences?.pop();
        room.replayRecording = rewindRecording(room.replayRecording ?? emptyRecording(), room.undoReplayLengths?.pop() ?? 0);
      }
      else if (state.phase !== 'playing' || state.turn.currentPlayer !== room.state.turn.currentPlayer ||
        state.turn.turnNumber !== room.state.turn.turnNumber) {
        room.undoHistory = turnStartUndo ? [turnStartUndo] : [];
        room.undoReplayLengths = turnStartUndo ? [0] : [];
        const upkeepIndex = moves.findIndex(({ event }) => event.kind === 'upkeep' && event.player === state.turn.currentPlayer && event.turnNumber === state.turn.turnNumber);
        room.undoMoveSequences = turnStartUndo ? [sequence + Math.max(0, upkeepIndex)] : [];
      }
      else if (request.actions[0].type !== 'SET_UPKEEP_REVIEW' && state !== room.state) {
        room.undoHistory = [...(room.undoHistory ?? []), room.state];
        room.undoReplayLengths = [...(room.undoReplayLengths ?? []), replayLength];
        room.undoMoveSequences = [...(room.undoMoveSequences ?? []), sequence];
      }
      const initialState = room.state;
      room.state = state;
      if (preview) return this.snapshot(room);
      if (room.clockBase && (state.phase !== 'playing' || state.turn.currentPlayer !== initialState.turn.currentPlayer || state.turn.turnNumber !== initialState.turn.turnNumber)) {
        room.clockBase = { ...projectClock(room.clockBase, receivedAt), runningPlayer: null, deadlineAtMs: null };
        // Start the opponent after engine processing, so they do not pay for this command's computation.
        if (state.phase === 'playing') this.startClock(room, Date.now());
      }
      room.revision++; room.updatedAt = new Date().toISOString();
      if (request.actions[0].type === 'UNDO') {
        this.db.prepare(`UPDATE room_moves SET undone_revision = ? WHERE room_id = ? AND sequence > ?
          AND player = ? AND turn_number = ? AND undone_revision IS NULL`).run(room.revision, id, undoSequence, state.turn.currentPlayer, state.turn.turnNumber);
      }
      this.db.prepare('INSERT OR IGNORE INTO room_history_roots (room_id, state) VALUES (?, ?)').run(id, packState(initialState));
      const insert = this.db.prepare('INSERT INTO room_moves (room_id, sequence, revision, player, turn_number, data, before_state, after_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      moves.forEach(({ event, before, after }, index) => insert.run(id, sequence + index + 1, room.revision, event.player, event.turnNumber,
        JSON.stringify({ ...event, timestamp: room.updatedAt, positionTurn: { player: after.turn.currentPlayer, turnNumber: after.turn.turnNumber } }),
        event.kind === 'move' ? packState(before) : null, packState(after)));
      room.history = [...room.history, { revision: room.revision, player, actions: appliedActions }].slice(-100);
      room.receipts = [...room.receipts, { id: request.requestId, player, fingerprint }].slice(-256);
      this.save(room);
      return this.snapshot(room);
    });
    if (result instanceof RoomError) throw result;
    return result;
  }
}
