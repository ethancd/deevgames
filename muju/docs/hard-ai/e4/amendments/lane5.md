# Lane 5 amendment — where the iteration estimator actually lives

2026-09-18 00:20:41Z, `claude/hard-ai-e4-lane5` off the E4 plan commit `437ee40f`.

The E4 plan's lanes table gives lane 5 `src/ai/hard/search/root.ts`
(`iterativeDeepening`). `iterativeDeepening`, `shouldDeepen` and
`rootIteration` are not in `root.ts`; they are in
**`src/ai/hard/search/pvs.ts`**, and `root.ts` only imports
`iterativeDeepening` from there (`root.ts:67`, `root.ts:495`). `config.ts`'s own
`iterationGate` comment — the field this lane replaces — already says
"`search/pvs.ts iterativeDeepening`". The owned-file list is therefore
inaccurate rather than contested: no other E4 lane owns `pvs.ts` (lane 3 owns
`search/order.ts`, lane 4 owns `gen/generate.ts`).

This lane has edited, all behind `searchFix.iterFit` and all no-ops with the key
absent:

- `src/ai/hard/search/pvs.ts` — `iterFitVerdict`, `partialPublishes`, the call
  sites in `iterativeDeepening`, the principal-variation watch in
  `rootIteration`, two optional `HardSearchStats` fields and two optional
  `SearchContext` fields. This is the code the plan meant by "root.ts
  (`iterativeDeepening`)".
- `src/ai/hard/search/time.ts` (OWNED) — the estimator itself: the constants,
  `IterCostPrior`, `iterStepRatio`, `iterFitDecision`. Most of the new code is
  here so it can be tested without a search.
- `src/ai/hard/engine.ts` — ONE line, `ctx.iterCost?.clear()` on a fixed-work
  call, so the cross-turn prior is a WALL-mode quantity like `config.profile`
  and DESIGN §7.4's "a search carries nothing from one search into the next"
  stays exactly true for every fixed-work search (`hard:determinism`, the
  cross-commit golden, CI). Without it the prior would make a fixed-work search
  depend on what the same engine searched before it, which is a bigger loss than
  the prior is worth.
- `src/ai/hard/config.ts` — `SearchFix` declared, and `searchFix?: SearchFix`
  hung on **`SearchConfig`** rather than on `HardConfig` directly.
  `HardConfig extends SearchConfig`, so `HardConfig.searchFix` is the same key
  and every profile, patch, arm and hash behaves as the plan describes; it has
  to be on `SearchConfig` because `SearchContext.cfg` is a `SearchConfig`, which
  is how `iterationGate` is reachable from the search at all. **Lanes 3 and 4
  adding `tieBreak` / `rescueCap`**: add them to the same `SearchFix` interface
  in `config.ts` and to `searchFixKey` in `lab/hard-ai/ablate/arms.ts` (both
  carry a comment saying so). `gen/generate.ts` is handed a `GenConfig`, not a
  `HardConfig`, so lane 4 will need its own plumbing for `rescueCap`; nothing
  here forecloses it.

Nothing outside `searchFix.iterFit` changes: the champion's configuration hash
is still `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd` and
`npm run hard:cross-commit` is 48/48 identical to
`lab/results/hard-ai-e3/correct/cross-commit/rows-head-c73204dd.json`
(`E4.3-ITER-FIT.md` §4).

Also noted, and NOT this lane's to fix: `npm run hard:types` fails at the E4
plan commit itself, before any lane's change —
`lab/harness/runner.ts(168,7): TS2322 'VictoryReason' is not assignable to
'WinType | null'` (verified by stashing this lane's diff and re-running).
`npx tsc --noEmit` is clean.
