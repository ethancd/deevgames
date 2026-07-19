import { useEffect, useState } from 'react'
import ItemImage from './ItemImage.jsx'
import MasterCelebration from './MasterCelebration.jsx'
import { allMastered } from '../mastery.js'
import { getMasterStatus, recordMastered } from '../storage.js'

export default function ScoreScreen({ deck, score, onRetry, onExit, onHome }) {
  const { correct, total, pct, isRecord, results } = score
  const missed = results.filter((r) => !r.isCorrect)

  // If this run just earned the 5th crown, fire the master celebration (once).
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    if (allMastered() && !getMasterStatus().celebrated) {
      recordMastered(new Date().toISOString())
      setCelebrate(true)
    }
  }, [])

  const tier =
    pct === 100 ? 'perfect' : pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'try'
  const headline = {
    perfect: 'PERFECT! 🏆',
    great: 'Awesome! 🌟',
    ok: 'Nice work! 👍',
    try: 'Keep going! 💪',
  }[tier]

  return (
    <div className={'screen score ' + tier} style={{ '--accent': deck.color }}>
      <div className="score-card">
        <div className="score-headline">{headline}</div>
        {isRecord && <div className="record-badge">⭐ New best score!</div>}

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
                  {m.img && <ItemImage slug={m.img} label={m.prompt} size={56} />}
                  <div className="review-text">
                    <div className="review-prompt">{m.prompt}</div>
                    <div className="review-answers">
                      <span className="ra-correct">
                        ✓ {m.answer}
                        {m.answerSub && <em className="ra-sub"> · {m.answerSub}</em>}
                      </span>
                      <span className="ra-yours">you said {m.picked}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="all-correct">You got every single one! 🎉</div>
        )}

        <div className="score-actions">
          <button className="big-btn test" onClick={onRetry}>
            🔁 Try again
          </button>
          <button className="big-btn train" onClick={onExit}>
            ⚙️ Deck options
          </button>
          <button className="ghost-btn" onClick={onHome}>
            🏠 Home
          </button>
        </div>
      </div>
      {celebrate && <MasterCelebration onClose={() => setCelebrate(false)} />}
    </div>
  )
}
