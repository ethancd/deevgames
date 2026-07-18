// Periodic quiz engine. Mirrors src/quiz.js but over element records with three
// fields (name / symbol / atomicNumber) → six directions, plus three categorical
// question types (family / block / type). Emits the same question shape the
// existing multiple-choice markup consumes.

import { ELEMENTS, FAMILIES, BLOCKS, TYPES } from '../data/elements.js'

export function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// The six reversible field directions.
export const DIRECTIONS = [
  { id: 'name-symbol', from: 'name', to: 'symbol', label: 'Name → Symbol', ask: 'Symbol' },
  { id: 'symbol-name', from: 'symbol', to: 'name', label: 'Symbol → Name', ask: 'Name' },
  { id: 'name-number', from: 'name', to: 'atomicNumber', label: 'Name → Number', ask: 'Atomic #' },
  { id: 'number-name', from: 'atomicNumber', to: 'name', label: 'Number → Name', ask: 'Name' },
  { id: 'symbol-number', from: 'symbol', to: 'atomicNumber', label: 'Symbol → Number', ask: 'Atomic #' },
  { id: 'number-symbol', from: 'atomicNumber', to: 'symbol', label: 'Number → Symbol', ask: 'Symbol' },
]

// The three categorical question types (gauntlet only).
export const CATEGORIES = [
  { id: 'name-family', from: 'name', to: 'family', label: 'Element → Family', ask: 'Family', category: 'family' },
  { id: 'name-block', from: 'name', to: 'block', label: 'Element → Block', ask: 'Block', category: 'block' },
  { id: 'name-type', from: 'name', to: 'type', label: 'Element → Type', ask: 'Type', category: 'type' },
]

export const ALL_TYPES = [...DIRECTIONS, ...CATEGORIES]

export function typeById(id) {
  return ALL_TYPES.find((t) => t.id === id)
}

export function blockLabel(b) {
  return b + '-block'
}

// Display value of a field for an element.
function fieldValue(el, field) {
  if (field === 'atomicNumber') return String(el.atomicNumber)
  if (field === 'block') return blockLabel(el.block)
  return el[field] // name, symbol, family, type
}

// Closed label set for a categorical question.
function labelSet(category) {
  if (category === 'family') return FAMILIES
  if (category === 'block') return BLOCKS.map(blockLabel)
  return TYPES
}

// Build one MC question. dir is a direction or category; pool is the element set
// distractors are drawn from (ignored for categoricals, which use the closed set).
export function buildElementQuestion(el, dir, pool, optionCount = 4) {
  const prompt = fieldValue(el, dir.from)
  const correct = fieldValue(el, dir.to)
  const sourceValues = dir.category ? labelSet(dir.category) : pool.map((e) => fieldValue(e, dir.to))

  const seen = new Set([correct])
  const distractors = []
  for (const v of shuffle(sourceValues)) {
    if (seen.has(v)) continue
    seen.add(v)
    distractors.push(v)
  }
  const options = shuffle([correct, ...distractors.slice(0, Math.max(0, optionCount - 1))])
  return {
    prompt,
    correct,
    options,
    el,
    family: el.family,
    dirId: dir.id,
    askLabel: dir.ask,
    fromField: dir.from,
    toField: dir.to,
    category: dir.category || null,
    // a categorical prompt can safely show the whole element tile (it reveals
    // name/symbol/number, none of which is the answer); a field prompt must not.
    promptIsTile: !!dir.category,
  }
}

// A full test over a pool in one direction/category.
export function buildElementTest(pool, dir) {
  const distinct = dir.category
    ? labelSet(dir.category).length
    : new Set(pool.map((e) => fieldValue(e, dir.to))).size
  const optionCount = Math.min(4, distinct)
  return shuffle(pool).map((el) => buildElementQuestion(el, dir, pool, optionCount))
}

// The Grand Gauntlet: every element × every direction + every categorical type,
// one shuffled sudden-death stream. Distractors per question come from the whole
// element set (directions) or the closed label set (categoricals).
export function buildGrandGauntlet() {
  const out = []
  for (const dir of ALL_TYPES) {
    const distinct = dir.category
      ? labelSet(dir.category).length
      : new Set(ELEMENTS.map((e) => fieldValue(e, dir.to))).size
    const optionCount = Math.min(4, distinct)
    for (const el of ELEMENTS) out.push(buildElementQuestion(el, dir, ELEMENTS, optionCount))
  }
  return shuffle(out)
}
