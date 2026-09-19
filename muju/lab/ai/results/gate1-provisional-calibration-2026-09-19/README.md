# PROVISIONAL / INELIGIBLE Gate 1 calibration — 2026-09-19

**This is not a row budget.** It exists only so the `muju-phasing-2` plumbing
pilot (`lab/ai/results/gate1-p2-pilot-2026-09-19`) had a measured number to run
on. `calibration.json` declares itself provisional in its own `provisional` block,
and `gate1-calibrate.ts#loadCalibration` refuses it to any run that has not passed
`--provisional-calibration`, which `gate1.ts` in turn allows only for a pilot.

    node --import tsx lab/ai/gate1-calibrate.ts \
      --out lab/ai/results/gate1-provisional-calibration-2026-09-19 \
      --openings 1 --max-turns 6 --turns 6 --provisional "<reason, in the manifest>"

## Why it is ineligible, concretely

A3 §3 asks for the median search work each engine consumes per own turn, measured
in WALL mode at the shipped quick allowance, over the dev openings, **on an
otherwise idle machine**. This sample breaks three of those conditions at once:

* **contended** — 1-minute load 4.52 at start and 4.17 at end on 12 cores, and a
  maximum 5-minute boundary load of 4.54 against the ceiling of 2.0 (= 1.0 for the
  calibration's own thread + 1.0 allowance). In WALL mode a loaded box
  **under-counts** work: the clock runs while the CPU is elsewhere, so these
  medians are low;
* **opening-only** — one dev opening at one handicap, 6 full rounds per game, 6
  own turns per engine. 11 own turns sampled per engine, all from the first few
  turns of one game, where the board is nearly empty;
* **capped** — `turnsPerEngine: 6` stopped the sample after the first game, so
  coverage is 1 of 48 openings at 1 of 2 handicaps.

Recorded budgets: `hard 51423`, `medium 26159` work units per own turn
(`SearchBudget#spend` units, `src/ai/runtime.ts`). Median searches per own turn:
1 for both engines — an artefact of the tiny sample, in which each own turn spent
its whole allowance in a single search.

## What replaces it

The eligible calibration is run later by the coordinator on an **idle** machine:
all 48 dev openings at both handicaps, full-length games (`--max-turns` ≥ 20, no
`--turns` cap), no `--provisional`, and no `--accept-calibration=load` needed at
the row. Every full Gate 1 row must be measured against that manifest. Nothing in
this directory may be used for one.
