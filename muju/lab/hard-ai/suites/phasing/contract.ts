/** Preregistered engineering targets; never estimated from measured answers. */
import { z } from 'zod';
import { hashJson } from './canonical';
import { FAMILIES } from './format';
import type { Family } from './format';
import type { ReleaseManifest } from './manifest';
import { aggregate, type SuiteResult } from './score';

export interface FloorContract {
  schema: 'muju-phasing-suite-floor-v1'; manifestSha256: string; declaredAt: string;
  seed: number; profile: 'desktop'; rationale: string;
  minimumEarned: Record<Family, number>;
  coverage: 'all'; fallback: 'veto'; illegalOrDivergent: 'veto'; unresolvedProof: 'veto';
}
const natural = z.number().int().nonnegative();
const shape = z.object({ schema: z.literal('muju-phasing-suite-floor-v1'), manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  declaredAt: z.string().datetime(), seed: natural.max(0xffffffff), profile: z.literal('desktop'), rationale: z.string().min(40),
  minimumEarned: z.object({ tactics: natural, invariants: natural, 'home-mate': natural, economy: natural, 'summon-disruption': natural, 'home-fortify': natural }).strict(),
  coverage: z.literal('all'), fallback: z.literal('veto'), illegalOrDivergent: z.literal('veto'), unresolvedProof: z.literal('veto'),
}).strict();
export function validateFloorContract(input: unknown, manifest: ReleaseManifest): FloorContract {
  const contract = shape.parse(input);
  if (contract.manifestSha256 !== hashJson(manifest)) throw new Error('Floor contract belongs to a different suite manifest');
  for (const family of FAMILIES) {
    const offered = manifest.cases.filter(c => c.family === family).reduce((n, c) => n + c.offered, 0);
    const minimum = contract.minimumEarned[family];
    if (minimum > offered || offered > 0 && minimum === 0) throw new Error(`Invalid preregistered floor ${family}`);
  }
  return contract;
}
export function assessFloors(contract: FloorContract, manifest: ReleaseManifest, result: SuiteResult) {
  validateFloorContract(contract, manifest);
  if (result.manifestSha256 !== contract.manifestSha256) throw new Error('Measured result and floor manifest differ');
  if (hashJson(aggregate(manifest, result.results)) !== hashJson(result)) throw new Error('Suite summary does not match its fixed case results');
  const families = FAMILIES.map(family => {
    const cases = manifest.cases.filter(c => c.family === family), ids = new Set(cases.map(c => c.id));
    const offered = cases.reduce((n, c) => n + c.offered, 0), earned = result.results.filter(r => ids.has(r.id)).reduce((n, r) => n + r.earned, 0);
    return { family, offered, earned, minimum: contract.minimumEarned[family], pass: earned >= contract.minimumEarned[family] };
  });
  const correctness = result.valid && result.complete && result.coverage.pass === result.coverage.expected;
  return { schema: 'muju-phasing-suite-floor-result-v1', contractSha256: hashJson(contract), manifestSha256: contract.manifestSha256,
    engineIdentity: result.engineIdentity, correctness, pass: correctness && families.every(f => f.pass), families,
    releaseQualification: 'suite-only; other migration and release gates remain required' };
}
