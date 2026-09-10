> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> Production release status is tracked by the repository’s deployment workflow.

# Pass & Play handoff fix — 2026-09-07

Automatic handoffs (skipping an unaffordable build phase or spending the last
crystal) retained the previous player's Undo history. Undo could restore that
player's turn and show another handoff back to Player 1. Clear history on every
actual player/round change, and reject undo snapshots from a different turn.
Normal actions and phase changes within the current turn remain undoable.

A fresh no-action game already alternated correctly before this change. The
reported repeated Player 1 display has not been reproduced without Undo; the
confirmed regression is the cross-turn Undo path.

Validation: three new hook regressions failed before and pass after the fix;
639 unit tests pass. Browser tests verify four alternating handoffs and Player 2
moving and undoing without returning to Player 1. Existing Chrome mobile tests
pass. Full-site build and release smoke verify all three games.
