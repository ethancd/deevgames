# M6 development corpus → Texel → validation continuation

Read-only source review, 2026-09-19. Checkout: `work/deevgames-phasing-m6`, current HEAD `66473c7582eacbbad1f49f69c6b0b8789f6a1638` (the M6 lane originally branched from `5d31740791b8c3aa17797a29f9a5eac87a85b844`; file hashes below pin reviewed working bytes). No engine, test, corpus, fit, opening generation or validation command was executed. No opening, corpus, validation or sealed data contents were read. Only this outside-repository recipe was written. The command blocks below are future invocation templates, not executed results or a newly frozen experimental allocation.

Coordinator-reported current evidence: 18 canonical goldens pass, independent 44-root runtime row passes, first 225-case M5 measurement queued. Frozen bootstrap weight identity is `0ae24a95`; `work/m6-bootstrap-freeze-2/weights.json` SHA256 is `e8e1cc7d7e15d9c02d148651004dfd2fe716b98a8017e3ef031b94ed74816eb3` (file hash independently checked during this review). Those facts establish a concrete bootstrap to bind, not successful training, M5 floors, val strength, Gate0 or release.

## Decision and current blockers

The corpus and Texel readers now have usable development-only, hash-bound entry points. They cannot yet supply an honest full M6 experiment simply by invoking the old documented commands. Complete these source/protocol steps before generating outcomes:

1. **Freeze a viable development-data allocation and sampling protocol.** Frozen Phasing plan §4e states the sequence but does not provide a new corpus size. Historical DESIGN §5.15/MILESTONES M20 specifies full self-play at fixed25000, 20,000 games, then20 Texel iterations; M18's400 games/3iterations is explicitly an instrument check, not the full tune. Neither historical command is accepted by the current corpus CLI. Do not silently replace the full requirement with a tiny convenient run.
2. **Resolve the actual diversity ceiling.** Source `ladder/openings/split.ts:109–120` freezes48 P1 dev openings. With handicaps0,3, `run.ts` allows96 distinct opening×handicap cells, yielding192 orientation records. `pairing.ts:85–90` uses the same position and seed for both orientations; Hard ignores seeds. Identical-weight self-play therefore yields at most96 distinct trajectories, with both orientations duplicates. Repeating seeds or enabling `--allow-opening-reuse` adds no diversity. The historical400-game check already exceeds the cell cap; the20,000-game requirement is much further away. This conclusion is from source constants, not opening contents or measured trajectories.
3. **Bind candidate weights into real ladder workers and identity.** `ladder/engines.ts:339–358` resolves fixed `hard@<profile>` labels; `bots/hard.ts:245–269` accepts lab/desktop/midrange/phone and named ablations. There is no candidate weight-file/hash CLI, and old `hard@texel` / `hard@m14` labels are not accepted. A candidate validation command does not exist yet. Implement explicit immutable per-arm weight paths plus expected hashes, validate schema/pins before starting workers, carry them through shard config/worker construction, and bind loaded numeric vectors and hashes into resolved configuration, game/replay identity and resume comparisons. A documented label that still runs defaults is unacceptable. `createHardBot({weights})` already supplies the underlying injection API.
4. **Freeze the tunable parameter domain before fitting.** Current `freeParams()` offers75 of80 parameters, excluding only informational material feature0, cash2/3, escrow58 and fire_1 material. The bootstrap contract leaves57 feature coefficients zero, explicitly reserves some overlapping features for a separately preregistered residual model, and identifies stale semantics. The generic instrument's75-variable capability is not an approved Phasing utility model. Enumerate which terms are semantically eligible, which remain pinned zero, whether EconDelta23 and the other17 material priors can change, and why; encode the resulting domain in the fitting manifest/guard and meaningful synthetic checks. Keep2=100,3=100,58=1 and fire_1=300. Do not choose this domain from M5 misses or fit coefficients to M5 answers.
5. **Freeze validation criteria and allocation before dev outcomes.** Phasing M6's exit says “val row positive; suites ≥ floor,” but does not define a new val rung, pair cap, uncertainty criterion or stopping rule. Historical M20's fixed400000,1500pairs, SPRT0/+10 is a different protocol and exceeds P1 val capacity too; M7's wall8000,32pairs,0/+100 is the separate sealed strength gate. Do not silently substitute either. The coordinator must write a concrete pre-outcome M6 validation row, comparator, allocation, stopping rule, failure criteria and selection rule under the existing unattended authority. This is an experiment-definition task, not a request for more user input.

The smallest useful next work is source completion of candidate injection/identity, metadata publication/audit and the parameter-domain contract while the M5 row completes. A larger dev allocation or diversity-generating producer requires a dated pre-outcome allocation amendment. Preserve the existing P1 bytes; do not regenerate `split.ts`, inspect held-out states to design training, borrow validation/sealed/spare rows, or rewrite `p1-dev.jsonl`. If new dev data use a new path, the exact `DEV_POOL_PATH` allowlist contract must be deliberately versioned and tested to admit that named allocation; do not replace it with a permissive “anything called dev” rule. An independent custodian can certify split disjointness using frozen allocation metadata without exposing held-out contents to the tuning lane. Alternatively, a materially smaller scientific scope needs an explicit justified amendment and cannot be reported as the historical full tune.

## Binding sequence and pre-outcome record

The original Phasing plan order remains hand evaluation → frozen suites/goldens → dev-only corpus → Texel → val → re-pin selected weights/identity. An honest bootstrap floor miss is retained; it does not authorize lowering floors, reclassifying cases, tuning against suite results, or calling the bootstrap release-ready. Candidate suite checks use the exact frozen M5 manifest and floors. A valid bootstrap measurement and its performance outcome are different facts.

Before any new self-play, write a fresh immutable protocol containing:

- Final runtime commit/source hashes, canonical rules/catalogue/ABI, current feature schema `muju-phasing-eval-1`,62 features, weight version2, frozen bootstrap numeric hash and exact serialized weight SHA above; explicit EMPTY_BOOK and book identity.
- Exact development allocation metadata path/hash and dev file expected SHA, eligible opening IDs/families from that dev allocation only, prior allocation/use ledger and the independence/disjointness statement. No val/sealed file needs to be opened to make a dev allowlist.
- Producer engines/profiles, both numeric weight identities, fixed work rung, handicaps, game/pair counts and duplicate handling, seeds, full opening×handicap schedule, output paths, strict legality and unchanged adjudication/ply rules. Same-arm duplicated orientation records must not masquerade as extra distinct training games or statistical samples.
- All collection and exclusion rules, including quietness, full Act roots, maximum turn policy, missing replay/failed game/cutoff policy, minimum usable positions and draw share criterion. The old full defaults are fixed25000/20,000games and≥200,000 positions/draw share<0.70; either adopt them with viable diversity or explicitly amend them. Do not perturb DrawPressure after an observed draw rate under the old DESIGN suggestion without a new declared arm; this bootstrap pins it zero.
- Train/internal-heldout grouping and deterministic seed/fraction, optimizer domain/steps/iteration count/refit-k policy, candidate selection rule and val protocol. The internal20% dev holdout is not P1 val. Current splitter groups exact opening IDs; if allocation “family” spans multiple IDs, supply a true family map/port the splitter before asserting family separation.
- Frozen M5 manifest, floor contract and bootstrap golden hashes; all existing correctness vetoes and candidate checks. No M5 outcome is a training label or coordinate-descent target.

Do not estimate completion time from old budgets. Record observed work and duration once the approved producer runs; this review has no new performance data.

## Current CLI: self-play is a separate producer

All commands below use `muju/` as the working directory. Values named `M6_*` must come from the frozen protocol. Their absence is not permission to pick defaults. A source-identity preflight must establish that profile defaults numerically equal frozen bootstrap `0ae24a95`, because the current ladder CLI cannot load the JSON explicitly.

The real bootstrap producer interface is:

```sh
npm run hard:ladder -- \
  --a hard@desktop --b hard@desktop \
  --work fixed:25000 --handicaps 0,3 \
  --pairs "$M6_PAIR_COUNT" --seed "$M6_SELFPLAY_SEED" --shards 2 \
  --openings lab/hard-ai/ladder/openings/p1-dev.jsonl \
  --legality strict --replays on --out "$M6_SELFPLAY_OUT"
```

This is syntax only, not a recommendation to launch the currently undersized allocation. The run must use a fresh output directory checked before launch: `runLadder` presently uses recursive mkdir and rewrites manifests, so it is not itself exclusive-output-safe. Use no independence override, no initial-only override, and no outcome-dependent `--openings-ids` selection. Do not use `--sprt` for a fixed collection schedule. A preplanned resume must preserve the exact same source/config/allocation and record prior failure evidence.

`ladder/shard.ts` already acquires the machine-wide heavy slot for each actual worker and reassigns it to the child PID. **Do not put the ladder under an outer slot-holding `run-m6-check.mts`**: nested slot acquisition can block the workers. Use a non-slot-holding coordinator evidence wrapper around the ladder for source hashes, exact argv, real process exit, logs and after-source drift. Keep normal queue settings, no bypass or slot-directory overrides.

The source-only `hard:corpus` CLI does NOT support `--games`, `--work`, `--handicaps` or `--shards`: it reads completed approved ladder replays. Old M18/M20 command lines using those flags are stale and will fail.

## Post-completion metadata authoring: two immutable allowlists

First verify producer completion from its manifest before reading game/replay data. Require exact expected rules, allocation/config/weights/source identities, status complete, voided false and full planned schedule; audit no illegal actions, replica divergence, engine fallback, proof veto, missing/duplicate games or source drift. The current tune preflight checks status/void/rules/pool/IDs/current Hard schema and vector lengths; it does **not** independently enforce every experimental criterion or exact bootstrap numeric hash. A caller-pinned allowlist is the reviewed trust boundary, not proof that a producer's labels are honest.

Only after metadata acceptance may a narrow publisher open that explicitly named dev run's games/replays to hash/audit them. It must not scan arbitrary runs or pools and must not open refused datasets to enumerate IDs. Publish a fresh `*.allowlist.json` using exclusive creation. Schema required by `rows.ts:139–203`:

```json
{
  "schema": "muju-phasing-tune-allowlist-v1",
  "featureSchema": "muju-phasing-eval-1",
  "featureCount": 62,
  "weightsVersion": 2,
  "rulesVersion": "muju-phasing-1",
  "pool": {
    "path": "lab/hard-ai/ladder/openings/p1-dev.jsonl",
    "sha256": "EXPECTED_DEV_FILE_SHA256",
    "openingIds": ["EXACT_APPROVED_DEV_IDS"]
  },
  "runs": [{
    "path": "lab/results/EXACT_FRESH_DEV_RUN",
    "manifestSha256": "COMPLETED_MANIFEST_SHA256",
    "gamesSha256": "GAMES_JSONL_SHA256",
    "openingIds": ["EXACT_SELECTED_MANIFEST_IDS"],
    "replays": [{
      "path": "replays/EXACT_REPLAY_NAME.json",
      "sha256": "REPLAY_SHA256",
      "opening": "MATCHING_APPROVED_DEV_ID"
    }]
  }],
  "corpora": []
}
```

This is an illustrative schema, not valid metadata: real hashes must be64 lowercase hex characters, IDs unique and nonempty, and each replay must be explicitly bound. All paths are relative to `muju/`, inside real directories without symlink components; names with val/sealed/validation components are refused. `run.openingIds` must equal the manifest's selected `openings.ids`, not merely its used subset. Preserve the original source/config/weights audit alongside this allowlist because its minimal schema does not express those detailed acceptance checks itself.

Allowlist A binds the source run(s) before extraction. After extraction completes, publish a NEW allowlist B copying the approved pool/run/replay bindings and adding `{path,manifestSha256,positionsSha256}` for the fresh corpus. The corpus manifest already records A's hash; B has a different hash. Do not create a circular hash by rewriting the corpus to name B. Preserve A, B and both hashes plus the explicit chain audit. `readRows` currently requires a syntactically valid sourceAllowlistSha256 and rechecks source manifests but does not itself resolve that historic A file; the publisher's retained chain supplies that provenance.

No publisher CLI currently exists. A small, reviewed source-only utility with explicit completed-run input, expected frozen protocol hash, exclusive output and synthetic refusal tests is the next implementable piece. It should never choose runs based on their win rate or quietly drop bad records.

## Corpus extraction and Texel commands

These are serial heavy commands with no internal heavy-slot acquisition. Wrap each in the existing `work/run-m6-check.mts`, using a unique absolute evidence directory and a unique output path. The wrapper runs in the M6 package, captures real child exit and source drift, and forbids queue overrides. Do not overlap source writes.

```sh
node --import tsx /Users/ashkie/Documents/Codex/2026-09-18/wba/work/run-m6-check.mts \
  "$M6_CORPUS_EVIDENCE_ABS" m6-dev-corpus \
  node --import tsx lab/hard-ai/tune/corpus.ts \
  --runs "$M6_SELFPLAY_OUT" \
  --source-allowlist "$M6_ALLOWLIST_A" \
  --source-allowlist-sha256 "$M6_ALLOWLIST_A_SHA256" \
  --holdout-by opening --holdout-fraction 0.2 --holdout-seed "$M6_HOLDOUT_SEED" \
  --out "$M6_CORPUS_OUT"
```

Do not add `--max-turns` opportunistically to shrink data. The extractor reconstructs the exact hash-checked replay bytes canonically; retains ongoing full-AP Act roots without pending upkeep; builds current evaluation features; accepts the declared quiet test from current kill/home tables; and labels by final game result from row-side perspective. It aborts unpack failures and forecast proof cutoffs. It writes current62-feature/18-material rows, per-opening/result/terminal counts and an immutable corpus manifest. Both output directory and files are exclusive. Check exact evaluator-score reconstruction on new authored Phasing examples and a predeclared dev sample before accepting generated features; the header's730-node reconstruction claim belongs to historical Standard evidence, not this row.

The corpus manifest currently records `engineConfigHash` for `hard@desktop` at hard-coded wall3000 (`corpus.ts:381`), although extraction does no search and producer work may be fixed25000. It separately binds source manifests. Before execution, clarify/split that field into extraction configuration versus actual producer identities; do not report the hard-coded hash as the self-play engine/rung. Similarly, source preflight guarantees current shape/version but not exact frozen bootstrap coefficients; the outer protocol audit must check them.

After corpus acceptance and allowlist B publication, the full historical fit syntax is:

```sh
node --import tsx /Users/ashkie/Documents/Codex/2026-09-18/wba/work/run-m6-check.mts \
  "$M6_TEXEL_EVIDENCE_ABS" m6-dev-texel \
  node --import tsx lab/hard-ai/tune/texel.ts \
  --corpus "$M6_CORPUS_OUT" \
  --source-allowlist "$M6_ALLOWLIST_B" \
  --source-allowlist-sha256 "$M6_ALLOWLIST_B_SHA256" \
  --iterations 20 --steps 100,10,1 \
  --label "$M6_CANDIDATE_LABEL" --out "$M6_TEXEL_OUT"
```

This requires the parameter-domain disposition above; the current75-free-parameter instrument must not be mistaken for that final contract. No `--refit-k` unless preregistered. Current optimizer fits k on train, accepts coordinate moves only for lower train log-loss, and reports heldout loss each iteration; heldout outcomes do not select steps inside this implementation. Freeze selection ahead of time rather than choosing whichever reported iteration looks best. Require strictly improved internal-heldout loss, integral supported coefficients and all accounting pins. The tool starts from source DEFAULT_WEIGHTS, so it must still equal the frozen bootstrap at launch. It writes candidate:false, schema `muju-weights-phasing-v1`, version2,62/18 vectors, corpus hash and optimizer trace to fresh files; it never edits src. A lower loss alone does not approve an engine candidate.

## Candidate suites, val and selected-artifact pinning

The new M5 measurement tool already accepts an explicit candidate JSON and records/checks its bytes across the run:

```sh
npm run hard:suite:phasing:measure -- \
  --manifest "$M5_FROZEN_MANIFEST_ABS" --contract "$M5_FROZEN_CONTRACT_ABS" \
  --weights "$M6_CANDIDATE_WEIGHTS_ABS" --out "$M6_CANDIDATE_SUITE_OUT_ABS"
```

This entry point owns its heavy slot; do not add an outer slot wrapper. Keep all225 cases,149 preference/decision units,76 coverage cases and every fixed family floor. Preserve every candidate failure and identity. Candidate weights may alter utility; rerun exact runtime/correctness/score-bound controls appropriate to that numeric vector, not merely loader shape tests. Do not teach the optimizer the suite's expected answers.

Validation is a separate controlled reader/executor, never an input to `hard:corpus` or `hard:texel`. Once the weight-injection lane and M6 protocol are frozen, run the nominated candidate against its frozen comparator on the allocated val schedule with seat pairing, strict legality, complete replays and the declared statistical rule. Candidate identity must be fixed before opening val states; changing the candidate after observing val requires the declared development/selection policy and a new ledger, never calling repeated peeking a fresh validation. Sealed data remain untouched for M7. No exact executable candidate-val command is given here because that interface is presently absent; inventing one would be misleading.

Only after the preregistered dev/val process and frozen suite floors succeed may selected weight artifacts be repinned: a new generated vector/source record, exact numeric/content hashes, schema/version convention, resolved identity, compatible MUJUBK03 identity and candidate-specific verification/goldens. Do not silently increment version during fitting: bootstrap and candidates currently use schema/version2 with content hashes distinguishing coefficients. Preserve bootstrap goldens and all rejected vectors. EMPTY_BOOK can remain explicit; the plan requires BK03 compatibility, not an untested populated book. Historical `hard:book` and `hard:spsa` package commands point to absent files in this checkout; they are not runnable M6 shortcuts and their old M18/M20 aggregate gates must not be claimed passed.

M6 success still does not repair the distinct failed baseline sanity row or authorize a Hard guard flip, M7 sealed strength result, responsiveness claim or deployment.

## Source pins for this recipe

- `lab/hard-ai/tune/rows.ts`: `18650ba68ff215e0a1341bba5acbecfecbba22eb305ac9d1e6c6b2da7eb2564e`
- `lab/hard-ai/tune/corpus.ts`: `8294cbcebc1e26e2b447b3c9d6784db62bfa83d29d8f83fef8616a9e7b4bcf6d`
- `lab/hard-ai/tune/texel.ts`: `d081b2e5c4fafb7c2a5f5a4c064605225b506171f64d3f1567411c73cee2c7ba`
- `lab/hard-ai/ladder/run.ts`: `f616812fd5213293edf07c81a555523cad4d7ca8406374ed1eb814bc4fe3fd3c`
- `lab/hard-ai/ladder/engines.ts`: `6fc7c55c0834705a9a5679db451cad4057a3a8b922bc27a6d58a9d8e14b6a5b4`
- `lab/hard-ai/ladder/shard.ts`: `6da56dce686647bbdd99f2d7573b185dce258780857b7df81663a509743ec24e`
- `lab/hard-ai/ladder/openings/split.ts` (source only): `9f876b11877fbcc21e42543338ce7bd23545f6ae6d01eba817c161726aae2121`
- `lab/hard-ai/suites/phasing/measure.ts`: `e4a65e3eee29c6edda8c5a1018e940ef8e6869da24a002a04a7730eb81beead6`
- `src/ai/hard/eval/weights.ts`: `97d81ada72c320203c65c4012550ce2114816adf04d5fce1c4e665316e1a6d0a`
- `docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md`: `db9ed4fa97772d93d68feda85a80dd2b5be36b51034ba97e5f54deaf0310d218`

Limits: this is source/contract review only. Actual dev file presence/hash, actual allocation ledger, candidate sample yield, draw rate, runtime, loss, M5 results and val outcomes are deliberately not inferred or read. Source drift after these pins requires rechecking the affected command/metadata contract.
