# Muju commit and preservation audit — 2026-09-18

Observed around 08:30 America/Chicago. Read-only audit apart from fetching origin refs and writing this report. No source changes, merges, deployments, branch deletion, resets, or stash changes performed.

## Deployment alignment

| Location | Commit | Result |
|---|---|---|
| GitHub master | 57a70c1a7914bba649df0d8fcf30d16ebf5b34b7 | Current remote head, PR #24 merged |
| Render deevgames-muju | 57a70c1a7914bba649df0d8fcf30d16ebf5b34b7 | Dashboard confirms successfully deployed and Live; health endpoint OK |
| Cloudflare Pages production | 5fc9651805057848748d7fd1cabcb3f31638d294 | Canonical deployment 7cee9957, Sept 16; 17 commits behind; metadata commit_dirty=true |
| Local master | 0f1d5f1c3f270bc297d58b147ff3043beb215a63 | Clean worktree; 18 commits behind GitHub master |
| Main working checkout | 1ac8026802461569cb1ac0a27c17341737e78a68 | codex/muju-local-wip-2026-09-16; dirty, 30 commits behind |

Cloudflare commit metadata is a base identity, not proof of exact source content, because commit_dirty=true. Latest master publishing workflow was pending behind an earlier workflow still running browser tests. The repository secret list is empty; the previous successful workflow at 5fc96518 explicitly skipped Deploy and completed Explain manual deployment. Thus a green workflow is not evidence of publishing, and the current credential-gated workflow cannot publish using repository secrets as configured. The public Cloudflare hub links Muju to https://deevgames-muju.onrender.com/muju/, so that normal entrypoint reaches the up-to-date Render game even though the direct Pages /muju/ copy is stale.

## Preservation findings

Recent release branches (online deployment, Phasing, phone release, short links, Phasing analysis, Hard AI release and CI gate fixes) have their committed tips in master. The many Hard AI campaign branch tips are not ancestors because release commit 43b87b67 consolidated the campaign. Current master and claude/hard-ai-e4 have byte-identical muju/src/ai/hard and muju/src/ai/hardOptIn.ts trees. Raw campaign history and experimental evidence should still be archived before branch deletion. Ancestry divergence is not a count of missing features.

52 local branch tips have Muju-related commits outside master ancestry, mostly Hard AI campaign/lane branches. They share history and must not be summed. Local codex/muju-hard-ai-recovery has one commit absent from its remote counterpart, b1f3d4ee (development/release plan).

Main checkout: 52 tracked Muju files modified; 1,494 untracked Muju files. Comparing these 1,546 file contents with current master: 503 identical, 52 different, and 991 absent from master. Of the 52 different files, 36 exact versions are preserved in fetched remote history, while 16 exact versions are not. This does not mean 16 missing features: inspected differences include stale combinations missing newer master changes. Preserve and reconcile before cleanup. The absent files are predominantly academy production material, music audition work, tools, and research documents; some are generated artifacts.

/tmp/muju-phasing-variant: 38 tracked modifications and 113 untracked files. Relative to master, among those paths: 27 identical, 16 different, 86 absent, and 22 missing files. Seven different exact file versions are absent from fetched remote history. Most absent files are browser-test artifacts, plus four temporary analysis scripts. Preserve before reconciliation.

The original Hard AI checkout also has two modified experiment result files and 23 untracked files. Several detached AI experiment worktrees contain untracked lab output. There are three stashes, including a Muju safety stash from Sept 8. Do not discard these without archival/review.

Inventory details are in inventory.json and local-content.json. Exact-content checks used Git blob hashes against master and objects reachable from fetched remote refs. They do not cover ignored files, other machines, or additional independent clones. Some registered worktrees have missing .git markers; these are flagged in inventory.json and their zero counts must not be interpreted as verified clean worktrees.

## Evidence

- GitHub master: https://github.com/ethancd/deevgames/commit/57a70c1a7914bba649df0d8fcf30d16ebf5b34b7
- Render dashboard: https://dashboard.render.com/web/srv-dahbp4ht0dsc73fdqn10
- Cloudflare API: canonical_deployment for account 9ae23d3bd5eff787baa8030712ca9ca2, project deevgames
- Immutable Pages deployment: https://7cee9957.deevgames.pages.dev
- Pending workflow: https://github.com/ethancd/deevgames/actions/runs/35350041337
