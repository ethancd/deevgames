// Crowns + the s/p/d/f knowledge tree for the Periodic Table.
//
// Crown rule (user's choice): a node is crowned only when EVERY direction is
// aced at CROWN_PCT on the node's CURRENT pool. We require the stored record's
// `total` to equal the current pool size, so a composite that grows as more
// children are crowned must be re-passed — it never reads as crowned on a stale,
// smaller pool.

import { PT_DECKS, PT_COMPOSITES, getNode, elementsForDeck } from '../data/elements.js'
import { DIRECTIONS } from './quiz.js'
import { scopeKey, getBestForScope } from '../storage.js'
import { CROWN_PCT, CROWN_REQUIRE_ALL_DIRECTIONS, COMPOSITE_UNLOCK, GRADUAL_GAUNTLET_UNLOCK } from './config.js'

export const ALL_NODES = [...PT_DECKS, ...PT_COMPOSITES]

export function nodeScopeKey(nodeId, dirId) {
  return scopeKey(nodeId, dirId, 'all')
}

// A node's current element pool. Composite = union of its CROWNED children only.
export function nodePool(node) {
  if (node.kind === 'composite') {
    const els = []
    for (const childId of node.children) {
      if (isNodeCrowned(getNode(childId))) els.push(...elementsForDeck(childId))
    }
    return els
  }
  return elementsForDeck(node.id)
}

export function poolSize(node) {
  return nodePool(node).length
}

function directionAced(node, dirId, size) {
  const rec = getBestForScope(nodeScopeKey(node.id, dirId))
  return !!rec && rec.pct >= CROWN_PCT && rec.total === size
}

export function isNodeCrowned(node) {
  const size = poolSize(node)
  if (size === 0) return false
  const check = (d) => directionAced(node, d.id, size)
  return CROWN_REQUIRE_ALL_DIRECTIONS ? DIRECTIONS.every(check) : DIRECTIONS.some(check)
}

// How many of the six directions are aced on the current pool (tile progress).
export function directionProgress(node) {
  const size = poolSize(node)
  const done = size === 0 ? 0 : DIRECTIONS.filter((d) => directionAced(node, d.id, size)).length
  return { done, total: DIRECTIONS.length }
}

export function childrenCrownedCount(composite) {
  return composite.children.filter((id) => isNodeCrowned(getNode(id))).length
}

export function compositeUnlocked(composite) {
  return childrenCrownedCount(composite) >= COMPOSITE_UNLOCK
}

export function crownedNodes() {
  return ALL_NODES.filter(isNodeCrowned)
}

export function crownCount() {
  return crownedNodes().length
}

// Gradual Gauntlet pool: union of elements across all crowned nodes (deduped).
export function gauntletPool() {
  const byNum = new Map()
  for (const node of crownedNodes()) {
    for (const el of nodePool(node)) byNum.set(el.atomicNumber, el)
  }
  return [...byNum.values()]
}

export function gauntletUnlocked() {
  return crownedNodes().length >= GRADUAL_GAUNTLET_UNLOCK
}

// Whole tree crowned → Grand Gauntlet unlock + Periodic Master celebration.
export function allPtMastered() {
  return ALL_NODES.length > 0 && ALL_NODES.every(isNodeCrowned)
}
