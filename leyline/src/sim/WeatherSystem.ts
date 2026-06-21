import {
  WorldState, WeatherState, Layer, ResourceType, TileType,
  GridPos, GrowthStage, posKey, WORLD_COLS, WORLD_ROWS,
} from './types'
import { getStageReq, crystalTypeForSeed } from './PlantConfig'
import { markDirty } from './SaveManager'

export const DAY_CYCLE_MS = 720_000       // 12 minutes
export const WEATHER_FEED_INTERVAL = 6_000  // 6 seconds (2x speed)
export const CLOCK_STEP = 10 / (24 * 60)  // 10 in-game minutes per emit tick
export const RAIN_CHANCE = 0.3
export const MIN_RAIN_DURATION = 30_000    // 30s (2x speed)
export const MAX_RAIN_DURATION = 120_000   // 2 min (2x speed)
export const MIN_DRY_DURATION = 60_000     // 1 min between rain (2x speed)

const EIGHT_NEIGHBORS: GridPos[] = [
  { col: -1, row: -1 }, { col: 0, row: -1 }, { col: 1, row: -1 },
  { col: -1, row: 0 },                       { col: 1, row: 0 },
  { col: -1, row: 1 },  { col: 0, row: 1 },  { col: 1, row: 1 },
]

export function createDefaultWeather(): WeatherState {
  return {
    timeOfDay: 0.5,     // start at noon
    isRaining: false,
    rainTimer: randomDryDuration(),
    weatherFeedTimer: 0,
    dayCount: 1,
    treeFeedCounter: 0,
  }
}

function randomRainDuration(): number {
  return MIN_RAIN_DURATION + Math.random() * (MAX_RAIN_DURATION - MIN_RAIN_DURATION)
}

function randomDryDuration(): number {
  return MIN_DRY_DURATION + Math.random() * (MAX_RAIN_DURATION - MIN_DRY_DURATION)
}

export function isDaytime(timeOfDay: number): boolean {
  // Day: 0.25 (dawn) to 0.75 (dusk)
  return timeOfDay >= 0.25 && timeOfDay < 0.75
}

function plantKey(layer: Layer, pos: GridPos): string {
  return `${layer}:${posKey(pos)}`
}

/**
 * Try to feed a plant the given resource directly (bypassing leylines).
 * Returns true if the plant accepted the resource.
 */
function feedPlantDirect(state: WorldState, layer: Layer, pos: GridPos, resource: ResourceType): boolean {
  const key = plantKey(layer, pos)
  const plant = state.plants[key]
  if (!plant) return false
  if (plant.stage === GrowthStage.MATURE) return false

  const req = getStageReq(plant.seedType, plant.stage)

  switch (resource) {
    case ResourceType.WATER:
      if (plant.waterFed >= req.water) return false
      plant.waterFed++
      break
    case ResourceType.SUNLIGHT:
      if (plant.sunlightFed >= req.sunlight) return false
      plant.sunlightFed++
      break
    default:
      return false
  }

  // Check if stage is complete
  const done = plant.waterFed >= req.water &&
               plant.crystalFed >= req.crystal &&
               plant.sunlightFed >= req.sunlight
  if (done) {
    const stages = [GrowthStage.SEED, GrowthStage.SPROUT, GrowthStage.SAPLING, GrowthStage.MATURE]
    const i = stages.indexOf(plant.stage)
    if (i >= 0 && i < stages.length - 1) {
      plant.stage = stages[i + 1]
      plant.waterFed = 0
      plant.crystalFed = 0
      plant.sunlightFed = 0
    }
  }

  markDirty()
  return true
}

/**
 * Feed all surface plants based on current weather conditions.
 * Day + Sunny: free sunlight
 * Raining (any time): free water
 * Night + Clear: nothing
 */
function feedSurfacePlants(state: WorldState): void {
  const day = isDaytime(state.weather.timeOfDay)
  const raining = state.weather.isRaining

  let resource: ResourceType | null = null
  if (raining) {
    resource = ResourceType.WATER
  } else if (day) {
    resource = ResourceType.SUNLIGHT
  }

  if (!resource) return

  for (const plant of Object.values(state.plants)) {
    if (plant.layer !== Layer.SURFACE) continue
    if (plant.stage === GrowthStage.MATURE) continue
    feedPlantDirect(state, Layer.SURFACE, plant.pos, resource)
  }
}

/**
 * Feed underground plants adjacent to holes based on weather.
 * Day + Sunny: holes emit sunlight to 8 adjacent underground tiles
 * Raining (any time): holes emit water to 8 adjacent underground tiles
 * Night + Clear: nothing
 */
function feedMagicTree(state: WorldState): void {
  const day = isDaytime(state.weather.timeOfDay)
  const raining = state.weather.isRaining

  let resource: ResourceType | null = null
  if (raining) {
    resource = ResourceType.WATER
  } else if (day) {
    resource = ResourceType.SUNLIGHT
  }

  if (!resource) return

  const key = resource as string
  state.treeBuffer[key] = (state.treeBuffer[key] ?? 0) + 1
  markDirty()
}

function feedHoleAdjacentPlants(state: WorldState): void {
  const day = isDaytime(state.weather.timeOfDay)
  const raining = state.weather.isRaining

  let resource: ResourceType | null = null
  if (raining) {
    resource = ResourceType.WATER
  } else if (day) {
    resource = ResourceType.SUNLIGHT
  }

  if (!resource) return

  // Scan underground for HOLE tiles
  const underground = state.underground
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (underground[r][c] !== TileType.HOLE) continue

      // Feed plants in all 8 adjacent tiles
      for (const d of EIGHT_NEIGHBORS) {
        const adjPos = { col: c + d.col, row: r + d.row }
        if (adjPos.col < 0 || adjPos.col >= WORLD_COLS || adjPos.row < 0 || adjPos.row >= WORLD_ROWS) continue
        feedPlantDirect(state, Layer.UNDERGROUND, adjPos, resource)
      }
    }
  }
}

/**
 * Advance the clock by one tick (5 in-game minutes).
 * Called once per emit tick (every 2.5 seconds).
 */
export function advanceClock(state: WorldState): void {
  const weather = state.weather
  const prevTime = weather.timeOfDay
  weather.timeOfDay = (weather.timeOfDay + CLOCK_STEP) % 1.0
  if (weather.timeOfDay < prevTime) {
    weather.dayCount = (weather.dayCount ?? 1) + 1
  }
}

/**
 * Main weather tick. Call every frame with delta in ms.
 * Handles rain state changes only.
 * Plant feeding is handled by weatherFeedTick() on emit ticks.
 */
export function tickWeather(state: WorldState, delta: number): void {
  const weather = state.weather

  weather.rainTimer -= delta
  if (weather.rainTimer <= 0) {
    if (weather.isRaining) {
      weather.isRaining = false
      weather.rainTimer = randomDryDuration()
    } else {
      if (Math.random() < RAIN_CHANCE) {
        weather.isRaining = true
        weather.rainTimer = randomRainDuration()
      } else {
        weather.rainTimer = randomDryDuration()
      }
    }
    markDirty()
  }
}

export const FEED_EVERY_N_TICKS = 6

/**
 * Called once per emit tick (every 2.5s).
 * Increments the feed counter; every 6th tick feeds plants and tree.
 */
export function weatherFeedTick(state: WorldState): void {
  const weather = state.weather
  weather.treeFeedCounter = (weather.treeFeedCounter ?? 0) + 1
  if (weather.treeFeedCounter >= FEED_EVERY_N_TICKS) {
    weather.treeFeedCounter = 0
    feedSurfacePlants(state)
    feedHoleAdjacentPlants(state)
    feedMagicTree(state)
  }
}

/**
 * Simulate weather effects for an idle period.
 * Returns the number of feed intervals that occurred.
 */
export function simulateIdleWeather(state: WorldState, elapsedMs: number): void {
  const emitTicks = Math.floor(elapsedMs / 2500)
  if (emitTicks <= 0) return

  for (let i = 0; i < emitTicks; i++) {
    advanceClock(state)
  }

  // Feed happens every 6 emit ticks (every 15s real time)
  const feedCycles = Math.floor(emitTicks / FEED_EVERY_N_TICKS)
  if (feedCycles <= 0) return

  // Estimate weather split: day 50%, rain 30%
  const sunlightIntervals = Math.floor(feedCycles * 0.35)
  const waterIntervals = Math.floor(feedCycles * 0.30)

  // Feed surface plants
  for (let i = 0; i < sunlightIntervals; i++) {
    for (const plant of Object.values(state.plants)) {
      if (plant.layer !== Layer.SURFACE || plant.stage === GrowthStage.MATURE) continue
      feedPlantDirect(state, Layer.SURFACE, plant.pos, ResourceType.SUNLIGHT)
    }
  }
  for (let i = 0; i < waterIntervals; i++) {
    for (const plant of Object.values(state.plants)) {
      if (plant.layer !== Layer.SURFACE || plant.stage === GrowthStage.MATURE) continue
      feedPlantDirect(state, Layer.SURFACE, plant.pos, ResourceType.WATER)
    }
  }

  // Feed underground hole-adjacent plants
  const holes: GridPos[] = []
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (state.underground[r][c] === TileType.HOLE) {
        holes.push({ col: c, row: r })
      }
    }
  }

  for (let i = 0; i < sunlightIntervals; i++) {
    for (const hole of holes) {
      for (const d of EIGHT_NEIGHBORS) {
        const adjPos = { col: hole.col + d.col, row: hole.row + d.row }
        if (adjPos.col < 0 || adjPos.col >= WORLD_COLS || adjPos.row < 0 || adjPos.row >= WORLD_ROWS) continue
        feedPlantDirect(state, Layer.UNDERGROUND, adjPos, ResourceType.SUNLIGHT)
      }
    }
  }
  for (let i = 0; i < waterIntervals; i++) {
    for (const hole of holes) {
      for (const d of EIGHT_NEIGHBORS) {
        const adjPos = { col: hole.col + d.col, row: hole.row + d.row }
        if (adjPos.col < 0 || adjPos.col >= WORLD_COLS || adjPos.row < 0 || adjPos.row >= WORLD_ROWS) continue
        feedPlantDirect(state, Layer.UNDERGROUND, adjPos, ResourceType.WATER)
      }
    }
  }

  // Feed magic tree (same schedule as plants)
  const treeSun = sunlightIntervals
  const treeWater = waterIntervals
  for (let i = 0; i < treeSun; i++) {
    state.treeBuffer[ResourceType.SUNLIGHT as string] = (state.treeBuffer[ResourceType.SUNLIGHT as string] ?? 0) + 1
  }
  for (let i = 0; i < treeWater; i++) {
    state.treeBuffer[ResourceType.WATER as string] = (state.treeBuffer[ResourceType.WATER as string] ?? 0) + 1
  }

  // Simulate rain state changes
  const rainChanges = Math.floor(elapsedMs / MIN_DRY_DURATION)
  for (let i = 0; i < rainChanges; i++) {
    if (state.weather.isRaining) {
      state.weather.isRaining = false
      state.weather.rainTimer = randomDryDuration()
    } else if (Math.random() < RAIN_CHANCE) {
      state.weather.isRaining = true
      state.weather.rainTimer = randomRainDuration()
    }
  }
}
