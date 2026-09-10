# Doubled purchase and promotion prices — v2.2, 2026-09-10

The designer authorized doubling the entire catalogue and deploying the change
after finding six new pieces on turn two overwhelming. Prices had carried over
unchanged into passive mining and immediate public purchases.

| Elements | Tier 1 purchase | Tier 2 total | Tier 3 total | T1 → T2 | T2 → T3 |
|---|---:|---:|---:|---:|---:|
| Fire, Lightning | 2 | 6 | 12 | 4 | 6 |
| Water, Shadow | 4 | 8 | 20 | 4 | 12 |
| Plant, Metal | 6 | 12 | 24 | 6 | 12 |

Only tier 1 can be purchased; the higher-tier totals define promotion differences.
The canonical `src/game/units.ts` catalogue supplies gameplay, the shop, tutorial,
AI simulation and the WASM tactical catalogue. There is no separate promotion
multiplier. Income, map reserves, upkeep, starting trio, combat, movement, six
shared actions and promotion timing are unchanged.

The starters still collect up to six crystals on their first turn. With legal
spawn room, this now buys three Hi/Radi, one Muju, or a Hi promotion plus a Hi.
A Hi, Sjor or Muju on sufficient reserves recovers half its purchase cost on its
purchase turn, instead of its whole price. This slows reinvestment as well as
immediate army growth. It is a pacing adjustment, with longer-term balance and
the arrival time of higher-tier Cleave still subject to human playtesting.

Existing schema-5 saves remain structurally valid and resume with current prices;
completed purchases are not repriced. Historical studies and frozen catalogues
retain their original costs and are not evidence for the new economy.

Verification: all 560 tests in 35 files pass, including both seats' legal turn-two
opening, affordability and exact charges, the catalogue comparison and AI/WASM
checks. All 41 Chrome browser cases pass, including shop prices, the 4-crystal Hi
promotion, tutorial prices, saves, and phone/tablet layouts. The full three-game
site build and 390px/834px release smoke checks pass. Static catalogue checks retain
18 distinct profiles, no same-tier dominance and a sole-cheapest local task witness
for every unit; these are not whole-game balance results.
