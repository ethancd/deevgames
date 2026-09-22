# p3 retune campaign — Lane P (prep: p3 scripted reference, phasing-evidence, A7, Gate 1 adoption)

Worktree `/Users/ashkie/src/deevgames-p3-laneP`, branch `claude/p3-laneP`, cut from
`claude/muju-hard-p3-retune` at `ef6cdccf` (the campaign spec commit). Owns, per
`docs/changes/2026-09-22-p3-retune-SPEC.md` §2: `lab/harness/results/p3-scripted-2026-09-22/**`,
`tests/lab/phasing-evidence.test.ts`, `lab/harness/**` (not edited — the p3 output was not
wrong), `lab/hard-ai/analyze/replay.ts` (not edited — see "Not touched"), `lab/ai/gate1-sources.ts`,
`lab/ai/gate1-references.json`, `tests/lab/gate1.test.ts`, `docs/hard-ai/
PHASING-PREREGISTRATION-2026-09-18.md` (A7 append only), this file. `src/**` was not touched.
One file outside the declared ownership list, `lab/ai/gate1.ts`, was touched for exactly the one
line the spec's step 4 explicitly named ("reword the loadBands error that names the ten-ply
clock"); nothing else in that file was edited, and it is called out separately below.

## Step 1 — p3 scripted reference (840 games)

`uptime` before the run: load averages **16.43 / 11.76 / 8.42** (other p3-retune lanes active on
the same box — Lane T is the heavy CPU consumer per the spec's §7). Ran:

```
node --import tsx lab/harness/phasing-round-robin.ts lab/harness/results/p3-scripted-2026-09-22
```

Wall time ~37s. `endLoad` **15.68 / 12.00 / 8.65**. `manifest.json`: `rulesVersion
"muju-phasing-3"`, `inactivity {limitPlies: 10, warningPlies: 7, resetBy: "an attack that removes
a unit"}`, revision `ef6cdccf`, `dirty: false`. `totals.json`: 840 games, `illegalActions: 0`,
`invariantFailures: 0`, `adjudications: 0`, `inactivityDraws: 0`, `changedDuringRun: []`.

**Kill-clock endings and ties** (counted directly from `games.jsonl`, per the spec's explicit
instruction):

- 417 / 840 (49.6429%) games reach `winType: 'kill-clock'`.
- 408 of those are decided by unequal mined totals; **9 are exact ties** (`winner: null`).
- `inactivityDraw: true` occurs in **0 / 840** games — this is expected, not a bug: `GameRecord.
  inactivityDraw` keeps meaning `victoryReason === 'inactivity'` (kill-clock coordinator decision
  3), and a kill-clock ending is `winType`, never that flag. Every kill-clock game's
  `maxInactivityPlies` is exactly 10, never more.

A paired comparison against `p2-scripted-2026-09-19` (same seed, same bots, same seat/handicap
pairing, game *i* to game *i*) shows all 840 games agree move-for-move up to the point either
clock could first fire: **423 identical** (winner, winType, completedTurns), **417 differ, and
every one of the 417 is a p3 `kill-clock` ending** — 0 games move the other way. The full
breakdown, per-bot kill-clock rates and the re-frozen bands are in `REPORT.md` (added alongside
`SHA256SUMS` in the p2 style) inside the results directory.

**Frozen Gate 1 bands from this campaign** (`sanity-bands.json`): purchases per seat
`[1.3839285714285714, 186.92857142857142]` (identical to p1's 10-ply band); inactivity draws
`[0, 0.11419614448811528]` — every stratum's `inactivityDraws` count is 0, because
`inactivityDraw` is structurally always false under the kill clock, so this band is satisfied
trivially by construction from here on and no longer discriminates on inactivity behaviour. This
is stated explicitly in `REPORT.md`, A7 and `gate1-references.json` rather than left to look like
a defect in the numbers.

Commit `6143374f` — `p3 scripted reference: 840 games under the kill clock (muju-phasing-3)`.

## Step 2 — `tests/lab/phasing-evidence.test.ts`

Added the p3 row to `CAMPAIGNS` (`current: true, edits: {}`); p1 and p2 stay `current: false`
with their existing declared `A4_HARNESS_EDITS`/`PHASING3_HARNESS_EDITS` lists, both unchanged.
The dormant "is the reference this tree plays under" block now imports `INACTIVITY_LIMIT`/
`INACTIVITY_WARNING` from `src/game/inactivity` instead of the `20`/`17` literals, and its draw
predicate reads `winType === 'kill-clock'` in place of the now-always-false `inactivityDraw` flag
— an equality on the real terminal condition (ties and wins alike close the clock at exactly
`maxInactivityPlies === INACTIVITY_LIMIT`), never loosened into a truthiness check.

`npx vitest run tests/lab/phasing-evidence.test.ts`: **10/10 passed**, including the newly
re-armed "is the reference this tree plays under" test for the p3 row.

Commit `9eb164bc` — `phasing-evidence: re-arm the current-reference checks at muju-phasing-3`.

## Step 3 — Amendment A7

Appended to `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`, same form as A4 (rules revision
change) plus the Gate 2 claim protocol of the campaign spec's §4, reproduced **verbatim**
(seeds 20260975-8, `p1-val.jsonl` all 32 openings, handicap 0, seat-mirrored, ≤4 shards, work
column, bars, void conditions). States what A7 voids — every `muju-phasing-2` Gate 1/Gate 2
row-readiness state (no row was ever adopted at that revision, so nothing *passed* is voided
beyond readiness), the p2 scripted reference and its bands, and the suite-authoring ledger's seq 2
reading (`lab/hard-ai/suites/phasing/results/v3-measure-2-2026-09-22`, measured against source
hashes the kill clock changed) — and what it keeps: the p1/p1-val/sealed opening corpora, A3's
budget and sharding design, A5's per-search calibration rule, A6's informational-Gate-0 waiver.
`AMENDMENT` (the `lab/ai/gate1-report.ts` constant) stays `'A3'`: A3 is the protocol, A4 and A7
are the revision-specific `rulesAmendment` values, and the protocol itself did not change.

Committed **alone**:

- Commit hash: **`2ade2c33107c7a20838d618e884c71e6fe7d4944`**
- `docs: A7 — preregister Gate 1 re-adoption and Gate 2 protocol at muju-phasing-3`
- Document sha256 at that commit (full file, A1 through A7): **`7502e2d9f194fd2e4c9ef3aed9282b05d3a851db88d7557b383b14b98d8f1fb8`**
  (computed as `git show 2ade2c33107c7a20838d618e884c71e6fe7d4944:muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md | shasum -a 256`,
  the same path form `gate1.ts#adoptedProtocol()` reads with `git show <commit>:<path>`)

Both values are recorded in `gate1-references.json#rulesAmendment` (step 4) and are what
`adoptedProtocol()` verifies against on every invocation, not merely at authoring time.

## Step 4 — Gate 1 adoption at `muju-phasing-3`

`lab/ai/gate1-sources.ts`: `BANDS_PATH` -> `lab/harness/results/p3-scripted-2026-09-22/
sanity-bands.json`; `SUPERSEDED_BANDS_PATH` -> `lab/harness/results/p2-scripted-2026-09-19/
sanity-bands.json` (p1's, which p2 itself superseded, stays on disk one level further back for
audit — not renamed into this constant, since the guard only ever needs to refuse the *most
recently tried wrong* path by name). The file's doc comment now explains both the p1->p2 rescale
(A4) and the p2->p3 meaning-change (A7, `inactivityDraw` goes structurally-always-false) as two
different kinds of "the bands moved," not one repeated pattern.

`lab/ai/gate1.ts` (one line, outside this lane's declared ownership, edited only because step 4
explicitly named it): the `loadBands` guard's error string no longer says "frozen under the
10-ply inactivity clock A4 replaced" — that phrase would now be actively misleading, since the
*current* bands are also 10-ply (only the verdict differs). Reworded to name the revision change
generically ("the inactivity/kill-clock revision A7 replaced"). Nothing else in `gate1.ts` was
touched.

`lab/ai/gate1-references.json`: `rulesVersion` -> `muju-phasing-3`; `bands` -> the p3
sanity-bands.json (`path`, `sha256` `0056c2cd55e4d0b2aa12b1fb03e36429ad12e0ef04034cd86aeefa7c2ea463e6`,
`purchaseRatePerSeat`, `inactivityDrawRate`, `frozenBy.commit` `6143374fda9b6120a4e12ba8fbbe2e12ac03a41e`);
`supersededBands` -> p2's record (was p1's); `bandsSha256` moved to match; `rulesAmendment` ->
`{id: 'A7', commit: 2ade2c33…, sha256: 7502e2d9…, rulesVersion: 'muju-phasing-3', voids: …}`; A4's
former `rulesAmendment` record demoted into `supersededAmendments` alongside A2. `amendment`
(A3, the protocol) is byte-identical to before — unchanged, as A7 requires.

`tests/lab/gate1.test.ts`: the comment above `GATE1_ADOPTED` reworded from "Gate 1 is DEFERRED" to
"Gate 1 is RE-ADOPTED under amendment A7," describing the live mechanism rather than the prior
state. The `:303`-region test (now further down after the earlier edits) renamed from "reads the
bands re-frozen under the 20-ply clock…" to "reads the bands re-frozen under the kill clock…", its
docstring rewritten to explain the meaning-change (not just a rescale), and its path/rulesVersion
expectations moved to p3/p2. Running the suite surfaced one more stale literal not named in the
spec's file list — the "passes A3 full evidence…" test asserted `protocol.rulesAmendment` matches
`{id: 'A4', …}` and `protocol.document` contains the A4 header string; both are now factually
wrong once A7 is adopted, so both were updated to `A7` and its header string. This is a direct,
mechanical consequence of A7 superseding A4 as the operative `rulesAmendment`, not an independent
decision — it was caught by running the suite, not by re-reading the spec's file list.

**Verified directly** (not merely by test): `node --import tsx lab/ai/gate1.ts --plan` now prints
`"status": "adopted"`, `"rulesVersion": "muju-phasing-3"`, `"rulesAmendment": {"id": "A7", …}`,
and `"bands": {"path": "lab/harness/results/p3-scripted-2026-09-22/sanity-bands.json", …}` — Gate 1
accepts the revision without playing a game, exactly what step 5 asks to confirm. `adoptedProtocol()`
and `loadBands()` were also called directly from a one-off script and both returned successfully
(no throw) against the live tree.

Commit `05807b84` — `gate1: adopt A7 — BANDS_PATH/rulesAmendment move to muju-phasing-3`.

## Step 5 — Gates

`uptime` before the round robin (step 1): load averages 16.43 / 11.76 / 8.42; end load 15.68 /
12.00 / 8.65 — moderately loaded throughout (other p3-retune lanes active), consistent with the
campaign spec's warning that Lane T is a heavy CPU consumer.

```
npx vitest run tests/lab/phasing-evidence.test.ts tests/lab/gate1.test.ts \
  tests/lab/openings-p1.test.ts tests/lab/phasing-harness.test.ts tests/lab/analyze-phasing.test.ts
```

**5 files passed, 81/81 tests passed.** (`gate1.test.ts` alone: 53/53, all 16
`it.skipIf(!GATE1_ADOPTED)` tests re-armed and green — confirmed by inspecting the run, not
assumed from the skip count changing.)

`npm run hard:types`: **clean, 0 errors.**

`node --import tsx lab/ai/gate1.ts --plan`: confirms Gate 1 now ACCEPTS the revision (see Step 4
"Verified directly"); no full row was run here, per the spec's explicit instruction that the full
row is §5 of the campaign spec (adoption of the retuned weights), not this lane.

## Not touched, and why

- **`lab/harness/**` runner/types**: not edited. The p3 campaign output was not wrong — `manifest.
  json`, `totals.json` and `games.jsonl` all matched expectations exactly (rulesVersion,
  inactivity limits, 840 games, `changedDuringRun: []`, `winType: 'kill-clock'` appearing
  correctly, `inactivityDraw` staying false). The spec's ownership note ("edit only if the p3
  output is wrong") does not apply.
- **`lab/hard-ai/analyze/replay.ts` (`RULE_WIN_TYPES`)**: not edited. Kill-clock lane 2's report
  already recorded that `RULE_WIN_TYPES` is typed against `WinType`, which already includes
  `'kill-clock'` (kill-clock lane 4 confirmed `lab/harness/types.ts` line 195 carries it and that
  `hard:types` was clean on that point at the kill-clock merge). Re-reading the file in this lane
  confirms it still type-checks cleanly (`npm run hard:types` above) and no test in this lane's
  scope exercises it against a live kill-clock replay differently than before; there was nothing
  to change.
- **`src/**`**: read-only for this lane, per the campaign spec's global note; not touched.
- **Lane T's retune search, Lane S's suite bundle v3, and §5's adoption/Gate 0/Gate 1
  row/Gate 2 rows**: out of this lane's scope entirely (owned by other lanes / the coordinator).
  This lane's job was to make Gate 1 *able* to accept `muju-phasing-3` and to preregister Gate 2's
  protocol before any row is played — both done — not to run either.

## Nothing blocked

Every step in the spec's §2 ("Steps, in order") 1-5 completed as specified, with evidence above.
No workaround, synthetic data, loosened equality or fabricated adoption record was used anywhere
in this lane — the Gate 1 adoption is real: a real 840-game scripted reference was played under
the live rules, real bands were frozen from it, a real preregistration amendment was committed
before any Gate 2 row, and `gate1.ts` independently confirms acceptance by reading exactly those
committed, hash-pinned artifacts.
