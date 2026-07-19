import { useMemo, useState } from 'react'
import { buildGauntlet } from '../quiz.js'
import { recordGauntletStreak, getGauntletBest } from '../storage.js'
import ItemImage from './ItemImage.jsx'

// The Grand Gauntlet: every question from every deck and direction, shuffled.
// One wrong answer ends the run; your score is your streak.
export default function Gauntlet({ onExit }) {
  const [runId, setRunId] = useState(0)
  const questions = useMemo(() => buildGauntlet(), [runId])

  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [dead, setDead] = useState(false)
  const [result, setResult] = useState(null)

  const q = questions[idx]

  const choose = (opt) => {
    if (picked || dead) return
    setPicked(opt)
    const correct = opt === q.correct
    setTimeout(() => {
      if (!correct) {
        const { best, isRecord } = recordGauntletStreak(idx)
        setResult({
          streak: idx,
          best,
          isRecord,
          win: false,
          missed: {
            prompt: q.prompt,
            promptImg: q.promptImg,
            deckEmoji: q.deckEmoji,
            askLabel: q.askLabel,
            correct: q.correct,
            picked: opt,
            correctSub: q.optionSubs[q.correct],
          },
        })
        setDead(true)
        return
      }
      const next = idx + 1
      if (next >= questions.length) {
        const { best, isRecord } = recordGauntletStreak(next)
        setResult({ streak: next, best, isRecord, win: true })
        setDead(true)
      } else {
        setIdx(next)
        setPicked(null)
      }
    }, 750)
  }

  const restart = () => {
    setIdx(0)
    setPicked(null)
    setDead(false)
    setResult(null)
    setRunId((n) => n + 1)
  }

  if (dead && result) {
    return (
      <div className="screen gauntlet-over">
        <div className="score-card">
          <div className="score-headline">{result.win ? 'PERFECT GAUNTLET! 🏆' : 'Gauntlet over!'}</div>
          {result.isRecord && !result.win && <div className="record-badge">⭐ New best streak!</div>}
          <div className="gauntlet-streak">
            <div className="gs-num">{result.streak}</div>
            <div className="gs-label">in a row</div>
          </div>
          <div className="gauntlet-best">
            Best streak: <strong>{result.best}</strong> / {questions.length}
          </div>
          {result.missed && (
            <div className="gauntlet-missed">
              <div className="gm-label">The one that got you:</div>
              <div className="gm-card">
                {result.missed.promptImg && (
                  <ItemImage slug={result.missed.promptImg} label={result.missed.prompt} size={56} />
                )}
                <div className="gm-text">
                  <div className="gm-prompt">
                    {result.missed.deckEmoji} {result.missed.prompt} → {result.missed.askLabel}?
                  </div>
                  <div className="gm-answers">
                    <span className="ra-correct">
                      ✓ {result.missed.correct}
                      {result.missed.correctSub && ` · ${result.missed.correctSub}`}
                    </span>
                    <span className="ra-yours">✗ you said {result.missed.picked}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {result.win && (
            <p className="all-correct">You answered every single question — legendary! 🌋</p>
          )}
          <div className="score-actions">
            <button className="big-btn test" onClick={restart}>
              🔁 Run it again
            </button>
            <button className="ghost-btn" onClick={onExit}>
              🏠 Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen gauntlet" style={{ '--accent': q.deckColor }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Quit">
          ✕ Quit
        </button>
        <div className="topbar-title gauntlet-streakbar">🔥 Streak {idx}</div>
        <div className="topbar-spacer" />
      </div>

      <div className="gauntlet-deckbadge">
        {q.deckEmoji} {q.deckTitle}
      </div>

      <div className="q-prompt">
        {q.promptImg && <ItemImage slug={q.promptImg} label={q.prompt} size={150} />}
        <div className="q-prompt-text">{q.prompt}</div>
        {q.promptSub && <div className="q-prompt-sub">{q.promptSub}</div>}
        <div className="q-ask">{q.askLabel}?</div>
      </div>

      <div className="options">
        {q.options.map((opt) => {
          let cls = 'option'
          if (picked) {
            if (opt === q.correct) cls += ' correct'
            else if (opt === picked) cls += ' wrong'
            else cls += ' dim'
          }
          return (
            <button key={opt} className={cls} onClick={() => choose(opt)} disabled={!!picked}>
              <span className="opt-body">
                <span className="opt-text">{opt}</span>
                {q.optionSubs[opt] && <span className="opt-sub">{q.optionSubs[opt]}</span>}
              </span>
              {picked && opt === q.correct && <span className="opt-mark">✓</span>}
              {picked && opt === picked && opt !== q.correct && <span className="opt-mark">✗</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
