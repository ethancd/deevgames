#!/bin/sh
# E1.3 equal-time pricing plan (EPIC-PLAN §4 E1.3, §5 campaign 3).
#
# PRINTS the `hard:ladder` command for every ablation arm against `hard@desktop`
# and runs NOTHING. Each printed row is 32 pairs over two handicaps at
# wall:3000 with `--shards 2`, i.e. both global heavy slots — run them one at a
# time, and only once the diagnostics in `docs/hard-ai/e1/E1.3-ABLATIONS.md`
# have said which arms are worth pricing.
#
#   sh lab/hard-ai/ablate/ladder-commands.sh                       # every diagnostic arm
#   sh lab/hard-ai/ablate/ladder-commands.sh --all-arms            # reply-wide included
#   sh lab/hard-ai/ablate/ladder-commands.sh --arms k96,place-wide # a chosen subset
#
# The seeds, pair counts and opening file come from
# `lab/hard-ai/ablate/run.ts --print-ladder`, which is the single authority for
# them; this script only forwards its arguments so a shell user never has to
# restate a seed by hand.
set -eu
cd "$(dirname "$0")/../../.."
exec node --import tsx lab/hard-ai/ablate/run.ts --print-ladder "$@"
