import { z } from 'zod';
import { hashJson } from './canonical';
import { caseMembers, decisionUnits, FAMILIES, validateSuiteDocument } from './format';
import type { Family, PhasingCase, PositionRef, SuiteDocument } from './format';

/** The v1 release composition, kept as a NAMED REFERENCE rather than as the
 * validator's law.
 *
 * It used to be both: `caseCount: 225`, `memberCount: 245`, `files: length(6)`
 * and this vector were zod literals, so no manifest with any other composition
 * could be expressed. v2 re-authors and re-composes families, which made the
 * literals the first hard blocker on writing a v2 manifest at all.
 *
 * What the literals bought was that a manifest could not disagree with its own
 * case list. That is preserved exactly, and strengthened: the counts are now
 * CARRIED BY the manifest and cross-checked against the list it ships, in every
 * direction — total, per family, and logical members. A manifest that misstates
 * its own composition is refused as before; a manifest that honestly states a
 * different one is now expressible. */
export const V1_RELEASE_COUNTS: Readonly<Record<Family, number>> = Object.freeze({ tactics: 79, invariants: 20, 'home-mate': 56, economy: 30, 'summon-disruption': 30, 'home-fortify': 10 });
/** @deprecated Read as "the v1 composition"; it no longer constrains a manifest. */
export const RELEASE_COUNTS = V1_RELEASE_COUNTS;
export const V1_CASE_COUNT = 225, V1_MEMBER_COUNT = 245;
export interface SuiteFilePin { family: Family; path: string; sha256: string }
/** `diagnostic` is a measured, reported, NON-GATING invariant pair: it carries a
 * primary metric and its premises still have to hold, but `offered` is 0, so it
 * can never move a family floor. The offered/classification agreement is
 * machine-checked in validateManifestShape below. */
export type CaseClassification = 'decision' | 'coverage' | 'preference' | 'structural' | 'diagnostic';
export const GATING_CLASSIFICATIONS: readonly CaseClassification[] = Object.freeze(['decision', 'preference']);
export interface ManifestCase {
  id: string; family: Family; kind: PhasingCase['kind']; classification: CaseClassification;
  sha256: string; members: PositionRef[]; offered: 0 | 1;
}
export interface ReleaseManifest {
  schema: 'muju-phasing-suite-manifest-v1'; scope: 'release'; caseCount: number; memberCount: number;
  files: SuiteFilePin[]; cases: ManifestCase[];
  /** The declared per-family composition. Optional so the frozen v1 manifest,
   * written before this field existed, still PARSES byte-identically; when it
   * is present every family count is checked against the shipped case list, so
   * a v2 manifest states its own composition and cannot misstate it. */
  familyCounts?: Record<Family, number>;
  /** Canonical relative paths and byte hashes for builder/predicate/validator sources. */
  artifacts: Record<string, string>;
}
export function describeCase(c: PhasingCase): ManifestCase {
  return { id: c.id, family: c.family, kind: c.kind, classification: c.kind === 'invariant-pair' ? c.classification : c.kind === 'macro-decision' ? 'decision' : 'coverage', sha256: hashJson(c), members: caseMembers(c), offered: decisionUnits(c) };
}
export function safeRelativePath(path: string): boolean { return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(part => !part || part === '.' || part === '..'); }
export const REQUIRED_SHARED_ARTIFACTS = ['format.ts', 'canonical.ts', 'predicates.ts', 'manifest.ts', 'score.ts'].map(file => `lab/hard-ai/suites/phasing/${file}`);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const pathSchema = z.string().refine(safeRelativePath, 'unsafe relative path');
const pinSchema = z.object({ family: z.enum(FAMILIES), path: pathSchema, sha256: digest }).strict();
const descriptorSchema = z.object({ id: z.string().min(1), family: z.enum(FAMILIES), kind: z.enum(['macro-decision', 'canonical-coverage', 'invariant-pair']), classification: z.enum(['decision', 'coverage', 'preference', 'structural', 'diagnostic']), sha256: digest, members: z.array(z.object({ id: z.string().min(1), sha256: digest }).strict()).min(1).max(2), offered: z.union([z.literal(0), z.literal(1)]) }).strict();
const count = z.number().int().nonnegative();
const manifestSchema = z.object({ schema: z.literal('muju-phasing-suite-manifest-v1'), scope: z.literal('release'),
  caseCount: count.min(1), memberCount: count.min(1), files: z.array(pinSchema).length(6),
  cases: z.array(descriptorSchema).min(1), familyCounts: z.object(Object.fromEntries(FAMILIES.map(f => [f, count])) as Record<Family, typeof count>).strict().optional(),
  artifacts: z.record(pathSchema, digest) }).strict();

/** No subset/reduced denominator switch exists here. Tests use describeCase directly. */
export function buildReleaseManifest(documents: SuiteDocument[], files: SuiteFilePin[], artifacts: Record<string, string>): ReleaseManifest {
  const docs = documents.map(validateSuiteDocument);
  if (docs.length !== 6 || new Set(docs.map(d => d.family)).size !== 6) throw new Error('release requires all six unique families');
  // The composition is READ OFF the documents instead of being asserted against
  // a pinned vector, and then written into the manifest, where
  // validateManifestShape checks it back against the same case list. A family
  // that loses or gains a case is expressible; a manifest that lies about it
  // is not.
  const familyCounts = Object.fromEntries(FAMILIES.map(family =>
    [family, docs.find(d => d.family === family)!.cases.length])) as Record<Family, number>;
  for (const family of FAMILIES) if (!familyCounts[family]) throw new Error(`release requires at least one case in ${family}`);
  const cases = docs.flatMap(d => d.cases), ids = cases.map(c => c.id);
  if (new Set(ids).size !== ids.length) throw new Error('release case IDs must be globally unique');
  // Content laws, stated as the laws they actually are rather than as v1's
  // counts. Both are strictly no weaker on v1 (where N = 20 and each half is
  // 28) and they are the form v2 is authored under: the invariant pairs still
  // enumerate a contiguous 1..N with no repeats, and every home-mate rescue
  // still has its rotated-black invader twin.
  const pairs = cases.filter(c => c.kind === 'invariant-pair');
  const numbers = new Set(pairs.map(c => c.invariant));
  if (!pairs.length || numbers.size !== pairs.length || [...numbers].some(n => !Number.isInteger(n) || n < 1 || n > pairs.length))
    throw new Error(`release must enumerate invariants 1..${pairs.length} exactly once each`);
  const homes = cases.filter(c => c.family === 'home-mate');
  const rescues = homes.filter(c => c.homeFraming === 'rescue').length, invaders = homes.filter(c => c.homeFraming === 'invader').length;
  if (!rescues || rescues !== invaders || rescues + invaders !== homes.length)
    throw new Error(`home-mate requires equal non-empty rescue and invader framings (rescue ${rescues}, invader ${invaders} of ${homes.length})`);
  const descriptors = cases.map(describeCase).sort((a, b) => a.id.localeCompare(b.id));
  const caseCount = descriptors.length, memberCount = descriptors.reduce((n, c) => n + c.members.length, 0);
  return validateManifestShape({ schema: 'muju-phasing-suite-manifest-v1', scope: 'release', caseCount, memberCount,
    files: [...files].sort((a, b) => a.family.localeCompare(b.family)), cases: descriptors, familyCounts, artifacts });
}
export function validateManifestShape(input: unknown): ReleaseManifest {
  const manifest = manifestSchema.parse(input);
  if (new Set(manifest.files.map(f => f.family)).size !== 6 || new Set(manifest.files.map(f => f.path)).size !== 6) throw new Error('manifest file identities duplicate');
  // A manifest must agree with the case list it ships, in every direction. This
  // is what the removed zod literals bought, kept whole and now applied to a
  // composition the manifest declares rather than one the validator dictates.
  const ids = new Set(manifest.cases.map(c => c.id)), members = manifest.cases.reduce((n, c) => n + c.members.length, 0);
  if (ids.size !== manifest.cases.length) throw new Error('manifest case IDs duplicate');
  if (manifest.cases.length !== manifest.caseCount) throw new Error(`manifest declares caseCount ${manifest.caseCount} but ships ${manifest.cases.length} cases`);
  if (members !== manifest.memberCount) throw new Error(`manifest declares memberCount ${manifest.memberCount} but ships ${members} logical members`);
  for (const path of REQUIRED_SHARED_ARTIFACTS) if (!manifest.artifacts[path]) throw new Error(`missing shared artifact pin ${path}`);
  const actualPerFamily = Object.fromEntries(FAMILIES.map(family => [family, manifest.cases.filter(c => c.family === family).length])) as Record<Family, number>;
  if (FAMILIES.reduce((n, family) => n + actualPerFamily[family], 0) !== manifest.caseCount) throw new Error('manifest carries a case outside the six families');
  // Every family is pinned to one suite file, so a family with a file and no
  // cases is incoherent — and an empty family has an empty denominator, which
  // would make its floor vacuous. The removed per-family literals ruled this out
  // as a side effect; it is ruled out on purpose now.
  for (const family of FAMILIES) if (!actualPerFamily[family]) throw new Error(`manifest carries no ${family} cases; every family must offer a non-empty denominator`);
  if (manifest.familyCounts) {
    for (const family of FAMILIES)
      if ((manifest.familyCounts[family] ?? 0) !== actualPerFamily[family])
        throw new Error(`manifest declares ${manifest.familyCounts[family] ?? 0} ${family} cases but ships ${actualPerFamily[family]}`);
  }
  for (const c of manifest.cases) {
    if (c.kind === 'invariant-pair' ? c.family !== 'invariants' || c.members.length !== 2 || !['preference', 'structural', 'diagnostic'].includes(c.classification) : c.family === 'invariants' || c.members.length !== 1 || c.classification !== (c.kind === 'macro-decision' ? 'decision' : 'coverage')) throw new Error('manifest case classification mismatch');
    // A diagnostic pair is measured and reported but offers nothing, so this is
    // what keeps it out of every family denominator.
    if (c.offered !== (GATING_CLASSIFICATIONS.includes(c.classification) ? 1 : 0)) throw new Error('manifest score membership mismatch');
  }
  return manifest;
}
/** Caller separately verifies byte pins before parsing. This verifies the complete logical graph. */
export function validateReleaseManifest(input: unknown, documents: SuiteDocument[]): ReleaseManifest {
  const manifest = validateManifestShape(input), expected = buildReleaseManifest(documents, manifest.files, manifest.artifacts);
  if (hashJson(manifest.cases) !== hashJson(expected.cases)) throw new Error('manifest differs from loaded case graph');
  return manifest;
}
