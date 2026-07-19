import { useMemo, useState } from 'react'
import { buildGrandGauntlet } from '../../periodic/quiz.js'
import { recordPtGrandStreak } from '../../storage.js'
import PtPrompt from './PtPrompt.jsx'
import McOptions from './McOptions.jsx'
import ElementTile from './ElementTile.jsx'

const ACCENT = '#f59e0b'

// Sudden death over every combinatorial question (all elements × 6 directions +
// family/block/type). One miss ends it; your score is your streak.
export default function GrandGauntlet({ onExit }) {
  const [runId, setRunId] = useState(0)
  const questions = useMemo(() => buildGrandGauntlet(), [runId])

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
        const { best, isRecord } = recordPtGrandStreak(idx)
        setResult({
          streak: idx,
          best,
          isRecord,
          win: false,
          missed: { el: q.el, prompt: q.prompt, askLabel: q.askLabel, correct: q.correct, picked: opt },
        })
        setDead(true)
        return
      }
      const next = idx + 1
      if (next >= questions.length) {
        const { best, isRecord } = recordPtGrandStreak(next)
        setResult({ streak: next, best, isRecord, win: true })
        setDead(true)
      } else {
        setIdx(next)
        setPicked(null)
      }
    }, 700)
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
      <div className="screen gauntlet-over" style={{ '--accent': ACCENT }}>
        <div className="score-card">
          <div className="score-headline">{result.win ? 'PERFECT! 🏆' : 'Gauntlet over!'}</div>
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
                <ElementTile el={result.missed.el} size={52} showName={false} />
                <div className="gm-text">
                  <div className="gm-prompt">
                    {result.missed.prompt} → {result.missed.askLabel}?
                  </div>
                  <div className="gm-answers">
                    <span className="ra-correct">✓ {result.missed.correct}</span>
                    <span className="ra-yours">✗ you said {result.missed.picked}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {result.win && <p className="all-correct">You answered every possible question — legendary! ⚛️</p>}
          <div className="score-actions">
            <button className="big-btn test" onClick={restart}>
              🔁 Run it again
            </button>
            <button className="ghost-btn" onClick={onExit}>
              ‹ Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen test" style={{ '--accent': ACCENT }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Quit">
          ✕ Quit
        </button>
        <div className="topbar-title gauntlet-streakbar">🔥 Streak {idx}</div>
        <div className="topbar-spacer" />
      </div>
      <PtPrompt q={q} accent="#475569" />
      <McOptions q={q} picked={picked} onChoose={choose} />
    </div>
  )
}
