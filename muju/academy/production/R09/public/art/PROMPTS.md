# Episode 1 artwork provenance

Built-in ImageGen was used. Final PNGs were copied into this project; no API key was needed for image generation. Both delivered assets have a genuine alpha channel and were inspected in rendered episode frames.

## PIP happy

Use case: illustration-story. Asset type: reusable character cutout for a children's animated strategy-game teaching video called Muju Academy. Create PIP, a charming original small seedling mascot: a rounded pear-shaped jade-green body, two leafy sprout ears, big ivory eyes with dark plum pupils, tiny expressive brows, little mitten hands and brown root feet, a mustard-yellow explorer scarf. Whole body visible, three-quarter front pose, one hand raised eagerly, slightly mischievous friendly smile. Premium playful 2D television illustration, clean chunky dark teal outlines, flat colors with restrained cel shading, strong simple silhouette, polished and appealing for ages 7–12. Transparent background with real alpha; no ground, no shadow rectangle, no scene, no text, no logo, no watermark. Centered single character with generous clear padding on all sides. This is an original teaching mascot, not a game-board unit illustration.

Source output: exec-ad4a3d2d-d3ed-4679-b441-e7f34d4686fd.png. Delivered as pip-happy.png.

## PIP surprised

Reference: the happy PIP asset above.

Edit this exact character cutout to make a second animation pose: PIP has just realized his brilliant plan was a silly mistake. Keep exactly the same character identity, outfit, colors, proportions, line style, full-body framing and transparent alpha background. Change expression to wide surprised eyes, one eyebrow raised, a small round open mouth. Lower the raised fist to a little palms-up shrug, both hands visible. Same two leaf ears, yellow scarf, green rounded body and brown root feet. Friendly comic surprise, not distress. No text, no extra characters, no background, no ground. Preserve generous padding.

The first edit had a baked-in checkerboard. A second built-in ImageGen edit used this prompt:

Background extraction ONLY. Remove the entire gray-and-white checkerboard background from this character and return a PNG with genuine transparent alpha outside the character silhouette, including all spaces around the arms, scarf, ears and feet. The checkerboard in the input is baked-in pixels and must be removed, not repeated. Keep the actual character pixels, expression, colors, pose, size and framing unchanged. Do not create any new background or checkerboard. Transparent cutout asset.

Source output: exec-e89a286f-01b6-47df-abe5-5dccf4357aa9.png. Delivered as pip-oops.png.

## Other graphics

The board uses the exact current resource map. Unit tokens reuse the game's UnitArtwork and ElementGlyph components from the recorded source commit. CLICK, crystals, pizza, arrows, cards, and teaching diagrams are original code-driven vector graphics in src/video.tsx. All animation follows the Remotion frame clock.

## Episode 2 reuse and new vector props

The two original transparent Pip poses are reused unchanged for cast continuity. Episode 2 adds an original frame-animated SVG rig with exactly eight numbered cardboard arms; the ending attaches four colored hats. These props are authored in src/video.tsx, not generated raster images.
