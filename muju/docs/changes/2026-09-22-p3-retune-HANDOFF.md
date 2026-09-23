# Hard AI at `muju-phasing-3`: retune + measurement campaign — HANDOFF (2026-09-22, end of Stage A)

Pause point requested by the owner after Stage A of the weight sweep. A fresh session resumes from
here. The spec is `2026-09-22-p3-retune-SPEC.md` (same directory); nothing in it has been
reopened. Coordinator: Fable session `011K4Nq7cVzTtaEuFv6rNwXb`.

## Where the work is

| What | Where | State |
|---|---|---|
| Campaign branch | `claude/muju-hard-p3-retune` in `~/src/deevgames-p3tune` (from master `0fcd5852`) | pushed; draft PR #30 |
| Lane P (p3 reference, phasing-evidence, A7, Gate 1 adoption) | branch `claude/p3-laneP`, worktree `~/src/deevgames-p3-laneP` | **merged** into the campaign branch (`30e6d288`); report `2026-09-22-p3-retune-laneP.md` |
| Lane S (suite bundle v3) | branch `claude/p3-laneS`, worktree `~/src/deevgames-p3-laneS` | **merged** (`f96a8e6d`); report `2026-09-22-p3-retune-laneS.md` |
| Lane T (weight random search) | branch `claude/p3-laneT`, worktree `~/src/deevgames-p3-laneT` | Stage A complete, **merged** (`57bed3bd`); report `2026-09-22-p3-retune-laneT.md` is lane T's own handoff (read §5–§9 first); progress ledger `docs/hard-ai/phasing/p3-retune-2026-09-22/PROGRESS.md` |
| CI | `gh workflow run deploy.yml --ref claude/muju-hard-p3-retune`, run 35799419186 | **success** on the P+S merge state (no weight change yet) |

All three lane worktrees are merged and disposable. The sweep scripts, 30 weight JSONs (with
`weights/MANIFEST.json`), every Stage A run directory and the prepared Stage B/C plan files live under
`docs/hard-ai/phasing/p3-retune-2026-09-22/` on the campaign branch (16 MB).

## What is done (deliverables 1–3 of the spec)

1. **p3 scripted reference** `lab/harness/results/p3-scripted-2026-09-22/` — 840 games, seed 20260955,
   0 illegal actions, `changedDuringRun []`. 417/840 games reach the kill clock: 408 decided on mined
   total, 9 exact ties. Paired against p2: 423 games identical move-for-move, all 417 differences are
   exactly the games that now hit the shorter clock. `tests/lab/phasing-evidence.test.ts` has the p3
   row `current: true` (10/10).
2. **Amendment A7** appended to `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`, committed alone as
   `2ade2c33` (doc sha256 `7502e2d9…`). It voids every phasing-2 Gate 1/2 readiness state, the p2
   bands and the suite ledger's seq 2 reading; keeps the p1 opening books, A3 budgets/sharding, A5
   calibration and A6's informational Gate 0. Re-frozen bands: purchases/seat `[1.384, 186.929]`;
   inactivity `[0, 0.114]` (now trivially satisfied, stated as such). **The Gate 2 protocol (spec §4:
   rows G2-1..G2-4, seeds 20260975–78, `p1-val`) is preregistered in A7 and must be played exactly
   as written.** `lab/ai/gate1-references.json` is re-adopted at `muju-phasing-3` (`rulesAmendment
   A7`, `AMENDMENT` stays `A3`); `node --import tsx lab/ai/gate1.ts --plan` prints `adopted`. The 16
   `skipIf(!GATE1_ADOPTED)` tests re-armed: `gate1.test.ts` 53/53.
3. **Suite bundle v3** `lab/hard-ai/suites/phasing/fixtures/v3-bundle/` — authored and validated
   (`valid true`, 0 errors, 0 veto refusals), 225 cases / 146 offered units, families tactics 79/63,
   invariants 20/15, home-mate 56/28, economy 30/20, summon-disruption 30/14, home-fortify 10/6.
   Manifest sha256 `da358933…`. Load test un-skipped; `suites-phasing*` 216/216. No floor contract
   written yet (needs the adopted weights' hash).

## Stage A of the weight sweep (lane T) — the pause point

Protocol (spec §3): 24 seeded random samples (`p3-s01..s24`, sampler seed 20260970), 4 hand
variants (`hv-clock`, `hv-mine`, `hv-tier`, `hv-blocks`) and `control` (= shipped
`phasing-hand-priors-v1`), each 8 pairs = 16 games vs `Rush`, `--work fixed:60000`, seed 20260970,
`p1-dev`. **N = 60000** was chosen by probe (mean Hard turn 1.05 s on this box); `control` via
`hard@env` reproduces `hard@desktop` byte-for-byte (same actions, same results, 2 games).

Every one of the 29 arms passed the behaviour filters (spend 91–100%, upkeep-elimination 0–13%,
0 illegal actions), so Stage A is a pure ranking by score, ties broken by mined-total margin. Final
ranking (full table in lane T's report §4 and PROGRESS.md):

| Rank | Arm | W-D-L vs Rush | score | mined hard/Rush | what it is |
|---|---|---|---|---|---|
| 1 | hv-mine | 13-0-3 | 0.813 | 178/142 | hand variant: v1 + PstMine 45, BankExcess 20 |
| 2 | p3-s18 | 11-0-5 | 0.688 | 210/205 | random: PstMine 39, BankExcess 54, all blocks on, tier ~2.2× |
| 3 | hv-blocks | 10-0-6 | 0.625 | 124/155 | hand variant: home + tactical blocks ×1.5 |
| 4 | hv-clock | 10-0-6 | 0.625 | 150/192 | hand variant: DrawPressure −40, Inv16 0, PstMine 30 |
| 5 | p3-s19 | 10-0-6 | 0.625 | 119/176 | random: PstMine 47, TierClimb 344, biggest home block |
| 6 | p3-s08 | 10-0-6 | 0.625 | 80/184 | random: PstMine 10, geometry block off, upkeepElim 13% |
| 7 | p3-s21 | 9-0-7 | 0.563 | 161/202 | random: PstMine 0, TierClimb 772, home block off |
| 8 | p3-s10 | 9-0-7 | 0.563 | 131/173 | random: PstMine 59, geometry off |
| 10 | hv-tier | 8-0-8 | 0.500 | 166/207 | hand variant: tier m 1.7, TierClimb 300 |
| 26 | control | 6-0-10 | 0.375 | 123/230 | shipped `phasing-hand-priors-v1` |
| 29 | p3-s04 | 4-0-12 | 0.250 | 158/277 | worst |

**Stage B set = ranks 1–8 above** (lane T report §5 has every knob value and weight hash).

What Stage A says (lane T report §6, coordinator agrees):
- **PstMine is the strongest visible signal.** The shipped vector never sets it (0). Five of the top
  eight carry PstMine 30–59; the shipped vector and the three worst arms all have it at 0. A live
  reward for holding mining squares gives the search a reason to defend ground, which the cash
  discount knobs alone cannot provide. The top two arms are the only ones that out-mined Rush.
- **The kill-clock knobs are untested so far.** No Stage A game reached the clock (win types were
  elimination, home-checkmate, home-occupation only). DrawPressure and Inv16 vary across the top
  eight without a visible pattern; only the longer `aiv2-hard-turn` games in Stage B/C can show
  whether they matter. Read the winType distribution there for `kill-clock` entries.
- **Bank discount alone does not predict rank** (BankExcess 2..54 across the top eight).
- 16 games per arm is a screen, not evidence (one game = 6 points of score). The robust reading is
  only that the shipped vector sits at rank 26 of 29 in a random sample of its own neighbourhood.
  Nothing here is a strength claim.

Interruptions (lane T report §7, PROGRESS.md): the owner needed the machine at 16:12, the
coordinator killed the sweep (rows s14–s16 finished with `--resume`), lane T ran at one row /
`--shards 2` until 17:04, then finished at full concurrency. Fixed-work rows are unaffected (no
clock); the `load` column is informational. Stage A took about 2 h 20 min of wall time in total.

## How to resume (in order)

1. **Stage B** (spec §3; plan files already generated and committed by lane T, report §8). From
   `~/src/deevgames-p3tune/muju`:
   ```
   MUJU_HEAVY_SLOTS=4 node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
     docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageB-plan-aiv2.json --concurrency 1
   MUJU_HEAVY_SLOTS=8 node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
     docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageB-plan-fixed.json --concurrency 2
   ```
   9 arms (top 8 + control) × {aiv2-hard-turn 16 pairs wall:6000, Rush / Balanced / Expand 8 pairs
   fixed:60000}, seed 20260971. aiv2 rows one at a time (≤4 concurrent games; >5% overruns = VOID).
   Both runs skip finished rows and auto-resume. Rank the 8 arms by aiv2 score + Rush score; drop
   any arm whose Balanced OR Expand score is below control's; keep the top 3.
2. **Stage C** (lane T report §9): top 3 + control on `p1-val.jsonl`, 32 pairs vs `aiv2-hard-turn`
   wall:6000 and 32 pairs vs Rush fixed:60000, seed **20260972**; the plan generator is in
   `scripts/` (needs the three arm names). Winner ONLY from this table by summed score; report
   only these numbers. If no arm beats control on the sum, ship `control` and say so.
3. Expect ~4–5 h of wall time for B + C at 8 slots (aiv2 rows dominate); the owner has asked to be
   consulted before the box is saturated while he is using it.
4. **Adoption** (spec §5): one Sonnet lane on the campaign branch moves the winner into
   `src/ai/hard/eval/weights.ts` as `phasing-kill-clock-v1` (`WEIGHTS_VERSION` stays 2), re-pins the
   tests listed in §5, and the free-capture e2e (`e2e/ai-worker.spec.ts`) must pass.
5. **Gate 0** (perft, fuzz, determinism), **floor contract v4** committed alone, `hard:suite:phasing:measure`
   → ledger seq 3; **Gate 1** row under A7 (calibrate on an idle box); **Gate 2** rows G2-1..G2-4
   exactly as A7 states; release record `docs/hard-ai/RELEASE-2026-09-22-phasing-3.md`; DAG walk
   `python3 tools/muju-content-dag.py plan --kind ai`; PR #30 out of draft; CI; merge; Render + Pages.

Concurrency rule for the shared box: the ladder honours `MUJU_HEAVY_SLOTS` (default 2); 8 slots at
two rows × `--shards 4` saturates the machine and the owner noticed. Ask before going above 4 when
the owner is at the keyboard. Rows against `aiv2-hard-turn` must stay ≤ 4 concurrent games anyway.

Permission note: dispatching `deploy.yml` is classified as a production deploy for the agent; the
owner runs `gh workflow run deploy.yml --ref <branch>` by hand (it only builds and tests: the
Cloudflare step needs a secret the repo does not have).

## Open questions for the owner

- Stage B/C will take roughly 4–5 hours at 8 slots (aiv2 rows at 6 s/turn dominate). Run
  overnight as preregistered, or trim Stage B's aiv2 rows to 8 pairs for selection and keep Stage C
  full? (Trimming Stage B is a selection-stage change, not a claim change; it would be recorded in
  the lane report, not in A7.)
- Given how clearly PstMine separates the field, is a second-round sweep centred on the top arms
  (PstMine 30–60, blocks on, tier premium) worth adding before Stage C, or should Stage C run on the
  preregistered top 3 as is? The spec's answer is "as is"; a second round would be a new stage
  written down before it is run.
- `p1-val` has now been used twice for selection (2026-09-20) and will be used a third time by
  Stage C, then again by Gate 2. The sealed set is the only truly unseen data; the spec keeps it
  sealed. Confirm that stays the rule.

## Resolution (2026-09-23)

This handoff is closed. Everything it queued — Stage B, Stage C, adoption, Gate 0, the floor
contract and suite measure, Gate 2 — was run on 2026-09-23. The text above is left as written; the
outcome is recorded elsewhere and supersedes the open questions.

**Read the release record: [`docs/hard-ai/RELEASE-2026-09-23-phasing-3-retune.md`](../hard-ai/RELEASE-2026-09-23-phasing-3-retune.md).**
The per-row ledger continues in
[`docs/hard-ai/phasing/p3-retune-2026-09-22/PROGRESS.md`](../hard-ai/phasing/p3-retune-2026-09-22/PROGRESS.md),
"Stage D".

In one paragraph: the overnight chain ran Stage B and Stage C as preregistered
(`results/stageBC-decision.json`). On the held-out `p1-val` table that the spec makes the sole
tuning result, **`p3-s08` tied `control`'s summed score exactly (1.234375) and no arm beat it**, so
the preregistered rule ships `control` — **no weight change**. `src/` is therefore byte-identical
to `origin/master` and `DEFAULT_WEIGHTS` stays `phasing-hand-priors-v1`; the adoption step of
"How to resume" §4 became a no-op. Gate 0 ran; its fuzz row failed on a **stale clock fixture**
(repaired at `cdcee23e`) which had been red on shipped master since the kill clock merged — every
engine-vs-replica counter was 0. Floor contract v4 was committed alone and the suite measured at
ledger **seq 3**: earned 126/146, `floorPass false`, invariants 10/14 and economy 7/20 below floor,
informational under A6 and explained in the release record. Gate 2 rows G2-1..G2-4 were played
exactly as A7 wrote them: **G2-1 meets its bar at Elo +293 [+193, +463], LOS 100.0 %**, and no row
recorded an illegal action, a divergence or a fallback. **Gate 1 was not run** — A7 keeps A5's
per-search calibration in force and A5 is still text only, so no valid row is possible until the
owner rules on it.

The three "Open questions for the owner" above are answered by events: Stage B/C ran overnight as
preregistered with no trimming; no second-round sweep was added, so Stage C ran on the
preregistered top 3; and the sealed set stayed sealed throughout.
