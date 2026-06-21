export const TILE_SIZE = 32

export const WORLD_COLS = 24
export const WORLD_ROWS = 16
export const DIG_MAX_DEPTH = 5

export enum TileType {
  GRASS = 'grass',
  WATER = 'water',
  DIRT = 'dirt',
  STONE = 'stone',
  CRYSTAL_RED = 'crystal_red',
  CRYSTAL_BLUE = 'crystal_blue',
  HOLE = 'hole',
  PLANTED = 'planted',
  PATH = 'path',
  FLOWERS = 'flowers',
  MOSS = 'moss',
  MUSHROOM = 'mushroom',
  MAGIC_TREE = 'magic_tree',
  MOLDERING_LOG = 'moldering_log',
}

export enum Layer {
  SURFACE = 'surface',
  UNDERGROUND = 'underground',
}

export enum ResourceType {
  WATER = 'water',
  CRYSTAL_RED = 'crystal_red',
  CRYSTAL_BLUE = 'crystal_blue',
  SUNLIGHT = 'sunlight',
  LIFE_ESSENCE = 'life_essence',
  MUSIC_NOTES = 'music_notes',
  CRYSTAL_GREEN = 'crystal_green',
}

export const RESOURCE_COLORS: Record<ResourceType, number> = {
  [ResourceType.WATER]: 0xb0d4f1,
  [ResourceType.CRYSTAL_RED]: 0xef4444,
  [ResourceType.CRYSTAL_BLUE]: 0x3a0080,
  [ResourceType.SUNLIGHT]: 0xfbbf24,
  [ResourceType.LIFE_ESSENCE]: 0xa8e6cf,
  [ResourceType.MUSIC_NOTES]: 0x1a1a2e,
  [ResourceType.CRYSTAL_GREEN]: 0x0a6e2e,
}

export const RESOURCE_EMOJI: Record<ResourceType, string> = {
  [ResourceType.WATER]: '💧',
  [ResourceType.CRYSTAL_RED]: '🔴',
  [ResourceType.CRYSTAL_BLUE]: '🔵',
  [ResourceType.SUNLIGHT]: '☀️',
  [ResourceType.LIFE_ESSENCE]: '🌿',
  [ResourceType.MUSIC_NOTES]: '🎵',
  [ResourceType.CRYSTAL_GREEN]: '💚',
}

export const RESOURCE_NAMES: Record<ResourceType, string> = {
  [ResourceType.WATER]: 'Water',
  [ResourceType.CRYSTAL_RED]: 'Red Crystal',
  [ResourceType.CRYSTAL_BLUE]: 'Blue Crystal',
  [ResourceType.SUNLIGHT]: 'Sunlight',
  [ResourceType.LIFE_ESSENCE]: 'Life Essence',
  [ResourceType.MUSIC_NOTES]: 'Music Notes',
  [ResourceType.CRYSTAL_GREEN]: 'Green Crystal',
}

export const MOTE_TEXTURES: Record<ResourceType, string> = {
  [ResourceType.WATER]: 'mote_water',
  [ResourceType.SUNLIGHT]: 'mote_sun',
  [ResourceType.CRYSTAL_RED]: 'mote_diamond',
  [ResourceType.CRYSTAL_BLUE]: 'mote_diamond',
  [ResourceType.LIFE_ESSENCE]: 'mote_leaf',
  [ResourceType.MUSIC_NOTES]: 'mote_note',
  [ResourceType.CRYSTAL_GREEN]: 'mote_diamond',
}

export interface GridPos {
  col: number
  row: number
}

export interface Inventory {
  water: number
  crystalRed: number
  crystalBlue: number
  sunlight: number
  seeds: Record<SeedType, number>
}

export type CarriableItem =
  | { type: 'resource'; resource: ResourceType }
  | { type: 'seed'; seed: SeedType }

export interface Leyline {
  id: string
  path: GridPos[]
  layer: Layer
}

export interface Portal {
  pos: GridPos
  greenCrystalFed: number
  musicNotesFed: number
  level: number
}

export interface WeatherState {
  timeOfDay: number      // 0.0–1.0 (0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk)
  isRaining: boolean
  rainTimer: number      // ms until rain state changes
  weatherFeedTimer: number  // ms accumulator for feed interval
  dayCount: number       // in-game day number, increments each time timeOfDay wraps past 0
  treeFeedCounter: number  // counts feed ticks; tree gets fed every 6th tick
}

export interface Unlocks {
  leyline: boolean
}

export interface WorldState {
  surface: TileType[][]
  underground: TileType[][]
  playerPos: GridPos
  playerLayer: Layer
  inventory: Inventory
  carriedItem: CarriableItem | null
  seedStock: Record<SeedType, number>
  digDepths: Record<string, number>
  plants: Record<string, Plant>
  leylines: Leyline[]
  portal: Portal
  unlocks: Unlocks
  treeBuffer: Record<string, number>
  treePurchases: Record<string, number>
  weather: WeatherState
}

export type ToolMode = 'move' | 'shovel' | 'plant' | 'leyline'

export enum SeedType {
  WATER_LILY = 'water_lily',
  SUNFLOWER = 'sunflower',
  LIFELEAF = 'lifeleaf',
  DEWBELL = 'dewbell',
  LICHEN = 'lichen',
  ROOTWEAVE = 'rootweave',
  GLIMSTONE = 'glimstone',
}

export enum GrowthStage {
  SEED = 'seed',
  SPROUT = 'sprout',
  SAPLING = 'sapling',
  MATURE = 'mature',
}

export interface Plant {
  pos: GridPos
  layer: Layer
  seedType: SeedType
  stage: GrowthStage
  waterFed: number
  crystalFed: number
  sunlightFed: number
  transmuteInput1: number
  transmuteInput2: number
}

const DIGGABLE = new Set<TileType>([
  TileType.GRASS,
  TileType.FLOWERS,
  TileType.MOSS,
  TileType.MUSHROOM,
  TileType.PATH,
])

export function isDiggable(tile: TileType): boolean {
  return DIGGABLE.has(tile)
}

export function posKey(pos: GridPos): string {
  return `${pos.col},${pos.row}`
}

export function samePos(a: GridPos, b: GridPos): boolean {
  return a.col === b.col && a.row === b.row
}

export function isAdjacent(a: GridPos, b: GridPos): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) <= 1
}
