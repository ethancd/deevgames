# Half-crystal handicap — release and remaining DAG roadmap

Requested scope: deploy the browser game and online LLM tools, then plan the
remaining DAG work. New games allow exactly `0` (Off) or `n + 0.5` for integer
`n` from 0 through 19. No other nonzero integer or fraction is accepted at either
new-game boundary. MICRO MUJU remains handicap-free.

## Compatibility and release boundary

This changes setup policy, not the transition rules (`muju-phasing-4`). Existing
rooms, saves and recorded experiments retain their exact original grant, bank,
mined income and history. The low-level board constructor deliberately accepts
legacy grants so archived experiments can still reconstruct their original
positions. The browser initializer and HTTP/MCP schema enforce new choices.
Restarting a legacy integer-grant local game creates an Off game. Current half
grants survive restart, save/load, purchase, undo and server restart unchanged.

Black's half counts in the mined-total kill-clock result and cannot be spent
as a whole crystal. Mining, prices and upkeep are unchanged. The packed Hard
engine currently uses integer bank/ledger arrays and integer handicap hash/book
fields; it now rejects fractional states before truncation. Browser play uses
the existing canonical V2 fallback. This is a temporary, explicit limitation,
not a claim of native fractional Hard support or unchanged Hard strength.

## Affected closure and dispositions

Planner: `python3 tools/muju-content-dag.py plan --kind rules --format json`.
All 27 nodes were reviewed. “Blocked — deferred” below means deliberately outside
this release's implementation scope, with the next acceptance gate specified
below; it does not mean the entire DAG has been updated.

| Node | Disposition and evidence |
| --- | --- |
| rule-contract | Changed: SPEC setup contract and JUDGMENT_LOG owner decision. |
| catalogue | Verified unchanged: unit definitions, elemental interactions, and numeric GameState fields require no new piece stats. |
| board-rules | Changed: shared current choices and separate stored-grant validator; archived low-level reconstruction retained. |
| transitions | Verified unchanged in spending/mining/adjudication; changed reset policy. Regression covers all 21 grants and exact kill-clock totals. |
| rules-docs | Changed: SPEC and public design dossier; broader historical strategy re-evaluation deferred, not rewritten. |
| browser-ui | Changed: shared local/online selector and hint; mobile setup, handoff, reload and authority covered by browser regressions. |
| persistence | Changed: loading accepts legacy integer grants and new halves without rounding; round-trip and restart tests added. |
| wasm-tactics | Verified unchanged: tactical removal kernel represents pieces/AP, not treasury; rebuild and existing witness/worker tests are release gates. |
| ai-search | Verified unchanged for canonical numeric V2 simulation; fractional gameplay tests run through simulate. New handicap strength evidence deferred. |
| hard-ai | Changed: pack refuses fractional state before Int32 truncation; native-half implementation blocked — deferred to milestone 1. |
| ai-strength | Blocked — deferred: historical integer-handicap suites/corpora stay reproducible; no new strength claim. Milestone 2. |
| server-runtime | Changed: exact creation schema, persistence/restart and MICRO rejection tests. Existing SQLite disk retained. |
| mcp-tools | Changed: creation discovery schema, description, rules payload; HTTP and stdio MCP creation/play/rejection regressions. |
| agent-guides | Changed: current and legacy skill URLs and ONLINE.md examples. Tool-taps/analysis guide contain no numeric handicap range to change. |
| balance-analysis | Blocked — deferred: static piece prices unchanged; strategic handicap conclusions need new measurements, milestone 2. |
| academy-data | Blocked — deferred: copied setup validators still describe integers; regenerate current snapshots with provenance, milestone 3. |
| academy-lessons | Blocked — deferred: R10 episode.json and src/timeline.json explicitly say 1–20 and teach the older opening phase. Milestone 3. |
| academy-audio | Blocked — deferred: retake changed R10 clips and align captions after approved current lesson script; check media availability. |
| academy-video | Blocked — deferred: render and inspect updated R10, retaining untouched cast/music/media. |
| game-validation | Changed: exact choices, persistence, fractional scoring, pack refusal, HTTP/stdio schema and browser tests. Release outcomes below. |
| static-package | Changed: rebuild all three games, verify `_site`, smoke-test before publication. |
| server-package | Verified unchanged: existing Docker build includes browser assets and public skills; persistent mount remains `/app/data`. |
| academy-package | Blocked — deferred: mixed-version manifest and hash-bound QA required after R10 render. |
| static-deploy | Release target: existing deevgames Pages project via local Wrangler OAuth; GitHub workflow still skips publishing. Evidence below. |
| server-deploy | Release target: existing Render service auto-deploys master; no database replacement. Evidence below. |
| academy-deploy | Blocked — deferred: separate ashkie-pages release after milestone 3; not authorized by this release scope. |
| release-verification | Changed: this record and evidence directory; browser/MCP live checks required. Remaining DAG is explicitly incomplete. |

## Ordered roadmap

1. **Native half-crystal Hard support.** Replace or scale every packed bank and
   mined-total representation together, including undo and clone buffers,
   affordability thresholds, terminal scoring, incremental/full Zobrist hashes,
   transposition keys, opening-book headers and probes. Version incompatible
   book/evaluation representations. Cover zero, half and preserved legacy games,
   all phases, purchases, upkeep, refunds and kill-clock ties with canonical vs
   replica differential tests. Remove the fallback guard only after exact
   round-trip, make/unmake, hashing and legal-plan replay parity pass. Audit
   engine-seat contracts and errors for half-handicap matches.
2. **Fresh experiments and evidence.** Define current half-handicap opening
   schedules and sealed splits; keep integer corpora as historical data. Run
   parity/perft/fuzz and deterministic work-budget gates, then preregister and
   measure strength/balance at the new grants, including 0.5 and 19.5. Check
   static solver output for unchanged piece-only quantities rather than
   relabeling old strategic results. Publish new current strategy conclusions
   with source/rules/setup-policy identity and seeds; do not rewrite archives.
3. **Academy propagation.** Regenerate current rule snapshots and verify
   catalogue/map/matrix invariance. Update R10's handicap and full-turn lesson
   to current Phasing together; audit R01 and the other active lessons for
   setup examples. Record every changed clip, preserve unchanged takes,
   transcribe/re-align captions, render R10 and review real frames and audio.
   Restore required media from the archive named in CONTENT_DAG.md if absent.
   Update release manifests with actual hashes and mixed lesson versions, then
   build/check the separate ashkie-pages checkout and verify live range seeking,
   redirects and current-course notices. Historical Academy archives stay intact.
4. **Close the DAG.** Run the planner/checker again with all changed paths,
   replace deferred dispositions with concrete evidence, and verify Pages,
   Render tools/skills and Academy all state the same current setup policy.

## Release evidence

- Build and server type checks passed on the release changes.
- Focused game/save/UI/server/MCP suite: 90 tests passed in 6 files.
- Full online browser suite: 85 tests passed (mobile/desktop, AI worker,
  room lifecycle, half-grant local/online play and reload).
- `build-all.sh`: all three games built; `verify_site.py` passed.
- `tools/smoke-site.cjs`: passed at 390px and 834px (all three games and refresh).
- DAG checker passed; all 14 planner tests passed.
- Render configuration reverified: master auto-deploy, existing 1 GB disk at
  `/app/data`; pre-release deployed commit `068ae7464f093703b65188f5399b2fd117cd7194`.
- Cloudflare project verified: `deevgames`, with `deevgames.pages.dev` and
  `deevgames.ashkie.com`; local OAuth has Pages write access. Latest GitHub
  workflow 36249577884 skipped publication, so local publication is required.
- Full suite and live publication evidence pending; see accompanying release
  evidence after deployment.
