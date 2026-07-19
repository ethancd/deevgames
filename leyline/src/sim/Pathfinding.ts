import { GridPos, TileType } from './types'

interface Node {
  col: number
  row: number
  g: number
  h: number
  f: number
  parent: Node | null
}

const WALKABLE = new Set<TileType>([
  TileType.GRASS,
  TileType.PATH,
  TileType.FLOWERS,
  TileType.MOSS,
  TileType.MUSHROOM,
  TileType.DIRT,
  TileType.HOLE,
  TileType.PLANTED,
])

export function isWalkable(tile: TileType): boolean {
  return WALKABLE.has(tile)
}

function heuristic(a: GridPos, b: GridPos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
}

const DIRS = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
]

export function findPath(
  grid: TileType[][],
  start: GridPos,
  end: GridPos,
): GridPos[] | null {
  const rows = grid.length
  const cols = grid[0].length

  if (
    end.row < 0 || end.row >= rows ||
    end.col < 0 || end.col >= cols ||
    !isWalkable(grid[end.row][end.col])
  ) {
    return null
  }

  const open: Node[] = []
  const closed = new Set<string>()
  const key = (c: number, r: number) => `${c},${r}`

  const startNode: Node = {
    col: start.col,
    row: start.row,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  }
  open.push(startNode)

  while (open.length > 0) {
    let lowestIdx = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[lowestIdx].f) lowestIdx = i
    }
    const current = open[lowestIdx]

    if (current.col === end.col && current.row === end.row) {
      const path: GridPos[] = []
      let node: Node | null = current
      while (node) {
        path.unshift({ col: node.col, row: node.row })
        node = node.parent
      }
      return path
    }

    open.splice(lowestIdx, 1)
    closed.add(key(current.col, current.row))

    for (const dir of DIRS) {
      const nc = current.col + dir.col
      const nr = current.row + dir.row

      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      if (closed.has(key(nc, nr))) continue
      if (!isWalkable(grid[nr][nc])) continue

      const g = current.g + 1
      const h = heuristic({ col: nc, row: nr }, end)
      const f = g + h

      const existing = open.find(n => n.col === nc && n.row === nr)
      if (existing) {
        if (g < existing.g) {
          existing.g = g
          existing.f = f
          existing.parent = current
        }
        continue
      }

      open.push({ col: nc, row: nr, g, h, f, parent: current })
    }
  }

  return null
}
