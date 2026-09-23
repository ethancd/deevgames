# Hard AI release record — 2026-09-23, the `muju-phasing-3` retune and measurement campaign

Campaign: `docs/changes/2026-09-22-p3-retune-SPEC.md` (owner request, Ethan, 2026-09-22
afternoon: "execute on the next Hard AI piece — the retune and measurement campaign under
phasing-3"), resumed from `docs/changes/2026-09-22-p3-retune-HANDOFF.md`. Branch
`claude/muju-hard-p3-retune` in `~/src/deevgames-p3tune`, cut from master `0fcd5852`, PR #30.
This file is the decision record, in the shape of `RELEASE-2026-09-21-phasing.md`: written as it
happens, **appended, never rewritten**.

Authority: amendment **A7** of `PHASING-PREREGISTRATION-2026-09-18.md`
(lines 376–504, commit `2ade2c33`, doc sha256 `7502e2d9…`), which advances the rules revision to
`muju-phasing-3`, re-freezes the Gate 1 bands and preregisters the Gate 2 protocol played below.
**A6's standing constraint still binds this file:** no release note, changelog, marketing string
or player-facing copy may claim the Hard engine is stronger than `AIEngineV2` until a Gate 2
sealed row exists. The rows below are `p1-val` rows under A7's protocol, not the sealed row;
they are reported as what they are.

**Headline: the retune found nothing to adopt. The shipped weight vector ships unchanged.**

## What ships

- **Rules.** Phasing only, rules revision **`muju-phasing-3`** — unchanged by this campaign.
  Every ladder manifest written here records
  `{"rulesVersion": "muju-phasing-3", "elementGraph": "double-thick", "upkeep": "shipped",
  "inactivityRule": "on"}` (e.g.
  `docs/hard-ai/phasing/p3-retune-2026-09-22/results/gate2/G2-1-aiv2-hard-turn/manifest.json`).
- **Engine: byte-identical to `origin/master`.** `git diff --stat origin/master..HEAD -- muju/src/`
  is **empty** at HEAD `6ed2b187`. `DEFAULT_WEIGHTS` stays `phasing-hand-priors-v1`,
  `WEIGHTS_VERSION` 2 (`src/ai/hard/eval/weights.ts:28,75`), `weightsHash` `14d06ba8`
  (`docs/hard-ai/phasing/p3-retune-2026-09-22/weights/control.json`, `"hash": "14d06ba8"`),
  `weightsSha256` `ec9816169afe7983e03ea220eb30b8d4c1d05cbdaefc5f07a9e8a4061e12cdf5`
  (`lab/hard-ai/suites/phasing/fixtures/v4/floor-contract.json`).
  **No source file, no browser bundle and no server image changes in this release.**
- **The whole branch is `muju/lab`, `muju/docs` and `muju/tests` only.** At HEAD `6ed2b187`,
  `git diff --shortstat origin/master..HEAD` → `738 files changed, 2120482 insertions(+),
  132 deletions(-)`; `git diff --name-only origin/master..HEAD` filtered against
  `muju/lab/`, `muju/docs/` and `muju/tests/` returns **nothing**. By directory:
  704 files under `muju/docs/hard-ai`, 16 under `muju/lab/hard-ai`, 7 under `muju/lab/harness`,
  5 under `muju/docs/changes`, 3 under `muju/tests/lab`, 3 under `muju/lab/ai`.

What does ship, then, is evidence and lab apparatus:

| What | Where | Commit |
| --- | --- | --- |
| Amendment **A7** (`muju-phasing-3`, re-frozen Gate 1 bands, Gate 2 protocol) | `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:376-504` | `2ade2c33` (committed alone) |
| p3 scripted reference, 840 games under the kill clock | `lab/harness/results/p3-scripted-2026-09-22/` (9.3 MB) | `6143374f` |
| `phasing-evidence` rows re-armed at p3 (`current: true`) | `tests/lab/phasing-evidence.test.ts` | `9eb164bc` |
| Gate 1 references re-adopted at `muju-phasing-3` under A7 | `lab/ai/gate1-references.json`, `lab/ai/gate1-sources.ts`, `lab/ai/gate1.ts` | `05807b84` |
| Suite bundle **v3** authored at phasing-3, 225 cases / 146 offered | `lab/hard-ai/suites/phasing/fixtures/v3-bundle/` (19 MB), manifest sha256 `da358933…` | `c2090be8`, test re-pin `fb33c6dd` |
| Floor contract **v4** (committed alone, as the contract requires) | `lab/hard-ai/suites/phasing/fixtures/v4/floor-contract.json` | `97b62831` |
| Suite measure, ledger **seq 3** | `lab/hard-ai/suites/phasing/results/v4-measure-3-2026-09-23/` (46 MB), `measurement-ledger.jsonl` | `f0aa1982` |
| **Fuzz clock-fixture repair** (see Gate 0 below — this one is a real defect fix) | `lab/hard-ai/fuzz/prover-surface.ts#clockFixture` | `cdcee23e` |
| Weight sweep: 30 vectors, sweep scripts, Stage A/B/C rows, Gate 0 + Gate 2 chains | `docs/hard-ai/phasing/p3-retune-2026-09-22/` (45 MB) | `9781959c` … `6ed2b187` |

## Release ledger — the weight sweep

Preregistered procedure: campaign SPEC §3 (Stage A screen → Stage B confirm on dev → Stage C
select on held-out `p1-val`), with the adoption rule written before any row was played:

> "The winner is chosen ONLY from this table by summed score; report ONLY these numbers as the
> tuning result (winner's-curse note). If no candidate beats control on the sum, the campaign
> ships `control` (no weight change) and says so." — `docs/changes/2026-09-22-p3-retune-SPEC.md` §3

Fixed work **N = 60000**, chosen by a 4-game probe (mean Hard turn 1050.3 ms;
`docs/hard-ai/phasing/p3-retune-2026-09-22/PROGRESS.md`, "Setup"). `control.json` reproduces
`hard@desktop` exactly — same actions, same results, byte-identical per-game `actions` arrays over
2 games (`results/probe/control-check-desktop/`, `results/probe/control-check-env/`).
Every arm, including `control`, is run as `--a hard@env` with `MUJU_HARD_WEIGHTS` pointing at its
JSON, so the arms differ in nothing but the vector.

### Stage C — the tuning result

`p1-val.jsonl` (32 openings, sha256 `cbd427dfd2ee…`), seed **20260972**, handicap 0,
seat-mirrored, 32 pairs / 64 games per cell; `aiv2-hard-turn` at `wall:6000`, `Rush` at
`fixed:60000`. Source: per-row `metrics.json` and `summary.md` under
`docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC/`, aggregated in
`results/stageBC-decision.json`.

| arm | vs `aiv2-hard-turn` W-D-L | score | Elo | vs `Rush` W-D-L | score | Elo | **sum** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **control** (`phasing-hand-priors-v1`) | 52-0-12 | **0.8125** | +255 [+172, +375] | 27-0-37 | **0.421875** | −55 [−148, +32] | **1.234375** |
| p3-s08 | 49-1-14 | 0.7734375 | +213 [+130, +328] | 29-1-34 | 0.4609375 | −27 [−104, +47] | **1.234375** |
| hv-mine | 46-0-18 | 0.71875 | +163 [+80, +269] | 30-0-34 | 0.46875 | −22 [−110, +64] | 1.1875 |
| p3-s18 | 44-0-20 | 0.6875 | +137 [+66, +222] | 29-0-35 | 0.453125 | −33 [−125, +55] | 1.140625 |

Every Stage C row: `status: complete`, 0 illegal actions, 0 replica divergences, 0 fallbacks,
32/32 pairs, not VOID. Load 5.2–11.8.

**Decision: ship `control`, no weight change.** `p3-s08` tied control's summed score **exactly**
(1.234375 vs 1.234375, `results/stageBC-decision.json` → `"stageC": {"sums": {"control":
1.234375, "p3-s08": 1.234375, …}, "best": "p3-s08"}`, `"winner": "control"`). The preregistered
rule requires a candidate to **beat** control on the sum; a tie is not a beat, so the shipped
vector stays. Control is also the better arm on the harder opponent on this table (+255 vs +213
Elo against `aiv2-hard-turn`); the tie is made up on `Rush`, where every arm is below 0.5.

### Stage A and Stage B — the screen, not the result

Reported here only as the funnel that produced the Stage C set, per SPEC §3's winner's-curse
instruction. **Stage A** (29 arms × 8 pairs vs `Rush`, `fixed:60000`, seed 20260970, `p1-dev`)
ranked `control` **26th of 29** at 6-0-10 / 0.375; `hv-mine` led at 13-0-3 / 0.813
(`PROGRESS.md`, "Stage A: complete, ranked"). No arm was discarded by the behaviour filters
(spend 91–100 %, upkeep-elimination 0–13 %, 0 illegal actions in all 29).
**Stage B** (top 8 + control on `p1-dev`, seed 20260971; 16 pairs vs `aiv2-hard-turn` at
`wall:6000`, 8 pairs each vs `Rush`/`Balanced`/`Expand` at `fixed:60000`) put `control` last of
nine on sum(aiv2+Rush) at 1.03125, behind `p3-s08` 1.34375 and `hv-mine` 1.3125; the regression
guard dropped nobody (`results/stageBC-decision.json` → `"guardDropped": []`).

**Stage A and Stage B both ranked `control` at or near the bottom; Stage C, on held-out openings
at four times the sample, put it first.** That gap is exactly what the preregistration's
held-out stage exists to catch, and it is the reason the screen numbers are not the result.
16 games per arm is 6 score points per game.

### The kill-clock knobs were never exercised

Knobs 9–11 of the sweep (DrawPressure, `Inv16ClockDiscipline`, `PstMine` — SPEC §3) were sampled
across the whole field, but the kill clock almost never fired in a tuning game. Counted directly
from `winType` in `games.jsonl` across every `*-aiv2-hard-turn` run directory:

| Stage | aiv2 games | `kill-clock` endings | the rest |
| --- | --- | --- | --- |
| B | 288 | **2** | home-checkmate 216, elimination 59, upkeep-elimination 11 |
| C | 256 | **2** | home-checkmate 181, elimination 67, upkeep-elimination 6 |

Stage A reached the clock in no game at all (`HANDOFF.md`, "What Stage A says"). **So the clock
weights are untested by this campaign.** Nothing here says DrawPressure's `-8` or Inv16's `-200`
are right or wrong; they were carried, not measured. A sweep that wants to move them needs games
that reach the clock — the scripted round-robin does (417/840,
`lab/harness/results/p3-scripted-2026-09-22/REPORT.md`), engine-vs-engine ladder games at these
budgets do not.

## Gate 0 — correctness veto (informational under A6, reported either way)

Driver `docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/gate0.sh`; log
`results/gate0/gate0.log`, run at HEAD `c489560c`, load 4.56 / 5.20 / 5.33, node v24.11.1.

| Check | Command | Result |
| --- | --- | --- |
| Perft, canonical | `npm run hard:perft -- --check` | **PASS**, exit 0. `phasingActions_initial 14959`, `phasingMidStates_initial 1053`/`1850`, `phasingTurns_initial 797`, `standardTriple "checked"`, `fixturesChecked 7`, `fixturesMismatch 0`, `digestMismatches 0`, `replicaAgreed true`, `mismatches 0`, `openings 797` (`results/gate0/perft-canonical.log`) |
| Perft, replica | `npm run hard:perft -- --check --engine replica` | **PASS**, exit 0. `standardTriple "skipped-phasing-replica"`, Phasing `14959/1850/797`, `mismatches 0`, `replicaAgreed true` (`results/gate0/perft-replica.log`) |
| Determinism | `npm run hard:determinism -- --engine hard@desktop --work 50000 --positions 4` | **PASS**, exit 0. `{"identical":true,"decisions":4,"mismatches":0}` (`results/gate0/determinism.log`) |
| Differential fuzz | `npm run hard:fuzz -- --actions 20000 --seed 7101` | **FAILED on the first run, exit 1**, on a stale fixture — see below. Every mismatch counter was 0. Repaired at `cdcee23e`; the re-run at the final commit is owed below. |

### The fuzz failure was a stale test fixture, and it had been red on shipped master

The 2026-09-23 fuzz run exited 1 with exactly one false flag
(`results/gate0/fuzz.log`):

```
{"seed":7101,"cases":20000,"fixtureCases":28,"fixtureMismatch":0,"fuzzVerdictMismatch":0,
 "nodeMismatch":0,"witnessChecked":12901,"witnessIllegal":0,"witnessNotRemoved":0,
 …,"clockFixtureOk":false,"elapsedMs":7188}
hard:fuzz: prover surface FAILED (fixtureMismatch 0, fuzzVerdictMismatch 0, nodeMismatch 0,
  witnessIllegal 0, witnessNotRemoved 0, clockFixtureOk false)
```

**Every engine-vs-replica counter in the same run is zero.** Transitions: `divergences 0`,
`legalitySetMismatches 0`, `pendingLegalityMismatches 0`, `unmakeMismatches 0`,
`rehashMismatches 0`, `roundTripMismatches 0`, `invariantViolations 0` over 112 games.
Arrival surface: `transitionMismatches 0`, `arrivalFlagMismatches 0`, `refundBankMismatches 0`,
`survivorMismatches 0`, `incrementalProverMismatches 0`, `proverOrderInvarianceViolations 0`.
Gate preservation: 305 games, `mismatches 0`, `freshPackProverMismatches 0`,
`incrementalProverVerdictMismatches 0`, `gateProverCapHits 0`. Clock coverage is complete:
`maxClockSeen 10/10`, kill-clock terminals 29 + 37 + 3 draws. **This is not an engine defect.**

The false flag was `clockFixture()` in `lab/hard-ai/fuzz/prover-surface.ts`, which still asserted
two `muju-phasing-2` facts:

1. its unproven-occupation case expected `Reason.INACTIVITY` / `victoryReason: 'inactivity'` at
   the last quiet ply — a terminal the kill clock no longer produces in live play; and
2. its proven-mate case sat at `INACTIVITY_LIMIT - 1` (9 plies in), a clock value at which
   `killClockForbidsCheckmate` (`src/game/inactivity.ts`) now **vetoes** the `#` award, because
   at `c ≥ limit - 1` the invader's predicted next turn start is not guaranteed.

`cdcee23e` re-authored the fixture: the mate case moves to `INACTIVITY_LIMIT - 3` (hand-off count
8 < 9, the latest ply that still allows the award), the occupation case asserts
`Reason.KILL_CLOCK` / `victoryReason: 'kill-clock'` with `winner: null` on equal mined totals, and
a third case was added for the **decided** branch (White 2, Black 5, Black's move onto A1 auto-mines
one more → 2 vs 6, Black wins on the same ply that drew case (b)). Clock values are still derived
from `INACTIVITY_LIMIT`, never written as literals.

**The finding, stated plainly: the previous release's Gate 0 fuzz evidence was stale, and shipped
master's fuzz gate has been red since the kill clock merged.** `git diff --stat origin/master
c489560c -- muju/lab/hard-ai/fuzz/` is **empty** — the fuzz code this run executed was byte-identical
to `origin/master`. The kill-clock campaign did touch this very file (`b493ff08` added
`'kill-clock'` to `REASON_NAME`) but never re-authored `clockFixture`'s assertions, and
`npm run hard:fuzz` was not re-run before PR #29 merged. `RELEASE-2026-09-21-phasing.md`'s Gate 0
row recording "Fuzz: `divergences 0` … clock fixture ok" was true of `muju-phasing-2` and has not
been true of master since. Nobody noticed for a day because nobody ran it.

**Re-run at the final commit — all four steps PASS.** `results/gate0/gate0.log`, last block:

```
gate0 start 2026-09-23T14:04:20Z HEAD eae48fba9ee259d0d66ba92b98a66b7e3fbd151c load 1.79 2.83 4.31
== perft-canonical exit 0 (2026-09-23T14:04:24Z)
== perft-replica exit 0 (2026-09-23T14:04:24Z)
== fuzz exit 0 (2026-09-23T14:04:35Z)
== determinism exit 0 (2026-09-23T14:04:35Z)
gate0 done 2026-09-23T14:04:35Z
```

`results/gate0/fuzz.log` prover line: `"fixtureMismatch":0,"fuzzCases":20000,"fuzzVerdictMismatch":0,
"nodeMismatch":0,"witnessChecked":12901,"witnessIllegal":0,"witnessNotRemoved":0,…,"clockFixtureOk":true`;
walk line `"divergences":0` with every mismatch counter 0; coverage line
`hard:fuzz: clock coverage — maxClockSeen 10/10, quietGames 14/112, clock terminals (kill-clock + inactivity) 69`.
Perft (both engines) `"replicaAgreed":true,"mismatches":0`; determinism `{"identical":true,"decisions":4,"mismatches":0}`.

**A second stale phasing-2 remnant surfaced on the re-run, and is also fixed.** With the fixture
repaired (`cdcee23e`), the validation lane's Gate 0 run at `6ed2b187` still exited 1: the walk's
A4 *clock-coverage guard* (`lab/hard-ai/fuzz/run.ts`, "20000 actions produced no inactivity draw
at all; the terminal this rule change is about is untested") required at least one `inactivity:*`
terminal. Under `muju-phasing-3` that terminal cannot occur in live play; the ply it guarded is now
a `kill-clock:*` terminal, of which the same walk produced 69 (29 black, 37 white, 3 draw). Commit
`eae48fba` makes the guard count `kill-clock:*` as well as `inactivity:*` (so an archived phasing-1/2
replay still satisfies it) and reports them as "clock terminals". Like the fixture, this guard is
byte-identical on `origin/master`, so master's fuzz gate would have gone on failing for a second
reason after the first was fixed. Neither remnant is an engine defect: across every run today the
divergence, legality, unmake, rehash, round-trip, invariant and prover mismatch counters were 0.

### Correctness veto item 6 — fallbacks across every row played

**PASS.** Across all 8 Gate 2 and Stage C rows (512 games), and every Stage A/B row before them:
`illegalActions 0`, `replicaDivergences 0`, and `packError / engineError / divergence /
invalidSuffix / emptyPlan / workerError` all **0**, in every row's `metrics.json`. Every row
`status: complete`, `adjudicationRate 0.00%`, none voided.

## Gate 0 — suite measure, ledger seq 3

Contract `lab/hard-ai/suites/phasing/fixtures/v4/floor-contract.json`, committed **alone** at
`97b62831` (`contractCommit.touchesResultPaths false`, `committedBeforeRun true`,
`bytesMatchCommit true`, `ancestorOfHead true`). Manifest: lane S's bundle v3,
`da3589338557f74329c72fc8a231967a2f3a89656b1405f573a66a0dfbaac6e9` — a manifest never measured
before, so the contract declares **no** `supersedes`. `allowedMiss` is `V1_ALLOWED_MISS` verbatim;
`minimumEarned` is derived from the manifest's own offered counts, never asserted.

```
npm run hard:suite:phasing:measure -- \
  --manifest lab/hard-ai/suites/phasing/fixtures/v3-bundle/manifest.json \
  --contract lab/hard-ai/suites/phasing/fixtures/v4/floor-contract.json \
  --out lab/hard-ai/suites/phasing/results/v4-measure-3-2026-09-23
```

Started `2026-09-23T13:09:50.534Z`, finished `13:12:38.450Z`, head `cdcee23e`, 225 of 225 cases
executed. `valid true`, **`floorPass false`**, earned **126 / 146**, coverage 79/79
(fail 0, indeterminate 0, error 0, missing 0), `failures []`, `drift false`, `engineDrift false`,
`correctness true`. Witness tier **`local-only`** (weaker than seq 2's `remote-tracking`: the
contract commit is not yet on a remote). Ledger **seq 3**, `prev a976dfb6…`,
`chain 09ad77cf29b534590c19a77e81c829e15831c26a828f8d4de415400caca20828`.

| Family | Earned | Floor | Offered | Verdict |
| --- | --- | --- | --- | --- |
| tactics | **62** | 57 | 63 | PASS |
| invariants | **10** | 14 | 15 | **BELOW FLOOR** |
| home-mate | **28** | 28 | 28 | PASS |
| economy | **7** | 20 | 20 | **BELOW FLOOR** |
| summon-disruption | **13** | 13 | 14 | PASS |
| home-fortify | **6** | 6 | 6 | PASS |
| **total** | **126** | — | 146 | `floorPass false` |

Under A6 this reading is informational and is not converted into a pass. It is also not a new
regression: the shipped vector has never met these two floors.

### The misses, named and characterised

All 20 misses are `status: "fail"`, `failureCodes: ["predicate-miss"]` — the engine returned a
legal, complete turn that was not the case's expected one. **Zero** errors, refusals,
divergences or unresolved proofs.

**economy — 13 of 20 missed**, and they are one motif, not thirteen:
`muju-onto-4-{0,1,2,3,4,5}` and `relocate-{fire_1-e, fire_1-s, plant_2-e, plant_3-e, plant_3-s,
water_1-e, water_1-s}`. Each case's own rationale in
`lab/hard-ai/suites/phasing/fixtures/v3-bundle/economy.suite.json` reads: *"the named miner must
extract more than the poor cell's finite four crystals… this passive finite-extraction objective
does not claim optimality against active replies"*, over horizons of 1–5 own harvests. The
engine will not walk a miner off a poor square onto a richer one when the payoff is several
pass-only hand-offs away. This is a real gap in long-horizon economy planning, and it is the
same gap the 2026-09-21 record flagged.

**invariants — 5 of 15 missed**: `inv4-strand-unpunished`, `inv7-promote-no-runway`,
`inv8-no-pre-adjacency`, `inv12-cleave-line`, `inv19-soft-miner-exposed`. All five are
`primary: "search-gap"`, i.e. the search, not the evaluation, is what the case measures.
`inv12` (−2300), `inv19` (−805) and `inv4` (−1175) miss on both halves — `evalGap` is negative
too (−490, −1570, −395), so those three are genuine evaluation-plus-search misses. The two that
isolate the search are `inv7`, `evalGap` **+945** against `searchGap` **−995870** (the eval
prefers the right branch and the search throws it away), and `inv8`, `evalGap` **+2195** against
`searchGap` **0** — the search cannot separate the two positions at all. These are search-depth and ordering failures on
multi-AP reply lines (`inv12` needs a four-AP Fire-II line where the first kill unlocks the
second), not evaluation-sign errors.

**tactics — 1 of 63** (`phasing-tactics-plugged-shadow_1-vs-fire_3`) and **summon-disruption —
1 of 14** (`M5-SD-07-split-rectangles`): both comfortably inside their allowed-miss budgets, both
the same single cases that missed in the previous reading.

### Against the 2026-09-22 reading (ledger seq 2)

| Family | seq 2 (v3 measure, 2026-09-22) | seq 3 (v4 measure, 2026-09-23) | Floor |
| --- | --- | --- | --- |
| tactics | 62 | **62** | 57 |
| invariants | 8 | **10** | 14 |
| home-mate | 28 | **28** | 28 |
| economy | 4 | **7** | 20 |
| summon-disruption | 13 | **13** | 13 |
| home-fortify | 6 | **6** | 6 |
| total | 121 | **126** | — |

**This is not a controlled delta, and must not be read as one.** The two readings are against
**different manifests** — `454fe137…` (the v2-authored bundle, from the phasing-only cutover
campaign) versus `da358933…` (lane S's v3 bundle, re-authored at `muju-phasing-3` against the
renamed catalogue) — and different `engineSourceSha256` (`8ad95e28…` vs `f2d20515…`, the kill
clock having moved `eval/features.ts`). A7 voids the seq 2 reading for exactly this reason. What
can be said: the case **ids** overlap heavily, and the ids that stopped missing are
`inv1-spawn-zero`, `inv5-poor-miner-square`, `muju-onto-4-6`, `relocate-fire_1-s`,
`relocate-metal_2-e`, `relocate-plant_1-e`. The `weightsSha256` is identical in both
(`ec981616…`), so whatever moved, it was not the weights.

## Gate 2 — the claim rows, played exactly as A7 wrote them

Driver `docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/gate2.sh`; log
`results/gate2/gate2.log`, started `2026-09-23T12:47:29Z` at load 4.83 / 5.15 / 5.19, finished
`13:52:21Z`, all four rows exit 0. All rows: `p1-val.jsonl` all 32 openings
(sha256 `cbd427dfd2ee88d7f9ef1722267c254568c973df7d4aa9c32dfba36acab35119`), handicap 0,
seat-mirrored, 32 pairs / 64 games, `--shards 4`, `MUJU_HEAVY_SLOTS=4`, `--replays off`.
`hard@desktop` is the shipped build (`src/` identical to `origin/master`); G2-1 ran at commit
`c489560c` and G2-2/3/4 at `f0aa1982`, which differ in no source file
(`git diff --stat c489560c f0aa1982 -- muju/src/` empty), so the arm is the same engine in all four.

| Row | A | B | Work | Seed | W-D-L (A) | Score | Elo [95 %] | LOS | ill / div / fb | overrun A / B | VOID? | load | A7 bar → verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **G2-1** | `hard@desktop` | `aiv2-hard-turn` | `wall:6000` | 20260975 | **54-0-10** | **0.844** | **+293 [+193, +463]** | **100.0 %** | 0 / 0 / 0 | 0.00 % / 0.00 % | no | 7.54 | Elo lower bound > 0 at 95 % → **+193 > 0. MET.** |
| **G2-2** | `hard@desktop` | `Rush` | `wall:1500` | 20260976 | 27-0-37 | 0.422 | −55 [−142, +26] | 9.2 % | 0 / 0 / 0 | 0.92 % / 0.00 % | no | 7.14 | informational — reported, no bar |
| **G2-3** | `hard@desktop` | `hard@env` (= `weights/control.json`) | `fixed:60000` | 20260977 | 32-0-32 | 0.500 | 0.0 [−23, +23] *(degenerate, regularized — descriptive only)* | 50.0 % | 0 / 0 / 0 | n/a (fixed work) | no | 5.07 | identity row by construction — see below |
| **G2-4** | `hard@desktop` | `aiv2-hard` (per action) | `wall:1500` | 20260978 | 50-0-14 | 0.781 | +221 [+121, +373] | 100.0 % | 0 / 0 / 0 | 0.00 % / 1.42 % | **no** (expected VOID did not occur) | 5.05 | informational — reported, no bar |

`ill / div / fb` = illegal actions / replica divergences / engine fallbacks of every kind
(`packError`, `engineError`, `divergence`, `invalidSuffix`, `emptyPlan`, `workerError`). Every row
`status: complete`, `adjudicationRate 0.00 %`, `voided: false`, `voidReason: null`, 32/32 pairs,
64/64 games, 0 missing, 0 failed. Source for every number:
`results/gate2/G2-{1,2,3,4}-*/{summary.md,metrics.json,manifest.json}`.

**G2-1 is the row that carries the campaign.** `hard@desktop` beats `AIEngineV2`'s whole-turn
variant 54-0-10 on held-out openings at a six-second allowance, Elo +293 with the interval's lower
bound at +193 and LOS 100.0 %. Timing is valid: both arms at 0.00 % overrun against a 60 ms
tolerance, `hard@desktop` p95 6001 ms / max 6011 ms over 696 turns. **This is a `p1-val` row, not
the sealed row A6 asks for**, and `p1-val` has now been used for selection three times
(2026-09-20 twice, Stage C) before this row, so it is not unseen data. Under A6 nothing in
player-facing copy may lean on it.

**G2-3 is an identity row, and its bar is zero by construction — not a failed bar.** A7 wrote
G2-3 as "retuned `hard@desktop` vs `hard@env` = `phasing-hand-priors-v1` JSON … score > 50 % with
LOS ≥ 95 %; this is the retune effect". The campaign's result was **ship control**, so the
"retuned" vector and the reference vector are the same vector: the row loads
`MUJU_HARD_WEIGHTS=…/weights/control.json` into `hard@env` and plays it against the shipped
`hard@desktop`. It was played exactly as written rather than skipped, and it returned exactly what
an identity row must: **32-0-32, score 0.500, Elo 0.0, LOS 50.0 %**, `meanTurnMs` a 734.9 / b 735.2,
1475 turns each side, 0 aborted searches on either arm. The harness itself labels the Elo
`(degenerate sample, regularized - descriptive only)`. The retune effect this row was written to
measure is **zero, because there was no retune** — the row confirms that, and confirms the env
hook loads the shipped vector faithfully. Reading it as a missed bar would be reading it backwards.

**G2-2, against `Rush` at 1.5 s.** 0.422, Elo −55 with the interval straddling zero. A7 asks for
a note against "the 2026-09-20 best 13–0–19 (phasing-2, historical)": 27-0-37 over 32 pairs is a
higher score than 13-0-19 over 16 pairs (0.422 vs 0.406), but the two are **not poolable** — a
different rules revision, a different opening slice and a different n — so this is a direction,
not a comparison. Rush remains the opponent the engine does worst against, at every budget this
campaign measured.

**G2-4 was expected VOID and was not.** A7 predicted the per-action `aiv2-hard` arm would blow the
overrun tolerance. It came in at `overrunRate 1.42 %` (13 of 918 turns past the 15 ms tolerance,
`overAllowance 843`), under the 5 % VOID threshold, so the row stands as a valid informational
row: 50-0-14, score 0.781, Elo +221 [+121, +373], LOS 100.0 %. Recorded as a prediction that did
not come true.

**Kill-clock endings in the Gate 2 rows**, counted from `winType` in each row's `games.jsonl`:
G2-1 1 of 64, G2-2 2 of 64, G2-3 2 of 64, G2-4 0 of 64. The clock is as absent from the claim
rows as it was from the sweep.

## Release ledger — content DAG walk

`cd /Users/ashkie/src/deevgames-p3tune && python3 tools/muju-content-dag.py plan --kind ai`
selects 13 nodes. Disposition per node, with evidence. The governing fact for nodes 1–3 and 5–12
is that **`git diff --stat origin/master..HEAD -- muju/src/` is empty** and the branch touches
nothing outside `muju/lab`, `muju/docs` and `muju/tests`.

| # | Node | Disposition | Evidence |
| --- | --- | --- | --- |
| 1 | wasm-tactics | **verified unchanged** | `muju/assembly/`, `muju/src/ai/wasm/`, `muju/asconfig.json` do not appear in `git diff --name-only origin/master..HEAD`; `wasmSha256` in every Gate 2 manifest is the master build's |
| 2 | ai-search | **verified unchanged** | `muju/src/ai/` empty in the src diff. `muju/lab/ai/` DID change (3 files: `gate1-references.json`, `gate1-sources.ts`, `gate1.ts`, commit `05807b84`) — Gate 1 adoption metadata only, no search code |
| 3 | hard-ai | **verified unchanged** | `muju/src/ai/hard/` and `src/ai/hardOptIn.ts` empty in the src diff; `DEFAULT_WEIGHTS` label and `weightsHash 14d06ba8` unmoved. `muju/docs/hard-ai/` changed: this record and the campaign evidence |
| 4 | ai-strength | **changed** | The substance of this release: A7 (`2ade2c33`), p3 scripted reference (`6143374f`), suite bundle v3 (`c2090be8`) + contract v4 (`97b62831`) + ledger seq 3 (`f0aa1982`), the fuzz fixture repair (`cdcee23e`), Gate 0 / Gate 2 rows (`6ed2b187`), Stage A/B/C rows. Verified: Gate 0 table above (re-run at `eae48fba`: 4 × exit 0), suite measure above, Gate 2 table above — 0 illegal, 0 divergence, 0 fallback in every row |
| 5 | mcp-tools | **verified unchanged** | `muju/server/` absent from `git diff --name-only origin/master..HEAD` |
| 6 | agent-guides | **verified unchanged** | `muju/public/skills/`, `muju/server/skills.ts`, `muju/docs/MCP_TOOL_TAPS.md`, `muju/docs/ANALYSIS_TOOLS.md`, `muju/ONLINE.md` absent from the diff |
| 7 | balance-analysis | **verified unchanged** | `muju/lab/solver/` and `muju/lab/results/current-static/` absent from the diff. The weight sweep is AI weights, which this node's own text separates from static balance values |
| 8 | game-validation | **changed** | 3 files under `muju/tests/lab/`: `gate1.test.ts`, `phasing-evidence.test.ts`, `suites-phasing-manifest.test.ts`. Per the lane reports: `gate1.test.ts` 53/53 with the 16 `skipIf(!GATE1_ADOPTED)` tests re-armed, `suites-phasing*` 216/216 with the load test un-skipped, `phasing-evidence` p3 row 10/10. **CI at the final commit is the coordinator's gate** — see Post-deploy verification |
| 9 | static-package | **verified unchanged** | `build-all.sh`, `tools/verify_site.py`, `tools/smoke-site.cjs`, `muju/vite.config.ts`, `muju/package.json`, `muju/package-lock.json`, `index.html`, `README.md` — none appear in `git diff --name-only origin/master..HEAD`. No source file changes, so the `_site` artifact is byte-identical to master's |
| 10 | server-package | **verified unchanged** | `muju/Dockerfile`, `muju/compose.yaml`, `muju/.dockerignore` absent from the diff; `muju/server/` and `muju/src/` unchanged, so the host image content is master's |
| 11 | static-deploy | **verified unchanged** | Nothing to publish (node 9 unchanged). The DAG text still says "Publishing paused since 2026-09-18 (no deploy credentials)"; that note is stale: the 2026-09-22 kill-clock release published Pages by local `npx wrangler pages deploy` from the main checkout (`docs/changes/2026-09-22-kill-clock.md` §Release). No wrangler run is made for this release because the `_site` artifact is master's |
| 12 | server-deploy | **verified unchanged** | Nothing to deploy (node 10 unchanged). The Render host keeps serving master's image; the merge of this branch changes no file it builds from |
| 13 | release-verification | **changed** | This record, plus `docs/changes/2026-09-22-p3-retune-{SPEC,HANDOFF,laneP,laneS,laneT}.md` and `docs/hard-ai/phasing/p3-retune-2026-09-22/PROGRESS.md` Stage D. Live-surface verification is not required by this release because no live surface changes; the post-merge checks below are confirmation of that, not of a new deploy |

## Post-deploy verification

**Filled by the coordinator at 2026-09-23T14:28:24Z, after the merge (`8395d285`).** Nothing in this release
changes a deployed byte, so these checks confirm that nothing moved, rather than that something
did. Fill each row with what came back, and with the commands that produced it.

| Check | Expected | Result |
| --- | --- | --- |
| CI on the merge commit (`gh workflow run deploy.yml`) | green | **green**: run 35871874531 on `master` at `8395d285`, `completed success` (triggered by the push to master; a manual dispatch on the branch was refused by the agent's permission classifier, so local validation was the pre-merge gate) |
| `npm test` at the final commit | 0 failing | **213 files / 2972 tests passed, 0 failed** at `6ed2b187` (352 s; `results/validation/npm-test.log`); `npm run hard:types` and `npx tsc --noEmit` clean; e2e `ai-worker.spec.ts` 7/7 incl. the free-capture case (`results/validation/e2e-ai-worker.log`). `eae48fba` changes only the fuzz guard in `lab/hard-ai/fuzz/run.ts`, outside every test's imports |
| Gate 0 re-run at the final commit (perft ×2, fuzz, determinism) | 4 × exit 0, `clockFixtureOk true` | **Done** at `eae48fba`, 14:04:20–14:04:35Z, load 1.79: 4 × exit 0, `clockFixtureOk true`, 69 kill-clock terminals (block above) |
| `/api/muju/health` | ok, same revision as before the merge | `{"ok":true,"game":"Muju Hono Irumbu","protocol":1}` — identical before and after the merge |
| `muju_rules` over MCP | `ruleset.name === 'phasing'`, `muju-phasing-3` kill-clock text unchanged | `{"ruleset":{"name":"phasing","revision":"muju-phasing-3","immutable":true,"retired":["standard"]}, …}`, kill-clock "mined total" text present, 37,251 chars, same before and after the merge |
| `/muju/` bundle | byte-identical to the pre-merge bundle | No build input changed (`git diff --stat 0fcd5852..8395d285 -- muju/src/ muju/index.html muju/vite.config.ts muju/package.json` empty), so the artifact is master's; no Pages publish was made |
| Cloudflare Pages | unchanged (nothing to publish; no wrangler run) | unchanged; no wrangler run |
| Academy | untouched by this campaign (SPEC "NOT in scope") | untouched; no Academy push |

## Not in this release

### Gate 1 — not run, and it cannot be run validly today

A7 re-adopted the Gate 1 references at `muju-phasing-3` (`lab/ai/gate1-references.json`:
`"status": "adopted"`, `"rulesVersion": "muju-phasing-3"`, `rulesAmendment.id "A7"`, bands from
`lab/harness/results/p3-scripted-2026-09-22/sanity-bands.json`, sha256 `0056c2cd…`), and
`gate1.ts --plan` prints `adopted`. **No Gate 1 row was run.** Two reasons, both structural:

1. **A5's calibration is still text only, and A7 kept A5 in force.** A7's "What remains valid"
   preserves "**A5's per-search calibration requirement**, in full". A5
   (`PHASING-PREREGISTRATION-2026-09-18.md:271-294`) requires the row's adapter to fund **each**
   search with that kind's calibrated `workPerSearch` and to stop a turn at a per-turn ceiling set
   to the calibration's **95th-percentile** total work per own turn. What is implemented is A3 §3:
   `lab/ai/gate1-calibrate.ts:4-8,42-47` takes "the OVERALL median work per own turn, per engine —
   not a stage median, not a mean, **not a percentile**". `grep -rn "workPerSearch"` over
   `lab src tests server` returns **zero code hits** — only the amendment text and the
   repair-campaign reports that already diagnosed this
   (`docs/hard-ai/phasing/repair-2026-09-20/reports/understand/phasing-conversion-status.md:35`:
   "Amendment A5 … exists only as text; the Gate 1 adapter has not been changed to implement it,
   so Gate 1 cannot currently be run validly"). A row run on today's adapter would be an A3 row
   that A5 has already declared defective — the pilot it was written about funded 44 of 48
   follow-up searches with 1 work unit.
2. **The box time is an owner decision, not an agent's.** An eligible calibration has never been
   run at any revision. It is a full-length measurement over **all 48 dev openings at both
   handicaps**, both engines, to termination or `maxTurns ≥ 20`
   (`gate1-calibrate.ts:134,339-358,604-606`), which the file itself calls a **"twelve-hour
   calibration"** (`:115,:119,:164`), and it must run on an **idle** box: `loadCalibration` refuses
   a manifest whose 1-minute load average at start or end exceeds 1.5. The row after it is 768
   games, "about fifteen hours … sequential" (`lab/ai/gate1-launch.ts:44`, `lab/ai/gate1.ts:21`),
   floored at `games × secondsPerGame / slots` when sharded (`gate1-launch.ts:126`) — so roughly
   7–8 hours at the default 2 heavy slots, on a machine the owner uses.

**The owner must rule on A5 before that box time is spent.** Either A5 is implemented (a new
calibration schema, a per-search adapter and a per-turn p95 ceiling) and then calibrated and run,
or A5 is amended to accept the A3 per-turn budget with its known defect stated. Filed as F-G1
below. Status: _(fill when run)_.

### Gate 3 — still unmeasured

Desktop p95 ≤ 6,000 ms / phone p95 ≤ 3,000 ms. Not measured on the shipped configuration at this
release, exactly as `RELEASE-2026-09-21-phasing.md` left it. What this campaign adds is four
desktop readings at their own allowances, which are **not** Gate 3 rows (different allowance,
lab harness, shared box): G2-1 `hard@desktop` p95 **6001 ms** / max 6011 ms over 696 turns at a
6,000 ms allowance, 0 overruns; G2-2 p95 **1506 ms** / max 1559 ms over 2066 turns at 1,500 ms,
19 overruns (0.92 %); G2-4 p95 **1502 ms** / max 1511 ms over 934 turns, 0 overruns; G2-3
(fixed work, no clock) p95 1266 ms. The phone number remains unrepresented, not merely
unmeasured.

### The sealed row — still owed

A6's condition stands: no strength claim in player-facing copy until a sealed Gate 2 row exists.
`p1-sealed.jsonl` was not opened by this campaign (SPEC "NOT in scope"; A7 repeats it). G2-1 is a
`p1-val` row and is reported as one.

### The Academy re-voice — out of scope by the spec

`docs/changes/2026-09-22-p3-retune-SPEC.md` excludes "the Academy re-voice of R09/R10 and the
fifteen rename lessons (separate campaign)". Nothing in this release touches `academy/`.

## Follow-ups filed

1. **F-G1 — rule on A5, then implement or amend it.** Gate 1 cannot produce a valid row until
   the adapter funds per search with a per-turn p95 ceiling, or A5 is amended. Owner decision,
   because the work is followed by ~12 h of idle-box calibration plus a ~7–15 h row. Evidence:
   `PHASING-PREREGISTRATION-2026-09-18.md:271-294`, `lab/ai/gate1-calibrate.ts:42-47`,
   zero `workPerSearch` hits in `lab src tests server`.
2. **F-FUZZ — the fuzz gate has no CI owner.** `npm run hard:fuzz` was red on master for a day
   because no automated job runs it and the kill-clock release recorded a pre-change reading as
   its evidence. Either add it to the release checklist as a *re-run at the final commit* item
   (not a copied earlier reading), or put it in CI. The same applies to `hard:perft` and
   `hard:determinism`. All four are cheap: by the timestamps in `results/gate0/gate0.log`,
   perft canonical 4 s, perft replica under 1 s, fuzz 11 s, determinism 1 s — 16 seconds for the
   whole set.
3. **F-ECON — the economy family's 13/20 miss is one motif and is worth one fix.** All thirteen
   are "walk the miner to the richer square" over a 1–5 harvest horizon
   (`fixtures/v3-bundle/economy.suite.json` rationales). It is a planning-horizon gap in
   `gen/`'s relocation candidates, not thirteen independent bugs, and it has now been measured
   twice against two manifests.
4. **F-INV — the five invariant misses are search gaps, not eval-sign errors.** `inv7` has
   `evalGap +945` against `searchGap −995870`, and `inv8` has `evalGap +2195` against
   `searchGap 0`. Instrument the search on these five positions before touching a weight; a
   weight sweep cannot fix a search that never sees the line.
5. **F-CLOCK — the kill-clock weights are untested and a sweep at these budgets cannot test
   them.** 2 of 288 Stage B games, 2 of 256 Stage C games and 5 of 256 Gate 2 games reached the
   clock. `DrawPressure` (−8) and `Inv16ClockDiscipline` (−200) are carried, not measured. Any
   future sweep over them needs a position set or an opponent that actually reaches ten kill-free
   plies. `KILL_CLOCK_SOFT_CC` (±200 cc, `eval/evaluate.ts:209`) is a constant, not a weight,
   and was out of scope here too (SPEC §0).
6. **F-VAL — `p1-val` is nearly spent.** It has now been used for selection on 2026-09-20 (twice),
   in Stage C, and for all four Gate 2 rows. The sealed set is the only unseen data left. A future
   campaign needs either the sealed row or a newly generated held-out book, and the generator's
   stop rule has to be re-verified at `muju-phasing-3` if a new book is cut.
7. **F-WITNESS — ledger seq 3's witness tier is `local-only`.** Seq 2 achieved
   `remote-tracking`. Pushing `97b62831` to `origin` before the measure would have earned the
   stronger tier; it is recorded as `local-only` rather than re-run, because re-running the
   measure after the fact would not make the contract's preregistration any earlier.
8. **The 2026-09-21 record's open follow-ups (F1, F8, F2b, F5, F9, the lab-corpus port keeping
   M6–M13 from running) are untouched by this campaign** and stand as written in
   `RELEASE-2026-09-21-phasing.md`, "Follow-ups filed".
