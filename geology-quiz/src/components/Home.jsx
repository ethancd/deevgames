import { decks } from '../data/decks.js'
import { directionLabels } from '../quiz.js'
import {
  getBest,
  getBestForDir,
  getBestForScope,
  scopeKey,
  getGauntletBest,
  getMasterStatus,
} from '../storage.js'
import { crownCount, allMastered, isDeckMastered, groupProgress } from '../mastery.js'
import { reviewState, dueCount } from '../review.js'

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function Home({ onPick, onOpenGauntlet, onExitSubject }) {
  const crowns = crownCount()
  const mastered = allMastered()
  const gauntletBest = getGauntletBest()
  const masterDate = getMasterStatus().date
  const due = dueCount(decks, isDeckMastered)

  return (
    <div className="home screen">
      {onExitSubject && (
        <div className="topbar">
          <button className="icon-btn" onClick={onExitSubject} aria-label="Subjects">
            ‹ Subjects
          </button>
          <div className="topbar-title">🌋 Geology</div>
          <div className="topbar-spacer" />
        </div>
      )}
      <header className={'home-head' + (mastered ? ' is-master' : '')}>
        <h1>
          <span className="logo-emoji">🌋</span> Rock Stars
          {mastered && <span className="title-crown">👑</span>}
        </h1>
        {mastered ? (
          <div className="master-badge">
            👑 Master Geologist{masterDate ? ` · since ${fmtDate(masterDate)}` : ''}
          </div>
        ) : (
          <p className="tagline">
            {crowns > 0
              ? `👑 ${crowns} / ${decks.length} levels crowned — keep going!`
              : 'Pick a level and become a geology master'}
          </p>
        )}
        {due > 0 && (
          <div className="review-nudge">
            🔄 {due} {due === 1 ? 'deck' : 'decks'} due for review
          </div>
        )}
      </header>

      {mastered && (
        <button
          className="deck-tile gauntlet-tile"
          style={{ '--accent': '#f59e0b' }}
          onClick={onOpenGauntlet}
        >
          <div className="tile-emoji">🔥</div>
          <div className="tile-body">
            <div className="tile-title">The Grand Gauntlet</div>
            <div className="tile-blurb">
              Sudden death — every deck, both ways. One miss ends the run.
            </div>
            <div className="tile-meta">
              {gauntletBest > 0 ? (
                <span className="tile-best">🔥 Best streak {gauntletBest}</span>
              ) : (
                <span className="tile-best new">Unlocked!</span>
              )}
            </div>
          </div>
        </button>
      )}

      <div className="deck-grid">
        {decks.map((deck) => {
          const best = getBest(deck.id)
          const dirs = deck.reversible ? directionLabels(deck) : null
          const fwdBest = deck.reversible ? getBestForDir(deck.id, 'fwd') : null
          const revBest = deck.reversible ? getBestForDir(deck.id, 'rev') : null
          const deckMastered = isDeckMastered(deck)
          const deckDue = deckMastered && reviewState(deck.id, true).due
          const groups = groupProgress(deck) // non-null only for tag-grouped decks (Time)
          const allBest = getBestForScope(scopeKey(deck.id, 'fwd', 'all'))
          return (
            <button
              key={deck.id}
              className="deck-tile"
              style={{ '--accent': deck.color }}
              onClick={() => onPick(deck.id)}
            >
              <div className="tile-emoji">{deck.emoji}</div>
              <div className="tile-body">
                <div className="tile-title">{deck.title}</div>
                <div className="tile-blurb">{deck.blurb}</div>
                <div className="tile-meta">
                  <span className="tile-count">{deck.items.length} cards</span>
                  {!deck.reversible &&
                    (groups ? (
                      // Tag-grouped deck (Geologic Time): crown needs the full set;
                      // acing sub-groups shows as partial credit.
                      deckMastered ? (
                        <span className="tile-best">⭐ Best 100%</span>
                      ) : groups.done > 0 ? (
                        <span className="tile-best">🧩 {groups.done}/{groups.total} groups done</span>
                      ) : allBest ? (
                        <span className="tile-best">⭐ Best {allBest.pct}%</span>
                      ) : (
                        <span className="tile-best new">New!</span>
                      )
                    ) : best ? (
                      <span className="tile-best">⭐ Best {best.pct}%</span>
                    ) : (
                      <span className="tile-best new">New!</span>
                    ))}
                </div>
                {deck.reversible && (
                  <div className="tile-dirbests">
                    {[
                      { label: dirs.fwd, b: fwdBest },
                      { label: dirs.rev, b: revBest },
                    ].map(({ label, b }) => (
                      <span className="dirbest" key={label}>
                        <span className="dirbest-label">{label}</span>
                        <span className={'dirbest-val' + (b ? '' : ' none')}>
                          {b ? '⭐ ' + b.pct + '%' : 'New!'}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {deckDue && <div className="review-due">🔄 Review due — ace any direction</div>}
              </div>
              {deckMastered && <div className={'tile-crown' + (deckDue ? ' due' : '')}>👑</div>}
            </button>
          )
        })}
      </div>

      <footer className="home-foot">Tap a level to start • Works offline</footer>
    </div>
  )
}
