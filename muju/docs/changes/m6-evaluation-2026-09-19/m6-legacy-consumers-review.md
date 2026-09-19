# M6 quarantine and consumer triage

Read-only inspection in work/deevgames-phasing-m6 while source is frozen. No
runtime, tests, datasets, openings, corpus rows or historical result files
were read/executed. Source comments and loader callsites were inspected.

## Four named quarantines

| File | Collection/execution boundary | Recommended bounded port |
| --- | --- | --- |
| tests/ai/hard/eval-correct.test.ts | Imports metal-v28-catalogue at line 2. Fuzz rows load lazily through fuzz() at 58–61. First three tests (94,101,109) only inspect configuration/propagation; the fourth invokes fuzz. Several other local tests directly call the old held/relocation DP. | Preserve old catalogue/fuzz and old numeric-coefficient evidence as historical. Add current-catalogue Phasing tests for configuration propagation and relevant retained flag predicates using authored diagrams. Rent/economy behavior is now the exact chronological ledger, not the old B1/B2/B5 correction arm. Assertions pinning old -250/+90 weights cannot become bootstrap acceptance. |
| tests/ai/hard/approach-tie.test.ts | Every test loads the historical fuzz file; loader is lazy, but selecting any existing test still reads it. | Add authored Phasing tied/unique attack-square controls under explicit current/next-Act horizons, AP and simultaneous occupancy. Verify equal class/cost and the selected retreat tie behavior with flag on/off, plus side-swapped controls. Retain original IDs/count pins unchanged. |
| tests/lab/eval-audit.test.ts | describe callback eagerly calls loadPositionFile(ECONOMY) at 106; -t does not avoid the read. CLI tests additionally read historical exam/dev rows. Its local lopsided fixture starts from createInitialGameState() whose default is Standard (board.ts:204). | Add a separate authored-only Phasing file calling safe exported newCtx/measure, with temporary newly authored input files for parser/report tests. Pin 62 features, stage/group/sum identity, signed perspective antisymmetry, source rules and explicit pending fields. Use tie-free rot180 controls plus canonical tie-policy diagnostics, not universal geometric equivalence. |
| tests/lab/recall.test.ts | describe callback calls recallProbe twice at 60–61 before tests are selected. These are real reference/generator measurements; -t does not avoid them. | Separate no-data engine-patch identity tests from historical regret/golden measurements. Use current resolved weight/schema identities and evaluator/config propagation. A future authored-only reference driver needs explicit injected items/fixtures before measurement. Do not demand eval-no-safety alters bootstrap regret: the zeroed safety features may leave its vector numerically unchanged. |

No full existing quarantined file should be added to an unattended diagnostic
run under the current no-data boundary. The exact first three eval-correct
configuration tests can run without a corpus read, but still install the old
catalogue mock and therefore establish only configuration plumbing. A cleaner
path is a small current Phasing test file before restoring any exclusion.
The old files can remain explicitly historical, as with M4's P6/P8 evidence;
new active coverage must be named in the migration ledger.

## Active bench/audit/oracle consumers

1. **bench/run.ts is an active legacy entry point, not import-safe.** Its
   bottom-level dispatcher invokes main/calibrate without an entry guard.
   loadCorpus (130–138) reads authored/openings/fuzz; packAll can discard
   unsupported roots. The eval path still calls old economyStayInPlace and
   subtracts F.EconDelta as part of ECON_RELOCATION_FEATURES (86,216–235),
   although feature23 now holds the chronological live-origin ledger. Its
   symmetry and invariant acceptance gates are therefore obsolete for M6.
   checkInvariantSuite (423–459) reads old pairs and treats only15/18 as
   structural, whereas new5/17 are also structural. Preserve this old CLI's
   evidence; add a separate explicit authored-input Phasing bench/check path,
   or guard/relabel it as historical before anyone cites it as migration proof.

2. **audit/eval-audit.ts has current-size loops but stale output/claims.**
   Context and all feature arrays use FEATURE_COUNT (196–207,234–241), so no
   hard-coded58 allocation was found. Emitted Markdown still says “58” at
   858/860; change these two live strings to FEATURE_COUNT when leased. Its
   unconditional source assertion of rot180 equivalence is not valid for the
   exact canonical upkeep policy's absolute-square tie breaks. Keep same-state
   perspective antisymmetry as a hard invariant; report geometric mirror
   differences separately, with independent canonical policy evidence.
   The mirror catch at261–275 encloses both pack and full evaluation, so any
   forecast proof cutoff/evaluation exception is mislabeled “mirror did not
   pack.” Narrow that boundary or retain a distinct explicit error: a proof
   failure must not become a harmless mirror skip.

3. **recall/run.ts is import-safe, its measurement is not data-isolated.**
   The entry guard at1163+ permits direct use of recallEnginePatch without
   computation. But buildWorkList (253+) always reads its fixed historical
   fixture and authored positions before considering the supplied corpus;
   replacing --corpus alone cannot create an authored-only run. The resolved
   weight object is already passed to Evaluator (467), a useful contract to
   verify with a bounded injected/authored fixture rather than reusing old
   regret values. No current regret floor is established by these sources.

4. **oracles/economy.ts is explicitly historical now.** Its new header names
   the held-DP limitation and points to oracles/phasing-economy.ts. The old file
   still unconditionally calls main and reads stored corpora; do not import
   it for current checks. The new canonicalPhasingEconomy function takes an
   explicit authored state and performs actual legal lifecycle transitions;
   phasing-economy.test.ts is the relevant independent parity route.

5. **Adjacent old threat/kill/geometry CLIs remain historical interfaces.**
   Each ends in unconditional main and loads historical corpora. Threat
   compares the old purchased-body oracle with strikeIfBought; kill still
   enumerates same-turn allowBuys/allowPromotes combinations; geometry asserts
   old BUY/END_PLACE/MOVE home-race triples. They need separately bounded
   Phasing author controls before use, not broad invocation during M6. Current
   M4 table/approach/spawn tests and new M6 pending/economy controls supply the
   corresponding source-level checks without running these old loaders.

## Safe initial execution set after coordinator freeze

Use the shared queue and named active tests already authored for M6:
phasing-bootstrap, phasing-economy, phasing-invariants, eval, invariants,
purchase, approach and tables-phasing (plus the root's book/tuner checks).
These recommendations do not certify tests passed: this lane did not execute
them. Add newly authored eval-audit/approach-tie/config identity contract files
before requesting old quarantine removal. Keep diagnostic selection explicit;
do not use a broad MUJU_RUN_QUARANTINE run or old bench/oracle CLI as M6 proof.

No historical numeric result was regenerated, no denominator was repaired,
and no source/quarantine edit was made in this review.

## Inv19 projection limitation (requested follow-up)

Inv19 reads t.strikeIfBought[enemy] (eval/invariants.ts:123,138–145).
threat.ts:66–77 builds this from core/spawn.ts:325's static-board
nextActProjection. This correctly requires an already-paid commitment and
ignores enemy cash, but does not replay intermediate rent/release/terminal
events. It is an optimistic geometric arrival-exposure diagnostic, not proof
that the chronological forecast actually delivers that attacker.

Concrete source-derived counterexample, not executed: Black is the current
Act player with zero cash and empty reserves; its fire_2 at (7,7) is the sole
supporting anchor for paid fire_1 at (7,8), and a free plant_1 at (9,9) keeps
Black alive after release. White's soft miner fire_1 at (6,7) lies in the
static arrival strike area. Under the actual pass-only lifecycle, Black owes
one after Act and releases fire_2; plant_1's rectangle does not support (7,8),
so that commitment refunds at its future arrival window. The static mask can
still fire Inv19. Mirroring preserves this construction. Conversely a released
enemy blocker could enable a held-policy arrival absent from the static mask.

The new zero-bank canonical arrival/attack witness remains valid for its
tier-I-anchor fixture; it does not prove chronological validity universally.
Inv19's bootstrap coefficient remains zero, so this limitation does not price
an impossible arrival in the approved accounting score. Any later nonzero
coefficient or description as actual reached arrival requires a source-bound
chronological victim/attacker projection, not only checking whether any enemy
commitment has pendingArrival==1. No extra runtime/source change was made.
