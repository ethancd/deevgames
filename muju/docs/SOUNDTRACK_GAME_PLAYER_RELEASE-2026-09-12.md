# Muju room soundtrack release

Live at https://deevgames-muju.onrender.com/muju/ . Released as commit
`36a438b` on `codex/muju-online-deploy`; the subsequent central-map release
`acd71ed` includes it unchanged. Implementation checkout:
`/private/tmp/muju-room-music`. The shared checkout had concurrent room work,
so it was not reset or force-updated by this task.

The Music button appears in game modes, the online lobby, and the game-room
header. One app-level audio element retains playback through room renders,
turn changes, dialogs and returning to the lobby. Controls provide all nine
selected tracks, play/pause, previous/next, scrubbing, mute, volume, and mutually
exclusive repeat-track/repeat-disc. Repeat disc defaults on; a page reload
requires Play. Preferences are local to each listener. Files load on demand.

All nine original selected MP3s are copied to versioned filenames in
`muju/public/music/`, totaling approximately 59.8 MB without further encoding.
They include the latest Tanka v3 low-medium passage revision and the 19D-based
Umeme full mix. No generation credentials, audition trials, or review notes
were included in the commit. Provenance is in `public/music/sources.json`.

Validation: production build, server types, and the 680-test suite passed.
A final browser-interruption regression was added and all seven player tests
passed afterward. The final production build passed again. Browser tests covered
opt-in playback, persistence into an actual local room, paused forward/backward
seeks, and desktop/375px phone layouts. At first live verification, the production JavaScript bytes matched
the tested build; generated CSS and bundle filenames differed.
All nine deployed MP3s have correct lengths, byte-range support and immutable
caching. A live HTTP 206 range from Tanka exactly matched the source bytes;
browser seeks held at 1:39 and then 0:20 without an audio error. Live music was
left paused, unmuted and ready for the user to press Play.
