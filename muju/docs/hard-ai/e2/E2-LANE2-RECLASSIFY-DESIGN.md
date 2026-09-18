# Lane 2 design note: how the analyser will consume root exposure

Design only. Nothing here is implemented. Lane 1 owns `RootResult.candidates`
and the ply-1 generator trace; this note says what lane 2 will do with them, so
the two interfaces can be checked against each other before either is written.
Implementation waits for lane 1 to merge and for the real field names.

## The problem being solved

Every analysed E1 loss carries one label, `strong-candidate-misjudged`. Its own
rule text says why it cannot be split: "RootResult exposes neither per-candidate
scores nor which candidates the root searched, so 'in the list but never
searched' and 'searched and mis-scored' are one class here". The class covers
two different engine faults with two different fixes, so E2 cannot choose a
candidate row from it.

## What lane 1 is adding

Opt-in `RootResult.candidates`, one record per candidate: index, endKey,
genRankCc, flags, searched, scoreCc (null when not searched), chosen. Plus an
opt-in ply-1 generator trace. Byte-identical play with the instrument off.

## The split rule

At a flagged turn, with exposure on, take the adviser's best end key
(`turns[].adviser.endKey`, already saved) and look it up in `candidates`:

- present, `searched === false` → **`strong-candidate-discarded`**. The turn
  was generated, offered to the root, and never searched. The fix is an
  ordering or beam-width question.
- present, `searched === true`, `scoreCc` below the played candidate's
  `scoreCc` → **`strong-candidate-misjudged`**, now meaning what its name says.
  The fix is an evaluation or depth question.
- present, `searched === true`, `scoreCc` at or above the played candidate's
  `scoreCc` → **inconsistent**, not a class. The root would have chosen it.
  Record the turn and stop; either the re-run diverged from the game or the
  exposure is not reporting what it appears to.
- absent from `candidates` while the saved `cheap.containsAdviserBest` is true
  → **inconsistent** in the other direction: the generator list and the root's
  candidate list disagree. Record it; do not reclassify.

The two inconsistent outcomes are the reason to build this as a reclassifier
with an explicit report rather than as a relabel in place.

## Where the re-run comes from

`--reclassify` today re-runs no search: the adviser numbers, which are the
expensive part (three whole-turn searches per turn at 1,600,000 units), are
already in the saved artifact, and only generation is redone. The candidate
list is not in the artifact and cannot be derived, so the new mode needs one
search per flagged turn.

It should be the search the analyser already runs. `analyze.ts` re-runs the
PRODUCTION engine at fixed work — `config.productionWork`, 400,000 units — at
every turn to produce `engine cc` and `engine.reproducedPlayed`. Turning
exposure on for that existing re-run costs nothing: same engine, same work,
one more field on the result. So:

- **Future analyses** carry `candidates` because the production re-run is run
  with exposure on. No new flag, no new search, no new cost.
- **`--reclassify --rerun-root`** exists only to retrofit artifacts already on
  disk — the 47 baseline losses being analysed now — by re-running that same
  fixed-work production search at each flagged turn and nothing else. The
  adviser searches are read from the artifact as they are today.

Flagged turns are the turns whose class can move: the first-consequential turn,
the largest-swing turn, and any turn labelled `strong-candidate-misjudged`. A
whole-game pass is not needed and should not be the default.

## Caveats the report must carry

- The seat played under `wall:3000` at rungs 200,000-400,000 units. The
  re-run is a FIXED 400,000 units. It approximates what the seat searched and
  is not what the seat searched. A candidate marked `searched=false` in the
  re-run may have been searched in the game, and the other way round.
- The P6 stop-aware generation fix (`70bdaf03`) changed wall-mode behaviour
  after the baseline was played. Fixed-work mode is not affected, which is why
  the re-run is fixed-work, but the game the artifact came from was played
  under the pre-fix wall path.
- A turn whose own wall time broke its allowance was deadline-cut in the game
  and not in the re-run. `loss-report.ts` already counts those; the
  reclassification report should exclude them from the split or mark them.
- Exposure must be off in every contest row. If a row is ever run with it on,
  the config hash and the fixed-work output have to be shown identical first.

## What lane 2 needs from lane 1 before implementing

- Exact field names and types on `RootResult.candidates`, and the values `flags`
  can take.
- How exposure is switched on: a field on the search config, a sink passed in,
  or an environment flag. The analyser needs it per call, not per process.
- Whether `endKey` is the same key space as `turns[].played.endKey` and
  `turns[].adviser.endKey` in the artifacts. The split rule is an equality test
  on that key and fails silently if the spaces differ.
- Whether `scoreCc` is from the seat's point of view or the mover's.
- Whether `chosen` can be false for every candidate (a fallback or an empty
  plan), and what `candidates` holds when the root returned a fallback.
- The ply-1 trace's shape, and whether it is per root candidate or per reply
  node; lane 2 will use it for the reply-node question, which is a separate
  pass from this one.
