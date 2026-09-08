# v1.7 — Lightning and Tanka follow-up

User-directed September8 adjustments, after the v1.6 upkeep deployment:

| Unit | Change | Final ATK / DEF / SPD / MINE | Cost / build |
|---|---|---|---|
| Radi, Lightning I | ATK2→1 | 1 / 1 / 3 / 0 | 1 / 1 |
| Umeme, Lightning II | ATK3→2 | 2 / 1 / 4 / 0 | 3 / 1 |
| Kimubunga, Lightning III | MINE1→0 | 3 / 1 / 5 / 0 | 6 / 2 |
| Tanka, Metal III | MINE3→4 | 2 / 6 / 2 / 4 | 12 / 3 |

Every other catalogue value and rule stays fixed:18 units, Inyan/Mazask/Tanka, Tanka Speed2, tier3 cap, upkeep0/1/2 and20 complete quiet player turns. Save schema4 remains compatible because IDs, prices, queue timing and state structure do not change; unit stats resolve from the current catalogue.

Updated: canonical unit definitions and SPEC v1.7, exact catalogue regression, J-014, video handoff, and both reference exports (Excel/PDF). The shared definition table flows into gameplay, AI, native catalogue configuration, shop, promotion and tutorial. No alternate hardcoded gameplay table exists.

Validation completed. Earlier tiercap/upkeep reports remain historical; their measured catalogues are not relabeled. The static runner now writes current output separately or accepts MUJU_BALANCE_OUT, protecting archived study files.

Before the follow-up games: screen the same E13/E9 seeds and seats with all upkeep/draw mechanics unchanged. Expect lower early Lightning damage, no Lightning mining at any tier, and deeper Tanka extraction. This is a directed change, not a search for replacement stat values.


## Results and checks

-668/668 unit/property/AI tests pass. The mixed-element attack regression now expects Radi's1+1 advantage=2 and total combined power6.
- Chrome39 scenarios and WebKit7 selected scenarios pass, including the corrected Radi-versus-Inyan chip test. The initial old browser expectation incorrectly assumed Radi still killed DEF3 Inyan; current preview correctly shows1 remaining defense.
- Build/WASM and lab type checks pass. Static solver reports18 distinct profiles, no dominance, all18 with sole-cheapest declared mission witnesses.
- Tactical suite:30 fixtures,90 difficulty checks,54/54 required rescues cleared.
- Exported Excel and PDF both regenerated from the final catalogue, all18 rows verified, previews visually reviewed.

| Suite | Catalogue | Natural wins | Inactivity draws | Safety caps |
|---|---|---:|---:|---:|
| E13,960 games | v1.6 |805|155|0|
| E13,960 games | v1.7 |731|229|0|
| E9,3,200 games | v1.6 |2,677|523|0|
| E9,3,200 games | v1.7 |2,305|895|0|

The4,160 follow-up games match prior seeds/seats and all pass strict legality and invariants. The lower-damage Lightning line increases draws. E13 home wins315→337, Radi home wins stay137, Mazask71→78 and Tanka stays1. Mining4 improves Tanka's extraction capability; this screen does not establish that it becomes a frequent winning invader. Preserve the explicitly requested values rather than tuning them again from this small policy set.

Reproduce the new catalogue screen with `MUJU_STUDY_ROOT=lab/results/balance-followup-2026-09-08` using the e16 E13/E9 commands in the upkeep report, shipped variant only. Static output uses `MUJU_BALANCE_OUT=lab/results/balance-followup-2026-09-08/static npm run balance:check`. Raw game archives, manifests, aggregate comparisons and tactical results are under the same result directory.

The video handoff contains these exact changes. Delivery through the app's messaging tool is still failing with “Cannot steer conversation … without an active turn id”; do not claim the receiving video task incorporated the new values until it acknowledges them.

## Verified production release

Published source `0cafb11e2124580854f4fde3f6e9b017563bde8c` on2026-09-08. Immutable deployment: https://dd961def.deevgames.pages.dev. Production: https://deevgames.pages.dev/muju/, reached through the verified ashkie.com Deev Games link. A real Chrome browser verified JS/CSS/WASM against the local tested build byte-for-byte. All7 live tiercap, upkeep/draw and Lightning preview checks passed.

- `/muju/assets/index-BkJnpmfq.css` SHA-256 `01108fed8b12310cc90ea80c695b266a26dd82e28549f8da57034d833cacac49`
- `/muju/assets/index-D-1-REAd.js` SHA-256 `f7d074d341810fec799fa79ecc61762884cb86310dd149f1e453b2dcc4648c62`
