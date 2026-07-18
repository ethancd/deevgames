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
const EMIT_INTERVAL = 2500
const MAX_MOTES = 200

const NEIGHBORS: GridPos[] = [
  { col: -1, row: 0 }, { col: 1, row: 0 },
  { col: 0, row: -1 }, { col: 0, row: 1 },
]

function findSourceAtStart(ley: Leyline, world: World): ResourceType | null {
  const start = ley.path[0]
  const tile = world.getTile(ley.layer, start)

  const plant = world.getPlantAt(start, ley.layer)
  if (plant && plant.stage === GrowthStage.MATURE) {
    return getPlantOutput(plant, tile)
  }

  return null
}

function canAcceptResource(plant: Plant): boolean {
  if (plant.stage !== GrowthStage.MATURE) return true
  return !isSourcePlant(plant.seedType)
}

function hasPlantNear(pos: GridPos, layer: Layer, world: World): boolean {
  const plant = world.getPlantAt(pos, layer)
  if (plant && canAcceptResource(plant)) return true
  for (const d of NEIGHBORS) {
    const neighbor = { col: pos.col + d.col, row: pos.row + d.row }
    const adj = world.getPlantAt(neighbor, layer)
    if (adj && canAcceptResource(adj)) return true
  }
  return false
}

function absorptionAt(pos: GridPos, resourceType: ResourceType): AbsorptionEvent {
  const s = gridToScreen(pos.col, pos.row)
  return { x: s.x, y: s.y, resourceType }
}

export class LeylineEngine {
  private motes: Mote[] = []
  private globalEmitTimer = 0
  private resolved: Map<string, ResourceType> = new Map()
  private forkCounters: Map<string, number> = new Map()
  private _absorptions: AbsorptionEvent[] = []
  private _emittedThisFrame = false

  drainAbsorptions(): AbsorptionEvent[] {
    const result = this._absorptions
    this._absorptions = []
    return result
  }

  getActiveResource(leylineId: string): ResourceType | null {
    return this.resolved.get(leylineId) ?? null
  }

  getEmitProgress(): number {
    return this.globalEmitTimer / EMIT_INTERVAL
  }

  get emittedThisFrame(): boolean {
    return this._emittedThisFrame
  }

  private resolveResources(world: World): void {
    this.resolved.clear()
    const leylines = world.state.leylines

    for (const ley of leylines) {
      if (ley.path.length < 2) continue
      const res = findSourceAtStart(ley, world)
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
            if (otherEndTile === TileType.HOLE && samePos(otherEnd, start)) {
              this.resolved.set(ley.id, otherRes)
              changed = true
              break
            }
          }
        }
      }
    }

  }

  private leyPathCache: Map<string, GridPos[]> = new Map()

  private rebuildPathCache(world: World): void {
    this.leyPathCache.clear()
    for (const ley of world.state.leylines) {
      this.leyPathCache.set(ley.id, ley.path)
    }
  }

  private isGridTileOccupied(pos: GridPos, layer: Layer, excludeMote?: Mote): boolean {
    for (const m of this.motes) {
      if (m === excludeMote || m.layer !== layer) continue
      const path = this.leyPathCache.get(m.leylineId)
      if (!path) continue
      if (samePos(path[m.tileIdx], pos)) return true
    }
    return false
  }

  private leylineFull(ley: Leyline): boolean {
    const count = this.motes.filter(m => m.leylineId === ley.id).length
    return count >= ley.path.length - 1
  }

  tick(delta: number, world: World): void {
    this.resolveResources(world)
    this.rebuildPathCache(world)

    const leylines = world.state.leylines

    this._emittedThisFrame = false
    this.globalEmitTimer += delta
    if (this.globalEmitTimer >= EMIT_INTERVAL) {
      this.globalEmitTimer -= EMIT_INTERVAL
      this._emittedThisFrame = true
      this.processPlantEmission(world)
    }

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

        if (this.isGridTileOccupied(ley.path[nextIdx], mote.layer)) {
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

  private processPlantEmission(world: World): void {
    const plants = Object.values(world.state.plants)
    const leylines = world.state.leylines

    for (const plant of plants) {
      if (plant.stage !== GrowthStage.MATURE) continue

      const source = isSourcePlant(plant.seedType)

      if (!source && (plant.transmuteInput1 < 3 || plant.transmuteInput2 < 3)) continue

      const tile = world.getTile(plant.layer, plant.pos)
      const output = getPlantOutput(plant, tile)

      const outLeylines = leylines.filter(l =>
        l.layer === plant.layer &&
        l.path.length >= 2 &&
        samePos(l.path[0], plant.pos) &&
        !this.isGridTileOccupied(l.path[0], l.layer) &&
        !this.leylineFull(l)
      )

      if (outLeylines.length > 0 && this.motes.length < MAX_MOTES) {
        const key = `tx:${plant.pos.col},${plant.pos.row}:${plant.layer}`
        const pick = this.pickFork(key, outLeylines)
        this.motes.push({
          leylineId: pick.id,
          resourceType: output,
          tileIdx: 0,
          progress: 0,
          layer: plant.layer,
        })
        if (!source) {
          plant.transmuteInput1 -= 3
          plant.transmuteInput2 -= 3
        }
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

    if (hasPlantNear(sinkPos, ley.layer, world)) return false

    if (sinkTile === TileType.HOLE) {
      const otherLayer = ley.layer === Layer.SURFACE ? Layer.UNDERGROUND : Layer.SURFACE
      const relays = world.state.leylines.filter(l =>
        l.layer === otherLayer &&
        l.path.length >= 2 &&
        samePos(l.path[0], sinkPos)
      )
      if (relays.length > 0) {
        const relay = this.pickFork(ley.id, relays)
        if (this.motes.length < MAX_MOTES && !this.isGridTileOccupied(relay.path[0], otherLayer, mote)) {
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
      if (this.motes.length < MAX_MOTES && !this.isGridTileOccupied(downstream.path[0], ley.layer, mote)) {
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

    return false
  }

  getEmissionDebug(world: World): Array<{
    plantPos: GridPos
    layer: Layer
    output: ResourceType
    canEmit: boolean
    reason: string
    targetTile: GridPos | null
  }> {
    const results: Array<{
      plantPos: GridPos; layer: Layer; output: ResourceType
      canEmit: boolean; reason: string; targetTile: GridPos | null
    }> = []
    const plants = Object.values(world.state.plants)
    const leylines = world.state.leylines

    for (const plant of plants) {
      if (plant.stage !== GrowthStage.MATURE) continue
      const source = isSourcePlant(plant.seedType)
      const tile = world.getTile(plant.layer, plant.pos)
      const output = getPlantOutput(plant, tile)

      if (!source && (plant.transmuteInput1 < 3 || plant.transmuteInput2 < 3)) {
        results.push({ plantPos: plant.pos, layer: plant.layer, output, canEmit: false,
          reason: `transmute: ${plant.transmuteInput1}/3, ${plant.transmuteInput2}/3`, targetTile: null })
        continue
      }

      const connected = leylines.filter(l =>
        l.layer === plant.layer && l.path.length >= 2 && samePos(l.path[0], plant.pos))
      if (connected.length === 0) {
        results.push({ plantPos: plant.pos, layer: plant.layer, output, canEmit: false,
          reason: 'no leyline', targetTile: null })
        continue
      }

      const available = connected.filter(l =>
        !this.isGridTileOccupied(l.path[0], l.layer) && !this.leylineFull(l))
      if (available.length === 0) {
        const full = connected.filter(l => this.leylineFull(l)).length
        const occupied = connected.filter(l => this.isGridTileOccupied(l.path[0], l.layer)).length
        results.push({ plantPos: plant.pos, layer: plant.layer, output, canEmit: false,
          reason: `blocked (${full} full, ${occupied} occupied)`, targetTile: null })
        continue
      }

      if (this.motes.length >= MAX_MOTES) {
        results.push({ plantPos: plant.pos, layer: plant.layer, output, canEmit: false,
          reason: 'global mote cap', targetTile: available[0].path[1] })
        continue
      }

      const key = `tx:${plant.pos.col},${plant.pos.row}:${plant.layer}`
      const counter = this.forkCounters.get(key) ?? 0
      const pick = available[counter % available.length]
      results.push({ plantPos: plant.pos, layer: plant.layer, output, canEmit: true,
        reason: 'ready', targetTile: pick.path[1] })
    }
    // Holes: show relay status for leylines that end at holes
    const holePositions = new Set<string>()
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 24; c++) {
        if (world.getTile(Layer.SURFACE, { col: c, row: r }) === TileType.HOLE ||
            world.getTile(Layer.UNDERGROUND, { col: c, row: r }) === TileType.HOLE) {
          holePositions.add(`${c},${r}`)
        }
      }
    }
    for (const holeKey of holePositions) {
      const [hc, hr] = holeKey.split(',').map(Number)
      const holePos = { col: hc, row: hr }
      for (const layer of [Layer.SURFACE, Layer.UNDERGROUND]) {
        const otherLayer = layer === Layer.SURFACE ? Layer.UNDERGROUND : Layer.SURFACE
        const incoming = leylines.filter(l =>
          l.layer === layer && l.path.length >= 2 && samePos(l.path[l.path.length - 1], holePos))
        if (incoming.length === 0) continue
        const outgoing = leylines.filter(l =>
          l.layer === otherLayer && l.path.length >= 2 && samePos(l.path[0], holePos))
        const motesIncoming = this.motes.filter(m =>
          incoming.some(l => l.id === m.leylineId) && m.tileIdx >= (leylines.find(l => l.id === m.leylineId)!.path.length - 2))
        if (outgoing.length === 0) {
          if (motesIncoming.length > 0) {
            results.push({ plantPos: holePos, layer: otherLayer, output: motesIncoming[0].resourceType,
              canEmit: false, reason: 'hole: no outgoing leyline', targetTile: null })
          }
          continue
        }
        const availableOut = outgoing.filter(l =>
          !this.isGridTileOccupied(l.path[0], otherLayer) && !this.leylineFull(l))
        if (motesIncoming.length > 0 || availableOut.length > 0) {
          const canRelay = availableOut.length > 0
          const full = outgoing.filter(l => this.leylineFull(l)).length
          const occupied = outgoing.filter(l => this.isGridTileOccupied(l.path[0], otherLayer)).length
          results.push({
            plantPos: holePos, layer: otherLayer,
            output: motesIncoming.length > 0 ? motesIncoming[0].resourceType : ResourceType.SUNLIGHT,
            canEmit: canRelay,
            reason: canRelay ? `hole: relay ready (${availableOut.length} out)` : `hole: blocked (${full} full, ${occupied} occupied)`,
            targetTile: canRelay ? availableOut[0].path[1] : null,
          })
        }
      }
    }

    return results
  }

  private pickFork(leyId: string, candidates: Leyline[]): Leyline {
    const counter = this.forkCounters.get(leyId) ?? 0
    const pick = candidates[counter % candidates.length]
    this.forkCounters.set(leyId, counter + 1)
    return pick
  }
}
