# Rename Irumbu — Lane A report (nodes 1–13, 18)

Branch `claude/muju-rename-irumbu`, worktree `/Users/ashkie/src/deevgames-rename`, base commit
`6bafc862` (catalogue and language labels already renamed). Scope: everything except
`muju/academy/**` and the ashkie-pages site (Lane B), which I did not touch. No `git commit`,
push, deploy or `build-all.sh` was run. Full mechanical census method: word-boundary grep/Python
scan for each old name (`Kimubunga`, `Sjor`, `Aegirinn`, `Sachita`, `Sachakuna`, `Mazask`, `Yan`,
`Tanka`, `Hono` outside the title, `Göl` not `Gölge`) plus the three title spellings
(`Hono Tanka`, `hono-tanka`, `HONO TANKA`), scoped to `muju/src muju/server muju/public muju/tests
muju/e2e muju/tools muju/lab/solver muju/lab/harness muju/*.md muju/docs/*.md index.html README.md
AGENTS.md portfolio docs`, excluding the brief's named historical/soundtrack/academy paths.

## 1. catalogue — changed (verified, not re-done)

Paths: `muju/src/game/units.ts`, `muju/src/game/types.ts`, `muju/src/game/elements.ts`.

**Disposition: verified unchanged (pre-existing from commit `6bafc862`).** Evidence:
`git show 6bafc862 -- muju/src/game/units.ts muju/src/game/elements.ts muju/src/game/types.ts`
confirms all ten display names (`fire_2` Hono→Honō, `lightning_3` Kimubunga→Kimbunga, `water_1`
Sjor→Sjór, `water_3` Aegirinn→Ægirinn, `shadow_1` Göl→Loş, `plant_2` Sachita→Mallki, `plant_3`
Sachakuna→Sach'akuna, `metal_1` Yan→Poṉ, `metal_2` Mazask→Veḷḷi, `metal_3` Tanka→Irumbu) and the
three language labels (Water "Old Norse", Shadow "Turkish", Metal "Tamil"/"South Asia"; Plant
"Quechua" — Plant's `Quechua/Nahuatl`→`Quechua` edit is also in this commit) are exactly as the
BRIEF specifies. Stable IDs, stats, prices and promotion gaps are byte-identical apart from the
name/language fields. `muju/tests/game/elements.test.ts` already asserts the four language labels.

## 2. transitions — changed

Paths: `muju/src/game/`, `muju/src/ai/simulate.ts`, `muju/src/hooks/useGameState.ts`, `muju/lab/harness/`.

**Disposition: changed.** No rule, legality or transition logic touched — only two comments named a
piece by its old display name:
- `muju/src/game/board.ts`: `getStartingPositions` doc comment, `Sjor`→`Sjór` (×4 occurrences).
- `muju/lab/harness/bots/probes.ts:243`: `Sjor`→`Sjór` in a combat-advantage comment.
- `muju/src/game/replay.ts:36`: per the BRIEF's specific instruction, this comment is about a
  *historical* rule (why old Metal recordings aren't re-split at the current Speed), so it was
  reworded to reference the stable ID `metal_1` instead of any display name, rather than swapped to
  the new name: `"Old recordings may contain metal_1 moves from before it became stationary."`
`muju/src/hooks/useGameState.ts` and the rest of `muju/src/game/` — verified unchanged (no hits).

## 3. rules-docs — changed

Paths: `muju/SPEC.md`, `muju/AI_ENGINE_README.md`, `muju/docs/AI_IMPLEMENTATION_STATUS.md`,
`muju/docs/PHASING-2026-09-16.md`, `muju/docs/STRATEGY_GUIDE-2026-09-12.md`,
`muju/docs/strategy-guide-codex-vs-claude.md`, `docs/game-design-dossier.md`, `portfolio/index.html`.

**Disposition: changed.** `SPEC.md` is the largest edit in this lane:
- Title (H1 and "Overview" opening sentence): `Muju Hono Tanka` → `Muju Hono Irumbu`.
- The "Retained from v2.9" summary paragraph and every DEF/Speed callout: `Yan`→`Poṉ`,
  `Mazask`→`Veḷḷi`, `Tanka`→`Irumbu`.
- §1 overview starting-position bullets: `Sjor`→`Sjór`.
- §6 element table's Theme column and the Shadow rename footnote (`Göl`→`Loş`): Water
  "Norse/Europe"→"Old Norse/Europe", Shadow "Turkish-Slavic"→"Turkish", Plant
  "Quechua-Nahuatl"→"Quechua", Metal "Lakota/N. America"→"Tamil/South Asia".
- §7's six per-element tables (all ten renamed names) and section headings (Water "Norse"→"Old
  Norse", Shadow "Turkish/Slavic"→"Turkish", Plant "Quechua/Nahuatl"→"Quechua", Metal
  "Lakota"→"Tamil"); the "Metal ladder is Poṉ → Veḷḷi → Irumbu" sentence; and the title-mapping
  sentence, rewritten to state explicitly that the title keeps ASCII `Hono` (no macron) even though
  the tier-2 piece itself is Honō.
- Added a **v3.2 (2026-09-22)** entry to both the "Spec version" header block and the History
  paragraph, stating display names/labels changed, no rule moved, and `muju-phasing-2` is
  unchanged — see `JUDGMENT_LOG.md` J-023.
- Historical text left untouched on purpose: the "History:" line for v2.9 ("renames Inyan to
  Yan") stays exactly as written — it is a record of a past rename, not current naming.

`docs/AI_IMPLEMENTATION_STATUS.md`: one sentence renamed (`Yan`→`Poṉ`). `AI_ENGINE_README.md`:
verified unchanged (no old-name hits). `docs/PHASING-2026-09-16.md`: verified unchanged (no
old-name hits; it is about turn order, not names). `docs/game-design-dossier.md` and
`portfolio/index.html`: the "Muju Hono Tanka" title mentions renamed (two and one occurrence
respectively).

`docs/STRATEGY_GUIDE-2026-09-12.md` and `docs/strategy-guide-codex-vs-claude.md` are **dated**
docs per the BRIEF — body text (which still uses all ten old names throughout, e.g. "Göl
(shadow_1...)", "a Hono promoted to a Kagari") was deliberately **not** rewritten. Each got one new
blockquote line appended to its existing supersession-note block, mapping every old name to its
new one and pointing at `JUDGMENT_LOG.md` J-023, matching the block's established format from the
v2.9/v3.0/v3.1 predecessor notes already there.

## 4. browser-ui — changed

Paths: `muju/src/components/`, `muju/src/App.tsx`, `muju/src/main.tsx`, `muju/src/hooks/useAI.ts`,
`muju/src/index.css`, `muju/src/utils/colors.ts`, `muju/src/utils/positionReport.ts`,
`muju/src/utils/compactReport.ts`, `muju/src/sound/`, `muju/src/music/`, `muju/public/music/`,
`muju/index.html`, `muju/public/previews/`.

**Disposition: changed.** `muju/src/components/InstructionsModal.tsx`: added
`const metal1 = getUnitDefinition('metal_1')` and rewrote the Movement page's literal — "Yan has
Speed 0: it cannot move..." now reads `{metal1.name} has Speed {metal1.speed}: it cannot move...`,
i.e. it derives the name and stat from the catalogue instead of a hardcoded string, per the BRIEF's
specific instruction; also fixed the "Win the game" page's `Hi, Sjor and Muju` → `Hi, Sjór and
Muju`. `muju/src/components/GameScreen.tsx` and `ModeSelect.tsx`: `<h1>Muju Hono Tanka</h1>` →
`Muju Hono Irumbu` (both game screens). `muju/src/music/MusicPlayer.tsx`: the music-panel caption
"Nine full tracks · Muju Hono Tanka" → "...Muju Hono Irumbu" (the *game* title only — the nine
track titles inside the `<select>`, sourced from `src/music/tracks.ts`, are untouched, per the
BRIEF's "Deliberately NOT changed" soundtrack rule). `muju/index.html`: `<title>` and the
`<link rel="alternate">` skill href (see node 12). `muju/public/music/README.md`: line 4's game
title only ("Muju Hono Tanka and published..." → "...Muju Hono Irumbu and published...");
line 5's "Tanka includes the v3 low-medium middle-passage revision" is the *track* name and was
left as-is.

Verified unchanged (no old-name hits): `App.tsx`, `main.tsx`, `hooks/useAI.ts`, `index.css`,
`utils/colors.ts`, `utils/positionReport.ts`, `utils/compactReport.ts`, `src/sound/`,
`src/music/tracks.ts` (soundtrack titles, deliberately unchanged), `public/previews/`.

## 5. persistence — verified unchanged

Paths: `muju/src/game/migrate.ts`, `muju/src/game/replay.ts` (see node 2), `muju/src/game/moveHistory.ts`,
`muju/src/utils/persistence.ts`, `muju/src/components/TurnReplay.tsx`, `muju/src/online/RoomHistory.tsx`.

**Disposition: verified unchanged**, except `replay.ts`'s one comment (recorded under node 2 — it's
the same file, but the change belongs conceptually to the historical-recording rule, not a UI or
persistence-format change). `migrate.ts`, `moveHistory.ts`, `persistence.ts`, `TurnReplay.tsx`,
`RoomHistory.tsx`: no old-name hits; migration/schema logic is keyed by stable ID and schema
version, never by display name, so a display-name rename requires no migration and none was added.

## 6. wasm-tactics — verified unchanged; rebuilt

Paths: `muju/assembly/tactics.ts`, `muju/src/ai/wasm/`, `muju/asconfig.json`.

**Disposition: verified unchanged.** No old-name hits in the AssemblyScript source or the WASM
bridge (the kernel packs stats/attack powers by stable ID, never display name). Rebuilt via
`npm run ai:wasm` (runs automatically as the `pretest`/`prebuild` hook of `npm test` and
`npm run build`, both green — see node 18); `git status` shows no diff under `assembly/` or
`src/ai/wasm/`.

## 7. ai-search — verified unchanged

Paths: `muju/src/ai/` (excluding `hard/`, covered in node 8), `muju/lab/ai/`, `muju/lab/docs/`,
`muju/AI_ENGINE_PLAN.md`, `muju/AI_ENGINE_QUESTIONS.md`.

**Disposition: verified unchanged.** No old-name hits anywhere in `src/ai/` outside `src/ai/hard/`,
nor in `lab/ai/`, `lab/docs/`, or the two AI engine planning docs — this layer works entirely in
stable IDs and numeric stats.

## 8. hard-ai — changed

Paths: `muju/src/ai/hard/`, `muju/src/ai/hardOptIn.ts`, `muju/docs/hard-ai/`.

**Disposition: changed.** `muju/src/ai/hard/gen/promote.ts:195`: comment `"REACH — speed upgrades,
including stationary Yan becoming mobile."` → `"...stationary Poṉ becoming mobile."` (this is a
*current*-behavior comment, unlike `replay.ts`'s historical one, so it took the new display name
per the BRIEF's distinction). `hardOptIn.ts` and the rest of `src/ai/hard/`: verified unchanged —
the replica is entirely stable-ID/stat based. `docs/hard-ai/` is excluded from the rename by the
BRIEF except for one dated doc it names explicitly:
`docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md` got a four-line supersession note prepended
(it turned out to contain no old display names at all — the note documents that fact and points at
J-023 for completeness, since the BRIEF named this file explicitly).

## 9. ai-strength — verified unchanged; one known test collision (see "Decisions taken")

Paths: `muju/lab/hard-ai/`, `muju/tests/ai/hard/`, `muju/tests/lab/`,
`muju/docs/hard-ai/RELEASE-2026-09-18.md`, `muju/docs/hard-ai/EPIC-PLAN-2026-09-16.md`.

**Disposition: verified unchanged, with one reported test failure.** This is a **display-name-only**
change: no rule, weight, evaluation or search behavior moved, so per this node's own governing
principle ("a rules change invalidates every existing strength claim") **no re-measurement, re-pin
or new release record is implied** — `muju-phasing-2` and every existing ladder/suite/perft result
remain valid evidence, unpooled, exactly as before. `docs/hard-ai/RELEASE-2026-09-18.md` and
`EPIC-PLAN-2026-09-16.md` are historical release records under `docs/hard-ai/` and were correctly
left untouched (never edit an old release record).

`muju/tests/ai/hard/*.test.ts` — nine files needed only comment/string renames (`Sjor`→`Sjór`,
`Yan`→`Poṉ`, `Göl`→`Loş`); see node 18 for the full list and diffs.

**One pre-existing test in `muju/tests/lab/` fails as a side effect, and I did not fix it — see
"Decisions taken" below**: `tests/lab/suites-phasing-manifest.test.ts` byte-pins the *entire*
`muju/package.json` file (via `artifactPins()` in `lab/hard-ai/suites/phasing/run.ts`) as part of
the committed `fixtures/v2/manifest.json` release bundle, and my mandatory `package.json`
description edit (node 3/4's title-string requirement) moved that pin.

## 10. server-runtime — changed

Paths: `muju/server/rooms.ts`, `muju/server/schema.ts`, `muju/server/http.ts`, `muju/server/index.ts`,
`muju/server/clockPressure.ts`, `muju/server/matchPolicy.ts`, `muju/server/matchScope.ts`,
`muju/tools/engine-seat`, `muju/docs/ENGINE-SEAT-MATCH-2026-09-19.md`, `muju/src/online/`, `muju/ONLINE.md`.

**Disposition: changed.** `server/http.ts`: the `/api/muju/health` `game:` field
(`'Muju Hono Tanka'`→`'Muju Hono Irumbu'`) and the `/SKILL.md` route, which now serves
`skills/muju-hono-irumbu/SKILL.md` instead of the old directory (the BRIEF requires the canonical
route to serve the *new* directory; the old slug is kept only as a static compat file — see node
12). `server/index.ts`: the stdout log line renamed. `src/online/OnlineLobby.tsx`: the `<h1>` and
the "agent skill file" link href, now `/muju/skills/muju-hono-irumbu/SKILL.md`. `ONLINE.md`: the
skill-file paragraph updated to name the new canonical path, with a new sentence noting the old
`muju-hono-tanka` path still works as a redirect notice. `rooms.ts`, `schema.ts`,
`clockPressure.ts`, `matchPolicy.ts`, `matchScope.ts`, `tools/engine-seat`,
`ENGINE-SEAT-MATCH-2026-09-19.md`: verified unchanged (no old-name hits; protocol/schema code has
no display-name dependency).

## 11. mcp-tools — changed

Paths: `muju/server/mcp.ts`, `muju/server/stdio.ts`, `muju/server/observation.ts`,
`muju/server/agentSchema.ts`, `muju/server/notation.ts`, `muju/server/analysis/`,
`muju/tools/benchmark-analysis.ts`.

**Disposition: changed.** `server/mcp.ts`: the MCP server's `instructions` string opening sentence
("Play Muju Hono Tanka using..." → "...Muju Hono Irumbu..."). `server/observation.ts`: the
`rules.game` field (`'Muju Hono Tanka'`→`'Muju Hono Irumbu'`). `stdio.ts`, `agentSchema.ts`,
`notation.ts`, `server/analysis/`, `tools/benchmark-analysis.ts`: verified unchanged (no old-name
hits — none of these hardcode a piece or game display name).

## 12. agent-guides — changed

Paths: `muju/public/skills/`, `muju/server/skills.ts`, `muju/docs/MCP_TOOL_TAPS.md`,
`muju/docs/ANALYSIS_TOOLS.md`, `muju/ONLINE.md`.

**Disposition: changed.**
- `git mv muju/public/skills/muju-hono-tanka muju/public/skills/muju-hono-irumbu`; inside the moved
  `SKILL.md`, renamed the `name:`/`description:` frontmatter, the `# Muju Hono Tanka` H1, and the
  Metal-catalogue closing line (`Yan (metal_1)... Mazask... Tanka...` → `Poṉ (metal_1)...
  Veḷḷi... Irumbu...`, with "Yan cannot move" → "Poṉ cannot move").
- Created a new `muju/public/skills/muju-hono-tanka/SKILL.md` whose body is the **complete, current**
  new skill (all 473→475 lines, so the existing "twenty plies" draw-clock text is still present for
  `tests/server/draw-clock-statements.test.ts`), prefixed with a one-line moved-notice pointing at
  the canonical path, per the BRIEF's exact instruction ("a copy... whose body is the new skill
  with a one-line note at the top").
- `muju/public/skills/muju-time-awareness/SKILL.md`: one title mention in the `description:`
  frontmatter (`Muju Hono Tanka`→`Muju Hono Irumbu`).
- `server/skills.ts`: verified unchanged — it only resolves the time-awareness skill's file path
  and has no `muju-hono-*` slug reference.
- `docs/MCP_TOOL_TAPS.md`: title in the opening sentence; the skill-file path in the "Rules and
  schemas live in..." line (now points at the new slug); five piece-name mentions in the worked
  examples (`Aegirinn`→`Ægirinn` ×2, `Yan`→`Poṉ`, `Tanka`→`Irumbu`, one grammar fix "a Tanka"→"an
  Irumbu" alongside the rename).
- `docs/ANALYSIS_TOOLS.md`: the public-skill link updated to the new slug.
- `ONLINE.md`: counted under node 10 above (same file, same edit).

`e2e/online.spec.ts` (BRIEF calls this out specifically): the href assertion updated to
`/muju/skills/muju-hono-irumbu/SKILL.md`. `tests/server/draw-clock-statements.test.ts`
deliberately still names the **old** path (`'public/skills/muju-hono-tanka/SKILL.md'`) in its
`it.each` fixture list — that's correct and untouched, because the compat file is required to
still state the current twenty-ply rule, and it does (verified: the online-e2e suite, which
exercises the actual served file at that path, is green — see node 18).

## 13. balance-analysis — changed

Paths: `muju/lab/solver/`, `muju/lab/results/current-static/current.json`,
`muju/lab/results/current-static/current.md`.

**Disposition: changed.** Solver source (`lab/solver/`) needed no edit — it already reads names
from the live catalogue. Ran, in order, from `muju/`:
- `npm run balance:static` → `{"variant":"current","distinctStatProfiles":18,"sameTierDominated":[],
  "noMissionWitness":[],"noSoleCheapestWitness":[],"elapsedSeconds":0.137}`.
- `npm run balance:check` → identical result object, `--check` mode, exit 0.
- `npm run balance:types` → `tsc -p lab/solver/tsconfig.json --noEmit`, clean, exit 0.

`git diff --stat -- muju/lab/results/current-static/` shows both files changed (24 lines total).
`current.md` now prints all ten new names in its per-unit witness table, e.g. `| Honō (fire_2) |`,
`| Poṉ (metal_1) |`, `| Veḷḷi (metal_2) |`, `| Irumbu (metal_3) |`, `| Sach'akuna (plant_3) |`,
`| Ægirinn (water_3) |`, `| Loş (shadow_1) |`, `| Mallki (plant_2) |`, `| Kimbunga (lightning_3) |`,
`| Sjór (water_1) |` — confirmed by grepping the regenerated file. 18 distinct stat profiles, zero
dominance, zero missing witnesses — identical shape to the pre-rename report, as expected for a
display-name-only change. `lab/solver/baseline-*.json` left byte-untouched (`git status` confirms
no diff under `lab/solver/`).

## 18. game-validation — changed; one pre-existing test failure reported, not fixed

Paths: `muju/tests/`, `muju/e2e/`, `muju/vitest.config.ts`, `muju/playwright.config.ts`,
`muju/playwright.online.config.ts`, `muju/playwright.hard.config.ts`, `muju/server/tsconfig.json`,
`muju/tsconfig.json`.

**Disposition: changed** (test/e2e files updated), **with one reported, un-fixed regression**.

### Tests updated
Mechanical piece-name renames (word-boundary, verified no JS/TS string-quoting breakage — see
"Decisions taken" for the apostrophe issue this caught and fixed): `tests/game/units.test.ts`,
`tests/game/combat.test.ts`, `tests/game/movement.test.ts`, `tests/game/metal-v29.test.ts`,
`tests/game/audit-fixtures.test.ts`, `tests/server/mcp.test.ts`, `tests/server/history.test.ts`,
`tests/ai/hard/action.test.ts`, `tests/ai/hard/geometry.test.ts`, `tests/ai/hard/make-unmake.test.ts`,
`tests/ai/hard/metal-v29.test.ts`, `tests/ai/hard/promote.test.ts`, `tests/ai/hard/purchase.test.ts`,
`tests/ai/hard/root-exposure.test.ts`, `tests/ai/hard/spawn.test.ts`, `tests/ai/hard/threat.test.ts`,
`tests/ai/wasm-tactics.test.ts`, `tests/hooks/online-inspection.test.tsx`.

`tests/game/tier3-cap.test.ts` needed a real (not purely mechanical) fix: it builds its expectation
from `lab/solver/baseline-v1.3.json` (historical, byte-frozen — correctly left untouched) with a
`name` override that, before this change, applied **only to the metal element** (because metal was
the only element whose display name had ever diverged from that 2026-09-08 baseline, via the
2026-09-18 Yan rename). Today's rename means **seven more elements** now diverge from the v1.3
baseline's stored names (`fire_2`, `lightning_3`, `water_1`, `water_3`, `shadow_1`, `plant_2`,
`plant_3`). I added a `RENAMED_2026_09_22` name-override map covering all ten renamed IDs and
applied it in place of the metal-only branch — this is exactly the "fixture stays, test's
expectation is scoped explicitly" pattern the BRIEF asked for, matching the 2026-09-18 precedent.
Without this fix the test would have failed on seven elements' names, not just passed vacuously.

`tests/server/music.test.ts`, `tests/ai/hard/catalog.test.ts`: verified unchanged on inspection —
their `Tanka`/`tanka` occurrences are, respectively, an unchanged *track* title/id (soundtrack,
correctly out of scope) and a local variable name (`const tanka = DEF_INDEX.get('metal_3')`, not
display text).

E2E specs updated: `ai-worker.spec.ts`, `analysis.spec.ts`, `cleave.spec.ts`, `metal.spec.ts`
(also renamed the test title and `aria-label` regexes), `mobile.spec.ts`, `online.spec.ts` (both
the `Sjor`→`Sjór` assertion and the skill-href assertion — see node 12), `pass-play.spec.ts`,
`phasing.spec.ts`, `player-side.spec.ts`, `upkeep-draw.spec.ts`, `upkeep-undo.spec.ts`,
`upkeep.spec.ts`.

### Commands run

- `npm run server:types` → `tsc -p server/tsconfig.json`, clean, exit 0.
- `npm test` (`vitest run`, includes the `pretest` WASM rebuild): **1 failed | 2944 passed (2945
  tests total, in 211 passed | 1 failed of 212 test files)**. Duration 363.72 s. The one failure is
  `tests/lab/suites-phasing-manifest.test.ts` — see "Decisions taken".
- `npm run build` (`tsc && vite build`, includes the `prebuild` WASM rebuild): clean, exit 0. Both
  `dist/skills/muju-hono-irumbu/SKILL.md` and `dist/skills/muju-hono-tanka/SKILL.md` (compat)
  confirmed present in the built output with correct content.
- `npm run test:online:e2e`: **84 passed, 0 failed** (2.8 min), against the isolated in-memory host
  on port 8928.
- Served `dist` at `http://127.0.0.1:8927/muju/` (via a symlinked `muju/` directory under `npx
  serve`, matching `playwright.config.ts`'s default `MUJU_BASE_URL`), then ran
  `npm run test:e2e -- e2e/metal.spec.ts e2e/mobile.spec.ts`: **18 passed, 0 failed** (8.6 s),
  including the renamed `"Poṉ's stationary moves..."` test.

### Screenshot evidence

Per the BRIEF, I needed one screenshot at phone width and one at desktop width showing Poṉ, Veḷḷi,
Sach'akuna and Ægirinn rendered together. No single existing static view shows all four piece names
as text at once (the shop only labels the six tier-1 pieces together; the "Unit guide" dialog shows
one selected piece's name at a time). `UpkeepPanel.tsx`'s "Choose units to keep" dialog does render
every kept unit's `d.name` as visible text in one list, so I built a disposable Playwright spec
(`e2e/_rename-evidence.spec.ts`, **deleted after use, not part of the permanent suite**) that seeds
a board with `metal_1`, `metal_2`, `plant_3`, `water_3` all owned by White with `upkeepPending:
true`, asserts all four names are present in the dialog, and screenshots it at 390×844 and
1280×900. Both assertions passed; screenshots saved to
`muju/docs/changes/2026-09-22-rename-evidence/phone.png` and `.../desktop.png`.

**Glyph check (looked at both screenshots):** "Poṉ" renders with the under-dot sitting directly
beneath the stem of the `n`, and "Veḷḷi" renders both under-dots directly beneath their `l`s — in
both screenshots the dots read as attached diacritics on a single glyph, not as boxes/tofu and not
as a detached dot floating to the side or below the baseline in a different position. `Ægirinn`
and `Sach'akuna` render cleanly (no combining marks to check). This is the system UI font stack
(Inter is not bundled; the page falls back to the OS system font on this machine), so it is
evidence about *a* fallback stack, not proof for every browser/OS Inter-fallback combination — I
did not have a way to force the "Inter fallback" specifically named in the task without installing
fonts, and I'm flagging that as a caveat rather than overclaiming it.

## Decisions taken

1. **`Sach'akuna`'s apostrophe broke three single-quoted JS/TS string literals during the
   mechanical rename pass** (`tests/game/units.test.ts`, `tests/game/combat.test.ts` — a full
   `it(...)` title string — and `lab/tools/replay-viewer.html`'s inline `<script>`). All three were
   caught by re-reading the diffs immediately after the mechanical pass (not by the test run) and
   fixed by switching the enclosing string to double quotes. `tests/ai/hard/tier3-cap.test.ts`'s
   `RENAMED_2026_09_22` map and `e2e/upkeep-undo.spec.ts`'s regex literal (`/Sach'akuna/`) never
   needed escaping (regex literals and double-quoted strings tolerate the apostrophe natively). I
   verified there is no other apostrophe among the ten new names, so this was a complete fix, not a
   partial one.

2. **`replay-viewer.html`'s Metal tier-1 retired-names array said `'Inyan'`, not `'Yan'`, going
   in** — i.e. it was already one full rename behind (it should have said `Yan` since the
   2026-09-18 metal-yan change, but apparently never got that update). This is outside today's
   rename map, but since I was already editing that exact array to add the 2026-09-22 names, I
   fixed it to the current `'Poṉ'` rather than leaving a doubly-stale name in a file I now own.
   Recorded here since it's not literally in the BRIEF's rename table.

3. **`tests/game/tier3-cap.test.ts`'s baseline-comparison override** (see node 18) needed to expand
   from a metal-only branch to all ten renamed IDs — a real code decision, not a mechanical
   find/replace, made by inspecting what `baseline-v1.3.json` actually contains for every element
   and confirming which of its stored names now diverge from the live catalogue.

4. **`tests/lab/suites-phasing-manifest.test.ts` — reported failure, deliberately not touched.**
   This test byte-pins all of `muju/package.json` (via `artifactPins()`) as part of the committed
   `lab/hard-ai/suites/phasing/fixtures/v2/manifest.json` release bundle, whose identity hash
   (`V2_MANIFEST_SHA256`) is cross-referenced from `fixtures/v3/floor-contract.json`,
   `results/v2-measure-2-2026-09-19/`, `results/v3-measure-2-2026-09-22/`, and
   `docs/hard-ai/RELEASE-2026-09-21-phasing.md`. The BRIEF explicitly requires editing
   `muju/package.json`'s `description` field (node 3/4), and that edit — a single cosmetic string,
   unrelated to any script or dependency — moves the whole-file SHA-256 pin, which the test
   reports as "changed: [package.json]" and fails. The test's own docstring anticipates exactly
   this ("package.json is called out by name because it is the pin that is easiest to move for
   reasons that have nothing to do with the suite"), i.e. it's designed to force a conscious
   decision rather than fail silently. I considered three options: (a) revert the `package.json`
   description edit — rejected, it directly contradicts an explicit BRIEF instruction; (b) weaken
   the test to exempt the description field — rejected, the task instructions explicitly say not
   to weaken a test to make it pass, and I don't own this test's design; (c) re-pin
   `fixtures/v2/manifest.json` (and everything downstream that names its hash) — rejected as too
   large and too risky a change to make unilaterally: it touches a same-day, actively-referenced
   release-evidence chain (`results/v3-measure-2-2026-09-22/` is dated today) that I have no
   visibility into and that node 9's own governing rule says never to silently edit. I chose the
   conservative option: keep the BRIEF-mandated `package.json` edit, leave the test failing, and
   report it here in full instead of hiding or working around it. This is the **only** failing
   test in the suite (2944/2945 pass). A conscious re-pin (a new dated addendum to the v2/v3
   Phasing release evidence, done by whoever owns that evidence chain) would resolve it without
   touching any of my rename work.

5. **`docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md`** contains no old piece names at all, so
   its required supersession note has nothing to actually remap; I added a short note anyway
   (rather than skipping it) because the BRIEF names this file explicitly among the dated docs that
   need one, and an explicit "nothing here is affected" note is cheap and removes ambiguity for the
   next reader.

6. **Scope of "current guidance" vs. historical docs for the mechanical rename** followed the
   BRIEF's named lists literally: only `docs/MCP_TOOL_TAPS.md`, `docs/ANALYSIS_TOOLS.md`,
   `docs/AI_IMPLEMENTATION_STATUS.md`, `docs/PROMPT_scripted_bots_online.md` (verified unchanged —
   no old-name hits) and `AI_ENGINE_README.md` (verified unchanged) got full rewrites;
   `docs/STRATEGY_GUIDE-2026-09-12.md`, `docs/strategy-guide-codex-vs-claude.md`, and the hard-ai
   HANDOFF got supersession notes only; every other dated doc under `muju/docs/*-2026-09-*.md`
   (balance reviews, soundtrack pitches/rounds, placement/mining simplification reports, the v1.1
   spec, `DESIGN_REVIEW.md`, etc.) was left completely untouched as historical evidence, even
   though several of them (e.g. `docs/BALANCE-2026-09-11.md`, `docs/ELEGANCE_COMPARISON-2026-09-09.md`,
   `docs/PROMPT_mining_simplification.md`) still contain old names and are not in the BRIEF's named
   supersession list. This is a conservative reading of "dated docs... get only a one-line
   supersession note... if it is still used as current advice": the BRIEF named exactly which
   dated docs count as "still used as current advice," so I did not extend that judgment to docs it
   didn't name.

7. **`muju/lab/experiments/`, `muju/lab/hard-ai/` (data/suite files, as opposed to the source under
   `src/ai/hard/`), and `muju/lab/docs/`** were treated as internal, dated experiment/study output
   (analogous to `lab/results/**`, which the BRIEF explicitly excludes) rather than "current
   guidance" surfaces, and were left untouched even though a handful of `.ts`/`.md`/`.jsonl` files
   in them contain old names in comments. Gameplay/test correctness never depends on these
   (piece identity there is by stable ID), and none of them are named in the BRIEF's concrete work
   list. I did not exhaustively rename every comment in every dated experiment folder; if the
   coordinator wants those swept too, they weren't included in this lane's grep-and-fix pass beyond
   the initial classification.

## Remaining-hit classification (final sweep)

Full-repo grep (all ten old names + `Göl`, `Hono`, and all three title spellings), scoped per the
BRIEF's node-1 method, minus the exclusions above. Every remaining hit after my edits:

| Hit | Where | Classification |
|---|---|---|
| `Kimubunga`, `Sjor`, `Aegirinn`, `Sachita`, `Sachakuna`, `Mazask`, `Yan`, `Tanka`, `Göl` | `muju/SPEC.md` | **Allowed** — the intentional v2.9-history line and the new v3.2 rename-mapping entry (§ "History:") I added myself. |
| Same set | `docs/STRATEGY_GUIDE-2026-09-12.md`, `docs/strategy-guide-codex-vs-claude.md` | **Allowed** — dated-doc body text, deliberately not rewritten; each now has a supersession note. |
| Same set | `docs/changes/2026-09-22-rename-irumbu-BRIEF.md` | **Allowed** — the BRIEF itself; not mine to edit. |
| Same set | `docs/changes/2026-09-22-rename-irumbu-laneB.md` | **Allowed** — Lane B's own report; not mine to edit. |
| `Tanka` (as filename) | `muju/content-dag.json` | **Allowed** — references the unrenamed soundtrack tool script `tools/revise-tanka-middle.py`. |
| `tanka` | `muju/tests/game/combat.test.ts`, `muju/tests/ai/hard/catalog.test.ts` | **Allowed** — local variable identifiers (`const tanka = ...`), not display text. |
| `Tanka`/`tanka` | `muju/tests/server/music.test.ts`, `muju/src/music/tracks.ts`, `muju/public/music/README.md` line 5 | **Allowed** — soundtrack track name, deliberately unchanged. |
| `tanka` | `muju/tests/server/draw-clock-statements.test.ts` | **Allowed** — intentionally names the old compat SKILL.md path, which still exists and still states the current rule. |
| `tanka` | `muju/ONLINE.md` | **Allowed** — intentionally names the old compat path in the sentence explaining it still resolves. |
| All ten names, various | `muju/docs/changes/*` (2026-09-18/19/21 dirs), `muju/docs/migration/2026-09-18-sync-audit/`, `muju/docs/hard-ai/**` | **Allowed** — historical evidence per the BRIEF ("docs/changes/* earlier than today", hard-ai release records). |
| `Tanka` | `docs/BALANCE-2026-09-11.md`, `docs/ELEGANCE_COMPARISON-2026-09-09.md`, `docs/PROMPT_mining_simplification.md`, and other dated `docs/*-2026-09-*.md` not named in the BRIEF | **Allowed (conservative reading)** — see "Decisions taken" §6. |
| `Tanka` | `docs/ROADMAP.md` | **Not a miss** — already written using the new names (`Poṉ / Veḷḷi / Irumbu`); its one `Tanka` is the unchanged soundtrack track title `"Tanka / Weight Without Hurry"`, correctly quoted verbatim. |

No hit classified as a genuine miss remained after the fixes in "Decisions taken" §§1–3 and the
targeted follow-ups (`lab/harness/bots/probes.ts`, `src/music/MusicPlayer.tsx`,
`docs/MCP_TOOL_TAPS.md` line 7) caught by re-running the census after the first mechanical pass.
