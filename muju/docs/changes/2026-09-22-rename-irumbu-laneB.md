# Rename Irumbu — Lane B report (nodes 14–17, 21: Academy)

Branch `claude/muju-rename-irumbu`, worktree `/Users/ashkie/src/deevgames-rename`. Scope: everything
under `muju/academy/` only (Lane A owns the rest). No `git commit`, no push, no deploy, no speech
synthesis. New ashkie-pages worktree created at `/Users/ashkie/src/ashkie-pages-rename` on branch
`claude/muju-rename-irumbu-notice` (base `origin/main`), left uncommitted.

Command used throughout for the grep evidence below:
`grep -ow "<name>" muju/academy/production/R??/episode.json` (UTF-8 locale, word-boundary safe —
verified separately with a Python `\w`-aware regex that `Göl` never matches inside `Gölge`).

## 14. academy-data — changed

`academy/export-rules.ts` asserted the old Metal names (`Yan`/`Mazask`/`Tanka`) and two
demonstration strings named `Hono`. Updated:
- The Metal assertion now reads `[['Poṉ',1,3,0,3],['Veḷḷi',1,4,1,4],['Irumbu',2,5,2,5]]` (stats
  unchanged).
- The `v2.9:` demonstration string and the R03 demonstration string now use the new names
  (`Poṉ`/`Veḷḷi`/`Irumbu`, `Honō`).
- Added a new demonstration entry recording the full rename for provenance (see below).

Ran `cd muju && node --import tsx academy/export-rules.ts` — passed: "324 ordered matchups and
revised movement, Cleave, promotion and draw demonstrations passed." `git status --short academy/`
shows exactly `catalog.json`, `export-rules.ts` and `rules-verification.json` changed;
`bonk-matrix.json` and `map.json` are byte-identical (`git diff --stat` empty) because they key by
stable ID, not display name. Verified `catalog.json` now reads
`Hi, Honō, Kagari, Radi, Umeme, Kimbunga, Sjór, Straumr, Ægirinn, Loş, Gölge, Karanlık, Muju,
Mallki, Sach'akuna, Poṉ, Veḷḷi, Irumbu` for the 18 unit names.

**`rules-verification.json`'s top-level `"rules"` field stays `"v2.9"`** — it tracks the stat
revision (Metal's v2.9 numbers), which is unchanged; only display names moved. A new
demonstration string documents the rename explicitly:
`"2026-09-22: catalogue display names renamed to Honō/Kimbunga/Sjór/Ægirinn/Loş/Mallki/Sach'akuna/
Poṉ/Veḷḷi/Irumbu; IDs, stats and rules unchanged."`

**`rules-snapshot/` and every `production/R??/source-rules/` and `production/R??/src/*.json` copy
were deliberately left untouched** (confirmed: `git status --short academy/production academy/
rules-snapshot` is empty). Reasoning, following the metal-yan precedent and STATUS.md's own
established doctrine for the 2026-09-19 draw-clock change: these are provenance for what each
lesson was *actually recorded against* (the v7/v8 media, which still speaks the old names), not a
live mirror of current rules. `rules-snapshot/` is refreshed only by whichever future release
actually re-records a lesson (it's produced by `propagate-economy.py`, a one-time historical
migration I did not rerun, not by `export-rules.ts`). Regenerating it now would make the
provenance snapshot lie about what the shipped videos say.

## 15. academy-lessons — blocked/deferred: re-voice not authorized

No `episode.json` or renderer source was edited (owner decision: notice, not re-voice). Grepped
every `production/R??/episode.json` for each old name with word boundaries; **15 of 16 episodes
speak at least one renamed piece — every episode except R04**:

| Episode | Old names spoken (count) |
|---|---|
| R01 | Sjor (5) |
| R02 | Sjor (2) |
| R03 | Hono (2), Sjor (13) |
| R04 | *(none)* |
| R05 | Göl (1), Yan (1) |
| R06 | Hono (3), Sjor (4), Yan (2), Mazask (2), Tanka (2) |
| R07 | Hono (6), Tanka (7) |
| R08 | Sjor (14) |
| R09 | Hono (4), Sjor (2) |
| R10 | Hono (5), Sjor (1) |
| R11 | Hono (33), Kimubunga (6), Sjor (7), Aegirinn (3), Göl (5), Sachita (3), Sachakuna (4), Yan (6), Mazask (2), Tanka (15) |
| R12 | Hono (6), Kimubunga (15), Sjor (4), Aegirinn (3), Göl (4), Sachita (2), Sachakuna (4), Yan (10), Mazask (1), Tanka (3) |
| R13 | Hono (4), Kimubunga (4), Sjor (18), Aegirinn (9), Göl (4), Sachita (1), Sachakuna (2), Yan (2), Mazask (1), Tanka (2) |
| R14 | Hono (6), Kimubunga (6), Sjor (6), Aegirinn (4), Göl (17), Sachita (4), Sachakuna (3), Yan (4), Mazask (3), Tanka (3) |
| R15 | Hono (6), Kimubunga (4), Sjor (4), Göl (2), Sachita (7), Sachakuna (9) |
| R16 | Hono (12), Kimubunga (3), Sjor (3), Göl (3), Yan (10), Mazask (7), Tanka (17) |

`Göl` counts exclude occurrences of `Gölge` (verified: `Göl`-substring total minus `Gölge` count
equals the word-boundary count above, for every episode checked). Disposition: blocked/deferred —
the owner's decision is notice-only; re-voicing R01–R03, R05–R16 requires its own speech-synthesis
authorization, same governance as every prior Academy narration change on this repo.

## 16. academy-audio — changed (name lists); media regeneration still blocked

Added every new piece name alongside its old name so recognition/pronunciation lists keep working
for existing (old-name) audio while becoming ready for a future re-voice. No speech was
synthesized; all edits are text-only pattern/dictionary changes:

- `transcribe-local.py`: extended the faster-whisper `initial_prompt` with all ten new names.
- `prepare-audio.py`: extended the pronunciation-hint regex/map (used to bias the OpenAI TTS
  input) with the eight new names whose old counterpart already had an entry, plus a comment
  marking new-name pronunciations as proposals.
- `elevenlabs-speech.py`: extended the `NAMES` respelling dict the same way (this adapter is not
  the active cast, per README, but kept in sync).
- `retake-openai.mjs`: extended the one hardcoded pronunciation example ("Hoh-noh is Hono") to
  note it also covers "Honō".
- `transcribe-new.mjs`: extended the Whisper API `prompt` vocabulary the same way as
  transcribe-local.py (this script is flagged do-not-run in README/STATUS for an unrelated
  earlier rejection; updated anyway per the task list, since it's inert either way).
- `revise.py` and `propagate-economy.py` were **not touched** — both are explicitly named
  one-time historical migrations in README.md/STATUS.md ("do not rerun ... over current
  production").

All five `.py`/`.mjs` files verified: `python3 -m py_compile transcribe-local.py prepare-audio.py
elevenlabs-speech.py` passed; `node --check retake-openai.mjs transcribe-new.mjs` passed.

**Media regeneration remains blocked**, same as the plan's existing node 16 disposition:
`muju/academy/production/R??/public/audio/` is not present in this worktree (archived outside
git at `~/Archives/muju-media-2026-09-18/academy`, original at
`/Users/ashkie/src/deevgames/muju/academy`). I did not fetch or copy media from either location —
out of scope for a notice-only lane, and no speech synthesis is authorized here regardless.

## 17. academy-video — blocked (unchanged from plan)

Not attempted. Confirmed the blocking paths are still absent in this worktree:
`production/R??/output/`, `production/R??/qa/`, `production/R??/public/music/`,
`production/R??/public/art/*.png` (checked `ls production/R01/output` → "No such file or
directory"; `production/R01/` contains only `episode.json, package.json, public, scripts,
source-rules, speech-directions.json, src, tsconfig.json` — no `output` or `qa`). Same missing
archive as node 16. No render or QA work is claimed.

## 21. academy-package — notice extended, compiled, previewed; full package build blocked

**Notice text** (`build-release.py`): added a third `<p id="rename-notice">` paragraph after the
existing `id="phasing-notice"` paragraph (the same course-page notice this repeats the pattern
of). Text: title change, the compact old→new list for all ten pieces, and "These recordings
still use the old names; they have not yet been updated." `METAL = [['Yan',...]]` and the
per-episode `SUMMARIES` text (e.g. "Meet Yan, Mazask, and Tanka…") were **not** changed — they
describe the actual content of the recorded videos (old names), matching the "notice, not
re-voice" doctrine; changing them would make the package metadata lie about what's in the videos.

**`verify-live.py`**: added five assertions requiring the new notice — `id="rename-notice"` count
== 1, the title-change sentence, three spot-checked old→new pairs (`Hono → Honō`, `Yan → Poṉ`,
`Tanka → Irumbu`), and the "have not yet been updated" closer.

Both files: `python3 -m py_compile build-release.py verify-live.py` — passed.

**Preview build**: `build-release.py`'s own `--check-only` packaging run needs
`production/R??/output/` (rendered videos), which is absent here — same block as node 17, so I
did not run it (would fail on a missing path, not prove anything about the notice). Instead,
following the 2026-09-19 precedent's method exactly:

1. Extracted the current `notice` string verbatim from `build-release.py` via Python AST (no
   manual retyping).
2. Took the clean, never-modified published-release checkout at `/private/tmp/muju-academy-v8-deploy`
   (commit `3b67c3e32b2b8eb10fb08540a6ee79c51a3f958c` — this is still the actual live page; neither
   the 2026-09-19 nor this notice has been deployed) and, in a **separate preview directory**
   (`<scratchpad>/rename-preview/`, never the checkout itself), replaced its single old notice
   `<p>` with the three current paragraphs (phasing-notice + rename-notice).
3. Confirmed reversibility: substituting the three paragraphs back for the original one
   reproduces the checkout's `index.html` byte-for-byte (`sha256`
   `8c5169ca51c7c20c77733583ce81fec41666f33ef3803132bfe8ff3b271d25d7` both directions).
4. Ran every applicable page-content assertion from the updated `verify-live.py` (everything not
   requiring live media/`release.json`, which this text-only preview doesn't have) against the
   prepared page — all 17 checks passed, including both the pre-existing phasing-notice
   assertions and the five new rename-notice assertions.
5. Rendered the prepared page with Playwright (from `muju/node_modules`) at 1280px (desktop) and
   390px (phone): horizontal overflow was 0px at both widths; the `#rename-notice` box fits fully
   inside the viewport at both sizes. Screenshots inspected — text is legible, diacritics
   (Honō/Sjór/Ægirinn/Loş/Poṉ/Veḷḷi) render correctly, no visual overflow or clipping.
6. Evidence saved to `<scratchpad>/rename-preview/{original-index.html,index.html,desktop.png,
   phone.png,desktop-rename-focus.png,verification.json}` (scratchpad, not committed anywhere).

The shared `/private/tmp/muju-academy-v8-deploy` checkout was **not modified** — only read from.
No website files changed, no deployment occurred, no full media package was built or claimed.

## ashkie-pages

New worktree: `git -C /Users/ashkie/src/ashkie-pages worktree add
/Users/ashkie/src/ashkie-pages-rename -b claude/muju-rename-irumbu-notice origin/main` (fetched
first; default branch confirmed `main` via `git remote show origin`). The pre-existing shared
checkout at `/Users/ashkie/src/ashkie-pages` was never edited (it retains its own unrelated
in-progress changes, confirmed by `git -C /Users/ashkie/src/ashkie-pages status --short` showing
only cube-generator files, none of them mine).

Changed in the new worktree, title only ("Muju Hono Tanka" → "Muju Hono Irumbu"):
- `index.html:146` — home-page game link label.
- `music.html:31` — music page `<h1>`.
- `music.html:326` — MediaSession `artist` metadata.
- `patch-notes.json` — new dated entry (schema: `date`/`emoji`/`title`/`notes[]`, newest-first,
  one entry per feature deploy per the file's own `_comment`), inserted above the existing
  2026-09-22 "Cube rescue!" entry:
  ```json
  {
    "date": "2026-09-22",
    "emoji": "🏷️",
    "title": "Muju's new name: Muju Hono Irumbu!",
    "notes": [
      "Muju Hono Tanka is now called Muju Hono Irumbu.",
      "Ten pieces got new names too—for example, Tanka is now called Irumbu.",
      "The rules and the way pieces fight are exactly the same. Only the names changed.",
      "The Muju Academy videos still say the old names until they get new voices."
    ]
  }
  ```

Soundtrack track titles ("Hono / Banked Fire", "Tanka / Weight Without Hurry" at `music.html:73,
100`) were **not** touched, per the brief. Earlier historical `patch-notes.json` entries that
mention "Muju Hono Tanka" (lines describing past announcements, e.g. "Muju Hono Tanka is first!")
were **not** rewritten — they're dated historical records, consistent with the brief's rule
against rewriting old dated docs. Did not touch `muju-academy/` in this worktree (generated by
`build-release.py` at deploy time, out of scope here).

`python3 -c "import json; json.load(open('patch-notes.json'))"` confirms valid JSON.

`git -C /Users/ashkie/src/ashkie-pages-rename status --short`:
```
 M index.html
 M music.html
 M patch-notes.json
```
Diff summary: `3 files changed, 14 insertions(+), 3 deletions(-)`. Left uncommitted, as instructed.

## Decisions taken

1. **`rules-verification.json`'s `"rules"` field stays `"v2.9"`.** It tracks the stat revision,
   not the display-name revision; nothing else in the repo reads that field for a name check
   (checked: only `export-rules.ts` writes it, only `propagate-economy.py` — untouched — reads
   `rules-verification.json` at all). Provenance for the rename is instead recorded as a new
   `demonstrations[]` entry.
2. **`rules-snapshot/` and every episode's `source-rules/`/`src/*.json` copy are untouched** —
   treated as rendering-time provenance, following the established STATUS.md doctrine for the
   2026-09-19 quiet-turn-clock change and the metal-yan precedent's "rendering subsets" reasoning.
3. **Added new-name entries to every pronunciation/ASR list that already had an entry for the
   corresponding old name** (`Hono→Honō`, `Kimubunga→Kimbunga`, `Aegirinn→Ægirinn`, `Göl→Loş`,
   `Sachita→Mallki`, `Sachakuna→Sach'akuna`, `Mazask→Veḷḷi`, `Tanka→Irumbu`), and additionally
   added `Yan→Poṉ` and (in `prepare-audio.py`/`elevenlabs-speech.py` only) `Sjor→Sjór`, even
   though the old names `Yan`/`Sjor` had no entry in those two files — conservative choice, since
   the new spellings introduce diacritics (`ṉ`, `ó`) that plain English pronunciation rules won't
   get right, and the brief instructs adding new names "where a list drives recognition or
   pronunciation." All new-name respellings are marked in-code as proposals for a future re-voice,
   not verified pronunciations, matching the BIBLE.md treatment.
4. **`METAL` and `SUMMARIES` in `build-release.py`, and `release['metal']` in `verify-live.py`,
   were left at the old names.** They describe the actual content of the packaged/released
   videos, not the current game — changing them would make the release manifest misdescribe what
   viewers actually see.
5. **Preview build used the AST-extraction + substitution method from the 2026-09-19 precedent**
   instead of a full `build-release.py --check-only` run, because the media bundle
   (`production/R??/output/`) this worktree needs for that command is absent (same block as node
   17/plan node 16-17) — recorded as blocked with the exact missing path rather than fabricating a
   packaging result.
6. **New ashkie-pages patch-notes entry kept separate** from the same-day "Cube rescue!" entry
   rather than merged into it, per the file's own `_comment`: "Every feature deploy adds an
   entry."

## Coordinator deploy steps (quoted from `academy/README.md` and the 2026-09-19 precedent's
   Release handoff, adapted for this notice)

`academy/README.md` states the release procedure is: "Only verified final videos, posters,
transcripts, and the course page are deployed. Production logs and exports stay local." — i.e.
this text-only notice change ships as a course-page-only patch, the same shape as the 2026-09-19
T7 notice. Concretely, once this lane's work is merged and committed:

1. Start from a fresh, verified `ethancd/ashkie-pages` checkout and reread its AGENTS.md/napkin
   instructions (do not reuse a stale `/private/tmp` checkout without re-verifying it).
2. Copy the updated `academy/build-release.py` notice text (now three paragraphs: the base
   recordings note, `id="phasing-notice"`, and the new `id="rename-notice"`) into that checkout's
   `muju-academy/index.html`, replacing the currently-live single-paragraph notice — the exact
   substitution this report's preview performed against `/private/tmp/muju-academy-v8-deploy`.
3. Copy the updated `academy/verify-live.py` to the website's `tools/verify_muju_videos.py`.
4. Add the required website patch note (matching this lane's `patch-notes.json` entry above, or
   the coordinator's own consolidated one covering both lanes).
5. Regenerate and check the offline manifest under that repository's own procedure, then run
   `./check`.
6. Publish only under the existing authorization policy (this task explicitly forbids deploying).
7. Run the full live `verify_muju_videos.py` and visually inspect the deployed page before
   marking this notice live — the same closing step the 2026-09-19 precedent specifies.

No step above was executed against the live site or the shared `ashkie-pages` checkout by this
lane; everything above is a plan for the coordinator, not a claim of completion.
