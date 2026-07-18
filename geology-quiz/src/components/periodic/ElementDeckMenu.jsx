import { useState } from 'react'
import { DIRECTIONS } from '../../periodic/quiz.js'
import { nodePool, directionProgress, nodeScopeKey, isNodeCrowned } from '../../periodic/mastery.js'
import { getBestForScope } from '../../storage.js'
import { reviewState } from '../../review.js'
import ElementTile from './ElementTile.jsx'

// Menu for one node (leaf or composite): pick one of the six directions, then
// train or test. The crown needs all six aced, so direction progress is shown.
export default function ElementDeckMenu({ node, onBack, onStart }) {
  const [dirId, setDirId] = useState('name-symbol')
  const pool = nodePool(node)
  const prog = directionProgress(node)
  const crowned = prog.done === prog.total
  const best = getBestForScope(nodeScopeKey(node.id, dirId))
  const due = isNodeCrowned(node) && reviewState(node.id, true).due

  return (
    <div className="screen deck-menu" style={{ '--accent': node.color }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          ‹ Back
        </button>
        <div className="topbar-title">{node.title}</div>
        <div className="topbar-spacer" />
      </div>

      <div className="menu-body">
        {due && (
          <div className="review-banner">
            🔄 <strong>Review due.</strong> Ace any direction at 100% to refresh your crown.
          </div>
        )}
        <div className="pt-cluster">
          {pool.slice(0, 18).map((el) => (
            <ElementTile key={el.atomicNumber} el={el} size={52} showName={false} />
          ))}
          {pool.length > 18 && <div className="pt-more">+{pool.length - 18}</div>}
        </div>

        <div className={'pt-progress' + (crowned ? ' done' : '')}>
          {crowned ? '👑 Crowned — all 6 directions aced!' : `🎯 ${prog.done} / ${prog.total} directions aced`}
        </div>

        <section className="opt-group">
          <h3>Direction</h3>
          <div className="seg wrap">
            {DIRECTIONS.map((d) => {
              const b = getBestForScope(nodeScopeKey(node.id, d.id))
              const aced = b && b.pct === 100 && b.total === pool.length
              return (
                <button
                  key={d.id}
                  className={'seg-btn' + (dirId === d.id ? ' on' : '') + (aced ? ' aced' : '')}
                  onClick={() => setDirId(d.id)}
                >
                  {d.label}
                  {aced && <span className="seg-check">✓</span>}
                </button>
              )
            })}
          </div>
        </section>

        {best && (
          <div className="best-banner">
            ⭐ Best on this direction: <strong>{best.pct}%</strong>
          </div>
        )}

        <div className="big-actions">
          <button className="big-btn train" onClick={() => onStart({ name: 'ptTraining', nodeId: node.id, dirId })}>
            <span className="big-emoji">🃏</span>
            <span>Training</span>
            <small>Flip cards</small>
          </button>
          <button className="big-btn test" onClick={() => onStart({ name: 'ptTest', nodeId: node.id, dirId })}>
            <span className="big-emoji">🎯</span>
            <span>Test</span>
            <small>Score yourself</small>
          </button>
        </div>
      </div>
    </div>
  )
}
