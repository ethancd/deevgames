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
  notImplemented(
    'M2',
    ['M1'],
    'npx vitest run tests/lab/hard-ladder.test.ts tests/lab/harness.test.ts && ' +
      'npm run hard:ladder -- --a aiv2-medium-fast --b Rush --work fixed:1200 --handicaps 0 --pairs 24 --seed 1 --shards 12 --out lab/results/hard-ai-verify/M2-calib && ' +
      'npm run hard:ladder -- --a aiv2-medium-fast --b aiv2-medium-fast --work fixed:1200 --handicaps 0 --pairs 12 --seed 2 --shards 12 --sprt 0,100,0.05,0.05 --out lab/results/hard-ai-verify/M2-self && ' +
      'npm run hard:determinism -- --engine aiv2-medium-fast --work 5000 --positions 10 --out lab/results/hard-ai-verify/M2.json',
    9 * MIN,
  ),
  notImplemented(
    'M3',
    ['M2'],
    'npx vitest run tests/ai && ' +
      'npx playwright test --config playwright.hard.config.ts --project=desktop e2e/hard-ai.spec.ts && ' +
      'npm run hard:ladder -- --a aiv2-hard-turn --b aiv2-hard --work wall:1000 --handicaps 0 --pairs 12 --seed 3 --shards 12 --out lab/results/hard-ai-verify/M3.json',
    8 * MIN,
  ),
  notImplemented(
    'M4',
    ['M1'],
    'npx vitest run tests/ai/hard && npm run hard:deps && npx tsc --noEmit -p tsconfig.json && npm run hard:types',
    2 * MIN,
  ),
  notImplemented(
    'M5',
    ['M4'],
    'npx vitest run tests/ai/hard && ' +
      'npm run hard:fuzz -- --actions 1000000 --seed 20260914 --surfaces transition,legality --legality-every 8 --out lab/results/hard-ai-verify/M5-fuzz.json && ' +
      'npm run hard:perft -- --check --engine replica --out lab/results/hard-ai-verify/M5-perft.json && ' +
      'npm run hard:deps',
    6 * MIN,
  ),
  notImplemented(
    'M6',
    ['M5'],
    'npx vitest run tests/ai/hard/threat.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/threat.ts --positions 5000 --approach-positions 500 --out lab/results/hard-ai-verify/M6.json',
    5 * MIN,
  ),
  notImplemented(
    'M7',
    ['M5'],
    'npx vitest run tests/ai/hard/kill.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/kill.ts --positions 2000 --max-own-units 8 --shards 12 --out lab/results/hard-ai-verify/M7.json',
    8 * MIN,
  ),
  notImplemented(
    'M8',
    ['M5'],
    'npx vitest run tests/ai/hard/economy.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/economy.ts --positions 2000 --out lab/results/hard-ai-verify/M8.json',
    3 * MIN,
  ),
  notImplemented(
    'M9',
    ['M5'],
    'npx vitest run tests/ai/hard/geometry.test.ts tests/ai/hard/home.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/geometry.ts --positions 2000 --out lab/results/hard-ai-verify/M9.json',
    3 * MIN,
  ),
  notImplemented(
    'M10',
    ['M5'],
    'npx vitest run tests/ai/hard/prover.test.ts && ' +
      'npm run hard:fuzz -- --surfaces prover --cases 20000 --seed 5 --out lab/results/hard-ai-verify/M10-prover.json && ' +
      'npm run hard:fuzz -- --surfaces gate-preservation --actions 100000 --seed 6 --out lab/results/hard-ai-verify/M10-gate.json',
    10 * MIN,
  ),
  notImplemented(
    'M11',
    ['M5'],
    'npx vitest run tests/ai/hard/canonical.test.ts tests/ai/hard/turnpool.test.ts && ' +
      'node --import tsx lab/hard-ai/oracles/canonical-check.ts --fixtures authored,canonical --corpus fuzz-1000.jsonl --corpus-positions 200 --max-own-units 10 --shards 12 --out lab/results/hard-ai-verify/M11.json',
    8 * MIN,
  ),
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
