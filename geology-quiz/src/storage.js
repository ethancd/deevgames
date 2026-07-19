// localStorage-backed best-score tracking. Fails quietly if storage is unavailable.

const KEY = 'geo-quiz-best-v1'

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

function writeAll(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj))
  } catch {
    /* ignore (private mode, quota, etc.) */
  }
}

// A "scope" is one quizzable configuration of a deck (deck + direction + sub-group).
export function scopeKey(deckId, dir, tag) {
  return [deckId, dir || 'fwd', tag || 'all'].join(':')
}

export function getBest(deckId) {
  const all = readAll()
  // Best percentage across every scope of this deck, for the home tile.
  let best = null
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(deckId + ':')) {
      if (!best || v.pct > best.pct) best = v
    }
  }
  return best
}

export function getBestForScope(key) {
  return readAll()[key] || null
}

// Best for one direction of a deck (max across any sub-group tags in that dir).
export function getBestForDir(deckId, dir) {
  const all = readAll()
  const prefix = deckId + ':' + dir + ':'
  let best = null
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(prefix) && (!best || v.pct > best.pct)) best = v
  }
  return best
}

// Returns true if this run set a new record for the scope.
export function recordScore(key, { correct, total }) {
  const pct = total ? Math.round((correct / total) * 100) : 0
  const all = readAll()
  const prev = all[key]
  const isRecord = !prev || pct > prev.pct
  if (isRecord) {
    all[key] = { pct, correct, total }
    writeAll(all)
  }
  return { pct, isRecord }
}

// ----- "Master Geologist" status (all 5 decks crowned) -----
const MASTER_KEY = 'geo-quiz-master-v1'

export function getMasterStatus() {
  try {
    return JSON.parse(localStorage.getItem(MASTER_KEY)) || {}
  } catch {
    return {}
  }
}

// Record the moment all decks are mastered. Keeps the first date; marks the
// celebration as shown so the big animation only fires once.
export function recordMastered(dateISO) {
  const cur = getMasterStatus()
  const next = { date: cur.date || dateISO, celebrated: true }
  try {
    localStorage.setItem(MASTER_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

// ----- Grand Gauntlet best streak -----
const GAUNTLET_KEY = 'geo-quiz-gauntlet-v1'

export function getGauntletBest() {
  try {
    return JSON.parse(localStorage.getItem(GAUNTLET_KEY))?.best ?? 0
  } catch {
    return 0
  }
}

export function recordGauntletStreak(streak) {
  const best = getGauntletBest()
  const isRecord = streak > best
  if (isRecord) {
    try {
      localStorage.setItem(GAUNTLET_KEY, JSON.stringify({ best: streak }))
    } catch {
      /* ignore */
    }
  }
  return { best: Math.max(best, streak), isRecord }
}

// ===== Periodic Table (separate namespace; geology is untouched) =====
// Node test scores reuse recordScore/getBestForScope via `pt-…` scope strings.

// Gradual Gauntlet best, kept per question type.
const PT_GAUNTLET_KEY = 'pt-gauntlet-v1'

export function getPtGauntletBest(typeId) {
  try {
    return JSON.parse(localStorage.getItem(PT_GAUNTLET_KEY))?.[typeId] || null
  } catch {
    return null
  }
}

export function recordPtGauntlet(typeId, { correct, total }) {
  const pct = total ? Math.round((correct / total) * 100) : 0
  let all = {}
  try {
    all = JSON.parse(localStorage.getItem(PT_GAUNTLET_KEY)) || {}
  } catch {
    /* ignore */
  }
  const prev = all[typeId]
  const isRecord = !prev || pct > prev.pct
  if (isRecord) {
    all[typeId] = { pct, correct, total }
    try {
      localStorage.setItem(PT_GAUNTLET_KEY, JSON.stringify(all))
    } catch {
      /* ignore */
    }
  }
  return { pct, isRecord }
}

// Grand Gauntlet best streak (sudden death).
const PT_GRAND_KEY = 'pt-grand-v1'

export function getPtGrandBest() {
  try {
    return JSON.parse(localStorage.getItem(PT_GRAND_KEY))?.best ?? 0
  } catch {
    return 0
  }
}

export function recordPtGrandStreak(streak) {
  const best = getPtGrandBest()
  const isRecord = streak > best
  if (isRecord) {
    try {
      localStorage.setItem(PT_GRAND_KEY, JSON.stringify({ best: streak }))
    } catch {
      /* ignore */
    }
  }
  return { best: Math.max(best, streak), isRecord }
}

// "Periodic Master" status (whole tree crowned).
const PT_MASTER_KEY = 'pt-master-v1'

export function getPtMasterStatus() {
  try {
    return JSON.parse(localStorage.getItem(PT_MASTER_KEY)) || {}
  } catch {
    return {}
  }
}

export function recordPtMastered(dateISO) {
  const cur = getPtMasterStatus()
  const next = { date: cur.date || dateISO, celebrated: true }
  try {
    localStorage.setItem(PT_MASTER_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}
