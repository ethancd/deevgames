## Published Metal v8 update — 2026-09-18

Published to https://ashkie.com/muju-academy/ at website commit
`3b67c3e32b2b8eb10fb08540a6ee79c51a3f958c` (Actions run 35381455284).
All 48 exact media assets, 48 seek ranges, 120 historical redirects and 33 retired
assets passed live verification. Desktop/phone page and R16 playback at 110s
were visually checked. This supersedes unpublished status in the preparation
record below. R05–R06 and R11–R16 are v8/rules v2.9; other lessons retain verified
v7 recordings. Phasing remains a separate variant.

# Metal v2.9 · local release complete · 2026-09-18

All eight affected videos—R05, R06 and R11–R16—are rendered as v8 / rules v2.9,
mastered and reviewed. The other eight lessons retain their verified v7 media.
Yan and all three Metal ATK/DEF/Speed/Mining rows match the current game:
1/3/0/3, 1/4/1/4, 2/5/2/5. Current phasing is retained; the separate phasing
variant is outside this revision.

The user explicitly authorized speech synthesis on 2026-09-18, resolving the
earlier approval rejection. All 32 changed clips use the established OpenAI cast;
seven received targeted repairs. Local small.en/medium.en verification found no
unresolved differences. Captions and ASR records identify the current audio hashes.
Unchanged takes and the nine existing music tracks are preserved.

All 324 exported speech clips across the eight revised videos passed audio
correlation and timing checks (minimum 0.90994; maximum offset 0.048 seconds).
Full decode, complete duration, loudness, peaks and quiet thinking holds pass.
Thirty final-export frames were visually reviewed, including every element-tier
matrix and the revised Metal roster, mining example and stationary-Yan exercise.
Each final-review.json identifies the exact video, timeline and reviewed frames.

The complete 16-lesson package passed build-release.py --check-only and was built
in `/private/tmp/muju-academy-v8-metal-site`, from website source snapshot
`6145c0f6025c80fc08bc4da293182defa8dd24ca`. Local serving verified all 48 media
assets, 48 byte-range seeks, 120 historical redirects and 33 retired assets.
Desktop and phone layouts and Metal playback seeking passed. The offline manifest
has 7,681 URLs: exactly 16 new and 16 removed poster/transcript URLs, zero net delta.
The shared website checkout was not modified. This package has not been published.
A future deployment must incorporate it into a freshly verified website checkout.

Prior source and media are preserved in `archive/v8-metal-source/`; prior website
media in `archive/v8-site-replacement/`; retakes and verification attempts in
`archive/retakes/` and `archive/v8-*-take-qa/`. Production remains R01–R16.
Evidence: `logs/metal-v8-final-release-summary.json`,
`logs/metal-v8-speech-current.json`, `metal-v29-provenance.json`, and
`../docs/changes/2026-09-18-metal-yan.md`.

---

# Muju Academy v7 · complete · 2026-09-13

All 16 revised rules and element lessons are rendered, mastered, reviewed and
live at https://ashkie.com/muju-academy/. Content commit
`50d790a3cbb819128830ad4ff70bb2480daec7fc` and redirect follow-up
`ff8ad1be3e705f22b20e4682f00bb7c9b18a856e` deployed successfully.
Final deployment: https://github.com/ethancd/ashkie-pages/actions/runs/34759093518.

Completed:
- Ten rules lessons and six element lessons, video version 7 / rules v2.8.
- Home squares 8, expansions 16, 504 crystals overall, Plant Mining 3/5/8.
- Exact game reserve colors, including brighter expansion squares, in the map
  card and real starting-board scenes; revised narration, examples and stat cards.
- Original OpenAI voices, all nine songs, Click's four lights, numeric coordinate
  captions, and all 18 tier matrices. All 324 bonk outcomes remain unchanged.
- Ten changed voice clips verified locally; all 586 final exported speech clips
  passed audio correlation and timing checks. Unchanged voice takes preserved.
- All 16 videos are 1920×1080 MP4 with fast-start, complete audio, controlled AAC
  peaks, and quiet static thinking holds. Final visual reviews identify exact
  current video and timeline hashes, including all 18 element matrix frames.
- All 48 current media assets and 48 seek ranges passed live exact-byte checks.
  All 33 retired strategy assets passed; the course still ends at R16.
- The page was visually reviewed. `./check` reports no failures. The manifest has
  7,666 URLs, exactly 32 old/new poster/transcript replacements and zero net delta.
- The temporary preview browser and port 9410 listener are closed. All earlier
  listeners survived. The isolated website checkout is clean.

Historical-link cache note: all 96 replacement redirects pass on fresh requests.
The original release put static redirects after strategy wildcards, which made
late rules exceed Pages' dynamic budget. The follow-up fixes their order and
adds a permanent check. A few bare old URLs can retain the earlier cached fallback
for up to four hours; current course links are unaffected. Available local Pages
credentials cannot purge the zone cache. This temporary CDN state does not need
another content deployment. The user was informed.

Evidence: `logs/v7-final-release-summary.json`, `logs/v7-live-final.log`, and
`logs/v7-fresh-historical-links.json`. The full live log contains the passing
current-asset checks followed by the old-link timeout; the separate fresh-link
report confirms the fixed configuration. Earlier failure logs are preserved.

Production is `production/R01` through `R16`. Current `episode.json` and
`src/timeline.json` are authoritative. Do not rerun `revise.py` or
`propagate-economy.py`; these migrations would overwrite final narration repairs.
The old v6 source and replaced audio are in `archive/v6-production`; previous
public v6 media and page are in `archive/v7-replacement`. Do not reuse that archive
for another package. `archive/v6-replacement` preserves still earlier media.

Use OpenAI voices as explicitly chosen by the user. Verify speech locally with
faster-whisper. Do not run `transcribe-new.mjs`; API transcription uploads were
rejected by automatic review in an earlier turn. No voice or render work remained for that published v7 release.

The separate music-page task is orthogonal: Academy retains music mixed into
videos and its existing streaming/download availability. Shared deevgames has
unrelated work; none was staged or overwritten. The isolated website checkout is
`/private/tmp/muju-academy-v6-release`.
