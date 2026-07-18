import { useMemo } from 'react'

// Full-screen takeover when the whole periodic tree is crowned.
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#a855f7']
const BLOCKS = ['🟥 s', '🟦 p', '🟨 d', '🟪 f']

export default function PeriodicCelebration({ onClose }) {
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
        <div className="celebrate-volcano">⚛️</div>
        <h1 className="celebrate-title">PERIODIC MASTER!</h1>
        <p className="celebrate-sub">You crowned the whole table — all four blocks!</p>

        <div className="celebrate-crowns">
          {BLOCKS.map((b, i) => (
            <span className="cc" key={i} style={{ animationDelay: 0.15 * i + 0.2 + 's' }}>
              <span className="cc-crown">👑</span>
              <span className="cc-emoji">{b}</span>
            </span>
          ))}
        </div>

        <p className="celebrate-rank">
          You earned the rank
          <strong>Master Chemist</strong>
        </p>

        <button className="big-btn test" onClick={onClose}>
          Awesome! 🎉
        </button>
      </div>
    </div>
  )
}
