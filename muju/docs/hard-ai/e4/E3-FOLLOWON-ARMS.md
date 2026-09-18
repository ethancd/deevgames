# E3 follow-on arms — E4 lane 7 (2026-09-18T00:01:32Z, `date -u`)

Written on `claude/hard-ai-e4-lane7`, off the E4 plan commit 437ee40f
(worktree `~/src/deevgames-e4-lane7`). Bar: `../E4-PLAN.md` row "E3 follow-on
arms" and its section "E3 follow-on rows queued for night windows";
`../../e3/E3-CLOSE.md` (the two candidates, never compared with each other);
`../../e3/AMENDMENTS-E3.md` A-E3-8 (the `spawnStrike >= 0.80` veto and the
per-weight rows that were queued to win `purchase-1` back). This lane adds
arms to `lab/hard-ai/ablate/arms.ts` and a chain script; it launches no row
and runs no suite beyond the two-arm smoke recorded below.

## Why these arms exist

The E3 close retains two champion candidates and states plainly that neither
is compared with the other: `hard@ablate:eval-no-safety` (the 19 safety
weights of `lab/hard-ai/audit/eval-groups.ts` at 0) and
`hard@ablate:eval-correct-v1` (five specification fixes behind
`HardConfig.evalFix`). Two questions were left open and queued for E4's night
window:

1. Do the two effects ADD? Neither candidate's row answers this; a row needs
   an arm that carries both at once.
2. Which of the 19 zeroed safety weights carries `eval-no-safety`'s +124 Elo,
   and in particular which one protects `spawn-strike-purchase-1`, the
   tactical case the candidate lost against M14's gate (A-E3-8: champion and
   `eval-correct-v1` both score .80 at fixed 400,000 units, `eval-no-safety`
   scores .75 and cannot ship until the weight is found)?

This lane's deliverable is arms and a chain script that answer both, in
`lab/hard-ai/ablate/arms.ts` (registry) and `tests/lab/ablate.test.ts`
(pinned). No row is launched by this lane; the chain script
(`lab/hard-ai/ablate/chain-followon.sh`) is for the coordinator or a detached
run worktree to run in the night window.

## The combined arm

`hard@ablate:combined` carries BOTH factors at once: `weights` set to
`eval-no-safety`'s vector exactly (label `default-v1-no-safety`, the 19
safety weights at 0, everything else `default-v1`) AND `evalFix` set to
`eval-correct-v1`'s five flags exactly (`rot180TieOrder`,
`infiltrationPerAnchor`, `inv3RetreatConjunct`, `rentOnce`,
`approachTieOrder`). `factorsOf` reports both `weights` and `evalFix` as
moved; `arm.factor` is the registry's `'combined'` value, the same one
`hard@ablate:work-fit-deep` (E2 lane 1) uses for its own two-factor pair
(`time` + `iterationGate`) — `maskFactor`'s `'combined'` case now restores all
four fields any registered combined arm might move, so the one-factor
invariant test still catches a combined arm that touches a fifth field by
accident.

| arm | factors | resolved config hash (`wall:3000`) |
| --- | --- | --- |
| `hard@ablate:combined` | `weights` + `evalFix` | `41292acd8e7f7aa4b7abce8031b09d4f14da269940be3a950cc00e4f47931ade` |

For reference, the two single-factor candidates it is built from (unchanged
by this lane, quoted from `E3-CLOSE.md`):

| arm | factor | hash |
| --- | --- | --- |
| `hard@ablate:eval-no-safety` | `weights` | `66edf9cdf58f6b037186b25d05a939ed521e8a76e07051937dcbc611eb343aaf` |
| `hard@ablate:eval-correct-v1` | `evalFix` | `49aa15dba67fbc95acd5d6c316210bb4946e8f8016831cf5dc9143afa3641498` |

All three hashes are distinct from each other and from the champion's.

## The 19 per-weight keep arms

Each `hard@ablate:eval-no-safety-keep-<index>` is `eval-no-safety`'s vector
(all 19 safety weights at 0) with exactly ONE of them, `<index>`, restored to
its `default-v1` value. `<index>` is the weight's position in the 58-feature
vector (`src/ai/hard/eval/features.ts`'s `F.*`), and the 19 arms are listed
below in `EVAL_GROUPS.safety` order (`lab/hard-ai/audit/eval-groups.ts`,
itself ascending by index) — the same order `arms.ts` loops over to register
them and `chain-followon.sh` loops over to run them, so an arm's position in
this table is its `k` in the chain's `seed = 50 + k`.

Weights label: `default-v1-no-safety-keep-<index>`. `version` is
`WEIGHTS_VERSION` (1), never 0 — `hardEnginePatch` substitutes
`DEFAULT_WEIGHTS` for a version-0 vector, so a version-0 arm would silently
play as the champion (E0's I2 lesson); `keepSafetyWeight` in `arms.ts` throws
if `DEFAULT_WEIGHTS.version` is ever 0, and `tests/lab/ablate.test.ts` asserts
`version !== 0` on every keep arm. Factor: `weights` (one factor; the arm
moves nothing else, checked registry-wide by `maskFactor`).

| k | arm | index | weight (`eval-groups.ts`) | `default-v1` value restored | resolved config hash (`wall:3000`) |
| --- | --- | --- | --- | --- | --- |
| 0 | `eval-no-safety-keep-17` | 17 | `Exposure` | −20 | `1202dc16ee8cf020ce18f3b149dd5fd120395cb46e9acee4b9e1059d34180cfb` |
| 1 | `eval-no-safety-keep-28` | 28 | `Hanging` | −50 | `56ade9cbfa3644086f62373535ff516a1e01b196acb744b038b3e15d07511f2a` |
| 2 | `eval-no-safety-keep-29` | 29 | `HangingBuy` | −30 | `79f052924cfb6b677386f98f8658c4c08e7494b5e2589fac7915a388e7b27cc2` |
| 3 | `eval-no-safety-keep-30` | 30 | `ApproachRetreat` | −25 | `52559d32ac65d63d114b33397245e125f4a5b6a42f331500d8c151ff79f4b209` |
| 4 | `eval-no-safety-keep-31` | 31 | `ApproachStrand` | −10 | `28a0df712e5ed9a015cc7e26ae628cedc298598808c289d3ae7db09f736eec43` |
| 5 | `eval-no-safety-keep-32` | 32 | `StrandPunish` | 20 | `fec5a009281407146bfefc71c75e69da016215330e5de2abd4c7e2b38ee0c8f8` |
| 6 | `eval-no-safety-keep-33` | 33 | `KillAvailable` | 35 | `5055aa74f1398a92173280854f3f7a2f52e042fb8664b4c3d2dd3121cb9a0159` |
| 7 | `eval-no-safety-keep-34` | 34 | `CleaveExposure` | −40 | `22a6fb4e37a52b9afc67757a123866e443ba538109aa232ff822a27c737b7368` |
| 8 | `eval-no-safety-keep-35` | 35 | `AnchorFragility` | −120 | `06a037f79d4a591e03a44bec466725bd2ee89999ee49e8ef516de9f4fae88afa` |
| 9 | `eval-no-safety-keep-36` | 36 | `BlockingDeficit` | −150 | `4d3b53eb3ae1ad7a71bfa3b2930e34cf8b68679092fcf5d62382a83ab16be364` |
| 10 | `eval-no-safety-keep-40` | 40 | `Inv3RetreatSquare` | −250 | `38503b622f2abadee2d1f1eea82bf18832a2a03bda3858ba2c5a2d839974ebcc` |
| 11 | `eval-no-safety-keep-41` | 41 | `Inv4StrandUnpunished` | −100 | `0d336a996169e40ab100eb4a62f987a2d94531e62b005613058cdb9560e480c4` |
| 12 | `eval-no-safety-keep-43` | 43 | `Inv6FragileAnchor` | −120 | `700f2b31db5423aaac5f1bb9984fca674ca196cfe30d07194fbd910d097574ce` |
| 13 | `eval-no-safety-keep-45` | 45 | `Inv8NoPreAdjacency` | −150 | `ad45f30530f405b1eb867c203f215b6ab484e17aaad14576440924f7f8ca7277` |
| 14 | `eval-no-safety-keep-46` | 46 | `Inv9ChipAcrossTurn` | −150 | `741141ffa928e1eaeb951863319fe8b41576164fd4f33c99b27270b6ff3d07e7` |
| 15 | `eval-no-safety-keep-49` | 49 | `Inv12CleaveLine` | −40 | `fe68a33e241104cacc0219b47d5e2cf11f0f5dcc6abe71339dd35ad703863af2` |
| 16 | `eval-no-safety-keep-54` | 54 | `Inv17SelfBlock` | −60 | `d77b4fefde24799e12b23561590b717a2366f34ba3d803a2ce1f1158af14df15` |
| 17 | `eval-no-safety-keep-56` | 56 | `Inv19SoftMinerExposed` | −150 | `86274b55f3c27cb680fc8bb91dd64f907e0633ca4091b350782d908f615f5959` |
| 18 | `eval-no-safety-keep-57` | 57 | `Inv20StrandNoRetreat` | −250 | `67683e85da82c60bdacbb428ecbeb6524076edf46839d2354204617729078e6f` |

All 19 hashes are distinct from each other, from `combined`, and from the
champion's.

## The champion is untouched

`resolvedConfigHash('hard@desktop', {mode:'wall', ms:3000})` (also
`requireArm('base').configHash`) is still

```
4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd
```

— the same value `E3-CLOSE.md` and `docs/hard-ai/e4/E4-PLAN.md` record.
`tests/lab/ablate.test.ts` pins this string and re-derives it from
`lab/hard-ai/ladder/identity.ts` on every run; the 21 new arms (`combined`
plus the 19 keep arms) sit behind their own `hard@ablate:<arm>` labels and
never touch `hardConfigFor('desktop')`.

## Proof the arms resolve (the only engine work this lane ran)

Two-arm smoke, single process, `--shards 1`, no heavy slot, both well under a
minute — proves each new arm's config resolves to a working engine and the
suite can score it, nothing more:

```
npm run hard:suite -- --suites spawn-strike --engine hard@ablate:combined --work 25000 --shards 1
npm run hard:suite -- --suites spawn-strike --engine hard@ablate:eval-no-safety-keep-17 --work 25000 --shards 1
```

Both returned `{"spawnStrike":0.8,"cases":20,"illegalTurns":0,"wonOutright":4,"deadPositions":0}`
in about three seconds each. No ladder row and no other suite run was
launched by this lane.

## The chain script (`lab/hard-ai/ablate/chain-followon.sh`)

Not launched by this lane. Usage: `chain-followon.sh <run-dir>`, where
`<run-dir>` is a detached run worktree's muju root at a commit whose
`src/ai/hard` matches the commit that carries this script — never a lane
worktree, never `~/src/deevgames-e4-lane7` itself. The script `cd`s to
`<run-dir>` first, because `npm run hard:ladder`'s `--out`/`--openings` and
`npm run hard:suite`'s `--out` resolve relative to the repo root the command
runs in.

What it does, in order:

1. **Waits for an idle heavy queue.** Polls (every 30 s) until
   `${MUJU_HEAVY_DIR:-~/.local/state/muju-heavy}` has NO `slot-*.json` file at
   all — not merely one free slot — so the chain never starts while another
   overnight run (E2's chain, a lane's descriptive row) still holds slots.
2. **Phase 1 — the 19 spawn-strike suites**, M14's gate setting (fixed
   400,000 units, single process, ~20 s each), one per keep arm, in
   `EVAL_GROUPS.safety` order. These run FIRST, ahead of the ladder rows,
   because they answer A-E3-8 directly (which restored weight wins
   `spawn-strike-purchase-1` back) and cost almost nothing. Command per arm
   (`i` = the weight's index):
   ```
   MUJU_HEAVY_SLOTS=8 npm run hard:suite -- --suites spawn-strike \
     --engine hard@ablate:eval-no-safety-keep-<i> --work 400000 --shards 1 \
     --out lab/results/hard-ai-e3/correct/thresholds/spawn-strike-400k-keep-<i>.json
   ```
3. **Phase 2 — the 19 fixed:100,000 descriptive ladder rows**, vs
   `hard@desktop`, on the first four `e1-dev` openings (8 pairs, handicaps 0
   and 3, `--legality strict`, 8 shards), seed `50 + k` for the `k`-th arm
   (`k` = 0..18, the row order in the table above). These enter no ledger
   (E4-PLAN: "no ledger entry"). Command per arm:
   ```
   MUJU_HEAVY_SLOTS=8 npm run hard:ladder -- --a hard@ablate:eval-no-safety-keep-<i> \
     --b hard@desktop --work fixed:100000 --handicaps 0,3 --pairs 8 \
     --openings lab/hard-ai/ladder/openings/e1-dev.jsonl --seed <50+k> \
     --legality strict --shards 8 --out lab/results/hard-ai-e3/ablate/eval-no-safety-keep-<i>/fixed100k
   ```
   Before each row's launch (not phase 1's suites) the script compares
   `date -u +%H%M` to `1330`; at or past that it refuses to launch that row
   (and every row after it), logs which arms never ran, and exits 1. A row
   already running when the clock passes 13:30Z is left to finish — the
   cutoff blocks new launches only.
4. Every phase-1 and phase-2 command logs one `[followon] <arm> start
   <UTC timestamp>` line before it runs and one `[followon] <arm> exit <rc>
   <UTC timestamp>` line after, to `$MUJU_FOLLOWON_LOG` (default
   `<run-dir>/chain-followon.log`) as well as stdout. A non-zero exit does not
   stop the chain (`set -uo pipefail`, no `-e`): a failed arm is logged and
   the chain moves on to the next one, the same way the heavy queue itself
   does not abort a run over one bad shard.

## How to read the outputs

- **Phase 1 (`lab/results/hard-ai-e3/correct/thresholds/spawn-strike-400k-keep-<i>.json`):**
  each file is one `hard:suite` result, `{spawnStrike, cases, illegalTurns,
  wonOutright, deadPositions}` at M14's own work (fixed 400,000). A-E3-8's
  question is answered by scanning these 19 files for `spawnStrike >= 0.80`
  (the champion's and `eval-correct-v1`'s score at this setting): the arm(s)
  that clear it are the weight(s) that protect `spawn-strike-purchase-1`
  and — per the amendment — the way `eval-no-safety` could win the M14 veto
  back. `illegalTurns` and `deadPositions` should read 0 in every file
  (hygiene, not the gate).
- **Phase 2 (`lab/results/hard-ai-e3/ablate/eval-no-safety-keep-<i>/fixed100k/`):**
  each directory is one `hard:ladder` fixed-work descriptive row's normal
  output (per-game records, the score/interval summary, `turnRows` and
  `maxTurnMs` for the P6/P8 columns). These are 8-pair, 4-opening samples —
  far too small to retain anything on their own (E4-PLAN's retention rule
  needs a screening AND a confirmation row on `e4-val`, neither of which this
  lane runs); read them for DIRECTION and for which arm(s) are worth a real
  screening row, the way `E3.1-GROUP-ABLATION.md`'s descriptive rows were
  read before lane 11's sub-arms got their own night-queue slot.
- **`combined`:** no row is preregistered by this lane. E4-PLAN assigns it
  screening block S1 (`e4-val` rows 0–15, seed 20260936) and confirmation
  block C1 (rows 64–79, seed 20260937), both under E3's retention rule
  (score > 0.5 and a 95% interval excluding 0 on confirmation); that launch
  is the coordinator's, not this lane's.

## Follow-up (2026-09-18T00:15:09Z, `date -u`): phase 1 results and the anchor arm

Phase 1 of `chain-followon.sh` (the 19 spawn-strike suites, M14's gate
setting, fixed 400,000 units) ran at E4 head `77ef1c32`. Artifacts:
`lab/results/hard-ai-e3/correct/thresholds/spawn-strike-400k-keep-<i>.json`,
one per keep arm. A-E3-8's question — which restored safety weight wins
`spawn-strike-purchase-1` back at the champion's own score (16/20, .80) — is
answered directly by this table: three weights, ALL THREE belonging to the
anchor pair `eval-no-anchor` already zeroes as one block
(`AnchorFragility`, `BlockingDeficit`) plus the invariant that duplicates it
(`Inv6FragileAnchor`), each independently win the case back; the other 16
keep arms stay at the candidate's regressed score (15/20, .75).

| k | arm | index | weight | spawnStrike | cases | artifact |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `eval-no-safety-keep-17` | 17 | `Exposure` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-17.json` |
| 1 | `eval-no-safety-keep-28` | 28 | `Hanging` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-28.json` |
| 2 | `eval-no-safety-keep-29` | 29 | `HangingBuy` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-29.json` |
| 3 | `eval-no-safety-keep-30` | 30 | `ApproachRetreat` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-30.json` |
| 4 | `eval-no-safety-keep-31` | 31 | `ApproachStrand` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-31.json` |
| 5 | `eval-no-safety-keep-32` | 32 | `StrandPunish` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-32.json` |
| 6 | `eval-no-safety-keep-33` | 33 | `KillAvailable` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-33.json` |
| 7 | `eval-no-safety-keep-34` | 34 | `CleaveExposure` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-34.json` |
| 8 | `eval-no-safety-keep-35` | 35 | `AnchorFragility` | **16/20 (.80)** | 20 | `spawn-strike-400k-keep-35.json` |
| 9 | `eval-no-safety-keep-36` | 36 | `BlockingDeficit` | **16/20 (.80)** | 20 | `spawn-strike-400k-keep-36.json` |
| 10 | `eval-no-safety-keep-40` | 40 | `Inv3RetreatSquare` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-40.json` |
| 11 | `eval-no-safety-keep-41` | 41 | `Inv4StrandUnpunished` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-41.json` |
| 12 | `eval-no-safety-keep-43` | 43 | `Inv6FragileAnchor` | **16/20 (.80)** | 20 | `spawn-strike-400k-keep-43.json` |
| 13 | `eval-no-safety-keep-45` | 45 | `Inv8NoPreAdjacency` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-45.json` |
| 14 | `eval-no-safety-keep-46` | 46 | `Inv9ChipAcrossTurn` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-46.json` |
| 15 | `eval-no-safety-keep-49` | 49 | `Inv12CleaveLine` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-49.json` |
| 16 | `eval-no-safety-keep-54` | 54 | `Inv17SelfBlock` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-54.json` |
| 17 | `eval-no-safety-keep-56` | 56 | `Inv19SoftMinerExposed` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-56.json` |
| 18 | `eval-no-safety-keep-57` | 57 | `Inv20StrandNoRetreat` | 15/20 (.75) | 20 | `spawn-strike-400k-keep-57.json` |

(Artifact column is relative to `lab/results/hard-ai-e3/correct/thresholds/`;
reported by the coordinator from the E4 head `77ef1c32` run, not re-derived by
this lane.)

### `hard@ablate:eval-no-safety-keep-anchor`

Since all three anchor-block weights win the case back independently, the
follow-up arm restores all three together rather than picking one:
`eval-no-safety` (19 safety weights at 0) with `F.AnchorFragility` (35),
`F.BlockingDeficit` (36) and `F.Inv6FragileAnchor` (43) restored to their
`default-v1` values — the same triple `SAFETY_ANCHOR`/`eval-no-anchor` treats
as one block (`lab/hard-ai/ablate/arms.ts`) — leaving the other 16 safety
weights at 0. Weights label `default-v1-no-safety-keep-anchor`, version 1
(`WEIGHTS_VERSION`, asserted non-zero), factor `weights` (one factor; the arm
moves nothing else outside the three restored entries, checked registry-wide
by `maskFactor` and directly by `tests/lab/ablate.test.ts`).

| arm | restored | resolved config hash (`wall:3000`) |
| --- | --- | --- |
| `hard@ablate:eval-no-safety-keep-anchor` | F35 `AnchorFragility` (−120), F36 `BlockingDeficit` (−150), F43 `Inv6FragileAnchor` (−120) | `5447c5747b5c76395623effccd6aef2b79202b94e4f9b459e3e74835caccc7f5` |

Distinct from every one of the 19 single-weight keep arms, from
`eval-no-safety`, from `combined`, and from the champion's
`4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd` (which is
unchanged — re-verified after this addition).

**Smoke** (single process, `--shards 1`, under a minute — the only engine
work this follow-up ran beyond re-deriving hashes):

```
npm run hard:suite -- --suites spawn-strike --engine hard@ablate:eval-no-safety-keep-anchor --work 400000 --shards 1 --out /tmp/keep-anchor-400k.json
```

Result (reproduced twice, identical both times — fixed work, deterministic):
`spawnStrike 0.75` (15/20), `cases 20`, `illegalTurns 0`. **This is NOT the
naive expectation.** Each of F35, F36 and F43 independently wins the case
back to 16/20 (the phase-1 table above), but restoring all three TOGETHER
lands back at 15/20 — the candidate's regressed score, the same as
`eval-no-safety` itself. Whatever wins `purchase-1` back is not additive
across the three weights: the single-weight win is not a "the anchor pair
matters" story that a bigger restoration reinforces, and the three
single-weight results should not be read as three independent confirmations
of one mechanism. No ladder row was launched; which single weight (or pair)
to prefer for winning `purchase-1` back — if any single restoration is
preferred over this triple — is an open question this arm's own row does not
settle, and is not decided here.

**Phase 2 of `chain-followon.sh`** now carries this arm as its 20th and last
row: `k = 19`, `seed = 69` (`50 + 19`), 8 pairs on the first four `e1-dev`
openings, handicaps 0/3, 8 shards, `--out
lab/results/hard-ai-e3/ablate/eval-no-safety-keep-anchor/fixed100k`. A
relaunch with `--phase 2` skips phase 1 (already run, table above) and starts
straight at the 20-row phase 2 list, still gated by the 13:30Z launch cutoff
and the idle-heavy-queue wait.
