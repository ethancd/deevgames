# Muju Hono Tanka: preserve the game, expand the viable choices

> Subsequent authorized work: the static value solver and v1.3 catalogue changes are now implemented. See [implementation and validation](BALANCE_IMPLEMENTATION-2026-09-07.md). The original report below describes its earlier checkpoint.

2026-09-07. Base: `512fe0dccf4ed68a69014d7e26ff28ac9ca6b808` (September 7 launch). June 9–10 reports are in `lab/docs/STATUS-2026-06-10.md`, `SPEC_AUDIT.md`, and `EXPERIMENTS.md`. Their lab was merged July 18; their proposed catalogue rebalance was not implemented. This work fixes correctness and evaluates balance candidates. **The production unit catalogue remains unchanged.** All parameter changes below exist only in the experiment process.

## Recommendation

Make Lightning's speed translate into credible early threats: prototype ATK **2/3/3/4** instead of **1/2/2/3**, retaining DEF 1, speed 3/4/5/6, mining 0/0/1/1, prices and build times. This is the strongest candidate tested, including fresh-seed confirmation. It deserves a playable balance branch and adversarial mixed-army testing, not an unconditional release endorsement.

Next, differentiate Plant's economic progression from Metal's defense. Test the measured `plant_depth` package (T2 mining 4, T3 mining 5, T4 speed 2) against its individual components. Keep Plant price reductions as a competing, simpler alternative. Do not combine these with Lightning before isolating their effects.

Shadow remains unresolved. Its faster, fragile counterattack role needs mixed-army and positional tests before a numerical recommendation can be justified. Do not give every specialist better mining just to improve a score table. Keep Fire, Water, and Metal at current values initially.

The objective is useful strategic choices, not six interchangeable factions or 24 equally popular purchases. Every tier should have positions where building it, retaining it, or promoting into it is a defensible decision against an opponent who can adapt. Merely being a compulsory step on the tech ladder is weak evidence of viability.

## What “Sirlin-like” means here

I use Sirlin's emphasis on meaningful viable options and counterplay as a design lens: evaluate the best responses to a strategy and the responses to those responses. A rigid army losing to its dedicated counter is not sufficient evidence of bad balance. Distinct strengths should create reasons to choose differently as the opponent changes. This interpretation draws on [Balancing Multiplayer Games, Part 2: Viable Options](https://www.sirlin.net/articles/balancing-multiplayer-games-part-2-viable-options) and [Game Balance and Yomi](https://www.sirlin.net/articles/game-balance-and-yomi); Sirlin has not evaluated these Muju proposals.

Preserve the Double-Thick Triangle, six shared actions, distinct attackers needed to finish tough targets, transient damage, hidden production, finite resource wells, positional spawn rectangles, and promotion/tech dependencies. Together these produce commitment, bluffing, tempo, combined attacks and territorial consequences. Do not replace them with permanent HP, cooldowns, abilities or randomness before exhausting changes to the existing numbers.

## Evidence and its limits

The corrected rules powered **17,920 scripted games**: 12 screened variants × 960 games, then baseline/candidate confirmation × 3,200 games. Every cell uses both seats with paired seeds. Confirmation uses fresh seed blocks. All these games recorded **zero illegal emissions and zero invariant failures**. The catalogue audit also examines all 24 pieces, same-tier stat dominance, promotion costs and attack thresholds.

See [all results, paired bootstrap intervals and provenance](../lab/results/e8-2026-09-07/comparison.md), [raw JSON files](../lab/results/e8-2026-09-07/) and [the experiment](../lab/experiments/e8-design-screen.ts). These are restricted policy probes, not human or equilibrium win rates. “Mono” describes the production policy: the standard mixed starting army remains. The adaptive probes are deliberately crude, not trained best responses. Engine strength smoke tests are reported separately in the correctness report.

A crucial correction to interpretation: the harness adjudicates capped games using material plus stockpile. **Adjudicated wins are not on-board victories.** Screen cells have a 120-round cap. The fixed Fire Rush scored 9/80 versus AntiRush, but all other 71 games reached the cap; AntiRush did not actually eliminate Rush in those 71. An attacker that promotes and adds Plant against Water/Shadow walls achieved 38 natural wins (41 including adjudication) in the same-sized baseline cell. This does not prove experts can break every wall, but it invalidates treating fixed Fire spam as the whole aggressive playstyle.

Retire the old requirement that fixed Rush must score 35–55% against a bespoke AntiRush script. Preserve and test aggression as a family of adaptable strategies. There is still a real finishing/stalling concern; do not conceal it by counting a material lead as a win.

## Candidate evaluation and adversarial critique

| Candidate | Evidence / attraction | Strongest objection | Verdict |
|---|---|---|---|
| Lightning ATK 2/3/3/4 | Meaningful improvements against Fire and Metal; speed now delivers a threat. Retains fragile, mining-poor identity. | Cheap fast T1 can become the compulsory opener; spawn denial may snowball before its counters can deploy. Pure economy is heavily punished. | Highest-priority playable prototype; mixed defense, flank and spawn-lock exploit tests required. |
| Lightning ATK increases only at T3/T4 | Preserves early game while differentiating costly specialists. | Screen showed no meaningful improvement: benefits arrive after the critical decisions or are not used by these bots. | Insufficient alone. |
| Cheaper late Lightning/Shadow (4/7 and 7/11) | Reduces investment in fragile specialists without combat changes. | Little measured benefit; cannot repair an early dead end by discounting purchases players cannot safely reach. | Do not prioritize. |
| Plant T2/T3 mining 4/5, T4 speed 2 | Gives deeper extraction earlier and lets the ultimate miner relocate. Adaptive economy scored 37 natural wins/80 against Rush, versus 4 baseline. | Three simultaneous edits: causality unresolved. Faster resource access can fund rush armies rather than economy; T4 speed softens Plant's slowness. | Best Plant role prototype; split into component trials before adoption. |
| Plant T2/T3/T4 costs 5/9/14 | Easier economic investment. Adaptive economy natural wins 20/80; adaptive pressure 57/80 versus 38 baseline. | Price feeds bot purchase ordering and the adjudication metric. May mostly subsidize a counter-rush army rather than create a distinct economy. | Credible alternative; compare against depth package with purchase-independent policies. |
| Plant T2 mining 4 alone, combined with Lightning and Shadow mining buffs | Appears a smaller differentiation repair; package improved some headline scores. | Adaptive economy scored 54/80 but only 8 natural wins and 46 caps. Headline improvement largely means more stalled positions. | Reject this package as an established solution. |
| Shadow T1 mining 1 | Lets a Shadow opener finance reinforcements. | Still 0/80 against Water; Plant did better against Shadow. Erases an economic weakness without demonstrating a new strategic role. | Not supported. |
| Shadow speed 2/3/4/5 (untested) | Makes T2+ a mobile Water alternative, retaining lower durability and income. | Speed may already be undervalued by scripts; another fast triangle counter could suppress Lightning again. | A positional prototype hypothesis only, after ablation shows a missing role. |
| Metal T2/T4 mining 2/3 | Separates fortification from Plant's economy. | Plant versus Metal still mostly loses or stalls; a nerf could reduce viable defensive economy without improving choices elsewhere. | Hold unless mixed-army substitution proves Metal crowds Plant out. |
| Fire T2/T3 costs 2/5 | Makes reinforcement/promotion cheaper. | Lightning versus Fire fell from 26/80 to 10/80; little evidence this resolves the defensive matchups. | Reject as the first change. |
| Water T1/T2 costs 3/5 | Tries to weaken inexpensive walls. | Relevant scripted cells barely changed; may weaken the main counter needed for the Lightning prototype. | Hold. |
| Buff all weak lines together | Could cover multiple weaknesses in one release. | Interactions conceal causes; the tested combined price package weakened Lightning versus Fire and did not rescue Shadow. | Reject until components pass independently. |
| Change element edges, global ATK/DEF, persistent chip damage | Can visibly break walls. | Alters the game's organizing relationships or turn-local combination puzzle; global attack changes many kill thresholds at once. | Reject for this balance pass. |
| Spawn limits, anti-turtle taxes, new special abilities | Can force progress or grant unique roles. | Adds exceptions before establishing whether positional counterplay works; can flatten the importance of anchors and economy. | Reserve for a demonstrated structural failure after expert counterplay tests. |

These objections are my adversarial review of my own proposals, not claims of an independent reviewer or human playtest.

## Lightning: fresh-seed confirmation

Each row has 400 games, paired across baseline/candidate and both seats. Percentages below include adjudication; cap counts expose where that matters.

| Matchup (Lightning policy first) | Baseline wins | Candidate wins | Baseline → candidate caps |
|---|---:|---:|---:|
| Mono / Fire | 30.0% | 58.8% | 0 → 0 |
| Mono / Metal | 2.3% | 33.8% | 6 → 0 |
| Mono / Shadow | 0.5% | 11.0% | 0 → 1 |
| Mono / Water | 0% | 0% | 0 → 0 |
| Mono / Plant | 72.0% | 99.3% | 79 → 1 |
| T1 rush / AntiRush | 0.5% | 46.3% | 398 → 215 |
| T1 rush / Turtle | 7.5% | 64.3% | 370 → 143 |
| T1 rush / Expand | 39.0% | 99.3% | 238 → 3 |

The Fire and Metal improvements are not driven by cap scoring. Water still counters Lightning completely in this policy test; Shadow remains strongly favored. Those are reasons to retain counter identities, not automatically buff Lightning further. Conversely, the almost-total defeat of pure Plant/Expand is a warning to investigate opening response time. A mixed economy must be able to recognize pressure and buy protection without surrendering all economic plans.

The whole attack progression was tested as a package. The late-only experiment suggests the early changes matter, but does not identify the separate contribution of Radi versus Umeme. A Radi-only versus Umeme-only ablation should precede choosing a smaller final edit.

## All 24 pieces: intended decision and missing evidence

The following are design targets to verify, not certifications that each unit is currently viable. “Retain” means no initial numerical change, not no further testing. The exact current stats and attack thresholds are in [catalog.json](../lab/results/e8-2026-09-07/catalog.json).

| Piece | Decision it should justify | Initial disposition / decisive test |
|---|---|---|
| Hi (Fire 1) | Cheapest fast attacking body; swarm pressure | Retain; compare adding a body against promoting, with action congestion counted. |
| Hono (Fire 2) | More damage from one action/occupied square | Retain; demonstrate a combination-kill threshold that beats extra Hi. |
| Kagari (Fire 3) | Mobile high-damage reinforcement | Retain; test promotion downtime versus timely arrival on an active front. |
| Gokamoka (Fire 4) | Concentrated finisher using scarce actions | Retain; test surviving counterattack and paid-back promotion tempo. |
| Radi (Lightning 1) | Fast sacrificial threat/anchor intrusion | Prototype ATK 2; seek a counterable opening that Fire cannot copy as efficiently. |
| Umeme (Lightning 2) | Fast threatening upgrade rather than dead-end tech | Prototype ATK 3; isolate from Radi buff and compare two cheap bodies. |
| Kimubunga (Lightning 3) | Long-range threat that starts extracting resources | Prototype ATK 3; test distant defended wells and multi-front responses. |
| Dhorubakali (Lightning 4) | Maximum reach and threat concentration | Prototype ATK 4; verify speed 6 matters on an occupied 10×10 board, not just open-board arithmetic. |
| Sjor (Water 1) | Affordable defense that funds a response | Retain; test whether holding rush also lets economy safely advance. |
| Straumr (Water 2) | Durable second-step defense | Retain; compare maintaining flexible cheap defenders versus promotion. |
| Aegirinn (Water 3) | Mobile durable midgame counterforce | Retain; establish a use beyond replacing an already-winning wall. |
| Hafkafstormur (Water 4) | Durable late counterattack | Retain; verify a winning plan can finish rather than merely gain adjudication material. |
| Göl (Shadow 1) | Faster counter to Fire/Lightning with no income | Retain initially; threat-response test against Sjor at equal budget. |
| Gölge (Shadow 2) | More attack and some income on a mobile counter | Test mixed-army substitution; consider speed 3 only if speed 2 yields no niche. |
| Karanlık (Shadow 3) | Fragile but faster offensive counter | Same-battlefield ablation versus Aegirinn; untested speed 4 hypothesis. |
| Karabasan (Shadow 4) | Mobile counterattack finisher | Test chase/anchor pressure versus Hafkafstormur; untested speed 5 hypothesis. |
| Muju (Plant 1) | Economic commitment that needs escort | Retain; test a protected economic opening, not unsupported mono-greed. |
| Sachita (Plant 2) | An economic upgrade worth choosing over Metal | Priority differentiation: prototype mining 4 or cost 5 separately. |
| Sachakuna (Plant 3) | Earlier access to deep resources under protection | Prototype mining 5 versus cost 9; include depletion/relocation action cost. |
| Cuauhtlimallki (Plant 4) | Highest-depth extractor with a late-game job | Prototype speed 2 versus cost 14; verify investment before wells/opponent disappear. |
| Inyan (Metal 1) | Durable anchor securing expansion | Retain; measure territory held against opportunity cost of more income. |
| Mazaska (Metal 2) | Fortification with serviceable extraction | Retain initially; compare Plant after differentiation, not only static duels. |
| Tankasila (Metal 3) | Breakpoint wall enabling a strategic advance | Retain; prove counterplay through coordinated attack or another front. |
| Wakanwicasa (Metal 4) | Expensive late strongpoint | Retain; test whether opponents have an active route to victory and games can finish. |

**The clearest catalogue problem is Sachita versus Mazaska.** Both cost 6, build in 2, have speed 1 and mining 3, and share the same elemental matchup relationships. Mazaska has attack 2/defense 4 against Sachita's 1/3. This is same-tier stat dominance. Different promotion paths can still justify Sachita as an investment; the audit does not establish dominance of the entire Plant tree. Nevertheless, Plant's second tier needs a direct economic reason to exist beyond compulsory access to a later unit.

Mining is depth access, not renewable income. On a fresh cell, a mining-3 unit extracts three layers in one action; a mining-4 unit extracts four. Returning to an already stripped cell only yields newly reachable deeper layers. Higher mining therefore changes immediate income, remaining accessible deposits and relocation costs. Evaluate whole extraction routes, protection, finite deposits and the six-action opportunity cost; do not model it as automatic income every turn.

## Validation needed before a balance release

1. **Freeze a legal baseline.** Use this corrected transition engine and separately report illegal proposals, invariant failures, actual victories, resignations and capped games. Do not compare raw June rates against September corrected-engine rates as if only catalogue values changed.
2. **Run a best-response league.** Include aggressive adaptation, protected economy, counterattack, fortification with an exit plan, deep-mining migration, and fast anchor invasion. Let policies vary production and promotion rather than committing permanently to a line. Train/search independently against the candidate and baseline; use held-out seeds and both seats.
3. **Test unit contributions in midgames.** Fix public board, budget, tech access and time horizon; allow competing purchases. Remove each unit from a mixed-army policy and measure lost tactical/economic options. Count use, promotion, time alive, spending, kills, resources, actions and anchor influence. Merely being purchased by a price-sorted bot does not demonstrate value.
4. **Try to break the recommendation.** Radi spam into early spawn denial; Lightning plus Water covering its counters; Plant-funded rush snowballs; rotating sturdy anchors; stockpile-hoarding cap exploits; deliberate tech-anchor kills; protected deep mining; cheap-body versus promoted-body action efficiency. Every strong strategy should have a practical response and a reason to predict/adapt again.
5. **Set acceptance criteria before the next run.** No correctness failures; a demonstrated situational role for every tier; no opening that forces one universal response; adaptive economy can survive pressure without abandoning economy entirely; winning defenses can convert their advantage. Report seat effects and seed-block uncertainty. Do not gate all matchups on the same 50% target or reuse mirror double-counting as proof of seat fairness.
6. **Human adversarial play remains necessary.** Open-board reach and limited scripts underuse sacrifice, feints, multi-front mobility and hidden production. Use strong players to find exploits, then encode those exploits as regression positions and challenger policies. Re-test component combinations after individual results survive this step.

The evidence supports a clear next balance prototype and identifies specific unresolved roles. It does not establish that all 24 units or every playstyle is already viable, and it would be misleading to ship the entire proposed package under that claim.
