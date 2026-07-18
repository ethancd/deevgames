// Idealized crystal-form line drawings. Each mineral in Tier 1 of the formulas
// deck grows in a characteristic shape; we draw the geometry (solid = visible
// edges, dashed = hidden edges) next to the real specimen photo so a kid links
// "halite → cube", "quartz → hexagonal prism", etc.

const SHAPES = {
  cube: {
    label: 'Cube',
    solid: [
      'M25,40 L70,40 L70,85 L25,85 Z', // front
      'M25,40 L45,22 L90,22 L70,40', // top
      'M70,40 L90,22 L90,67 L70,85', // right
    ],
    dashed: ['M25,85 L45,67 L90,67', 'M45,67 L45,22'],
  },
  octahedron: {
    label: 'Octahedron',
    solid: [
      'M50,12 L16,50 L50,88 L84,50 Z', // outline
      'M16,50 L50,60 L84,50', // front equator
      'M50,12 L50,60 L50,88', // front vertical
    ],
    dashed: ['M16,50 L50,40 L84,50', 'M50,12 L50,40 L50,88'],
  },
  tetrahedron: {
    label: 'Tetrahedron',
    solid: ['M50,12 L18,82 L82,82 Z', 'M50,12 L50,60'],
    dashed: ['M50,60 L18,82', 'M50,60 L82,82'],
  },
  'hex-prism': {
    label: 'Hexagonal prism',
    solid: [
      'M74,30 L62,39 L38,39 L26,30 L38,21 L62,21 Z', // top hexagon
      'M26,30 L26,72', // verticals
      'M38,39 L38,81',
      'M62,39 L62,81',
      'M74,30 L74,72',
      'M26,72 L38,81 L62,81 L74,72', // bottom front
    ],
    dashed: [],
  },
  rhombohedron: {
    label: 'Rhombohedron',
    solid: [
      'M33,38 L78,38 L70,82 L25,82 Z', // front (leaning)
      'M33,38 L51,24 L96,24 L78,38', // top
      'M78,38 L96,24 L88,68 L70,82', // right
    ],
    dashed: ['M25,82 L43,68 L88,68', 'M43,68 L51,24'],
  },
}

export default function CrystalShape({ shape, size = 120, showLabel = true }) {
  const def = SHAPES[shape]
  if (!def) return null
  return (
    <div className="crystal">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 110"
        fill="none"
        aria-label={def.label + ' crystal form'}
      >
        {/* faint fill on the main face for a little solidity */}
        <path d={def.solid[0]} fill="var(--accent)" fillOpacity="0.1" stroke="none" />
        {def.dashed.map((d, i) => (
          <path
            key={'d' + i}
            d={d}
            stroke="#94a3b8"
            strokeWidth="2"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {def.solid.map((d, i) => (
          <path
            key={'s' + i}
            d={d}
            stroke="#1e293b"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      {showLabel && <div className="crystal-label">{def.label}</div>}
    </div>
  )
}
