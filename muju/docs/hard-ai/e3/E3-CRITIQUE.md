# E3 opening-session critique (independent, read-only)

Written 2026-09-17 06:45Z at `50b6a94c` on `claude/hard-ai-e3` (integration
worktree `~/src/deevgames-e3`). Bar: `../EPIC-PLAN-2026-09-16.md` §4 E3
(acceptance evidence per slice and the exit), §5 (experiment contract), §7
(decision record); `E3-PLAN.md`'s own judge rule, lane rules, row rules and
corrections; `../e2/E2-OPENING-CRITIQUE.md` C1 and its fix list; the shape of
`../e1/E1-CLOSE-CRITIQUE.md`.

What was run: file reads, Python over the committed artifacts under
`lab/results/hard-ai-e3/`, `git log --stat` / `git diff` over the lane
branches, and the identity one-liner
(`resolvedConfigHash('hard@desktop', {mode:'wall', ms:3000})` →
`4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`;
`hard@ablate:eval-no-safety` → `66edf9cdf58f6b037186b25d05a939ed521e8a76e07051937dcbc611eb343aaf`).
No engine run, no test suite. Read-only looks were taken at the four
post-synthesis lane worktrees (branches `lane9`–`lane12`, uncommitted at
writing) and at `~/src/deevgames-e3-run`, because the state of row #1 and of
its preconditions lives there and nowhere in the tree.

State at writing (all times UTC):

- 06:22:32 — `50b6a94c` lands: synthesis, plan corrections, row #1 preregistration, ALLOCATION E3 addendum.
- 06:29:54 — lane 10 writes the static reproduction with the arm's weights (`repro/static-eval-no-safety/`, 12 positions).
- 06:30:45–06:31:00 — lane 10 writes the exam records for both engines at 25k and 200k (`repro/exam/`).
- 06:32:07 — the coordinator writes the `e3-row1-go` marker.
- 06:33:06 / 06:33:50 — lane 10 writes the champion's and the arm's fresh work sweeps at the development root (`repro/sweep/`).
- 06:34:15 — row #1 launches from `~/src/deevgames-e3-run` at `50b6a94c` (pid 97431; manifest `git 50b6a94c`, `gitDirty true`, seed 20260931, `e1-val2.jsonl` sha `fe3b9c98…` = `ALLOCATION.md`, skip 0, 32 pairs, h0/h3, `--shards 1`, both arm hashes as preregistered, loadavg 3.3/5.2/5.8).
- 06:35:06 — lane 10 writes the 47-loss judgment (`loss-judgment/baseline47/`, 41 turns read, 39 distinct roots), static plus judges 1 and 4, no `aiv2-hard`.
- 06:35:19 — lane 11 queues the first safety sub-arm row (its own dated deviation is in its report).
- 06:40 — row #1 at 2 pairs / 5 games; E2's re-pin row (`hard@desktop` vs `aiv2-hard`, 100 pairs, wall:3000) has held slot 0 since 06:12; loadavg 6.6/9.0/7.5.

Nothing in the tree records that the preconditions were checked, their
outcomes, or the launch; the ledger row still reads "launches after the
reproduction record".

## Numbers re-derived from the artifacts

| # | claim (where) | artifact | reproduces |
| --- | --- | --- | --- |
| 1 | safety → played 9 of 10, Σ −5,100 cc; economy → adviser 8 of 11, Σ +3,613 (synthesis §1.5) | `loss-judgment/summary.json` `groupRanking` | yes |
| 2 | 11,019 of 16,916 cc total absolute group movement | same (5,780 + 5,239; 5,780 + 5,239 + 2,677 + 1,700 + 1,520) | yes |
| 3 | material gap +2.83 → −19.67 → −23.58, negative at +6 in 12 of 12 | 12 per-position `judge1.materialGap` | yes |
| 4 | joint claim holds at 6 of 12 (review caveat 1) | per-position `groupDeltas` | yes (g2-s20 B, g2-s5 A, g4-s10_0_8 A, g4-s2 B, g4-s6 B, g5-s11_3 B) |
| 5 | `g4-s2_3_1` and `g5-s11_3_11` carry 55% of the safety sum and 56% of the economy sum | 1,415 + 1,410 = 2,825 / 5,100; 892 + 1,147 = 2,039 / 3,613 | yes |
| 6 | Material → played 6/6; Rent 4/0; BankLiquid 3/0; BankExcess 5/0 | `featureDeltas` over 12 | yes |
| 7 | judge 2: nearer the played turn at 8 of 12; 21 / 13 / 21 over 55 slots | `judge2.agreement` | yes |
| 8 | judge 2 allowance 8,001–8,005 ms (synthesis), not 8,002–8,007 (lane 6) | `judge2.ms` min 8001, max 8005 | synthesis yes; lane 6 no |
| 9 | dev case `staticDeltaCc` −275 = Hanging −250 + RelocationDebt +60 + ApproachStrand −50 + KillAvailable −35; +60 with the block off | `g4-s6_3_5-B-white.json`; lane 10 `repro/static-eval-no-safety` +60 | yes |
| 10 | second case −1,475 = safety −1,415 + economy +892 + space −852 + material −100; −60 with the block off | `g4-s2_3_1-B-white.json`; repro −60 | yes |
| 11 | judge 4: no one-step kill and no hangable crystals for either side at either dev end state | `judge4` `kills` 0, `hangableValueCrystals` 0 × 4 | yes |
| 12 | `eval-no-safety` 14/0/2, 0.875, +338 [+168, +1200], 0.875 at h0 and h3 (7/0/1 each) | `ablate/eval-no-safety/fixed100k/metrics.json` | yes |
| 13 | exam exact 121/127 both; judgment 4/22 → 5/22; the arm newly fails `plugged-fire_2-vs-fire_3` and newly passes `spawn-strike-retreat-1` | `ablate/{desktop,eval-no-safety}/exam/dev.json` | yes |
| 14 | "lane 5's exam does not name which judgment row changed, so this is unmeasured" (synthesis §3.3 step 2) | same two artifacts: the row is `loss-g2-s5_0_2-A-white-t4` (False → True); the dev case `loss-g4-s6_3_5-B-white-t1` is unchanged, end key `4844d47f0e9b8049` = the case's `avoidKeys` entry | **no — it was measurable and the answer is negative for the dev case** |
| 15 | cost probe: champion 536.8 nodes / 964.7 evals / 3.17 / 99,158; arm 555.0 / 1,078.3 / 3.33 / 99,292; +3.4% nodes | `ablate/cost-probe.json` (555.0 / 536.83 = 1.0338) | yes |
| 16 | timing p95 1,936 ms (arm) vs 2,008 ms (champion) | `metrics.json` `timing` | yes |
| 17 | `SpawnArea` the largest single term on 9 of 16 loss roots (review), not 5 (lane 1) | `eval-audit/exam-dev/features.jsonl`, bucket `loss-root` | yes (9; Material 3, EconDelta 2, Hanging 1, PstMine 1) |
| 18 | loss-root group shares 13.8 / 15.6 / 14.7 / 21.4 / 34.6; Material share 0.09547 | `exam-dev/summary.json` `lossRoots` | yes |
| 19 | seven safety channels 16.8% of loss-root Σ\|w·f\| | `features.jsonl` (0.1682) | yes |
| 20 | 6 of 16 loss roots disagree with their rot180 mirror; exam-dev 17 of 149 | `features.jsonl` `rot180Bad`; `violations.json` `positions` 17 | yes |
| 21 | invariants pairs 12/20 positive; the six backwards pairs 3, 4, 6, 12, 19, 20 at −3,462 / −2,016 / −2,358 / −2,464 / −3,662 / −2,318 | `inv-audit/pairs.json` | yes |
| 22 | `invariantsSearched` 9/20 with placeholder weights, 6/20 with `DEFAULT_WEIGHTS` | `judgment/decompose.json` `searchPass*` | yes |
| 23 | the 19 safety indices 17, 28–36, 40, 41, 43, 45, 46, 49, 54, 56, 57; material untouched | row manifest `aResolvedConfig.weights.w` (a dict keyed by index) vs B | yes |
| 24 | "59 findings verified, 22 refuted" (synthesis line 25); "25 refuted" (plan corrections) | section 2 cites 59 distinct ids; appendix A has 23 bullets naming 26 ids, one of which (L2-F9) is cross-referenced as carried, so 25 refuted | 59 yes; **22 no**, 25 yes |
| 25 | B5's fix "moves `turnsToInsolvency` and `Insolvency`/`RunwayCliff`, which read the same running balance" | `tables/economy.ts:221` (`stream`) and `:224` (`running`) are separate accumulators; dropping the upkeep leg from `stream` leaves `running` and `out.upkeep` unchanged | **no** |
| 26 | L5-F7 refuted on "the row's own per-turn work ledger 70,736 vs 69,929" | no per-turn work is recorded in `games.jsonl` (`hardTiming` is aggregate) or in replays (`meta.players.*.turnMs` only) | not reproducible from the tree |

## Findings

### BLOCKER

**B1. The E3.2 concept does not generalise to the baseline losses, the
evidence exists, and the record does not carry it.** The retrofit landed at
06:07–06:12Z (`~/src/deevgames-e2-run2/…/analysis/baseline-losses-exposed`,
48 files) — before the synthesis commit — and lane 10 ran the loss-judgment
instrument over it at 06:35Z (uncommitted, `loss-judgment/baseline47/`, 41
turns, 39 distinct roots, 21 at h0 and 18 at h3, static plus judges 1 and 4).
Re-counted from those files:

- The static leaf prefers the played turn at 28 of 39, the adviser's at 9, ties at 2 (in-sample: 8 of 12).
- Safety moves toward the played turn at 17 and toward the adviser at 13 (in-sample 9 and 1).
- Economy moves toward the adviser at 16 and toward the played turn at 16 (in-sample 8 and 3).
- The joint claim (safety → played AND economy → adviser) holds at 6 of 39 (in-sample 6 of 12).
- `Hanging` moves toward the played turn at 13 and toward the adviser at 11.
- The largest single differing feature is `SpawnArea` at 10 roots, `Hanging` 6, `EconDelta` 6, `Material` 5.
- Judge 1: the seat's material gap at the played end state is −0.69 crystals (n = 39), not ahead; −18.95 three turns later; −32.03 six later (n = 36); negative at +6 in 30 of 36.
- With the 19 safety weights at 0 (lane 10's `baseline47/eval-no-safety`), the static preference flips to the adviser at 3 of the 28 roots where the champion prefers the played turn, reverses at 1, and is unchanged at 25 (in-sample: 2 of 8).
- Outcomes: elimination 22, home-checkmate 16, upkeep-elimination 1 (the rent half of the concept rests on the two upkeep-eliminations in the 12; there is one in the 39).

The in-sample signature (9 of 10, 8 of 11, 6 of 12) is therefore a property of
12 positions, near chance on 39. "Settled with two caveats" (plan corrections,
item 5) is not sustained. Fix before row #1's score is read: commit
`baseline47`, append the counts above to synthesis §1.5 and to the row #1
ledger entry, and read row #1 as what it is — an equal-time pricing of the
safety block (a group ablation), not a test of a named misconception. Fix
before row #2 is funded: restate §3.1 as in-sample-only or replace the concept
with the sub-block question lane 11 is running (C1).

**B2. The development case does not reproduce under search at any work a 3 s
turn buys, and the plan's precondition record says nothing.** The plan's row
#1 preconditions are (1) static +60 / −60, (2) the arm's exam end key on
`loss-g4-s6_3_5-B-white-t1`, (3) a fresh work sweep at that root.

- (1) holds (repro `static-eval-no-safety`: +60 and −60; verified against the arm's weight vector).
- (2) is negative: the arm plays `4844d47f0e9b8049` — the case's `avoidKeys` entry — at 25k (depth 2, 18,292 units) and at 200k (depth 2, 200,107 units; the champion completes depth 3 at 188,916). Lane 5's committed artifact already held this answer at 25k; synthesis §3.3 step 2 calls it "unmeasured".
- (3): the arm's fresh sweep flips at 400k and only within the 300 cc tolerance (`~` at 400k/566k/800k), never to the adviser's key; the champion never flips. The seat's implied work on this turn is 211k at 100 units/ms (E2 measured ~80 units/ms under row load).

So the E3.2 clause "correct it on a development case" is met statically and
not by the search the row prices. Fix: record the three outcomes in the plan
as a dated bullet, drop "reproduces the error" from the arm's description, and
require a searched flip inside the equal-time work band for whatever arm E3.2
retains as its fix.

**B3. Row #2's retention has no tactical column, and the A6 baselines it would
inherit are placeholder-weight numbers.** Lane 9 (uncommitted,
`lab/results/hard-ai-e3/preconditions/`) has landed A7-1 and re-measured the
suites at each case's own budget:

- `hard@desktop` with the placeholder vector (what `hard:suite` ran until now): tactics 73/79, spawn-strike 19/20, home-mate 56/56 (38 points).
- `hard@desktop` under `default-v1`: tactics 73/79 (.924), spawn-strike 16/20 (.80), home-mate 56/56 (40 points), invariantsEval 12/20.
- `hard@ablate:eval-no-safety` under its own weights: tactics 73/79, spawn-strike 15/20, home-mate 56/56.

A6's spawn-strike baseline (.95) was never met by the champion under the
weights it plays with; that is a red obligation §7 says must stay visible.
The arm zeroes `Hanging`, `KillAvailable`, `CleaveExposure` and `Exposure`,
i.e. the terms the tactics suite exists for; retaining it as champion
candidate with judgment counts "reported not gated" and no tactical threshold
is the case E3.3's acceptance text ("tactical non-regression") and E4.3
("retain tactical exemptions") forbid. Fix before row #2 is funded: commit
lane 9's numbers, preregister the tactical non-regression for the retained arm
(tactics ≥ 73/79 and home-mate 56/56 under real weights; spawn-strike within
one case of 16/20, stated), and record A6's spawn-strike baseline as unmet by
the champion under `default-v1`.

**B4. Row #2 and the correctness arm's confirmation are preregistered onto the
same rows (E2's C3 again).** 32 pairs at h0/h3 consume 16 openings (lane 5's
rows: 8 pairs → `openingsUsed` 4; row #1: 32 pairs from the 32-row pool).
`--openings-skip 32` therefore uses `e2-val.jsonl` rows 32–47, not 32–63; the
plan writes "rows 32–63" for row #2 and synthesis §5 writes "`e2-val.jsonl`
rows 32–63" for `eval-correct-v1`'s confirmation with no skip. Fix now, while
hypothetical: row #2 = rows 32–47 (skip 32, seed 20260932); the correctness
confirmation = rows 48–63 (skip 48), next ledger ordinal; nothing else may
touch 32–63.

**B5. "Champion byte-identical with the flags off" will rest on the config
hash, which does not hash code.** `resolvedConfigHash` hashes the resolved
configuration; a `src/ai/hard/**` edit whose flag is off leaves the hash
unchanged while play can change. Lane 12 (uncommitted) edits `config.ts`,
`engine.ts`, `eval/evaluate.ts`, `eval/features.ts`, `eval/invariants.ts`,
`tables/context.ts`, `tables/economy.ts` (432 insertions). E2 critique C5's
fixed-work golden was never added (`tests/` has none). E3.1 is safe — `git
diff 6adc0f2c..50b6a94c -- src/` is empty, so every lane's "hash unchanged"
is trivially true. Fix before any row launches from a commit carrying lane
12's edits (row #2 will, if it launches from a later head): record
`endKey`/`scoreCc`/`work` at fixed 400k on at least eight positions at
`50b6a94c` and assert them at the launch commit; A14/A15 do not substitute.

### CONCERN

**C1. Zeroing the 19 safety weights is a group ablation, not a fix of one
misconception.** The block includes `AnchorFragility`, `BlockingDeficit`,
`Inv6` (anchor geometry), `Inv17SelfBlock`, `Inv8`/`Inv9` (chip discipline)
and `Inv12`, none of which is "the price of a threatened own body". The
synthesis's own DESIGN-faithful correction (`w[Hanging]` −50 → −30,
`HangingBuy` −30 → −10) moves the dev case from −275 to −175 and does not
flip it, which is why the union was chosen. Lane 11's partition (threat stack
8 / anchor 3 / safety invariants 8; exam +2 / 0 / −1; `retreat-1` follows the
threat stack and `plugged-fire_2` follows the invariants) is the fix-shaped
decomposition, and its fixed-work rows are queued behind row #1. Row #1 is a
legitimate screening row of the block; the arm that may become champion
candidate should be a sub-block or a correction, priced by its own screening
row, not this union by substitution.

**C2. The prior is a selected maximum on four openings.** +338 is the best of
six group arms measured on the same four `e1-dev` openings; per opening the
arm scored 3/4, 4/4, 4/4, 3/4 (a sign test over the four independent units
gives one-sided p = 1/16); both losses came as white (6/8 white, 8/8 black).
The plan quotes "0.875, interval [+168, +1200]" without the selection and
states the √2 caveat only; the h0 stratum alone has `eloLo` 117. The ≤ 0.5
falsification rule is fine for a screening row; the prior sentence should say
"selected best of six, four openings".

**C3. Every misjudgment claim names a non-adviser judge (C1 is satisfied in
form), but none of the named judges decides.** Judge 1 follows the played line
of a loss-selected corpus and, on 39 roots, the seat is not ahead at the
decision (−0.69). Judge 2 at the dev case is "nearer in L1 contribution space"
by 3% (3,427 vs 3,522) while lane 6's group-level reading is nearer the played
turn at 8 of 12 and "gives the concept no group-level support". Judge 4 is a
one-step count that by construction cannot see `Hanging`'s domain (purchases,
promotions, several lanes); the artifacts record 0 contradictions, and the "4
of 24 sign disagreements" are lower-bound comparisons the synthesis itself
says are not bug claims. The row's real motivation is the fixed-work
ablation, which is judge 1 at fixed work on development openings — stated, but
the §0 paragraph reads as if three judges converged.

**C4. The launch ran ahead of its own precondition record and is unrecorded.**
The `e3-row1-go` marker (06:32:07Z) precedes the arm's sweep file (06:33:50Z);
the launch (06:34:15Z) follows it by 25 s. The preconditions exist only in
lane 10's uncommitted worktree; the plan's ledger row is unchanged; no bullet
names the launch commit, time, load or outcomes. Lane 11 recorded its own
90-second deviation the moment it bent; the coordinator's record should meet
the same standard (E2 critique B2).

**C5. B1–B5 against the plan's definition, and the bundling order.**

- B4 (`Inv3` conjunct) and B5 (rent twice) are bugs by the engine's own specification (DESIGN §5.13 row 3; DESIGN.md:1348 "charged **once**"). B4's fixture contradicts DESIGN's clause, so which is the spec is an owner ruling (lane 2 A3); the fix makes the invariant fire in 22 of 965 cases, and row #1's arm zeroes it anyway.
- B3 (`Infiltration` identically zero) is a bug by canonical fact, but its fix is a new definition (per-anchor voiding) and needs a DESIGN §5.12.1 amendment (lane 1 item 7) — the standard the synthesis applies to `SpawnArea` in §3.6.
- B2 (rot180) is a bug by canonical fact (rules-identical positions score differently, mean 211–480 cc) and a recorded, gate-exempted deviation; its fix direction (which total order) has no judge.
- B1 (`EconDelta` non-monotone in reserve) is neither: DESIGN §5.8 (DESIGN.md:1147) specifies "a dry miner relocates", so `take === 0` is the specification, and monotonicity in projected income is not a canonical fact of the rules. The synthesis says "fix direction is not established". It is a design limitation of a heuristic and belongs with the calibration items until DESIGN is amended.
- The synthesis's note that B5 moves `turnsToInsolvency` is wrong on the code (table row 25).
- Bundling five flags into one arm after the concept row is defensible on the opening budget (one screening block left) but leaves a null or a loss unattributable, and the bundle mixes one member whose judge-1 direction is against (B5), one that is 0 cc on every loss root (B3), one with n = 1 (B1) and one that is a tie order (B2). Fixed-work descriptive rows per flag on `e1-dev` cost no validation block; run them first and bundle only flags with a non-negative sign. State which baseline the correctness rows compare against if row #2 retains `eval-no-safety` (B4's flag is then moot).

**C6. Finding ids are not traceable and the review's measurements are not in
the tree.** Only lane 2 numbers its findings as `L2-F<k>`; `L1-F14`, `L4-F10`,
`L5-F10`, `L7-F10`, `L8-F9` exist only in the synthesis. The two-lens review's
bootstraps (space +13.4 [+2.6, +25.1]), the 0-of-2,297 lazy-exit count, the
DrawPressure 4-of-15 measurement and the per-turn work ledger behind the
L5-F7 refutation have no script or artifact in the tree; the last cannot be
recomputed at all (table row 26). E2 critique C4 applies.

**C7. Judgment counts are budget-fragile and the one "real agreement" is
gone at 200k.** In lane 10's repro exam at 200k, the champion plays
`82ee31872ff9ee0a` and the arm `187dc5a8404d0867` at
`loss-g4-s2_3_1-B-white-t2`, neither the adviser's `dd8b039153935d77` both
matched at 25k. The row report's plan to carry 25k and 200k is right; the
retention rule must not read a judgment delta at either budget.

**C8. Two wall:3000 rows share the box, and load is not recorded per game.**
E2's re-pin row (slot 0, since 06:12Z) and row #1 (slot 1) run together with
lane 11's fixed-work row queued and lanes 9/10/12 running probes; loadavg was
3.3 at launch and 6.6–9.0 at 06:40Z. Within-row fairness holds; the rung
distributions the mechanism check compares with E2's are load-dependent (E2
N9, still open). Row #1's first game shows 5 overruns in 37 turns and 8
aborted searches; A14's 5% rule is computed at the end, not on five games.

**C9. Healing and quiet-clock semantics are audited thinly.** Healing: lane 2
read every `p.damage` consumer and one constructed `upkeepPending` node, and
the exam's 32 `healing` exact cases pass for all seven engines at the root.
What is not said: at an `upkeepPending` node the incoming side's units still
carry damage (`turn.ts` pauses `startTurn` before `resetUnitActions`, which is
the heal, `board.ts:283-289`), and the kill DP's `need = defense − damage`
(`kill.ts:541`) then discounts the just-moved side's next-turn kills on units
the rules will heal before it can act — a phantom discount, rare (18 of 1,000
fuzz positions carry damage), named by lane 2 as "live only at
`upkeepPending` nodes" but not called. Quiet clock: 40 fixture positions plus
arithmetic; no played position at clock ≥ 7 was examined (the tuning corpus
has 6 inactivity games in 520); quiescence stand-pat parity (`quiesce.ts`)
unmeasured, as the synthesis says.

**C10. A validation-opening Texel fit ran.** Lane 8's smoke fit trained on
894 of 1,335 rows from `e1-val.jsonl` and `e1-val2.jsonl` games. The vector is
discarded and marked `candidate: false`, so no decision leaked; the letter of
`ALLOCATION.md` ("never tuned against") was still bent and the ruling lane 8
asks for (A8.2) must land before E3.3.

**C11. Lane 7's decomposer ran 7 min 1 s with `--no-heavy`** against the
rule that engine runs over five minutes go through the heavy queue. Recorded
by the lane, harmless, unrecorded by the coordinator.

### NOTE

- **N1.** The synthesis's refuted count is 22; appendix A refutes 25 ids in 23 bullets; the plan's corrections say 25.
- **N2.** The plan's corrections and ledger say "06:4xZ"; the commit is 06:22:32Z.
- **N3.** Lane 5's six rows ran at `6629a482` with `gitDirty true` — the arms were uncommitted until `d31301d7`; identity holds by the manifests' resolved configs (verified: A zeroes exactly the 19 indices, material identical), not by commit.
- **N4.** Lanes 6 and 7 merged lane 4's branch themselves (the plan says the coordinator merges); lane 6 created `loss-facts.ts` beside its listed `loss-judgment.ts`; lane 4's `package.json` change is one line. No lane touched a file outside its ownership; no case, suite, position or opening file changed (`git diff 6629a482..50b6a94c` on those paths shows only `ALLOCATION.md`'s addendum).
- **N5.** Judge 2's allowance range: synthesis right (8,001–8,005), lane 6 wrong.
- **N6.** At the dev root the arm completes depth 2 at 200k where the champion completes depth 3; "cheaper per node" is position-dependent; the mechanism check should read completed depth per turn, not only rung.
- **N7.** Row #1's game records do carry `rung` and `unitsPerMs` (E2 lane 1's fields), so the preregistered mechanism check has its data.
- **N8.** E2 critique fix 6 (the judge sentence) is done; fix 5 (the golden) is not; fix 7 (h3 pool digests) is not visible in this tree.
- **N9.** `E3-PLAN.md`'s "next concept in section 3.6's order" points at "Rejected alternatives"; the fallback after a null is not preregistered. `HomeCountdown` at `g4-s10_3_9-A` (one feature, judge 2 on the adviser's side) and the sub-blocks are the natural candidates.
- **N10.** The row manifest's `openings.ids` lists the 32-row post-skip pool; `openingsUsed` will be 16, matching "rows 0–15".

## The six questions

1. **E3.1 against its acceptance evidence.** Double counting: settled with code lines and measurements (rent twice at `economy.ts:221` vs DESIGN.md:1348; `SpawnZero`/`Inv1`; `HomeInvaded`/`Inv10`; the blocking triple; `DepletionWaste`'s identity), and EPIC §4's specific question (bank / projected mining / reserves) answered no with the coefficient error named instead. Side symmetry: settled (0 side-swap violations on 2,151; rot180 confined to three economy features; 6 of 16 loss roots affected — all reproduced). Healing and quiet clock: thin (C9). Contradictory preferences vs engine bugs: settled by judge 4 for the 30 economy rows, 4 exam fixture faults and the invariants pairs; the 11 weight-scale exam rows remain adviser-only and are correctly not called misjudgments. The 47 losses: not in E3.1 as merged; now measured by lane 10, and the measurement undercuts item 5 (B1).
2. **The judge rule.** Every claim feeding the choice names judges 1, 2 or 4; judge 1 is loss-selected and played-line only; judge 2 was inconclusive by lane 6's own reading; judge 4 cannot see the feature it is asked about. Formally compliant, substantively undecided (C3).
3. **The E3.2 choice.** A group ablation dressed as one concept (C1); the +338 is a selected maximum on four openings (C2); the preregistration's openings, seed, arm hash, one-commit rule, prediction, mechanism check, void rules and null meaning are all stated and correct; the development-case reproduction fails under search (B2); row #2's rows collide (B4); the tactical column is missing (B3). Required before row #2: B1–B5 above.
4. **Process.** Champion hash unchanged in every lane and at head (verified); `src/` untouched from `6adc0f2c` to `50b6a94c`; no fixture repaired; no validation block consumed before row #1 (the plan's original `e1-val.jsonl` 16–31 error was corrected before use; ALLOCATION's E3 addendum matches E2's ledger); one commit for both arms (`50b6a94c` in the run worktree); the go signal preceded precondition (3) by 103 s and nothing records the launch (C4); lane 11's 90-second deviation is self-recorded; lane 7's 7-minute `--no-heavy` run bent the heavy-queue rule (C11); lane 8's fit touched validation rows (C10); the plan's timestamps postdate its commit (N2).
5. **B1–B5.** B4, B5 yes by specification; B3 yes but needs a DESIGN amendment for its fix; B2 yes by canonical fact, already a recorded deviation, fix direction unjudged; B1 no — the DP does what DESIGN §5.8 says. Order: concept row first is defensible; the bundle should be preceded by free per-flag fixed-work rows and its baseline named (C5).
6. **Numbers.** 26 checked; 23 reproduce; three do not (the "unmeasured" exam row, the 22 refuted, the `turnsToInsolvency` note) and one cannot be recomputed from the tree (the L5-F7 per-turn work ledger).

## Verdicts

**E3.1: MET WITH GAPS.** The audit is unusually well instrumented and its
numbers reproduce almost everywhere; double counting, symmetry and the
authored-vs-bug separation are settled by judge 4 with code lines. The gaps
are the healing discount at `upkeepPending` nodes and the quiet clock in play
(both unmeasured), and the sixth item — the loss-dominant concept — which the
47-loss set, available ten minutes before the synthesis was committed and
measured ten minutes after the row launched, does not support.

**E3.2 preregistration: SOUND WITH FIXES.** The row's mechanics are right and
it is honestly a screening row; what it prices is the safety block at equal
time, and the record must say so before the score is read. Row #2 is not
fundable as written: no tactical column, the wrong opening rows, a concept
statement the out-of-sample evidence contradicts, and a correctness arm whose
identity with the champion will be asserted by a hash that does not see code.

## Fixes, in priority order

1. Before row #1's score is read: commit lane 10's `repro/` and `baseline47/`; append a dated bullet to `E3-PLAN.md` with the three precondition outcomes (static +60 / −60; arm plays the avoid key at 25k and 200k; sweep flips at 400k within tolerance only), the launch time, commit and load; relabel row #1 as the equal-time pricing of the safety block.
2. Append the 39-root counts (17/13, 16/16, 6 of 39, 3 static flips of 28, judge 1 −0.69) to synthesis §1.5 and mark the concept in-sample-only; correct §3.3 step 2 (the changed judgment row is `loss-g2-s5_0_2-A-white-t4`, not the dev case).
3. Preregister row #2 as `e2-val.jsonl` rows 32–47 (skip 32) and `eval-correct-v1`'s confirmation as rows 48–63 (skip 48), and require the retained arm to have a searched flip inside the equal-time work band on its development case.
4. Before row #2 is funded: commit lane 9's suite re-measurement, preregister the tactical non-regression threshold for the arm, and record A6's spawn-strike .95 as unmet by `hard@desktop` under `default-v1` (16/20).
5. Before any row from a commit carrying lane 12's edits: the fixed-work golden at `50b6a94c` (E2 critique C5), asserted at the launch commit.
6. Correctness list: move B1 to calibration until DESIGN §5.8's relocation rule is amended; require a DESIGN §5.12.1 amendment before B3's new definition enters an arm; correct the B5 note; run per-flag fixed-work rows on `e1-dev`; name the baseline for the correctness rows if row #2 retains.
7. Rewrite the plan's prior sentence: selected best of six on four openings, sign test p = 1/16, seat split 6/8 and 8/8.
8. Wait for lane 11's three sub-arm rows before choosing the arm for any confirmation; if the effect sits in one sub-block, that sub-arm gets its own screening row on `e1-val2.jsonl` rows 16–31 and the union is closed.
9. Traceability: number findings in the lane reports or add an id → section map; commit the review's scripts or drop the four numbers that cannot be recomputed.
10. Fix "22 refuted" → 25 and lane 6's allowance range; correct the plan's timestamps.
11. Lane 2: one sentence naming the `upkeepPending` kill discount as counting damage the rules heal first, with its 18-of-1,000 rate; build the clock ≥ 7 corpus before any `DrawPressure` arm.
12. Rule on validation replays in tuning corpora (lane 8 A8.2) before E3.3 opens; record lane 7's `--no-heavy` overrun and lane 11's deviation in the coordinator's record.
13. Record box load per game from row #1 on, and read the rung/units-per-ms mechanism check with completed depth beside it.
