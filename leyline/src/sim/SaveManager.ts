import { WorldState } from './types'

const SAVE_KEY = 'leyline_garden_save'
const SAVE_DEBOUNCE_MS = 2000

interface SaveData {
  state: WorldState
  savedAt: number
}

let dirty = false
let timer: ReturnType<typeof setTimeout> | null = null

export function markDirty(): void {
  if (dirty) return
  dirty = true
  if (timer) return
  timer = setTimeout(flush, SAVE_DEBOUNCE_MS)
}

let currentStateRef: WorldState | null = null

export function bindState(state: WorldState): void {
  currentStateRef = state
}

function flush(): void {
  timer = null
  if (!dirty || !currentStateRef) return
  dirty = false
  saveState(currentStateRef)
}

export function saveState(state: WorldState): void {
  try {
    const data: SaveData = { state, savedAt: Date.now() }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable
  }
}

export interface LoadResult {
  state: WorldState
  savedAt: number
}

export function loadState(): LoadResult | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Backwards compat: old saves stored WorldState directly
    if ('surface' in parsed) {
      return { state: parsed as WorldState, savedAt: Date.now() }
    }
    const data = parsed as SaveData
    return { state: data.state, savedAt: data.savedAt }
  } catch {
    return null
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null
}
