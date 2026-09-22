# Hard AI release record — 2026-09-21, the Phasing-only cutover

Owner instruction (Ethan, 2026-09-21): make Phasing the ONLY deployed ruleset —
retire Standard, never display it — make the AI engine good and solid, and
finish the repo's next-session list. This file is the decision record for that
release, in the shape of `RELEASE-2026-09-18.md`: written as it happens, stamps
from `date -u`, **appended, never rewritten**.

Authority and scope live in two places and are not restated here:
`../../JUDGMENT_LOG.md` J-022 (the rules half) and amendment **A6** of
`PHASING-PREREGISTRATION-2026-09-18.md` (the gate half). A6 waives the *ordering*
of the staged unlock and nothing else; Gates 0, 2 and 3 keep their definitions.

**Standing constraint from A6, repeated because it binds this file:** until the
Gate 2 sealed row has been run and reported, no release note, changelog,
marketing string or player-facing copy may claim the Hard engine is stronger
than `AIEngineV2`. Copy may say which engine plays the Hard seat and how to opt
out. Fill the slots below with what was measured, including failures.

## What ships

- **Rules.** Phasing only, rules revision **`muju-phasing-2`** — unchanged.
  `SPEC.md` v3.1 states it normatively; Standard cannot be created, chosen or
  resumed. No measurement is voided (J-022, A6).
- **Engine.** `hard@desktop` — the repaired engine from
  `phasing/repair-2026-09-20/`: unconditional pending-summon scorer credit
  (`src/ai/hard/engine.ts`) plus the `phasing-hand-priors-v1` weight vector
  (43 non-zero, `weightsHash 14d06ba8`, `WEIGHTS_VERSION` 2 — the schema did not
  change; see `eval/weights.ts`). Config hash at the release commit: _(fill)_.
  **Verified at this commit:** no file under
  `lab/hard-ai/suites/phasing/fixtures/**` pins `weightsLabel`
  (`grep -rn weightsLabel lab/hard-ai/suites/phasing/fixtures/` -> 0 hits across
  `v1/` and `v2/`, 20 files), so shipping the `phasing-hand-priors-v1` vector
  needs no suite-fixture edit and moves no fixture expectation.
- **Route.** `hardEnabled = true`; the Hard difficulty routes to the new engine
  in Phasing vs-AI and Watch-AI, with `?hardAi=0` opting a seat back to
  `AIEngineV2`'s hard preset and `?hardMs=` overriding the budget. Easy and
  medium keep `AIEngineV2`. The `?phasingAi=1` preview flag and the worker's
  Phasing refusal are deleted.
- **Strength knobs.** The generator/eval knobs added this pass ship with
  **defaults that reproduce current behaviour**; adoption is a separate commit
  after the post-release measurement rows. Defaults at this commit: _(fill)_.
- **Branch.** `claude/phasing-only-cutover` → `master` by pull request. Two
  production surfaces deploy differently: Render builds `muju/Dockerfile` from
  `master` with no test gate (that merge *is* the deploy); Cloudflare Pages
  publishes only when `deploy.yml` passes, and Pages publishing for Muju was
  paused before this release — record whether it was un-paused here.
  PR: _(fill)_. Merge commit: _(fill)_. Two tags, and `standard-final` does
  **not** move: it stays at commit `71a2c511` (`2b0f2bc0` is the annotated tag
  object, not a commit) and is pushed as-is, anchoring the Standard-era strength
  records including `RELEASE-2026-09-18.md` — pushed: _(fill)_. A new tag
  `dual-ruleset-final` is created at the merge commit's first parent, the last
  commit supporting both rule sets, and pushed: _(fill)_. (J-022, A6.)

## Release ledger

Post-release measurement rows use seeds **7101–7606** and never the 2026095x /
2026096x Gate seeds. Read `**VOID**` before any number: a wall-mode row taken on
a loaded box is void under A14.

| # | seed | arm | vs | work | openings | pairs | out | result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C0 | 7101 | `hard@desktop` (control) | Rush | fixed:50000 | p1-dev 16 | 16 | _(fill)_ | _(fill)_ |
| S1 | 7101 | _(arm)_ | Rush | fixed:50000 | p1-dev 16 | 16 | _(fill)_ | _(fill)_ |
| S2 | 7101 | _(arm)_ | Rush | fixed:50000 | p1-dev 16 | 16 | _(fill)_ | _(fill)_ |
| T1 | 7101 | _(time arm)_ | Rush | wall:1500 | p1-dev 16 | 16 | _(fill)_ | _(fill)_ |
| D1 | 7202 | _(top 3)_ | Rush | fixed:50000 | p1-dev, skip 16 | 16 | _(fill)_ | _(fill)_ |
| V1 | 7303 | _(top 2 + default)_ | `aiv2-hard-turn` | wall:6000 | p1-dev 16 | 16 | _(fill)_ | _(fill)_ |
| V2 | 7404 | _(winner + default)_ | `aiv2-hard-turn` | wall:6000 | p1-val 32 | 32 | _(fill)_ | _(fill)_ |
| V3 | 7505 | _(winner + default)_ | Rush | wall:1500 | p1-val 32 | 32 | _(fill)_ | _(fill)_ |
| P1 | 7606 | `hard@desktop`, `hard@phone` | `aiv2-hard-turn` | wall:7500 | p1-dev 8 | 8 | _(fill)_ | _(fill)_ |

Incumbent references, for direction only, from `phasing/repair-2026-09-20/`:
53–0–11 on `p1-val` at 6 s vs `aiv2-hard-turn` (+273 [+161, +476]); 28–0–4 on
`p1-dev` at 6 s; 12–0–20 vs Rush at 1.5 s. Those are development evidence plus
one look at `p1-val`, not gate evidence (A6).

### Adoption rule, stated before looking

Recorded here so the acceptance condition is not written after the numbers:
val score vs `aiv2-hard-turn` ≥ 0.78 with the Elo interval excluding 0 and the
row not VOID; Rush ≥ 0.50 replicated on the disjoint dev slice and holding on
val; 0 illegal actions, 0 divergences, 0 fallbacks; spend ≥ 50 %;
upkeep-elimination ≤ 15 % of losses; Balanced ≥ 0.9; Expand ≥ 0.6; suite
families not worse than the pre-release measure. Adoption is one commit flipping
the defaults, plus hash re-pins, a new floor contract committed alone, a
re-measure and a ledger line here.

## Gate 0 — correctness veto (informational under A6, reported either way)

Run before the merge, on the release tree. Record the command, the artefact path
and the per-family result, including any family below its floor.

| Check | Command | Result |
| --- | --- | --- |
| Suite measure (v3 floor contract, committed alone) | `npm run hard:suite:phasing:measure -- --manifest … --contract …` | _(fill)_ |
| Determinism | `npm run hard:determinism` | _(fill)_ |
| Replica / identity verify | `npm run hard:verify` | _(fill)_ |
| Full unit suite | `npm test` | _(fill)_ |
| Types | `tsc --noEmit`, `server:types`, `hard:types` | _(fill)_ |
| Browser e2e | `test:online:e2e`, default-config AI specs, `playwright.hard.config.ts` | _(fill)_ |
| Site smoke | `bash build-all.sh` + `tools/smoke-site.cjs` | _(fill)_ |

Expected before the run, recorded so the reading is honest: the invariants family
is expected at 12–13 of 15 against a floor of 14, i.e. **below floor**. Under A6
that is reported as a failure of an informational check, not converted into a
pass, and the regression is owed a fix.

## Gate 2 and Gate 3 — still owed

- **Gate 2** (sealed strength row, `p1-sealed.jsonl`, 32 pairs, seed 20260953,
  SPRT rule, no reruns): not run at this release. `p1-sealed.jsonl` is untouched.
  Status: _(fill when run)_.
- **Gate 3** (desktop p95 ≤ 6,000 ms, phone p95 ≤ 3,000 ms): unmeasured on the
  shipped configuration at this release. Report both the shipped 7,500 ms
  whole-turn allowance reading and the literal 6,000 ms one. Note that the
  browser runs the DESKTOP search shape on every device, so the phone number is
  unrepresented, not merely unmeasured. Status: _(fill when run)_.

## Post-deploy verification

All GET except the smoke room. Fill each with what came back.

| Check | Expected | Result |
| --- | --- | --- |
| `/api/muju/health` | ok | _(fill)_ |
| `/muju/` | 200, new bundle | _(fill)_ |
| `/SKILL.md` sha256 | equals the repo copy | _(fill)_ |
| MCP `tools/list` | responds with the single-ruleset descriptions | _(fill)_ |
| `muju_rules` | `ruleset.name === 'phasing'`, no `rulesets.options` | _(fill)_ |
| `GET /api/muju/rooms` | `[]` | _(fill)_ |
| `/rooms/archived?limit=100` | ≥ 41, ids/`archivedAt`/`winner`/`reason` identical to the pre-merge baseline | _(fill)_ |
| Per-room status codes | identical to the pre-merge baseline; the four `muju-phasing-2` bodies byte-identical | _(fill)_ |
| `POST /api/muju/rooms {"name":"cutover-qa"}` | `ruleset:'phasing'`, `pendingSummons: []`, `turn.phase:'action'` | _(fill)_ |
| `POST …{"ruleset":"standard"}` | 400 `INVALID_REQUEST` | _(fill)_ |
| Engine chunk | `cmp` against a local `npm run build` (bytes, never filenames) | _(fill)_ |
| Cloudflare Pages | `deevgames.pages.dev/muju/` matches `_site/muju/index.html`; smoke green | _(fill)_ |
| Academy notice (ashkie-pages) | live strings match `academy/build-release.py`; `verify_muju_videos.py` green | _(fill)_ |

## Not in this release

Each line below is a next step from
`phasing/repair-2026-09-20/HANDOFF.md` or a debt this release carries. A
disposition is either "run in Stage 4" with the ledger row it becomes, or
"dropped: <reason>". No line ships blank.

- **Round 3 weight rows (handoff next-step 2) — disposition: _(fill: "run in
  Stage 4" or "dropped: <reason>")_.** Round 3 was queued and never run:
  `combined-best-guess+pc`, `phasing-priors-v1+pc` and `econ-only-best-guess+pc`
  against Rush at `wall:1500` and against `aiv2-hard-turn` at `wall:6000`,
  driver `phasing/repair-2026-09-20/scripts/round3.sh`. If run, each row runs as
  `--a hard@env` with `MUJU_HARD_WEIGHTS` set — the env hook is scoped to the
  `env` profile and never reaches `hard@desktop` — and lands in the ledger above
  with its seed, work mode and artefact path. The `_(arm)_` rows in that table
  are the slots these fill.
- **Random search over the 8 knobs (handoff next-step 5) — disposition: _(fill:
  "run in Stage 4" or "dropped: <reason>")_.** The plan is `randomSearchPlan` in
  `phasing/repair-2026-09-20/reports/knobs/synthesis.json`. It is a search, not
  an adoption step: any winner still has to clear the adoption rule above on
  rows re-run against the post-merge identity.
- **Owed: `academy/rules-verification.json` still reads `"rules": "v2.9"`.** The
  Academy course notice was reworded for the single ruleset
  (`academy/build-release.py`, `academy/verify-live.py`), but the machine-read
  verification file is regenerated by the Academy `export-rules.ts` release
  action, which is blocked on the media bundle — it is not a hand edit. Recorded
  in `academy/STATUS.md`; repeated here because this file is what the release
  stage works from. Status: _(fill when regenerated)_.
- _(fill: other follow-ups filed, and what is prepared-not-deployed.)_
