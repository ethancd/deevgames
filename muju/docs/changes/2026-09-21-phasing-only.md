# Muju completion record — Phasing is the only ruleset (2026-09-21)

**Change:** two rule sets → one. Phasing becomes the only ruleset Muju offers,
displays or hosts; Standard is retired and never shown. The rules revision does
**not** advance: it stays `muju-phasing-2` (J-022, decision D1), because no rule
text changed — an option was deleted and an already-shipped variant description
was folded into the normative body (`SPEC.md` v3.1).

**Source:** branch `claude/phasing-only-cutover` @ **`d68db689`** (Stage-1 +
Stage-2 merge), base `eda73b26` (= `origin/master`, PR #25 merged). Validation
worktree `/Users/ashkie/src/deevgames-phasing-cutover`, clean at the end of the
run (`git status --porcelain` empty). This record was written in
`/Users/ashkie/src/deevgames-pc-lane8` (branch `claude/pc-lane8`) at the same
tree.

**Node list generated with** (repository root, this checkout):

```sh
python3 tools/muju-content-dag.py plan --kind rules --kind ai --kind ui --kind online --kind release --format markdown
```

27 nodes, 49 edges. Each node below keeps the planner's own `Reason` and `Paths`
lines and its node-specific commands; the generic Update/Verify instruction prose
is in the planner output and is not duplicated here. Every node carries one
disposition — **changed**, **verified unchanged**, **blocked**, or **pending
release stage** — with the command, summary line, log path or commit that
establishes it.

**Evidence sources.** Two lane reports, both written against this exact tip:

- `VALIDATION.md` — the Stage-3 full-validation run (types, unit tests, three
  Playwright configs, build, site smoke, perft/fuzz/determinism, retirement
  smoke, tree hygiene).
- `MEASURE.md` — the Stage-3 measurement lane (identity bridge at `eda73b26` vs
  `d68db689`, the Gate-0 suite attempt, the fixed-work strength knob screen).

Raw logs live under `<w4>` =
`/private/tmp/claude-501/-Users-ashkie-src-deevgames/7a20f7e4-e424-4f37-a04b-39a63428e413/scratchpad/w4/`.
That directory is **session-local and not in git**; the summary lines quoted in
this file are the durable record, and every command is reproducible from this
commit.

**allGreen for Stage 3: NO.** Nothing shipped is red. The failures are confined
to the hard-AI **lab verification tooling** (`hard:determinism` for any `hard@*`
engine, 10 of 14 `hard:verify` gates) and to the **Gate-0 suite bundle loader**,
and every one of them reproduces on `origin/master` at `eda73b26` — none is
caused by this cutover. They are recorded per node below and in
`docs/hard-ai/RELEASE-2026-09-21-phasing.md`.

---

## 1. [changed] rule-contract — Agreed rules and change intent

Reason: change kind: rules
Paths: `muju/SPEC.md`, `muju/JUDGMENT_LOG.md`

**Disposition: changed.**

Evidence:

- `git diff --stat eda73b26 d68db689 -- muju/SPEC.md muju/JUDGMENT_LOG.md` →
  `muju/JUDGMENT_LOG.md | 111 +`, `muju/SPEC.md | 264 ++++----` (287 insertions,
  88 deletions).
- Commits: `91fb17f0` (SPEC v3.1, Phasing stated normatively), `d490d5e6`
  (JUDGMENT_LOG J-022 appended), `b303ddbe` (SPEC §1: stored artefacts are
  retired records, never upgraded in place), `9c5da5e3` (J-022: `migrate.ts` is
  not deleted — says what actually ships), `87a4690f` (tags:
  `standard-final` stays at `71a2c511`; add `dual-ruleset-final`), `0aad4325`,
  `981d3b07` (docs residue).
- Rules revision **unchanged** and machine-checked on the tip:
  `rulesVersion muju-phasing-2`,
  `rulesSourcesSha256 7e367156bea39b4446081b1bd60139b9b7fc6ea1d3205520222158b4e2d6ffdf`
  over 24 files (MEASURE.md §A, `<w4>/logs/B-canonical-identity.log`).
- The gate half of the same instruction is amendment **A6** of
  `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md` (`22da48b9`, +78).
- Corrected in this commit: J-022's implementation paragraph said "`server/schema.ts`
  and `muju_rules` take `ruleset: z.literal('phasing')` and an explicit
  `'standard'` is a 400". Measured on this tree, `server/mcp.ts:71` is
  `z.literal('phasing').optional()` (D8) and the two surfaces differ — see node
  13. Also corrected: "the 33 reviewed JSONs" → 32 JSON files (the 33rd entry in
  that directory is `make-variants.ts`).

Superseded, kept as dated records: `docs/PHASING-2026-09-16.md` (banner only,
body untouched).

## 2. [verified unchanged] catalogue — Canonical piece definitions and elemental relationships

Reason: upstream changed: rule-contract
Paths: `muju/src/game/units.ts`, `muju/src/game/types.ts`, `muju/src/game/elements.ts`

**Disposition: verified unchanged.**

Evidence:

- `git diff --stat eda73b26 d68db689 -- muju/src/game/units.ts muju/src/game/types.ts muju/src/game/elements.ts`
  → **empty**.
- Independent hash: `catalogueSha256 44bdcbf152b1f641b8b066bd0e1f6e7155f63ada9aa26226a364164127ba2603`
  on the tip (MEASURE.md §A, `<w4>/logs/B-canonical-identity.log`).
- `npm run balance:check` → `distinctStatProfiles 18`, `sameTierDominated []`,
  `noMissionWitness []`, `noSoleCheapestWitness []` (VALIDATION item 8b,
  `<w4>/logs/8b-balance-check.log`).

No stat, cost, ID or elemental relationship moved; nothing downstream needed a
re-import.

## 3. [verified unchanged] board-rules — Map, setup and shared rule constants

Reason: upstream changed: rule-contract
Paths: `muju/src/game/board.ts`, `muju/src/game/resourceMap.ts`, `muju/src/game/rules.ts`

**Disposition: verified unchanged.**

Evidence:

- `git diff --stat eda73b26 d68db689 -- muju/src/game/board.ts muju/src/game/resourceMap.ts muju/src/game/rules.ts`
  → **empty**. In particular `createInitialGameState`'s own default at
  `board.ts:204` deliberately stays `'standard'` this pass (decision D6); every
  entry point passes `'phasing'` explicitly — see node 4 and follow-up **F1**.
- `npm run hard:perft -- --check --engine canonical` → `14959/1053/797`,
  `standardTriple checked`, `fixturesChecked 7`, `fixturesMismatch 0`,
  `digestMismatches 0`, `replicaAgreed true`, `openings 797` (VALIDATION 11a,
  `<w4>/logs/11a-perft-canonical.log`, `<w4>/logs/perft-canonical.json`).

## 4. [changed — call-site default only; no rule change] transitions — Canonical legality and state transitions

Reason: upstream changed: catalogue; upstream changed: board-rules
Paths: `muju/src/game/`, `muju/src/ai/simulate.ts`, `muju/src/hooks/useGameState.ts`, `muju/lab/harness/`

**Disposition: changed (call-site default only; no rule change).**

Evidence:

- `git diff --stat eda73b26 d68db689 -- muju/src/game/ muju/src/ai/simulate.ts muju/src/hooks/useGameState.ts muju/lab/harness/`
  → exactly one file: `muju/src/hooks/useGameState.ts | 4 +++-` (3 insertions, 1
  deletion). The change is `getInitialSession`'s
  `createInitialGameState(..., options.ruleset)` →
  `createInitialGameState(..., options.ruleset ?? 'phasing')` plus its comment
  (`useGameState.ts:108`). `src/ai/simulate.ts`, `lab/harness/` and every file
  under `src/game/` are byte-identical to `eda73b26`.
- No legality, combat, movement, promotion, spawn, upkeep, mining, turn-timing,
  inactivity, victory or home-checkmate rule was touched. Machine evidence that
  the transition surface did not move:
  - perft canonical `14959/1053/797`, `standardTriple checked`,
    `digestMismatches 0`, `replicaAgreed true` (11a);
  - perft replica: Standard triple `skipped-phasing-replica`, Phasing
    `14959/1850/797`, `fixturesMismatch 0`, `mismatches 0` (11b,
    `<w4>/logs/11b-perft-replica.log`);
  - `npm run hard:fuzz -- --actions 20000 --seed 7101` → `divergences 0`, every
    mismatch counter 0 across transition / legality / arrival / prover /
    gate-preservation (`legalitySetMismatches`, `unmakeMismatches`,
    `rehashMismatches`, `roundTripMismatches`, `witnessIllegal`,
    `gatePreservation.mismatches`), 270 games, 46 home checkmates, clock fixture
    ok (11c, `<w4>/logs/11c-fuzz.log`, `<w4>/logs/fuzz.json`);
  - `npm test` → `Test Files 211 passed (211)`, `Tests 2944 passed (2944)`,
    363.73s, 0 failing (VALIDATION item 2, `<w4>/logs/2-vitest.log`).

**Follow-up, not a blocker: Standard code branches are still present in shipped
source.** Because `board.ts:204` still defaults to `'standard'`, the Standard
arms of the transition code remain reachable from tests and are the only thing
covering them. The measured work order for **F1** (from the S2A test-repoint
lane) — delete the branches and their tests together, as one change:

| Shipped source still carrying a Standard branch | Test files that resist a flag-only repoint |
| --- | --- |
| `src/game/turn.ts` (start-of-turn upkeep, `finishTurnStart`, `canActInPlacePhase`) | `tests/ai/turn-execution.test.ts` (7 call sites) |
| `src/game/homeCheckmate.ts:160` (`prepare`) | `tests/server/analysis.test.ts` via `tests/fixtures/analysis.ts` (13) |
| `src/ai/simulate.ts:119` (`finishPlacement`) | `tests/lab/audit-families.test.ts` (3) |
| `src/ai/turnFunding.ts` (every `isPhasing` short-circuit) | `tests/game/turn.test.ts` (the Standard turn spec; `tests/game/phasing.test.ts` already specs the Phasing one) |
| `server/analysis/**` witness engine, `lab/hard-ai/audit/{families,place-enum}.ts` | — |

Repointing those tests without deleting the branches loses the coverage;
deleting both together is one coherent change. Filed, not done here.

## 5. [changed] rules-docs — Current rules, AI explanation and public design copy

Reason: upstream changed: transitions
Paths: `muju/SPEC.md`, `muju/AI_ENGINE_README.md`, `muju/docs/AI_IMPLEMENTATION_STATUS.md`, `muju/docs/PHASING-2026-09-16.md`, `muju/docs/STRATEGY_GUIDE-2026-09-12.md`, `muju/docs/strategy-guide-codex-vs-claude.md`, `docs/game-design-dossier.md`, `portfolio/index.html`

**Disposition: changed.**

Evidence:

- `git diff --stat eda73b26 d68db689` over the node's paths → 8 files, 270
  insertions, 111 deletions:
  `docs/game-design-dossier.md 21`, `muju/AI_ENGINE_README.md 44`,
  `muju/SPEC.md 264`, `muju/docs/AI_IMPLEMENTATION_STATUS.md 23`,
  `muju/docs/PHASING-2026-09-16.md 7`,
  `muju/docs/STRATEGY_GUIDE-2026-09-12.md 7`,
  `muju/docs/strategy-guide-codex-vs-claude.md 7`, `portfolio/index.html 8`.
- Commits: `91fb17f0`, `b737a250` (AI docs, DAG and dated-guide banners),
  `13873349` (Hard is not a `DIFFICULTY_PRESETS` row), `2d439f48` (dossier:
  September-16 Muju block labelled superseded), `5611d77d` (repo-root public
  copy).
- Historical guides keep their bodies; each carries a dated supersession banner
  (the three `docs/*GUIDE*` files, +7 lines each).
- Doc-text regression: `tests/server/draw-clock-statements.test.ts` loops over
  the current-authority doc set; green in the full run (item 2).

Known residue, filed not fixed: `SPEC.md` §11's "build delay" paragraph is stale
under v3.1 (§11 was outside every Stage-1 and Stage-2 lane's item list).

## 6. [changed] browser-ui — Browser controls, instructions and visual representations

Reason: change kind: ui; upstream changed: transitions
Paths: `muju/src/components/`, `muju/src/App.tsx`, `muju/src/main.tsx`, `muju/src/hooks/useAI.ts`, `muju/src/index.css`, `muju/src/utils/colors.ts`, `muju/src/utils/positionReport.ts`, `muju/src/utils/compactReport.ts`, `muju/src/sound/`, `muju/src/music/`, `muju/public/music/`, `muju/index.html`, `muju/public/previews/`

**Disposition: changed.**

Evidence:

- 10 files, 185 insertions / 218 deletions. `src/components/RulesetSelect.tsx`
  **deleted** (−27); `InstructionsModal.tsx` −117/+…, `ModeSelect.tsx`,
  `GameScreen.tsx`, `AnalysisScreen.tsx`, `BlackCrystalHandicap.tsx`,
  `VisualKey.tsx`, `src/hooks/useAI.ts` (86), `src/index.css` (22),
  `src/utils/positionReport.ts` (31).
- Commits: `31fe9493` (Phasing is the only ruleset the browser offers),
  `ab64f63a` (analysis board resets to Phasing, never the reviewed ruleset),
  `4b086e62`, `c164c3b8` (drop the retired preview brand from the report log),
  `72cab529`, `f724a055` (`.archived-retired` styled),
  `ebe399d0` (budget-exhaustion line once per turn, not per floored decision),
  `2e3f1547` (a phone builds its hard engine from the phone profile).
- Browser verification, all on the final tree:
  - `npm run test:online:e2e` → `Running 84 tests using 2 workers` → `84 passed
    (2.8m)` on its own server at 8928, `reuseExistingServer:false` (VALIDATION 5,
    `<w4>/logs/5-online-e2e.log`);
  - default Playwright config, served by the real host —
    `PORT=8937 HOST=127.0.0.1 PUBLIC_URL=http://127.0.0.1:8937 MUJU_DB_PATH=:memory: node --import tsx server/index.ts`
    then `MUJU_BASE_URL=http://127.0.0.1:8937/muju/ npx playwright test` →
    `Running 111 tests using 2 workers` → `111 passed (2.7m)` (VALIDATION 6);
  - `MUJU_E2E_PORT=8927 npx playwright test --config playwright.hard.config.ts`
    → `12 passed (55.4s)`, desktop + mobile (VALIDATION 7).
- `?phasingAi=1` is gone; `?hardAi=0` still opts a seat back to `AIEngineV2`;
  `?hardProfile=phone` is new (node 9).

Deliberately unchanged and now pinned: the position report's wire kind stays
`'muju-phasing-preview-report'` (`src/utils/positionReport.ts:54,86`), so reports
already pasted into chats keep parsing. Pinned in
`tests/components/phasing-ai-turn.test.tsx`; a rename is now a deliberate
wire-format change. The file's header prose that called the report
"preview-only" was corrected (`981d3b07`), an override of PLAN §1's
"untouched by everyone" list that is recorded here because the old comment was
factually wrong against `GameScreen.tsx:983`.

## 7. [changed] persistence — Saved games, migrations, history and replay compatibility

Reason: upstream changed: transitions
Paths: `muju/src/game/migrate.ts`, `muju/src/game/replay.ts`, `muju/src/game/moveHistory.ts`, `muju/src/utils/persistence.ts`, `muju/src/components/TurnReplay.tsx`, `muju/src/online/RoomHistory.tsx`

**Disposition: changed.**

Evidence:

- `git diff --stat` → one file, `muju/src/utils/persistence.ts | 113 +++++++---`
  (99 insertions, 14 deletions). Commits `4b086e62` (retire the Standard local
  save at schema 9 — archived, never resumed) and `3db03086` (validate a local
  save before deciding it is retired rules).
- `SCHEMA_VERSION = 9`, readable `[5,6,7,8,9]`; a non-Phasing payload is moved
  **byte-for-byte** to `elemental-tactics-save-retired` and `loadGameState()`
  returns `null` — never `clearGameState()`. The current key stays
  `elemental-tactics-save` (decision D2).
- Regression coverage added: `tests/game/standard-save-archive.test.ts` (165
  lines), `tests/fixtures/standard-save-v8.json`,
  `tests/components/analysis-retired-guard.test.tsx` (80). All green in item 2.
- Read-only review of a retired save at `/muju/analysis?local=1&retired=1` with
  "Explore from here" disabled (decision D5) — the one client-side path that
  could have reinterpreted a Standard position is closed.
- **`src/game/migrate.ts` is kept as dead code**, byte-for-byte, and
  `muju/content-dag.json:106` still lists it as a required `persistence` path
  (`python3 tools/muju-content-dag.py check` → `Valid DAG: 27 nodes, 49 edges;
  required repository paths exist`). Measured: no importer remains
  (`grep -rn "from.*migrate'" src tests server` → no hits). D7's deletion was
  **not** taken; J-022 was amended to say so (`9c5da5e3`). Filed as **F9**.
  Test-visible consequence, recorded because it is a real behaviour change: with
  `migrateLegacyGame` unreferenced, a legacy six-action save is no longer
  upgraded at all — it is archived instead (a schema-5 save is always
  non-Phasing), so no real save loses anything, but the "subtracts
  already-spent actions" behaviour is gone and
  `tests/game/action-budget.test.ts` now records that.

## 8. [verified unchanged] wasm-tactics — Compiled tactical solver and canonical witness validation

Reason: change kind: ai; upstream changed: transitions
Paths: `muju/assembly/tactics.ts`, `muju/src/ai/wasm/`, `muju/asconfig.json`
Command (cwd `muju`): `npm run ai:wasm`

**Disposition: verified unchanged.**

Evidence:

- `git diff --stat eda73b26 d68db689 -- muju/assembly/tactics.ts muju/src/ai/wasm/ muju/asconfig.json`
  → **empty**.
- `npm run build`'s `prebuild` re-ran `asc` and `src/ai/wasm/tactics.wasm` came
  back **byte-identical**: sha256
  `6d3cf33382ff94d81ae32194c3af4849bff81115d1b6f7f4a9d4ac45c795573c` before and
  after, `git status` empty (VALIDATION item 4, `<w4>/logs/4-build.log`,
  `<w4>/logs/wasm-before.txt`).
- `npm run ai:tactics` → `fixtures 28, decisions 84, expectedRescues 36, cleared
  36` (VALIDATION 8a, `<w4>/logs/8a-ai-tactics.log`). Witnesses replay through
  canonical legality with no unknowns outstanding.

## 9. [changed] ai-search — Deterministic game AI, evaluation, planning and worker

Reason: change kind: ai; upstream changed: transitions; upstream changed: wasm-tactics
Paths: `muju/src/ai/`, `muju/lab/ai/`, `muju/lab/docs/`, `muju/AI_ENGINE_PLAN.md`, `muju/AI_ENGINE_QUESTIONS.md`
Command (cwd `muju`): `npm run ai:tactics`

**Disposition: changed.**

Evidence:

- 19 files, 483 insertions / 152 deletions. Headline changes:
  - `src/ai/phasingPreview.ts` **deleted** (−88) — the `?phasingAi=1` preview
    path is gone; the worker's Phasing refusal with it
    (`src/ai/worker/{client,handler,protocol}.ts`).
  - `src/ai/hardOptIn.ts` +124: `resolveHardDeviceProfile()` (one device hint per
    game, `?hardProfile=` override) and the `[hard-ai] device profile …` console
    line.
  - `src/ai/hard/config.ts` +121: `StrengthKnobs` (node 10),
    `DeviceProfileName` and `deviceProfilePatch()`.
  - `src/ai/hard/eval/turnScore.ts` **new** (+44) — one within-turn score shared
    by the engine and every lab instrument (`eecdf14c`).
  - `lab/ai/source-files.ts` **new** (+67) — an `fs` walker replacing the
    `rg --files` shell-out, so CI does not need ripgrep (`547de67d`).
- Commits: `31fe9493`, `eecdf14c`, `4bb4a7dc`, `6ea9b9e2`, `547de67d`,
  `093238ef`, `903ca699`, `ebe399d0`, `2e3f1547`, `981d3b07`, `49c8bba4`.
- Reproducibility under fixed work, measured across the whole cutover: the
  identity bridge (node 11) plays the **same 16 games move for move** at
  `eda73b26` and at `d68db689`.
- Worker execution in a browser is now covered in CI: the three AI specs
  (`ai-worker` 6, `phasing-ai` 3, `ai-timer` 4) were added to
  `playwright.online.config.ts`'s `testMatch` (decision D14) and ran green twice
  at 2 workers; `deploy.yml` runs `npm run test:online:e2e`, so the AI path now
  has browser coverage in CI for the first time.
- Turn funding rewritten for the Phasing turn: `src/ai/turnFunding.ts`
  (`segmentsAfter`, `prepareReserveMs`, `turnSearchAllowance`,
  `fallbackDecisionsRemaining`), Standard short-circuits byte-for-byte.
  Pinned in `tests/hooks/phasing-ai-funding.test.tsx:296-303`
  (`turnSearchAllowance(act, budget, budget, 1) === budget − 2 × budget/8`).
  That is follow-up **F8** made explicit: the first search of a turn is funded
  with **three quarters** of the pace allowance while the dial (`turnBudgetMs`)
  shows the whole thing (`turnFunding.ts:48-53`,
  `PREPARE_RESERVE_DIVISOR = 8`). Recorded, not changed.

## 10. [changed] hard-ai — Hard engine: packed rules replica, turn generator, prover, evaluation and search

Reason: change kind: ai; upstream changed: transitions; upstream changed: ai-search
Paths: `muju/src/ai/hard/`, `muju/src/ai/hardOptIn.ts`, `muju/docs/hard-ai/`
Command (cwd `muju`): `npm run hard:types && npm run hard:test`

**Disposition: changed.**

Evidence:

- 16 files, 721 insertions / 26 deletions. Product code:
  `config.ts` (+121), `engine.ts` (18), `eval/pending.ts` (16),
  `eval/turnScore.ts` (+44, new), `eval/weights.ts` (15), `gen/promote.ts` (41),
  `gen/purchase.ts` (16), `search/pvs.ts` (17), `core/state.ts` (2),
  `hardOptIn.ts` (124). Docs: `RELEASE-2026-09-21-phasing.md` (+242, new),
  `PHASING-PREREGISTRATION-2026-09-18.md` (+78, amendment A6), dated one-line
  notes on `DESIGN.md`, `MILESTONES.md`, `HANDOFF.md`,
  `e3/E3.3-TUNING-INSTRUMENT.md`.
- `npm run hard:types` → clean; `npm run hard:test` → `Test Files 68 passed
  (68)`, `Tests 916 passed (916)`, 37.71s (VALIDATION 1c, 3).
- **The four strength knobs ship absent, i.e. today's behaviour**
  (`EvalFix.strength?: StrengthKnobs`, `config.ts:470-547`). Defaults at this
  commit: `purchaseScoreBeforeTruncate` absent (= `false`),
  `promoteStrengthMission` absent (= `false`), `promoteOrderingRentPv` absent
  (= `RENT_PV` = 422), `pendingAtRiskShare16` absent (= 0). No profile carries
  the key, so `hard@desktop`'s resolved configuration hash does not move — see
  node 11.
- **The phone profile now actually runs on phones** (A-F2). Before this change
  `profileFor` was called from nowhere but a test and every device built its
  engine from `DESKTOP` (`K 24`, widths `[6,4,3,2]`, `ttBitsMacro 19`).
  `deviceProfilePatch('desktop')` returns `undefined`, so a desktop request is
  byte-for-byte the request that shipped before; only a device answering
  "phone" sends a patch, and weights/book are deliberately omitted so a phone
  plays the shipped vector on smaller tables.
- Runtime fallback and divergence counters: **0** everywhere measured —
  `e2e/hard-ai.spec.ts` green (12/12, VALIDATION 7), and across 8 ladder runs /
  224 games in MEASURE.md every one of `packError`, `engineError`, `divergence`,
  `invalidSuffix`, `emptyPlan`, `workerError` is 0.
- Weights contract: `WEIGHTS_VERSION` stays **2** (D9); its docstring now says
  it is bumped when the vector's **schema** changes, not when the numbers do
  (`src/ai/hard/eval/weights.ts:14`). `ACCOUNTING_PINS` → `{2:100, 58:1}`.

## 11. [changed] ai-strength — AI correctness veto and preregistered strength evidence

Reason: upstream changed: hard-ai; upstream changed: ai-search
Paths: `muju/lab/hard-ai/`, `muju/tests/ai/hard/`, `muju/tests/lab/`, `muju/docs/hard-ai/RELEASE-2026-09-18.md`, `muju/docs/hard-ai/EPIC-PLAN-2026-09-16.md`
Commands (cwd `muju`): `npm run hard:perft && npm run hard:fuzz && npm run hard:determinism`; `npm run hard:suite`; `npm run hard:ladder`

**Disposition: changed.** Correctness veto **passes**; the strength-evidence
tooling is partly blocked, all of it pre-existing.

Correctness veto — green:

| Check | Result |
| --- | --- |
| perft canonical (11a) | `14959/1053/797`, `standardTriple checked`, `fixturesChecked 7`, `fixturesMismatch 0`, `digestMismatches 0`, `replicaAgreed true`, `openings 797` |
| perft replica (11b) | Standard triple `skipped-phasing-replica`; Phasing `14959/1850/797`; `fixturesMismatch 0`, `mismatches 0` |
| fuzz 20 000 actions, seed 7101 (11c) | `divergences 0`; every transition / legality / arrival / prover / gate-preservation counter 0; 270 games, 46 home checkmates |
| illegal actions / replica divergences / fallbacks, 8 ladder runs, 224 games (MEASURE A + C) | **0 / 0 / 0**, all rows `status: complete`, none voided, none wall-clock timed |

**Identity bridge — IDENTICAL.** The row that connects the `repair-2026-09-20`
evidence to the shipped build:

```
node --import tsx lab/hard-ai/ladder/run.ts --a hard@desktop --b Rush --work fixed:50000 \
  --handicaps 0 --pairs 8 --seed 7101 --shards 4 \
  --openings lab/hard-ai/ladder/openings/p1-dev.jsonl --replays on --out <dir>
```

run at `eda73b26` and at `d68db689`:
`0.313`, `5/0/11`, Elo `−136.97 [−720.19, 77.28]`, LOS 10.8%, `adjudicationRate
0`, `openingsSha256 a58ca9d8…`, `engineHash
hard:desktop:fixed:50000#2453b0c7b6b9e77f2b872952f0c9901f35d62056d7b1a8becd35b07295a2b0cd`
— identical in both trees. `games.jsonl`, `pairs.jsonl`, `failures.jsonl` and all
16 replays IDENTICAL; the stricter check (drop only wall-clock keys, require the
base→tip generated-unit-id map to be a **bijection**) passes on all 16 pairs /
589 id occurrences, `problems: []`. Logs `<w4>/logs/A-bridge-{base,tip}.log`,
`<w4>/logs/A-bridge-normdiff.log`.

`hard@desktop` identity on the tip (`<w4>/logs/A-identity-tip.log`):
`sourceFileCount 78`, `engineSourceSha256 8ad95e28265e61ba3a224e096e8702b95e50c54b39fa758054436a99f3cf1f88`,
`weightsSha256 ec9816169afe7983e03ea220eb30b8d4c1d05cbdaefc5f07a9e8a4061e12cdf5`,
`weightsVersion 2`, `weightsLabel phasing-hand-priors-v1`,
`desktopWall3000Hash 2c485153f22afad810639da52dc59a3e7e13c1187cc2cce9cb0bf9611e90abdd`
— and that last value **matches** the `DESKTOP_WALL3000_HASH` pin at
`tests/lab/ablate.test.ts:199`, so the seven new arms did not move the champion.

Source changes: 28 files, 1 168 insertions / 198 deletions.
`lab/hard-ai/ablate/arms.ts` (+204: seven strength arms appended,
`hard@env` label), `bots/hard.ts` (`MUJU_HARD_WEIGHTS` scoped to `hard@env`,
decision D13), the five instruments routed through `eval/turnScore.ts`
(`analyze/engine.ts`, `audit/{gen-view,score,seed-cases}.ts`,
`bench/p6-turn-time.ts`, `coverage/run.ts`, `recall/run.ts`), `tune/texel.ts`
re-pinned, and `tests/lab/source-files.test.ts` **new** (+260).

**Blocked / failing, every one pre-existing at `eda73b26` — recorded, not
fixed:**

1. **Gate 0 suite measure — blocked before any case ran.** `hard:suite:phasing:measure`
   with the committed v3 floor contract refused at `run.ts:156` (`loadBundle`):
   `Superseded bundle: builder/predicate/validator artifact set or bytes differ …
   (changed package.json)`, EXIT=1. Root cause pinned down: `artifactPins()`
   (`run.ts:34-42`) hashes `muju/package.json` into the v2 manifest's artifact
   map; removing the two dead scripts `hard:spsa` and `hard:book` changed its
   bytes (`a36f0da6…` → `b9482bd9…`). **22 of 23 pinned artifacts byte-match, all
   six suite documents match their `files[].sha256` pins, and the canonical rules
   binding is unchanged.** Constructive proof (`<w4>/logs/B-diag-bundle.log`): a
   scratch manifest with only `artifacts["package.json"]` repinned loads and
   validates completely — `documents 6 cases 225 members 245`, `valid = true
   checks 225 veto findings 0 errors 0 release v2`, `failing checks: []`. So the
   v2 case set is intact; only the byte pin blocks it. **No first-measurement
   slot was consumed and no ledger line was written**, so the committed v3
   contract stays measurable. Informational under A6 → not a ship blocker, but
   **the cutover ships with no Gate-0 reading at all**. The repo's own tests
   cannot see this: `tests/lab/suites-phasing-{runner,v2-authoring}.test.ts`
   author throwaway bundles in temp dirs and never load the committed manifest.
2. **`hard:determinism` cannot run any `hard@*` engine (F1 in VALIDATION).**
   `lab/hard-ai/verify/determinism.ts:149` builds the patch with
   `hardConfigFor(...)`, which returns a config whose `weights` field is
   *present* and is M4's `placeholder-m4` vector (`version: 0`), so
   `HardEngine`'s `DEFAULT_WEIGHTS` substitution never fires and
   `assertCurrentWeights` throws `Phasing weight schema/version mismatch`.
   Every other lab call site already goes through `hardEnginePatch`/
   `createHardBot`; this is the one that was missed. `git diff eda73b26..HEAD`
   is **empty** for `determinism.ts` and `evaluate.ts`. **The engine itself is
   fine**: with the documented one-line resolution the exact requested row gives
   `{"identical":true,"decisions":4,"mismatches":0}`
   (`<w4>/logs/determinism-probe.json`). Not fixed here because the fix moves
   what gate M14 measures (placeholder-m4 → the shipped vector) and
   `tests/lab/suites.test.ts:65` currently pins the broken construction.
3. **`hard:verify --all` stops at M1** (`<w4>/logs/12-hard-verify.log`): M1's
   criterion requires `metrics.fixturesChecked === 11`; the Phasing fixture set
   in `lab/hard-ai/perft/phasing-fixtures.ts` has **7**. Everything else in M1 is
   green. `gates.ts` and `perft/**` are unchanged on this branch; the 7-fixture
   set landed at `142f0904`, before the cutover base.
4. **7 more gates fail on Standard-ruleset corpora** (`<w4>/logs/12b-gates-individual.log`):
   M7/M8/M9 `PackError: pack: ruleset "standard" is not "phasing"`; M6
   `strikeChecked 0`; M11 `positionsChecked 0, positionsSkipped 216`; M12
   `bench: empty corpus`; M13 `positions 0`. Root cause:
   `lab/hard-ai/positions/{openings,authored,fuzz-1000,economy,canonical-fixtures}.jsonl`
   are Standard positions and `pack()` has been Phasing-only since `142f0904`.
   **PASS: M4, M5, M10.** Not run: M2 (not reached), M3 (contains a
   `--work wall:1000` ladder row — excluded by the fixed-work-only rule for a
   shared box), M14 (its first step is the broken `hard:determinism` call).
   Disposed here as **historical/blocked**, the same disposition A-S3 gives the
   generic `hard:suite`; porting the lab corpora to Phasing is unfunded work,
   filed as a follow-up.
5. **`npm run hard:suite` (generic)** — historical/blocked per A-S3.

**Strength knob screen (fixed work, 16 pairs, one slice, nothing adopted).** Full
table and caveats in `docs/hard-ai/RELEASE-2026-09-21-phasing.md`. Headline: only
`eval-atrisk-8` (R4) changes play at all; R1b, R2 and R3 produce **byte-identical
games** to the control across all 32 screen games, and `stack-r1234` plays
identically to `eval-atrisk-8`.

Superseded evidence recorded so nobody diffs across it: `eecdf14c` changes the
play of exactly one profile (`hard@lab-refined`) without moving any identity
hash, and re-routes five lab instruments through the shared within-turn score, so
**79 committed result files** under `lab/results/**` and `lab/ai/results/**`
(`git ls-files | grep -E "results/.*(coverage|audit|recall)" | wc -l` → 79)
predate the shared scorer and must not be diffed across it. Written out in full
in the release record.

## 12. [changed] server-runtime — Authoritative multiplayer host, schemas and online client

Reason: change kind: online; upstream changed: transitions; upstream changed: persistence
Paths: `muju/server/rooms.ts`, `muju/server/schema.ts`, `muju/server/http.ts`, `muju/server/index.ts`, `muju/server/clockPressure.ts`, `muju/server/matchPolicy.ts`, `muju/server/matchScope.ts`, `muju/tools/engine-seat`, `muju/docs/ENGINE-SEAT-MATCH-2026-09-19.md`, `muju/src/online/`, `muju/ONLINE.md`

**Disposition: changed.**

Evidence:

- 7 files, 146 insertions / 108 deletions: `server/rooms.ts` (76),
  `server/schema.ts` (4), `src/online/{ArchivedGames,OnlineLobby}.tsx`,
  `src/online/{client,types}.ts`, `ONLINE.md` (153). Commits `904d72a2` (make
  `muju-phasing-2` the only rules revision a room can carry), `31fe9493`,
  `d41c735f`, `0727534f`, `ed4b92f0`, `e4d5fbc4`, `981d3b07`.
- `RULES_VERSION` becomes the exported, never-creatable
  `RETIRED_STANDARD_VERSION` (decision D1). The rules revision itself stays
  `muju-phasing-2` so the four openable production rooms are not 409'd.
- **Retirement smoke on a live local host** (`MUJU_DB_PATH=:memory:`, port 8937 —
  VALIDATION item 13, `<w4>/logs/13-retirement-smoke.log`), all five green:

  | Check | Result |
  | --- | --- |
  | `POST /api/muju/rooms {"name":"qa"}` | **201**; `room.state.ruleset === "phasing"`, `pendingSummons: []`, `turn = {currentPlayer:"white", phase:"action", actionsRemaining:4, turnNumber:1}` |
  | `POST /api/muju/rooms {"name":"qa2","ruleset":"standard"}` | **400** `{"code":"INVALID_REQUEST","issues":[{"received":"standard","expected":"phasing","path":["ruleset"],"message":"Invalid literal value, expected \"phasing\""}]}` |
  | `GET /SKILL.md` | **200**, 29 471 bytes, front-matter `name: muju-hono-tanka` |
  | `POST /mcp tools/list` | **200**, 15 tools, `muju_rules` present |
  | `muju_rules` | `ruleset.name === "phasing"`; **no `rulesets` key at all** |

- Archive policy (decision D5): retired rooms stay **listed, 409 on open** —
  the status quo since 2026-09-13. `retiredRules` is true for everything that is
  not `muju-phasing-2`, including the 9 `muju-phasing-1` rooms, and the lobby
  label reads "previous rules", not "Standard". The dead `Analyze →` link is
  suppressed. **No production row is rewritten**; the boot loop is untouched.
- New coverage: `tests/server/standard-retirement.test.ts` (+211) and
  `tests/fixtures/standard-room-v4.json` (a captured retired-rules room, inserted
  as an **archived** row so the boot loop cannot rewrite it and pass the test for
  the wrong reason). Green in item 2.
- `tools/engine-seat`'s readiness literal **stays shut** (decision D11); the
  browser cutover does not need it.

## 13. [changed] mcp-tools — MCP rules, legal actions, previews and analysis helpers

Reason: upstream changed: server-runtime; upstream changed: ai-search
Paths: `muju/server/mcp.ts`, `muju/server/stdio.ts`, `muju/server/observation.ts`, `muju/server/agentSchema.ts`, `muju/server/notation.ts`, `muju/server/analysis/`, `muju/tools/benchmark-analysis.ts`

**Disposition: changed.**

Evidence:

- 2 files, 46 insertions / 44 deletions: `server/mcp.ts` (26),
  `server/observation.ts` (64). Commits `53d23aad` (MCP rules payload describes
  Phasing as the base object) and `61ca2b63`.
- Measured on a live host: `muju_rules` → `ruleset.name === "phasing"` and **no
  `rulesets` key at all**, so no `rulesets.options` (VALIDATION item 13).
- **The two negative-create surfaces are different, and this record states both**
  (A-S5): over **HTTP**, `POST /api/muju/rooms {"ruleset":"standard"}` → **400
  `INVALID_REQUEST`** with the Zod issue quoted above; over **MCP**,
  `muju_create_room` with `ruleset: "standard"` → an **SDK invalid-params tool
  error naming `ruleset`**, not a `RoomError`. J-022's implementation paragraph
  has been corrected accordingly in this commit.
- `muju_rules`' own input keeps `ruleset: z.literal('phasing').optional()`
  (`server/mcp.ts:71`) — accepted and ignored for one release, because the live
  `SKILL.md` told agents to pass it (decision D8).
- Residue, filed not fixed: `server/observation.ts:24` still defaults
  `s.ruleset ?? 'standard'`. Unreachable for live rooms (`rooms.ts` creates only
  `muju-phasing-2`, pinned by `tests/server/phasing.test.ts:61-63`), so the docs'
  claim is true in practice; the literal survives in code and belongs with the
  D6/F1 sweep.

## 14. [changed] agent-guides — Published agent skills and MCP usage documentation

Reason: upstream changed: mcp-tools; upstream changed: rules-docs
Paths: `muju/public/skills/`, `muju/server/skills.ts`, `muju/docs/MCP_TOOL_TAPS.md`, `muju/docs/ANALYSIS_TOOLS.md`, `muju/ONLINE.md`

**Disposition: changed.**

Evidence:

- 6 files, 220 insertions / 130 deletions:
  `public/skills/muju-hono-tanka/SKILL.md` (119),
  `public/skills/muju-time-awareness/SKILL.md` (8) and its
  `references/staged-play.md` (21), `docs/MCP_TOOL_TAPS.md` (32),
  `docs/ANALYSIS_TOOLS.md` (17), `ONLINE.md` (153). Commits `d41c735f`
  (END_PLACE_PHASE always required), `cb49ed63` (the staged `END_ACTION_PHASE`
  does not end the turn), `0aad4325`, `981d3b07`.
- The bug this fixes for agents: `MCP_TOOL_TAPS.md` previously told agents to
  omit `END_PLACE_PHASE`, which hangs an agent's own turn.
- Served copy verified: `GET /SKILL.md` on the local host → 200, 29 471 bytes,
  front-matter `name: muju-hono-tanka` (item 13). The static `/muju/skills/`
  copies are checked by the site smoke (node 21) and, after release, by the
  Pages hash check (node 24).

## 15. [verified unchanged] balance-analysis — Current static balance report and relevant fresh experiments

Reason: upstream changed: transitions; upstream changed: ai-search
Paths: `muju/lab/solver/`, `muju/lab/results/current-static/current.json`, `muju/lab/results/current-static/current.md`
Commands (cwd `muju`): `npm run balance:static`; `npm run balance:check && npm run balance:types`

**Disposition: verified unchanged.**

Evidence:

- `git diff --stat eda73b26 d68db689` over the node's paths → **empty**. No rule
  and no stat changed (nodes 2, 3, 4), so no strategic conclusion is invalidated
  and `balance:static` was deliberately **not** re-run.
- `npm run balance:check` → `distinctStatProfiles 18`, `sameTierDominated []`,
  `noMissionWitness []`, `noSoleCheapestWitness []` (VALIDATION 8b);
  `npm run balance:types` → clean (VALIDATION 1d).
- **Nuisance recorded (F4):** `balance:check` rewrites the tracked artifact
  `lab/results/current-static/current.json` on every run, changing exactly one
  field — `"elapsedSeconds": 0.157 → 0.136`. A committed artifact carrying a
  wall-clock field dirties the tree on every check. Restored with
  `git checkout`; final `git status --porcelain` empty.

## 16. [blocked] academy-data — Academy current rule snapshots, catalogues, map and matchup matrices

Reason: upstream changed: transitions
Paths: `muju/academy/export-rules.ts`, `muju/academy/rules-snapshot/`, `muju/academy/catalog.json`, `muju/academy/map.json`, `muju/academy/bonk-matrix.json`, `muju/academy/rules-verification.json`, `muju/academy/metal-v29-provenance.json`, `muju/academy/production/R??/source-rules/`, `muju/academy/production/R??/src/{catalog,map,bonk-matrix}.json`
Command (cwd `muju`): `node --import tsx academy/export-rules.ts`

**Disposition: blocked** — on one file. Everything else in the node is verified
unchanged.

Evidence:

- `git diff --stat eda73b26 d68db689` over the node's paths → **empty**. No
  piece stat, map total or matchup matrix moved (node 2), so no episode source
  data needed propagating and `export-rules.ts` was deliberately not run.
- **Blocked:** `muju/academy/rules-verification.json:2` still reads
  `"rules": "v2.9"` (measured on this tree). Regenerating it is an Academy
  **release action** (`export-rules.ts` writes it only after its assertions
  pass), not a hand edit, and it is blocked on the media bundle at
  `~/Archives/muju-media-2026-09-18/academy`. Recorded in `academy/STATUS.md`
  (top block, 2026-09-21) and in the release record's "Not in this release".

## 17. [changed] academy-lessons — Academy lesson scripts, examples and renderer sources

Reason: upstream changed: academy-data; upstream changed: rules-docs; upstream changed: browser-ui; upstream changed: server-runtime
Paths: `muju/academy/README.md`, `muju/academy/STATUS.md`, `muju/academy/BIBLE.md`, `muju/academy/ALL-SCRIPTS.md`, `muju/academy/CURRICULUM-AND-BATCHES.md`, `muju/academy/PIPELINE-NOTES.md`, `muju/academy/production/R??/episode.json`, `muju/academy/production/R??/src/`, and the rest of the Academy authoring surface

**Disposition: changed** — status prose only; **no lesson script, spoken fact,
board, example or caption changed.**

Evidence:

- `git diff --stat` → 2 files, 42 insertions / 9 deletions:
  `academy/README.md` (13), `academy/STATUS.md` (38). Commit `e92dd756`.
  Every `production/R??/episode.json` and renderer source is byte-identical.
- Why no episode changed: the rules revision did not advance (node 1), so the
  turn order R01, R04–R07, R09 and R10 teach is unchanged — what changed is that
  it is now "the previous rules" rather than "one of two rule sets". `STATUS.md`
  states exactly that at the top, dated 2026-09-21.
- Affected lesson IDs for the notice (unchanged set): **R01, R04, R05, R06, R07,
  R09, R10**. The other nine of the 16 published lessons carry no turn-order
  claim.
- The v9 re-narration of those lessons remains pending and needs its own
  speech-synthesis authorization (**F4** in the campaign plan).

## 18. [blocked] academy-audio — Academy narration, local transcription and caption timing

Reason: upstream changed: academy-lessons
Paths: `muju/academy/{audio-batch,prepare-audio,…}.py|mjs`, `muju/academy/production/R??/public/audio/`, `muju/academy/production/R??/speech-directions.json`

**Disposition: blocked** — the planner itself marks this node blocked.

Evidence:

- `python3 tools/muju-content-dag.py check` → `5 declared local-only production
  paths unavailable; affected plan nodes are blocked until inputs are obtained.`
  Missing input: `muju/academy/production/R??/public/audio/`. Bundle:
  `~/Archives/muju-media-2026-09-18/academy` (hashes in
  `~/Archives/muju-media-2026-09-18/MANIFEST.sha256`).
- **Nothing is owed by this change.** No spoken fact changed (node 17), so no
  clip needs regenerating, no caption needs re-aligning and no timeline needs
  rebuilding. The blocked status is the standing media-archive condition, not a
  debt this release created.

## 19. [blocked] academy-video — Final videos, mastering, posters, transcripts and visual QA

Reason: upstream changed: academy-audio
Paths: `muju/academy/{render-batch,render,master,…}`, `muju/academy/production/R??/{output,qa,public/music,public/art/*.png}/`

**Disposition: blocked** — planner-declared, same reason as node 18.

Evidence:

- `check` reports four unavailable media classes for this node (music beds,
  raster art, rendered episodes/posters/thumbnails, QA capture media), each with
  the archive location.
- No re-render is owed: no episode source changed (node 17). The published media
  stays v7/v8 at rules v2.8/v2.9 and the course notice carries the difference.

## 20. [changed] game-validation — Game, AI, server, MCP and browser regression gates

Reason: change kind: release; upstream changed: (11 upstream nodes)
Paths: `muju/tests/`, `muju/e2e/`, `muju/vitest.config.ts`, the three Playwright configs, both tsconfigs
Commands (cwd `muju`): `npm run server:types && npm test && npm run build`; `npm run test:online:e2e`; `npm run test:e2e -- e2e/ai-worker.spec.ts`

**Disposition: changed.**

Evidence — source:

- 106 files, 14 716 insertions / 1 253 deletions. Deleted with the preview path:
  `tests/ai/phasing-preview.test.ts` (−154),
  `tests/ai/phasing-preview-worker.test.ts` (−105),
  `tests/components/phasing-preview-ui.test.tsx` (−211). New:
  `tests/server/standard-retirement.test.ts` (+211),
  `tests/ai/phone-profile.test.ts` (+202),
  `tests/game/standard-save-archive.test.ts` (+165),
  `tests/hooks/ai-fallback-banner.test.tsx` (+160),
  `tests/components/phasing-ai-turn.test.tsx` (+147),
  `tests/hooks/ai-turn-safety-stop.test.tsx` (+112),
  `tests/hooks/ai-device-profile.test.tsx` (+110),
  `tests/components/report-gate.test.tsx` (+87),
  `tests/components/analysis-retired-guard.test.tsx` (+80),
  `tests/lab/source-files.test.ts` (+260),
  `tests/ai/hard/{pending-atrisk,promote,purchase}.test.ts`,
  `tests/fixtures/standard-room-v4.json` (+11 197).
- All 26 `e2e/*.spec.ts` files drive the Phasing turn; `playwright.online.config.ts`
  gained the three AI specs (D14) and `playwright.hard.config.ts` gained a
  configurable port (`MUJU_E2E_PORT`).

Evidence — release gates, all run on the final tree
(`/Users/ashkie/src/deevgames-phasing-cutover/muju`, node v24.11.1, npm 11.6.2):

| Gate | Command | Exit | Summary | Log |
| --- | --- | --- | --- | --- |
| server types | `npm run server:types` | 0 | clean | `<w4>/logs/1a-server-types.log` |
| app types | `npx tsc --noEmit` | 0 | clean, no output | `<w4>/logs/1b-tsc.log` |
| hard types | `npm run hard:types` | 0 | clean | `<w4>/logs/1c-hard-types.log` |
| balance types | `npm run balance:types` | 0 | clean | `<w4>/logs/1d-balance-types.log` |
| unit suite | `npm test` | 0 | `Test Files 211 passed (211)` · `Tests 2944 passed (2944)` · 363.73s · **0 failing** | `<w4>/logs/2-vitest.log` |
| hard tests | `npm run hard:test` | 0 | `Test Files 68 passed (68)` · `Tests 916 passed (916)` · 37.71s | `<w4>/logs/3-hard-test.log` |
| build | `npm run build` | 0 | `✓ built in 4.41s`; `tactics.wasm` byte-identical | `<w4>/logs/4-build.log` |
| online e2e | `npm run test:online:e2e` | 0 | `84 passed (2.8m)`, own server on 8928 | `<w4>/logs/5-online-e2e.log` |
| default e2e | real host on 8937 + `MUJU_BASE_URL=http://127.0.0.1:8937/muju/ npx playwright test` | 0 | `111 passed (2.7m)` | `<w4>/logs/6-default-e2e.log` |
| hard e2e | `MUJU_E2E_PORT=8927 npx playwright test --config playwright.hard.config.ts` | 0 | `12 passed (55.4s)`, desktop + mobile | `<w4>/logs/7-hard-e2e.log` |

How the default config must be served (this is the part that is easy to get
wrong): with a bare `vite preview` a dozen specs fail on the missing API and the
run says nothing about the cutover. Use
`PORT=8937 HOST=127.0.0.1 PUBLIC_URL=http://127.0.0.1:8937 MUJU_DB_PATH=:memory: node --import tsx server/index.ts`
and point `MUJU_BASE_URL` at it. Ports used across the run: 8928 (online config),
8937 (default config + retirement smoke), 8927 (hard config), 8941 (site smoke);
each checked free with `lsof -nP -iTCP:<port> -sTCP:LISTEN` first, each server
started in the same shell as the test it served with a `trap … EXIT INT TERM`.

Quarantine: `vitest.config.ts`'s `PHASING_QUARANTINE` list changed (21 lines).
Its dispositions — port or promote to evidence — remain follow-up **F5**;
`lab/hard-ai/recall/fixtures.jsonl` needs re-capturing as a Phasing position
before `tests/lab/recall.test.ts` can leave it (today its probe measures zero
positions, and the quarantine comment now says so).

## 21. [changed] static-package — Complete deevgames static release artifact

Reason: upstream changed: game-validation
Paths: `build-all.sh`, `tools/verify_site.py`, `tools/smoke-site.cjs`, `muju/vite.config.ts`, `muju/package.json`, `muju/package-lock.json`, `index.html`, `README.md`

**Disposition: changed.**

Evidence:

- 4 files, 13 insertions / 8 deletions: `README.md` (9), `index.html` (4, hub
  card copy), `muju/package.json` (−2: the dead `hard:spsa` and `hard:book`
  scripts, whose targets never existed), `tools/smoke-site.cjs` (6 — the smoke
  now mines, prepares and ends a Phasing turn). Commits `5611d77d`, `4bb4a7dc`,
  `2045d938`.
- `bash build-all.sh` (repo root) → exit 0, `Site verified: three games,
  portfolio, local links and asset sizes.` (VALIDATION 9a,
  `<w4>/logs/9a-build-all.log`).
- `python3 -m http.server 8941 --bind 127.0.0.1 --directory _site` +
  `node tools/smoke-site.cjs http://127.0.0.1:8941` → **`PASS 390px`** and
  **`PASS 834px`** (hub, Muju board/save, Forge, Oracle, direct refresh)
  (VALIDATION 9b, `<w4>/logs/9c-smoke-site.log`).
- `dist` assets at this commit:

  ```
  dist/index.html                      0.56 kB │ gzip:   0.36 kB
  dist/assets/tactics-BqBPWZyo.wasm    7.71 kB │ gzip:   3.53 kB
  dist/assets/entry-gKqmbGCo.js       50.23 kB
  dist/assets/engine-C2SN7b_X.js     172.01 kB
  dist/assets/index-pUeQkCy9.css      74.20 kB │ gzip:  15.84 kB
  dist/assets/index-CZKZoZsk.js      399.50 kB │ gzip: 127.23 kB
  ```

- Operational note for anyone repeating this: `forge/` and `oracle/` need
  `npm ci` in any worktree that runs `build-all.sh`, and `tools/smoke-site.cjs`
  loads Playwright from `oracle/node_modules`. Silent failure otherwise.
- **Cross-reference:** removing the two `package.json` script lines is exactly
  what blocks the Gate-0 suite bundle (node 11, item 1). The two facts belong
  together in any decision about re-authoring versus restoring.

## 22. [verified unchanged] server-package — Node host release with persistent room storage

Reason: upstream changed: game-validation
Paths: `muju/Dockerfile`, `muju/compose.yaml`, `muju/.dockerignore`

**Disposition: verified unchanged.**

Evidence:

- `git diff --stat eda73b26 d68db689 -- muju/Dockerfile muju/compose.yaml muju/.dockerignore`
  → **empty**.
- Import safety for the image (the build context excludes `lab docs tests e2e`):
  `rg -n "from ['\"](\.\./)+(lab|tests|docs|e2e)/" src server` → **no matches**
  (exit 1); a broader `(\.\./)+(lab|tests|docs|e2e)/` grep also finds none
  (VALIDATION 10a, `<w4>/logs/10-docker-safety.log`). `.dockerignore` excludes
  `lab docs tests e2e node_modules dist data .env* .git test-results
  playwright-report`; the build context is `muju/` and the `Dockerfile` lives
  there.
- **`docker` is unavailable on this box** (not on PATH, daemon unreachable), so
  the image was not built. Substituted: an rsync of `muju/` minus every
  `.dockerignore` entry, then `npm run build && npm run server:types` in that
  context → **exit 0**, so the image would build
  (`<w4>/logs/10b-docker-context-sim.log`).
- **Note for the release stage's `cmp` step (VALIDATION F5).** The docker-context
  build does **not** produce identical assets to a worktree build:
  `engine-*.js`, `entry-*.js` and the wasm are byte-identical, the index JS is
  byte-identical under a different content hash, but the index **CSS is 1 070 B
  smaller** (74 202 → 73 132). Cause: Tailwind v4 auto-scans the project, so a
  worktree build harvests ~20 extra utilities from `lab/`, `docs/`, `tests/` and
  `e2e/` text (including junk like `.189` and `.\[hard`). None of the 20 appears
  as a token in `src`, `index.html` or `public`, so there is no runtime risk —
  but Stage 5's byte comparison must stay **scoped to the engine chunk** and must
  not be widened to the CSS or to filenames.

## 23. [changed] academy-package — Versioned Academy site package and historical redirects

Reason: change kind: release; upstream changed: academy-video
Paths: `muju/academy/build-release.py`, `muju/academy/verify-live.py`, `muju/academy/verify-withdrawal.py`
External: `ethancd/ashkie-pages`: `muju-academy/`, `_redirects`, `offline-manifest.json`, `./check`, `tools/verify_muju_videos.py`

**Disposition: changed — prepared, not deployed.**

Evidence:

- `git diff --stat` → 2 files, 4 insertions / 4 deletions:
  `academy/build-release.py` and `academy/verify-live.py`, changed **together in
  one commit** (`e92dd756`) because the verifier pins the notice byte-for-byte.
  The notice no longer labels the recordings "Standard rules" and no longer
  presents the current turn order as an alternative called "Phasing".
- **The new `verify-live.py` assertions fail against the live site until the
  Academy is republished** — that is the expected ordering, recorded in
  `academy/STATUS.md`, not a regression. Do not "fix" the assertions back.
- Deployment is node 26 (pending release stage).

## 24. [pending release stage] static-deploy — Publish Cloudflare Pages deevgames

Reason: upstream changed: static-package
Paths: `.github/workflows/deploy.yml`
External: Cloudflare Pages project `deevgames`; `https://deevgames.pages.dev`
External (standing): publishing paused since 2026-09-18.

**Disposition: pending release stage.** Prepared and smoke-tested locally (node
21); nothing published from this branch.

Workflow change on this branch: `.github/workflows/deploy.yml` gained
`fetch-depth: 0` (+16 with its comment). Reason, recorded in the workflow itself:
`tests/lab/gate1.test.ts` reads the preregistration out of a pinned commit
(`git show a0551c8c:…`) and `tests/lab/suites-phasing-contract.test.ts` asks
`git log` / `git show --name-only` which files a floor-contract commit touched; on
a depth-1 clone the single grafted commit "touches" every file. The extra
checkout time is **seen and accepted** (decision D14); a numeric depth passes
today and breaks the moment `a0551c8c` ages out.

Procedure at release (PLAN §3 Stage 5 step 5, as amended by A-S5) — run from a
checkout at the **new `origin/master`**, i.e. `~/src/deevgames-muju-main` with
`git pull --ff-only`, **never** from a feature worktree:

```sh
for g in muju forge oracle; do (cd $g && npm ci); done
bash build-all.sh
python3 -m http.server 8941 --bind 127.0.0.1 --directory _site &
node tools/smoke-site.cjs http://127.0.0.1:8941
npx wrangler pages deploy _site --project-name deevgames --branch master
curl -s https://deevgames.pages.dev/muju/ | diff - _site/muju/index.html
node tools/smoke-site.cjs https://deevgames.pages.dev
```

Record the deployment URL. Wrangler auth is a local OAuth token in
`~/Library/Preferences/.wrangler/config/default.toml` (verified present:
`wrangler whoami` → logged in, account `9ae23d3bd5eff787baa8030712ca9ca2`).
A green workflow can mean checks-only when credentials are absent — confirm the
deploy step actually ran. If the owner prefers Pages stays paused, **record this
node blocked** and say so; this release does not silently un-pause it.

After a **successful** Pages deploy, and only then, a follow-up PR rewrites the
"publishing is paused" paragraphs at `docs/CONTENT_DAG.md:225-236` and
`../README.md:9-14` and adds the Pages skill-copy hash check
(`curl -s https://deevgames.pages.dev/muju/skills/muju-hono-tanka/SKILL.md | shasum -a 256`
== the repo copy). Those paragraphs are deliberately **not** rewritten here.

## 25. [pending release stage] server-deploy — Publish authoritative multiplayer/MCP host

Reason: upstream changed: server-package
External: `https://deevgames-muju.onrender.com`; Render web service with `/app/data` persistence (service `srv-dahbp4ht0dsc73fdqn10`, auto-deploys GitHub `master` with Docker, 1 GB disk at `/app/data`)

**Disposition: pending release stage.**

Procedure at release (PLAN §3 Stage 5 steps 1–4, as amended by A-S5):

1. `git fetch origin`; if `origin/master` moved, **merge** it into the branch
   (the freshness hook refuses otherwise — no rebase);
   `git push -u origin claude/phasing-only-cutover`; open the PR against
   `master`; trigger `workflow_dispatch` on the branch (`deploy.yml` runs on
   master push + dispatch only). **A green `workflow_dispatch` CI run is a HARD
   precondition of merging** — watch it with `gh run watch` and record the run
   id. Render deploys the merge regardless of CI, which is exactly why the CI
   run has to be green first.
2. Re-run the Stage-0 production baseline capture immediately before merging and
   diff it against the Stage-0 capture: **must be identical.**
3. Merge the PR — **that merge is the Render deploy** (Docker build from
   `muju/Dockerfile`, no test gate). Watch for the new container.
4. Post-deploy, all GET except the smoke room:
   `/api/muju/health` ok; `/muju/` 200 with the new bundle;
   `curl -s https://deevgames-muju.onrender.com/SKILL.md | shasum -a 256` ==
   the repo copy; MCP `tools/list` with
   `Accept: application/json, text/event-stream`; `muju_rules` →
   `ruleset.name === 'phasing'` and **no `rulesets.options`**;
   `GET /api/muju/rooms` → `[]`; `/rooms/archived?limit=100` → ≥ 41 with
   identical ids / `archivedAt` / `winner` / `reason`; per-room status codes
   identical to the baseline and the four `muju-phasing-2` bodies byte-identical;
   `POST /api/muju/rooms {"name":"cutover-qa"}` → `ruleset:'phasing'`,
   `pendingSummons: []`, `turn.phase:'action'`; **both** negative-create
   surfaces — HTTP `{"ruleset":"standard"}` → 400 `INVALID_REQUEST`, and MCP
   `muju_create_room` → an SDK invalid-params tool error naming `ruleset`;
   join / observe / resign the smoke room over MCP; `cmp` the **engine chunk**
   against a local `npm run build` (bytes, never filenames — see node 22's CSS
   note).
   **Diff tolerance:** every delta against the baseline must be explained by a
   room created after the baseline. Any changed `archivedAt` / `winner` /
   `reason` / status on a pre-existing id is a **failure**. The smoke room
   becomes +1 archived after 24 h.

## 26. [pending release stage] academy-deploy — Publish Muju Academy on ashkie.com

Reason: upstream changed: academy-package
External: `https://ashkie.com/muju-academy/`; `ethancd/ashkie-pages` deployment workflow

**Disposition: pending release stage.**

Procedure at release (PLAN §3 Stage 5 step 6, as amended by A-S5) — a separate
repository, a fresh worktree off `origin/main`, never the diverged local `main`
and never the `wishes` lane:

```sh
git -C ~/src/ashkie-pages fetch origin
git worktree add <scratch>/academy-notice -b claude/academy-phasing-only origin/main
```

Then, in that worktree: edit `muju-academy/index.html` with the **reworded**
strings from `muju/academy/build-release.py` (not the older
`website-notice.patch`); `cp muju/academy/verify-live.py tools/verify_muju_videos.py`;
**add the kid-facing `patch-notes.json` entry BEFORE** running
`python3 tools/build_offline_manifest.py`; `./check` (it fails on a stale
branch); commit; `git push origin HEAD:main`;
`python3 tools/verify_muju_videos.py https://ashkie.com`; eyeball desktop and
phone widths; `git worktree remove`.

Record the website revision, deployment URL, exact media hashes, range seeking,
historical redirects and retired assets.

## 27. [pending release stage] release-verification — Cross-surface completion evidence

Reason: upstream changed: static-deploy; upstream changed: server-deploy; upstream changed: academy-deploy
Paths: `muju/docs/changes/`

**Disposition: pending release stage.** This file is the pre-deploy half of the
record; the live-evidence half is filled at the release.

At release (PLAN §3 Stage 5 step 7, as amended by A-L5-a / A-S5):

1. Fill the deploy fields of the completion record below and the `_(fill)_` deploy
   slots of `docs/hard-ai/RELEASE-2026-09-21-phasing.md`.
2. Append J-022's live-evidence line.
3. **Tags — `standard-final` does NOT move.** It stays at commit **`71a2c511`**
   (the annotated tag object is `2b0f2bc0`; `git rev-parse standard-final^{commit}`
   → `71a2c511`) and is pushed **as-is**: it correctly anchors the last commit
   where the Hard replica, its pins and the `RELEASE-2026-09-18` evidence are
   valid for Standard rules — the replica became Phasing-only at `142f0904`.
   `git push origin standard-final`.
   A **new** tag `dual-ruleset-final` is created at the **first parent of the
   cutover merge commit** on `master` ("the last commit supporting both rule
   sets") and pushed:
   `git tag dual-ruleset-final <merge>^1 && git push origin dual-ruleset-final`.
   Both are named in J-022 and in amendment A6. (This reverses the plan's
   original D12, which would have re-pointed `standard-final`.)
4. Commit these records to `master` through a small follow-up PR.
5. Verify the cutover across every surface: browser UI, local AI behaviour,
   online engine, MCP rules and analysis, the public agent skills (both the Node
   host's `/SKILL.md` and the static `/muju/skills/` copies), and the live
   Academy page. Do not call this complete while any surface is stale or any
   publish is unverified.

Do **not** touch `/Users/ashkie/src/deevgames` (a dirty
`codex/muju-local-wip-2026-09-16` checkout); it must `git fetch` and merge before
its next commit.

---

## Compact completion record

```text
Change: two rule sets -> one. Phasing is the only ruleset Muju offers, displays,
  hosts, creates over HTTP/MCP or resumes from a local save; Standard is retired
  and never displayed. No rule text changed: an option was deleted and the
  variant description was folded into SPEC.md v3.1.
Rules revision / source commit / dirty-tree provenance: rules revision UNCHANGED
  at `muju-phasing-2` (J-022, D1; rulesSourcesSha256 7e367156…, catalogueSha256
  44bdcbf1…). Source: claude/phasing-only-cutover @ d68db689, base eda73b26
  (= origin/master, PR #25). Validated in /Users/ashkie/src/deevgames-phasing-cutover,
  `git status --porcelain` empty at the end of the run; record written in
  /Users/ashkie/src/deevgames-pc-lane8 (branch claude/pc-lane8) at the same tree.
Affected closure: python3 tools/muju-content-dag.py plan --kind rules --kind ai
  --kind ui --kind online --kind release --format markdown -> 27 nodes, 49 edges.
Node dispositions: 15 changed (rule-contract, transitions [call-site default
  only; no rule change], rules-docs, browser-ui, persistence, ai-search, hard-ai,
  ai-strength, server-runtime, mcp-tools, agent-guides, academy-lessons,
  game-validation, static-package, academy-package); 5 verified unchanged
  (catalogue, board-rules, wasm-tactics, balance-analysis, server-package);
  3 blocked (academy-data — rules-verification.json still "v2.9", needs the
  export-rules release action, blocked on the media bundle; academy-audio and
  academy-video — planner-declared local-only media, and nothing is owed by this
  change); 4 pending release stage (static-deploy, server-deploy, academy-deploy,
  release-verification). Evidence per node above.
Tests and generated reports: server:types 0; tsc --noEmit 0; hard:types 0;
  balance:types 0; `npm test` -> 211/211 files, 2944/2944 tests, 0 failing;
  `npm run hard:test` -> 68/68 files, 916/916 tests; `npm run build` -> built in
  4.41s with tactics.wasm byte-identical (sha256 6d3cf333…573c);
  test:online:e2e -> 84 passed; default config on a real host (port 8937) -> 111
  passed; playwright.hard.config.ts -> 12 passed; ai:tactics -> 28 fixtures / 84
  decisions / 36 of 36 rescues cleared; balance:check -> 18 distinct stat
  profiles, no dominated rows; build-all.sh -> "Site verified"; smoke-site ->
  PASS 390px and PASS 834px; hard:perft canonical 14959/1053/797 (standardTriple
  checked, replicaAgreed true) and replica 14959/1850/797; hard:fuzz 20000
  actions seed 7101 -> divergences 0, all mismatch counters 0; identity bridge
  at eda73b26 vs d68db689 -> IDENTICAL (16 games move for move, 589 unit ids
  in bijection). NOT GREEN, all pre-existing on origin/master and none caused by
  this cutover: hard:determinism crashes for any hard@* engine (a corrected probe
  gives identical:true, mismatches:0); hard:verify --all stops at M1 on a stale
  11-fixture criterion vs 7 fixtures; M6-M9, M11-M13 fail on Standard-ruleset lab
  corpora against the Phasing-only replica; M4/M5/M10 PASS; the Gate-0 suite
  measure is refused by loadBundle because the v2 manifest pins package.json's
  bytes and two dead scripts were removed (22 of 23 artifacts and all six suite
  documents byte-match; a scratch repin validates 225/225 cases, 0 veto findings;
  no measurement slot consumed). Logs: session-local <w4>/logs/; summary lines
  above are the durable record.
Academy impact: no episode, script, spoken fact, board, example or caption
  changed — the rules revision did not advance. Affected lesson IDs for the
  course notice (unchanged set): R01, R04, R05, R06, R07, R09, R10. Changed:
  the notice strings in academy/build-release.py and the matching assertions in
  academy/verify-live.py, in one commit (e92dd756), plus academy/README.md and
  academy/STATUS.md. Prepared, NOT deployed; the new verify-live assertions fail
  against the live page until the Academy is republished, which is the expected
  ordering. Owed: academy/rules-verification.json still reads "rules": "v2.9".
  No export, timeline or audio hash moved.
Static release: _(fill at release)_ — prepared and smoke-tested locally
  (build-all.sh green, smoke PASS at 390px and 834px); Pages publishing was
  paused before this release, procedure and un-pause condition in node 24.
Node/MCP release: _(fill at release)_ — the PR merge into master IS the Render
  deploy; a green workflow_dispatch CI run is a hard precondition; procedure and
  post-deploy diff tolerance in node 25.
Academy release: _(fill at release)_ — procedure in node 26.
Compatibility: no stored row is rewritten or reinterpreted. Local saves: schema 9,
  readable [5,6,7,8,9]; a non-Phasing payload is moved byte-for-byte to
  `elemental-tactics-save-retired` and loadGameState() returns null (never
  clearGameState()); the current key stays `elemental-tactics-save`; reviewable
  read-only at /muju/analysis?local=1&retired=1 with "Explore from here"
  disabled. Online rooms: the rules revision does not advance, so the four
  openable muju-phasing-2 rooms keep working; the 41 archived rooms (28 Standard,
  9 muju-phasing-1, 4 muju-phasing-2) stay listed and 409 on open, labelled
  "previous rules", with the dead Analyze link suppressed; the production
  database is neither reset nor rewritten. Replays: src/game/replay.ts and
  moveHistory.ts unchanged; src/game/migrate.ts kept as dead code (F9), so a
  legacy six-action save is archived rather than upgraded.
Remaining work: (1) fill the deploy fields here and in
  docs/hard-ai/RELEASE-2026-09-21-phasing.md; (2) tags — standard-final stays at
  71a2c511 and is pushed as-is, NEW tag dual-ruleset-final at the first parent of
  the cutover merge; (3) Gate-0 remedy (re-author a v3 bundle, restore two
  package.json lines, or record Gate 0 blocked for this release) — informational
  under A6, so not a ship blocker; (4) the lab-verification debts: hard:determinism's
  hardConfigFor call site, M1's fixture-count criterion, and the Standard lab
  corpora under lab/hard-ai/positions/; (5) F1 — delete the Standard branches in
  shipped source together with their tests (work order in node 4); (6) the
  follow-ups listed in docs/hard-ai/RELEASE-2026-09-21-phasing.md "Follow-ups
  filed"; (7) Stage 4 AI measurement — nothing from the knob screen is adopted.
  Prepared is not deployed: Pages, the Render host and the Academy notice are all
  still at the pre-cutover build.
```
