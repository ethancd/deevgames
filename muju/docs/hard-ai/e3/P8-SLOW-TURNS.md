# P8 — the 4,249 s game in the `eval-correct-v1` fixed-work row

E3 lane 16, 2026-09-17. Bounded diagnosis of the anomaly E3-PLAN records under
"Correctness descriptive rows and row #4 preregistration": game seed
`2399710895` of `lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k`
(pair `e1-g2-s40:3:3`, h3, 26 turns, `home-occupation`, the arm won) took
**4,249,165 ms** — 81% of the whole 16-game row's 5,225,504 ms of wall — while
the second game of the same row (seed `487278473`, h0) took 161 s.

**The one-line answer.** It is **P6 again, one level deeper**, and it is a
**position pathology, not an arm effect**: in a mutual home race the candidate
generator calls the full home-checkmate prover through DESIGN §5.6's forced
rescue injections at every quiescence node, those calls are charged **nothing**
on the work meter, and fixed-work mode has no deadline to cut them. The same
position costs the champion and the bundle the same to within 0.2%: 79,299 ms
(`hard@desktop`) vs 79,186 ms (`hard@ablate:eval-correct-v1`). The canonical
side (P7) is the *second* cost centre and the one a wall deadline cannot reach.

**Correction to the anomaly note.** E3-PLAN says "both seats' search `turnRows`
show sub-second searches at fixed work — the time sits outside the search". That
is wrong. The `turnRows` carry the seconds: `searchMs` on the arm's worst turn is
**2,628,604**. The time is inside `searchTurn`, and inside `searchTurn` it is
outside the node search — it is candidate generation and canonical verification.

---

## 1. Which turns, which seat, where the time is

All four slow turns are the last three turns of the one game, on **both** seats.
`rung`/`work`/`depth`/`stopReason` are the seat's own `hardTiming.turnRows`;
`units/ms` is `work / searchMs`, the throughput the work meter *thinks* it bought.

| seat | bot | seat turn | turnMs | searchMs | rung | work | depth | stop | units/ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| white | `ablate:eval-correct-v1` (arm) | 25 | 2,641,138 | 2,628,604 | 100,000 | 68,957 | 3 | work | **0.026** |
| black | `desktop` (champion) | 24 | 927,996 | 927,995 | 100,000 | 85,067 | 3 | work | **0.092** |
| white | arm | 24 | 529,023 | 529,023 | 100,000 | 100,020 | 2 | work | **0.189** |
| black | champion | 23 | 83,023 | 83,023 | 100,000 | 100,711 | 2 | work | **1.213** |

Every other turn of the same game, on either seat, runs at **40–115 units/ms**
(turn 1: 100,151 units in 940 ms = 106.5). So the rung is bought at up to
**4,000× the normal price**, and the work meter never notices: it is the same
100,000 units either way. `totalAdapterMs` (3,197,453) ≈ `totalSearchMs`
(3,184,908) on the arm seat, so the harness is not where the time is.

**Where inside `searchTurn`.** `--cpu-prof` over the reproduction of the
champion's 83 s turn (`lab/results/hard-ai-e3/p8/profile-black22-desktop.txt`),
inclusive ms:

```
79,078  searchRoot / searchRootInner        (the whole search)
79,002    iterativeDeepening -> pvs
70,445      generateAt  (search/pvs.ts)     <- 89% of the search is GENERATION
60,740        quiesceNode -> quiesce
60,684          inject      (gen/generate.ts)
60,410            injectRescue -> homeWitness (tactics/prover.ts)
16,401      make -> provesHomeCheckmate -> homeVerdict
76,677  runProver/prepare/act               (the prover, on every path)
```

(The profiled process is 91,175 ms in total: 79,078 ms of `searchTurn` plus
11,242 ms of `applyAction` — the lane's own `reconstruct` of the 276-ply replay,
every millisecond of it inside `src/game/homeCheckmate.ts resolveHomeCheckmate`.
Rebuilding the game costs 11 s of canonical home adjudication before the turn
under test even starts, which is P7 measured a third way.)

Self time by file: `src/ai/hard/tactics/prover.ts` **76,743 ms**,
`src/game/homeCheckmate.ts` 7,734 ms, everything else under 1.2 s. The hot leaf
is `damageBoundCore` (55,074 ms) with `reachableFrom` (14,286 ms).

So the phase attribution is:

- **P6 class — generation before/inside the search: 70.4 s of 79.1 s (89%).**
  Not only the *root* generation P6 fixed: `generateAt` is called at every
  quiescence node, and the dominant call site is `injectRescue`, the forced
  rescue injection that runs *before* the generator consults its work sink at
  all. P6's lane-9 fix noted this residue ("the first ~1.5 s of generation is
  still unpollable"); in a mutual home race it is 60 s, not 1.5 s.
- **Replica prover through `make`: 16.4 s.** P6's original mechanism, still
  unmetered (`search/pvs.ts chargeProver` is not called from `generateAt`).
- **The must-answer/verify layer: negligible on this turn** (0 candidates
  reached `verifyTurn`), but it dominates the worst position — see §3.
- **Canonical `applyAction` adjudication (P7 class) on the returned plan: 0 ms
  on this turn**, measured action by action outside the engine. The harness
  pays nothing here; the canonical cost appears where a body actually stands on
  or beside a home corner (§3).

## 2. Reproduction — champion and bundle, fixed:100,000, same position

`lab/results/hard-ai-e3/p8/repro-turn.ts` reconstructs the position with
`analyze/replay.ts` and runs one `searchTurn(state, { work: 100000 })` in a
fresh process, then times the canonical `applyAction` of the plan it returns.
The turn chosen is the champion's seat turn 23 (recorded 83,023 ms) — the only
slow turn of the four that fits the lane's 5-minute-per-invocation bound.

```bash
cd muju
node --import tsx lab/results/hard-ai-e3/p8/repro-turn.ts \
  --replay lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k/replays/e1-g2-s40_3_3-A-white.json \
  --side black --turn-index 22 --engine desktop --work 100000
```

| engine | searchTurnMs | recorded | work | depth | nodes | turnNodes | stop | canonical apply of plan |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| `hard@desktop` (champion) | **79,299** | 83,023 | 100,711 | 2 | 582 | 46,619 | work | 0 ms |
| `hard@ablate:eval-correct-v1` (bundle) | **79,186** | 83,023 | 100,692 | 2 | 589 | 47,418 | work | 0 ms |

The recorded turn reproduces (79.3 s vs 83.0 s, same rung, same `stopReason`,
same depth; the 4% is the row's load ≈ 6 against this run's idle box). 582
search nodes and 46,619 within-turn generation nodes is the whole story in two
numbers.

## 3. Does the wall cap it? Partly — and the residue is canonical

The same two positions re-run at `wall:3000`
(`white24-wall3000-both-engines.txt`, `black22-desktop-wall3000.json`):

| position | fixed:100,000 | wall:3000 (champion) | wall:3000 (bundle) | stop |
| --- | ---: | ---: | ---: | --- |
| champion seat turn 23 | 83,023 ms | **5,014 ms** | — | abort |
| arm seat turn 25 (worst) | 2,641,138 ms | **24,808 ms** | **24,239 ms** | abort |

P6's stop-aware generation does work: 83 s → 5 s on the first position. On the
worst position it still costs **24.8 s against a 3,000 ms allowance (8.3×)**,
with `depth 0`, `nodes 0`, `turnNodes 5` — the search never searched anything.
The profile of that run (`profile-white24-wall3000.txt`, inclusive ms):

```
23,375  searchTurn
16,008    pickUnsearched -> verifyTurn      <- canonical replay, AFTER the deadline
 9,786    make -> provesHomeCheckmate
 7,358    generateAt
32,827  enoughPossibleDamage (src/game/homeCheckmate.ts, self 34,590 ms)
```

Two thirds of the wall-mode residue is the **canonical** side: `pickUnsearched`,
the P6 salvage, canonically verifying the plan it rescues. Measured per action
on this position, `applyAction` costs

```
MOVE 2,802 ms   ATTACK 3,808 ms   MOVE 3,732 ms   END_ACTION_PHASE 3,667 ms
```

— against P7's recorded ~1.4 s per action, and the recorded turn's own canonical
replay costs 12,273 ms. That is E1's P7 verbatim, 2.7× worse, and no deadline
inside the search can reach it. **Wall mode caps the P6 half and not the P7
half**: expect worst turns around 25 s, not 3 s, in any wall row that reaches
this kind of position — over the P6 flag threshold of 20 s.

## 4. The position

Arm seat turn 25 (game turn 25, white to move, phase `place`, `actionsRemaining`
4, `upkeepPending` false):

- White (arm) **14 bodies**: **11 × `fire_1`**, 2 × `water_1`, 1 × `water_3`; bank 30.
- Black (champion) **18 bodies**: **16 × `fire_1`**, 1 × `shadow_1`, 1 × `water_1`; bank 58.
- White's `water_3` stands at **(8,9)**, one step from black's home corner
  (9,9), which black vacated the turn before; black's bodies at (1,7), (1,8),
  (0,8), (2,8), (2,9) sit behind white's back rank.

32 bodies, 27 of them `fire_1`, with **both** homes under a live race. P6's
position was 14 × `fire_1` and one home; this is that shape doubled, which is
why the same mechanism costs 60 s instead of 1.5 s, and why the canonical home
adjudication costs 3.8 s per action instead of 1.4 s.

## 5. Arm-specific? No

Three independent checks say the same thing.

1. **Same position, both configs**: 79,299 ms (champion) vs 79,186 ms (bundle)
   at fixed work; 24,808 vs 24,239 ms at `wall:3000`. The CPU profiles are the
   same shape function for function. The five `evalFix` flags change the eval,
   not the generator, the prover or the canonical engine.
2. **Both seats inside the anomalous game**: the champion's own seat pays 928 s
   and 83 s in it.
3. **Across the six correctness rows** (`slow-turns.json`, every seat turn over
   20 s): `eval-fix-b2` 0, `eval-fix-b3` **5**, `eval-fix-b4` 0, `eval-fix-b5`
   0, `eval-fix-b6` **2**, `eval-correct-v1` **4**. Every one of the eleven is
   in a `home-checkmate` or `home-occupation` game, and the single worst turn in
   the whole set belongs to the **champion**: 391,035 ms in `eval-fix-b3`'s seed
   `2102481794`. In `eval-fix-b6` the two slow turns are 35,925 ms (champion)
   and 35,909 ms (arm) — the same turn on both sides of the pair, as that row's
   arm plays the champion's moves.

No flag leads into it in any way this sample can see: three of six rows have a
slow game, the rows with none include B4 and B5, and the champion is the victim
in the worst case. What the bundle did was *win by home occupation in that
game*, and the pathology lives in home races.

**What it costs the row's numbers: nothing.** Fixed-work mode reads no clock, so
the moves are unchanged and the row's 11/0/5 and +137 [+14, +309] stand; the
game was slow, not wrong. It cost the row 71 minutes of wall out of 87.

## 6. A bounded fix proposal (not implemented)

The cheapest change that removes the 2,641 s tail is to **bound the forced
rescue injection**: `gen/generate.ts injectRescue` is the single call site that
spent 60 s of the 79 s, and it calls `tactics/prover.ts homeWitness` once per
injection with no budget of any kind, before the generator's stop-aware sink is
consulted. Give it a per-generation cap on `homeWitness` calls (a constant, or a
share of the node's meter, charged through `WorkClass.PROVER` so fixed-work rows
self-limit as well as wall rows), and set `s.truncated` when the cap bites so a
capped node cannot publish to the transposition table — exactly the shape of
P6's lane-9 fix, applied to the one phase that fix left unpollable. That is one
file, ~40 lines, and it wants a determinism re-pin (fixed-work searches change)
plus the `p6-stoppable-generation` test extended with a home-race position. It
does **not** touch the canonical residue: the 16 s `pickUnsearched -> verifyTurn`
and the 3.8 s-per-action `applyAction` home-gate adjudication are P7, still open,
still a `src/game/homeCheckmate.ts` memoisation job, and still the reason a wall
row in this position overruns by 8×. Sequence the two: cap the injection first
(it is inside `src/ai/hard/`, priced by our own gates), then price a home-verdict
cache in the canonical engine under its own preregistration.

## 7. Artifacts

`lab/results/hard-ai-e3/p8/`:

- `repro-turn.ts` — the reproduction used here (one `searchTurn` on a
  reconstructed position at fixed work or a wall, plus the canonical
  `applyAction` cost of the plan it returns). Diagnostic; imported by nothing.
- `describe-turns.ts` — reconstructs a replay and describes every seat turn
  over 20 s (the §4 composition).
- `black22-desktop.json`, `black22-bundle.json` — the §2 reproduction.
- `black22-desktop-wall3000.json`, `white24-wall3000-both-engines.txt`,
  `white24-bundle-wall3000-prof.json` — the §3 wall-mode runs.
- `profile-black22-desktop.txt`, `profile-black22-bundle.txt`,
  `profile-white24-wall3000.txt` — CPU profile attributions (inclusive by
  function, self by file and function).
- `slow-turns.json` — every seat turn over 20 s in the six correctness rows.

Five engine invocations in total, each a single search in a fresh process, none
over 95 s, one at a time, no heavy slot.
