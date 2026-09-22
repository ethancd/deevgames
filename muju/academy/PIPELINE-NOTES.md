> Historical v2.2 production reference. Current rules and scope are in README.md and the v6 episode.json files. Old prices, six-action counts, 27-episode scope, and coordinate-caption conventions below are superseded.

# Muju Academy — production notes for the revised scripts
Creative pass · 10 September 2026 · rules v2.2 · applies to `final/R01.md … R27.md`

These notes turn the revised scripts into audio and video with the existing pipeline (episode.json → gpt-4o-mini-tts → timeline → captions → Remotion). Everything here is a change to `write-episode.py` / `speech.mjs` / `timeline.mjs`, not to the game. Detail and rationale are in `analysis/A4-audio-production-brief.md`.

## 1. Script line grammar (what the parser reads)

```
### BEAT                                 INVITATION | RECALL | SHOW | TRY | HOLD | EXPLAIN | TRANSFER | EXIT
[channel: description]                  channels: board, card, sfx, sting, music   (silent; never spoken)
[HOLD 8]                                 the thinking-hold element (§4)
SPEAKER [cue]: spoken text (hold 900)    cue optional, from the closed list in §3; (hold ms) optional
```

- `text` is the only thing sent to TTS, after the alias map (§5). It contains no digits, operators, dashes, ellipses or abbreviations. Numbers are words. Coordinates are "D four".
- Captions are the spoken text verbatim. Digits are allowed in `[card:]` and `[board:]` text only.
- `{cap: …}` is **not used**. Three draft episodes had it; all were converted to `[card:]`.
- Canonical unit spellings (Göl, Gölge, Karanlık) stay in spoken text; the alias map converts them before the request. Add them to the lint's allow-list.
- Do not split a sentence across two lines. Each line is one TTS request with its own contour.

## 2. Voices and per-speaker instruction strings

| Speaker | Voice | Notes |
|---|---|---|
| COACH | marin | unchanged |
| PIP | coral | unchanged; also the Plant gardener in R15 |
| CLICK | cedar | unchanged |
| EMBER | onyx | preserve published episode 09 |
| ZIP | verse | preserve published episode 10 |
| BUBBLES | ballad | preserve published episode 11; slowest guest |
| MURMUR | ash | preserve published episode 12; never spooky |
| CLANK | sage | preserve published episode 14; gentle, never metallic |

Voice assignments above were checked against the existing `episode-09-video` through `episode-14-video/episode.json` files. No recasting is approved. Use the BASE delivery strings in A4 §1.2–1.3 as audition candidates; its guest voice assignments are superseded here. Assemble `instructions = BASE + " " + CUE + " " + TAIL`, where TAIL is the global invariant in A4 §1.1 (speak only the given words; respelled names are pronunciation guides). The cache key must include the assembled instructions.

Course-wide voice rules that the strings encode: Coach never sounds like a correction after a hold; Click never sounds like a countdown and never leans on a rhyme; Pip drops the bounce when Pip is right (`[quietly certain]`).

## 3. Per-line cue vocabulary (closed set; expansions in A4 §2.2)

`[warm, unhurried]` `[gently, slower]` `[counting, even beats]` `[stating the rule, level]` `[curious, thinking aloud]` `[delighted realization]` `[question, open]` `[reveal, land it]` `[deadpan, flat]` `[dry aside]` `[rhyme couplet, light lilt]` `[proud announcement]` `[mock-formal announcement]` `[conspiratorial whisper]` `[cheerfully wrong]` `[quietly certain]` `[dawning concern]` `[rapid, breathless]` `[trailing off, inviting]` `[quoting a phrase]` `[recap, brisk]`

Rules: at most one cue per line; an unknown cue is a build error; high-risk cues (whisper, rapid, delighted, mock-formal, trailing off, cheerfully wrong, proud, dawning concern) are not used on lines with more than one number. `[question, open]` appears exactly once per hold, on the question line. Audition `[delighted realization]` and `[mock-formal announcement]` per take; they over-act.

## 4. Holds and the HOLD ritual

Default post-line silence (ms), inserted by the timeline builder, never requested from the TTS: same speaker 320 · speaker change 550 · after a number fact 600 · counted sequence items 500 · after a joke 900 · after a two-line setup 250 · before the question 500 · after the question 700 · after the ritual 800 · after the reveal 1200 · final line 1500. Explicit `(hold N)` in a script overrides the default for that line.

`[HOLD 8]` renders as a 9.0 s element: soft tone IN (one marimba-family note, ~260 ms, −24 dBFS), 8.0 s of room tone at about −60 dBFS (not digital null), soft tone OUT (same instrument, a third higher). A static caption card shows "Thinking time." and the question. Nothing else: no ticking, pulse, music, depleting ring, countdown numerals, mascot motion, board change, or caption change. The same two tone samples in all 27 episodes. If tones are rejected, use room tone plus the static card and lengthen the surrounding holds to 1000 ms.

R10 has one hold and one un-held check (Pip commits, Click answers). R27 has three holds with chapter cards between stations.

## 5. Alias map (speech text only; longest match first; word boundaries)

Existing, keep: Muju → Moo-joo · Sjor → Shore · Hi → Hee · Yan → Yahn · Tanka → Tahn-kah.
Add: Muju Hono Tanka → Moo-joo HOH-noh Tahn-kah · Hono → HOH-noh · Kagari → kah-GAH-ree · Radi → RAH-dee · Umeme → oo-MEH-meh · Kimubunga → kee-moo-BOONG-gah · Straumr → STROWM-ur · Aegirinn → AY-geer-in · Göl → GUHL · Gölge → GUHL-geh · Karanlık → kah-rahn-LUK · Sachita → sah-CHEE-tah · Sachakuna → sah-chah-KOO-nah · Mazask → MAH-zahsk.
Columns: a bare column letter before a number word is respelled so "A one" is not read as an article and "I ten" is not a pronoun: A → Ay, B → Bee, C → See, D → Dee, E → Ee, F → Eff, G → Gee, H → Aitch, I → Eye, J → Jay. Hyphenate the pair (Dee-four) so the model treats it as one token.
Never run the map on captions, bracketed directions, or the instructions string. Never let the voice drift toward "Tonka" for Tanka; lock the alias and audition once.

The scripts already obey the writing rules that make the map safe: "the Hi" / "a Hi" / "each Hi", never bare "Hi" as a subject, never "Hi's", never the greeting "Hi"; the game is "Muju Hono Tanka" or "the game", the piece is "the Muju"; the stat is always "Mining".

## 6. Silent direction vocabulary and audio limits

`[sting: title bump]` once, after the cold open · `[sfx: token removed]` `[sfx: piece step]` `[sfx: bonk]` `[sfx: bonk, dull]` (non-lethal; a teaching sound) `[sfx: piece removed]` (soft dissolve) `[sfx: crystal clink]` `[sfx: crystal cascade]` `[sfx: bill thud]` `[sfx: shop chime]` `[sfx: blocked, gentle]` (never a buzzer) `[sfx: door latch]` `[sfx: clock settle]` `[sfx: doorbell, one chime]` (R01) · `[music: bed in, low]` / `[music: bed out]` in the invitation and exit only.

Limits: at most 12 audio events per episode; effects peak 8 dB below dialogue; no effect within 400 ms of a spoken number; no distracting audio during thinking time; the two approved boundary tones mark its start and end, and an answer-reveal effect may follow the ending tone; no sting after a viewer's turn to answer.

## 7. Captions and cards

Captions show the spoken words with canonical spellings. Numbers and operators appear on `[card:]` overlays, which stay visible through the hold. The Evidence Card (proves / not checked) appears after the answer. It supplements the explanation; every condition needed to decide the question must also be spoken. Keep only readable short items on the card. The department work cards (R11–R16) accumulate into a visible deck.

## 8. Before bulk recording

The owner approved the technical direction, not a replacement cast. First make short samples using the established voices, the expanded pronunciation aliases and merged delivery instructions. Audition ordinary dialogue, a number-heavy line, a joke and the soft thinking tones. No API request or audition was made during the script correction pass.

Only after that audio check, render R02 as the first full production pilot: it exercises the board, action tokens, a frozen question, pronunciation and character timing. R04 tests reserve depletion and the bucket reveal; R11 tests guest dialogue and attack/defense graphics. These can be short technical samples before their full batches. Capture durations from generated audio before quoting video runtimes.

The proposed HOLD element lasts about nine seconds including its two soft boundary tones. The eight-second thinking interval has static board/words and no countdown, movement or music. If a viewer needs more time, the video can be paused; the line must not imply the video waits indefinitely by itself. An answer-reveal sound belongs after the ending tone. Room tone and tones still need a listening check on actual devices.

## 9. Re-verification

From this folder:

```sh
node --import /Users/ashkie/src/deevgames/muju/node_modules/tsx/dist/loader.mjs ../verify-puzzles.ts
node --import /Users/ashkie/src/deevgames/muju/node_modules/tsx/dist/loader.mjs verify/verify-added.ts
python3 lint.py final --json
python3 verify/check-corrected-packet.py
```

The added suite's imports resolve to the packet's pinned rules snapshot. Check counts and results are recorded in `CORRECTIONS-AND-VERIFICATION.md`; do not reuse the original draft's stale eleven-check total. The engine checks test finite example positions, not every sentence or globally optimal play. Final scripts still require audio listening and rendered-board QA before publication.

## 10. Board continuity and versions

Use the corrected final scripts and their explicit NEW TRIAL/reset directions. Do not interpolate between trials as if the pieces moved for free. Preserve side-to-move, phase, damage, attack eligibility, action tokens, bank, reserves and spare pieces. The R27 mat is addressed to a visitor standing on the other player's home, never to a player standing on their own home.

Before rendering, use `CURRICULUM-AND-BATCHES.md` for production order. R01/R02 omit explicit upkeep/draw teaching. Show a visible video version and the actual render/update date on each replacement video and its page, following the owner's earlier request. Do not reuse "Sep 8" for later renders or guess the next version number: inspect the release it replaces. Keep script IDs R01–R27 separate from the fourteen old release episode numbers.


## v2.2 authority
Use this packet’s final scripts and PRICE-CHANGE.md. Previous verification reports describe historical packets. Purchase/promotion prices doubled. Upkeep, mining, reserves, starting resources and actions are unchanged.


## Full-season production (2026-09-10)

R11–R27 live in production/R11–R27. Sources are rest-video.tsx plus rest-shell.txt in production/, with a copy in each episode. Catalogue cards read the pinned unit-catalog.json. Guest voice mapping and directions are in each episode.json and speech-directions.json.

Speech checks are silent: whole-episode transcription, isolated checks of flagged lines, and sentence-by-sentence takes where a short final sentence was dropped. The four segmented takes have preserved originals and metadata. align-audited-clips.py places verified isolated word timestamps on the current timeline. Never reuse timestamps after changing audio duration without regenerating the timeline.

Export checks decode the whole file, compare every speech clip against its exported audio, check resolution/size, and compare two stills during every thinking hold. For R11 onward, the correlation comparison applies an identical 6 kHz low-pass to source and decoded AAC: high-frequency frication phase can change under AAC, despite matching speech and timing. R12 line 09 scored 0.8078 without filtering and 0.996 after; the timing tolerance (80 ms) and correlation gate (0.90) remain unchanged. No playback is used.

The finale has three distinct hold questions; read line.question rather than the episode-level fallback. Evidence Cards use the left character column so they cannot cover the roster key. rest-render.py applies a fresh visible timestamp and masters to -16 LUFS / -1.5 dBTP. tools/build_muju_release.py requires every export check, including all three finale holds, before publishing.


## Version 5: hosts and phase verbs

The current turn cue is **Pay. Place. Act. Mine.** PAY means paying upkeep at the start; MINE means collecting at turn end. Keep these labels synchronized in R10's strip/chapter headings, spoken script, captions and the R23 recall. Do not regenerate from the older v2.2 packet's four-word cue.

Use the existing transparent PNG character art for speaking hosts, never UnitArtwork tokens. UnitArtwork remains appropriate for actual board pieces and unit-stat cards. Copy ember.png, zip.png, bubbles.png, murmur.png and clank.png into public/art whenever materializing the new shared renderer; Pip uses pip-happy.png. Source originals: ../episode-06-video/public/art. Portrait hashes are recorded in verify/reused-character-art.json.

Version 5 is a mixed release: only R10–R16 and R23 are updated. Other production directories here are symlinks to the prior immutable packet; copy an episode to a new owned directory before editing it. The nineteen unchanged exports keep version 4 and their original dates. The eight replacements have version 5 and fresh dates.

Only five speech clips changed: R10/02, 07, 29, 30 and R23/22. Their isolated transcriptions match exactly. Existing clip-local caption times were preserved; changed clips use their new isolated word timestamps. Original audio is untouched in the prior packet.
