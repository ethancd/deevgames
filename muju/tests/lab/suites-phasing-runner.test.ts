// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorBundle, loadBundle, validateBundle } from '../../lab/hard-ai/suites/phasing/run';
import { hashJson, sha256 } from '../../lab/hard-ai/suites/phasing/canonical';
import { FAMILIES } from '../../lab/hard-ai/suites/phasing/format';
import type { Family } from '../../lab/hard-ai/suites/phasing/format';
import { assessFloors, validateFloorContract } from '../../lab/hard-ai/suites/phasing/contract';
import type { FloorContract } from '../../lab/hard-ai/suites/phasing/contract';
import { aggregate } from '../../lab/hard-ai/suites/phasing/score';
import type { CaseResult } from '../../lab/hard-ai/suites/phasing/score';

describe('Phasing six-family bundle runner', () => {
  it('preserves complete membership, rejects changed bytes and refuses overwritten evidence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-phasing-suite-'));
    try {
      const out = join(dir, 'bundle');
      const authored = authorBundle(out);
      expect(authored.errors, JSON.stringify(authored.errors)).toEqual([]);
      expect(authored.checks.filter(c => c.status !== 'pass')).toEqual([]);
      expect(authored.valid).toBe(true);
      expect(authored.caseCount).toBe(225); expect(authored.memberCount).toBe(245);
      expect(authored.engineExecuted).toBe(false); expect(authored.acceptance).toBe('not-established');
      const manifestPath = join(out, 'manifest.json'), original = readFileSync(manifestPath, 'utf8');
      const validated = validateBundle(manifestPath);
      expect(validated.valid).toBe(true);
      expect(validated.bundle).toEqual(authored.bundle);
      expect(validated.bundle!.manifestFileSha256).toBe(sha256(original));
      expect(validated.bundle!.files).toHaveLength(6);
      // Explicit synthetic result records test the contract, never engine skill.
      const frozen = loadBundle(manifestPath).manifest;
      const minimumEarned = Object.fromEntries(FAMILIES.map(family => [family,
        frozen.cases.filter(c => c.family === family).reduce((n, c) => n + c.offered, 0)])) as Record<Family, number>;
      const contract: FloorContract = { schema: 'muju-phasing-suite-floor-v1', manifestSha256: hashJson(frozen),
        declaredAt: '2026-09-19T00:00:00.000Z', seed: 1, profile: 'desktop', minimumEarned,
        rationale: 'Synthetic contract test; all required points, independently of any actual engine outcome.',
        coverage: 'all', fallback: 'veto', illegalOrDivergent: 'veto', unresolvedProof: 'veto' };
      expect(() => validateFloorContract({ ...contract, manifestSha256: '0'.repeat(64) }, frozen)).toThrow(/different/);
      expect(() => validateFloorContract({ ...contract, minimumEarned: { ...minimumEarned, tactics: 0 } }, frozen)).toThrow(/floor/);
      expect(() => validateFloorContract({ ...contract, minimumEarned: { ...minimumEarned, tactics: minimumEarned.tactics + 1 } }, frozen)).toThrow(/floor/);
      const synthetic: CaseResult[] = frozen.cases.map(c => ({ schema: 'muju-phasing-case-result-v1', id: c.id,
        caseSha256: c.sha256, kind: c.kind, status: 'pass', offered: c.offered, earned: c.offered,
        failureCodes: [], predicates: [], engineIdentity: 'injected-contract-test' }));
      const good = aggregate(frozen, synthetic);
      expect(assessFloors(contract, frozen, good).pass).toBe(true);
      expect(() => assessFloors(contract, frozen, { ...good, earned: 10000 })).toThrow(/summary/);
      const failedCoverage = structuredClone(synthetic), zero = failedCoverage.find(r => r.offered === 0)!;
      zero.status = 'fail'; zero.failureCodes = ['predicate-miss'];
      const coverageVeto = assessFloors(contract, frozen, aggregate(frozen, failedCoverage));
      expect(coverageVeto.families.every(f => f.pass)).toBe(true);
      expect(coverageVeto.correctness).toBe(false); expect(coverageVeto.pass).toBe(false);
      const missing = assessFloors(contract, frozen, aggregate(frozen, synthetic.slice(1)));
      expect(missing.pass).toBe(false);
      const failedDecision = structuredClone(synthetic), one = failedDecision.find(r => r.offered === 1)!;
      one.status = 'fail'; one.earned = 0; one.failureCodes = ['predicate-miss'];
      const missed = assessFloors(contract, frozen, aggregate(frozen, failedDecision));
      expect(missed.correctness).toBe(true); expect(missed.pass).toBe(false);
      expect(() => authorBundle(out)).toThrow(/already exists/);
      const manifest = JSON.parse(original);
      manifest.artifacts['lab/hard-ai/suites/phasing/predicates.ts'] = '0'.repeat(64);
      writeFileSync(manifestPath, JSON.stringify(manifest));
      expect(() => loadBundle(manifestPath)).toThrow(/artifact/);
      writeFileSync(manifestPath, original);
      const file = join(out, manifest.files[0].path), bytes = readFileSync(file, 'utf8');
      writeFileSync(file, bytes + '\n');
      expect(() => loadBundle(manifestPath)).toThrow(/Byte pin mismatch/);
      // Even a newly hashed file cannot delete a case or repair the denominator.
      const document = JSON.parse(bytes); document.cases.pop();
      const changed = JSON.stringify(document); writeFileSync(file, changed);
      const revised = JSON.parse(original); revised.files[0].sha256 = sha256(changed);
      writeFileSync(manifestPath, JSON.stringify(revised));
      expect(() => loadBundle(manifestPath)).toThrow(/count mismatch|graph/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});
