# EMBER — Visual Target

This file pins the target look for a successful demo screenshot (Scenario 3:
dim ember, stalking wolf, DEFEND mode). An image generated from the prompt below
may be shared back into the session as a reference; workflows should treat the
**layout and mood** as the target, not the exact rendered text (image models
mangle small text — the authoritative strings live in PLAN.md).

## What must be true of the real screenshot

- 16:9 split layout: game canvas ~left 2/3, telemetry panel stack ~right 1/3.
- Pixel art: 16×16 tiles, integer scaling, sharp pixels, limited palette,
  no anti-aliasing in the canvas.
- Night scene: cold indigo/teal darkness; the ember's glow radius is small
  because fuel is low — light falloff visibly communicates internal state.
- Wolf silhouette in STALK pose at the edge of the light, pale eyes.
- Speech bubble showing the pilot's non-causal `thought`.
- PILOT VIEW panel: qualitative interoception buckets + confidence + drive
  urgency bars + current intent card. Rendered from the real ContextPacket.
- GROUND TRUTH (dev) panel: six meters with sparklines, red DEFEND mode chip,
  wolf FSM state. Slightly disagrees with pilot view (that's the point).
- Event ticker with `t=… topic` monospace lines; transport controls, speed
  toggles, seed field, pilot selector.
- Mood: cozy-ominous; warm ember light vs. cold night; retro canvas inside a
  modern minimal dark dashboard.

## Image-generation prompt

A high-fidelity screenshot of a 2D pixel-art survival simulation game running
in a dark-themed web app, 16:9 desktop viewport. The layout is split: the left
two-thirds is the game canvas, the right third is a vertical stack of dark
slate-colored UI telemetry panels with clean sans-serif text.

Game canvas (left): Crisp 16×16-pixel-tile pixel art, integer-scaled with sharp
square pixels, no anti-aliasing, limited 32-color palette. A moonlit wilderness
at night: deep indigo-and-teal darkness over a grid of grass and pine-forest
tiles, scattered gray rock outcrops, a small dark pond in one corner, fallen
deadwood logs, and a stone den entrance at the top edge. At center: a small
ember-spirit character — a floating teardrop-shaped flame creature, dim
burnt-orange with a faint flickering core — casting a small, weak circle of
warm orange light that illuminates only the few tiles around it; the rest of
the map falls off into cold blue darkness. Two or three faint drifting spark
particles trail behind it. At the edge of the ember's light, half-hidden
between pine trees, a black wolf silhouette in a low stalking pose with two
pale glowing eyes. Above the ember, a small white pixel-art speech bubble
reads: "Too dim. The den. Now." A subtle vignette and a thin dotted path line
traces the ember's intended route toward the den.

UI panels (right, top to bottom): (1) A panel titled "PILOT VIEW" showing an
interoception readout: rows of qualitative labels like "capacity: VERY LOW",
"activation: HIGH ▲", "stability: LOW", each with a small confidence
percentage, and a drives list with thin urgency bars — "safety 0.81",
"fuel 0.77" — plus an amber intent card reading "skill: flee → shelter(den)".
(2) A panel titled "GROUND TRUTH (dev)" with six horizontal meter bars in muted
colors (fuel nearly empty in orange, heat low in blue, activation high in red,
damage, fatigue, stability) each with a tiny sparkline history, a red mode chip
reading "DEFEND", and a line "wolf: STALK". (3) A narrow scrolling event-log
ticker with monospace lines like "t=1042 body.mode.entered DEFEND" and
"t=1039 world.entity.observed wolf". Bottom bar: pixel-style pause/step/play
controls, "1× 4×" speed toggles, a seed field, and a dropdown reading
"Pilot: Claude".

Overall mood: cozy-ominous, warm ember light versus cold night; the two
right-hand panels visibly disagree slightly (pilot's view is vaguer than
ground truth). Game canvas is pure retro pixel art; the surrounding UI is
modern, minimal, dark-mode dashboard styling. Sharp, legible, no photorealism,
no 3D.

## Variant B (healthy-state reference frame)

Same layout, but daytime EXPLORE mode: bright golden glow with a wide light
radius, no wolf, sunpatch tiles glinting on the grass, green "EXPLORE" mode
chip, fuel meter high, activation low, speech bubble reads "Warm. Plenty of
light. Ranging east." Useful as the contrast image showing what the same UI
looks like when the body is well-regulated.
