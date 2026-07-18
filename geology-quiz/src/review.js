// Spaced-repetition "freshness" for crowned decks/nodes. Subject-agnostic:
// callers pass a node id and whether it's currently crowned.
//
// Two-stage Leitner box:
//  • Stage 1 (daily): while you've reviewed on < PROMOTE_DAYS distinct days, a
//    crowned deck is "due" if you haven't aced any direction TODAY.
//  • Stage 2 (weekly): after acing on PROMOTE_DAYS separate days, the interval
//    grows — each 100% keeps it fresh for STAGE2_INTERVAL days.
// The crown is never lost; "due" is a freshness overlay with a refresh nudge.

const KEY = 'review-v1'
const PROMOTE_DAYS = 3
const STAGE1_INTERVAL = 1 // day
const STAGE2_INTERVAL = 7 // days

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}
function writeAll(o) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o))
  } catch {
    /* ignore */
  }
}

export function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function dayNum(s) {
  const [y, m, d] = s.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

// Call when a node is aced (100%) while crowned. Counts distinct calendar days.
export function recordAce(nodeId) {
  const all = readAll()
  const today = todayStr()
  const cur = all[nodeId] || { last: null, days: 0 }
  if (cur.last !== today) cur.days = (cur.days || 0) + 1
  cur.last = today
  all[nodeId] = cur
  writeAll(all)
  return cur
}

export function getReview(nodeId) {
  return readAll()[nodeId] || null
}

// Freshness state for a node (only "due" when crowned).
export function reviewState(nodeId, isCrowned) {
  const rec = readAll()[nodeId]
  const days = rec?.days || 0
  const stage = days >= PROMOTE_DAYS ? 2 : 1
  const interval = stage === 2 ? STAGE2_INTERVAL : STAGE1_INTERVAL
  const last = rec?.last || null
  const daysSince = last ? dayNum(todayStr()) - dayNum(last) : Infinity
  const due = !!isCrowned && daysSince >= interval
  return { stage, interval, distinctDays: days, last, daysSince, due }
}

// How many of these nodes are crowned-and-due (for a home-screen nudge).
export function dueCount(nodes, isCrowned) {
  return nodes.filter((n) => reviewState(n.id, isCrowned(n)).due).length
}
