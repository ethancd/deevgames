# 🌋 Rock Stars — Geology Quiz

A tablet-friendly geology memorization app for kids, modeled on state/capital quiz
apps: closed sets you can fully master, fast tap interactions, satisfying score
screens. Single-page React app, no backend, works offline.

## Run it

```bash
npm install      # first time only
npm run dev      # open the printed URL (http://localhost:5191/)
```

Build for production: `npm run build` then `npm run preview`.

## What's inside

**Five decks (levels):**
1. **Mohs Hardness** — number ↔ mineral (quizzable in either direction)
2. **Mineral Formulas** — mineral → chemical formula
3. **Geologic Time** — eon/era/period → start (Mya), with sub-group filtering
4. **Rock Families** — rock → igneous / sedimentary / metamorphic
5. **Ores & Metals** — ore → metal

**Two modes per deck:**
- **Training** — flip cards with images, forward/back nav, shuffle toggle. No scoring.
- **Test** — multiple choice (distractors drawn from other answers in the same deck),
  instant right/wrong feedback, pick 10 or the whole set, then a score screen showing
  percentage and exactly which ones to review.

Best score per deck/direction/sub-group is saved to `localStorage` and shown on the
home screen (100% earns a 👑).

## Content & images

- All quiz data lives in `src/data/decks.js` — edit there to change facts.
- Images are downloaded locally into `public/assets/` so the app works offline.
  `npm run fetch-images` (re-)fetches them from Wikimedia Commons.
  - `public/assets/manifest.json` maps each image slug → filename.
  - `public/assets/credits.json` maps each file → source URL, license, and author.
- Any item without an image shows a clean labeled placeholder instead of guessing.
  To swap a specific image, drop a file in `public/assets/` and point its slug at it
  in `manifest.json` (or tweak the search term in `scripts/fetch-images.mjs` and re-run).
