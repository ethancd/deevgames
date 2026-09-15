/**
 * The verify-suite gate table (DESIGN §7.1). `npm run hard:verify -- --gate M<n>`
 * runs `GATES.find(g => g.id === 'M<n>')`. M1 seeds all 20 rows; only M1's is a
 * real, passing row here — M2 through M20 are stubs (`command` is an inert
 * placeholder that always reports `not-implemented`) that the milestone which
 * builds that gate's tooling replaces with the real command from
 * `docs/hard-ai/MILESTONES.md` (quoted in each stub's `description` for
 * reference) and a real `criterion`.
 */
export interface Gate {
  id: string;
  dependsOn: string[];
  description: string;
  command: string;
  args: string[];
  artifact: string;
  criterion: (metrics: Record<string, unknown>) => boolean;
  timeoutMs: number;
}

/** A stub row always fails: its command reports `not-implemented` and its
 * criterion never passes, regardless of what (if anything) run.ts parses out
 * of the command's output. */
function notImplemented(id: string, dependsOn: string[], futureCommand: string, timeoutMs: number): Gate {
  return {
    id,
    dependsOn,
    description: `${id} is not implemented yet. Real command (filled in by the milestone that builds it): ${futureCommand}`,
    command: 'node -e "process.stdout.write(JSON.stringify({status:\'not-implemented\'}));process.exitCode=1"',
    args: [],
    artifact: '',
    criterion: () => false,
    timeoutMs,
  };
}

const MIN = 60_000;

export const GATES: Gate[] = [
  {
    id: 'M1',
    dependsOn: [],
    description: 'Verify runner, perft fixtures, position corpus, deps lint, constants test',
    command:
      'npm run hard:perft -- --check --out lab/results/hard-ai-verify/M1.json && ' +
      'npm run hard:deps && ' +
      'npx vitest run tests/ai/hard/constants.test.ts tests/ai/hard/perft.test.ts',
    args: [],
    artifact: 'lab/results/hard-ai-verify/M1.json',
    criterion: metrics =>
      metrics.perftActions_initial_4 === 14959 &&
      metrics.perftMidStates_initial === 1053 &&
      metrics.perftTurns_initial === 797 &&
      metrics.fixturesChecked === 11 &&
      metrics.fixturesMismatch === 0 &&
      metrics.depsViolations === 0 &&
      metrics.vitestFailures === 0 &&
      metrics.openings === 797,
    timeoutMs: 3 * MIN,
  },
  {
    id: 'M2',
    dependsOn: ['M1'],
    description: 'Ladder: sharded runner, pairing, SPRT, Elo, harness v3, determinism tool',
    command:
      'npx vitest run tests/lab/hard-ladder.test.ts tests/lab/harness.test.ts && ' +
      'npm run hard:ladder -- --a aiv2-medium-fast --b Rush --work fixed:1200 --handicaps 0 --pairs 24 --seed 1 --shards 12 --out lab/results/hard-ai-verify/M2-calib && ' +
      'npm run hard:ladder -- --a aiv2-medium-fast --b aiv2-medium-fast --work fixed:1200 --handicaps 0 --pairs 12 --seed 2 --shards 12 --sprt 0,100,0.05,0.05 --out lab/results/hard-ai-verify/M2-self && ' +
      'npm run hard:determinism -- --engine aiv2-medium-fast --work 5000 --positions 10 --out lab/results/hard-ai-verify/M2.json',
    args: [],
    // `hard:determinism`'s `--out` is lab/results/hard-ai-verify/M2.json; it
    // auto-merges the sibling M2-calib/M2-self run directories' metrics.json
    // under `calib`/`self` (see determinism.ts's `siblingMerges`), plus its
    // own fields nested under `determinism` — DESIGN §7.7: "artifact merges
    // the three outputs".
    artifact: 'lab/results/hard-ai-verify/M2.json',
    criterion: metrics => {
      const calib = metrics.calib as Record<string, unknown> | undefined;
      const self = metrics.self as Record<string, unknown> | undefined;
      const determinism = metrics.determinism as Record<string, unknown> | undefined;
      return (
        metrics.vitestFailures === 0 &&
        calib?.games === 48 &&
        calib?.adjudicationRate === 0 &&
        calib?.illegalActions === 0 &&
        calib?.bothSeatsPlayed === true &&
        self?.games === 24 &&
        self?.decision !== 'H1' &&
        typeof self?.elo === 'number' &&
        Math.abs(self.elo as number) < 100 &&
        determinism?.identical === true
      );
    },
    timeoutMs: 9 * MIN,
  },
  {
    id: 'M3',
    dependsOn: ['M2'],
    description: 'Whole-turn worker path for AIEngineV2 (protocol 3 additive)',
    command:
      'npx vitest run tests/ai && ' +
      'npx playwright test --config playwright.hard.config.ts --project=desktop e2e/hard-ai.spec.ts && ' +
      'npm run hard:ladder -- --a aiv2-hard-turn --b aiv2-hard --work wall:1000 --handicaps 0 --pairs 12 --seed 3 --shards 12 --out lab/results/hard-ai-verify/M3.json',
    args: [],
    // `hard:ladder`'s `--out` is always a directory (it writes `metrics.json`
    // inside it regardless of the path's own extension) — the literal
    // `.../M3.json` from MILESTONES.md's gate row is that directory's name,
    // not a file `run.ts` can read directly. `vitestFailures`/`e2eFailures`
    // come from the chain's own step output (vitest/playwright JSON
    // reporters); `games`/`illegalActions`/`adjudicationRate`/`meanTurnMs`/
    // `decision` are `hard:ladder`'s flat `metrics.json` fields, merged in
    // from the real file inside that directory.
    artifact: 'lab/results/hard-ai-verify/M3.json/metrics.json',
    criterion: metrics => {
      const meanTurnMs = metrics.meanTurnMs as { a: number; b: number } | undefined;
      return (
        metrics.vitestFailures === 0 &&
        metrics.e2eFailures === 0 &&
        metrics.games === 24 &&
        metrics.illegalActions === 0 &&
        typeof metrics.adjudicationRate === 'number' &&
        (metrics.adjudicationRate as number) <= 0.01 &&
        !!meanTurnMs &&
        meanTurnMs.a <= meanTurnMs.b * 1.05 &&
        // No `--sprt` in this row (it is a legality/latency smoke, not a
        // strength claim — the turn path's SPRT is M19's first row per
        // MILESTONES.md), so `decision` stays `null` here and the `!== 'H0'`
        // check is trivially satisfied by design.
        metrics.decision !== 'H0'
      );
    },
    timeoutMs: 8 * MIN,
  },
  {
    id: 'M4',
    dependsOn: ['M1'],
    description: 'Packed primitives: bits, tables, catalog, zobrist, action, config, interface tests',
    command:
      'npx vitest run tests/ai/hard && ' +
      'npm run hard:deps && ' +
      'npx tsc --noEmit -p tsconfig.json && ' +
      'npm run hard:types',
    args: [],
    // No artifact file: every metric this criterion reads is derived by
    // `verify/run.ts` from the steps' own output (`vitestFailures` from the
    // vitest JSON reporter, `depsViolations` from `hard:deps`'s JSON line,
    // `tscErrors` accumulated across both typecheck steps).
    artifact: '',
    criterion: metrics =>
      metrics.vitestFailures === 0 &&
      metrics.depsViolations === 0 &&
      metrics.tscErrors === 0,
    timeoutMs: 2 * MIN,
  },
  {
    id: 'M5',
    dependsOn: ['M4'],
    description: 'Replica: state, movement, spawn, income, make/unmake, generators, fuzzer',
    command:
      'npx vitest run tests/ai/hard && ' +
      'npm run hard:fuzz -- --actions 1000000 --seed 20260914 --surfaces transition,legality --legality-every 8 --out lab/results/hard-ai-verify/M5-fuzz.json && ' +
      'npm run hard:perft -- --check --engine replica --out lab/results/hard-ai-verify/M5-perft.json && ' +
      'npm run hard:deps',
    args: [],
    // `hard:perft --check --out <dir>/M5-perft.json` nests its own numbers under
    // `perft` and folds the sibling `<dir>/M5-fuzz.json` in under `fuzz` (see
    // `siblingMerges` in `lab/hard-ai/perft/run.ts`), so this single artifact
    // carries both halves; `vitestFailures` and `depsViolations` come from the
    // chain's own output the way they do for M1/M4.
    artifact: 'lab/results/hard-ai-verify/M5-perft.json',
    criterion: metrics => {
      const fuzz = metrics.fuzz as Record<string, unknown> | undefined;
      const perft = metrics.perft as Record<string, unknown> | undefined;
      return (
        metrics.vitestFailures === 0 &&
        fuzz?.actions === 1_000_000 &&
        fuzz?.divergences === 0 &&
        fuzz?.legalitySetMismatches === 0 &&
        fuzz?.unmakeMismatches === 0 &&
        fuzz?.rehashMismatches === 0 &&
        fuzz?.invariantViolations === 0 &&
        (fuzz?.canActClearedGames as number) > 0 &&
        (fuzz?.reviewUpkeepGames as number) > 0 &&
        (fuzz?.eliminationRuleGames as number) > 0 &&
        perft?.fixturesMismatch === 0 &&
        perft?.engine === 'replica' &&
        metrics.depsViolations === 0
      );
    },
    timeoutMs: 6 * MIN,
  },
  {
    id: 'M6',
    dependsOn: ['M5'],
    description: 'Threat maps (strike, strikeIfBought, exposure) and the approach table',
    command:
      'npx vitest run tests/ai/hard/threat.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/threat.ts --positions 5000 --approach-positions 500 --out lab/results/hard-ai-verify/M6.json',
    args: [],
    // `oracles/threat.ts --out` writes exactly this artifact itself (the M8
    // shape, not M2/M3/M5's sibling-merge indirection): `strikeMismatch`,
    // `strikeIfBoughtMismatch` and `approachMismatch` are its own top-level
    // fields; `vitestFailures` comes from the chain's vitest step.
    artifact: 'lab/results/hard-ai-verify/M6.json',
    criterion: metrics =>
      metrics.strikeMismatch === 0 &&
      metrics.strikeIfBoughtMismatch === 0 &&
      metrics.approachMismatch === 0 &&
      metrics.vitestFailures === 0 &&
      // The three counters above are vacuously 0 on an empty comparison, so the
      // row also asserts the comparison actually ran at the size MILESTONES.md
      // names — 5,000 positions × 2 sides of strike maps — and that the
      // approach sample reached every class rather than only quiet openings.
      metrics.strikeChecked === 10_000 &&
      (metrics.approachPairs as number) >= 2_000 &&
      (metrics.approachRetreats as number) > 0 &&
      (metrics.approachStrands as number) > 0 &&
      (metrics.approachNones as number) > 0,
    timeoutMs: 5 * MIN,
  },
  {
    id: 'M7',
    dependsOn: ['M5'],
    description: 'Kill-combination DP and Cleave chains vs an exhaustive replica search',
    command:
      'npx vitest run tests/ai/hard/kill.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/kill.ts --positions 2000 --max-own-units 8 --shards 12 --out lab/results/hard-ai-verify/M7.json',
    args: [],
    // `oracles/kill.ts --out` writes every number below into this one file
    // itself (the shards' partial files are merged and deleted first);
    // `vitestFailures` comes from the chain's own vitest step, as in M1/M4/M5.
    artifact: 'lab/results/hard-ai-verify/M7.json',
    criterion: metrics =>
      metrics.vitestFailures === 0 &&
      // The DP's (minActions, minCrystals) equals the exhaustive replica
      // search's on every (position, target, opts) triple it was run on, and
      // no triple was skipped because the search ran out of nodes ...
      metrics.suboptimal === 0 &&
      metrics.truncated === 0 &&
      // ... over a population that is not vacuous: all four opts combinations
      // exercised, real kills found, and the purchase and promotion arms of
      // the candidate builder actually taken by winning plans.
      (metrics.minComparisonsPerCombo as number) > 0 &&
      (metrics.killsFound as number) > 0 &&
      (metrics.buyPlans as number) > 0 &&
      (metrics.promoPlans as number) > 0 &&
      // The corner case equals `homeCheckmate.ts:27-49 enoughPossibleDamage`
      // on all 28 `lab/ai/fixtures.ts` cases, in both of its framings.
      metrics.cornerChecked === 28 &&
      metrics.cornerMismatch === 0 &&
      (metrics.cornerPreparingChecked as number) > 0 &&
      metrics.cornerPreparingMismatch === 0 &&
      // LH §4.1: 3 adjacent Mujus in 3 actions; spaced C1/E1/G1 -> 2 in 4.
      metrics.cleaveProbeOk === true,
    timeoutMs: 8 * MIN,
  },
  {
    id: 'M8',
    dependsOn: ['M5'],
    description: 'Economy DP and PST',
    command:
      'npx vitest run tests/ai/hard/economy.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/economy.ts --positions 2000 --out lab/results/hard-ai-verify/M8.json',
    args: [],
    // `oracles/economy.ts --out` writes exactly this artifact itself (no
    // sibling-merge indirection needed, unlike M2/M3/M5): `streamMismatch`,
    // `relocationMonotone`, `insolvencyMismatch` and `pstMaxErr` are its own
    // top-level fields; `vitestFailures` comes from the chain's vitest step.
    artifact: 'lab/results/hard-ai-verify/M8.json',
    criterion: metrics =>
      metrics.streamMismatch === 0 &&
      metrics.relocationMonotone === true &&
      metrics.insolvencyMismatch === 0 &&
      typeof metrics.pstMaxErr === 'number' &&
      (metrics.pstMaxErr as number) <= 1 &&
      metrics.vitestFailures === 0,
    timeoutMs: 3 * MIN,
  },
  {
    id: 'M9',
    dependsOn: ['M5'],
    description: 'Spawn geometry and home tables',
    command:
      'npx vitest run tests/ai/hard/geometry.test.ts tests/ai/hard/home.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/geometry.ts --positions 2000 --out lab/results/hard-ai-verify/M9.json',
    args: [],
    artifact: 'lab/results/hard-ai-verify/M9.json',
    criterion: metrics =>
      metrics.blockingMismatch === 0 &&
      metrics.f5Ok === true &&
      metrics.f11Ok === true &&
      metrics.homeRaceOk === true &&
      // Strengthening beyond MILESTONES.md's five named clauses: every
      // `homeRaceAvailable` line on the sampled corpus must survive a
      // canonical `Replica.isLegal`/`make`/`unmake` replay, not just the two
      // archived fixtures `homeRaceOk` inspects (DEVIATIONS.md under M9).
      metrics.illegalHomeRaceLines === 0 &&
      metrics.anchorsVoidedCornerOk === true &&
      metrics.vitestFailures === 0,
    timeoutMs: 3 * MIN,
  },
  {
    id: 'M10',
    dependsOn: ['M5'],
    description: 'Home-prover replica (homeVerdict/homeWitness) and the checkmate gating proof',
    command:
      'npx vitest run tests/ai/hard/prover.test.ts && ' +
      'npm run hard:fuzz -- --surfaces prover --cases 20000 --seed 5 --out lab/results/hard-ai-verify/M10-prover.json && ' +
      'npm run hard:fuzz -- --surfaces gate-preservation --actions 100000 --seed 6 --out lab/results/hard-ai-verify/M10-gate.json',
    args: [],
    // The chain writes two artifacts. `hard:fuzz` folds a sibling
    // `<group>-<label>.json` in under `<label>` (the same naming-convention
    // merge `perft/run.ts` and `verify/determinism.ts` use), so the LAST file
    // written — `M10-gate.json` — carries the prover surface under `prover`
    // alongside its own `gatePreservation` block, and `vitestFailures` comes
    // from the chain's own vitest step.
    artifact: 'lab/results/hard-ai-verify/M10-gate.json',
    criterion: metrics => {
      const prover = metrics.prover as Record<string, unknown> | undefined;
      const gate = metrics.gatePreservation as Record<string, unknown> | undefined;
      return (
        metrics.vitestFailures === 0 &&
        // (a) 28/28 authored fixtures and 20,000 fuzz positions agree with
        // `analyzeHomeDefense` — on the verdict AND on the node count, which
        // is what makes the replica exact rather than merely equivalent.
        prover?.fixtureCases === 28 &&
        prover?.fixtureMismatch === 0 &&
        prover?.fuzzCases === 20_000 &&
        prover?.fuzzVerdictMismatch === 0 &&
        prover?.nodeMismatch === 0 &&
        // The node-count claim is only meaningful if the cap actually bit.
        (prover?.cutoffCases as number) > 0 &&
        // (b) every witness replays legally and removes the occupier.
        prover?.witnessIllegal === 0 &&
        prover?.witnessNotRemoved === 0 &&
        (prover?.witnessChecked as number) > 0 &&
        // (d) SU §8.1: a proven mate beats the draw clock, an unproven
        // occupation does not.
        prover?.clockFixtureOk === true &&
        // (c) the gate-preservation proof over 100,000 played actions.
        gate?.actions === 100_000 &&
        gate?.mismatches === 0 &&
        (gate?.proofsCompared as number) > 0
      );
    },
    timeoutMs: 10 * MIN,
  },
  {
    id: 'M11',
    dependsOn: ['M5'],
    description: 'Within-turn action search: canonical ordering, turn TT, TurnPool',
    command:
      'npx vitest run tests/ai/hard/canonical.test.ts tests/ai/hard/turnpool.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/canonical-check.ts --fixtures authored,canonical --corpus fuzz-1000.jsonl --corpus-positions 200 --max-own-units 10 --shards 12 --out lab/results/hard-ai-verify/M11.json',
    args: [],
    // `oracles/canonical-check.ts --out` writes every number below into this
    // one file itself (its shards' partial files are merged and deleted
    // first); `vitestFailures` comes from the chain's own vitest step, as in
    // M1/M4/M5.
    artifact: 'lab/results/hard-ai-verify/M11.json',
    criterion: metrics =>
      metrics.vitestFailures === 0 &&
      // SET equality of end-position `Kpos` between `enumerateAll` and the
      // canonical `run` with unbounded widths and the TT off (DESIGN F1) ...
      metrics.endSetMismatch === 0 &&
      // ... and the turn TT never loses an end position that search found.
      metrics.ttEndSetMismatch === 0 &&
      // ET §1.4's collapse on the initial position, reproduced exactly.
      metrics.initialEndPositions === 797 &&
      typeof metrics.initialMidStates === 'number' &&
      (metrics.initialMidStates as number) <= 1053 &&
      typeof metrics.ttReduction === 'number' &&
      (metrics.ttReduction as number) >= 10 &&
      // Not vacuous: the 11 authored fixtures (one of which pays an upkeep
      // that ends the game, so it has no action phase to enumerate), the 4
      // canonical fixtures, and 200 corpus positions.
      metrics.fixturesChecked === 14 &&
      metrics.corpusChecked === 200,
    timeoutMs: 8 * MIN,
  },
  notImplemented(
    'M12',
    ['M6', 'M7', 'M8', 'M9'],
    'npx vitest run tests/ai/hard/eval.test.ts tests/ai/hard/invariants.test.ts tests/ai/hard/lazy.test.ts && ' +
      'npm run hard:bench -- --eval --positions 500 --out lab/results/hard-ai-verify/M12.json',
    6 * MIN,
  ),
  notImplemented(
    'M13',
    ['M11', 'M12'],
    'npx vitest run tests/ai/hard/purchase.test.ts tests/ai/hard/promote.test.ts tests/ai/hard/upkeep.test.ts tests/ai/hard/generate.test.ts && ' +
      'npm run hard:recall -- --corpus fuzz-1000.jsonl --positions 200 --reply-positions 100 --k 24 --deep 2000 --shards 12 --out lab/results/hard-ai-verify/M13.json',
    10 * MIN,
  ),
  notImplemented(
    'M14',
    ['M13', 'M10'],
    'npx vitest run tests/ai/hard && ' +
      'npm run hard:determinism -- --engine hard@lab --positions 40 --work 25000,400000 --seeds 1,7 --out lab/results/hard-ai-verify/M14-det.json && ' +
      'npm run hard:bench -- --calibrate --tt-check --positions 200 --depth 3 --rung 3200000 --shards 12 --out lab/results/hard-ai-verify/M14-bench.json && ' +
      'npm run hard:suite -- --suites tactics,spawn-strike,home-mate,invariants --engine hard@lab --work 400000 --shards 12 --out lab/results/hard-ai-verify/M14-suite.json && ' +
      'npm run hard:ladder -- --a hard@lab-400k --b Rush --work wall:500 --handicaps 0 --pairs 8 --seed 9 --shards 12 --out lab/results/hard-ai-verify/M14-smoke',
    14 * MIN,
  ),
  notImplemented(
    'M15',
    ['M14', 'M3'],
    'npx vitest run tests/ai && ' +
      'npx playwright test --config playwright.hard.config.ts e2e/hard-ai.spec.ts && ' +
      'node --import tsx lab/hard-ai/bench/latency.ts --profile phone --positions 200 --out lab/results/hard-ai-verify/M15.json',
    12 * MIN,
  ),
  notImplemented(
    'M16',
    ['M14'],
    'npx vitest run tests/ai/hard/dfpn.test.ts && ' +
      'npm run hard:suite -- --suites home-force --engine hard@lab-dfpn --work 400000 --shards 12 --out lab/results/hard-ai-verify/M16-suite.json && ' +
      'node --import tsx lab/hard-ai/oracles/home-force-exhaustive.ts --cases 60 --shards 12 --out lab/results/hard-ai-verify/M16-oracle.json',
    12 * MIN,
  ),
  notImplemented(
    'M17',
    ['M14'],
    'npx vitest run tests/ai/hard/refinements.test.ts && ' +
      'npm run hard:bench -- --depth-to-nodes --positions 50 --depth 4 --flags all --shards 12 --out lab/results/hard-ai-verify/M17.json && ' +
      'npm run hard:suite -- --suites tactics,spawn-strike,home-mate,invariants --engine hard@lab-refined --work 400000 --shards 12 --out lab/results/hard-ai-verify/M17-suite.json',
    10 * MIN,
  ),
  notImplemented(
    'M18',
    ['M14'],
    'npm run hard:corpus -- --games 400 --work 25000 --handicaps 0,3 --shards 12 --out lab/results/hard-ai-verify/M18-corpus && ' +
      'npm run hard:texel -- --corpus lab/results/hard-ai-verify/M18-corpus --iterations 3 --out lab/results/hard-ai-verify/M18-texel && ' +
      'npm run hard:book -- --nodes 500 --work 100000 --handicap 0 --shards 12 --out lab/results/hard-ai-verify/M18-book && ' +
      'npx vitest run tests/ai/hard/book.test.ts tests/lab/texel.test.ts',
    14 * MIN,
  ),
  notImplemented(
    'M19',
    ['M15'],
    'npm run hard:ladder -- --a aiv2-hard-turn --b aiv2-hard --work wall:3000 --handicaps 0 --pairs 150 --seed 11 --shards 12 --sprt 0,50,0.05,0.05 --out lab/results/hard-ai-ship/calib && ' +
      'npm run hard:ladder -- --a hard@ship --b aiv2-hard --work wall:3000 --handicaps 0,3 --pairs 300 --seed 12 --shards 12 --sprt 0,100,0.05,0.05 --out lab/results/hard-ai-ship/desktop && ' +
      'npm run hard:ladder -- --a hard@mobile --b aiv2-medium --work wall:1500 --handicaps 0 --pairs 200 --seed 13 --shards 12 --sprt 0,0,0.05,0.05 --profile phone --out lab/results/hard-ai-ship/phone && ' +
      'npm run hard:suite -- --all --engine hard@ship --work 400000 --shards 12 --out lab/results/hard-ai-ship/suites.json',
    5 * 60 * MIN,
  ),
  notImplemented(
    'M20',
    ['M16', 'M17', 'M18', 'M19'],
    'npm run hard:corpus -- --games 20000 --work 25000 --handicaps 0,3 --shards 12 --out lab/results/hard-ai-tune/corpus && ' +
      'npm run hard:texel -- --corpus lab/results/hard-ai-tune/corpus --iterations 20 --out lab/results/hard-ai-tune/texel && ' +
      '... (see docs/hard-ai/MILESTONES.md M20 for the full 9-step chain)',
    48 * 60 * MIN,
  ),
];
