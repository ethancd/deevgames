import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { HardEngine } from '../../src/ai/hard/engine';
import { hardEnginePatch } from '../../lab/hard-ai/bots/hard';
import type { RootResult } from '../../src/ai/hard/search/root';
import type { GameState } from '../../src/game/types';
import type { ActionRequest, RoomChange, RoomConnection, RoomSnapshot } from '../../src/online/types';
import { OnlineError, playRoom, readRoom, waitRoom } from '../../src/online/client';
import { verifySeatTurn } from './verify';
import { assertAuthenticatedSeat, assertSeatRoom, seatContractSchema, type SeatContract } from './contract';
export { assertSeatRoom } from './contract';

export const ENGINE_ALLOWANCE_MS = 60_000;
export interface SeatJournal {
  version: 2;
  connection: RoomConnection;
  seed: number;
  admission: 'issued' | 'join';
  contract: SeatContract;
  /** Kept on disk until an identical request is acknowledged. */
  pending?: ActionRequest;
}
export interface SeatTransport {
  read(connection: RoomConnection, signal?: AbortSignal): Promise<RoomSnapshot>;
  wait(connection: RoomConnection, after: number, signal?: AbortSignal): Promise<RoomChange>;
  play(connection: RoomConnection, request: ActionRequest): Promise<RoomSnapshot>;
}
interface SeatEngine { searchTurn(state: GameState, options: { targetMs: number; deadlineMs: number }): Promise<RootResult> }
export interface SeatOptions {
  journal: SeatJournal;
  save(journal: SeatJournal): void;
  log(event: Record<string, unknown>): void;
  signal?: AbortSignal;
  transport?: SeatTransport;
  createEngine?: (seed: number) => SeatEngine;
}
export async function runSeat(options: SeatOptions): Promise<void> {
  const { journal, save, log, signal } = options;
  const expected = { roomId: journal.connection.roomId, contract: seatContractSchema.parse(journal.contract) };
  if (journal.version !== 2 || (journal.admission !== 'issued' && journal.admission !== 'join') ||
      (expected.contract.mode === 'pinned' && journal.admission !== 'issued')) throw new Error('Seat journal has no valid persisted admission and contract.');
  const transport = options.transport ?? { read: readRoom, wait: waitRoom, play: playRoom };
  const readAuthenticatedRoom = async () => {
    const current = await transport.read(journal.connection, signal);
    assertSeatRoom(current, expected);
    assertAuthenticatedSeat(current, journal.connection.player);
    return current;
  };
  let engine: SeatEngine | undefined;
  const makeEngine = options.createEngine ?? (seed => { const e = new HardEngine(hardEnginePatch('desktop')); e.setSeed(seed); return e; });
  let room = await readAuthenticatedRoom();
  log({ event: 'room-contract-verified', mode: expected.contract.mode, roomId: room.id,
    matchPolicy: room.matchPolicy ?? null, timeControl: room.timeControl ?? null, handicap: room.state.blackCrystalHandicap ?? null });
  // Retry a durable submission first, even after a terminal response was lost.
  if (journal.pending) {
    room = await transport.play(journal.connection, journal.pending);
    assertSeatRoom(room, expected);
    assertAuthenticatedSeat(room, journal.connection.player);
    log({ event: 'recovered-submission', requestId: journal.pending.requestId, revision: room.revision });
    delete journal.pending; save(journal);
  }
  while (!signal?.aborted) {
    assertSeatRoom(room, expected);
    if (room.state.phase !== 'playing') { log({ event: 'finished', revision: room.revision, winner: room.state.winner, reason: room.state.victoryReason }); return; }
    if (!room.ready || room.state.turn.currentPlayer !== journal.connection.player) {
      const change = await transport.wait(journal.connection, room.revision, signal);
      if (change.changed) {
        assertSeatRoom(change.room, expected);
        // Long-poll results are public even when the wait used a seat token.
        // Re-authenticate before searching the newly active turn.
        room = await readAuthenticatedRoom();
      }
      continue;
    }
    if (room.clock?.deadlineAtMs !== null && room.clock?.deadlineAtMs !== undefined &&
        room.clock.deadlineAtMs - room.clock.serverNowMs < ENGINE_ALLOWANCE_MS + 1_000) {
      throw new Error('Insufficient room clock for the fixed 60-second engine allowance plus transport margin.');
    }
    const started = performance.now();
    engine ??= makeEngine(journal.seed); // One engine/profile per game; startup counts in elapsed.
    let result: RootResult;
    try { result = await engine.searchTurn(room.state, { targetMs: ENGINE_ALLOWANCE_MS, deadlineMs: ENGINE_ALLOWANCE_MS }); }
    catch (error) {
      log({ event: 'search-failed', revision: room.revision, elapsedMs: performance.now() - started, fallback: 'engine-exception', verified: false });
      throw error;
    }
    let verified = false;
    try { verifySeatTurn(room.state, result); verified = true; }
    finally {
      const elapsedMs = performance.now() - started;
      log({ event: 'search', revision: room.revision, turn: room.state.turn.turnNumber, player: journal.connection.player,
        allowanceMs: ENGINE_ALLOWANCE_MS, elapsedMs, overrunMs: Math.max(0, elapsedMs - ENGINE_ALLOWANCE_MS), depth: result.depth, rung: result.stats.rung,
        work: result.work, source: result.source, stopReason: result.stats.stopReason, fallback: result.fallback ?? (result.source === 'fallback' ? 'unsearched' : null), verified });
    }
    if (signal?.aborted) return;
    journal.pending = { expectedRevision: room.revision, requestId: randomUUID(), actions: result.actions };
    save(journal); // Before any network side effect; restart cannot generate a different turn.
    const beforeSubmission = await readAuthenticatedRoom();
    if (beforeSubmission.revision !== room.revision) throw new OnlineError('Room changed during engine search.', 'STALE_REVISION', 409);
    if (signal?.aborted) return;
    let acknowledged: RoomSnapshot;
    try { acknowledged = await transport.play(journal.connection, journal.pending); }
    catch (error) {
      // Only retry uncertain transport outcomes; semantic errors stop this run.
      if (error instanceof OnlineError) throw error;
      log({ event: 'retry-submission', requestId: journal.pending.requestId });
      await readAuthenticatedRoom();
      if (signal?.aborted) return;
      acknowledged = await transport.play(journal.connection, journal.pending);
    }
    assertSeatRoom(acknowledged, expected);
    assertAuthenticatedSeat(acknowledged, journal.connection.player);
    log({ event: 'submitted', requestId: journal.pending.requestId, fromRevision: room.revision,
      revision: acknowledged.revision, actions: journal.pending.actions, elapsedMs: performance.now() - started });
    delete journal.pending; save(journal); room = acknowledged;
  }
}
