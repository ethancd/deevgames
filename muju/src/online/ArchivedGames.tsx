import { useEffect, useState } from 'react';
import { analysisUrl, listArchivedRooms } from './client';
import { rulesetLabel } from '../game/rules';
import type { RoomArchive } from './types';

export function ArchivedGames({ server }: { server: string }) {
  const [open, setOpen] = useState(false);
  const [archive, setArchive] = useState<RoomArchive | null>(null);
  const [cursor, setCursor] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void listArchivedRooms(server, cursor, controller.signal).then(page => {
      if (!controller.signal.aborted) setArchive(previous => ({ ...page, rooms: cursor ? [...(previous?.rooms ?? []), ...page.rooms] : page.rooms }));
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load archived games.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, server, cursor, refresh]);
  return <details onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) setCursor(undefined); }}>
    <summary>Archived games</summary>
    <p className="online-help">Rooms close after 24 hours without a move. Boards and game scores stay available for review.</p>
    {error && <p role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>Retry</button></p>}
    {loading && <p role="status">Loading archived games…</p>}
    {archive?.rooms.length === 0 && <p>No archived games yet.</p>}
    {!!archive?.rooms.length && <ul className="active-games-list">{archive.rooms.map(room => <li key={room.id} className="active-game">
      <div className="active-game-info">
        <strong>{room.seats.white ?? 'White'} vs {room.seats.black ?? 'Black'}</strong>
        <span>{rulesetLabel(room)}{room.retiredRules ? ' · retired' : ''} · Turn {room.turnNumber}</span>
        <span>{room.reason === 'abandoned' ? 'Closed · no moves for 24 hours' : room.winner ? `${room.seats[room.winner] ?? room.winner} won · ${room.reason?.replaceAll('-', ' ')}` : 'Draw'}</span>
        <small>Archived <time dateTime={room.archivedAt}>{new Date(room.archivedAt).toLocaleString()}</time></small>
      </div>
      {room.retiredRules
        // The server answers RULES_CHANGED for these rooms, so the link would be dead.
        ? <span className="archived-retired">Review unavailable · previous rules</span>
        : <a href={analysisUrl({ roomId: room.id, serverUrl: server })}>Analyze →</a>}
    </li>)}</ul>}
    {archive?.nextCursor && <button disabled={loading} onClick={() => setCursor(archive.nextCursor!)}>More archived games</button>}
  </details>;
}
