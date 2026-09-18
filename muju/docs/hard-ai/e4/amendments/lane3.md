# Lane 3 amendment proposal (E4.2 leaf tie)

Written 2026-09-18T00:15:14Z on `claude/hard-ai-e4-lane3`. One proposal. The lane
owns `src/ai/hard/config.ts`, `search/order.ts`, `search/root.ts`,
`lab/hard-ai/ablate/arms.ts`, its tests and its doc; the file below is not among
them, so the change is proposed and not made.

## A. The tie is decided in `search/pvs.ts`, which lane 3 does not own

**File:** `muju/src/ai/hard/search/pvs.ts`, `rootIteration`, line 687.

**Now:**

```ts
    if (score > best) {
      best = score;
      bestIndex = i;
    }
```

The comparison is strict, so when two root candidates return the SAME searched
score the EARLIER one in the ordering keeps `bestIndex`. That is the whole of
the champion's tie policy, and it makes the root's answer at a tie a function of
`search/order.ts scoreTurns`'s list order — which carries `ORDER_TT`
(+2,000,000), the previous iteration's own verdict. Measured at
`g2-s20_3_15-A-white` white t3 in `E4.2-LEAF-TIE.md`.

**Proposed**, behind the SAME flag this lane adds
(`HardConfig.searchFix.tieBreak === 'end-key'`, `config.ts SearchFix`, absent in
every profile):

```ts
    if (score > best || (tieByEndKey && score === best && bestIndex >= 0 && endKeyAfter(turns[bestIndex], turn))) {
      best = score;
      bestIndex = i;
    }
```

with `tieByEndKey` read once per iteration from `s.cfg.searchFix?.tieBreak ===
'end-key'` and `endKeyAfter` imported from `search/order.ts`, where this lane
already exports it.

**Why it is the better policy, with numbers.** It is a PURE SELECTION change:
`alpha` is raised by its own separate `if (score > alpha)` two lines below, so
re-pointing `bestIndex` moves no window, prunes no node and costs no work. The
search tree, the scores and the node count are identical; only the index
reported changes. The ordering policy lane 3 could implement inside its own
files cannot be pure in that way — it has to move the root's SEARCH ORDER to
move the answer, which changes the alpha-beta path and therefore changes
fixed-work scores (measured: at the 400,000-unit rung the arm's completed
depth-3 root value is 2,006 cc where the champion's is 1,870 cc).

**What it would do at the lane's position** (`lab/results/hard-ai-e4/leaf-tie/
rungs-hard-desktop.json`, column `lowestTiedEndKey`; the champion's own tie
groups, which this change does not move):

| rung | depth | candidates tied at the best score | champion plays | this proposal plays |
| --- | --- | --- | --- | --- |
| 12,500 | 1 | 28 of 28 at 2,293 cc | `38eaf77291fd569a` | `041f1fd01bede6ae` |
| 25,000 | 1 | 28 of 28 at 2,293 cc | `38eaf77291fd569a` | `041f1fd01bede6ae` |
| 50,000 | 2 | 20 of 28 at 1,020 cc | `c5f8b28ed6e36696` | `041f1fd01bede6ae` |
| 100,000 | 2 | 20 of 28 at 1,020 cc | `c5f8b28ed6e36696` | `041f1fd01bede6ae` |
| 200,000 | 2 | 20 of 28 at 1,020 cc | `c5f8b28ed6e36696` | `041f1fd01bede6ae` |
| 400,000 | 3 | 28 of 28 at 1,870 cc | `c5f8b28ed6e36696` | `041f1fd01bede6ae` |
| 800,000 | 3 | 28 of 28 at 1,870 cc | `c5f8b28ed6e36696` | `041f1fd01bede6ae` |

The ordering policy lane 3 shipped changes the answer at 12,500, 25,000 and
800,000 units and leaves 100,000, 200,000 and 400,000 where they were.

Neither policy plays the adviser's turn `987d5cba3b0297a2` at any rung: at the
depth-2 rungs the adviser's turn scores 1,002 cc against the best 1,020 cc, so
it is not in the tie at all, and at the depth-1 and depth-3 rungs it ties but is
neither first in the ordering nor lowest by end key. No tie policy can make the
champion play the adviser's turn at this position.

**If the coordinator takes this**, lane 3's `order.ts` ordering change should be
DROPPED rather than stacked: the two are alternative readings of the same flag
value, the `pvs.ts` one is free and the `order.ts` one is not, and shipping both
under one name would make a row unattributable. The descriptive row lane 3 ran
prices the `order.ts` reading and stays a valid answer to a different question —
what the root's TT-move ordering is worth at fixed work. It came in at 5/0/11,
0.3125, Elo −137 [−309, −14] on 16 `e1-dev` games at fixed:100,000
(`lab/results/hard-ai-e4/ablate/search-tie-break/fixed100k/summary.md`), with
zero aborted searches in either arm: the ordering form of the policy costs
strength, and the `pvs.ts` form cannot, because it moves no node.
