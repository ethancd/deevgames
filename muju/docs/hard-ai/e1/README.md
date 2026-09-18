# E1 "Establish the benchmark" — document index

Epic E1 of `../EPIC-PLAN-2026-09-16.md` §4, run 2026-09-16 on branch
`claude/hard-ai-e1` after `../e0/AMENDMENTS-DECIDED.md` closed every E0.6
amendment. Read in this order.

1. `../e0/AMENDMENTS-DECIDED.md` — A1–A16, the decisions every E1 row ran under
   (release budget wall:8000, frozen tolerance and 5% void rule, opening strata,
   the preregistered baseline, the engine deadline, profile-on-abort).
2. `E1.1-DIAGNOSTIC-REPORT.md` — eight pairs per handicap at the honest
   allowance; the 14 losses handed to the analyser; the cold-profile finding.
3. `E1-BASELINE-REPORT.md` — the preregistered 50-pairs-per-handicap baseline
   (+203 Elo [145, 273] over 100 independent pairs at wall:3000) and the
   eight-pair wall:8000 check that closed A5.
4. `ANALYZE.md` — the replay analyser (`hard:analyze`): what it can resolve
   (first consequential turn, `strong-candidate-misjudged`, `reply-outside-beam`,
   `clock-fallback`) and what it cannot (discarded vs misjudged).
5. `E1.2-EXAM-SET.md` — the examination set (`hard:exam`): exact cases with
   canonical witnesses, judgments labelled as such, loss-derived cases.
6. `E1.3-ABLATIONS.md` — one-factor arms, the recall diagnostics (K binds root
   recall; action width moves reply recall; placement and interior nothing) and
   the equal-time price of K=96 (−83 Elo: not retained).
7. `E1.4-DECISION-REPORT.md` — strongest candidate, dominant failure class,
   the one chosen patch (calibrate the cold profile) and its acceptance contest.
8. `E1.5-CALIB-ARM.md` — the patch as a switchable arm, and its contest.
9. `P6-TURN-TIME-EXPLOSION.md` — the 20–180 s turns seen in Hard-vs-Hard rows.
10. `../e5/E5.1-OPT-IN-ROUTE.md` — the opt-in browser route built alongside
    (`localStorage['muju.hardAi']='1'` or `?hardAi=1`).

Artifacts: `lab/results/hard-ai-e1/` (E1.1, baseline, wall:8000, ablation
diagnostics and pricing rows, analyses). Openings and strata:
`lab/hard-ai/ladder/openings/ALLOCATION.md`.

Namespaces: `A<n>` amendments (decided in `../e0/AMENDMENTS-DECIDED.md`),
`P<n>` anomalies (P1–P5 in `../e0/E0-PILOT-REPORT.md` §7; P6 here).
