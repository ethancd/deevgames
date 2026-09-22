# Muju Hono Irumbu — piece, label and title rename (2026-09-22)

Owner request (Ethan, 2026-09-22): rename ten piece display names, three element language labels
and the game title (Muju Hono Tanka → **Muju Hono Irumbu**, ASCII `Hono` in the title). Display
names only: stable IDs, stats, prices, promotion gaps and every rule are unchanged; the rules
revision stays `muju-phasing-2`. Owner decisions: the Academy gets a **notice, not a re-voice**;
the soundtrack keeps its titles (Tamil-instrument Metal track is on `docs/ROADMAP.md`); non-ASCII
names are accepted. Branch `claude/muju-rename-irumbu` from origin/master 3ea73084; seed commit
6bafc862 (catalogue, labels, roadmap, generated plan).

Records: the shared brief `2026-09-22-rename-irumbu-BRIEF.md`, the generated 25-node plan
`2026-09-22-rename-irumbu-plan.md`, lane A (game, docs, tests, balance, validation)
`2026-09-22-rename-irumbu-laneA.md`, lane B (Academy, website strings)
`2026-09-22-rename-irumbu-laneB.md`, screenshots in `2026-09-22-rename-evidence/`.

## Rename map

| ID | Old | New | | ID | Old | New |
|---|---|---|---|---|---|---|
| fire_2 | Hono | Honō | | plant_2 | Sachita | Mallki |
| lightning_3 | Kimubunga | Kimbunga | | plant_3 | Sachakuna | Sach'akuna |
| water_1 | Sjor | Sjór | | metal_1 | Yan | Poṉ |
| water_3 | Aegirinn | Ægirinn | | metal_2 | Mazask | Veḷḷi |
| shadow_1 | Göl | Loş | | metal_3 | Tanka | Irumbu |

Labels: Water "Old Norse"; Shadow "Turkish"; Plant "Quechua"; Metal "Tamil" / "South Asia".

## Node dispositions (coordinator summary; evidence in the lane reports)

| # | Node | Disposition | Where |
|---|---|---|---|
| 1 | catalogue | changed (6bafc862) | seed commit; lane A verified |
| 2 | transitions | verified unchanged (comments only) | lane A §2 |
| 3 | rules-docs | changed — SPEC v3.2, J-023, ONLINE, current guides; dated guides get supersession notes | lane A §3 |
| 4 | browser-ui | changed — title, instructions derive metal_1 name, lobby, music caption | lane A §4 |
| 5 | persistence | verified unchanged (IDs) | lane A §5 |
| 6 | wasm-tactics | verified unchanged; rebuilt | lane A §6 |
| 7 | ai-search | verified unchanged | lane A §7 |
| 8 | hard-ai | verified unchanged — the one comment edit was **reverted by the coordinator** so `engineSourceSha256` in the v3 floor contract still matches the tree | this record |
| 9 | ai-strength | verified unchanged; v2 suite bundle **superseded** (see below) | this record |
| 10 | server-runtime | changed — health `game`, `/SKILL.md` route | lane A §10 |
| 11 | mcp-tools | changed — MCP instructions, observation `game` | lane A §11 |
| 12 | agent-guides | changed — `public/skills/muju-hono-irumbu/` (canonical) + `muju-hono-tanka/` compat copy (note placed after frontmatter by the coordinator), time-awareness skill, TAPs, analysis docs | lane A §12 |
| 13 | balance-analysis | changed — current-static regenerated; `balance:check`/`types` pass | lane A §13 |
| 14 | academy-data | changed — export-rules assertions; top-level catalog/rules-verification regenerated; episode copies untouched | lane B §14 |
| 15 | academy-lessons | deferred — 15/16 episodes speak a renamed piece (R04 excepted); notice instead | lane B §15 |
| 16 | academy-audio | blocked/deferred — no re-voice authorized | lane B §16 |
| 17 | academy-video | blocked/deferred | lane B §17 |
| 18 | game-validation | changed — see gates below | lane A §18 + this record |
| 19–25 | packaging, deploys, verification | filled in the Release section below | this record |

## Coordinator decisions

1. **`package.json` description stays "Muju Hono Tanka".** `artifactPins()` byte-pins the whole
   file into the committed v2 Phasing suite manifest, whose hash is preregistered in the
   measurement ledger and both floor contracts. The field is not user-facing. It is renamed with
   the next suite re-authoring.
2. **`src/ai/hard/gen/promote.ts` comment edit reverted** for the same reason: the v3 floor
   contract's `engineSourceSha256` must keep matching the tree until the next measurement.
3. **`tests/lab/suites-phasing-manifest.test.ts` split.** The artifact-pin guard (the reason the
   test exists) stays live and passes. The bundle-load check is `it.skip` with a dated reason: every
   v2 suite document binds `catalogueSha256` to the exact bytes of `src/game/units.ts`, which this
   rename necessarily changed. Re-binding is a preregistration act (new ledger entry + floor
   contract) deferred by the owner to the next AI measurement campaign, which will re-author the
   suite under the kill-clock revision anyway. **Until then `hard:suite:phasing:measure` refuses
   the v2 bundle; that is the intended state, not a regression.**
4. **`lab/harness/bots/probes.ts` comment edit reverted.** The scripted-campaign references
   `lab/harness/results/p1-scripted-2026-09-18` and `p2-scripted-2026-09-19` byte-pin that file;
   `tests/lab/phasing-evidence.test.ts` refused the drift. Comment only; historical evidence wins.
5. Soundtrack titles, `public/music/` file names and the Metal track's Lakota flute brief are
   unchanged (owner); `docs/ROADMAP.md` carries the Tamil-instrument redo.

## Gates

Filled by the coordinator after the final run on the merged lane state; see "Release".
