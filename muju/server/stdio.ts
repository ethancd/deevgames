import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type RoomBackend } from './mcp';
import type { RoomAdmission, RoomChange, RoomSnapshot } from '../src/online/types';

const serverUrl = (process.env.MUJU_SERVER_URL ?? 'http://localhost:3003').replace(/\/$/, '');
async function request<T>(path: string, body?: unknown, token?: string, signal?: AbortSignal, timeoutMs = 10000): Promise<T> {
  const response = await fetch(`${serverUrl}/api/muju/rooms${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${data.code ?? response.status}: ${data.error ?? 'Request failed'}`);
  return data as T;
}
const backend: RoomBackend = {
  create: input => request<RoomAdmission>('', input),
  join: (id, input) => request<RoomAdmission>(`/${id}/join`, input),
  get: (id, token) => request<RoomSnapshot>(`/${id}`, undefined, token),
  wait: (id, afterRevision, timeoutMs, signal) => request<RoomChange>(`/${id}/changes?afterRevision=${afterRevision}&timeoutMs=${timeoutMs}`, undefined, undefined, signal, 30000),
  act: (id, token, input, preview) => request<RoomSnapshot>(`/${id}/${preview ? 'preview' : 'actions'}`, input, token),
};
await createMcpServer(backend, serverUrl).connect(new StdioServerTransport());
