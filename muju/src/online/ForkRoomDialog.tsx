import { useEffect, useRef, useState } from 'react';
import { PlayDialog } from '../components/PlayDialog';
import type { PlayerId } from '../game/types';
import { forkRoom, invitationUrl, readRoom, saveConnection } from './client';
import { TIME_CONTROL_PRESETS, type TimeControlPreset } from './timeControl';
import type { RoomAdmission, RoomSnapshot } from './types';
import './ForkRoomDialog.css';

export function ForkRoomDialog({ serverUrl, roomId, position, defaultSide = 'white', defaultName = 'Player', onClose }: {
  serverUrl: string; roomId: string; position?: { sequence: number; step: number; label: string };
  defaultSide?: PlayerId; defaultName?: string; onClose: () => void;
}) {
  const [source, setSource] = useState<RoomSnapshot | null>(null);
  const [name, setName] = useState(defaultName), [side, setSide] = useState(defaultSide);
  const [choice, setChoice] = useState<'same' | 'untimed' | 'custom' | TimeControlPreset>('same');
  const [delay, setDelay] = useState('30'), [bank, setBank] = useState('10');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const initialized = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [created, setCreated] = useState<RoomAdmission | null>(null), [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setSource(null); setError('');
    readRoom({ serverUrl, roomId }, controller.signal).then(room => {
      setSource(room);
      if (!initialized.current) {
        setDelay(String(room.timeControl?.delaySeconds ?? 30)); setBank(String((room.timeControl?.bankSeconds ?? 600) / 60));
        initialized.current = true;
      }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [serverUrl, roomId, refresh]);
  async function create() {
    if (!source || busy) return;
    const custom = { delaySeconds: Number(delay), bankSeconds: Math.round(Number(bank) * 60) };
    if (choice === 'custom' && (!delay.trim() || !bank.trim() || !Number.isInteger(custom.delaySeconds) || custom.delaySeconds < 0 || custom.delaySeconds > 600 || !Number.isFinite(custom.bankSeconds) || custom.bankSeconds < 1 || custom.bankSeconds > 14400)) {
      setError('Use 0–600 whole free seconds and a bank from 1 second to 240 minutes.'); return;
    }
    setBusy(true); setError('');
    try {
      const result = await forkRoom(serverUrl, roomId, { name, side, expectedRevision: source.revision,
        ...(position ? { sequence: position.sequence, step: position.step } : {}),
        ...(choice === 'same' ? {} : { timeControl: choice === 'untimed' ? null : choice === 'custom' ? custom : choice }) });
      setCreated(result);
      try { saveConnection({ ...result.credentials, serverUrl }, result.inviteCode); }
      catch { setSaveFailed(true); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not create the fork.'); }
    finally { setBusy(false); }
  }
  async function copyInvitation() {
    try { await navigator.clipboard.writeText(invitation); setNotice('Invitation copied.'); }
    catch { setNotice('Select and copy the invitation above.'); }
  }
  const control = source?.timeControl;
  const invitation = created ? invitationUrl(serverUrl, created.room.id, created.inviteCode!) : '';
  return <PlayDialog title="Fork game" onClose={() => { if (!busy) onClose(); }}><div className="fork-room">
    {created ? <>
      <p role="status">Fork created. You are {created.credentials.player}. Invite your opponent to start the clocks.</p>
      <label>New invitation<input readOnly value={invitation} onFocus={event => event.target.select()} /></label>
      <button onClick={() => { void copyInvitation(); }}>Copy invitation</button>
      <a className="fork-open" href={`/muju/?room=${created.room.id}&server=${encodeURIComponent(serverUrl)}`}>Open fork</a>
      {saveFailed && <p role="alert">Your fork was created, but this browser could not save your seat. Copy the private credentials below and use Restore a seat.</p>}
      <details open={saveFailed}><summary>Private seat credentials</summary><textarea aria-label="Fork seat credentials" readOnly value={JSON.stringify({ ...created.credentials, serverUrl, inviteCode: created.inviteCode }, null, 2)} onFocus={event => event.target.select()} /></details>
      {notice && <p role="status">{notice}</p>}
    </> : <form onSubmit={event => { event.preventDefault(); void create(); }}>
      <p>Create a new game from {position ? `“${position.label}”` : 'the current position'}. Both players get fresh clocks when your opponent joins.</p>
      {source && <p>{position ? 'The selected replay position keeps its turn and remaining actions.' : `Turn ${source.state.turn.turnNumber} · ${source.state.turn.currentPlayer} to move · ${source.state.turn.actionsRemaining} actions remaining.`}
        {!position && (source.state.victoryReason === 'timeout' || source.state.victoryReason === 'abandoned') && ' Resume the interrupted turn before the game ended.'}</p>}
      <fieldset disabled={!source || busy}>
      <label>Your name<input value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
      <label>Your side<select value={side} onChange={event => setSide(event.target.value as PlayerId)}><option value="white">White</option><option value="black">Black</option></select></label>
      <label>Time control<select value={choice} onChange={event => setChoice(event.target.value as typeof choice)}>
        <option value="same">Same control · {control ? `${control.delaySeconds}s / ${control.bankSeconds / 60}min` : 'untimed'}</option>
        <option value="untimed">Untimed</option>
        {Object.entries(TIME_CONTROL_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label} · {preset.delaySeconds}s / {preset.bankSeconds / 60}min</option>)}
        <option value="custom">Custom</option>
      </select></label>
      {choice === 'custom' && <div className="clock-custom">
        <label>Free seconds per turn<input type="number" min="0" max="600" step="1" required value={delay} onChange={event => setDelay(event.target.value)} /></label>
        <label>Bank per player (minutes)<input type="number" min={1 / 60} max="240" step="any" required value={bank} onChange={event => setBank(event.target.value)} /></label>
      </div>}
      <p>The original game stays saved. The fork keeps the board, resources, summons, and remaining actions.</p>
      <button type="submit" disabled={!source || busy || !name.trim()}>{busy ? 'Creating…' : 'Create fork'}</button>
      </fieldset>
      {!source && !error && <p role="status">Loading source game…</p>}
      {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh source</button></p>}
    </form>}
  </div></PlayDialog>;
}
