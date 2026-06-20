import { GridPos, WORLD_COLS, WORLD_ROWS } from '../sim/types'

export const ISO_TILE_W = 64
export const ISO_TILE_H = 32
export const HALF_W = 32
export const HALF_H = 16

export function gridToScreen(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * HALF_W,
    y: (col + row) * HALF_H,
  }
}

export function gridToScreenCenter(col: number, row: number): { x: number; y: number } {
  return gridToScreen(col, row)
}

export function screenToGrid(sx: number, sy: number): GridPos | null {
  const col = Math.floor((sx / HALF_W + sy / HALF_H) / 2)
  const row = Math.floor((sy / HALF_H - sx / HALF_W) / 2)
  if (col < 0 || col >= WORLD_COLS || row < 0 || row >= WORLD_ROWS) return null
  return { col, row }
}

export function isoDepth(col: number, row: number, subLayer = 0): number {
  return 1000 + (col + row) * 10 + subLayer
}

export function isoWorldBounds(): { x: number; y: number; width: number; height: number } {
  const topLeft = gridToScreen(0, 0)
  const topRight = gridToScreen(WORLD_COLS - 1, 0)
  const bottomLeft = gridToScreen(0, WORLD_ROWS - 1)
  const bottomRight = gridToScreen(WORLD_COLS - 1, WORLD_ROWS - 1)

  const minX = bottomLeft.x - ISO_TILE_W
  const maxX = topRight.x + ISO_TILE_W
  const minY = topLeft.y - ISO_TILE_H
  const maxY = bottomRight.y + ISO_TILE_H * 4

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
