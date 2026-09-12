import { useEffect, useMemo, useState } from 'react';
import type { GameConfig, PlayerId } from '../game/types';
import { GameView } from '../components/GameScreen';
import { createRoom, invitationUrl, joinRoom, loadConnection, normalizeServer, readRoom, saveConnection } from './client';
import type { RoomAdmission, RoomConnection, RoomSnapshot } from './types';
import { useOnlineGame } from './useOnlineGame';

const defaultServer = () => new URLSearchParams(window.location.search).get('server') || import.meta.env.VITE_MUJU_SERVER_URL || window.location.origin;
interface Session { connection: RoomConnection; room: RoomSnapshot; inviteCode?: string }

export function OnlineLobby({ onBack }: { onBack: () => void }) {
  const [server, setServer] = useState(defaultServer);
  const [name, setName] = useState('Player');
  const [side, setSide] = useState<PlayerId>('white');
  const [invitation, setInvitation] = useState(() => new URLSearchParams(window.location.search).has('room') ? window.location.href : '');
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function enter(connection: RoomConnection, room: RoomSnapshot, inviteCode?: string) {
    try { saveConnection(connection, inviteCode); }
    catch { setNotice('This browser could not save your seat. Copy the private reconnect details before leaving.'); }
    window.history.replaceState(null, '', `${window.location.pathname}?room=${room.id}&server=${encodeURIComponent(connection.serverUrl)}`);
    setSession({ connection, room, inviteCode });
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('room');
    if (!id) return;
    const stored = loadConnection(defaultServer(), id);
    if (!stored) return;
    let cancelled = false;
    setBusy(true);
    readRoom(stored).then(room => { if (!cancelled) enter(stored, room, stored.inviteCode); })
      .catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);
  async function submit(kind: 'create' | 'join') {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      let url = normalizeServer(server), result: RoomAdmission;
      if (kind === 'create') result = await createRoom(url, name, side);
      else {
        const invite = new URL(invitation.trim());
        url = normalizeServer(invite.origin);
        const roomId = new URLSearchParams(invite.search).get('room');
        const inviteCode = new URLSearchParams(invite.hash.slice(1)).get('invite');
        if (!roomId || !/^[a-f0-9]{32}$/.test(roomId)) throw new Error('Paste the complete invitation link.');
        const stored = loadConnection(url, roomId);
        if (stored) { enter(stored, await readRoom(stored), stored.inviteCode); return; }
        if (!inviteCode) throw new Error('This link has no invitation. Ask the host for their invitation link, or use this browser’s saved seat.');
        result = await joinRoom(url, roomId, name, inviteCode);
      }
      enter({ ...result.credentials, serverUrl: url }, result.room, result.inviteCode);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not connect to the game.'); }
    finally { setBusy(false); }
  }
  if (session) return <OnlineMatch session={session} notice={notice} onLeave={() => {
    window.history.replaceState(null, '', window.location.pathname); setSession(null);
  }} />;
  return <main className="online-lobby">
    <button onClick={onBack}>← Game modes</button>
    <h1>Muju Hono Tanka</h1><h2>Play together, anywhere</h2>
    <p>Host a room and invite a friend or an LLM. Both players use the same board, on their own devices.</p>
    <label>Your name<input value={name} maxLength={40} onChange={e => setName(e.target.value)} /></label>
    <section aria-label="Host a game"><h3>Host a game</h3>
      <label>Multiplayer server<input type="url" value={server} onChange={e => setServer(e.target.value)} placeholder="https://your-muju-server.example" /></label>
      <p className="online-help">Use the address shared by the person running your game server.</p>
      <label>Your side<select value={side} onChange={e => setSide(e.target.value as PlayerId)}><option value="white">White · first turn</option><option value="black">Black · second turn</option></select></label>
      <p className="online-help">4 shared actions per turn · Draw after 10 consecutive turns without a kill.</p>
      <button className="primary" disabled={busy || !name.trim()} onClick={() => void submit('create')}>Create room</button>
    </section>
    <section aria-label="Join a game"><h3>Join a game</h3>
      <label>Invitation link<input type="url" value={invitation} onChange={e => setInvitation(e.target.value)} placeholder="Paste your opponent’s invitation" /></label>
      <button disabled={busy || !name.trim() || !invitation.trim()} onClick={() => void submit('join')}>Join room</button>
    </section>
    {busy && <p role="status">Connecting…</p>}{error && <p role="alert">{error}</p>}
    <p className="online-help">Playing with an LLM? Share the <a href="./skills/muju-hono-tanka/SKILL.md" target="_blank" rel="noopener noreferrer">agent skill file</a> for connection and play instructions. A room can pair any two humans or agents.</p>
  </main>;
}

function OnlineMatch({ session, notice, onLeave }: { session: Session; notice: string | null; onLeave: () => void }) {
  const { connection, room: initial, inviteCode } = session;
  const { game, room, busy, connected, error, retry } = useOnlineGame(connection, initial, onLeave);
  const [copied, setCopied] = useState(false);
  const config = useMemo<GameConfig>(() => ({ mode: 'online', controls: {
    white: connection.player === 'white' ? 'human' : 'remote', black: connection.player === 'black' ? 'human' : 'remote',
  }, aiDifficulty: { white: 'medium', black: 'medium' } }), [connection.player]);
  const link = inviteCode ? invitationUrl(connection.serverUrl, room.id, inviteCode) : '';
  const banner = <section className="online-banner" aria-label="Online room">
    <strong>Online · You are {connection.player}</strong>
    <span role="status">{!connected ? 'Reconnecting…' : !room.ready ? 'Waiting for opponent' : busy ? 'Confirming move…' : 'Room connected'}</span>
    {!room.ready && link && <><label>Invite your opponent<input readOnly value={link} onFocus={e => e.target.select()} /></label>
      <button onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Copied' : 'Copy invitation'}</button></>}
    {error && <p role="alert">{error}{retry && <button onClick={retry}>Retry same move</button>}</p>}
    {notice && <p role="alert">{notice}</p>}
    <details><summary>Private reconnect details</summary><p>Keep these private. The seat token lets someone play as you.</p>
      <textarea aria-label="Private seat credentials" readOnly value={JSON.stringify(connection, null, 2)} />
      <p>Reopen this room in this browser to resume, or give these credentials to your own MCP agent.</p>
    </details>
  </section>;
  return <GameView game={game} config={config} onBackToMenu={onLeave} online={{ player: connection.player, ready: room.ready, busy,
    names: { white: room.seats.white ?? 'Waiting for White', black: room.seats.black ?? 'Waiting for Black' }, banner }} />;
}
