# Mythgarden deployment gotchas

Hard-won lessons from a deploy-hang debugging session. Each one looks safe until it bites.

### 1. Webpack `watch: true` Will Hang Builds
- **Problem:** Webpack stays running waiting for file changes
- **Solution:** Remove `watch: true` from production webpack config
- **Prevention:** Always check build configs don't have watch/serve modes enabled

### 2. `flyctl deploy` Waits for Health Checks by Default
- **Problem:** Command hangs in CI waiting for health checks that never pass
- **Solution:** Use `--detach` flag in CI to return immediately
- **Trade-off:** You don't get automatic rollback on failed health checks
- **Best Practice:** Use `--detach` in CI, then check status separately

### 3. Secrets Updates Trigger Restarts
- **Problem:** `flyctl secrets set` causes a rolling restart after deployment
- **Impact:** Can cause instability or double-restart of freshly deployed app
- **Solution:** Set secrets before deploy, or accept the restart as expected behavior

### 4. Health Check Grace Periods Must Account for Full Startup
- **Problem:** 1-2 second timeouts for app that needs 20-30 seconds to start
- **Solution:** Calculate realistic startup time:
  - Migrations: ~10s
  - Fixture check/load: ~10s
  - Gunicorn startup: ~5s
  - Buffer: +10s
  - **Total: 30s grace period minimum**

### 5. Load Balancer Issues vs App Issues
- **Symptoms:** App logs show healthy, but 503 errors from proxy
- **Cause:** Load balancer can't find the machine (routing issue, not app issue)
- **Solution:** Redeploy to re-register with load balancer, don't debug app
