import type { MatchPolicy, RoomSnapshot } from '../src/online/types';
import type { RoomBackend } from './mcp';
import { RoomError, roomIdSchema, matchPolicySchema } from './schema';
import { z } from 'zod';
import { allowsMatchCapability } from './matchPolicy';

/** An instance-local capability boundary, pinned from an operator-prepared room.
 * No per-request header/argument can select a different scope or relax its tier. */
export interface MatchScope { readonly roomId: string; readonly matchPolicy: Readonly<MatchPolicy> }
export const matchScopeSchema = z.object({ roomId: roomIdSchema, matchPolicy: matchPolicySchema }).strict();
export function matchScopeFor(room: RoomSnapshot): MatchScope {
  roomIdSchema.parse(room.id);
  if (!room.ready || room.archivedAt || room.state.phase !== 'playing' || !room.matchPolicy || room.matchPolicy.version !== 1) {
    throw new Error('Match service requires an admitted, active room with an explicit v1 matchPolicy.');
  }
  const parsed = matchScopeSchema.parse({ roomId: room.id, matchPolicy: room.matchPolicy });
  return Object.freeze({ roomId: parsed.roomId, matchPolicy: Object.freeze(parsed.matchPolicy) });
}
const forbidden = () => new RoomError(403, 'MATCH_SERVICE_RESTRICTED', 'This match service exposes only its configured room and permitted play tools.');
export function assertScopeId(scope: MatchScope, roomId: string): void {
  if (roomId !== scope.roomId) throw forbidden();
}
export function assertScopeRoom(scope: MatchScope, room: RoomSnapshot): void {
  assertScopeId(scope, room.id);
  if (!room.matchPolicy || room.matchPolicy.version !== scope.matchPolicy.version ||
    room.matchPolicy.toolTier !== scope.matchPolicy.toolTier || room.matchPolicy.protocolId !== scope.matchPolicy.protocolId) {
    throw new RoomError(403, 'MATCH_SERVICE_POLICY_CHANGED', 'Configured match policy is missing or differs from the pinned service policy.');
  }
}
const publicTools = new Set(['muju_rules', 'muju_time_awareness', 'muju_observe', 'muju_clock', 'muju_history', 'muju_play', 'muju_wait_for_change']);
const oracleTools = new Set(['muju_legal_actions', 'muju_preview', 'muju_stage', 'muju_cancel_stage', 'muju_staged']);
export function matchToolAllowed(name: string, scope?: MatchScope): boolean {
  if (!scope) return true;
  if (publicTools.has(name)) return true;
  if (oracleTools.has(name)) return allowsMatchCapability(scope, 'rules-oracle');
  return name === 'muju_analyze' && allowsMatchCapability(scope, 'analysis');
}
export function matchHttpAllowed(method: string, path: string, scope: MatchScope): boolean {
  if (method === 'GET' && path === '/api/muju/health') return true;
  if (method === 'POST' && path === '/mcp') return true;
  const base = `/api/muju/rooms/${scope.roomId}`;
  if (method === 'GET') {
    if ([base, `${base}/history`, `${base}/changes`].includes(path)) return true;
    if (path.startsWith(`${base}/positions/`) && /^\d+$/.test(path.slice(`${base}/positions/`.length))) return true;
    return path === `${base}/stage` && allowsMatchCapability(scope, 'rules-oracle');
  }
  if (method === 'POST') {
    if (path === `${base}/actions`) return true;
    return [`${base}/preview`, `${base}/stage`, `${base}/stage/cancel`].includes(path) && allowsMatchCapability(scope, 'rules-oracle');
  }
  return false;
}
export function scopeBackend(backend: RoomBackend, scope: MatchScope): RoomBackend {
  const get: RoomBackend['get'] = async (id, token) => {
    assertScopeId(scope, id);
    const room = await backend.get(id, token); assertScopeRoom(scope, room); return room;
  };
  return {
    create: () => { throw forbidden(); }, join: () => { throw forbidden(); }, get,
    moveHistory: async (id, query) => { await get(id); return backend.moveHistory(id, query); },
    wait: async (id, revision, timeout, signal) => {
      await get(id); const change = await backend.wait(id, revision, timeout, signal);
      if (change.changed) assertScopeRoom(scope, change.room); return change;
    },
    act: async (id, token, input, preview) => {
      await get(id, token); const room = await backend.act(id, token, input, preview); assertScopeRoom(scope, room); return room;
    },
    stage: async (id, token, input) => { await get(id, token); return backend.stage(id, token, input); },
    cancelStage: async (id, token, input) => { await get(id, token); return backend.cancelStage(id, token, input); },
    staged: async (id, token, stageId) => { await get(id, token); return backend.staged(id, token, stageId); },
  };
}
