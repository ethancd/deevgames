# Strategos W1: strategic planning for the kill clock (2026-09-24)

**Context.** Wave 1 (34 LLM-vs-Hard games, 2026-09-24) showed `hard@desktop` losing 6 of 7 games on the
kill clock: it never plans contact when behind, and its eval cannot express "who wins the clock at ply
ten" because that is a computed projection, not a linear feature. The p3 retune could not have found
this: its ladder opponents (Rush, Balanced, Expand, AIEngineV2) reach the clock in 4 of 546 Stage A/B/C
games. The development process was measuring a different failure mode.

STRATEGOS Workflow 1 adds a strategic layer that projects the kill-clock outcome exactly and forces
contact when that projection is a loss. The plan is `~/.claude/plans/can-you-respond-to-piped-book.md`
(2026-09-24); this change record covers the complete W1 release (steps W1.1–W1.15). Workflow 2 (beliefs,
VOI, goal catalogue, postures, war room) is not executed; W1 prepares for it by making every strategic
fact a typed `Claim` and every search an `AnalysisQuery`.

**What ships** (`hard@strategos` profile, flag-gated; `hard@desktop` bytes unchanged):

- **Strategic modules** (`src/ai/hard/strategy/`): pure functions of the packed root, no cross-turn
  memory. `ledger.ts` projects the stay-put mined interval `[L, U]` per side over the r = 10 − clock
  remaining plies (exact under stated assumptions: no unit death, no relocation, rent paid, pending
  arrivals land). `killeta.ts` computes a lower bound on plies until either side can kill any enemy
  (empty-board distances, damage assembly, affordable buys/promotions). `clock.ts` compares the intervals
  and killETA against r to decide a verdict (`proven-win/loss` when disjoint AND both killETA > r plus
  home/elimination gates; `bounded` when disjoint but a gate fails; `open` when overlapping) and selects
  posture (Hold on win, ForceContact on loss, none on open).

- **Plans and injection** (`strategy/contact.ts`, `strategy/hold.ts`, wired via `search/root.ts`):
  ForceContact candidates (approach cheapest target, buy fastest affordable class, promote above
  threshold) and Hold candidates (retreat, break cleaves, pass) are FORCED-injected with a declared
  contract (permitted loss, essential survivors, deadline, end predicate). The tactical search rolls them
  out against two scripted replies (continue-as-observed, evade-contact). At the root, after iterative
  deepening, a veto rule plays the best plan-consistent candidate unless the searched score is
  terminal-scale worse (mate, proven clock loss) or an essential unit dies. Material loss is not a veto.
  `RootResult.strategy` records reading, posture, injected candidates, chosen, veto — the Chronicle.

- **Eval fixes** (`EvalFix.clockLedger`): kill-clock terminals are WIN_CC/8 (BOUNDED_CLOCK_CC, CHOICE)
  when the root reading is `bounded` or `open` and the terminal is beyond forced hand-offs (WIN_CC when
  `proven` or within forced hand-offs). DrawPressure becomes clamp(projected margin, ±100) × clock²/100
  (−8 per clock², antisymmetric). Invariant 16 (sit-on-lead penalty) off.

- **Zero-damage prune** (`SearchFix.pruneZeroDamage`, `gen/actionsearch.ts`): ATTACK actions with
  `power === 0` pruned before width cut. Canonical end-set equality proved on Phasing corpus. Chip damage
  survives.

- **Exhaustive promotions** (`EvalFix.promoteExhaustive`, `gen/promote.ts`, `gen/generate.ts`): every
  legal promotion appears in combos, one bare pinned per promotion. Recall checked; canonical-check
  unchanged.

- **Clock-policy leak fix** (`eval/evaluate.ts setKillClockPolicy`, `search/root.ts`): `killClockRootClock`
  saved/set/restored per search to prevent cross-search leakage on fixed-work path. Desktop unchanged
  (wall-clock only).

- **Bots and exams**: `lab/hard-ai/bots/clockheist.ts` scripted opponent (drone, expand, free kills when
  behind, retreat when ahead at clock ≥ 3). Frozen before A8 rows. Exam kind `'plan'` with plan-level
  witnesses (damaging-attack, no-clock-reset, spawn-area-open, promotion-made, contact-in-n); wave-1
  cases AS01-W, FB01-B, OP01-W, OP02-W, SN05-W, SO01-B, SO02-B at
  `lab/hard-ai/exam/cases-p4/dev.jsonl`.

- **Telemetry** (`tools/engine-seat/`, `src/ai/hardOptIn.ts`): engine-seat `search` events gain
  `scoreCc`, `clock`, `minedTotals[2]`, `strategy`. Profile selector `?hardEngine=strategos` (browser),
  `profile` (seat).

- **Determinism** (`lab/hard-ai/positions/p4-determinism.jsonl`, `tests/lab/determinism-phasing.test.ts`):
  Phasing corpus from p1-dev openings. Gate 0 covers both engines.

- **Oracles**: `lab/hard-ai/oracles/clock-ledger.ts` (random playouts never exceed U; L = phasingEconomy
  where both defined); `lab/hard-ai/oracles/killeta.ts` (first kill ply ≥ bound, extending `oracles/kill.ts`).

- **Ladder rows** (preregistered in amendment A8 before any row played):
  - R0: `hard@desktop` vs ClockHeist (baseline, documents the failure; seed 20260983)
  - R1: `hard@strategos` vs ClockHeist (score > 0.5, LOS ≥ 95%; R1's bar is non-regression, not strength)
  - R2: `hard@strategos` vs `aiv2-hard-turn` (after wave 2; Elo lower bound > 0, LOS ≥ 97.5%)
  - R3: `hard@strategos` vs `hard@desktop` (after wave 2; informational)

**Identity.** `hard@desktop` config hash unchanged (`5de7ae20…` pinned in
`tests/lab/ablate.test.ts`). `hard@strategos` is a new profile (`strategosPatch()` in `config.ts`).
Default browser profile stays `desktop` until wave 2 results. Every new knob is an optional key on
`SearchFix`/`EvalFix`.

**Verified** (all steps):
- `npm run hard:types && npm run hard:test` green on every PR
- Desktop hash `5de7ae20…` unchanged on every PR
- Gate 0 (both engines): `hard:perft --check`, `hard:fuzz --actions 20000 --seed 7101`,
  `hard:determinism --engine hard@strategos --positions-file lab/hard-ai/positions/p4-determinism.jsonl`
- `npm test`, `e2e/ai-worker.spec.ts`
- Browser smoke with `?hardEngine=strategos` in Watch-AI
- Engine-seat smoke in pilot worktree (`~/src/deevgames-llm-pilot`) with `profile: 'strategos'`

**Tests added** (per step):
- `tests/lab/strategos-identity.test.ts` (hash ≠ desktop, flags absent from shipped profiles)
- `tests/ai/hard/kill-clock-policy.test.ts` (cross-search leak fixed)
- `tests/ai/hard/strategy-ledger.test.ts` (parity, symmetry, L = phasingEconomy)
- `tests/ai/hard/strategy-killeta.test.ts` (killTable cross-check, oracle)
- `tests/ai/hard/strategy-clock.test.ts` (verdict table, paired one-fact flips)
- `tests/ai/hard/strategos-eval.test.ts` (antisymmetry, inv16 gated, flag-absent digest)
- `tests/ai/hard/zero-damage-prune.test.ts` (canonical-check equality, fewer nodes)
- `tests/ai/hard/prepare-recall.test.ts` (promotion recall after K cut)
- `tests/ai/hard/strategy-plans.test.ts` (injection, plan contracts, flag pinned)
- `tests/ai/hard/strategy-veto.test.ts` (mate vetoed, material-loss not vetoed)
- `tests/lab/determinism-phasing.test.ts` (Phasing corpus)
- `tests/lab/clockheist.test.ts` (ClockHeist legal, deterministic, ahead → pass/retreat)
- `tests/lab/exam-p4.test.ts` (plan witnesses, not quarantined)
- `tests/lab/clock-ledger-oracle.test.ts` (small-N sample of oracle)

**Docs updated**:
- `docs/hard-ai/DESIGN.md` §9 addendum (2026-09-24, strategos)
- `docs/hard-ai/design/DEVIATIONS.md` Strategos W1 section (veto, prune beam shift, leak fix)
- `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md` amendment A8 (rows R0–R3)

**Work and cost.** 15 PRs (W1.1–W1.15), 55 commits on `claude/strategos-w1`, 78 files changed, 12,290
insertions, 336 deletions. Strategos depth-1 work similar to desktop on small positions; strategic
calculations are closed-form or bounded-search with reserved budgets. ForceContact/Hold witness searches
charge to a reserved share; veto re-search is one candidate at `depth − 1`.

**Not strength-tested** (per plan: ClockHeist is a weak detector; R1 bar is non-regression; strength
rows R2/R3 run after wave 2). R0/R1 pending at W1.15 merge. Default profile stays `desktop` until wave 2.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
