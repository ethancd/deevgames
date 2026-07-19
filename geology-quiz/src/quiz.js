// Pure helpers for turning a deck + direction into prompts, and for building
// multiple-choice questions with tempting distractors.

import { decks } from './data/decks.js'

export function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Resolve one item into {prompt, answer, promptImg, answerImg} for a direction.
// dir: 'fwd' (side0 -> side1) or 'rev' (side1 -> side0).
// Resolve which image (if any) sits on a given side. A deck can place an image
// on one side via imageOn (using item.img) and optionally a second on the other
// side via imageOnB (using item.imgB) — e.g. ore on one face, metal on the other.
function imgForSide(deck, item, idx) {
  if (deck.imageOn === idx) return item.img || null
  if (deck.imageOnB === idx) return item.imgB || null
  return null
}

export function viewItem(deck, item, dir) {
  const fwd = dir !== 'rev'
  const pIdx = fwd ? 0 : 1
  const aIdx = fwd ? 1 : 0
  return {
    prompt: item.sides[pIdx],
    answer: item.sides[aIdx],
    promptImg: imgForSide(deck, item, pIdx),
    answerImg: imgForSide(deck, item, aIdx),
    promptSub: deck.subOn === pIdx ? item.sub : null,
    answerSub: deck.subOn === aIdx ? item.sub : null,
    promptCrystal: deck.crystalOn === pIdx ? item.crystal : null,
    answerCrystal: deck.crystalOn === aIdx ? item.crystal : null,
    raw: item,
  }
}

// Map an answer value -> its subtitle (e.g. "SiO₂" -> "Silicon dioxide"),
// so MC option buttons can show the chemical name under each formula.
export function answerSubMap(deck, dir) {
  if (deck.subOn == null) return {}
  const aIdx = dir !== 'rev' ? 1 : 0
  if (deck.subOn !== aIdx) return {}
  // Gather every subtitle each answer value can carry.
  const byValue = {}
  for (const it of deck.items) {
    if (!it.sub) continue
    const k = it.sides[aIdx]
    ;(byValue[k] ||= new Set()).add(it.sub)
  }
  const map = {}
  for (const [k, subs] of Object.entries(byValue)) {
    if (subs.size === 1) {
      map[k] = [...subs][0]
    } else {
      // Conflicting subtitles for one value (e.g. "C" -> two carbons). If they
      // share a common base before the qualifier, use it ("Carbon"); otherwise
      // leave it off rather than claim one specific form.
      const bases = new Set([...subs].map((s) => s.split(' (')[0].trim()))
      if (bases.size === 1) map[k] = [...bases][0]
    }
  }
  return map
}

export function directionLabels(deck) {
  const [a, b] = deck.sides
  return {
    fwd: `${a} → ${b}`,
    rev: `${b} → ${a}`,
  }
}

// Filter a deck's items by sub-group tag ('all' = everything).
export function itemsForTag(deck, tag) {
  if (!tag || tag === 'all') return deck.items
  return deck.items.filter((it) => it.tag === tag)
}

// Build a MC question: the correct answer plus up to (n-1) distractors drawn
// from OTHER answers in the same deck. Distractors are deduped by value so we
// never show the same text twice (e.g. Graphite/Diamond both = "C").
export function buildQuestion(deck, view, allViews, optionCount = 4) {
  const correct = view.answer
  const pool = []
  const seen = new Set([correct])
  for (const v of shuffle(allViews)) {
    if (seen.has(v.answer)) continue
    seen.add(v.answer)
    pool.push(v.answer)
  }
  const distractors = pool.slice(0, Math.max(0, optionCount - 1))
  const options = shuffle([correct, ...distractors])
  return { ...view, options, correct }
}

// Build the Grand Gauntlet: every question from every deck, in every available
// direction, shuffled into one sudden-death gauntlet. Each question keeps its
// own deck's distractors and carries deck flair + its option subtitles so the
// gauntlet screen can render any of them.
export function buildGauntlet() {
  const out = []
  for (const deck of decks) {
    const dirsList = deck.reversible ? ['fwd', 'rev'] : ['fwd']
    for (const d of dirsList) {
      const allViews = deck.items.map((it) => viewItem(deck, it, d))
      const distinctAnswers = new Set(allViews.map((v) => v.answer)).size
      const optionCount = Math.min(4, distinctAnswers)
      const subs = answerSubMap(deck, d)
      for (const v of allViews) {
        const q = buildQuestion(deck, v, allViews, optionCount)
        out.push({
          ...q,
          deckId: deck.id,
          deckTitle: deck.title,
          deckColor: deck.color,
          deckEmoji: deck.emoji,
          dir: d,
          optionSubs: subs,
          askLabel: deck.sides[d === 'rev' ? 0 : 1],
        })
      }
    }
  }
  return shuffle(out)
}

// Produce the full ordered list of questions for a test run.
export function buildTest(deck, dir, tag, length) {
  const items = itemsForTag(deck, tag)
  const allViews = items.map((it) => viewItem(deck, it, dir))
  let chosen = shuffle(allViews)
  if (length && length !== 'all') chosen = chosen.slice(0, length)
  // Cap option count to what the pool can support (e.g. rock families = 3).
  const distinctAnswers = new Set(allViews.map((v) => v.answer)).size
  const optionCount = Math.min(4, distinctAnswers)
  return chosen.map((v) => buildQuestion(deck, v, allViews, optionCount))
}
