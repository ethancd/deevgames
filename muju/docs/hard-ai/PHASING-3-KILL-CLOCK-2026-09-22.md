# Phasing 3: the kill clock, and what it does to Hard AI evidence (2026-09-22)

Short dated note. Full disposition and re-pin table: `docs/changes/2026-09-22-kill-clock-lane2.md`.
Owner decisions: `docs/changes/2026-09-22-kill-clock-SPEC.md` (final; not reopened here).

## The rules revision advanced

`muju-phasing-2` (twenty-ply inactivity draw) -> `muju-phasing-3` (owner decision 2026-09-22,
the KILL CLOCK): ten kill-free plies end the game, and the higher **mined total**
(`minedTotal`, `src/game/inactivity.ts` — every crystal a side's units ever took off the
board, Black's starting handicap folded in, never reduced by spending) wins; a tie draws.
`#` is withheld once the invader's next turn start is no longer guaranteed (`c >= 9` of 10).
`src/ai/hard/config.ts PHASING_RULES_REVISION` is now `'muju-phasing-3'`.

## Every phasing-2 strength claim is now historical

Every ladder row, Gate-0 reading, floor contract and preregistered strength number measured
under `muju-phasing-2` — including everything in `docs/hard-ai/RELEASE-2026-09-18.md`, the
e0–e5 epic records, the 2026-09-19 draw-clock-20 change record's own evidence, and
`docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md`'s hand-priors results — describes an
engine playing a DIFFERENT terminal (a neutral draw at twenty plies) than the one it plays
now (a decided position at ten). None of it is void or wrong for its own revision; none of it
transfers to `muju-phasing-3`. The ladger sequence number (2) in
`docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md` and every row table in it are historical
records of `muju-phasing-2` play and are read that way from now on.

## `DEFAULT_WEIGHTS` are untuned for the new terminal

This lane changed rules-correctness only (`docs/changes/2026-09-22-kill-clock-SPEC.md` §3):
the `DrawPressure` feature now signs by the mined-total lead instead of the material+bank
lead, but its weight (`DEFAULT_WEIGHTS.w[F.DrawPressure]`, currently the 2026-09-20 repair's
`-8`) was authored against the OLD sign and the OLD (always-draws) terminal's incentive
structure. No weight file changed. The hand-priors vector, and every other weight file under
`docs/hard-ai/phasing/repair-2026-09-20/weights/`, was tuned to avoid a draw that no longer
exists in its old form — sitting on a mined-total lead is now correct, not merely
tempo-neutral, and nothing in the shipped weights knows that yet.

## What is verified correct (this lane's scope)

Packed replica (`src/ai/hard`) terminal, checkmate gate and Zobrist plane agree with canonical
at every kill-free ply 1..10, on ties, on unequal mined totals, and with Black's handicap
folded in (`tests/ai/hard/cross-engine-draw-clock.test.ts`); `hard:perft --check` (both
engines) and a 1,000,000-action `hard:fuzz` pass; `tests/ai/hard` is 918/919 (the one failure,
`calibrate-cold.test.ts`, is a pre-existing load-sensitive timing test, confirmed present and
identical at the seed commit `62a5703f`, unrelated to this change). Full gate/test counts and
the re-pin table are in the lane-2 change record.

## What is NOT done here, and is the next campaign's job

- Re-author the `lab/hard-ai/suites/phasing` v2 suite bundle under `muju-phasing-3` and
  re-bind its `sourceBinding` (the v2 bundle is doubly superseded now: the 2026-09-22 piece
  rename AND the kill clock; `tests/lab/suites-phasing-manifest.test.ts` keeps its load test
  `it.skip`, reason updated to name both).
- Re-pin `lab/harness/runner.ts` / `lab/harness/types.ts` (`WinType`, `inactivityDraw`) for a
  new scripted reference campaign; both are byte-pinned by
  `tests/lab/phasing-evidence.test.ts` for `p2-scripted-2026-09-19` and were deliberately left
  untouched (see the lane-2 report's "Decisions taken").
- Retune `DEFAULT_WEIGHTS` for the decided terminal (the DrawPressure sign flip and the
  invariant-16 reinterpretation both point at the same lead quantity now being worth pursuing,
  not merely worth sitting on).
- Regenerate openings, run the ladder, or make any strength claim under `muju-phasing-3`.
