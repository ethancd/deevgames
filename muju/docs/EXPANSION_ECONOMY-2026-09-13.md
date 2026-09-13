# Expansion economy — 13 September 2026

Approved balance changes, specification v2.8:

- Each player's six home squares hold 8 crystals, down from 10: 48 per home cluster.
- Both four-square expansions hold 16 per square, up from 10: 64 per expansion.
- Ordinary ground stays at 4, the eight central squares stay at 8, and both empty approaches stay empty. The 180-degree symmetric map contains 504 crystals, up from 480.
- Sachita (Plant 2) gains Mining 5; Sachakuna (Plant 3) gains Mining 8. Muju stays at Mining 3. Prices, upkeep, combat, movement, placement and the four-action budget are unchanged.

The intent is an earlier transition out of home and a stronger economic reason to promote Plants. At full collection, ongoing income less upkeep is 3/4/6. A newly placed Plant promoted on the next two own turns collects 3 + 5 + 8 from a 16-square; other income must finance the climb. These are mechanics and design intentions, not measured balance outcomes.

## Display and editor

Colors 0–10 retain their exact existing values. Colors 11–16 linearly blend the ten-crystal color `#b5e5e4` toward `#ffffff`: `#c1e9e9`, `#ceeeed`, `#daf2f2`, `#e6f6f6`, `#f3fbfb`, `#ffffff`.

The painter accepts and exports reserves 0–16, retaining its existing drafts, symmetry, history and modifier controls. Reserve stacks use two columns of eight fixed slots; each brick still represents one crystal and retains its original pale teal color. The visual key includes 12 and 16.

## Compatibility

Only new games and restarts receive the new default map. Existing local saves and online rooms retain their original reserves, depletion, banks and board capacities. Saved painter drafts are retained until reset by the player. The updated Plant catalogue applies to resumed games as well. Save schema 6 and online rules version 4 remain compatible; no rooms or histories are cleared.

The browser, authoritative server, MCP rules/analysis and AI simulation all consume the same unit catalogue and map constants. Refresh an already-open browser after deployment to load the updated catalogue and colors.

## Verification

Regression coverage includes exact map coordinates and symmetry, legal 3/5/8 promotion collection and upkeep timing, finite deposits, the 0–16 limit, persistence of the prior 480- and 496-crystal maps, palette values, reserve-stack slots, painter edits/exports and mobile layout. The full suite passed 801 tests across 63 files. All 22 selected Chrome browser cases passed, including mobile/tablet sizes from 320×568 to 1366×1024; all six painter/visual cases passed in WebKit. Browser checks also found and fixed native replay-select overflow in Safari by containing it within its existing control.

`npm run build`, `npm run server:types`, `npm run balance:types` and `npm run balance:check` passed. The static solver retains 18 distinct profiles, no same-tier dominance and a sole-cheapest witness for every unit. Its broad hypothetical action grids are documented in the report and are not game win-rate evidence. The public MCP rules now expose the default map separately from each room's actual reserves.
