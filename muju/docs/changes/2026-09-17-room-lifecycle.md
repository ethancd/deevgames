Historical release note ported from the local outputs/ folder on 2026-09-18; not edited.

# Muju room lifecycle release

Commit: 03620df8 — Allow invited-seat takeover and archive idle Muju rooms.

- Reusable private invitations rotate the invited seat's token without resetting the game, clock, name or history. The displaced browser switches to read-only observation. Its pending staged plan is cancelled.
- A stale saved credential can be replaced by explicitly joining with the original invitation. Reloading a displaced browser never automatically steals the seat back.
- The old server deleted used invitation hashes. Authenticated original hosts can restore their saved invitation by reopening the room in the original browser. A bare old consumed link cannot be authenticated without this one-time restoration.
- Rooms close and archive after 24 hours since their last successful game action, or creation if no action was played. Reads, joins, takeovers, previews, preferences and private staging edits do not reset the deadline.
- SQLite indexes drive background and startup settlement. Earlier clock deadlines win. Finished results are preserved; abandoned unfinished games have no winner. All boards/history/positions remain reviewable.
- Archived rooms leave the active list and have paginated analysis links in the lobby. Archived rooms no longer consume live room capacity.

Validation:
- Production build and server TypeScript passed.
- 871 tests across 71 files passed.
- 72 Chrome online release scenarios passed.
- All 3 new lifecycle browser scenarios passed in WebKit.
- Inspected phone screenshot of archived Phasing analysis at 390 × 664.

Deployment:
- Pushed 03620df8 to origin/master; Render automatic deployment became healthy.
- Read-only production checks confirmed the new archive endpoint, latest frontend (index-VwPmN3JY.js), 27 archived rooms and zero active rooms (all six formerly active rooms were already over 24 hours idle).
- Public history and exact starting/latest positions remain readable.
- Opened an archived Phasing game in the deployed browser UI at 390 × 664; the whole board and analysis controls fit and its original Black-wins result and seven recorded events remain available.
- Live production takeover mutation test was not run: automatic approval review rejected creating/moving/resigning a production test room and rotating its credentials. No workaround was attempted. Takeover was validated in isolated Chrome/WebKit browser tests; production verification used only read-only requests and UI navigation.
- Render dashboard exact-SHA confirmation remains unavailable without the previously requested account selection; deployment was verified through public new endpoints/assets and the live UI.
