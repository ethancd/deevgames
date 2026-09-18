# Lane 6 amendment proposals (E3.1 loss judgment)

Written 2026-09-17. Lane 6 owns only `docs/hard-ai/e3/E3.1-LOSS-JUDGMENT.md`,
`lab/hard-ai/audit/loss-*.ts` and `lab/results/hard-ai-e3/loss-judgment/**`.
Everything below needs a file this lane does not own, so it is proposed here and
nothing was edited.

## A. `package.json` — one script line

The instrument runs today as

```
node --import tsx lab/hard-ai/audit/loss-judgment.ts --exposed <dir> --sweep <file> --replays <dir> --out <dir>
```

Proposed line, in the `hard:*` block, next to `hard:eval-audit`:

```json
"hard:loss-judgment": "node --import tsx lab/hard-ai/audit/loss-judgment.ts"
```

`package.json` is lane 4's in the E3 lane table, so lane 4 or the coordinator
owns the edit. Nothing in this lane depends on it.

## B. A test for the instrument

Lane 6's owned-file list carries no test path, so no test file was created.
Two assertions are cheap and worth having wherever the coordinator wants them
(`tests/lab/loss-judgment.test.ts` is the obvious home):

- `decomposeFromSeat` on a position from `lab/hard-ai/positions/*.jsonl` returns
  `score === −full(p, opponent)` and a `groupSums` partition that sums to
  `sumWf`. That is the identity the whole lane's seat's-view reading rests on,
  and it held at all 24 end states measured here.
- `aiv2AtRoot` on a fixed opening root at a small `--aiv2-ms` returns an end
  state whose `turn.currentPlayer` is no longer the seat and whose `guardHit`
  is false, so a future adapter change cannot silently turn the judge into a
  no-op.

## C. `Hanging` semantics — for lane 1 and lane 2

Judge 4 found the `Hanging` feature and a canonical lower bound disagreeing in
SIGN at 4 of 24 end states (`E3.1-LOSS-JUDGMENT.md` §(d)):

- `g4-s10_0_8-B-white` t7, adviser end state: feature −5, canonical +5.
- `g4-s6_3_5-A-white` t4, played end state: feature −1, canonical +3.
- `g4-s6_3_5-A-white` t4, adviser end state: feature −1, canonical +6.
- `g5-s11_3_11-B-white` t2, played end state: feature +2, canonical −3.

The canonical count allows one step of approach and one attacker with no
purchase, while `t.killActions` is built with the full four-action budget,
purchases and promotions on, and several attack lanes
(`src/ai/hard/tables/context.ts:242-256`), so the feature's quantity is a strict
superset and this is not a bug claim. It does mean the feature's sign at those
four end states rests entirely on kills the canonical count cannot see. Lane 1
owns feature semantics and lane 2 owns the tables; the four slots are named so
`minActionsToKill` can be inspected on exactly them. `Hanging` is the fourth
feature by absolute movement on this corpus (Σ |Δ| 1500 cc over 7 positions) and
carries 91% of the static gap at one of the three never-flip positions, so the
answer matters to E3.2's choice.

## D. The 47-loss baseline set

`~/src/deevgames-e2-run2/muju/lab/results/hard-ai-e2/analysis/baseline-losses-exposed/`
did not exist at 03:50Z on 2026-09-17, and neither did
`~/src/deevgames-e1-run/muju/lab/results/hard-ai-e2/`. The instrument takes
`--exposed` as a directory and needs no change to cover that set; the run is

```
node --import tsx lab/hard-ai/audit/loss-judgment.ts \
  --exposed <baseline-losses-exposed> \
  --sweep   <the fresh baseline sweep, or omit> \
  --replays lab/results/hard-ai-e1/baseline/replays \
  --out     lab/results/hard-ai-e3/loss-judgment-baseline \
  --label   baseline
```

It costs about 8 s of `aiv2-hard` per distinct position plus a second or two of
static work, so 47 losses is roughly 7 minutes and belongs in the heavy queue.
`--no-aiv2` makes the same pass run in under a second if only the static and
canonical halves are wanted.

## E. `E3-PLAN.md`'s reading of the `g2-s20` ordering score is inverted

`docs/hard-ai/e3/E3-PLAN.md` §"Why E3 now, and what it must not assume",
third bullet, says:

> On the exposed root of the first, the generator's static rank preferred the
> adviser's turn (5,801 cc vs 2,580 cc) and the search still chose the played
> one.

The artifact says the opposite.

- `lab/results/hard-ai-e2/analysis/e1.1-losses-exposed/g2-s20_3_15-A-white.json`,
  turn index 2 (white, turn 3): the played turn is candidate `index` 0 with
  `genRankCc` 2,580,090; the adviser's best is `index` 3 with `genRankCc`
  580,110.
- `candidateSource` is `completed-depth`, so `RootCandidate.genRankCc` is the
  ordering score `search/order.ts` wrote and sorted on, and `index` is its rank
  (`src/ai/hard/search/probe.ts:50-62`). The 28 candidates in that list are
  monotonically descending in `genRankCc`, which the artifact shows directly.
- Higher `genRankCc` therefore means ranked EARLIER, and the played turn is
  ranked first while the adviser's ties for second with three others.
- The quoted pair "5,801 cc vs 2,580 cc" appears to be 580,110 divided by 100
  and 2,580,090 divided by 1,000 — two different divisors — which is what makes
  the smaller number look larger.

Proposed correction, for the coordinator (this lane may not edit `E3-PLAN.md`):
the bullet should say that at that root the generator's ordering score preferred
the PLAYED turn and the search, which searched all 28 candidates, returned the
same one. The bullet's conclusion — that this is a judgment question — is not
weakened by the correction, and lane 6's own measurement supports it from the
other side: at that position the static leaf evaluation prefers the ADVISER's
end state by 432 cc while no search up to 800,000 units ever does
(`E3.1-LOSS-JUDGMENT.md` §"The three never-flip positions").
