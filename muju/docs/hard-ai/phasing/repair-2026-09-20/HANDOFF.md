# Hard AI under Phasing — repair handoff (2026-09-20)

Written in a hurry at the end of a session on the owner's laptop. A fresh cloud session cloning
`deevgames` should read this file first. Everything referenced is in this directory.

## One-paragraph state

On master `a02bbb7` the new Hard engine (`muju/src/ai/hard`) was **much weaker** than the old
`AIEngineV2` under Phasing (11–3–82 at 1.5 s/turn; 7–1–24 at 6 s/turn; 1–0–31 vs the scripted Rush
bot) while being fully correct (0 illegal actions, 0 replica divergences, 0 fallbacks in ~1,500 games).
Cause: it hoards crystals and never promotes. A **3-line scorer fix plus a hand-set weight vector**
turns that into **28–0–4 (dev openings, 6 s), 53–0–11 (held-out openings, 6 s), 49–0–15 (held-out,
1.5 s, per-action old engine)**. The scorer fix ALONE gives 25–0–7. Nothing beats scripted Rush yet
(best: 13–0–19).

## Root causes (all verified in code; see reports/)

1. **Within-turn scorer ignores pending summons** — `src/ai/hard/engine.ts:355-360` scores complete
   turns with `stage0 + stage1`; under Phasing a bought unit is a *pending* summon whose value is
   feature 58 (stage 2). So every BUY reads as −100 cc per crystal, and the K=24 cut
   (`gen/generate.ts:879,915`) evicts buying turns before search sees them. Fix: credit
   `(pendCostSum[mover] − pendCostSum[other]) * 100`.
2. **Bootstrap weights** — `eval/weights.ts` had 5 of 62 weights non-zero (commit `e701ccc`), cash
   valued exactly like units, every home/tactical feature 0.
3. **Promotion scores about −400 cc** — material gain cancels the cash paid, then the EconDelta
   forecast charges new upkeep at RENT_PV≈4.22 crystals per upkeep crystal
   (`tables/phasing-economy.ts:219`). Knobs: bank discount, tier premium on `material[]`, `TierClimb`.
   Do NOT restore the old `Rent −422` weight: it double-charges upkeep.
4. **Generator limits weights cannot fix** — `gen/promote.ts:196-197,252-253` only emits a promotion
   when it finds a FORTIFY/SURVIVE/ANCHOR/INCOME/REACH mission (8 of 51 legal promotions were ever
   offered); one promotion per Prepare; `gen/purchase.ts:441-461` + `config.ts:543` (`maxPlans 12`,
   cheapest-first) means at bank ≥ 12 the menu is only fire_1 ×1..4. This is the prime suspect for
   the Rush losses.
5. **Time use** — work-rung rounding uses ~1.07 s of a 1.5 s allowance; measured ~50 work units/ms vs
   the 200–600 the config assumes (`search/time.ts:225-233`, arms `work-fit`, `search-iter-fit`).

## Results table (Phasing `muju-phasing-2`, handicap 0, seat-mirrored pairs, 8 shards)

| Hard arm | Opponent | Budget | Openings | W–D–L | Elo | Harness timing rule |
|---|---|---|---|---|---|---|
| master | aiv2-hard-turn | 1.5 s | p1-dev 48 | 11–3–82 | −330 | VOID (opponent overran) |
| master | aiv2-hard (per action) | 1.5 s | p1-val 32 | 4–0–60 | −470 | VOID |
| master | aiv2-hard-turn | 6 s | p1-dev 16 | 7–1–24 | −206 | valid |
| master | aiv2-medium | 1.5 s | p1-dev 24 | 4–0–44 | −417 | VOID |
| master | Rush / Expand / Balanced | 1.5 s | p1-dev 16 | 1–0–31 / 22–10–0 / 31–0–1 | | valid |
| **scorer fix only** | aiv2-hard-turn | 6 s | p1-dev 16 | **25–0–7** | +221 | valid |
| **scorer fix + hand priors** | aiv2-hard-turn | 6 s | p1-dev 16 | **28–0–4** (agent run: 29–0–3) | +338 | valid |
| **scorer fix + hand priors** | aiv2-hard-turn | 6 s | **p1-val 32** | **53–0–11** | +273 [+161,+476] | valid |
| **scorer fix + hand priors** | aiv2-hard (per action) | 1.5 s | **p1-val 32** | **49–0–15** | +206 | VOID (timing under load) |
| scorer fix + hand priors | Rush | 1.5 s | p1-dev 16 | 12–0–20 | −89 | valid |
| + tier ×1.6/2.2 + solvency | Rush | 1.5 s | p1-dev 16 | 13–0–19 | | valid |
| + tier ×1.3/1.7 | Rush | 1.5 s | p1-dev 16 | 12–0–20 | | valid |
| + solvency only | Rush | 1.5 s | p1-dev 16 | 13–0–19 | | valid |
| old engine aiv2-hard | Rush | 1.5 s | p1-dev 16 | 7–0–25 | | VOID |
| aiv2-hard vs aiv2-medium | | 1.5 s | p1-dev 24 | 26–0–22 | +29 | VOID (indistinguishable) |

Weights-only sweep (no scorer fix) vs Rush is in `results/ALL-PROGRESS-LINES.txt`: bank discount
90/25 is the master switch (1–0–31 → 12–0–20; spend 24% → 93%); bank 50/0 overshoots (7–0–25);
home-safety weights alone do nothing for hoarding. Note `p1-val` has now been looked at once.
Per-run `summary.md` + `metrics.json` are under `results/`; replays were NOT kept (too large).

## What is in this branch (`claude/hard-phasing-repair`)

- `src/ai/hard/engine.ts` — the scorer credit (see commit history on this branch for whether it is
  still label-gated on `+pc` or unconditional).
- `lab/hard-ai/ablate/arms.ts` — arms `hand-priors`, `hand-priors-pc`, `bootstrap-pc`, `bank25-pc`
  (use as `--a hard@ablate:hand-priors-pc`).
- `lab/hard-ai/bots/hard.ts` — env hook `MUJU_HARD_WEIGHTS=<weights.json>` overriding every `hard@*`
  bot in the process (make it label-scoped before using it for hard-vs-hard).
- `weights/` — 13 reviewed vectors from the design workflow (`combined-best-guess`,
  `phasing-priors-v1`, `econ-only-best-guess`, …, generator `make-variants.ts`), my sweep vectors
  (`m-*`, `m2-*`, `hp-*+pc`), and `+pc` copies. A label ending `+pc` turns the scorer credit on
  while it is label-gated.
- `reports/understand/` — 9 reader reports + critic + 5 gap-fills (ruleset surface, phasing-only plan,
  history, gates, measurements, engine code, production wiring, process lessons, tuner, V2-and-Rush,
  hoarding root cause, hand-priors-vs-V2, cutover verification).
- `reports/knobs/` — promotion tracer, feature audit, old-engine spending logic, generator knobs,
  material/tier values, `synthesis.json` (variants, non-weight changes, random-search plan).
- `scripts/` — queue scripts and `stats.mjs` (per-run record / spend % / promotions per game).

## How to reproduce a row

```
cd muju && npm ci
export MUJU_HEAVY_SLOTS=8            # default is 2; raise only on an otherwise idle machine
node --import tsx lab/hard-ai/ladder/run.ts --a hard@ablate:hand-priors-pc --b aiv2-hard-turn \
  --work wall:6000 --handicaps 0 --pairs 16 --seed 31 --shards 8 \
  --openings lab/hard-ai/ladder/openings/p1-dev.jsonl --replays on --out /tmp/out
node docs/hard-ai/phasing/repair-2026-09-20/scripts/stats.mjs /tmp/out
# custom vector:  MUJU_HARD_WEIGHTS=$PWD/docs/hard-ai/phasing/repair-2026-09-20/weights/<name>.json ... --a hard@desktop
```

## Next steps, in order

1. **Finish making the repair the production default properly**: unconditional scorer credit; new
   `DEFAULT_WEIGHTS` = the hand priors; update the tests that pin the bootstrap
   (`tests/ai/hard/eval.test.ts:155,217,297`, suite manifests / freeze artifacts that pin the label),
   mirror the scorer change in `lab/hard-ai/recall/run.ts` and the ~8 duplicated scorer closures in
   lab/tests; decide on `WEIGHTS_VERSION` (bumping it invalidates every JSON in `weights/`). Then
   walk the release DAG (`python3 tools/muju-content-dag.py plan --kind ai`) — that review is OWED.
2. **Round 3 was queued but not run**: `combined-best-guess+pc`, `phasing-priors-v1+pc`,
   `econ-only-best-guess+pc` vs Rush (1.5 s) and vs aiv2-hard-turn (6 s) — `scripts/round3.sh`.
3. **Rush**: fix the purchase menu (`config.ts:543` try `maxPlans 36, keepPerMultiset 1`; better,
   sort before truncating in `gen/purchase.ts:441-463`), add a STRENGTH promotion mission
   (`gen/promote.ts`), allow 2 ordinary promotions per Prepare, credit 50% service PV for at-risk
   purchases (`eval/pending.ts:116`). Re-measure vs Rush after each.
4. **Time use**: arms `work-fit` / `search-iter-fit`, K 48 (`hard@ablate:k48`) on top of the repair.
5. **Random search** over 8 numbers — plan in `reports/knobs/synthesis.json` (`randomSearchPlan`).
6. Texel is NOT ready: `tune/corpus.ts` hard-codes `muju-phasing-1`, `texel.ts:82` pins the cash
   weights, and `hard:spsa` / `hard:book` in package.json point at files that do not exist.

## Phasing as the only live ruleset (summary; detail in reports/understand/)

- Standard is still the default in 12 places (`board.ts:204`, `ModeSelect.tsx:46,109`,
  `OnlineLobby.tsx:30`, `online/client.ts:71`, `server/schema.ts:48`, `server/mcp.ts:39,66-69`,
  `server/observation.ts:120-129`, 6 server `COALESCE(...,'standard')` sites, …) and an undefined
  `ruleset` means Standard.
- Three guards keep AI off Phasing: `ai/worker/handler.ts:113`, `ModeSelect.tsx:113`,
  `GameScreen.tsx:89-103` (all read `readPhasingAiPreview()`, i.e. `?phasingAi=1`).
- Today Standard + Hard silently plays the OLD engine every turn: HardEngine is Phasing-only
  (`core/state.ts:615`) so it pack-errors and falls back. The new engine is reachable only via
  `?phasingAi=1`.
- Cheap cutover: flip the defaults, open the 3 guards, reject `ruleset:'standard'` on create, KEEP
  the `isPhasing` branches so old saves/rooms/replays stay readable. Leave `board.ts:204` alone to
  limit test fallout (49 vitest files / 245 tests fail if flipped; 14 files / 64 tests if not;
  7/20 AI e2e and 33/72 online e2e need re-pointing). Production holds 0 active rooms and 38
  archived (28 Standard), all owner/agent/QA, so server-side retirement is near nil.
- CI is red at HEAD for 4 environment-only lab tests (one needs ripgrep); Render auto-builds master
  with no test gate; Cloudflare Pages is stale at the 09-18 bundle.
