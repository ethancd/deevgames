HEADLINE: The Phasing Hard conversion never reached a strength verdict. In about 20 hours (2026-09-18 20:34 to 09-19 16:42), 36 of 62 non-merge commits and about 38% of hand-written lines built measurement apparatus. Only 2 commits (872 lines, 331 in engine strength code) tried to make an engine play better than its port. The Phasing Hard engine evaluates with 5 of 62 weights non-zero by contract, has no recorded ladder game against any opponent, and five preregistration amendments plus about 1,250 void or ineligible Gate 1 games produced zero eligible rows. The three owner complaints map plausibly onto zeroed weights or shallow search (each mechanism is inferred, none traced). The repo already holds a fast iteration loop: the Standard `default-v1` weight vector, ladder/SPSA/book tooling, 48 dev openings, and six recorded Phasing games by strong players that share one opening.

## Remaining work
- S: Run one recorded ladder row of the Phasing Hard engine vs aiv2-hard (Phasing port) on the 48 dev openings at the shipped wall budget, seat-mirrored, as a diagnostic and not a gate. Nothing technical blocks it as far as I can see (hard:ladder was bound to Phasing in d403a08). The preregistration's own sequencing (Gate 1 before any Hard-vs-V2 row) blocks it procedurally, so the owner would need to relax that.
- S: Replay the three owner preview positions (parseCompactReport in src/utils/compactReport.ts) through the engine at the product budget. Record depth reached and whether the PV contains the opponent's capture. This separates an eval gap from a search-depth gap. Nothing blocks it.
- M: Build a candidate Phasing weight vector. Start from Standard default-v1 (git show 43b87b6:muju/src/ai/hard/eval/weights.ts). Drop or re-derive the terms M6 flagged as stale (Inv5, Inv17, Inv7, Inv14, Inv19, BankConvertible, SpawnZero cash assumptions). Add non-zero Hanging/Exposure, SpawnArea/AnchorDepth and DrawPressure/Inv16. Then A/B it against the bootstrap vector with hard:ladder. M6-STATUS blocker 3 applies: the ladder has no CLI for a candidate weight file, so add a minimal arm or reuse lab/hard-ai/ablate/arms.ts. The M6 contract language forbids importing old coefficients without derivation, so the owner needs to waive it.
- S-M: Build the White opening book the owner asked for from the recorded strong-player openings (Hi B1 to F5 + Muju@F4; Hi B1 to E6 + Göl@E5; and similar), using hard:book and the BK03 path. The preregistration stance that a book changes the engine under measurement blocks it; this is the owner's decision.
- S: Replace Gate 1 and the v2 floors with a hobby-scale ship rule (section e of the report) and record it in one short dated note. The owner must explicitly retire or supersede PHASING-PREREGISTRATION-2026-09-18.md, which has never produced an eligible row.
- S: Add Phasing-era lessons to /Users/ethancd/src/deevgames/.claude/napkin.md: the zero-weights recurrence, the second-instrument determinism defect, the suite that scored a win as wrong, and rules changes voiding evidence. Nothing blocks it; this read-only task could not do it.
- M: Write a short Phasing strategy note (2 pages or less) from the six recorded games and the owner reports, to seed evaluator priors and refresh the MCP tool guidance. The Codex-Claude game was unfinished at fetch time, and someone has to replay the games rather than only reading openings.
- S: Confirm whether the default vitest suite is green on master. M6-STATUS recorded 43 failures and 40260ce claims to have ported two of the consumers. I did not re-run the suite in this read-only pass.

## Open questions
- Are the en-prise blunders in the owner reports an evaluation gap (zero Hanging/Exposure weights) or a search-depth gap (the Phasing macro-turn of Act plus Prepare reached depth 1 before 96eabc6 and 2-3 after)? The E3 Standard evidence that removing safety weights gained Elo points toward search depth. Nobody has run the 10-minute diagnostic.
- Does the owner want the preregistration apparatus (sealed openings, SPRT, identity hashes, floors) kept for Phasing at all? The rules are still moving: Metal v2.9 landed on 09-18 and the 20-ply clock on 09-19, and each rules edit voids all evidence by the document's own definition.
- When Phasing becomes the only ruleset, what ships as 'Hard' on day one: aiv2-hard's Phasing port (the preregistration's own interim route) or the packed engine? No committed result compares the two under Phasing.
- Is the packed HardEngine on master now Phasing-only (phasingPreview.ts says so, and pack rejects Standard)? If so, what currently serves the live Standard 'Hard' difficulty: the packed engine through some retained path, or a fallback to aiv2? I did not verify this; it belongs to another reader's domain.
- How strong is the ported aiv2-hard under Phasing? Pilot evidence only: W/D/L of 1/0/3 vs Rush and 3/1/0 vs Expand, from a 16-game ineligible pilot under muju-phasing-1. Expand h0 drew 128 of 128 games by inactivity in the A2 row. Does the 20-ply clock fix the passivity? The scripted Expand mirror still draws 55% under muju-phasing-2.
- Voided Gate 1 evidence and Codex work directories live under /Users/ashkie/Documents/Codex/... on another machine. Is anything there still needed, or is the committed repo the complete record?
- Is the high promotion rate in the recorded Phasing games (8-15 per game, including turn-1 Sjor to Straumr) sound Phasing strategy, since promotion in Prepare gives immediate DEF for the opponent's turn? Or is it a Codex habit? It bears on whether FORTIFY and promotion terms deserve evaluator weight.

## Findings
- [verified-in-code-or-results] Classified by commit intent, the Phasing window (71a2c51..a02bbb7, 62 non-merge commits) splits A1 port-to-play 3, A2 strength beyond the port 2, B replica correctness 6, C measurement/preregistration/evidence 36, D product wiring 9, E other 6. Hand-written lines total 62,794: C 24,015 (38%), B 15,441 (25%), A1 10,845 (17%), D 6,468 (10%), E 5,153 (8%), A2 872 (1.4%). Class C also committed about 4.8M lines of data. (git log --since=2026-09-16 --no-merges --numstat -- muju, bucketed by path and classified by script. Working files: /private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/breakdown.txt and classify.py. The class assignments are my judgment and nobody else has checked them.)
- [verified-in-code-or-results] The only Phasing-window commits aimed at better play than the ported engine are 96eabc6 (HOME_RACE demotion, DISRUPT through Prepare, FORTIFY pairs; 331 lines in src/ai/hard gen/search) and dd88c6b (V2 purchase-freeze fix, 13 source lines). 96eabc6 reports that 13 of 16 searched roots gained a ply at fixed work. (git show 96eabc6 (commit message and stat); git show dd88c6b --stat)
- [verified-in-code-or-results] The live Phasing Hard evaluator has 5 non-zero weights of 62: Material 100 (informational), BankLiquid 100, BankExcess 100, EconDelta 100, PendingValue 1. All twenty section-7 invariants, Hanging, Exposure, SpawnArea, AnchorDepth, HomeThreat, DrawPressure, ArrivalThreat and DisruptPressure are computed features with weight 0. TUNED_WEIGHTS is a clone of this default. (/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28,44; /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.generated.ts:13-17; /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features.ts:66-133; /Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:84-106)
- [verified-in-code-or-results] The Standard engine that shipped on 2026-09-18 (R2: 51/0/13, +237 Elo [+141, +385] vs aiv2-hard) used a hand-set 58-weight vector, default-v1, with no Texel fit. Examples: Rent -422, SpawnZero -800, HomeInvaded -4000, Hanging -50, Inv3RetreatSquare -250, Inv13Turtle -200. M6 zeroed these by contract. (git show 43b87b6:muju/src/ai/hard/eval/weights.ts (const W block); /Users/ethancd/src/deevgames/muju/docs/hard-ai/RELEASE-2026-09-18.md:13-18,34)
- [doc-claim-only] Under Standard, the eval-no-safety arm (19 safety weights zeroed) beat the champion in both of its head-to-head rows: screen +163 [+85, +260] and confirmation +124 [+38, +229]. It also beat aiv2-hard by +397 [+330, +495], against +215 for the champion. It did not ship because it carried the M14 spawn-strike veto, a suite the Phasing preregistration retires. Restoring the old weights wholesale is therefore not an obvious win; the economy terms and search depth carried that engine. (/Users/ethancd/src/deevgames/muju/docs/hard-ai/e3/E3-PLAN.md:119-121; /Users/ethancd/src/deevgames/muju/docs/hard-ai/RELEASE-2026-09-18.md:15-18; /Users/ethancd/src/deevgames/.claude/napkin.md:776)
- [verified-in-code-or-results] No committed Phasing result manifest has the packed Hard engine (hard@...) as a player. In committed results, the Phasing Hard engine has never played a recorded ladder game against aiv2-hard or any scripted bot. This repeats postmortem finding 1 from 2026-09-15. (grep for '"hard@' in manifest.json under muju/lab/ai/results and muju/lab/harness/results returned nothing. The Phasing manifests are p1-scripted, p2-scripted, gate1-p2-pilot and the suite fixtures only. /Users/ethancd/src/deevgames/muju/docs/hard-ai/POSTMORTEM-2026-09-15.md:28-45)
- [verified-in-code-or-results] The Phasing preregistration, adopted 2026-09-18 20:59, took five amendments (A1-A5) in about 17 hours. Every Gate 1 game so far is void or ineligible. A2 voided a 130-game prefix because engine pruning had leaked into the shared legal generator. The 1,024-game replacement had effective n = 1 in the aiv2-medium cells because deterministic engines played without openings. A4, the owner's change to a 20-ply clock, voided everything before it. A5's per-search calibrated adapter has not been implemented. (/Users/ethancd/src/deevgames/muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:110-294. 'workPerSearch' has zero grep hits in lab/src/tests. /Users/ethancd/src/deevgames/muju/lab/ai/results/gate1-p2-pilot-2026-09-19/manifest.json has gate1='pilot-ineligible' and calibration.provisional=true.)
- [verified-in-code-or-results] The effective-n = 1 defect repeats a lesson already written down. The napkin's E0 row says deterministic engines from a fixed start play the identical game for every seed, and that the hard-ai ladder refuses such schedules without --openings. The Gate 1 runner was a second instrument, built under lab/ai/, and it did not inherit that refusal. (/Users/ethancd/src/deevgames/.claude/napkin.md:738; PHASING-PREREGISTRATION-2026-09-18.md:205-212 (A3); git 27950c7 and 858dacf (lab/ai gate1 runner))
- [doc-claim-only] The v1 Phasing suite floors were defective instruments. All 9 summon-disruption misses were roots where the mover had an immediate home-occupation win that the suite scored as zero. Thirteen of the invariant pairs (identical material and banks, differing only in geometry) scored static eval against invariant and geometry weights fixed at zero, so their gap of exactly 0 was arithmetically forced. The v2 suites, measured in 00dfc8f, still fail three floors: invariants 8/15 (floor 14), economy 19/20 (floor 20), disruption 12/14 (floor 13). Tactics 61/63, home-mate 28/28 and fortify 6/6 pass. (/Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/M6-STATUS.md:198-229; commit 00dfc8f message)
- [inferred] The three owner position reports from 2026-09-19 (Fire shuffles then retreats to its corner; Lightning dives to disrupt a refundable 3-crystal summon and is promoted while hanging; a lone Fire is sent to the 16-crystal field and left en prise) are consistent with an evaluator that scores only material, bank, a no-move mining forecast and pending value, combined with shallow search. No mechanism has been traced for any of them. (/Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/PREVIEW-REPORTS-2026-09-19.md:14-72, read against weights.ts:20-28. Whether any one blunder comes from eval or from search depth was not verified.)
- [verified-in-code-or-results] The owner asked for a White opening book (one memorised first turn, or 5-20 chosen at random). It was declined because it changes the engine under measurement and needs a dated amendment. Book infrastructure already exists (BK03, the hard:book script) with EMPTY_BOOK as the default. (/Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/PREVIEW-REPORTS-2026-09-19.md:74-79; /Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/M6-STATUS.md:58; /Users/ethancd/src/deevgames/muju/package.json:65)
- [verified-in-code-or-results] The repo holds six recorded Phasing games by strong players: five owner-vs-Codex games with complete histories (Codex won 4) and one Codex-vs-Claude snapshot that was unfinished when fetched. As White, Codex opened all five of its games with the Hi running 8 squares to the centre (B1 to F5, E6 or E4) plus one paired summon (Muju@F4, Göl@E5, or Muju@A2 in the Claude game). The owner opened its one White game the same way (Hi to E6, Göl@E5). Purchases across the five human games: Plant 38, Shadow 20, Fire 16, Lightning 10, Water 9, Metal 0. No evaluator, book or tuning corpus uses these games. (/Users/ethancd/src/deevgames/muju/docs/online-matches/2026-09-17-phasing-review/phasing-metal-review.md:1-17; the *-history.json files in the same directory. I extracted the first three turns from each with a script and did not replay the games.)
- [verified-in-code-or-results] There is no Phasing strategy prose in the repo. STRATEGY_GUIDE-2026-09-12 and STRATEGIC_UNDERSTANDING sections 6-9 were written under Standard's 'fresh purchases act immediately' rule. The M6 contract itself flags Inv5 and Inv17 as carrying stale immediate-placement semantics and Inv7, Inv14 and Inv19 as resting on wrong rent, threshold and bank premises. (/Users/ethancd/src/deevgames/muju/docs/STRATEGY_GUIDE-2026-09-12.md:28,44; /Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:103. A grep for 'phasing' across muju/docs/*.md found only rules, tooling and clock notes.)
- [verified-in-code-or-results] The napkin holds no Phasing-era lessons. Its last Muju rows are the E3 close on 2026-09-17. The E4 campaign, the release and the entire Phasing conversion are unrecorded there. (/Users/ethancd/src/deevgames/.claude/napkin.md:736-793. Its only hit for 'phasing' is line 750, about a merge guard. The napkin last appears in commit 2922375.)
- [verified-in-code-or-results] Owner statements lean pragmatic. 'I want to make zero decisions, use your engineering and design judgment to make reasonable choices' (2026-09-16). A directive to bring the Hard epic 'to a successful end point within eight hours' (2026-09-18), which shipped on two 32-pair rows, the second run in 55 minutes (R2). 'Pull the trigger on the map and plant changes!'. The owner changed the draw clock for the game's sake even though it voided all evidence. The napkin records 'Ambitious over incremental' and that the owner is token-constrained. (/Users/ethancd/src/deevgames/muju/docs/hard-ai/e0/AMENDMENTS-DECIDED.md:7-9; /Users/ethancd/src/deevgames/muju/docs/hard-ai/RELEASE-2026-09-18.md:3-7,34; /Users/ethancd/src/deevgames/muju/JUDGMENT_LOG.md:301,311-313,359-361; /Users/ethancd/src/deevgames/.claude/napkin.md:17-19)
- [verified-in-code-or-results] Documentation has grown well past the postmortem's own lesson 7 cap. Markdown under docs/hard-ai is now 3.29 MB, against 887 KB at the postmortem. The Phasing subset is 252 KB in two days. M5-FLOOR-PREREGISTRATION-v2.md alone is 56 KB, against the postmortem's line that a binding design over 40 KB is a novel, not a contract. (find docs/hard-ai -name '*.md' | xargs cat | wc -c gives 3,289,466; ls -la of docs/hard-ai/phasing; /Users/ethancd/src/deevgames/muju/docs/hard-ai/POSTMORTEM-2026-09-15.md:100-114,160-162)

## Report
# Process and lessons: where the effort went, and what a pragmatic path looks like

I did not change any tracked file. I read code and docs and wrote scratch analysis to the session scratchpad.

## (a) Where effort went

The command was `git log --since=2026-09-16 -- muju`. It returns 89 commits: 78 non-merge and 11 merges. I classified each non-merge commit by intent and counted lines from numstat. Data files (jsonl, json, gz, Academy text) are separated from hand-written code, tests and markdown. Working files are `breakdown.txt` and `classify.py` under `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/`. The class assignments are my judgment and unreviewed.

**The Phasing conversion window runs from 71a2c51 (09-18 20:34) to a02bbb7 (09-19 16:42), about 20 hours and 62 non-merge commits. There have been no Muju commits since.**

| Class | Commits | Hand-written lines | Raw lines incl. data | Notes |
|---|---:|---:|---:|---|
| A1: port so an engine can play Phasing at all | 3 | 10,845 | 238,806 | 9c1805c (V2 port), 5d31740 (M4 macro search), e701ccc (M6 eval) |
| A2: make an engine play better than its port | 2 | 872 | 872 | 96eabc6 (331 lines in gen/search), dd88c6b (13 source lines) |
| B: rules-replica correctness | 6 | 15,441 | 40,778 | 142f090, 70ba9dc, 879fe20, ecf37da, 32f83b8, 6852caf |
| C: measurement apparatus, preregistration, amendments, evidence packaging | 36 | 24,015 | 4,804,606 | 10.9k lab code, 7.4k tests, 5.4k docs |
| D: product wiring and UI | 9 | 6,468 | 6,895 | preview opt-in, paces, engine seat, shortcuts |
| E: other (rules change, DAG tooling, Academy, archival) | 6 | 5,153 | 347,927 | 1a989d3 (20-ply clock), 71a2c51, 25e94bc and others |

- Class C is 58% of commits and 38% of hand-written lines. Class A2 is 3% of commits and 1.4% of lines.
- About 5.3k of the 62.8k hand-written lines touched `src/ai/hard/{eval,search,gen,tactics,tables}`. Only 331 of those lines aimed at stronger play.
- e701ccc sits in A1, but its net effect was to zero 57 of the 62 evaluation weights. It could as fairly be classed as accounting correctness.

**Before the Phasing window (16 non-merge commits):**
- 43b87b6 is the Standard Hard ship, a squash of campaigns E0-E4. It carries 130,683 hand-written lines: 14.4k strength source, 39k lab code, 45k docs.
- 6 commits are class C (release records and test gating).
- 7 are class D (phone UI, sound effects, rooms, MCP Phasing analysis).
- 2 are class E (Metal v2.9).

## Where the conversion left off

- **Gate 1 (baseline sanity) has never produced an eligible row.** Amendment A5, per-search calibration, is written but no adapter implements it; `workPerSearch` has zero grep hits.
- **Gate 0 item 7, the suite floors, fails under the v2 suites.** Invariants 8/15 against a floor of 14, economy 19/20 against 20, disruption 12/14 against 13 (commit 00dfc8f).
- **Gate 2 (Hard vs aiv2-hard) has never run.** Neither has Gate 3 (responsiveness).
- **Full M6 (corpus, then fit, then validation) has five blockers and none has been started** (`/Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/M6-STATUS.md:170-180`).
- **No committed Phasing manifest has the packed Hard engine (`hard@`) as a player.** The only play evidence is three owner anecdotes from the preview.

## (b) Strategic knowledge in prose that the evaluator does not use

**The knowledge is mostly encoded as features but weighted zero.**
- `features.ts` computes all twenty section-7 invariants (`STRATEGIC_UNDERSTANDING.md` §7), plus Hanging, Exposure, SpawnArea, AnchorDepth, HomeThreat, DrawPressure, ArrivalThreat and DisruptPressure.
- `/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28` sets only Material, BankLiquid, BankExcess, EconDelta and PendingValue.
- M6 zeroed the rest on purpose, to avoid importing old non-accounting coefficients without derivation (`M6-BOOTSTRAP-CONTRACT.md:102`).
- The Standard engine that shipped at +237 Elo used a hand-set vector, `default-v1`, with no Texel fit.

**There is no Phasing strategy prose.** The strategy guide and STRATEGIC_UNDERSTANDING §6-9 assume summon-and-strike, where fresh purchases act immediately. M6 itself flags Inv5 and Inv17 as carrying stale immediate-placement semantics, and Inv7, Inv14 and Inv19 as resting on wrong rent, threshold and bank premises.

What strong players and the owner do under Phasing, from the rules doc, the owner reports and six recorded games in `/Users/ethancd/src/deevgames/muju/docs/online-matches/2026-09-17-phasing-review/`:

1. **Centre-first opening with one paired summon.**
   - As White, Codex opened all five of its games with the Hi running 8 squares to the centre (B1→F5, E6 or E4) plus a single summon: Muju@F4, Göl@E5, or Muju@A2 in the Claude game.
   - The owner opened its one White game the same way. On turn 2 the Hi goes on toward the H2-I3 pocket, with a Muju summoned there.
   - The engine's Black instead shuffled h10-i10-h10-j10 back into its corner (report 1). I infer that a no-move mining forecast prefers the 7-reserve home square, and that SpawnArea, AnchorDepth and Inv13Turtle being zero leaves nothing to reward space.
2. **Disruption is worth a tempo, not material.** A blocked summon refunds its full cost. The engine spent a piece and a promotion to deny a 3-crystal summon (report 2).
3. **No instant reinforcement.** Lone raiders are weaker than under Standard. Support has to be committed a turn ahead (report 3).
4. **Threats are fully visible.** Safety comes from on-board units plus public pending arrivals, and arrivals act immediately. The old spawn-strike liquidity floor (Inv14) no longer applies. ArrivalThreat is the right feature and it has weight 0.
5. **Rectangles matter twice.** They decide where a summon can be placed, and they must stay unblocked until the summon arrives. Anchor fragility costs tempo.
6. **Promotion in Prepare gives immediate defence** for the opponent's turn. The recorded games show 8-15 promotions each, including a turn-1 Sjor→Straumr.
7. **Conversion.** Only kills reset the 20-ply clock. The scripted Expand mirror still draws 55% of its games. An engine that leads on economy and has DrawPressure and Inv16 at zero has no reason to force kills.
8. **Purchase mix** across the five human games: Plant 38, Shadow 20, Fire 16, Lightning 10, Water 9, Metal 0.

One caveat from E3. Under Standard, removing the 19 safety weights gained Elo: +163 on the screen row and +124 on confirmation against the champion. Against aiv2-hard the no-safety arm scored +397, where the champion scored +215 (`E3-PLAN.md:119-121`). That arm did not ship only because it carried a spawn-strike suite veto, and the Phasing preregistration retires that suite. So the en-prise blunders may be a search-depth problem, not a missing static term. Replaying the three report positions while logging depth and PV would settle it in about 10 minutes.

## (c) What the owner has said about pragmatism and rigor

- "I want to make zero decisions, use your engineering and design judgment to make reasonable choices" (`e0/AMENDMENTS-DECIDED.md:7-9`).
- The 2026-09-18 directive was to bring the epic "to a successful end point within eight hours". It shipped on two 32-pair rows; the second, R2, ran in 55 minutes (`RELEASE-2026-09-18.md:3-7,34`).
- "Pull the trigger on the map and plant changes!" (`JUDGMENT_LOG.md:301`).
- J-021: the owner changed the draw clock "for the game's sake", accepting that every measurement became void.
- Napkin: "Ambitious over incremental". The owner is token-constrained, and the main loop is meant to be specs and review (`.claude/napkin.md:17-19`).
- The owner asked for an opening book and the apparatus refused it (`PREVIEW-REPORTS-2026-09-19.md:74-79`).
- The present request itself asks for the "efficient/pragmatic path".

My reading is that the owner wants visibly good play and decisive shipping. The rigor came from the agents, not from the owner.

## (d) Process traps this project keeps falling into

1. **The goal drops out of the feedback loop.** Postmortem finding 1 was that the engine never played the opponent it was meant to replace. It has recurred: Gate 2 sits behind Gate 1, which sits behind bands, which sit behind a scripted reference, and there are zero Hard games under Phasing.
2. **Gates get amended.** M12-M14 rewrote their own pass criteria (postmortem finding 2). The Phasing preregistration took amendments A1-A5 within 17 hours of adoption, before any eligible row. Each amendment was defensible; together they produced nothing.
3. **Contaminated or invalid runs.**
   - A2 voided 130 games because engine pruning had been placed in the shared legal generator.
   - The 1,024-game replacement had effective n = 1, because deterministic engines played without openings.
   - That lesson was already in the napkin at line 738. The Gate 1 runner was a second instrument under `lab/ai/` and did not inherit the hard-ai ladder's refusal.
4. **Instrument building outruns strength work.** The window holds 36 class C commits against 2 class A2 commits.
   - The v1 suites scored a game-winning move as wrong in all nine disruption misses.
   - They scored static eval against invariant and geometry weights fixed at zero, which forced a gap of exactly 0 on thirteen geometry-only pairs.
   - The v2 suites then added 778k lines of fixtures, and their contract was dated two hours in the future, so the first measurement attempt was refused (1864090).
5. **Engines playing with zero weights.** This happened in E0, recurred in E2 and recurred again in E3 (napkin 737, 766, 775). Under Phasing it is policy: 57 of 62 weights are zero.
6. **Rules changes void evidence.** Metal v2.9 (09-18) and the 20-ply clock (09-19) each reset identity hashes. A sealed and preregistered apparatus does not fit a game that is still being designed.
7. **Documentation mass.** Markdown under `docs/hard-ai` went from 887 KB at the postmortem to 3.29 MB. One floor preregistration is 56 KB. The postmortem's own lesson 7 asked for a 40 KB cap.
8. **The machine.** Calibrations are accepted as "provisional" at load 4.5. R1 ran at load 260. Wall-clock tests fail under load.
9. **Agent handoffs mid-gate.** A3 begins "Written by Claude after Codex's quota ended". Voided evidence sits under `/Users/ashkie/...` on another machine. The napkin has no Phasing-era rows at all.

## (e) Lightweight measurement sufficient to ship

The precedent is R2: 32 seat-mirrored pairs, 55 minutes on 6 shards, read as +237 Elo [+141, +385]. A proposed rule, written as one page:

- **Match.** New Hard vs current Hard (the aiv2-hard Phasing port, or the previous Hard commit). Use the 48 dev openings (`lab/hard-ai/ladder/openings/p1-dev.jsonl`), both seats, at h0, for 96 games. Run it with wall-clock at the shipped allowance on a quiet machine. It should take about 1.5-2 hours.
- **Veto.** Zero illegal actions, replica divergences or engine fallbacks. Distinct games must be at least 90% of games played.
- **Ship if** the score is at least 0.60.
  - About 58 of 96 points gives a one-sided p of roughly 0.03, treating draws as half a point.
  - Between 0.50 and 0.60, ship only if the owner prefers its play.
  - Below 0.50, do not ship.
- **Owner check.**
  - The three preview positions, and any the owner adds later, serve as a regression smoke test: the new engine must not repeat the flagged move.
  - The owner plays 3-5 games.
- **No sealed sets, SPRT or identity ledgers.** Reuse the dev openings freely. When a rules change lands, rerun the same 2-hour match instead of voiding a corpus.
- **Iteration loop between ship decisions.** Run 16-pair A/B rows of a candidate against the champion, about 30 minutes each. This is the loop that produced real gains in E1-E3 (action-width +95, no-safety +163).