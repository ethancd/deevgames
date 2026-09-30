# Prompt: build the model comparison gallery

Read the shared brief and consume the generated manifest, concepts, models, renders, and validation records. Build a polished local gallery under `outputs/muju-physical-set-v1/gallery/` for inspecting all three complete variants. This task requires a working gallery, not a mockup. Follow applicable repository instructions; keep it separate from the existing Muju game and Baroque gallery. External publishing is not part of this prompt.

Generate gallery content from the manifest so missing parts, inventory changes, and validation status cannot silently drift from the models. Use lightweight actual-mesh GLB previews with a suitable viewer, alongside still renders for fast loading and accessible fallback. Do not require access to a modeling application. Avoid loading hundreds of repeated high-resolution meshes merely to show the full board; reuse geometry/instances.

The main experience should let a user:

- Compare the three variants at the same scale, camera angle, palette, and lighting. Give each a short design rationale and obvious actual-model preview.
- Choose an element, owner, and tier to inspect all 36 assembled states per variant. Orbit, zoom, reset the camera, and switch to exploded construction. At T3, show and label all three base layers separately.
- Switch between an upright glyph and that same glyph lying down as a pending summon. Inspect the keyed joint and how a loose marker fits next to an occupying piece.
- Browse every printable component family: all six glyphs, ownership bases, T2 additions, T3 additions, ordinary/home tiles and connector subtypes, crystals, half token, and fit coupons. Show dimensions, material/color, quantity per set, orientation, and available downloads.
- Inspect crystals stacked one through four high, bottom sockets and top studs, tile joins, and 0/4/8/16 resource tile examples.
- View a full 10 × 10 board and a close-up of a crowded tile patch, with medium-gray ordinary tiles, exactly two owner-colored home tiles, and the canonical initial crystal distribution.
- Compare concept art with the corresponding actual model renders. Label them clearly; generated concept imagery must never be the sole evidence for a supposedly finished component.
- Download individual STLs, appropriate 3MF packages, full variant ZIPs, editable source, the BOM, and calibration instructions. Explain geometry-only versus slicer-configured downloads where relevant.

Keep engineering detail in optional part details; make the default view about the objects and their construction. Use explicit labels and shape cues in addition to colors, readable contrast, responsive layouts, keyboard-accessible controls, and meaningful image descriptions. Use neutral studio lighting that preserves warm copper metal and translucent cyan crystals. Show actual validation status without implying unperformed physical tests.

Provide a reproducible local build/serve command and verify it in a browser. Check desktop and narrow mobile layouts, every variant filter, every part category, all assembly combinations through manifest validation, and representative interactive states by actually viewing them. Verify model loads, downloads, exploded transforms, home tile colors, and absence of browser errors. Save screenshots and a concise QA record. A contact sheet should remain usable if interactive rendering is unavailable.

Finish with links to the local gallery entry point and its README, plus the model/print packages. Make the local server URL clear if a server is running; do not claim a localhost URL is publicly accessible. If external hosting is later requested, handle it as a separate authorized publishing step.
