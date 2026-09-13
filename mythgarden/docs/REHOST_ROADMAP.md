# Mythgarden: Render relaunch and a playable week

Examined September 12, 2026. Source baseline: `1ac8026`, plus the Mythgarden changes described here. The first implementation and fresh Render preview milestones are complete. The live preview is https://deevgames-mythgarden-preview.onrender.com/.

**Initial preview milestone (September 12):** the deployment package now includes Django 5.2.17, Python 3.12, Node 24, PostgreSQL 16, one-time world bootstrapping, production static assets, secure Render host configuration, and `/healthz`. All 18 release tests pass on SQLite and PostgreSQL, including both full-week routes. A production Gunicorn browser check verifies immediate changes before an action and deferred changes afterward. The preview and its fresh PostgreSQL database are live alongside Muju in Ohio at a quoted $13.30/month. A full redeploy preserved the browser save. See [the deployment runbook](RENDER_PREVIEW.md).

**Release testing update (September 13):** the maintained release suite now covers 29 tests and 32 complete weeks across all 16 settings combinations (5,824 actions). The first cloud run passed, including the actual Docker image. A complete local browser week preserved the farmer and high score, applied queued settings at rollover, and accepted immediate changes before the next action. Reproduced retry, midnight-event, sparse-gathering, profile-save, reset, and phone-layout defects are repaired. See [the current release report](RELEASE_TESTING.md) for hosted verification and remaining limits. The measurements below describe the original audit unless updated explicitly.

**Decisions:** launch a fresh world; use a separate Mythgarden service alongside Muju; settings apply immediately before the first successful gameplay action of a week, then defer to the next week. Existing Fly resources and player data have not been changed.

**Phone/tablet implementation (September 13):** an optional portrait layout now keeps the scene overlays, nearby villagers, six-slot bag, and latest event in one main view. Item actions use tap-item-then-destination; tablet shares these controls, readable costs, and detail panels. The interface flag applies immediately and can restore the previous interface without changing the week. See [the mobile interface runbook](MOBILE_UI.md) for rollback, the additive crop-identity migration, and testing boundaries.

Mythgarden is recoverable without a rewrite. A fresh database loads successfully, and the game now completes a scripted week in both relaxed and challenge modes on SQLite and PostgreSQL. The runtime and deployment package are now modernized; the remaining work is to expand behavioral coverage and complete the full browser release matrix. A passing route establishes a useful baseline; it cannot establish that every possible play style is free of bugs.

**What is here**

The frontend is React 18 and TypeScript, bundled with Webpack. Django owns every action and save. The browser sends an action identifier; Django regenerates available actions, validates the request, updates the database, advances the clock, runs scheduled events, and returns changed screen data. Time advances through player actions, so villagers and shop restocking do not require a background scheduler.

The shipped fixture contains 1,245 world records, including 17 villagers, 221 dialogue lines, 16 places (11 buildings), 201 item definitions, 114 achievements, six mythlings, and 22 farmer portraits including the default. All referenced place, villager, and farmer image files were present in the asset audit. The current dialogue library covers six conversation affinity tiers for every villager.

Saves are anonymous browser sessions stored in SQL, with a persistent Hero holding achievements, knowledge, score, and progression across loops. There is no account-based recovery or cross-device save flow. A fresh Render launch avoids migrating those anonymous saves, but persistence still needs testing across reloads, restarts, and deploys.

**What the examination found**

| Finding | Evidence and consequence | Status |
| --- | --- | --- |
| Settings button immediately closed its own menu | The click bubbled into `App.handleClick`, which clears active UI. Reproduced in the browser. | Fixed: stop propagation at the menu button. |
| Disabled building hours did not work in the browser | The server offered entry, but the frontend independently marked buildings inactive by the clock and blocked clicks. | Fixed: frontend availability follows server actions. Entered Town Hall at 7:05am, before its normal noon opening. |
| Stationary mode made an exception for Trix | Trix has no home and was still following appearance/disappearance events. | Fixed: all villagers stay put; Trix starts at his first Monday appearance, the beach. |
| Restocking could stop a week | Stock was reselected using item-definition IDs, including previous stock and bought/planted copies. The HTTP route failed while sleeping Tuesday, when Wednesday stock exceeded six slots. | Fixed: attach only the newly created stock tokens. |
| Fixed inventory was incomplete | Monday lacked gifts, weekends lacked seeds, and a random golden mythegg could still enter stock. | Fixed: predictable daily seeds and universally loved gifts, with both categories every day and no shop egg draw. |
| Random merchandise could select a nonexistent item | A rarity/category pool could be empty, leaving `None` for later item access. | Fixed: choose from populated pools; omit a slot if no valid candidate remains. |
| Invalid settings were accepted or raised server errors | Arrays, null, strings, numbers, unknown fields, and malformed JSON were not consistently rejected. | Fixed: strict draft-field boolean validation, HTTP 400, no partial updates. |
| Settings could become stale in an open browser | The menu fetched only once; errors were console-only and rapid saves could race. | Fixed: refresh on opening, visible load/save errors, retry control, controls disabled during save. |
| Database error handling was tied to SQLite | The view imported SQLite's error class and assumed every exception had `.message`. | Fixed: Django's database error class with a readable response. |
| Model state had an unrecorded migration | `Place.image_path` already used the new farm image, but the migration state still had the old default. | Added migration 0078 to match the existing model; no player data replacement. |
| Legacy tests no longer represent the app | Baseline discovery ran 189 tests: 8 failures and 106 errors. Removed imports, obsolete model fields/return values, and unscoped changes to `Session` class properties are present. | Still open. New release tests run separately and do not conceal this debt. |

The fixed shop preserves the authored daily progression instead of freezing one identical catalog for all seven days. Monday gains postcards; the weekend gains a basic seed. Existing quantities and prices remain meaningful. Turning off shop randomness also removes the golden mythegg shop opportunity. Before redesigning completion goals, decide how that achievement becomes reachable in relaxed mode; it should not silently reintroduce random stock.

**What has been verified in this milestone**

| Check | Result |
| --- | --- |
| Fresh SQLite schema through all migrations, then `loaddata initial_data.json` | Passed; 1,245 fixture records loaded. |
| Settings and week release suite on SQLite | 18 tests passed on the upgraded runtime; about 14 seconds. |
| Same release suite on PostgreSQL 16.6, UTF-8 | 18 tests passed on the upgraded runtime; about 20 seconds; migrations and fixture loading included. |
| Two complete week routes per database | Relaxed and all-challenge modes: gather, sell, buy seeds/gifts, plant, water, harvest, talk, give gifts, travel, sleep seven times, then return to Monday with the same hero and a recorded score. No direct clock jumps in these routes. |
| Settings matrix | All eight combinations of the three requested options restocked through seven days. Full play routes currently cover the two extremes, not every combination. |
| Boundary and ownership checks | Building opening/closing boundaries; all 17 villagers stationary for a week; repeatable fixed stock; no shared player/shop item tokens; full-inventory purchase rollback; malformed settings; CSRF; player isolation; next-run activation; readable database failures. |
| Development frontend build and production static collection | Passed. Sass deprecation warnings remain. |
| Production frontend build | Passed; approximately 302 KiB JavaScript. Sass deprecation and bundle-size warnings remain. |
| Real browser spot checks | Menu opens, options toggle, drafts survive reload, active settings stay unchanged, options can be disabled again, and out-of-hours building entry works. No console errors observed during these checks. |

The browser spot checks are not a complete week in a browser. The complete week routes use Django's HTTP test client and the real action endpoint. Mobile touch, multiple tabs, retries, service restarts during play, all achievements, and all mythegg powers remain unverified.

The local and hosted server logged a missing `/favicon.ico` (a cosmetic 404); include that in the release asset cleanup. The Hero tab also drops a pending name change if it is closed before its two-second debounce finishes; the always-visible name field saves correctly.

**The Render move**

Use a separate web service named `deevgames-mythgarden-preview`, targeting `https://deevgames-mythgarden-preview.onrender.com/` if that name is available. Render confirmed this hostname and the service is live. Put it in Muju's existing workspace/project, but give it its own service and database. Serve the game at `/`, which matches its current absolute API paths. Muju's game server is a different application and does not need to absorb Django.

My recommendation is one small paid web service plus managed PostgreSQL in the same region. Django already understands `DATABASE_URL`, and WhiteNoise already serves bundled assets. No Redis, background worker, separate frontend host, or uploaded-media disk is needed for the current game. This matches Render's [Django deployment guidance](https://render.com/docs/deploy-django).

Budget roughly **$13/month plus storage and usage** as a starting estimate, based on Render's published July 2026 example of a small always-on service and database; verify the exact dashboard quote before provisioning. This is incremental to Muju, not a quote for the whole workspace. [Render's cost explanation](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses).

A paid web service with SQLite on a persistent disk is a lower-service-count alternative, similar to Muju's documented disk approach. It has different backup/concurrency tradeoffs, cannot scale to multiple instances with the attached disk, and loses zero-downtime deploys. Plain SQLite on Render's ordinary filesystem would lose saves on restart/redeploy. Free PostgreSQL expires after 30 days, so it is unsuitable for a lasting relaunch. [Persistent disks](https://render.com/docs/disks), [free-service limits](https://render.com/docs/free).

| Deployment change | Concrete work |
| --- | --- |
| Supported runtime | Move Django 4.1.5 to a supported 5.2 LTS patch release and use a supported Python release, such as 3.12. Upgrade Gunicorn, WhiteNoise, the database adapter, and actually used dependencies together. Replace `STATICFILES_STORAGE` with the supported `STORAGES` configuration during the Django upgrade. |
| Build image | Replace the Python 3.10 Bullseye + Node 18 installer image with a current Python image and a Node 24 build stage. Use `npm ci`, the committed lockfile, and `npm run build:production`; copy only built assets into the runtime image. |
| Host and HTTPS settings | Add Render's `RENDER_EXTERNAL_HOSTNAME` to allowed hosts and its HTTPS origin to trusted CSRF origins. Keep secure cookies and proxy-aware HTTPS handling. Set `DEBUG=False`, `ENVIRONMENT=production`, and a generated secret key. |
| Database | Create a fresh UTF-8 managed PostgreSQL database; inject its internal URL. Fail clearly if the production URL is absent instead of silently starting on ephemeral SQLite. |
| Startup and seeding | Make startup bind `0.0.0.0:$PORT`. Move migrations into one pre-deploy step. Replace the item-count-only seed guard with an explicit, idempotent world-bootstrap command that validates required records and never reloads the full fixture over ongoing games. |
| Health and logs | Add a cheap `/healthz` endpoint that creates no Hero or Session, verifies readiness, and returns 503 when required data/database access is unavailable. Log request failures, action type, release version, and timings without save cookies or credentials. |
| Deployment isolation | Add a Mythgarden-specific Render blueprint and root-level GitHub workflow filtered to `mythgarden/**`. The existing workflows under `mythgarden/.github/workflows/` are nested legacy files; GitHub will not run them as workflows for this monorepo. Keep Muju's service settings and unrelated working changes separate. |
| Recovery | Turn on database backups, test a restore into a separate database, and verify an existing browser save after a service restart and a redeploy. Record the previous working release for rollback. |

The old Django 4.1 runtime was unsupported; the preview now uses locked Django 5.2.17 dependencies and Python 3.12 with Node 24 for frontend builds; Django's published support table lists 5.2 LTS through April 2028. Node's release table lists Node 18 as end of life and Node 24 as LTS. Those are concrete reasons to update the old runtime before the public relaunch. [Django support table](https://www.djangoproject.com/download/), [Node release table](https://nodejs.org/en/about/previous-releases).

Render supports database migrations through a pre-deploy command and supports selecting a monorepo service root. The implementation is now in `render.yaml`, `Dockerfile`, `predeploy.sh`, and the `bootstrap_world` management command. [Blueprint reference](https://render.com/docs/blueprint-spec).

**The remaining playability work**

The September 13 release pass repaired the original retry, GET-reset, malformed-profile, midnight-event, and sparse-gathering risks, with regression witnesses. All 221 shipped dialogue conditions are checked. Remaining work includes:

- Add deterministic dialogue fallback/selection before introducing multiple conditional lines for one trigger.
- Exercise every achievement and rare mythegg power/acquisition combination, higher boosts/luck, long message logs, and abandoned-session growth. The achievement total remains hard-coded to 114.
- Test on physical touch devices and Safari/Firefox, run a concurrent-player load test, and restore a Render backup into a separate database.
- Define anonymous-save retention and recovery. Clearing browser cookies loses access; cross-device saves need a separate design.

For a release candidate, use this sequence:

| Layer | Required evidence |
| --- | --- |
| World validation | Every map connection resolves, every villager has a reachable stationary spot, every needed gift/talk/mythegg dialogue exists, assets resolve, inventories fit, item pools are usable, achievement prerequisites are reachable in each supported mode. |
| Gameplay integration | Full seven-day routes for all 16 combinations including advanced crops, with multiple random seeds. Add farming-heavy, social-heavy, gather/sell-heavy, full inventory/storage, unaffordable purchase, passing out, and repeat-loop scenarios. |
| State invariants | After every action: nonnegative wallet, capacity at most six, valid item ownership, affinity 0–100, valid day/time, one application of each due event, score consistent with active settings, and correct reset/persistence boundary. |
| Browser journeys | A complete week through actual UI controls on desktop Chromium, Firefox, and WebKit; phone-sized and tablet-sized journeys including touch gifting, portrait selection, menus, overlays, refresh, and back navigation. Capture console errors, failed requests, screenshots, and a replay trace on failure. |
| Adverse requests | Double clicks, two tabs on one save, expired session, malformed inputs, lost response after commit, timeout/retry, stale action, and restart during an action. Verify no duplicate charge, gift, harvest, or week reset. |
| Hosted verification | Repeat the relaxed week on the actual HTTPS Render URL, prove saves survive restart/redeploy, check all assets, inspect logs, run a small concurrent-session load test, and restore a backup. |

The release gate is **zero unexpected 5xx responses, browser exceptions, missing required assets, failed invariants, or stuck progression in the agreed matrix**, with passing traces tied to the deployed commit. Expected gameplay denials, such as insufficient money, should be clear and preserve state. This is measurable confidence rather than a promise about every conceivable playthrough.

**One giant leap at a time**

These are engineering estimates, not measured delivery commitments. Later steps depend on what the preceding tests uncover.

| Leap | Deliverable and completion gate | Rough effort |
| --- | --- | --- |
| 1. Establish the game again | This audit, repaired settings, reproduced/fixed restock blocker, repeatable builds, and passing basic week tests on SQLite and PostgreSQL. **Implemented locally in this milestone.** | Completed first pass |
| 2. Fresh Render preview | **Complete.** Supported runtime, bootstrap, health endpoint, fresh web/database services, HTTPS browser checks, and save preservation across a full redeploy. | Completed |
| 3. Make a week reliable | **Preview release pass implemented.** 29 tests, 32 full weeks, browser playthroughs, adverse requests, and discovered defects repaired. Legacy-suite repair and broad-launch checks remain documented. | Release pass complete; broader certification remains |
| 4. Upgrade farmer portraits | A consistent art direction, an approved small sample, replacement set, optimized assets, and working selection/persistence on desktop and phone. | 1–3 days plus art review |
| 5. Give the cast deeper dialogue | Conditional dialogue selection, content validation/fallbacks, two-character pilot, then rollout to all 17 characters. | 3–6 engineering days plus writing/review |

The preview now has a repeatable week-reliability gate. The next creative leap is farmer portraits, followed by the conditional-dialogue pilot; physical-device coverage and backup restoration remain gates for a wider public launch. See the current release report for evidence and the runbook for resources and rollback.

**Portraits and dialogue**

There are 21 selectable farmer images plus the default. Start with a small contact sheet to settle a consistent style, face framing, lighting, and variety, then replace the set with optimized square assets. Preserve portrait identifiers or provide an explicit mapping so saved choices stay valid. The current selector parses filenames with a restrictive regex; update that contract or use stable portrait IDs before introducing names with digits/new formats. Check the gallery, small HUD crop, contrast, asset hashes, and reload persistence. Bake these assets into the site; image generation does not need to happen during play.

The cast already has useful personality descriptions: Donatella's generosity, Vir's investigator humor, Daffodil's awkward disguise, Dev's precise shopkeeping, Trix's pranks, and Light's over-optimized optimism are strong starting points. Keep those voices consistent.

Add a dialogue selector that evaluates typed conditions against game state: first meeting, friendship tier, day/time, location, recent gift, farming milestones, unlocked knowledge, previous-loop memories, and notable encounters. Specify priority, selection order, repetition cooldown, and a safe generic fallback. Author several variants per matching condition; the current exact-one-row lookup cannot support that directly.

Pilot Donatella and Trix first: one relationship-focused character and one character whose behavior differs between stationary and scheduled modes. Test that Trix never describes roaming while stationary mode is active, high-affinity lines do not appear before earning the relationship, and callbacks refer only to events the player actually experienced. After the selector and editing workflow work, expand to the full cast. Pre-authored, reviewed dialogue will keep gameplay available without a runtime model API, latency, or per-conversation cost.

**Reproduce this milestone**

From `mythgarden/`, create/activate a Python 3.12 virtual environment, install `requirements.txt`, and use a disposable database. The current release checks use Django 5.2.17.

```sh
export SECRET_KEY='local-mythgarden-testing-key-only'
export DEBUG=True
export SECURE_SSL_REDIRECT=False
export DATABASE_URL=sqlite:////tmp/mythgarden-local.sqlite3

python manage.py migrate --noinput
python manage.py loaddata initial_data.json
npm ci
npm run build
npm run test:release
```

Use `DATABASE_URL` for a disposable UTF-8 PostgreSQL database to repeat the database check; the test user needs permission to create a test database. For a production asset check, use `npm run build:production` followed by `DEBUG=False python manage.py collectstatic --noinput`. The full old suite is still known to fail; `test:release` intentionally names the new module. Do not use its green result as a claim that the legacy suite was repaired.
