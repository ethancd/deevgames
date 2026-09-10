> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> Production release status is tracked by the repository’s deployment workflow.

> Catalogue/visual-rank numbers superseded by v1.5: [tier-3 cap report](TIER3_CAP-2026-09-08.md). Historical measurements below remain unchanged.

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

## Production receipt

Deployed code: `28a698a50ff0f054aedb961e4ff0d5b071b4f013`.
Durable checkout: `/Users/ashkie/src/deevgames-muju-cleave`, branch
`codex/muju-tier-cleave`. Published 2026-09-07 (America/Chicago).

- Live: https://deevgames.pages.dev/muju/
- Immutable: https://c6f76250.deevgames.pages.dev/muju/
- Cloudflare published 147 public files (5 uploaded, 142 unchanged).
- Live Chrome: **31/31 passed**. Live WebKit: **4/4 new Cleave tests passed**,
  including the Hard worker's paid kill → move → kill rescue.
- Live full-site smoke: phone 390px and tablet 834px passed for all three games.
- [Release build workflow](https://github.com/ethancd/deevgames/actions/runs/34183641753)
  passed. Its optional upload was skipped because the repository's Cloudflare
  deployment secret is absent; the tested local build was published through the
  existing authorized Wrangler path. A separate legacy GitHub Pages/Jekyll
  workflow failed; it does not publish the Cloudflare production site.

All five live Muju runtime files were fetched with a fresh query and compared
byte-for-byte with the tested build:

| File | Bytes | SHA-256 |
|---|---:|---|
| `/muju/` | 431 | `5392ea01b50c3b83b4cd03f4c47f670c773e310db86c87c1c57929c4f0f532d2` |
| `/muju/assets/entry-DEkBq1G3.js` | 42888 | `437232cebc40471b7293f1119061748d3a389450540f26727fa8e40874dfa4c3` |
| `/muju/assets/index-kFJ4jG_1.css` | 41518 | `2618fafc58e678d2a5d27743d2a90cb197d670f44bd89936b9c9566bada52c3d` |
| `/muju/assets/index-umLoCBCt.js` | 296484 | `61b10090bba6f6431dbb27ba19e3091771c9c5d5cfd03be9b0ae920c65789135` |
| `/muju/assets/tactics-Bi-uSDhY.wasm` | 7883 | `291d79fd92b69dd27970b4600c0883d137d559bc187ed0ef21a34d55f446f84f` |
