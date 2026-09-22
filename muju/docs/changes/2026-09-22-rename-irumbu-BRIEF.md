# Rename brief — Muju Hono Tanka → Muju Hono Irumbu (2026-09-22)

Owner decision (Ethan, 2026-09-22): rename ten pieces, three element language labels and the
game title. **Display names only.** Stable IDs (`fire_2`, `metal_3` …), stats, prices,
promotion gaps and every rule are unchanged; the rules revision string stays `muju-phasing-2`.
Non-ASCII names are accepted ("live dangerously, as we already have been" — Göl and Karanlık
already shipped through every surface).

## Rename map (exact strings)

| ID | Old | New |
|---|---|---|
| fire_2 | Hono | Honō |
| lightning_3 | Kimubunga | Kimbunga |
| water_1 | Sjor | Sjór |
| water_3 | Aegirinn | Ægirinn |
| shadow_1 | Göl | Loş |
| plant_2 | Sachita | Mallki |
| plant_3 | Sachakuna | Sach'akuna |
| metal_1 | Yan | Poṉ |
| metal_2 | Mazask | Veḷḷi |
| metal_3 | Tanka | Irumbu |

Unchanged: Hi, Kagari, Radi, Umeme, Straumr, Gölge, Karanlık, Muju.
Beware `Göl` vs `Gölge`: only the whole word `Göl` renames.

Element language labels (canonical `src/game/elements.ts`, already edited):
Water "Old Norse"; Shadow "Turkish" (was Turkish/Slavic); Plant "Quechua" (was
Quechua/Nahuatl); Metal "Tamil", region "South Asia" (was Lakota / North America).

## Title

The game title is **Muju Hono Irumbu** — ASCII `Hono` in the title, no macron, even though the
piece card reads Honō. Replace every current-surface "Muju Hono Tanka" / "HONO TANKA".
The agent skill slug becomes `muju-hono-irumbu` (`public/skills/muju-hono-irumbu/`). Keep the
old URL working: also ship a copy at `public/skills/muju-hono-tanka/SKILL.md` whose body is the
new skill with a one-line note at the top that the canonical path moved. The Node host's
`/SKILL.md` route serves the new directory.

## Deliberately NOT changed

- Soundtrack: track titles ("Hono / Banked Fire", "Tanka / Weight Without Hurry"), file names
  under `public/music/`, `src/music/tracks.ts` titles, `tools/music-*.py` briefs, and the
  soundtrack evidence docs. Only the *game title* strings inside the music pages/captions change.
  A Tamil-instrument Metal track is on `docs/ROADMAP.md`.
- Academy narration, captions, render sources, media and per-episode `production/R??/src/*.json`
  copies (they belong to the rendered v7/v8 videos). The Academy gets a **notice**, not a re-voice.
- Historical evidence: `lab/results/**`, `lab/solver/baseline-*.json`, `tests/fixtures/*`
  (the 2026-09-12 Codex game, the v2.8 catalogue copy, standard-room-v4), `docs/changes/*`
  earlier than today, `docs/hard-ai/e0..e5`, `docs/online-matches/`, `docs/soundtrack-evidence/`,
  `academy/archive/`, `academy/logs/`, `music-auditions/`. Dated strategy guides and reports keep
  their old names; add a one-line supersession note at the top of a dated doc only if it is
  still used as current advice (`docs/STRATEGY_GUIDE-2026-09-12.md`, `docs/hard-ai/phasing/
  repair-2026-09-20/HANDOFF.md`) — never rewrite their numbers or names.
- `dist/`, `_site/`, `node_modules/`: build outputs; never hand-edit.

## Process rules for every agent

- Work only in the worktree `/Users/ashkie/src/deevgames-rename` (branch
  `claude/muju-rename-irumbu`, base 6bafc862, which already renamed the catalogue and labels).
  `muju/node_modules` is installed. Never touch `/Users/ashkie/src/deevgames`.
- **Do not `git commit`, push, deploy, synthesize speech or run `build-all.sh`.** The
  coordinator commits.
- Search with word boundaries for each old name and for the title in three spellings
  (`Hono Tanka`, `hono-tanka`, `HONO TANKA`). Grep before you claim a surface is clean.
- Write your dispositions (changed / verified unchanged / blocked, with evidence: file, command,
  count) to your own report file named in your task. Do not edit
  `2026-09-22-rename-irumbu-plan.md`; the coordinator merges reports into it.
- Any decision you cannot make from this brief: choose the conservative option, record it in
  your report under "Decisions taken", and continue.
