import { describe, it, expect } from 'vitest'
import { findPath, isWalkable } from '../../src/sim/Pathfinding'
import { TileType } from '../../src/sim/types'

function makeGrid(rows: number, cols: number, fill: TileType = TileType.GRASS): TileType[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(fill))
}

describe('findPath', () => {
  it('finds a straight-line path on open grid', () => {
    const grid = makeGrid(5, 5)
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 })
    expect(path).not.toBeNull()
    expect(path!.length).toBe(5)
    expect(path![0]).toEqual({ col: 0, row: 0 })
    expect(path![4]).toEqual({ col: 4, row: 0 })
  })

  it('routes around obstacles', () => {
    const grid = makeGrid(5, 5)
    grid[0][2] = TileType.STONE
    grid[1][2] = TileType.STONE
    grid[2][2] = TileType.STONE
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 })
    expect(path).not.toBeNull()
    expect(path!.every(p => grid[p.row][p.col] !== TileType.STONE)).toBe(true)
  })

  it('returns null for unreachable target', () => {
    const grid = makeGrid(3, 3)
    grid[0][1] = TileType.STONE
    grid[1][1] = TileType.STONE
    grid[2][1] = TileType.STONE
    const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 })
    expect(path).toBeNull()
  })

  it('returns null for unwalkable target tile', () => {
    const grid = makeGrid(3, 3)
    grid[0][2] = TileType.WATER
    const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 })
    expect(path).toBeNull()
  })

  it('handles same start and end', () => {
    const grid = makeGrid(3, 3)
    const path = findPath(grid, { col: 1, row: 1 }, { col: 1, row: 1 })
    expect(path).not.toBeNull()
    expect(path!.length).toBe(1)
  })
})

describe('isWalkable', () => {
  it('grass, path, dirt, flowers are walkable', () => {
    expect(isWalkable(TileType.GRASS)).toBe(true)
    expect(isWalkable(TileType.PATH)).toBe(true)
    expect(isWalkable(TileType.DIRT)).toBe(true)
    expect(isWalkable(TileType.FLOWERS)).toBe(true)
    expect(isWalkable(TileType.MOSS)).toBe(true)
  })

  it('stone and water are not walkable', () => {
    expect(isWalkable(TileType.STONE)).toBe(false)
    expect(isWalkable(TileType.WATER)).toBe(false)
  })
})
