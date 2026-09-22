// @vitest-environment node
/** The two schema pins that made a v2 bundle INEXPRESSIBLE, and their replacements.
 *
 * Both were found while scoping the v2 authoring (M5-FLOOR-PREREGISTRATION-v2,
 * "Authoring status"), and both are the same mistake in two places: a fact about
 * the v1 release written into the validator as a literal, where a later release
 * cannot restate it.
 *
 *  1. `manifest.ts` pinned `caseCount: 225`, `memberCount: 245`,
 *     `cases: length(225)` and a frozen per-family vector as zod literals, so no
 *     manifest with any other composition parsed at all. v2 re-authors and
 *     re-composes families.
 *  2. `rulesVersion` was the literal `'muju-phasing-1'` in the binding type, in
 *     the zod schema, in `sourceBinding` and again in the engine adapter's
 *     position gate. v2 is authored under `muju-phasing-2` — the 20-ply
 *     inactivity clock, reset only by a capture.
 *
 * Every test below fails on the pre-change code: the count tests throw a zod
 * literal mismatch instead of validating or instead of reporting the intended
 * refusal, and the version tests cannot even name `muju-phasing-2`. Verified by
 * re-running this file against the previous `manifest.ts` / `canonical.ts` /
 * `format.ts` / `engine-adapter.ts`.
 *
 * Nothing here weakens a check. The counts a manifest may now choose are
 * cross-checked against the case list it actually ships, in every direction,
 * which is what the literals bought; and a widened `rulesVersion` still has to
 * pass `verifySourceBinding`, which demands the revision THIS worktree
 * implements.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';
import { INACTIVITY_LIMIT, LEGACY_INACTIVITY_LIMIT } from '../../src/game/inactivity';
import {
  CURRENT_RULES_VERSION, currentRulesVersion, hashJson, RULES_VERSIONS, sourceBinding, verifySourceBinding,
} from '../../lab/hard-ai/suites/phasing/canonical';
import { FAMILIES } from '../../lab/hard-ai/suites/phasing/format';
import {
  REQUIRED_SHARED_ARTIFACTS, V1_CASE_COUNT, V1_MEMBER_COUNT, V1_RELEASE_COUNTS, validateManifestShape,
} from '../../lab/hard-ai/suites/phasing/manifest';
import { aggregate } from '../../lab/hard-ai/suites/phasing/score';
import type { Family } from '../../lab/hard-ai/suites/phasing/format';
import type { ManifestCase, ReleaseManifest } from '../../lab/hard-ai/suites/phasing/manifest';

const V1_MANIFEST = fileURLToPath(new URL('../../lab/hard-ai/suites/phasing/fixtures/v1/manifest.json', import.meta.url));

/** A syntactically complete manifest of any composition. Invariant pairs carry
 * two members, so `memberCount` is not simply the case count. */
function manifestOf(counts: Record<Family, number>, overrides: Record<string, unknown> = {}): unknown {
  const cases: ManifestCase[] = FAMILIES.flatMap(family => Array.from({ length: counts[family] }, (_, i) => ({
    id: `${family}-${i}`, family,
    kind: family === 'invariants' ? 'invariant-pair' as const : 'macro-decision' as const,
    classification: family === 'invariants' ? 'preference' as const : 'decision' as const,
    sha256: hashJson([family, i]),
    members: Array.from({ length: family === 'invariants' ? 2 : 1 }, (_, j) => ({ id: `${family}-${i}-${j}`, sha256: hashJson(j) })),
    offered: 1 as const,
  })));
  return {
    schema: 'muju-phasing-suite-manifest-v1', scope: 'release',
    caseCount: cases.length, memberCount: cases.reduce((n, c) => n + c.members.length, 0),
    cases, familyCounts: { ...counts },
    files: FAMILIES.map(family => ({ family, path: `${family}.json`, sha256: 'a'.repeat(64) })),
    artifacts: Object.fromEntries(REQUIRED_SHARED_ARTIFACTS.map(p => [p, 'b'.repeat(64)])),
    ...overrides,
  };
}
/** A plausible v2 composition: the nine defective disruption roots minus the one
 * that may be dropped, and three invariant pairs demoted to diagnostics (which
 * changes what is OFFERED, not how many cases exist). */
const V2_COUNTS: Record<Family, number> = { ...V1_RELEASE_COUNTS, 'summon-disruption': 29 };

describe('a manifest states its own composition instead of matching pinned literals', () => {
  it('accepts a composition that is not v1, which the zod literals made unrepresentable', () => {
    const manifest = validateManifestShape(manifestOf(V2_COUNTS)) as ReleaseManifest;
    expect(manifest.caseCount).toBe(V1_CASE_COUNT - 1);
    expect(manifest.cases.filter(c => c.family === 'summon-disruption')).toHaveLength(29);
    expect(manifest.familyCounts).toEqual(V2_COUNTS);
    // The member total moves with the case list rather than being pinned at 245.
    expect(manifest.memberCount).toBe(V1_MEMBER_COUNT - 1);
  });

  it('still refuses a manifest that disagrees with the case list it ships', () => {
    // This is the whole of what the removed literals bought, kept in every
    // direction: total, logical members, and per family.
    expect(() => validateManifestShape(manifestOf(V2_COUNTS, { caseCount: 225 })))
      .toThrow(/declares caseCount 225 but ships 224/);
    expect(() => validateManifestShape(manifestOf(V2_COUNTS, { memberCount: 245 })))
      .toThrow(/declares memberCount 245 but ships 244/);
    expect(() => validateManifestShape(manifestOf(V2_COUNTS, { familyCounts: { ...V2_COUNTS, tactics: 78 } })))
      .toThrow(/declares 78 tactics cases but ships 79/);
  });

  it('refuses a manifest with duplicate case IDs however its counts are declared', () => {
    const manifest = manifestOf(V2_COUNTS) as { cases: ManifestCase[] };
    manifest.cases[1] = { ...manifest.cases[1], id: manifest.cases[0].id };
    expect(() => validateManifestShape(manifest)).toThrow(/case IDs duplicate/);
  });

  it('refuses a family with an empty denominator, which the old literals ruled out by accident', () => {
    // Each family is pinned to one suite file, and an empty family's floor is
    // vacuous. Caught by this test against the first cut of the generalisation,
    // which checked only that the declared counts matched the shipped list.
    expect(() => validateManifestShape(manifestOf({ ...V2_COUNTS, economy: 0 })))
      .toThrow(/carries no economy cases/);
  });

  it('still parses the frozen v1 manifest, which predates the declared composition', () => {
    // fixtures/v1 is byte-frozen and carries no `familyCounts`; it must keep
    // parsing, and its self-declared counts must still be checked.
    const v1 = validateManifestShape(JSON.parse(readFileSync(V1_MANIFEST, 'utf8'))) as ReleaseManifest;
    expect(v1.caseCount).toBe(V1_CASE_COUNT);
    expect(v1.memberCount).toBe(V1_MEMBER_COUNT);
    expect(v1.familyCounts).toBeUndefined();
    for (const family of FAMILIES) expect(v1.cases.filter(c => c.family === family)).toHaveLength(V1_RELEASE_COUNTS[family]);
  });

  it('sizes the scored result from the manifest rather than from a pinned 225', () => {
    const manifest = validateManifestShape(manifestOf(V2_COUNTS)) as ReleaseManifest;
    const out = aggregate(manifest, []);
    expect(out.expectedCases).toBe(V1_CASE_COUNT - 1);
    expect(out.complete).toBe(false);
    // A 224-case bundle that returned 224 rows used to be reported incomplete
    // because `seen.size === 225` could never hold.
    const all = manifest.cases.map(c => ({ schema: 'muju-phasing-case-result-v1' as const, id: c.id, caseSha256: c.sha256,
      kind: c.kind, offered: 1 as const, earned: 0 as const, status: 'fail' as const, failureCodes: ['predicate-miss'], predicates: [],
      engineIdentity: 'fixture-engine' }));
    const full = aggregate(manifest, all);
    expect(full.complete).toBe(true);
    expect(full.receivedCases).toBe(V1_CASE_COUNT - 1);
  });
});

describe('the authored rules revision is derived, not pinned', () => {
  // `muju-phasing-3` (owner decision 2026-09-22, the KILL CLOCK) brought the
  // limit back to 10 — `muju-phasing-1`'s own number — so the limit alone no
  // longer names a revision; the VERDICT (mined-total vs. an automatic draw)
  // is now load-bearing too.
  it('names muju-phasing-3 in this worktree, because the clock resolves on mined totals at ten plies', () => {
    expect(INACTIVITY_LIMIT).toBe(10);
    expect(CURRENT_RULES_VERSION).toBe('muju-phasing-3');
    expect(currentRulesVersion(LEGACY_INACTIVITY_LIMIT, 'draw')).toBe('muju-phasing-2');
    expect(currentRulesVersion(INACTIVITY_LIMIT, 'draw')).toBe('muju-phasing-1');
    expect(RULES_VERSIONS).toEqual(['muju-phasing-1', 'muju-phasing-2', 'muju-phasing-3']);
  });

  it('refuses a (limit, verdict) pair no revision is defined for, rather than guessing one', () => {
    expect(() => currentRulesVersion(13)).toThrow(/No Phasing rules revision is defined/);
    // The archived twenty-ply limit under a mined-total verdict never shipped
    // as any revision — `muju-phasing-2` was twenty plies and drew, full stop.
    expect(() => currentRulesVersion(LEGACY_INACTIVITY_LIMIT, 'mined-total')).toThrow(/No Phasing rules revision is defined/);
  });

  it('mints a binding under the current revision and verifies it', () => {
    const binding = sourceBinding(DEFAULT_RULES);
    expect(binding.rulesVersion).toBe('muju-phasing-3');
    expect(() => verifySourceBinding(binding)).not.toThrow();
  });

  it('lets a v1 binding PARSE but not VERIFY, which is the intended split', () => {
    // The v1 documents must keep loading byte-identically; they must not be
    // measurable as if they described this tree's rules.
    const v1Binding = sourceBinding(DEFAULT_RULES, 'muju-phasing-1');
    expect(v1Binding.rulesVersion).toBe('muju-phasing-1');
    expect(() => verifySourceBinding(v1Binding)).toThrow(/canonical source binding mismatch/);
  });
});
