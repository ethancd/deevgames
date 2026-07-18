# Napkin

## Forge progress viewer (2026-07-02)
- New `src/ui/forgeProgress.ts`: live "watch Claude write the code" overlay for a
  locked card's in-flight implement job. Deliberately has NO polling loop of its
  own -- `openForgeProgress` does one initial `GET /api/jobs/:id`, then every
  subsequent update comes from `updateForgeProgress(job)` called from app.ts's
  EXISTING `pollJobInBackground` loop (one new line, right after `job =
  await api.getJob(jobId)`, before the queued/running/testing branch). Only one
  poll loop per job, ever -- do not add a second interval here even if a future
  change wants faster updates.
- `shared/types.ts#JobRecord` still has no `log` field (matches the earlier
  `server/jobs.ts#JobRecordWithLog` napkin note above) -- widened locally in
  forgeProgress.ts via `interface JobRecordWithLog extends JobRecord { log?:
  string[] }` and a cast, exactly like the server-side precedent. Don't touch
  shared/types.ts for this.
- `src/ui/jobStatus.ts`'s `STATUS_LABEL` was a private const; exported it (only
  change to that file) so forgeProgress.ts's status badge reuses the exact same
  copy instead of a second hardcoded map.
- Entry points: header `.app-header__job-chip` (span promoted to a real
  `<button>`) and hand.ts's locked-card preview (new
  `.hand-preview__forge-watch` button, label toggles "Watch it being forged" /
  "Forging stalled — inspect" based on whether `RenderHandOptions.activeJobId`
  is set) both funnel through `AppController#watchForge()`, which no-ops if
  `match.activeJobId` is null.
- 306/306 tests green before and after (no test files touched, per task
  constraint -- this feature has no test-covered surface).

## Meta rules implementation (2026-07-02)
- A FOURTH rule was added same day: card NAME ≤32 chars. `checkNameLength` in shared/validation.ts
  (mirrors checkEffectLength), wired into validateNewCard on candidate.name; message `Name is N
  characters; the limit is 32.`; server/claude.ts prompt rule 10; src/ui/designRound.ts BOTH name
  inputs maxlength 60→32 + explainer copy. All 20 starter names ≤23 chars, unaffected. 165 tests green.
- The three post-plan meta rules (English-only / no-repeated-subeffect / effect ≤280) are NOW
  actually implemented, contrary to an older ROOT-napkin note that claimed they were already
  "enforced" — they were not in the code. Trust code over napkin. Locations:
  `shared/validation.ts` exports `checkEnglishRule`, `checkEffectLength`, `checkRepeatedSubeffect`
  (+ `splitClauses`/`normalizeClause` helpers), all wired into `validateNewCard` alongside numeral +
  duplicate checks. `server/claude.ts#buildDesignPrompt` rules 7-9. `src/ui/designRound.ts` explainer
  copy + BOTH effect `<textarea maxlength>` 400→280.
- Exact violation strings (must stay verbatim — UI/tests depend on them):
  length `Effect text is N characters; the limit is 280.`; english `card text must be written in
  English`; repeat `a card may not repeat the same subeffect`.
- English check is SCRIPT-level: allowlist regex `\p{Script=Latin}` (NOT `\p{L}`, which admits
  Cyrillic/CJK) + `\p{Mark}` + `0-9` + `\s` + explicit punctuation incl. en/em-dash, curly quotes,
  ellipsis. Run once over `name + ' ' + effectText` in validateNewCard (one message, not per-field).
- Repeat-rule clause splitter deliberately splits on COMMAS too (`/[.;,]+|\b(?:and\s+)?then\b/`), not
  just `.`/`;`/then. Reason: the spec's own required test "When you play this card, draw 1 card, then
  draw 1 card." can't fire under then-only splitting (first "draw 1 card" stays glued to the
  preamble). Only normalized clauses of length ≥10 are counted. Verified Recount + Recursive Refund
  Clause (the two registered cards) still pass all three rules. Tests: tests/validation.test.ts
  (37 tests in that file; 162 total green).

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-07-02 | integration pass (dev-server smoke test) | `src/engine/effectsLoader.ts#loadEffectFresh` built its cache-busted mid-session import URL as a hardcoded root-absolute `/src/effects/<id>.ts?t=...`. Confirmed via live `npm run dev` + curl that this 404s: Vite serves everything under `base:'/lution/'`, so only `/lution/src/effects/<id>.ts` resolves. The `@vite-ignore` directive on the dynamic `import()` means Vite's dev-time import-analysis (which auto-prepends `base` to statically-analyzable root-absolute specifiers, e.g. in index.html) does NOT rewrite this one, since it's a runtime string, not a static specifier. `/api/*` fetches in `src/net/apiClient.ts` are fine as-is (unrelated: those are served by the Vite Connect middleware directly, unprefixed by `base`, confirmed via curl on both `/api/state` and `/lution/api/state`). | Build any root-absolute browser-side asset/module URL from `import.meta.env.BASE_URL` (available via the existing `vite/client` tsconfig types), not a hardcoded leading `/`. Fixed in `loadEffectFresh` by prefixing with `import.meta.env.BASE_URL` (normalized to end with `/`). Verified fix live: `curl http://localhost:3004/lution/src/effects/starter-pocket-nebula.ts?t=1` → 200 after the fix (was 404 before, at the un-prefixed `/src/...` path). Any future root-absolute dynamic-import URL in this codebase should use the same pattern. |

## User Preferences
- Multiple parallel agents share this tree (lution/). Must keep `npm run typecheck` green for the WHOLE project after every session — other agents build on top without reloading.
- Never write outside /Users/ashkie/src/deevgames/lution.

## Patterns That Work
- import.meta.glob works fine in vitest (node env) since vitest shares vite's transform pipeline — used in tests/structural.test.ts to glob src/effects/*.ts directly, deliberately NOT going through src/engine/effectsLoader.ts so the structural test stays green even while effectsLoader.ts is a throw-stub.
- When destructuring `arr.find(...) ?? []` where arr elements are tuples, TS widens the destructured binding badly (union of tuple-type and never[] confuses element typing — "Type X cannot be used as an index type"). Avoid: check `find(...)` result for undefined explicitly instead of `?? []` defaulting on a tuple find.
- `Plugin` type from `vite` typechecks fine even without @types/node installed (skipLibCheck skips checking vite's own .d.ts internals) — server/plugin.ts imports `import type { Plugin } from 'vite'` with zero extra deps.

## Patterns That Don't Work
- (accumulate)

## CORRECTED rule 7 (2026-07-02, designer override — supersedes ALL older rule-7 notes below)
- The LOSER of the inner game chooses KEEP or STEAL (NOT the winner — that was the core bug).
  - KEEP: each player adds their OWN new design to their OWN deck. Nothing crosses decks. There
    is NO "loser gift". `RoundRecord.decision='keep'`, `pick=null`.
  - STEAL: the loser's deck gains the WINNER's new design (brand new, never collides). Then the
    WINNER picks exactly one target — the loser's new design OR any card already in the loser's
    deck (pre-gift). If the winner did NOT create it: MOVE it (remove from loser, add to winner).
    If the winner DID create it: DESTROY it (remove from loser only, mark type `destroyed:true`,
    winner gets nothing — only reachable for `source:'existing'`). `decision='steal'`, pick set.
- New `RoundRecord` shape: `{round, designs, winner, loser, decision:'keep'|'steal',
  pick:{source:'loser-design'|'existing', cardId, outcome:'taken'|'destroyed'}|null, timestamp}`.
  `'winner-design'` source is GONE; `'copied'` outcome renamed to `'taken'` everywhere.
- GLOBAL uniqueness invariant (move-not-copy): every card id in AT MOST ONE deck across BOTH
  decks combined. `resolveRound` enforces it on every path (throws). Replaced the old per-deck
  dup check.
- Decision ownership in `src/ui/app.ts`: `runLoserDecision` (loser picks keep/steal — human via
  `renderLoserDecision`, claude via `chooseKeepOrSteal({pessimistic:true})`), then if steal
  `runWinnerStealPick` (winner picks — human via `renderWinnerStealPick`, claude via
  `chooseWinnerPick({ownDesignValue: -Infinity})` so it's forced to pick). `chooseKeepOrSteal`
  and `chooseWinnerPick` in ai/player.ts were UNCHANGED except the `'copied'`->`'taken'` rename
  in `WinnerPickResult`; `chooseKeepOrSteal` was previously wired up NOWHERE, now called for the
  AI-loser case.
- Idempotency: `POST /resolve-round` 409s (unchanged state, no writes) if
  `roundHistory.some(r=>r.round===body.round)`, inside the same `withRegistryLock` txn. Client
  catches `ApiError` (new, exported from apiClient — carries `status`+`body`) with status 409,
  re-fetches state, re-enters `enterDesign`. `enterDesign` now consults `roundHistory` FIRST
  (ground truth) before findRoundDesign — double protection so an already-made decision never
  re-runs. `MatchState` gained optional `designPhase`/`pendingDesigns`/`activeJobId` for resume.

## UI implementer notes (src/ui/*, src/main.ts, src/net/apiClient.ts, index.html)
- [SUPERSEDED by CORRECTED rule 7 above] Rule 7 keep/steal was originally (wrongly) implemented
  as: THE WINNER chooses keep-vs-steal and the loser unconditionally receives a copy of the
  winner's design. That was the designer-confirmed bug fixed 2026-07-02. Kept here only for
  historical contrast — do NOT trust it as current behavior.
- `MatchState.currentInnerGame` is deliberately NOT cleared when an inner game ends — it's kept
  (with `.result` set) all the way through the design round / job flow, only replaced once the
  NEXT inner game actually starts. This is how the UI recovers "who won the just-finished round"
  after a reload during the 'design' phase (there's no separate persisted field for it).
- `MatchState.round` is incremented exactly once, in the 'playing'->'design' transition (never
  inside enterDesign()), so re-entering the design screen after a reload doesn't double-increment.
- No list-jobs endpoint and no request body on `POST /api/jobs/:id/retry` — resuming a 'paused'
  phase after a hard reload re-derives this round's not-yet-implemented card ids from the registry
  and starts a brand-new implement job rather than trying to recover the original job id. "Manual
  mode" and "Verify & resume" both just call retryJob(); the plan's distinction between them is
  about human intent (fix via Claude retry vs. fix by hand-editing the file), not a different API.
- src/engine/, src/ai/, server/ were ALL still M0 throw-stubs when the UI was built — app.ts wires
  against their exported *signatures* (which are stable/typed) but nothing runs yet. `start()` has
  a single top-level try/catch that renders a "Lution hit a snag" screen with the stack trace, so
  `npm run dev` shows something coherent instead of a blank page until those land.

## Server implementer notes (server/*.ts, tests/server/*.test.ts)
- @types/node was NOT installed anywhere in this tree (no sibling hoisting either) — added it as a
  devDependency (`npm install --save-dev @types/node@^22.16.0`, matching muju/leyline's pinned
  major). Deliberately did NOT add `"node"` to tsconfig.json's `compilerOptions.types` array (which
  currently only lists `"vite/client"`): explicit `import fs from 'node:fs/promises'` etc. resolve
  fine via @types/node's ambient module declarations without it, and adding `"node"` there would
  inject Node's global types (process, Buffer, a different `setTimeout` overload...) into the ONE
  shared tsconfig that also covers src/ (browser code, DOM lib) — real risk of clashing with
  browser-side global typings for an unrelated agent's files. Verified empirically: a scratch file
  using `node:fs/promises` + bare `process.cwd()` typechecked clean project-wide with zero tsconfig
  changes.
- [SUPERSEDED by CORRECTED rule 7 at top of file] The following describes the OLD (buggy)
  winner-chooses / unconditional-winner-design-gift model. Under the corrected rule there is no
  automatic gift on KEEP, and STEAL is move-not-copy. Historical only:
- Confirmed independently (before reading the UI implementer's notes above) that rule 7's "Unpicked
  designs never enter any deck" means the LOSER's own fresh design is only ever added to a deck if
  the winner picks it (`pick.source:'loser-design'` -> copied into the WINNER's deck only, never
  back into the loser's own deck) or destroyed as an existing pick; it is never added to the loser's
  own deck automatically. Symmetrically, the winner's OWN fresh design only enters the winner's deck
  if `pick.source:'winner-design'` (keep); it still ALWAYS enters the loser's deck regardless of
  pick (the one unconditional gift). This is what `server/resolveRound.ts` implements and what its
  test suite (`tests/server/resolveRound.test.ts`) locks in — matches the UI implementer's
  independently-derived note above 1:1.
- `shared/types.ts`'s `JobRecord` has no `log`/`question` field (the plan prose mentions both, but
  the actual wire contract doesn't). Rather than edit shared/types.ts (out of this task's file
  list), `server/jobs.ts` exports `JobRecordWithLog extends JobRecord { log: string[] }` locally —
  `JobManager.get()` returns that; logs are in-memory only (lost on dev-server restart, which is
  fine: an `interrupted` job already only shows a generic recovery message). If a future agent adds
  `log`/`clarificationQuestion`-shaped fields to the real `JobRecord` type, this local extension
  becomes redundant and can be dropped.
- `server/router.ts` routes are matched WITHOUT the `/api` prefix (e.g. `/state`, not `/api/state`)
  because Vite's Connect middleware strips the mount-point prefix from `req.url` before invoking a
  `server.middlewares.use('/api', handler)`-mounted handler. `tests/server/router.test.ts` drives
  the router directly with fake req/res objects using that same (prefix-stripped) convention.
- `JobManager`'s constructor kicks off an async `bootstrap()` (reads + immediately re-persists
  jobs.json) that nothing awaits by default. In tests, always `await jobManager.whenReady()` right
  after construction (or accept the small risk of an unhandled-rejection race if the test's tmp dir
  gets `fs.rm`'d while that write is still in flight — this bit us once during development; fixed
  by awaiting `whenReady()` in `tests/server/router.test.ts`'s `beforeEach`).
- `implementCards` (server/claude.ts) does its own internal auto-retry (<=3 attempts, feeding the
  previous attempt's error back into the next prompt as "prior failure output") and never throws —
  it always resolves to `{status: 'done'|'failed'|'needs-clarification', ...}`, even when
  `ANTHROPIC_API_KEY` is unset. `designCard` is the opposite: it throws (no internal retry loop —
  that 3x retry lives in `router.ts`'s `/api/design-card` handler instead, since each attempt there
  needs fresh mechanical validation against `shared/validation.ts` between attempts, which is
  router-level concern, not claude.ts's).

## Review-fix pass (2026-07-02, round 1 findings)
- `server/persistence.ts`: added `withRegistryLock()` — a SEPARATE lock key
  (`${cardsPath}::txn`) from `atomicWriteJson`'s per-file lock, so a
  read-mutate-write callback that itself calls `writeRegistry` doesn't
  deadlock against its own transaction lock. `server/router.ts`'s
  `handleCreateRegistryCard`, `handleDesignCard` (only the final mint+write
  step, re-reading a FRESH registry inside the lock — the Messages API call
  itself stays outside the lock so slow Claude calls don't stall other
  registry writers), and `handleResolveRound` all now go through this. Fixed
  a real, easily-reproduced lost-update race: the client's `Promise.all` of
  two concurrent `POST /api/registry/cards` calls (human + claude minted
  right after reveal) would silently drop one card about half the time.
  Verified by temporarily short-circuiting `withRegistryLock` to `return
  fn()` — the race reproduced 5/5 runs; restored, it doesn't.
- `server/persistence.ts` also added a WAL-style pair-write for
  `resolve-round`: `writeResolvePending()` (marker) -> `writeRegistry` ->
  `writeMatchState` -> `clearResolvePending()`, plus boot-time
  `recoverPendingResolution()` (replays the marker's contents — both writes
  are idempotent full-document writes, so replay is safe regardless of which
  of the two landed before a crash) wired into `server/plugin.ts`'s
  `configureServer` (now `async`, awaited before mounting the router). This
  makes `data/resolve-pending.json` a transient marker file — should never
  persist across a clean run; if you see it on disk after a normal session,
  something crashed mid-resolve (that's the intended trigger for recovery on
  next boot).
- `src/engine/engine.ts#runTurn`: added a `checkCheckpoint` call right after
  `api.emit('onTurnEnd', {})`, before the extraTurns/activePlayer swap — a
  win caused by an onTurnEnd handler is now detected immediately instead of
  after a whole extra turn.
- `server/claude.ts`: added `judgeSemanticDuplicate()` (small Messages API
  call, `max_tokens: 256`, its own prompt distinct from `buildDesignPrompt`)
  behind a new `POST /api/judge-duplicate` endpoint
  (`shared/types.ts#JudgeDuplicateRequest/Response`,
  `net/apiClient.ts#judgeDuplicate`). Two call sites, both BEST-EFFORT (a
  failed/unset-API-key judgment call is swallowed and treated as "not a
  duplicate" — logged via `console.warn`/`console.error`, never blocks the
  request — so M2/M3-style manual play without `ANTHROPIC_API_KEY` still
  works, and `tests/server/router.test.ts`'s `creatorId: 'human'` registry
  tests don't need a live key):
  1. `src/ui/app.ts#checkIdenticalDesigns` (rule 3): only called when the
     mechanical `normalizeText` comparison does NOT already match.
  2. `server/router.ts#handleCreateRegistryCard`, gated to `creatorId ===
     'human'` (rule 5): only for the human's card, compared against the
     full registry, called AFTER the mechanical `validateNewCard` hard gate
     already passed, inside the same `withRegistryLock` transaction.
- `src/ui/app.ts#runDesignFlow`: was hardcoding `opponentDesign: null` on
  every `/api/design-card` call including the rule-3 redesign path (dead
  wiring — Claude never learned what got voided). Now threads
  `{name: humanDraft.name, effectText: humanDraft.effectText}` through on
  the redesign call. Also fixed a real duplicate-mint bug found while
  rewiring this: the OLD code called `api.designCard(...)` (which
  `handleDesignCard` already mints + writes into the registry server-side on
  success) and THEN called `api.createRegistryCard(...)` a second time for
  the exact same Claude design, creating two registry rows per Claude design
  every round (the second under an auto-suffixed id like `...-2` since
  `mintCardId` collision-avoids on the id, not the name/effect). Fixed:
  `claudeCardDef` now tracks whether `/api/design-card` already minted the
  card; `createRegistryCard` for Claude's design is only called in the
  ghostwrite path (see below), where nothing was minted yet.
- `src/ui/app.ts#runDesignFlow` / new `src/ui/designRound.ts#renderDesignFailure`:
  a failed `POST /api/design-card` (network/API-key error, or
  mechanical-validation exhausted server-side after 3 attempts) used to
  propagate uncaught up to `AppController.start()`'s top-level catch and
  render the generic fatal-error stack-trace screen. Now caught locally;
  `promptDesignFailure()` flips `match.phase` to `'paused'`, persists, and
  renders a dedicated retry/ghostwrite screen. "Retry" re-calls
  `runDesignFlow` with the same `opponentDesign`; "ghostwrite" lets the
  human type Claude's card by hand (mechanically validated the same way
  their own card is via `onValidateGhostwrite` -> `POST /api/validate-card`)
  and re-enters `runDesignFlow` with `presetClaudeDesign` set, which skips
  the live Claude call entirely for that attempt and mints the ghostwritten
  text via `createRegistryCard` with `creatorId: 'claude'` once the round
  isn't voided.
- Did NOT change `shared/validation.ts` itself (the finding's `file` field)
  — the gap it described (rule 3/5 semantic judgment) required new code in
  `server/claude.ts` + `router.ts` + `app.ts` + a new endpoint, not a change
  to the pure mechanical-check module, which is correct as-is.
- All fixes verified with temporary throwaway vitest files (deleted after
  confirming): one proved the registry race is real (and fixed) by toggling
  `withRegistryLock` on/off, another proved `recoverPendingResolution`
  actually replays a simulated mid-transaction crash. Neither was committed
  as a permanent test — consider adding a permanent concurrency regression
  test for `withRegistryLock` if a future pass has budget for it.

## Domain Notes
- Integration pass (2026-07-02): reconciled engine+ai/server/ui implementer work. `npm run typecheck` and `npx vitest run` were already green (130/130, 17 files) when this pass started — the UI implementer's reported "2 failures in resolveRound.test.ts" had already self-resolved by the time all three implementers' code landed together. Only one real bug found: the `loadEffectFresh` base-path issue documented in Corrections above (fixed). Live-smoke-tested `npm run dev`: `GET /lution/` (200, HTML correctly base-rewritten), `GET /api/state` (200, `null` — no match in progress), `GET /api/registry` (200, 20 starter cards), `POST /api/validate-card` with digit+word numeral violations (correctly flagged both), and confirmed the effects hot-load URL now matches what the dev server actually serves under `base:'/lution/'`. Did NOT call `/api/design-card` or `/api/implement-cards` (real Anthropic API calls, out of scope for this pass per orchestrator instruction). M0-M4 file layout, endpoints, and tests all present and consistent with the plan.
- THE SPEC is /Users/ashkie/.claude/plans/can-you-plan-out-splendid-avalanche.md. Its "Rules clarifications" (numbered 1-8) OVERRIDE the base game description on conflict.
- Known-answer test claim in the plan ("first player always wins on their 6th play") is WRONG per orchestrator correction. Real invariant: greedy first player crosses 10 on 6th OR 7th play; winner is seed-dependent. Canary test = fixed-seed golden test (exact winner/turn-count/scores) + bound tests (game ends, winning score >= 10, total turns <= 15).
- Port 3004, base '/lution/', strict TS, vanilla DOM (no React) per plan — differs from muju (React) and leyline conventions.
- Status as of the M1 engine pass: src/engine/{rng,hooks,api,engine,match,effectsLoader}.ts and src/ai/{player,defaults}.ts are now FULLY implemented (previously M0 throw-stubs — the "scaffolding-only" line that used to be here described an earlier agent's task, not the current state). `tests/helpers.ts#createTestGame` is implemented too. engine/types.ts (the contract) was NOT modified — only additive fields were added to `CreateInnerGameParams` (engine.ts) for test ergonomics (`hands`, `shuffleDecks`).

## Engine implementer notes (src/engine/*, src/ai/*, tests/helpers.ts, tests/engine|ai/*.test.ts)
- api.ts is deliberately self-contained (only shared/types + engine/types + engine/hooks + engine/rng) and does NOT import engine.ts, to avoid a runtime import cycle (engine.ts imports createEngineApi from api.ts). A small `baseScore()` helper is duplicated in both api.ts (for building the ChoiceResponder's AIGameView) and engine.ts (exported as `computeBaseScore`, used for AIGameView.score in makeGameView) rather than shared — intentional, keeps the layering one-directional.
- `onLeavePlay` and `onPlay` MUST fire while the card instance is STILL PHYSICALLY in its source zone (inPlay / hand respectively) — the hook dispatcher's scope filter checks current zone membership by reference. Firing after splicing the card out silently produces zero candidates (learned the hard way: initial moveToDiscard/destroyKeeper/changeController implementations spliced first, fired onLeavePlay second, and the hook never ran — fixed by firing the hook first, then re-finding the index and splicing).
- HookSpec's default `scope: 'inPlay'` does NOT fit `onDiscard` (the card is in the discard pile by the time onDiscard fires, not inPlay) — an onDiscard handler almost always needs `scope: 'always'` explicitly, matching what `_template.ts` already showed. This is intentional per the type contract, not a bug — but easy to forget when writing a new effect module.
- AIGameView.score is SYNCHRONOUS and deliberately approximate (`computeBaseScore`: sum of inPlay baseValues, no modifyScore folding) — it is NOT the same number as `EngineAPI.score()` (async, hook-folded, authoritative). AI heuristics and requestChoice views use the sync approximation; only checkCheckpoint uses the real async score.
- `PlayerController.choiceResponder` and `CreateInnerGameParams.choiceResponders` are the same responders — whoever builds an InnerGameRuntime is responsible for wiring `controllers[x].choiceResponder` into `createInnerGame`'s `choiceResponders` param (see match.ts#playOneInnerGame and tests/helpers.ts#createTestGame for the pattern). There's no implicit wiring between them.
- The initial "hand of 3" deal (createInnerGame) is intentionally synchronous and hook-free (no onDraw fires) because createInnerGame's signature is synchronous but hook dispatch is always async — `onInnerGameStart`/`onInnerGameEnd` fire from `runInnerGame` (which IS async) instead, once each, bracketing the turn loop.
- One draw per turn (on top of the initial hand-of-3) was inferred, not stated explicitly in the plan — confirmed against the corrected known-answer invariant: with `hand=3, drawPerTurn=1`, a player has seen exactly `3 + (N-1)` deck cards immediately before their Nth play, which reproduces "9 of 10 seen by the 6th play" exactly.
- Golden canary seed: `matchSeed=5` on the real starter decks (via `createMatchState`+`playOneInnerGame`, controllers built with `createRng(seed+1000)`/`createRng(seed+2000)`) reaches `{outcome:'win', winner:'claude'}` at global turn 13, claude's 7th play, human=9/claude=11 — this is the documented 7th-play branch of the corrected invariant, not the more common 6th-play case. If match.ts's outer-loop RNG consumption order ever changes (currently: 1 step to pick game-1's first player in createMatchState, then 1 more step per playOneInnerGame call to derive that game's inner seed), this exact golden tuple will need to be regenerated — the bound tests (tests/engine/match.test.ts) will still hold either way.
