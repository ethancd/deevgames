// Shared wire/domain types used by both the client (src/) and, from M2 on,
// the dev-server (server/). Keep this module free of engine internals and
// framework imports so it stays usable from Node and the browser alike.

import type { CardComposition } from './atoms';

// The two seats in every match. 'human' is the person playing in the
// browser; 'claude' is the live AI opponent whose card designs and
// implementations are generated at runtime (from M4).
export type PlayerId = 'human' | 'claude';

export type CardId = string;

// A card TYPE in the registry (data/cards.json is the source of truth).
// Multiple CardInstances across the match can share one CardId; the no-dup
// invariant only constrains how many *decks* a given CardId may sit in at
// once (never more than one copy in the same player's deck), not how many
// physical instances exist over the life of the match.
export interface CardDef {
  id: CardId;
  name: string;
  effectText: string;
  creatorId: PlayerId | 'starter';
  createdInRound: number;
  // A destroyed card TYPE can never be designed again (rule: destruction
  // destroys a single token, never the type — but the registry still marks
  // the type as destroyed once any token of it has been destroyed via the
  // keep/steal/destroy resolution, per the plan's rules clarifications).
  destroyed: boolean;
  implemented: boolean;
  // Only set on the 20 seed cards; determines which player's starting deck
  // the card belongs to. Cards designed mid-match are added to decks
  // directly via RoundRecord resolution instead of this field.
  startingOwner?: PlayerId;
  // Atoms-expressible cards (M2+): when present, src/engine/effectsLoader.ts's
  // loadEffects() compiles this into a CardEffect via
  // src/engine/compileComposition.ts INSTEAD of loading a bespoke
  // src/effects/<id>.ts module -- but a bespoke module, if one exists on
  // disk for this id, always wins (see loadEffects' precedence doc comment).
  // A row should never carry both a composition and a same-id module file
  // (tests/structural.test.ts asserts this). Set either by a live design
  // call (server/claude.ts#designCard) or by POST /api/compile-card
  // compiling an already-minted human card after the fact.
  composition?: CardComposition;
}

// A physical token of a CardId, minted fresh each inner game (or on a
// steal/copy resolution). instanceId is unique within the inner game.
export interface CardInstance {
  instanceId: string;
  cardId: CardId;
}

// Per-inner-game zone state for one player. Minted fresh at the start of
// every inner game from that player's MatchState.decks pool.
export interface PlayerState {
  id: PlayerId;
  drawPile: CardInstance[];
  hand: CardInstance[];
  inPlay: CardInstance[];
  discard: CardInstance[];
  skipNextDraw: boolean;
  extraTurns: number;
}

export interface LogEntry {
  turn: number;
  player: PlayerId;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export type InnerGameResult =
  | { outcome: 'win'; winner: PlayerId }
  | { outcome: 'draw' };

export interface InnerGameState {
  seed: number;
  // Serialized mulberry32 state (see src/engine/rng.ts).
  rngState: number;
  activePlayer: PlayerId;
  turnNumber: number;
  turnsTaken: Record<PlayerId, number>;
  players: Record<PlayerId, PlayerState>;
  // Scratch storage for card effects, keyed `${cardId}:${key}`. Namespaced
  // per card and wiped between inner games — this structurally prevents
  // banned cross-game persistence of effect state.
  effectState: Record<string, unknown>;
  log: LogEntry[];
  result: InnerGameResult | null;
  // M5 choice-point persistence (Option B: deterministic single-turn replay,
  // not event-sourcing). Set the instant the active player's play is decided
  // (human tap or AI decision), BEFORE resolvePlay runs -- see src/ui/app.ts's
  // runInnerGameLoop/buildControllers. `instanceId` forces that turn's play on
  // resume via runTurn's existing `playInstanceId` option (null = a forced
  // pass), bypassing the non-deterministic chooseCardToPlay call entirely.
  // `resolvedChoices` is a FIFO ledger of every requestChoice() answer made
  // from that moment through the end of the turn (onPlay AND onTurnEnd
  // hooks alike): src/engine/api.ts's requestChoice replays entries in order
  // (asserting cardId) instead of re-asking, and appends newly-made ones.
  // Cleared the moment the turn completes (mirrors pendingHumanDraft/
  // pendingDecision's per-lifecycle-boundary clearing). Optional so old
  // persisted saves without it still parse.
  pendingTurn?: {
    instanceId: string | null;
    resolvedChoices: Array<{ cardId: CardId; optionId: string }>;
  };
}

// One pick within a 'steal' resolution (see RoundRecord below). `source`
// describes what was targeted, relative to whichever side the OTHER player's
// stuff belongs to:
//   - 'design': the OTHER player's brand-new design minted this round (the
//     winner's design for loserPick; the loser's design for winnerPick).
//     Always resolves 'taken' -- a card's own creator can never be the
//     opposing seat picking it.
//   - 'existing': a card already sitting in the other player's deck before
//     this round.
// `outcome` is 'taken' (the card MOVES into the picker's deck) unless the
// picker originally created the card's type, in which case it is EXECUTED
// ('destroyed': removed from the other player's deck, registry marked
// destroyed, the picker gains nothing) -- denial, not profit.
export interface RoundPick {
  cardId: CardId;
  source: 'design' | 'existing';
  outcome: 'taken' | 'destroyed';
}

// Records one design round's outcome (populated from M3 on). Kept here now
// so MatchState's shape is stable across milestones.
export interface RoundRecord {
  round: number;
  // The card each player designed this round; null if their design was
  // voided by the identical-simultaneous-designs rule and had to be redone.
  designs: Record<PlayerId, CardId | null>;
  winner: PlayerId;
  loser: PlayerId;
  // STEAL RESHAPED 2026-07-02 (v3). The LOSER of the inner game still chooses
  // keep vs steal:
  //   - 'keep': each player adds their OWN new design to their OWN deck.
  //     Nothing crosses decks; both designs survive. loserPick/winnerPick
  //     are both null; destroyed is [].
  //   - 'steal': a strict TWO-PICK sequence.
  //       1. loserPick: the LOSER picks FIRST, from the winner's brand-new
  //          design OR any card already in the winner's deck.
  //       2. winnerPick: the WINNER counter-raids, from the loser's
  //          brand-new design OR any card in the loser's deck EXCLUDING the
  //          card the loser just took in step 1.
  //     In EITHER step, picking 'existing' instead of the design being
  //     offered destroys that spurned design (it never enters any deck) --
  //     see `destroyed`. Both loserPick and winnerPick are non-null whenever
  //     decision === 'steal'.
  decision: 'keep' | 'steal';
  loserPick: RoundPick | null;
  winnerPick: RoundPick | null;
  // Every card id actually destroyed while resolving this round: spurned
  // designs (never entered any deck) plus creator-executions (an existing
  // deck card removed instead of moved). Convenience list so audits (e.g.
  // NEXT_CARDS.md) don't have to re-derive it from loserPick/winnerPick by
  // hand. Always [] under 'keep'; up to 4 entries under 'steal' (the
  // winner's spurned design, the loser's spurned design, and up to one
  // creator-execution per pick) -- per the general principle "any designed
  // card that isn't kept or stolen is explicitly destroyed."
  destroyed: CardId[];
  timestamp: string;
}

export type MatchPhase = 'playing' | 'design' | 'paused' | 'match-over';

export interface MatchState {
  matchId: string;
  createdAt: string;
  // The pool of card ids each player owns between inner games. No-dup
  // invariant: a given CardId appears at most once per player's array.
  decks: Record<PlayerId, CardId[]>;
  innerWins: Record<PlayerId, number>;
  round: number;
  nextFirstPlayer: PlayerId;
  // Seed used to pick the first player of inner game 1 and to derive each
  // inner game's own seed.
  matchSeed: number;
  currentInnerGame: InnerGameState | null;
  roundHistory: RoundRecord[];
  phase: MatchPhase;
  winner: PlayerId | null;
  // Finer-grained resume state WITHIN the 'design' phase (optional so old
  // persisted saves without them still parse). See src/ui/app.ts's design
  // flow: reloading mid-round resumes at the right step instead of restarting.
  //   'designing'      -> the blind-design form is (or should be) showing.
  //   'revealed'       -> both designs minted; the loser's keep/steal
  //                       decision UI is next.
  //   'loser-picking'  -> the loser chose steal; the loser's step-1 pick UI
  //                       (winner's design vs winner's deck) is next.
  //   'winner-picking' -> the loser's pick is locked in; the winner's step-2
  //                       counter-raid pick UI is next.
  //   'resolved'       -> resolveRound has run; the implement job is next.
  //   'implementing'   -> an implement job is in flight (see activeJobId).
  designPhase?:
    | 'designing'
    | 'revealed'
    | 'loser-picking'
    | 'winner-picking'
    | 'resolved'
    | 'implementing';
  pendingDesigns?: Record<PlayerId, CardId | null>;
  // Persisted the INSTANT the human locks in their own design (before
  // Claude's /api/design-card call is even known to have succeeded or
  // failed) -- see src/ui/app.ts's runDesignFlow onSubmit handler. Deliberately
  // NOT folded into pendingDesigns above: pendingDesigns only ever holds
  // MINTED CardIds, set much later (right before the simultaneous reveal,
  // once BOTH sides are minted) -- there is no minted id yet at the moment
  // the human locks in, since minting waits on the identical-simultaneous-
  // designs check, which itself needs Claude's design too. Exists to fix a
  // real bug (2026-07-03): "Retry design call" (after a Claude design-call
  // failure) used to re-render the human's design form from scratch, wiping
  // out their already-locked card. Cleared the moment the human's design is
  // actually minted (folded into pendingDesigns then), and at the
  // round-resolution lifecycle boundary, same as the other pending* fields.
  pendingHumanDraft?: { name: string; effectText: string } | null;
  // Persisted the moment the loser's keep/steal decision is made, and the
  // moment the loser's step-1 pick is made, so a reload mid steal-pick
  // resumes at the right screen instead of re-asking a decision that was
  // already locked in (see src/ui/app.ts#resolveRoundWithDesigns). Both are
  // cleared at the start of every fresh runDesignFlow attempt.
  pendingDecision?: 'keep' | 'steal';
  pendingLoserPick?: RoundPick | null;
  activeJobId?: string | null;
  // Set only on round 1 (the opening design round that now precedes inner
  // game 1 of every match — see POST /api/new-match): who holds the loser's
  // keep/steal choice for that round, since no inner game has been played
  // yet to derive a loser from. Never set/consulted for round >= 2, where
  // the loser is always derived from the just-finished inner game's result.
  openingLoser?: PlayerId;
  openingLoserReason?: 'last-match-loser' | 'recent-game-loser' | 'coin-flip';
  // Loser of the most recently COMPLETED inner game this match, persisted at
  // game end. The design flow and /api/design-card's seat computation prefer
  // this over re-deriving from currentInnerGame.result, which is fragile:
  // a prematurely-started next game overwrites currentInnerGame (seen live
  // 2026-07-03), and the non-blocking implement-job flow makes 'playing'
  // states routine at design-adjacent moments. Absent on old saves ->
  // consumers fall back to currentInnerGame.result.
  lastGameLoser?: PlayerId;
}

// Persisted at data/meta.json (see server/persistence.ts's readMatchMeta/
// writeMatchMeta). Survives across matches -- POST /api/new-match reads the
// PREVIOUS match's outcome to populate this before resetting match-state.json,
// then consults it (this same call) to seed the new match's openingLoser.
export interface MatchMeta {
  lastMatchLoser: PlayerId | null;
  lastGameLoser: PlayerId | null;
  updatedAt: string;
}

// ============================================================================
// /api contracts — server/router.ts implements these; src/net/apiClient.ts
// calls them. Kept here so both sides (and tests) share one source of truth.
// ============================================================================

// Lifecycle of an implement-cards background job (server/jobs.ts,
// server/claude.ts). 'testing' = vitest (test:cards) is running against the
// job's freshly-written effect module(s). 'needs-clarification' = the Agent
// SDK job exited asking a question about an unimplementable human card.
// 'interrupted' = found still 'running'/'queued'/'testing' in jobs.json on
// dev-server boot (the previous process died mid-job).
export type JobStatus =
  | 'queued'
  | 'running'
  | 'testing'
  | 'done'
  | 'failed'
  | 'needs-clarification'
  | 'interrupted';

export interface JobRecord {
  id: string;
  status: JobStatus;
  round: number;
  // The card id(s) this job is implementing (usually one human + one claude
  // card per round, but the contract allows any non-empty set).
  cardIds: CardId[];
  createdAt: string;
  updatedAt: string;
  attempts: number;
  error?: string;
  clarificationQuestion?: string;
}

// --- GET /api/state ---
export type GetStateResponse = MatchState;

// --- PUT /api/state (client PUTs after every checkpoint, debounced) ---
export interface PutStateRequest {
  state: MatchState;
}
export interface PutStateResponse {
  ok: true;
}

// --- GET /api/registry ---
export type GetRegistryResponse = CardDef[];

// --- POST /api/validate-card (mechanical checks, live as human types) ---
export interface ValidateCardRequest {
  name: string;
  effectText: string;
}
export interface ValidateCardResponse {
  ok: boolean;
  violations: string[];
}

// --- POST /api/registry/cards (mint id `r{round}-{creator}-{slug}`) ---
export interface CreateRegistryCardRequest {
  name: string;
  effectText: string;
  creatorId: PlayerId;
  round: number;
}
export interface CreateRegistryCardResponse {
  card: CardDef;
}

// --- POST /api/void-round-designs (identical-simultaneous-designs rule,
// v3): mints whichever of this round's two designs isn't ALREADY a registry
// row and immediately marks BOTH destroyed -- "that effect is extinct
// without ever being played," per the general principle that any designed
// card that isn't kept or stolen is explicitly destroyed. A single atomic,
// registry-locked endpoint rather than the ordinary create-then-destroy
// sequence: minting the human's design normally (via POST
// /api/registry/cards) AFTER Claude's design is already registered would
// have it rejected by the registry's own duplicate-effect gate before it
// ever got a row to destroy -- by definition, both designs here express the
// SAME effect. `{ kind: 'existing' }` is used for whichever side was already
// minted (e.g. Claude's live /api/design-card call); `{ kind: 'raw' }` for
// the side that wasn't (always the human's, from the just-submitted draft;
// occasionally Claude's too, on the human-ghostwrote-Claude's-card path).
export type VoidDesignInput = { kind: 'raw'; name: string; effectText: string } | { kind: 'existing'; cardId: CardId };
export interface VoidRoundDesignsRequest {
  round: number;
  human: VoidDesignInput;
  claude: VoidDesignInput;
}
export interface VoidRoundDesignsResponse {
  human: CardDef;
  claude: CardDef;
}

// --- POST /api/design-card (Messages API; server validates mechanically,
// internal retry <=3 feeding violations back) ---
export interface DesignCardRequest {
  round: number;
  // The human's already-revealed design, when Claude is designing second in
  // a redesign triggered by rule 3 (identical simultaneous designs).
  opponentDesign?: { name: string; effectText: string } | null;
}
export interface DesignCardResponse {
  card: CardDef;
}

// --- POST /api/compile-card (M3): best-effort attempt to express an
// already-minted card (today, only ever called for the HUMAN's card -- the
// live Claude design call already gets its own shot at including a
// composition directly, see server/claude.ts#designCard) as a shared/
// atoms.ts CardComposition after the fact. Called by src/ui/app.ts's design
// flow right after the human's design is minted, before the round's
// implement job is kicked off. On success, the registry row is patched
// (composition + implemented: true) under withRegistryLock and the client
// hot-compiles the same composition into its own effects map for instant
// playability -- the subsequent POST /api/implement-cards call's existing
// "already implemented" short-circuit then makes the fallback job a no-op.
// On failure (inexpressible, or the call itself errored), `ok: false` is not
// an error response -- the card is simply left implemented: false and the
// ordinary bespoke-module job runs exactly as it does today.
export interface CompileCardRequest {
  cardId: CardId;
}
export type CompileCardResponse = { ok: true; card: CardDef } | { ok: false; reason: string };

// --- POST /api/implement-cards -> { jobId } ---
export interface ImplementCardsRequest {
  round: number;
  cardIds: CardId[];
}
// Normal case: a job was enqueued, `jobId` is pollable via GET /api/jobs/:id.
// Short-circuit case (feature: no-duplicate-job guard): every requested
// cardId was ALREADY `implemented: true` (and not destroyed) in the
// registry, so no job was spawned at all -- `jobId` is null and callers
// should treat this exactly like an already-completed job (hot-load the
// cards' effects and move on), never poll.
export type ImplementCardsResponse =
  | { jobId: string; alreadyImplemented?: false }
  | { jobId: null; alreadyImplemented: true };

// --- GET /api/jobs/:id (1s polling) ---
export type GetJobResponse = JobRecord;

// --- POST /api/jobs/:id/retry ---
export interface RetryJobResponse {
  jobId: string;
}

// --- POST /api/resolve-round (keep/steal/destroy, one atomic pair) ---
// `decision` is chosen by the LOSER. loserPick/winnerPick must both be
// non-null iff decision is 'steal', and both null/absent when decision is
// 'keep' (validated server-side).
export interface ResolveRoundRequest {
  round: number;
  designs: Record<PlayerId, CardId | null>;
  winner: PlayerId;
  decision: 'keep' | 'steal';
  loserPick: RoundRecord['loserPick'];
  winnerPick: RoundRecord['winnerPick'];
}
export interface ResolveRoundResponse {
  match: MatchState;
  record: RoundRecord;
}

// --- POST /api/new-match (no request body) ---
// Abandons any in-progress match and starts a fresh one, available any time
// (sticky-header "New match" control) -- not just after match-over. Order of
// server-side effects: (1) derive lastGameLoser/lastMatchLoser from whatever
// match previously existed and persist them to data/meta.json; (2) best-
// effort rename the 20 starter cards via live Claude (never blocks match
// creation on failure); (3) reset match-state.json to a brand-new match
// whose round 1 is the opening design round (phase 'design', designPhase
// 'designing'), with openingLoser/openingLoserReason decided from the
// meta.json values (falling back to a seeded coin flip). Returns the new
// MatchState.
export type NewMatchResponse = MatchState;

// --- POST /api/next-cards (appends the audit-trail entry to NEXT_CARDS.md) ---
export interface NextCardsRequest {
  round: number;
}
export interface NextCardsResponse {
  ok: true;
}

// --- POST /api/judge-duplicate (Claude semantic-duplicate judgment -- a
// cheap single-call check, distinct from the full /api/design-card prompt).
// Used for two rule-driven checks:
//   - rule 3 (identical-simultaneous-designs): after the mechanical
//     normalizeText() match fails, comparing the two just-revealed designs;
//   - rule 5 (human card validation): comparing a human's submitted card
//     against the full registry for a semantic (not just literal) dupe. ---
export interface JudgeDuplicateRequest {
  candidate: { name: string; effectText: string };
  compareAgainst: Array<{ id?: string; name: string; effectText: string }>;
  context: string;
}
export interface JudgeDuplicateResponse {
  isDuplicate: boolean;
  matchedTarget?: string;
  explanation: string;
}

// --- GET /api/card-source/:id (feature: "show the code" / the Codex's
// "view the law" toggle). `id` must match /^[a-z0-9-]+$/ AND already exist
// in the registry -- both server/router.ts#handleGetCardSource requirements
// double as the path-traversal guard, since a card id can never contain '.'
// or '/'. `testSource` is null when no tests/cards/<id>.test.ts exists on
// disk (always true for the 20 starter cards, which predate the implement
// job entirely).
export interface GetCardSourceResponse {
  effectSource: string;
  testSource: string | null;
}
