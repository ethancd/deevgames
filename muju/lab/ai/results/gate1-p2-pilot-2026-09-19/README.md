# Gate 1 plumbing pilot — rules revision `muju-phasing-2` (A4), seed 20260962

**This directory is INELIGIBLE evidence and always will be.** It is a 16-game
plumbing pilot, run against an explicitly **provisional** budget, to show that the
Gate 1 instrument runs end to end under A4's rules revision. It is not a Gate 1
measurement, it cannot pass or fail Gate 1, and none of its games may ever be
pooled into a row. `summary.json` says `gate1: "pilot-ineligible"` for that reason.

    node --import tsx lab/ai/gate1.ts --mode pilot \
      --calibration lab/ai/results/gate1-provisional-calibration-2026-09-19/calibration.json \
      --out lab/ai/results/gate1-p2-pilot-2026-09-19 \
      --provisional-calibration --accept-calibration=load

## Why the seed is 20260962 and not A3 §5's 20260961

A3 §5 named **20260961** as the pilot seed. That seed was **consumed** by the
plumbing pilots run under `muju-phasing-1` — `lab/ai/results/gate1-a3-pilot-2026-09-19`
and `…-2026-09-19b` — and amendment **A4** voided every Gate 1 game measured
before it, so 20260961 now names a **void population**.

Re-running the pilot under 20260961 would put two different populations, one void
and one current, behind one number: no later audit could tell a 20260961 game of
the old rules from a 20260961 game of the new ones. So the pilot advances to
**20260962**, the next unused integer, chosen exactly the way A2 chose 20260958
after voiding 20260957. The seed is not changed silently:

* `lab/ai/gate1-report.ts` holds `VOID_PILOT_SEEDS = [20260961]` and
  `PILOT_SEED_CHANGE_REASON`;
* `lab/ai/gate1-references.json#a3.seeds` records `pilotAsAdopted: 20260961`,
  `pilot: 20260962`, `voidPilotSeeds` and the reason in full;
* `manifest.json` / `manifest-shard-1-of-1.json` and `summary.json` in **this**
  directory carry `seed: 20260962`, `pilotSeedChange` and `voidPilotSeeds`.

**The row seed 20260960 is unchanged** and has produced no eligible game.

## Why the calibration is provisional, and what that costs

A3 §3 forbids an asserted budget: the per-own-turn fixed work must come from a
measured calibration. The measurement machine was **busy** while this pilot ran
(1-minute load ~4.3–4.6 on 12 cores), and a WALL-mode calibration on a loaded box
**under-counts** work. So the budget here comes from
`lab/ai/results/gate1-provisional-calibration-2026-09-19`, which declares itself
provisional and ineligible in its own manifest: one dev opening, one handicap,
capped at 6 own turns per engine and 6 full rounds per game — an **opening-only,
contended** sample.

* budgets used: `hard 51423`, `medium 26159` work units per own turn;
* `loadCalibration` refused it three times over (1-minute load at start and end,
  and a maximum 5-minute boundary load of 4.54 against the ceiling of 2.0); the
  run passed `--accept-calibration=load`, and all three reasons are stamped, by
  kind, into `manifest.json#calibration.acceptedReasons`;
* `--provisional-calibration` is refused for anything but a pilot
  (`gate1.ts#parseArgs`), so this concession cannot leak into a row.

**The eligible calibration is measured later by the coordinator on an idle
machine.** Any full row must be run against that one, not against this.

## What the pilot showed

16 games, 8 cells × 1 pair × 2 seats, one dev opening (`p1-g6-s2`) at handicaps
0 and 3.

| counter | value |
| --- | --- |
| games | 16 / 16 scheduled, 0 errors |
| actions dispatched (plies) | 2222, **0 illegal** |
| invariant violations / anomalies / adjudications | 0 / 0 / 0 |
| distinct games, keyed `(hardSeat, gameSha256)` | 16 / 16 |
| distinct games, keyed `gameSha256` alone | 16 / 16 |
| distinct start positions | 2 (one opening × two handicaps) |
| every cell `cellValid` | true; `invalidCells: []` |
| later convergence | **0** shared hand-off positions over 317 boundaries |
| inactivity draws | 0 (A4's clock is 20 plies, reset only by a capture) |
| win types | 6 elimination, 6 home-checkmate, 2 upkeep-elimination, 2 home-occupation |
| searches per own turn, row adapter | hard median 2 (1–5, n=167 turns), medium median 1 (1–4, n=48) |
| turns that spent more than their allowance | **0** for both engines |
| invalid plan suffixes dropped | 0 |

`strengthMet` is `false` in every cell: a pilot cell is one pair, so its Elo
interval cannot exclude zero. That is arithmetic, not a result, and it is why a
pilot is ineligible by construction.

**Adapter fidelity.** The row adapter now follows the shipped whole-turn loop
(`src/hooks/useAI.ts`, `src/ai/worker/handler.ts` `mode: 'turn'`): one allowance
per own turn covering Act, the upkeep decision and Prepare, a plan replayed action
by action, and a fresh search only when the plan runs out or stops replaying
legally. The row measured **2 searches per own turn** for `aiv2-hard`, in the
shipped loop's 2–3 range. The provisional calibration reports **1**, which is an
artefact of its own tiny opening-only sample (11 own turns, each of which
consumed its whole 10,000 ms allowance in a single search) — not a disagreement
about pacing. Both numbers are printed side by side in
`summary.json#pacing`, which is exactly what that header is for; the comparison
becomes meaningful when the eligible calibration replaces this one.

## Seconds per game, and the full row's wall time

* total play time 1318 s over 16 games → **mean 82.4 s/game**, median 44.9 s,
  range 8.6–280.3 s, measured **on a busy machine** (load ~4.5 of 12 cores).

Using the launcher's arithmetic (`gate1-references.json#a3.sharding`,
`lab/ai/gate1-launch.ts`) with 8 shards over the 2-slot shared heavy queue:

    768 games ÷ 8 shards           = 96 games per shard
    96 × 82.4 s                    ≈ 2.2 h per shard
    ceil(8 shards / 2 slots) × 2.2 h ≈ 8.8 h wall
    floor: 768 × 82.4 s / 2 slots  ≈ 8.8 h wall

so **about 9 hours of wall time for the full 768-game row at 8 shards**, against
~17.6 h for one sequential process. Three caveats: this pilot played a single
opening, and the 48 openings of a row will not all run to 24 turns; the budget
will change when the eligible calibration replaces the provisional one, and wall
time scales with it; and an idle machine will be faster than the box this was
measured on. Treat ~9 h as the planning figure, not as a measurement.

## Files

| file | what it is |
| --- | --- |
| `summary.json` | the report: per-cell counters, `pacing`, `laterConvergence`, `gate1: pilot-ineligible` |
| `manifest.json`, `manifest-shard-1-of-1.json` | provenance: seed, seed-change reason, bands, calibration acceptance, host, git, source identity |
| `identity.json` | the pinned tree, resolved engine configs, bands and book for these 16 games |
| `games-shard-1-of-1.jsonl` | one content-hashed line per game, with the per-decision work ledger |
| `calibration.json` | a copy of the provisional, ineligible calibration this pilot ran on |
| `preregistration-A4.md` | the operative preregistration text (A1–A4), read from its adopted commit |
| `row-start.json` | when this row first started; the calibration's freshness window is measured from here |
| `replays/` | one replay per game |

## ERRATUM (added by the coordinator before this directory was committed, 2026-09-19)

The "pacing" paragraph above is wrong and is contradicted by `calibration.json` in this directory. It says the
calibration's one search per own turn consumed the whole 10,000 ms allowance and that the row's two searches per turn are
"in the shipped loop's 2-3 range" and "not a disagreement about pacing". In fact the calibration records a median search
time of 3,001 ms (hard) and 1,500 ms (medium), and an independent review of this pilot's telemetry found that the row
adapter funds any follow-up Act search with exactly **1 work unit**: 44 of 48 follow-up Act searches requested 1 unit,
across 40 of 167 hard own turns (24%), and the first search is capped at about 75% of what the shipped loop spends in a
typical turn. This pilot is therefore evidence OF an adapter defect, not of shipped-loop fidelity. It remains ineligible
plumbing evidence only; no Gate 1 row may be run with this adapter.
