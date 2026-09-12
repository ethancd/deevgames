import { useEffect, useRef, useState } from 'react';
import { HISTORY_NOTATION, type MoveHistoryEntry, type RoomMoveHistory } from '../game/moveHistory';
import type { PlayerId } from '../game/types';
import type { OnlineConnection } from './types';
import { roomRequest } from './client';
import './RoomHistory.css';

function Outcome({ entry }: { entry: MoveHistoryEntry }) {
  if (entry.kind === 'mining') return <details><summary>Mining by piece</summary><ul>
    {entry.takes.map(take => <li key={take.unit.id}>{take.unit.symbol}@{take.unit.square} {take.unit.name}: <b>+{take.amount} ◆</b><small>Reserves {take.reservesBefore} → {take.reservesAfter}</small></li>)}
  </ul></details>;
  if (entry.kind === 'upkeep') return <details><summary>Kept {entry.kept.length} · released {entry.released.length}</summary><ul>
    {entry.kept.map(unit => <li key={unit.id}>{unit.symbol}@{unit.square} {unit.name}<small>Kept · {unit.cost} ◆ upkeep</small></li>)}
    {entry.released.map(unit => <li key={unit.id}>{unit.symbol}@{unit.square} {unit.name}<small>Released during upkeep</small></li>)}
  </ul></details>;
  if (entry.kind === 'move' && entry.path.length > 1) return <details><summary>Route · {entry.path.length} squares</summary><p>{[entry.from, ...entry.path].join(' → ')}</p></details>;
  return null;
}

export function RoomHistory({ connection, revision, names, onClose }: {
  connection: OnlineConnection; revision: number; names: Record<PlayerId, string>; onClose: () => void;
}) {
  const [before, setBefore] = useState<number>();
  const [data, setData] = useState<RoomMoveHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const analysisUrl = (sequence?: number) => `/muju/analysis?room=${connection.roomId}&server=${encodeURIComponent(connection.serverUrl)}${connection.player ? '' : '&watch=1'}${sequence === undefined ? '' : `&event=${sequence}`}`;

  useEffect(() => {
    const opener = document.activeElement;
    closeButton.current?.focus();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    roomRequest<RoomMoveHistory>(connection.serverUrl, `/${connection.roomId}/history?limit=50${before === undefined ? '' : `&before=${before}`}`,
      undefined, undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'History could not be loaded.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connection.serverUrl, connection.roomId, revision, before, retry]);
  useEffect(() => {
    if (scroll.current && followLatest.current && before === undefined) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [data, before]);

  const groups: { key: string; player: PlayerId; turnNumber: number; entries: MoveHistoryEntry[] }[] = [];
  for (const entry of data?.entries ?? []) {
    const key = `${entry.turnNumber}-${entry.player}`;
    if (groups.at(-1)?.key !== key) groups.push({ key, player: entry.player, turnNumber: entry.turnNumber, entries: [] });
    groups.at(-1)!.entries.push(entry);
  }
  return <aside className="room-history" id="room-move-history" aria-label="Move history" onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  }}>
    <header><div><h2>Move history</h2><p>{before === undefined ? 'Following this game' : 'Earlier in this game'}</p></div>
      <button ref={closeButton} type="button" onClick={onClose} aria-label="Close move history">×</button></header>
    <nav aria-label="History pages">
      <button type="button" disabled={loading || !data?.hasEarlier || !data.entries.length} onClick={() => {
        setBefore(data!.entries[0].sequence); if (scroll.current) scroll.current.scrollTop = 0;
      }}>← Older</button>
      <span>{data ? `${data.total} recorded events` : 'Loading…'}</span>
      <button type="button" disabled={loading || before === undefined} onClick={() => { followLatest.current = true; setBefore(undefined); }}>Latest →</button>
    </nav>
    <div className="history-update" role="status">{loading ? 'Updating history…' : error ? 'History unavailable' : `Up to date · revision ${data?.revision ?? revision}`}</div>
    <a className="history-analysis-link" href={analysisUrl()}>Analyze game →</a>
    {error && <p className="history-error" role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    <div className="history-scroll" ref={scroll} onScroll={event => {
      const node = event.currentTarget;
      followLatest.current = node.scrollHeight - node.clientHeight - node.scrollTop < 60;
    }} aria-busy={loading}>
      {data && !data.recordingStart.complete && <p className="history-start">Detailed recording begins at {data.recordingStart.turnNumber}.{data.recordingStart.player === 'white' ? 'White' : 'Black'} (revision {data.recordingStart.revision}). Earlier moves are unavailable.</p>}
      {!loading && !error && !data?.entries.length && <p className="history-start">No recorded moves yet.</p>}
      {groups.map(group => <section className="history-turn" key={group.key} aria-label={`Turn ${group.turnNumber} ${group.player}`}>
        <h3><i className={`player-dot ${group.player}`} />{group.turnNumber}.{group.player === 'white' ? 'White' : 'Black'} <span>{names[group.player]}</span></h3>
        <ol>{group.entries.map(entry => <li key={entry.sequence} className={`history-event history-${entry.kind}`}>
          <a href={analysisUrl(entry.sequence)} title="Analyze this position"><code>{entry.notation}</code></a><p>{entry.description}</p><Outcome entry={entry} />
        </li>)}</ol>
      </section>)}
    </div>
    <footer><details><summary>Notation key</summary>{Object.values(HISTORY_NOTATION).map(line => <p key={line}>{line}</p>)}
      <p>Successful actions and outcomes only. Undone commands leave the score. Phase-ending commands are omitted.</p>
    </details></footer>
  </aside>;
}
