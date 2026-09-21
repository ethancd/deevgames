#!/bin/bash
# Round 3: the workflow's reviewed vectors ON TOP OF the scorer credit. Waits for the confirmation queue. Scratch worktree only.
S=/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad
cd $S/wt/muju
export MUJU_HEAVY_SLOTS=8
while pgrep -f "confirm/confirm[.]sh" >/dev/null; do sleep 10; done
DEV=lab/hard-ai/ladder/openings/p1-dev.jsonl
run() { # name a b work pairs seed weightsPath
  export MUJU_HARD_WEIGHTS=$7
  node --import tsx lab/hard-ai/ladder/run.ts --a "$2" --b "$3" --work "$4" --handicaps 0 --pairs "$5" --seed "$6" --shards 8 --openings $DEV --replays on --out $S/round3/$1 > $S/round3/$1.log 2>&1
  rc=$?
  echo "DONE $1 (exit $rc): $(node $S/sweep/stats.mjs $S/round3/$1 2>&1 | tail -1) | $(grep -E '^- Elo' $S/round3/$1/summary.md 2>/dev/null)" >> $S/round3/progress
}
for v in combined-best-guess phasing-priors-v1 econ-only-best-guess; do
  run $v-pc-vs-Rush-w1500            hard@desktop Rush           wall:1500 16 33 $S/weights-pc/$v+pc.json
  run $v-pc-vs-aiv2hardturn-w6000    hard@desktop aiv2-hard-turn wall:6000 16 31 $S/weights-pc/$v+pc.json
done
# wider root beam on top of the repaired hand priors (K 24 -> 48): weights come from the env hook, K from the ablation arm
node -e "const fs=require('fs');" 
echo "ROUND3 COMPLETE" >> $S/round3/progress
