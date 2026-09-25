import type { ActionRequest, ActiveRoom, RoomArchive, ObserverConnection, OnlineConnection, RoomAdmission, RoomChange, RoomConnection, RoomSnapshot } from './types';
import type { PlayerId } from '../game/types';
import type { TimeControl, TimeControlPreset } from './timeControl';
import { invitationCodeFromPath, invitePattern, watchCodeFromPath } from './invitations';
export { invitationUrl, observerUrl } from './invitations';

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
    ...(typeof inviteCode === 'string' && invitePattern.test(inviteCode) ? { inviteCode } : {}) };
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
export async function resolveObserverConnection(input: string, fallbackServer: string): Promise<ObserverConnection> {
  const value = unwrapLink(input);
  if (roomIdPattern.test(value)) return parseObserverConnection(value, fallbackServer);
  let link;
  try { link = new URL(value); }
  catch { throw new Error('Paste a watch link, room link, or room ID.'); }
  const code = watchCodeFromPath(link.pathname);
  if (!code) return parseObserverConnection(value, fallbackServer);
  const serverUrl = normalizeServer(link.origin);
  const { roomId } = await roomRequest<{ roomId: string }>(serverUrl, `/watch/${code}`);
  return { serverUrl, roomId };
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
/** No `ruleset` on the wire since 2026-09-21: the server creates Phasing rooms
 * and refuses an explicit `'standard'` (`server/schema.ts`). */
export const createRoom = (serverUrl: string, name: string, side: PlayerId, actionsPerTurn: import('../game/types').ActionsPerTurn = 4, timeControl?: TimeControl | TimeControlPreset | null, blackCrystalHandicap = 0, variant?: import('../game/types').Variant) =>
  roomRequest<RoomAdmission>(serverUrl, '', variant === 'micro' ? { name, side, timeControl, variant }
    : { name, side, actionsPerTurn, timeControl, ...(blackCrystalHandicap > 0 ? { blackCrystalHandicap } : {}) });
export const listActiveRooms = (serverUrl: string, signal?: AbortSignal) => roomRequest<{ rooms: ActiveRoom[] }>(serverUrl, '', undefined, undefined, signal);
export const listArchivedRooms = (serverUrl: string, before?: string, signal?: AbortSignal) => roomRequest<RoomArchive>(serverUrl, `/archived${before ? `?before=${before}` : ''}`, undefined, undefined, signal);
export const joinRoom = (serverUrl: string, roomId: string, name: string, inviteCode: string) => roomRequest<RoomAdmission>(serverUrl, `/${roomId}/join`, { name, inviteCode });
export const restoreSeat = (c: RoomConnection & { inviteCode?: string }) => roomRequest<RoomSnapshot>(c.serverUrl, `/${c.roomId}/restore`, { player: c.player, ...(c.inviteCode ? { inviteCode: c.inviteCode } : {}) }, c.token);
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
export function analysisUrl(connection: OnlineConnection, sequence?: number) {
  return `/muju/analysis?room=${connection.roomId}&server=${encodeURIComponent(connection.serverUrl)}${connection.player ? '' : '&watch=1'}${sequence === undefined ? '' : `&event=${sequence}`}`;
}
export async function resolveInvitationLink(input: string) {
  const link = new URL(unwrapLink(input));
  const serverUrl = normalizeServer(link.origin);
  const shortCode = invitationCodeFromPath(link.pathname);
  if (shortCode) {
    const { roomId } = await roomRequest<{ roomId: string }>(serverUrl, `/invitations/${shortCode}`);
    return { serverUrl, roomId, inviteCode: shortCode };
  }
  const roomId = link.searchParams.get('room');
  if (!roomId || !roomIdPattern.test(roomId)) throw new Error('Paste the complete invitation link.');
  return { serverUrl, roomId, inviteCode: new URLSearchParams(link.hash.slice(1)).get('invite') };
}
