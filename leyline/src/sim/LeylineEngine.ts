import {
  GridPos, Layer, Leyline, Plant, ResourceType, SeedType, TileType,
  GrowthStage, samePos, isAdjacent,
} from './types'
import { gridToScreen } from '../phaser/IsoUtils'
import { World } from './World'
import { getTransmuteRecipe, getPlantOutput, isSourcePlant } from './PlantConfig'
import { markDirty } from './SaveManager'

export interface MoteRenderData {
  x: number
  y: number
  resourceType: ResourceType
}

export interface AbsorptionEvent {
  x: number
  y: number
  resourceType: ResourceType
}

interface Mote {
  leylineId: string
  resourceType: ResourceType
  tileIdx: number
  progress: number
  layer: Layer
}

const MOTE_SPEED = 2
const EMIT_INTERVAL = 2000
const MAX_MOTES = 200

const NEIGHBORS: GridPos[] = [
  { col: -1, row: 0 }, { col: 1, row: 0 },
  { col: 0, row: -1 }, { col: 0, row: 1 },
]

function tileResource(tile: TileType): ResourceType | null {
  if (tile === TileType.CRYSTAL_RED) return ResourceType.CRYSTAL_RED
  if (tile === TileType.CRYSTAL_BLUE) return ResourceType.CRYSTAL_BLUE
  return null
}

function findSourceNearStart(ley: Leyline, world: World): ResourceType | null {
  const start = ley.path[0]

  for (const d of NEIGHBORS) {
    const neighbor = { col: start.col + d.col, row: start.row + d.row }
    const tile = world.getTile(ley.layer, neighbor)
    const res = tileResource(tile)
    if (res) return res
  }

  const positions = [start, ...NEIGHBORS.map(d => ({ col: start.col + d.col, row: start.row + d.row }))]
  for (const pos of positions) {
    const plant = world.getPlantAt(pos, ley.layer)
    if (plant && plant.stage === GrowthStage.MATURE) {
      const tile = world.getTile(ley.layer, pos)
      return getPlantOutput(plant, tile)
    }
  }

  return null
}

function hasPlantNear(pos: GridPos, layer: Layer, world: World): boolean {
  const plant = world.getPlantAt(pos, layer)
  if (plant) return true
  for (const d of NEIGHBORS) {
    const neighbor = { col: pos.col + d.col, row: pos.row + d.row }
    if (world.getPlantAt(neighbor, layer)) return true
  }
  return false
}

function absorptionAt(pos: GridPos, resourceType: ResourceType): AbsorptionEvent {
  const s = gridToScreen(pos.col, pos.row)
  return { x: s.x, y: s.y, resourceType }
}

export class LeylineEngine {
  private motes: Mote[] = []
  private emitTimers: Map<string, number> = new Map()
  private resolved: Map<string, ResourceType> = new Map()
  private forkCounters: Map<string, number> = new Map()
  private transmuteTimers: Map<string, number> = new Map()
  private _absorptions: AbsorptionEvent[] = []

  drainAbsorptions(): AbsorptionEvent[] {
    const result = this._absorptions
    this._absorptions = []
    return result
  }

  getActiveResource(leylineId: string): ResourceType | null {
    return this.resolved.get(leylineId) ?? null
  }

  private resolveResources(world: World): void {
    this.resolved.clear()
    const leylines = world.state.leylines

    for (const ley of leylines) {
      if (ley.path.length < 2) continue
      const res = findSourceNearStart(ley, world)
      if (res) this.resolved.set(ley.id, res)
    }

    let changed = true
    while (changed) {
      changed = false
      for (const ley of leylines) {
        if (ley.path.length < 2) continue
        if (this.resolved.has(ley.id)) continue

        const start = ley.path[0]

        for (const other of leylines) {
          if (other.id === ley.id) continue
          if (other.path.length < 2) continue
          const otherRes = this.resolved.get(other.id)
          if (!otherRes) continue

          const otherEnd = other.path[other.path.length - 1]

          if (hasPlantNear(otherEnd, other.layer, world)) continue

          if (other.layer === ley.layer && isAdjacent(otherEnd, start)) {
            this.resolved.set(ley.id, otherRes)
            changed = true
            break
          }

          if (other.layer !== ley.layer) {
            const otherEndTile = world.getTile(other.layer, otherEnd)
            if (otherEndTile === TileType.HOLE && (samePos(otherEnd, start) || isAdjacent(otherEnd, start))) {
              this.resolved.set(ley.id, otherRes)
              changed = true
              break
            }
          }
        }
      }
    }

    for (const ley of leylines) {
      if (ley.path.length < 2) continue
      if (this.resolved.has(ley.id)) continue
      const start = ley.path[0]
      const startTile = world.getTile(ley.layer, start)
      if (startTile === TileType.HOLE) {
        this.resolved.set(ley.id, ResourceType.SUNLIGHT)
        continue
      }
      for (const d of NEIGHBORS) {
        const neighbor = { col: start.col + d.col, row: start.row + d.row }
        const tile = world.getTile(ley.layer, neighbor)
        if (tile === TileType.HOLE) {
          this.resolved.set(ley.id, ResourceType.SUNLIGHT)
          break
        }
      }
    }
  }

  private isTileOccupied(leylineId: string, tileIdx: number): boolean {
    return this.motes.some(m => m.leylineId === leylineId && m.tileIdx === tileIdx && m.progress < 1)
  }

  tick(delta: number, world: World): void {
    this.resolveResources(world)

    const leylines = world.state.leylines

    this.processSourceTiles(delta, leylines, world)
    this.processPlantEmission(delta, world)

    const speed = MOTE_SPEED * delta / 1000
    const toRemove: number[] = []

    for (let i = this.motes.length - 1; i >= 0; i--) {
      const mote = this.motes[i]
      const ley = leylines.find(l => l.id === mote.leylineId)
      if (!ley || ley.path.length < 2) {
        toRemove.push(i)
        continue
      }

      const maxTile = ley.path.length - 1

      mote.progress += speed

      while (mote.progress >= 1 && mote.tileIdx < maxTile) {
        const nextIdx = mote.tileIdx + 1
        const nextPos = ley.path[nextIdx]

        const plant = world.getPlantAt(nextPos, ley.layer)
        if (plant) {
          if (plant.stage === GrowthStage.MATURE) {
            if (this.tryTransmuteAbsorb(plant, mote.resourceType)) {
              this._absorptions.push(absorptionAt(nextPos, mote.resourceType))
              toRemove.push(i)
              break
            }
          } else {
            const feedResult = world.feedPlantResource(nextPos, ley.layer, mote.resourceType)
            if (feedResult.type === 'fed') {
              this._absorptions.push(absorptionAt(nextPos, mote.resourceType))
              toRemove.push(i)
              break
            }
          }
          mote.progress = 0.99
          break
        }

        if (this.isTileOccupied(mote.leylineId, nextIdx)) {
          mote.progress = 0.99
          break
        }

        mote.progress -= 1
        mote.tileIdx = nextIdx
      }

      if (toRemove.includes(i)) continue

      if (mote.tileIdx >= maxTile) {
        if (this.tryDeliver(mote, ley, world)) {
          toRemove.push(i)
        } else {
          mote.progress = Math.min(mote.progress, 0.99)
        }
      }
    }

    const removeSet = new Set(toRemove)
    this.motes = this.motes.filter((_, i) => !removeSet.has(i))
  }

  private processSourceTiles(delta: number, leylines: Leyline[], world: World): void {
    for (const ley of leylines) {
      if (ley.path.length < 2) continue
      const start = ley.path[0]

      let sourceRes: ResourceType | null = null
      for (const d of NEIGHBORS) {
        const neighbor = { col: start.col + d.col, row: start.row + d.row }
        const tile = world.getTile(ley.layer, neighbor)
        const res = tileResource(tile)
        if (res) { sourceRes = res; break }
      }

      if (!sourceRes && this.resolved.get(ley.id) === ResourceType.SUNLIGHT) {
        sourceRes = ResourceType.SUNLIGHT
      }

      if (!sourceRes) continue

      const key = `src:${start.col},${start.row}:${ley.layer}:${ley.id}`
      const timer = (this.emitTimers.get(key) ?? 0) + delta

      if (timer >= EMIT_INTERVAL) {
        if (this.motes.length < MAX_MOTES && !this.isTileOccupied(ley.id, 0)) {
          this.motes.push({
            leylineId: ley.id,
            resourceType: sourceRes,
            tileIdx: 0,
            progress: 0,
            layer: ley.layer,
          })
          this.emitTimers.set(key, 0)
        } else {
          this.emitTimers.set(key, timer)
        }
      } else {
        this.emitTimers.set(key, timer)
      }
    }
  }

  private processPlantEmission(delta: number, world: World): void {
    const plants = Object.values(world.state.plants)
    const leylines = world.state.leylines

    for (const plant of plants) {
      if (plant.stage !== GrowthStage.MATURE) continue

      const source = isSourcePlant(plant.seedType)

      if (!source && (plant.transmuteInput1 < 1 || plant.transmuteInput2 < 1)) continue

      const key = `tx:${plant.pos.col},${plant.pos.row}:${plant.layer}`
      const timer = (this.transmuteTimers.get(key) ?? 0) + delta

      if (timer < EMIT_INTERVAL) {
        this.transmuteTimers.set(key, timer)
        continue
      }

      const tile = world.getTile(plant.layer, plant.pos)
      const output = getPlantOutput(plant, tile)

      const outLeylines = leylines.filter(l =>
        l.layer === plant.layer &&
        l.path.length >= 2 &&
        (samePos(l.path[0], plant.pos) || isAdjacent(l.path[0], plant.pos)) &&
        !this.isTileOccupied(l.id, 0)
      )

      if (outLeylines.length > 0 && this.motes.length < MAX_MOTES) {
        const pick = this.pickFork(key, outLeylines)
        this.motes.push({
          leylineId: pick.id,
          resourceType: output,
          tileIdx: 0,
          progress: 0,
          layer: plant.layer,
        })
        if (!source) {
          plant.transmuteInput1--
          plant.transmuteInput2--
        }
        this.transmuteTimers.set(key, 0)
      } else {
        this.transmuteTimers.set(key, timer)
      }
    }
  }

  private tryTransmuteAbsorb(plant: Plant, resource: ResourceType): boolean {
    const recipe = getTransmuteRecipe(plant.seedType)
    if (recipe.input1 === null) return false
    if (resource === recipe.input1 && plant.transmuteInput1 < 3) {
      plant.transmuteInput1++
      markDirty()
      return true
    }
    if (resource === recipe.input2 && plant.transmuteInput2 < 3) {
      plant.transmuteInput2++
      markDirty()
      return true
    }
    return false
  }

  getMotePositions(layer: Layer, world: World): MoteRenderData[] {
    const result: MoteRenderData[] = []

    for (const mote of this.motes) {
      if (mote.layer !== layer) continue
      const ley = world.state.leylines.find(l => l.id === mote.leylineId)
      if (!ley || ley.path.length < 2) continue

      const curr = ley.path[mote.tileIdx]
      const next = mote.tileIdx < ley.path.length - 1 ? ley.path[mote.tileIdx + 1] : null
      const t = Math.min(mote.progress, 1)

      const cs = gridToScreen(curr.col, curr.row)
      if (next) {
        const ns = gridToScreen(next.col, next.row)
        result.push({
          x: cs.x + (ns.x - cs.x) * t,
          y: cs.y + (ns.y - cs.y) * t,
          resourceType: mote.resourceType,
        })
      } else {
        result.push({
          x: cs.x,
          y: cs.y,
          resourceType: mote.resourceType,
        })
      }
    }

    return result
  }

  onLeylineRemoved(id: string): void {
    this.emitTimers.delete(id)
    this.motes = this.motes.filter(m => m.leylineId !== id)
    this.resolved.delete(id)
    this.forkCounters.delete(id)
  }

  private tryDeliver(mote: Mote, ley: Leyline, world: World): boolean {
    const sinkPos = ley.path[ley.path.length - 1]
    const sinkTile = world.getTile(ley.layer, sinkPos)

    const portal = world.state.portal
    if (ley.layer === Layer.SURFACE) {
      if (samePos(sinkPos, portal.pos) || isAdjacent(sinkPos, portal.pos)) {
        if (world.feedPortal(mote.resourceType)) {
          this._absorptions.push(absorptionAt(portal.pos, mote.resourceType))
          return true
        }
      }
    }

    const endPlant = world.getPlantAt(sinkPos, ley.layer)
    if (endPlant && endPlant.stage === GrowthStage.MATURE) {
      if (this.tryTransmuteAbsorb(endPlant, mote.resourceType)) {
        this._absorptions.push(absorptionAt(sinkPos, mote.resourceType))
        return true
      }
    }
    for (const d of NEIGHBORS) {
      const adj = { col: sinkPos.col + d.col, row: sinkPos.row + d.row }
      const adjPlant = world.getPlantAt(adj, ley.layer)
      if (adjPlant && adjPlant.stage === GrowthStage.MATURE) {
        if (this.tryTransmuteAbsorb(adjPlant, mote.resourceType)) {
          this._absorptions.push(absorptionAt(adj, mote.resourceType))
          return true
        }
      }
    }

    if (sinkTile === TileType.HOLE) {
      const otherLayer = ley.layer === Layer.SURFACE ? Layer.UNDERGROUND : Layer.SURFACE
      const relays = world.state.leylines.filter(l =>
        l.layer === otherLayer &&
        l.path.length >= 2 &&
        samePos(l.path[0], sinkPos)
      )
      if (relays.length > 0) {
        const relay = this.pickFork(ley.id, relays)
        if (this.motes.length < MAX_MOTES && !this.isTileOccupied(relay.id, 0)) {
          this.motes.push({
            leylineId: relay.id,
            resourceType: mote.resourceType,
            tileIdx: 0,
            progress: 0,
            layer: otherLayer,
          })
          return true
        }
      }
      return false
    }

    const downstreams = world.state.leylines.filter(l =>
      l.id !== ley.id &&
      l.layer === ley.layer &&
      l.path.length >= 2 &&
      isAdjacent(sinkPos, l.path[0])
    )
    if (downstreams.length > 0) {
      const downstream = this.pickFork(ley.id, downstreams)
      if (this.motes.length < MAX_MOTES && !this.isTileOccupied(downstream.id, 0)) {
        this.motes.push({
          leylineId: downstream.id,
          resourceType: mote.resourceType,
          tileIdx: 0,
          progress: 0,
          layer: ley.layer,
        })
        return true
      }
      return false
    }

    const positions = [sinkPos, ...NEIGHBORS.map(d => ({ col: sinkPos.col + d.col, row: sinkPos.row + d.row }))]

    for (const pos of positions) {
      if (world.getTile(ley.layer, pos) === TileType.MAGIC_TREE) {
        world.feedTree(mote.resourceType)
        this._absorptions.push(absorptionAt(pos, mote.resourceType))
        return true
      }
    }

    for (const pos of positions) {
      const result = world.feedPlantResource(pos, ley.layer, mote.resourceType)
      if (result.type === 'fed') {
        this._absorptions.push(absorptionAt(pos, mote.resourceType))
        return true
      }
    }

    return false
  }

  private pickFork(leyId: string, candidates: Leyline[]): Leyline {
    const counter = this.forkCounters.get(leyId) ?? 0
    const pick = candidates[counter % candidates.length]
    this.forkCounters.set(leyId, counter + 1)
    return pick
  }
}
