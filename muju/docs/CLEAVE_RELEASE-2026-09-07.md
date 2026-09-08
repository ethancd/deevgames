# Cleave — 2026-09-07

User-authorized rule: one initial attack per unit, then only a killing blow unlocks
another attack, with total attacks capped by tier (I: 1, II: 2, III: 3, IV: 4).
Every attack costs one of the six shared actions. Normal paid movement and mining
are allowed between attacks. A surviving target closes that unit's chain for the
turn; a teammate finishing the target does not reopen it. A newly placed Tier I
can attack immediately, once.

This is rules v1.4 with the v1.3 catalogue unchanged. It preserves the current
10×10 map D, sixteen empty approaches, 308 crystals, visual artwork, home-occupation
victory, and worker-based AI. Base: production master `452e200`.

## Implementation

- Canonical legality and combat share Cleave eligibility. Attack history retains
  killed target IDs; an optional `lastAttackKilled` records the actual outcome.
  Only the actual killing blow receives Cleave in sequential combined attacks.
- WASM ABI 2 independently carries total attacks, last-kill eligibility and tier.
  DFS restores those fields during backtracking. Movement remains available to
  units finished attacking. Canonical JS validates every returned tactical witness.
- Selected units show attacks used/cap and whether Cleave is ready or attacks are
  finished. The tutorial and current specification explain costs and chain ending.
- Completed human/AI actions and undo now save immediately. Previously only phase
  boundaries saved. Reload resumes the board and its attack allowance together.
  Existing schema-2 games remain supported; old used attackers without a kill
  marker conservatively finish attacking until their next owner turn.

## Validation

- `npm test`: **636 passing tests across 31 files**. New cases include actual Tier I
  placement, caps at all four tiers, nonlethal and zero-damage chain endings,
  teammate finishing blows, paid move/mine interleaving, resets and persistence.
- JS/WASM comparisons include every catalogue pairing/damage threshold, 360
  catalogue/history/last-kill combinations, and a forced corridor: Tier II can
  kill → move → kill within three actions; Tier I cannot. Seeded reachable-state
  comparisons and existing coordinated home-rescue fixtures also pass.
- Chrome: **31/31 browser tests passed**, including compact viewports, reload/undo,
  worker cancellation/fallback and Hard AI executing the entire Cleave rescue.
- WebKit 26.6: all new Cleave tests passed. The complete suite passed 28/31;
  the menu timing check passed alone after exceeding 100 ms under simultaneous
  browser load. The two remaining landscape/focus failures were reproduced on
  unchanged production `452e200` with the same runtime: board y=-2 at 844×390 and
  Tab focus escaping the tutorial dialog. These are pre-existing, recorded limits.
- `npm run build`, AI lab typecheck, and home-experiment typecheck with browser
  libraries (`--lib ES2022,DOM,DOM.Iterable`) passed. The historical home config
  otherwise omits DOM types required by the already-existing WASM/worker imports.
- Screenshots of the selected Tier I/Tier II status and compact layouts were
  inspected. Full-site build verifies all three games and runtime assets.
  Full-site browser smoke passed at 390px and 834px for Muju, FORGE and Oracle.

These are correctness/regression checks, not a new balance or difficulty
calibration. Earlier static value and match reports describe their original rules.

## Reproduction

From `muju/`, install locked dependencies with `npm ci`, then run `npm test` and
`npm run build`. From the repository root, run `bash build-all.sh`, serve `_site`
on an unused loopback port, and run:

```sh
MUJU_BASE_URL=http://127.0.0.1:PORT/muju/ npm run test:e2e
PLAYWRIGHT_BROWSER=webkit MUJU_BASE_URL=http://127.0.0.1:PORT/muju/ npm run test:e2e
```

The browser commands run from `muju/`. Full-site smoke runs from the root:
`CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node tools/smoke-site.cjs http://127.0.0.1:PORT`.
