# p3 retune — lane S (suite bundle v3)

Worktree `/Users/ashkie/src/deevgames-p3-laneS`, branch `claude/p3-laneS`, cut from
`claude/muju-hard-p3-retune` at `ef6cdccf`. Scope: `docs/changes/2026-09-22-p3-retune-SPEC.md`
§6 (steps 1-4), read against §0/§7. Owns `lab/hard-ai/suites/phasing/**` (fixtures/v3-bundle,
results and the measurement ledger left untouched) and `tests/lab/suites-phasing*.test.ts`.
`src/**` untouched (read-only for this lane; never edited).

## Machine / queue

Shared 12-core box, load averages observed across the session: 13.96/10.34/7.70 at start,
17.74/11.70/8.32 mid-authoring, 8.17/11.45/10.13 during test runs, 8.88/9.03/9.27 at write-up.
Lane T held heavy-queue slot 0 throughout (`ladder-shard 0/1 hard@env-vs-Rush fixed:60000` from
`deevgames-p3-laneT`); slot 1 was free the whole time this lane needed it, so authoring and
`validate` (each one heavy-slot acquisition) never had to wait on the queue. Neither
`MUJU_HEAVY_SLOTS` nor `MUJU_HEAVY_BYPASS` was set.

## Changed

### 1. Read the required documents (step 1)

Read, in order: this SPEC's §0/§6/§7; `docs/changes/2026-09-22-kill-clock-lane2.md` (the
ai-strength node and re-pin table — confirms `canonical.ts`, `format.ts` and
`build-invariants.ts` case 16 were already moved by the kill-clock lane, declared in
`KILL_CLOCK_ARTIFACT_EDITS`); `docs/hard-ai/phasing/M5-FLOOR-PREREGISTRATION-v2.md` in full
(floor rule, the free-win veto, intruder-survival horizon, invariant demotion, contract
integrity, and "What was actually authored" — the v2 bundle's exact composition and per-case
dispositions); `docs/changes/m5-suites-2026-09-19/` (directory listing only — the floor doc
already carries the load-bearing content); `run.ts`, `build-v2.ts`, `canonical.ts`, `contract.ts`,
`manifest.ts`, `format.ts`, `fixtures/v2/manifest.json`, both target test files.

Key finding before authoring anything: `canonical.ts`'s `RULES_VERSIONS`/`currentRulesVersion`
already key on `(limit, verdict)` and name `muju-phasing-3`, and `format.ts`'s `reason` enum
already carries `'kill-clock'` — both landed with the kill-clock lane, ahead of this campaign.
This lane's job was authoring the case data against that already-updated schema, not touching
the schema itself.

### 2. Authored bundle v3 (step 2)

`node --import tsx lab/hard-ai/suites/phasing/run.ts author-v2 --out
lab/hard-ai/suites/phasing/fixtures/v3-bundle`: `{"valid":true,"release":"v2","cases":225,
"members":245,"errors":[],"vetoRefused":[],"checksFailed":[],"acceptance":"not-established"}`.
115.5 s wall (heavy-slot held throughout). `execution.json`: `sourceDrift: false`.

`node --import tsx lab/hard-ai/suites/phasing/run.ts validate --manifest
fixtures/v3-bundle/manifest.json --out <scratch>`: same result, 110.0 s wall — an independent,
from-scratch replay of all 225 author-evidence checks plus the free-win veto over all 131
macro-decisions, 0 findings, 0 checks failed.

Composition is byte-identical in shape to `fixtures/v2` (same `author-inputs/new-candidates-v2.json`
declarative delta, re-derived canonically against the current tree rather than read from frozen
v2 observations):

| Family | Cases | Offered |
|---|---:|---:|
| tactics | 79 | 63 |
| invariants | 20 | 15 |
| home-mate | 56 | 28 |
| economy | 30 | 20 |
| summon-disruption | 30 | 14 |
| home-fortify | 10 | 6 |
| **total** | **225** | **146** |

245 logical members, 131 macro-decisions. Manifest semantic sha256
`da3589338557f74329c72fc8a231967a2f3a89656b1405f573a66a0dfbaac6e9` (differs from v2's
`454fe137aa5bf97…` because `sourceBinding.rulesVersion` is now `muju-phasing-3` and
`catalogueSha256` binds the renamed `src/game/units.ts`). Manifest file sha256
`e2d8134351c531effa2779cfe7688f9c25865ab78d8530f97ff7538a9c01eb05`.

**Clock-dependent re-authoring.** Grepped every v2/v3 builder (`build-v2.ts`, `build-tactics.ts`,
`build-home-mate.ts`, `build-economy.ts`, `build-new-families.ts`, `build-invariants.ts`) for
`inactivity`/`INACTIVITY`/`clock`/`kill-clock`. Exactly one case's *content* is clock-dependent:
invariant 16 (`clock-discipline`, `build-invariants.ts:180-204`). It was already re-authored by
the kill-clock lane (declared in the frozen `KILL_CLOCK_ARTIFACT_EDITS` this lane's tests
supersede — see below): the premise reads `INACTIVITY_LIMIT - 1` off the shipped constant
rather than a literal `19`, and the correct-member endpoint asserts `reason: 'kill-clock'`
(not `'inactivity'`) with `winner: null` (the fixture's own tie — neither side has mined
anything — is unchanged; only the reason string the rule now produces moved). Because the
premise is derived from the constant, it re-authors correctly at ten plies with **no further
source edit** from this lane; the fresh `author-v2` run above reproduces it and it passed
`validate` cleanly. No other invariant, tactics, home-mate, economy, summon-disruption or
home-fortify case reads or asserts a clock value, an inactivity-plies fact, or an `'inactivity'`
terminal reason — confirmed by the grep above and by every one of the 225 authored checks
passing.

Economy's own clock-independence claim (M5-FLOOR-PREREGISTRATION-v2.md, "Economy": longest
horizon is 9 plies from root, below both the old ten-ply and the archived twenty-ply limits) was
re-verified structurally: `build-economy.ts` sets `inactivityPlies: opts.clock ?? 0` and no
economy case in `author-inputs/new-candidates-v2.json` passes a `clock` value, so every economy
root starts at ply 0 and its horizon stays well inside ten plies either way.

**Piece display names.** Grepped the authored `fixtures/v3-bundle/` JSON, every `build-*.ts`
source, and `author-inputs/` for all ten renamed piece display names from
`docs/changes/2026-09-22-rename-irumbu-BRIEF.md`'s rename map (`Hono`, `Kimubunga`, `Sjor`,
`Aegirinn`, `Göl`, `Sachita`, `Sachakuna`, `Yan`, `Mazask`, `Tanka`, plus `HONO TANKA`/`Hono
Tanka` for the title): zero matches. Cases reference pieces exclusively by stable catalogue
`definitionId` (`water_1`, `fire_2`, …), which the rename did not touch; the only catalogue
surface the rename touched (`src/game/units.ts` display-name bytes) is bound by
`catalogueSha256`, and the fresh authoring run picked up the new bytes automatically —
confirmed by `verifySourceBinding` passing in every one of the 225 checks (a binding mismatch
throws and would show up as a `checksFailed` entry, and `checksFailed` is empty).

### 3. Manifest test re-pinned, load test un-skipped (step 3)

`tests/lab/suites-phasing-manifest.test.ts`: `MANIFEST` now points at
`fixtures/v3-bundle/manifest.json`; `V2_MANIFEST_SHA256` replaced by `V3_MANIFEST_SHA256`
(`da358933…`, the value above); `KILL_CLOCK_ARTIFACT_EDITS` is now `{}` — the bundle was
authored directly from this tree, after both the kill-clock and rename source edits landed, so
its artifact pins already match source exactly with nothing to declare (kept as a named
allow-list, not deleted, so the next undeclared suite-source edit after this bundle is committed
still fails loudly rather than silently passing). The previously-`it.skip`'d "still loads
against the live tree through the measurement path loader" is un-skipped: `fixtures/v3-bundle`
binds cleanly under `muju-phasing-3` and the renamed catalogue, so the source-binding mismatch
that superseded `fixtures/v2` (both dated 2026-09-22: the rename changed `catalogueSha256`
bytes, the kill clock changed the live `rulesVersion`) does not apply to it. Comments added
distinguishing this from the pre-existing, unrelated `fixtures/v3/floor-contract.json` (a
2026-09-21 phasing-only-cutover artifact from a different campaign, `pc-lane1`, that
re-declares floors against the OLD v2 manifest hash and is untouched by this lane — the two
"v3"s are easy to conflate and are not the same thing).

**Test results.** `npx vitest run tests/lab/suites-phasing-manifest.test.ts`: 1 file, 2 tests,
both green (1.98 s). `npx vitest run tests/lab/suites-phasing*.test.ts` (all 13 files in the
family — classification, contract, economy, engine, invariants, manifest, new-families, runner,
tactics-home, v2-authoring, v2-schema, veto, and the umbrella `suites-phasing.test.ts`): **13
files / 216 tests, all green**, 342.7 s wall (596.8 s of test time under the shared box's
concurrency). `npm run hard:types` (`tsc -p lab/hard-ai/tsconfig.json --noEmit`): clean, no
output, exit 0 — run twice (once before, once after the test-file edit) with the same result.

### 4. Floor contract and measure — not run (step 4, honored)

Did not write `lab/hard-ai/suites/phasing/fixtures/v3-bundle/floor-contract.json` and did not
run `hard:suite:phasing:measure`. Neither `lab/hard-ai/suites/phasing/results/**` nor
`lab/hard-ai/suites/phasing/measurement-ledger.jsonl` was touched (`git status` confirms —
only the two commits below appear in `git log` for this lane). Writing the floor contract needs
the retuned build's `engineSourceSha256`/`weightsSha256` (lane T's winner, adopted in §5), which
this lane does not have and is not authorized to guess.

## Verified unchanged

- `src/**` — not read for editing, not touched (grep/read-only per ownership).
- `fixtures/v1/**`, `fixtures/v2/**` — byte-identical; this lane only *added*
  `fixtures/v3-bundle/` and edited one test file. `git status --short` for the whole lane:
  two new commits touching exactly `lab/hard-ai/suites/phasing/fixtures/v3-bundle/**` (9 new
  files) and `tests/lab/suites-phasing-manifest.test.ts` (1 file). Nothing else in the working
  tree is modified.
- `fixtures/v3/floor-contract.json` (the pre-existing, differently-scoped file from the
  2026-09-21 phasing-only-cutover campaign) — read for disambiguation only, not edited.
- `contract.ts`, `V1_ALLOWED_MISS` — read, not edited; the allowed-miss budget stays the frozen
  v1 vector (tactics 6, invariants 1, home-mate 0, economy 0, summon-disruption 1,
  home-fortify 0), unchanged by this lane and not re-derived here (that is §5's coordinator step,
  once the v3-bundle's offered counts and a build identity both exist — offered counts now do:
  see the table above, identical to v2's).

## Blocked

Nothing in this lane's step list (§6 steps 1-4) was blocked. The floor contract and measurement
(step 4) are deliberately not run, per explicit instruction — recorded above under "Changed" as
an honored constraint rather than a blocker, since no attempt was refused; the work simply
belongs to the coordinator after §5 adoption.

## Evidence summary

- Manifest semantic sha256: `da3589338557f74329c72fc8a231967a2f3a89656b1405f573a66a0dfbaac6e9`
- Manifest file sha256: `e2d8134351c531effa2779cfe7688f9c25865ab78d8530f97ff7538a9c01eb05`
- Bundle: 225 cases / 245 members / 131 macro-decisions / 146 offered units (79/63 tactics,
  20/15 invariants, 56/28 home-mate, 30/20 economy, 30/14 summon-disruption, 10/6 home-fortify)
- `author-v2`: valid, 0 errors, 0 veto findings, 0 failed checks (115.5 s)
- `validate` (fresh process): valid, 0 errors, 0 veto findings, 0 failed checks (110.0 s)
- `npx vitest run tests/lab/suites-phasing*.test.ts`: 13 files / 216 tests passed
- `npm run hard:types`: clean
- Commits on `claude/p3-laneS`: `c2090be8` (author bundle v3), `fb33c6dd` (manifest test), this
  report committed last.
