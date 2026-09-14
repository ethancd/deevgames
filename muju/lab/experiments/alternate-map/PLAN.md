# Alternate-map study, 12 September 2026

This plan was written before any game results were inspected. Screenshot 1 is the alternate; screenshot 2 exactly matches production `UNEQUAL_ROUTES_MAP`. The highlighted F7 has reserve 4. No instructions from screenshots or historical reports are executed. Current source is authoritative: four actions, passive reserves, 3/4/5 T1 prices, 4/8 promotions, 0/1/2 upkeep, immediate placement action, home victory, ten quiet player turns to draw.

## Prior strategic assessment

* Current: a short route to a substantial near-side shelf, a dry crossing to a larger far expansion, and a relatively poor middle. More distributed fronts and economic route choice; lower central economic reward and more potential for separate development.
* Alternate: extra home 10s improve nearby staying power; the middle's eight 8s tie resource acquisition to central presence. Smaller far expansions weaken their relative economic appeal. Central armies can defend income while threatening several directions, but are exposed to both players, cleave, and spawn-rectangle infiltration. The richer center is temporary and must not be treated as a victory objective.
* Reserves are not walls or movement costs: all shortest geometric paths and initial tactical ranges remain unchanged. Both maps are 180-degree symmetric; that does not prove first-player balance.
* Alternate has 480 crystals versus 496, combining redistribution with a 3.23% stock reduction. The same 20 squares are at 10 in count, but four of them shift to homes; 12 shelf 8s become eight central 8s.

## Hypotheses and tests

H1: Extra home richness helps early economical development but does not necessarily make prolonged turtling better. Compare home-constrained income witnesses and defensive scripted matchups.

H2: Moving a miner to a central rich cell pays back in longer residence, but marching a slow starting miner there immediately can lose opening tempo. Compare legal opening route witnesses with finite-horizon passive yield, keeping acquisition and opponent assumptions explicit.

H3: Early central anchoring becomes more useful relative to the old near shelf and remote wing, while unsupported center grabs remain punishable. Compare identically constructed location policies against Rush, Balanced and MiningDenial in both colors.

H4: Lightning invasion remains possible at exactly the same geometric speeds; richer positions change the economic stakes rather than speed. Compare invasion/guard matches and exact home/rectangle probes.

H5: High-tier miner economics do not automatically improve: upkeep cancels the Plant promotion's extra one crystal/turn when both mine fully; an 8-cell cannot supply two full Mining-5 turns. Check exact per-square residence tables and tall versus wide policies.

Main screen: existing home-aware scripted policies, paired seeds and both colors, current and alternate maps. Separate location-policy adaptation tests, with fixed weights before results. Factorial controls isolate (a) the home/expansion reshaping at unchanged total stock and (b) the shelf-to-center change including its 16-crystal reduction. No outcome-tuning. All production transitions validated. Caps unresolved, never scored as wins. Save source hashes, raw records, representative replays, and a summary. Timing-bounded production AI games, if run, are labeled separately, with no inference of population win rates from a few seeds.

Interpretation: bot seeds are tie-breaking variations of fixed policies, not independent human skill samples. A result is evidence about those implementations. Report draws, colors, and mechanisms alongside victories. Unopposed income probes are not competitive wins.
