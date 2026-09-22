# Muju Academy · Metal revision

Course notice preparation, September 19: the release builder warns that R01,
R04–R07, R09 and R10 teach the previous turn order. This is a course-page change
only, prepared but not deployed. The recordings remain v7/v8; a re-narration is
still pending.
See `../docs/changes/2026-09-19-academy-phasing-notice.md` for the exact website
patch and verification evidence.

Notice reworded, September 21: Standard was retired and the turn order these
lessons teach is simply the previous one, not one of two rule sets. The notice
strings in `build-release.py` and the assertions in `verify-live.py` were changed
together; still prepared, still not deployed. See `STATUS.md`.

Production source for **16 episodes**: ten rules lessons, then Fire, Lightning,
Water, Shadow, Plant and Metal. The later strategy episodes are retired from
the published course. Earlier production packets remain untouched.

Rules authority: `../SPEC.md` and `../src/game/`; the exact working snapshot is
in `rules-snapshot/`. Published September 18, 2026: R05–R06 and R11–R16
use v8 / rules v2.9 for the Metal change; the other eight lessons
retain verified v7 media because they contain no changed Metal claims.
See `metal-v29-provenance.json` and `STATUS.md` for final speech, render and package evidence.
`export-rules.ts` verifies all 324 ordered unit matchups with `resolveCombat`.
Every element video contains a separate full-health bonk matrix for each tier,
showing all 18 potential targets and all 18 potential attackers. Same-type
enemy matchups are included. Damage thresholds do not imply reachable attacks.

Click retains his original code-drawn face and now has four lights. All nine
approved final music mixes are assigned in each episode’s `soundtrack` field.
Speech remains foreground; the music fades out during thinking pauses.
Coordinates are rendered as `J10`, including when spoken as “J ten”.

`revise.py` applies the narrative revision to immutable `qa/previous-episode.json`
copies. `update-visuals.py` revises the three established renderer families.
`supplement.tsx` supplies additional rule cards, the current map and tier matrices.
`timeline.mjs` formats captions separately from speech pronunciation.

The active release uses the original OpenAI cast. The user explicitly authorized
this on September 13. New and repaired narration is generated through OpenAI;
recordings are verified locally with faster-whisper, with character names mapped
back to canonical spelling and board coordinates displayed numerically. Prior
voice takes are archived. The optional ElevenLabs adapter is retained for later
use once that account's speech permissions are enabled.

`audio-batch.py` preserves unchanged OpenAI takes. `transcribe-local.py` checks
changed recordings without uploading them, and `align-current.py` builds timed
captions. `render-batch.py` renders, masters, and checks the complete export.
`master.mjs` pads both audio branches before normalization and checks the final
stream duration, preventing end-of-episode truncation. All videos must pass full
decoding, source-audio correlation, quiet-hold, loudness, and visual review before
`build-release.py` packages the public site.

Deployment target remains the existing `https://ashkie.com/muju-academy/`.
This revision is live from website commit `3b67c3e32b2b8eb10fb08540a6ee79c51a3f958c`.
The release checkout is `/private/tmp/muju-academy-v8-deploy`; `STATUS.md` and
`../docs/changes/2026-09-18-metal-yan.md` record publication and live verification.
Only verified final videos, posters, transcripts, and the course page are deployed.
Production logs and exports stay local. The source takes and prior published
versions are preserved outside the deployed site.

Previous release, September 13, 2026: all 16 v6 lessons (70 minutes 56 seconds total),
with OpenAI voices and all nine music tracks. Deployment and full live checks
passed. See `STATUS.md`, `logs/final-release-summary.json`, and
`logs/live-final.log` for the release and verification evidence.

The v2.8 revision uses home squares at 8, expansions at 16 and 504 crystals
overall. Plant Mining is 3/5/8. The Academy map uses the exact game reserve
palette, with 16-crystal expansions white and brighter than the 8-crystal home
and middle squares. `propagate-economy.py` records the one-time migration from
the archived final v6 source; do not rerun it over current production.

The release builder keeps exact historical-media redirects before the retired
lesson wildcards. Cloudflare Pages requires static rules first; otherwise the
last rules can exceed its dynamic redirect budget. The live verifier checks
this order and every historical redirect.

Published v7 on September 13, 2026: all 16 lessons, 71 minutes 12 seconds,
with the v2.8 economy. All current live media and seeking passed. Historical
redirects are corrected and pass fresh requests; a few bare old URLs may retain
a pre-fix cached fallback for up to four hours. See `STATUS.md` and
`logs/v7-final-release-summary.json` for exact deployment and QA evidence.
