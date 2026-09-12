import { emptyRecording, recordAction, rewindRecording, type ReplayRecording } from '../src/game/replay';
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
import type { ActionRequest, RoomAction, RoomAdmission, RoomChange, RoomSnapshot } from '../src/online/types';
import { RoomError, actionRequestSchema, createSchema, joinSchema, roomIdSchema } from './schema';

const RULES_VERSION = 'muju-online-4';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
function matches(value: string, hash: string) {
  return timingSafeEqual(Buffer.from(digest(value)), Buffer.from(hash));
}
interface StoredRoom extends RoomSnapshot {
  undoHistory?: GameState[];
  replayRecording?: ReplayRecording;
  undoReplayLengths?: number[];
  rulesVersion: string;
  inviteHash: string | null;
  tokenHashes: Partial<Record<PlayerId, string>>;
  receipts: { id: string; player: PlayerId; fingerprint: string }[];
}

/** SQLite transactions serialize mutations even if more than one process opens the file. */
export class RoomStore {
  private db: DatabaseSync;
  private shutdown = new AbortController();
  constructor(path: string = ':memory:', private maxRooms = 10000) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
  }
  close() { this.shutdown.abort(); this.db.close(); }
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
      room.undoHistory = []; room.undoReplayLengths = []; room.replayRecording = emptyRecording();
    } else room.state.actionsPerTurn = getActionsPerTurn(room.state);
    return room;
  }
  private save(room: StoredRoom) {
    this.db.prepare('INSERT OR REPLACE INTO rooms (id, data) VALUES (?, ?)').run(room.id, JSON.stringify(room));
  }
  private snapshot(room: StoredRoom): RoomSnapshot {
    return structuredClone({ id: room.id, revision: room.revision, ready: room.ready, seats: room.seats,
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
    const room = this.read(id);
    if (token !== undefined) this.authenticate(room, token);
    return this.snapshot(room);
  }
  restore(id: string, token: string, player: PlayerId): RoomSnapshot {
    const room = this.read(id);
    if (this.authenticate(room, token) !== player) {
      throw new RoomError(403, 'SEAT_MISMATCH', 'The token belongs to the other side. Copy the complete original credentials.');
    }
    return this.snapshot(room);
  }
  async wait(id: string, afterRevision: number, timeoutMs: number, signal?: AbortSignal, token?: string): Promise<RoomChange> {
    const cancellation = signal ? AbortSignal.any([signal, this.shutdown.signal]) : this.shutdown.signal;
    cancellation.throwIfAborted();
    const deadline = Date.now() + timeoutMs;
    let room = this.get(id, token);
    // Check only the revision locally while idle. This also sees writes from another
    // process sharing the SQLite file, without sending full snapshots over the network.
    while (room.revision === afterRevision && room.state.phase !== 'victory' && Date.now() < deadline) {
      await delay(Math.min(500, deadline - Date.now()), undefined, { signal: cancellation });
      const row = this.db.prepare("SELECT json_extract(data, '$.revision') AS revision FROM rooms WHERE id = ?").get(id);
      if (row?.revision !== afterRevision) room = this.get(id, token);
    }
    const metadata = { revision: room.revision, phase: room.state.phase };
    return room.revision === afterRevision ? { changed: false, ...metadata } : { changed: true, ...metadata, room };
  }
  create(input: unknown): RoomAdmission {
    const { name, side, actionsPerTurn } = createSchema.parse(input);
    return this.transaction(() => {
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM rooms').get()!.count as number;
      if (count >= this.maxRooms) throw new RoomError(503, 'ROOM_LIMIT', 'This host is at its room limit.');
      const id = randomBytes(16).toString('hex'), token = secret(), inviteCode = secret();
      const room: StoredRoom = { id, revision: 0, ready: false, seats: { white: null, black: null },
        state: createInitialGameState(undefined, actionsPerTurn), canUndo: false, undoHistory: [], updatedAt: new Date().toISOString(), history: [],
        rulesVersion: RULES_VERSION, inviteHash: digest(inviteCode), tokenHashes: { [side]: digest(token) }, receipts: [] };
      room.seats[side] = name;
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
      this.save(room);
      return { credentials: { roomId: id, player, token }, room: this.snapshot(room) };
    });
  }
  private simulate(room: StoredRoom, player: PlayerId, actions: RoomAction[]): { state: GameState; turnStartUndo: GameState | null } {
    let state = room.state;
    let turnStartUndo: GameState | null = null;
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
      turnStartUndo = automaticUpkeepUndo(before, state) ?? turnStartUndo;
      room.replayRecording = recordAction(room.replayRecording ?? emptyRecording(), before, action, state);
    }
    return { state, turnStartUndo };
  }
  act(id: string, token: string, input: unknown, preview = false): RoomSnapshot {
    const request: ActionRequest = actionRequestSchema.parse(input);
    return this.transaction(() => {
      const room = this.read(id), player = this.authenticate(room, token);
      const fingerprint = digest(JSON.stringify({ revision: request.expectedRevision, actions: request.actions }));
      const receipt = room.receipts.find(r => r.id === request.requestId && r.player === player);
      if (receipt && !preview) {
        if (receipt.fingerprint !== fingerprint) throw new RoomError(409, 'REQUEST_ID_REUSED', 'Use a new requestId for a different action.');
        return this.snapshot(room);
      }
      if (room.revision !== request.expectedRevision) throw new RoomError(409, 'STALE_REVISION', `Room is at revision ${room.revision}. Read it again before playing.`);
      const replayLength = room.replayRecording?.current?.frames.length ?? 0;
      const { state, turnStartUndo } = this.simulate(room, player, request.actions);
      if (request.actions[0].type === 'UNDO') {
        room.undoHistory!.pop();
        room.replayRecording = rewindRecording(room.replayRecording ?? emptyRecording(), room.undoReplayLengths?.pop() ?? 0);
      }
      else if (state.phase !== 'playing' || state.turn.currentPlayer !== room.state.turn.currentPlayer ||
        state.turn.turnNumber !== room.state.turn.turnNumber) {
        room.undoHistory = turnStartUndo ? [turnStartUndo] : [];
        room.undoReplayLengths = turnStartUndo ? [0] : [];
      }
      else if (request.actions[0].type !== 'SET_UPKEEP_REVIEW' && state !== room.state) {
        room.undoHistory = [...(room.undoHistory ?? []), room.state];
        room.undoReplayLengths = [...(room.undoReplayLengths ?? []), replayLength];
      }
      room.state = state;
      if (preview) return this.snapshot(room);
      room.revision++; room.updatedAt = new Date().toISOString();
      room.history = [...room.history, { revision: room.revision, player, actions: request.actions }].slice(-100);
      room.receipts = [...room.receipts, { id: request.requestId, player, fingerprint }].slice(-256);
      this.save(room);
      return this.snapshot(room);
    });
  }
}
