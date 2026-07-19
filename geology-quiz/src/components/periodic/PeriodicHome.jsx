import { PT_DECKS, PT_COMPOSITES } from '../../data/elements.js'
import {
  isNodeCrowned,
  directionProgress,
  compositeUnlocked,
  childrenCrownedCount,
  crownCount,
  allPtMastered,
  gauntletUnlocked,
  poolSize,
} from '../../periodic/mastery.js'
import { COMPOSITE_UNLOCK } from '../../periodic/config.js'
import { getPtGrandBest, getPtMasterStatus } from '../../storage.js'
import { reviewState, dueCount } from '../../review.js'
import ElementTile from './ElementTile.jsx'
import { ELEMENTS } from '../../data/elements.js'

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

function sampleEls(deckId, n) {
  return ELEMENTS.filter((e) => e.deckId === deckId).slice(0, n)
}

export default function PeriodicHome({ onPickNode, onOpenGradual, onOpenGrand, onExitSubject }) {
  const totalNodes = PT_DECKS.length + PT_COMPOSITES.length
  const crowns = crownCount()
  const mastered = allPtMastered()
  const grandBest = getPtGrandBest()
  const masterDate = getPtMasterStatus().date
  const due = dueCount([...PT_DECKS, ...PT_COMPOSITES], isNodeCrowned)

  return (
    <div className="home screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onExitSubject} aria-label="Subjects">
          ‹ Subjects
        </button>
        <div className="topbar-title">⚛️ Periodic Table</div>
        <div className="topbar-spacer" />
      </div>

      <header className={'home-head' + (mastered ? ' is-master' : '')}>
        <h1>
          The Elements {mastered && <span className="title-crown">👑</span>}
        </h1>
        {mastered ? (
          <div className="master-badge">👑 Master Chemist{masterDate ? ` · since ${fmtDate(masterDate)}` : ''}</div>
        ) : (
          <p className="tagline">
            {crowns > 0 ? `👑 ${crowns} / ${totalNodes} nodes crowned — keep going!` : 'Crown every group and block'}
          </p>
        )}
        {due > 0 && (
          <div className="review-nudge">
            🔄 {due} {due === 1 ? 'node' : 'nodes'} due for review
          </div>
        )}
      </header>

      {mastered && (
        <button className="deck-tile gauntlet-tile" style={{ '--accent': '#f59e0b' }} onClick={onOpenGrand}>
          <div className="tile-emoji">🔥</div>
          <div className="tile-body">
            <div className="tile-title">The Grand Gauntlet</div>
            <div className="tile-blurb">Sudden death — every element, every direction, family/block/type.</div>
            <div className="tile-meta">
              {grandBest > 0 ? (
                <span className="tile-best">🔥 Best streak {grandBest}</span>
              ) : (
                <span className="tile-best new">Unlocked!</span>
              )}
            </div>
          </div>
        </button>
      )}

      {gauntletUnlocked() && (
        <button className="deck-tile gauntlet-tile" style={{ '--accent': '#0ea5e9' }} onClick={onOpenGradual}>
          <div className="tile-emoji">⚡</div>
          <div className="tile-body">
            <div className="tile-title">Gradual Gauntlet</div>
            <div className="tile-blurb">Mix it up across your crowned groups — pick any challenge type.</div>
            <div className="tile-meta">
              <span className="tile-best new">Unlocked</span>
            </div>
          </div>
        </button>
      )}

      <h2 className="pt-section">Groups</h2>
      <div className="deck-grid">
        {PT_DECKS.map((deck) => {
          const crowned = isNodeCrowned(deck)
          const prog = directionProgress(deck)
          const deckDue = crowned && reviewState(deck.id, true).due
          return (
            <button
              key={deck.id}
              className="deck-tile"
              style={{ '--accent': deck.color }}
              onClick={() => onPickNode(deck.id)}
            >
              <div className="tile-mini-cluster">
                {sampleEls(deck.id, 3).map((el) => (
                  <ElementTile key={el.atomicNumber} el={el} size={34} showName={false} />
                ))}
              </div>
              <div className="tile-body">
                <div className="tile-title">{deck.title}</div>
                <div className="tile-meta">
                  {crowned ? (
                    <span className="tile-best">⭐ Crowned</span>
                  ) : prog.done > 0 ? (
                    <span className="tile-best">🎯 {prog.done}/6 directions</span>
                  ) : (
                    <span className="tile-best new">New!</span>
                  )}
                </div>
                {deckDue && <div className="review-due">🔄 Review due</div>}
              </div>
              {crowned && <div className={'tile-crown' + (deckDue ? ' due' : '')}>👑</div>}
            </button>
          )
        })}
      </div>

      <h2 className="pt-section">Blocks</h2>
      <div className="deck-grid">
        {PT_COMPOSITES.map((c) => {
          const unlocked = compositeUnlocked(c)
          const crowned = isNodeCrowned(c)
          const prog = directionProgress(c)
          const compDue = crowned && reviewState(c.id, true).due
          return (
            <button
              key={c.id}
              className={'deck-tile composite-tile' + (unlocked ? '' : ' locked')}
              style={{ '--accent': c.color }}
              onClick={() => unlocked && onPickNode(c.id)}
              aria-disabled={!unlocked}
            >
              <div className={'tile-emoji' + (compDue ? ' due' : '')}>{crowned ? '👑' : c.emoji}</div>
              <div className="tile-body">
                <div className="tile-title">{c.title}</div>
                <div className="tile-meta">
                  {!unlocked ? (
                    <span className="tile-count">
                      🔒 {childrenCrownedCount(c)} / {COMPOSITE_UNLOCK} groups crowned
                    </span>
                  ) : crowned ? (
                    <span className="tile-best">👑 Block crowned!</span>
                  ) : (
                    <span className="tile-best">🎯 {prog.done}/6 · {poolSize(c)} elements</span>
                  )}
                </div>
                {compDue && <div className="review-due">🔄 Review due</div>}
              </div>
            </button>
          )
        })}
      </div>

      <footer className="home-foot">Crown a group by acing all six directions • Works offline</footer>
    </div>
  )
}
