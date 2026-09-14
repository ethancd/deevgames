import { useEffect, useState } from 'react';
import { listActiveRooms } from './client';
import type { ActiveRoom } from './types';
import './ActiveGames.css';

export function ActiveGames({ server, busy, onWatch }: { server: string; busy: boolean; onWatch: (id: string) => void }) {
  const [rooms, setRooms] = useState<ActiveRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    async function update() {
      clearTimeout(timer);
      if (document.hidden || inFlight) return;
      inFlight = true;
      setRefreshing(true);
      try {
        const result = await listActiveRooms(server, controller.signal);
        if (!controller.signal.aborted) { setRooms(result.rooms); setError(null); }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load active games.');
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) {
          setRefreshing(false);
          timer = setTimeout(() => void update(), 10000);
        }
      }
    }
    const resume = () => { void update(); };
    // Debounce changes while typing a different host address.
    timer = setTimeout(resume, refresh ? 0 : 300);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      controller.abort(); clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [server, refresh]);

  return <>
    <div className="active-games-heading">
      <h3>Active games{rooms !== null && <span className="active-games-count">{rooms.length}</span>}</h3>
      <button disabled={refreshing} onClick={() => setRefresh(value => value + 1)}>Refresh games</button>
    </div>
    <p className="online-help">Pick a game to watch live. Everyone is welcome to observe; no invitation needed. Updates automatically.</p>
    {error && <p role="alert">Could not refresh games. {error}{rooms?.length ? ' Showing the last loaded list.' : ''}</p>}
    {rooms === null && !error && <p role="status">Loading active games…</p>}
    {rooms?.length === 0 && <p role="status">No active games yet. Host a game below, or check back soon.</p>}
    {!!rooms?.length && <ul className="active-games-list">
      {rooms.map(room => {
        const white = room.seats.white ?? 'Waiting for White';
        const black = room.seats.black ?? 'Waiting for Black';
        return <li key={room.id} className="active-game">
          <div className="active-game-info">
            <span className={`active-game-status ${room.ready ? 'active-game-playing' : ''}`}>{room.ready ? 'In progress' : 'Waiting for opponent'}</span>
            <strong>{white} <span className="active-game-versus">vs</span> {black}</strong>
            {room.ready && <span>Turn {room.turnNumber} · {room.currentPlayer === 'white' ? 'White' : 'Black'} to play</span>}
            <small>Updated <time dateTime={room.updatedAt}>{new Date(room.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></small>
          </div>
          <button className="primary" disabled={busy} aria-label={`Watch ${white} vs ${black}`} onClick={() => onWatch(room.id)}>Watch →</button>
        </li>;
      })}
    </ul>}
  </>;
}
