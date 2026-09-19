# Muju change impact plan

Review plan only: no edits, tests, media generation or deployments have run. Unselected prerequisites must be current but need no automatic rebuild. Unmapped paths require manual investigation; this graph is not a semantic proof.

## 1. [ ] rule-contract — Agreed rules and change intent

Reason: change kind: rules

Paths: `muju/SPEC.md`, `muju/JUDGMENT_LOG.md`

- Update: State exact old/new behavior, affected units, edge cases and intended rules revision. User-approved changes take precedence over old specs. Update SPEC and append rationale to JUDGMENT_LOG without rewriting historical decisions.
- Update: When adding, promoting or retiring a whole rule set or variant, name the surviving normative text, fold variant documents into SPEC or mark them superseded, and state which rules revision each stored room, save, replay, opening corpus and strength record belongs to.
- Verify: Resolve differences between intended rules, executable behavior and published descriptions. Historical documents are not current authority.

Disposition: pending. Evidence: —

## 2. [ ] catalogue — Canonical piece definitions and elemental relationships

Reason: upstream changed: rule-contract

Paths: `muju/src/game/units.ts`, `muju/src/game/types.ts`, `muju/src/game/elements.ts`

- Update: Change canonical definitions, stable IDs, stats, costs and elemental relationships. Check promotion cost differences and tier/stock limits. Read the applicable SPEC sections even when starting here.
- Verify: Exercise changed stat boundaries and elemental matchups against real combat, movement, mining and promotion behavior; verify all consumers use current definitions.

Disposition: pending. Evidence: —

## 3. [ ] board-rules — Map, setup and shared rule constants

Reason: upstream changed: rule-contract

Paths: `muju/src/game/board.ts`, `muju/src/game/resourceMap.ts`, `muju/src/game/rules.ts`

- Update: Update board reserves, setup, action budgets and handicap limits as applicable. Check palette, map painter, starting income and symmetry expectations.
- Verify: Test setup and economy against the intended map and rule constants; preserve explicitly historical map fixtures.

Disposition: pending. Evidence: —

## 4. [ ] transitions — Canonical legality and state transitions

Reason: upstream changed: catalogue; upstream changed: board-rules

Paths: `muju/src/game/`, `muju/src/ai/simulate.ts`, `muju/src/hooks/useGameState.ts`, `muju/lab/harness/`

- Update: Review legality, combat, movement, promotion, spawning, upkeep, mining, turn timing, inactivity, victory and home-checkmate. Keep UI, server and simulations on the same transition; adjust lab invariants where the rule itself changes.
- Verify: Add or adapt meaningful regression cases for the changed rule, including illegal-action behavior and identical resulting states in local, AI and server paths.

Disposition: pending. Evidence: —

## 5. [ ] rules-docs — Current rules, AI explanation and public design copy

Reason: upstream changed: transitions

Paths: `muju/SPEC.md`, `muju/AI_ENGINE_README.md`, `muju/docs/AI_IMPLEMENTATION_STATUS.md`, `muju/docs/PHASING-2026-09-16.md`, `muju/docs/STRATEGY_GUIDE-2026-09-12.md`, `muju/docs/strategy-guide-codex-vs-claude.md`, `docs/game-design-dossier.md`, `portfolio/index.html`

- Update: Synchronize current rule tables, examples, costs, terminology and supported strategy claims. Review dated guides used as current advice; mark superseded claims or issue a new revision instead of silently rewriting historical evidence.
- Verify: Search by piece ID, display name, stat label and old numeric phrase across active docs. Check examples with the current engine. Do not claim old balance studies establish new strategic strength.

Disposition: pending. Evidence: —

## 6. [ ] browser-ui — Browser controls, instructions and visual representations

Reason: upstream changed: transitions

Paths: `muju/src/components/`, `muju/src/App.tsx`, `muju/src/main.tsx`, `muju/src/hooks/useAI.ts`, `muju/src/index.css`, `muju/src/utils/colors.ts`, `muju/src/sound/`, `muju/src/music/`, `muju/public/music/`, `muju/index.html`, `muju/public/previews/`

- Update: Inspect UnitShop, UnitInfo, InstructionsModal, VisualKey, AnalysisScreen, MapPainter, action/reach previews and unit artwork for copied facts or numeric assumptions. Reuse canonical data where possible. Regenerate affected previews.
- Verify: Inspect desktop and phone play: instructions, stat cards, legal highlights, purchase/promotion, turn endings and analysis. Ensure the AI worker still runs.

Disposition: pending. Evidence: —

## 7. [ ] persistence — Saved games, migrations, history and replay compatibility

Reason: upstream changed: transitions

Paths: `muju/src/game/migrate.ts`, `muju/src/game/replay.ts`, `muju/src/game/moveHistory.ts`, `muju/src/utils/persistence.ts`, `muju/src/components/TurnReplay.tsx`, `muju/src/online/RoomHistory.tsx`

- Update: Decide how existing saves, active rooms and historical replays behave under the change. Add migration/version handling if needed; preserve old evidence and stored histories.
- Update: Retiring a rule set: never reinterpret a stored state under different rules. Bump the save schema, decide convert / archive read-only / reject per stored ruleset, keep only the presentation needed to view retired games, and keep a captured fixture of a retired-rules game.
- Verify: Load an existing save/room, undo where supported, restart the server and replay a completed game. Explicitly report incompatibilities and their handling.

Disposition: pending. Evidence: —

## 8. [ ] wasm-tactics — Compiled tactical solver and canonical witness validation

Reason: change kind: ai; upstream changed: transitions

Paths: `muju/assembly/tactics.ts`, `muju/src/ai/wasm/`, `muju/asconfig.json`

- Update: Review duplicated tactical semantics and ABI assumptions. kernel.ts packs stats and attack powers from canonical definitions; do not invent a second stat table. Rebuild tactics.wasm when affected.
- Verify: Replay solver witnesses through canonical legality/transitions. Compare TS and WASM on changed combat/movement/promotion cases, including bounded-search unknown results.
- Command (cwd `muju`): `npm run ai:wasm` — Rebuilds generated WASM; also runs automatically before npm test/build.

Disposition: pending. Evidence: —

## 9. [ ] ai-search — Deterministic game AI, evaluation, planning and worker

Reason: change kind: ai; upstream changed: transitions; upstream changed: wasm-tactics

Paths: `muju/src/ai/`, `muju/lab/ai/`, `muju/lab/docs/`, `muju/AI_ENGINE_PLAN.md`, `muju/AI_ENGINE_QUESTIONS.md`

- Update: Review moves, evaluation, beam plans, MCTS, placement strategies, budgets, tactical sharpening and worker protocol. Rules changes may alter reach, affordability and threat assumptions even when stats import automatically. Historical design plans are context, not implementation authority.
- Verify: Check legal complete turns, reproducibility under fixed seeds/work budgets, worker execution and deadlines. Separate rule correctness from strength; run targeted matchups when balance claims are made.
- Command (cwd `muju`): `npm run ai:tactics` — Runs tactical cases and writes a fresh lab result directory; inspect results.

Disposition: pending. Evidence: —

## 10. [ ] hard-ai — Hard engine: packed rules replica, turn generator, prover, evaluation and search

Reason: change kind: ai; upstream changed: transitions; upstream changed: ai-search

Paths: `muju/src/ai/hard/`, `muju/src/ai/hardOptIn.ts`, `muju/docs/hard-ai/`

- Update: src/ai/hard is a complete second rules engine: core/state.ts mirrors legality, transitions, turn boundaries, upkeep and terminals; tactics/prover.ts mirrors analyzeHomeDefense; gen/ encodes the macro-turn grammar and forced injections; tables/, core/income.ts and eval/weights.ts encode timing and economy assumptions. Any change to turn order, purchases, upkeep, mining, movement cost or home-checkmate needs a matching replica change, not just a re-import. pack must reject states it cannot represent rather than drop fields. Keep the worker and UI guards closed for unsupported rules until ai-strength passes.
- Update: Hash every state field that changes future boards into Kpos/Kturn. Bump weightsVersion, book magic and the ladder identity hash when rules, features or weights change.
- Verify: Every emitted turn replays through canonical isLegalAction/applyAction with matching position keys (verify/replay.ts). Runtime fallback and divergence counters stay at zero in e2e/hard-ai.spec.ts. Easy/medium must still avoid loading the hard chunk.
- Command (cwd `muju`): `npm run hard:types && npm run hard:test` — Type-checks the hard lab and runs tests/ai/hard.

Disposition: pending. Evidence: —

## 11. [ ] ai-strength — AI correctness veto and preregistered strength evidence

Reason: change kind: ai-strength; upstream changed: hard-ai; upstream changed: ai-search

Paths: `muju/lab/hard-ai/`, `muju/tests/ai/hard/`, `muju/tests/lab/`, `muju/docs/hard-ai/RELEASE-2026-09-18.md`, `muju/docs/hard-ai/EPIC-PLAN-2026-09-16.md`

- Update: A rules change invalidates every existing strength claim; the records remain as evidence for their own rules revision. Re-pin replica parity first: perft fixtures, differential fuzz on transition, legality and prover surfaces, fixed-work goldens, determinism and cross-commit. Re-verify or re-author suites whose expected moves depend on the changed rule. Make the harness, scripted bots and ladder identity hash carry the rules revision.
- Update: Strength is claimed only from a preregistered rule written before the run: openings generated by scripted bots (never by an engine under test) with a sha-pinned dev/val/sealed allocation, tuning on dev only, a sealed row consumed once, and an independent baseline that has passed its own sanity gate. Rows with illegal actions, replica divergences or engine fallbacks are void. Append a new dated release record; never edit an old one.
- Verify: Correctness is a hard veto: zero illegal actions, zero replica divergences, zero fallbacks, perft equal, suites at or above their pinned floors. Report score, Elo interval, SPRT outcome, seeds, identity hashes and responsiveness percentiles, and list what remains unmeasured. Do not pool rows across identity hashes or rules revisions.
- Command (cwd `muju`): `npm run hard:perft && npm run hard:fuzz && npm run hard:determinism` — Replica parity and reproducibility gates; long-running.
- Command (cwd `muju`): `npm run hard:suite` — Tactical and positional suites against pinned floors.
- Command (cwd `muju`): `npm run hard:ladder` — Paired seat-mirrored ladder rows; configure openings, seeds and budgets per the preregistration. Very long-running.

Disposition: pending. Evidence: —

## 12. [ ] server-runtime — Authoritative multiplayer host, schemas and online client

Reason: change kind: online; upstream changed: transitions; upstream changed: persistence

Paths: `muju/server/rooms.ts`, `muju/server/schema.ts`, `muju/server/http.ts`, `muju/server/index.ts`, `muju/server/clockPressure.ts`, `muju/src/online/`, `muju/ONLINE.md`

- Update: Review room transitions, validation, clocks, staging, invitations, observations, persistence and client/server compatibility. Document any protocol change and handling of active games.
- Update: Retiring a rule set: issue a new rulesVersion, state which stored versions upgrade in place and which become read-only archives, keep mutating calls on retired rooms returning RULES_CHANGED, and never reset or rewrite the production room database.
- Verify: Check create/join/play, revision and idempotency handling, clocks/staging where relevant, persisted rooms and reconnects.

Disposition: pending. Evidence: —

## 13. [ ] mcp-tools — MCP rules, legal actions, previews and analysis helpers

Reason: upstream changed: server-runtime; upstream changed: ai-search

Paths: `muju/server/mcp.ts`, `muju/server/stdio.ts`, `muju/server/observation.ts`, `muju/server/agentSchema.ts`, `muju/server/notation.ts`, `muju/server/analysis/`, `muju/tools/benchmark-analysis.ts`

- Update: Review muju_rules text and catalogue, tool descriptions, schemas/defaults, legal actions, preview and play parity. Recheck geometry, economy, units, tactics and exchange helpers for hardcoded budgets/claims and changed search bounds.
- Verify: Assert rules/analysis return current stats and legal witnesses, then exercise HTTP MCP and stdio as applicable. Distinguish bounded estimates from proofs; update benchmark evidence when helper behavior changes.

Disposition: pending. Evidence: —

## 14. [ ] agent-guides — Published agent skills and MCP usage documentation

Reason: upstream changed: mcp-tools; upstream changed: rules-docs

Paths: `muju/public/skills/`, `muju/server/skills.ts`, `muju/docs/MCP_TOOL_TAPS.md`, `muju/docs/ANALYSIS_TOOLS.md`, `muju/ONLINE.md`

- Update: Update public Muju and time-awareness skill files, TAPs, analysis documentation and live tool examples. Vite copies public skills into dist; the production server serves those copies.
- Verify: Compare documentation to tool discovery and actual responses. Check both /SKILL.md on the Node host and the static /muju/skills/ copies after release.

Disposition: pending. Evidence: —

## 15. [ ] balance-analysis — Current static balance report and relevant fresh experiments

Reason: upstream changed: transitions; upstream changed: ai-search

Paths: `muju/lab/solver/`, `muju/lab/results/current-static/current.json`, `muju/lab/results/current-static/current.md`

- Update: Review solver assumptions and regenerate current-static. Run new experiments only when needed to support changed claims; record source/rules hashes, configuration and seeds. Leave frozen map studies, baselines and dated results intact.
- Verify: Check catalogue/model freshness and explain changed dominance or witness results rather than weakening checks merely to pass. Static values are separate from AI weights.
- Command (cwd `muju`): `npm run balance:static` — Regenerates current-static outputs.
- Command (cwd `muju`): `npm run balance:check && npm run balance:types` — Checks current outputs and solver types.

Disposition: pending. Evidence: —

## 16. [ ] academy-data — Academy current rule snapshots, catalogues, map and matchup matrices

Reason: upstream changed: transitions

Paths: `muju/academy/export-rules.ts`, `muju/academy/rules-snapshot/`, `muju/academy/catalog.json`, `muju/academy/map.json`, `muju/academy/bonk-matrix.json`, `muju/academy/rules-verification.json`, `muju/academy/metal-v29-provenance.json`, `muju/academy/production/R??/source-rules/`, `muju/academy/production/R??/src/catalog.json`, `muju/academy/production/R??/src/map.json`, `muju/academy/production/R??/src/bonk-matrix.json`

- Update: Read Academy README and STATUS first. Adapt export-rules.ts assertions/version to the intended rule change, export from live src/game, then propagate current data to every affected active episode. Audit imports and provenance of rules-snapshot and each episode source-rules: they contain historical assumptions and rendering subsets, so do not blindly replace them.
- Verify: Check all ordered full-health matchups and affected demonstrations, map totals and copies. A single attack/defense change can alter incoming/outgoing matrices in every element lesson R11–R16. Regeneration of JSON alone does not update narration or rendered videos.
- Command (cwd `muju`): `node --import tsx academy/export-rules.ts` — Writes Academy JSON after assertions pass. Review/update expectations before running.

BLOCKED — obtain missing production inputs:
- `muju/academy/export-rules.ts`
- `muju/academy/rules-snapshot/`
- `muju/academy/catalog.json`
- `muju/academy/map.json`
- `muju/academy/bonk-matrix.json`
- `muju/academy/rules-verification.json`
- `muju/academy/metal-v29-provenance.json`
- `muju/academy/production/R??/source-rules/`
- `muju/academy/production/R??/src/catalog.json`
- `muju/academy/production/R??/src/map.json`
- `muju/academy/production/R??/src/bonk-matrix.json`
Academy production sources and media are not tracked in this repository. Obtain the current production bundle before executing these nodes; do not skip Academy propagation.
/Users/ashkie/src/deevgames/muju/academy/ on the original production workstation; verify current provenance before using it.

Disposition: blocked. Evidence: —

## 17. [ ] academy-lessons — Academy lesson scripts, examples and renderer sources

Reason: upstream changed: academy-data; upstream changed: rules-docs; upstream changed: browser-ui; upstream changed: server-runtime

Paths: `muju/academy/README.md`, `muju/academy/STATUS.md`, `muju/academy/BIBLE.md`, `muju/academy/ALL-SCRIPTS.md`, `muju/academy/CURRICULUM-AND-BATCHES.md`, `muju/academy/PIPELINE-NOTES.md`, `muju/academy/production/R??/episode.json`, `muju/academy/production/R??/src/`, `muju/academy/production/R??/scripts/`, `muju/academy/supplement.tsx`, `muju/academy/update-visuals.py`

- Update: Audit active R01–R16 episode.json and renderer sources for spoken facts, cards, boards, examples, captions and summaries. Record affected episode IDs and why others are unchanged. Preserve repaired current scripts; revise.py and propagate-economy.py are one-time historical migrations and must not be rerun over current production.
- Verify: Validate each changed example against current engine state, action budget and timing. Cross-element counter matchups matter. Check visible revision/date labels and current source provenance; do not resurrect retired R17–R27.

BLOCKED — obtain missing production inputs:
- `muju/academy/README.md`
- `muju/academy/STATUS.md`
- `muju/academy/BIBLE.md`
- `muju/academy/ALL-SCRIPTS.md`
- `muju/academy/CURRICULUM-AND-BATCHES.md`
- `muju/academy/PIPELINE-NOTES.md`
- `muju/academy/production/R??/episode.json`
- `muju/academy/production/R??/src/`
- `muju/academy/production/R??/scripts/`
- `muju/academy/supplement.tsx`
- `muju/academy/update-visuals.py`
Academy production sources and media are not tracked in this repository. Obtain the current production bundle before executing these nodes; do not skip Academy propagation.
/Users/ashkie/src/deevgames/muju/academy/ on the original production workstation; verify current provenance before using it.

Disposition: blocked. Evidence: —

## 18. [ ] academy-audio — Academy narration, local transcription and caption timing

Reason: upstream changed: academy-lessons

Paths: `muju/academy/audio-batch.py`, `muju/academy/prepare-audio.py`, `muju/academy/retake-openai.mjs`, `muju/academy/transcribe-local.py`, `muju/academy/align-current.py`, `muju/academy/timeline.mjs`, `muju/academy/production/R??/public/audio/`, `muju/academy/production/R??/speech-directions.json`

- Update: Regenerate only changed speech with the established OpenAI cast and pronunciation, preserve unchanged takes, and refresh the changed-clip inventory consumed by transcribe-local.py. Verify locally with faster-whisper, align captions, and regenerate timelines. Inspect hardcoded temporary runtime/model paths before running scripts.
- Verify: No unresolved spoken-fact, missing-word, pronunciation or caption-timing errors. Bind ASR and caption evidence to current audio hashes. Old clip inventories and successful historical logs do not verify new narration.

BLOCKED — obtain missing production inputs:
- `muju/academy/audio-batch.py`
- `muju/academy/prepare-audio.py`
- `muju/academy/retake-openai.mjs`
- `muju/academy/transcribe-local.py`
- `muju/academy/align-current.py`
- `muju/academy/timeline.mjs`
- `muju/academy/production/R??/public/audio/`
- `muju/academy/production/R??/speech-directions.json`
Academy production sources and media are not tracked in this repository. Obtain the current production bundle before executing these nodes; do not skip Academy propagation.
/Users/ashkie/src/deevgames/muju/academy/ on the original production workstation; verify current provenance before using it.

Disposition: blocked. Evidence: —

## 19. [ ] academy-video — Final videos, mastering, posters, transcripts and visual QA

Reason: upstream changed: academy-audio

Paths: `muju/academy/render-batch.py`, `muju/academy/render.mjs`, `muju/academy/master.mjs`, `muju/academy/remaster-batch.py`, `muju/academy/final-frames.py`, `muju/academy/stills-batch.py`, `muju/academy/review-final.py`, `muju/academy/production/R??/output/`, `muju/academy/production/R??/qa/`, `muju/academy/production/R??/public/music/`, `muju/academy/production/R??/public/art/`

- Update: Render affected episodes, master with existing soundtracks, and regenerate affected posters/transcripts. Review actual final exports before recording review-final.py --visual-reviewed evidence. Inspect batch script/runtime paths and current episode configuration first.
- Verify: Require full decode, source-audio correlation, complete duration, quiet holds, loudness/peak checks, readable cards/boards and correct matrices. final-review.json must identify exact final video and timeline hashes; never mechanically assert that unseen frames were reviewed.

BLOCKED — obtain missing production inputs:
- `muju/academy/render-batch.py`
- `muju/academy/render.mjs`
- `muju/academy/master.mjs`
- `muju/academy/remaster-batch.py`
- `muju/academy/final-frames.py`
- `muju/academy/stills-batch.py`
- `muju/academy/review-final.py`
- `muju/academy/production/R??/output/`
- `muju/academy/production/R??/qa/`
- `muju/academy/production/R??/public/music/`
- `muju/academy/production/R??/public/art/`
Academy production sources and media are not tracked in this repository. Obtain the current production bundle before executing these nodes; do not skip Academy propagation.
/Users/ashkie/src/deevgames/muju/academy/ on the original production workstation; verify current provenance before using it.

Disposition: blocked. Evidence: —

## 20. [ ] game-validation — Game, AI, server, MCP and browser regression gates

Reason: upstream changed: rules-docs; upstream changed: browser-ui; upstream changed: persistence; upstream changed: wasm-tactics; upstream changed: ai-search; upstream changed: hard-ai; upstream changed: ai-strength; upstream changed: server-runtime; upstream changed: mcp-tools; upstream changed: agent-guides; upstream changed: balance-analysis

Paths: `muju/tests/`, `muju/e2e/`, `muju/vitest.config.ts`, `muju/playwright.config.ts`, `muju/playwright.online.config.ts`, `muju/playwright.hard.config.ts`, `muju/server/tsconfig.json`, `muju/tsconfig.json`

- Update: Adapt meaningful changed-rule regression cases and fixtures. Retain explicit historical compatibility fixtures; do not replace every occurrence of an old number. Investigate failures against intended behavior.
- Verify: Run targeted checks during iteration, then release gates. For general local browser tests first serve the built game at MUJU_BASE_URL (default http://127.0.0.1:8927/muju/); the online suite starts its own isolated host.
- Command (cwd `muju`): `npm run server:types && npm test && npm run build` — Checks types/tests and rebuilds WASM plus browser artifacts.
- Command (cwd `muju`): `npm run test:online:e2e` — Runs Playwright against an isolated in-memory Node host on port 8928.
- Command (cwd `muju`): `npm run test:e2e -- e2e/ai-worker.spec.ts` — Requires the built game served at MUJU_BASE_URL and an installed browser.

Disposition: pending. Evidence: —

## 21. [ ] static-package — Complete deevgames static release artifact

Reason: upstream changed: game-validation

Paths: `build-all.sh`, `tools/verify_site.py`, `tools/smoke-site.cjs`, `muju/vite.config.ts`, `muju/package.json`, `muju/package-lock.json`, `index.html`, `README.md`

- Update: Build all three games with locked dependencies and Node 24; stage only the generated _site directory. Confirm current rules, skill assets and compiled AI land in the artifact. Check hub/game navigation and public dossier copy.
- Verify: The full build verifies links, required pages and file sizes. Serve _site on an unused port and run tools/smoke-site.cjs against it; inspect actual gameplay.
- Command (cwd `.`): `bash build-all.sh` — Builds muju, forge and oracle and replaces generated _site; their dependencies must already be installed.

Disposition: pending. Evidence: —

## 22. [ ] server-package — Node host release with persistent room storage

Reason: upstream changed: game-validation

Paths: `muju/Dockerfile`, `muju/compose.yaml`, `muju/.dockerignore`

- Update: Build the Node host including its own browser dist and copied public skill files. Verify deployed source revision, persistent disk configuration, public URL/CORS and protocol compatibility.
- Verify: Test the built image and restart persistence. Preserve /app/data/rooms.sqlite and existing room data. Static Pages publication does not update this service.

Disposition: pending. Evidence: —

## 23. [ ] academy-package — Versioned Academy site package and historical redirects

Reason: upstream changed: academy-video

Paths: `muju/academy/build-release.py`, `muju/academy/verify-live.py`, `muju/academy/verify-withdrawal.py`

- Update: Review the explicit mixed v7/v8 Metal release revisions, summaries, catalogue and economy in builder/verifier. Locate a current ashkie-pages checkout, review its instructions/workflow, choose a fresh archive outside the site, then validate before packaging. Do not assume the old /private/tmp checkout still exists.
- Verify: Run build-release.py with production root, site checkout and fresh external archive using --check-only before packaging. Verify exact hashed videos/posters/transcripts, course page, release.json, offline-manifest handling and static-before-wildcard redirects. The builder explicitly verifies the Metal v2.9 mixed v7/v8 release.
- External: ethancd/ashkie-pages: muju-academy/, _redirects, offline-manifest.json, ./check, tools/verify_muju_videos.py and deployment workflow

BLOCKED — obtain missing production inputs:
- `muju/academy/build-release.py`
- `muju/academy/verify-live.py`
- `muju/academy/verify-withdrawal.py`
Academy production sources and media are not tracked in this repository. Obtain the current production bundle before executing these nodes; do not skip Academy propagation.
/Users/ashkie/src/deevgames/muju/academy/ on the original production workstation; verify current provenance before using it.

Disposition: blocked. Evidence: —

## 24. [ ] static-deploy — Publish Cloudflare Pages deevgames

Reason: upstream changed: static-package

Paths: `.github/workflows/deploy.yml`

- Update: Follow root README deployment flow. Publish validated _site through the workflow or documented Wrangler command; master is production and other branches are previews. Check fetched origin/master freshness and preserve unrelated work.
- Verify: Record source revision, artifact identity, actual publish result and deployment URL. A green workflow can mean checks-only when credentials are absent; confirm the deploy step actually ran.
- External: Cloudflare Pages project deevgames; documented public base https://deevgames.pages.dev

Disposition: pending. Evidence: —

## 25. [ ] server-deploy — Publish authoritative multiplayer/MCP host

Reason: upstream changed: server-package

Paths: external release surface

- Update: Inspect the current Render service and deploy the verified matching source/image through its configured release path. The repository has no verified automatic server deployment workflow; discover the live service configuration instead of inventing a deploy command. Follow ONLINE.md persistent disk and health settings.
- Verify: Record service/release identity and revision. Verify /api/muju/health, /muju/, /SKILL.md and MCP discovery/rules. Exercise a changed-rule preview and legal action in a fresh disposable room; verify existing storage survived.
- External: Documented Node/MCP host https://deevgames-muju.onrender.com; Render web service with /app/data persistence

Disposition: pending. Evidence: —

## 26. [ ] academy-deploy — Publish Muju Academy on ashkie.com

Reason: upstream changed: academy-package

Paths: external release surface

- Update: Publish the prepared Academy-only changes via the current ashkie-pages workflow, following that checkout's release checks. Preserve unrelated website changes and previous media archives.
- Verify: Record website revision/deployment URL. Install the adapted verify-live.py as tools/verify_muju_videos.py in the website checkout before running it there. Verify page and release manifest, exact media bytes/hashes, range seeking, historical redirects and retired assets, then inspect the live course.
- External: https://ashkie.com/muju-academy/; ethancd/ashkie-pages deployment workflow

Disposition: pending. Evidence: —

## 27. [ ] release-verification — Cross-surface completion evidence

Reason: upstream changed: static-deploy; upstream changed: server-deploy; upstream changed: academy-deploy

Paths: `muju/docs/changes/`

- Update: Write a change-specific completion record with every affected node disposition, exact source/artifact revisions, tests, affected lesson IDs, publish results and live verification evidence. Update current Academy STATUS and append decision context as appropriate.
- Verify: Compare the changed piece/rule across browser UI, local AI behavior, online engine, MCP rules and analysis, public agent skills and live Academy lessons/transcripts. Every applicable release must be verified or explicitly blocked. Do not call an end-to-end update complete when a surface is still stale or a publish is unverified.

Disposition: pending. Evidence: —

