# Phasing Hard preview — owner position reports, 2026-09-19

Flagged by the owner while playing the opt-in Phasing AI preview on the live site
(`hard` / `deep`, engine `hard`, rules `muju-phasing-2`). Every report shows a clean
Hard route — no fallbacks, pack errors, divergences or exhausted budgets — so these
are judgments of the engine's play, not of its plumbing.

They were captured as full JSON and are transcribed here in the compact format of
`src/utils/compactReport.ts`; `parseCompactReport` rebuilds each position (fresh unit
ids, original board order). These are anecdotes for diagnosis. They are NOT evidence
under `PHASING-PREREGISTRATION-2026-09-18.md` and must not be folded into any sealed
suite or used to tune against one.

## 1 · Black's first turn shuffles, then retreats to the corner

```
muju/2 phasing muju-phasing-2 | hard deep hard | T2 white action ap4/4 | clock2
note First turn, shuffled fire piece a lot then went to corner, gave up too much space
map UR
cells a2=5 b2=6 e6=7 i9=6 j9=5 j10=7
white 1c +6 -0
black 3c +6 -0
units wF1e6 wW1b2 wP1a2 bF1j10!m bW1i9 bP1j9 wM1e5
summons bL1i10/3
last F1>h10>i10>h10>j10; end; +L1i10; end
diag requests=1 hardTurns=1 plansReplayed=1
```

All four actions went to one Fire walking h10–i10–h10–j10: a net one-square retreat
into its own home corner, while White took e5/e6. Looks like a horizon/tempo problem:
nothing within reach scores, and the search has no term that values centre space or
penalises returning to a visited square.

## 2 · Lightning dives in to disrupt a summon and is left hanging

```
muju/2 phasing muju-phasing-2 | hard deep hard | T3 white action ap4/4 | clock4
note Lightning dove into my position to disrupt a summon, promoted, but it's going to take me two actions to kill it and it gets no counterplay from it
map UR
cells a2=5 b2=6 a3=5 b3=2 d4=3 e5=5 e6=7 i9=4 j9=2 j10=6
white 6c +15 -0
black 5c +12 -0
units wF1d4 wW1b3 wP1a3 bF1j10 bW1i9 bP1j9 wM2e5 bL2e2!mp
disrupted wL1e4/3
last L2>e2; end; ^L2e2; end
diag requests=2 hardTurns=2 plansReplayed=2
```

The disruption only refunds White's 3 crystals, yet Black spends a 3-crystal piece plus
a promotion on it, on barren ground (e2 mines 0), alone, inside White's reach. The
engine appears to over-value "disrupt a summon" and to under-count a piece that can
be taken for two actions with no recapture.

## 3 · As White, sends a lone Fire across the board and leaves it en prise

```
muju/2 phasing muju-phasing-2 | hard deep hard | T2 black action ap4/4 | clock3
note Leaves his fire for dead on B8, my fire can get him in 3 actions and no counteracttack
map UR
cells a1=5 b1=7 c1=7 a2=5 b2=4 h2=15 g6=7 i8=2 j9=5
white 7c +13 -0
black 1c +6 -0
units wF1h2!m wW1b2 wP1a1!m bF1g6 bW1i8 bP1j9 wF1b1 bP1h10
summons wF1a2/3
last P1>a1; F1>h2; end; +F1a2; end
diag requests=2 hardTurns=2 plansReplayed=2
```

The Fire stands on h2 in the engine's coordinates (the owner, playing Black, reads the
flipped board as B8). It went for the 16-crystal field at h2/i2 with no support; Black's
Fire on g6 reaches and kills it within one turn. Same family as report 2: material
left where it can be taken for free is not being priced.

## Requested by the owner in the same session

- **Opening book for White** — a memorised first turn, or better 5–20 of them chosen
  at random. Not implemented: it changes the engine under measurement, so it needs a
  dated amendment to the preregistration (or to sit outside the measured adapter),
  and the book's contents need a source the owner trusts.
