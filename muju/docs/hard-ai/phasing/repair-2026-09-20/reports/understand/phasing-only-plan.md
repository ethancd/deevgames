HEADLINE: The phasing-only cutover has not started in this checkout. Master still ships both rulesets with Standard as the default everywhere, and the branch that removes Standard (`codex/phasing-only-canonical`, T5/M8) is not in any ref here. Standard is already degraded for AI: the Hard replica is Phasing-only and `hardEnabled` is true, so the default Standard "Hard" seat falls back to AIEngineV2 on every turn. The plan does allow the cutover to ship with Hard routed to the `aiv2-hard` preset (`hardEnabled=false`), but only after Gate 1 (baseline sanity for the ported V2) passes. Gate 1 has never passed, and no eligible Gate 1 row exists under the current revision `muju-phasing-2`.

## Remaining work
- (S) Record the owner decision. Add a JUDGMENT_LOG entry retiring Standard. Create the `standard-final` tag at the last dual-ruleset commit. Blocked only on the owner confirming scope. Decide whether the rules revision string stays `muju-phasing-2`; it should, or every lab identity hash changes and current evidence cannot be pooled.
- (M) rule-contract and rules-docs. Fold PHASING-2026-09-16.md into SPEC as the sole normative turn structure under a new spec version (v3.0 is taken). Mark the variant doc superseded. State the rules revision of every stored room, save, replay, opening corpus and strength record. Sweep AI_ENGINE_README, AI_IMPLEMENTATION_STATUS, the strategy guides, the dossier and the portfolio. Nothing blocks this.
- (L) transitions, catalogue, board-rules, browser-ui. Remove Standard branches from src/game, src/ai/simulate and the hooks. Drop RulesetSelect and the Standard copy in ModeSelect and InstructionsModal. Default new games to Phasing. Keep one captured retired-rules fixture. Blocked on recovering or redoing the T5 branch `codex/phasing-only-canonical`, which is not in this checkout. If recovered from the other machine (/Users/ashkie), it must be rebased to map `muju-online-6` and `muju-phasing-2`.
- (M) persistence. Bump the save schema from 8 to 9. Decide convert, archive read-only or reject for Standard saves, never reinterpreting them. Keep only the presentation needed to view retired games. Blocked on an owner decision about archive handling.
- (M) server-runtime, mcp-tools, agent-guides. Make Phasing the only creatable ruleset in schema.ts, mcp.ts and observation.ts. Standard rooms (`muju-online-6`, `muju-online-4`) follow the RULES_CHANGED path, and `muju-phasing-2` rooms continue. Never reset rooms.sqlite. Rewrite SKILL.md, MCP_TOOL_TAPS (0 Phasing mentions today), ANALYSIS_TOOLS and ONLINE.md. The engine-seat runner's unconditional Standard guard needs its M7 readiness change. Blocked on an owner decision about read-only access to retired rooms; today they can be listed but not opened.
- (S) Stop Standard-Hard from silently running V2. Under the cutover this becomes `hardEnabled=false`, with Hard routed to the aiv2-hard preset until Gates 0+2+3 pass. It is a one-line flag change plus a routing check in useAI. Under the preregistration it needs Gate 1 to have passed, or an owner-authorised amendment.
- (L) ai-strength Gate 1 under `muju-phasing-2`. Build the A5 per-search calibrated adapter. Run an idle-machine calibration and the ineligible pilot (seed 20260963). Then run the 48-pair-per-cell row (seed 20260960) on p1-dev openings. Blocked on the A5 adapter change and a quiet measurement machine. This gate decides whether vs-AI can open under Phasing at all per the plan.
- (L) hard-ai and ai-strength for Hard itself. Full M6: development-only corpus, frozen tunable domain, fit, a preregistered val row. Meet the unchanged suite floors; currently invariants 8/15, economy 19/20 and summon-disruption 12/14 fail. Then M7: a full Gate 0 chain, the Gate 2 sealed row (32 pairs, seed 20260953, wall:8000), and Gate 3 responsiveness (desktop p95 ≤ 6,000 ms, phone p95 ≤ 3,000 ms). Blocked on M6 protocol documents being written before any dev outcome.
- (M) game-validation and packaging. Run the full default vitest suite; the last claim, 2,853 passed, is a commit message and was not re-run here. Run the Playwright suites; the draw-clock record says e2e was not run. Run `npm run build`, `bash build-all.sh` and the Docker image. Blocked on the upstream nodes.
- (S) server-deploy. Merging to master is the deploy, because Render auto-deploys master. Afterwards verify /api/muju/health, /muju/, /SKILL.md, MCP discovery and rules, play a disposable Phasing room, and confirm existing rooms survived. Blocked on the owner's go-ahead.
- (S) static-deploy. Record it as blocked (Pages publishing paused, no credentials), or restore credentials. The frozen Pages /muju/ copy will keep showing a Standard-default build until it is republished or redirected.
- (S) Academy notice publish. Apply t7-academy-notice-2026-09-19/website-notice.patch in a fresh ethancd/ashkie-pages checkout. Copy verify-live.py to tools/verify_muju_videos.py. Run ./check, publish and verify live. Blocked on publish authorization and access to that external repo.
- (L) Academy v9 re-record of R01, R04–R07, R09 and R10. Blocked on the media bundle, which is not on this machine (`~/Archives/muju-media-2026-09-18` is absent), and on owner speech authorization. `academy/rules-verification.json` still says v2.9.
- (S) Bring muju/docs/changes/2026-09-phasing-only.md up to date, or regenerate it from the live planner. The current file lags master by about 25 commits and carries stale Academy blocks. Write the 27-node completion record at the end.

## Open questions
- Where is `codex/phasing-only-canonical` (T5/M8) now? It is referenced as existing on the other machine (/Users/ashkie), but no ref reaches it from this checkout. Can it be pushed or recovered, or must the Standard removal be redone against current master?
- Will the owner amend the preregistration so Phasing vs-AI can open before Gate 1 passes (for example, all AI labelled unrated)? Standard "Hard" already plays as V2 via fallback, so the gate currently protects a default that is no better. The plan as written says no AI on Phasing without Gate 1.
- Should the cutover issue a new online rulesVersion string for the single canonical ruleset (T5 used `muju-online-5`), or keep `muju-phasing-2`? Keeping it avoids stranding live Phasing rooms and keeps lab identity hashes and current evidence valid; a new string would void them the way A4 did.
- What happens to Standard rooms and saves? The DAG requires an explicit choice per stored ruleset (convert, archive read-only or reject). Today a retired room returns RULES_CHANGED on reads too, so archived games can be listed but not opened. The draw-clock record leaves this to the owner and T5.
- Which commit is actually deployed on Render? The health endpoint does not expose a revision. The "auto-deploys master" claim was verified on 2026-09-18 per the docs and was not re-verified here.
- Does the static balance solver (lab/solver, current-static) model Standard instant purchases in a way that makes its report wrong under Phasing-only? The draw-clock record marked it verified unchanged only because it has no clock term; nobody has reviewed it for phase order.
- Is a 27% inactivity-draw rate among scripted bots under the 20-ply clock the game the owner wants? A3 and J-021 deliberately left "what counts as progress" unchanged, and any further rules edit voids `muju-phasing-2` evidence again.
- The milestone sequence (M6-STATUS:184) puts the M8 cutover after M7 Hard acceptance, while the preregistration's unlock table allows AI play with `hardEnabled=false` after Gate 1 alone. Which ordering does the owner intend?

## Findings
- [verified-in-code-or-results] The current rules revision is `muju-phasing-2` and SPEC is at v3.0 (2026-09-19). New Phasing rooms are stamped `muju-phasing-2` and new Standard rooms `muju-online-6`. `muju-online-5` is reserved for the unmerged T5 branch's single canonical ruleset. (muju/server/rooms.ts:29-40; muju/SPEC.md:22-29; muju/ONLINE.md:543-552; commit 1a989d3)
- [verified-in-code-or-results] SPEC v3.0 was used for the 20-ply draw clock, not for folding Phasing into SPEC as the preregistration intended. SPEC still opens with "Standard remains the default" and "Built-in AI remains Standard-only", and §2 still specifies the Standard turn. The rule-contract node for phasing-only is not done. (muju/SPEC.md:3-11, 107-124; muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:22-24 ("to be folded into SPEC.md v3.0"); muju/docs/changes/2026-09-phasing-only.md:15 (Disposition: pending))
- [verified-in-code-or-results] No JUDGMENT_LOG entry records the decision to retire Standard. The only trace is one sentence inside J-021: "Standard is being retired". The `standard-final` tag that the preregistration defines as its reproducibility anchor does not exist. (muju/JUDGMENT_LOG.md:338; `git tag -l` returned nothing; muju/docs/hard-ai/phasing/M2-STATUS.md:1134 ("The tag `standard-final` does not exist"))
- [verified-in-code-or-results] The Standard-removal work (T5, the "M8 canonical-removal branch" `codex/phasing-only-canonical`) is not in this checkout. It is absent from `git branch -a` and from all refs. It is referenced only in comments and docs, which say it reserves `muju-online-5` and migrates `muju-phasing-1` rooms. It predates `muju-phasing-2` and `muju-online-6` and would need rebasing. `muju/phasing-only` is also absent. (`git for-each-ref | grep -i phasing` shows only origin/codex/muju-phasing-analysis; muju/server/rooms.ts:29-33; muju/docs/changes/support-integration-2026-09-19/README.md:34,43)
- [verified-in-code-or-results] Master still runs both rulesets with Standard as the default. The type is `Ruleset = 'standard'|'phasing'`. ModeSelect initialises to 'standard' and only offers the ruleset choice in Pass & Play, or in AI modes with `?phasingAi=1`. The server schema and `muju_rules` default to 'standard'. SKILL.md says "ruleset defaults to standard" and "Built-in AI remains Standard-only". (muju/src/game/types.ts:16; muju/src/components/ModeSelect.tsx:46,58,109-113; muju/server/schema.ts:48; muju/server/mcp.ts:66-67; muju/server/observation.ts:121-122; muju/public/skills/muju-hono-tanka/SKILL.md:37,49)
- [verified-in-code-or-results] The Hard replica is Phasing-only: `pack` throws PackError for any non-phasing state. `hardEnabled` is still `true`, and `useHard` does not check the ruleset. In the default Standard ruleset the Hard seat therefore reports a pack error and falls back to AIEngineV2 on every turn. The preview commit message says so outright. (muju/src/ai/hard/core/state.ts:612-616; muju/src/ai/hard/config.ts:47; muju/src/hooks/useAI.ts:125,289; muju/src/ai/hard/engine.ts:530; commit 425efa4 message ("under Standard the Hard seat falls back to the legacy engine every turn because the replica is Phasing-only"))
- [verified-in-code-or-results] A fourth route, not in the preregistration's unlock table, is on master: a personal `?phasingAi=1` / `localStorage['muju.phasingAi']` preview. It opens the worker guard, ModeSelect and GameScreen for both engines under Phasing with no gate passed, and carries a "Preview · unreleased AI" badge. The owner used it on the live site and filed three position reports of weak Hard play. (muju/src/ai/phasingPreview.ts:1-40; muju/src/ai/worker/handler.ts:107-113; commits 425efa4, 2b4e5de; muju/docs/hard-ai/phasing/PREVIEW-REPORTS-2026-09-19.md:3-6)
- [doc-claim-only] The plan allows the cutover to proceed with Hard disabled. The unlock table says Gate 1 plus `e2e/ai-worker.spec.ts` on Phasing opens vs-AI and Watch-AI with "Hard" routed to the `aiv2-hard` preset (`hardEnabled = false`). Gate 0 opens `engine:'hard'` for `?hardAi=1` only. Gates 0+2+3 set `hardEnabled = true`. Hard does not need to pass for AI play to reopen, but the ported V2 baseline must pass Gate 1. (muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:92-98)
- [verified-in-code-or-results] Gate 1 has never passed, and no eligible Gate 1 row exists under `muju-phasing-2`. Row A2 (1,024 games at 32f83b88) completed with a clean audit and failed. A3 reclassified the two medium cells as invalid (effective n=1) and kept Expand h0 (0 wins/128 draws/0 losses, all inactivity) as a genuine failure. A4 then voided every Gate 1 game. Under `muju-phasing-2` there are only ineligible pilots and calibrations. Row seed 20260960 is unused, and A5's per-search calibrated adapter must be built before the row runs. (PHASING-PREREGISTRATION-2026-09-18.md:200-216, 254-268, 271-294; muju/docs/changes/2026-09-phasing-only.md:408-413; `ls muju/lab/ai/results` (gate1-a3-pilot, gate1-p2-pilot, gate1-calibration, gate1-provisional-calibration only); lab/ai/results/gate1-p2-pilot-2026-09-19/README.md:1-7)
- [verified-in-code-or-results] The latest Hard suite measurement under `muju-phasing-2` (v2 suites) is valid but fails three floors. Tactics 61/63 (floor 57), home-mate 28/28 and home-fortify 6/6 pass. Invariants 8/15 (floor 14), economy 19/20 (floor 20) and summon-disruption 12/14 (floor 13) fail. Coverage is 79/79 with no fallback, illegal or divergent case. The engine ran with bootstrap weights that have 5 nonzero of 62. (commit 00dfc8f message; muju/lab/hard-ai/suites/phasing/results/v2-measure-2-2026-09-19/)
- [verified-in-code-or-results] The stored plan file lags master. It was last touched at d667c82 (M6 checkpoint). About 25 later commits are not reflected: A3/A4/A5, the 20-ply rules change, v2 suites, the Phasing AI preview and the engine-seat port. Its hard-ai and ai-strength nodes still read "Disposition: pending. Evidence: —". It also still marks academy-data, academy-lessons and academy-package as blocked on untracked sources. The live planner now blocks only academy-audio and academy-video, on the media bundle. (`git log -- muju/docs/changes/2026-09-phasing-only.md` (latest d667c82); diff of stored plan against `python3 tools/muju-content-dag.py plan --kind rules --kind ai --kind ai-strength --kind online`; muju/docs/CONTENT_DAG.md:14-23)
- [verified-in-code-or-results] The DAG edges make hard-ai and ai-strength upstream of game-validation, which gates static-package and server-package, then both deploys, then release-verification. The hard-ai node says: "Keep the worker and UI guards closed for unsupported rules until ai-strength passes." (muju/content-dag.json (game-validation dependsOn includes hard-ai and ai-strength; static-package and server-package depend on game-validation); muju/docs/changes/2026-09-phasing-only.md:118,291)
- [doc-claim-only] Pages publishing has been paused since 2026-09-18 for lack of credentials. The Render host is the canonical and only live-updated release. It is documented as auto-deploying GitHub master via Docker with a 1 GB disk at /app/data. Local master equals origin/master at a02bbb7, and the live health endpoint answers `{"ok":true,...,"protocol":1}`. Health does not expose the deployed revision, so that was not verified. (muju/docs/CONTENT_DAG.md:225-241; `git rev-parse HEAD origin/master` both a02bbb7; `curl https://deevgames-muju.onrender.com/api/muju/health`)
- [verified-in-code-or-results] The Academy Phasing notice is prepared in source on master but not deployed. It names R01, R04–R07, R09 and R10 as teaching the old Standard turn order, and it includes the 20-ply correction. A full v9 re-record is blocked on the media bundle and on owner speech authorization. The archive `~/Archives/muju-media-2026-09-18` is absent on this machine. (muju/academy/build-release.py:163; muju/academy/verify-live.py:28-35; muju/docs/changes/2026-09-19-academy-phasing-notice.md:40-49; `ls ~/Archives/muju-media-2026-09-18` reports no such directory; muju/docs/changes/2026-09-19-draw-clock-20.md:1001-1004)
- [doc-claim-only] The 20-ply clock materially changed Phasing's draw profile in the 840-game scripted reference. Inactivity draws fell from 49.52% to 27.02%, mean completed player turns rose from 29.98 to 38.22, and 189 previously drawn games resolved while none went the other way. New frozen bands: purchases [1.6696, 188.2857], inactivity [0, 0.7261]. (muju/docs/changes/2026-09-19-draw-clock-20.md:799-840; muju/lab/harness/results/p2-scripted-2026-09-19/)
- [verified-in-code-or-results] Ruleset branching (`isPhasing` / `ruleset`) to remove or collapse for a Standard retirement. `src/game`: 8 files, 31 lines. `src/ai`: 12 files, 34 lines. `src/components`: 5 files, 26 lines. `src/online`: 6 files, 16 lines. `server`: 11 files, 53 lines. `tests`: 54 files. `e2e`: 6 files. `lab`: 72 files, 1,781 lines, mostly identity labels. The save schema is 8, and a missing ruleset means Standard. (grep counts run in /Users/ethancd/src/deevgames/muju; muju/src/utils/persistence.ts:12; muju/docs/PHASING-2026-09-16.md:61)

## Report
# Phasing-only cutover: state of the plan, 2026-09-20

**Scope and method.** Read-only. Master is at a02bbb7, equal to origin/master.

I read in full:
- `muju/docs/changes/2026-09-phasing-only.md`
- `CONTENT_DAG.md` and `content-dag.json`
- `PHASING-2026-09-16.md`
- the Phasing parts of `SPEC.md`
- `JUDGMENT_LOG.md` J-021
- the Academy notice and Phasing-MCP change records
- `PHASING-PREREGISTRATION-2026-09-18.md`, amendments A1–A5

I skimmed the 95 KB draw-clock record for its dispositions. I ran the planner and `check`, and compared the stored plan with live planner output. I did not run tests or builds.

## (a) What Phasing is, compared with Standard

**The current rules revision is `muju-phasing-2`; SPEC is v3.0 (2026-09-19).**

| | Standard (SPEC §2, still written as "the default") | Phasing (`docs/PHASING-2026-09-16.md`) |
|---|---|---|
| Turn order | Turn start: home/elimination check → **pay upkeep** → heal/reset → **Place** (buy and promote) → **Act** (4 shared actions) → mine → clock → hand over. | Turn start: home/elimination check → **pending summons resolve** → heal/reset, 4 actions → **Act** → `END_ACTION_PHASE`: **mine once, then pay upkeep** (this turn's income counts) → **Prepare** (server still calls it `turn.phase='place'`) → `END_PLACE_PHASE`: clock, draw, hand over. |
| First turn | White starts in Act. Black with a 1–2 crystal handicap skips Place; with 3–20 it enters Place. | Both players start in Act whatever the handicap. |
| Purchases | Instant. A bought tier-1 unit appears and acts that turn (summon-and-strike). | **Public committed summons**: type, square, paid cost, ID. They arrive at the next own turn start if the square is empty and supported by a current unblocked spawn rectangle. Otherwise they vanish with a **full refund**. |
| Pending summons | Not applicable. | They are not units: they do not block, fight, mine, anchor, pay upkeep or delay elimination. One per owner per square. No relocation on failure. Incoming summons cannot support each other. |
| Summon-and-strike | Yes. | **No.** Arrivals can act on the turn they arrive, but that is a full turn after payment. The Hard suites retired "spawn-strike" and added summon-disruption and home-fortify. |
| Promotion | In Place, before acting. Not on the purchase turn. Promoted units act immediately. | In Prepare, after acting and mining, once per turn, including this turn's arrivals. The new upkeep rate applies after mining next turn. |
| Upkeep | At turn start, before acting. | After Act and mining. An invader must survive its own end-of-action upkeep before immediate home-checkmate can be awarded. |
| Home defence | Rescue starts before defender upkeep. | Rescue uses the actual army and 4 actions, with no pre-action promotions or upkeep releases. Home occupation blocks every supporting rectangle, including pending arrivals. |
| Turn end | `END_ACTION_PHASE` hands over. | `END_PLACE_PHASE` hands over. Prepare always ends explicitly. Zero AP does not end the turn. |
| Draw clock | 20 quiet plies, amber at 17. Only an attack kill resets it. | The same single constant (`src/game/inactivity.ts:5-6`). |

**Revision names in code** (`server/rooms.ts:39-40`): Phasing rooms are `muju-phasing-2` and Standard rooms are `muju-online-6`. `muju-online-5` is reserved by the unmerged T5 branch. Retired versions (`muju-online-4`, `muju-phasing-1`) return `RULES_CHANGED`.

**Where the docs and code disagree.**
- The preregistration said Phasing would be "folded into `SPEC.md` v3.0". v3.0 was used for the 20-ply clock instead.
- SPEC:3-11 and PHASING:3-7 still say "Standard remains the default" and "Built-in AI remains Standard-only".
- On master both engines are ported to Phasing, and the Hard replica is Phasing-only.

## (b) Node-by-node table

"Plan" is the disposition written in `2026-09-phasing-only.md`. "Evidence" is what code and git show. The plan file was last edited at d667c82 and lags master by about 25 commits.

| # | Node | Plan | Evidence | Remains for phasing-only |
|---|---|---|---|---|
| 1 | rule-contract | pending | J-021 and SPEC v3.0 cover only the clock. There is no retirement entry and no `standard-final` tag. | Decision entry, SPEC fold-in under a new version, supersede the variant doc, map each stored artefact to its revision, create the tag. |
| 2 | catalogue | pending | No stat change. `types.ts:16` still has `'standard'\|'phasing'`. | Narrow the type; otherwise verify unchanged. |
| 3 | board-rules | pending | `rules.ts:3-5` has `isRuleset`, `isPhasing`, `rulesetLabel`. | Collapse the helpers and the handicap skip rule. |
| 4 | transitions | pending | Both rulesets are live. T5 is not in this checkout. | Remove the Standard paths; keep a retired-rules fixture. |
| 5 | rules-docs | pending | Changed for 20 plies only. | Full sweep of the 8 listed docs. |
| 6 | browser-ui | pending | `RulesetSelect` is present. ModeSelect defaults to 'standard'. Phasing vs-AI is available only behind `?phasingAi=1`. | Remove the selector, default to Phasing, rewrite instructions, regenerate previews. |
| 7 | persistence | pending | Schema is 8 for the clock. A missing ruleset means Standard. | Schema 9; choose convert, archive or reject; keep a fixture. |
| 8 | wasm-tactics | **changed** | ABI 7 is on master (`assembly/tactics.ts:33`). 28 fixtures, 36 of 36 rescues. | Nothing beyond re-verification. |
| 9 | ai-search | **changed**; Gate 1 not passed | V2 is ported. A purchase-freeze fix is in. | Pass Gate 1. |
| 10 | hard-ai | "pending" (stale) | The M2 replica, M4 search and M6 bootstrap evaluation are merged. `pack` rejects Standard. | Full M6 (corpus, fit, validation), then M7. |
| 11 | ai-strength | "pending" (stale) | Parity was re-pinned under phasing-2: perft 7 of 7, fuzz 1.2M actions with 0 divergences. v2 suites fail 3 floors. Gates 1, 2 and 3 have not passed. | Gates 0–3. |
| 12 | server-runtime | pending | Version strings advanced for the clock only. The schema default is 'standard'. | Phasing-only creation, archive policy, T5 rebase. |
| 13 | mcp-tools | pending | `muju_rules` defaults to standard. | Rewrite defaults and text. |
| 14 | agent-guides | pending | SKILL.md:37 and :49 are stale. MCP_TOOL_TAPS has 0 Phasing mentions. | Rewrite. |
| 15 | balance-analysis | pending | Verified unchanged for the clock only. | Review the phase-order assumptions. |
| 16 | academy-data | "blocked" (stale) | The sources are now tracked. The live planner says pending. | Export under the new rules; `rules-verification.json` still says v2.9. |
| 17 | academy-lessons | "blocked" (stale) | Notice text is prepared. R01, R04–R07, R09 and R10 are affected. | v9 scripts. |
| 18–19 | academy-audio, academy-video | blocked | The media archive is absent on this machine. Owner speech authorization is pending. | Obtain the bundle, re-record, render. |
| 20 | game-validation | pending | Commit 425efa4 claims 2,853 tests passed. Earlier the M6 lane had 43 failures. The draw-clock record did not run e2e. | Full suite, Playwright, build. |
| 21–22 | static-package, server-package | pending | Not built. | `build-all.sh`; Docker image. |
| 23 | academy-package | **changed** (notice prepared) | `build-release.py:163`; `verify-live.py:28-35`. | The v9 package later. |
| 24 | static-deploy | **blocked** | Pages publishing paused since 2026-09-18; no credentials. | Restore credentials, or record as blocked. |
| 25 | server-deploy | pending | Render auto-deploys master (a claim in the docs). | Merge, then live checks. |
| 26 | academy-deploy | blocked | No-publish boundary; external repository. | Apply the patch and publish. |
| 27 | release-verification | pending | No completion record exists. | Write the completion record. |

## (c) Nodes blocked on Hard AI and ai-strength, in the plan's words

- **hard-ai:** "Keep the worker and UI guards closed for unsupported rules until ai-strength passes."
- **ai-strength:** "Correctness is a hard veto: zero illegal actions, zero replica divergences, zero fallbacks, perft equal, suites at or above their pinned floors." "Strength is claimed only from a preregistered rule written before the run."
- **ai-search:** "Keep the Phasing guard closed until T1 bands and Gate 1 comparisons plus worker e2e pass."
- **Plan addenda:**
  - "M5/M6 and Hard acceptance remain pending, so the overall hard-ai and release nodes are not closed."
  - "Gate1 FAILED… All Phasing release guards remain closed."
  - "Full M6 corpus/fit/val remains incomplete, Gate1 A2 remains valid FAILED, M7/M8 and release guards remain blocked."
- **M6 record:** "`release-verification` | Blocked: no new deployment, failed Gate1 and M5 floors, no M6 selected candidate or M7/M8 acceptance."
- **Structure.** `game-validation` depends on `hard-ai` and `ai-strength`. It gates `static-package` and `server-package`, then both deploys, then `release-verification`. So nodes 20–22, 24–25 and 27 are all downstream of the AI work.

## (d) May the cutover proceed with Hard disabled?

**Yes, with one hard precondition.** The preregistration's "What each gate unlocks" table (lines 92-98) stages the unlock:

1. Gate 1 plus the `ai-worker` e2e on Phasing opens vs-AI and Watch-AI, "with 'Hard' routed to the `aiv2-hard` preset (`hardEnabled = false`)".
2. Gate 0 allows `engine:'hard'` behind `?hardAi=1` only.
3. Gates 0+2+3 set `hardEnabled = true` and append a Phasing release record.

Hard passing is therefore not required to ship Phasing-only with an AI opponent. Gate 1 is required, and it has never passed. After amendments A1, A3 and A5, Gate 1 means:
- ported `aiv2-hard` beats Expand, Balanced and `aiv2-medium`, each with score above 0.5 and an Elo interval excluding 0, reported at h0 and h3;
- Rush is report-only;
- purchases and inactivity draws stay inside the frozen bands;
- it makes at least one purchase in every game longer than 10 completed player turns;
- 48 distinct dev-book pairs per cell, with at least 90% distinct games;
- per-search calibrated work.

**Where the documents conflict.**
- The milestone sequence puts the M8 cutover after M7 Hard acceptance (M6-STATUS:184). The unlock table is more permissive.
- No document says what happens to vs-AI if the cutover precedes Gate 1. The guard logic implies human-only play or the labelled preview.

**What is actually on master.**
- `hardEnabled` is `true`, and Standard + Hard falls back to V2 on every turn (commit 425efa4 says so).
- An opt-in `?phasingAi=1` preview bypasses all gates for the owner.

So "Hard plays strong by default" is currently false under both rulesets.

## (e) The three release paths and what each needs

1. **Browser site — Cloudflare Pages, `deevgames.pages.dev/muju/`.**
   - Publishing has been paused since 2026-09-18 for lack of credentials. The copy is frozen, and the DAG says to record `static-deploy` as blocked, not skipped.
   - For the cutover, still run `bash build-all.sh` and smoke-test `_site`.
   - The frozen copy stays on an old Standard-default build unless credentials return.
2. **Node/MCP host — Render, `deevgames-muju.onrender.com`. This is the canonical release, and it also serves the browser client.**
   - Docs say service `srv-dahbp4ht0dsc73fdqn10` auto-deploys GitHub master via Docker, with a 1 GB disk at `/app/data`. Merging to master is therefore the deploy.
   - What the cutover needs:
     - Phasing as the only creatable ruleset;
     - Standard rooms on the `RULES_CHANGED` or read-only archive path;
     - `muju-phasing-2` rooms continuing;
     - never resetting `rooms.sqlite`.
   - Post-deploy checks: `/api/muju/health`, `/muju/`, `/SKILL.md`, MCP discovery and rules, a disposable Phasing room, and restart persistence.
   - Health answered OK today. The deployed revision could not be verified.
3. **Academy — `ashkie.com/muju-academy/`, in the separate `ethancd/ashkie-pages` repository.**
   - Minimum for the cutover: publish the prepared text-only notice.
     - Apply `website-notice.patch`.
     - Install `verify-live.py` as `tools/verify_muju_videos.py`.
     - Run `./check`, then verify live.
   - A full v9 re-record of R01, R04–R07, R09 and R10 needs the media archive, which is absent on this machine, and owner speech authorization.

## Pragmatic reading (my inference, not in the plan)

The cheapest honest sequence:
1. Record the retirement decision and create the tag.
2. Switch the defaults, selector, rules text and guides to Phasing, keeping `muju-phasing-2` as the revision string so evidence and live rooms survive.
3. Set `hardEnabled=false` so "Hard" is openly V2, not a silent fallback.
4. Run the A5 Gate 1 row to legitimise vs-AI.
5. Pursue M6 and M7 for the real Hard engine in parallel.

Deleting the Standard code (T5/M8) can follow. It is the large item, and its branch must first be recovered.