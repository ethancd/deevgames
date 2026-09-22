# Kill clock — `muju-phasing-2` → `muju-phasing-3` (2026-09-22)

Owner request (Ethan, 2026-09-22): replace the twenty-ply inactivity draw with a ten-ply **kill
clock** decided on mined totals. Owner decisions, all final: Black's starting handicap counts
toward Black's mined total; a tie is a draw; no home-checkmate is awarded when the defender's
reply would be the tenth ply (c ≥ 9); unfinished saves restart the clock at 0; a subtle HUD
marker shows who leads on mined crystals; the Hard AI ships rules-correct with `DEFAULT_WEIGHTS`
untouched and all tuning/measurement deferred; the Academy gets a notice, not a re-voice.

Branch `claude/muju-kill-clock` from master 271056b5 (after the rename). Seed 62a5703f wrote the
canonical resolver (`src/game/inactivity.ts`, identifiers kept for their sixty-plus pinned
importers), the checkmate gate and the `kill-clock` victory reason. Records: the spec
`2026-09-22-kill-clock-SPEC.md`, the generated 27-node plan `2026-09-22-kill-clock-plan.md`, lane 1
(rules, saves, UI, docs, game tests) `…-lane1.md`, lane 2 (Hard engine, lab pins) `…-lane2.md`,
lane 3 (server, MCP, guides, online client, Academy notice) `…-lane3.md`, HUD screenshot in
`2026-09-22-kill-clock-evidence/`.

## The rule (SPEC v3.3 §9)

A kill is any attack that removes a unit. The clock counts player turns without a kill, advances
once per turn at `END_PLACE_PHASE`, and a killing turn closes at zero. When the tenth kill-free ply
closes the game ends at once: the higher mined total (every crystal a side's units took from the
board, plus Black's handicap, never reduced by spending) wins; equal totals draw. The next turn
never starts, so a home occupier does not win by occupation. `#` is awarded only when the
invader's next turn start is guaranteed: with the hand-off count c ≤ 8. Save schema 10.

## Node dispositions (coordinator summary; evidence in the lane reports)

| Node | Disposition | Where |
|---|---|---|
| rule-contract, board-rules | changed — SPEC v3.3, J-024 | lane 1 |
| transitions | changed — seed + `victory.ts`; hand-off verdict precedes `startTurn` | seed, lane 1 |
| rules-docs | changed | lane 1 |
| browser-ui | changed — x/10 clock amber at 7, `▲` mined-lead marker, victory/instructions/mode text | lane 1 |
| persistence | changed — schema 10; 5-7 adjudicated as phasing-1 (10, draw), 8-9 as phasing-2 (20, draw), then restart at 0 | lane 1 |
| wasm-tactics, balance-analysis | verified unchanged (no clock terms) | lane 1 |
| ai-search | changed — `tests/ai/upkeep-clock` premise inverted correctly: a side ahead lets the clock run | lane 1 |
| hard-ai | changed — revision `muju-phasing-3`, `gained[]` = mined totals with exact handicap round-trip, clock terminal decided by `gained`, prover gate, `DrawPressure` signed by mined lead; weights untouched | lane 2 |
| ai-strength | superseded — all phasing-2 evidence historical; `docs/hard-ai/PHASING-3-KILL-CLOCK-2026-09-22.md` | lane 2 |
| server-runtime | changed — `PHASING_RULES_VERSION` `muju-phasing-3`; rooms still open under phasing-2 take the existing `RULES_CHANGED` refusal path | lane 3 |
| mcp-tools | changed — `killClock` observation block (aliases kept one release), rules text, analysis checkmate topic now applies the c ≥ 9 gate (it had re-implemented the award without it) | lane 3 |
| agent-guides | changed — both skills, TAPs, analysis docs, ONLINE | lane 3 |
| academy-data | changed — export assertion; one line of `rules-verification.json` | lane 3 |
| academy-lessons/audio/video | deferred — notice names R09 and R10 | lane 3 |
| academy-package | prepared | lane 3 |
| game-validation | see Gates | coordinator |

## Coordinator decisions

1. **p2 scripted campaign declared superseded.** `HARNESS_RULES_VERSION` → `muju-phasing-3` and
   `WinType` gained `kill-clock` in `lab/harness/types.ts`, which the p2 manifest byte-pins.
   `tests/lab/phasing-evidence.test.ts` now carries a per-campaign declared-edit list
   (`PHASING3_HARNESS_EDITS`, the A4 pattern); no row is `current` until a p3 campaign is played
   at the kill clock, and the "reference this tree plays under" checks are dormant, not deleted.
2. `LADDER_RULES_VERSION` follows the harness constant; `tests/lab/baseline-identity` re-pinned.
3. `GameRecord.inactivityDraw` keeps meaning an actual draw; a kill-clock ending is `winType`.
4. **Identity-hash re-pins (lane 4).** The revision string is the first field of every resolved
   configuration hash and every opening digest, so the champion/arm hashes in `tests/lab/ablate`
   and the literal revision pins in `analyze-phasing`, `openings-p1` and `phasing-harness` moved;
   each is re-pinned with the old value kept as a named historical constant (`…-lane4.md`).
5. **Gate 1 is deferred at `muju-phasing-3`.** `lab/ai/gate1.ts` correctly refuses to run because
   `gate1-references.json` and the frozen bands were adopted under phasing-2 and bands do not cross
   a revision. The sixteen tests that need an adopted protocol are `it.skipIf(!GATE1_ADOPTED)`; a
   new always-on test asserts the refusal names the live revision, and the skips re-arm by
   themselves when an amendment adopts re-frozen bands. No workaround (synthetic bands, flipped
   adopted record) was taken.
6. **Hard AI declined a free capture (lane 5 + coordinator).** `e2e/ai-worker.spec.ts:89` failed
   deterministically: the DESKTOP profile handed the turn back (+657) instead of killing White's
   Hi (−746). Lane 5 bisected it to the canonical limit change alone. The mechanism, found by
   probing the exposed root candidates: the `DrawPressure` feature is `sign(mined lead)·clock²·100/limit²`
   and its frozen weight is **−8**, fitted under the draw clock where the running clock hurt the
   leader. Under the kill clock that polarity rewards the trailer for letting the clock run, and
   halving the limit quadrupled the per-ply magnitude, which was enough to flip the depth-3 search.
   Fix: the feature is negated in `features.ts` so `w·f` rewards the mining leader while
   `DEFAULT_WEIGHTS` stays byte-identical; the polarity test in `tests/ai/hard/eval.test.ts` is
   flipped with the reason. Verified by driving `HardEngine.searchTurn` directly: both profiles now
   capture (desktop +282, phone −1144 vs the alternatives). Lane 5's first hypothesis (a mate-scale
   clock terminal reached along quiet lines) was disproved by instrumentation — zero terminal hits
   in that search — but is a real hazard on deeper searches, so `terminalScore` now scores a
   kill-clock verdict more than two hand-offs beyond the root as a flat ±200 cc
   (`KILL_CLOCK_SOFT_CC`), with the root clock set by the engine when it packs the root and a
   forced default for direct callers (`tests/ai/hard/kill-clock-terminal-score.test.ts`).
7. `tests/ai/hard/calibrate-cold.test.ts` fails with `probe.work` 25132 vs the 12500 floor on this
   machine under load and, per lane 2, identically at the seed commit; it is not touched here and
   is judged by CI.

## Gates

Filled after the final run; see Release.
