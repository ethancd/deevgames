# Hard AI campaign artifacts — what is here and what is archived

The Hard AI campaign (E0–E4, 2026-09-14 → 2026-09-18, branches `claude/hard-ai-e0` … `claude/hard-ai-e4`)
recorded every ladder row's replays under `lab/results/hard-ai-*/…/replays/` and `games.jsonl`.
Those files (about 670 MB) are NOT in `master`: this release commit carries every document,
script, `metrics.json`, `manifest.json`, `summary.md`, `elo.json`, `pairs.jsonl`, analysis
artifact and the fixtures the tests read (`hard-ai-e0/pilot2-h0/replays`,
`hard-ai-e3/ablate/eval-correct-v1/fixed100k`), and drops only the replay directories and game logs of the ladder rows under `hard-ai-e1/{baseline,diag-wall8000,ablate}`, `hard-ai-e2/{repin,ablate}`, `hard-ai-e3/ablate` and `hard-ai-release`; every analysis and diagnostic directory is kept whole.

The complete history with every replay is archived as a git bundle:
`~/src/deevgames-hard-ai-campaign-2026-09-18.bundle` (on the box that ran the campaign), which
`git bundle verify` accepts and `git fetch <bundle> claude/hard-ai-e4` restores. The same commits
remain as local branches in `/Users/ashkie/src/deevgames-e4` and its siblings. A document that
cites a `replays/` path refers to that archive.
