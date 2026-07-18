// Crown / mastery logic, shared by the home screen and the score screen.
// A deck is "crowned" only when its WHOLE set (the "All" scope) is aced 100%
// in every required direction. Reversible decks need both directions. Acing a
// sub-group (e.g. just the periods) does NOT earn the crown — it's partial
// credit, surfaced separately via groupProgress().

import { decks } from './data/decks.js'
import { scopeKey, getBestForScope } from './storage.js'

export function isDeckMastered(deck) {
  const dirsList = deck.reversible ? ['fwd', 'rev'] : ['fwd']
  return dirsList.every((d) => getBestForScope(scopeKey(deck.id, d, 'all'))?.pct === 100)
}

export function crownCount() {
  return decks.filter(isDeckMastered).length
}

export function allMastered() {
  return decks.length > 0 && decks.every(isDeckMastered)
}

// For tag-grouped decks (Geologic Time): how many sub-groups have been aced
// 100% individually. Returns null for decks without sub-groups.
export function groupProgress(deck) {
  if (!deck.tags) return null
  const done = deck.tags.filter(
    (t) => getBestForScope(scopeKey(deck.id, 'fwd', t))?.pct === 100
  ).length
  return { done, total: deck.tags.length }
}
