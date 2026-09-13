# Mythgarden release testing — 13 September 2026

## Villagers inside the landscape

Application `9699a53` moves the touch interface's villagers into the landscape and removes the separate villager strip/sidebar. Existing portraits, dialogue, gift actions, schedules, saves and the interface rollback flag remain in use.

Render deploy `dep-daj9chgae00c7392tc5g` went live at **12:26:28 UTC, September 13, 2026**. The actual image built successfully; pre-deploy found no migrations and preserved the initialized world. Read-only hosted verification confirmed the new scene People control, absent legacy sidebar, 390×700 page containment, intact images, empty browser error/warning logs and the unchanged Monday 11:10am farm with its planted Parsnip Seed. Automatic approval review rejected a hosted gift route because it would mutate an existing save; it was not executed. Action coverage for this iteration comes from the isolated local test save below.

- TypeScript, **11 UI tests**, and the production build passed. Two new geometry tests cover control/character overlap, viewport containment, stable positions and the crowded-scene fallback. This frontend-only iteration does not rerun the unchanged backend week matrix; those earlier results are recorded below.
- Local production-browser checks covered tap-to-give to Angie, drag-to-give to Dev, normal conversation, dialogue → About → Escape, and talking to Joss through People when he was not one of the visible markers.
- Checked the shop, four-person Victorian house, tree duplex and travel between town, farm and forest. At 320×568, 390×560, 390×700, 834×1112 and 1024×768, observed portrait bounds did not overlap scene controls and the page fit the viewport. At 320×520, shop stock remained fully visible; the crowded scene used People for its occupants instead of drawing markers over controls.
- Turning the interface off and reloading restored the two original sidebar villagers, removed scene markers and preserved Monday 1:08pm. Re-enabling restored the new layout. Browser warning/error logs were empty during these checks.
- Physical iPhone Safari remains outside this coverage. This pass uses the existing art; bespoke transparent character artwork is a later visual upgrade.

## Phone and tablet redesign release

Application commit `5dc5a88b075711c0117eba1f2c48bda5a66699ee` is live on the existing [Render preview](https://deevgames-mythgarden-preview.onrender.com/). Deploy `dep-daj8o495efls738043a0` completed at **11:43:11 UTC on September 13, 2026**. Migration 0081 completed successfully and bootstrap preserved existing saves/content.

- [CI run 34754339141](https://github.com/ethancd/deevgames/actions/runs/34754339141) passed **31 backend release tests in 793.246 seconds**, including the 32-week settings/crop matrix and stable crop-position identity across growth in both catalogs. TypeScript, nine UI tests, production assets, migration drift, the actual Docker image, and repeated fresh-world bootstrap also passed.
- CI ran on `b095263`; the final four-file refinement only changed tablet image containment, the drag gesture threshold, panel focus, and documentation. Its TypeScript check, all nine UI tests, production build, actual Render image build, and browser checks passed. It did not repeat the unchanged backend matrix.
- Two complete local browser weeks passed through real controls on production Gunicorn/PostgreSQL, with daily reloads: **classic crops → high score 10,140**, then **fantasy crops → high score 10,688**. The farmer name, achievement and speed boosts persisted across week resets. The queued fantasy setting stayed inactive during the classic week and applied on the next Monday.
- Browser routes covered gathering, shopping, selling selected items, planting into chosen soil, watering, growth, harvesting, talking, tap-to-give, drag-to-give, chest storage/retrieval, traveling, and all seven daily sleeps in each week. Invalid selected-item targets did not buy, talk, travel, or spend time. The selected soil position survived growth and reload.
- Main play surfaces fit **320×568, 390×560, 390×700, 834×1112, and 1024×768** Chromium viewports without document overflow. Dialogue, people, character details, profile, journal, and settings remained reachable. Panel focus, Tab wrapping, biography transitions and Escape dismissal were checked.
- Hosted smoke testing preserved the existing Preview Farmer save at Monday 7:30am in Darklight Forest with its Huckleberry before further play. Travel, sale, seed purchase, planting, watering and reload then passed on the deployed build. The resulting Monday 11:10am save survived toggling the interface off, reloading, and turning it back on without advancing time. The hosted 390×700 page fit exactly; browser warning/error logs were empty and loaded images were intact.

This work repaired stale competing CSS, narrow bag/tile sizing, crop placement changing when tokens grow, an oversized tablet bed image intercepting the exit, a gesture delay interfering with dragging, and focus loss when opening a biography from the People panel.

The feature flag is **Settings → Touch-friendly interface** (immediate, per browser). `MYTHGARDEN_TOUCH_UI_ENABLED=False` provides a host-wide override. See [MOBILE_UI.md](MOBILE_UI.md) for the interaction contract and fallback. The compact surface needs at least 520px of usable height; shorter windows may scroll. **Physical iPhone Safari, browser toolbar/keyboard transitions, larger system text and home-screen mode remain untested.** The historical release results below describe the previous application build.

Release application commit `6143366ffa429c2066f0740acc0902550aa41bdd` for the fresh [Render preview](https://deevgames-mythgarden-preview.onrender.com/). This report records measured coverage; it is not a claim that every possible game path is bug-free.

## Repeatable release gate

Run `npm run test:release` with Python 3.12, the locked requirements, and a disposable PostgreSQL 16 database. The GitHub preview workflow also builds the production frontend, checks migration drift, builds the actual Docker image, and bootstraps a fresh database inside that image twice to check preservation.

- **29 release tests**, including a 32-week matrix: all 16 combinations of movement, building hours, random shops, and advanced crops, each at random seeds 20260912 and 42.
- **224 game days, 5,824 validated HTTP actions**. Each week starts as a fresh player. No clock jumps, free money, or invented inventory in the week routes.
- Routes exercise 3,008 travel, 672 gather, 832 sell, 216 buy, 224 talk, 160 plant, 272 water, 224 sleep, 160 harvest, and 56 gift actions. Every route performs all ten action types, reloads each day, and reaches the next Monday with persistent Hero progress and reset weekly state.
- Each action checks inventory/storage capacity, nonnegative money, and valid villager affinity. Separate tests cover full inventory/storage rollback, all-building hour boundaries, fixed stock rules, villager schedules, settings timing/isolation/CSRF, malformed inputs, database errors, and one-time world initialization.
- All **221 shipped dialogue conditions** resolve: 17 characters, six conversation affinity tiers, and seven other dialogue triggers per character.
- Boundary tests cover midnight events, passing out, rainbow bonus hours, repeated Sunday sleep, immediate-settings changes in another tab, and two simultaneous PostgreSQL requests competing for one save.

The initial 32-week run passed in 296.8 seconds on local PostgreSQL. The added edge/deployment suite passed separately (14 tests in 2.8 seconds); CI runs the combined 29-test gate.

## Defects reproduced and repaired

1. Repeating a valid request could award another item and spend time twice. Each committed action now changes a server-generated state version, checked under the same PostgreSQL row lock as action execution. Older requests receive HTTP 409 and current game state. Versions also change at week reset and immediate settings changes. The browser allows one pending action at a time and releases controls after an error.
2. Crossing midnight skipped early events on the new day. Event queues now preserve day order and include midnight. Daily events are not collapsed by a SQL union.
3. Gathering could crash on a missing rarity. Missing pools are skipped; item selection now uses seeded Python randomness instead of database random ordering.
4. Closing the Hero menu before the two-second debounce discarded a name edit. Leaving the name field now saves immediately, and the header and menu stay synchronized. Malformed profile requests return readable 400 responses without partially saving a name or portrait.
5. A GET to the reset shortcut could erase a week. Reset now requires a CSRF-protected POST and holds the gameplay lock.
6. At a 390-pixel viewport the HUD, map, and inventory overlapped, and settings had a 600-pixel minimum width. The phone layout now stacks the map, inventory, and villagers, keeps the page scrollable, and fits settings within the viewport. Desktop layout remains available above 760 pixels.
7. Added the missing favicon and corrected forwarding of the production page class.

## Browser verification

Local production Gunicorn + PostgreSQL, Chromium via the in-app browser:

- Name edit followed immediately by closing settings survives reload.
- Rapid gather double-click produces one item and one 30-minute advance.
- A second tab with old progress refreshes after HTTP 409 without another item; its next deliberate action succeeds.
- Deliberately stopping the local server produces a visible connection error and clears the busy state. Restart/reload preserves the exact 8:30am save, and the next gather succeeds at 9:00am.
- Phone viewports 390×844 and 320×740: document width equals viewport width, settings fit within 10-pixel side margins, and controls remain reachable by scrolling.
- Completed Monday through Sunday via browser controls (desktop Monday–Wednesday, phone width Thursday–Sunday), with daily reloads, crops, shopping, talking, and drag-to-gift. Next Monday retained Release Farmer and a 10,640 high score, emptied weekly inventory, and applied all four queued settings (225%). Switching building hours off before any next-week action immediately changed the active setting and multiplier (200%).
- The phone week exposed a title intercepting the farmhouse click. The final CSS makes this decorative heading ignore pointer events; the same click and the remaining week then passed. Desktop clock bounds no longer overlap settings.

Render deploy `dep-daj44hh594qs73ap7uu0` went Live at 06:28:18 UTC on September 13. Migration 0080 completed; bootstrap explicitly preserved existing saves/content. The pre-existing Preview Farmer save still had Monday 7:30am, Darklight Forest, one Huckleberry, and the same name after reload.

[CI run 34742154882](https://github.com/ethancd/deevgames/actions/runs/34742154882) passed all 29 tests in 782.8 seconds, production assets, migration drift, actual Docker build, and repeated bootstrap. This ran on `0a90c8b`; subsequent changes only adjust CSS. The final one-line title fix deliberately skips repeating the backend matrix and is covered by the production build, Render's actual image build, and the phone browser playthrough.

## Hosted week result

**Passed on the deployed `6143366` build.** A fresh Chrome player completed 181 gameplay actions from Monday 6:00am to the next Monday 6:00am on the public HTTPS Render URL. The route used actual clicks and gift dragging, with no debug endpoints, direct database edits, or scripted HTTP shortcuts. Monday–Wednesday ran at desktop width; Thursday–Sunday ran at 390×844. Every day was followed by a page reload.

- Completed gathering, selling, buying seeds, planting, watering, harvesting, talking, giving a gift, traveling, and seven sleeps.
- Monday's fixed shop visibly stocked Parsnip Seed and Lovely Postcard. The broader catalog/loved-gift invariant is covered across every day and settings combination by the HTTP matrix.
- Week Tester persisted with **high score 4,880**, a weekly result of 244 fleurs × two hearts × ten, a new speed boost, and a clean Monday start. Inventory and wallet reset to zero.
- No in-game errors were observed in the route. Browser warning/error logs were empty, and the final page had no broken loaded images. Final `/healthz` returned HTTP 200 with `{"status":"ok"}`.
- [CI run 34742407064](https://github.com/ethancd/deevgames/actions/runs/34742407064) also passed the combined 29-test gate and actual container checks on `53ba025`, which includes the desktop clock fix. Only the one-line decorative-heading CSS change follows that tested commit; its production build and actual Render deployment passed, followed by the hosted phone week.

## Limits and remaining gates

- The historical 189-test suite still contains obsolete APIs and global model monkeypatches. The release gate deliberately names the maintained modules; its green result does not mean the legacy suite was repaired.
- A phone-sized Chromium viewport is not a physical iPhone/Android touch-device test. Safari/WebKit and Firefox need separate coverage.
- All achievements, every rare mythegg acquisition/power combination, a multiuser load test, and database backup restoration remain separate checks before a broad public launch.
- Anonymous saves remain tied to browser cookies. Cross-device recovery needs a separate account/save design.
- Migration 0080 adds the state version without resetting players. A tab loaded before this release must reload once to send the version header. The server refuses unversioned actions and provides a readable refresh message.
- The uncommitted Muju work in the shared checkout is outside this release.
