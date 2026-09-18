#!/usr/bin/env bash
#
# E4 lane 7's night-queue chain for the E3 follow-on arms
# (docs/hard-ai/e4/E4-PLAN.md, "E3 follow-on rows queued for night windows";
# docs/hard-ai/e3/E3-CLOSE.md Candidate 1 "Next bounded task"; A-E3-8).
#
# WHAT THIS RUNS, IN ORDER:
#   1. The 19 spawn-strike suites, one per `eval-no-safety-keep-<i>` arm
#      (M14's gate setting, fixed 400,000 units, single process, ~20 s each).
#      A-E3-8 asks which of the 19 restored safety weights wins
#      `spawn-strike-purchase-1` back; these answer it directly, so they run
#      FIRST even though the arm table lists the fixed:100k rows first.
#      ALREADY RUN once (docs/hard-ai/e4/E3-FOLLOWON-ARMS.md "phase-1
#      results"): F35/F36/F43 each independently win the case back, which is
#      why phase 2 below carries a 20th row for `eval-no-safety-keep-anchor`.
#      `--phase 2` skips this phase on a relaunch; see USAGE.
#   2. The 20 fixed:100,000 descriptive ladder rows, one per keep arm
#      (the 19 single-weight arms plus `eval-no-safety-keep-anchor`), vs
#      `hard@desktop`, on the first four `e1-dev` openings (8 pairs,
#      handicaps 0 and 3), 8 shards. These enter no ledger (E4-PLAN's
#      "E3 follow-on rows queued for night windows": "no ledger entry").
#
# WHAT THIS SCRIPT DOES NOT DO: launch itself (the lane that wrote it does
# not run it — the coordinator or a detached run worktree does, from the
# night window), preregister a ledger row, or retain anything. It is a
# sequencer over commands that already exist (`hard:suite`, `hard:ladder`).
#
# USAGE: chain-followon.sh [--phase 1|2] <run-dir>
#   <run-dir> is a detached run worktree's muju root (never a lane worktree,
#   never this worktree) at a commit whose src/ai/hard is identical to the
#   commit that carries this script (E4-PLAN's "one commit for both arms in
#   each row" rule extends to "one commit for the whole chain"). The script
#   cd's there before running anything, because `npm run hard:ladder`'s
#   `--out` and `--openings` resolve relative to the repo root it runs in.
#   `--phase` restricts which phase runs: `1` runs only the suites, `2` runs
#   only the fixed:100k rows (skip phase 1 because it already ran), and
#   omitting the flag runs both — DEFAULT BEHAVIOUR IS UNCHANGED.
#
# HEAVY QUEUE: this chain does not hold a slot itself — `hard:ladder` and
# `hard:suite` each acquire their own through lab/hard-ai/ladder/heavy.ts.
# Before touching anything, it waits for the WHOLE heavy directory to be
# idle (no slot-*.json at all, not just one free slot), the way E4-PLAN's
# "chains wait for a free slot themselves" is read here: a night chain that
# starts while another overnight run still holds slots would either steal a
# slot from it or queue behind it invisibly. `MUJU_HEAVY_SLOTS=8` is set on
# every command below (E4-PLAN's night default), so once the wait clears,
# the row commands are free to use up to 8 of them.
#
# THE 13:30Z ROW CUTOFF applies to the fixed:100k ladder rows only (phase 2):
# each row is fixed-work and can run long (P8), so a row that has not
# LAUNCHED by 13:30Z is not started — the ones already running finish. The
# quick suites (phase 1, ~20 s each) are not gated by it.
set -uo pipefail

PHASE="both"
while [ $# -gt 0 ]; do
  case "$1" in
    --phase)
      PHASE="${2:?--phase needs 1 or 2}"
      shift 2
      ;;
    --phase=*)
      PHASE="${1#--phase=}"
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "chain-followon: unknown flag $1" >&2
      exit 2
      ;;
    *)
      break
      ;;
  esac
done
case "$PHASE" in
  both|1|2) ;;
  *) echo "chain-followon: --phase must be 1 or 2, got \"$PHASE\"" >&2; exit 2 ;;
esac

RUN_DIR="${1:?usage: chain-followon.sh [--phase 1|2] <run-dir>}"
cd "$RUN_DIR" || { echo "chain-followon: cannot cd to $RUN_DIR" >&2; exit 2; }

HEAVY_DIR="${MUJU_HEAVY_DIR:-$HOME/.local/state/muju-heavy}"
LOG="${MUJU_FOLLOWON_LOG:-$RUN_DIR/chain-followon.log}"
LAUNCH_CUTOFF_HHMM=1330

# `EVAL_GROUPS.safety`'s F.* indices, ascending, exactly as
# `lab/hard-ai/audit/eval-groups.ts` lists them and `lab/hard-ai/ablate/arms.ts`
# loops over them to register the 19 single-weight keep arms. Hand-copied
# rather than computed (this is a shell script; the registry is the source of
# truth and `npm run hard:types` / `tests/lab/ablate.test.ts` catch a drift
# between the two — the test asserts `armNames()` includes
# `eval-no-safety-keep-<i>` for exactly this list, in this order).
SAFETY_INDICES=(17 28 29 30 31 32 33 34 35 36 40 41 43 45 46 49 54 56 57)

# Phase 2's arm list: the 19 single-weight arms, in the same order, plus the
# E4 lane 7 follow-up (`eval-no-safety-keep-anchor`, F35+F36+F43 together) as
# the 20th and last row — `k` (used for `seed = 50 + k`) is this array's
# index, so the follow-up lands at k=19, seed 69, exactly as preregistered.
PHASE2_ARMS=()
for i in "${SAFETY_INDICES[@]}"; do
  PHASE2_ARMS+=("eval-no-safety-keep-${i}")
done
PHASE2_ARMS+=("eval-no-safety-keep-anchor")

log() {
  echo "$1" | tee -a "$LOG"
}

stamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

wait_for_idle_heavy_queue() {
  log "[followon] waiting for an idle heavy queue ($HEAVY_DIR) $(stamp)"
  while true; do
    # No slot-*.json at all (not merely one free slot): see the header.
    if ! compgen -G "$HEAVY_DIR/slot-*.json" > /dev/null 2>&1; then
      log "[followon] heavy queue idle, starting $(stamp)"
      return 0
    fi
    sleep 30
  done
}

past_launch_cutoff() {
  local now_hhmm
  now_hhmm="$(date -u +%H%M)"
  [ "$now_hhmm" -ge "$LAUNCH_CUTOFF_HHMM" ]
}

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log "[followon] chain-followon starting in $RUN_DIR (--phase $PHASE) $(stamp)"

wait_for_idle_heavy_queue

# --- phase 1: the 19 spawn-strike suites (M14 gate setting, fixed 400k) -----
# Run first: single-process, ~20 s each, and they answer A-E3-8 (which
# restored weight wins spawn-strike-purchase-1 back) directly. Skipped by
# `--phase 2` (this phase already ran once; see the header).
if [ "$PHASE" = "both" ] || [ "$PHASE" = "1" ]; then
  log "[followon] phase 1: 19 spawn-strike suites (M14 gate, fixed 400k) $(stamp)"
  for i in "${SAFETY_INDICES[@]}"; do
    arm="eval-no-safety-keep-${i}"
    out="lab/results/hard-ai-e3/correct/thresholds/spawn-strike-400k-keep-${i}.json"
    log "[followon] ${arm} (suite) start $(stamp)"
    MUJU_HEAVY_SLOTS=8 npm run hard:suite -- \
      --suites spawn-strike \
      --engine "hard@ablate:${arm}" \
      --work 400000 \
      --shards 1 \
      --out "$out" >> "$LOG" 2>&1
    rc=$?
    log "[followon] ${arm} (suite) exit ${rc} $(stamp)"
  done
else
  log "[followon] phase 1 skipped (--phase 2) $(stamp)"
fi

# --- phase 2: the 20 fixed:100k descriptive ladder rows ---------------------
if [ "$PHASE" = "both" ] || [ "$PHASE" = "2" ]; then
  log "[followon] phase 2: ${#PHASE2_ARMS[@]} fixed:100k descriptive ladder rows vs hard@desktop $(stamp)"
  k=0
  remaining=("${PHASE2_ARMS[@]}")

  for arm in "${PHASE2_ARMS[@]}"; do
    # First element of `remaining` is always the arm about to launch; drop it
    # whether or not we end up launching it, so a cutoff mid-loop reports
    # accurately which arms (this one included) never ran.
    remaining=("${remaining[@]:1}")

    if past_launch_cutoff; then
      log "[followon] refusing to launch ${arm}: past ${LAUNCH_CUTOFF_HHMM}Z cutoff (now $(date -u +%H%M)Z) $(stamp)"
      log "[followon] arms not launched: ${arm} ${remaining[*]}"
      exit 1
    fi

    seed=$((50 + k))
    out="lab/results/hard-ai-e3/ablate/${arm}/fixed100k"
    log "[followon] ${arm} (row) start $(stamp)"
    MUJU_HEAVY_SLOTS=8 npm run hard:ladder -- \
      --a "hard@ablate:${arm}" \
      --b hard@desktop \
      --work fixed:100000 \
      --handicaps 0,3 \
      --pairs 8 \
      --openings lab/hard-ai/ladder/openings/e1-dev.jsonl \
      --seed "$seed" \
      --legality strict \
      --shards 8 \
      --out "$out" >> "$LOG" 2>&1
    rc=$?
    log "[followon] ${arm} (row) exit ${rc} $(stamp)"
    k=$((k + 1))
  done

  log "[followon] chain-followon done, all ${#PHASE2_ARMS[@]} keep-arm rows launched $(stamp)"
else
  log "[followon] phase 2 skipped (--phase 1) $(stamp)"
fi
