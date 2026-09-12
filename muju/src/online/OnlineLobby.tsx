import { useEffect, useMemo, useState } from 'react';
import { MusicButton } from '../music/MusicPlayer';
import type { GameConfig, PlayerId } from '../game/types';
import { GameView } from '../components/GameScreen';
import { createRoom, invitationUrl, joinRoom, loadConnection, normalizeServer, observerUrl, parseObserverConnection, parseSeatCredentials, readRoom, restoreSeat, saveConnection } from './client';
import type { OnlineConnection, RoomAdmission, RoomSnapshot } from './types';
import { useOnlineGame } from './useOnlineGame';
import { RoomHistory } from './RoomHistory';
import { RoomClocks } from './RoomClocks';
import { TIME_CONTROL_PRESETS, type TimeControlPreset } from './timeControl';
import { ActiveGames } from './ActiveGames';

const defaultServer = () => new URLSearchParams(window.location.search).get('server') || import.meta.env.VITE_MUJU_SERVER_URL || window.location.origin;
interface Session { connection: OnlineConnection; room: RoomSnapshot; inviteCode?: string }

export function OnlineLobby({ onBack }: { onBack: () => void }) {
  const [server, setServer] = useState(defaultServer);
  const [name, setName] = useState('Player');
  const [side, setSide] = useState<PlayerId>('white');
  const [timeChoice, setTimeChoice] = useState<TimeControlPreset | 'untimed' | 'custom'>('untimed');
  const [delaySeconds, setDelaySeconds] = useState('30');
  const [bankMinutes, setBankMinutes] = useState('10');
  const [invitation, setInvitation] = useState(() => new URLSearchParams(window.location.search).has('room') ? window.location.href : '');
  const [credentials, setCredentials] = useState('');
  const [watchLink, setWatchLink] = useState(() => new URLSearchParams(window.location.search).has('room') ? window.location.href : '');
  const [flow, setFlow] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function enter(connection: OnlineConnection, room: RoomSnapshot, inviteCode?: string) {
    try { if (connection.player) saveConnection(connection, inviteCode); }
    catch { setNotice('This browser could not save your seat. Copy the private reconnect details before leaving.'); }
    window.history.replaceState(null, '', `${window.location.pathname}?room=${room.id}&server=${encodeURIComponent(connection.serverUrl)}${connection.player ? '' : '&watch=1'}`);
    setCredentials('');
    setServer(connection.serverUrl);
    setSession({ connection, room, inviteCode });
  }
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const id = query.get('room');
    if (!id) return;
    const watching = query.get('watch') === '1';
    const stored: (OnlineConnection & { inviteCode?: string }) | null = watching ? { roomId: id, serverUrl: defaultServer() } : loadConnection(defaultServer(), id);
    if (!stored) return;
    let cancelled = false;
    setBusy(true); setFlow(watching ? 'watch' : 'join');
    const request = Promise.resolve().then(() => stored.player ? restoreSeat(stored) : readRoom(parseObserverConnection(window.location.href, defaultServer())));
    request.then(room => { if (!cancelled) enter({ ...stored, serverUrl: normalizeServer(stored.serverUrl) }, room, stored.inviteCode); })
      .catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);
  async function submit(kind: 'create' | 'join' | 'restore' | 'watch' | 'browse', roomId?: string) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null); setFlow(kind);
    try {
      if (kind === 'restore') {
        const connection = parseSeatCredentials(credentials, server);
        enter(connection, await restoreSeat(connection), connection.inviteCode);
        return;
      }
      if (kind === 'watch' || kind === 'browse') {
        const connection = parseObserverConnection(roomId ?? watchLink, server);
        enter(connection, await readRoom(connection));
        return;
      }
      let url = normalizeServer(server), result: RoomAdmission;
      if (kind === 'create') {
        const custom = { delaySeconds: Number(delaySeconds), bankSeconds: Math.round(Number(bankMinutes) * 60) };
        if (timeChoice === 'custom' && (!delaySeconds.trim() || !bankMinutes.trim() || !Number.isInteger(custom.delaySeconds)
          || custom.delaySeconds < 0 || custom.delaySeconds > 600 || !Number.isFinite(custom.bankSeconds) || custom.bankSeconds < 1 || custom.bankSeconds > 14400)) {
          throw new Error('Use 0–600 whole seconds per turn and a bank of 1 second to 240 minutes per player.');
        }
        result = await createRoom(url, name, side, 4, timeChoice === 'untimed' ? null : timeChoice === 'custom' ? custom : timeChoice);
      }
      else {
        const invite = new URL(invitation.trim());
        url = normalizeServer(invite.origin);
        const roomId = new URLSearchParams(invite.search).get('room');
        const inviteCode = new URLSearchParams(invite.hash.slice(1)).get('invite');
        if (!roomId || !/^[a-f0-9]{32}$/.test(roomId)) throw new Error('Paste the complete invitation link.');
        const stored = loadConnection(url, roomId);
        if (stored) { enter(stored, await restoreSeat(stored), stored.inviteCode); return; }
        if (!inviteCode) throw new Error('This link has no invitation. Ask the host for their invitation link, or use this browser’s saved seat.');
        result = await joinRoom(url, roomId, name, inviteCode);
      }
      enter({ ...result.credentials, serverUrl: url }, result.room, result.inviteCode);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not connect to the game.'); }
    finally { setBusy(false); }
  }
  if (session) return <OnlineMatch session={session} notice={notice} onLeave={() => {
    window.history.replaceState(null, '', `${window.location.pathname}?online=1&server=${encodeURIComponent(session.connection.serverUrl)}`);
    setSession(null); setNotice(null); setError(null);
  }} />;
  const feedback = (kind: string) => flow === kind && <>{busy && <p role="status">Connecting…</p>}{error && <p role="alert">{error}</p>}</>;
  return <main className="online-lobby">
    <div className="music-lobby-nav"><button onClick={onBack}>← Game modes</button><MusicButton /></div>
    <h1>Muju Hono Tanka</h1><h2>Play or watch together</h2>
    <section aria-label="Active games">
      <ActiveGames key={server} server={server} busy={busy} onWatch={id => void submit('browse', id)} />
      {feedback('browse')}
    </section>
    <details><summary>Multiplayer server settings</summary>
      <label>Multiplayer server<input type="url" value={server} onChange={e => setServer(e.target.value)} placeholder="https://your-muju-server.example" /></label>
      <p className="online-help">Browse and host games on this server.</p>
    </details>
    <p>Host a room and invite a friend or an LLM. Active rooms are listed above for anyone to watch.</p>
    <label>Your name<input value={name} maxLength={40} onChange={e => setName(e.target.value)} /></label>
    <section aria-label="Host a game"><h3>Host a game</h3>
      <label>Your side<select value={side} onChange={e => setSide(e.target.value as PlayerId)}><option value="white">White · first turn</option><option value="black">Black · second turn</option></select></label>
      <p className="online-help">4 shared actions per turn · Draw after 10 consecutive turns without a kill.</p>
      <label>Time control<select value={timeChoice} onChange={e => setTimeChoice(e.target.value as typeof timeChoice)}>
        <option value="untimed">Untimed</option>
        {Object.entries(TIME_CONTROL_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label} · {preset.delaySeconds}s / {preset.bankSeconds / 60}min · {preset.duration}</option>)}
        <option value="custom">Custom</option>
      </select></label>
      {timeChoice === 'custom' && <div className="clock-custom">
        <label>Free seconds per turn<input type="number" min="0" max="600" step="1" value={delaySeconds} onChange={e => setDelaySeconds(e.target.value)} /></label>
        <label>Bank per player (minutes)<input type="number" min={1 / 60} max="240" step="any" value={bankMinutes} onChange={e => setBankMinutes(e.target.value)} /></label>
      </div>}
      {timeChoice !== 'untimed' && <p className="online-help">Each player has their own bank. A fresh free allowance covers the whole turn, then their bank counts down. Unused allowance does not accumulate. Running out loses. Starts when your opponent joins; fixed once created. Preset durations are approximate.</p>}
      <button className="primary" disabled={busy || !name.trim()} onClick={() => void submit('create')}>Create room</button>
      {feedback('create')}
    </section>
    <section aria-label="Join a game"><h3>Join a game</h3>
      <label>Invitation link<input type="url" value={invitation} onChange={e => setInvitation(e.target.value)} placeholder="Paste your opponent’s invitation" /></label>
      <button disabled={busy || !name.trim() || !invitation.trim()} onClick={() => void submit('join')}>Join room</button>
      {feedback('join')}
    </section>
    <section aria-label="Restore a seat"><h3>Restore a seat</h3>
      <p>Continue your computer’s game on this device. Paste the private credentials from your room’s reconnect details or your MCP agent.</p>
      <label>Seat credentials<textarea aria-label="Seat credentials" value={credentials} onChange={e => setCredentials(e.target.value)} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="Paste credentials JSON" /></label>
      <p className="online-help">This restores your existing side, even in a full room. Keep the token private: it grants control of your seat.</p>
      <button disabled={busy || !credentials.trim()} onClick={() => void submit('restore')}>Restore seat</button>
      {feedback('restore')}
    </section>
    <section aria-label="Watch a game"><h3>Watch a game</h3>
      <p>Watch two friends or LLMs play live. Any number of observers can follow a room without taking a seat.</p>
      <label>Watch link or room ID<input value={watchLink} onChange={e => setWatchLink(e.target.value)} placeholder="Paste a room’s watch link" /></label>
      <button disabled={busy || !watchLink.trim()} onClick={() => void submit('watch')}>Watch game</button>
      {feedback('watch')}
    </section>
    <p className="online-help">Playing with an LLM? Share the <a href="./skills/muju-hono-tanka/SKILL.md" target="_blank" rel="noopener noreferrer">agent skill file</a> for connection and play instructions. A room can pair any two humans or agents.</p>
  </main>;
}

function OnlineMatch({ session, notice, onLeave }: { session: Session; notice: string | null; onLeave: () => void }) {
  const { connection, room: initial, inviteCode } = session;
  const { game, room, busy, connected, error, retry } = useOnlineGame(connection, initial, onLeave);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const config = useMemo<GameConfig>(() => ({ mode: 'online', controls: {
    white: connection.player === 'white' ? 'human' : 'remote', black: connection.player === 'black' ? 'human' : 'remote',
  }, aiDifficulty: { white: 'medium', black: 'medium' } }), [connection.player]);
  const link = inviteCode ? invitationUrl(connection.serverUrl, room.id, inviteCode) : '';
  const watchUrl = observerUrl(connection.serverUrl, room.id);
  const [copyStatus, setCopyStatus] = useState('');
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopyStatus(`${label} copied`); }
    catch { setCopyStatus('Select and copy the text above.'); }
  }
  const privateCredentials = connection.player ? JSON.stringify({ ...connection, ...(inviteCode ? { inviteCode } : {}) }, null, 2) : '';
  const banner = <section className="online-banner" aria-label="Online room">
    <strong>{connection.player ? `Online · You are ${connection.player}` : 'Online · Observer'}</strong>
    <span role="status">{!connected ? 'Reconnecting…' : !room.ready ? 'Waiting for opponent' : busy ? 'Confirming move…' : connection.player ? 'Room connected' : 'Watching live · Read only'}</span>
    <RoomClocks room={room} />
    {!room.ready && link && <><label>Invite your opponent<input readOnly value={link} onFocus={e => e.target.select()} /></label>
      <button onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Copied' : 'Copy invitation'}</button></>}
    {error && <p role="alert">{error}{retry && <button onClick={retry}>Retry same move</button>}</p>}
    {notice && <p role="alert">{notice}</p>}
    <details><summary>Share watch link</summary>
      <label>Observer link<input readOnly value={watchUrl} onFocus={e => e.target.select()} /></label>
      <button onClick={() => void copy(watchUrl, 'Watch link')}>Copy watch link</button>
      <p>Anyone with this link can watch. It grants no control of either seat.</p>
    </details>
    {connection.player && <details><summary>Private reconnect details</summary><p>Keep these private. The seat token lets someone play as you.</p>
      <textarea aria-label="Private seat credentials" readOnly value={privateCredentials} onFocus={e => e.target.select()} />
      <button onClick={() => void copy(privateCredentials, 'Credentials')}>Copy credentials</button>
      <p>On another device, open Play online → Restore a seat and paste these credentials. This browser can still use the same seat.</p>
    </details>}
    {copyStatus && <p role="status">{copyStatus}</p>}
  </section>;
  const names = { white: room.seats.white ?? 'Waiting for White', black: room.seats.black ?? 'Waiting for Black' };
  return <><GameView game={game} config={config} onBackToMenu={onLeave} online={{ player: connection.player ?? null, ready: room.ready, busy,
    names, banner, historyOpen: showHistory, onToggleHistory: () => setShowHistory(value => !value) }} />
    {showHistory && <RoomHistory connection={connection} revision={room.revision} names={names} onClose={() => setShowHistory(false)} />}</>;
}
