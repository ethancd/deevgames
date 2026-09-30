# Game forks production release — 2026-09-29

The user authorized deployment of game forks with fresh clocks, including the timeout-result modal entry point. The original implementation record is [preserved separately](2026-09-29-game-forks.md).

## Source and compatibility

The implementation checkout was 99 commits behind production. Release work uses an isolated worktree based on `8ed95e54756f2b63f44dc46390f35fa9e443757f`, preserving all unrelated edits in the original checkout. Only the fork feature was carried forward. Integration retains current half-crystal creation rules, MICRO MUJU variant identity, current board visuals and the advantage explorer. Invitation prompts now name the actual player to move in a fork.

Rules revisions remain `muju-phasing-4` and the existing MICRO MUJU revision. No rules or database schema change. Existing games retain their result and recording; a fork gets independent credentials, history and full clocks. The server still rejects retired rules rather than reinterpreting their saved positions. The existing Render disk at `/app/data` was verified before release and is retained.

## Affected DAG

Plan: `python3 tools/muju-content-dag.py plan --kind online --kind mcp --kind ui --format json`. The current graph has 28 nodes and 52 edges. New files are covered by existing paths; no topology change is required.

| Node | Disposition | Evidence |
| --- | --- | --- |
| `browser-ui` | changed | Shared fork dialog; room, timeout-result and selected replay-position entry points; independent invitation and credential recovery. |
| `server-runtime` | changed | Authoritative state cloning, fresh clocks on join, source revision checks, persisted public provenance and variant preservation. |
| `mcp-tools` | changed | HTTP/stdio `muju_fork_room`, public provenance and scoped-service denial. |
| `agent-guides` | changed | Public player/time skills, ONLINE and analysis/tool documentation describe the new workflow. |
| `advantage-explorer` | verified unchanged | Its separate budget-preserving experiment forks and sealed forecasts are unchanged; explorer coverage is included in the release suites. |
| `academy-lessons` | verified unchanged | Optional online room controls change no lesson rule, position or spoken claim. |
| `academy-audio` | verified unchanged | No changed narration; archived audio is not required for this release. |
| `academy-video` | verified unchanged | No changed lesson boards, captions or render inputs; existing media is preserved. |
| `game-validation` | changed | Store, HTTP/stdio MCP and phone browser regressions cover forks, source isolation, fresh clocks and continued play; additional Micro regression covers integration. |
| `static-package` | changed | All three games rebuilt through `build-all.sh`; public-file verification and phone/tablet smoke check. |
| `server-package` | changed | Current server types and fork implementation; existing Docker packaging retained. |
| `academy-package` | verified unchanged | No Academy package inputs changed. |
| `static-deploy` | pending | Publish the verified `_site` to existing Cloudflare Pages project `deevgames`, production branch `master`. |
| `server-deploy` | pending | Render service `srv-dahbp4ht0dsc73fdqn10` is verified to auto-deploy master on commit, root `muju`, Dockerfile `./Dockerfile`, existing disk `/app/data`. |
| `academy-deploy` | verified unchanged | No affected Academy content; no redeployment required. |
| `release-verification` | pending | Verify live assets, MCP discovery, timeout-fork UI, continued play and original-game persistence after publishing. |

## Release gates

- Server and browser TypeScript checks passed.
- Focused integrated server suite: 66 tests passed.
- `bash build-all.sh`: passed, including WASM/browser builds for Muju and builds for Forge and Oracle; public files verified.
- `tools/smoke-site.cjs` against the staged site: passed at 390px and 834px, including Muju save/reload, Forge art and gameplay, and Oracle combat/restart.
- `npm run test:online:e2e`: all 112 tests passed in 3.6 minutes. The final phone settings and invitation screenshots were inspected.
- `npm test`: 243 test files passed; 3,435 tests passed and 17 existing tests skipped (413.38 seconds). Existing quarantine settings are unchanged.
- DAG validation passed; existing historical exclusions and missing local-only Academy media are unchanged and not needed for this online feature.

## Deployment and live evidence

Pending release. Pre-deployment persistence witness: room `6951d7ed6f719976b699f21fae31dad9`, revision 91, timeout result; canonical JSON state SHA-256 `275fc3fc2b3e44d90f48b67945a81c36f98831b653c0cf57358518ae4c476298`.
