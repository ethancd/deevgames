# Recovery checkpoint

Continue on `codex/muju-hard-ai-recovery`. It preserves `85a1bc5` and integrates
production `0f1d5f1` by merge, restoring the shipped music player and retaining
research artifacts. The canonical game rules and WASM source match production;
the experimental engine and whole-turn worker changes remain development-only.

The original `claude/muju-hard-ai` checkout was not rewritten. Its local verify
artifacts remain there. Its previously untracked September 15 postmortem is now
preserved in this branch as `POSTMORTEM-2026-09-15.md`.

The old `HANDOFF.md` remains a historical record at `85a1bc5`. For current branch
state, read this checkpoint and `RECOVERY-PLAN-2026-09-16.md` first. M15–M20 have
not started. No strength criterion has been changed and no new strength claim is
made by this integration.

Integration validation: production build, server typecheck, hard-AI typecheck,
dependency/layering checks, and all 1,333 tests across 104 files pass. Tests ran
with two workers. Existing engineering gates have not been reclassified as
strength evidence.

Next bounded task: audit the ladder's per-turn budget, shipped-AIv2 fidelity,
configuration identities and width profiles, then run a small direct comparison.
See the recovery plan for the campaign and decision rules. Keep production on
`master`; do not deploy this branch as the replacement Hard AI.
