export interface SceneRect { x: number; y: number; width: number; height: number }

export function overlaps(a: SceneRect, b: SceneRect, gap = 6): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}

// Prefer landscape positions, then search remaining space. A crowded scene uses
// the People list instead of placing a character over an existing control.
export function placeScenePeople(width: number, height: number, obstacles: SceneRect[], count: number, compact: boolean, placeType?: string): SceneRect[] {
  const w = compact ? 72 : 88, h = compact ? 88 : 104
  const preferred = placeType === 'SHOP' ? [[.25, .28], [.75, .30], [.5, .30]]
    : placeType === 'FARM' ? [[.17, .30], [.83, .32], [.5, .82]]
    : [[.23, .65], [.77, .60], [.5, .35]]
  const candidates = preferred.map(([x, y]) => ({x: Math.round(width * x - w / 2), y: Math.round(height * y - h / 2), width: w, height: h}))
  for (let y = 58; y + h <= height - 8; y += 16) {
    for (let x = 8; x + w <= width - 8; x += 16) candidates.push({x, y, width: w, height: h})
  }
  const placed: SceneRect[] = []
  for (const candidate of candidates) {
    if (placed.length >= Math.min(count, compact ? 2 : 3)) break
    if (candidate.x < 8 || candidate.y < 54 || candidate.x + w > width - 8 || candidate.y + h > height - 8) continue
    if ([...obstacles, ...placed].some(rect => overlaps(candidate, rect))) continue
    placed.push(candidate)
  }
  return placed
}
