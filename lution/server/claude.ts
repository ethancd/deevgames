// The stable seam between Lution's server and live Claude:
//   - designCard(): Anthropic Messages API, structured JSON, one card design
//     per call. Server validates the result mechanically (shared/
//     validation.ts) and retries internally (<=3) feeding violations back --
//     that retry loop lives in server/router.ts's /api/design-card handler,
//     which calls this function once per attempt.
//   - implementCards(): Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
//     query() with cwd: the lution/ project root, allowedTools: ["Read",
//     "Write","Edit","Bash","Glob"], permissionMode: "acceptEdits",
//     maxTurns cap, JSON-schema output. Writes src/effects/<id>.ts +
//     tests/cards/<id>.test.ts, runs `npm run test:cards`, and reports
//     success/failure/needs-clarification back to the caller (server/
//     jobs.ts flips the registry's `implemented` flag on success).
//
// Requires ANTHROPIC_PERSONAL_API_KEY (or ANTHROPIC_API_KEY) in the
// dev-server env; both entry points fail
// fast with a clear error/failed status when it's missing rather than
// throwing an opaque fetch/SDK error.

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CardDef, CardId, JobRecord, MatchState, PlayerId } from '../shared/types';
import {
  checkEnglishRule,
  checkNameLength,
  checkNumeralRule,
  NAME_LENGTH_LIMIT,
  normalizeText,
} from '../shared/validation';

export const DESIGN_MODEL = 'claude-sonnet-5';
export const IMPLEMENT_MODEL = 'claude-sonnet-5';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// ============================================================================
// Atom-catalog primer -- shared by designCard's prompt (a brand-new design
// can include a composition straight away) and compileCard's prompt (an
// already-minted card gets one shot at being expressed atomically after the
// fact). Deliberately compact: a full per-field spec lives in shared/
// atoms.ts's own doc comments; this is just enough for the model to know
// what's available and decide expressible-or-not. NEITHER caller trusts this
// primer alone to guarantee a valid composition -- server/router.ts always
// re-validates whatever composition comes back with
// validateCompositionShape/validateCompositionSemantics before minting
// anything with implemented: true.
// ============================================================================

const ATOM_CATALOG_PRIMER = `ATOM COMPOSITION -- try this FIRST. If a card's FULL effect can be expressed with the small declarative language below, it implements INSTANTLY (seconds); anything else falls back to a several-minute code-generation pipeline. Never guess or approximate a partial effect this way -- a card that's only half-composed is worse than one honestly left for the fallback pipeline.

A composition is: {"cardType": "keeper"|"action", "baseValue": <number>, "effects": [{"trigger": <Trigger>, "side"?: "owner"|"opponent"|"any", "body": <Step>}], "scoreDelta"?: <ValueExpr>, "strategy"?: {"playValue"?: number, "stealTargetValue"?: number}} ("scoreDelta" is keeper-only, for a dynamically-recomputed score bonus; "strategy" is an OPTIONAL explicit override for the built-in AI's valuation of this card -- the engine derives a sensible playValue/stealTargetValue from the atoms used automatically, so only set this when the derived value would clearly be wrong, e.g. a card that wins the game outright should set playValue to a huge number like 1000000 so the AI always plays it immediately).
Triggers: onDraw, onPlay, onEnterPlay, onLeavePlay, onDiscard, onBeforeDestroy, onTurnStart, onTurnEnd, interruptOpponentTurn, onInnerGameStart, onInnerGameEnd.
A Step is one atom call, or {"type":"seq","steps":[<Step>...]} to do several in order, or {"type":"if","condition":<Condition>,"then":<Step>,"else"?:<Step>}.
Atoms: draw(target,count?) | discard(selector) | destroy(selector) | bounceToHand(selector?) | changeController(selector,to) | freezeInPlay(selector,to,duration?:"permanent") | freezeInHand(selector,bindAs?) | grantImmunity(kind:"freeze",target) [onEnterPlay only] | setCounter(name,value) | incrementCounter(name,by?) | setBaseValueOverride(selector,value) | cancelDestroy() [onBeforeDestroy only] | forceWin(winner) | grantExtraTurn(target) | skipNextDraw(target) | tutorAndPlay(selector) | log(message) (flavor-only, never mutates state -- "message" is plain text that may include {owner}/{card}/{target} placeholders, e.g. "{owner}'s {card} seizes {target}!"; {target} means whichever card the most recent selector-based atom in this same effect body targeted). "target"/"to"/"winner" are "self"|"opponent".
A Selector targets cards: {"zone":"hand"|"inPlay"|"discard"|"drawPile","owner":"self"|"opponent"|"any","filter"?:<Filter>,"pick":"all"|"chooser"|"random"|"maxValue"|"minValue"|"self","chooser"?:"self"|"opponent" (required iff pick is chooser/maxValue/minValue -- who breaks ties or makes the choice),"count"?:<ValueExpr>}.
Filters: {"type":"byType","cardType":"keeper"|"action"} | {"type":"byName","cardId":"<exact registry id>"} | {"type":"frozen"} | {"type":"valueCompare","op":">"|">="|"<"|"<="|"==","value":<ValueExpr>} | {"type":"excludeSelf"} | {"type":"not","filter":<Filter>} | {"type":"and","filters":[<Filter>...]}.
ValueExpr (dynamic numbers): {"type":"literal","value":n} | {"type":"count","selector":<Selector, must be pick:"all">} | {"type":"cardValue"} (this card's own current worth) | {"type":"counter","name":"...","default"?:n} | {"type":"boundCardValue","bindAs":"..."} (only after a freezeInHand with the same bindAs) | {"type":"add"|"max"|"min","values":[<ValueExpr>...]}.
Condition: {"type":"compare","left":<ValueExpr>,"op":">"|">="|"<"|"<="|"=="|"!=","right":<ValueExpr>} | {"type":"selectorNonEmpty","selector":<Selector, must be pick:"all">} | {"type":"not","condition":<Condition>} | {"type":"and"|"or","conditions":[<Condition>...]}.`;

// ============================================================================
// designCard -- Anthropic Messages API
// ============================================================================

export interface DesignCardParams {
  round: number;
  creatorId: PlayerId;
  registry: readonly CardDef[];
  // Deck/score/history context the design prompt draws on. A subset of
  // MatchState rather than the whole thing so callers don't need to thread
  // fields (currentInnerGame, phase, ...) this prompt has no use for.
  match: Pick<MatchState, 'decks' | 'innerWins' | 'roundHistory'>;
  // Set only when Claude is redesigning blind after rule 3's
  // identical-simultaneous-designs voidance; otherwise omitted (blind design
  // per rule 4 -- Claude never sees the human's design before revealing its
  // own).
  opponentDesign?: { name: string; effectText: string } | null;
  // Prior rejected attempts THIS call sequence has made, most recent last --
  // fed back into the prompt so Claude doesn't repeat a violation. Populated
  // by the router's internal retry loop (<=3 attempts total).
  priorAttempts?: Array<{ name: string; effectText: string; violations: string[] }>;
  // Full text of lution/STRATEGY.md, read once per /api/design-card request by
  // the router (cheap local disk read, done outside this module so claude.ts
  // doesn't own filesystem paths). Omitted gracefully — no section rendered —
  // when the router couldn't read the file (it logs its own console.warn in
  // that case; this module does not warn again).
  strategyGuide?: string;
  // Which seat (loser/winner) `creatorId` holds this round, computed by the
  // router from persisted MatchState (see router.ts's seat-computation
  // helper). 'loser' = holds the keep/steal decision and picks first under
  // steal; 'winner' = designs knowing the card may be adopted as a bribe or
  // spurn-destroyed, and counter-raids second.
  seat?: { role: 'loser' | 'winner'; reason: string };
  // MATCH_WINS (src/engine/match.ts), threaded in by the router so this
  // module stays decoupled from the engine. Used only for the match-urgency
  // prompt line; the urgency line is omitted if this is absent.
  matchWins?: number;
}

export interface DesignCardResult {
  name: string;
  effectText: string;
  // Present iff the model chose to include one -- UNVALIDATED at this layer
  // (deliberately typed `unknown`, not `CardComposition`: this module is the
  // stable seam to live Claude, not the place mechanical/semantic validation
  // lives). server/router.ts's mintClaudeDesignForRound is the one place
  // that calls validateCompositionShape/validateCompositionSemantics before
  // ever trusting this as a real CardComposition.
  composition?: unknown;
}

// ANTHROPIC_PERSONAL_API_KEY is the canonical key for this project (set in
// ~/.zshrc); plain ANTHROPIC_API_KEY works as a fallback. The Agent SDK only
// reads ANTHROPIC_API_KEY from the environment, so resolution also mirrors
// the personal key into that name for the SDK's subprocess to inherit.
export function resolveApiKey(): string | undefined {
  const apiKey = process.env.ANTHROPIC_PERSONAL_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (apiKey && process.env.ANTHROPIC_API_KEY !== apiKey) {
    process.env.ANTHROPIC_API_KEY = apiKey;
  }
  return apiKey;
}

function requireApiKey(): string {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      'Neither ANTHROPIC_PERSONAL_API_KEY nor ANTHROPIC_API_KEY is set in the dev-server environment; cannot call live Claude.'
    );
  }
  return apiKey;
}

function deckSection(player: PlayerId, params: DesignCardParams): string {
  const ids = params.match.decks[player] ?? [];
  if (ids.length === 0) return '(empty)';
  return ids
    .map((id) => params.registry.find((c) => c.id === id))
    .filter((c): c is CardDef => Boolean(c))
    .map((c) => `- ${c.name} (${c.id}): ${c.effectText}`)
    .join('\n');
}

function strategyGuideSection(strategyGuide?: string): string {
  if (!strategyGuide) return '';
  return `STRATEGY GUIDE (written by an analyst who knows Lution's rules cold -- read this before you design, and use it to calibrate this card's power level and shape for the seat you hold this round):
${strategyGuide}

`;
}

function seatSection(
  seat: DesignCardParams['seat'],
  matchWins: number | undefined,
  creatorId: PlayerId,
  match: DesignCardParams['match']
): string {
  if (!seat) return '';
  const roleLabel = seat.role === 'loser' ? 'LOSER' : 'WINNER';
  let urgencyLine = '';
  if (typeof matchWins === 'number') {
    const opponent: PlayerId = creatorId === 'human' ? 'claude' : 'human';
    const you = match.innerWins[creatorId] ?? 0;
    const them = match.innerWins[opponent] ?? 0;
    urgencyLine = `\nInner-game wins: you ${you}, opponent ${them}; first to ${matchWins} takes the match.`;
  }
  return `\nYOUR SEAT THIS ROUND: You are the round's ${roleLabel}. (${seat.reason}.)
As the guide explains: the loser holds the keep/steal decision and picks first under steal; the winner designs knowing their card is a bribe the loser may adopt or spurn-destroy, and counter-raids second. Design accordingly.${urgencyLine}
`;
}

export function buildDesignPrompt(params: DesignCardParams): string {
  const { round, registry, match, opponentDesign, priorAttempts } = params;

  const registrySection = registry.length
    ? registry
        .map(
          (c) =>
            `- [${c.destroyed ? 'DESTROYED, never reuse' : 'active'}] ${c.name} (${c.id}, designed by ${c.creatorId}): ${c.effectText}`
        )
        .join('\n')
    : '(empty -- this is the very first design round)';

  const historySection = match.roundHistory.length
    ? match.roundHistory
        .map((r) => {
          if (r.decision !== 'steal') {
            return `Round ${r.round}: winner=${r.winner}, decision=keep (each player kept their own design)`;
          }
          const loserPick = r.loserPick
            ? `${r.loserPick.source}:${r.loserPick.cardId} (${r.loserPick.outcome})`
            : 'none';
          const winnerPick = r.winnerPick
            ? `${r.winnerPick.source}:${r.winnerPick.cardId} (${r.winnerPick.outcome})`
            : 'none';
          return `Round ${r.round}: winner=${r.winner}, decision=steal, loserPick=${loserPick}, winnerPick=${winnerPick}, destroyed=[${(r.destroyed ?? []).join(', ')}]`;
        })
        .join('\n')
    : '(no rounds resolved yet)';

  const opponentSection = opponentDesign
    ? `\nA REDESIGN IS IN PROGRESS: your previous design for this round was voided because it matched the human's design exactly (the identical-simultaneous-designs rule). Their voided design was "${opponentDesign.name}" -- ${opponentDesign.effectText}. Design something meaningfully DIFFERENT this time.\n`
    : '';

  const retrySection =
    priorAttempts && priorAttempts.length > 0
      ? `\nYour previous attempt(s) this round were REJECTED by mechanical validation. Do not repeat these mistakes:\n${priorAttempts
          .map(
            (a, i) =>
              `Attempt ${i + 1}: name="${a.name}" effectText="${a.effectText}"\n  Violations: ${a.violations.join('; ')}`
          )
          .join('\n')}\n`
      : '';

  return `You are "claude," the live AI opponent in "Lution," a self-expanding Fluxx-style card game against a human. After every inner game, both players design one brand-new card; yours gets implemented into the running codebase and can be played from the very next inner game.
${strategyGuideSection(params.strategyGuide)}
MATCH STATE (round ${round}):
Inner-game wins so far -- human: ${match.innerWins.human}, claude: ${match.innerWins.claude}

Your current deck (claude):
${deckSection('claude', params)}

Human's current deck:
${deckSection('human', params)}
${seatSection(params.seat, params.matchWins, params.creatorId, match)}
FULL CARD REGISTRY, including destroyed types (a destroyed type can never be designed again, even though this doesn't mean every copy of it is gone from every deck):
${registrySection}

ROUND HISTORY:
${historySection}
${opponentSection}${retrySection}
RULES YOUR DESIGN MUST FOLLOW:
1. No duplicate copies of a card within a deck, ever -- and your design must be genuinely new: not a re-skin (by name OR by effect) of anything in the registry above, including destroyed entries.
2. If a keeper of your design is ever destroyed, that destroys one token, never the card type itself.
3. This design is BLIND -- you're revealing it without having seen the human's, unless a redesign is noted above. If your design and the human's turn out to express the identical effect, both are voided and redesigned.
4. STRICT NUMERAL RULE: your name and effect text may contain the digit "1" but no other digit (no "2", "10", "3.5", etc.), and may not contain spelled-out number words for two-or-more (no "two", "twice", "double", "both", "dozen", "pair", "couple", "half", etc.). "one", "1", "once", and "a"/"an" are all fine.
5. Your card must be implementable as a CardEffect module (a keeper that scores while in play, or a one-shot action) against an engine with hooks like onDraw, onPlay, onEnterPlay, onLeavePlay, onDiscard, onTurnStart/End, modifyScore, interruptOpponentTurn, and the ability to emit/react to custom-named events -- so feel free to invent a new interaction, not just another flat point value.
6. Be CREATIVE and FUN. The existing registry's flavor is sci-fi / fantasy / economic / mathematical-object (e.g. "The Bureau of Weights," "Perfectly Normal Subgroup," "Quantum Duckling"). Match that spirit; avoid another generic "worth 1 point" reskin unless the twist is genuinely interesting.
7. All card text must be written in English (loanwords and proper nouns in Latin script are fine -- e.g. names like "Piñata" are acceptable).
8. Your card may not repeat the same subeffect within itself, even if reworded (e.g. "draw 1 card, then draw 1 more card" is still a repeat).
9. Effect text must be 280 characters or fewer.
10. Card name must be 32 characters or fewer.
11. NO DEIXIS OUTSIDE THE INNER GAME: the inner game is a closed world. Your card's effect can't refer to anything outside it that would distinguish between players, rounds, or matches -- no deictic pointing at the outer game. You may reference in-game roles and state ONLY: "you", "your opponent", zones (hand/deck/discard/in play), points, turns, card names/types. BANNED, with no exceptions: creator/designer identity (no "cards you created," no "the player who designed this," no "cards your opponent designed"), design-round or match references ("this round," "the match score," "if you won the last game," "next round"), the terms "inner game" / "outer game" themselves, and real-world references (dates, weekdays, months, times, "the human player," or "Claude" as a proper name in effect text). Banned example: "Worth 1 point per card you created." Fine example: "Worth 1 point per other keeper you control." A mechanical checker enforces the literal wordings above as a FLOOR, not the whole rule -- semantic paraphrases that dodge the exact words but still point outside the inner game (e.g. "the player who first wrote this card's text," "score double on the anniversary of this card's design") are just as illegal. If you can't express the idea without referencing something outside the current inner game, don't design that card.

Weigh boldness against safety by seat and score: trailing on inner-game wins favors variance (bombs, swingy effects), leading favors deck-specific safety (protection, synergy) -- but stay in character regardless: silly Fluxx-style flavor is mandatory even when the mechanics are sharp.

${ATOM_CATALOG_PRIMER}

Respond with ONLY a single JSON object and nothing else -- no markdown code fences, no commentary before or after it:
{"name": "<card name>", "effectText": "<one or two sentences describing exactly what it does>", "composition": "<a CardComposition object, JSON-ENCODED AS A STRING (stringify the object), ONLY if the full effect is atoms-expressible -- omit this key entirely otherwise>"}`;
}

function parseDesignResponse(text: string): DesignCardResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `designCard: could not parse JSON from the model's response (${err instanceof Error ? err.message : String(err)}).\nRaw response: ${text}`
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).name !== 'string' ||
    typeof (parsed as Record<string, unknown>).effectText !== 'string'
  ) {
    throw new Error(
      `designCard: model response is missing required "name"/"effectText" string fields.\nRaw response: ${text}`
    );
  }

  const { name, effectText, composition } = parsed as {
    name: string;
    effectText: string;
    composition?: unknown;
  };
  return {
    name: name.trim(),
    effectText: effectText.trim(),
    // The wire carries composition as a JSON string (structured outputs
    // reject both recursive $defs and open objects); decode it here so every
    // downstream consumer keeps seeing a plain object.
    composition: parseCompositionString(composition),
  };
}

interface AnthropicMessagesResponse {
  content?: Array<{ type: string; text?: string }>;
}

// The design-call output schema, PLUS an optional `composition` property.
// IMPORTANT (found via live smoke test 2026-07-03): the Anthropic structured-
// outputs API REJECTS recursive schema definitions ("Circular reference
// detected: ValueExpr -> ValueExpr") -- the atom AST is inherently recursive
// (Step/Filter/ValueExpr/Condition all self-nest), so ATOM_JSON_SCHEMA's
// $defs CANNOT be sent over the wire. The composition property is therefore
// an opaque object at the wire level: the model learns the grammar from the
// prompt's ATOM_CATALOG_PRIMER prose, and the REAL gates are the server-side
// validateCompositionShape/Semantics validators plus the retry-with-
// violations loop. ATOM_JSON_SCHEMA remains the documented/tested reference
// schema for everything except the wire format.
const DESIGN_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    effectText: { type: 'string' },
    // Structured outputs also reject additionalProperties: true, so the
    // recursive composition travels as a JSON-ENCODED STRING and is parsed
    // server-side before validation (parseCompositionString below).
    composition: {
      type: 'string',
      description:
        'JSON-encoded CardComposition per the ATOM COMPOSITION grammar in the prompt (a single JSON object, stringified). Include only if the FULL effect is expressible with the documented atoms; omit otherwise.',
    },
  },
  required: ['name', 'effectText'],
  additionalProperties: false,
} as const;

// Tolerant parse for the JSON-string composition channel: returns the parsed
// object, or undefined for absent/blank/unparseable input (an unparseable
// composition is treated exactly like no composition -- the card falls back
// to the implement-job path; the mechanical validators downstream are the
// real gate either way).
function parseCompositionString(raw: unknown): unknown | undefined {
  // Already an object (e.g. a model ignoring the stringify instruction, or a
  // test stub): pass it through — the downstream validators are the gate.
  if (typeof raw === 'object' && raw !== null) return raw;
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    console.warn('[lution] composition string failed to parse as JSON; treating as absent.');
    return undefined;
  }
}

export async function designCard(params: DesignCardParams): Promise<DesignCardResult> {
  const apiKey = requireApiKey();
  const prompt = buildDesignPrompt(params);

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: DESIGN_MODEL,
      // claude-sonnet-5 runs adaptive thinking by default when `thinking` is
      // omitted; the budget must cover thinking + the JSON answer, or the
      // response arrives with no text block at all. Raised from 4000: a
      // populated `composition` can itself run to a few hundred tokens.
      max_tokens: 16000,
      output_config: {
        format: {
          type: 'json_schema',
          schema: DESIGN_OUTPUT_SCHEMA,
        },
      },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Anthropic Messages API request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
  return parseDesignResponse(text);
}

// ============================================================================
// compileCard -- Anthropic Messages API. Plan §4b: gives an ALREADY-MINTED
// card (today, only ever the human's -- designCard above gets its own shot
// at including a composition up front) one more chance at atoms-expressible
// instant implementation, called by server/router.ts's POST
// /api/compile-card right after the human's design mints, before the
// round's implement job is kicked off. Same model, same atom-catalog primer;
// this function NEVER throws (mirrors generateStarterNames' convention) --
// any failure (no API key, network error, unparsable response, or Claude
// itself judging the card inexpressible) just resolves to the `ok: false`
// branch, and the caller leaves the card as an ordinary implemented: false
// row for the ordinary fallback job to pick up.
// ============================================================================

export interface CompileCardParams {
  card: { id: CardId; name: string; effectText: string };
  // Compact id/name listing so a byName filter (e.g. "destroy Perfectly
  // Normal Subgroup") can reference the correct registry id -- full
  // effectText isn't needed here the way designCard's prompt needs it.
  registry: readonly CardDef[];
}

// `ok: true` carries an UNVALIDATED `composition` (see DesignCardResult's own
// doc comment on the same discipline) -- server/router.ts's handleCompileCard
// is the one place that validates it before ever patching the registry.
export type CompileCardResult =
  | { ok: true; composition: unknown }
  | { ok: false; reason: string };

function buildCompileCardPrompt(params: CompileCardParams): string {
  const registryListing = params.registry.length
    ? params.registry.map((c) => `- ${c.name} (id: "${c.id}")`).join('\n')
    : '(empty registry)';

  return `You are compiling an ALREADY-DESIGNED "Lution" card into a declarative composition, if and only if its complete effect can be expressed atomically.

CARD TO COMPILE:
"${params.card.name}" -- ${params.card.effectText}

FULL CARD REGISTRY (for byName filter references, by id):
${registryListing}

${ATOM_CATALOG_PRIMER}

If this card's COMPLETE effect (not just part of it) is expressible with the atom catalog above, respond with {"expressible": true, "composition": "<the CardComposition object JSON-ENCODED AS A STRING (stringify it)>"}. If any part of it can't be expressed atomically, respond with {"expressible": false, "reason": "<one short sentence>"} -- do not guess or approximate with a partial composition.

Respond with ONLY a single JSON object and nothing else -- no markdown code fences, no commentary before or after it.`;
}

// Same wire-level constraint as DESIGN_OUTPUT_SCHEMA above: the recursive
// atom AST cannot be expressed in the structured-outputs schema (the API
// rejects circular $defs), so composition is opaque here and the server-side
// validators are the real gate.
const COMPILE_CARD_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    expressible: { type: 'boolean' },
    composition: {
      type: 'string',
      description:
        'JSON-encoded CardComposition per the ATOM COMPOSITION grammar in the prompt (a single JSON object, stringified).',
    },
    reason: { type: 'string' },
  },
  required: ['expressible'],
  additionalProperties: false,
} as const;

export async function compileCard(params: CompileCardParams): Promise<CompileCardResult> {
  let apiKey: string;
  try {
    apiKey = requireApiKey();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  const prompt = buildCompileCardPrompt(params);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DESIGN_MODEL,
        // See designCard: adaptive thinking shares the max_tokens budget
        // with the JSON answer, and a populated composition needs headroom.
        max_tokens: 12000,
        output_config: {
          format: { type: 'json_schema', schema: COMPILE_CARD_OUTPUT_SCHEMA },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: `compileCard: request failed (${err instanceof Error ? err.message : String(err)})`,
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, reason: `compileCard: Anthropic Messages API request failed (${response.status}): ${body}` };
  }

  let parsed: unknown;
  try {
    const data = (await response.json()) as AnthropicMessagesResponse;
    const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (err) {
    return {
      ok: false,
      reason: `compileCard: could not parse JSON from the model's response (${err instanceof Error ? err.message : String(err)})`,
    };
  }

  const obj = parsed as Record<string, unknown> | null;
  if (!obj || typeof obj.expressible !== 'boolean') {
    return { ok: false, reason: 'compileCard: model response is missing the required "expressible" boolean field.' };
  }
  const decodedComposition = parseCompositionString(obj.composition);
  if (!obj.expressible || decodedComposition === undefined) {
    const reason =
      typeof obj.reason === 'string' && obj.reason.trim()
        ? obj.reason.trim()
        : 'Claude judged this card inexpressible via the atom catalog.';
    return { ok: false, reason };
  }
  return { ok: true, composition: decodedComposition };
}

// ============================================================================
// judgeSemanticDuplicate -- Anthropic Messages API, cheap single-call
// judgment used for two distinct rule-driven checks:
//   - Rule 3 (identical-simultaneous-designs): after the mechanical
//     normalizeText() check fails to catch a literal match, server/router.ts
//     is NOT the caller here -- src/ui/app.ts calls this (via a small
//     /api/judge-duplicate endpoint) at reveal time, comparing the human's
//     revealed design against Claude's revealed design.
//   - Rule 5 (human card validation): "Claude judges semantic duplicates/
//     implementability" of the human's submitted card against the full
//     registry -- server/router.ts's handleCreateRegistryCard calls this for
//     creatorId: 'human' submissions, after the mechanical
//     validateNewCard() check already passed.
// Both are "a cheap validate call," per the plan -- small max_tokens, a
// single card (or pair) at a time, not the full design prompt.
// ============================================================================

export interface SemanticDuplicateCandidate {
  name: string;
  effectText: string;
}

export interface SemanticDuplicateTarget extends SemanticDuplicateCandidate {
  id?: string;
}

export interface JudgeSemanticDuplicateParams {
  candidate: SemanticDuplicateCandidate;
  // One or more existing/opponent designs to compare the candidate against.
  compareAgainst: SemanticDuplicateTarget[];
  // Short context string folded into the prompt so Claude knows which rule
  // it's judging under (e.g. "identical-simultaneous-designs" vs
  // "human-submission-vs-registry").
  context: string;
}

export interface JudgeSemanticDuplicateResult {
  isDuplicate: boolean;
  // id (if the target had one) or name of whichever compareAgainst entry
  // matched, when isDuplicate is true.
  matchedTarget?: string;
  explanation: string;
}

function buildJudgeDuplicatePrompt(params: JudgeSemanticDuplicateParams): string {
  const { candidate, compareAgainst, context } = params;
  const targetsSection = compareAgainst
    .map((t, i) => `${i + 1}. ${t.id ? `[${t.id}] ` : ''}"${t.name}" -- ${t.effectText}`)
    .join('\n');

  return `You are judging card designs for "Lution," a self-expanding Fluxx-style card game. Context: ${context}.

CANDIDATE CARD:
"${candidate.name}" -- ${candidate.effectText}

COMPARE AGAINST:
${targetsSection}

A duplicate means the candidate expresses the SAME mechanical effect as one of the compare-against cards, just worded differently (e.g. "draw one extra card" vs "take an additional card into your hand" -- same effect, different prose). It is NOT a duplicate merely for sharing a theme, flavor, or base point value with an existing keeper -- plenty of legitimate cards are simple flat-value keepers. Judge the MECHANICS, not the flavor text.

Respond with ONLY a single JSON object and nothing else -- no markdown code fences, no commentary before or after it:
{"isDuplicate": <true|false>, "matchedTarget": "<id or name of the matching compare-against card, or empty string if none>", "explanation": "<one short sentence>"}`;
}

function parseJudgeDuplicateResponse(text: string): JudgeSemanticDuplicateResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `judgeSemanticDuplicate: could not parse JSON from the model's response (${err instanceof Error ? err.message : String(err)}).\nRaw response: ${text}`
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).isDuplicate !== 'boolean'
  ) {
    throw new Error(
      `judgeSemanticDuplicate: model response is missing the required "isDuplicate" boolean field.\nRaw response: ${text}`
    );
  }

  const p = parsed as { isDuplicate: boolean; matchedTarget?: unknown; explanation?: unknown };
  return {
    isDuplicate: p.isDuplicate,
    matchedTarget:
      typeof p.matchedTarget === 'string' && p.matchedTarget.trim() ? p.matchedTarget.trim() : undefined,
    explanation: typeof p.explanation === 'string' ? p.explanation : '',
  };
}

export async function judgeSemanticDuplicate(
  params: JudgeSemanticDuplicateParams
): Promise<JudgeSemanticDuplicateResult> {
  // No opponent/registry to compare against -- trivially not a duplicate,
  // no need to spend a network call.
  if (params.compareAgainst.length === 0) {
    return { isDuplicate: false, explanation: 'Nothing to compare against.' };
  }

  const apiKey = requireApiKey();
  const prompt = buildJudgeDuplicatePrompt(params);

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: DESIGN_MODEL,
      // See designCard: adaptive thinking is on by default and shares the
      // max_tokens budget with the JSON answer.
      max_tokens: 2500,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              isDuplicate: { type: 'boolean' },
              matchedTarget: { type: 'string' },
              explanation: { type: 'string' },
            },
            required: ['isDuplicate', 'explanation'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Anthropic Messages API request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
  return parseJudgeDuplicateResponse(text);
}

// ============================================================================
// generateStarterNames -- Anthropic Messages API, used by POST /api/new-match
// (server/router.ts) to rename the 20 starter cards on every new match. Card
// IDS never change (they're wired to src/effects/<id>.ts filenames), only the
// `name` field. Best-effort: the whole call+validate+retry sequence lives
// here so a failure of any kind (no API key, network error, model keeps
// producing invalid names) simply resolves to `null` -- the caller leaves
// the current starter names unchanged and match creation proceeds either
// way. This function NEVER throws.
// ============================================================================

const STARTER_NAME_COUNT = 20;

interface GenerateStarterNamesResponse {
  names?: unknown;
}

function buildStarterNamesPrompt(currentNames: string[], violations?: string[]): string {
  const currentSection = currentNames.length
    ? currentNames.map((n) => `- ${n}`).join('\n')
    : '(none yet)';

  const retrySection =
    violations && violations.length > 0
      ? `\nYour previous attempt was REJECTED by mechanical validation. Do not repeat these mistakes:\n${violations
          .map((v) => `- ${v}`)
          .join('\n')}\n`
      : '';

  return `You are naming the 20 starter cards for "Lution," a self-expanding Fluxx-style card game against a live AI opponent. The starter deck is being refreshed for a brand-new match -- only the NAMES change; the cards' effects and ids stay the same.

CARD NAMES CURRENTLY IN USE (yours must avoid all of these, case-insensitively):
${currentSection}
${retrySection}
Generate exactly ${STARTER_NAME_COUNT} brand-new card names in the sci-fi / fantasy / economic / mathematical-object spirit (e.g. "The Bureau of Weights," "Perfectly Normal Subgroup," "Quantum Duckling," "Compound Interest Golem"). Be silly and creative.

CONSTRAINTS on every name:
1. All ${STARTER_NAME_COUNT} names must be mutually DISTINCT from each other.
2. Each name must be ${NAME_LENGTH_LIMIT} characters or fewer.
3. English/Latin script only (accented Latin letters like "Piñata" are fine).
4. STRICT NUMERAL RULE: a name may contain the digit "1" but no other digit, and may not contain spelled-out number words for two-or-more (no "two", "twice", "double", "both", "dozen", "pair", "couple", "half", etc.). "one", "1", "once", and "a"/"an" are fine.
5. None of the ${STARTER_NAME_COUNT} names may match (case-insensitively) any name in the "currently in use" list above.

Respond with ONLY a single JSON object and nothing else -- no markdown code fences, no commentary before or after it:
{"names": ["<name 1>", "<name 2>", ..., "<name ${STARTER_NAME_COUNT}>"]}`;
}

function parseStarterNamesResponse(text: string): string[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `generateStarterNames: could not parse JSON from the model's response (${err instanceof Error ? err.message : String(err)}).\nRaw response: ${text}`
    );
  }

  const names = (parsed as GenerateStarterNamesResponse | null)?.names;
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) {
    throw new Error(
      `generateStarterNames: model response is missing a "names" array of strings.\nRaw response: ${text}`
    );
  }
  return (names as string[]).map((n) => n.trim());
}

async function callGenerateStarterNames(
  apiKey: string,
  currentNames: string[],
  violations?: string[]
): Promise<string[]> {
  const prompt = buildStarterNamesPrompt(currentNames, violations);

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: DESIGN_MODEL,
      // See designCard: adaptive thinking is on by default and shares the
      // max_tokens budget with the JSON answer; 20 short names need a
      // generous budget for the same reason a single card design does.
      max_tokens: 4000,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              names: { type: 'array', items: { type: 'string' } },
            },
            required: ['names'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Anthropic Messages API request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
  return parseStarterNamesResponse(text);
}

// Mechanical-only validation (reuses shared/validation.ts's rule checks --
// no hand-rolled regex here): exactly ${STARTER_NAME_COUNT} names, every
// name passes the numeral/English/length rules, all ${STARTER_NAME_COUNT}
// are mutually distinct (case-insensitive), and none collides
// (case-insensitive) with a name already in use.
export function validateStarterNames(names: string[], currentNames: readonly string[]): string[] {
  const violations: string[] = [];
  if (names.length !== STARTER_NAME_COUNT) {
    violations.push(`Expected exactly ${STARTER_NAME_COUNT} names, got ${names.length}.`);
  }

  const inUse = new Set(currentNames.map((n) => normalizeText(n)));
  const seenThisBatch = new Map<string, string>();

  for (const name of names) {
    violations.push(...checkNumeralRule(name));
    violations.push(...checkEnglishRule(name));
    violations.push(...checkNameLength(name));

    const norm = normalizeText(name);
    if (seenThisBatch.has(norm)) {
      violations.push(`Name "${name}" duplicates another generated name in the same batch.`);
    } else {
      seenThisBatch.set(norm, name);
    }
    if (inUse.has(norm)) {
      violations.push(`Name "${name}" duplicates a name already in use.`);
    }
  }

  return violations;
}

// Full call+validate+one-retry+fallback flow. Returns exactly
// ${STARTER_NAME_COUNT} valid, distinct, non-colliding names on success, or
// null if the model's response failed validation twice (or the call itself
// failed for any reason, e.g. no API key) -- callers should leave the
// current starter names unchanged in that case, never throw or block match
// creation on it.
export async function generateStarterNames(currentNames: string[]): Promise<string[] | null> {
  let apiKey: string;
  try {
    apiKey = requireApiKey();
  } catch (err) {
    console.warn(
      `[lution] generateStarterNames skipped (${err instanceof Error ? err.message : String(err)}); starter names left unchanged.`
    );
    return null;
  }

  const maxAttempts = 2;
  let violations: string[] | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const names = await callGenerateStarterNames(apiKey, currentNames, violations);
      const attemptViolations = validateStarterNames(names, currentNames);
      if (attemptViolations.length === 0) {
        return names;
      }
      violations = attemptViolations;
    } catch (err) {
      violations = [err instanceof Error ? err.message : String(err)];
    }
  }

  console.warn(
    `[lution] generateStarterNames: falling back to unchanged starter names after ${maxAttempts} attempts. Last violations: ${(violations ?? []).join('; ')}`
  );
  return null;
}

// ============================================================================
// implementCards -- Claude Agent SDK
// ============================================================================

export interface ImplementCardsParams {
  round: number;
  cardIds: CardId[];
  // Full registry entries for cardIds, so the prompt can quote each card's
  // name/effectText/creator without a second lookup.
  cards: CardDef[];
  job: JobRecord;
  // Absolute path to the lution/ project root (query()'s cwd).
  projectRoot: string;
  // Streams a human-readable line into the job's log as the agent session
  // progresses (assistant text, tool calls, and the final result summary).
  onLog?: (line: string) => void;
  // Seed for the first attempt's "prior failure" context -- e.g. a job's
  // stored `error` from a previous manual /retry.
  priorFailureOutput?: string;
}

export interface ImplementCardsResult {
  status: 'done' | 'failed' | 'needs-clarification';
  clarificationQuestion?: string;
  error?: string;
}

const IMPLEMENT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    cardIds: { type: 'array', items: { type: 'string' } },
    errors: { type: 'array', items: { type: 'string' } },
    question: { type: 'string' },
  },
  required: ['success', 'cardIds', 'errors'],
} as const;

interface ImplementStructuredOutput {
  success: boolean;
  cardIds: string[];
  errors: string[];
  question?: string;
}

function buildImplementPrompt(params: ImplementCardsParams, priorFailure?: string): string {
  const cardsSection = params.cards
    .map(
      (c) =>
        `- id: ${c.id}\n  name: ${c.name}\n  effectText: ${c.effectText}\n  designed by: ${c.creatorId}`
    )
    .join('\n');

  const retrySection = priorFailure
    ? `\nA PREVIOUS ATTEMPT AT THIS JOB FAILED. Diagnose and fix the underlying problem -- don't just repeat the same change. Prior failure output:\n${priorFailure}\n`
    : '';

  return `You are implementing new cards for "Lution" (round ${params.round}) in the project at ${params.projectRoot}.

For EACH card listed below, try these THREE approaches in order and use the FIRST one that actually works -- don't jump straight to a bespoke module if a cheaper option applies:

  1. COMPOSE FROM EXISTING ATOMS (fastest -- do this whenever the card's FULL effect is expressible with the atom catalog already in shared/atoms.ts, read it before starting: CardComposition/EffectDef/Step/AtomCall/Selector/Filter/ValueExpr, plus ATOM_JSON_SCHEMA). If it's expressible, add a \`composition\` field (matching that AST) to the card's own row in data/cards.json -- do NOT write a src/effects/<id>.ts module at all; src/engine/effectsLoader.ts's loadEffects() compiles a registry row's \`composition\` automatically the moment it's present. Write ONLY tests/cards/<id>.test.ts (using tests/helpers.ts's createTestGame the normal way -- a composed card plays identically to a bespoke one from a test's point of view; see tests/engine/compileComposition.test.ts for composition-authoring examples).
  2. PROPOSE ONE NEW ATOM (when everything about the card composes cleanly EXCEPT for one small missing primitive). Make a MINIMAL, PURELY ADDITIVE extension: one new AtomName + its AtomCall variant + matching shape/semantic-validator branches + ATOM_JSON_SCHEMA entry in shared/atoms.ts, and one new interpreter case in src/engine/compileComposition.ts, following the existing atoms' exact conventions. NEVER change the meaning, shape, or validation of an EXISTING atom, selector, filter, trigger, or ValueExpr -- this must be a strictly additive union extension and nothing else. Add a focused test for the new atom to tests/engine/compileComposition.test.ts, then compose the actual card using it exactly as in approach 1 (data/cards.json's \`composition\` field + tests/cards/<id>.test.ts only -- still no bespoke module). Because this touches the shared interpreter that every composed card (and this whole atoms pipeline) depends on, you MUST run the FULL \`npm test\` (not just \`npm run test:cards\`) before finishing and confirm it is 100% green -- if the full suite doesn't stay green, REVERT the atom/interpreter change and fall through to approach 3 instead of shipping something that breaks other cards.
  3. BESPOKE MODULE (fallback -- exactly today's approach, use it when the effect genuinely resists both of the above): write src/effects/<id>.ts -- a default-exported CardEffect module implementing the effect described, following the structure and conventions in src/effects/_template.ts exactly (cardId must equal the filename and the registry id; set cardType, baseValue, relevant hooks, and strategy hints) -- plus tests/cards/<id>.test.ts.

Cards to implement this job:
${cardsSection}
${retrySection}
Requirements:
- Implement each card's effectText as faithfully as you can. Keep the numeral rule intact in any flavor text you write: only the digit "1" and the words "one"/"once"/"a"/"an" may appear; no other digits and no other spelled-out number words.
- Include useful strategy hints (playValue, stealTargetValue, and a choose function if the card creates a requestChoice) so the built-in AI plays the card sensibly. A composed card (approaches 1/2) derives these from the atoms it uses (see src/engine/compileComposition.ts's deriveStrategyHints) -- no hints to hand-write there.
- Any api.requestChoice options shown to the human MUST carry a human-readable \`label\` -- for card targets use api.getCardName(cardId). Never surface raw instance ids like "inst-12" to the player, and use card NAMES (not ids) in log messages too.
- Work primarily in data/cards.json (composition field only, never any other field of any OTHER card's row), src/effects/, and tests/cards/ -- and do not touch effects/tests/registry rows for cards other than the ones listed above.
- ENGINE EXTENSIONS beyond approach 2's atom proposal: if (and only if) a BESPOKE card genuinely needs an engine capability that doesn't exist, you may make a minimal, purely ADDITIVE change to src/engine/ (a new EngineAPI method or a new hook dispatch point) plus tests for it in tests/engine/. Never alter the behavior of existing primitives, hooks, or cards. If the needed change would be more than additive, stop and use the needs-clarification path instead.
- After writing/patching the files, run \`npm run test:cards\` from ${params.projectRoot} and keep iterating until it passes for these cards (and does not break any other card's structural test).
- Run ONLY \`npm run test:cards\` (plus \`npm run typecheck\` if you changed types) UNLESS you took approach 2 above (a shared/atoms.ts or src/engine/compileComposition.ts change) -- in that specific case only, you MUST additionally run the FULL \`npm test\` and confirm it is 100% green before finishing. Do NOT run the full suite for approaches 1 or 3, and do NOT investigate failures in tests outside tests/cards/ and tests/structural.test.ts (or, for approach 2 only, tests/atoms.test.ts and tests/engine/compileComposition.test.ts) -- anything else failing is pre-existing and out of scope for this job.
- NEVER run git commands (no status, stash, add, commit, diff -- nothing). The repository state is not yours to manage; another process owns it.
- Note: the registry intentionally still lists these cards as "implemented": false while you work, regardless of which approach you took -- the server flips that flag after this job succeeds. The structural tests are written to accommodate this.
- If a card's effect text is fundamentally unimplementable as written (self-contradictory, or needs a capability that doesn't exist and can't be reasonably approximated by any of the three approaches above), do not guess or approximate silently: set "success" to false and put a specific question for the human in "question" instead (asking them to clarify or edit the card's effect text). Leave no half-finished files behind in that case.
- On success, respond with "success": true and "cardIds" listing every card id you implemented and verified green.
- On any other failure, respond with "success": false and put diagnostic detail (e.g. the vitest failure output) in "errors".

When you are done, produce your final structured JSON output matching the required schema.`;
}

function summarizeMessage(message: SDKMessage): string | null {
  if (message.type === 'assistant') {
    const parts: string[] = [];
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text);
      } else if (block.type === 'tool_use') {
        const input = block.input as Record<string, unknown> | undefined;
        const command = typeof input?.command === 'string' ? input.command : undefined;
        parts.push(command ? `[tool] ${block.name}: ${command}` : `[tool] ${block.name}`);
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }

  if (message.type === 'result') {
    if (message.subtype === 'success') {
      return `[session done] ${message.num_turns} turn(s), $${message.total_cost_usd.toFixed(4)}`;
    }
    return `[session error: ${message.subtype}] ${message.errors?.join('; ') ?? 'no detail'}`;
  }

  return null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseImplementOutput(
  structured: unknown,
  fallbackText: string
): ImplementStructuredOutput | null {
  const candidate = structured ?? tryParseJson(fallbackText);
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof (candidate as Record<string, unknown>).success !== 'boolean' ||
    !Array.isArray((candidate as Record<string, unknown>).cardIds) ||
    !Array.isArray((candidate as Record<string, unknown>).errors)
  ) {
    return null;
  }
  const c = candidate as ImplementStructuredOutput;
  return {
    success: c.success,
    cardIds: c.cardIds,
    errors: c.errors,
    question: typeof c.question === 'string' ? c.question : undefined,
  };
}

async function runImplementAttempt(
  params: ImplementCardsParams,
  priorFailure: string | undefined
): Promise<ImplementCardsResult> {
  const prompt = buildImplementPrompt(params, priorFailure);

  const session = query({
    prompt,
    options: {
      cwd: params.projectRoot,
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'],
      // The job must never manage repository state (a stray `git stash` from
      // a confused attempt once swept up the whole working tree).
      disallowedTools: ['Bash(git *)', 'Bash(git*)'],
      permissionMode: 'acceptEdits',
      maxTurns: 50,
      model: IMPLEMENT_MODEL,
      outputFormat: { type: 'json_schema', schema: IMPLEMENT_OUTPUT_SCHEMA },
    },
  });

  let structuredOutput: unknown;
  let resultText = '';
  let sessionError: string | undefined;

  for await (const message of session) {
    const line = summarizeMessage(message);
    if (line) params.onLog?.(line);

    if (message.type === 'result') {
      if (message.subtype === 'success') {
        structuredOutput = message.structured_output;
        resultText = message.result;
      } else {
        sessionError = message.errors?.join('; ') || message.subtype;
      }
    }
  }

  if (sessionError) {
    return { status: 'failed', error: sessionError };
  }

  const parsed = parseImplementOutput(structuredOutput, resultText);
  if (!parsed) {
    return {
      status: 'failed',
      error: 'implementCards: the agent session ended without valid structured output.',
    };
  }

  if (parsed.question) {
    return { status: 'needs-clarification', clarificationQuestion: parsed.question };
  }
  if (!parsed.success) {
    return {
      status: 'failed',
      error: parsed.errors.join('; ') || 'Implement job reported failure with no error detail.',
    };
  }
  return { status: 'done' };
}

// Runs up to 3 total attempts (1 initial + 2 auto-retries), feeding each
// failed attempt's error back into the next attempt's prompt as
// "prior failure output". A `needs-clarification` result short-circuits
// immediately -- retrying won't help a genuinely unimplementable card, the
// human needs to act.
export async function implementCards(params: ImplementCardsParams): Promise<ImplementCardsResult> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    const error =
      'Neither ANTHROPIC_PERSONAL_API_KEY nor ANTHROPIC_API_KEY is set in the dev-server environment; cannot run the implement job.';
    params.onLog?.(error);
    return { status: 'failed', error };
  }

  const maxAttempts = 3;
  let priorFailure = params.priorFailureOutput;
  let lastError = 'Unknown failure.';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    params.onLog?.(`--- implement attempt ${attempt}/${maxAttempts} ---`);
    try {
      const result = await runImplementAttempt(params, priorFailure);
      if (result.status !== 'failed') {
        return result;
      }
      lastError = result.error ?? lastError;
      priorFailure = lastError;
      params.onLog?.(`Attempt ${attempt} failed: ${lastError}`);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      priorFailure = lastError;
      params.onLog?.(`Attempt ${attempt} threw: ${lastError}`);
    }
  }

  return {
    status: 'failed',
    error: `All ${maxAttempts} implement attempts failed. Last error: ${lastError}`,
  };
}
