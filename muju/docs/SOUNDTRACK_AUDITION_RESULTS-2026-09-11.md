# Hono audition results — round one

Completed twelve excerpts: three directions, two takes per direction from each provider. Both API integrations work. The local listening page includes every clip, optional provider reveal, approximate volume matching, favorites, notes, and original MP3 downloads.

Open [the listening player](http://127.0.0.1:8766/). If it was already open with six clips, refresh to load the Lyria additions. Existing take letters, audio URLs, favorites, and notes retain their identities.

## Listening order

Try one direction at a time and ask: would this remain enjoyable through several matches? Notice the melodic hook, rhythmic energy, harsh percussion, and whether the koto gesture feels integrated with the chip voice. Reveal providers after forming a preference. Notes stay in that browser; tell Codex your favorite letters and observations to guide the next pass.

| Direction | Target | ElevenLabs takes | Lyria takes |
| --- | --- | --- | --- |
| Lantern Circuit | 116 BPM; warm bass, koto gestures, understated broken beats | B, E | G, I |
| Crystal Garden | 104 BPM; resonant plucks, FM bells, dub echoes | C, F | H, L |
| Sixfold Current | 128 BPM; soft breakbeats, smooth bass, spacious chip replies | A, D | J, K |

These BPM values and instrumental descriptions are prompt targets, not measured results. This pass was requested as instrumental throughout. Listening review, cultural phrasing, melodic quality, and prompt adherence remain for audition; the agent checked file integrity and levels but could not listen through its available audio input tools.

## Files and checks

- Originals and redacted request receipts: `muju/music-auditions/round-1/`.
- Player: `muju/music-auditions/player/dist/index.html`, with twelve unchanged MP3 copies.
- Manifest: `muju/music-auditions/round-1/audition-manifest.json`.
- All twelve requests completed with HTTP 200; all twelve audio files decoded and have distinct SHA-256 hashes matching their saved receipts.
- ElevenLabs excerpts last 30.000–30.048 seconds. Lyria excerpts last 23.406–30.746 seconds. Take J is the shorter 23.406-second result; take K lasts 28.186 seconds. The player displays actual lengths.
- All Lyria files reach a decoded sample peak of full scale. This is recorded for listening review; it does not by itself establish audible distortion. Playback matching attenuates the louder excerpts and leaves originals untouched. It uses RMS, not integrated LUFS or verified perceived-loudness equality.
- Player JavaScript syntax and local asset references passed checks. The local page returned HTTP 200. No browser listening/interaction test was performed.

These are unedited audition excerpts. They have not been cut into seamless loops or mastered as final soundtrack tracks.

## Usage and integration

Lyria used `lyria-3-clip-preview` through the Gemini Interactions endpoint. Six completed generations are estimated at **$0.24**, using the documented $0.04-per-clip rate. One earlier request was explicitly rejected for zero free-tier quota; its receipt is archived under `round-1/rejected/`. After the user added credit, the retry succeeded.

ElevenLabs used `music_v2`, `music_length_ms: 30000`, and `force_instrumental: true`. The six completed requests represent **three requested audio minutes**, estimated at **$0.45** using the documented $0.15/minute API rate. The key can generate music but lacks `user_read`, so the account's remaining allowance and actual billed amount were not obtained.

Combined estimated generation usage: **$0.69**, excluding subscription/deposit commitments and any tax. These are estimates, not billing receipts. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) and [ElevenLabs API pricing](https://elevenlabs.io/pricing/api) were checked while preparing this audition.

The runner limits this round to six saved request slots per provider and skips completed slots. It stops for review on failed or ambiguous requests. Keys remain in the ignored local environment file and are excluded from player assets.

## Resume locally

Rebuild the player from saved files without generating more audio:

```sh
python3 muju/tools/build-music-player.py
```

If the local server is no longer running, serve only the player output directory:

```sh
python3 -u muju/tools/serve-music.py
```

The generation runner is `muju/tools/music-audition.py`; its `preview-round` command reports remaining slots without network requests. Both providers have zero remaining round-one slots. No later-round generations have been requested. Select the strongest direction before testing Muju and Gölge or making longer arrangements.
