import { useMemo, useState } from 'react'
import { buildTest, directionLabels, answerSubMap } from '../quiz.js'
import { scopeKey, recordScore } from '../storage.js'
import { isDeckMastered } from '../mastery.js'
import { recordAce } from '../review.js'
import ItemImage from './ItemImage.jsx'
import ScoreScreen from './ScoreScreen.jsx'

export default function Test({ deck, dir, tag, length, onExit, onHome }) {
  const [runId, setRunId] = useState(0)
  const questions = useMemo(
    () => buildTest(deck, dir, tag, length),
    [deck, dir, tag, length, runId]
  )

  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [results, setResults] = useState([])
  const [done, setDone] = useState(false)
  const [finalScore, setFinalScore] = useState(null)

  const q = questions[idx]
  const labels = directionLabels(deck)
  const subMap = useMemo(() => answerSubMap(deck, dir), [deck, dir])

  const choose = (opt) => {
    if (picked) return // lock after first tap
    setPicked(opt)
    const isCorrect = opt === q.correct
    const entry = {
      prompt: q.prompt,
      answer: q.correct,
      answerSub: q.answerSub || subMap[q.correct],
      picked: opt,
      pickedSub: subMap[opt],
      isCorrect,
      img: q.promptImg,
    }
    const nextResults = [...results, entry]
    setResults(nextResults)
    setTimeout(() => {
      if (idx + 1 < questions.length) {
        setIdx(idx + 1)
        setPicked(null)
      } else {
        const correct = nextResults.filter((r) => r.isCorrect).length
        const { pct, isRecord } = recordScore(scopeKey(deck.id, dir, tag), {
          correct,
          total: nextResults.length,
        })
        // A 100% on a crowned deck refreshes its spaced-repetition freshness.
        if (pct === 100 && isDeckMastered(deck)) recordAce(deck.id)
        setFinalScore({ correct, total: nextResults.length, pct, isRecord, results: nextResults })
        setDone(true)
      }
    }, 850)
  }

  const restart = () => {
    setIdx(0)
    setPicked(null)
    setResults([])
    setDone(false)
    setFinalScore(null)
    setRunId((n) => n + 1)
  }

  if (done && finalScore) {
    return (
      <ScoreScreen
        deck={deck}
        score={finalScore}
        onRetry={restart}
        onExit={onExit}
        onHome={onHome}
      />
    )
  }

  return (
    <div className="screen test" style={{ '--accent': deck.color }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Quit">
          ✕ Quit
        </button>
        <div className="topbar-title">{labels[dir] || deck.title}</div>
        <div className="topbar-spacer" />
      </div>

      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${(idx / questions.length) * 100}%` }}
        />
      </div>
      <div className="q-count">
        Question {idx + 1} of {questions.length}
      </div>

      <div className="q-prompt">
        {q.promptImg && <ItemImage slug={q.promptImg} label={q.prompt} size={180} />}
        <div className="q-prompt-text">{q.prompt}</div>
        {q.promptSub && <div className="q-prompt-sub">{q.promptSub}</div>}
        <div className="q-ask">{deck.sides[dir === 'rev' ? 0 : 1]}?</div>
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
                {subMap[opt] && <span className="opt-sub">{subMap[opt]}</span>}
              </span>
              {picked && opt === q.correct && <span className="opt-mark">✓</span>}
              {picked && opt === picked && opt !== q.correct && (
                <span className="opt-mark">✗</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
