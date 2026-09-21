HEADLINE: The Phasing Hard engine has a working search wrapped around an evaluation with 5 of 62 weights non-zero (material, cash, a pass-only economy forecast and pending value), hand-set and never tuned. In my fixed-work probes every root candidate often scored identically, so move choice fell to ordering tie-breaks, and the engine hoards nearly all its income. The cheapest real strength is in the evaluation vector and the within-turn scorer, not in search depth, a book or df-pn. The Texel tool that exists has never been run on Phasing data and currently pins cash at full value, so as configured it could not learn the fix for hoarding.

## Remaining work
- S - Add a hand-prior candidate vector as a hard@ablate weights arm (tactical/geometric terms and invariants non-zero, accounting terms untouched, Rent/PstMine/HangingBuy left at 0 to avoid double counting with the forecast). Blocked by: a decision that non-zero priors are allowed before the corpus->fit->validation sequence M6 prescribes.
- S - Decide the cash price: either discount BankExcess in the default vector or remove indices 2/3 from texel.ts ACCOUNTING_PINS so a fit can learn it. Blocked by: the M6 bootstrap contract, which pins them deliberately.
- S - Make the within-turn scorer Phasing-aware: credit pending principal (p.pendCostSum is already incremental) so purchases are not ranked at minus full cost in the Act beam, the K cut and the within/16 ordering term. Moves fixed-work output, so determinism pins and the champion hash need re-pinning.
- M - Cut generation cost: avoid a full level-2 table rebuild (including the 6-closure pass-only forecast) for every Act endpoint x keep-set in expand; remove per-step Array.from allocations in phasing-economy.ts:198-201; consider turning searchFix.reachCache on (measured 1.03-1.21x in the Standard era, output-identical). Blocked by nothing technical; needs the cross-commit identity check re-run.
- S - Measure LMR/futility/aspiration/extensions as arms once the evaluation discriminates; they are built and off. Blocked by item 1 (with a flat eval, pruning on eval margins is meaningless).
- M - Opponent/opening diversity for any self-play corpus or A/B: identical-weight self-play yields at most 96 distinct trajectories (48 dev openings x 2 handicaps) per M6-STATUS blocker 2; my own scratch runs collapsed 14 rows to 8 games. Needs a diversity-producing opener before Texel is worth running.
- M - Self-play corpus generator + first real Texel run on Phasing data, then validation row. Blocked by the diversity item and by the five M6 blockers (allocation, parameter domain, validation criteria).
- L - df-pn home force body (currently a stub) and an opening-book builder. Low priority for strength per cost; the owner's request for a White opening book needs a preregistration amendment per PREVIEW-REPORTS.
- S - Fix or remove the dangling package.json scripts hard:spsa and hard:book.

## Open questions
- Is the owner willing to ship hand-set non-zero priors under Phasing before a fit exists? The M6 contract zeroed them on principle; the code cost of restoring them is small, the process cost is a dated amendment.
- Do all the old feature definitions still mean what their old weights assumed under Phasing? Known exceptions: Inv5 and Inv17 are structural zeros, Infiltration is identically zero without evalFix.infiltrationPerAnchor, Rent is already inside the EconDelta forecast, HangingBuy now carries arrival-threat. I did not audit the rest feature by feature.
- Why did the bank-discount-only variant still finish games with 96-172 crystals banked while winning? Discounting cash did not by itself stop hoarding, so the purchase-ranking penalty in the within-turn scorer may be the larger cause. I did not isolate this.
- What throughput does the owner's actual play machine reach? I measured 90-185 units/ms on this box via tsx under Node 26; the rung chosen at the 10 s quick allowance (and therefore depth) depends on it, and the DESKTOP profile's 600 units/ms assumption looks optimistic.
- I did not verify how the browser routes Hard under Phasing (hardEnabled is true; commit 425efa4 describes an opt-in Phasing preview); that belongs to another reader's domain. Note createInitialGameState still defaults ruleset to 'standard' (src/game/board.ts:204).

## Findings
- [verified-in-code-or-results] DEFAULT_WEIGHTS under Phasing is a hand-derived 'accounting bootstrap' with exactly five non-zero entries (Material 100 informational, BankLiquid 100, BankExcess 100, EconDelta 100, PendingValue 1); the file itself says 'This hand-derived source is not tuned strength evidence'. (muju/src/ai/hard/eval/weights.ts:1-6, 20-28, 44; introduced by commit e701ccc (2026-09-19))
- [verified-in-code-or-results] weights.generated.ts is NOT tuner output: TUNED_WEIGHTS is a clone of DEFAULT_WEIGHTS labelled 'tuned-v0-identical-to-default'. No tuner has ever written it, under Standard or Phasing. (muju/src/ai/hard/eval/weights.generated.ts:13-17; git log shows only 43b87b6 and e701ccc touching it)
- [verified-in-code-or-results] The pre-Phasing vector that shipped as Hard on 09-17/18 was also hand-set (DESIGN §5.12.1/§5.13 columns, label 'default-v1'), with ~50 non-zero terms including Rent -422, BankLiquid 90, BankExcess 25, Hanging -50, HomeThreat -400 and the twenty invariant penalties. The Phasing port zeroed all of those by contract, not because the features are missing. (git show 43b87b6:muju/src/ai/hard/eval/weights.ts; muju/docs/hard-ai/phasing/M6-STATUS.md:24)
- [verified-in-code-or-results] In my fixed-work probes the root was frequently fully tied: initial position at work 100k (depth 2) and 400k (depth 3) had 25/25 candidates with one distinct score; a self-played midgame at 400k had 27/27 tied and at 3.2M (depth 5) 24/27 tied with the best. The move played is then decided by ordering (ORDER_TT re-serving the previous iteration's pick, forced/SPAWN_DENY bonuses). The chosen first move walked the Fire into its own corner, matching owner preview report #1. (scratch probe output (scratchpad/probe.ts, not in repo); tie mechanism documented at muju/src/ai/hard/config.ts:233-252 and search/order.ts:31-39; owner report at muju/docs/hard-ai/phasing/PREVIEW-REPORTS-2026-09-19.md:14-33)
- [verified-in-code-or-results] The bootstrap engine hoards: across my scratch self-play games it ended with banks of 54-118 crystals having gained only 58-127 in total, once being eliminated with 118 in the bank and 0 units. (scratchpad/match-out.jsonl and match-bank-out.jsonl rows (bankA/gainedA columns); cash and material are both priced at 100 cc per crystal, weights.ts:22-26)
- [verified-in-code-or-results] The within-turn scorer that ranks Act lines and decides which candidates survive the K cut is stage0+stage1 only. Under the bootstrap vector that equals material + 100 x bank, so a BUY (which adds no material until arrival) scores as minus its full cost in the beam and in ordering, while PendingValue (stage 2) is invisible there. (muju/src/ai/hard/engine.ts:355-360; gen/generate.ts:879, 892-928; core/state.ts:465-472 (BUY only adds a pending commitment); probe output showed purchase candidates at ordering score 18 vs 37 for bare turns)
- [verified-in-code-or-results] Every leaf computes all three eval stages unconditionally; the lazy bound is replaced by +Infinity. Stage 1 is also computed inside generation for every Act endpoint although all stage-1 weights are zero: stage1 was 32.8% of inclusive CPU time in my profile. (muju/src/ai/hard/eval/evaluate.ts:159-181; eval/features.ts:585-589; scratch CPU profile (node --cpu-prof, one midgame position, depth 3))
- [verified-in-code-or-results] Turn generation, not search or leaf evaluation, is the perf bottleneck under Phasing: generateAt 81% inclusive, buildTables 79%, expand (per-Act-endpoint level-2 table rebuild + Prepare planning) 69%, phasingEconomy 19.3%, leaf evaluate 7.9%. This matches the Standard-era E4.1 finding that tables are 71-76% of wall time. (scratch CPU profile; muju/docs/hard-ai/e4/E4.1-PROFILE.md:50-64; gen/generate.ts:500-520)
- [verified-in-code-or-results] Measured throughput on this checkout's machine: 90-185 work units/ms and roughly 650-2,100 macro+quiescence nodes/s; completed depth 2 at 100k work, 3 at 400k, 3-5 at 3.2M. The DESKTOP profile assumes 600 units/ms and engines start at 200. Committed Standard-era numbers on an M2 Max are 1,108-1,484 nodes/s with 2.00 / 3.00 completed iterations at 100k / 400k. (scratch probe; muju/src/ai/hard/config.ts:573-587; muju/docs/hard-ai/e4/E4.3-REACH-CACHE.md:194-201)
- [verified-in-code-or-results] All search refinements are built but OFF on every profile: useLmr, useAspiration, useFutility, useExtensions, useDfpn are false; evalFix and searchFix blocks (including reachCache, iterFit, tieBreak) are absent from every profile. (muju/src/ai/hard/config.ts:596-608, 384, 488-494)
- [verified-in-code-or-results] df-pn home force is a stub that returns UNKNOWN with zero nodes. The home-defence prover (tactics/prover.ts) is real, Act-only under Phasing, and is what adjudicates corner entries in make and supplies the rescue witness; the root must-answer scan handles mate-in-1. (muju/src/ai/hard/tactics/dfpn.ts:1-11, 78-94; tactics/prover.ts header; search/root.ts:195-243)
- [verified-in-code-or-results] Opening book: the BK03 container and probe exist, EMPTY_BOOK is the default, nothing outside engine.ts calls setBook, and there is no builder: package.json's hard:book points at lab/hard-ai/book/build.ts, which does not exist. (muju/src/ai/hard/book/format.ts:1-6; grep for setBook; muju/package.json:65; ls lab/hard-ai/book -> No such file or directory)
- [verified-in-code-or-results] Tuning tooling is a Texel coordinate-descent fitter plus a corpus builder that reads EXISTING ladder replays; there is no self-play corpus generator and no SPSA (package.json's hard:spsa points at lab/hard-ai/tune/spsa.ts, which does not exist). It has never been run on Phasing data. (ls muju/lab/hard-ai/tune -> corpus.ts rows.ts texel.ts; lab/hard-ai/tune/corpus.ts:6-11; muju/package.json:62-64; M6-STATUS.md:66 ('No real opening pool, game corpus, fitted engine vector ... was read/generated'))
- [verified-in-code-or-results] The Texel fitter pins BankLiquid=100, BankExcess=100 and PendingValue=1 as 'accounting pins'. As configured it cannot learn that banked cash is worth less than bodies, which is the term the old hand vector used (BankExcess 25) against hoarding. (muju/lab/hard-ai/tune/texel.ts:39, 81-89)
- [verified-in-code-or-results] A candidate weight vector CAN already reach a ladder seat in code: the ablation arm registry has a 'weights' factor and arms resolve through hard@ablate:<arm>. What is missing (M6-STATUS blocker 3) is binding weights from a file/hash, not the ability to play a different vector. (muju/lab/hard-ai/ablate/arms.ts:57-80; commit 40260ce; M6-STATUS.md:176)
- [verified-in-code-or-results] Two scratch A/B comparisons against the bootstrap, both reported here and neither picked from a larger set: (1) bootstrap + the old hand priors for non-accounting tactical/geometric terms won every game; (2) bootstrap with only BankLiquid 90 / BankExcess 25 won every game. Because the engine is deterministic and the handicap crystals went unspent, the 14 rows collapse to 8 distinct games (4 + 4). All at fixed work 50k (mean completed depth 1.2-1.7, well below the shipped rung), one opening. Direction only; not a strength measurement, and the two variants were never played against each other. (scratchpad/match-out.jsonl (identical Black-seat rows at h0-h3; identical White rows at h2/h3) and match-bank-out.jsonl (h1 rows identical to h2))
- [doc-claim-only] The v2 Phasing suite measurement of this engine passed tactics (61/63), home-mate (28/28) and home-fortify (6/6) and missed invariants (8/15, floor 14), economy (19/20, floor 20) and summon-disruption (12/14, floor 13); five invariant misses are a searched preference gap of exactly 0. (commit 00dfc8f message and muju/lab/hard-ai/suites/phasing/results/v2-measure-2-2026-09-19/)

## Report
# Hard engine as built under Phasing: code-level state and cheapest strength

Scope: `muju/src/ai/hard/**` on master (a02bbb7), `muju/lab/hard-ai/{tune,bench,ladder,ablate,exam,analyze,recall}`, ENGINE_GAPS §3, DEVIATIONS, M6-STATUS. Read-only. I also ran scratch probes from the session scratchpad (tsx installed there, since the checkout has no node_modules); nothing in the repo was touched. Where I cite my own measurements they come from one machine of unknown spec under Node 26.5.1, not the M2 Max the docs used.

## (a) Architecture as built

**Macro-turn.** A `Turn` is the mover's whole turn in Phasing order: Act (up to 4 actions + END_ACTION), then at most one PAY_UPKEEP carrying its own keep mask, then Prepare (up to 4 BUYs, up to 2 PROMOTEs, END_PLACE). Longest generated turn is 13 actions in a 24-slot buffer (`types.ts:74-93`, `gen/turn.ts:1-14`). Negamax flips sign once per turn boundary (`search/pvs.ts:2-17`); only full Act boundaries are TT-eligible (`pvs.ts:356-358`).

**Phasing in the generator.** `ActionSearch` runs a width-limited DFS over Act lines with footprint-independence pruning and a within-turn TT. Each retained Act endpoint then goes through `completePrepare`: keep-sets (all at the root, 4 at interior nodes), and for each, `expand` rebuilds level-2 tables and plans purchases, promotions, FORTIFY pairs and up to 2 home-race buys (`gen/generate.ts:500-575, 840-863`). A BUY is a pending commitment: it adds no material until it arrives (`core/state.ts:465-472`). Forced injections (kills, home entries, rescue witness, retreat, denial, disrupt) sit ahead of the beam and cannot be displaced. HOME_RACE was demoted to an ordinary purchase in 96eabc6.

**Shape.** K=24 root, 16 interior, action widths [6,4,3,2], 16/8 place plans, quiescence K=8 and 4 plies, maxDepth 12 (`config.ts:573-576, 591-608`). Every refinement is off: LMR, aspiration, futility, extensions, df-pn. `evalFix` and `searchFix` are absent from every profile.

**Depth.** My probes: depth 2 at 100k work, 3 at 400k, 3 to 5 at 3.2M. The Standard-era committed numbers are the same shape: 2.00 and 3.00 completed iterations at 100k and 400k (`e4/E4.3-REACH-CACHE.md:194-201`).

**Quiescence.** Tactical turns only (KILL, CLEAVE_CHAIN, HOME_ENTRY, HOME_RESCUE, HOME_FORTIFY), gated by `hasTacticalPotential`, stand-pat, delta margin 300 cc, and an enforced cap of 34% of the rung (`search/quiesce.ts`). In one probe the cap was hit exactly.

## (b) Evaluation and where the weights came from

62 features in three stages: 5 incremental (material, rent, cash, home invaded), 18 level-1 geometric/home terms, 39 level-2 terms (economy, hanging/approach/kill tables, 20 invariants, and four Phasing additions: PendingValue, ArrivalThreat, DisruptPressure, RentShortfall).

**The weights are hand-set and almost all zero.** `DEFAULT_WEIGHTS` is labelled `phasing-accounting-bootstrap-v1`: Material 100 (informational), BankLiquid 100, BankExcess 100, EconDelta 100, PendingValue 1, and 57 zeros. The header says it "is not tuned strength evidence" (`eval/weights.ts:1-6, 20-28`). `weights.generated.ts` is a clone of that default labelled `tuned-v0-identical-to-default`; no tuner has ever written it. The vector that shipped under Standard was also hand-set (DESIGN's column, about 50 non-zero terms); the Phasing port zeroed them by contract (`M6-STATUS.md:24`), not because the features are missing. They are all still computed.

Consequences I could observe directly:

- **Flat roots.** At the initial position all 25 root candidates scored identically at depth 2 and depth 3. In a self-played midgame, 27 of 27 tied at 400k and 24 of 27 tied with the best at 3.2M (depth 5). With a tie, the root keeps the first candidate, and ordering puts the previous iteration's pick first, so the move is an artefact of ordering. The engine's first move walked its Fire into its own corner, which is owner preview report #1.
- **Hoarding.** Cash and bodies are priced identically, so buying is value-neutral at the leaf. In scratch self-play the bootstrap side finished games holding 54 to 118 crystals of 58 to 127 gained, once eliminated with 118 banked.
- **Purchases are penalised before the search sees them.** The within-turn scorer is stage0+stage1 (`engine.ts:355-360`); under this vector that is material + 100 x bank, and PendingValue lives in stage 2. A turn that buys ranks at minus its full cost in the Act beam, the K cut and the ordering term.
- **No lazy exit.** Every leaf computes all stages (`evaluate.ts:159-181`).

This agrees with the repo's own reading: M6-STATUS says the missed floors are because "the evaluation carries no term that prices either signal", and the v2 suite commit says five invariant misses are a searched gap of exactly 0.

## (c) Tuning tooling

`lab/hard-ai/tune/` holds `corpus.ts`, `rows.ts`, `texel.ts`: a guarded Texel coordinate descent with a held-out split by opening, and a corpus builder that reads existing ladder replays. There is no self-play generator and no SPSA: `hard:spsa` in package.json points at a file that does not exist. It has been exercised only on synthetic test data; M6-STATUS states no real corpus or fitted vector exists.

One design point matters for strength: `texel.ts:81-89` pins BankLiquid and BankExcess at 100. A fit under that contract cannot learn a discount on banked cash.

A candidate vector can already be played in the ladder through the ablation registry's `weights` factor (`ablate/arms.ts:57-80`). What is missing is file/hash binding, not the capability.

## (d) Book, (e) df-pn

Book: container and probe exist, `EMPTY_BOOK` is the default, nothing calls `setBook`, and `hard:book` points at a directory that does not exist. df-pn: a stub returning UNKNOWN (`tactics/dfpn.ts:78-94`). The home prover is real and Act-only under Phasing; mate-in-1 is handled by the root must-answer scan.

## (f) Throughput and bottleneck

Mine: 90 to 185 work units per ms, roughly 650 to 2,100 macro+quiescence nodes per second. The DESKTOP profile assumes 600 units/ms. Committed Standard-era figures: 1,108 to 1,484 nodes/s.

One CPU profile (midgame, depth 3): generation 81% inclusive, `buildTables` 79%, `expand` 69%, stage-1 scoring 32.8%, `phasingEconomy` 19.3%, leaf evaluation 7.9%. The search proper is a small slice. This matches E4.1's "tables are 71 to 76%". `phasing-economy.ts:198-201` allocates arrays per simulated step inside that hot path. The prover remains under-priced in the meter (40 units against hundreds of ms), a known issue from P6/P8.

## (g) Markers in src/ai/hard

- `tactics/dfpn.ts:2` stub.
- `config.ts:515` PROVISIONAL purchase weights; `config.ts:529` placeholder weights (engine substitutes the default, `engine.ts:114-119`).
- `gen/actionsearch.ts:84-96` neutral-tables stub from M11.
- No TODO or FIXME strings. The real "not yet" items are flags that are off, the clone in `weights.generated.ts`, and the two dangling npm scripts.

## (h) Five cheapest changes likely to add real strength, ranked

1. **Give the evaluation non-zero tactical and geometric terms.** Start from the old hand column for terms that do not overlap the accounting forecast (hanging, exposure, home threat/countdown/plug, spawn geometry, kill-available, cleave exposure, the invariants), leave Rent, PstMine and HangingBuy at zero, and carry it as an ablation arm. This is the dominant issue: a search cannot choose between positions its evaluation scores identically. Small code; the cost is a process decision.
2. **Stop pricing banked cash at par with bodies**, and unpin indices 2 and 3 in Texel so a fit can learn it.
3. **Make the within-turn scorer Phasing-aware**: credit pending principal at stage 0 so purchases are not cut from the beam at minus full cost. A few lines; moves fixed-work output, so pins need re-recording.
4. **Cut generation cost**: one level-2 build per Act endpoint instead of per endpoint x keep-set where safe, drop the per-step allocations in the forecast, and measure `reachCache` (output-identical, 1.03 to 1.21x in the Standard era). With generation at 81%, this is where depth comes from.
5. **Measure the refinements that are already built** (LMR, futility, aspiration, extensions) as arms, after item 1. With a flat evaluation they prune on noise.

Book and df-pn rank below all five: neither addresses why the engine plays aimlessly.

## Scratch A/B, stated plainly

I ran two comparisons against the bootstrap and report both; neither was selected from a larger set. (1) Bootstrap plus old hand priors. (2) Bootstrap with only BankLiquid 90 / BankExcess 25. Each variant won every game. But the engine is deterministic and the handicap crystals went unspent, so 14 rows collapse to 8 distinct games (4 and 4). All at 50k work per turn, mean completed depth 1.2 to 1.7, one opening, my own choice of numbers. It says the bootstrap vector is easy to beat. It does not measure how much either variant is worth, does not rank them against each other, and the bank-only variant still finished games with 96 to 172 crystals banked, so discounting cash alone did not stop hoarding.

Files: `/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts`, `.../eval/weights.generated.ts`, `.../eval/evaluate.ts`, `.../engine.ts`, `.../config.ts`, `.../gen/generate.ts`, `.../tables/phasing-economy.ts`, `/Users/ethancd/src/deevgames/muju/lab/hard-ai/tune/texel.ts`, `/Users/ethancd/src/deevgames/muju/lab/hard-ai/ablate/arms.ts`, `/Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/M6-STATUS.md`.