import { useEffect, useMemo, useRef, useState } from 'react'
import { viewItem, itemsForTag, shuffle, directionLabels } from '../quiz.js'
import ItemImage from './ItemImage.jsx'
import DeepTimeBar from './DeepTimeBar.jsx'
import CrystalShape from './CrystalShape.jsx'

export default function Training({ deck, dir, tag, onExit }) {
  const base = useMemo(
    () => itemsForTag(deck, tag).map((it) => viewItem(deck, it, dir)),
    [deck, dir, tag]
  )
  const [shuffled, setShuffled] = useState(false)
  const [order, setOrder] = useState(base)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const labels = directionLabels(deck)
  const promptLabel = dir === 'rev' ? deck.sides[1] : deck.sides[0]
  const answerLabel = dir === 'rev' ? deck.sides[0] : deck.sides[1]

  const card = order[idx]

  // Deep-time scale for the Geologic Time deck.
  const isTime = deck.id === 'time'
  const timeItems = useMemo(
    () => (isTime ? deck.items.map((it) => ({ name: it.sides[0], age: parseFloat(it.sides[1]) })) : []),
    [deck, isTime]
  )

  // Matches the .flip-inner CSS transition; used to defer card swaps until the
  // card has finished rotating back to its front (so the next card's answer is
  // never momentarily visible during the flip-back).
  const FLIP_MS = 500
  const flipTimer = useRef(null)
  useEffect(() => () => clearTimeout(flipTimer.current), [])

  const cancelPending = () => {
    clearTimeout(flipTimer.current)
    flipTimer.current = null
  }

  const toShuffle = () => {
    cancelPending()
    const next = !shuffled
    setShuffled(next)
    setOrder(next ? shuffle(base) : base)
    setIdx(0)
    setFlipped(false)
  }

  const move = (delta) => {
    cancelPending()
    const advance = () => setIdx((i) => (i + delta + order.length) % order.length)
    if (flipped) {
      // Flip back first, then swap content once the front is facing again.
      setFlipped(false)
      flipTimer.current = setTimeout(() => {
        flipTimer.current = null
        advance()
      }, FLIP_MS)
    } else {
      advance()
    }
  }

  return (
    <div className="screen training" style={{ '--accent': deck.color }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="Back">
          ‹ Back
        </button>
        <div className="topbar-title">{labels[dir] || deck.title}</div>
        <button
          className={'icon-btn' + (shuffled ? ' active' : '')}
          onClick={toShuffle}
        >
          🔀 {shuffled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="card-stage">
        <button
          className={'flip-card' + (flipped ? ' flipped' : '')}
          onClick={() => setFlipped((f) => !f)}
        >
          <div className="flip-inner">
            <div className="flip-face front">
              {(card.promptImg || card.promptCrystal) && (
                <div className="face-visuals">
                  {card.promptImg && (
                    <ItemImage
                      slug={card.promptImg}
                      label={card.prompt}
                      size={card.promptCrystal ? 150 : 200}
                    />
                  )}
                  {card.promptCrystal && <CrystalShape shape={card.promptCrystal} size={120} />}
                </div>
              )}
              <div className="face-main">
                <div className="face-label">{promptLabel}</div>
                <div className="face-value">{card.prompt}</div>
                {card.promptSub && <div className="face-sub">{card.promptSub}</div>}
              </div>
              <div className="tap-hint">tap to flip</div>
            </div>
            <div className="flip-face back">
              {(card.answerImg || card.answerCrystal) && (
                <div className="face-visuals">
                  {card.answerImg && (
                    <ItemImage
                      slug={card.answerImg}
                      label={card.answer}
                      size={card.answerCrystal ? 150 : 200}
                    />
                  )}
                  {card.answerCrystal && <CrystalShape shape={card.answerCrystal} size={120} />}
                </div>
              )}
              <div className="face-main">
                <div className="face-label">{answerLabel}</div>
                <div className="face-value">{card.answer}</div>
                {card.answerSub && <div className="face-sub">{card.answerSub}</div>}
              </div>
              <div className="tap-hint">tap to flip back</div>
            </div>
          </div>
        </button>
      </div>

      {isTime && (
        <DeepTimeBar
          items={timeItems}
          activeName={card.raw.sides[0]}
          activeAge={parseFloat(card.raw.sides[1])}
          activeAgeStr={card.raw.sides[1]}
        />
      )}

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
