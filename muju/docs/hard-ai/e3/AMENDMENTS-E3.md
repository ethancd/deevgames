# E3 amendments decided (coordinator, owner decisions delegated)

Ethan delegated owner decisions for the Hard AI campaign ("zero decisions,
use your judgment"). Each entry states the original bar, the observation, the
new bar, the reason and the effect on the product promise, as EPIC-PLAN §7
asks. Lanes propose in `amendments/lane<N>.md`; nothing there is applied by
the lane that proposed it.

## A-E3-1 — `Infiltration` (DESIGN §5.12.1 row 11) is defined per anchor

- Original: row 11 reads as a count of (own unit, enemy unit) pairs; DEVIATIONS
  M9 records the "fix" into that pair count.
- Observation: the pair relation is symmetric under the two corners, so the
  symmetric difference is identically zero on every legal position (lane 1,
  lane 4: 0 of 2,151 positions non-zero; proved on all 10,000 square pairs).
  A weight of +90 on a feature that is always zero is a specification error.
- New bar: row 11 means "enemy anchors my bodies void", DESIGN §5.8's
  `anchorsVoidedBy` per anchor. Implemented behind `evalFix.infiltrationPerAnchor`
  (lane 12, B3), non-zero on 294 of 1,000 fuzz positions, median 180 cc.
- Effect: none on the shipped default until a row retains the bundle; the
  champion's hash is unchanged with the flag absent.
- Decided 2026-09-17 by the coordinator under the delegation.

## A-E3-2 — B1 (economy DP relocation trigger) is an open flag, not a fix

- Original: synthesis §5 listed B1 as a bug by canonical fact (adding a
  crystal lowered projected income).
- Observation: lane 12's stay-versus-relocate comparison removes 4,092 of
  4,102 reserve-monotonicity violations but leaves 10 (one opening family,
  −48 cc, a six-turn horizon truncation); monotonicity needs a per-miner
  schedule, which is a DESIGN §5.8 change.
- New bar: B1 stays a flag with its oracle check; it is excluded from
  `eval-correct-v1`'s row until DESIGN §5.8 is amended. `eval-correct-v1` =
  B2 + B3 + B4 + B5.
- Decided 2026-09-17 by the coordinator under the delegation.

## A-E3-3 — A6's spawn-strike baseline .95 was a placeholder-weights number

- Original: A6 records `hard:suite` baselines tactics .918, spawn-strike .95,
  home-mate 56 as the M14/M17 reference.
- Observation: `suites/run.ts` built every searched engine with the version-0
  placeholder weights (lane 7 L7-F1; lane 9 A7-1 fixed it). Under
  `default-v1` the champion measures tactics .9178 (unchanged), spawn-strike
  .80, home-mate 56/56.
- New bar: none is lowered here. The .95 is recorded as UNMET by the champion
  under its real weights; M14's `spawnStrike >= 0.80` passes with zero margin.
  Whether the release contract keeps .95 is the named approver's call and is
  carried into E6's inventory. E3 rows use the re-measured numbers as the
  non-regression reference.
- Decided 2026-09-17 by the coordinator under the delegation.

## A-E3-4 — B6 (`approachTieOrder`) joins `eval-correct-v1`

- Original: the bundle was B2 + B3 + B4 + B5 (A-E3-2).
- Observation: with B4 on, `tables/approach.ts` breaks an attack-square tie by
  scan order, which rot180 reverses, so `retreats` and `Inv3RetreatSquare`
  disagree with their mirror on 5 of 1,000 fuzz positions (250 cc each); with
  B6 beside B4 the corpus has 0 of 1,000 mirror violations (lane 14,
  `E3.2-CORRECTNESS-B6.md`). B6 alone changes no move (nothing reads
  `retreats` without B4).
- New bar: `eval-correct-v1` = B2 + B3 + B4 + B5 + B6, hash `49aa15dba67f…`
  at wall:3000 from the merge of lane 14. The per-flag descriptive rows run
  the singles B2–B5 from the run worktree at a0f03c4e (bundle B2–B5 there); the
  bundle row and B6's own row run after row #2 from a re-detached worktree.
- Decided 2026-09-17 by the coordinator under the delegation.

## A-E3-5 — the exam set is not re-seeded; dead and won rows are reported

- Original: E1.2's seeder carried the judgment rows now proven dead
  (A7-3) and `cases/dev.jsonl` holds hand-added E2.1 rows the seeder would
  not preserve (lane 13 dry run: a re-seed writes 141 rows for 149, drops
  eight, judgment denominator 22 → 17).
- New bar: `cases/dev.jsonl` stays as committed (fixture identity, E1.2's
  rule); the runner reports `won` and `dead` as their own outcome classes and
  every exam count is quoted as matched / won / dead / unmatched. The seeder
  gets a bounded task to preserve hand-added `source.kind: authored` rows
  before any future re-seed. No count from before A7-2/A7-3 is compared with
  one after without restating it.
- Decided 2026-09-17 by the coordinator under the delegation.

## Correction to A-E3-1 (18:02:43Z from `date -u`, appended; close critique B2)

- A-E3-1's "original" line called DESIGN's text "a count of pairs". It is not:
  `DESIGN.md` §5.12.1 defines `infiltrationAnchors = Σ over own slots inside an
  enemy rectangle of anchorsVoidedBy` (a sum with multiplicity). The pair
  count is DEVIATIONS M9's rewrite (2026-09-15), which is identically zero as
  a difference (lane 1, 0 of 2,151 positions).
- B3 (`features.ts voidedAnchors`) counts DISTINCT enemy anchors with at
  least one own body inside. That is a third definition, so B3 is a
  redefinition, not a restoration of DESIGN's formula. The bundle is four
  specification fixes (B2, B4, B5, B6) and one redefinition (B3).
- The definition is adopted for the `eval-correct-v1` arm by the DESIGN §9
  addendum of the same stamp, under Ethan's delegation, pending ratification;
  the shipped evaluator is unchanged until the arm is retained.

## Decisions taken under delegation at the E3 close (2026-09-17 19:34:37Z, `date -u`)

Approver line for everything in this section: Ethan, 2026-09-17 ~18:5xZ,
"don't bother me on any of these decisions, use your best judgment". Each
entry states the original bar, the observed result, the decision, the reason
and the effect on the product promise (EPIC-PLAN §7 amendment form).

### A-E3-6 — A-E3-1 (B3, distinct-anchor `Infiltration`) is RATIFIED

- Original bar: DESIGN §5.12.1 `infiltrationAnchors = Σ over own slots inside
  an enemy rectangle of anchorsVoidedBy` (sum with multiplicity).
- Observed: the shipped M9 pair count is identically zero (0 of 2,151
  positions); DESIGN's sum was never implemented; B3 counts distinct voided
  anchors and is the definition row #4 is running with tonight.
- Decision: ratify the distinct-anchor definition as DESIGN's specification
  (the §9 addendum of 18:0xZ stands as the spec change). B3 is therefore a
  specification CHANGE ratified before its arm's strength is read, not a fix;
  the bundle is described as "four fixes and one ratified spec change" from
  here.
- Reason: an anchor denied by three bodies is denied once; multiplicity would
  reward stacking, the pair count sees nothing. Changing B3 to DESIGN's sum
  now would alter the preregistered arm under a running row.
- Product promise: unchanged (the shipped evaluator is untouched until an arm
  is retained under M20/E6).

### A-E3-7 — A-E3-3 (A6's spawn-strike .95 was a placeholder-weights number) is RATIFIED

- Original bar: A6 `spawnStrike ≥ .95`. Observed: the .95 was measured with
  the version-0 placeholder vector; under `default-v1` the champion measures
  .80 (16/20) at per-case budgets and at M14's 400k gate. Decision: A6's .95
  is recorded as unmet by the champion; the bar is NOT lowered; the obligation
  stays visible in every §7 record. Reason: §7 forbids silently lowering a
  target. Product promise: a red obligation on the release inventory.

### A-E3-8 — M14's `spawnStrike >= 0.80` stands against the retained candidate

- Original bar: M14 `spawnStrike >= 0.80` at the gate's setting; §5 "suites
  no worse than M14" is a release veto.
- Observed: `hard@ablate:eval-no-safety` scores .75 (15/20, loses
  `spawn-strike-purchase-1`) at fixed 400,000; champion and bundle .80.
- Decision: the bar is NOT amended. The candidate remains the retained
  champion candidate on the strength rule (development evidence) and carries
  the veto as a red obligation: it cannot become a shipped default until
  `purchase-1` is won back at the gate setting. The way to win it back is the
  per-weight rows already queued (which of the 19 zeroed weights protects
  `purchase-1`; restoring that weight alone is arm `eval-no-safety-keep-<w>`
  and is priced by its own screening/confirmation rows).
- Reason: lowering a tactical bar to fit a candidate is the failure mode the
  postmortem named. Product promise: unchanged; nothing ships from E3.

### A-E3-9 — A8.2 ruling: validation and sealed replays are EXCLUDED from every tuning corpus

- Original bar: E3.3's corpus rule (`E3.3-TUNING-INSTRUMENT.md`) left
  validation-opening rows in the corpus as an open question (A8.2).
- Decision: a tuning corpus (`lab/hard-ai/tune/corpus.ts`) may contain
  positions from games whose opening is in a DEVELOPMENT-stratum pool only
  (`e0-openings`, `e1-dev`, `e1-baseline`'s development rows, and any
  future `e<N>-dev`); games opened from `e1-val`, `e1-val2`, `e2-val`,
  `e4-val` or `e1-sealed` are dropped at corpus build time, by opening id,
  and the corpus manifest lists the excluded game count. No E3.3 fit is read
  until the corpus is rebuilt under this rule.
- Reason: a fit that has seen validation positions makes every later
  validation row optimistic, and no post-hoc correction recovers that.
- Product promise: unchanged; it protects the equal-time rows that back it.
