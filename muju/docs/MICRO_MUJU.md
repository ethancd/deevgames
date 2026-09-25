# MICRO MUJU

Rules revision **`micro-muju-1`** (2026-09-24). A subtractive, browser-only
pass-and-play variant of Muju Hono Irumbu ("Prime", `SPEC.md`). Play it at
`/muju/micro/`. Prime's rules, catalogue, rooms and saves are unchanged.

Anything not listed here is Prime's Phasing turn, unchanged: Act → passive
mining → Prepare → hand over; public pending summons with corner-to-anchor
rectangles, whole-rectangle enemy blocking, arrival-time revalidation and exact
refunds; elemental ±1 attack (floored at 0); combined damage; no retaliation;
full healing at the owner's turn start; home occupation, home checkmate and
elimination.

| | Prime | MICRO MUJU |
|---|---|---|
| Board | 10×10, homes A1 / J10 | 6×6, homes A1 / F6 |
| Map | Unequal routes (504) | `src/game/maps/micro-muju-default.json` (112: sixteen 0, twelve 4, eight 8) |
| Opening | Hi B1, Sjór B2, Muju A2 / mirrored | Same: White B1 B2 A2, Black E6 E5 F5; both banks 0 |
| Pieces | 18, promotions, upkeep | `fire_1` Hi, `water_1` Sjór, `plant_1` Muju only; canonical stats and prices; no promotion; tier 1 pays no upkeep |
| Actions | 4 shared | 2 shared; moves may repeat |
| Attacks | Cleave: each kill unlocks another | One attack per creature per turn, even after a kill |
| Elements | three pairs | Fire > Plant > Water > Fire (the only elements present) |
| Clock | 10-ply kill clock, mined-total verdict, suppresses late checkmate | None. No draw by time; checkmate is never suppressed |
| Seats | human, AI, online | two humans on one device |

## Where it lives

- `src/game/micro.ts`: revision, map, opening, catalogue, `createMicroGameState`.
- `state.variant === 'micro'` marks a Micro match; the board size comes from
  `board.cells.length`, so movement, adjacency, spawn corners and validation work
  on either board.
- Rules-layer enforcement is in `src/game/legality.ts` (catalogue, no promotion,
  one attack per creature), `summoning.ts` (only Micro pieces arrive), `inactivity.ts`
  (no clock) and `turn.ts` (no upkeep review).
- Home checkmate uses the canonical TypeScript prover (`homeCheckmate.ts`) through
  the canonical transition, so rescues are Micro's own legal two-action lines. No
  AI, WASM or MCP code runs for Micro.
- Saves: `localStorage['muju-micro-save']`, schema 1, stamped with the variant and
  rules revision and validated strictly (6×6, two actions, Micro pieces only).
  Prime's `elemental-tactics-save` is never read, written or cleared by Micro, and
  Prime's loader refuses any state carrying a `variant`.

## Not included

AI opponents, online rooms, MCP, Academy, analysis screen and position reports.
Rooms and the server rules payload remain Prime-only. The Node host serves
`/muju/micro/` as a static page only.

Tests: `tests/game/micro.test.ts` (rules and persistence). Verification for the
first release was a browser smoke check on desktop and phone, not engine or
balance validation.
