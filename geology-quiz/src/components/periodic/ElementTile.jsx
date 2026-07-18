import { FAMILY_COLORS } from '../../periodic/config.js'

// A periodic-table-style colored tile: number top-left, big symbol, name below.
export default function ElementTile({ el, size = 120, showName = true }) {
  const color = FAMILY_COLORS[el.family] || '#64748b'
  return (
    <div
      className={'el-tile' + (showName ? '' : ' compact')}
      style={{ '--el-color': color, width: size, height: size }}
      aria-label={`${el.name}, ${el.symbol}, ${el.atomicNumber}`}
    >
      <div className="el-num">{el.atomicNumber}</div>
      <div className="el-sym">{el.symbol}</div>
      {showName && <div className="el-name">{el.name}</div>}
    </div>
  )
}
