# E2 lane 1 — root candidate exposure and the ply-1 generator trace

An opt-in instrument on `searchRoot`. With it on, the result carries the root's
candidate list, a `searched` flag and a per-candidate score, plus the candidate
list the search saw at the opponent's reply node. With it off nothing changes:
`SearchContext.probe` is `null`, nothing is allocated, and the search returns
the same move, score, depth, work, node count and end key as before this lane.
It exists because `docs/hard-ai/e1/ANALYZE.md` cannot split
`strong-candidate-misjudged`: `RootResult` carries no per-candidate score and no
record of what the root searched, so "in the list, never searched" and "searched
and mis-scored" arrive as one label. `searched` plus `scoreCc` is the split.

## Interface

`RootOptions` (`src/ai/hard/search/root.ts`) gains two optional flags, which
`HardEngine.searchTurn`'s options object passes through:

```ts
const r = await engine.searchTurn(state, { work: 400_000, expose: true, ply1Trace: true });
r.candidateSource;  // 'completed-depth' | 'partial-iteration' | 'generator-list'
r.candidates;       // RootCandidate[] — undefined when the instrument was off
r.rootTrace;        // RootTraceRow[]  — one row per root iteration run, in order
r.ply1;             // Ply1Node[]      — only with ply1Trace

interface RootCandidate {
  index: number;          // position in the list the root walked
  endKey: string;         // 16 hex chars, RootResult.endKey's form (turn.endHi/endLo)
  genRankCc: number;      // turn.gainCc as snapshotted (see below)
  flags: number;          // TurnFlag bits
  sig: number;            // turn.sig, the 32-bit abstract action signature
  searched: boolean;      // the root applied it and searched a child
  scoreCc: number | null; // the score rootIteration assigned; null when unsearched
  chosen: boolean;        // the candidate whose move was returned
}
interface RootTraceRow { depth; n; searched; completed; cutoffAt; truncated }
interface Ply1Node { rootIndex; generator: 'root'|'interior'|'quiesce'; n; cut;
                     generations; generators; endKeys: string[]; truncatedKeys }
```

Notes an analyser has to know:

- The list is the one that produced the RETURNED move. `rootIteration`
  regenerates and re-sorts every iteration, so the probe keeps three buffers:
  the last completed iteration, the one in progress, and the list `searchRoot`
  generated before deepening. `candidateSource` says which was published;
  `generator-list` means the must-answer scan, the book probe, `pickUnsearched`
  or a fallback return answered, and there every candidate is `searched: false`
  and `rootTrace` is empty.
- `genRankCc` is `turn.gainCc` at snapshot time: the ORDERING score
  `search/order.ts:380` wrote (and sorted on, so `index` is its rank) in the
  first two sources, the generator's own within-turn gain — what
  `pickUnsearched` ranks on — in a `generator-list`.
- Match candidates by `endKey`; nothing is replayed through `verifyTurn`, so no
  candidate costs a canonical replay. `sig` is a cheaper identity. Under
  aspiration a `scoreCc` can be a bound rather than a value (`hard@desktop` has
  `useAspiration` off) and a depth can appear in `rootTrace` twice.
- One wall-mode path returns NO exposure even with the flag on: when E1.5's cold
  probe substitutes its plan for an unusable main search (`engine.ts:561-567`),
  the result is the probe's and the probe is not instrumented. Fixed-work lab
  callers never take that path.

## Cost, and why it is byte-identical when off

The instrument is five `if (probe !== null)` guards: once per root candidate in
`rootIteration` (enter, score, cutoff), once per iteration (begin/end), and once
per generation in `generateAt`. None is inside `pvs`'s per-node work, and a
generation costs thousands of units, so the guard is free next to it. Nothing
allocates unless a caller asked. When on, the search writes only into typed
arrays preallocated to the root candidate capacity; the objects and hex keys are
materialised once, in `searchRoot`, after it returns. The probe is installed for
one call and torn down in a `finally`, so a throwing search leaves nothing
armed. The flags live on `RootOptions`, not on
`HardConfig`: no hash-bearing field was added or touched, so `hard@desktop`'s
resolved configuration hash is unchanged.

## What the ply-1 trace established

**The opponent's reply node never uses the root generator.** `generateAt` picks
`ply === 0 ? s.gen : s.genInterior` (`search/pvs.ts:405`), so a ply-1 node
reached from `pvs` uses the INTERIOR generator — `kInterior = 16` at
`hard@desktop` against the root's `K = 24` (`config.ts:248`). The only other
generator at ply 1 is quiescence's: a depth-1 root iteration calls `pvs` at ply
1 with `depth - 1 = 0` (`pvs.ts:659`), `pvs` at depth 0 returns `quiesce`
(`pvs.ts:455`), and `quiesce` passes `s.genQuiesce` explicitly
(`quiesce.ts:163`) — `genInterior` narrowed to `maxCandidates = 8`. It generates
only where the node has tactical potential (`quiesce.ts:161`), so a quiet
depth-1 answer reports no ply-1 generation at all. There is no third path:
`mustAnswer` and the book probe run only at the root; the prover's rescue
witness is an injection INSIDE each generator, wired onto all three by
`installRescueWitness` (`engine.ts:234-236`), not a separate list; and
`forceHome` is a stub that enumerates nothing (`tactics/dfpn.ts:78-94`), with
`useDfpn: false` at desktop (`config.ts:282`).

Measured at fixed work: `initial` at 25,000 and 400,000 units (depth 2 and 3, 18
root candidates) and `opening-201` at both (depth 2 and 3, 16 root candidates)
report `interior` for every ply-1 node, n = 14 and 17 respectively — 16 plus
forced injections, never the root's 24. `promotion-kill` at 4,000 units answers
at depth 1 and reports `quiesce` for all six, n = 8 to 11. `generations` is 1 or
2 per root candidate: the null-window scout plus its full-window re-search.

## Test evidence

`tests/ai/hard/root-exposure.test.ts` runs 42 tests over eight real positions
(the opening, four authored fixtures, three generated openings). They pin:
on/off/on with the SAME engine returns identical `actions`, `scoreCc`, `depth`,
`work`, `stats.nodes`, `endKey`, so the instrument leaves no residue, and a fresh
engine agrees; every `searched` candidate has a non-null score and every
unsearched one `null`; exactly one `chosen`, whose `endKey` is
`RootResult.endKey` and whose `scoreCc` is `RootResult.scoreCc` at a completed
depth; the published list length equals the `n` the generator returned for that
iteration and its searched count the trace's; end keys are unique; no ply-1 node
used the root generator.

```
npm run hard:types      exit 0
npx tsc --noEmit        exit 0

npx vitest run tests/ai/hard/root-exposure.test.ts --maxWorkers=1
 Test Files  1 passed (1)
      Tests  42 passed (42)
   Duration  66.49s

npx vitest run tests/ai/hard tests/lab --maxWorkers=1
 Test Files  59 passed (59)
      Tests  957 passed (957)
   Duration  643.41s
```

`tests/lab/ablate.test.ts` is in that run, unmodified, and still pins
`hard@desktop`'s `wall:3000` hash at
`4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`.

`npm run hard:determinism` was NOT run: its header prices the default batch at
"twenty minutes of wall clock in one process" and it shards across up to twelve
processes, which this lane was told not to do. The in-process determinism test
is in the run above and passes, and the instrument reads no clock.

## Files changed

- `src/ai/hard/search/probe.ts` — new. Buffers, typed-array storage, materialisation.
- `src/ai/hard/search/pvs.ts` — `SearchContext.probe`; four guarded hooks in
  `rootIteration` and one in `generateAt`.
- `src/ai/hard/search/root.ts` — the two options, the four result fields, and
  `searchRoot` as a wrapper installing and tearing down the probe around the
  unchanged body (`searchRootInner`).
- `src/ai/hard/engine.ts` — `probe: null` in the constructed `SearchContext`;
  `searchTurn` accepts and forwards the two flags (the cold probe never does).
- `tests/ai/hard/root-exposure.test.ts` and this report — new.

Nothing outside the lane's ownership was touched: no config, gate or milestone.

## Cross-commit check (opening critique C5)

Every identity claim in this lane was on-vs-off within one commit. `hard:cross-commit`
(`lab/hard-ai/verify/cross-commit.ts`) is the old-vs-new one: 24 positions — the
12 DISTINCT sweep positions reconstructed lane 2's way plus 12 corpus positions
(the 11 authored fixtures and one opening) — at fixed work 100,000 and 400,000,
exposure off, printing `actions`, `scoreCc`, `depth`, `work`, `stats.nodes`,
`endKey` and `source` per row. Fixed work only: a wall search reads the clock,
which is not the question.

The positions are FROZEN to a file rather than re-derived at each commit
(`--states-out` at head, `--states-in` at the old commit), because the
reconstruction and the corpus readers are themselves code that changed; each
frozen state carries the replay's `MatchOptions`, which the old commit installs
through its own `withMatchRules`. The script imports only `engine.ts`,
`positions/corpus.ts` and `analyze/replay.ts`, all present at both commits, and
passes no option added after E1's close.

**Verdict: IDENTICAL.** 48 rows over 24 positions, byte-for-byte equal between
`7c896179` (E1's close, run in `/Users/ashkie/src/deevgames-e1-run/muju` from a
copy of this one file, deleted afterwards — nothing committed there) and this
branch's head, across the ~1,260 changed lines under `src/ai/hard`. No field
differs on any position. Artifacts:
`lab/results/hard-ai-e2/cross-commit/e1-close-7c896179.json` and `head.json`;
`diff` them to re-check.
