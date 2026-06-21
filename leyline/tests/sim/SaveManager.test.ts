import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveState, loadState, clearSave, hasSave } from '../../src/sim/SaveManager'
import { WorldState, Layer, TileType, SeedType, GrowthStage } from '../../src/sim/types'

function makeMinimalState(): WorldState {
  return {
    surface: [[TileType.GRASS]],
    underground: [[TileType.DIRT]],
    playerPos: { col: 6, row: 6 },
    playerLayer: Layer.SURFACE,
    inventory: {
      water: 5, crystalRed: 2, crystalBlue: 1, sunlight: 3,
      seeds: {} as Record<SeedType, number>,
    },
    carriedItem: null,
    seedStock: {} as Record<SeedType, number>,
    digDepths: { 'surface:5,5': 3 },
    plants: {
      'surface:2,2': {
        pos: { col: 2, row: 2 },
        layer: Layer.SURFACE,
        seedType: SeedType.WATER_LILY,
        stage: GrowthStage.SPROUT,
        waterFed: 1, crystalFed: 0, sunlightFed: 2,
        transmuteInput1: 0, transmuteInput2: 0,
      },
    },
    leylines: [
      {
        id: 'ley_0',
        path: [{ col: 5, row: 5 }, { col: 6, row: 5 }],
        layer: Layer.SURFACE,
      },
    ],
    portal: { pos: { col: 12, row: 4 }, greenCrystalFed: 3, musicNotesFed: 2, level: 0 },
    unlocks: { leyline: true },
    treeBuffer: { water: 5, sunlight: 2 },
    treePurchases: { sunflower: 1 },
  }
}

// Mock localStorage for node environment
let store: Record<string, string>

beforeEach(() => {
  store = {}
  const mockStorage = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  }
  ;(globalThis as any).localStorage = mockStorage
})

afterEach(() => {
  delete (globalThis as any).localStorage
})

describe('saveState / loadState round-trip', () => {
  it('saves and loads state correctly', () => {
    const state = makeMinimalState()
    saveState(state)
    const result = loadState()
    expect(result).not.toBeNull()
    expect(result!.state.playerPos).toEqual({ col: 6, row: 6 })
    expect(result!.state.playerLayer).toBe(Layer.SURFACE)
    expect(result!.state.inventory.water).toBe(5)
    expect(result!.state.unlocks.leyline).toBe(true)
    expect(result!.savedAt).toBeGreaterThan(0)
  })

  it('preserves plant data through save/load', () => {
    const state = makeMinimalState()
    saveState(state)
    const result = loadState()!
    const plant = result.state.plants['surface:2,2']
    expect(plant).toBeDefined()
    expect(plant.seedType).toBe(SeedType.WATER_LILY)
    expect(plant.stage).toBe(GrowthStage.SPROUT)
    expect(plant.sunlightFed).toBe(2)
  })

  it('preserves leyline data through save/load', () => {
    const state = makeMinimalState()
    saveState(state)
    const result = loadState()!
    expect(result.state.leylines).toHaveLength(1)
    expect(result.state.leylines[0].id).toBe('ley_0')
    expect(result.state.leylines[0].path).toHaveLength(2)
  })

  it('preserves portal data through save/load', () => {
    const state = makeMinimalState()
    saveState(state)
    const result = loadState()!
    expect(result.state.portal.greenCrystalFed).toBe(3)
    expect(result.state.portal.musicNotesFed).toBe(2)
  })

  it('preserves carried item through save/load', () => {
    const state = makeMinimalState()
    state.carriedItem = { type: 'resource', resource: 'water' as any }
    saveState(state)
    const result = loadState()!
    expect(result.state.carriedItem).toEqual({ type: 'resource', resource: 'water' })
  })

  it('preserves tree buffer and purchases', () => {
    const state = makeMinimalState()
    saveState(state)
    const result = loadState()!
    expect(result.state.treeBuffer).toEqual({ water: 5, sunlight: 2 })
    expect(result.state.treePurchases).toEqual({ sunflower: 1 })
  })
})

describe('loadState with old format (backwards compat)', () => {
  it('handles old format where WorldState was saved directly (no wrapper)', () => {
    const state = makeMinimalState()
    // Old format: localStorage contains the WorldState directly (not wrapped in { state, savedAt })
    store['leyline_garden_save'] = JSON.stringify(state)
    const result = loadState()
    expect(result).not.toBeNull()
    expect(result!.state.playerPos).toEqual({ col: 6, row: 6 })
    // savedAt should be set to current time for old format
    expect(result!.savedAt).toBeGreaterThan(0)
  })
})

describe('loadState edge cases', () => {
  it('returns null when no save exists', () => {
    expect(loadState()).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    store['leyline_garden_save'] = 'not valid json {'
    expect(loadState()).toBeNull()
  })
})

describe('clearSave', () => {
  it('removes the save from storage', () => {
    const state = makeMinimalState()
    saveState(state)
    expect(hasSave()).toBe(true)
    clearSave()
    expect(hasSave()).toBe(false)
    expect(loadState()).toBeNull()
  })
})

describe('hasSave', () => {
  it('returns false when no save exists', () => {
    expect(hasSave()).toBe(false)
  })

  it('returns true after saving', () => {
    saveState(makeMinimalState())
    expect(hasSave()).toBe(true)
  })
})
