# Kill-clock lane 5: Hard-AI declines the fourth-action capture

Worktree: `/Users/ashkie/src/deevgames-kc-bisect` (branch `claude/muju-kill-clock`,
checked out at `b493ff08`). No commits made; this record and the evidence below
are the deliverable.

## The regression

`muju/e2e/ai-worker.spec.ts:89` ("Hard worker spends its fourth action on a
capture before handing the turn back") fails deterministically at `b493ff08`:
Black's Hard worker leaves White's exposed Hi (at `{x:6,y:9}`, two squares from
Black's own Hi, deep in Black's spawn rectangles) alive and hands the turn back
having spent its actions elsewhere. It passed on master before the kill clock
(`271056b5`).

```
cd muju && npm run build && npx playwright test -c playwright.online.config.ts \
  e2e/ai-worker.spec.ts -g "fourth action"
```

fails with `whiteHiAlive: true` (expected `false`) at `b493ff08`, confirmed
reproducible.

## Bisect log

1. **Full revert to the seed (`62a5703f`)** — `git checkout 62a5703f --
   muju/src`, rebuild, rerun: **still fails**. The seed commit's canonical
   kill-clock rule (`src/game/inactivity.ts` `INACTIVITY_LIMIT` 20→10, the
   mined-total verdict, `homeCheckmate.ts`'s `c ≥ 9` gate) is sufficient on its
   own — none of lane 1-3's Hard-engine adaptation (`ai/hard/config.ts`,
   `core/state.ts`, `core/zobrist.ts`, `eval/features.ts`,
   `eval/invariants.ts`, `types.ts`) is required to reproduce it.

2. **Full revert to pre-kill-clock (`271056b5`)** — passes (confirmed via a
   direct Node harness driving `HardEngine.searchTurn` on the exact fixture
   position, not the e2e test, since `271056b5`'s server-side files don't
   build against the current worktree's other lanes). The Hard search chooses
   the capture cleanly.

3. **File-by-file bisection of the seed→lane diff inside `src/ai/hard/`**
   (`config.ts`, `core/state.ts`, `core/zobrist.ts`, `eval/features.ts`,
   `eval/invariants.ts`, `types.ts`, each individually restored to `62a5703f`
   on top of an otherwise-`b493ff08` tree, rebuilt, re-probed): **the defect
   persists no matter which of the six files is reverted**, including all six
   reverted simultaneously. This rules out every line lane 1-3 touched in the
   Hard engine as the cause. `ai/hard/core/state.ts` already re-exported
   `INACTIVITY_LIMIT` from the canonical `game/inactivity.ts` *before* the lane
   diff (`export const INACTIVITY_LIMIT = CANONICAL_INACTIVITY_LIMIT;` is
   unchanged code), so the packed engine's clock domain (`MAX_CLOCK`), the
   zobrist clock plane, and `eval/features.ts`'s
   `DRAW_PRESSURE_DENOM = INACTIVITY_LIMIT * INACTIVITY_LIMIT` all move
   automatically off the one canonical constant, with no lane-diff code
   required.

4. **Minimal single-constant reproduction** — with every file at `271056b5`
   except `src/game/inactivity.ts`, changing *only* `INACTIVITY_LIMIT`/
   `INACTIVITY_WARNING` from `20`/`17` to `10`/`7` (keeping
   `resolveInactivityDraw`'s original **pure-draw** verdict — no mined-total
   logic, no `killClockForbidsCheckmate` gate, nothing else touched)
   reproduces the exact defect. So the mined-total verdict and the checkmate
   gate are *not* implicated either; shortening the raw ply limit is
   sufficient by itself.

5. **Threshold sweep** — sweeping `INACTIVITY_LIMIT` from 20 down to 10 (one
   file changed, everything else at `271056b5`), DESKTOP-profile search score
   for the "do nothing" root candidate vs. the capture root candidate:

   | LIMIT | do-nothing scoreCc | capture scoreCc | chosen |
   |------:|--------------------:|-----------------:|--------|
   | 20 | 226 | 226 | capture |
   | 19–16 | 226 | 226 | capture |
   | 15–14 | 226 | 226 | capture |
   | 13 | 226 | 226 | capture |
   | 12 | 234 | 226 | capture (barely) |
   | **11** | **557** | 326 | **do-nothing** |
   | **10** | **657** | 226 | **do-nothing** |

   The capture's own score is flat at 226 (or negligibly perturbed) at every
   limit — the defect lives entirely in how the "do nothing" branch gets
   scored, and it turns on sharply right where the shortened clock's terminal
   becomes reachable inside the search's own horizon.

## Search evidence (direct engine probe, not the e2e harness)

Harness: build the exact fixture position with `phasing()` +
`applyActions([END_ACTION_PHASE, END_PLACE_PHASE])`, then drive
`HardEngine.searchTurn` directly via `node --import tsx` with the same
config the worker uses: `deviceProfilePatch('desktop')` (i.e. no patch —
`new HardEngine(undefined)`, byte-identical to what a desktop browser sends)
and `deviceProfilePatch('phone')`, at `targetMs = deadlineMs = 7500` — the
*actual* first-search allowance under Phasing's `turnSearchAllowance`
(`src/ai/turnFunding.ts`: `10000ms` pace budget minus
`2 segments × ⌊10000/8⌋ = 2500ms` reserved for the still-to-come upkeep/Prepare
segments — using the naive full `10000ms` gives a different, less
representative depth).

**Static (ply-0) evaluation** of the two candidate end-of-turn positions
(`Evaluator.full`, black's perspective) at `b493ff08`:

- Capture line (move Hi in, attack, develop): **+877** — Material +3,
  SpawnArea/SpawnReserve/AnchorDepth all favorable, no Hanging/Exposure/
  KillAvailable penalties.
- Do-nothing line (one filler move, end turn immediately): **−2616** —
  SpawnArea −66, SpawnReserve −73, AnchorDepth −13, plus `Hanging = 5`,
  `ApproachStrand = 5`, `KillAvailable = −1` (White's exposed Hi is *still*
  exposed and Black is now materially/positionally behind for having ignored
  it). `DrawPressure = 4` appears as a raw feature value but its weight is 0
  (`DEFAULT_WEIGHTS.w[F.DrawPressure] = 0`, confirmed unchanged in the lane
  diff), so it contributes nothing to the score — it is not the mechanism.

**Search-returned scores** at `b493ff08` (DESKTOP profile, `targetMs=7500`,
same position):

- Capture: chosen actions `[MOVE→(9,9), MOVE→(7,9), ATTACK@(6,9), MOVE plant,
  END_ACTION_PHASE, END_PLACE_PHASE]`, `scoreCc = 226`, `depth = 3`,
  `work ≈ 408,715`.
- Do-nothing (root candidate `sig 844579234`, `endKey 70808685ec078970`,
  identical endKey at both `271056b5` and `b493ff08` — same leaf position
  reached): `scoreCc = 657`, **chosen over the capture**.
- PHONE profile, same position, same code: reaches `depth 4` (deeper than
  DESKTOP's 3 despite similar total work), and **correctly rejects**
  do-nothing (`scoreCc = −2433`) in favor of the capture (`scoreCc = −1144`,
  chosen). The capture's score is still negative for Black on PHONE (White's
  reply is punishing either way), but the *ordering* is right: capture beats
  do-nothing, exactly as the static evaluation and the test both expect.

**Direct instrumentation** of the packed engine's terminal check
(`Replica`'s low-level turn-application in `core/state.ts`, temporarily
logged and removed — not part of the delivered diff) during the DESKTOP
search on this exact position: the kill-clock terminal fires **thousands of
times** inside the ~409K-unit work budget, with the quiet-ply counter
climbing as high as `plies = 10` (the limit) along many explored branches,
producing terminal verdicts like `{white: 29, black: 32, result: BLACK_WIN}`
and `{white: 29, black: 30, result: BLACK_WIN}` — i.e. deep inside some of the
lines the search explores under the "do nothing" candidate, enough
kill-free turns pass (both sides mining, neither capturing) that Black's
mined total edges past White's, and the search returns that clock-decided
BLACK_WIN as part of what it credits to the do-nothing branch.

## Mechanism

Halving the kill clock from 20 to 10 quiet plies (the seed commit's canonical
rule, on its own — no lane-diff code needed) brought the clock's own terminal
within DESKTOP's *actual* search horizon (nominal nega-max depth 3 plus
whatever quiescence/forcing-line extension the position allows) for the first
time. At the old 20-ply limit no search at any normal work budget came close
to it, so it was invisible dead weight in the packed engine; at 10 plies,
starting from `inactivityPlies = 1` at the root, it is only 7-9 kill-free
hand-offs away — reachable inside DESKTOP's own exploration of the "everyone
just develops quietly" branch. Once some explored continuation under that
branch reaches the clock, the (now mined-total-decided, and in this position
occasionally Black-favorable) terminal score gets credited back to the root
candidate — without that continuation having been verified as White's actual
best defense the way the capture's much shorter, cleanly-refuted line is.
DESKTOP's shallow nominal depth (3, vs. PHONE's 4-5 on the same work budget)
is exactly what lets an unverified, favorable-looking deep line win the
tie-break against the capture's flat, correctly-evaluated 226 — a one-ply
deeper search on identical code throws it out.

This is a genuine **defect** (a horizon effect from the 10-ply clock), not a
legitimate consequence of the new rule:

- The capture's own evaluation is completely unaffected by the rule change at
  every limit tested (always 226, or the equivalent unaffected order) — the
  new rule does not make capturing worse.
- The position's static evaluation is unambiguous and favors capturing by a
  huge margin (+877 vs. −2616).
- A deeper search on the *identical* kill-clock code (PHONE, one ply further)
  rejects the do-nothing line outright. If "wait for the clock" were a real,
  best-play-validated way for Black (who is behind 0-5 on mined total) to
  come out ahead, a deeper search should find it *more* attractive, not less.
- The effect appears as a sharp threshold exactly where the shortened clock
  becomes reachable (`LIMIT` 12→11→10), not as a smooth consequence of the
  new verdict's sign or magnitude.

Black is behind on mined total (White 5, Black 0) and should want the kill,
per the rule as written; the engine's own deeper search agrees. DESKTOP's
shallow search is simply being fooled by its own unverified reach into the
clock.

## Recommendation

No patch is included in this delivery. The mechanism is a genuine search
defect, but the actual fix is a search-quality/horizon problem, not a
localized sign, unit, or off-by-one error: DESKTOP's nominal depth (3) and
per-node candidate widths let an unverified deep continuation reach the
now-nearby kill-clock terminal and outscore a correctly-evaluated shallow
capture. A safe fix needs one of:

- extending DESKTOP's effective look-ahead (depth or quiescence budget) near
  the clock's now-much-closer terminal so it verifies contested lines the way
  PHONE's narrower-but-deeper search already does, or
- not trusting a kill-clock verdict reached inside a search node whose
  opponent replies were drawn from a reduced/interior candidate width, unless
  it also survives at least one ply of re-verification with the full root
  width.

Both are legitimate but non-trivial changes to `search/pvs.ts`/`quiesce.ts`/
`config.ts`'s profile shapes, with correctness and performance implications
across the whole ladder/corpus, not a diff I could respons­ibly write and
verify (both the e2e test and `npx vitest run tests/ai/hard` green, plus no
regression on the existing ladder rows) inside this lane's minimal-diff scope.
This is not a case where the test should change — the test's expectation
(kill the exposed piece with a spare fourth action, while behind on mined
total) is correct under the rule as designed, and the engine's own deeper
search confirms it. The recommended next step is a follow-up lane scoped to
Hard-AI search depth/verification near the (now much closer) kill-clock
boundary, informed by the reproduction harness and threshold sweep above.

## Reproduction harness (not delivered as a patch; described for a follow-up lane)

A small Node/`tsx` script driving `HardEngine.searchTurn` directly (bypassing
the worker/browser) reproduces the defect in under two seconds, far faster
than the Playwright e2e path, and was used for the whole bisection above:

```ts
import { createInitialGameState } from './src/game/board';
import { applyActions } from './src/ai/simulate';
import { HardEngine } from './src/ai/hard/engine';
import { deviceProfilePatch } from './src/ai/hard/config';

const phasing = () => createInitialGameState(undefined, undefined, 0, 'phasing');
const initial = phasing();
const whiteHi = initial.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
const whiteSjor = initial.board.units.find(u => u.owner === 'white' && u.definitionId === 'water_1')!;
whiteHi.position = { x: 6, y: 9 };
whiteSjor.position = { x: 2, y: 3 };
const state = applyActions(initial, [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }]);

const engine = new HardEngine(deviceProfilePatch('desktop'));
const result = await engine.searchTurn(state, { targetMs: 7500, deadlineMs: 7500, expose: true });
console.log(result.actions[0], result.scoreCc, result.depth);
```

## Verification status

- e2e test: still fails at `b493ff08` (no source change made; this is a
  diagnosis-only delivery).
- `npx vitest run tests/ai/hard`: not run against a fix, since none is
  delivered. The worktree's `muju/src` is byte-identical to `b493ff08` (see
  `git diff b493ff08 --stat -- muju/src`, empty) — no lingering bisection
  edits remain.
