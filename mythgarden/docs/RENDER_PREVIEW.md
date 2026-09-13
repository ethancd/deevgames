# Fresh Render preview

Prepared September 12, 2026. **Provisioning in progress:** the user authorized the personal Google account; Muju is in Ethan's workspace, My project, Production environment, Ohio region. The configured hostname is a target until service creation confirms it.

## Deployment configuration

Use repository `ethancd/deevgames`, branch `codex/mythgarden-render-preview`, Blueprint Path `mythgarden/render.yaml`. Create it in Muju's existing Render workspace, Ethan's workspace (`tea-dahbfnijnfac7394cs80`), My project (`prj-dahbp4eq1p3s73bf4jeg`). This blueprint defines only a new Mythgarden web service and a new database; it does not import Muju or Fly resources.

| Resource | Configuration |
| --- | --- |
| Web service | `deevgames-mythgarden-preview`, Docker, root `mythgarden`, 0.5 CPU / 512 MB |
| Database | `deevgames-mythgarden-preview-db`, PostgreSQL 16, 0.1 CPU / 256 MB, 1 GB disk |
| Region | Ohio for both, matching Muju (verified in the dashboard) |
| Target hostname | `deevgames-mythgarden-preview.onrender.com`; Render confirms availability during creation |
| Pre-deploy | `bash predeploy.sh`: migrations, then `bootstrap_world` |
| Startup | `bash start.sh`: Gunicorn on Render's `$PORT`, two workers |
| Health | `/healthz`: database reachable and world content available; does not create a player |
| Secrets | Render-generated `SECRET_KEY` and database-reference `DATABASE_URL`; no secrets in source |
| Database access | Render internal network only; external IP allowlist empty |
| Auto deploy | Off, so preview releases are deliberate |

The proposed small web/database compute pair is approximately $13/month plus 1 GB storage and usage. Verify the dashboard quote at creation. This adds resources to the workspace; it does not replace Muju. A free database's expiration makes it unsuitable for persistent preview saves.

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

## Before calling the preview live

1. Verify the account/workspace, region, hostname, and exact recurring price; create the blueprint.
2. Watch build and pre-deploy logs, including all migrations and the first fixture load.
3. Check the HTTPS home, `/healthz`, hashed bundle, portraits, and scenery.
4. Exercise settings before and after an action and reload the live browser save.
5. Restart/redeploy the web service and confirm that same browser returns to the same name, location, time, and inventory; bootstrap must report existing world preserved.
6. Record the confirmed URL, service/database IDs, deployed commit, and observed billing quote here. Broader browser journeys, backup restoration, and the full release matrix remain the next milestone.

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
