HEADLINE: Neither engine meets "strong moves by default" under Phasing. V2 (AIEngineV2) is clearly the better of the two, but it still loses most games to the scripted fire_1 Rush line: 7/0/25 at wall:1500, and 3/0/5 at the shipped wall:10000 in a row I ran today on a heavily loaded machine. All three of those wins were quick home-checkmates of Rush's undefended home. The evidence says Rush's dominance is an engine build-policy failure before it is a Phasing balance problem. The same V2 lost 1/0/15 to Rush under Standard. Both engines simply do not build: V2 placed 4–15 units against Rush's 40–148 at wall:10000, and new Hard buys one unit on a quarter of its turns and dies with about 62 crystals banked. The same flood script buying water_1 holds Rush to a 0.55 score, and raising fire_1 to cost 4 rescues neither AntiRush nor Balanced.

## Remaining work
- S (about 40-60 min machine time; blocked only by needing an idle machine): run an eligible-quality Rush row for V2 under muju-phasing-2: `hard:ladder --a aiv2-hard-turn --b Rush --work wall:10000 --handicaps 0,3 --pairs 48 --openings p1-dev`, with no other ladder jobs running. My 8-game row ran at load 24, and the wall:1500 rows are harness VOID for V2 overruns.
- S (about half a day): a scripted-Prepare ablation to confirm that build policy is the whole gap. Wrap each engine so that Act comes from the engine and Prepare is forced to spend everything on water_1/fire_1 at the best-yield safe squares. Re-run against Rush, Expand and Balanced for 16 pairs each. If the wrapped engine scores above 0.5 against Rush, the fix is purely a Prepare/eval fix.
- M (1-3 days): give new Hard multi-purchase Prepare plans. It buys exactly one unit on 131 of 134 buying turns and banks about 62-192 crystals per game. No strength claim about that engine means anything until it spends its income. Blocked by nothing except owner prioritisation between the two engines.
- M (1-3 days): fix V2's Prepare valuation so it prefers upkeep-free tier-1 miners and fighters over promotions while it is out-produced. Add a counter-build of water_1 against fire-heavy armies. Add a home-guard rule so its results do not depend on the opponent leaving its home empty.
- S: re-promote Rush from 'report-only' (amendment A1) to a gate for whichever engine carries the Hard label in a Phasing-only release. The bar would be score > 0.5 with an interval excluding 0 on p1-dev at the shipped allowance. Add a 'Rush-with-home-guard' scripted variant, because every engine win over Rush today is a home-checkmate of an empty home. This needs a preregistration amendment (A6) written before any row is run.
- S: add Flood-water_1 (createRushBot('water_1') already supports it) and a home-guarded Rush to the scripted reference set. That lets E-2's 'best defensive responder' be re-measured under Phasing. AntiRush as written buys about 7 units per game and is no longer a meaningful best responder.
- M (owner decision; blocked on the engine fixes above): only if a wide-building engine still loses more than 65% to Rush, which is ruling E-2's failure line, open a rules lever. The fire_1 cost-4 probe suggests cost alone is weak against under-builders. Defender-side levers specific to Phasing, such as the summon delay, summon disruptability, and tier-1 zero upkeep with passive mining, are the likelier knobs.
- S (about 2-2.5 hours of owner time; cannot be done by an agent): owner plays the literal Rush line by hand through ?phasingAi=1 against V2-hard and new Hard, 2 games per colour per engine, keeping 1-2 units at home.

## Open questions
- Does V2's roughly 35-40% score against Rush at wall:10000 (3/0/5, n=8, load 24) hold on an idle machine with 48 pairs? And does it fall to about 0 once the rusher guards its home? All 3 wins were checkmates of an empty home.
- Is wide-vs-wide Phasing play degenerate for humans too? Scripted wide-vs-wide games run about 110-135 completed turns, and 50-85% end as inactivity draws with essentially the whole 496-crystal map mined out (the two sides' gains sum to about 500). This is evidence from scripted bots only.
- Is the collapse of AntiRush under Phasing caused by the rules or by the bot? Rush went from 9W/31D/0L against a home-aware AntiRush under Standard four-action rules to 8/0/0 under Phasing. Candidate rule causes are delayed and disruptable summons and the retirement of spawn-strike. The alternative is that AntiRush's script, which buys only when pressure > 1 and makes about 7 purchases per game, is simply mis-tuned for Phasing. No experiment in the repo separates these, and the harness now refuses Standard states (runner.ts:134).
- Which engine should receive the build-policy fix first? V2 is stronger today and already buys several units in a turn. New Hard has the gates, suites and determinism infrastructure, but it cannot spend its income.
- Should the day-one bar for the Hard label be re-preregistered? The proposed bar is 'beats Rush, Expand, Balanced and a home-guarded Rush at the shipped allowance, and keeps buying', plus the owner's eye test. 'Beats aiv2-hard' is a weak bar because aiv2-hard itself fails Rush under both rulesets.

## Findings
- [verified-in-code-or-results] V2's loss to Rush is not specific to Phasing. Under Standard rules the same aiv2-hard lost 1/0/15 to Rush at wall:500 (Elo -470), with 0 illegal actions. Preregistration amendment A1 made Rush 'reported, not gated' for exactly this reason: 'the Standard release used aiv2-hard as its baseline although that engine lost to Rush'. (muju/lab/results/hard-ai-e0/calib-aiv2-rush/summary.md (A record 1/0/15, commit 43b87b6); muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:117-118,133-140)
- [verified-in-code-or-results] The Standard-era new Hard never demonstrated a win over Rush either. hard@lab-400k scored 3/16 at wall:500 (Elo -255) and 8/16 at fixed:400000. The 'Rush Elo >= 0' clause was deferred to milestone M18. No M18-rush results directory exists. The EPIC plan still lists that clause as mandatory. The Standard release doc contains no Rush, Expand or Balanced row at all. (muju/lab/results/hard-ai-verify/M14-smoke/summary.md; M14-fix-ladder-rush/summary.md; muju/docs/hard-ai/MILESTONES.md:295,351; muju/docs/hard-ai/EPIC-PLAN-2026-09-16.md:399; `ls lab/results/hard-ai-verify | grep -i M18` returns nothing; grep for rush/Expand/Balanced in RELEASE-2026-09-18.md returns nothing)
- [verified-in-code-or-results] At the shipped wall:10000 allowance on p1-dev, V2 still loses to Rush. I ran aiv2-hard-turn vs Rush for 4 pairs / 8 games: 3/0/5, Elo -89 [-284, +61]. There were 0 illegal actions, 8 distinct games and no harness VOID line, but the machine load average was 24 on 8 cores. All 3 V2 wins were home-checkmates, in 4, 18 and 21 completed turns. All 5 losses were elimination or upkeep-elimination, in 29-52 turns. (scratchpad/gapfill-rush/w10000-aiv2hardturn-vs-Rush/summary.md and games.jsonl (run 2026-09-20 19:07-19:14, seed 51, 7m00s wall))
- [verified-in-code-or-results] V2 loses to Rush through its economy and build, not its tactics. In the wall:10000 games V2 killed 11-32 units and lost 4-16 in the games it lost. It placed only 4-15 units, with 4-9 promotions, against Rush's 50-148 units placed. V2 gained 65-135 crystals against Rush's 129-377. At wall:1500 over 32 games, V2's income stays about 7-8 per turn through turn 8 and then collapses to 1.5 by turn 20. Rush's income roughly doubles to about 14 by turn 8. (scratchpad/gapfill-rush/w10000-aiv2hardturn-vs-Rush/games.jsonl; scratchpad/ladder/w1500-aiv2hard-vs-Rush/games.jsonl (another reader's row: 7/0/25, harness VOID for a 13.85% V2 overrun rate); muju/lab/ai/results/gate1-p2-pilot-2026-09-19/games-shard-1-of-1.jsonl (1/0/3, with the same pattern))
- [verified-in-code-or-results] New Hard (hard@desktop) has a separate and worse defect: it hoards. Against Rush over 32 games it gained 82.3 crystals per game, spent 19.4, and ended with a mean of 62.4 banked while being eliminated. It bought on 134 of 547 own turns, and bought exactly one unit on 131 of those 134. It hoards against every opponent: 191.8 crystals banked at game end against Expand and 87.8 against Balanced. Its purchases are almost entirely fire_1. (scratchpad/ladder/w1500-desktop-vs-Rush/games.jsonl (1/0/31), w1500-desktop-vs-Expand/games.jsonl, w1500-desktop-vs-Balanced/games.jsonl; per-turn purchase distribution computed from the `purchases[].turn` field)
- [verified-in-code-or-results] Rush is not unanswerable. Under muju-phasing-2 the same one-unit flood script buying water_1 holds Rush to 1W/41D/6L over 48 games, a Rush score of about 0.55. Flood-shadow_1 goes 15/16/17 and Tier1Spam 14/23/11 against Rush. Flood-metal_1 and Flood-plant_1 lose 0/0/48. Flood-water_1 also beats Tier1Spam 42/6/0 and Balanced 41/7/0. The scripted metagame is 'go wide or lose', not 'fire_1 or lose'. (scratchpad/gapfill-rush/flood-vs-rush.jsonl and flood-context.jsonl (scratch experiment; createRushBot(unit) from muju/lab/harness/bots/archetypes.ts:52-88; 12 seeds x 2 seats x h0/h3))
- [verified-in-code-or-results] Raising fire_1 to cost 4 (an in-memory override, paired seeds, 32 games per pairing) does not rescue opponents that under-build. Rush vs AntiRush goes from 31/1/0 to 30/2/0. Rush vs Balanced stays 32/0/0. Only matchups that were already close move: Rush vs Mono-water goes from 24/5/3 to 12/9/11, and Rush vs Tier1Spam from 7/17/8 to 1/18/13. (scratchpad/gapfill-rush/cost3.jsonl vs cost4.jsonl (flood-cost.mts; the override was asserted through getUnitDefinition; no repo file was changed))
- [verified-in-code-or-results] The committed p2 scripted reference shows wide tier-1 play dominating, not fire_1 alone. Tier1Spam scores 97/13/2 (0.924), Rush 97/6/9 (0.893) and MiningDenial 76/13/23. Every other bot buys 3.6-15.6 units per game against Rush's 92.85 and Tier1Spam's 84.09. Head to head, Rush vs Tier1Spam is 1/4/3 over 8 games. Rush vs AntiRush is 8/0/0. (muju/lab/harness/results/p2-scripted-2026-09-19/games.jsonl (aggregated), summary.csv Rush rows, REPORT.md per-bot purchases table)
- [verified-in-code-or-results] By the owner's own ruling E-2, the current responders fail the rush band under Phasing. The band for Rush against the best defensive responder is a 35-55% win rate, and above 65% counts as a balance failure. Rush wins 100% against AntiRush, about 78% against V2 at wall:1500 and about 97% against new Hard. Under Standard in June the numbers were 14.2% against AntiRush and 6.7% against AIv2-hard-fast; the latter row was later found to contain illegal emissions. Under Standard with four actions on 2026-09-12, Rush vs a home-aware AntiRush was 9W/31D/0L. (muju/JUDGMENT_LOG.md:13-16; muju/lab/docs/EXPERIMENTS.md:130-141; muju/lab/results/four-actions-2026-09-12/summary.json cell 1; PHASING-PREREGISTRATION-2026-09-18.md:135 (the 18 illegal emissions))
- [doc-claim-only] Phasing removed the defender's instant answer to a rush. Summons are public, arrive at the next own turn, and are refunded if the square is occupied or the supporting rectangle is blocked. The Standard strategy guide's anti-raid tool was 'spawn-strike': new units act at once. The Phasing preregistration retires the spawn-strike suite. (muju/docs/PHASING-2026-09-16.md:13-17,34-41; muju/docs/STRATEGY_GUIDE-2026-09-12.md:44; muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:50-53)
- [verified-in-code-or-results] The catalogue rewards wide play over tall play in both rulesets. Tier-1 upkeep is 0. fire_1 costs 3 and mines 1, water_1 costs 4 and mines 2, and plant_1 and metal_1 cost 5 and mine 3. Every promotion adds 1-2 upkeep per turn, and a fire promotion adds no mining. Both engines promote or hoard instead of adding upkeep-free miner-fighters. (muju/src/game/units.ts:8-18 and the unit table; muju/src/game/upkeep.ts:5 (UPKEEP_BY_TIER {1:0,2:1,3:2,4:3}); muju/docs/BALANCE-2026-09-11.md:5-9)
- [verified-in-code-or-results] The critic's premise that 'V2 beat Balanced and Expand in the void A2 row' is only partly right. At h0 the A2 Expand row was 0W/128D/0L, all inactivity draws, and amendment A3 classes it as a genuine failure. A2 also ran at fixed:6000, which A3 estimates at about 3-15% of the shipped work, with no opening book, so the effective sample size was tiny. A2's Rush rows were 7/1/120 at h0 and 15/2/111 at h3, with V2 making 6.4-6.8 purchases per game. (muju/docs/changes/m4-search-2026-09-19/baseline-a2/summary.json rows; PHASING-PREREGISTRATION-2026-09-18.md:206-214)
- [verified-in-code-or-results] No independent-openings sample shows V2-hard separated from V2-medium under Phasing. The wall:1500 row is 26/0/22, Elo +29 [-70, +133], and is harness VOID because both arms overran by about 19-20%. The pilots are 2/0/2 under phasing-2 and 2/0/2 and 3/0/1 under phasing-1. V2 beats Balanced 32/0/0 (VOID) and 4/0/0 in the pilot, and beats Expand 4/0/0 in the pilot. No eligible Gate 1 row exists under muju-phasing-2. (scratchpad/ladder/w1500-aiv2hard-vs-aiv2medium/summary.md; w1500-aiv2hard-vs-Balanced/summary.md; muju/lab/ai/results/gate1-p2-pilot-2026-09-19/summary.json (gate1: 'pilot-ineligible'))
- [verified-in-code-or-results] V2 is clearly the stronger of the two engines under Phasing. New Hard loses to V2 7/1/24 at wall:6000 with no VOID flag, 11/3/82 to aiv2-hard-turn at wall:1500, 4/0/60 to aiv2-hard at wall:1500 and 4/0/44 to aiv2-medium. The last three rows are harness VOID for aiv2-arm overruns. New Hard does beat Balanced 31/0/1 and Expand 22/10/0. (scratchpad/ladder/chain2.progress and the per-run summary.md files (another reader's scratch rows, p1-dev openings))
- [verified-in-code-or-results] The scripted Rush line can be played by a human and uses no hidden information. It spends every crystal on fire_1 each Prepare, never promotes, and leaves starting miners on economy. Every fighter moves toward the nearest enemy, or toward the enemy corner. Attacks are chosen kill-first and then by most-damaged target. It leaves its home undefended, which is how the engines get almost all of their wins. (muju/lab/harness/bots/archetypes.ts:31-39,52-88; win types in w1500-aiv2hard-vs-Rush (6 of V2's 7 wins were home-checkmates) and in the wall:10000 row (3 of 3))

## Report
# Gap-fill: can V2 carry the Hard label, and is fire_1 Rush a balance problem or a bot problem?

All work was read-only. `git status --porcelain` is empty at the end. Scratch output is under `scratchpad/gapfill-rush/`.

I ran three bounded experiments:
- aiv2-hard-turn vs Rush at wall:10000 on p1-dev (7m00s).
- One-unit flood bots vs Rush (about 2 min each).
- An in-memory fire_1 cost 3 vs cost 4 paired run (1–3 min).

I also re-analysed other readers' scratch ladder rows in `scratchpad/ladder/` and the committed results.

## 1. Short answers

**Is the V2 port good enough to carry "Hard" on day one?**
- It can carry the label only as the better of two weak options, with a preview caveat.
- It cannot carry it as "strong moves by default".
- It beats new Hard decisively.
- It loses most games to a rush line any human can play.
- No independent-openings sample shows it separated from its own Medium under Phasing.
- No eligible Gate 1 row exists under `muju-phasing-2`.

**Is Rush a Phasing balance problem or a bot weakness?**
- It is primarily an engine build-policy weakness.
- The weakness predates Phasing.
- There is also a real but unproven Phasing design question layered on top (section 5).
- The fix belongs in the engines first.
- fire_1's cost is not the lever for opponents that do not build.

## 2. The Rush weakness is not specific to Phasing

**Standard, V2.**
- aiv2-hard lost to Rush **1/0/15** at wall:500, Elo -470, 0 illegal actions.
- Source: `lab/results/hard-ai-e0/calib-aiv2-rush/summary.md`, commit 43b87b6.
- Preregistration amendment A1 says so directly (`PHASING-PREREGISTRATION-2026-09-18.md:133-140`):
  - "the Standard release used `aiv2-hard` as its baseline although that engine lost to Rush".
  - Holding the port to a Rush gate "would hold the port to a bar the original never met".
- That is why Rush is report-only in Gate 1 (:117-118).

**Standard, new Hard.**
- hard@lab-400k scored 3/16 against Rush at wall:500 and 8/16 at fixed:400000 (`hard-ai-verify/M14-smoke`, `M14-fix-ladder-rush`).
- The "Rush Elo ≥ 0" clause was moved to milestone M18 (`MILESTONES.md:295,351`).
- `EPIC-PLAN-2026-09-16.md:399` says that clause remains mandatory.
- No `M18-rush` results directory exists.
- `RELEASE-2026-09-18.md` contains no Rush, Expand or Balanced row at all.
- So Standard's shipped Hard has never been shown to beat Rush.

## 3. What the engines do wrong against Rush

**V2 at the shipped allowance** (my row: aiv2-hard-turn vs Rush, wall:10000, p1-dev, 4 pairs / 8 games, seed 51):
- Result: **3/0/5**, Elo -89 [-284, +61].
- 0 illegal actions, 8 distinct games.
- No harness VOID line, but load average was 24 on 8 cores, so this is descriptive only.
- All 3 wins were **home-checkmates**, in 4, 18 and 21 completed turns.
- All 5 losses were elimination or upkeep-elimination, in 29–52 turns.
- In the losses:
  - V2 killed 11–32 units and lost 4–16.
  - It placed 4–15 units with 4–9 promotions; Rush placed 50–148.
  - It gained 65–135 crystals; Rush gained 129–377.

**V2 at wall:1500** (another reader's row, 32 games, harness VOID for a 13.85% V2 overrun rate):
- Result: 7/0/25. Six of the seven wins were home-checkmates.
- V2 placed 15.9 units per game; Rush placed 126.
- V2 killed 33.6 and lost 14.2 per game in the games it lost.
- V2's income is 7.0 at turn 2, 8.2 at turn 8, then collapses to 1.5 by turn 20.
- Rush's income goes from 7.5 at turn 2 to 14.4 at turn 8.

**Other V2 samples.**
- The phasing-2 pilot was 1/0/3 with the same build shape: 2–7 units and 2–8 promotions.
- The void A2 row was 22/3/231, at about 6.4–6.8 V2 purchases per game.
- A2 ran at a crippled fixed:6000 budget with no opening book (A3, :206-214).
- A2's Expand h0 cell was 0/128/0, all inactivity draws. V2 did not beat Expand there.

**New Hard has a different, worse bug: it hoards.** Against Rush at wall:1500 (1/0/31):
- It gained 82.3 crystals per game, spent 19.4, and died with a mean of **62.4 banked**.
- It bought on 134 of 547 own turns.
- It bought exactly one unit on 131 of those 134.
- It hoards against everyone: 191.8 banked at game end against Expand, 87.8 against Balanced.
- A Hard that does not spend cannot be evaluated for strength.

**Why tall play loses.**
- Tier-1 upkeep is 0 (`src/game/upkeep.ts:5`).
- fire_1 costs 3 and mines 1. water_1 costs 4 and mines 2. plant_1 and metal_1 cost 5 and mine 3.
- Promotions add 1–2 upkeep per turn. A fire promotion adds no mining.
- Both players get 4 actions per turn.
- The wide player's edge is income and replacement rate, not action count.
- V2 wins the fights and still loses the production race.

## 4. Is Rush itself broken? Scratch scripted experiments under `muju-phasing-2`

`createRushBot(unit)` already accepts a unit (`archetypes.ts:52`). I ran the same dumb flood script with other units: 12 seeds × 2 seats × h0/h3, 48 games per pairing, W/D/L from the first-named bot's side.

| Pairing | Result |
|---|---|
| Flood-water_1 vs Rush | 1 / 41 / 6 (Rush score ≈ 0.55) |
| Flood-shadow_1 vs Rush | 15 / 16 / 17 |
| Tier1Spam vs Rush | 14 / 23 / 11 |
| Flood-metal_1 vs Rush | 0 / 0 / 48 |
| Flood-plant_1 vs Rush | 0 / 0 / 48 |
| Flood-water_1 vs Tier1Spam | 42 / 6 / 0 |
| Flood-water_1 vs Balanced | 41 / 7 / 0 |
| Flood-water_1 vs AntiRush | 0 / 48 / 0 |

Reading:
- Rush is answerable by an equally dumb policy that goes wide with a unit that trades well into fire_1.
- The committed p2 round-robin agrees:
  - The top three bots are all wide builders: Tier1Spam 0.924, Rush 0.893, MiningDenial 0.737.
  - Every bot that loses 0–4 to Rush buys 3.6–15.6 units per game; Rush buys 92.85.

**fire_1 cost lever** (in-memory override asserted through `getUnitDefinition`, paired seeds, 32 games per pairing):

| Rush vs | fire_1 cost 3 | fire_1 cost 4 |
|---|---|---|
| AntiRush | 31/1/0 | 30/2/0 |
| Balanced | 32/0/0 | 32/0/0 |
| Mono-water | 24/5/3 | 12/9/11 |
| Tier1Spam | 7/17/8 | 1/18/13 |

- Cost matters only in matchups that are already close.
- Cost does nothing for opponents that do not build. Today that describes both engines.

## 5. The design signal that should not be dismissed

**Ruling E-2.**
- `JUDGMENT_LOG.md:13-16` (E-2): rush against the best defensive responder should win 35–55%.
- Above 65% counts as a balance failure.
- Under Phasing, every current responder is far outside the band:
  - AntiRush 0/0/8 in p2 and 1 draw in 32 in my run.
  - V2 about 22–38%.
  - New Hard about 3%.

**The same defensive script held under Standard.**
- June E6: Rush won 14.2% against AntiRush (`lab/docs/EXPERIMENTS.md:130-141`).
- 2026-09-12, Standard with four actions: Rush against a home-aware AntiRush was 9W/31D/0L (`four-actions-2026-09-12/summary.json`).

**Phasing structurally weakens defence.**
- Summons are public, delayed a turn and refundable-on-disruption (`docs/PHASING-2026-09-16.md:13-17,34-41`).
- Standard's "new units act at once" spawn-strike (`STRATEGY_GUIDE:44`) is gone.
- The preregistration retires the spawn-strike suite (:50-53).

**Caveats.**
- The harness is now Phasing-only (`runner.ts:134`).
- So "the rules changed" and "AntiRush is mis-tuned" cannot be separated from the repo.
- With Flood-water_1 as the responder, Rush's win rate is 12.5%. That is below the band, and most of those games are draws.
- So E-2's failure condition is **not established**.
- What is established is that no current AI responder builds.

**Second smell.**
- Scripted wide-vs-wide games last about 110–135 completed turns.
- 50–85% of them end as inactivity draws, with the whole 496-crystal map mined out.
- This is scripted-bot evidence only.

## 6. What this means for the bar and the path

- **"Beats aiv2-hard" is a weak bar.** aiv2-hard fails Rush in both rulesets.
- **Better practical bar for a Phasing-only launch.** At the shipped allowance on p1-dev, the engine should:
  - beat Rush with score > 0.5 and an interval excluding 0;
  - beat Expand and Balanced;
  - beat a home-guarded Rush;
  - keep buying;
  - pass the owner's eye test.
- **Why the home-guarded Rush is needed.** Essentially every engine win over Rush today is a checkmate of an empty home. A human rusher who keeps one unit at home removes that path. The bot results therefore probably understate human exploitability.
- **Fix the engines first.**
  - New Hard needs multi-buy Prepare plans. It currently buys one unit per buying turn and banks 60–190 crystals.
  - V2 needs to value upkeep-free tier-1 width over promotion while it is out-produced, and to counter-build water into fire.
  - Cheapest decisive test: a scripted-Prepare wrapper, where Act comes from the engine and Prepare spends everything on water_1/fire_1, run against Rush. About half a day. If it clears 0.5, the whole gap is Prepare policy.
- **Touch rules only if a wide-building engine still loses more than 65% to Rush.** Then look at Phasing's defender-side mechanics (summon delay, summon disruptability) before fire_1's price.

## 7. What cannot be answered from the repo

- **Human play.**
  - There is no human-vs-Rush or human-vs-engine Phasing evidence anywhere in the repo.
  - Experiment: the owner plays the literal Rush script by hand through `?phasingAi=1`, keeping 1–2 units at home.
  - Two games per colour against each engine.
  - At 10 s AI turns and about 20–25 AI turns per game, that is roughly 2–2.5 hours.
- **An eligible V2-vs-Rush number.**
  - Needs an idle machine.
  - 48 pairs × h0/h3 at wall:10000 is about 40–60 minutes at 8 shards.

Key files:
- `/Users/ethancd/src/deevgames/muju/lab/harness/bots/archetypes.ts`
- `/Users/ethancd/src/deevgames/muju/lab/harness/bots/probes.ts`
- `/Users/ethancd/src/deevgames/muju/lab/harness/results/p2-scripted-2026-09-19/`
- `/Users/ethancd/src/deevgames/muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`
- `/Users/ethancd/src/deevgames/muju/lab/results/hard-ai-e0/calib-aiv2-rush/summary.md`
- `/Users/ethancd/src/deevgames/muju/JUDGMENT_LOG.md`
- `/Users/ethancd/src/deevgames/muju/src/game/units.ts`
- `/Users/ethancd/src/deevgames/muju/src/game/upkeep.ts`
- Scratch results: `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/gapfill-rush/`