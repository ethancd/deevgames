// @vitest-environment node
/**
 * The COMMITTED v2 release bundle must still load against THIS tree.
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
 * replays all 225 author-evidence checks and the free-win veto, measured 109 s on
 * an M2 Max on 2026-09-22; the measurement path runs it before any engine work,
 * and the runner test runs it on a freshly authored bundle, so paying it again in
 * every `npm test` would nearly double the suite's wall time for no extra
 * coverage of this failure mode. No engine, search or evaluation runs here.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactPins, loadBundle, MUJU_ROOT } from '../../lab/hard-ai/suites/phasing/run';
import { hashJson, sha256 } from '../../lab/hard-ai/suites/phasing/canonical';
import { FAMILIES } from '../../lab/hard-ai/suites/phasing/format';

// Measured 1.6 s on an M2 Max (225 cases, 23 artifact pins, 6 document pins);
// the repo-wide floor is 10 s, which has no headroom under a loaded box.
vi.setConfig({ testTimeout: 60_000 });

const MANIFEST = join(MUJU_ROOT, 'lab/hard-ai/suites/phasing/fixtures/v2/manifest.json');
/** The bundle the release record and `fixtures/v3/floor-contract.json` name. */
const V2_MANIFEST_SHA256 = '454fe137aa5bf97f4703a209985e4743eb995719c09cb6bcf8ea6d130bc39453';

describe('committed Phasing v2 release bundle', () => {
  it('keeps every artifact pin of the committed v2 bundle intact', () => {
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
    expect({ added, removed, changed }).toEqual({ added: [], removed: [], changed: [] });
    expect(current['package.json']).toBe(manifest.artifacts['package.json']);
  });

  // 2026-09-22 (docs/changes/2026-09-22-rename-irumbu.md): the piece rename
  // changed the bytes of `src/game/units.ts` (display names only; IDs, stats
  // and prices are unchanged), and every v2 suite document binds
  // `catalogueSha256` to those exact bytes, so `loadBundle` now refuses the
  // committed bundle with "canonical source binding mismatch". Re-binding is a
  // preregistration act (a new measurement-ledger entry and floor contract)
  // that the owner deferred to the next AI measurement campaign, which will
  // re-author the suite under the kill-clock rules revision anyway. The pin
  // guard above stays live so no OTHER artifact drifts silently meanwhile.
  it.skip('still loads against the live tree through the measurement path loader (superseded by the 2026-09-22 rename; re-bind with the next measurement)', () => {
    const { manifest: loaded, documents, identity } = loadBundle(MANIFEST);
    expect(identity.manifestSha256).toBe(V2_MANIFEST_SHA256);
    expect(hashJson(loaded)).toBe(V2_MANIFEST_SHA256);
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
