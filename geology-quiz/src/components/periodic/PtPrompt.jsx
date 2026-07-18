import ElementTile from './ElementTile.jsx'
import ElementPhoto from './ElementPhoto.jsx'

function fieldName(f) {
  if (f === 'atomicNumber') return 'Atomic number'
  if (f === 'symbol') return 'Symbol'
  return 'Name'
}

// The question prompt. A categorical question (family/block/type) can safely show
// the whole element tile; a field question shows only the prompting field on a
// card (so it never reveals the answer). `accent` is neutral in mixed gauntlets.
export default function PtPrompt({ q, accent }) {
  if (q.promptIsTile) {
    return (
      <div className="q-prompt">
        <div className="face-visuals">
          <ElementTile el={q.el} size={140} />
          <ElementPhoto el={q.el} size={140} />
        </div>
        <div className="q-ask">{q.askLabel}?</div>
      </div>
    )
  }
  return (
    <div className="q-prompt">
      <div className="pt-prompt-card" style={{ '--accent': accent || '#475569' }}>
        <div className="pt-prompt-field">{fieldName(q.fromField)}</div>
        <div className="pt-prompt-value">{q.prompt}</div>
      </div>
      <div className="q-ask">{q.askLabel}?</div>
    </div>
  )
}
