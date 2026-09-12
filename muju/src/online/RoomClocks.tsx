import { useEffect, useMemo, useState } from 'react';
import type { RoomSnapshot } from './types';
import { formatClock, projectClock } from './timeControl';

export function RoomClocks({ room }: { room: RoomSnapshot }) {
  const { clock, timeControl } = room;
  const anchor = useMemo(() => ({ clock, receivedAt: performance.now() }), [clock]);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!clock?.runningPlayer) return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [clock?.runningPlayer]);
  if (!clock || !timeControl) return <p className="clock-summary">Untimed game</p>;
  // Use a monotonic local elapsed duration against the server sample, not the device's wall clock.
  const current = projectClock(clock, clock.serverNowMs + Math.max(0, now - anchor.receivedAt));
  const expired = current.runningPlayer && current.delayRemainingMs + current.bankRemainingMs[current.runningPlayer] <= 0;
  return <section className="room-clocks" aria-label="Game clocks">
    <p className="clock-summary">{timeControl.delaySeconds}s per turn / {formatClock(timeControl.bankSeconds * 1000)} bank per player</p>
    <div className="clock-seats">
      {(['white', 'black'] as const).map(player => {
        const active = current.runningPlayer === player;
        const delay = active ? current.delayRemainingMs : timeControl.delaySeconds * 1000;
        const low = active && delay + current.bankRemainingMs[player] <= 30000;
        return <div key={player} className={`clock-seat ${active ? 'clock-active' : ''} ${low ? 'clock-low' : ''}`} aria-label={`${player} clock`}>
          <span className="clock-name" title={room.seats[player] ?? 'Waiting'}>{player === 'white' ? 'White' : 'Black'} · {room.seats[player] ?? 'Waiting'}</span>
          <strong role="timer" aria-live="off" aria-label={`${player} bank`}>{formatClock(current.bankRemainingMs[player])}</strong>
          <span>{active ? delay > 0 ? `${formatClock(delay)} free · then bank` : expired ? 'Awaiting result…' : 'Bank running' : room.state.phase === 'victory' ? 'Stopped' : 'Bank paused'}</span>
        </div>;
      })}
    </div>
    <p className="clock-help">{!room.ready ? 'White’s clock starts when the opponent joins.' : room.state.phase === 'victory' ? 'Game finished.' : 'One delay for the whole turn. End turn to stop your clock. Disconnecting does not pause it.'}</p>
  </section>;
}
