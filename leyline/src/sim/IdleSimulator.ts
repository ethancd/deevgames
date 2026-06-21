import {
  WorldState, Plant, GrowthStage, ResourceType, Layer,
  GridPos, Leyline, TileType, SeedType,
  samePos, isAdjacent, posKey,
} from './types'
import {
  isSourcePlant, getTransmuteRecipe, getPlantOutput,
  getStageReq, nextStage, crystalTypeForSeed,
  SEED_DISPLAY, STAGE_DISPLAY,
} from './PlantConfig'
import { simulateIdleWeather } from './WeatherSystem'

const EMIT_INTERVAL = 2500
const MAX_IDLE_MS = 24 * 60 * 60 * 1000
const MIN_IDLE_MS = 10_000

const NEIGHBORS: GridPos[] = [
  { col: -1, row: 0 }, { col: 1, row: 0 },
  { col: 0, row: -1 }, { col: 0, row: 1 },
]

export interface IdleSummary {
  elapsedMs: number
  deliveries: Partial<Record<ResourceType, number>>
  plantsAdvanced: Array<{ name: string; from: string; to: string }>
  portalGreenGained: number
  portalMusicGained: number
}

function tileAt(state: WorldState, layer: Layer, pos: GridPos): TileType {
  const grid = layer === Layer.SURFACE ? state.surface : state.underground
  return grid[pos.row]?.[pos.col] ?? TileType.STONE
}

function plantAt(state: WorldState, pos: GridPos, layer: Layer): Plant | undefined {
  return state.plants[`${layer}:${posKey(pos)}`]
}


function plantNeedsResource(plant: Plant, resource: ResourceType): boolean {
  if (plant.stage === GrowthStage.MATURE) return false
  const req = getStageReq(plant.seedType, plant.stage)
  switch (resource) {
    case ResourceType.WATER: return plant.waterFed < req.water
    case ResourceType.CRYSTAL_RED: return crystalTypeForSeed(plant.seedType) === 'crystalRed' && plant.crystalFed < req.crystal
    case ResourceType.CRYSTAL_BLUE: return crystalTypeForSeed(plant.seedType) === 'crystalBlue' && plant.crystalFed < req.crystal
    case ResourceType.SUNLIGHT: return plant.sunlightFed < req.sunlight
    default: return false
  }
}

type Dest =
  | { type: 'plant'; key: string }
  | { type: 'portal' }
  | { type: 'none' }

function findDest(state: WorldState, ley: Leyline, resource: ResourceType, seen: Set<string>): Dest {
  if (seen.has(ley.id)) return { type: 'none' }
  seen.add(ley.id)

  for (let i = 1; i < ley.path.length; i++) {
    const pos = ley.path[i]
    const plant = plantAt(state, pos, ley.layer)
    if (!plant) continue
    const key = `${ley.layer}:${posKey(pos)}`
    if (plant.stage === GrowthStage.MATURE) {
      const recipe = getTransmuteRecipe(plant.seedType)
      if (recipe.input1 !== null && (resource === recipe.input1 || resource === recipe.input2))
        return { type: 'plant', key }
    } else if (plantNeedsResource(plant, resource)) {
      return { type: 'plant', key }
    }
  }

  const end = ley.path[ley.path.length - 1]

  if (ley.layer === Layer.SURFACE &&
      (samePos(end, state.portal.pos) || isAdjacent(end, state.portal.pos)) &&
      (resource === ResourceType.CRYSTAL_GREEN || resource === ResourceType.MUSIC_NOTES))
    return { type: 'portal' }

  const endArea = [end, ...NEIGHBORS.map(d => ({ col: end.col + d.col, row: end.row + d.row }))]
  for (const pos of endArea) {
    const plant = plantAt(state, pos, ley.layer)
    if (!plant) continue
    const key = `${ley.layer}:${posKey(pos)}`
    if (plant.stage === GrowthStage.MATURE) {
      const recipe = getTransmuteRecipe(plant.seedType)
      if (recipe.input1 !== null && (resource === recipe.input1 || resource === recipe.input2))
        return { type: 'plant', key }
    } else if (plantNeedsResource(plant, resource)) {
      return { type: 'plant', key }
    }
  }

  const endTile = tileAt(state, ley.layer, end)
  if (endTile === TileType.HOLE) {
    const other = ley.layer === Layer.SURFACE ? Layer.UNDERGROUND : Layer.SURFACE
    for (const d of state.leylines) {
      if (d.layer === other && d.path.length >= 2 && samePos(d.path[0], end)) {
        const r = findDest(state, d, resource, seen)
        if (r.type !== 'none') return r
      }
    }
  }

  for (const d of state.leylines) {
    if (d.id !== ley.id && d.layer === ley.layer && d.path.length >= 2 && isAdjacent(end, d.path[0])) {
      const r = findDest(state, d, resource, seen)
      if (r.type !== 'none') return r
    }
  }

  return { type: 'none' }
}

function feedPlant(plant: Plant, incoming: Map<ResourceType, number>, summary: IdleSummary): void {
  if (plant.stage === GrowthStage.MATURE) return

  const crystalRes = crystalTypeForSeed(plant.seedType) === 'crystalRed'
    ? ResourceType.CRYSTAL_RED : ResourceType.CRYSTAL_BLUE

  let waterAvail = incoming.get(ResourceType.WATER) ?? 0
  let sunAvail = incoming.get(ResourceType.SUNLIGHT) ?? 0
  let crystalAvail = incoming.get(crystalRes) ?? 0

  while (plant.stage !== GrowthStage.MATURE && (waterAvail > 0 || sunAvail > 0 || crystalAvail > 0)) {
    const req = getStageReq(plant.seedType, plant.stage)

    const wFed = Math.min(waterAvail, Math.max(0, req.water - plant.waterFed))
    const cFed = Math.min(crystalAvail, Math.max(0, req.crystal - plant.crystalFed))
    const sFed = Math.min(sunAvail, Math.max(0, req.sunlight - plant.sunlightFed))

    if (wFed === 0 && cFed === 0 && sFed === 0) break

    plant.waterFed += wFed
    plant.crystalFed += cFed
    plant.sunlightFed += sFed
    waterAvail -= wFed
    crystalAvail -= cFed
    sunAvail -= sFed

    if (wFed > 0) summary.deliveries[ResourceType.WATER] = (summary.deliveries[ResourceType.WATER] ?? 0) + wFed
    if (cFed > 0) summary.deliveries[crystalRes] = (summary.deliveries[crystalRes] ?? 0) + cFed
    if (sFed > 0) summary.deliveries[ResourceType.SUNLIGHT] = (summary.deliveries[ResourceType.SUNLIGHT] ?? 0) + sFed

    if (plant.waterFed >= req.water && plant.crystalFed >= req.crystal && plant.sunlightFed >= req.sunlight) {
      const next = nextStage(plant.stage)
      if (next) {
        summary.plantsAdvanced.push({
          name: SEED_DISPLAY[plant.seedType].name,
          from: STAGE_DISPLAY[plant.stage],
          to: STAGE_DISPLAY[next],
        })
        plant.stage = next
        plant.waterFed = 0
        plant.crystalFed = 0
        plant.sunlightFed = 0
      }
    } else {
      break
    }
  }
}

function addDelivery(map: Map<string, Map<ResourceType, number>>, key: string, resource: ResourceType, count: number): void {
  if (!map.has(key)) map.set(key, new Map())
  const prev = map.get(key)!.get(resource) ?? 0
  map.get(key)!.set(resource, prev + count)
}

export function simulateIdle(state: WorldState, elapsedMs: number): IdleSummary {
  const capped = Math.min(elapsedMs, MAX_IDLE_MS)
  const summary: IdleSummary = {
    elapsedMs: capped,
    deliveries: {},
    plantsAdvanced: [],
    portalGreenGained: 0,
    portalMusicGained: 0,
  }
  if (capped < MIN_IDLE_MS) return summary

  // Simulate weather effects (surface sun/rain + hole ambient feeds)
  simulateIdleWeather(state, capped)

  const totalEmits = Math.floor(capped / EMIT_INTERVAL)

  // Find source leylines (near source tiles or source plants) and their mote counts
  const sourceMotes = new Map<string, { resource: ResourceType; count: number }>()
  const plantShareCount = new Map<string, number>()

  for (const ley of state.leylines) {
    if (ley.path.length < 2) continue
    const start = ley.path[0]

    const startTile = tileAt(state, ley.layer, start)

    const startPlant = plantAt(state, start, ley.layer)
    if (startPlant && startPlant.stage === GrowthStage.MATURE && isSourcePlant(startPlant.seedType)) {
      const r = getPlantOutput(startPlant, startTile)
      const pk = `${ley.layer}:${posKey(start)}`
      plantShareCount.set(pk, (plantShareCount.get(pk) ?? 0) + 1)
      sourceMotes.set(ley.id, { resource: r, count: 0 })
      continue
    }

    let hasUpstream = false
    for (const other of state.leylines) {
      if (other.id === ley.id || other.path.length < 2) continue
      const otherEnd = other.path[other.path.length - 1]
      if (other.layer === ley.layer && isAdjacent(otherEnd, start)) { hasUpstream = true; break }
      if (other.layer !== ley.layer) {
        const otherEndTile = tileAt(state, other.layer, otherEnd)
        if (otherEndTile === TileType.HOLE && samePos(otherEnd, start)) { hasUpstream = true; break }
      }
    }
    // Holes no longer act as leyline sunlight sources — they feed adjacent
    // plants directly via the weather system instead.
  }

  // Apply plant sharing: source plants split totalEmits across their leylines
  for (const [leyId, em] of sourceMotes) {
    if (em.count > 0) continue
    const ley = state.leylines.find(l => l.id === leyId)!
    const start = ley.path[0]
    const area = [start, ...NEIGHBORS.map(d => ({ col: start.col + d.col, row: start.row + d.row }))]
    for (const pos of area) {
      const plant = plantAt(state, pos, ley.layer)
      if (plant && plant.stage === GrowthStage.MATURE && isSourcePlant(plant.seedType)) {
        const pk = `${ley.layer}:${posKey(pos)}`
        em.count = Math.floor(totalEmits / (plantShareCount.get(pk) ?? 1))
        break
      }
    }
  }

  // Trace sources to destinations, aggregate per-plant deliveries
  let currentDeliveries = new Map<string, Map<ResourceType, number>>()
  let portalGreen = 0, portalMusic = 0

  for (const [leyId, em] of sourceMotes) {
    if (em.count <= 0) continue
    const ley = state.leylines.find(l => l.id === leyId)!
    const dest = findDest(state, ley, em.resource, new Set())

    if (dest.type === 'plant') {
      addDelivery(currentDeliveries, dest.key, em.resource, em.count)
    } else if (dest.type === 'portal') {
      if (em.resource === ResourceType.CRYSTAL_GREEN) portalGreen += em.count
      else if (em.resource === ResourceType.MUSIC_NOTES) portalMusic += em.count
    }
  }

  // Process in waves: feed plants, process transmuters, route outputs
  for (let wave = 0; wave < 4; wave++) {
    // Feed growing plants
    for (const [pk, incoming] of currentDeliveries) {
      const plant = state.plants[pk]
      if (plant && plant.stage !== GrowthStage.MATURE) {
        feedPlant(plant, incoming, summary)
      }
    }

    // Process transmuters and route outputs to next wave
    const nextDeliveries = new Map<string, Map<ResourceType, number>>()

    for (const [pk, incoming] of currentDeliveries) {
      const plant = state.plants[pk]
      if (!plant || plant.stage !== GrowthStage.MATURE || isSourcePlant(plant.seedType)) continue

      const recipe = getTransmuteRecipe(plant.seedType)
      if (!recipe.input1 || !recipe.input2) continue

      const in1 = (incoming.get(recipe.input1) ?? 0) + plant.transmuteInput1
      const in2 = (incoming.get(recipe.input2) ?? 0) + plant.transmuteInput2
      const produced = Math.min(Math.floor(in1 / 3), Math.floor(in2 / 3), totalEmits)

      plant.transmuteInput1 = Math.min(in1 - produced * 3, 3)
      plant.transmuteInput2 = Math.min(in2 - produced * 3, 3)

      if (produced <= 0) continue

      const t = tileAt(state, plant.layer, plant.pos)
      const outputRes = getPlantOutput(plant, t)

      const outLeys = state.leylines.filter(l =>
        l.layer === plant.layer && l.path.length >= 2 &&
        (samePos(l.path[0], plant.pos) || isAdjacent(l.path[0], plant.pos))
      )
      if (outLeys.length === 0) continue

      const perLey = Math.floor(produced / outLeys.length)
      if (perLey <= 0) continue

      for (const ley of outLeys) {
        const dest = findDest(state, ley, outputRes, new Set())
        if (dest.type === 'plant') {
          addDelivery(nextDeliveries, dest.key, outputRes, perLey)
        } else if (dest.type === 'portal') {
          if (outputRes === ResourceType.CRYSTAL_GREEN) portalGreen += perLey
          else if (outputRes === ResourceType.MUSIC_NOTES) portalMusic += perLey
        }
      }
    }

    if (nextDeliveries.size === 0) break
    currentDeliveries = nextDeliveries
  }

  // Apply portal feeds
  if (portalGreen > 0) {
    state.portal.greenCrystalFed += portalGreen
    summary.portalGreenGained = portalGreen
  }
  if (portalMusic > 0) {
    state.portal.musicNotesFed += portalMusic
    summary.portalMusicGained = portalMusic
  }
  if (portalGreen > 0 || portalMusic > 0) {
    const min = Math.min(state.portal.greenCrystalFed, state.portal.musicNotesFed)
    let level = 0, threshold = 0
    for (;;) {
      threshold += Math.pow(10, level + 1)
      if (min < threshold) break
      level++
    }
    state.portal.level = level
  }

  // Check unlocks (leyline unlocks when Water Lily + Sunflower both mature)
  if (!state.unlocks.leyline) {
    const mature = Object.values(state.plants).filter(p => p.stage === GrowthStage.MATURE)
    if (mature.some(p => p.seedType === SeedType.WATER_LILY) &&
        mature.some(p => p.seedType === SeedType.SUNFLOWER)) {
      state.unlocks.leyline = true
    }
  }

  return summary
}

export function hasSummaryContent(summary: IdleSummary): boolean {
  return Object.keys(summary.deliveries).length > 0 ||
    summary.plantsAdvanced.length > 0 ||
    summary.portalGreenGained > 0 ||
    summary.portalMusicGained > 0
}

export function formatElapsed(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  if (totalMin < 1) return `${Math.floor(ms / 1000)}s`
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
