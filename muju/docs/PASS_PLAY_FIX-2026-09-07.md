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
