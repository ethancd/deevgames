import { useMemo, useState } from 'react'
import { buildElementTest } from '../../periodic/quiz.js'
import { nodePool, nodeScopeKey, allPtMastered, isNodeCrowned } from '../../periodic/mastery.js'
import { recordScore, getPtMasterStatus, recordPtMastered } from '../../storage.js'
import { recordAce } from '../../review.js'
import PtPrompt from './PtPrompt.jsx'
import McOptions from './McOptions.jsx'
import PtScore from './PtScore.jsx'
import PeriodicCelebration from './PeriodicCelebration.jsx'

// A scored test of one node (leaf or composite) in one direction.
export default function PtTest({ node, dir, onExit }) {
  const accent = node.color
  const [runId, setRunId] = useState(0)
  const pool = useMemo(() => nodePool(node), [node, runId])
  const questions = useMemo(() => buildElementTest(pool, dir), [pool, dir, runId])

  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [results, setResults] = useState([])
  const [done, setDone] = useState(false)
  const [final, setFinal] = useState(null)
  const [celebrate, setCelebrate] = useState(false)

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
        const { pct, isRecord } = recordScore(nodeScopeKey(node.id, dir.id), {
          correct,
          total: next.length,
        })
        // A 100% on a crowned node refreshes its spaced-repetition freshness.
        if (pct === 100 && isNodeCrowned(node)) recordAce(node.id)
        setFinal({ correct, total: next.length, pct, isRecord, results: next })
        setDone(true)
        if (allPtMastered() && !getPtMasterStatus().celebrated) {
          recordPtMastered(new Date().toISOString())
          setCelebrate(true)
        }
      }
    }, 850)
  }

  const restart = () => {
    setIdx(0)
    setPicked(null)
    setResults([])
    setDone(false)
    setFinal(null)
    setRunId((n) => n + 1)
  }

  if (done && final) {
    return (
      <>
        <PtScore {...final} accent={accent} onRetry={restart} onExit={onExit} exitLabel="‹ Back" />
        {celebrate && <PeriodicCelebration onClose={() => setCelebrate(false)} />}
      </>
    )
  }

  return (
    <div className="screen test" style={{ '--accent': accent }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Quit">
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
      <PtPrompt q={q} accent={accent} />
      <McOptions q={q} picked={picked} onChoose={choose} />
    </div>
  )
}
