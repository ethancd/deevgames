# M6 tuning source guards — 2026-09-19

Source work only, base5d317407 in `work/deevgames-phasing-m6`. No corpus, tuning, validation/sealed data, opening pool or outcome operation was executed. Only source was read/edited and `git diff --check` ran clean. Tests are authored but unexecuted pending coordinator queue/freeze.

## Input contract

Both CLIs now require `--out <fresh-dir> --source-allowlist <reviewed.allowlist.json> --source-allowlist-sha256 <sha256>` in addition to their input run/corpus argument. Metadata lives inside the Muju repo root and all source paths are normalized repository-relative paths. The expected allowlist hash is supplied explicitly, never discovered from a neighboring data file.

The metadata schema `muju-phasing-tune-allowlist-v1` binds `featureSchema=muju-phasing-eval-1`, `featureCount=62`, `weightsVersion=2`, `rulesVersion=muju-phasing-1`; `pool.path=lab/hard-ai/ladder/openings/p1-dev.jsonl`, its SHA256 and explicit unique opening IDs. `runs[]` each contain path, manifestSha256, gamesSha256, openingIds, and `replays[]` with relative `replays/*.json` path, SHA256 and opening. `corpora[]` each contain path, manifestSha256 and positionsSha256. No actual allowlist was authored from current or historical data in this lane.

All selected runs must be present before any manifest is opened; all selected manifests must match pinned bytes, complete/non-void Phasing status, exact p1-dev pool hash/IDs and current-schema Hard weight vectors before any games/replays are opened. Every replay path/opening must be explicitly listed and its bytes hash correctly. Replay construction uses those SAME parsed bytes instead of reopening loadReplay. Unpackable approved positions are a hard failure, not quietly discarded rows. Only actual full-AP Act/no-upkeep roots become rows.

Before positions.jsonl opens, the corpus itself must be explicitly allowlisted, its manifest hash/current schema/pool/position hash/opening IDs/source provenance must match, and all originating run manifests must preflight. Rows require current Phasing schema/62 integer features/18 integer counts/version2 and approved opening/pool/run identity. Positions bytes are hashed before parsing. The heldout split remains a split INSIDE p1-dev; p1-val/sealed are never permitted.

`loadRefusalRules` is now metadata-only and never opens a pool or enumerates IDs. Legacy datasets and v1 vectors remain unchanged on disk. Positive allowance requires the exact canonical p1-dev path; null/unknown/renamed paths are refused. Source paths containing val/sealed/validation components, traversal, backslashes, or symlink components are rejected before opening the target.

## Outputs and fit identity

Output directory must not exist and must not be under src or a symbolic ancestor. Final directory creation is exclusive; all positions/manifest/weights/report writes use `wx`. Partial failed outputs remain visible; a retry needs a fresh output path. No artifact overwrite is allowed.

Texel freeParams excludes w0, w2, w3, w58 and materialfire1. Input/output accounting pins are exact w2=100,w3=100,w58=1,fire1=300. Fit rows reject legacy feature identity. Output imports the production `muju-weights-phasing-v1` schema and `muju-phasing-eval-1` feature identity, retaining weights version2 (no +1). Coefficients otherwise remain tunable only when a separately authorized fit runs; this edit grants no data/tuning authority.

## Verification requested and limits

New `tests/lab/phasing-tune-guards.test.ts` uses ONLY isolated synthetic tmpdir files. It spies on actual readFileSync to check no game/replay/position read occurs on metadata refusals; checks current synthetic corpus hash validation without opening any pool/game/replay; checks wrong schema/length/version, fixed parameter membership, source symlinks, duplicate/fresh outputs, and required CLI authority. It does not execute a valid optimization or actual corpus build.

The historical `tests/lab/texel.test.ts` independently reads sealed and old validation files and assumes BankLiquid can fit500. Parent has been warned NOT to run it as M6 acceptance; parent owns its synthetic port/config disposition. This lane does not modify it.

Explicit trust limit: a reviewed caller-pinned metadata allowlist is authority. These checks cannot independently prove a producer's semantic labels honest, detect malicious hard-linked/copied mislabeled data from content alone, or protect against a concurrently hostile filesystem race after path checks. Hash binding rejects byte drift at the authorized read; no claim that arbitrary confidential bytes can be identified without reading them. The source wrappers fail closed on absent/unknown metadata rather than scanning/refused-ID enumeration. Full provenance/source identity and release acceptance remain coordinator work.

## Source pins

- `muju/lab/hard-ai/tune/rows.ts`: `18650ba68ff215e0a1341bba5acbecfecbba22eb305ac9d1e6c6b2da7eb2564e`
- `muju/lab/hard-ai/tune/corpus.ts`: `8294cbcebc1e26e2b447b3c9d6784db62bfa83d29d8f83fef8616a9e7b4bcf6d`
- `muju/lab/hard-ai/tune/texel.ts`: `d081b2e5c4fafb7c2a5f5a4c064605225b506171f64d3f1567411c73cee2c7ba`
- `muju/tests/lab/phasing-tune-guards.test.ts`: `34b95e7bf7c40c82ed6473a138aa5fabc3388b73950de24d5274e7aaff4323ce`

## First diagnostic closure and source correction

Parent executed the preserved first combined M6 row:202passed/20failed, source drift0. Parent reports all46 authored economy checks and the new tuning guard checks passed. `work/m6-first-types-1/command.log` reported explicit local event union annotations missing in the two forecast implementations, which also caused sort-callback implicit-any errors; these are now annotated as EconomyBill|null and CanonicalEconomyBill|null. The synthetic allowlist identity object now preserves its literal featureSchema type with `as const`. No calculation or acceptance threshold changed. No rerun performed in this lane.

Parent extended the lease to `tests/lab/texel.test.ts`. It now uses only synthetic metadata for refusal tests, spies on readFileSync to assert zero dataset IO, and has no pool-file enumerator. The planted statistical model uses free zero-bootstrap `F.PstMine` instead of pinned BankLiquid; all original numerical recovery/loss/integer tolerances remain. Start weights include cash/escrow pins, the free count is75/80, and an actual-fit assertion checks pins2/3/58 stayed exact. Row fixtures carry current schema/version. No test skipped or excluded; actual pool bytes were never read. Valid synthetic fitting is part of the authored test, not an executed corpus/tuning operation in this lane.

Source corrected and paused for root's next combined types/focused execution. `git diff --check` clean. Current pins:

- `muju/src/ai/hard/tables/phasing-economy.ts`: `18ef67e3e71251ae49ab21695bbc115412d03cdcb9c87438bfb6a0ef8609ddef`
- `muju/lab/hard-ai/oracles/phasing-economy.ts`: `e7b7d3a9e523df8d96894e68f3eeb56f2b2ff69404510bcb7de6f087e597054c`
- `muju/tests/lab/phasing-tune-guards.test.ts`: `22a483d96222e67009ecb73cd69553cf368596a661cd87fc91ef5b8841eb8709`
- `muju/tests/lab/texel.test.ts`: `f61d47477b9b3488c93ff48445ad0b04978277eca33577c69c4fd73ebab03eb2`
