import { useMemo, useState } from 'react'
import { ALL_TYPES, buildElementTest } from '../../periodic/quiz.js'
import { gauntletPool } from '../../periodic/mastery.js'
import { recordPtGauntlet, getPtGauntletBest } from '../../storage.js'
import PtPrompt from './PtPrompt.jsx'
import McOptions from './McOptions.jsx'
import PtScore from './PtScore.jsx'

const ACCENT = '#0ea5e9'

// Scored gauntlet over the union of all crowned nodes. Pick a question type, then
// run the whole pool. Best saved per type. Field prompts use a neutral accent so
// the family color never leaks the answer in this mixed-family context.
export default function GradualGauntlet({ onExit }) {
  const [typeId, setTypeId] = useState(null)
  const [runId, setRunId] = useState(0)
  const pool = useMemo(() => gauntletPool(), [])
  const dir = ALL_TYPES.find((t) => t.id === typeId)
  const questions = useMemo(() => (dir ? buildElementTest(pool, dir) : []), [dir, pool, runId])

  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [results, setResults] = useState([])
  const [final, setFinal] = useState(null)

  const reset = () => {
    setIdx(0)
    setPicked(null)
    setResults([])
    setFinal(null)
  }

  // ---- type picker ----
  if (!dir) {
    return (
      <div className="screen deck-menu" style={{ '--accent': ACCENT }}>
        <div className="topbar">
          <button className="icon-btn" onClick={onExit} aria-label="Back">
            ‹ Back
          </button>
          <div className="topbar-title">⚡ Gradual Gauntlet</div>
          <div className="topbar-spacer" />
        </div>
        <div className="menu-body">
          <div className="pt-gauntlet-blurb">
            {pool.length} elements unlocked (from your crowned groups). Pick a challenge:
          </div>
          <div className="pt-typegrid">
            {ALL_TYPES.map((t) => {
              const b = getPtGauntletBest(t.id)
              return (
                <button key={t.id} className="seg-btn pt-typebtn" onClick={() => { reset(); setTypeId(t.id) }}>
                  <span>{t.label}</span>
                  <small>{b ? `⭐ ${b.pct}%` : 'New'}</small>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const q = questions[idx]

  const choose = (opt) => {
    if (picked) return
    setPicked(opt)
    const isCorrect = opt === q.correct
    const entry = { prompt: q.prompt, answer: q.correct, picked: opt, isCorrect, el: q.el }
    const next = [...results, entry]
    setResults(next)
    setTimeout(() => {
      if (idx + 1 < questions.length) {
        setIdx(idx + 1)
        setPicked(null)
      } else {
        const correct = next.filter((r) => r.isCorrect).length
        const { pct, isRecord } = recordPtGauntlet(dir.id, { correct, total: next.length })
        setFinal({ correct, total: next.length, pct, isRecord, results: next })
      }
    }, 800)
  }

  if (final) {
    return (
      <PtScore
        {...final}
        accent={ACCENT}
        recordLabel="New best for this type!"
        onRetry={() => { reset(); setRunId((n) => n + 1) }}
        onExit={() => setTypeId(null)}
        exitLabel="‹ Pick another type"
      />
    )
  }

  // field prompts: neutral accent (mixed families); categoricals: tile prompt
  return (
    <div className="screen test" style={{ '--accent': ACCENT }}>
      <div className="topbar">
        <button className="icon-btn" onClick={() => setTypeId(null)} aria-label="Quit">
          ✕ Quit
        </button>
        <div className="topbar-title">{dir.label}</div>
        <div className="topbar-spacer" />
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${(idx / questions.length) * 100}%` }} />
      </div>
      <div className="q-count">
        Question {idx + 1} of {questions.length}
      </div>
      <PtPrompt q={q} accent="#475569" />
      <McOptions q={q} picked={picked} onChoose={choose} />
    </div>
  )
}
