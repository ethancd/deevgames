# Game forks with fresh clocks — 2026-09-29

This is the historical implementation record. The subsequent authorized release is tracked in [the production release record](2026-09-29-game-forks-release.md).

Base commit: `6f72a47b7e62392eebae667965f8b2a750118c6e`. Implementation is in the existing working tree; no feature commit or deployment was created. Unrelated pre-existing edits were preserved.

## Behavior

Create a separate online game from the current room or a recorded history sequence/AP step. Omitted time control inherits the source; explicit null is untimed; presets/custom controls use normal bounds. Both banks and the full delay reset, and the saved player to move starts only when the opponent joins. Timeout/abandonment resumes the exact interrupted turn; other terminal positions require an earlier playable position. The original verdict stays saved.

Gameplay state is preserved, including partial actions, damage, resources, mining/kill-clock counters, preparation/upkeep and public summons. Seats, invitations, request receipts, staged plans, undo/replays and clock pace samples start independently. Fork provenance links the original room, revision and optional position. A stale source is rejected. Retired rules are not reinterpreted; match policy is inherited, and scoped experiment services deny forking.

## DAG disposition

Plan: `python3 tools/muju-content-dag.py plan --kind online --kind mcp --kind ui --format json`. Existing server-runtime/browser path coverage includes the new files, so the DAG structure needs no feature edit.

| Node | Status | Evidence / scope |
| --- | --- | --- |
| `browser-ui` | changed | Room and timeout-result fork entry points; selected replay step support; shared mobile fork dialog. Browser lifecycle tests cover creation, custom/untimed/inherited controls, stale-source review, invitation admission and continued play. |
| `printable-tokens` | verified unchanged | No piece names, stats, glyphs, artwork or physical geometry changed. |
| `piece-gallery` | verified unchanged | No catalogue, rendering or design changes; no gallery release required. |
| `server-runtime` | changed | Atomic new-room creation from authoritative GameState; independent credentials/history/clocks/staging, public provenance and inherited match policy. Additive optional persisted metadata; no schema migration or rules-version change. |
| `mcp-tools` | changed | muju_fork_room on HTTP MCP and stdio; observe exposes public provenance; scoped experiment services deny the new route/tool. |
| `agent-guides` | changed | ONLINE.md, player/time-awareness skills, MCP tool guidance and analysis documentation describe fork semantics and controls. |
| `academy-lessons` | verified unchanged | No rules, economy, piece stats or lesson positions changed. The optional online fork controls do not alter the existing offline lesson boards; no affected episode IDs. |
| `academy-audio` | verified unchanged | No changed spoken content or pronunciations; no speech generation required. |
| `academy-video` | verified unchanged | No affected lesson scripts, board states or captions; current and historical exports preserved. |
| `game-validation` | changed | New store/MCP/browser fork coverage; expanded scoped-service rejection coverage. Exact verification results below. |
| `static-package` | changed; Muju artifact prepared | npm run build regenerates Muju dist, including the new dialog and current skill assets. A complete three-game _site release is outside this feature request and was not packaged. |
| `server-package` | changed; source prepared | Server types and real HTTP/stdio tests validate the host implementation; SQLite close/reopen tests validate fork persistence. Docker/release configuration is unchanged; no production image built. |
| `academy-package` | verified unchanged | No lesson or media changes; no Academy package required. |
| `static-deploy` | not requested | No static release attempted; this feature is not live. |
| `server-deploy` | not requested | No server deployment attempted; production rooms and persistent storage were not edited. |
| `academy-deploy` | not requested | No Academy release required or attempted. |
| `release-verification` | changed; local evidence only | This record distinguishes implemented and locally tested behavior from deployment. No live release claim. |

## Verification

- `npm run server:types`: passed.
- `npm run build`: passed after the final dialog changes; regenerates WASM, browser assets and public skills.
- Focused server suite (`forks`, `clocks`, `room-lifecycle`, `mcp`, `match-scope`, `match-policy`): 67 tests passed.
- `npm test`: 220 files passed, 1 file failed; 3,013 tests passed, 1 failed, 17 skipped. Existing quarantine settings were unchanged. The sole failure is `tests/server/music.test.ts:34`: its lookup of `tanka-flute` returns undefined because pre-existing local changes in `src/music/tracks.ts` replaced that track with `irumbu-veena`. The fork implementation does not edit either file.
- `npm run test:online:e2e`: 87 tests passed before the last dialog refinements.
- Final `npm run test:online:e2e -- room-lifecycle.spec.ts`: all 6 passed against the final build, including preserving custom settings after source refresh and recovering credentials when local storage is unavailable.
- Inspected the final phone screenshots in `test-results/room-lifecycle-forks-a-tim-c3f76-working-opponent-invitation/`: settings and invitation are usable at 390×664, with the long settings form scrolling inside the dialog.
- `python3 tools/muju-content-dag.py check`: valid, 29 nodes / 52 edges. `git diff --check`: clean.

The first HTTP integration attempt inside the sandbox could not bind loopback (`listen EPERM`); the authorized rerun with local networking passed. No production room was created, forked, modified or deployed during implementation.

Built browser artifact: `dist/assets/index-BlWLb1uz.js` (SHA-256 `4dfb7e5e86d8ffb4ac92515dec1a157537c439b37edaeb281e8a75eac04fa945`).
