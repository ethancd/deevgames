// Pure, framework-free validation used by the browser (live-as-you-type),
// the dev-server hard gate, and the design retry loop. No I/O here.

import type { CardDef } from './types';

// Rule: digits other than "1" are rejected mechanically. Every digit RUN
// (a maximal sequence of consecutive digit characters) must be exactly "1".
// "10" -> run "10" != "1" -> violation. "1.5" -> runs "1" and "5" -> "5"
// violates. "1, then 1" -> runs "1" and "1" -> both fine.
const DIGIT_RUN_RE = /\d+/g;

// Rule: spelled-out number words >= two are hard violations. "one", "once",
// "1", and "a"/"an" are fine and intentionally NOT in this list.
const NUMBER_WORDS = [
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'dozen',
  'twenty',
  'hundred',
  'thousand',
  'million',
  'zero',
  'twice',
  'thrice',
  'double',
  'triple',
  'quadruple',
  'both',
  'couple',
  'pair',
  'half',
] as const;

const NUMBER_WORD_RE = new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\b`, 'gi');

export function checkNumeralRule(text: string): string[] {
  const violations: string[] = [];

  for (const match of text.matchAll(DIGIT_RUN_RE)) {
    if (match[0] !== '1') {
      violations.push(
        `Digit "${match[0]}" is not allowed; only the numeral "1" may appear.`
      );
    }
  }

  for (const match of text.matchAll(NUMBER_WORD_RE)) {
    violations.push(
      `Number word "${match[0]}" is not allowed; only "one" may be used.`
    );
  }

  return violations;
}

// Normalize for duplicate comparison: casefold, collapse internal
// whitespace, strip trailing punctuation.
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:]+$/g, '');
}

// Rule: card effect text may be at most 280 characters. Only the effect text
// is length-limited (the rule is stated as "card effect length"); names are
// bounded separately by the form's maxlength.
export const EFFECT_LENGTH_LIMIT = 280;

export function checkEffectLength(effectText: string): string[] {
  if (effectText.length > EFFECT_LENGTH_LIMIT) {
    return [
      `Effect text is ${effectText.length} characters; the limit is ${EFFECT_LENGTH_LIMIT}.`,
    ];
  }
  return [];
}

// Rule: card names (titles) may be at most 32 characters.
export const NAME_LENGTH_LIMIT = 32;

export function checkNameLength(name: string): string[] {
  if (name.length > NAME_LENGTH_LIMIT) {
    return [`Name is ${name.length} characters; the limit is ${NAME_LENGTH_LIMIT}.`];
  }
  return [];
}

// Rule: all card text must be in English -- enforced at the SCRIPT level only
// (semantic English-ness, "these must be real English words," is a design-time
// concern handled elsewhere). The allowlist is Latin letters (including
// accented Latin-1-Supplement / Latin-Extended, so "Piñata", "café", "naïve",
// "déjà-vu" pass), combining marks (so decomposed accents pass too), digits
// 0-9, whitespace, and common punctuation -- including en-dash, em-dash, curly
// quotes, and the ellipsis. Any character outside this set (CJK, Cyrillic,
// Greek, Arabic, Hebrew, emoji, ...) is a violation. Note `\p{Script=Latin}`
// (not `\p{L}`) is deliberate: `\p{L}` would wrongly admit Cyrillic/CJK letters.
const ALLOWED_TEXT_RE =
  /[\p{Script=Latin}\p{Mark}0-9\s.,;:!?'"()\[\]{}\/&+*%@#$^~`_|\\<>=–—‘’“”…-]/gu;

export function checkEnglishRule(text: string): string[] {
  const remainder = text.replace(ALLOWED_TEXT_RE, '');
  return remainder.length > 0 ? ['card text must be written in English'] : [];
}

// Rule: a single card can't have a subeffect repeat multiple times (e.g.
// "draw 1 card, then draw 1 card, then draw 1 card" is illegal). This is the
// MECHANICAL layer: it catches exact / near-exact repeats after normalization;
// catching paraphrased repeats ("draw 1 more card") is a design-time semantic
// concern, not this function's job.
//
// Clauses are split on sentence boundaries (`.`, `;`), commas, and
// "then"/"and then" connectives (case-insensitive). Splitting on commas as
// well as connectives is what lets a repeat embedded after a preamble be seen
// as its own subeffect (e.g. "When you play this card, draw 1 card, then draw 1
// card" -> the two "draw 1 card" clauses match).
const CLAUSE_SPLIT_RE = /[.;,]+|\b(?:and\s+)?then\b/gi;

// Leading connective words stripped during clause normalization (the leading
// word only, never mid-clause). Applied AFTER casefolding, so no `i` flag.
const LEADING_CONNECTIVE_RE = /^(?:then|and|next|also|finally)\b\s*/;

// Normalize one clause for repeat comparison: casefold, collapse internal
// whitespace, strip a leading connective word, strip trailing punctuation.
export function normalizeClause(clause: string): string {
  return clause
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(LEADING_CONNECTIVE_RE, '')
    .replace(/[.,!?;:]+$/g, '')
    .trim();
}

// Split effect text into normalized, non-empty clauses.
export function splitClauses(effectText: string): string[] {
  return effectText
    .split(CLAUSE_SPLIT_RE)
    .map(normalizeClause)
    .filter((c) => c.length > 0);
}

export function checkRepeatedSubeffect(effectText: string): string[] {
  // Only clauses of length >= 10 count -- short fragments like "end turn"
  // repeating is not a meaningful subeffect repeat.
  const clauses = splitClauses(effectText).filter((c) => c.length >= 10);
  const counts = new Map<string, number>();
  for (const clause of clauses) {
    counts.set(clause, (counts.get(clause) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 2) {
      // Exactly ONE violation, no matter how many clauses repeat.
      return ['a card may not repeat the same subeffect'];
    }
  }
  return [];
}

// Rule 13 (NO DEIXIS OUTSIDE THE INNER GAME, added 2026-07-03): a card's
// effect can't refer to anything outside the game that would distinguish
// between players, rounds, matches, or real-world time. The inner game is a
// closed world -- effect text may reference in-game roles/state only ("you",
// "your opponent", zones, points, turns, card names/types). BANNED: creator/
// designer identity ("cards you created"), design-round/match/game-history
// references ("this round", "the match score", "last game"), outer-game
// structure ("inner game"/"outer game" as terms), and real-world deixis
// (weekdays, months, "today"/"tomorrow"/"yesterday", "o'clock", "the human",
// "Claude" as a proper name). This is the MECHANICAL floor -- it catches
// hard, literal violations; semantic paraphrases (e.g. "the player who first
// wrote this card's text") are the live design prompt's job to avoid
// (server/claude.ts), not this function's.
//
// Word-boundary, case-insensitive single-word bans.
const DEIXIS_WORD_TERMS = [
  'creator',
  'creators',
  'created',
  'creating',
  'designer',
  'designers',
  'designed',
  'designing',
  'design',
  'designs',
  'round',
  'rounds',
  'claude',
  'today',
  'tomorrow',
  'yesterday',
  "o'clock",
] as const;

// Phrase-level, case-insensitive bans. "match" is deliberately NOT a bare
// word ban -- "if the names match" / "matching keepers" are legitimate
// in-game language -- so only these specific outer-game phrasings are
// flagged. Same reasoning extends to the other multi-word game/time phrases
// here: banning them as phrases (not their component words) avoids
// collateral damage to legitimate uses of "game," "last," "next," etc.
const DEIXIS_PHRASE_TERMS = [
  'previous game',
  'last game',
  'next game',
  'inner game',
  'outer game',
  'the human',
  'the match',
  'this match',
  'match score',
  'win the match',
  'per match',
] as const;

// Month/weekday names are proper nouns that collide with ordinary English
// words when lowercase -- "you MAY draw a card" (modal verb), "an AUGUST
// golem" (adjective, "respected"), "MARCH your troops forward" (verb). Real
// calendar references are always capitalized, so -- unlike every other
// bucket above -- these are matched CASE-SENSITIVELY against their exact
// capitalized form. This is a deliberate deviation from "case-insensitive"
// to avoid false-positiving on those common words; noted per the task's
// guidance to prefer precision when a term is ambiguous.
const DEIXIS_CASE_SENSITIVE_TERMS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function wordBoundaryRegex(terms: readonly string[], flags: string): RegExp {
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, flags);
}

const DEIXIS_WORD_RE = wordBoundaryRegex(DEIXIS_WORD_TERMS, 'gi');
const DEIXIS_PHRASE_RE = wordBoundaryRegex(DEIXIS_PHRASE_TERMS, 'gi');
const DEIXIS_CASE_SENSITIVE_RE = wordBoundaryRegex(DEIXIS_CASE_SENSITIVE_TERMS, 'g');

export function checkDeixisRule(text: string): string[] {
  const violations: string[] = [];
  for (const re of [DEIXIS_PHRASE_RE, DEIXIS_WORD_RE, DEIXIS_CASE_SENSITIVE_RE]) {
    for (const match of text.matchAll(re)) {
      violations.push(
        `card text may not reference anything outside the inner game (found "${match[0]}")`
      );
    }
  }
  return violations;
}

export interface DuplicateCheckResult {
  nameDuplicateOf?: CardDef;
  effectDuplicateOf?: CardDef;
}

// Compares against EVERY registry row, including destroyed ones — a
// destroyed card's name/effect can never be reused, which falls out for
// free because destroyed rows are never deleted from the registry.
export function checkDuplicates(
  candidate: { name: string; effectText: string },
  registry: readonly CardDef[]
): DuplicateCheckResult {
  const normName = normalizeText(candidate.name);
  const normEffect = normalizeText(candidate.effectText);
  const result: DuplicateCheckResult = {};

  for (const row of registry) {
    if (!result.nameDuplicateOf && normalizeText(row.name) === normName) {
      result.nameDuplicateOf = row;
    }
    if (
      !result.effectDuplicateOf &&
      normalizeText(row.effectText) === normEffect
    ) {
      result.effectDuplicateOf = row;
    }
    if (result.nameDuplicateOf && result.effectDuplicateOf) break;
  }

  return result;
}

export interface CardCandidate {
  name: string;
  effectText: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: string[];
}

export function validateNewCard(
  candidate: CardCandidate,
  registry: readonly CardDef[]
): ValidationResult {
  const violations: string[] = [
    ...checkNumeralRule(candidate.name),
    ...checkNumeralRule(candidate.effectText),
    // English rule applies to BOTH fields; run once over the combined text so
    // a violation is reported exactly once regardless of which field offends.
    ...checkEnglishRule(`${candidate.name} ${candidate.effectText}`),
    // Deixis rule (13) also applies to BOTH fields -- a creator/round/match
    // reference could just as easily land in the name as the effect text.
    ...checkDeixisRule(`${candidate.name} ${candidate.effectText}`),
    // Length and repeated-subeffect are effect-text-only per the rules as
    // stated ("card effect length"; the repeat example is about effect text).
    ...checkNameLength(candidate.name),
    ...checkEffectLength(candidate.effectText),
    ...checkRepeatedSubeffect(candidate.effectText),
  ];

  const dupes = checkDuplicates(candidate, registry);
  if (dupes.nameDuplicateOf) {
    violations.push(
      `Name duplicates existing card "${dupes.nameDuplicateOf.id}" ("${dupes.nameDuplicateOf.name}").`
    );
  }
  if (dupes.effectDuplicateOf) {
    violations.push(
      `Effect text duplicates existing card "${dupes.effectDuplicateOf.id}" ("${dupes.effectDuplicateOf.name}").`
    );
  }

  return { ok: violations.length === 0, violations };
}
