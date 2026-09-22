# Hard AI at `muju-phasing-3`: retune + measurement campaign — SPEC (2026-09-22)

Owner request (Ethan, 2026-09-22 afternoon): "execute on the next Hard AI piece — the retune and
measurement campaign under phasing-3". This is the campaign the kill-clock record
(`2026-09-22-kill-clock.md`, "Deferred by owner decision") named. Branch
`claude/muju-hard-p3-retune` from master `0fcd5852`, worktree `~/src/deevgames-p3tune`.
Coordinator: the Fable session `011K4Nq7cVzTtaEuFv6rNwXb`. Lanes are Sonnet agents in sibling
worktrees cut from this branch; each lane owns disjoint files (§6) and reports in
`docs/changes/2026-09-22-p3-retune-lane<X>.md`.

NOT in scope: the Academy re-voice of R09/R10 and the fifteen rename lessons (separate campaign);
opening the sealed opening set (`~/src/deevgames-wizards/sealed/`, owner-only, consumed once);
any change to rules, pieces or the canonical engine (`src/game/**` is read-only here).

## 0. Facts the campaign rests on (verified 2026-09-22, do not re-derive)

- Rules revision `muju-phasing-3`: ten kill-free plies end the game, higher mined total wins
  (Black's handicap folded in), tie = draw, `#` withheld at c ≥ 9. Hard engine is rules-correct
  (perft, fuzz, cross-engine tests green at master). Every phasing-2 strength number is historical.
- `DEFAULT_WEIGHTS` = `phasing-hand-priors-v1` (`src/ai/hard/eval/weights.ts:32-75`,
  `WEIGHTS_VERSION 2`, `weightsHash 14d06ba8`). The pending-summon scorer credit is unconditional
  (HANDOFF next-step 1 is DONE; its results table and env-hook recipe are stale).
- `DrawPressure` (`eval/features.ts:393-403`) is `-sign(minedLead)·clock²·100/limit²` so that the
  frozen weight `-8` rewards the mining leader. `Inv16ClockDiscipline` (`-200`) still computes on
  the material+bank lead (`leadCc`), i.e. its trigger predates the kill clock. `KILL_CLOCK_SOFT_CC`
  = ±200 cc for clock verdicts more than two hand-offs beyond the root (`eval/evaluate.ts:209`) —
  a constant, not a weight; out of scope for the sweep, noted as follow-up.
- `MUJU_HARD_WEIGHTS=<abs path>.json` applies ONLY to `--a hard@env` / `--b hard@env`
  (`lab/hard-ai/bots/hard.ts:317-322`). Ladder engine names are bare: `Rush`, `Expand`,
  `Balanced`, `aiv2-hard-turn`, `aiv2-hard`, `hard@desktop`, `hard@ablate:<arm>`, `hard@env`.
- Opening corpora `lab/hard-ai/ladder/openings/p1-dev.jsonl` (48) and `p1-val.jsonl` (32) are
  valid at phasing-3 (clock = 1 at every root); bytes and file sha `a58ca9d8…` unchanged; only
  gameplay digests moved. Do NOT regenerate. `p1-val` has been looked at twice (2026-09-20 rows).
- Amendments A1–A6 exist in `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`; the next is
  **A7**. Gate 1 (`lab/ai/gate1.ts`) refuses to run until an adopted record at phasing-3 exists.
- Smoke at master 0fcd5852, phasing-3 (scratch, not evidence): `hard@desktop` vs `Rush`,
  wall:1500, 2 pairs: 0–0–4 by elimination, Hard mined ~90 vs Rush ~350 per game; vs
  `aiv2-hard-turn` wall:6000 first two games: 2 wins (elimination t21, home-checkmate t15).
  Zero illegal actions / fallbacks in all games. Games: ~50–60 turns vs Rush (~75 s at
  1.5 s), ~15–25 turns vs aiv2 (~100 s at 6 s).
- Machine: 12 cores, shared. Heavy queue `~/.local/state/muju-heavy` (`MUJU_HEAVY_SLOTS`, default
  2; set 8 for sweeps, ≤4 for any row whose timing must be valid). Spotlight re-indexes new
  worktrees (load spikes to 40 for ~10 min after `npm ci`) — wait for load < 4 before timed rows.
  A row is VOID when either arm's `overrunRate` > 5% (`ladder/run.ts:285`); `--work fixed:N`
  rows cannot be VOID.

## 1. Deliverables (definition of done)

1. **p3 scripted reference campaign** `lab/harness/results/p3-scripted-2026-09-22/` played at
   phasing-3; `tests/lab/phasing-evidence.test.ts` rows live again (`current: true` for p3).
2. **Amendment A7** appended to `PHASING-PREREGISTRATION-2026-09-18.md` (never a new file),
   committed alone; `lab/ai/gate1-references.json` re-adopted at phasing-3 with p3 bands;
   the 16 `skipIf(!GATE1_ADOPTED)` tests re-armed and green.
3. **Suite bundle v3** authored at phasing-3 (`lab/hard-ai/suites/phasing/fixtures/v3-bundle/`),
   validated, load test un-skipped, `KILL_CLOCK_ARTIFACT_EDITS` emptied.
4. **Retuned `DEFAULT_WEIGHTS`** (label `phasing-kill-clock-v1`) chosen by the preregistered
   procedure in §3, adopted in source with every pin moved, the free-capture e2e
   (`e2e/ai-worker.spec.ts:89`) still passing.
5. **Floor contract v4** committed alone, then `hard:suite:phasing:measure` → ledger seq 3.
6. **Gate 0** items (perft, fuzz, determinism, suites, zero fallbacks) recorded; **Gate 1** row
   under A7 on the retuned build; **Gate 2** claim rows (§4) on `p1-val`, reported with Elo
   interval, LOS, seeds, identity hashes, timing validity.
7. **Release record** `docs/hard-ai/RELEASE-2026-09-22-phasing-3.md` (new dated file), the
   coordinator change record `docs/changes/2026-09-22-p3-retune.md`, DAG walk
   (`python3 tools/muju-content-dag.py plan --kind ai`) with every node dispositioned, PR to
   master, CI green, merge, Render + Cloudflare Pages deploy, live verification.

## 2. Lane P — prep: p3 campaign, phasing-evidence, A7, Gate 1 adoption

Owns: `lab/harness/results/p3-scripted-2026-09-22/**`, `tests/lab/phasing-evidence.test.ts`,
`lab/harness/**` (edit only if the p3 output is wrong — every runner edit is a declared drift
on the p1 AND p2 rows), `lab/hard-ai/analyze/replay.ts` (`RULE_WIN_TYPES`, lane-2 decision #6),
`lab/ai/gate1-sources.ts`, `lab/ai/gate1-references.json`, `tests/lab/gate1.test.ts`,
`docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md` (append A7 only), `docs/changes/2026-09-22-p3-retune-laneP.md`.

Steps, in order:

1. `node --import tsx lab/harness/phasing-round-robin.ts lab/harness/results/p3-scripted-2026-09-22`
   on an idle box (~45 s; check `uptime` first, record `totals.endLoad`). Verify `manifest.json`
   `rulesVersion muju-phasing-3`, `inactivity {limitPlies 10, warningPlies 7}`, 840 games,
   `changedDuringRun []`. Add `REPORT.md` + `SHA256SUMS` in the p2 style. Inspect the bands:
   kill-clock endings appear as `winType 'kill-clock'`; `inactivityDraw` stays false (coordinator
   decision 3 of the kill-clock record: it means an actual inactivity draw; a kill-clock ending
   is `winType`). Count kill-clock endings and ties and put the numbers in the lane report.
2. `tests/lab/phasing-evidence.test.ts`: add the p3 row (`current: true, edits: {}`), keep p1/p2
   rows `current: false` with their edit lists; in the dormant block replace the 20/17 literals
   with `INACTIVITY_LIMIT`/`INACTIVITY_WARNING` imports, and the draw predicate with
   `winType === 'kill-clock'` (ties and wins alike end at exactly `maxInactivityPlies === 10`).
   Never loosen an equality into a truthiness check.
3. Draft **A7** in the preregistration doc, same form as A4 (rules revision change) plus the
   Gate 2 protocol of §4 verbatim (seeds, openings, budgets, bars, what is void). State what A7
   voids (every phasing-2 row, the ledger seq 2 reading, the p2 bands) and what it keeps (p1
   corpora, A3 budgets/sharding, A5 per-search calibration, A6 informational Gate 0). Commit
   the doc ALONE (`docs: A7 …`), record the commit hash.
4. `lab/ai/gate1-sources.ts`: `BANDS_PATH` → p3 `sanity-bands.json`, p2 → `SUPERSEDED_BANDS_PATH`
   (reword the `loadBands` error that names the ten-ply clock). `gate1-references.json`:
   `rulesVersion muju-phasing-3`, `bands{path, sha256, rulesVersion, frozenBy.commit}`,
   `bandsSha256`, p2 → `supersededBands`, `rulesAmendment{id 'A7', commit, path, sha256,
   rulesVersion, voids}`, A4 → `supersededAmendments`. `amendment.id` stays `A3` unless the
   PROTOCOL changes (it does not). `tests/lab/gate1.test.ts`: `:78` must pass both before and
   after; re-word `:303` ("re-frozen under the 20-ply clock"); all 16 skips re-arm.
5. Gates: `npx vitest run tests/lab/phasing-evidence.test.ts tests/lab/gate1.test.ts
   tests/lab/openings-p1.test.ts tests/lab/phasing-harness.test.ts tests/lab/analyze-phasing.test.ts`
   green; `npm run hard:types` clean. Then `node --import tsx lab/ai/gate1.ts --help` (or the
   documented invocation) shows Gate 1 now ACCEPTS the revision (do not run a full row here;
   that is §5 on the retuned build). Commit per step with clear messages.

## 3. Lane T — retune: preregistered random search (dev only)

Owns: `docs/hard-ai/phasing/p3-retune-2026-09-22/**` (scripts, weights, results summaries,
campaign notes), `docs/changes/2026-09-22-p3-retune-laneT.md`. Does NOT touch `src/**` or
`tests/**` (adoption is §5, after the coordinator's review of the winner).

Design (from `repair-2026-09-20/reports/knobs/synthesis.json#randomSearchPlan`, extended for the
kill clock). Read `eval/features.ts` and `eval/weights.ts` first; record the feature indices used.

**Knobs** (a sample = one weights JSON, `WEIGHTS_FILE_SCHEMA muju-weights-phasing-v1`, version 2,
label `p3-s<NN>`; write with `saveWeights`/the repair's `make-variants.ts` pattern):
1. BankExcess int-U[0,60]; 2. BankLiquid [60,100]; 3. tier premium m on tiers 2–3 log-U[1.3,2.5]
(tier 1 fixed at cost×100); 4. TierClimb 0 w.p. .5 else U[100,800]; 5–7. home / tactical /
geometry block scales, each 0 w.p. .2 else log-U[0.4,2.5] × the v1 values; 8. RentShortfall
U[−600,0] (`Inv7PromoteNoRunway` fixed −600);
**kill-clock knobs, new:** 9. DrawPressure weight U[−80,0] (more negative = stronger reward for
leading as the clock rises, because the feature is negated); 10. Inv16ClockDiscipline 0 w.p. .5
else U[−300,0]; 11. PstMine 0 w.p. .5 else U[0,60] (the mining lead is now the verdict; read
the feature before including it, drop it with a stated reason if it is dead).
Fixed: PendingValue 1, Material 100, EconDelta 100, tier-1 material, zeros on Rent (never the old
−422), BankConvertible, ElementCoverage, Inv1–6/12/14/19/20 and the other dead features the plan
lists. **Hand variants** (4, in addition to the random ones): `hv-clock` (DrawPressure −40, Inv16
0, PstMine 30, rest v1); `hv-mine` (PstMine 45, BankExcess 20, rest v1); `hv-tier` (m 1.7,
TierClimb 300, rest v1); `hv-blocks` (home 1.5, tactical 1.5, rest v1). Controls: `control` =
exact `phasing-hand-priors-v1` as a JSON (must reproduce `hard@desktop` — verify one pair
identical), and the `weights-bank100` ablate arm as the second reference.

**Budget.** Pick fixed work N by a 4-game probe (`--work fixed:N`, choose N ∈ {40k, 60k, 90k}
so mean Hard turn ≈ 1.0 s on this box at ≤4 concurrent games); record N. All Rush / Balanced /
Expand rows use `fixed:N` (cannot be VOID, reproducible). `aiv2-hard-turn` rows use `wall:6000`
with ≤4 concurrent shards; a VOID selection row is acceptable but must be reported as VOID.

**Stage A (screen).** 24 random + 4 hand + control = 29 arms, each `--a hard@env --b Rush
--work fixed:N --handicaps 0 --pairs 8 --seed 20260970 --openings p1-dev.jsonl --replays off`,
identical seed for all. `MUJU_HEAVY_SLOTS=8`, two runs at a time with `--shards 4`. Read
behaviour first (`stats.mjs`: spend %, promotions/game, gained per side, loss types): discard
spend < 50%, upkeep-elimination > 15% of games, any illegal action / divergence / fallback.
Keep top 8 by score, ties broken by mined-total margin.

**Stage B (confirm on dev).** 8 survivors + control: 16 pairs vs `aiv2-hard-turn` wall:6000
seed 20260971, and 8 pairs vs Rush `fixed:N` seed 20260971. Rank by summed score. Regression
guard: 8 pairs each vs Balanced and Expand `fixed:N` seed 20260971 — a candidate that falls
below control there is a Rush counter-strategy, drop it. Keep top 3.

**Stage C (select on held-out).** Top 3 + control on `p1-val.jsonl`: 32 pairs vs `aiv2-hard-turn`
wall:6000 seed 20260972 (≤4 shards, timing must be valid; re-run at lower concurrency if VOID),
32 pairs vs Rush `fixed:N` seed 20260972. The winner is chosen ONLY from this table by summed
score; report ONLY these numbers as the tuning result (winner's-curse note). If no candidate
beats control on the sum, the campaign ships `control` (no weight change) and says so.

Every run dir keeps `summary.md` + `metrics.json` + `games.jsonl` under
`docs/hard-ai/phasing/p3-retune-2026-09-22/results/<stage>/<arm>-<opp>/` (no replays). A single
`PROGRESS.md` accumulates one line per row as rows finish (so the coordinator can read state
without the transcript). The sweep script (`scripts/sweep.ts` or `.mjs`) must be re-runnable and
skip finished rows. Note: Lane S's bundle authoring shares the heavy queue; it is expected.

## 4. Gate 2 claim protocol (preregistered in A7 before any row is played)

Retuned build = master-descended commit with the adopted `DEFAULT_WEIGHTS` (§5). Rows, all
phasing-3, handicap 0, seat-mirrored, `p1-val.jsonl` all 32 openings, ≤4 concurrent shards,
load recorded, timing must be valid:

| Row | A | B | Work | Seed | Bar |
|---|---|---|---|---|---|
| G2-1 | `hard@desktop` (retuned) | `aiv2-hard-turn` | wall:6000 | 20260975 | Elo lower bound > 0 at 95% (LOS ≥ 97.5%); report point estimate |
| G2-2 | `hard@desktop` (retuned) | `Rush` | wall:1500 | 20260976 | informational: report score; note vs the 2026-09-20 best 13–0–19 (phasing-2, historical) |
| G2-3 | `hard@desktop` (retuned) | `hard@env` = `phasing-hand-priors-v1` JSON | fixed:N | 20260977 | score > 50% with LOS ≥ 95%; this is the retune effect |
| G2-4 | `hard@desktop` (retuned) | `aiv2-hard` (per action) | wall:1500 | 20260978 | informational; expected VOID on opponent overrun |

Seeds 20260970–20260978 are fresh (A3 used 20260960–62; RR 20260955). `p1-val` is the
held-out set, previously seen twice; the sealed set stays sealed. Rows with any illegal action,
divergence or fallback are void. Do not pool rows across identity hashes.

## 5. Adoption, Gate 0, Gate 1, suites measure (coordinator + one Sonnet lane, after §3)

1. Coordinator reviews the Stage C table and the winner's behaviour lines, then approves the
   vector (or `control`).
2. `src/ai/hard/eval/weights.ts`: new `W`, label `phasing-kill-clock-v1`, comment naming this
   campaign; `WEIGHTS_VERSION` stays 2 (schema unchanged). Move every pin: `tests/ai/hard/eval.test.ts`
   (`:166`, `:249`, `:333-362` incl. `weightsHash`), `tests/ai/hard/fixtures/hand-priors-nonzero.ts`,
   `tests/lab/ablate.test.ts` hashes (keep old as `…_PHASING_3_HAND_PRIORS` historical constants),
   `baseline-identity`, `phasing-bootstrap`, `interfaces`, `lazy`, `iter-fit`, `eval-correct`,
   `phasing-book`, `eval-audit`, `recall`, `reference`, `turn-allowance`, `analyze-work-sweep`,
   `suites-phasing-engine`, `tests/ai/{evaluation,phone-profile}`. Each pin's reason names the
   campaign. `calibrate-cold.test.ts`: report its status; do not touch unless the retune moves it.
3. `e2e/ai-worker.spec.ts` (all 7, esp. the free-capture case) must pass; `npm run hard:types`,
   `npx tsc`, `npm test` green.
4. Gate 0: `npm run hard:perft -- --check` (canonical + `--engine replica`), `npm run hard:fuzz --
   --actions 20000 --seed 7101`, `npm run hard:determinism -- --engine hard@desktop --work 50000
   --positions 4`. Floor contract v4 (`fixtures/v4/floor-contract.json`: `allowedMiss` =
   `V1_ALLOWED_MISS`, new bundle `manifestSha256`, `engineSourceSha256`, `weightsSha256`,
   `supersedes{ledgerSeq 2, chain}`) committed ALONE, then
   `npm run hard:suite:phasing:measure -- --manifest <v3 manifest> --contract <v4 contract> --out
   lab/hard-ai/suites/phasing/results/v4-measure-3-2026-09-22` → ledger seq 3. Report per-family
   earned/floor; a floor miss is informational under A6 but must be explained (economy was 4/20).
5. Gate 1 under A7: `gate1-calibrate.ts` (idle box, load ≤ 1.5), `gate1-launch.ts --shards N`,
   `gate1.ts --merge`. Report the verdict.
6. Gate 2 rows of §4. Then the release record, DAG walk, PR.

## 6. Lane S — suite bundle v3 (parallel with P and T)

Owns: `lab/hard-ai/suites/phasing/**` (fixtures/v3-bundle, results, ledger untouched until §5),
`tests/lab/suites-phasing*.test.ts`, `docs/changes/2026-09-22-p3-retune-laneS.md`.

1. Read `run.ts`, `build-v2.ts`, `canonical.ts`, `contract.ts`, `manifest.ts`, the v2 manifest,
   `M5-FLOOR-PREREGISTRATION-v2.md`, the m5-suites change record.
2. `node --import tsx lab/hard-ai/suites/phasing/run.ts author-v2 --out
   lab/hard-ai/suites/phasing/fixtures/v3-bundle` (takes a heavy slot; do not override the
   queue), then `validate`. If any authored case's expected move depends on the old clock (case
   16 already re-authored to `kill-clock`), re-author it with the reason in the lane report.
   Piece display names: the catalogue hash moved with the rename; confirm no case text carries
   old names.
3. `tests/lab/suites-phasing-manifest.test.ts`: `MANIFEST` → v3, new manifest sha, empty
   `KILL_CLOCK_ARTIFACT_EDITS`, un-skip the load test. `suites-phasing-v2-schema` and the other
   `suites-phasing*` tests green. `npm run hard:types` clean.
4. Do NOT write the floor contract or run `measure` (needs the retuned weights; §5).

## 7. Coordination

- Worktrees: `~/src/deevgames-p3-laneP`, `-laneS`, `-laneT`, branches `claude/p3-laneP|S|T` from
  `claude/muju-hard-p3-retune`. Lanes commit on their branch; the coordinator merges P and S into
  the campaign branch, then runs §5 (one Sonnet lane `A`, adoption) on the campaign branch with
  T's chosen vector.
- CPU: T is the heavy consumer. S's authoring and P's 45 s campaign share the queue. Nobody sets
  `MUJU_HEAVY_BYPASS`. Report load with every row.
- Owner decisions already made (do not re-ask): weights may change freely within the schema;
  `WEIGHTS_VERSION` stays 2; sealed set stays sealed; deploy is authorized after gates.
- Anything blocked: write it in the lane report with evidence and continue with the rest.
