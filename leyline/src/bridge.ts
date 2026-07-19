import { ToolMode, CarriableItem, SeedType, Layer, Unlocks, WeatherState, GridPos } from './sim/types'

let _tool: ToolMode = 'move'
const toolListeners: Array<(t: ToolMode) => void> = []

export function getTool(): ToolMode { return _tool }

export function setTool(t: ToolMode): void {
  _tool = t
  toolListeners.forEach(fn => fn(t))
}

export function onToolChange(fn: (t: ToolMode) => void): () => void {
  toolListeners.push(fn)
  return () => {
    const i = toolListeners.indexOf(fn)
    if (i >= 0) toolListeners.splice(i, 1)
  }
}

let _currentLayer: Layer = Layer.SURFACE
const layerListeners: Array<(l: Layer) => void> = []

export function getCurrentLayer(): Layer { return _currentLayer }

export function setCurrentLayer(l: Layer): void {
  _currentLayer = l
  layerListeners.forEach(fn => fn(l))
}

export function onLayerChange(fn: (l: Layer) => void): () => void {
  layerListeners.push(fn)
  return () => {
    const i = layerListeners.indexOf(fn)
    if (i >= 0) layerListeners.splice(i, 1)
  }
}

let _unlocks: Unlocks = { leyline: false }
const unlockListeners: Array<(u: Unlocks) => void> = []

export function getUnlocks(): Unlocks { return _unlocks }

export function setUnlocks(u: Unlocks): void {
  _unlocks = { ...u }
  unlockListeners.forEach(fn => fn(_unlocks))
}

export function onUnlocksChange(fn: (u: Unlocks) => void): () => void {
  unlockListeners.push(fn)
  return () => {
    const i = unlockListeners.indexOf(fn)
    if (i >= 0) unlockListeners.splice(i, 1)
  }
}

export interface TooltipData {
  screenX: number
  screenY: number
  html: string
}

const tooltipListeners: Array<(data: TooltipData | null) => void> = []

export function showTooltip(data: TooltipData): void {
  tooltipListeners.forEach(fn => fn(data))
}

export function hideTooltip(): void {
  tooltipListeners.forEach(fn => fn(null))
}

export function onTooltipChange(fn: (data: TooltipData | null) => void): () => void {
  tooltipListeners.push(fn)
  return () => {
    const i = tooltipListeners.indexOf(fn)
    if (i >= 0) tooltipListeners.splice(i, 1)
  }
}

let _carriedItem: CarriableItem | null = null
const carriedListeners: Array<(item: CarriableItem | null) => void> = []

export function notifyCarriedItem(item: CarriableItem | null): void {
  _carriedItem = item
  carriedListeners.forEach(fn => fn(item))
}

export function getCarriedItem(): CarriableItem | null { return _carriedItem }

export function onCarriedItemChange(fn: (item: CarriableItem | null) => void): () => void {
  carriedListeners.push(fn)
  return () => {
    const i = carriedListeners.indexOf(fn)
    if (i >= 0) carriedListeners.splice(i, 1)
  }
}

const dropListeners: Array<() => void> = []

export function requestDrop(): void {
  dropListeners.forEach(fn => fn())
}

export function onDropRequest(fn: () => void): () => void {
  dropListeners.push(fn)
  return () => {
    const i = dropListeners.indexOf(fn)
    if (i >= 0) dropListeners.splice(i, 1)
  }
}

const treeBuyListeners: Array<(seed: SeedType) => void> = []

export function requestTreeBuy(seed: SeedType): void {
  treeBuyListeners.forEach(fn => fn(seed))
}

export function onTreeBuyRequest(fn: (seed: SeedType) => void): () => void {
  treeBuyListeners.push(fn)
  return () => {
    const i = treeBuyListeners.indexOf(fn)
    if (i >= 0) treeBuyListeners.splice(i, 1)
  }
}

const helpListeners: Array<() => void> = []

export function requestHelp(): void {
  helpListeners.forEach(fn => fn())
}

export function onHelpRequest(fn: () => void): () => void {
  helpListeners.push(fn)
  return () => {
    const i = helpListeners.indexOf(fn)
    if (i >= 0) helpListeners.splice(i, 1)
  }
}

const newGameListeners: Array<() => void> = []

export function requestNewGame(): void {
  newGameListeners.forEach(fn => fn())
}

export function onNewGameRequest(fn: () => void): () => void {
  newGameListeners.push(fn)
  return () => {
    const i = newGameListeners.indexOf(fn)
    if (i >= 0) newGameListeners.splice(i, 1)
  }
}

const weatherListeners: Array<(w: WeatherState) => void> = []

export function notifyWeather(w: WeatherState): void {
  weatherListeners.forEach(fn => fn(w))
}

export function onWeatherChange(fn: (w: WeatherState) => void): () => void {
  weatherListeners.push(fn)
  return () => {
    const i = weatherListeners.indexOf(fn)
    if (i >= 0) weatherListeners.splice(i, 1)
  }
}

const emitListeners: Array<(progress: number, fired: boolean) => void> = []

export function notifyEmitProgress(progress: number, fired: boolean): void {
  emitListeners.forEach(fn => fn(progress, fired))
}

export function onEmitProgress(fn: (progress: number, fired: boolean) => void): () => void {
  emitListeners.push(fn)
  return () => {
    const i = emitListeners.indexOf(fn)
    if (i >= 0) emitListeners.splice(i, 1)
  }
}

// Debug panel (desktop only)
export type DebugAction =
  | { type: 'toggleRain' }
  | { type: 'toggleDayNight' }
  | { type: 'placeMaturePlant'; seed: SeedType }

const debugListeners: Array<(action: DebugAction) => void> = []

export function requestDebugAction(action: DebugAction): void {
  debugListeners.forEach(fn => fn(action))
}

export function onDebugAction(fn: (action: DebugAction) => void): () => void {
  debugListeners.push(fn)
  return () => {
    const i = debugListeners.indexOf(fn)
    if (i >= 0) debugListeners.splice(i, 1)
  }
}
