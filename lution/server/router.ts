// Mounts the /api endpoints (GET/PUT /api/state, GET /api/registry, GET
// /api/card-source/:id, POST /api/validate-card, POST /api/registry/cards,
// POST /api/design-card, POST /api/compile-card, POST /api/judge-duplicate,
// POST /api/implement-cards, GET /api/jobs/:id, POST /api/jobs/:id/retry,
// POST /api/resolve-round, POST /api/next-cards) as Vite dev-server middleware.
// Wired in by server/plugin.ts's configureServer hook.
//
// Vite mounts this at server.middlewares.use('/api', handler) -- Connect
// strips the '/api' prefix from req.url before invoking a path-scoped
// handler, so every route below is matched WITHOUT the '/api' prefix (e.g.
// '/state', not '/api/state'). Tests exercise this router directly with
// fake IncomingMessage/ServerResponse-shaped objects using the same
// convention.

import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PersistencePaths } from './persistence';
import {
  readRegistry,
  writeRegistry,
  readMatchState,
  writeMatchState,
  writeResolveTransaction,
  withRegistryLock,
  appendNextCardsEntry,
  writeMatchMeta,
} from './persistence';
import { JobManager } from './jobs';
import { resolveRound } from './resolveRound';
import { formatNextCardsEntry } from './nextCards';
import {
  designCard as claudeDesignCard,
  compileCard as claudeCompileCard,
  generateStarterNames,
  judgeSemanticDuplicate,
} from './claude';
import { validateNewCard } from '../shared/validation';
import { validateCompositionShape, validateCompositionSemantics, type CardComposition } from '../shared/atoms';
import { mulberry32Step } from '../src/engine/rng';
import { MATCH_WINS } from '../src/engine/match';
import type {
  CardDef,
  CardId,
  CompileCardRequest,
  CompileCardResponse,
  CreateRegistryCardRequest,
  CreateRegistryCardResponse,
  DesignCardRequest,
  DesignCardResponse,
  GetCardSourceResponse,
  GetJobResponse,
  GetRegistryResponse,
  GetStateResponse,
  ImplementCardsRequest,
  ImplementCardsResponse,
  JudgeDuplicateRequest,
  JudgeDuplicateResponse,
  MatchMeta,
  MatchState,
  NewMatchResponse,
  NextCardsRequest,
  NextCardsResponse,
  PlayerId,
  PutStateRequest,
  PutStateResponse,
  ResolveRoundRequest,
  ResolveRoundResponse,
  RetryJobResponse,
  RoundRecord,
  ValidateCardRequest,
  ValidateCardResponse,
  VoidRoundDesignsRequest,
  VoidRoundDesignsResponse,
} from '../shared/types';

export type ApiRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void | Promise<void>;

export interface CreateApiRouterParams {
  paths: PersistencePaths;
  projectRoot: string;
  // Injectable for tests; defaults to a fresh JobManager wired to `paths`/
  // `projectRoot`.
  jobManager?: JobManager;
}

interface RouteContext {
  paths: PersistencePaths;
  projectRoot: string;
  jobManager: JobManager;
}

// ============================================================================
// small HTTP helpers
// ============================================================================

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body ?? null);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(payload);
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 'human' || value === 'claude';
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? slug : 'card';
}

function mintCardId(
  round: number,
  creatorId: PlayerId,
  name: string,
  existing: readonly CardDef[]
): CardId {
  const base = `r${round}-${creatorId}-${slugify(name)}`;
  const taken = new Set(existing.map((c) => c.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// ============================================================================
// endpoint handlers
// ============================================================================

async function handleGetState(ctx: RouteContext, res: ServerResponse): Promise<void> {
  const state = await readMatchState(ctx.paths);
  sendJson(res, 200, state satisfies GetStateResponse | null);
}

async function handlePutState(
  ctx: RouteContext,
  res: ServerResponse,
  body: PutStateRequest | undefined
): Promise<void> {
  if (!body || typeof body !== 'object' || !body.state) {
    sendJson(res, 400, { error: 'Request body must be { state: MatchState }.' });
    return;
  }
  await writeMatchState(ctx.paths, body.state);
  sendJson(res, 200, { ok: true } satisfies PutStateResponse);
}

async function handleGetRegistry(ctx: RouteContext, res: ServerResponse): Promise<void> {
  const registry = await readRegistry(ctx.paths);
  sendJson(res, 200, registry satisfies GetRegistryResponse);
}

// id must match this pattern AND already exist in the registry -- see
// shared/types.ts's GetCardSourceResponse doc comment. A card id built by
// mintCardId() above can never contain '.' or '/', so this pattern doubles
// as the path-traversal guard: there is no character set that both matches
// it and escapes projectRoot/src/effects or projectRoot/tests/cards.
const CARD_ID_PATTERN = /^[a-z0-9-]+$/;

async function handleGetCardSource(ctx: RouteContext, res: ServerResponse, rawId: string): Promise<void> {
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    sendJson(res, 404, { error: 'Invalid card id.' });
    return;
  }
  if (!CARD_ID_PATTERN.test(id)) {
    sendJson(res, 404, { error: `Invalid card id "${id}".` });
    return;
  }

  const registry = await readRegistry(ctx.paths);
  const card = registry.find((c) => c.id === id);
  if (!card) {
    sendJson(res, 404, { error: `No registry entry for card "${id}".` });
    return;
  }

  const effectPath = path.join(ctx.projectRoot, 'src', 'effects', `${id}.ts`);
  let effectSource: string;
  try {
    effectSource = await fs.readFile(effectPath, 'utf8');
  } catch {
    sendJson(res, 404, { error: `No effect module on disk for "${id}".` });
    return;
  }

  const testPath = path.join(ctx.projectRoot, 'tests', 'cards', `${id}.test.ts`);
  let testSource: string | null;
  try {
    testSource = await fs.readFile(testPath, 'utf8');
  } catch {
    // Starters (and, in principle, any card whose test was hand-deleted)
    // have no test file -- this is an expected, non-error case.
    testSource = null;
  }

  sendJson(res, 200, { effectSource, testSource } satisfies GetCardSourceResponse);
}

async function handleValidateCard(
  ctx: RouteContext,
  res: ServerResponse,
  body: ValidateCardRequest | undefined
): Promise<void> {
  if (!body || typeof body.name !== 'string' || typeof body.effectText !== 'string') {
    sendJson(res, 400, { error: 'Request body must be { name: string, effectText: string }.' });
    return;
  }
  const registry = await readRegistry(ctx.paths);
  const result = validateNewCard({ name: body.name, effectText: body.effectText }, registry);
  sendJson(res, 200, result satisfies ValidateCardResponse);
}

// Best-effort semantic-duplicate judgment (rule 5: "Claude judges semantic
// duplicates/implementability" of a human's card). This is an ENHANCEMENT on
// top of the mechanical validateNewCard() hard gate, not a replacement for
// it -- if the judgment call itself fails for any reason (no
// ANTHROPIC_API_KEY configured, a transient network error, an unparsable
// response), we log and treat it as "not a duplicate" rather than blocking
// card creation entirely. This keeps M2/M3-style manual play (no live
// Claude) and offline dev working, per the plan's milestone ordering.
async function trySemanticDuplicateCheck(
  candidate: { name: string; effectText: string },
  registry: readonly CardDef[],
  context: string
): Promise<string | null> {
  const compareAgainst = registry.map((c) => ({ id: c.id, name: c.name, effectText: c.effectText }));
  try {
    const result = await judgeSemanticDuplicate({ candidate, compareAgainst, context });
    if (result.isDuplicate) {
      return `Claude judged this effect to be a semantic duplicate of an existing card${
        result.matchedTarget ? ` ("${result.matchedTarget}")` : ''
      }: ${result.explanation || 'reworded restatement of an existing effect.'}`;
    }
    return null;
  } catch (err) {
    console.warn(
      `[lution] semantic duplicate check skipped (${context}): ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

async function handleCreateRegistryCard(
  ctx: RouteContext,
  res: ServerResponse,
  body: CreateRegistryCardRequest | undefined
): Promise<void> {
  if (
    !body ||
    typeof body.name !== 'string' ||
    typeof body.effectText !== 'string' ||
    typeof body.round !== 'number' ||
    !isPlayerId(body.creatorId)
  ) {
    sendJson(res, 400, {
      error:
        'Request body must be { name: string, effectText: string, creatorId: "human"|"claude", round: number }.',
    });
    return;
  }
  const { name, effectText, creatorId, round } = body;

  // The whole read-validate-mint-write sequence is one logical transaction:
  // without this lock, two concurrent POST /api/registry/cards calls (the
  // human's and Claude's designs, minted via Promise.all right after a
  // simultaneous reveal) can each read the same pre-mutation registry and
  // silently drop one of the two new cards on write (lost update).
  const outcome = await withRegistryLock(ctx.paths, async () => {
    const registry = await readRegistry(ctx.paths);
    const validation = validateNewCard({ name, effectText }, registry);
    if (!validation.ok) {
      return { ok: false as const, violations: validation.violations };
    }

    if (creatorId === 'human') {
      const semanticViolation = await trySemanticDuplicateCheck(
        { name, effectText },
        registry,
        'human-submission-vs-registry'
      );
      if (semanticViolation) {
        return { ok: false as const, violations: [semanticViolation] };
      }
    }

    const card: CardDef = {
      id: mintCardId(round, creatorId, name, registry),
      name,
      effectText,
      creatorId,
      createdInRound: round,
      destroyed: false,
      implemented: false,
    };
    await writeRegistry(ctx.paths, [...registry, card]);
    return { ok: true as const, card };
  });

  if (!outcome.ok) {
    sendJson(res, 409, { violations: outcome.violations });
    return;
  }
  sendJson(res, 201, { card: outcome.card } satisfies CreateRegistryCardResponse);
}

// Resolves one side of a VoidRoundDesignsRequest into a CardDef: either the
// already-minted card it references ('existing'), or a freshly-constructed
// one built the same way handleCreateRegistryCard does ('raw') -- WITHOUT
// running validateNewCard's duplicate-effect gate. Skipping that gate is the
// entire point of this endpoint: both designs are, by construction, the
// same effect, so the ordinary mint pipeline would reject the second one.
function resolveVoidInput(
  input: VoidRoundDesignsRequest['human'],
  creatorId: PlayerId,
  round: number,
  registrySoFar: readonly CardDef[]
): CardDef {
  if (input.kind === 'existing') {
    const card = registrySoFar.find((c) => c.id === input.cardId);
    if (!card) {
      throw new Error(`void-round-designs: existing card "${input.cardId}" has no registry entry.`);
    }
    return card;
  }
  return {
    id: mintCardId(round, creatorId, input.name, registrySoFar),
    name: input.name,
    effectText: input.effectText,
    creatorId,
    createdInRound: round,
    destroyed: false,
    implemented: false,
  };
}

async function handleVoidRoundDesigns(
  ctx: RouteContext,
  res: ServerResponse,
  body: VoidRoundDesignsRequest | undefined
): Promise<void> {
  if (!body || typeof body.round !== 'number' || !body.human || !body.claude) {
    sendJson(res, 400, {
      error: 'Request body must be { round: number, human: VoidDesignInput, claude: VoidDesignInput }.',
    });
    return;
  }

  try {
    const result = await withRegistryLock(ctx.paths, async () => {
      let registry = await readRegistry(ctx.paths);

      const humanCard = resolveVoidInput(body.human, 'human', body.round, registry);
      if (body.human.kind === 'raw') registry = [...registry, humanCard];

      const claudeCard = resolveVoidInput(body.claude, 'claude', body.round, registry);
      if (body.claude.kind === 'raw') registry = [...registry, claudeCard];

      const idSet = new Set([humanCard.id, claudeCard.id]);
      registry = registry.map((c) => (idSet.has(c.id) ? { ...c, destroyed: true } : c));
      await writeRegistry(ctx.paths, registry);

      return {
        human: registry.find((c) => c.id === humanCard.id)!,
        claude: registry.find((c) => c.id === claudeCard.id)!,
      };
    });
    sendJson(res, 200, result satisfies VoidRoundDesignsResponse);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
}

// Reads lution/STRATEGY.md for injection into the design-card prompt. Local
// disk, cheap, read fresh per request. Returns undefined (never throws) if
// the file is missing or unreadable -- designCard's prompt gracefully omits
// the strategy-guide section in that case.
async function readStrategyGuide(projectRoot: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(projectRoot, 'STRATEGY.md'), 'utf8');
  } catch (err) {
    console.warn(
      `[lution] Could not read STRATEGY.md for the design prompt (${err instanceof Error ? err.message : String(err)}); omitting the strategy guide section.`
    );
    return undefined;
  }
}

// Phrases WHY the opening round's loser role landed where it did, from
// claude's point of view, for the design prompt's seat section. Mirrors the
// semantics src/ui/app.ts's openingRoundExplainer() uses for the human-facing
// UI text, but worded for the prompt.
function describeOpeningSeatReason(
  loserIsClaude: boolean,
  reasonKind: MatchState['openingLoserReason']
): string {
  const subject = loserIsClaude ? 'you' : 'the human';
  const roleLabel = loserIsClaude ? 'loser' : 'winner';
  let detail: string;
  switch (reasonKind) {
    case 'last-match-loser':
      detail = `${subject} lost the previous match`;
      break;
    case 'recent-game-loser':
      detail = `${subject} lost the most recent game`;
      break;
    case 'coin-flip':
    default:
      detail = 'it was decided by coin flip';
      break;
  }
  return `you hold the opening ${roleLabel} role: ${detail}`;
}

// Computes which seat claude holds this round, from persisted MatchState --
// for round 1 (the opening design round, no inner game played yet this
// match), from match.openingLoser/openingLoserReason; for round >= 2, from
// the just-finished inner game's result (match.currentInnerGame.result is
// reliably populated at this point -- see src/ui/app.ts's handleInnerGameEnd,
// which persists innerWins/phase/round BEFORE clearing/replacing
// currentInnerGame, and calls enterDesign() -> ... -> POST /design-card only
// after that persist completes). Throws if round >= 2 and no decisive
// finished inner game is on record -- that's a genuine invariant violation,
// not a recoverable input error, so handleDesignCard should turn it into a
// 500 rather than silently guessing.
function computeClaudeSeat(match: MatchState): { role: 'loser' | 'winner'; reason: string } {
  const isOpeningRound =
    match.round === 1 && match.roundHistory.length === 0 && match.openingLoser !== undefined;

  if (isOpeningRound) {
    const loser = match.openingLoser as PlayerId;
    const role: 'loser' | 'winner' = loser === 'claude' ? 'loser' : 'winner';
    return { role, reason: describeOpeningSeatReason(loser === 'claude', match.openingLoserReason) };
  }

  // Preferred source: lastGameLoser (persisted at inner-game end; survives
  // currentInnerGame being replaced by the next game). Fallback: the old
  // currentInnerGame.result derivation, for saves predating the field.
  let loser: PlayerId;
  if (match.lastGameLoser) {
    loser = match.lastGameLoser;
  } else {
    const result = match.currentInnerGame?.result;
    if (!result || result.outcome !== 'win') {
      throw new Error(
        'computeClaudeSeat: no finished inner game on record for this round (currentInnerGame.result is missing or not a decisive win).'
      );
    }
    loser = result.winner === 'human' ? 'claude' : 'human';
  }
  const role: 'loser' | 'winner' = loser === 'claude' ? 'loser' : 'winner';
  const reason =
    role === 'loser' ? 'you lost the inner game that just ended' : 'you won the inner game that just ended';
  return { role, reason };
}

// BUG FIX (reload-mid-design double-mint, 2026-07-03): if the page reloads
// while POST /api/design-card is in flight, the browser abandons the request
// but the SERVER keeps running it to completion and mints Claude's card. The
// reloaded client re-enters the design flow and fires a FRESH call for the
// same round, which (absent this check) mints a SECOND card -- the first
// becomes a registry orphan that burns an API call and, via resolveRound.ts's
// orphan sweep, gets permanently destroyed the moment the round resolves.
// Confirmed live: r3-claude-the-reflationary-thaw.
//
// This is the "already finished, just re-asked" half of the fix: any
// same-round claude design that is (a) not destroyed (a VOIDED design is
// destroyed: true and must NOT be reused -- rule 3 redesigns after a void
// need a genuinely fresh card, verified against handleVoidRoundDesigns'
// actual behavior above, not assumed), (b) never referenced by any already-
// resolved round's designs, and (c) not already sitting in either deck (the
// round hasn't been resolved with it yet) is exactly "the design this round
// already minted, still waiting to be used" -- hand it straight back instead
// of paying for another Claude call. The other half (in-flight coalescing,
// for the case where the FIRST call hasn't finished yet) is
// inFlightDesignCalls below.
function findReusableRoundDesign(
  match: MatchState,
  registry: readonly CardDef[],
  round: number
): CardDef | undefined {
  const resolvedDesignIds = new Set(
    match.roundHistory.flatMap((r) => Object.values(r.designs).filter((id): id is CardId => id !== null))
  );
  const inAnyDeck = new Set([...match.decks.human, ...match.decks.claude]);
  return registry.find(
    (c) =>
      c.creatorId === 'claude' &&
      c.createdInRound === round &&
      !c.destroyed &&
      !resolvedDesignIds.has(c.id) &&
      !inAnyDeck.has(c.id)
  );
}

// Shared by mintClaudeDesignForRound (a fresh design's own inline
// composition) and handleCompileCard (an already-minted card's after-the-
// fact compile attempt): validates an UNVALIDATED `unknown` composition
// (whatever live Claude returned) against both validateCompositionShape and
// validateCompositionSemantics, returning the validated CardComposition on
// success or `undefined` on ANY failure (absent, malformed, or semantically
// unsound) -- logs a console.warn either way rather than throwing, since an
// invalid/absent composition is an ordinary, expected outcome (the card
// simply falls back to the bespoke-module pipeline), never an error.
function resolveMintableComposition(raw: unknown, knownCardIds: ReadonlySet<string>): CardComposition | undefined {
  if (raw === undefined) return undefined;
  const shapeResult = validateCompositionShape(raw);
  if (!shapeResult.ok || !shapeResult.value) {
    console.warn(`[lution] composition rejected by shape validation: ${shapeResult.errors.join('; ')}`);
    return undefined;
  }
  const semanticResult = validateCompositionSemantics(shapeResult.value, { knownCardIds });
  if (!semanticResult.ok) {
    console.warn(`[lution] composition rejected by semantic validation: ${semanticResult.errors.join('; ')}`);
    return undefined;
  }
  return shapeResult.value;
}

type DesignCardMintOutcome =
  | { kind: 'minted'; card: CardDef }
  | { kind: 'error'; status: number; body: unknown };

// The actual "call claude, validate, mint" work, factored out of
// handleDesignCard so it can be shared by every concurrent caller for the
// same round via inFlightDesignCalls below -- unchanged retry-up-to-3-times
// logic, just returning an outcome value instead of writing straight to a
// (single, per-caller) ServerResponse.
async function mintClaudeDesignForRound(
  ctx: RouteContext,
  match: MatchState,
  registrySnapshot: readonly CardDef[],
  seat: { role: 'loser' | 'winner'; reason: string },
  round: number,
  opponentDesign: { name: string; effectText: string } | null | undefined
): Promise<DesignCardMintOutcome> {
  const strategyGuide = await readStrategyGuide(ctx.projectRoot);
  const priorAttempts: Array<{ name: string; effectText: string; violations: string[] }> = [];
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let design: { name: string; effectText: string; composition?: unknown };
    try {
      design = await claudeDesignCard({
        round,
        creatorId: 'claude',
        registry: registrySnapshot,
        match: { decks: match.decks, innerWins: match.innerWins, roundHistory: match.roundHistory },
        opponentDesign: opponentDesign ?? null,
        priorAttempts,
        strategyGuide,
        seat,
        matchWins: MATCH_WINS,
      });
    } catch (err) {
      console.error(
        `[lution] POST /design-card failed (attempt ${attempt}/${maxAttempts}):`,
        err instanceof Error ? err.message : err
      );
      return {
        kind: 'error',
        status: 502,
        body: { error: err instanceof Error ? err.message : String(err), attempts: attempt },
      };
    }

    const preValidation = validateNewCard(design, registrySnapshot);
    if (!preValidation.ok) {
      priorAttempts.push({
        name: design.name,
        effectText: design.effectText,
        violations: preValidation.violations,
      });
      continue;
    }

    // Mint + write is one locked transaction over the FRESHEST registry --
    // see withRegistryLock's doc comment for the lost-update race this
    // closes (the same race POST /api/registry/cards is exposed to).
    const outcome = await withRegistryLock(ctx.paths, async () => {
      const freshRegistry = await readRegistry(ctx.paths);
      const revalidation = validateNewCard(design, freshRegistry);
      if (!revalidation.ok) {
        return { ok: false as const, violations: revalidation.violations };
      }
      // M3: a valid composition (shape + semantics, checked against the
      // FRESHEST registry's ids for byName references) mints INSTANTLY
      // (implemented: true, no job); an absent or invalid one falls through
      // to exactly today's path (implemented: false, the ordinary implement
      // job picks it up at round-resolution time).
      const knownCardIds = new Set(freshRegistry.map((c) => c.id));
      const composition = resolveMintableComposition(design.composition, knownCardIds);
      const card: CardDef = {
        id: mintCardId(round, 'claude', design.name, freshRegistry),
        name: design.name,
        effectText: design.effectText,
        creatorId: 'claude',
        createdInRound: round,
        destroyed: false,
        implemented: composition !== undefined,
        ...(composition !== undefined ? { composition } : {}),
      };
      await writeRegistry(ctx.paths, [...freshRegistry, card]);
      return { ok: true as const, card };
    });

    if (outcome.ok) {
      return { kind: 'minted', card: outcome.card };
    }

    priorAttempts.push({
      name: design.name,
      effectText: design.effectText,
      violations: outcome.violations,
    });
  }

  return {
    kind: 'error',
    status: 502,
    body: {
      error: `Claude's design failed mechanical validation after ${maxAttempts} attempts.`,
      attempts: maxAttempts,
      violations: priorAttempts[priorAttempts.length - 1]?.violations ?? [],
    },
  };
}

// BUG FIX (in-flight coalescing, 2026-07-03): the other half of the reload-
// mid-design double-mint fix. If a design-card request for round N is still
// being worked on (the first request hasn't settled yet -- the reload raced
// the ORIGINAL call, not a since-completed one), a second request for the
// same round awaits the very same promise instead of starting a second
// Claude call. Module-level, in-memory: the dev server is a single process
// (see the napkin), so this doesn't need to survive a restart -- a genuinely
// interrupted-by-restart mint is already covered by findReusableRoundDesign
// above once the round's next design-card call comes in. Keyed by round
// number alone (not round+matchId): only one match is ever in progress on
// this dev server at a time.
const inFlightDesignCalls = new Map<number, Promise<DesignCardMintOutcome>>();

async function handleDesignCard(
  ctx: RouteContext,
  res: ServerResponse,
  body: DesignCardRequest | undefined
): Promise<void> {
  if (!body || typeof body.round !== 'number') {
    sendJson(res, 400, { error: 'Request body must be { round: number, opponentDesign?: ... }.' });
    return;
  }

  const match = await readMatchState(ctx.paths);
  if (!match) {
    sendJson(res, 409, { error: 'No match in progress.' });
    return;
  }
  // Snapshot used for prompt context and a cheap pre-check; the actual
  // mint+write below always re-reads the freshest registry from inside the
  // lock, since this snapshot can go stale during the (possibly slow)
  // Messages API call.
  const registrySnapshot = await readRegistry(ctx.paths);

  let seat: { role: 'loser' | 'winner'; reason: string };
  try {
    seat = computeClaudeSeat(match);
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const reusable = findReusableRoundDesign(match, registrySnapshot, body.round);
  if (reusable) {
    sendJson(res, 200, { card: reusable } satisfies DesignCardResponse);
    return;
  }

  // Everything from here to the `inFlightDesignCalls.set` below runs with no
  // `await` in between, so two concurrent calls for the same round can never
  // both observe "nothing in flight" and each start their own Claude call --
  // one of them always wins the synchronous get-then-set.
  let promise = inFlightDesignCalls.get(body.round);
  if (!promise) {
    promise = mintClaudeDesignForRound(ctx, match, registrySnapshot, seat, body.round, body.opponentDesign);
    inFlightDesignCalls.set(body.round, promise);
    void promise.finally(() => {
      if (inFlightDesignCalls.get(body.round) === promise) {
        inFlightDesignCalls.delete(body.round);
      }
    });
  }

  const outcome = await promise;
  if (outcome.kind === 'minted') {
    sendJson(res, 201, { card: outcome.card } satisfies DesignCardResponse);
  } else {
    sendJson(res, outcome.status, outcome.body);
  }
}

// POST /api/compile-card (plan §4b): a best-effort, NEVER-hard-fails attempt
// to express an already-minted card (today, always the human's -- see
// shared/types.ts's CompileCardRequest doc comment) as a composition after
// the fact. Called by src/ui/app.ts right after the human's design mints,
// before the round's implement job is kicked off -- success here means the
// later POST /api/implement-cards call's "already implemented" short-circuit
// makes the job a no-op for free. `ok: false` (card stays implemented:
// false, no composition attached) is always a 200, never an error status --
// an inexpressible card falling back to the ordinary job is the EXPECTED
// outcome for most cards, not a failure of this endpoint.
async function handleCompileCard(
  ctx: RouteContext,
  res: ServerResponse,
  body: CompileCardRequest | undefined
): Promise<void> {
  if (!body || typeof body.cardId !== 'string') {
    sendJson(res, 400, { error: 'Request body must be { cardId: string }.' });
    return;
  }

  const outcome = await withRegistryLock(ctx.paths, async (): Promise<CompileCardResponse> => {
    const registry = await readRegistry(ctx.paths);
    const card = registry.find((c) => c.id === body.cardId);
    if (!card) {
      return { ok: false, reason: `No registry entry for card "${body.cardId}".` };
    }
    if (card.implemented) {
      // Already implemented by the time this ran (a duplicate/retried call,
      // or a bespoke module landed some other way) -- nothing to do, and
      // definitely not an error.
      return { ok: true, card };
    }

    let compileResult: Awaited<ReturnType<typeof claudeCompileCard>>;
    try {
      compileResult = await claudeCompileCard({
        card: { id: card.id, name: card.name, effectText: card.effectText },
        registry,
      });
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    if (!compileResult.ok) {
      return { ok: false, reason: compileResult.reason };
    }

    const knownCardIds = new Set(registry.map((c) => c.id));
    const composition = resolveMintableComposition(compileResult.composition, knownCardIds);
    if (composition === undefined) {
      return { ok: false, reason: 'compileCard returned a composition that failed shape/semantic validation.' };
    }

    const updated: CardDef = { ...card, composition, implemented: true };
    await writeRegistry(
      ctx.paths,
      registry.map((c) => (c.id === updated.id ? updated : c))
    );
    return { ok: true, card: updated };
  });

  sendJson(res, 200, outcome satisfies CompileCardResponse);
}

async function handleImplementCards(
  ctx: RouteContext,
  res: ServerResponse,
  body: ImplementCardsRequest | undefined
): Promise<void> {
  if (!body || typeof body.round !== 'number' || !Array.isArray(body.cardIds) || body.cardIds.length === 0) {
    sendJson(res, 400, {
      error: 'Request body must be { round: number, cardIds: string[] } (non-empty).',
    });
    return;
  }

  // No-duplicate-job guard: if every requested card is already implemented
  // (and not destroyed), there is nothing for a job to do -- this happens
  // whenever the client re-enters this step after a reload/retry that races
  // a job which already finished, or (from the opening-design-round feature)
  // when the round's designs turn out to reuse an already-implemented id.
  // Short-circuit WITHOUT enqueuing so JobManager/jobs.json never records a
  // no-op job.
  const registry = await readRegistry(ctx.paths);
  const registryById = new Map(registry.map((c) => [c.id, c]));
  // Destroyed cards (spurned designs, creator-executions) never need effect
  // modules -- filter them out so a raid that killed a design doesn't spawn
  // an implement job for a corpse.
  const needingWork = body.cardIds.filter((id) => {
    const card = registryById.get(id);
    return card !== undefined && !card.destroyed && !card.implemented;
  });
  if (needingWork.length === 0) {
    sendJson(res, 200, { jobId: null, alreadyImplemented: true } satisfies ImplementCardsResponse);
    return;
  }

  const job = await ctx.jobManager.enqueue(body.round, needingWork);
  sendJson(res, 202, { jobId: job.id } satisfies ImplementCardsResponse);
}

async function handleGetJob(ctx: RouteContext, res: ServerResponse, id: string): Promise<void> {
  await ctx.jobManager.whenReady();
  const job = ctx.jobManager.get(id);
  if (!job) {
    sendJson(res, 404, { error: `No job with id "${id}".` });
    return;
  }
  sendJson(res, 200, job satisfies GetJobResponse & { log: string[] });
}

async function handleRetryJob(ctx: RouteContext, res: ServerResponse, id: string): Promise<void> {
  const job = await ctx.jobManager.retry(id);
  if (!job) {
    sendJson(res, 404, { error: `No job with id "${id}".` });
    return;
  }
  sendJson(res, 200, { jobId: job.id } satisfies RetryJobResponse);
}

async function handleResolveRound(
  ctx: RouteContext,
  res: ServerResponse,
  body: ResolveRoundRequest | undefined
): Promise<void> {
  if (
    !body ||
    typeof body.round !== 'number' ||
    !body.designs ||
    !isPlayerId(body.winner) ||
    (body.decision !== 'keep' && body.decision !== 'steal')
  ) {
    sendJson(res, 400, {
      error: 'Invalid resolve-round request body (need round, designs, winner, decision).',
    });
    return;
  }

  // The read-check-compute-write sequence (including the registry+match-state
  // pair write below) is one locked transaction -- same registry-mutation
  // lock POST /api/registry/cards and POST /api/design-card use, so a
  // resolve-round can't interleave with a concurrent card mint and silently
  // drop one of them, and so the idempotency check below can't race a second
  // concurrent resolve-round for the same round.
  type ResolveOutcome =
    | { ok: true; match: MatchState; record: RoundRecord }
    | { ok: false; error: string; status: number };

  const outcome: ResolveOutcome = await withRegistryLock(ctx.paths, async (): Promise<ResolveOutcome> => {
    const match = await readMatchState(ctx.paths);
    if (!match) {
      return { ok: false, error: 'No match in progress.', status: 409 };
    }

    // Idempotency guard: this round was already resolved. Short-circuit
    // WITHOUT writing anything (no registry write, no match-state write, no
    // WAL marker) so a duplicate resolve-round (e.g. a client retry after a
    // reload) can't double-apply.
    if (match.roundHistory.some((r) => r.round === body.round)) {
      return { ok: false, error: `round ${body.round} already resolved`, status: 409 };
    }

    // Design-identity guard: a design resolves exactly once, EVER. The
    // per-round guard above is bypassable by stale client state that arrives
    // stamped with a freshly-incremented round number (seen live 2026-07-03:
    // leftover designPhase/pendingDesigns replayed round 1's designs as
    // "round 2" and sailed past the round check). Identity, not ordinal.
    const previouslyResolvedDesigns = new Set(
      match.roundHistory.flatMap((r) => Object.values(r.designs).filter((id): id is CardId => id !== null))
    );
    const reused = Object.values(body.designs).filter(
      (id): id is CardId => id !== null && previouslyResolvedDesigns.has(id)
    );
    if (reused.length > 0) {
      return {
        ok: false,
        error: `design(s) already resolved in a prior round: ${reused.join(', ')}`,
        status: 409,
      };
    }

    const registry = await readRegistry(ctx.paths);

    let result: ReturnType<typeof resolveRound>;
    try {
      result = resolveRound({
        match,
        registry,
        round: body.round,
        designs: body.designs,
        winner: body.winner,
        decision: body.decision,
        loserPick: body.loserPick ?? null,
        winnerPick: body.winnerPick ?? null,
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), status: 400 };
    }

    if (result.sweptOrphans.length > 0) {
      // Rules-consistency fix: any same-round design this resolution never
      // referenced and that landed in neither deck was never kept or
      // stolen -- resolveRound() already destroyed it and folded it into
      // record.destroyed; this is just the operator-visible trace.
      console.log(
        `resolve-round: round ${body.round} swept ${result.sweptOrphans.length} orphaned design(s) ` +
          `never kept or stolen: ${result.sweptOrphans.join(', ')}`
      );
    }

    // Registry + match state are persisted as one WAL-guarded pair (marker
    // -> registry -> match-state -> clear marker) -- see
    // server/persistence.ts's writeResolveTransaction / recoverPendingResolution
    // doc comments for how a crash mid-write is recovered on next boot.
    await writeResolveTransaction(ctx.paths, { registry: result.registry, match: result.match });

    return { ok: true, match: result.match, record: result.record };
  });

  if (!outcome.ok) {
    sendJson(res, outcome.status, { error: outcome.error });
    return;
  }

  sendJson(res, 200, {
    match: outcome.match,
    record: outcome.record,
  } satisfies ResolveRoundResponse);
}

async function handleNextCards(
  ctx: RouteContext,
  res: ServerResponse,
  body: NextCardsRequest | undefined
): Promise<void> {
  if (!body || typeof body.round !== 'number') {
    sendJson(res, 400, { error: 'Request body must be { round: number }.' });
    return;
  }
  const match = await readMatchState(ctx.paths);
  const record = match?.roundHistory.find((r) => r.round === body.round);
  if (!record) {
    sendJson(res, 404, { error: `No round record found for round ${body.round}.` });
    return;
  }
  const registry = await readRegistry(ctx.paths);
  const entry = formatNextCardsEntry(record, registry);
  await appendNextCardsEntry(ctx.paths, entry);
  sendJson(res, 200, { ok: true } satisfies NextCardsResponse);
}

// Rule 3 (identical-simultaneous-designs): mechanical normalizeText match is
// checked client-side first (cheap, no network); when that DOESN'T catch a
// match, the client calls this endpoint for a single Claude semantic
// judgment call comparing the two just-revealed designs before deciding
// whether to void and redesign.
async function handleJudgeDuplicate(
  _ctx: RouteContext,
  res: ServerResponse,
  body: JudgeDuplicateRequest | undefined
): Promise<void> {
  if (
    !body ||
    typeof body.candidate?.name !== 'string' ||
    typeof body.candidate?.effectText !== 'string' ||
    !Array.isArray(body.compareAgainst) ||
    typeof body.context !== 'string'
  ) {
    sendJson(res, 400, {
      error:
        'Request body must be { candidate: {name, effectText}, compareAgainst: Array<{id?, name, effectText}>, context: string }.',
    });
    return;
  }

  try {
    const result = await judgeSemanticDuplicate({
      candidate: body.candidate,
      compareAgainst: body.compareAgainst,
      context: body.context,
    });
    sendJson(res, 200, result satisfies JudgeDuplicateResponse);
  } catch (err) {
    console.error('[lution] POST /judge-duplicate failed:', err instanceof Error ? err.message : err);
    sendJson(res, 502, { error: err instanceof Error ? err.message : String(err) });
  }
}

// A coin flip drawn from the match's own seeded RNG (mulberry32, the exact
// same primitive src/engine/match.ts's createMatchState uses to pick game 1's
// random first player) -- never Math.random, so a match's whole random
// history stays reproducible from its seed.
function seededCoinFlip(seed: number): { result: boolean; nextSeed: number } {
  const { value, nextSeed } = mulberry32Step(seed);
  return { result: value < 0.5, nextSeed };
}

// POST /api/new-match: abandons whatever match is in progress (if any) and
// starts a brand-new one, available any time via the sticky-header "New
// match" control -- not just from the match-over screen. See shared/
// types.ts's NewMatchResponse doc comment for the full step-by-step contract.
async function handleNewMatch(ctx: RouteContext, res: ServerResponse): Promise<void> {
  const outcome = await withRegistryLock(ctx.paths, async (): Promise<MatchState> => {
    const prevMatch = await readMatchState(ctx.paths);

    // (a) Derive + persist meta.json from whatever match existed before this
    // reset. lastGameLoser comes from the most recent roundHistory entry
    // (never from innerWins deltas -- unreliable, per the napkin/spec).
    // lastMatchLoser is set only when the previous match actually concluded.
    const lastGameLoser: PlayerId | null =
      prevMatch && prevMatch.roundHistory.length > 0
        ? prevMatch.roundHistory[prevMatch.roundHistory.length - 1].loser
        : null;
    const lastMatchLoser: PlayerId | null =
      prevMatch && prevMatch.phase === 'match-over' && prevMatch.winner
        ? prevMatch.winner === 'human'
          ? 'claude'
          : 'human'
        : null;
    const meta: MatchMeta = { lastMatchLoser, lastGameLoser, updatedAt: new Date().toISOString() };
    await writeMatchMeta(ctx.paths, meta);

    // (b) Best-effort starter renaming -- never blocks match creation.
    // NOTE: this whole handler already runs inside withRegistryLock (see the
    // top of handleNewMatch) -- do NOT acquire it again here; the lock is a
    // non-reentrant promise chain and a nested acquisition self-deadlocks.
    let registry = await readRegistry(ctx.paths);
    try {
      const newNames = await generateStarterNames(registry.map((c) => c.name));
      if (newNames) {
        const starterIds = registry.filter((c) => c.startingOwner !== undefined).map((c) => c.id);
        const nameById = new Map(starterIds.map((id, i) => [id, newNames[i]]));
        registry = registry.map((c) => {
          const newName = nameById.get(c.id);
          return newName !== undefined ? { ...c, name: newName } : c;
        });
        await writeRegistry(ctx.paths, registry);
        console.log(`[lution] POST /new-match: starters rechristened (e.g. "${newNames[0]}", "${newNames[1]}").`);
      } else {
        console.warn('[lution] POST /new-match: starter rename returned null; names unchanged.');
      }
    } catch (err) {
      console.error('[lution] POST /new-match: starter rename failed, keeping current names:', err);
    }

    // (c) Reset match-state to a brand-new match whose round 1 is the
    // opening design round (no inner game played yet this match).
    const decks: Record<PlayerId, CardId[]> = {
      human: registry.filter((c) => c.startingOwner === 'human').map((c) => c.id),
      claude: registry.filter((c) => c.startingOwner === 'claude').map((c) => c.id),
    };

    let seed = Date.now() >>> 0;
    let openingLoser: PlayerId;
    let openingLoserReason: NonNullable<MatchState['openingLoserReason']>;
    if (lastMatchLoser) {
      openingLoser = lastMatchLoser;
      openingLoserReason = 'last-match-loser';
    } else if (lastGameLoser) {
      openingLoser = lastGameLoser;
      openingLoserReason = 'recent-game-loser';
    } else {
      const flip = seededCoinFlip(seed);
      seed = flip.nextSeed;
      openingLoser = flip.result ? 'human' : 'claude';
      openingLoserReason = 'coin-flip';
    }

    // The EXISTING random-first-player rule (unchanged): a second seeded coin
    // flip decides who opens inner game 1, exactly as createMatchState does
    // for a brand-new match today.
    const firstPlayerFlip = seededCoinFlip(seed);
    seed = firstPlayerFlip.nextSeed;
    const nextFirstPlayer: PlayerId = firstPlayerFlip.result ? 'human' : 'claude';

    const match: MatchState = {
      matchId: `match-${Date.now()}`,
      createdAt: new Date().toISOString(),
      decks,
      innerWins: { human: 0, claude: 0 },
      round: 1,
      nextFirstPlayer,
      matchSeed: seed,
      currentInnerGame: null,
      roundHistory: [],
      phase: 'design',
      winner: null,
      designPhase: 'designing',
      activeJobId: null,
      openingLoser,
      openingLoserReason,
    };

    await writeMatchState(ctx.paths, match);
    return match;
  });

  sendJson(res, 200, outcome satisfies NewMatchResponse);
}

// ============================================================================
// route dispatch
// ============================================================================

export function createApiRouter(params: CreateApiRouterParams): ApiRequestHandler {
  const jobManager =
    params.jobManager ?? new JobManager({ paths: params.paths, projectRoot: params.projectRoot });
  const ctx: RouteContext = {
    paths: params.paths,
    projectRoot: params.projectRoot,
    jobManager,
  };

  return async function handleApiRequest(req, res, next) {
    const method = (req.method ?? 'GET').toUpperCase();
    // Best-effort default so the catch below can always log a path, even if
    // URL parsing itself is what throws.
    let pathname = req.url ?? '/';
    try {
      const url = new URL(req.url ?? '/', 'http://internal');
      pathname = url.pathname;

      const jobMatch = pathname.match(/^\/jobs\/([^/]+)$/);
      const jobRetryMatch = pathname.match(/^\/jobs\/([^/]+)\/retry$/);
      const cardSourceMatch = pathname.match(/^\/card-source\/([^/]+)$/);

      if (method === 'GET' && pathname === '/state') {
        await handleGetState(ctx, res);
        return;
      }
      if (method === 'PUT' && pathname === '/state') {
        const body = (await readBody(req)) as PutStateRequest | undefined;
        await handlePutState(ctx, res, body);
        return;
      }
      if (method === 'GET' && pathname === '/registry') {
        await handleGetRegistry(ctx, res);
        return;
      }
      if (method === 'GET' && cardSourceMatch) {
        await handleGetCardSource(ctx, res, cardSourceMatch[1]);
        return;
      }
      if (method === 'POST' && pathname === '/validate-card') {
        const body = (await readBody(req)) as ValidateCardRequest | undefined;
        await handleValidateCard(ctx, res, body);
        return;
      }
      if (method === 'POST' && pathname === '/registry/cards') {
        const body = (await readBody(req)) as CreateRegistryCardRequest | undefined;
        await handleCreateRegistryCard(ctx, res, body);
        return;
      }
      if (method === 'POST' && pathname === '/void-round-designs') {
        const body = (await readBody(req)) as VoidRoundDesignsRequest | undefined;
        await handleVoidRoundDesigns(ctx, res, body);
        return;
      }
      if (method === 'POST' && pathname === '/design-card') {
        const body = (await readBody(req)) as DesignCardRequest | undefined;
        await handleDesignCard(ctx, res, body);
        return;
      }
      if (method === 'POST' && pathname === '/compile-card') {
        const body = (await readBody(req)) as CompileCardRequest | undefined;
        await handleCompileCard(ctx, res, body);
        return;
      }
      if (method === 'POST' && pathname === '/judge-duplicate') {
        const body = (await readBody(req)) as JudgeDuplicateRequest | undefined;
        await handleJudgeDuplicate(ctx, res, body);
        return;
      }
      if (method === 'POST' && pathname === '/implement-cards') {
        const body = (await readBody(req)) as ImplementCardsRequest | undefined;
        await handleImplementCards(ctx, res, body);
        return;
      }
      if (method === 'GET' && jobMatch) {
        await handleGetJob(ctx, res, decodeURIComponent(jobMatch[1]));
        return;
      }
      if (method === 'POST' && jobRetryMatch) {
        await handleRetryJob(ctx, res, decodeURIComponent(jobRetryMatch[1]));
        return;
      }
      if (method === 'POST' && pathname === '/resolve-round') {
        const body = (await readBody(req)) as ResolveRoundRequest | undefined;
        await handleResolveRound(ctx, res, body);
        return;
      }
      if (method === 'POST' && pathname === '/next-cards') {
        const body = (await readBody(req)) as NextCardsRequest | undefined;
        await handleNextCards(ctx, res, body);
        return;
      }
      if (method === 'POST' && pathname === '/new-match') {
        await handleNewMatch(ctx, res);
        return;
      }

      sendJson(res, 404, { error: `No API route for ${method} ${pathname}.` });
    } catch (err) {
      // The dev-server log was previously silent on handler failures --
      // every uncaught error (bad JSON body, an unexpected throw deep in a
      // handler, ...) is now logged with enough context (verb + path) to
      // find it in the terminal.
      console.error(`[lution] ${method} ${pathname} failed:`, err instanceof Error ? err.message : err, err);
      if (err instanceof SyntaxError) {
        sendJson(res, 400, { error: 'Invalid JSON request body.' });
        return;
      }
      next(err);
    }
  };
}
