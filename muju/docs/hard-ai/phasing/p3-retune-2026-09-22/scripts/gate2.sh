#!/bin/zsh
# Gate 2 rows G2-1..G2-4 exactly as amendment A7 states (SPEC §4), run from muju/.
# "Retuned build" = the shipped DEFAULT_WEIGHTS (campaign result: ship control, no weight change).
# G2-3 is therefore hard@desktop vs the same vector loaded through hard@env: an identity row,
# played as written; its bar ("retune effect") is zero by construction and is read as such.
set -u
export MUJU_HEAVY_SLOTS=4
unset MUJU_HEAVY_BYPASS
BASE=docs/hard-ai/phasing/p3-retune-2026-09-22
OUT=$BASE/results/gate2
LOG=$OUT/gate2.log
echo "gate2 start $(date -u +%FT%TZ) HEAD $(git rev-parse HEAD) load $(uptime | sed 's/.*load averages: //')" | tee -a $LOG
row() { name=$1; shift; echo "== $name start $(date -u +%FT%TZ) load $(uptime | sed 's/.*load averages: //')" | tee -a $LOG
  node --import tsx lab/hard-ai/ladder/run.ts "$@" --handicaps 0 --pairs 32 \
    --openings lab/hard-ai/ladder/openings/p1-val.jsonl --replays off --shards 4 --out $OUT/$name > $OUT/$name.run.log 2>&1
  echo "== $name exit $? $(date -u +%FT%TZ)" | tee -a $LOG; }
row G2-1-aiv2-hard-turn --a hard@desktop --b aiv2-hard-turn --work wall:6000 --seed 20260975
row G2-2-Rush           --a hard@desktop --b Rush           --work wall:1500 --seed 20260976
MUJU_HARD_WEIGHTS=$PWD/$BASE/weights/control.json \
row G2-3-hard-env-control --a hard@desktop --b hard@env     --work fixed:60000 --seed 20260977
row G2-4-aiv2-hard      --a hard@desktop --b aiv2-hard      --work wall:1500 --seed 20260978
echo "gate2 done $(date -u +%FT%TZ)" | tee -a $LOG
