# EMBER — Visual Target

This file pins the target look for a successful demo screenshot (Scenario 3:
dim ember, stalking wolf, DEFEND mode). An image generated from the prompt below
may be shared back into the session as a reference; workflows should treat the
**layout and mood** as the target, not the exact rendered text (image models
mangle small text — the authoritative strings live in PLAN.md).

## Canonical reference images

Generated from the prompts below and adopted as the WF2 rendering targets:

- `reference/night-defend.png` — Scenario 3, DEFEND mode at night.
- `reference/day-explore.png` — healthy daytime EXPLORE contrast frame.

Treat layout, palette, glow falloff, panel structure, and mood as the target.
Details from the renders now **adopted into the spec**:

- Pilot-view interoception shows a fourth `temperature` row (COOL/WARM) with
  per-row confidence percentages in a right-aligned column.
- Ground-truth meters each get a small icon (🔥🌡⚡🛡🌙⚖-style pixel glyphs)
  and a sparkline to the right of the value.
- Intent card is a full-width tinted banner below the drives (amber in DEFEND,
  teal in EXPLORE) with a small glyph.
- Mode chip is an outlined pill (red DEFEND / green EXPLORE) on the same row
  as `wolf: <FSM state>`.
- Event-log values are color-coded by topic (mode red, resources orange,
  paths green).
- Dotted amber path line for the current route; speech bubble in cream with
  pixel font.

**Non-canonical** (image-model inventions to ignore): the `deer` entity in the
day frame's event log (no deer in scope), the day frame's painterly sub-tile
detail (real renderer uses strict 16×16 tiles; match palette and density, not
per-pixel foliage), and any numeric inconsistencies between panels — real
numbers come from the kernel.

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

## Variant B — daytime EXPLORE (healthy-state reference frame)

Contrast image showing the same UI when the body is well-regulated: wide glow
blending into daylight (vs. small circle in darkness), panels agreeing (vs.
diverging), green EXPLORE chip (vs. red DEFEND), short urgency bars, and the
wolf present only in ground truth ("PATROL (far)") while absent from the pilot
view — it's outside perception.

### Image-generation prompt (Variant B)

A high-fidelity screenshot of a 2D pixel-art survival simulation game running
in a dark-themed web app, 16:9 desktop viewport. The layout is split: the left
two-thirds is the game canvas, the right third is a vertical stack of dark
slate-colored UI telemetry panels with clean sans-serif text.

Game canvas (left): Crisp 16×16-pixel-tile pixel art, integer-scaled with
sharp square pixels, no anti-aliasing, limited 32-color palette. A sunny
wilderness at midday: warm green grass tiles and dense pine-forest clusters
under soft golden daylight, scattered gray rock outcrops, a small blue pond
glinting in one corner, fallen deadwood logs, and a stone den entrance at the
top edge. Bright golden sunpatch tiles shimmer on open grass. At center: a
small ember-spirit character — a floating teardrop-shaped flame creature,
burning bright golden-orange with a lively flickering core — casting a wide,
generous circle of warm light that blends into the daylight, with a cheerful
trail of four or five drifting spark particles behind it. No wolf anywhere;
the scene feels open and safe. Above the ember, a small white pixel-art speech
bubble reads: "Warm. Plenty of light. Ranging east." A thin dotted path line
traces a long exploratory route curving east across the map toward unexplored
forest.

UI panels (right, top to bottom): (1) A panel titled "PILOT VIEW" showing an
interoception readout: rows of qualitative labels like "capacity: HIGH",
"activation: LOW", "stability: HIGH", each with a small confidence percentage,
and a drives list with thin, mostly short urgency bars — "explore 0.62",
"fuel 0.31" — plus a calm teal intent card reading "skill: move_to →
east_forest (cautious: off)". (2) A panel titled "GROUND TRUTH (dev)" with six
horizontal meter bars in muted colors (fuel nearly full in bright orange, heat
comfortable in warm yellow, activation low in green, damage empty, fatigue
low, stability high) each with a tiny sparkline history, a green mode chip
reading "EXPLORE", and a line "wolf: PATROL (far)". (3) A narrow scrolling
event-log ticker with monospace lines like "t=312 world.resource.detected
sunpatch" and "t=308 skill.completed gather". Bottom bar: pixel-style
pause/step/play controls, "1× 4×" speed toggles, a seed field, and a dropdown
reading "Pilot: Claude".

Overall mood: bright, warm, and inviting — a healthy well-regulated creature
ranging confidently through daylight; the two right-hand panels agree with
each other and show comfortable green/full readings. Game canvas is pure retro
pixel art; the surrounding UI is modern, minimal, dark-mode dashboard styling.
Sharp, legible, no photorealism, no 3D.
