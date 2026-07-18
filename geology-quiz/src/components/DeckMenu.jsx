import { useState } from 'react'
import { directionLabels } from '../quiz.js'
import { scopeKey, getBestForScope } from '../storage.js'
import { isDeckMastered } from '../mastery.js'
import { reviewState } from '../review.js'

export default function DeckMenu({ deck, onBack, onStart }) {
  const dirs = directionLabels(deck)
  const [dir, setDir] = useState('fwd')
  const [tag, setTag] = useState('all')

  const best = getBestForScope(scopeKey(deck.id, dir, tag))
  const due = isDeckMastered(deck) && reviewState(deck.id, true).due

  return (
    <div className="screen deck-menu" style={{ '--accent': deck.color }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          ‹ Home
        </button>
        <div className="topbar-title">
          {deck.emoji} {deck.title}
        </div>
        <div className="topbar-spacer" />
      </div>

      <div className="menu-body">
        {due && (
          <div className="review-banner">
            🔄 <strong>Review due.</strong> Ace any direction at 100% to refresh your crown.
          </div>
        )}
        {deck.reversible && (
          <section className="opt-group">
            <h3>Direction</h3>
            <div className="seg">
              <button
                className={'seg-btn' + (dir === 'fwd' ? ' on' : '')}
                onClick={() => setDir('fwd')}
              >
                {dirs.fwd}
              </button>
              <button
                className={'seg-btn' + (dir === 'rev' ? ' on' : '')}
                onClick={() => setDir('rev')}
              >
                {dirs.rev}
              </button>
            </div>
          </section>
        )}

        {deck.tags && (
          <section className="opt-group">
            <h3>{deck.tagLabel || 'Group'}</h3>
            <div className="seg wrap">
              <button
                className={'seg-btn' + (tag === 'all' ? ' on' : '')}
                onClick={() => setTag('all')}
              >
                All
              </button>
              {deck.tags.map((t) => (
                <button
                  key={t}
                  className={'seg-btn' + (tag === t ? ' on' : '')}
                  onClick={() => setTag(t)}
                >
                  {cap(t)}
                </button>
              ))}
            </div>
          </section>
        )}

        {best && (
          <div className="best-banner">
            ⭐ Your best here: <strong>{best.pct}%</strong> ({best.correct}/{best.total})
          </div>
        )}

        <div className="big-actions">
          <button
            className="big-btn train"
            onClick={() => onStart({ name: 'training', deckId: deck.id, dir, tag })}
          >
            <span className="big-emoji">🃏</span>
            <span>Training</span>
            <small>Flip cards, no pressure</small>
          </button>
          <button
            className="big-btn test"
            onClick={() => onStart({ name: 'test', deckId: deck.id, dir, tag, length: 'all' })}
          >
            <span className="big-emoji">🎯</span>
            <span>Test</span>
            <small>Score yourself</small>
          </button>
        </div>
      </div>
    </div>
  )
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
