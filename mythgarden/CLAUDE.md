# Claude Code Session Postmortem

## Session Summary
Continued work on Mythgarden settings menu implementation. Added rainbow border for dev environment, then spent significant time debugging deployment hanging issues on both GitHub Actions and local deployments.

---

## What Went Well ✅

1. **Rainbow border feature** - Clean, simple implementation
2. **Systematic debugging** - Breaking down Docker steps to isolate the npm build hang
3. **Found root causes** - Identified both `flyctl deploy` waiting for health checks AND `webpack watch: true` keeping processes alive
4. **Web research** - Eventually used search to find the `--detach` flag solution

---

## What Went Wrong ❌

### 1. **Worked Blind for Too Long**
- User said "it's hanging" but I didn't immediately ask for logs/output
- Tried solutions (extended timeouts) without seeing the actual error
- Should have asked: "Show me the exact output - where does it stop?"

### 2. **Didn't Question Suspicious Configuration**
- Saw `grace_period = "1s"` and `timeout = "2s"` but didn't immediately flag it
- These are absurdly short for a Django app with migrations + fixture loading
- Should have said: "1-2 second timeouts seem very aggressive for your startup sequence. Is this intentional?"

### 3. **Didn't Use Available Tools Early Enough**
- Could have used web search much sooner to research "flyctl deploy hanging github actions"
- Found the `--detach` solution after multiple failed attempts
- Lesson: Research common issues before trying custom solutions

### 4. **Missed the Git Bisect Opportunity**
- User suggested a git bisect approach to find what changed
- I analyzed the commits but didn't notice the obvious pattern: builds started succeeding (Bullseye upgrade), THEN hangs started
- The hang was actually deployment waiting for health checks, not build failing

### 5. **Accepted Vague Problem Descriptions**
- "Deploy is hanging" - where? build? push? health check? app startup?
- "Settings menu button not visible" - in the HTML? styled wrong? z-index issue? not compiled?
- Should have asked for specifics immediately

---

## Tips for Future Claude Sessions

### 🔍 Diagnostic First, Solutions Second
**DO THIS:**
- "Can you paste the full output/logs where it hangs?"
- "What's the last line you see before it stops?"
- "Run `flyctl logs` and show me what the app is doing"

**NOT THIS:**
- Guessing at solutions without data
- Trying random fixes hoping something works
- Extending timeouts without knowing what's timing out

### 🚩 Flag Suspicious Configuration Immediately
**Questions to ask:**
- "I see [X] is set to [Y]. Is this intentional? It seems [too low/high/unusual]"
- "Before we change this, let me check what values are typical for [this use case]"
- "This configuration might cause [specific problem]. Have you seen [symptom]?"

**Watch for:**
- Very short timeouts (< 10s for app startup)
- `watch: true` in production builds
- Missing flags in CI vs local commands
- Health checks that are too aggressive

### 🔬 Break Down Complex Systems
**When debugging deployments, map the full pipeline:**
1. Build phase (Docker image creation)
2. Push phase (uploading to registry)
3. Deploy phase (creating instances)
4. Health check phase (verifying app is ready)
5. Routing phase (load balancer registration)

Ask: "Which specific phase is failing?"

### 🌐 Use Web Search for Common Issues
**Search early for:**
- "[tool] hanging in CI/GitHub Actions"
- "[error message] [tool]"
- "[tool] best practices [specific use case]"

Don't reinvent solutions to common problems.

### 📊 Request Structured Information
**Instead of accepting:** "It's not working"

**Ask for:**
```
1. What command did you run?
2. What did you expect to happen?
3. What actually happened?
4. What's the full output/error message?
5. What changed since it last worked?
```

---

## Pushback Tips: What Claude Should Say to Users

### When Users Provide Vague Problem Descriptions
**User says:** "The deploy is hanging"

**Claude should say:**
> "To debug this effectively, I need to see exactly where it's hanging. Can you:
> 1. Paste the full output from the deploy command
> 2. Show me the last line before it stops
> 3. Tell me how long you waited before canceling
>
> This will help me identify if it's hanging during build, push, health checks, or something else."

### When Users Want to Skip Diagnostics
**User says:** "Can you just try [random fix]?"

**Claude should say:**
> "Before trying solutions, let's gather data to identify the root cause. Can you run [diagnostic command]?
>
> This will save time - otherwise we might fix the wrong thing or create new issues."

### When Users Apologize for Poor Context
**User says:** "Sorry, my pisspoor delegation is putting you in an unwinnable position"

**Claude should say:**
> "No problem! To help effectively, I need:
> - [Specific logs/output]
> - [Configuration files]
> - [Error messages]
>
> Can you provide these? Then we can solve this systematically."

### When Configuration Looks Wrong
**User has:** `grace_period = "1s"` for Django app

**Claude should say:**
> "I notice your health check grace period is 1 second, but your startup script runs:
> - Database migrations
> - Django shell command to check fixtures
> - Potentially loading 1245 fixture objects
> - Starting gunicorn
>
> This could easily take 20-30 seconds. The 1s grace period might cause premature health check failures.
>
> Should we increase this to something like 30s?"

### When Users Try to Manually Fix Infrastructure Issues
**User says:** "I stopped and started the machine"

**Claude should say:**
> "Manual stops/starts can cause the machine to lose its load balancer registration.
>
> Instead of manual operations, try: `flyctl deploy` to create a clean deployment.
>
> This ensures proper registration with Fly's proxy."

### When Comparing Local vs CI Behavior
**User says:** "It works locally but not in CI"

**Claude should say:**
> "Let's compare the exact commands:
> - Local: [command]
> - CI: [command]
>
> Key differences could be:
> - Flags (--detach, --remote-only, --verbose)
> - Environment variables
> - Network/region differences
> - Steps that run after (like secrets updates)
>
> Can you show me both the local command and the CI workflow file?"

---

## Specific Lessons from This Session

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

---

## Action Items for Future Sessions

### For Claude:
- [ ] Ask for logs/output in the first response when user reports "hanging" or "not working"
- [ ] Question any timeout < 10s for web apps
- [ ] Search web for "[tool] [issue]" before trying custom solutions
- [ ] Map out the full system (build → deploy → health check → routing) before debugging
- [ ] When comparing local vs CI, explicitly list all differences in commands/environment

### For Users:
- [ ] Provide full command output when reporting issues
- [ ] Show error messages, not summaries
- [ ] When something "hangs", specify how long you waited and what the last output was
- [ ] Mention what changed since it last worked
- [ ] For deployment issues, provide logs from the deployed environment

---

## Git Bisect Brain Approach

The user's suggestion to "think about the deploy hanging using our git bisect brain" was excellent. Here's how to apply it:

**The Pattern We Found:**
- ✅ `423d071` - Fixed shop inventory - **builds succeeded**
- ❌ `3a40aa8` - Added Node.js/npm - **build FAILED**
- ❌ `0c97815` - Fixed apt-get - **build FAILED**
- 🔄 `9bf0fc7` - Bullseye upgrade - **build succeeded, deploy HANGS**
- 🔄 All subsequent commits - **deploy HANGS**

**The Insight:**
The behavior changed from "build fails" to "deploy hangs" at the Bullseye upgrade. This tells us:
- The build was fixed (Docker image builds successfully)
- But something NEW started causing hangs (deployment/health checks)

**Lesson:** When behavior changes in a git history, the commit where it changes tells you what component is now failing. Build phase fixed → health check phase revealed as the new problem.

---

## Final Thoughts

This session had two major breakthroughs:
1. `--detach` flag for CI deployments (found via web search)
2. `watch: true` causing build hangs (found via systematic debugging)

Both could have been found faster with:
- Immediate log/output requests
- Earlier web research
- More aggressive questioning of suspicious configs

**The user's quote worth remembering:**
> "my pisspoor delegation and context setting is putting you in an unwinnable position"

This is the USER recognizing they need to provide better context. But CLAUDE should also proactively ask for what's needed, not work blind.

**Success metric:** Time from "it's broken" to "here's the fix" should be minimized by getting the right information upfront.
