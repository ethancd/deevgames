# Muju piece gallery

Standalone phone gallery for the 18 images and definitions in the parent
`muju/print/baroque-concepts-v1` design study. `dist/` is the complete static
deployment, including an element filter and accessible image viewer.

Images are WebP exports of the original imagegen PNGs, with 640 px previews and
full 1254 px views. Their appearance is not retouched. The canonical definitions,
original assets and generation prompts remain in the parent Muju project.

`.openai/hosting.json` identifies the Sites project. Deploy only this directory's
`dist/` assets and the hosting configuration. Local design records, source
receipts, credentials and the rest of the game repository are not site assets.
