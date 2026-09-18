# E4 lane 1 amendment — depth-1 reply SEARCHED count is not exposed

Written 2026-09-18, E4.1 (`docs/hard-ai/e4/E4-PLAN.md` lane 1, cost and
completion profile). Filed per the lane's own rule ("if you need a hook that
does not exist, write the request... and work around it with the profiler");
`src/ai/hard/search/pvs.ts` and `search/probe.ts` are not owned by this lane
and are unchanged.

## The gap

The usefulness rule's completion clause (`E4-PLAN.md` "Usefulness rule", item
1) asks for "completed opponent replies at the root and at depth 1... before
and after." At the ROOT this is exact: `RootResult.candidates[i].searched`
(`search/probe.ts`, `opts.expose`) is set the moment `rootIteration` applies a
candidate and calls `pvs`, so "listed vs searched" at the root is a real count
from the search's own bookkeeping.

At depth 1 (the opponent's reply node under a searched root candidate) no
equivalent field exists. `RootResult.ply1[i]` (`opts.ply1Trace`) records:

- `n` — candidates the FIRST ply-1 generation returned (`Ply1Node.n`,
  `generateAt`'s return value copied out by `RootProbe.ply1`).
- `cut` — whether `StopAwareSink` truncated that generation before the
  generator's own beam width (`search/pvs.ts generateAt`'s `GEN_SINK.cut`).
- `generations` — how many times ply 1 was generated under that root
  candidate (a null-window scout and its full-window re-search generate
  twice; a TT hit generates none).

None of these say how many of the `n` generated replies `pvs`'s own
candidate loop (`search/pvs.ts pvs`, the `for (let i = 0; i < n; i++)` loop at
depth 1) actually applied via `makeTurn` before an alpha-beta cutoff
(`onCutoff`) or a truncation break (`isTruncating`) ended it. That count is
exactly the depth-1 analogue of `RootCandidate.searched`, and it is not
written anywhere the probe can read: `IterationBuffer.searchedCount` (the
mechanism `root.ts`'s own `candidates[].searched` is built from) exists only
for the ROOT's `IterationBuffer` (`live`/`done` in `search/probe.ts`); the
ply-1 node has no `IterationBuffer` at all, only the flat `Ply1Node` record
above.

## Why it cannot be worked around from outside `pvs.ts`

The CPU profiler (this lane's other instrument) gives wall time, not node
counts, and self time inside `pvs.ts`'s own frame does not distinguish "one
candidate searched at full depth" from "four candidates searched at reduced
depth then discarded" — the information this metric needs is a count, not a
duration. The count is a local variable (`searched` in `search/pvs.ts pvs`)
that never escapes the function; exposing it needs either a new field on
`SearchContext.probe` written from inside `pvs`'s loop (the same shape as
`IterationBuffer.score`, called once per applied candidate) or a second
`IterationBuffer` keyed by `(rootIndex, ply)` instead of by root candidate
alone. Either is a `search/pvs.ts` and/or `search/probe.ts` change, both
outside this lane's owned files (`E4-PLAN.md`'s lane table: lane 1 owns
`lab/hard-ai/bench/profile*`, `tests/lab/profile.test.ts`, `package.json`,
this doc and `lab/results/hard-ai-e4/profile/`, nothing under `src/ai/hard`).

## Requested hook

A `RootProbe` method callable from `pvs.ts`'s depth-1 loop, e.g.
`s.probe?.ply1Searched(rootIndex, appliedCount)`, called once per depth-1 node
after its candidate loop ends (mirroring `endIteration`'s call site and
argument shape), OFF by default exactly like every other `probe !== null`
guard in `pvs.ts` today (`search/pvs.ts`'s module header, "COST WHEN OFF").
`Ply1Node` would carry the additional field `searched: number`.

## Workaround used in this lane's artifacts

`profileOnePosition`'s `Ply1Coverage` (`lab/hard-ai/bench/profile.ts`) reports
two proxies instead, both computed from what IS exposed, and both artifacts
and `E4.1-PROFILE.md` label them as proxies rather than as the searched count:

- `cutShare` — the share of ply-1 generations `StopAwareSink` truncated before
  the generator's own beam width. A `cut` generation is FEWER candidates than
  configured, which lower-bounds how much of the position's reply space the
  node could even see, but says nothing about how many of the (possibly
  already-truncated) `n` it returned were actually searched.
- `meanGenerated` against `configuredK` (`engine.config.genInterior.K`) — the
  realised reply-generation width relative to the interior generator's
  configured cap, again a generation-side number, not a search-side one.

Neither proxy can distinguish "the node searched every generated reply" from
"the node cut off after the first" — the two would report the same `n` and
`cut`. Where this matters for E4.1's own findings, it is stated explicitly
next to the number.
