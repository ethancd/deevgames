import ElementTile from './ElementTile.jsx'

// Shared score screen for periodic deck tests and the Gradual Gauntlet.
export default function PtScore({
  correct,
  total,
  pct,
  isRecord,
  results,
  accent,
  recordLabel = 'New best!',
  onRetry,
  onExit,
  exitLabel = '‹ Back',
}) {
  const missed = results.filter((r) => !r.isCorrect)
  const tier = pct === 100 ? 'perfect' : pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'try'
  const headline = {
    perfect: 'PERFECT! 🏆',
    great: 'Awesome! 🌟',
    ok: 'Nice work! 👍',
    try: 'Keep going! 💪',
  }[tier]

  return (
    <div className={'screen score ' + tier} style={{ '--accent': accent || '#2563eb' }}>
      <div className="score-card">
        <div className="score-headline">{headline}</div>
        {isRecord && <div className="record-badge">⭐ {recordLabel}</div>}

        <div className="score-ring" style={{ '--pct': pct }}>
          <div className="score-ring-inner">
            <div className="score-pct">{pct}%</div>
            <div className="score-frac">
              {correct} / {total}
            </div>
          </div>
        </div>

        {missed.length > 0 ? (
          <div className="review">
            <h3>Review these {missed.length}:</h3>
            <ul className="review-list">
              {missed.map((m, i) => (
                <li key={i} className="review-item">
                  {m.el && <ElementTile el={m.el} size={52} showName={false} />}
                  <div className="review-text">
                    <div className="review-prompt">{m.prompt} → ?</div>
                    <div className="review-answers">
                      <span className="ra-correct">✓ {m.answer}</span>
                      <span className="ra-yours">you said {m.picked}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="all-correct">You got every one! 🎉</div>
        )}

        <div className="score-actions">
          <button className="big-btn test" onClick={onRetry}>
            🔁 Try again
          </button>
          <button className="ghost-btn" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
