export interface SceneRect { x: number; y: number; width: number; height: number }

export function overlaps(a: SceneRect, b: SceneRect, gap = 6): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}

// Keep everyone in the scene. Try a close group first, then pack the remaining
// space, reducing marker size only when the full group would not fit.
export function placeScenePeople(width: number, height: number, obstacles: SceneRect[], count: number, compact: boolean, placeType?: string): SceneRect[] {
  const gap = 4, edge = 8
  let placed: SceneRect[] = []
  for (const [w, h] of compact ? [[68, 84], [60, 68]] : [[80, 100], [68, 84], [60, 68]]) {
    const groupY = placeType === 'SHOP' ? height * .23 : placeType === 'FARM' ? height * .30 : height * .58
    const preferred = [-1, 1].flatMap(row => [-1, 1].map(column => ({
      x: Math.round(width / 2 + column * (w + gap) / 2 - w / 2),
      y: Math.round(groupY + row * (h + gap) / 2 - h / 2), width: w, height: h,
    })))
    // Include obstacle edges so small usable gaps aren't skipped by a coarse grid.
    const xs = new Set([edge, width - edge - w, ...obstacles.flatMap(rect => [rect.x - gap - w, rect.x + rect.width + gap])])
    const ys = new Set([edge, height - edge - h, ...obstacles.flatMap(rect => [rect.y - gap - h, rect.y + rect.height + gap])])
    for (let x = edge; x + w <= width - edge; x += w + gap) xs.add(x)
    for (let y = edge; y + h <= height - edge; y += h + gap) ys.add(y)
    const packed = [...ys].sort((a, b) => a - b).flatMap(y => [...xs].sort((a, b) => a - b).map(x => ({x, y, width: w, height: h})))
    for (const candidates of [[...preferred, ...packed], packed]) {
      const attempt: SceneRect[] = []
      for (const candidate of candidates) {
        if (attempt.length >= count) return attempt
        if (candidate.x < edge || candidate.y < edge || candidate.x + w > width - edge || candidate.y + h > height - edge) continue
        if ([...obstacles, ...attempt].some(rect => overlaps(candidate, rect, gap))) continue
        attempt.push(candidate)
      }
      if (attempt.length >= count) return attempt
      if (attempt.length > placed.length) placed = attempt
    }
  }
  // Exceptionally crowded/short scenes can scroll to extra rows, keeping every
  // portrait reachable without a separate People panel or covering scene actions.
  const w = compact ? 68 : 80, h = compact ? 84 : 100
  const columns = Math.max(1, Math.floor((width - edge * 2 + gap) / (w + gap)))
  const remaining = count - placed.length
  for (let i = 0; i < remaining; i++) {
    const rowCount = Math.min(columns, remaining - Math.floor(i / columns) * columns)
    const rowWidth = rowCount * (w + gap) - gap
    placed.push({x: (width - rowWidth) / 2 + i % columns * (w + gap), y: height + gap + Math.floor(i / columns) * (h + gap), width: w, height: h})
  }
  return placed
}
