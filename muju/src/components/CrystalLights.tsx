import './CrystalLights.css';

// Inset from shared borders. Each edge group goes top → left → right → bottom.
// Corners follow the same sweep: top-left → bottom-left → top-right → bottom-right.
const MIDPOINTS = [[50, 10], [10, 50], [90, 50], [50, 90]] as const;
const CORNERS = [[10, 10], [10, 90], [90, 10], [90, 90]] as const;
const EXTRA_EDGES = [
  [30, 10], [10, 70], [90, 30], [70, 90],
  [70, 10], [10, 30], [90, 70], [30, 90],
] as const;
// Mine the extra edge lights first, then corners, then midpoints. A depleted
// 16 therefore looks exactly like a fresh 8 or 4, with no surviving dot moving.
const MINING_ORDER = [...EXTRA_EDGES, ...CORNERS, ...MIDPOINTS];

export function crystalLightSlots(remaining: number) {
  const count = Math.max(0, Math.min(16, Math.floor(remaining)));
  return MINING_ORDER.slice(16 - count).map(([x, y]) => ({ x, y }));
}

export function CrystalLights({ remaining }: { remaining: number }) {
  return <svg className="crystal-lights" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    {crystalLightSlots(remaining).map(({ x, y }) =>
      <g key={`${x}-${y}`} className="crystal-light" transform={`translate(${x} ${y})`}>
        <circle className="crystal-halo" r="6" />
        <circle className="crystal-aura" r="3.8" />
        <circle className="crystal-core" r="2.15" />
      </g>)}
  </svg>;
}
