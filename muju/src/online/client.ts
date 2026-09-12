import type { ActionRequest, ActiveRoom, ObserverConnection, OnlineConnection, RoomAdmission, RoomChange, RoomConnection, RoomSnapshot } from './types';
import type { PlayerId } from '../game/types';
import type { TimeControl, TimeControlPreset } from './timeControl';

export function normalizeServer(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an http or https server URL.');
  return url.origin;
}
const roomIdPattern = /^[a-f0-9]{32}$/;
const unwrapLink = (value: string) => value.trim().match(/^\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/)?.[1] ?? value.trim();

/** Accept the private JSON object exported by either the browser or MCP. */
export function parseSeatCredentials(input: string, fallbackServer: string): RoomConnection & { inviteCode?: string } {
  let parsed;
  try { parsed = JSON.parse(input.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')); }
  catch { throw new Error('Paste the credentials JSON, including its opening and closing braces.'); }
  const value = parsed?.credentials ?? parsed;
  if (!value || typeof value !== 'object' || typeof value.roomId !== 'string' || !roomIdPattern.test(value.roomId)
    || !['white', 'black'].includes(value.player) || typeof value.token !== 'string' || !/^[^\s]{32,128}$/.test(value.token)) {
    throw new Error('Credentials must include a valid roomId, player (white or black), and private token.');
  }
  const server = value.serverUrl ?? parsed.serverUrl ?? parsed.invitation?.serverUrl ?? fallbackServer;
  if (typeof server !== 'string') throw new Error('Credentials must include a valid serverUrl.');
  const inviteCode = value.inviteCode ?? parsed.invitation?.inviteCode;
  return { roomId: value.roomId, player: value.player, token: value.token,
    serverUrl: normalizeServer(unwrapLink(server)),
    ...(typeof inviteCode === 'string' && /^[a-f0-9]{64}$/.test(inviteCode) ? { inviteCode } : {}) };
}

export function parseObserverConnection(input: string, fallbackServer: string): ObserverConnection {
  const value = unwrapLink(input);
  if (roomIdPattern.test(value)) return { roomId: value, serverUrl: normalizeServer(fallbackServer) };
  let link;
  try { link = new URL(value); }
  catch { throw new Error('Paste a watch link, room link, or room ID.'); }
  const roomId = link.searchParams.get('room');
  if (!roomId || !roomIdPattern.test(roomId)) throw new Error('This link is missing a valid room ID.');
  return { roomId, serverUrl: normalizeServer(link.searchParams.get('server') || link.origin) };
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
export const createRoom = (serverUrl: string, name: string, side: PlayerId, actionsPerTurn: import('../game/types').ActionsPerTurn = 4, timeControl?: TimeControl | TimeControlPreset | null) => roomRequest<RoomAdmission>(serverUrl, '', { name, side, actionsPerTurn, timeControl });
export const listActiveRooms = (serverUrl: string, signal?: AbortSignal) => roomRequest<{ rooms: ActiveRoom[] }>(serverUrl, '', undefined, undefined, signal);
export const joinRoom = (serverUrl: string, roomId: string, name: string, inviteCode: string) => roomRequest<RoomAdmission>(serverUrl, `/${roomId}/join`, { name, inviteCode });
export const restoreSeat = (c: RoomConnection) => roomRequest<RoomSnapshot>(c.serverUrl, `/${c.roomId}/restore`, { player: c.player }, c.token);
export const readRoom = (c: OnlineConnection, signal?: AbortSignal) => roomRequest<RoomSnapshot>(c.serverUrl, `/${c.roomId}`, undefined, c.token, signal);
export const waitRoom = (c: OnlineConnection, afterRevision: number, signal?: AbortSignal) =>
  roomRequest<RoomChange>(c.serverUrl, `/${c.roomId}/changes?afterRevision=${afterRevision}&timeoutMs=25000`, undefined, c.token, signal, 30000);
export const playRoom = (c: RoomConnection, request: ActionRequest) => roomRequest<RoomSnapshot>(c.serverUrl, `/${c.roomId}/actions`, request, c.token);

const storageKey = (server: string, room: string) => `muju:online:${normalizeServer(server)}:${room}`;
export function saveConnection(connection: RoomConnection, inviteCode?: string) {
  // Seat secrets never appear in URLs. Storage is separate from local-game saves.
  localStorage.setItem(storageKey(connection.serverUrl, connection.roomId), JSON.stringify({ ...connection, inviteCode }));
}
export function loadConnection(server: string, room: string): (RoomConnection & { inviteCode?: string }) | null {
  try {
    const connection = parseSeatCredentials(localStorage.getItem(storageKey(server, room)) ?? 'null', server);
    return connection.roomId === room && connection.serverUrl === normalizeServer(server) ? connection : null;
  }
  catch { return null; }
}
export function observerUrl(serverUrl: string, roomId: string) {
  return `${normalizeServer(serverUrl)}/muju/?room=${roomId}&watch=1`;
}
export function invitationUrl(serverUrl: string, roomId: string, inviteCode: string) {
  return `${normalizeServer(serverUrl)}/muju/?room=${roomId}#invite=${inviteCode}`;
}
