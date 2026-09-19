import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type RoomBackend } from './mcp';
import type { RoomAdmission, RoomChange, RoomSnapshot } from '../src/online/types';
import type { RoomMoveHistory } from '../src/game/moveHistory';
import { RoomError } from './schema';
import type { StagingResult, StagingStatus } from '../src/online/staging';
import { matchScopeSchema } from './matchScope';

const serverUrl = (process.env.MUJU_SERVER_URL ?? 'http://localhost:3003').replace(/\/$/, '');
async function request<T>(path: string, body?: unknown, token?: string, signal?: AbortSignal, timeoutMs = 10000): Promise<T> {
  const response = await fetch(`${serverUrl}/api/muju/rooms${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  const data = await response.json();
  if (!response.ok) throw new RoomError(response.status, data.code ?? String(response.status), data.error ?? 'Request failed', data.room);
  return data as T;
}
const backend: RoomBackend = {
  create: input => request<RoomAdmission>('', input),
  join: (id, input) => request<RoomAdmission>(`/${id}/join`, input),
  get: (id, token) => request<RoomSnapshot>(`/${id}`, undefined, token),
  moveHistory: (id, query = {}) => request<RoomMoveHistory>(`/${id}/history?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`),
  wait: (id, afterRevision, timeoutMs, signal) => request<RoomChange>(`/${id}/changes?afterRevision=${afterRevision}&timeoutMs=${timeoutMs}`, undefined, undefined, signal, 30000),
  act: (id, token, input, preview) => request<RoomSnapshot>(`/${id}/${preview ? 'preview' : 'actions'}`, input, token),
  stage: (id, token, input) => request<StagingResult>(`/${id}/stage`, input, token),
  cancelStage: (id, token, input) => request<StagingResult>(`/${id}/stage/cancel`, input, token),
  staged: (id, token, stageId) => request<StagingStatus>(`/${id}/stage${stageId ? `?stageId=${encodeURIComponent(stageId)}` : ''}`, undefined, token),
};
// Learn the endpoint's instance-local capability boundary rather than exposing
// ordinary-room tools through the local MCP bridge. The HTTP boundary remains
// authoritative even if a client skips this discovery and sends raw requests.
const healthResponse = await fetch(`${serverUrl}/api/muju/health`, { signal: AbortSignal.timeout(10000) });
if (!healthResponse.ok) throw new Error('Cannot verify Muju endpoint capabilities.');
const health = await healthResponse.json();
const scope = health.matchScope === undefined ? undefined : matchScopeSchema.parse(health.matchScope);
if (process.env.MUJU_MATCH_ROOM_ID !== undefined && process.env.MUJU_MATCH_ROOM_ID !== scope?.roomId) {
  throw new Error("Requested match room is not the endpoint's restricted service scope.");
}
await createMcpServer(backend, serverUrl, scope).connect(new StdioServerTransport());
