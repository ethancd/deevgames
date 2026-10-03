# Explorer compatibility: a wording-only transition (2026-10-03)

Owner-approved audit, recorded with the Learn to Play wording change
([`2026-10-03-learn-to-play.md`](2026-10-03-learn-to-play.md)).

## What changed in the explorer's hashed files

`server/explorer/provenance.ts` hashes `src/game/**`, `server/explorer/**`,
`src/ai/simulate.ts` and `server/observation.ts`. Between the 2026-09-30
release and this branch, exactly two of those files changed, both in text only:

- **`server/observation.ts`, the `rules` text agents read:**
  - `victory` now says "occupy the enemy home until your next own turn starts
    (moving onto it only starts the occupation)". It used to say "hold the
    enemy home until next own turn".
  - `checkmate` now opens by defining home checkmate as an invader that cannot
    be removed before its owner's next turn.
  - No rule, field or adjudication changed.
- **`src/game/replay.ts`:** the replay caption for a Phasing purchase reads
  "Started summoning …" instead of "Started phasing …".

No engine move, score, adjudication, branch rule, explorer controller or schema
changed. As in the 2026-09-30 audit, the changed agent-facing text still counts
as a different source revision. Saved experiments continue only through this
explicit allowance.

## Audited compatibility

`server/explorer/compatibility.ts` allows exactly three earlier full source
hashes, all on the new implementation digest
`f5a0c2f32ceca86fb34a868563bc6a687afdb356e9e679730acf5a1a6da0be6f`:

- `3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a` (`8ed95e54`, audited 2026-09-30)
- `c89676ed18ce8a4495c9a8473ec9a19b02ed294f9cac396caef0eabf18b51e51` (`5c8fff1f`, audited 2026-09-30)
- `fb0e89a76acfce15b6ac0ac64d00cdadc07be32a37d3b07f4c67022d5e64d783`
  (the 2026-09-30 release, implementation `ece5ff5a…`, new here)

The implementation digest covers every hashed file except this data-only
manifest. The new full source hash, which includes the manifest, is
`c26220c04dcec60a58c00a50ab00ffc950bf8f466295bcb57b2c7f12fbe66900`.

Any later edit to the implementation disables these allowances until it is
audited separately. Unknown hashes and changed rules revisions still fail.

## Verification

`npx vitest run tests/server`: 258 passed, including
`tests/server/explorer-provenance.test.ts`. That covers the audited
continuation of both legacy sources, the refusal of changed implementation
bytes, and the refusal of unknown sources and rules revisions.
