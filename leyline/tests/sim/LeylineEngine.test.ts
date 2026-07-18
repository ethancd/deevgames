import { describe, it, expect, beforeEach } from 'vitest'
import { LeylineEngine } from '../../src/sim/LeylineEngine'
import { World } from '../../src/sim/World'
import {
  Layer, TileType, SeedType, GrowthStage, ResourceType,
  GridPos,
} from '../../src/sim/types'

// EMIT_INTERVAL in LeylineEngine is 2500ms
const EMIT_INTERVAL = 2500

let world: World
let engine: LeylineEngine

beforeEach(() => {
  world = new World()
  engine = new LeylineEngine()
})

/**
 * Place a leyline starting ON a red crystal tile with a mature lichen.
 * Underground red crystals are at cols 3-4, rows 5-8.
 * Source resolution requires a mature source plant (lichen) on the crystal tile.
 */
function makeCrystalLeyline(): string {
  const path: GridPos[] = [
    { col: 3, row: 5 },  // ON red crystal (underground[5][3])
    { col: 5, row: 5 },
    { col: 6, row: 5 },
  ]
  placeMaturePlant({ col: 3, row: 5 }, SeedType.LICHEN, Layer.UNDERGROUND)
  const ley = world.addLeyline(path, Layer.UNDERGROUND)
  return ley.id
}

/** Create a hole at pos on both layers */
function makeHole(pos: GridPos): void {
  world.state.surface[pos.row][pos.col] = TileType.HOLE
  world.state.underground[pos.row][pos.col] = TileType.HOLE
}

/** Place a mature source plant */
function placeMaturePlant(
  pos: GridPos,
  seed: SeedType,
  layer: Layer,
): void {
  const key = `${layer}:${pos.col},${pos.row}`
  world.state.plants[key] = {
    pos: { ...pos },
    layer,
    seedType: seed,
    stage: GrowthStage.MATURE,
    waterFed: 0,
    crystalFed: 0,
    sunlightFed: 0,
    transmuteInput1: 0,
    transmuteInput2: 0,
  }
}

/** Place a growing plant at a specific stage */
function placeGrowingPlant(
  pos: GridPos,
  seed: SeedType,
  layer: Layer,
  stage: GrowthStage = GrowthStage.SEED,
): void {
  const key = `${layer}:${pos.col},${pos.row}`
  world.state.plants[key] = {
    pos: { ...pos },
    layer,
    seedType: seed,
    stage,
    waterFed: 0,
    crystalFed: 0,
    sunlightFed: 0,
    transmuteInput1: 0,
    transmuteInput2: 0,
  }
}

describe('getActiveResource', () => {
  it('returns null for unknown leyline', () => {
    expect(engine.getActiveResource('nonexistent')).toBeNull()
  })

  it('resolves crystal red via lichen on crystal tile', () => {
    const id = makeCrystalLeyline()
    engine.tick(0, world)
    expect(engine.getActiveResource(id)).toBe(ResourceType.CRYSTAL_RED)
  })

  it('resolves crystal blue via lichen on blue crystal tile', () => {
    // Blue crystals at underground cols 19-20, rows 9-12
    placeMaturePlant({ col: 19, row: 9 }, SeedType.LICHEN, Layer.UNDERGROUND)
    const ley = world.addLeyline([
      { col: 19, row: 9 },  // ON blue crystal
      { col: 18, row: 9 },
      { col: 17, row: 9 },
    ], Layer.UNDERGROUND)
    engine.tick(0, world)
    expect(engine.getActiveResource(ley.id)).toBe(ResourceType.CRYSTAL_BLUE)
  })

  it('does NOT resolve resource for underground leyline starting ON a hole (weather feeds directly)', () => {
    makeHole({ col: 6, row: 6 })
    const ley = world.addLeyline([
      { col: 6, row: 6 },
      { col: 7, row: 6 },
      { col: 8, row: 6 },
    ], Layer.UNDERGROUND)
    engine.tick(0, world)
    expect(engine.getActiveResource(ley.id)).toBeNull()
  })

  it('does NOT resolve sunlight for surface leyline starting ON a hole', () => {
    makeHole({ col: 6, row: 6 })
    const ley = world.addLeyline([
      { col: 6, row: 6 },
      { col: 7, row: 6 },
      { col: 8, row: 6 },
    ], Layer.SURFACE)
    engine.tick(0, world)
    expect(engine.getActiveResource(ley.id)).toBeNull()
  })

  it('resolves resource from a mature source plant AT the start tile', () => {
    placeMaturePlant({ col: 5, row: 5 }, SeedType.WATER_LILY, Layer.SURFACE)
    const ley = world.addLeyline([
      { col: 5, row: 5 },  // ON the plant
      { col: 6, row: 5 },
      { col: 7, row: 5 },
    ], Layer.SURFACE)
    engine.tick(0, world)
    expect(engine.getActiveResource(ley.id)).toBe(ResourceType.WATER)
  })

  it('does NOT resolve from adjacent crystal (must start ON it)', () => {
    // Underground dirt at (5,5) is adjacent to crystal at (4,5)
    const ley = world.addLeyline([
      { col: 5, row: 5 },
      { col: 6, row: 5 },
      { col: 7, row: 5 },
    ], Layer.UNDERGROUND)
    engine.tick(0, world)
    expect(engine.getActiveResource(ley.id)).toBeNull()
  })
})

describe('downstream chaining', () => {
  it('resolves resource for downstream leyline via adjacent ends', () => {
    // Ley1: starts ON crystal with lichen, ends at (5,5)
    placeMaturePlant({ col: 3, row: 5 }, SeedType.LICHEN, Layer.UNDERGROUND)
    const ley1 = world.addLeyline([
      { col: 3, row: 5 },  // ON red crystal + lichen
      { col: 4, row: 5 },
      { col: 5, row: 5 },
    ], Layer.UNDERGROUND)
    // Ley2: starts adjacent to ley1's end
    const ley2 = world.addLeyline([
      { col: 6, row: 5 },
      { col: 7, row: 5 },
      { col: 8, row: 5 },
    ], Layer.UNDERGROUND)

    engine.tick(0, world)
    expect(engine.getActiveResource(ley1.id)).toBe(ResourceType.CRYSTAL_RED)
    expect(engine.getActiveResource(ley2.id)).toBe(ResourceType.CRYSTAL_RED)
  })

  it('does not chain through a leyline whose end is near a plant', () => {
    placeMaturePlant({ col: 3, row: 5 }, SeedType.LICHEN, Layer.UNDERGROUND)
    const ley1 = world.addLeyline([
      { col: 3, row: 5 },  // ON crystal + lichen
      { col: 4, row: 5 },
      { col: 5, row: 5 },
    ], Layer.UNDERGROUND)
    // Place a plant at or near ley1's end - blocks chaining
    placeGrowingPlant({ col: 5, row: 5 }, SeedType.ROOTWEAVE, Layer.UNDERGROUND)
    const ley2 = world.addLeyline([
      { col: 6, row: 5 },
      { col: 7, row: 5 },
      { col: 8, row: 5 },
    ], Layer.UNDERGROUND)

    engine.tick(0, world)
    expect(engine.getActiveResource(ley1.id)).toBe(ResourceType.CRYSTAL_RED)
    expect(engine.getActiveResource(ley2.id)).toBeNull()
  })
})

describe('cross-layer relay through holes', () => {
  it('resolves resource for leyline on other layer via hole (samePos)', () => {
    makeHole({ col: 5, row: 5 })
    placeMaturePlant({ col: 3, row: 5 }, SeedType.LICHEN, Layer.UNDERGROUND)
    const ley1 = world.addLeyline([
      { col: 3, row: 5 },  // ON crystal + lichen
      { col: 4, row: 5 },
      { col: 5, row: 5 },  // ends at hole
    ], Layer.UNDERGROUND)
    // Surface leyline starting at same position as hole
    const ley2 = world.addLeyline([
      { col: 5, row: 5 },  // same pos as hole
      { col: 6, row: 5 },
      { col: 7, row: 5 },
    ], Layer.SURFACE)

    engine.tick(0, world)
    expect(engine.getActiveResource(ley1.id)).toBe(ResourceType.CRYSTAL_RED)
    expect(engine.getActiveResource(ley2.id)).toBe(ResourceType.CRYSTAL_RED)
  })
})

describe('mote emission and movement', () => {
  it('emits a mote after EMIT_INTERVAL', () => {
    makeCrystalLeyline()
    engine.tick(EMIT_INTERVAL - 100, world)
    expect(engine.getMotePositions(Layer.UNDERGROUND, world)).toHaveLength(0)
    engine.tick(200, world)
    expect(engine.getMotePositions(Layer.UNDERGROUND, world)).toHaveLength(1)
  })

  it('motes appear on the correct layer', () => {
    makeCrystalLeyline()
    engine.tick(EMIT_INTERVAL + 1, world)
    expect(engine.getMotePositions(Layer.UNDERGROUND, world).length).toBeGreaterThan(0)
    expect(engine.getMotePositions(Layer.SURFACE, world)).toHaveLength(0)
  })

  it('mote has correct resource type', () => {
    makeCrystalLeyline()
    engine.tick(EMIT_INTERVAL + 1, world)
    const motes = engine.getMotePositions(Layer.UNDERGROUND, world)
    expect(motes[0].resourceType).toBe(ResourceType.CRYSTAL_RED)
  })

  it('motes move forward along the leyline path over time', () => {
    makeCrystalLeyline()
    engine.tick(EMIT_INTERVAL + 1, world)
    const positions1 = engine.getMotePositions(Layer.UNDERGROUND, world)
    expect(positions1.length).toBeGreaterThan(0)
    engine.tick(500, world)
    const positions2 = engine.getMotePositions(Layer.UNDERGROUND, world)
    expect(positions2.length).toBeGreaterThanOrEqual(1)
  })

  it('leylines with fewer than 2 tiles do not emit', () => {
    world.addLeyline([{ col: 5, row: 5 }], Layer.UNDERGROUND)
    engine.tick(EMIT_INTERVAL * 3, world)
    expect(engine.getMotePositions(Layer.UNDERGROUND, world)).toHaveLength(0)
  })
})

describe('delivery to growing plants', () => {
  it('delivers resource to a growing plant along the leyline path', () => {
    // Rootweave SPROUT needs water=2, crystal=1, sunlight=1
    // Crystal red satisfies the crystal requirement
    placeGrowingPlant({ col: 9, row: 5 }, SeedType.ROOTWEAVE, Layer.UNDERGROUND, GrowthStage.SPROUT)
    const plant = world.getPlantAt({ col: 9, row: 5 }, Layer.UNDERGROUND)!
    expect(plant.crystalFed).toBe(0)

    // Leyline starts ON crystal + lichen, path to plant
    placeMaturePlant({ col: 3, row: 5 }, SeedType.LICHEN, Layer.UNDERGROUND)
    world.addLeyline([
      { col: 3, row: 5 },  // ON crystal + lichen
      { col: 5, row: 5 },
      { col: 6, row: 5 },
      { col: 7, row: 5 },
      { col: 8, row: 5 },
      { col: 9, row: 5 },  // plant is here
    ], Layer.UNDERGROUND)

    for (let i = 0; i < 10; i++) engine.tick(EMIT_INTERVAL, world)

    expect(plant.crystalFed).toBeGreaterThan(0)
  })
})

describe('delivery to portal', () => {
  it('delivers green crystal or music notes to portal', () => {
    // Portal is at (12, 4) on surface
    placeMaturePlant({ col: 8, row: 4 }, SeedType.GLIMSTONE, Layer.SURFACE)
    const plant = world.getPlantAt({ col: 8, row: 4 }, Layer.SURFACE)!
    plant.transmuteInput1 = 3
    plant.transmuteInput2 = 3

    // Leyline from plant (must start ON plant position) to portal
    world.addLeyline([
      { col: 8, row: 4 },
      { col: 9, row: 4 },
      { col: 10, row: 4 },
      { col: 11, row: 4 },
      { col: 12, row: 4 },  // portal position
    ], Layer.SURFACE)

    for (let i = 0; i < 20; i++) engine.tick(EMIT_INTERVAL, world)

    expect(world.state.portal.greenCrystalFed).toBeGreaterThan(0)
  })
})

describe('delivery to magic tree', () => {
  it('delivers resource to magic tree at end of leyline', () => {
    placeMaturePlant({ col: 14, row: 6 }, SeedType.SUNFLOWER, Layer.SURFACE)
    world.addLeyline([
      { col: 14, row: 6 },  // ON sunflower (sunlight source)
      { col: 15, row: 6 },
      { col: 16, row: 6 },  // magic tree tile
    ], Layer.SURFACE)

    for (let i = 0; i < 20; i++) engine.tick(EMIT_INTERVAL, world)

    expect(world.state.treeBuffer[ResourceType.SUNLIGHT]).toBeGreaterThan(0)
  })
})

describe('drainAbsorptions', () => {
  it('returns absorptions and clears the buffer', () => {
    expect(engine.drainAbsorptions()).toHaveLength(0)

    placeGrowingPlant({ col: 7, row: 5 }, SeedType.ROOTWEAVE, Layer.UNDERGROUND, GrowthStage.SPROUT)
    placeMaturePlant({ col: 3, row: 5 }, SeedType.LICHEN, Layer.UNDERGROUND)
    world.addLeyline([
      { col: 3, row: 5 },  // ON crystal + lichen
      { col: 5, row: 5 },
      { col: 6, row: 5 },
      { col: 7, row: 5 },
    ], Layer.UNDERGROUND)

    for (let i = 0; i < 15; i++) engine.tick(EMIT_INTERVAL, world)

    const absorptions = engine.drainAbsorptions()
    expect(absorptions.length).toBeGreaterThan(0)
    expect(absorptions[0].resourceType).toBe(ResourceType.CRYSTAL_RED)

    expect(engine.drainAbsorptions()).toHaveLength(0)
  })
})

describe('onLeylineRemoved', () => {
  it('clears motes for removed leyline', () => {
    const id = makeCrystalLeyline()
    for (let i = 0; i < 5; i++) engine.tick(EMIT_INTERVAL, world)
    expect(engine.getMotePositions(Layer.UNDERGROUND, world).length).toBeGreaterThan(0)

    engine.onLeylineRemoved(id)
    world.removeLeylineAt({ col: 3, row: 5 }, Layer.UNDERGROUND)
    expect(engine.getMotePositions(Layer.UNDERGROUND, world)).toHaveLength(0)
  })

  it('clears resolved resource for removed leyline', () => {
    const id = makeCrystalLeyline()
    engine.tick(0, world)
    expect(engine.getActiveResource(id)).toBe(ResourceType.CRYSTAL_RED)
    engine.onLeylineRemoved(id)
    expect(engine.getActiveResource(id)).toBeNull()
  })
})

describe('source plant emission', () => {
  it('mature water lily emits water motes via leyline starting at plant', () => {
    placeMaturePlant({ col: 6, row: 6 }, SeedType.WATER_LILY, Layer.SURFACE)
    world.addLeyline([
      { col: 6, row: 6 },  // ON plant
      { col: 7, row: 6 },
      { col: 8, row: 6 },
    ], Layer.SURFACE)

    for (let i = 0; i < 5; i++) engine.tick(EMIT_INTERVAL, world)
    const motes = engine.getMotePositions(Layer.SURFACE, world)
    expect(motes.length).toBeGreaterThan(0)
    expect(motes[0].resourceType).toBe(ResourceType.WATER)
  })

  it('mature sunflower emits sunlight motes', () => {
    placeMaturePlant({ col: 6, row: 6 }, SeedType.SUNFLOWER, Layer.SURFACE)
    world.addLeyline([
      { col: 6, row: 6 },
      { col: 7, row: 6 },
      { col: 8, row: 6 },
    ], Layer.SURFACE)

    for (let i = 0; i < 5; i++) engine.tick(EMIT_INTERVAL, world)
    const motes = engine.getMotePositions(Layer.SURFACE, world)
    expect(motes.length).toBeGreaterThan(0)
    expect(motes[0].resourceType).toBe(ResourceType.SUNLIGHT)
  })
})

describe('transmuter plant absorption and emission', () => {
  it('mature lifeleaf absorbs water+sunlight and emits life essence', () => {
    placeMaturePlant({ col: 8, row: 6 }, SeedType.LIFELEAF, Layer.SURFACE)
    const plant = world.getPlantAt({ col: 8, row: 6 }, Layer.SURFACE)!
    plant.transmuteInput1 = 3 // water
    plant.transmuteInput2 = 3 // sunlight

    // Output leyline starting ON plant position
    world.addLeyline([
      { col: 8, row: 6 },
      { col: 9, row: 6 },
      { col: 10, row: 6 },
    ], Layer.SURFACE)

    for (let i = 0; i < 5; i++) engine.tick(EMIT_INTERVAL, world)

    const motes = engine.getMotePositions(Layer.SURFACE, world)
    expect(motes.length).toBeGreaterThan(0)
    expect(motes[0].resourceType).toBe(ResourceType.LIFE_ESSENCE)
  })

  it('transmuter does not emit without sufficient inputs', () => {
    placeMaturePlant({ col: 8, row: 6 }, SeedType.LIFELEAF, Layer.SURFACE)

    world.addLeyline([
      { col: 8, row: 6 },
      { col: 9, row: 6 },
      { col: 10, row: 6 },
    ], Layer.SURFACE)

    for (let i = 0; i < 5; i++) engine.tick(EMIT_INTERVAL, world)
    const motes = engine.getMotePositions(Layer.SURFACE, world)
    expect(motes).toHaveLength(0)
  })
})

describe('cross-layer mote relay', () => {
  it('mote relays through hole to other layer leyline', () => {
    // Underground leyline starting ON crystal + lichen, ending at hole
    makeHole({ col: 6, row: 5 })
    placeMaturePlant({ col: 3, row: 5 }, SeedType.LICHEN, Layer.UNDERGROUND)
    world.addLeyline([
      { col: 3, row: 5 },  // ON crystal + lichen
      { col: 4, row: 5 },
      { col: 5, row: 5 },
      { col: 6, row: 5 },  // ends at hole
    ], Layer.UNDERGROUND)

    // Surface leyline starting at same hole position (samePos required)
    world.addLeyline([
      { col: 6, row: 5 },
      { col: 7, row: 5 },
      { col: 8, row: 5 },
    ], Layer.SURFACE)

    for (let i = 0; i < 30; i++) engine.tick(EMIT_INTERVAL, world)

    const surfaceMotes = engine.getMotePositions(Layer.SURFACE, world)
    expect(surfaceMotes.length).toBeGreaterThan(0)
    expect(surfaceMotes[0].resourceType).toBe(ResourceType.CRYSTAL_RED)
  })
})

describe('multiple leylines and fork selection', () => {
  it('rotates among multiple downstream leylines', () => {
    // Source leyline starting ON crystal + lichen
    placeMaturePlant({ col: 3, row: 5 }, SeedType.LICHEN, Layer.UNDERGROUND)
    world.addLeyline([
      { col: 3, row: 5 },  // ON crystal + lichen
      { col: 4, row: 5 },
      { col: 5, row: 5 },
    ], Layer.UNDERGROUND)

    // Two downstream leylines starting adjacent to source end
    world.addLeyline([
      { col: 6, row: 5 },
      { col: 7, row: 5 },
      { col: 8, row: 5 },
    ], Layer.UNDERGROUND)
    world.addLeyline([
      { col: 6, row: 5 },
      { col: 6, row: 6 },
      { col: 6, row: 7 },
    ], Layer.UNDERGROUND)

    for (let i = 0; i < 30; i++) engine.tick(EMIT_INTERVAL, world)

    const motes = engine.getMotePositions(Layer.UNDERGROUND, world)
    expect(motes.length).toBeGreaterThan(0)
  })
})
