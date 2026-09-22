# Hard AI release record — 2026-09-21, the Phasing-only cutover

Owner instruction (Ethan, 2026-09-21): make Phasing the ONLY deployed ruleset —
retire Standard, never display it — make the AI engine good and solid, and
finish the repo's next-session list. This file is the decision record for that
release, in the shape of `RELEASE-2026-09-18.md`: written as it happens, stamps
from `date -u`, **appended, never rewritten**.

Authority and scope live in two places and are not restated here:
`../../JUDGMENT_LOG.md` J-022 (the rules half) and amendment **A6** of
`PHASING-PREREGISTRATION-2026-09-18.md` (the gate half). A6 waives the *ordering*
of the staged unlock and nothing else; Gates 0, 2 and 3 keep their definitions.

**Standing constraint from A6, repeated because it binds this file:** until the
Gate 2 sealed row has been run and reported, no release note, changelog,
marketing string or player-facing copy may claim the Hard engine is stronger
than `AIEngineV2`. Copy may say which engine plays the Hard seat and how to opt
out. Fill the slots below with what was measured, including failures.

## What ships

- **Rules.** Phasing only, rules revision **`muju-phasing-2`** — unchanged.
  `SPEC.md` v3.1 states it normatively; Standard cannot be created, chosen or
  resumed. No measurement is voided (J-022, A6).
- **Engine.** `hard@desktop` — the repaired engine from
  `phasing/repair-2026-09-20/`: unconditional pending-summon scorer credit
  (`src/ai/hard/engine.ts`) plus the `phasing-hand-priors-v1` weight vector
  (43 non-zero, `weightsHash 14d06ba8`, `WEIGHTS_VERSION` 2 — the schema did not
  change; see `eval/weights.ts`). **Identity at the release commit**, measured on
  the merged tip `d68db689` with `engineSourceHashes()` /
  `weightIdentity(DEFAULT_WEIGHTS)` / `resolvedConfigHash` (exported from
  `lab/hard-ai/suites/phasing/engine-adapter.ts` and `lab/hard-ai/ladder/identity.ts`):

  ```json
  {
    "sourceFileCount": 78,
    "engineSourceSha256": "8ad95e28265e61ba3a224e096e8702b95e50c54b39fa758054436a99f3cf1f88",
    "weightsSha256": "ec9816169afe7983e03ea220eb30b8d4c1d05cbdaefc5f07a9e8a4061e12cdf5",
    "weightsVersion": 2,
    "weightsLabel": "phasing-hand-priors-v1",
    "desktopWall3000Hash": "2c485153f22afad810639da52dc59a3e7e13c1187cc2cce9cb0bf9611e90abdd"
  }
  ```

  `desktopWall3000Hash` **matches** the `DESKTOP_WALL3000_HASH` pin at
  `tests/lab/ablate.test.ts:199` — the pin is correct on the merged tip and the
  seven new ablation arms did not move it. Under fixed work the same profile
  resolves to `2453b0c7b6b9e77f2b872952f0c9901f35d62056d7b1a8becd35b07295a2b0cd`,
  the `#`-suffix of `engineHash` in every ladder row recorded below. Canonical
  rules binding at the same commit:
  `rulesSourcesSha256 7e367156bea39b4446081b1bd60139b9b7fc6ea1d3205520222158b4e2d6ffdf`
  over 24 files, `rulesVersion muju-phasing-2`,
  `catalogueSha256 44bdcbf152b1f641b8b066bd0e1f6e7155f63ada9aa26226a364164127ba2603`.
  **Verified at this commit:** no file under
  `lab/hard-ai/suites/phasing/fixtures/**` pins `weightsLabel`
  (`grep -rn weightsLabel lab/hard-ai/suites/phasing/fixtures/` -> 0 hits across
  `v1/` and `v2/`, 20 files), so shipping the `phasing-hand-priors-v1` vector
  needs no suite-fixture edit and moves no fixture expectation.
- **Route.** `hardEnabled = true`; the Hard difficulty routes to the new engine
  in Phasing vs-AI and Watch-AI, with `?hardAi=0` opting a seat back to
  `AIEngineV2`'s hard preset and `?hardMs=` overriding the budget. Easy and
  medium keep `AIEngineV2`. The `?phasingAi=1` preview flag and the worker's
  Phasing refusal are deleted.
- **Strength knobs.** The generator/eval knobs added this pass ship with
  **defaults that reproduce current behaviour**; adoption is a separate commit
  after the post-release measurement rows. Defaults at this commit: the whole
  block is **absent**. `EvalFix.strength?: StrengthKnobs` (`src/ai/hard/config.ts:470-547`)
  is set by no profile at all — only the `hard@ablate:gen-*` / `eval-atrisk-*` /
  `stack-r1234` arms carry it — so `hard@desktop`'s resolved configuration is
  byte-identical to the base and its hash does not move (see the identity block
  above). Per knob:

  | Knob | Field | Default at this commit | What absent means |
  | --- | --- | --- | --- |
  | R1b | `purchaseScoreBeforeTruncate` | absent (= `false`) | `planPurchases` keeps writing in enumeration order and truncating at `cfg.maxPlans` **before** scoring |
  | R2 | `promoteStrengthMission` | absent (= `false`) | `bestMission` still returns −1 for a plain strength upgrade; `Mission.STRENGTH` is never offered |
  | R3 | `promoteOrderingRentPv` | absent (= `RENT_PV` = **422**) | the promotion ordering expression charges today's rent PV; the shared `RENT_PV` is untouched |
  | R4 | `pendingAtRiskShare16` | absent (= **0**) | an at-risk pending summon is worth exactly its principal, today's behaviour |

  Every read is `=== true` or `?? <today's constant>`, so an unset block cannot
  change a single emitted plan, candidate or feature value. Measured
  confirmation: the identity bridge below plays the same 16 games move for move
  at `eda73b26` and at the merged tip.
- **Branch.** `claude/phasing-only-cutover` → `master` by pull request. Two
  production surfaces deploy differently: Render builds `muju/Dockerfile` from
  `master` with no test gate (that merge *is* the deploy); Cloudflare Pages
  publishes only when `deploy.yml` passes, and Pages publishing for Muju was
  paused before this release — record whether it was un-paused here.
  PR: _(fill)_. Merge commit: _(fill)_. Two tags, and `standard-final` does
  **not** move: it stays at commit `71a2c511` (`2b0f2bc0` is the annotated tag
  object, not a commit) and is pushed as-is, anchoring the Standard-era strength
  records including `RELEASE-2026-09-18.md` — pushed: _(fill)_. A new tag
  `dual-ruleset-final` is created at the merge commit's first parent, the last
  commit supporting both rule sets, and pushed: _(fill)_. (J-022, A6.)

## Superseded evidence, retired arm names and the weights contract

Recorded before the ledger because the rows below are read against it. The two
paragraphs that follow are **verbatim** from the ci-green lane's handoff, written
there for this file (that lane does not own it):

> `eecdf14c` changes the play of exactly one profile, `hard@lab-refined`
> (`lab/hard-ai/bots/hard.ts:256`, `useFutility: true`), because the depth-1 futility bound now
> includes the pending-summon credit (`src/ai/hard/search/pvs.ts:709`). Its resolved config and
> identity hash are unchanged, so
> `docs/hard-ai/phasing/repair-2026-09-20/results/ladder-w1500-labrefined-vs-aiv2hardturn/` is
> superseded and must not be compared across this commit. `hard@desktop` and every other profile
> are bit-identical (fixed-work self-play, seed 31337, 6 games byte-equal).
>
> `eecdf14c` also changes, by design, the numbers the lab INSTRUMENTS print: `hard:recall`,
> `hard:audit`, `hard:analyze`, `hard:coverage` and `lab/hard-ai/bench/p6-turn-time.ts` now score
> positions with the same within-turn sum the engine plays with (`src/ai/hard/eval/turnScore.ts`),
> pending-summon credit included. That is the point of the commit — before it, the instruments
> described a generator nobody plays — but it means every `*Value`, `regret_*` and other
> score-derived column those tools emit moves wherever a position holds paid pending summons,
> which under Phasing is routine. No `configHash` and no arm identity moves with it, so nothing
> mechanical flags it. Therefore **every committed result row under `muju/lab/results/**` and
> `muju/lab/ai/results/**` produced by those instruments predates the shared scorer and must not
> be diffed across `eecdf14c`** — 79 files, listed by
> `git ls-files | grep -E "results/.*(coverage|audit|recall)"`. Re-generate a baseline on the
> merged tree before comparing anything; do not read a moved column as a generator regression.

Line numbers in that quotation are the ci-green lane's own worktree. On this
merged tree the two citations are `lab/hard-ai/bots/hard.ts:270` (the
`hard@lab-refined` branch, `useFutility: true`) and `src/ai/hard/search/pvs.ts:693`
(the futility test) with the credited sum at `:709`; the file count is unchanged
(`git ls-files | grep -E "results/.*(coverage|audit|recall)" | wc -l` -> 79 at the
merged tip). Nothing else in the quotation is re-pointed.

**Retired arm names — the mapping anyone reproducing a repair row needs.**
Measured on this tree with
`grep -rl "hand-priors-pc\|bank25-pc\|bootstrap-pc" docs/hard-ai/phasing/repair-2026-09-20/`:
**20 of the 71 files under `docs/hard-ai/phasing/repair-2026-09-20/results/**`,
plus `HANDOFF.md`, `repair.patch`, `scripts/confirm.sh` and
`reports/understand/gap-hand-priors-vs-v2.md` — 24 files in all** — quote arm
names that no longer exist in `lab/hard-ai/ablate/arms.ts`. (An earlier draft of
this paragraph said "about 30 files under `results/**`"; that estimate was
inherited from the ci-green lane's handoff and is corrected here to the measured
count.) Those are dated records and are not edited, so the
mapping lives here: **since `71b41a39`, `hard@ablate:hand-priors-pc` ==
`hand-priors` == `bank25-pc` == `hard@desktop`**, and the old `bootstrap-pc` is
today's `weights-bank100` (*not* `weights-bootstrap-m6`, which is the genuine
five-entry M6 bootstrap vector). `4bb4a7dc` then removed those four scratch arms
(`hand-priors`, `hand-priors-pc`, `bootstrap-pc`, `bank25-pc`) and added three
honest ones (`weights-bootstrap-m6`, `weights-bank100`, `weights-no-priors`), so
`ARMS.length` went **61 -> 60**; the strength lane appended seven `evalFix`
strength arms on top, and the merged tree carries **67**. No test pins the count
(the existing `new Set(hashes).size === ARMS.length` assertions are
self-referential), so a count is evidence only when measured:
`node --import tsx -e "import('./lab/hard-ai/ablate/arms.ts').then(m=>console.log(m.ARMS.length))"`
from `muju/`.

**`WEIGHTS_VERSION` contract change.** The constant stays **2** (D9), but its
contract changed on 2026-09-21: it is now bumped **when the vector's SCHEMA
changes** — the feature count, their meaning, or the file shape `loadWeights`
accepts — and no longer whenever the numbers change. The numbers *did* change on
2026-09-20 without a bump, when `phasing-hand-priors-v1` replaced the
five-nonzero M6 bootstrap; that was deliberate and is now the standing rule,
because a bump makes `loadWeights` reject every stored vector, including the
**32 reviewed weight JSONs** under `phasing/repair-2026-09-20/weights/` and the
book key. (Measured: that directory holds 33 files, 32 of them `.json`; the 33rd
is `make-variants.ts`. The phrase "33 reviewed JSONs" is inherited verbatim from
`src/ai/hard/eval/weights.ts:19-23` and the `4bb4a7dc` commit message — correct
it in the docstring when someone is next in that file.) Stated in the docstring
at `src/ai/hard/eval/weights.ts:14` and in `../../JUDGMENT_LOG.md` J-022.

**Documented-future commands that name dead scripts.** `hard:spsa` and
`hard:book` are **dead entries retained in `package.json`**: neither target has
ever existed (`lab/hard-ai/tune/spsa.ts` and `lab/hard-ai/book/` are absent, and
`docs/hard-ai/e3/E3.3-TUNING-INSTRUMENT.md:35-37` records `hard:spsa` failing
with module-not-found in 2026-09-17), so running either still fails with
module-not-found.

**Amended 2026-09-22 — the two lines were deleted, then restored and retained.**
They were removed on 2026-09-21. The committed v2 release-suite manifest
(`lab/hard-ai/suites/phasing/fixtures/v2/manifest.json`) pins `muju/package.json`'s
bytes in its artifact map (`lab/hard-ai/suites/phasing/run.ts:34-42`), so that
two-line removal moved the pin from `a36f0da6…` to `b9482bd9…` and made
`loadBundle` refuse the whole Gate-0 bundle before any case could run. On
2026-09-22 `muju/package.json` was restored to its `eda73b26` bytes
(`a36f0da6d68dba3e953f5c1b97eb28853e5dc80a5c5f2e7b68a10598babb3300`) and the two
entries are **kept as dead entries on purpose**: a release manifest is a
historical byte record and must not be repinned to chase an editorial cleanup.
Removing them for real belongs to the next bundle re-authoring
(`npm run hard:suite:phasing -- author-v2 --out <new dir>` plus a fresh floor
contract), and `tests/lab/suites-phasing-manifest.test.ts` now loads the
committed manifest against the live tree so the next `package.json` edit fails
loudly instead of silently voiding the release suite.

One reference survives in code and is deliberately left alone:

| Surface | What it is | Disposition |
| --- | --- | --- |
| `lab/hard-ai/verify/gates.ts:621` | `npm run hard:book …` inside the **M18 `notImplemented` gate row** | Kept. A `notImplemented` row is a documented future command that the verify runner never executes — it fails with `not-implemented` by construction. Anyone implementing M18 writes the script first. |
| `docs/hard-ai/DESIGN.md:229-230,260-261,1507`, `MILESTONES.md:348,377`, `e3/E3.3-TUNING-INSTRUMENT.md:35-37,312-313` | historical plan text naming both scripts | Kept as written, each file stamped with a dated note at the top rather than rewritten; each note was amended on 2026-09-22 to say the scripts are retained as dead entries and why. **`MILESTONES.md` precisely:** `:348` (M18) names `hard:book` (beside `hard:corpus` and `hard:texel`) and never `hard:spsa`; only `:377` (M20) names both. |
| `docs/hard-ai/e0/E0.6-RELEASE-CONTRACT.md:47-48`, `docs/hard-ai/design/knowledge-first.md:1206-1207,1386`, `docs/hard-ai/e3/amendments/lane8.md:68-75`, `docs/changes/m6-evaluation-2026-09-19/m6-dev-continuation.md:142` | four more dated records naming the two dead scripts, found after the first four were stamped | Kept as written and **not** stamped. They are dated records of what was true when they were written, and re-editing history to track a script removal is the failure mode this table exists to avoid. Listed here so the disposition is complete rather than implied. |
| `docs/hard-ai/phasing/repair-2026-09-20/**` (`HANDOFF.md`, `reports/understand/{critic.json,gap-tuner.md,hard-engine-code.md,process-lessons.md}`) | the repair record, which the plan forbids editing | Kept as written, unstamped. |

The table above is complete as measured:
`grep -rln "hard:spsa\|hard:book" muju/docs/` returns exactly the 12 documents it
names, plus this release record. Any other dated record under `docs/hard-ai/**`
or `docs/changes/**` that names either script is left as written too.

## Identity bridge — `eda73b26` vs the merged tip: **IDENTICAL**

This is the row that connects the `repair-2026-09-20` evidence to the build that
ships. The same fixed-work command was run in a verified archive of `eda73b26`
(`git ls-tree -r eda73b26 muju | wc -l` → 5 397 tracked files, `git hash-object`
on every one: `checked 5397 missing 0 mismatch 0`, then `npm ci`) and on the
merged tip `d68db689`:

```sh
node --import tsx lab/hard-ai/ladder/run.ts --a hard@desktop --b Rush --work fixed:50000 \
  --handicaps 0 --pairs 8 --seed 7101 --shards 4 \
  --openings lab/hard-ai/ladder/openings/p1-dev.jsonl --replays on --out <dir>
```

Result rows, **identical in both trees**:

```
| handicap | pairs | games | score (A) | W/D/L  | Elo                      | LOS   |
| 0        | 8/8   | 16    | 0.313     | 5/0/11 | -136.97 [-720.19, 77.28] | 10.8% |
- status complete, voided false, adjudicationRate 0
- illegalActions 0, replicaDivergences 0, timingAnomalies 0
- engine fallbacks (Gate 0 item 6, must be 0): 0 total
  (packError 0, engineError 0, divergence 0, invalidSuffix 0, emptyPlan 0, workerError 0)
- openingsSha256 a58ca9d8aad304d82824ef38d7b12c776ea1547ba61a10cbfba1e387e78335c7
- engineHash hard:desktop:fixed:50000#2453b0c7b6b9e77f2b872952f0c9901f35d62056d7b1a8becd35b07295a2b0cd
```

Every headline field was compared programmatically (`wins, draws, losses, elo,
eloLo, eloHi, los, games, pairsCompleted, illegalActions, replicaDivergences,
fallbackTotal, timingAnomalies, status, voided, adjudicationRate,
openingsSha256`) — equal; `engineHash` and `engineConfigHash` sets equal; the
per-game `(opening, orientation, winner, winType, turns, plies, completedTurns)`
sequence equal. Machine diff of the run directories (wall-clock keys dropped,
`Date.now()`-derived generated unit ids canonicalised):

```
games.jsonl: IDENTICAL (16 rows vs 16 rows)
pairs.jsonl: IDENTICAL (8 rows vs 8 rows)
failures.jsonl: IDENTICAL (0 rows vs 0 rows)
replays (whole file): IDENTICAL (16 vs 16 files)
replays (move sequences): IDENTICAL (16 vs 16 files)
OVERALL: IDENTICAL
```

The canonicalised comparison was **not** the stopping point, because mapping an
id to a placeholder could in principle mask a swap between two same-player,
same-definition units. Stricter check over all 16 replay pairs — drop only the
wall-clock keys, then require the base→tip generated-unit-id map to be a
**bijection**:

```
replay pairs checked: 16   id occurrences: 589
files whose non-time skeleton is byte-identical and whose unit ids map 1:1: 16
problems: []
```

The only textual differences anywhere are wall-clock fields (`durationMs`,
`startedAt`, `totalSearchMs`, `maxTurnMs`, …) and the `Date.now()`-derived random
suffix inside generated unit ids, consistently everywhere that unit appears.

**Conclusion.** The two builds play the same 16 games move for move, so the
`repair-2026-09-20` rows describe the engine that is shipping, and the phone-profile
plumbing added this pass does not reach `hard@desktop`. Cross-check taken for
free from the knob screen's control row: `--pairs 16 --shards 8` reproduces this
`--pairs 8 --shards 4` row exactly on the 8 openings they share (16 games,
identical `(score, winType, plies)` on every one) — pair count and shard count do
not move a fixed-work row.

## Release ledger

Post-release measurement rows use seeds **7101–7606** and never the 2026095x /
2026096x Gate seeds. Read `**VOID**` before any number: a wall-mode row taken on
a loaded box is void under A14.

Rows **C0 and S1–S5 were taken before the release**, in Stage 3, on the merged
tip `d68db689` — i.e. on the shipped identity, which is what A-S4 requires — and
are informational screens, not adoption evidence. Every one is fixed work, so
none is exposed to A14: the box was shared throughout (1-minute load average 6–39)
and **no wall-clock row was run at all**. `MUJU_HEAVY_SLOTS` stayed at the
default 2. Artefact directories are session-local and not in git; the numbers
below are the record.

| # | seed | arm | vs | work | openings | pairs | out | result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C0 | 7101 | `hard@desktop` (control) | Rush | fixed:50000 | p1-dev 16 | 16 | `w4/screen-desktop` | **6–0–26, score 0.188, Elo −254.7 [−705, −101]**; 16/16 pairs, complete, not voided; spend 97 %, 2.00 promotions/game, 45.9 placed/game, 0 upkeep-elimination games; 0 illegal / 0 divergence / 0 fallback; `hard:desktop:fixed:50000#2453b0c7…` |
| S1 | 7101 | `hard@ablate:gen-purchase-score` (R1b) | Rush | fixed:50000 | p1-dev 16 | 16 | `w4/screen-gen-purchase-score` | 6–0–26, 0.188, −254.7 [−705, −101]; **move sequences identical to C0 in 32/32 games**; 0/0/0; `…gen-purchase-score:fixed:50000#421f411e…` |
| S2 | 7101 | `hard@ablate:gen-promote-strength` (R2) | Rush | fixed:50000 | p1-dev 16 | 16 | `w4/screen-gen-promote-strength` | 6–0–26, 0.188, −254.7 [−705, −101]; **identical to C0 in 32/32**; 0/0/0; `…gen-promote-strength:fixed:50000#1ad336c9…` |
| S3 | 7101 | `hard@ablate:gen-promote-rent211` (R3) | Rush | fixed:50000 | p1-dev 16 | 16 | `w4/screen-gen-promote-rent211` | 6–0–26, 0.188, −254.7 [−705, −101]; **identical to C0 in 32/32**; 0/0/0; `…gen-promote-rent211:fixed:50000#0f1e7219…` |
| S4 | 7101 | `hard@ablate:eval-atrisk-8` (R4) | Rush | fixed:50000 | p1-dev 16 | 16 | `w4/screen-eval-atrisk-8` | **11–0–21, score 0.344, Elo −112.3 [−240, −9]**; spend 97 %, 2.38 promotions/game, 61.1 placed/game, 0 upkeep-elimination; 0/0/0; 30 of 32 games diverge from C0; `…eval-atrisk-8:fixed:50000#0c5e1a70…` |
| S5 | 7101 | `hard@ablate:stack-r1234` (R1b+R2+R3@211+R4) | Rush | fixed:50000 | p1-dev 16 | 16 | `w4/screen-stack-r1234` | 11–0–21, 0.344, −112.3 [−240, −9]; **move sequences identical to S4 in 32/32**; 0/0/0; `…stack-r1234:fixed:50000#d1cc22bf…` |
| T1 | 7101 | _(time arm)_ | Rush | wall:1500 | p1-dev 16 | 16 | _(fill)_ | _(fill)_ |
| D1 | 7202 | _(top 3)_ | Rush | fixed:50000 | p1-dev, skip 16 | 16 | _(fill)_ | _(fill)_ |
| V1 | 7303 | _(top 2 + default)_ | `aiv2-hard-turn` | wall:6000 | p1-dev 16 | 16 | _(fill)_ | _(fill)_ |
| V2 | 7404 | _(winner + default)_ | `aiv2-hard-turn` | wall:6000 | p1-val 32 | 32 | _(fill)_ | _(fill)_ |
| V3 | 7505 | _(winner + default)_ | Rush | wall:1500 | p1-val 32 | 32 | _(fill)_ | _(fill)_ |
| P1 | 7606 | `hard@desktop`, `hard@phone` | `aiv2-hard-turn` | wall:7500 | p1-dev 8 | 8 | _(fill)_ | _(fill)_ |

Incumbent references, for direction only, from `phasing/repair-2026-09-20/`:
53–0–11 on `p1-val` at 6 s vs `aiv2-hard-turn` (+273 [+161, +476]); 28–0–4 on
`p1-dev` at 6 s; 12–0–20 vs Rush at 1.5 s. Those are development evidence plus
one look at `p1-val`, not gate evidence (A6).

### The strength knob screen, read honestly

Command, identical for every row but `--a`:

```sh
node --import tsx lab/hard-ai/ladder/run.ts --a $ARM --b Rush --work fixed:50000 \
  --handicaps 0 --pairs 16 --seed 7101 --shards 8 \
  --openings lab/hard-ai/ladder/openings/p1-dev.jsonl --replays on --out <dir>
node docs/hard-ai/phasing/repair-2026-09-20/scripts/stats.mjs <dir>
```

**Matched-pair view** — each arm plays the same 16 openings in both orientations
against the same deterministic Rush script, so every game is a matched pair and
this, not the Elo interval, is the informative reading at n = 32:

| arm | matched games | arm better | same | arm worse | net | two-sided sign test p |
| --- | --- | --- | --- | --- | --- | --- |
| `gen-purchase-score` (R1b) | 32 | 0 | 32 | 0 | +0 | 1.000 |
| `gen-promote-strength` (R2) | 32 | 0 | 32 | 0 | +0 | 1.000 |
| `gen-promote-rent211` (R3) | 32 | 0 | 32 | 0 | +0 | 1.000 |
| `eval-atrisk-8` (R4) | 32 | 6 | 25 | 1 | **+5** | 0.125 |
| `stack-r1234` | 32 | 6 | 25 | 1 | **+5** | 0.125 |

R4's seven discordant games: six control losses by `elimination` become wins
(`p1-g3-s570 B`, `p1-g4-s280 B`, `p1-g5-s135 A`, `p1-g5-s85 B`, `p1-g7-s155 A`,
`p1-g7-s46 A`) and one control win by `home-occupation` becomes a loss
(`p1-g4-s420 B`).

**The finding that matters: three of the four knobs do not change play at all.**
Not "no measurable win" — *no change*. Comparing replay move sequences game by
game, with wall-clock fields and generated unit ids normalised exactly as in the
identity bridge:

```
desktop vs gen-purchase-score:    identical move sequences 32/32
desktop vs gen-promote-strength:  identical move sequences 32/32
desktop vs gen-promote-rent211:   identical move sequences 32/32
desktop vs eval-atrisk-8:         identical move sequences  2/32   (30 games diverge)
eval-atrisk-8 vs stack-r1234:     identical move sequences 32/32
```

The knobs are genuinely live — the resolved configs differ only in `evalFix`
(`DESKTOP.evalFix` is `undefined`, the arms carry `{"strength":{…}}`),
`engine.ts:311-314` hands `config.evalFix` straight to `t.evalFix` by reference,
and `purchase.ts:451` / `promote.ts:206` read it — they simply never alter a
chosen turn in 32 games (~2 200 hard turns). R4 carries the entire stack:
`stack-r1234` plays byte-identically to `eval-atrisk-8`, so R1b + R2 + R3
together contribute nothing once R4 is on. Hypotheses, offered as hypotheses:
R1b binds only when `planPurchases` enumerates more plans than `cfg.maxPlans`
(12), and the repair handoff's own diagnosis is that at bank ≥ 12 the offered
menu is `fire_1 ×1..4` and nothing else — the binding constraint is upstream in
`candidateDefs`/`rankSquares`; R2 adds STRENGTH candidates, but R3 is the change
that would make a promotion competitive in `buildCombos` ordering, and adding
candidates that still lose the ordering changes nothing. Instrument `written` vs
`cfg.maxPlans` and `bestMission`'s STRENGTH hit rate in one screen run before
spending val rows on them. (`gen-promote-rent0`, the upper-bound arm, was not
run.)

**Caveats, stated plainly. 16 pairs is a screen, not a result.** The sign test on
R4's discordant games gives **p = 0.125** (6 better, 1 worse) — suggestive, not
significant. It is one opponent (a scripted Rush bot), one budget
(`fixed:50000`), one opening slice (the first 16 of `p1-dev`), one seed (7101),
and the Elo intervals overlap heavily. **Nothing here is adopted**, and nothing
here meets the adoption rule below, which needs a val row vs `aiv2-hard-turn`, a
disjoint dev slice and the Balanced/Expand regression pairs.

**The plan's control expectation was wrong for this budget, and is corrected
here.** Stage 4 step 1 predicted the control at ≈12–0–20, spend ≈93 % for exactly
this command; measured, it is **6–0–26 at spend 97 %**. The 12–0–20 figure in
`phasing/repair-2026-09-20/HANDOFF.md` is a **`wall:1500`** row, not a
`fixed:50000` row — the expectation had been carried across budgets. The first 8
openings of this slice do reproduce the 8-pair identity-bridge row exactly
(5–0–11, score 0.312); openings 9–16 give 1–0–15. Stage 4 re-anchors on 6–0–26.

### Adoption rule, stated before looking

Recorded here so the acceptance condition is not written after the numbers:
val score vs `aiv2-hard-turn` ≥ 0.78 with the Elo interval excluding 0 and the
row not VOID; Rush ≥ 0.50 replicated on the disjoint dev slice and holding on
val; 0 illegal actions, 0 divergences, 0 fallbacks; spend ≥ 50 %;
upkeep-elimination ≤ 15 % of losses; Balanced ≥ 0.9; Expand ≥ 0.6; suite
families not worse than the pre-release measure. Adoption is one commit flipping
the defaults, plus hash re-pins, a new floor contract committed alone, a
re-measure and a ledger line here.

## Gate 0 — correctness veto (informational under A6, reported either way)

Run before the merge, on the release tree. Record the command, the artefact path
and the per-family result, including any family below its floor.

Run on 2026-09-21/22 against the merged tip `d68db689` in
`/Users/ashkie/src/deevgames-phasing-cutover/muju` (node v24.11.1, npm 11.6.2,
Apple M2 Max ×12, darwin/arm64). The worktree was clean at the end
(`git status --porcelain` empty).

**Amended 2026-09-22** on the same worktree at `7b96f634`/`79c19d00`, after the
three cheap blockers were cleared: `package.json` restored to its pinned bytes
(`568f314a`), `hard:determinism` routed through `hardEnginePatch` (`f366c43b`),
and M1's fixture count derived from the fixture set (`7b96f634`). The suite
measure, the determinism row and M1 are now **read**, not blocked; the rows
below carry the actual numbers.

| Check | Command | Result |
| --- | --- | --- |
| Suite measure (v3 floor contract, committed alone) | `npm run hard:suite:phasing:measure -- --manifest lab/hard-ai/suites/phasing/fixtures/v2/manifest.json --contract lab/hard-ai/suites/phasing/fixtures/v3/floor-contract.json --out lab/hard-ai/suites/phasing/results/v3-measure-2-2026-09-22` | **READ, 2026-09-22.** `valid true`, **`floorPass false`**, earned **121 / 146**, coverage **79/79** (fail 0, indeterminate 0, error 0, missing 0), `failures []`. **Two families below floor: invariants 8/14 and economy 4/20.** Exit 1 is the floor miss, not a tool failure. `WITNESS: remote-tracking ref contains the contract commit (git@github.com:ethancd/deevgames.git)`; ledger **seq 2**, superseding seq 1 as the contract declares. Artefacts `lab/hard-ai/suites/phasing/results/v3-measure-2-2026-09-22/` (commit `79c19d00`). Per-family table and caveats below. |
| Determinism | `npm run hard:determinism -- --engine hard@desktop --work 50000 --positions 4` | **PASS, exit 0, 2026-09-22.** `{"identical":true,"decisions":4,"mismatches":0}`. Until `f366c43b` this crashed with `Phasing weight schema/version mismatch` from `assertCurrentWeights` ← `new HardEngine`, because the patch was built with `hardConfigFor(...)` (whose `weights` field is present and is a version-0 placeholder) instead of `hardEnginePatch(...)`; the crash was pre-existing at `eda73b26` and arrived with the assertion at `e701ccc0`. One line plus one import fixed it; `tests/lab/suites.test.ts`'s regression case was re-pinned in the same commit. |
| Replica / identity verify | `npm run hard:verify -- --gate M<n>` | **PASS: M1** (2026-09-22, `M1: PASS (17451ms)`, `fixturesChecked 7`, `fixturesMismatch 0`, `digestMismatches 0`, `replicaAgreed true`, `standardTriple checked`, `14959/1053/797`, `openings 797`, deps `violations []`, vitest 44/44), **M4, M5, M10**. **FAIL: M6, M7, M8, M9, M11, M12, M13** (Standard lab corpora under a Phasing-only replica) and **M14** (`M14: FAIL (39817ms)`, 2026-09-22: its first three steps now pass — `npx vitest run tests/ai/hard`, determinism `{"identical":true,"decisions":160,"mismatches":0}`, bench `ttOnOffScoreMismatch 0` / `depthGe4Share 1` / `quiesceShareMax 0` — and it dies on step 4, the generic `npm run hard:suite`, with the same Standard-corpus `PackError`; step 5 is a `--work wall:500` ladder row that never ran). **Not run: M2, M3** (M3 contains a `--work wall:1000` ladder row, excluded by the fixed-work-only rule on a shared box). All remaining failures pre-existing; see below. |
| Perft / fuzz (the part that needs no lab corpus) | `npm run hard:perft -- --check --engine canonical`; `--engine replica`; `npm run hard:fuzz -- --actions 20000 --seed 7101` | **PASS.** Canonical `14959/1053/797`, `standardTriple checked`, `fixturesChecked 7`, `fixturesMismatch 0`, `digestMismatches 0`, `replicaAgreed true`, `openings 797`. Replica: Standard triple `skipped-phasing-replica`, Phasing `14959/1850/797`, `mismatches 0`. Fuzz: `divergences 0`, every transition/legality/arrival/prover/gate-preservation counter 0 (`legalitySetMismatches`, `unmakeMismatches`, `rehashMismatches`, `roundTripMismatches`, `witnessIllegal`, `gatePreservation.mismatches`), 270 games, 46 home checkmates, clock fixture ok. |
| Correctness veto item 6 (fallbacks) | 8 ladder runs, 224 games (identity bridge ×2, knob screen ×6) | **PASS.** 0 illegal actions, 0 replica divergences, 0 engine fallbacks of any kind (`packError`, `engineError`, `divergence`, `invalidSuffix`, `emptyPlan`, `workerError` all 0). Every row `status: complete`, none voided, `adjudicationRate 0`, none wall-clock timed. |
| Full unit suite | `npm test` | **PASS.** `Test Files 211 passed (211)`, `Tests 2944 passed (2944)`, 363.73 s, **0 failing**. Plus `npm run hard:test` → `Test Files 68 passed (68)`, `Tests 916 passed (916)`, 37.71 s. |
| Types | `npx tsc --noEmit`, `npm run server:types`, `npm run hard:types`, `npm run balance:types` | **PASS**, all four clean. |
| Build | `npm run build` | **PASS.** `✓ built in 4.41s`; `prebuild` re-ran `asc` and `src/ai/wasm/tactics.wasm` came back byte-identical (sha256 `6d3cf33382ff94d81ae32194c3af4849bff81115d1b6f7f4a9d4ac45c795573c`), so `git status` stayed empty. |
| Browser e2e | `npm run test:online:e2e`; real host on 8937 + `MUJU_BASE_URL=http://127.0.0.1:8937/muju/ npx playwright test`; `MUJU_E2E_PORT=8927 npx playwright test --config playwright.hard.config.ts` | **PASS.** `84 passed (2.8m)` · `111 passed (2.7m)` · `12 passed (55.4s)` (desktop + mobile). The online config now includes the three AI specs (`ai-worker` 6, `phasing-ai` 3, `ai-timer` 4), green twice at 2 workers, so CI covers the AI path in a browser. |
| Tactics / balance | `npm run ai:tactics`; `npm run balance:check` | **PASS.** `fixtures 28, decisions 84, expectedRescues 36, cleared 36`; `distinctStatProfiles 18`, `sameTierDominated []`, `noMissionWitness []`, `noSoleCheapestWitness []`. |
| Site smoke | `bash build-all.sh` + `node tools/smoke-site.cjs http://127.0.0.1:8941` | **PASS.** `Site verified: three games, portfolio, local links and asset sizes.`; `PASS 390px` and `PASS 834px`. |
| Image import safety | `rg -n "from ['\"](\.\./)+(lab\|tests\|docs\|e2e)/" src server` | **PASS**, no matches. Docker itself is unavailable on this box, so the build context was simulated (rsync of `muju/` minus every `.dockerignore` entry, then `npm run build && npm run server:types` → exit 0). |

**Expected before the run, recorded so the reading stays honest:** the invariants
family was expected at 12–13 of 15 against a floor of 14, i.e. **below floor**.
Under A6 that is reported as a failure of an informational check, never converted
into a pass.

**Measured: invariants came in at 8 of 15, worse than the 12–13 that was
predicted — and economy, which nobody flagged, came in at 4 of 20.** Both are
recorded as failures of an informational check. Neither is converted into a pass,
and neither blocks the cutover under A6.

### Gate 0, as read on 2026-09-22

The v3 floor contract was written to A-S3 and committed **alone**
(`lab/hard-ai/suites/phasing/fixtures/v3/floor-contract.json`, commit
`9c3da287`): schema stays `muju-phasing-suite-floor-v2` (no v3 schema exists —
`contract.ts:73-85`), the v2 manifest's
`manifestSha256 454fe137aa5bf97f4703a209985e4743eb995719c09cb6bcf8ea6d130bc39453`,
the frozen `V1_ALLOWED_MISS` vector, the tip's `engineSourceSha256` /
`weightsSha256`, `declaredAt 2026-09-22T06:40:08.000Z`, and
`supersedes: { ledgerSeq: 1, chain: "d7774d6d…" }` — the one field A-S3 does not
name and `measure.ts:230` requires, because the v2 manifest already carried a
ledger line from 2026-09-19.

On 2026-09-21 the measurement refused at `run.ts:156` — `loadBundle`, the first
thing `measureBundle` does — with `Superseded bundle: … (changed package.json)`,
because `artifactPins()` (`run.ts:34-42`) hashes `muju/package.json` into the v2
manifest's artifact map and the two dead `hard:spsa` / `hard:book` script lines
had been deleted. No case ran and **no first-measurement slot was consumed**
(`results/v3-measure-1-2026-09-21/failure.json`, commit `ec24980e`).

**Resolved 2026-09-22 by restoring the two lines** (`568f314a`): `package.json`
is back at its `eda73b26` bytes, `a36f0da6…`, and the two entries are retained as
dead entries, because a release manifest is a historical byte record and must not
be repinned to chase an editorial cleanup. `tests/lab/suites-phasing-manifest.test.ts`
(`179d9e34`) now loads the committed manifest against the live tree in `npm test`,
naming the offending pin, so the next `package.json` or suite-source edit fails
loudly instead of silently voiding the release suite.

#### The reading

```
npm run hard:suite:phasing:measure -- \
  --manifest lab/hard-ai/suites/phasing/fixtures/v2/manifest.json \
  --contract lab/hard-ai/suites/phasing/fixtures/v3/floor-contract.json \
  --out lab/hard-ai/suites/phasing/results/v3-measure-2-2026-09-22
```

```
WITNESS: remote-tracking ref contains the contract commit (git@github.com:ethancd/deevgames.git)
{"valid":true,"floorPass":false,"earned":121,"offered":146,
 "coverage":{"expected":79,"pass":79,"fail":0,"indeterminate":0,"error":0,"missing":0},
 "failedCases":[], "witnessTier":"remote-tracking",
 "supersededMeasurements":1,"ledgerSeq":2}
EXIT=1                      # the floor miss, not a tool failure
```

Started `2026-09-22T08:32:31.086Z`, finished `08:35:15.182Z`, head `7b96f634`,
225 of 225 cases executed. Artefacts, committed at `79c19d00`:
`muju/lab/hard-ai/suites/phasing/results/v3-measure-2-2026-09-22/`
(`result.digest.json` readable; `result.json.gz`, `cases.jsonl.gz`,
`author-validation.json.gz` with their original sha256s in
`original-file-sha256.txt`; `started.json`), plus ledger line **seq 2** in
`measurement-ledger.jsonl`.

| Family | Measured (earned) | Floor (minimum) | Offered | Verdict |
| --- | --- | --- | --- | --- |
| tactics | **62** | 57 | 63 | PASS |
| invariants | **8** | 14 | 15 | **BELOW FLOOR** |
| home-mate | **28** | 28 | 28 | PASS |
| economy | **4** | 20 | 20 | **BELOW FLOOR** |
| summon-disruption | **13** | 13 | 14 | PASS |
| home-fortify | **6** | 6 | 6 | PASS |
| **total** | **121** | — | 146 | `floorPass false` |

Said plainly: **two of the six families are below their preregistered floor —
invariants (8 of 15 against 14) and economy (4 of 20 against 20).** Under A6 this
reading is informational and does not block the cutover, and it is not being
converted into a pass. The floors are the frozen v1 allowed-miss budget, derived
from the manifest's own offered counts, so they were not set from any observed
outcome.

**Correctness side: clean.** `correctness true`, `drift false`,
`engineDrift false`; across all 225 cases **0 replica divergences, 0 capped
prover calls, 0 adapter refusals, 0 errored executions, 0 fallbacks of any kind**,
coverage 79/79 with nothing indeterminate or missing. Witness tier is
`remote-tracking`, the strong-as-available tier: the contract commit `9c3da287`
is contained in `origin/claude/pc-lane1` at `git@github.com:ethancd/deevgames.git`.
Engine identity `e00907f8…`, `engineSourceSha256 8ad95e28…`,
`weightsSha256 ec981616…` (`phasing-hand-priors-v1`, version 2) — equal to what
the contract preregistered, which is what `assertContractBuild` enforces.

#### Against the 2026-09-19 reading of the same manifest

Ledger seq 1 read the same 225 cases under a different build and the M6 bootstrap
weights (`engineSourceSha256 e46f735e…`, `weightsSha256 1addc7d6…`). 23 of 225
cases moved:

| Family | 2026-09-19 | 2026-09-22 | Floor |
| --- | --- | --- | --- |
| tactics | 61 | **62** | 57 |
| invariants | 8 | **8** | 14 (3 gained, 3 lost) |
| home-mate | 28 | **28** | 28 |
| economy | 19 | **4** | 20 |
| summon-disruption | 12 | **13** | 13 (was below floor, now at it) |
| home-fortify | 6 | **6** | 6 |

**The economy collapse is the finding worth carrying forward.** All fifteen lost
cases are `relocate-{fire_1,water_1,plant_1,plant_3,metal_2}-{e,s}` and
`muju-onto-4-{0..6}`. Engine source **and** weights both changed between the two
readings, so these two rows cannot attribute it to either on their own; an
ablation on the weight vector alone is the cheap next step. `author-validation.json`
hashes byte-identically in both runs (`6f1a91ef…`), so the case set itself did not
move.

Nothing here is a ship gate, and nothing here says the engine got weaker in play:
the 224-game ladder evidence and the identity bridge are separate rows above. It
does say the suite's economy family, which the shipped vector was never measured
against, now misses badly.

### The `hard:verify` gate failures, and why none of them is a cutover regression

| Gate | Tool | Failure | Pre-existing because |
| --- | --- | --- | --- |
| ~~M1~~ | `hard:perft --check` | **FIXED 2026-09-22 (`7b96f634`), M1 now PASSES.** The criterion required `metrics.fixturesChecked === 11`, the size of the Standard perft fixture set; the Phasing set in `lab/hard-ai/perft/phasing-fixtures.ts` has **7** (`prepare-broke`, `prepare-rich`, `full-turn`, `pendings-both-sides`, `arrival-and-refund`, `upkeep-review-pending`, `home-occupation`), and everything else in the row was already green. It now reads `=== PHASING_FIXTURES.length`, derived from the set itself. Because `verify/run.ts` breaks on the first failing gate, this one line was why `--all` produced no reading for M2–M14 at all. | `gates.ts` and `perft/**` were unchanged on this branch; the 7-fixture set landed at `142f0904`, before the cutover base. |
| M6 | `oracles/threat.ts` | ran, but `strikeChecked 0`, `approachPairs 0` — every corpus position skipped | `lab/hard-ai/positions/*.jsonl` are Standard positions (no `ruleset` field → `'standard'`) and `pack()` has been Phasing-only since `142f0904`. |
| M7 | `oracles/kill.ts` | `PackError: pack: ruleset "standard" is not "phasing" (the replica is Phasing-only)` | same |
| M8 | `oracles/economy.ts` | `PackError` (same) | same |
| M9 | `oracles/geometry.ts` | `PackError` (same) | same |
| M11 | `oracles/canonical-check.ts` | ran, `positionsChecked 0`, `positionsSkipped 216` | same |
| M12 | `hard:bench --eval` | `Error: bench: empty corpus` (`lab/hard-ai/bench/run.ts:187`) | same |
| M13 | `hard:recall` | ran, `positions 0`, `replyPositions 0`, every recall metric 0 | same |
| M14 | `npm run hard:suite` (step 4 of 5) | Steps 1–3 PASS as of 2026-09-22: `npx vitest run tests/ai/hard`, `hard:determinism --engine hard@lab --positions 40 --work 25000,400000 --seeds 1,7` → `{"identical":true,"decisions":160,"mismatches":0}`, and `hard:bench --calibrate --tt-check --positions 200` → `ttOnOffScoreMismatch 0`, `ttChecked 200`, `depthGe4Share 1`, `quiesceShareMax 0`. Step 4 dies on the same Standard-corpus `PackError` at `lab/hard-ai/suites/run.ts:457`; step 5 (`--work wall:500`) never ran. `M14: FAIL (39817ms)` | the generic `hard:suite` is disposed historical/blocked by A-S3; `suites/run.ts` and `positions/*.jsonl` are unchanged on this branch. Before 2026-09-22 M14 could not start at all, because its step 2 was the broken `hard:determinism` call. |

`git diff --stat eda73b26 d68db689 -- muju/lab/hard-ai/` touched none of
`oracles/**`, `bench/run.ts`, `positions/*.jsonl` or `gates.ts`; `gates.ts` was
then edited on 2026-09-22 for M1 alone. **The gates still listed above cannot
pass on this branch *or* on `origin/master` without a lab-corpus port.** They are disposed as
historical/blocked, the disposition A-S3 already gives the generic `hard:suite`;
funding a lab-corpus port to Phasing is the alternative and is filed as a
follow-up. What *is* measured green on this tree is the part that needs no such
corpus: **M1** (perft fixtures, deps lint, constants — fixed 2026-09-22), **M4**
(packed primitives + `tsc` + `hard:types`), **M5** (replica
state/movement/spawn/income/make-unmake/generators + 1 M fuzz actions + replica
perft), **M10** (home prover + gate preservation), plus the perft/fuzz rows above,
and M14's determinism and bench steps.

## Gate 2 and Gate 3 — still owed

- **Gate 2** (sealed strength row, `p1-sealed.jsonl`, 32 pairs, seed 20260953,
  SPRT rule, no reruns): not run at this release. `p1-sealed.jsonl` is untouched.
  Status: _(fill when run)_.
- **Gate 3** (desktop p95 ≤ 6,000 ms, phone p95 ≤ 3,000 ms): unmeasured on the
  shipped configuration at this release. Report both the shipped 7,500 ms
  whole-turn allowance reading and the literal 6,000 ms one. Note that the
  browser runs the DESKTOP search shape on every device, so the phone number is
  unrepresented, not merely unmeasured. Status: _(fill when run)_.

## Post-deploy verification

All GET except the smoke room. Fill each with what came back.

| Check | Expected | Result |
| --- | --- | --- |
| `/api/muju/health` | ok | _(fill)_ |
| `/muju/` | 200, new bundle | _(fill)_ |
| `/SKILL.md` sha256 | equals the repo copy | _(fill)_ |
| MCP `tools/list` | responds with the single-ruleset descriptions | _(fill)_ |
| `muju_rules` | `ruleset.name === 'phasing'`, no `rulesets.options` | _(fill)_ |
| `GET /api/muju/rooms` | `[]` | _(fill)_ |
| `/rooms/archived?limit=100` | ≥ 41, ids/`archivedAt`/`winner`/`reason` identical to the pre-merge baseline | _(fill)_ |
| Per-room status codes | identical to the pre-merge baseline; the four `muju-phasing-2` bodies byte-identical | _(fill)_ |
| `POST /api/muju/rooms {"name":"cutover-qa"}` | `ruleset:'phasing'`, `pendingSummons: []`, `turn.phase:'action'` | _(fill)_ |
| `POST /api/muju/rooms {"ruleset":"standard"}` (HTTP surface) | 400 `INVALID_REQUEST`, issue naming `ruleset`, `expected: "phasing"` | _(fill)_ |
| `muju_create_room` with `ruleset: "standard"` (MCP surface) | an SDK **invalid-params tool error naming `ruleset`** — not a `RoomError`; A-S5 requires both surfaces, and they are different | _(fill)_ |
| Engine chunk | `cmp` against a local `npm run build` (bytes, never filenames) | _(fill)_ |
| Cloudflare Pages | `deevgames.pages.dev/muju/` matches `_site/muju/index.html`; smoke green | _(fill)_ |
| Academy notice (ashkie-pages) | live strings match `academy/build-release.py`; `verify_muju_videos.py` green | _(fill)_ |

## Not in this release

Each line below is a next step from
`phasing/repair-2026-09-20/HANDOFF.md` or a debt this release carries. A
disposition is either "run in Stage 4" with the ledger row it becomes, or
"dropped: <reason>". No line ships blank.

- **Round 3 weight rows (handoff next-step 2) — disposition: RUN IN STAGE 4**, as
  ledger rows `S1`-shaped additions taken with `--a hard@env`; they are not run
  before the release and nothing in this release depends on them. Round 3 was
  queued and never run:
  `combined-best-guess+pc`, `phasing-priors-v1+pc` and `econ-only-best-guess+pc`
  against Rush at `wall:1500` and against `aiv2-hard-turn` at `wall:6000`,
  driver `phasing/repair-2026-09-20/scripts/round3.sh`. If run, each row runs as
  `--a hard@env` with `MUJU_HARD_WEIGHTS` set — the env hook is scoped to the
  `env` profile and never reaches `hard@desktop` — and lands in the ledger above
  with its seed, work mode and artefact path. The `_(arm)_` rows in that table
  are the slots these fill.
- **Random search over the 8 knobs (handoff next-step 5) — disposition: RUN IN
  STAGE 4, and re-scoped first.** The plan is `randomSearchPlan` in
  `phasing/repair-2026-09-20/reports/knobs/synthesis.json`. It is a search, not
  an adoption step: any winner still has to clear the adoption rule above on
  rows re-run against the post-merge identity. **Re-scoped because of the
  pre-release screen above:** three of the four ranked knobs (R1b, R2, R3) change
  no game at all on the screened slice, so a random search over them samples a
  constant. Instrument `planPurchases`' `written` vs `cfg.maxPlans` and
  `bestMission`'s STRENGTH hit rate in one screen run first, and spend the search
  only on knobs shown to bind.
- **Owed: `academy/rules-verification.json` still reads `"rules": "v2.9"`.** The
  Academy course notice was reworded for the single ruleset
  (`academy/build-release.py`, `academy/verify-live.py`), but the machine-read
  verification file is regenerated by the Academy `export-rules.ts` release
  action, which is blocked on the media bundle — it is not a hand edit. Recorded
  in `academy/STATUS.md`; repeated here because this file is what the release
  stage works from. Status: _(fill when regenerated)_.

## Follow-ups filed

Everything below is known, measured and deliberately **not** done in this
release. None of it blocks the cutover; each line names where the work is and
what evidence exists.

1. **F1 — flip `createInitialGameState`'s default and delete the Standard
   branches, together with their tests, as one change.** `board.ts:204` still
   defaults to `'standard'` (D6); every entry point passes `'phasing'`
   explicitly. Repointing the remaining defaulted tests without deleting the
   branches would lose the only coverage those branches have, so the two halves
   are one job. Measured work order — shipped source still carrying a Standard
   branch: `src/game/turn.ts` (start-of-turn upkeep, `finishTurnStart`,
   `canActInPlacePhase`), `src/game/homeCheckmate.ts:160` (`prepare`),
   `src/ai/simulate.ts:119` (`finishPlacement`), `src/ai/turnFunding.ts` (every
   `isPhasing` short-circuit), `server/analysis/**`'s witness engine, and
   `lab/hard-ai/audit/{families,place-enum}.ts`. Test files that resist a
   flag-only repoint, with their defaulted call-site counts:
   `tests/ai/turn-execution.test.ts` (7), `tests/server/analysis.test.ts` via
   `tests/fixtures/analysis.ts` (13), `tests/lab/audit-families.test.ts` (3),
   and `tests/game/turn.test.ts` (the Standard turn spec —
   `tests/game/phasing.test.ts` already specs the Phasing one). Also sweep
   `server/observation.ts:24` (`s.ruleset ?? 'standard'`, unreachable for live
   rooms) with it.
2. **F8 — the AI turn dial shows the whole allowance while the engine spends
   three quarters of it.** `turnFunding.ts:48-53`: `PREPARE_RESERVE_DIVISOR = 8`,
   so a Phasing turn's FIRST search is funded with `budget − 2 × budget/8` while
   `turnBudgetMs` (what the dial renders) shows the whole thing. Measured and
   pinned at `tests/hooks/phasing-ai-funding.test.tsx:296-303`
   ("leaves a floor for the later Phasing segments and gives the last one the
   whole remainder"). If the owner wants the dial to agree with the engine, that
   test is where the expectation lives. `useAI.ts` owns the turn and passes the
   allowance through.
3. **F2b — the cold `unitsPerMs` is wrong on BOTH profiles.** `makeConfig`
   hard-codes `profile: { unitsPerMs: INITIAL_UNITS_PER_MS }` = **200**
   (`src/ai/hard/config.ts:664,687`) and never reads `ProfileShape.unitsPerMs`
   (600 desktop / 400 midrange / 200 phone), so a desktop's first search is sized
   from 200 u/ms while the repair handoff's own measurement puts the real figure
   near 50 u/ms. Fixing it moves `hard@desktop`'s resolved configuration and
   therefore the frozen ablate hash and every ladder row's identity, so it wants
   its own commit + re-pin + a ledger line here.
4. **The engine traded a 4-action capture for two summons in the `ai-worker`
   fixture.** In the old fixture (White Hi on H5, four actions away) the Phasing
   engine mined 6 and committed two Hi summons (J9, I10) instead of walking three
   squares to kill a tier-1 piece. The turn was otherwise legal and complete,
   with **no fallback counted** — so this is a strength question, not a harness
   defect, and it belongs in Stage 4. Trace:
   `muju/test-results/ai-worker-Hard-worker-spen-c3e7f-efore-handing-the-turn-back/trace.zip`
   (captured before the fixture moved). With the capture one move away the engine
   takes it, which is what the spec now pins; the fixture was moved H5 → G10 so
   the test measures what it claims to.
5. **`HardDiagnostics` has no `deviceProfile` field.** `readHardDiagSnapshot()`
   carries `HardDiagnostics` (`src/ai/hardOptIn.ts:84`) and this release
   deliberately added no field to it, because it is read by
   `src/utils/positionReport.ts` / `compactReport.ts`, which the cutover plan
   listed as untouched by every lane. A phone bug report therefore says nothing
   about which tables ran unless the console is attached. The fix is one line in
   `hardOptIn.ts` plus the `emptyDiagnostics()` row
   (`deviceProfile: 'desktop' | 'phone' | null`); it needs an owner for the two
   report files. `src/ai/worker/client.ts` has no owner either, and a future
   `device:` field will need one.
6. **The fallback banner clears at the next decision.** `useAI.ts:271`
   (`setWarning(turn.fallback ? … : client.current.warning ?? null)`) runs at the
   top of every whole-turn search, and `useAI.ts:370` at every per-action
   fallback decision, so "AI engine fell back (empty plan / invalid plan suffix)"
   and "…(pack-error)" are on screen only while the fallback is in flight —
   typically a few hundred ms. **Pre-existing** (it has always applied to the
   `packError` banner) and deliberately not changed. Making it last the turn is
   one line (`setWarning(prev => client.current.warning ?? prev)`); it is an
   owner decision, because the banner text is shared with the e2e assertions.
7. **Phone `unitsPerMs` and turn p95 have never been measured on a handheld.**
   The phone profile now actually runs on phones (A-F2 closed: `profileFor` was
   previously called from nowhere but a test, so every device built its engine
   from `DESKTOP`), but the profile table is DESIGN §6.3's and is **unmeasured**.
   `?hardProfile=phone` makes it measurable on a desktop build, and
   `window.__mujuHardDiag` plus the `[hard-ai] device profile …` console line
   make it legible on the device. This is the missing half of **Gate 3**: the
   phone number is unrepresented, not merely unmeasured.
8. **`academy/rules-verification.json` still reads `"rules": "v2.9"`** — the
   "Owed" line above; regenerating it is the Academy `export-rules.ts` release
   action, blocked on the media bundle at `~/Archives/muju-media-2026-09-18/academy`.
9. **The position report's wire `kind` is retained as
   `'muju-phasing-preview-report'`** (`src/utils/positionReport.ts:54,86`) even
   though ordinary players now put it on the clipboard. Renaming it would split
   one format into two and strand reports already pasted into chats, so the kind
   and `POSITION_REPORT_VERSION` stay; it is now **pinned** in
   `tests/components/phasing-ai-turn.test.tsx`, so a rename has to be a
   deliberate wire-format change.
10. **F9 — `src/game/migrate.ts` is kept as dead code.** No importer remains
    (`grep -rn "from.*migrate'" src tests server` → no hits), but the file is
    kept byte-for-byte because `muju/content-dag.json:106` lists it as a required
    `persistence` path and the DAG `check` fails on a missing path. D7's deletion
    was **not** taken and J-022 was amended to say so. Deleting it means editing
    `content-dag.json` in the same commit. Consequence already in effect: a
    legacy six-action save is archived rather than upgraded, and
    `tests/game/action-budget.test.ts` records that.
11. **Round 3 weight rows and the random search** — the two "Not in this release"
    lines above, both disposed **run in Stage 4** (the random search re-scoped
    first).
12. **The lab-verification debts**, all pre-existing and all evidenced in the
    Gate-0 section. **Four of the five were paid on 2026-09-22** and are listed
    here as done, not owed: `lab/hard-ai/verify/determinism.ts`'s `hardConfigFor`
    call site (`f366c43b`, with `tests/lab/suites.test.ts`'s regression case
    re-pinned in the same commit); M1's `fixturesChecked === 11` criterion, now
    `=== PHASING_FIXTURES.length` (`7b96f634`); the test that loads the committed
    `fixtures/v2/manifest.json` against the live tree
    (`tests/lab/suites-phasing-manifest.test.ts`, `179d9e34`); and the Gate-0
    suite reading itself (`79c19d00`, ledger seq 2). **Still owed:** the Standard
    corpora under `lab/hard-ai/positions/*.jsonl`, which keep M6–M13 — and M14's
    fourth step — from running at all. Add to that a new debt this release
    created for itself: **the economy family's 19 → 4 fall** between the two
    readings of the same manifest, which wants an ablation that moves the weight
    vector alone.
13. **F5 — `vitest.config.ts`'s `PHASING_QUARANTINE` dispositions** (port or
    promote each to evidence), and `lab/hard-ai/recall/fixtures.jsonl`, which
    needs re-capturing as a Phasing position before `tests/lab/recall.test.ts`
    can leave quarantine — today its probe measures zero positions, and the
    quarantine comment now says so. It is a one-position corpus.
14. **F4 (nuisance) — `npm run balance:check` rewrites a tracked artifact on
    every run**: `lab/results/current-static/current.json`'s `"elapsedSeconds"`
    field. A committed artifact carrying a wall-clock value dirties the tree on
    every check.

**Prepared, not deployed** at the time of writing: the Cloudflare Pages `_site`
artifact (built and smoke-tested locally, `PASS 390px` / `PASS 834px`), the
Render host's new image (the PR merge is the deploy), and the reworded Academy
course notice (`academy/build-release.py` + `academy/verify-live.py`, whose new
assertions fail against the live page until it is republished — the expected
ordering, not a regression).
