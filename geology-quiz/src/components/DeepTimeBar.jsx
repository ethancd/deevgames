// A shared deep-time scale. Everything is positioned on a TRUE LINEAR scale
// from 4600 Mya (Earth forms, far left) to today (far right), so a kid can see
// that 2.6 Mya sits jammed against "today" while 4600 Mya is a whole bar away —
// and that all the famous fossils are squished into the last thin sliver.

const OLDEST = 4600 // Mya, Earth's formation

// distance from the LEFT edge, as a %: 4600 -> 0%, 0 -> 100%
const posPct = (age) => ((OLDEST - age) / OLDEST) * 100

function fractionLabel(age) {
  const pct = (age / OLDEST) * 100
  if (pct >= 1) return Math.round(pct) + '%'
  return pct.toFixed(2) + '%'
}

export default function DeepTimeBar({ items, activeName, activeAge, activeAgeStr }) {
  const activePos = activeAge != null ? posPct(activeAge) : null
  const phanerozoicLeft = posPct(541) // start of "visible life"

  return (
    <div className="dtb">
      <div className="dtb-track">
        {/* the slice of time with abundant visible life / fossils */}
        <div className="dtb-life" style={{ left: phanerozoicLeft + '%' }}>
          <span className="dtb-life-label">🦕 fossils &amp; visible life</span>
        </div>

        {/* a faint tick for every span in the deck */}
        {items.map((it, i) => (
          <div
            key={i}
            className={'dtb-tick' + (it.name === activeName ? ' on' : '')}
            style={{ left: posPct(it.age) + '%' }}
          />
        ))}

        {/* the moving marker for the current card */}
        {activePos != null && (
          <div className="dtb-pin" style={{ left: activePos + '%' }}>
            <div className="dtb-pin-dot" />
          </div>
        )}
      </div>

      <div className="dtb-axis">
        <span className="dtb-end">
          <strong>4600</strong> Mya
          <small>Earth forms</small>
        </span>
        <span className="dtb-end right">
          <strong>0</strong>
          <small>today</small>
        </span>
      </div>

      {activePos != null && (
        <div className="dtb-caption">
          <span className="dtb-dot-key" /> <strong>{activeName}</strong> began{' '}
          {activeAgeStr} Mya — only the last{' '}
          <strong>{fractionLabel(activeAge)}</strong> of Earth's history
        </div>
      )}
    </div>
  )
}
