import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RoomAdmission, RoomChange, RoomSnapshot } from '../src/online/types';
import { actionSchema, createSchema, joinSchema, roomIdSchema, tokenSchema, historyQuerySchema, RoomError } from './schema';
import { HISTORY_NOTATION, type HistoryQuery, type RoomMoveHistory } from '../src/game/moveHistory';
import { describeAction, legalActions, observe, rules } from './observation';

type MaybePromise<T> = T | Promise<T>;
export interface RoomBackend {
  create(input: unknown): MaybePromise<RoomAdmission>;
  join(id: string, input: unknown): MaybePromise<RoomAdmission>;
  get(id: string, token?: string): MaybePromise<RoomSnapshot>;
  moveHistory(id: string, query?: HistoryQuery): MaybePromise<RoomMoveHistory>;
  wait(id: string, afterRevision: number, timeoutMs: number, signal?: AbortSignal): Promise<RoomChange>;
  act(id: string, token: string, input: unknown, preview?: boolean): MaybePromise<RoomSnapshot>;
}
const squareSchema = z.string().regex(/^[A-Ja-j](10|[1-9])$/).transform(s => ({ x: s.toUpperCase().charCodeAt(0) - 65, y: Number(s.slice(1)) - 1 }));
const agentPosition = z.union([squareSchema, z.object({ x: z.number().int().min(0).max(9), y: z.number().int().min(0).max(9) }).strict()]);
// Same actions as the engine, with convenient A1–J10 notation at the MCP boundary.
const agentAction = z.union([
  z.object({ type: z.literal('MOVE'), unitId: z.string().max(100), to: agentPosition }).strict(),
  z.object({ type: z.literal('ATTACK'), unitId: z.string().max(100), targetPosition: agentPosition }).strict(),
  z.object({ type: z.literal('BUY_UNIT'), definitionId: z.string().max(40), position: agentPosition }).strict(),
  actionSchema,
]);
const credentials = { roomId: roomIdSchema, token: tokenSchema.describe('Your private seat token, returned by create or join.') };
const playInput = { ...credentials, expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().min(8).max(100).describe('Unique per command; retry the identical command with the same ID after a network failure.'),
  actions: z.array(agentAction).min(1).max(32) };

export function createMcpServer(backend: RoomBackend, publicUrl: string) {
  const server = new McpServer({ name: 'deevgames-muju', version: '1.0.0' }, { instructions:
    'Play Muju Hono Tanka using the authoritative shared room. Start with muju_rules before joining: timed games start on join. Never share your seat token. Pass the invitation to your opponent. Use muju_legal_actions and muju_preview to plan, then muju_play. Watch clock.deadlineAtMs and finish your entire turn with END_ACTION_PHASE before time expires. Delay is per full turn, followed by your personal bank; previews and undo do not stop or reset it. Use muju_wait_for_change only between turns. Square notation is A1–J10.' });
  const output = (value: object) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: { ...value } });
  const safely = async (operation: () => Promise<object> | object) => {
    try { return output(await operation()); }
    catch (error) {
      if (error instanceof RoomError) return { ...output({ code: error.code, error: error.message,
        ...(error.room ? { room: observe(error.room) } : {}) }), isError: true as const };
      return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Request failed.' }], isError: true as const };
    }
  };
  const watchUrl = (roomId: string) => `${publicUrl}/muju/?room=${roomId}&watch=1`;
  const admission = (result: RoomAdmission) => ({ credentials: { ...result.credentials, serverUrl: publicUrl }, watchUrl: watchUrl(result.room.id),
    ...(result.inviteCode ? { invitation: { roomId: result.room.id, inviteCode: result.inviteCode,
      serverUrl: publicUrl, url: `${publicUrl}/muju/?room=${result.room.id}#invite=${result.inviteCode}` } } : {}),
    room: observe(result.room) });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  server.registerResource('muju-rules', 'muju://rules', { mimeType: 'application/json', description: 'Rules and unit catalogue' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(rules) }] }));
  server.registerTool('muju_rules', { description: 'Read the rules, unit stats, coordinates, and agent workflow before playing.', annotations: readOnly },
    async () => output(rules));
  server.registerTool('muju_create_room', { description: 'Host a new two-player game. Optional immutable timeControl: blitz (10s/2min), rapid (30s/10min), classical (60s/30min), or custom delaySeconds/bankSeconds. Each player has a separate bank; free delay resets each full turn. Omit for untimed. Clocks start when the opponent joins. Returns your private seat credential and a separate invitation to share.', inputSchema: createSchema.shape,
    annotations: { destructiveHint: false, openWorldHint: false } }, input => safely(async () => admission(await backend.create(input))));
  server.registerTool('muju_join_room', { description: 'Claim the remaining seat using an invitation. Save the returned credential; each invitation works once.',
    inputSchema: { roomId: roomIdSchema, ...joinSchema.shape }, annotations: { destructiveHint: false, openWorldHint: false } },
    ({ roomId, ...input }) => safely(async () => admission(await backend.join(roomId, input))));
  server.registerTool('muju_observe', { description: 'Get a compact board, unit IDs/stats, resources, turn, result, revision, and a watchUrl for human observers. Any number of observers can follow a room without a seat token; use muju_wait_for_change for live updates.',
    inputSchema: { roomId: roomIdSchema }, annotations: readOnly }, ({ roomId }) => safely(async () => ({ ...observe(await backend.get(roomId)), watchUrl: watchUrl(roomId) })));
  server.registerTool('muju_clock', { description: 'Read just the current revision, turn owner, result, immutable time control and both clocks. Public; no token. Clock timestamps are server Unix milliseconds. At serverNowMs, the running player has deadlineAtMs − serverNowMs total time left. Subtract locally elapsed time and leave a network margin. A full turn includes upkeep, placement and all actions; end it with END_ACTION_PHASE. No delay reset from partial actions, undo, preview or reads. Untimed rooms return clock=null.',
    inputSchema: { roomId: roomIdSchema }, annotations: readOnly }, ({ roomId }) => safely(async () => {
      const room = await backend.get(roomId);
      return { roomId, revision: room.revision, ready: room.ready, status: room.state.phase,
        activePlayer: room.ready && room.state.phase === 'playing' ? room.state.turn.currentPlayer : null,
        winner: room.state.winner, victoryReason: room.state.victoryReason ?? null,
        timeControl: room.timeControl ?? null, clock: room.clock ?? null };
    }));
  server.registerTool('muju_history', { description: 'Read the persistent room score: moves with paths/AP, purchases, promotions, attack damage/captures, automatic or chosen upkeep and releases, per-unit mining/reserves, and result. Public; no token needed. Default returns the latest 50 entries in chronological order. Use before=first sequence for older pages, or after=last sequence for newer pages (after=0 reads from the start). Undone entries are omitted unless includeUndone=true. On an UNDO notification, refresh the affected turn rather than only appending. recordingStart.complete=false marks older rooms whose earlier moves are unavailable. Phase-ending commands and coaching judgments are omitted.',
    inputSchema: { roomId: roomIdSchema, ...historyQuerySchema.shape }, annotations: readOnly },
    ({ roomId, ...query }) => safely(async () => ({ ...await backend.moveHistory(roomId, query), notation: HISTORY_NOTATION })));
  server.registerTool('muju_legal_actions', { description: 'List legal actions for the current player with move costs and attack outcomes. Includes multi-action moves. Filter by unit/type and paginate. Upkeep shows one valid selection; custom affordable selections are accepted.',
    inputSchema: { roomId: roomIdSchema, unitId: z.string().max(100).optional(), type: z.enum(['MOVE', 'ATTACK', 'BUY_UNIT', 'PROMOTE_UNIT', 'PAY_UPKEEP', 'END_PLACE_PHASE', 'END_ACTION_PHASE', 'RESIGN', 'UNDO']).optional(),
      offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(200).default(60) }, annotations: readOnly },
    ({ roomId, ...options }) => safely(async () => legalActions(await backend.get(roomId), options)));
  server.registerTool('muju_preview', { description: 'Simulate an atomic sequence without committing moves. Returns a hypothetical board and a separate liveClock for the real game. Thinking and previews use your running clock; they never reserve time or reset the delay. An expired clock returns TIME_EXPIRED with the actual terminal room. Use A1–J10 positions. Cannot cross into the opponent’s turn.',
    inputSchema: playInput, annotations: readOnly }, ({ roomId, token, ...request }) => safely(async () => {
      const { clock, ...room } = observe(await backend.act(roomId, token, request, true));
      return { preview: true, actions: request.actions.map(describeAction), liveClock: clock, room };
    }));
  server.registerTool('muju_play', { description: 'Commit one action or an atomic sequence to your shared game. Uses current revision and unique requestId. Invalid batches change nothing. An immediate home checkmate wins and cancels remaining queued actions. Ending action phase hands control and its clock to the opponent. In timed rooms all phases/actions share one delay; send END_ACTION_PHASE before clock.deadlineAtMs. Late commands return TIME_EXPIRED and the terminal room without applying actions. RESIGN concedes the game. UNDO, sent alone, reverses your latest command within this turn when canUndo is true, including refunding automatic upkeep to reopen PAY_UPKEEP.',
    inputSchema: playInput, annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    ({ roomId, token, ...request }) => safely(async () => observe(await backend.act(roomId, token, request))));
  server.registerTool('muju_wait_for_change', { description: 'Wait up to 25 seconds for a room revision to change (opponent joins, plays or loses on time). Never wait on your own running turn. A changed result includes events (revision, player, actions), eventsComplete, and the new room. Moves and UNDO can occur within the opponent’s turn: act only when room.activePlayer is your seat. A timeout event has actions=[] and result={winner,reason:timeout}. Ordinary clock ticks do not change revision. An unchanged result contains changed=false, revision and phase, plus a fresh clock for timed rooms; keep your board and wait again only if the opponent is still active. Stop waiting when phase is victory.',
    inputSchema: { roomId: roomIdSchema, afterRevision: z.number().int().nonnegative(), timeoutMs: z.number().int().min(0).max(25000).default(25000) }, annotations: readOnly },
    ({ roomId, afterRevision, timeoutMs }, extra) => safely(async () => {
      const change = await backend.wait(roomId, afterRevision, timeoutMs, extra.signal);
      if (!change.changed) return change;
      const events = change.room.history.filter(event => event.revision > afterRevision);
      return { ...change,
        events: events.map(event => ({ ...event, actions: event.actions.map(describeAction) })),
        eventsComplete: change.room.history.length < 100 || afterRevision >= change.room.history[0].revision - 1,
        room: observe(change.room),
      };
    }));
  return server;
}
