#!/bin/zsh
# Gate 0 at the shipped weights (SPEC §5 step 4), run from muju/. Logs under results/gate0/.
set -u
OUT=docs/hard-ai/phasing/p3-retune-2026-09-22/results/gate0
echo "gate0 start $(date -u +%FT%TZ) HEAD $(git rev-parse HEAD) load $(uptime | sed 's/.*load averages: //')" | tee $OUT/gate0.log
run() { name=$1; shift; echo "== $name: $* ($(date -u +%FT%TZ))" | tee -a $OUT/gate0.log; "$@" > $OUT/$name.log 2>&1; rc=$?; echo "== $name exit $rc ($(date -u +%FT%TZ))" | tee -a $OUT/gate0.log; }
run perft-canonical npm run hard:perft -- --check
run perft-replica npm run hard:perft -- --check --engine replica
run fuzz npm run hard:fuzz -- --actions 20000 --seed 7101
run determinism npm run hard:determinism -- --engine hard@desktop --work 50000 --positions 4
echo "gate0 done $(date -u +%FT%TZ)" | tee -a $OUT/gate0.log
