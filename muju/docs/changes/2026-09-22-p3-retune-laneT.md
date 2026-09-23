# p3 retune — Lane T (retune: preregistered random search) — HANDOFF

Status: **Stage A complete. Stage B and C NOT started** (coordinator instruction, 2026-09-22 ~17:10,
after two mid-Stage-A concurrency interruptions). This file is written so a fresh session can pick
up Stage B/C with no other context. Everything referenced lives under
`docs/hard-ai/phasing/p3-retune-2026-09-22/` in worktree `~/src/deevgames-p3-laneT`
(branch `claude/p3-laneT`). Do not touch `src/**` or `tests/**` (adoption is the coordinator's step,
SPEC §5).

## 1. N and how it was chosen

Fixed-work probe, `--a hard@env --b Rush`, `control` weights, 2 pairs / 4 games, seed 20260970,
p1-dev (`results/probe/fixed-{40,60,90}k/`):

| N | meanTurnMs (hard@env) | load (1m) |
|---|---|---|
| fixed:40000 | 681.0 | 15.0 |
| **fixed:60000** | **1050.3** | 12.0 |
| fixed:90000 | 1420.1 | 15.4 |

**N = 60000** (closest of the three to the 1.0 s target). All Rush/Balanced/Expand rows use
`fixed:60000`.

## 2. Control-reproduction evidence

`docs/hard-ai/phasing/p3-retune-2026-09-22/weights/control.json` is the exact `DEFAULT_WEIGHTS`
vector (label `phasing-hand-priors-v1`), serialized via the repo's own `serializeWeights` and
verified to hash-match `weightsHash(DEFAULT_WEIGHTS)` at generation time
(`scripts/gen-weights.ts`, hash `14d06ba8`).

Reproduction check (`results/probe/control-check-{desktop,env}/`): one pair (2 games, seat
mirrored), `--a hard@desktop` vs `--a hard@env` + `MUJU_HARD_WEIGHTS=control.json`, both vs Rush,
`fixed:60000`, seed 20260970, `--replays on` (replays deleted after comparison — see §7 file-size
note). Result: **W/D/L identical (0/0/2 both)**; each game's full `actions` array byte-identical
between the two runs (opening `p1-g6-s2`, both seat mirrors); `winner`/`winType`/`completedTurns`
identical (black/elimination/80 and white/elimination/61). **`hard@env` + control.json reproduces
`hard@desktop` exactly.** This confirms the `MUJU_HARD_WEIGHTS` -> `hard@env` hook
(`lab/hard-ai/bots/hard.ts:315-325`) is weights-only and label-scoped as documented — no other
config differs between the two engine names.

## 3. Weight generation (seeded, reproducible)

`scripts/gen-weights.ts`, seed 20260970 (mulberry32 PRNG), generates:
- **24 random arms** (`p3-s01`..`p3-s24`) per SPEC §3's 11 knobs.
- **4 hand variants**: `hv-clock`, `hv-mine`, `hv-tier`, `hv-blocks`.
- **`control`**: exact production `DEFAULT_WEIGHTS`.

Verified reproducible: re-running the generator produces byte-identical JSON files (only the
`MANIFEST.json` `generatedAt` timestamp differs). Every weight file round-trips through
`loadWeights`/`weightsHash`; no two sampled/hand arms share a hash.

**Base ingredient** for every block-scaled feature is `phasing-priors-v1` (the feature-audit's
recommended vector, `docs/hard-ai/phasing/repair-2026-09-20/weights/phasing-priors-v1.json`, hash
`fd5a13e5`) — **NOT** production `DEFAULT_WEIGHTS`/`phasing-hand-priors-v1` (a different,
Standard-era-derived vector; the two "v1" names are a real, confusing naming collision in the
source docs, not a typo here). The random-search plan in
`repair-2026-09-20/reports/knobs/synthesis.json` names "the v1 values" for the home/tactical/
geometry blocks, and that vector (`phasing-priors-v1`) is what "v1" means throughout that doc and
`make-variants.ts`.

**Interpretive decision** (documented in `gen-weights.ts`'s header): SPEC's kill-clock knobs 9-11
(DrawPressure, Inv16ClockDiscipline, PstMine) are new relative to the repair-2026-09-20 plan, which
had folded those three into its "geometry/structure block". Since SPEC now samples them
independently, `GEOMETRY_BLOCK` (knob 7's "g" scale) here is the original geometry set **minus**
those three: `SpawnArea, SpawnZero, AnchorDepth, AnchorFragility, BlockingDeficit,
CornerInfiltration, Inv13Turtle`. This avoids a knob-7 draw being silently overwritten by knobs
9-11 or vice versa. Feature indices used (from `eval/features.ts`): `DrawPressure` = 18 (stage 1),
`PstMine` = 5 (stage 1), `Inv16ClockDiscipline` = 53 (stage 2). `DrawPressure`'s feature value is
already sign-flipped for the kill clock (`features.ts:392-403`: `-sign(minedLead)*pressure`), so a
more-negative weight now rewards the mining leader, per SPEC's note. `Inv16ClockDiscipline` still
triggers on `leadCc` (material+bank lead, `invariants.ts:258-289`), which predates the kill clock —
sampled as SPEC directs (0 w.p. .5 else U[-300,0]) but its trigger condition is stale; a future
campaign should retune the trigger itself, not just the weight (noted, not fixed here — out of
scope, `src/**` is read-only for this lane).

## 4. Stage A: full table (complete, PROGRESS.md has the authoritative copy)

29 arms x 8 pairs (16 games) vs Rush, `fixed:60000`, seed 20260970, p1-dev, `--handicaps 0`.
**Behaviour filters (spend<50%, upkeepElim>15% of games, any illegal action) discarded NONE of the
29 arms**: spend ranged 91-100%, upkeepElim topped out at 13%, illegal actions were 0 everywhere.
Every arm is a legitimate, fully-spending, rules-clean engine — Stage A came down to a pure
score/mined-margin ranking. **Zero draws in all 464 Stage-A games** (Rush games are short
elimination/home-checkmate contests; the kill clock was never exercised against Rush — expect it
to matter more against `aiv2-hard-turn` in Stage B/C, which plays longer games).

| Rank | Arm | W-D-L | score | spend% | promo/g | mined(hard/Rush) | margin | upkeepElim% |
|---|---|---|---|---|---|---|---|---|
| 1 | hv-mine | 13-0-3 | 0.813 | 91% | 3.38 | 178/142 | +36 | 0% |
| 2 | p3-s18 | 11-0-5 | 0.688 | 97% | 3.69 | 210/205 | +5 | 0% |
| 3 | hv-blocks | 10-0-6 | 0.625 | 95% | 3.56 | 124/155 | -31 | 0% |
| 4 | hv-clock | 10-0-6 | 0.625 | 96% | 3.31 | 150/192 | -42 | 0% |
| 5 | p3-s19 | 10-0-6 | 0.625 | 95% | 3.69 | 119/176 | -57 | 6% |
| 6 | p3-s08 | 10-0-6 | 0.625 | 91% | 3.13 | 80/184 | -104 | 13% |
| 7 | p3-s21 | 9-0-7 | 0.563 | 97% | 4.19 | 161/202 | -41 | 0% |
| 8 | p3-s10 | 9-0-7 | 0.563 | 98% | 3.06 | 131/173 | -42 | 6% |
| 9 | p3-s13 | 9-0-7 | 0.563 | 98% | 3.94 | 157/202 | -45 | 0% |
| 10 | hv-tier | 8-0-8 | 0.500 | 95% | 4.19 | 166/207 | -41 | 0% |
| 11 | p3-s11 | 8-0-8 | 0.500 | 98% | 4.00 | 153/196 | -43 | 0% |
| 12 | p3-s17 | 8-0-8 | 0.500 | 98% | 4.88 | 156/213 | -57 | 6% |
| 13 | p3-s20 | 8-0-8 | 0.500 | 97% | 5.06 | 132/196 | -64 | 0% |
| 14 | p3-s24 | 7-0-9 | 0.438 | 96% | 5.13 | 189/211 | -22 | 0% |
| 15 | p3-s14 | 7-0-9 | 0.438 | 95% | 3.94 | 189/244 | -55 | 0% |
| 16 | p3-s06 | 7-0-9 | 0.438 | 97% | 4.31 | 155/227 | -72 | 0% |
| 17 | p3-s12 | 7-0-9 | 0.438 | 97% | 5.19 | 139/224 | -85 | 0% |
| 18 | p3-s09 | 7-0-9 | 0.438 | 95% | 3.81 | 101/203 | -102 | 6% |
| 19 | p3-s15 | 7-0-9 | 0.438 | 96% | 3.56 | 108/211 | -103 | 6% |
| 20 | p3-s22 | 7-0-9 | 0.438 | 99% | 4.06 | 133/249 | -116 | 6% |
| 21 | p3-s07 | 7-0-9 | 0.438 | 97% | 4.19 | 90/218 | -128 | 13% |
| 22 | p3-s03 | 6-0-10 | 0.375 | 96% | 5.13 | 135/216 | -81 | 13% |
| 23 | p3-s05 | 6-0-10 | 0.375 | 96% | 3.69 | 145/226 | -81 | 0% |
| 24 | p3-s16 | 6-0-10 | 0.375 | 95% | 3.75 | 141/237 | -96 | 0% |
| 25 | p3-s23 | 6-0-10 | 0.375 | 99% | 4.06 | 158/262 | -104 | 0% |
| 26 | control | 6-0-10 | 0.375 | 94% | 2.00 | 123/230 | -107 | 0% |
| 27 | p3-s02 | 5-0-11 | 0.313 | 97% | 4.50 | 202/263 | -61 | 0% |
| 28 | p3-s04 | 4-0-12 | 0.250 | 100% | 4.94 | 158/277 | -119 | 13% |
| 29 | p3-s01 | 4-0-12 | 0.250 | 99% | 5.69 | 134/278 | -144 | 0% |

`control` (production `DEFAULT_WEIGHTS`) ranks **26th of 29** — matches the historical repair
evidence (12-0-20 over 32 games = 0.375 vs Rush at 1.5s wall, `repair-2026-09-20/HANDOFF.md`), a
good sanity cross-check that Stage A behaves as expected. Every random/hand arm beating control
this decisively means the cash discount alone is not the whole story here — see §6.

## 5. Stage B set (top 8, knobs)

**hv-mine, p3-s18, hv-blocks, hv-clock, p3-s19, p3-s08, p3-s21, p3-s10** (ranked, ties broken by
mined-margin). Full knob values (from `weights/MANIFEST.json`, also readable directly from each
arm's own `weights/<arm>.json`):

- **hv-mine** (hash `284621fd`): hand variant, V1 base with `PstMine=45, BankExcess=20`.
- **p3-s18** (hash `c8c0abcb`): `BankExcess=54, BankLiquid=71, TierClimb=0, RentShortfall=-221,
  DrawPressure=-7, Inv16=-226, PstMine=39`, home/tactical/geometry blocks all present (h,t,g > 0
  in the sample), tier premium ~2.2x (`SpawnZero=-879` etc. imply a large geometry scale).
- **hv-blocks** (hash `a421cd9c`): hand variant, V1 base with home/tactical blocks x1.5.
- **hv-clock** (hash `becbcac2`): hand variant, V1 base with `DrawPressure=-40, Inv16=0,
  PstMine=30`.
- **p3-s19** (hash `fda0ac4e`): `BankExcess=46, BankLiquid=97, TierClimb=344, RentShortfall=-158,
  DrawPressure=-20, Inv16=-281, PstMine=47`, all three blocks present and large (HomeInvaded
  -6419 — the biggest home-safety scale in the whole batch).
- **p3-s08** (hash `2eab6af2`): `BankExcess=30, BankLiquid=86, TierClimb=0, RentShortfall=-370,
  DrawPressure=-52, Inv16=0, PstMine=10`, home+tactical blocks present, geometry block OFF (g=0 --
  no SpawnArea/SpawnZero/etc terms sampled).
- **p3-s21** (hash `6c91f6a0`): `BankExcess=9, BankLiquid=71, TierClimb=772, RentShortfall=-483,
  DrawPressure=-18, Inv16=-296, PstMine=0`, tactical+geometry present, home block OFF.
- **p3-s10** (hash `9d66366d`): `BankExcess=2, BankLiquid=91, TierClimb=0, RentShortfall=-104,
  DrawPressure=-55, Inv16=0, PstMine=59` (highest PstMine of any arm), home+tactical present,
  geometry OFF.

## 6. Reading Stage A: why these arms lead

- **PstMine (mining-square positional value) is the strongest visible signal.** 5 of the top 8
  have PstMine in [39, 59] (s18, s19, s10, hv-mine's hand-set 45, hv-clock's hand-set 30); the two
  without it meaningfully (p3-s08=10, p3-s21=0) still rank well but sit at the bottom of the top-8
  band (rank 6-7). `control` and the weakest arms (s01, s04, s02) all have `PstMine` at its
  bootstrap value (0, since `DEFAULT_WEIGHTS` never sets it — see `weights.ts:40-58`, `PstMine`
  is not among the pins). This is consistent with the HANDOFF's root-cause diagnosis (hoarding /
  under-promoting): a live mining-square reward gives the search a reason to defend and hold
  ground even without an immediate promotion payoff, which the pure cash-discount knobs (1-2)
  cannot provide.
- **Mined-total margin correlates with rank but is not the ranking variable** (score is, by SPEC).
  The top 2 (hv-mine +36, s18 +5) have positive mined margins — they out-mine Rush, not just out-
  win it. Every other Stage-A arm has a *negative* mined margin despite winning more than half
  their games against Rush: Rush is a fast, low-value-per-turn scripted bot, so the Hard side wins
  by kills/home-checkmate well before out-mining it in a 40-60-turn game. This matters for Stage
  B/C: `aiv2-hard-turn` games run longer (~15-25 turns at 6s per the SPEC's smoke test, but
  historically slower-paced economically), so the mined-margin/kill-clock signal should show up
  more.
- **No kill-clock endings occurred against Rush** (winTypes seen: `elimination`, `home-checkmate`,
  `home-occupation`; zero `kill-clock`, zero draws). Knobs 9-11 (DrawPressure, Inv16,
  PstMine) were sampled and do vary across arms, but Stage A vs Rush cannot distinguish whether
  they're pulling their weight *as kill-clock knobs* — that test only becomes real in Stage B/C
  against `aiv2-hard-turn`, whose games are long enough to approach the 10-ply inactivity limit.
  Read the winType distribution in Stage B/C games specifically for `kill-clock` entries.
- **Bank-discount aggressiveness does not predict rank on its own.** BankExcess spans the full
  sampled range in the top 8 (2 to 54) with no monotonic relationship to score — e.g. p3-s10
  (BankExcess=2, most conservative) ties for rank 7-8 while p3-s01 (BankExcess=14, moderate) is
  dead last. The positional/kill-clock knobs appear to matter more than the raw cash-discount axis
  once BankExcess is anywhere in a reasonable band (control's BankExcess=25 is itself mid-range and
  still loses to nearly everything).

## 7. Interruption history (for the DAG / audit trail)

1. **~15:18-16:12**: Stage A launched two rows at a time, `--shards 4`, `MUJU_HEAVY_SLOTS=8` (per
   original SPEC default). Reached 22/29 complete when the coordinator killed all sweep/ladder
   processes because the owner needed the machine (system load had also independently spiked to
   150-215 at times, apparently from other activity on the shared box, not from this lane's own
   process count — this lane never exceeded its 8-slot heavy-queue allocation, verified via
   `lab/hard-ai/ladder/heavy.ts --status` and `ps aux` during the spike). Three rows were left
   incomplete on disk: `p3-s14` (6/8 pairs, exited nonzero, logged as a stale `FAILED` line in
   PROGRESS.md directly above the "Concurrency reduced 16:12" heading — the REAL p3-s14 result is
   the W-D-L 7-0-9 line further down; ignore the FAILED one when reading the table), `p3-s15` and
   `p3-s16` (0 pairs, just spawned).
2. **16:12-17:04**: reduced to one row at a time, `--shards 2`, `MUJU_HEAVY_SLOTS=2` per
   coordinator directive. `sweep.ts` was extended to detect a partially-done row (`manifest.json`
   present, not complete) and pass `--resume` automatically rather than restart it. Finished
   `p3-s14` (resumed), `p3-s15`, `p3-s16`, then `p3-s17`..`p3-s24` fresh, all at reduced
   concurrency. Load stayed in the 3-8 range throughout this window.
3. **17:04**: coordinator reported the owner released the CPU; restored two rows /
   `--shards 4` / `MUJU_HEAVY_SLOTS=8` for the last 3 Stage A rows. One further wrinkle: killing
   the single-concurrency orchestrator process left its already-spawned child (`hv-clock`,
   `--shards 2`) running as an orphan; rather than kill a row already 25s into its work, it was
   left to finish on its own (completed cleanly, logged normally), and the full-concurrency sweep
   was launched only once `hv-clock` was confirmed complete, to avoid two processes writing the
   same `--out` directory concurrently. `hv-mine`/`hv-tier` ran as the next pair, `hv-blocks` last.
4. **17:16-17:18**: Stage A genuinely complete (29/29 distinct arms; the PROGRESS.md line count of
   29 briefly included the stale `p3-s14` FAILED duplicate before `hv-blocks` finished, so a naive
   "count >= 29" check reported done one row early — corrected before this report was written).
5. **This session stops here** per coordinator instruction: Stage B/C plans are generated
   (`scripts/gen-plan-stageB.ts` already run; `stageB-plan{,-aiv2,-fixed}.json` committed) but no
   Stage B row has been played.

**Machine note for whoever resumes**: this is a shared macOS box (`uptime` reports "17 users";
load averages of 100-200+ were observed transiently and independently of this lane's own process
count more than once). Always check `uptime` and `lab/hard-ai/ladder/heavy.ts --status` before
raising concurrency, and check PROGRESS.md's most recent "Concurrency ..." heading for the
currently-authorized `--shards`/`MUJU_HEAVY_SLOTS`/`--concurrency` values before launching
anything — do not assume the SPEC's original numbers (2 rows/`--shards 4`/`MUJU_HEAVY_SLOTS=8`)
are still authorized without checking.

## 8. Exactly how to resume Stage B

Plans are already generated and committed:
`docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageB-plan.json` (all 36 rows: 9 arms x
{aiv2-hard-turn, Rush, Balanced, Expand}), and split versions `stageB-plan-aiv2.json` (9 rows, one
per arm vs aiv2-hard-turn, 16 pairs, wall:6000, seed 20260971) / `stageB-plan-fixed.json` (27 rows,
9 arms x {Rush, Balanced, Expand}, 8 pairs each, fixed:60000, seed 20260971).

**Run the aiv2 rows ONE AT A TIME** (SPEC: aiv2-hard-turn rows must stay at <=4 concurrent games,
i.e. one row with `--shards 4`, never two rows at once):
```
cd muju
MUJU_HEAVY_SLOTS=4 node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
  docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageB-plan-aiv2.json --concurrency 1
```
**Run the fixed-work rows** (Rush/Balanced/Expand, cannot be VOID) at whatever concurrency the
current coordinator directive authorizes — SPEC default is two at a time:
```
MUJU_HEAVY_SLOTS=8 node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
  docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageB-plan-fixed.json --concurrency 2
```
Both are independently re-runnable/resumable (same skip-if-complete / auto-`--resume` logic as
Stage A). Order between the two files does not matter.

**After both finish**, rank the 8 non-control arms by the SUM of their aiv2-hard-turn score and
Rush score (read `metrics.json`'s `strata[0].score` in each `results/stageB/<arm>-aiv2-hard-turn/`
and `.../<arm>-Rush/`, or extend `sweep.ts`'s `computeBehaviour`/`logRow` helpers to print a
per-arm summed line). **Drop any arm whose Balanced score OR Expand score is below control's** —
that is SPEC's regression guard (a Rush counter-strategy, not genuine strength). Keep the top 3 of
what remains for Stage C.

## 9. Exactly how to resume Stage C

1. Edit `scripts/gen-plan-stageC.ts`'s `TOP3` array with the real Stage B survivors (it currently
   refuses to run with the `FILL-IN-*` placeholders — this is deliberate, not a bug).
2. `node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/gen-plan-stageC.ts` writes
   `stageC-plan-aiv2.json` (4 arms incl. control, 32 pairs vs aiv2-hard-turn, wall:6000, seed
   20260972, p1-val, shards 4) and `stageC-plan-fixed.json` (4 arms, 32 pairs vs Rush, fixed:60000,
   seed 20260972, p1-val, shards 4).
3. Run aiv2 rows one at a time (same reasoning as Stage B; SPEC explicitly requires timing
   validity here and says to re-run at LOWER concurrency, not higher, if a row comes back VOID):
   ```
   MUJU_HEAVY_SLOTS=4 node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
     docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageC-plan-aiv2.json --concurrency 1
   ```
   If any row's `summary.md` reports VOID (`overrunRate` > 5% for either arm), delete that row's
   output directory and re-run it alone with `--shards 2` or `1` before accepting the result — do
   not average over a VOID row.
4. Run fixed rows (cannot be VOID) at the currently-authorized concurrency:
   ```
   MUJU_HEAVY_SLOTS=8 node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
     docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageC-plan-fixed.json --concurrency 2
   ```
5. **The winner is chosen ONLY from this Stage C table**, by summed score (aiv2 + Rush) — report
   ONLY these numbers as the tuning result (SPEC's winner's-curse note: the Stage A/B numbers of a
   multi-arm screen are inflated by ~2 SE). If no candidate beats `control` on the sum, the
   campaign result is "ship control, no weight change" — say so plainly, that is a valid, useful
   outcome of a preregistered search.
6. Write the Stage B and Stage C tables into PROGRESS.md (same format as Stage A's), commit, and
   extend this lane report (or write a fresh dated one) with the Stage B/C tables, the winner's
   full knob list and weights-file path, and the "why it wins" reading (mined totals, kill-clock
   vs elimination endings — Stage B/C should finally show `kill-clock` winTypes, unlike Stage A).
