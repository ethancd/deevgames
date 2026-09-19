# Gate 1 amendment proposal — 2026-09-19 UTC (September 18 Chicago)

**PROPOSED, NOT ADOPTED.** Written before the T2b pilot. Claude owns the frozen
`docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`; this file does not amend it.
No rule semantics change, gate pass, worker unlock, or strength claim is proposed
on the basis of the pilot. Full rows wait for a quiet machine and adoption.

## Exact proposed allocation

| Item | Proposal |
| --- | --- |
| Arms | Independent `aiv2-hard` vs each of Rush, Expand, Balanced, `aiv2-medium` |
| Rules | Frozen `muju-phasing-1`, current production map, 4 Act actions, shipped upkeep and inactivity |
| Full size | 64 seat-mirrored pairs **per opponent per handicap**; 128 games/cell, 256/opponent, 1,024 total |
| Handicaps | h0 and h3; Black receives the starting crystals in both seat orientations |
| Full seed | 20260957; `deriveSeed(seed, (opponentIndex*2+handicapIndex)*64+pairIndex)` |
| Pilot | One pair in every cell, 16 total games, independent seed 20260956; never pooled into full rows |
| Openings | Canonical initial Phasing state in every game; no dev/val/sealed corpus used |
| Work | hard **6,000**, medium **3,000** requested SearchBudget work units per complete own turn |
| Other search settings | Actual V2 difficulty defaults, WASM ABI 7 required, no fast override, no resignation |
| Dispatch | First action only, fresh search on every decision, one engine/seed per game-seat |
| Caps | 120 full rounds, 50,000 decisions; material + bank + pending cost; caps reported, never hidden |
| Execution | Sequential games, one shared heavy-queue slot; load averages before/after every game and run |

The seed is shared by the two games of a pair; the harness derives seat RNG
streams 0 and 1. Flip engine seats, not the board/handicap. Initial unit IDs are
normalized without changing gameplay. Pilot and full schedules are generated
in fixed opponent/h0/h3/pair/seat order. There is no early stopping, resizing
after looking at outcomes, or automatic rerun. A failed/interrupted run keeps
its partial evidence; a new attempt needs its own directory and explanation.

The primary work limits reuse T2's already-tested deterministic allowances;
they are a concrete starting proposal, **not evidence of equivalence to 8 s**.
For each decision, request `floor(remaining / decisionsLeft)`, at least 1 while
funded. `decisionsLeft` is 3 for upkeep, `actionsRemaining + 3` for Act, and 2
for Prepare. Charge the entire request even if a search stops early; never
reset at a phase change. At zero, complete upkeep using the canonical default
keep-set or end the current phase. Never call V2 with `fixedWork=0`: that
selects wall mode. Report these allowance completions separately from errors.

SearchBudget units are the engine's existing metered work, **not a global CPU
instruction/node bound**. The WASM solver also has preset tactical node caps;
its nodes and unmetered upkeep enumeration are deterministic but do not all
debit SearchBudget. Record tactical-node totals and every requested slice.
Wall timings are diagnostic only and never alter play or pass Gate 3.

## Historical reference audit and proposed disposition

`lab/ai/gate1-references.json` pins the sources and exact unrounded numbers.

| Standard evidence | W/D/L | Elo from score | 60% reference | Qualification |
| --- | --- | --- | --- | --- |
| EXPERIMENTS.md / e6 hard-fast vs Rush | 28/0/2 | +458.451214 | **+275.070729** | 30 games, **18 illegal actions**, old fast/wall policy; provisional historical anchor only |
| e0 aiv2-hard vs Rush, wall:500 | 1/0/15 | -470.436504 | -282.261903 | 16 legal games at a much smaller wall allowance; not the positive margin presumed by Gate 1 |
| e8 stopped hard-fast vs Rush | 2/0/0 | unbounded raw | unusable | Two games only; not a finite reference |
| hard vs Expand | unavailable | **null** | **blocked** | No matching result found |
| hard vs Balanced | unavailable | **null** | **blocked** | No matching result found |

The e2 engine-gates rows measure Greedy/Random, not the three named L2 bots.
The alternate-map study uses medium-fast and `Aware:Balanced`/`Aware:Rush`,
different policies; those are not substitutes. Search covered EXPERIMENTS.md,
result summary CSV/Markdown/JSON and all 27 `games.jsonl` files, followed by
the e8 and alternate-map source records. Historical artifacts stay untouched.

**Proposed resolution for Claude:** either locate and pin valid matching
references, or authorize a separate Standard calibration on a historical
engine/kernel version and append its protocol before running it. Do not run
Standard through the Act-only ABI 7 port, silently treat missing margins as
zero, or copy Rush's margin to Expand/Balanced. Accepting the dirty historical
Rush number needs an explicit dated qualification. Until resolved, the runner
reports missing margins and cannot report Gate 1 passed. This assignment does
not authorize a new historical calibration or edit the preregistration.

## Proposed decision rule

Evaluate each of the eight opponent/handicap cells separately, so a favorable
handicap cannot hide a weak one. Pair is the independent sampling unit. Use
the existing `lab/hard-ai/ladder/elo.ts` pentanomial estimator and its 95%
interval (including its reported Jeffreys treatment for degenerate samples).
Require raw score >0.5 and lower Elo bound >0 in every cell. For L2 cells also
require estimated Elo at least 0.6 times the adopted historical point margin.
No SPRT is proposed for Gate 1. These are per-cell 95% intervals; all cells
must pass, with no claim of simultaneous interval coverage or guaranteed power.
The 64-pair cap allows a useful first fixed-work test under high draw rates;
an inconclusive result remains inconclusive. Any larger future allocation or
budget change needs a prospective amendment, not outcome-based pooling.

Use T1's unchanged hash-pinned `sanity-bands.json` separately for each L2/h cell:
hard-seat purchases/game [1.3839285714285714, 186.92857142857142] and inactivity
draw fraction [0, 0.8658137860829667]. Purchases count paid commitments, including
refunded ones. Arrivals/refunds are extra diagnostics, not new retrospective
pass criteria. Medium cells report the same metrics, with no behavioral band
test because T1 explicitly froze application to L2 rows only.

Require 0 illegal actions, 0 invariant violations, 0 adapter exceptions,
0 anomalies and at most 1% adjudications per cell. An empty/illegal engine
emission or missing WASM aborts and voids the run; no scripted or JS solver
replacement. A deterministic allowance-completion action is part of the
registered fixed-work policy, not an engine exception. No Hard replica runs
here: replica divergence, Hard weights version and book magic are N/A, not
claimed zero/passed. Gate 0 remains Claude's separate work.

Every expected game, both seats, matching seed/handicap, strict legality,
rules identity and source/config identity must be present. Hash game/AI/kernel,
runner, harness, statistics, queue, lockfile, frozen bands, reference audit
and this proposal; check source stability after the run. Record exact resolved
configs and default weights. Never pool differing identities. Existing output
directories are refused. Even a complete full run in this proposal's runner
reports `blocked-unadopted-amendment`; adoption must be explicit in a later
revision, not inferred from a command-line flag.

## Commands (from muju/)

```sh
node --import tsx lab/ai/gate1.ts --mode full --plan
node --import tsx lab/ai/gate1.ts --mode pilot --out lab/ai/results/<new-pilot>
# After quiet-machine scheduling and amendment adoption only:
node --import tsx lab/ai/gate1.ts --mode full --out lab/ai/results/<new-full-row>
```

The CLI uses the existing shared heavy queue and rejects its bypass flag.
Do not create a private queue to evade the machine-wide cap. Run manifest,
identity, raw game JSONL, per-decision work, full replays, failures (if any),
and stratified summary remain together in the new evidence directory.
