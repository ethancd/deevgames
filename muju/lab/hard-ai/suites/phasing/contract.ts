/** Preregistered engineering targets; never estimated from measured answers.
 *
 * v1 contracts state minimumEarned directly and pin only the manifest. v2
 * contracts state an ALLOWED-MISS budget per family instead, and pin the
 * engine source and weights as well, so a floor cannot be met by swapping the
 * build underneath it. minimumEarned is then derived from the manifest's own
 * offered counts rather than asserted, which is what makes the v2 rule
 * ("the same allowed-miss count per family as v1") machine-checked instead of
 * a sentence in a document.
 */
import { z } from 'zod';
import { hashJson } from './canonical';
import { FAMILIES } from './format';
import type { Family } from './format';
import type { ReleaseManifest } from './manifest';
import { aggregate, type SuiteResult } from './score';

/** The v1 allowed-miss vector, recovered from the frozen v1 preregistration
 * (offered minus minimumEarned per family). v2 floors must reuse it exactly;
 * see M5-FLOOR-PREREGISTRATION-v2.md for why an outcome-free rule is required
 * once the v1 outcomes have been seen. */
export const V1_ALLOWED_MISS: Readonly<Record<Family, number>> = Object.freeze({
  tactics: 6, invariants: 1, 'home-mate': 0, economy: 0, 'summon-disruption': 1, 'home-fortify': 0,
});

interface CommonContract {
  manifestSha256: string; declaredAt: string;
  seed: number; profile: 'desktop'; rationale: string;
  coverage: 'all'; fallback: 'veto'; illegalOrDivergent: 'veto'; unresolvedProof: 'veto';
}
export interface FloorContractV1 extends CommonContract {
  schema: 'muju-phasing-suite-floor-v1'; minimumEarned: Record<Family, number>;
}
export interface FloorContractV2 extends CommonContract {
  schema: 'muju-phasing-suite-floor-v2';
  /** Engine build the floors are declared against; the measurement refuses any
   * other build rather than crediting it against these floors. */
  engineSourceSha256: string; weightsSha256: string;
  /** Misses this family may absorb. minimumEarned is derived, never asserted. */
  allowedMiss: Record<Family, number>;
}
export type FloorContract = FloorContractV1 | FloorContractV2;

const natural = z.number().int().nonnegative();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const perFamily = z.object({ tactics: natural, invariants: natural, 'home-mate': natural, economy: natural, 'summon-disruption': natural, 'home-fortify': natural }).strict();
const common = { manifestSha256: digest, declaredAt: z.string().datetime(), seed: natural.max(0xffffffff), profile: z.literal('desktop'), rationale: z.string().min(40),
  coverage: z.literal('all'), fallback: z.literal('veto'), illegalOrDivergent: z.literal('veto'), unresolvedProof: z.literal('veto') };
const shape = z.union([
  z.object({ ...common, schema: z.literal('muju-phasing-suite-floor-v1'), minimumEarned: perFamily }).strict(),
  z.object({ ...common, schema: z.literal('muju-phasing-suite-floor-v2'), engineSourceSha256: digest, weightsSha256: digest, allowedMiss: perFamily }).strict(),
]);

export const offeredBy = (manifest: ReleaseManifest, family: Family): number =>
  manifest.cases.filter(c => c.family === family).reduce((n, c) => n + c.offered, 0);

/** The floor actually enforced for a family, whichever contract version. */
export function minimumEarnedFor(contract: FloorContract, manifest: ReleaseManifest, family: Family): number {
  if (contract.schema === 'muju-phasing-suite-floor-v1') return contract.minimumEarned[family];
  return offeredBy(manifest, family) - contract.allowedMiss[family];
}

export function validateFloorContract(input: unknown, manifest: ReleaseManifest): FloorContract {
  const contract = shape.parse(input);
  if (contract.manifestSha256 !== hashJson(manifest)) throw new Error('Floor contract belongs to a different suite manifest');
  for (const family of FAMILIES) {
    const offered = offeredBy(manifest, family);
    if (contract.schema === 'muju-phasing-suite-floor-v2' && contract.allowedMiss[family] !== V1_ALLOWED_MISS[family])
      throw new Error(`v2 floor for ${family} does not reuse the v1 allowed-miss budget (${V1_ALLOWED_MISS[family]}); v2 floors may not be set from observed outcomes`);
    const minimum = minimumEarnedFor(contract, manifest, family);
    if (minimum < 0) throw new Error(`Invalid preregistered floor ${family}: allowed miss exceeds the offered count`);
    if (minimum > offered || offered > 0 && minimum === 0) throw new Error(`Invalid preregistered floor ${family}`);
  }
  return contract;
}

/** The engine build a v2 contract preregisters. v1 contracts pin no build, so
 * they can only be measured against the engine identity recorded at the time. */
export function assertContractBuild(contract: FloorContract, identity: { sourceSha256: string; weightsSha256: string }): void {
  if (contract.schema !== 'muju-phasing-suite-floor-v2') return;
  if (contract.engineSourceSha256 !== identity.sourceSha256) throw new Error('Measured engine source does not match the preregistered floor contract build');
  if (contract.weightsSha256 !== identity.weightsSha256) throw new Error('Measured weights do not match the preregistered floor contract weights');
}

export function assessFloors(contract: FloorContract, manifest: ReleaseManifest, result: SuiteResult) {
  validateFloorContract(contract, manifest);
  if (result.manifestSha256 !== contract.manifestSha256) throw new Error('Measured result and floor manifest differ');
  if (hashJson(aggregate(manifest, result.results)) !== hashJson(result)) throw new Error('Suite summary does not match its fixed case results');
  const families = FAMILIES.map(family => {
    const cases = manifest.cases.filter(c => c.family === family), ids = new Set(cases.map(c => c.id));
    const offered = cases.reduce((n, c) => n + c.offered, 0), earned = result.results.filter(r => ids.has(r.id)).reduce((n, r) => n + r.earned, 0);
    const minimum = minimumEarnedFor(contract, manifest, family);
    return { family, offered, earned, minimum, pass: earned >= minimum };
  });
  const correctness = result.valid && result.complete && result.coverage.pass === result.coverage.expected;
  return { schema: 'muju-phasing-suite-floor-result-v1', contractVersion: contract.schema, contractSha256: hashJson(contract), manifestSha256: contract.manifestSha256,
    engineIdentity: result.engineIdentity, correctness, pass: correctness && families.every(f => f.pass), families,
    releaseQualification: 'suite-only; other migration and release gates remain required' };
}
