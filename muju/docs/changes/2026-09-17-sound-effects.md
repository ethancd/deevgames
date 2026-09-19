Historical release note ported from the local outputs/ folder on 2026-09-18; not edited.

# Muju sound effects

Source checkout: `/private/tmp/muju-phone-release-20260917`.
Release commit: `16a701e5ead363690ceee3e90e556dd99d95d571` (pushed to `master`).
Published at https://deevgames-muju.onrender.com/muju/ on 2026-09-17.

Eight short, locally synthesized effects: movement (85 ms), surviving attack
(95 ms), capture (120 ms), starting to phase (140 ms), arrival/placement
(115 ms), promotion (140 ms), turn end (75 ms), and turn start (120 ms).
Dry, percussive sounds with no reverb or musical flourish; default level is 35%.

The **♫ Sound and music** panel has a separate effects toggle, level slider,
and **Test sound** button. Settings persist separately from background music.
Audio unlocks on a tap or key press. Hidden tabs stop audio; mute cancels
scheduled cues. Live online moves and instant replay sound each displayed
movement hop. Selecting, undoing, initial loading, replay rewind, and recorded
analysis stay silent.

`preview.wav` plays all eight effects at the default level, in the order above,
with short gaps. It is an audition artifact; the app generates its effects
locally without downloading audio files.

Validation: production build, server TypeScript, 857 tests, and all three
sound/browser scenarios in both Chrome and WebKit passed. Full browser release
suite: 68 passed initially; one existing inspection assertion sampled before
React's reach effect rendered. Its assertion now waits for the visible marker;
both affected ruleset scenarios passed three consecutive runs each. All 69
release scenarios are covered. The source checkout is clean; unrelated work in
the main workspace was preserved.

Live verification: the production page serves `index-DwNlQRAP.js` and
`index-B6k_UblP.css`; health returned `ok: true`. The live **Sound & music**
dialog showed the effects control enabled at 35%, with its test button visible
at 390×664. The test button completed without browser warnings or errors.
Render's dashboard commit check was not repeated: the earlier Google-account
sign-in approval is still pending. Publication was verified through the new
live assets and controls.
