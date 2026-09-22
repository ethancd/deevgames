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

## Superseded evidence, retired arm names and the weights contract

Recorded before the ledger because the rows below are read against it. The two
paragraphs that follow are **verbatim** from the ci-green lane's handoff, written
there for this file (that lane does not own it):

> `eecdf14c` changes the play of exactly one profile, `hard@lab-refined`
> (`lab/hard-ai/bots/hard.ts:256`, `useFutility: true`), because the depth-1 futility bound now
> includes the pending-summon credit (`src/ai/hard/search/pvs.ts:709`). Its resolved config and
> identity hash are unchanged, so
> `docs/hard-ai/phasing/repair-2026-09-20/results/ladder-w1500-labrefined-vs-aiv2hardturn/` is
> superseded and must not be compared across this commit. `hard@desktop` and every other profile
> are bit-identical (fixed-work self-play, seed 31337, 6 games byte-equal).
>
> `eecdf14c` also changes, by design, the numbers the lab INSTRUMENTS print: `hard:recall`,
> `hard:audit`, `hard:analyze`, `hard:coverage` and `lab/hard-ai/bench/p6-turn-time.ts` now score
> positions with the same within-turn sum the engine plays with (`src/ai/hard/eval/turnScore.ts`),
> pending-summon credit included. That is the point of the commit — before it, the instruments
> described a generator nobody plays — but it means every `*Value`, `regret_*` and other
> score-derived column those tools emit moves wherever a position holds paid pending summons,
> which under Phasing is routine. No `configHash` and no arm identity moves with it, so nothing
> mechanical flags it. Therefore **every committed result row under `muju/lab/results/**` and
> `muju/lab/ai/results/**` produced by those instruments predates the shared scorer and must not
> be diffed across `eecdf14c`** — 79 files, listed by
> `git ls-files | grep -E "results/.*(coverage|audit|recall)"`. Re-generate a baseline on the
> merged tree before comparing anything; do not read a moved column as a generator regression.

Line numbers in that quotation are the ci-green lane's own worktree. On this
merged tree the two citations are `lab/hard-ai/bots/hard.ts:270` (the
`hard@lab-refined` branch, `useFutility: true`) and `src/ai/hard/search/pvs.ts:693`
(the futility test) with the credited sum at `:709`; the file count is unchanged
(`git ls-files | grep -E "results/.*(coverage|audit|recall)" | wc -l` -> 79 at the
merged tip). Nothing else in the quotation is re-pointed.

**Retired arm names — the mapping anyone reproducing a repair row needs.** About
30 files under `docs/hard-ai/phasing/repair-2026-09-20/results/**` plus that
directory's `HANDOFF.md` quote arm names that no longer exist in
`lab/hard-ai/ablate/arms.ts`. Those are dated records and are not edited, so the
mapping lives here: **since `71b41a39`, `hard@ablate:hand-priors-pc` ==
`hand-priors` == `bank25-pc` == `hard@desktop`**, and the old `bootstrap-pc` is
today's `weights-bank100` (*not* `weights-bootstrap-m6`, which is the genuine
five-entry M6 bootstrap vector). `4bb4a7dc` then removed those four scratch arms
(`hand-priors`, `hand-priors-pc`, `bootstrap-pc`, `bank25-pc`) and added three
honest ones (`weights-bootstrap-m6`, `weights-bank100`, `weights-no-priors`), so
`ARMS.length` went **61 -> 60**; the strength lane appended seven `evalFix`
strength arms on top, and the merged tree carries **67**. No test pins the count
(the existing `new Set(hashes).size === ARMS.length` assertions are
self-referential), so a count is evidence only when measured:
`node --import tsx -e "import('./lab/hard-ai/ablate/arms.ts').then(m=>console.log(m.ARMS.length))"`
from `muju/`.

**`WEIGHTS_VERSION` contract change.** The constant stays **2** (D9), but its
contract changed on 2026-09-21: it is now bumped **when the vector's SCHEMA
changes** — the feature count, their meaning, or the file shape `loadWeights`
accepts — and no longer whenever the numbers change. The numbers *did* change on
2026-09-20 without a bump, when `phasing-hand-priors-v1` replaced the
five-nonzero M6 bootstrap; that was deliberate and is now the standing rule,
because a bump makes `loadWeights` reject every stored vector, including the 33
reviewed JSONs under `phasing/repair-2026-09-20/weights/` and the book key.
Stated in the docstring at `src/ai/hard/eval/weights.ts:14` and in
`../../JUDGMENT_LOG.md` J-022.

**Documented-future commands that name deleted scripts.** `hard:spsa` and
`hard:book` were removed from `package.json` on 2026-09-21; neither target ever
existed (`lab/hard-ai/tune/spsa.ts` and `lab/hard-ai/book/` are absent, and
`docs/hard-ai/e3/E3.3-TUNING-INSTRUMENT.md:35-37` records `hard:spsa` failing
with module-not-found in 2026-09-17). One reference survives in code and is
deliberately left alone:

| Surface | What it is | Disposition |
| --- | --- | --- |
| `lab/hard-ai/verify/gates.ts:621` | `npm run hard:book …` inside the **M18 `notImplemented` gate row** | Kept. A `notImplemented` row is a documented future command that the verify runner never executes — it fails with `not-implemented` by construction. Anyone implementing M18 writes the script first. |
| `docs/hard-ai/DESIGN.md:229-230,260-261,1507`, `MILESTONES.md:348,377`, `e3/E3.3-TUNING-INSTRUMENT.md:35-37,312-313` | historical plan text naming both scripts | Kept as written, each file stamped with a dated one-line note at the top rather than rewritten. |

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
