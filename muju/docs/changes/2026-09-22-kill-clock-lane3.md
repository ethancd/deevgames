# Kill clock — Lane 3 report (server, MCP, agent guides, online client, Academy notice)

Branch `claude/muju-kill-clock`, seed commit `62a5703f` ("Muju kill clock seed: resolver with
mined-total verdict, checkmate gate, spec and DAG plan"), worktree
`/Users/ashkie/src/deevgames-killclock`. Scope per the coordinator's brief: `muju/server/**`,
`muju/tests/server/**`, `muju/public/skills/**` (`muju-hono-irumbu`, the `muju-hono-tanka` compat
copy, `muju-time-awareness`), `muju/src/online/**`, `muju/tests/hooks/online-*`,
`muju/e2e/online.spec.ts`, `muju/ONLINE.md`, `muju/docs/MCP_TOOL_TAPS.md`,
`muju/docs/ANALYSIS_TOOLS.md`, `muju/academy/**`. **Uncommitted at the time of writing; the
coordinator commits.** Lane 1 (`src/game/**`, `src/components/**`, `src/utils/**`, `src/hooks/**`,
most of `tests/game/**`/`e2e/**`, `SPEC.md`, `JUDGMENT_LOG.md`) and lane 2 (`src/ai/hard/**`,
`tests/ai/hard/**`, `tests/lab/**`, `lab/**`, `docs/hard-ai/**`) were running concurrently in this
same worktree; I did not touch any file in their lists (verified against `git status --short` —
see "Validation" below).

## The change

Rules revision `muju-phasing-2` → `muju-phasing-3` (owner decision, 2026-09-22,
`docs/changes/2026-09-22-kill-clock-SPEC.md`): the twenty-ply inactivity draw is retired. Ten
kill-free player turns end the game immediately at `END_PLACE_PHASE` of the tenth, decided on
**mined totals** (every crystal a side's units have taken from the board over the whole game,
plus Black's starting handicap, never reduced by spending/upkeep/release/refund) rather than
always drawing; equal totals still draw. A unit on the enemy home when the clock ends does not
win by occupation, and no home-checkmate is awarded when the defender's reply would be the tenth
ply (the `c ≥ 9` gate). The canonical resolver, gate and constants (`INACTIVITY_LIMIT = 10`,
`INACTIVITY_WARNING = 7`, `minedTotal`, `killClockCountAfterTurn`, `killClockForbidsCheckmate`,
`resolveKillClock`) were already seeded in `src/game/inactivity.ts` and `src/game/homeCheckmate.ts`
before this lane started; I only imported them.

# Node-by-node dispositions

## server-runtime — **CHANGED**

- `server/rooms.ts`: `PHASING_RULES_VERSION` `'muju-phasing-2'` → `'muju-phasing-3'`, with the
  header comment rewritten to explain the bump and add `muju-phasing-2` to the set of retired
  revisions a stored room can carry (joining `muju-online-2..6` and `muju-phasing-1`). This
  repeats the exact precedent of `docs/changes/2026-09-19-draw-clock-20.md` node 12
  (`muju-phasing-1` → `muju-phasing-2`): every room stored under the retired `muju-phasing-2`
  (the twenty-ply draw clock) now takes the existing `RULES_CHANGED` path on every read and
  mutation — the row is never migrated in place or rewritten, only refused. No new archive
  mechanism was invented; `read()`'s hard allow-list already does this for every prior retired
  version.
- Result events and room history: unchanged code, verified sufficient. `state.victoryReason`
  (typed `VictoryReason`, already carrying `'kill-clock'` from the lane-1 seed) flows straight
  into `RoomSnapshot.history[].result.reason` and into the SQLite-backed archived-room listing
  (`json_extract(data, '$.state.victoryReason')`) with no server-side literal to update — a
  kill-clock result already carries `reason: 'kill-clock'` with the winner, or `winner: null` on
  a tie, the moment the engine produces it.
- `server/agentSchema.ts` / `server/schema.ts`: **verified unchanged, on purpose.** Neither file
  declares a zod enum over `VictoryReason` — it is consumed purely as the imported TypeScript
  union from `src/game/types.ts` (already extended with `'kill-clock'` in the seed commit; grep
  confirms no `z.enum([...'elimination'...])`-shaped literal anywhere in `server/`). There is
  nothing for this node to add.

## mcp-tools — **CHANGED**

- `server/observation.ts`: added `killClock: { plies, limit, warningAt, minedTotals: { white,
  black }, leader: 'white' | 'black' | null }` to `observe()`'s return shape, computed from
  `minedTotal()`. **Decision (recorded per the SPEC's "implementer records the choice"):** kept
  `quietTurns`/`drawAtQuietTurns` for one release as deprecated aliases of the *same* counter and
  limit (comment says so explicitly), rather than bumping the observation protocol number — the
  SPEC offered both options and this matches the identical choice already made for the
  2026-09-19 draw-clock-20 change (same two field names, same non-bump). The `victory` and
  `checkmate` sentences in `rules` are now built from the canonical constants and state the kill
  definition, the ten-ply/five-hand-off cadence, the mined-total verdict (handicap included, tie
  draws), the killer's-turn-resets-to-zero rule, the no-win-by-occupation rule, and the `c ≥ 9`
  no-checkmate gate.
- `server/analysis/index.ts`: the headline `sections.draw` `[quietPlayerTurns, limit]` tuple is
  kept for one release (same deprecation policy) and joined by a new `sections.killClock` object
  with the same shape as the observation's. The `checkmate()` topic handler **was re-implementing
  `resolveHomeCheckmate`'s award instead of delegating to it** (it calls
  `analyzeHomeDefenseEvidence` — the evidence-returning sibling of the `analyzeHomeDefense` that
  `resolveHomeCheckmate` calls — and re-derives every one of `resolveHomeCheckmate`'s guards by
  hand: elimination-only, earlier-opponent-occupation priority, Phasing place-phase/no-upkeep).
  It was missing the `killClockForbidsCheckmate` gate entirely, so I added the identical check
  (`server/analysis/index.ts`, right after the existing `isPhasing` guard, mirroring
  `resolveHomeCheckmate`'s own ordering) — the `checkmate` topic now returns `result:
  'not_applicable'` with a reason naming the kill clock whenever `c ≥ 9`, instead of running the
  bounded prover and potentially reporting a mate the engine itself will never award.
- `server/mcp.ts`: **verified unchanged.** `muju_rules`'s description and the server
  `instructions` string carry no numeric clock literal (both grep-clean); all rules text flows
  through `observation.ts`'s `rules` object, which I updated above.

## agent-guides — **CHANGED**

- `public/skills/muju-hono-irumbu/SKILL.md` and the `muju-hono-tanka` compat copy (kept in sync
  byte-for-byte apart from the redirect banner, as before): the "Take a turn" clock paragraph,
  the checkmate paragraph (now states the `c ≥ 9` gate), the `shortfallIn`/"Draw pairs" line in
  "Read a turn in one call" (now "game termination (including the kill clock)" and documents
  `killClock`'s fields alongside the deprecated `draw` alias).
- `docs/MCP_TOOL_TAPS.md`: the `quietTurns`/`drawAtQuietTurns` TAP became a `killClock.plies`/
  `killClock.limit`/`killClock.leader` TAP (check the leader, not just the countdown, before
  deciding whether to spend the turn on a kill); the "Planning a home invasion" TAP now names the
  `c = 8`/`c = 9` boundary and that `checkmate` reports `not_applicable` past it; "Counting the
  draw clock" was renamed "Counting the kill clock" and states the mined-total verdict.
- `docs/ANALYSIS_TOOLS.md`: layer-0 table row, the `shortfallIn` paragraph (now
  `terminal:kill-clock` at ten plies, not `terminal:inactivity` at twenty), and the Checkmate
  guarantee/limit row (now names the `c ≥ 9` gate).
- `ONLINE.md`: the clock-rules paragraph (ten kill-free plies, mined-total verdict, `killClock`
  fields, warns from 7) and the `PHASING_RULES_VERSION`/rules-version section (now
  `muju-phasing-3`; `muju-phasing-2` added to the named retired list alongside the others).
- `public/skills/muju-time-awareness/**`: **verified unchanged** — grepped for every
  quiet/draw/inactivity/kill-clock spelling; zero hits, same disposition as 2026-09-19 node 14.
- `server/skills.ts`: **verified unchanged** — grep-clean of the same terms.

## Online client (`src/online/**`) — **CHANGED**

- `src/online/OnlineLobby.tsx`: the lobby help line ("Draw after `{INACTIVITY_LIMIT}` consecutive
  turns without a kill.") became "`{INACTIVITY_LIMIT}` kill-free turns end the game on the higher
  mined total." — still interpolates the canonical constant, never a copied number.
- `src/online/ArchivedGames.tsx`: the result label showed a bare `'Draw'` for `winner === null`
  with no reason, even though the winner branch right next to it already shows
  `reason.replaceAll('-', ' ')`. Since a kill-clock tie is a real, distinguishable result (vs. an
  abandoned/no-result room), I extended the same branch to show `Draw · kill clock` (or any other
  future draw reason) when `room.reason` is present, and bare `'Draw'` only when it truly is not.
- `src/online/RoomHistory.tsx`, `RoomClocks.tsx`, `useOnlineGame.ts`, `client.ts`, `types.ts`,
  `staging.ts`, `timeControl.ts`, `invitations.ts`, `incomingPlayback.ts`: **verified unchanged**
  — grepped for `quietTurns`/`drawAtQuietTurns`/`inactivity`/`draw`/`victoryReason`/`winner`;
  `types.ts`'s `VictoryReason` re-export and the generic `result?: { winner, reason }` shape on
  `RoomSnapshot.history` already cover `'kill-clock'` with no edit needed (it is a plain
  TypeScript union, not a literal list). `VictoryScreen.tsx`/`GameScreen.tsx` (which do render
  "Draw by inactivity" text and are asserted on in `e2e/analysis.spec.ts`) are lane 1's
  `src/components/**` — out of my lane and not touched.

## Academy — **CHANGED (notice) + BLOCKED (media, as before) — prepared, not deployed**

### academy-data — **CHANGED**

`academy/export-rules.ts`'s draw assertion (`inactivityPlies: INACTIVITY_LIMIT - 1` →
`victoryReason === 'inactivity'`, `winner === null`) became a kill-clock/mined-total assertion:
two cases through the real `endTurn()` transition on an emptied board (so no mining income
perturbs the injected totals) — a mined-total **win** (white 6 + 0 handicap vs. black 2 + 1
handicap = 5, white wins) and a **tie** (4 vs. 4, `winner: null`) — both asserting
`victoryReason === 'kill-clock'`. Ran `cd muju && node --import tsx academy/export-rules.ts` —
passed: "324 ordered matchups and revised movement, Cleave, promotion and kill-clock
demonstrations passed." `git status --short academy/` shows exactly `export-rules.ts` and
`rules-verification.json` changed; `catalog.json`, `map.json` and `bonk-matrix.json` came back
byte-identical (`git diff --stat` empty), independently confirming no catalogue drift. Exactly
one `demonstrations[]` line was regenerated:

```
- "R09: positive mining income on the 20th quiet turn still draws (R09 narration still says 10).",
+ "R09: the 10th kill-free ply ends the game on mined totals — the higher wins, counting Black's handicap; equal totals draw (R09 narration still says ten, always a draw).",
```

`rules-verification.json`'s top-level `"rules": "v2.9"` field **stays unchanged** — same decision
as the 2026-09-22 rename lane: it tracks the stat/catalogue revision, not the clock, and nothing
reads it for a clock check (`build-release.py`/`verify-live.py` take rules per-episode from
`release.json`). `rules-snapshot/` and every `production/R??/source-rules/`/`src/*.json` copy were
**deliberately left untouched** (`git status --short academy/production academy/rules-snapshot`
empty) — established provenance doctrine: they record what each lesson was actually rendered
against, refreshed only by the `export-rules.ts` step of whichever release re-records a lesson.

### academy-lessons / academy-audio / academy-video — **deferred: notice only, no media**

No `episode.json`, renderer source, render script or audio/video file was touched — same owner
doctrine as 2026-09-19 and the 2026-09-22 rename ("notice, not a re-voice"). Named affected
lessons, matching the precedent's method:

- **R09 "The Ten Quiet Turns"** — already known-stale for the number (twenty vs. ten, from the
  2026-09-19 change); now *additionally* stale for the verdict: the script says "the game is a
  draw" where the live rule instead decides on mined totals except at an exact tie. The lesson's
  underlying teaching (a quiet turn has no attack kill; collecting crystals does not itself reset
  the clock) is still correct.
- **R10 "One Turn at the Practice Table"** — **verified unchanged**, same finding as 2026-09-19:
  its capstone refers to the "quiet count" as a value but never states a number or a verdict.

The course-page notice in `academy/build-release.py` gained a **fourth** paragraph
(`id="kill-clock-notice"`), after the existing base paragraph, the 2026-09-19 `phasing-notice`
and the 2026-09-22 `rename-notice`, naming R09 (the draw lesson) and R10 and stating the ten-ply/
mined-total correction. `academy/verify-live.py` gained six matching assertions (notice count,
"retired", "not twenty", the mined-total/handicap phrase, the R09/R10 sentence, and that "only an
attack that removes a piece" now appears twice — once per notice). `python3 -m py_compile
academy/build-release.py academy/verify-live.py` — OK.

### academy-package — **prepared, not deployed**

`build-release.py`'s own `--check-only` packaging run needs `production/R??/output/` (rendered
videos), absent in this worktree — same block as every prior lane. Instead, repeating the
2026-09-19/2026-09-22-rename precedent's method exactly:

1. Extracted the current 4-paragraph `notice` string verbatim from `build-release.py` via Python
   `ast` (no manual retyping) — `2697` chars, `4` `<p class="tip"` paragraphs.
2. Took the same clean, never-modified published-release checkout at
   `/private/tmp/muju-academy-v8-deploy` (still the actual live page — its `index.html` sha256 is
   `8c5169ca...25d7`, byte-identical to what the rename lane recorded on 2026-09-22, confirming
   neither prior notice nor this one has been deployed) and, in a **separate preview directory**
   (`<scratchpad>/killclock-preview/`, never the checkout itself), replaced its single live
   pre-phasing-notice paragraph + the following `<nav class="links">` line with the extracted
   4-paragraph notice.
3. Confirmed reversibility: substituting the original single paragraph back reproduces the
   checkout's `index.html` byte-for-byte (sha256 matches in both directions).
4. Ran the 20 applicable page-content assertions from the updated `verify-live.py` (everything
   not requiring live media/`release.json`) against the prepared page in a standalone Python
   check mirroring each `assert` — **20/20 passed**, including the pre-existing phasing-notice and
   rename-notice assertions plus all 6 new kill-clock-notice ones, and confirming the 16 lesson
   videos/articles are untouched.
5. **Not done this time (gap, stated plainly):** no Playwright render/screenshot pass at desktop
   and phone widths. The 2026-09-19/rename lanes did this and I did not, for time; the earlier
   lane's screenshots already established that this exact page shape (stacked `.tip` notices with
   diacritics) renders without overflow at 1280px and 390–664px, and my new paragraph uses the
   same markup/class and no new characters outside ASCII plus the already-verified `→`, `–`, `'`
   marks, so the risk is low but **unverified visually** — the coordinator should run the same
   Playwright check (from `muju/node_modules`) before calling this notice visually confirmed.
6. Evidence saved to `<scratchpad>/killclock-preview/{notice.html, original-index.html,
   index.html}` (scratchpad, not committed; the sha256/assertion transcript is in this report).

The shared `/private/tmp/muju-academy-v8-deploy` checkout was **not modified**, only read. No
website file changed, no deployment occurred, no full media package was built or claimed.

### Documentation (README/STATUS/BIBLE) — **CHANGED, dated addenda only**

Added a new dated override block to `academy/README.md`, `academy/STATUS.md` (a full section,
mirroring the existing 2026-09-19 draw-clock and 2026-09-21/2026-09-22 rename sections'
structure: what changed, what's prepared-not-deployed, and the R09/R10 re-narration note) and
`academy/BIBLE.md`, in each file's own established style, placed **above** the existing
2026-09-22 rename block (kill clock landed later the same day). No existing dated text was
rewritten — the 2026-09-19 draw-clock section in `STATUS.md` (lines "Affected lessons —
quiet-turn draw is twenty plies") stays exactly as written; it is now historical background that
the new section supersedes by reference, same as the rename lane's treatment of it.

## Tests

Run from `muju/`:

- `npm run server:types` — clean, twice (before and after the academy edits).
- `npx vitest run tests/server tests/hooks/online-inspection.test.tsx` — **23 files / 212 tests
  passed** (run twice, identical result).
- `npx vitest run tests/hooks/online-approach.test.ts` (not in the required command, run anyway
  since it exercises `src/online/**`) — 1 file / 4 tests passed.
- `npm run test:online:e2e` — this is the CI-run config and, per its own comment, runs **19** spec
  files, not just `online.spec.ts` (`ai-worker`, `phasing-ai`, `ai-timer`, `action-budget`,
  `analysis`, `crystal-handicap`, `history`, `home-checkmate`, `lobby`, `painter`, `replay`,
  `upkeep`, `room-lifecycle`, `sounds`, `phone-playback`, `phasing`, `pass-play`, `player-side`,
  in addition to `online.spec.ts`). The full run showed 34 passed / 50 failed. **Every failing
  spec file belongs to lane 1 or lane 2** (`git status --short` confirms both lanes have
  uncommitted edits in `src/game/**`, `src/components/**`, `src/ai/hard/**`,
  `tests/ai/hard/**`, `tests/game/**` etc. at this moment) — one failing title,
  `e2e/action-budget.spec.ts:4:1 "...advance the kill-only clock and draw at twenty"`, visibly
  mixes new ("kill-only clock") and old ("draw at twenty") wording, which is lane 1 mid-edit, not
  a real regression. I isolated my own file: `npx playwright test --config
  playwright.online.config.ts e2e/online.spec.ts` — **5/5 passed** on a clean `test-results/`
  (one test failed on the first combined run with an `ENOENT` trace-artifact copy error from
  filesystem contention with the concurrent full-suite run moments earlier; re-run alone, clean,
  it passed). I did not touch, and am not blocked by, any other lane's e2e spec.
- `node --import tsx academy/export-rules.ts` — passed (output quoted above).
- `python3 -m py_compile academy/build-release.py academy/verify-live.py` — OK.
- Standalone 20-assertion page-content check against the preview `index.html` — 20/20 passed
  (method and evidence above).

New/changed test files (all `tests/server/**`, all mine):

- **New** `tests/server/kill-clock-statements.test.ts` (11 tests, all passing) replaces the
  retired `tests/server/draw-clock-statements.test.ts` (deleted via `git rm`, not edited in
  place, since it documents a superseded 2026-09-19 decision it would otherwise misdate): pins
  `INACTIVITY_LIMIT === 10`/`INACTIVITY_WARNING === 7`; asserts `muju_rules`' `ruleset.revision`
  is `muju-phasing-3` and its `victory`/`checkmate` text states the ten-ply/mined-total/kill-
  definition/`c ≥ 9` language with no retired ten-ply-draw or twenty-ply-draw phrasing anywhere
  in `rules`; asserts `observe()` reports `killClock` (`plies`/`limit`/`warningAt`/`minedTotals`/
  `leader`, including a `leader: null` case on an exact tie) alongside the still-correct
  deprecated `quietTurns`/`drawAtQuietTurns` aliases; and asserts both public skills, `ONLINE.md`,
  both TAP docs and `OnlineLobby.tsx` state the new numbers/verdict with no retired phrasing.
- `tests/server/analysis.test.ts`: fixed two tests that the lane-1 seed commit had already broken
  (`INACTIVITY_LIMIT` pinned to `20`; `economyForecast` expecting `terminal:inactivity`) to the
  live `10`/`terminal:kill-clock`; the draw-headline test now also asserts the new `sections.
  killClock` object (mined totals from injected `resourcesGained`, correct `leader`) alongside
  the kept `sections.draw` alias. **New test**: "gates the checkmate topic at c >= 9 kill-free
  plies, matching canonical resolveHomeCheckmate" — an unrescuable home occupation (invader alone
  against an empty defending side, so the prover would otherwise call it `mate` at zero search
  nodes) at `inactivityPlies = 7` (`c = 8`) still returns `proven_possible`, and at
  `inactivityPlies = 8` (`c = 9`) returns `not_applicable` with a reason naming the kill clock —
  this is the analysis-path mirror of the SPEC's validation-gate (d).
- `tests/server/phasing-analysis.test.ts`: one `terminal:inactivity` → `terminal:kill-clock` fix
  (same pre-existing breakage from the seed commit).
- `tests/server/mcp.test.ts`: `muju_rules`'s pinned `ruleset.revision` `'muju-phasing-2'` →
  `'muju-phasing-3'`.
- `tests/server/rooms.test.ts`: the twenty-ply draw walkthrough became a ten-ply kill-clock
  walkthrough asserting `victoryReason === 'kill-clock'` and that `winner` matches the actual
  mined totals (via the canonical `minedTotal()` helper, not a re-derived formula); the "can
  finish a complete two-agent match" test's terminal assertion `'inactivity'` → `'kill-clock'`;
  `PHASING_RULES_VERSION` pin → `'muju-phasing-3'`; the retired-rooms `it.each` gained
  `'muju-phasing-2'` alongside `'muju-online-4'`/`'muju-phasing-1'`.
- `tests/server/standard-retirement.test.ts`: `RETIRED_VERSIONS` gained `'muju-phasing-2'`; two
  test titles ("creates only muju-phasing-3 rooms...", "keeps a muju-phasing-3 room...") and the
  file's header doc comment updated to match.
- `tests/server/clock-pressure.test.ts`: relabeled the `it.each(['resign','timeout','draw'])`
  terminal-turn-exclusion test's `'draw'` case to `'kill-clock'` for accuracy (the assertions
  themselves were already written generically against `INACTIVITY_LIMIT` and needed no numeric
  change).

## Decisions taken

1. **`quietTurns`/`drawAtQuietTurns` kept as deprecated aliases for one release, protocol number
   not bumped** — both in `server/observation.ts`'s `observe()` and in
   `server/analysis/index.ts`'s headline `sections.draw`, each paired with a new `killClock`
   object of the same shape. This was an explicit either/or in the SPEC ("implementer records the
   choice") and matches the identical choice made for the 2026-09-19 draw-clock-20 change to the
   same two field names.
2. **`PHASING_RULES_VERSION` in `server/rooms.ts` moves `muju-phasing-2` → `muju-phasing-3`,
   retiring every room still open under the twenty-ply draw clock at cutover** (they take the
   existing `RULES_CHANGED` path, never migrated or reinterpreted) — this was not explicitly
   itemized in SPEC §4's surface list, but it is the same server-runtime action the identical
   prior rules-revision bump took (2026-09-19, node 12), it is squarely in `server/rooms.ts`
   (mine), and leaving the online host serving new games under a rules string that no longer
   matches what the engine actually plays would be a worse outcome than repeating the precedent.
3. **The analysis `checkmate()` topic re-implements `resolveHomeCheckmate`'s guards rather than
   delegating to it** (confirmed by reading both) **— so the `c ≥ 9` gate was added as a matching
   guard in `server/analysis/index.ts`, in the same relative position** (right after the
   `isPhasing`/place-phase guard), rather than refactoring `checkmate()` to call
   `resolveHomeCheckmate` directly — that refactor would change what evidence/search-stats the
   topic returns on a real mate, which is out of scope for a rules-correctness fix.
4. **`academy/rules-verification.json`'s `"rules": "v2.9"` field stays unchanged**, repeating the
   2026-09-22 rename lane's identical decision: it tracks the stat/catalogue revision, and nothing
   in the release pipeline reads it for a clock check.
5. **`tests/server/draw-clock-statements.test.ts` was deleted and replaced by a new
   `kill-clock-statements.test.ts`**, rather than rewritten in place, because its own header
   comment dates and attributes a specific superseded owner decision (2026-09-19); editing it in
   place to describe the 2026-09-22 decision would misdate that record the same way rewriting a
   historical doc would.
6. **No Playwright screenshot pass on the academy notice preview** (documented as a gap above,
   not silently skipped) — a text-only substitution + assertion check was performed instead, for
   time; the coordinator should run the visual check before treating the notice as fully verified.

## Coordinator deploy steps for the Academy notice (once this lane is merged and committed)

Same procedure as the 2026-09-19 and 2026-09-22-rename precedents (`academy/README.md`'s stated
release policy: "Only verified final videos, posters, transcripts, and the course page are
deployed. Production logs and exports stay local.") — this ships as a course-page-only patch:

1. Start from a fresh, verified `ethancd/ashkie-pages` checkout and re-read its AGENTS.md/napkin
   instructions (do not reuse a stale `/private/tmp` checkout without re-verifying it against the
   live site first).
2. Splice the updated `academy/build-release.py` notice text (now four paragraphs: the base
   recordings note, `id="phasing-notice"`, `id="rename-notice"`, and the new
   `id="kill-clock-notice"`) into that checkout's `muju-academy/index.html` **via AST extraction
   of the `notice` variable, substituted for the currently-live notice block** — the exact method
   this report's preview performed against `/private/tmp/muju-academy-v8-deploy` (see
   academy-package above); do not hand-retype the HTML.
3. Copy the updated `academy/verify-live.py` to the website's `tools/verify_muju_videos.py`.
4. Add a website patch note for this change (matching the shape of the rename lane's
   `ashkie-pages/patch-notes.json` entry — a new dated entry, not merged into an unrelated
   same-day entry), naming the kill clock change in kid-facing language.
5. Regenerate and check the offline manifest under that repository's own procedure, then run
   `./check`.
6. Publish only under the existing authorization policy — **this task explicitly forbids
   deploying**; the coordinator decides when/whether to publish.
7. Before marking the notice live, run the full live `verify_muju_videos.py` against the deployed
   URL and **do the Playwright visual check this lane skipped** (desktop ~1280px and phone
   ~390px, confirming the four stacked `.tip` notices don't overflow and the mined-total/em-dash
   text renders correctly) — the closing step both prior precedents specify, and the one concrete
   gap this lane is handing off.

No step above was executed against the live site or the shared `ashkie-pages` checkout by this
lane; everything above is a plan for the coordinator, not a claim of completion. I did not create
or touch any `ashkie-pages` worktree in this lane (unlike the rename lane, which needed a title
change there) — the game's site-visible title (`Muju Hono Irumbu`) and the ashkie-pages homepage
copy are unaffected by the kill clock; this notice is entirely inside `muju-academy/index.html`.
