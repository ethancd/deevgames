#!/bin/bash
# Independent replication + held-out tests of the repaired Hard engine. Scratch worktree only.
S=/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad
cd $S/wt/muju
export MUJU_HEAVY_SLOTS=8
DEV=lab/hard-ai/ladder/openings/p1-dev.jsonl; VAL=lab/hard-ai/ladder/openings/p1-val.jsonl
run() { # name a b work pairs seed openings [weightsJson]
  if [ -n "$8" ]; then export MUJU_HARD_WEIGHTS=$S/weights-mine/$8.json; else unset MUJU_HARD_WEIGHTS; fi
  node --import tsx lab/hard-ai/ladder/run.ts --a "$2" --b "$3" --work "$4" --handicaps 0 --pairs "$5" --seed "$6" --shards 8 --openings "$7" --replays on --out $S/confirm/$1 > $S/confirm/$1.log 2>&1
  rc=$?
  echo "DONE $1 (exit $rc): $(node $S/sweep/stats.mjs $S/confirm/$1 2>&1 | tail -1) | $(grep -E '^- Elo' $S/confirm/$1/summary.md 2>/dev/null)" >> $S/confirm/progress
}
# 1. replicate the gap-fill agent's headline row exactly (same openings, seed, budget)
run rep-hppc-vs-aiv2hardturn-w6000-dev   hard@ablate:hand-priors-pc aiv2-hard-turn wall:6000 16 31 $DEV
# 2. held-out openings, real opponent, long budget
run val-hppc-vs-aiv2hardturn-w6000       hard@ablate:hand-priors-pc aiv2-hard-turn wall:6000 32 51 $VAL
# 3. held-out openings, the per-action shape browser players face, short budget
run val-hppc-vs-aiv2hard-w1500           hard@ablate:hand-priors-pc aiv2-hard      wall:1500 32 52 $VAL
# 4. attribution: scorer credit alone, bootstrap weights
run dev-bootstrappc-vs-aiv2hardturn-w6000 hard@ablate:bootstrap-pc  aiv2-hard-turn wall:6000 16 31 $DEV
# 5-8. the Rush problem, on top of the repaired scorer
run dev-hppc-vs-Rush-w1500               hard@ablate:hand-priors-pc Rush wall:1500 16 33 $DEV
run dev-hp-tier16-solv-pc-vs-Rush        hard@desktop Rush wall:1500 16 33 $DEV hp-tier16-solv+pc
run dev-hp-tier13-pc-vs-Rush             hard@desktop Rush wall:1500 16 33 $DEV hp-tier13+pc
run dev-hp-solv-pc-vs-Rush               hard@desktop Rush wall:1500 16 33 $DEV hp-solv+pc
echo "CONFIRM COMPLETE" >> $S/confirm/progress
