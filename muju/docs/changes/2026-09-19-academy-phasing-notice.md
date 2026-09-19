# T7 Academy Phasing notice — prepared, not deployed

Branch: `codex/phasing-academy-notice`, base `bfd6964e`.
Scope: the immediate course-page notice from plan Step 8. No game rules,
narration, captions, render source, media or historical release records changed.

The release builder now labels recordings as Standard v2.8/v2.9 rather than
claiming those are the current rules. A visible notice names R01, R04–R07, R09
and R10, gives the Phasing sequence, explains delayed/refundable public summons,
and explicitly says the videos have not yet been updated for Phasing.
`verify-live.py` requires this notice while retaining all existing checks for
mixed v7/v8 lesson revisions, exact media, seeking and redirects.

## Verification

- Both modified Python sources parse/compile. `git diff --check` passes.
- Extracted the actual `notice` string from the builder's Python AST and replaced
  the exact old intro in the clean website release checkout at
  `/private/tmp/muju-academy-v8-deploy`, commit
  `3b67c3e32b2b8eb10fb08540a6ee79c51a3f958c`, into a separate preview directory.
  Reversing that replacement reproduces the entire original HTML byte for byte.
  The shared `/Users/ashkie/src/ashkie-pages` checkout is older and contains peer
  changes; it was not used as the release baseline or edited.
- Ran all ten page-content assertions from the modified live verifier against
  the prepared page, including unchanged lesson counts, revision counts and no
  autoplay. Video/source URLs and all article content are unchanged.
- Headless Chromium rendered the notice at 1280px and 390px. Both screenshots
  were inspected; text is readable and contained. Document widths equal their
  viewports, with no horizontal overflow. Evidence is in
  `t7-academy-notice-2026-09-19/{desktop,phone}.png`.
- `verification.json` records the exact original/prepared page hashes and
  assertions. `website-notice.patch` contains only the course intro change.
- No full production media rebuild, full website check, live URL check,
  publication, or AI gate is claimed. These require the actual release stage.

## DAG dispositions

Command: `python3 tools/muju-content-dag.py plan --files muju/academy/build-release.py muju/academy/verify-live.py --format json`.

| Node | Disposition | Evidence |
|---|---|---|
| academy-package | changed, preparation complete | Builder/verifier and exact page patch; syntax/content/layout checks above. |
| academy-deploy | blocked by existing no-publish boundary | No master/main merge, push or deployment authorized in the coordination contract; release patch prepared. |
| release-verification | blocked pending deployment | Local notice verified; no claim about changed live content. |

The unselected `academy-video` prerequisite remains the preserved, published
mixed v7/v8 release; this notice does not relabel it as Phasing or claim new QA
for the videos. The later v9 lesson/data/audio/video work remains separate and
pending; absence of local media does not prevent preparing this text-only notice.

## Release handoff

After release ownership and publication scope permit it, start from a fresh
verified website checkout and reread its AGENTS/napkin/offline instructions.
Apply `t7-academy-notice-2026-09-19/website-notice.patch` with `git apply --check`
first; if the intro changed since this baseline, reconcile it deliberately.
Copy the updated `academy/verify-live.py` to website
`tools/verify_muju_videos.py`. Add the required website patch note, regenerate
and check its offline manifest under that repository's procedure, run `./check`,
then publish only under the existing authorization policy. Run the complete
live verifier and visually inspect the deployed page before marking T7 live.
Do not run a media repackaging just to apply this notice or overwrite newer
website changes with the old baseline.

Proposed one source commit: `docs(muju-academy): prepare Phasing turn-order notice`
with the two Python files, README/STATUS additions and this change/evidence folder.
Commit and integration IDs are recorded in the shared coordination board;
publication remains pending.
