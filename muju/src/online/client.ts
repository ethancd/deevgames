import type { ActionRequest, RoomAdmission, RoomChange, RoomConnection, RoomSnapshot } from './types';
import type { PlayerId } from '../game/types';

export function normalizeServer(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an http or https server URL.');
  return url.origin;
}
export class OnlineError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
export async function roomRequest<T>(serverUrl: string, path: string, body?: unknown, token?: string, signal?: AbortSignal, timeoutMs = 10000): Promise<T> {
  const response = await fetch(`${normalizeServer(serverUrl)}/api/muju/rooms${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('This address is not a Muju multiplayer server. Check the server URL.'); }
  if (!response.ok) throw new OnlineError(result.error ?? 'Request failed.', result.code ?? 'REQUEST_FAILED', response.status);
  return result as T;
}
export const createRoom = (serverUrl: string, name: string, side: PlayerId) => roomRequest<RoomAdmission>(serverUrl, '', { name, side });
export const joinRoom = (serverUrl: string, roomId: string, name: string, inviteCode: string) => roomRequest<RoomAdmission>(serverUrl, `/${roomId}/join`, { name, inviteCode });
export const readRoom = (c: RoomConnection, signal?: AbortSignal) => roomRequest<RoomSnapshot>(c.serverUrl, `/${c.roomId}`, undefined, c.token, signal);
export const waitRoom = (c: RoomConnection, afterRevision: number, signal?: AbortSignal) =>
  roomRequest<RoomChange>(c.serverUrl, `/${c.roomId}/changes?afterRevision=${afterRevision}&timeoutMs=25000`, undefined, c.token, signal, 30000);
export const playRoom = (c: RoomConnection, request: ActionRequest) => roomRequest<RoomSnapshot>(c.serverUrl, `/${c.roomId}/actions`, request, c.token);

const storageKey = (server: string, room: string) => `muju:online:${normalizeServer(server)}:${room}`;
export function saveConnection(connection: RoomConnection, inviteCode?: string) {
  // Seat secrets never appear in URLs. Storage is separate from local-game saves.
  localStorage.setItem(storageKey(connection.serverUrl, connection.roomId), JSON.stringify({ ...connection, inviteCode }));
}
export function loadConnection(server: string, room: string): (RoomConnection & { inviteCode?: string }) | null {
  try { return JSON.parse(localStorage.getItem(storageKey(server, room)) ?? 'null'); }
  catch { return null; }
}
export function invitationUrl(serverUrl: string, roomId: string, inviteCode: string) {
  return `${normalizeServer(serverUrl)}/muju/?room=${roomId}#invite=${inviteCode}`;
}
