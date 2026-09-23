// @vitest-environment node
/**
 * The COMMITTED v3 release bundle must still load against THIS tree.
 *
 * Added 2026-09-22 after the Gate-0 measurement of the phasing-only cutover was
 * refused before a single case ran. `artifactPins()` (`suites/phasing/run.ts`)
 * hashes every `.ts` under `lab/hard-ai/suites/phasing`, every `.json` under its
 * `author-inputs/`, **and `muju/package.json`**, and freezes that map into the
 * release manifest. Deleting two dead `package.json` script lines therefore
 * moved a pin and made `loadBundle` reject the whole bundle
 * (`Superseded bundle: … (changed package.json)`), and nothing in the repo
 * noticed: `suites-phasing-runner.test.ts` and `suites-phasing-v2-authoring.test.ts`
 * author throwaway bundles into temp directories, so no test had ever opened the
 * committed manifest.
 *
 * This file closes that hole. It goes through `loadBundle` — the same exported
 * loader `measure.ts:336` calls, and the first thing `measureBundle` does — so a
 * `package.json` or suite-source edit that would void the release suite fails
 * here, in `npm test`, instead of at the next measurement.
 *
 * Scope, deliberately: this is a LOAD check, not a re-validation of the case
 * evidence. `loadBundle` already verifies every artifact pin, every suite
 * document's byte pin, each document's shape and family, and the manifest's own
 * case/member accounting (`validateReleaseManifest`) — which is the whole of what
 * a `package.json` or suite edit can break. `validateBundle()`, which additionally
 * replays all 225 author-evidence checks and the free-win veto, measured ~110 s on
 * this box on 2026-09-22; the measurement path runs it before any engine work,
 * and the runner test runs it on a freshly authored bundle, so paying it again in
 * every `npm test` would nearly double the suite's wall time for no extra
 * coverage of this failure mode. No engine, search or evaluation runs here.
 *
 * 2026-09-22 (p3 retune, `docs/changes/2026-09-22-p3-retune-SPEC.md` §6, lane S):
 * `fixtures/v2` (`muju-phasing-2`, the pre-rename catalogue) is superseded —
 * it can no longer bind against this tree (renamed catalogue bytes AND the
 * `muju-phasing-3` kill-clock rules revision). `fixtures/v3-bundle` is the
 * re-authored replacement: same 225 cases / 245 members / declarative delta
 * (`author-inputs/new-candidates-v2.json`), freshly derived under the current
 * catalogue and `muju-phasing-3`. Distinct from the pre-existing, unrelated
 * `fixtures/v3/floor-contract.json` (a 2026-09-21 phasing-only-cutover
 * re-declaration of the OLD v2 manifest's floors against a new engine build —
 * it names the v2 manifest hash, not this one, and this lane does not touch
 * it). Do not confuse the two "v3"s.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactPins, loadBundle, MUJU_ROOT } from '../../lab/hard-ai/suites/phasing/run';
import { hashJson, sha256 } from '../../lab/hard-ai/suites/phasing/canonical';
import { FAMILIES } from '../../lab/hard-ai/suites/phasing/format';

// Measured under 2 s on this box (225 cases, 23 artifact pins, 6 document pins);
// the repo-wide floor is 10 s, which has no headroom under a loaded box.
vi.setConfig({ testTimeout: 60_000 });

const MANIFEST = join(MUJU_ROOT, 'lab/hard-ai/suites/phasing/fixtures/v3-bundle/manifest.json');
/** `hashJson(manifest)` for `fixtures/v3-bundle/manifest.json`, authored
 * 2026-09-22 by `run.ts author-v2 --out fixtures/v3-bundle` under
 * `muju-phasing-3` and the renamed catalogue. Distinct from the v2 manifest
 * hash (`454fe137…`) that `fixtures/v3/floor-contract.json` and the
 * measurement ledger still name historically. */
const V3_MANIFEST_SHA256 = 'da3589338557f74329c72fc8a231967a2f3a89656b1405f573a66a0dfbaac6e9';

/**
 * The `lab/hard-ai/suites/phasing/**` files the 2026-09-22 kill-clock change
 * (`muju-phasing-3`, `docs/changes/2026-09-22-kill-clock-SPEC.md` §3) forced —
 * same declared-set pattern as `tests/lab/phasing-evidence.test.ts`'s
 * `A4_HARNESS_EDITS`: the pin below stays strict on everything NOT named here,
 * so an undeclared suite-source edit still fails loudly.
 *
 * Empty for `fixtures/v3-bundle`: unlike the frozen `fixtures/v2` bundle (whose
 * manifest predates the kill-clock and rename source edits and therefore had
 * to declare them as expected drift), `v3-bundle` was authored FROM the
 * current tree, after both changes landed — its artifact pins already match
 * source exactly, so there is nothing to declare. Kept as a named allow-list,
 * not deleted, so the next suite-source edit after this bundle is committed
 * still has to be declared here rather than silently passing.
 */
const KILL_CLOCK_ARTIFACT_EDITS: Record<string, string> = {};

describe('committed Phasing v3 release bundle', () => {
  it('keeps every artifact pin of the committed v3 bundle intact, except any declared edits', () => {
    // Name the offending pin BEFORE loadBundle throws its bundle-wide message,
    // so a failure here says which file's bytes moved rather than "artifact
    // bytes differ". package.json is called out by name because it is the pin
    // that is easiest to move for reasons that have nothing to do with the
    // suite.
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { artifacts: Record<string, string> };
    const current = artifactPins();
    const added = Object.keys(current).filter(path => !(path in manifest.artifacts));
    const removed = Object.keys(manifest.artifacts).filter(path => !(path in current));
    const changed = Object.keys(manifest.artifacts).filter(path => path in current && current[path] !== manifest.artifacts[path]);
    for (const path of changed) expect(KILL_CLOCK_ARTIFACT_EDITS[path], `${path}: undeclared artifact drift`).toBeDefined();
    // Exactly the declared set moved: nothing silently added, nothing declared
    // that did not actually change.
    expect({ added, removed, changed: changed.sort() }).toEqual({
      added: [], removed: [], changed: Object.keys(KILL_CLOCK_ARTIFACT_EDITS).sort(),
    });
    expect(current['package.json']).toBe(manifest.artifacts['package.json']);
  });

  // Un-skipped 2026-09-22 (p3 retune, lane S): `fixtures/v3-bundle` was
  // authored against this tree's current `muju-phasing-3` rules and renamed
  // catalogue, so `loadBundle` succeeds without the source-binding mismatch
  // that superseded `fixtures/v2`.
  it('still loads against the live tree through the measurement path loader', () => {
    const { manifest: loaded, documents, identity } = loadBundle(MANIFEST);
    expect(identity.manifestSha256).toBe(V3_MANIFEST_SHA256);
    expect(hashJson(loaded)).toBe(V3_MANIFEST_SHA256);
    expect(identity.manifestFileSha256).toBe(sha256(readFileSync(MANIFEST)));
    expect(documents).toHaveLength(FAMILIES.length);
    expect(documents.map(doc => doc.family).sort()).toEqual([...FAMILIES].sort());
    // The manifest's own accounting, which `validateReleaseManifest` has just
    // checked against the six documents it pins.
    expect(loaded.caseCount).toBe(225);
    expect(loaded.memberCount).toBe(245);
    expect(identity.files).toHaveLength(FAMILIES.length);
  });
});
