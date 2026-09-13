import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RoomAdmission, RoomChange, RoomSnapshot } from '../src/online/types';
import { createSchema, joinSchema, roomIdSchema, tokenSchema, historyQuerySchema, RoomError,
  stageRequestSchema, cancelStageSchema, stageIdSchema } from './schema';
import type { StagingResult, StagingStatus } from '../src/online/staging';
import { HISTORY_NOTATION, type HistoryQuery, type RoomMoveHistory } from '../src/game/moveHistory';
import { describeAction, legalActions, observe, rules } from './observation';
import { agentAction } from './agentSchema';
import { analysisSchema } from './analysis/schema';
import { analysisService } from './analysis';
import { readTimeAwarenessSkill } from './skills';

type MaybePromise<T> = T | Promise<T>;
export interface RoomBackend {
  create(input: unknown): MaybePromise<RoomAdmission>;
  join(id: string, input: unknown): MaybePromise<RoomAdmission>;
  get(id: string, token?: string): MaybePromise<RoomSnapshot>;
  moveHistory(id: string, query?: HistoryQuery): MaybePromise<RoomMoveHistory>;
  wait(id: string, afterRevision: number, timeoutMs: number, signal?: AbortSignal): Promise<RoomChange>;
  act(id: string, token: string, input: unknown, preview?: boolean): MaybePromise<RoomSnapshot>;
  stage(id: string, token: string, input: unknown): MaybePromise<StagingResult>;
  cancelStage(id: string, token: string, input: unknown): MaybePromise<StagingResult>;
  staged(id: string, token: string, stageId?: string): MaybePromise<StagingStatus>;
}
const credentials = { roomId: roomIdSchema, token: tokenSchema.describe('Your private seat token, returned by create or join.') };
const playInput = { ...credentials, expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().min(8).max(100).describe('Unique per command; retry the identical command with the same ID after a network failure.'),
  actions: z.array(agentAction).min(1).max(32) };
const briefingInput = { briefing: z.boolean().default(false), player: z.enum(['white', 'black']).optional(),
  sinceRevision: z.number().int().nonnegative().optional() };

export function createMcpServer(backend: RoomBackend, publicUrl: string) {
  const server = new McpServer({ name: 'deevgames-muju', version: '1.0.0' }, { instructions:
    'Play Muju Hono Tanka using the authoritative shared room. Read muju_rules and muju_time_awareness before joining: clocks start on join. Never share your seat token; share only the invitation. Start with muju_observe(briefing:true,player), clock and clockPressure. In timed play, read muju_staged and stage your own early candidate through muju_stage; choose a sustainable threshold, improve/replace, commit through muju_play or let it fire, and check private results. Five seconds remaining can spend nearly the entire bank. Expiry remains a plain loss; no automatic end-turn or move repair. Use muju_analyze for focused threats, exchanges, replies or home proofs. Analysis witnesses use the play action schema; unknown never means safe. Analysis, previews and undo never stop/reset clocks. Model effort is a client concern. Use muju_wait_for_change only between turns; briefing:true and sinceRevision request changed analysis sections. Public waits do not report private staging failures. Square notation is A1–J10.' });
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
    room: observe(result.room, result.credentials.player) });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  server.registerResource('muju-time-awareness', 'muju://skills/muju-time-awareness',
    { mimeType: 'text/markdown', description: 'Skill for managing thinking and submission during timed Muju play; read before joining.' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await readTimeAwarenessSkill() }] }));
  server.registerResource('muju-staged-play', 'muju://skills/muju-time-awareness/staged-play',
    { mimeType: 'text/markdown', description: 'Implemented protocol for private player-authored staged commits, race/restart semantics and historical clock pressure.' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await readTimeAwarenessSkill(true) }] }));
  server.registerTool('muju_time_awareness', {
    description: 'Read the timed-play skill before joining: read clock pressure, stage your own early candidate, choose a sustainable thinking budget, improve/replace, commit or let it fire, and check the result. Reading the skill does not schedule moves or change model effort.',
    annotations: readOnly,
  }, async () => ({ content: [{ type: 'text' as const, text: await readTimeAwarenessSkill() }] }));
  server.registerResource('muju-rules', 'muju://rules', { mimeType: 'application/json', description: 'Rules and unit catalogue' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(rules) }] }));
  server.registerTool('muju_rules', { description: 'Read the rules, unit stats, coordinates, and agent workflow before playing.', annotations: readOnly },
    async () => output(rules));
  server.registerTool('muju_create_room', { description: 'Host a new two-player game. Optional blackCrystalHandicap grants Black 1–20 starting crystals (omit/0 for none). Black skips its first Place & Promote phase with 1–2 crystals; 3–20 enables it. White still starts. Optional immutable timeControl: blitz (10s/2min), rapid (30s/10min), classical (60s/30min), or custom delaySeconds/bankSeconds. Each player has a separate bank; free delay resets each full turn. Omit for untimed. Clocks start when the opponent joins. Returns your private seat credential and a separate invitation to share.', inputSchema: createSchema.shape,
    annotations: { destructiveHint: false, openWorldHint: false } }, input => safely(async () => admission(await backend.create(input))));
  server.registerTool('muju_join_room', { description: 'Claim the remaining seat using an invitation. Save the returned credential; each invitation works once.',
    inputSchema: { roomId: roomIdSchema, ...joinSchema.shape }, annotations: { destructiveHint: false, openWorldHint: false } },
    ({ roomId, ...input }) => safely(async () => admission(await backend.join(roomId, input))));
  server.registerTool('muju_observe', { description: 'Get the board, IDs, revision, clocks, fresh historical clockPressure and automatic economy/deployment/urgent analysis headline. Set briefing:true and player to include a compact turn briefing in this call; sinceRevision requests changed sections from a cached compatible briefing. Public; no token or private stage plans. Use muju_analyze for focused witnesses and bounded deep search.',
    inputSchema: { roomId: roomIdSchema, ...briefingInput }, annotations: readOnly }, ({ roomId, briefing, player, sinceRevision }) => safely(async () => {
      const room = await backend.get(roomId), perspective = player ?? room.state.turn.currentPlayer;
      return { ...observe(room, perspective), watchUrl: watchUrl(roomId),
        ...(briefing ? { briefing: analysisService.briefing(room, perspective, sinceRevision) } : {}) };
    }));
  server.registerTool('muju_analyze', { description: 'Read-only, revision-specific batched analysis: economy, units, matchups, spawn, reach, mobility, threats, opportunities, exchange, checkmate, survival, reply. Supply player as perspective, targets (unitIds/squares/regions/defenders), and optional hypotheticalActions in the play schema. Threats project the defender’s opponent through an engine handoff; no future attacker income. deep:true enables bounded legal combinations. Named targets/full detail return play-schema witnesses and post-attack exposure. No witness is not safety: read proof, scope, search cutoff and omitted cases. Survival on empty squares uses independent structural catalogue defenders. Replies optimize one declared objective; best-found is not minimax. Work is shared across topics/targets, at most 20,000 nodes/750ms; split large requests when truncated. Analysis does not pause clocks or commit moves.',
    inputSchema: analysisSchema.shape, annotations: readOnly }, (input, extra) => safely(async () =>
      analysisService.analyze(await backend.get(input.roomId), input, extra.signal)));
  server.registerTool('muju_clock', { description: 'Read current revision, turn owner, result, time control, both clocks and fresh clockPressure. Public; no token. Clock timestamps are server Unix milliseconds. At serverNowMs, deadlineAtMs − serverNowMs is total delay plus bank left. Subtract locally elapsed time and leave a network margin. ClockPressure includes completed-turn counts, elapsed/bank-spend totals/means and its sampling window. Bank spend is averaged per turn after delay; active and terminal turns are excluded. Projection means if historical pace continues, not game turns left; no samples/zero drain yield null, never Infinity. No delay reset from partial actions, undo, preview or reads. End with END_ACTION_PHASE. Untimed rooms return clock=null and clockPressure=null.',
    inputSchema: { roomId: roomIdSchema }, annotations: readOnly }, ({ roomId }) => safely(async () => {
      const room = await backend.get(roomId);
      return { roomId, revision: room.revision, ready: room.ready, status: room.state.phase,
        activePlayer: room.ready && room.state.phase === 'playing' ? room.state.turn.currentPlayer : null,
        winner: room.state.winner, victoryReason: room.state.victoryReason ?? null,
        timeControl: room.timeControl ?? null, clock: room.clock ?? null, clockPressure: room.clockPressure ?? null };
    }));
  server.registerTool('muju_history', { description: 'Read the persistent room score: moves with paths/AP, purchases, promotions, attack damage/captures, automatic or chosen upkeep and releases, per-unit mining/reserves, and result. Public; no token needed. Default returns the latest 50 entries in chronological order. Use before=first sequence for older pages, or after=last sequence for newer pages (after=0 reads from the start). Undone entries are omitted unless includeUndone=true. On an UNDO notification, refresh the affected turn rather than only appending. recordingStart.complete=false marks older rooms whose earlier moves are unavailable. Phase-ending commands and coaching judgments are omitted.',
    inputSchema: { roomId: roomIdSchema, ...historyQuerySchema.shape }, annotations: readOnly },
    ({ roomId, ...query }) => safely(async () => ({ ...await backend.moveHistory(roomId, query), notation: HISTORY_NOTATION })));
  server.registerTool('muju_legal_actions', { description: 'List legal actions for the current player with move costs and attack outcomes. Includes multi-action moves. Filter by unit/type and paginate. Upkeep shows one valid selection; custom affordable selections are accepted.',
    inputSchema: { roomId: roomIdSchema, unitId: z.string().max(100).optional(), type: z.enum(['MOVE', 'ATTACK', 'BUY_UNIT', 'PROMOTE_UNIT', 'PAY_UPKEEP', 'END_PLACE_PHASE', 'END_ACTION_PHASE', 'RESIGN', 'UNDO']).optional(),
      offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(200).default(60) }, annotations: readOnly },
    ({ roomId, ...options }) => safely(async () => legalActions(await backend.get(roomId), options)));
  server.registerTool('muju_preview', { description: 'Simulate an atomic sequence without committing requested moves. Returns a hypothetical board and separate liveClock, liveClockPressure and private liveStaging for the real game. Thinking and previews use your running clock; they never reserve time or reset delay. The room service still resolves due stages/expiry before a preview; re-read if that changed the revision. An expired clock returns TIME_EXPIRED with the actual terminal room. Use A1–J10 positions. Cannot cross into the opponent’s turn.',
    inputSchema: playInput, annotations: readOnly }, ({ roomId, token, ...request }) => safely(async () => {
      const { clock, clockPressure, staging, ...room } = observe(await backend.act(roomId, token, request, true));
      room.analysis.stateKind = 'afterHypothetical';
      room.analysis.hypothetical = { id: request.requestId, submittedActions: request.actions.map(describeAction),
        assumptions: ['Server preview outcome; a home-checkmate can cancel the submitted tail. Live clock is separate.'] };
      return { preview: true, actions: request.actions.map(describeAction), liveClock: clock,
        liveClockPressure: clockPressure, liveStaging: staging, room };
    }));
  server.registerTool('muju_play', { description: 'Commit one action or an atomic sequence using current revision and unique requestId. Invalid requested batches change nothing. An immediate home checkmate cancels its queued tail. END_ACTION_PHASE hands control and clock to the opponent. All phases/actions share one delay; late commands return TIME_EXPIRED without requested actions. RESIGN concedes. UNDO alone reverses your latest command this turn when canUndo is true, including automatic upkeep. The service settles due stages/expiry first, even if your request then fails. Timed play/undo includes your private staging status: partial commands leave pending work intact; handoff or result clears it. Recheck plans after live play/undo. Retry identical requests after uncertain outcomes.',
    inputSchema: playInput, annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    ({ roomId, token, ...request }) => safely(async () => observe(await backend.act(roomId, token, request))));
  server.registerTool('muju_stage', {
    description: 'Privately stage or replace your own authored batch for this full turn. Authenticated; timed active seat only. Read muju_staged for expectedStageVersion (initially 0); expectedTurnNumber binds the turn, not the board revision. Versions change on firing/cancellation too. commitWhenRemainingMs means total delay plus bank left until flag-fall: 5000 can consume almost the entire bank. A positive integer up to this turn’s starting allowance is valid; already-due triggers run now. At firing, try primary actions then up to three fallback batches in order, atomically against the current board, allowing intervening live play/undo. Never appends END_ACTION_PHASE. All illegal consumes the stage without moves; clock keeps running. Due stages settle before replacements and expiry wins at the deadline. Persists independently of MCP; retry identical requestId/body. Returns immutable acknowledgement plus fresh private status/receipt; it may have fired already. Staging reduces flag risk but cannot guarantee against it.',
    inputSchema: { ...credentials, ...stageRequestSchema.shape, actions: z.array(agentAction).min(1).max(32),
      fallbacks: z.array(z.array(agentAction).min(1).max(32)).max(3).default([]) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ roomId, token, ...request }) => safely(() => backend.stage(roomId, token, request)));
  server.registerTool('muju_cancel_stage', {
    description: 'Cancel your pending stage using its current expectedStageVersion and expectedTurnNumber. Retry the identical requestId/body after a lost response. A due stage resolves first; stale cancellation returns STAGE_VERSION_CONFLICT and cannot undo executed moves. Read muju_staged for the outcome. Pending updates do not change public board revisions.',
    inputSchema: { ...credentials, ...cancelStageSchema.shape },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ roomId, token, ...request }) => safely(() => backend.cancelStage(roomId, token, request)));
  server.registerTool('muju_staged', {
    description: 'Read only your seat’s private staging version, pending actions/fallback order/trigger and latest receipt, plus fresh clock pressure. Optional stageId retrieves a durable older receipt. No opponent plans are exposed. Check after live play/undo: pending actions may now be illegal. Executed receipts are historical facts even if the command is later undone.',
    inputSchema: { ...credentials, stageId: stageIdSchema.optional() }, annotations: readOnly,
  }, ({ roomId, token, stageId }) => safely(() => backend.staged(roomId, token, stageId)));
  server.registerTool('muju_wait_for_change', { description: 'Wait up to 25 seconds for a public revision change (join, live/staged play, undo or result). Never wait on your running turn. Changed results include events (revision, player, actions), eventsComplete and the new room. Act only when room.activePlayer is your seat. Timeout has actions=[] and result={winner,reason:timeout}. Ordinary ticks and private staging changes/failures do not change revision or wake public waits; use muju_staged for private outcomes. Unchanged results contain changed=false, revision and phase, plus fresh clock and clockPressure for timed rooms. Keep your board and wait again only if the opponent remains active. Stop at victory.',
    inputSchema: { roomId: roomIdSchema, afterRevision: z.number().int().nonnegative(), timeoutMs: z.number().int().min(0).max(25000).default(25000), ...briefingInput }, annotations: readOnly },
    ({ roomId, afterRevision, timeoutMs, briefing, player, sinceRevision }, extra) => safely(async () => {
      const change = await backend.wait(roomId, afterRevision, timeoutMs, extra.signal);
      if (!change.changed) return change;
      const events = change.room.history.filter(event => event.revision > afterRevision);
      return { ...change,
        events: events.map(event => ({ ...event, actions: event.actions.map(describeAction) })),
        eventsComplete: change.room.history.length < 100 || afterRevision >= change.room.history[0].revision - 1,
        room: { ...observe(change.room, player), ...(briefing ? { briefing: analysisService.briefing(change.room,
          player ?? change.room.state.turn.currentPlayer, sinceRevision) } : {}) },
      };
    }));
  return server;
}
