import { useEffect, useMemo, useRef, useState } from 'react'
import { shuffle } from '../../periodic/quiz.js'
import { nodePool } from '../../periodic/mastery.js'
import ElementTile from './ElementTile.jsx'
import ElementPhoto from './ElementPhoto.jsx'

function fieldName(f) {
  if (f === 'atomicNumber') return 'Atomic number'
  if (f === 'symbol') return 'Symbol'
  return 'Name'
}
function fieldValue(el, f) {
  return f === 'atomicNumber' ? String(el.atomicNumber) : el[f]
}

// Flashcards for one node in one direction. Prompt shows the from-field; flip
// reveals the whole element tile (so you learn name+symbol+number together).
export default function PtTraining({ node, dir, onExit }) {
  const base = useMemo(() => nodePool(node), [node])
  const [shuffled, setShuffled] = useState(false)
  const [order, setOrder] = useState(base)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const FLIP_MS = 500
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const el = order[idx]

  const toShuffle = () => {
    clearTimeout(timer.current)
    const n = !shuffled
    setShuffled(n)
    setOrder(n ? shuffle(base) : base)
    setIdx(0)
    setFlipped(false)
  }
  const move = (d) => {
    clearTimeout(timer.current)
    const adv = () => setIdx((i) => (i + d + order.length) % order.length)
    if (flipped) {
      setFlipped(false)
      timer.current = setTimeout(adv, FLIP_MS)
    } else adv()
  }

  return (
    <div className="screen training" style={{ '--accent': node.color }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Back">
          ‹ Back
        </button>
        <div className="topbar-title">{dir.label}</div>
        <button className={'icon-btn' + (shuffled ? ' active' : '')} onClick={toShuffle}>
          🔀 {shuffled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="card-stage">
        <button className={'flip-card' + (flipped ? ' flipped' : '')} onClick={() => setFlipped((f) => !f)}>
          <div className="flip-inner">
            <div className="flip-face front">
              <div className="face-main">
                <div className="face-label">{fieldName(dir.from)}</div>
                <div className="face-value">{fieldValue(el, dir.from)}</div>
              </div>
              <div className="tap-hint">tap to flip</div>
            </div>
            <div className="flip-face back">
              <div className="face-visuals">
                <ElementTile el={el} size={150} />
                <ElementPhoto el={el} size={150} />
              </div>
              <div className="face-main">
                <div className="face-label">{fieldName(dir.to)}</div>
                <div className="face-value">{fieldValue(el, dir.to)}</div>
              </div>
              <div className="tap-hint">tap to flip back</div>
            </div>
          </div>
        </button>
      </div>

      <div className="nav-row">
        <button className="nav-btn" onClick={() => move(-1)} aria-label="Previous">
          ‹
        </button>
        <div className="nav-count">
          {idx + 1} / {order.length}
        </div>
        <button className="nav-btn" onClick={() => move(1)} aria-label="Next">
          ›
        </button>
      </div>
    </div>
  )
}
