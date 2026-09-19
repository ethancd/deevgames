import { z } from 'zod';
import { hashJson } from './canonical';
import { caseMembers, decisionUnits, FAMILIES, validateSuiteDocument } from './format';
import type { Family, PhasingCase, PositionRef, SuiteDocument } from './format';

export const RELEASE_COUNTS: Readonly<Record<Family, number>> = Object.freeze({ tactics: 79, invariants: 20, 'home-mate': 56, economy: 30, 'summon-disruption': 30, 'home-fortify': 10 });
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
  schema: 'muju-phasing-suite-manifest-v1'; scope: 'release'; caseCount: 225; memberCount: 245;
  files: SuiteFilePin[]; cases: ManifestCase[];
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
const manifestSchema = z.object({ schema: z.literal('muju-phasing-suite-manifest-v1'), scope: z.literal('release'), caseCount: z.literal(225), memberCount: z.literal(245), files: z.array(pinSchema).length(6), cases: z.array(descriptorSchema).length(225), artifacts: z.record(pathSchema, digest) }).strict();

/** No subset/reduced denominator switch exists here. Tests use describeCase directly. */
export function buildReleaseManifest(documents: SuiteDocument[], files: SuiteFilePin[], artifacts: Record<string, string>): ReleaseManifest {
  const docs = documents.map(validateSuiteDocument);
  if (docs.length !== 6 || new Set(docs.map(d => d.family)).size !== 6) throw new Error('release requires all six unique families');
  for (const family of FAMILIES) if (docs.find(d => d.family === family)?.cases.length !== RELEASE_COUNTS[family]) throw new Error(`release count mismatch ${family}`);
  const cases = docs.flatMap(d => d.cases), ids = cases.map(c => c.id);
  if (new Set(ids).size !== ids.length) throw new Error('release case IDs must be globally unique');
  const pairs = cases.filter(c => c.kind === 'invariant-pair');
  if (pairs.length !== 20 || new Set(pairs.map(c => c.invariant)).size !== 20) throw new Error('release must enumerate invariants 1..20');
  const homes = cases.filter(c => c.family === 'home-mate');
  if (homes.filter(c => c.homeFraming === 'rescue').length !== 28 || homes.filter(c => c.homeFraming === 'invader').length !== 28) throw new Error('home-mate requires 28 rescue and 28 invader framings');
  const descriptors = cases.map(describeCase).sort((a, b) => a.id.localeCompare(b.id));
  if (descriptors.length !== 225 || descriptors.reduce((n, c) => n + c.members.length, 0) !== 245) throw new Error('release requires 225 cases / 245 logical members');
  return validateManifestShape({ schema: 'muju-phasing-suite-manifest-v1', scope: 'release', caseCount: 225, memberCount: 245, files: [...files].sort((a, b) => a.family.localeCompare(b.family)), cases: descriptors, artifacts });
}
export function validateManifestShape(input: unknown): ReleaseManifest {
  const manifest = manifestSchema.parse(input);
  if (new Set(manifest.files.map(f => f.family)).size !== 6 || new Set(manifest.files.map(f => f.path)).size !== 6) throw new Error('manifest file identities duplicate');
  if (new Set(manifest.cases.map(c => c.id)).size !== 225 || manifest.cases.reduce((n, c) => n + c.members.length, 0) !== 245) throw new Error('manifest membership mismatch');
  for (const path of REQUIRED_SHARED_ARTIFACTS) if (!manifest.artifacts[path]) throw new Error(`missing shared artifact pin ${path}`);
  for (const family of FAMILIES) if (manifest.cases.filter(c => c.family === family).length !== RELEASE_COUNTS[family]) throw new Error(`manifest family count mismatch ${family}`);
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
