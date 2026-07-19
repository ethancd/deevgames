import { useMemo } from 'react'

// Full-screen takeover shown the moment the 5th crown is earned.
const COLORS = ['#2563eb', '#0d9488', '#d97706', '#7c3aed', '#be123c', '#fbbf24']
const DECK_EMOJIS = ['⛏️', '🪨', '🧪', '💎', '⏳']

export default function MasterCelebration({ onClose }) {
  // Generate confetti once (browser Math.random is fine here).
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 2.4 + Math.random() * 2,
        color: COLORS[i % COLORS.length],
        size: 8 + Math.random() * 9,
        round: Math.random() > 0.5,
      })),
    []
  )

  return (
    <div className="celebrate-overlay" onClick={onClose}>
      <div className="confetti" aria-hidden="true">
        {pieces.map((p, i) => (
          <span
            key={i}
            className={'confetti-bit' + (p.round ? ' round' : '')}
            style={{
              left: p.left + '%',
              background: p.color,
              width: p.size,
              height: p.size,
              animationDelay: p.delay + 's',
              animationDuration: p.dur + 's',
            }}
          />
        ))}
      </div>

      <div className="celebrate-card" onClick={(e) => e.stopPropagation()}>
        <div className="celebrate-volcano">🌋</div>
        <h1 className="celebrate-title">GEOLOGY MASTER!</h1>
        <p className="celebrate-sub">You crowned all five levels!</p>

        <div className="celebrate-crowns">
          {DECK_EMOJIS.map((e, i) => (
            <span className="cc" key={i} style={{ animationDelay: 0.15 * i + 0.2 + 's' }}>
              <span className="cc-crown">👑</span>
              <span className="cc-emoji">{e}</span>
            </span>
          ))}
        </div>

        <p className="celebrate-rank">
          You earned the rank
          <strong>Master Geologist</strong>
        </p>

        <button className="big-btn test" onClick={onClose}>
          Awesome! 🎉
        </button>
      </div>
    </div>
  )
}
