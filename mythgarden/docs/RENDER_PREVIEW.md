# Fresh Render preview

Deployed September 12–13, 2026. **Live:** https://deevgames-mythgarden-preview.onrender.com/ — created in Ethan's workspace, My project, Production environment, Ohio region, alongside Muju. Launched with a fresh database.

## Deployment configuration

Use repository `ethancd/deevgames`, branch `codex/mythgarden-render-preview`, Blueprint Path `mythgarden/render.yaml`. Create it in Muju's existing Render workspace, Ethan's workspace (`tea-dahbfnijnfac7394cs80`), My project (`prj-dahbp4eq1p3s73bf4jeg`). This blueprint defines only a new Mythgarden web service and a new database; it does not import Muju or Fly resources.

| Resource | Configuration |
| --- | --- |
| Web service | `deevgames-mythgarden-preview`, Docker, root `mythgarden`, 0.5 CPU / 512 MB |
| Database | `deevgames-mythgarden-preview-db`, PostgreSQL 16, 0.1 CPU / 256 MB, 1 GB disk |
| Region | Ohio for both, matching Muju (verified in the dashboard) |
| Live hostname | `deevgames-mythgarden-preview.onrender.com` |
| Pre-deploy | `bash predeploy.sh`: migrations, then `bootstrap_world` |
| Startup | `bash start.sh`: Gunicorn on Render's `$PORT`, two workers |
| Health | `/healthz`: database reachable and world content available; does not create a player |
| Secrets | Render-generated `SECRET_KEY` and database-reference `DATABASE_URL`; no secrets in source |
| Database access | Render internal network only; external IP allowlist empty |
| Auto deploy | Off, so preview releases are deliberate |

Render's confirmed estimate at creation is **$13.30/month** for the web service, database, and 1 GB storage, plus any usage charges. This adds resources to the workspace; it does not replace Muju. A free database's expiration makes it unsuitable for persistent preview saves.

## Save and settings behavior

Every visitor starts fresh. Their browser session points to SQL game state; reloading, restarting the web service, and deploying the same compatible schema must preserve that relationship. Clearing cookies or Django session expiry still loses access to an anonymous save.

The four challenge options apply immediately while `Session.has_taken_action` is false. The first successfully committed gameplay action locks the active choices and multiplier for that week. Buying or selling counts even if the clock does not move. Menus, profile edits, failed actions, and reloads do not count. Weekly rollover resets the flag and applies draft choices. Existing saves migrated from older code are conservatively locked until their next loop.

Bootstrap is atomic and protected by a PostgreSQL advisory lock. An empty world loads the fixture once. A populated world is preserved. A partially populated world fails rather than being overwritten. The default farmer portrait produced by a historical migration is allowed when initializing an otherwise empty database.

## Verification already performed

- All 18 release checks pass on SQLite and PostgreSQL 16 with Django 5.2.17/Python 3.12.
- Both relaxed and challenge modes complete seven days using the real Django HTTP action endpoint, including farming, buying/selling, gathering, gifting/talking, sleeping, and loop reset.
- Tests cover all eight requested toggle combinations for daily shop restocking, movement/building boundaries, validation/CSRF, inventory rollback, untouched-week changes, zero-time action locking, seeding idempotence, and health failures.
- Production Webpack and WhiteNoise collectstatic pass. Existing Sass deprecation and bundle-size warnings remain.
- Production Gunicorn browser check verifies settings apply immediately before travel, defer after travel, and update the displayed multipliers. No browser console errors.
- `makemigrations --check --dry-run` and `git diff --check` pass.
- Django deployment check has only the two optional HSTS subdomain/preload warnings. The preview uses HTTPS redirect, secure cookies, proxy handling, one-hour HSTS, and no production debug toolbar. Subdomain policy and preload are deliberately left unset for an assigned preview hostname.

The legacy test suite remains broken, as detailed in [the roadmap](REHOST_ROADMAP.md). These release checks are explicitly targeted and do not claim the entire legacy suite passes.

## Deployed resources

- Web service: `srv-daj2lv0ae00c738d49vg`.
- Database: `dpg-daj2lm0ae00c738d3ceg-a`.
- Blueprint: `exs-daj2lep594qs73akcksg`.
- Current deployed application commit: `6143366ffa429c2066f0740acc0902550aa41bdd`, deploy `dep-daj44hh594qs73ap7uu0`. Migration 0080 completed and existing saves were preserved. A fresh hosted browser week passed with 181 actions. See [the release report](RELEASE_TESTING.md).
- Previous deployment: `296b8e2dca45440653b9dc7703ce9d76e2a9be66` (initial fresh preview). The remaining first-deploy notes below are historical.
- [Cloud release checks](https://github.com/ethancd/deevgames/actions/runs/34738507682) passed: PostgreSQL release suite, production bundle/static collection, schema drift check, actual Docker build, and repeated bootstrap inside the image.
- First Render deploy completed in 1m19s, with log confirmation that a fresh world was initialized. The live `/healthz` returns HTTP 200.
- Live browser: all three settings immediately switch active values and multiplier before play; after travel a movement change stays pending for next week. Name editing, travel, gathering, reload, and loaded images work. The test save is Preview Farmer, Monday 7:30am, Darklight Forest, one Huckleberry, 0 fleurs.
- Both new resources are grouped with Muju under My project → Production. Muju remains deployed.
- Full redeploy/save-persistence verification passed on `dep-daj2r4p5efls73fct0eg`: the replacement container is Live, migrations report no pending work, and bootstrap reports existing saves/content preserved. Reload returned the exact same farmer, clock, location, and inventory.

## Release testing and remaining work

The September 13 release pass expands the gate to 29 tests and all 16 settings combinations at two random seeds: 32 weeks, 224 days, and 5,824 actions. It repairs the reproduced request-retry, midnight-event, sparse-gathering, profile, reset, and phone-layout defects. The favicon and lost name edit listed in the first smoke test are fixed. See [the current release report](RELEASE_TESTING.md) for browser evidence, CI versions, and remaining launch gates.

The 18-test results above describe the initial deployment milestone. Physical touch devices, Safari/Firefox, every achievement/mythegg path, a multiuser load test, and backup restoration are not covered by that initial gate or implied by the expanded one.

## Rollback

The prior running commit was `296b8e2`. In Render, use Manual Deploy → Deploy a specific commit if application rollback is necessary. Keep the database; do not reinitialize the world. Migration 0080 only adds a nonunique version column, so the older application can ignore it, but rolling back also removes duplicate-request protection. Re-test a saved player after any rollback. Database restore has not yet been certified.

## Local commands

From `mythgarden/`, create a Python 3.12 environment, install `requirements.txt`, and set a local `SECRET_KEY`, `DEBUG=True`, `SECURE_SSL_REDIRECT=False`, and a disposable `DATABASE_URL` (SQLite or PostgreSQL).

```sh
npm ci
npm run build:production
bash predeploy.sh
python manage.py collectstatic --noinput
npm run test:release
PORT=8000 bash start.sh
```

For `DEBUG=False` browser checks, use localhost (secure-cookie exceptions) or HTTPS. For PostgreSQL tests the local database role must be able to create a test database. Never point release tests at a populated production database.
