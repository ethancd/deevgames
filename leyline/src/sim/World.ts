import {
  DIG_MAX_DEPTH, GridPos, CarriableItem, Layer, Leyline, Plant, ResourceType, SeedType,
  GrowthStage, TileType,
  WORLD_COLS, WORLD_ROWS, WorldState,
  isAdjacent, isDiggable, posKey, samePos,
} from './types'
import { findPath } from './Pathfinding'
import { crystalTypeForSeed, getStageReq, nextStage, seedLayer } from './PlantConfig'
import { bindState, markDirty } from './SaveManager'
import { createDefaultWeather } from './WeatherSystem'

const TIER1_LADDER = [1, 2, 5, 10, 20, 30, 40, 50]
const TIER2_LADDER = [2, 5, 10, 25, 50, 100]
const TIER3_LADDER = [10, 25, 50, 100, 250, 500, 1000]

const SEED_COST_LADDERS: Record<SeedType, number[]> = {
  [SeedType.SUNFLOWER]: TIER1_LADDER,
  [SeedType.WATER_LILY]: TIER1_LADDER,
  [SeedType.LICHEN]: TIER1_LADDER,
  [SeedType.LIFELEAF]: TIER2_LADDER,
  [SeedType.ROOTWEAVE]: TIER2_LADDER,
  [SeedType.DEWBELL]: TIER3_LADDER,
  [SeedType.GLIMSTONE]: TIER3_LADDER,
}

function createSurfaceMap(): TileType[][] {
  const grid: TileType[][] = []
  for (let r = 0; r < WORLD_ROWS; r++) {
    const row: TileType[] = []
    for (let c = 0; c < WORLD_COLS; c++) {
      row.push(TileType.GRASS)
    }
    grid.push(row)
  }

  for (let r = 2; r <= 4; r++) {
    for (let c = 2; c <= 4; c++) {
      grid[r][c] = TileType.WATER
    }
  }

  for (let c = 0; c < WORLD_COLS; c++) {
    grid[0][c] = TileType.STONE
    grid[WORLD_ROWS - 1][c] = TileType.STONE
  }
  for (let r = 0; r < WORLD_ROWS; r++) {
    grid[r][0] = TileType.STONE
    grid[r][WORLD_COLS - 1] = TileType.STONE
  }

  for (let c = 5; c <= 18; c++) {
    grid[8][c] = TileType.PATH
  }
  for (let r = 4; r <= 12; r++) {
    grid[r][12] = TileType.PATH
  }

  const decorPositions = [
    [3, 7], [5, 10], [6, 15], [10, 5], [11, 18], [4, 20],
    [7, 3], [9, 9], [13, 14], [2, 16], [12, 7], [6, 21],
  ]
  for (const [r, c] of decorPositions) {
    if (grid[r][c] === TileType.GRASS) {
      grid[r][c] = Math.random() > 0.5 ? TileType.FLOWERS : TileType.MOSS
    }
  }

  grid[10][19] = TileType.MUSHROOM
  grid[11][20] = TileType.MUSHROOM

  grid[6][16] = TileType.MAGIC_TREE

  return grid
}

function createUndergroundMap(): TileType[][] {
  const grid: TileType[][] = []
  for (let r = 0; r < WORLD_ROWS; r++) {
    const row: TileType[] = []
    for (let c = 0; c < WORLD_COLS; c++) {
      row.push(TileType.DIRT)
    }
    grid.push(row)
  }

  for (let c = 0; c < WORLD_COLS; c++) {
    grid[0][c] = TileType.STONE
    grid[WORLD_ROWS - 1][c] = TileType.STONE
  }
  for (let r = 0; r < WORLD_ROWS; r++) {
    grid[r][0] = TileType.STONE
    grid[r][WORLD_COLS - 1] = TileType.STONE
  }

  for (let r = 5; r <= 8; r++) {
    grid[r][3] = TileType.CRYSTAL_RED
    grid[r][4] = TileType.CRYSTAL_RED
  }
  for (let r = 9; r <= 12; r++) {
    grid[r][19] = TileType.CRYSTAL_BLUE
    grid[r][20] = TileType.CRYSTAL_BLUE
  }

  const stonePositions = [
    [4, 10], [4, 11], [7, 15], [8, 15],
    [11, 8], [11, 9], [3, 18],
  ]
  for (const [r, c] of stonePositions) {
    grid[r][c] = TileType.STONE
  }

  grid[10][12] = TileType.MOLDERING_LOG

  return grid
}

function plantKey(layer: Layer, pos: GridPos): string {
  return `${layer}:${posKey(pos)}`
}

export type DigResult =
  | { type: 'dug'; depth: number }
  | { type: 'hole_created' }
  | { type: 'bedrock_hit' }
  | { type: 'already_hole' }
  | { type: 'not_diggable' }

export type PlantResult =
  | { type: 'planted'; plant: Plant }
  | { type: 'wrong_layer' }
  | { type: 'not_plantable' }
  | { type: 'no_seeds' }

export type PickUpResult =
  | { type: 'picked_up'; item: CarriableItem }
  | { type: 'hands_full' }
  | { type: 'nothing_here' }

export type DeliverResult =
  | { type: 'delivered'; advanced: boolean; plant: Plant }
  | { type: 'planted'; plant: Plant }
  | { type: 'not_needed' }
  | { type: 'no_plant' }
  | { type: 'hands_empty' }
  | { type: 'wrong_type' }

export type FeedResourceResult =
  | { type: 'fed'; advanced: boolean; plant: Plant }
  | { type: 'not_needed' }
  | { type: 'no_plant' }
  | { type: 'fully_grown' }

export type BuyTreeResult =
  | { type: 'bought'; seed: SeedType }
  | { type: 'cant_afford' }
  | { type: 'hands_full' }

export class World {
  state: WorldState
  private nextLeylineId = 0

  constructor(saved?: WorldState) {
    if (saved) {
      this.state = saved
      if (this.state.carriedItem === undefined) {
        this.state.carriedItem = null
      }
      if (!this.state.treeBuffer) {
        this.state.treeBuffer = {}
      }
      if (!this.state.treePurchases) {
        this.state.treePurchases = {}
      }
      this.ensureSpecialTiles()
      const maxId = saved.leylines.reduce((max, l) => {
        const n = parseInt(l.id.replace('ley_', ''), 10)
        return isNaN(n) ? max : Math.max(max, n + 1)
      }, 0)
      this.nextLeylineId = maxId
    } else {
      this.state = {
        surface: createSurfaceMap(),
        underground: createUndergroundMap(),
        playerPos: { col: 6, row: 6 },
        playerLayer: Layer.SURFACE,
        inventory: {
          water: 0, crystalRed: 0, crystalBlue: 0, sunlight: 0,
          seeds: {} as Record<SeedType, number>,
        },
        carriedItem: null,
        seedStock: {} as Record<SeedType, number>,
        digDepths: {},
        plants: {},
        leylines: [],
        portal: { pos: { col: 12, row: 4 }, greenCrystalFed: 0, musicNotesFed: 0, level: 0 },
        unlocks: { leyline: false },
        treeBuffer: {},
        treePurchases: {},
        weather: createDefaultWeather(),
      }
    }
    if (!this.state.weather) {
      this.state.weather = createDefaultWeather()
    }
    if (this.state.weather.dayCount == null) {
      this.state.weather.dayCount = 1
    }
    bindState(this.state)
  }

  get currentGrid(): TileType[][] {
    return this.state.playerLayer === Layer.SURFACE
      ? this.state.surface
      : this.state.underground
  }

  getTile(layer: Layer, pos: GridPos): TileType {
    const grid = layer === Layer.SURFACE ? this.state.surface : this.state.underground
    return grid[pos.row]?.[pos.col] ?? TileType.STONE
  }

  getDigDepth(pos: GridPos, layer?: Layer): number {
    const l = layer ?? this.state.playerLayer
    return this.state.digDepths[`${l}:${posKey(pos)}`] ?? 0
  }

  getPlantAt(pos: GridPos, layer?: Layer): Plant | undefined {
    const l = layer ?? this.state.playerLayer
    return this.state.plants[plantKey(l, pos)]
  }

  getPlantsForLayer(layer: Layer): Plant[] {
    return Object.values(this.state.plants).filter(p => p.layer === layer)
  }

  findPath(target: GridPos): GridPos[] | null {
    return findPath(this.currentGrid, this.state.playerPos, target)
  }

  movePlayer(pos: GridPos): void {
    this.state.playerPos = pos
    markDirty()
  }

  dig(pos: GridPos): DigResult {
    const layer = this.state.playerLayer
    const grid = layer === Layer.SURFACE ? this.state.surface : this.state.underground
    const tile = grid[pos.row]?.[pos.col] ?? TileType.STONE

    if (tile === TileType.HOLE) return { type: 'already_hole' }
    if (this.getPlantAt(pos, layer)) return { type: 'not_diggable' }
    if (layer === Layer.SURFACE && !isDiggable(tile)) return { type: 'not_diggable' }
    if (layer === Layer.UNDERGROUND && tile !== TileType.DIRT) return { type: 'not_diggable' }

    const key = `${layer}:${posKey(pos)}`
    const depth = (this.state.digDepths[key] ?? 0) + 1
    this.state.digDepths[key] = depth

    if (depth >= DIG_MAX_DEPTH) {
      delete this.state.digDepths[key]
      if (layer === Layer.SURFACE) {
        this.state.surface[pos.row][pos.col] = TileType.HOLE
        this.state.underground[pos.row][pos.col] = TileType.HOLE
        markDirty()
        return { type: 'hole_created' }
      } else {
        this.state.underground[pos.row][pos.col] = TileType.STONE
        markDirty()
        return { type: 'bedrock_hit' }
      }
    }

    markDirty()
    return { type: 'dug', depth }
  }

  plantSeed(pos: GridPos, seed: SeedType): PlantResult {
    const layer = this.state.playerLayer
    if (seedLayer(seed) !== layer) return { type: 'wrong_layer' }

    if (seed === SeedType.WATER_LILY) {
      const tile = this.getTile(layer, pos)
      if (tile !== TileType.WATER) return { type: 'not_plantable' }
    } else if (seed === SeedType.LICHEN) {
      const tile = this.getTile(layer, pos)
      if (tile !== TileType.CRYSTAL_RED && tile !== TileType.CRYSTAL_BLUE) return { type: 'not_plantable' }
    } else {
      const depth = this.getDigDepth(pos, layer)
      if (depth < 1 || depth >= DIG_MAX_DEPTH) return { type: 'not_plantable' }
    }
    if (this.getPlantAt(pos, layer)) return { type: 'not_plantable' }

    const plant: Plant = {
      pos: { ...pos },
      layer,
      seedType: seed,
      stage: GrowthStage.SEED,
      waterFed: 0,
      crystalFed: 0,
      sunlightFed: 0,
      transmuteInput1: 0,
      transmuteInput2: 0,
    }
    this.state.plants[plantKey(layer, pos)] = plant
    markDirty()
    return { type: 'planted', plant }
  }

  switchLayer(): Layer {
    this.state.playerLayer =
      this.state.playerLayer === Layer.SURFACE ? Layer.UNDERGROUND : Layer.SURFACE
    markDirty()
    return this.state.playerLayer
  }

  private segmentKey(a: GridPos, b: GridPos): string {
    const k1 = `${a.col},${a.row}`
    const k2 = `${b.col},${b.row}`
    return k1 < k2 ? `${k1}-${k2}` : `${k2}-${k1}`
  }

  getOccupiedSegments(layer: Layer): Set<string> {
    const segs = new Set<string>()
    for (const ley of this.state.leylines) {
      if (ley.layer !== layer) continue
      for (let i = 0; i < ley.path.length - 1; i++) {
        segs.add(this.segmentKey(ley.path[i], ley.path[i + 1]))
      }
    }
    return segs
  }

  isSegmentOccupied(a: GridPos, b: GridPos, layer: Layer): boolean {
    const key = this.segmentKey(a, b)
    for (const ley of this.state.leylines) {
      if (ley.layer !== layer) continue
      for (let i = 0; i < ley.path.length - 1; i++) {
        if (this.segmentKey(ley.path[i], ley.path[i + 1]) === key) return true
      }
    }
    return false
  }

  private isLeylineJunction(pos: GridPos, layer: Layer): boolean {
    const tile = this.getTile(layer, pos)
    if (tile === TileType.HOLE || tile === TileType.MAGIC_TREE || tile === TileType.MOLDERING_LOG) return true
    if (this.getPlantAt(pos, layer)) return true
    if (layer === Layer.SURFACE && samePos(pos, this.state.portal.pos)) return true
    return false
  }

  addLeyline(path: GridPos[], layer: Layer): Leyline {
    const leyline: Leyline = {
      id: `ley_${this.nextLeylineId++}`,
      path: path.map(p => ({ ...p })),
      layer,
    }
    this.state.leylines.push(leyline)
    markDirty()
    return leyline
  }

  private leylineConnectionCount(pos: GridPos, layer: Layer): number {
    let count = 0
    for (const ley of this.state.leylines) {
      if (ley.layer !== layer || ley.path.length < 2) continue
      if (samePos(ley.path[0], pos)) count++
      if (samePos(ley.path[ley.path.length - 1], pos)) count++
    }
    return count
  }

  private splitLeylineAt(pos: GridPos, layer: Layer): string[] {
    const consumed: string[] = []
    for (let i = this.state.leylines.length - 1; i >= 0; i--) {
      const existing = this.state.leylines[i]
      if (existing.layer !== layer) continue
      const idx = existing.path.findIndex((p, j) =>
        j > 0 && j < existing.path.length - 1 && samePos(p, pos)
      )
      if (idx < 0) continue

      consumed.push(existing.id)
      const firstHalf = existing.path.slice(0, idx + 1)
      const secondHalf = existing.path.slice(idx)
      this.state.leylines.splice(i, 1)
      if (firstHalf.length >= 2) this.addLeyline(firstHalf, layer)
      if (secondHalf.length >= 2) this.addLeyline(secondHalf, layer)
      break
    }
    return consumed
  }

  addAndMergeLeyline(path: GridPos[], layer: Layer): { result: Leyline, consumed: string[] } {
    const consumed: string[] = []

    consumed.push(...this.splitLeylineAt(path[0], layer))
    consumed.push(...this.splitLeylineAt(path[path.length - 1], layer))

    const leyline = this.addLeyline(path, layer)

    let merged = true
    while (merged) {
      merged = false
      const start = leyline.path[0]
      const end = leyline.path[leyline.path.length - 1]

      for (let i = this.state.leylines.length - 1; i >= 0; i--) {
        const other = this.state.leylines[i]
        if (other.id === leyline.id || other.layer !== layer) continue

        const otherEnd = other.path[other.path.length - 1]
        const otherStart = other.path[0]

        if (samePos(otherEnd, start) && !this.isLeylineJunction(start, layer)
            && this.leylineConnectionCount(start, layer) <= 2) {
          leyline.path = [...other.path, ...leyline.path.slice(1)]
          consumed.push(other.id)
          this.state.leylines.splice(i, 1)
          merged = true
          break
        }

        if (samePos(otherStart, end) && !this.isLeylineJunction(end, layer)
            && this.leylineConnectionCount(end, layer) <= 2) {
          leyline.path = [...leyline.path, ...other.path.slice(1)]
          consumed.push(other.id)
          this.state.leylines.splice(i, 1)
          merged = true
          break
        }
      }
    }

    markDirty()
    return { result: leyline, consumed }
  }

  removeLeylineAt(pos: GridPos, layer: Layer): string | null {
    const idx = this.state.leylines.findIndex(l =>
      l.layer === layer && l.path.length > 0 && samePos(l.path[0], pos)
    )
    if (idx < 0) return null
    const id = this.state.leylines[idx].id
    this.state.leylines.splice(idx, 1)
    markDirty()
    return id
  }

  digUpLeyline(pos: GridPos, layer: Layer): { removed: string[], created: Leyline[] } {
    const result: { removed: string[], created: Leyline[] } = { removed: [], created: [] }

    const hits = this.state.leylines.filter(l =>
      l.layer === layer && l.path.some(p => samePos(p, pos))
    )

    for (const ley of hits) {
      const idx = ley.path.findIndex(p => samePos(p, pos))
      if (idx < 0) continue

      const arrIdx = this.state.leylines.indexOf(ley)
      if (arrIdx >= 0) this.state.leylines.splice(arrIdx, 1)
      result.removed.push(ley.id)

      if (idx >= 2) {
        result.created.push(this.addLeyline(ley.path.slice(0, idx), layer))
      }

      if (idx <= ley.path.length - 3) {
        result.created.push(this.addLeyline(ley.path.slice(idx + 1), layer))
      }
    }

    return result
  }

  getLeylines(layer: Layer): Leyline[] {
    return this.state.leylines.filter(l => l.layer === layer)
  }

  checkUnlocks(): { leylineJustUnlocked: boolean } {
    if (this.state.unlocks.leyline) return { leylineJustUnlocked: false }

    const maturePlants = Object.values(this.state.plants)
      .filter(p => p.stage === GrowthStage.MATURE)
    const hasWaterLily = maturePlants.some(p => p.seedType === SeedType.WATER_LILY)
    const hasSunflower = maturePlants.some(p => p.seedType === SeedType.SUNFLOWER)

    if (hasWaterLily && hasSunflower) {
      this.state.unlocks.leyline = true
      markDirty()
      return { leylineJustUnlocked: true }
    }

    return { leylineJustUnlocked: false }
  }

  feedPortal(resource: ResourceType): boolean {
    const portal = this.state.portal
    if (resource === ResourceType.CRYSTAL_GREEN) {
      portal.greenCrystalFed++
      this.updatePortalLevel()
      markDirty()
      return true
    }
    if (resource === ResourceType.MUSIC_NOTES) {
      portal.musicNotesFed++
      this.updatePortalLevel()
      markDirty()
      return true
    }
    return false
  }

  private updatePortalLevel(): void {
    const portal = this.state.portal
    const min = Math.min(portal.greenCrystalFed, portal.musicNotesFed)
    let level = 0
    let threshold = 0
    while (true) {
      threshold += Math.pow(10, level + 1)
      if (min < threshold) break
      level++
    }
    portal.level = level
  }

  portalProgress(): { level: number; greenFed: number; musicFed: number; nextThreshold: number } {
    const portal = this.state.portal
    let spent = 0
    for (let i = 1; i <= portal.level; i++) spent += Math.pow(10, i)
    const nextCost = Math.pow(10, portal.level + 1)
    return {
      level: portal.level,
      greenFed: portal.greenCrystalFed - spent,
      musicFed: portal.musicNotesFed - spent,
      nextThreshold: nextCost,
    }
  }

  pickUp(pos: GridPos): PickUpResult {
    if (this.state.carriedItem) return { type: 'hands_full' }
    const tile = this.getTile(this.state.playerLayer, pos)
    let resource: ResourceType | null = null
    if (tile === TileType.WATER) resource = ResourceType.WATER
    else if (tile === TileType.CRYSTAL_RED) resource = ResourceType.CRYSTAL_RED
    else if (tile === TileType.CRYSTAL_BLUE) resource = ResourceType.CRYSTAL_BLUE
    else if (tile === TileType.MOLDERING_LOG) resource = ResourceType.LIFE_ESSENCE
    if (!resource) return { type: 'nothing_here' }
    const item: CarriableItem = { type: 'resource', resource }
    this.state.carriedItem = item
    markDirty()
    return { type: 'picked_up', item }
  }

  pickUpSunlight(): PickUpResult {
    if (this.state.carriedItem) return { type: 'hands_full' }
    const item: CarriableItem = { type: 'resource', resource: ResourceType.SUNLIGHT }
    this.state.carriedItem = item
    markDirty()
    return { type: 'picked_up', item }
  }

  deliverToPlant(pos: GridPos): DeliverResult {
    const carried = this.state.carriedItem
    if (!carried) return { type: 'hands_empty' }

    if (carried.type === 'seed') {
      const seed = carried.seed
      const layer = this.state.playerLayer
      if (seedLayer(seed) !== layer) return { type: 'wrong_type' }

      if (seed === SeedType.WATER_LILY) {
        if (this.getTile(layer, pos) !== TileType.WATER) return { type: 'wrong_type' }
      } else if (seed === SeedType.LICHEN) {
        const tile = this.getTile(layer, pos)
        if (tile !== TileType.CRYSTAL_RED && tile !== TileType.CRYSTAL_BLUE) return { type: 'wrong_type' }
      } else {
        const depth = this.getDigDepth(pos, layer)
        if (depth < 1 || depth >= DIG_MAX_DEPTH) return { type: 'wrong_type' }
      }
      if (this.getPlantAt(pos, layer)) return { type: 'wrong_type' }

      const plant: Plant = {
        pos: { ...pos },
        layer,
        seedType: seed,
        stage: GrowthStage.SEED,
        waterFed: 0, crystalFed: 0, sunlightFed: 0,
        transmuteInput1: 0, transmuteInput2: 0,
      }
      this.state.plants[plantKey(layer, pos)] = plant
      this.state.carriedItem = null
      markDirty()
      return { type: 'planted', plant }
    }

    const layer = this.state.playerLayer
    const plant = this.getPlantAt(pos, layer)
    if (!plant) return { type: 'no_plant' }
    if (plant.stage === GrowthStage.MATURE) return { type: 'not_needed' }

    const result = this.feedPlantResource(pos, layer, carried.resource)
    if (result.type === 'fed') {
      this.state.carriedItem = null
      markDirty()
      return { type: 'delivered', advanced: result.advanced, plant: result.plant }
    }
    return { type: 'not_needed' }
  }

  dropItem(): CarriableItem | null {
    const item = this.state.carriedItem
    if (!item) return null
    this.state.carriedItem = null
    markDirty()
    return item
  }

  private ensureSpecialTiles(): void {
    if (this.state.surface[6][16] !== TileType.MAGIC_TREE) {
      this.state.surface[6][16] = TileType.MAGIC_TREE
    }
    if (this.state.underground[10][12] !== TileType.MOLDERING_LOG) {
      this.state.underground[10][12] = TileType.MOLDERING_LOG
    }
  }

  feedTree(resource: ResourceType): void {
    const key = resource as string
    this.state.treeBuffer[key] = (this.state.treeBuffer[key] ?? 0) + 1
    markDirty()
  }

  deliverToTree(): boolean {
    const carried = this.state.carriedItem
    if (!carried || carried.type !== 'resource') return false
    this.feedTree(carried.resource)
    this.state.carriedItem = null
    markDirty()
    return true
  }

  getTreeSeedCost(seed: SeedType): { resource: ResourceType; amount: number } {
    const purchased = this.state.treePurchases[seed] ?? 0
    const ladder = SEED_COST_LADDERS[seed]
    const amount = purchased < ladder.length ? ladder[purchased] : ladder[ladder.length - 1]
    let resource: ResourceType
    if (seed === SeedType.SUNFLOWER) resource = ResourceType.SUNLIGHT
    else if (seed === SeedType.WATER_LILY) resource = ResourceType.WATER
    else resource = ResourceType.LIFE_ESSENCE
    return { resource, amount }
  }

  canAffordTreeSeed(seed: SeedType): boolean {
    const cost = this.getTreeSeedCost(seed)
    const available = this.state.treeBuffer[cost.resource] ?? 0
    return available >= cost.amount
  }

  buyTreeSeed(seed: SeedType): BuyTreeResult {
    if (this.state.carriedItem) return { type: 'hands_full' }
    const cost = this.getTreeSeedCost(seed)
    const available = this.state.treeBuffer[cost.resource] ?? 0
    if (available < cost.amount) return { type: 'cant_afford' }

    this.state.treeBuffer[cost.resource] = available - cost.amount
    this.state.treePurchases[seed] = (this.state.treePurchases[seed] ?? 0) + 1
    this.state.carriedItem = { type: 'seed', seed }
    markDirty()
    return { type: 'bought', seed }
  }

  feedPlantResource(pos: GridPos, layer: Layer, resource: ResourceType): FeedResourceResult {
    const plant = this.getPlantAt(pos, layer)
    if (!plant) return { type: 'no_plant' }
    if (plant.stage === GrowthStage.MATURE) return { type: 'fully_grown' }

    const req = getStageReq(plant.seedType, plant.stage)

    switch (resource) {
      case ResourceType.WATER:
        if (plant.waterFed >= req.water) return { type: 'not_needed' }
        plant.waterFed++
        break
      case ResourceType.CRYSTAL_RED: {
        const expected = crystalTypeForSeed(plant.seedType)
        if (expected !== 'crystalRed') return { type: 'not_needed' }
        if (plant.crystalFed >= req.crystal) return { type: 'not_needed' }
        plant.crystalFed++
        break
      }
      case ResourceType.CRYSTAL_BLUE: {
        const expected = crystalTypeForSeed(plant.seedType)
        if (expected !== 'crystalBlue') return { type: 'not_needed' }
        if (plant.crystalFed >= req.crystal) return { type: 'not_needed' }
        plant.crystalFed++
        break
      }
      case ResourceType.SUNLIGHT:
        if (plant.sunlightFed >= req.sunlight) return { type: 'not_needed' }
        plant.sunlightFed++
        break
      default:
        return { type: 'not_needed' }
    }

    const done = plant.waterFed >= req.water &&
                 plant.crystalFed >= req.crystal &&
                 plant.sunlightFed >= req.sunlight
    let advanced = false
    if (done) {
      const next = nextStage(plant.stage)
      if (next) {
        plant.stage = next
        plant.waterFed = 0
        plant.crystalFed = 0
        plant.sunlightFed = 0
        advanced = true
      }
    }

    markDirty()
    return { type: 'fed', advanced, plant }
  }
}
