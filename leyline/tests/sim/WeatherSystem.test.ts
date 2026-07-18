import { describe, it, expect, beforeEach } from 'vitest'
import { World } from '../../src/sim/World'
import {
  Layer, TileType, SeedType, GrowthStage, ResourceType,
  GridPos,
} from '../../src/sim/types'
import {
  tickWeather, advanceClock, isDaytime, createDefaultWeather,
  weatherFeedTick, FEED_EVERY_N_TICKS,
  DAY_CYCLE_MS, CLOCK_STEP,
} from '../../src/sim/WeatherSystem'

let world: World

beforeEach(() => {
  world = new World()
})

function makeHole(pos: GridPos): void {
  world.state.surface[pos.row][pos.col] = TileType.HOLE
  world.state.underground[pos.row][pos.col] = TileType.HOLE
}

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

function triggerFeed(): void {
  for (let i = 0; i < FEED_EVERY_N_TICKS; i++) {
    weatherFeedTick(world.state)
  }
}

describe('isDaytime', () => {
  it('returns true for noon (0.5)', () => {
    expect(isDaytime(0.5)).toBe(true)
  })

  it('returns true at dawn boundary (0.25)', () => {
    expect(isDaytime(0.25)).toBe(true)
  })

  it('returns false at dusk boundary (0.75)', () => {
    expect(isDaytime(0.75)).toBe(false)
  })

  it('returns false at midnight (0.0)', () => {
    expect(isDaytime(0.0)).toBe(false)
  })

  it('returns false just before dawn (0.24)', () => {
    expect(isDaytime(0.24)).toBe(false)
  })
})

describe('createDefaultWeather', () => {
  it('starts at noon, not raining', () => {
    const w = createDefaultWeather()
    expect(w.timeOfDay).toBe(0.5)
    expect(w.isRaining).toBe(false)
    expect(w.weatherFeedTimer).toBe(0)
    expect(w.rainTimer).toBeGreaterThan(0)
  })
})

describe('advanceClock', () => {
  it('advances timeOfDay by one CLOCK_STEP per call', () => {
    world.state.weather.timeOfDay = 0.0
    advanceClock(world.state)
    expect(world.state.weather.timeOfDay).toBeCloseTo(CLOCK_STEP, 5)
  })

  it('wraps timeOfDay around 1.0 and increments dayCount', () => {
    world.state.weather.timeOfDay = 1.0 - CLOCK_STEP / 2
    world.state.weather.dayCount = 3
    advanceClock(world.state)
    expect(world.state.weather.timeOfDay).toBeLessThan(CLOCK_STEP)
    expect(world.state.weather.dayCount).toBe(4)
  })
})

describe('weatherFeedTick — surface plant feeding', () => {
  it('feeds sunlight to surface plants during day + sunny', () => {
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = false

    placeGrowingPlant({ col: 6, row: 6 }, SeedType.WATER_LILY, Layer.SURFACE, GrowthStage.SEED)
    const plant = world.state.plants[`${Layer.SURFACE}:6,6`]
    expect(plant.sunlightFed).toBe(0)

    triggerFeed()

    expect(plant.sunlightFed).toBe(1)
  })

  it('feeds water to surface plants during rain', () => {
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = true

    placeGrowingPlant({ col: 6, row: 6 }, SeedType.SUNFLOWER, Layer.SURFACE, GrowthStage.SEED)
    const plant = world.state.plants[`${Layer.SURFACE}:6,6`]
    expect(plant.waterFed).toBe(0)

    triggerFeed()

    expect(plant.waterFed).toBe(1)
  })

  it('feeds water during night + rain', () => {
    world.state.weather.timeOfDay = 0.0
    world.state.weather.isRaining = true

    placeGrowingPlant({ col: 6, row: 6 }, SeedType.SUNFLOWER, Layer.SURFACE, GrowthStage.SEED)
    const plant = world.state.plants[`${Layer.SURFACE}:6,6`]

    triggerFeed()

    expect(plant.waterFed).toBe(1)
  })

  it('does not feed during night + clear', () => {
    world.state.weather.timeOfDay = 0.0
    world.state.weather.isRaining = false

    placeGrowingPlant({ col: 6, row: 6 }, SeedType.SUNFLOWER, Layer.SURFACE, GrowthStage.SEED)
    placeGrowingPlant({ col: 7, row: 6 }, SeedType.WATER_LILY, Layer.SURFACE, GrowthStage.SEED)
    const sunflower = world.state.plants[`${Layer.SURFACE}:6,6`]
    const lily = world.state.plants[`${Layer.SURFACE}:7,6`]

    triggerFeed()

    expect(sunflower.waterFed).toBe(0)
    expect(lily.sunlightFed).toBe(0)
  })

  it('does not feed mature surface plants', () => {
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = false

    placeGrowingPlant({ col: 6, row: 6 }, SeedType.WATER_LILY, Layer.SURFACE, GrowthStage.MATURE)
    const plant = world.state.plants[`${Layer.SURFACE}:6,6`]

    triggerFeed()

    expect(plant.sunlightFed).toBe(0)
  })

  it('does not feed underground plants via surface weather', () => {
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = false

    placeGrowingPlant({ col: 10, row: 10 }, SeedType.ROOTWEAVE, Layer.UNDERGROUND, GrowthStage.SEED)
    const plant = world.state.plants[`${Layer.UNDERGROUND}:10,10`]

    triggerFeed()

    expect(plant.sunlightFed).toBe(0)
    expect(plant.waterFed).toBe(0)
  })
})

describe('weatherFeedTick — hole ambient feeding', () => {
  it('feeds sunlight to underground plants adjacent to holes during day + sunny', () => {
    makeHole({ col: 6, row: 6 })
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = false

    placeGrowingPlant({ col: 7, row: 7 }, SeedType.ROOTWEAVE, Layer.UNDERGROUND, GrowthStage.SPROUT)
    const plant = world.state.plants[`${Layer.UNDERGROUND}:7,7`]
    expect(plant.sunlightFed).toBe(0)

    triggerFeed()

    expect(plant.sunlightFed).toBe(1)
  })

  it('feeds water to hole-adjacent underground plants during rain', () => {
    makeHole({ col: 6, row: 6 })
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = true

    placeGrowingPlant({ col: 7, row: 6 }, SeedType.ROOTWEAVE, Layer.UNDERGROUND, GrowthStage.SPROUT)
    const plant = world.state.plants[`${Layer.UNDERGROUND}:7,6`]

    triggerFeed()

    expect(plant.waterFed).toBe(1)
  })

  it('feeds all 8 directions from hole', () => {
    makeHole({ col: 6, row: 6 })
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = false

    const positions = [
      { col: 5, row: 5 }, { col: 6, row: 5 }, { col: 7, row: 5 },
      { col: 5, row: 6 },                       { col: 7, row: 6 },
      { col: 5, row: 7 }, { col: 6, row: 7 }, { col: 7, row: 7 },
    ]
    for (const pos of positions) {
      world.state.underground[pos.row][pos.col] = TileType.DIRT
      placeGrowingPlant(pos, SeedType.ROOTWEAVE, Layer.UNDERGROUND, GrowthStage.SPROUT)
    }

    triggerFeed()

    for (const pos of positions) {
      const plant = world.state.plants[`${Layer.UNDERGROUND}:${pos.col},${pos.row}`]
      expect(plant.sunlightFed).toBe(1)
    }
  })

  it('does not feed underground plants far from holes', () => {
    makeHole({ col: 6, row: 6 })
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = false

    placeGrowingPlant({ col: 8, row: 8 }, SeedType.ROOTWEAVE, Layer.UNDERGROUND, GrowthStage.SPROUT)
    const plant = world.state.plants[`${Layer.UNDERGROUND}:8,8`]

    triggerFeed()

    expect(plant.sunlightFed).toBe(0)
  })

  it('does not feed during night + clear', () => {
    makeHole({ col: 6, row: 6 })
    world.state.weather.timeOfDay = 0.0
    world.state.weather.isRaining = false

    placeGrowingPlant({ col: 7, row: 6 }, SeedType.ROOTWEAVE, Layer.UNDERGROUND, GrowthStage.SPROUT)
    const plant = world.state.plants[`${Layer.UNDERGROUND}:7,6`]

    triggerFeed()

    expect(plant.sunlightFed).toBe(0)
    expect(plant.waterFed).toBe(0)
  })
})

describe('weatherFeedTick — feed accumulation', () => {
  it('feeds multiple times across multiple feed cycles', () => {
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = false

    placeGrowingPlant({ col: 6, row: 6 }, SeedType.WATER_LILY, Layer.SURFACE, GrowthStage.SEED)
    const plant = world.state.plants[`${Layer.SURFACE}:6,6`]

    for (let i = 0; i < 3; i++) {
      triggerFeed()
    }

    expect(plant.stage).toBe(GrowthStage.SPROUT)
    expect(plant.sunlightFed).toBe(1)
  })
})

describe('tickWeather — rain state changes', () => {
  it('toggles rain off when rain timer expires', () => {
    world.state.weather.isRaining = true
    world.state.weather.rainTimer = 100

    tickWeather(world.state, 200)

    expect(world.state.weather.isRaining).toBe(false)
    expect(world.state.weather.rainTimer).toBeGreaterThan(0)
  })
})

describe('weatherFeedTick — magic tree feeding', () => {
  it('feeds tree sunlight during day + sunny', () => {
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = false

    triggerFeed()

    expect(world.state.treeBuffer[ResourceType.SUNLIGHT as string]).toBe(1)
  })

  it('feeds tree water during rain', () => {
    world.state.weather.timeOfDay = 0.5
    world.state.weather.isRaining = true

    triggerFeed()

    expect(world.state.treeBuffer[ResourceType.WATER as string]).toBe(1)
  })

  it('does not feed tree during night + clear', () => {
    world.state.weather.timeOfDay = 0.0
    world.state.weather.isRaining = false

    triggerFeed()

    expect(world.state.treeBuffer[ResourceType.SUNLIGHT as string] ?? 0).toBe(0)
    expect(world.state.treeBuffer[ResourceType.WATER as string] ?? 0).toBe(0)
  })
})

describe('World constructor — weather backwards compat', () => {
  it('new world has weather state', () => {
    const w = new World()
    expect(w.state.weather).toBeDefined()
    expect(w.state.weather.timeOfDay).toBeGreaterThanOrEqual(0)
    expect(w.state.weather.timeOfDay).toBeLessThanOrEqual(1)
  })
})
