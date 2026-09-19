// @vitest-environment node
/** The v2 authored release: the composition the free-win veto can pass.
 *
 * These tests pin what v2 actually authored, and they pin the enforcement in
 * BOTH directions — a v2 bundle that carries a flagged root cannot be written
 * or measured valid, while the frozen v1 composition keeps loading as the
 * historical record it is. No v1 fixture byte, classification or floor is
 * changed by this file, and nothing here runs the Hard engine.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';
import { INACTIVITY_LIMIT } from '../../src/game/inactivity';
import { continueHorizon, hashJson, replayMacro, sha256, sourceBinding, withRules } from '../../lab/hard-ai/suites/phasing/canonical';
import { buildEconomy } from '../../lab/hard-ai/suites/phasing/build-economy';
import { buildNewFamilies } from '../../lab/hard-ai/suites/phasing/build-new-families';
import { buildInvariants } from '../../lab/hard-ai/suites/phasing/build-invariants';
import {
  buildHomeMateSuiteV2, buildInvariantsV2, buildNewFamiliesV2, buildTacticsSuiteV2,
  canonicallyRemovableTargets, v2AuthorInput,
} from '../../lab/hard-ai/suites/phasing/build-v2';
import { artifactPins, authorBundle, resolver, validateBundle, vetoDocument } from '../../lab/hard-ai/suites/phasing/run';
import { buildReleaseManifest, releaseOf } from '../../lab/hard-ai/suites/phasing/manifest';
import type { SuiteFilePin } from '../../lab/hard-ai/suites/phasing/manifest';
import { assertsIntruderSurvival, decisionUnits, FAMILIES, INTRUDER_SURVIVAL_HANDOFFS } from '../../lab/hard-ai/suites/phasing/format';
import type { Family, MacroDecision, PlayerId, PredicateSpec, SuiteDocument } from '../../lab/hard-ai/suites/phasing/format';
import { V1_ALLOWED_MISS, minimumEarnedFor, offeredBy, validateFloorContract } from '../../lab/hard-ai/suites/phasing/contract';
import type { FloorContractV2 } from '../../lab/hard-ai/suites/phasing/contract';
import { vetoUncreditedWins } from '../../lab/hard-ai/suites/phasing/veto';

const BINDING = sourceBinding(DEFAULT_RULES);
const INPUT = v2AuthorInput();
const bound = <T>(build: () => T): T => withRules(BINDING, build, BINDING);

/** One shared build of the v2 documents: each family is canonical replay work
 * and there is no reason to repeat it per assertion. */
let cached: Record<Family, SuiteDocument> | null = null;
function v2Documents(): Record<Family, SuiteDocument> {
  if (cached) return cached;
  const [disruption, fortify] = bound(() => buildNewFamiliesV2(INPUT));
  cached = { tactics: buildTacticsSuiteV2(INPUT), 'home-mate': buildHomeMateSuiteV2(INPUT),
    economy: bound(() => buildEconomy(BINDING)), invariants: bound(() => buildInvariantsV2(BINDING, INPUT)),
    'summon-disruption': disruption, 'home-fortify': fortify };
  return cached;
}
const decisions = (doc: SuiteDocument): MacroDecision[] => doc.cases.filter((c): c is MacroDecision => c.kind === 'macro-decision');
const armyAt = (doc: SuiteDocument, c: MacroDecision, actions: Parameters<typeof replayMacro>[1], player: PlayerId): number => {
  const root = resolver(doc)(c.root).state;
  return continueHorizon(replayMacro(root, actions), c.horizon).endpoint.board.units.filter(u => u.owner === player).length;
};
/** Write a six-family bundle to disk exactly as the author path does. */
function writeBundle(dir: string, documents: Record<Family, SuiteDocument>, release: 'v1' | 'v2'): string {
  const files: SuiteFilePin[] = FAMILIES.map(family => {
    const path = `${family}.suite.json`;
    writeFileSync(join(dir, path), `${JSON.stringify(documents[family], null, 2)}\n`);
    return { family, path, sha256: sha256(readFileSync(join(dir, path))) };
  });
  const manifest = buildReleaseManifest(FAMILIES.map(f => documents[f]), files, artifactPins(), release);
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

describe('v2 author input', () => {
  it('pins the frozen v1 candidate file and the current rules revision', () => {
    expect(INPUT.schema).toBe('muju-m5-authored-candidates-v2');
    expect(INPUT.rulesRevision).toBe('muju-phasing-2');
    const dir = mkdtempSync(join(tmpdir(), 'muju-v2-input-'));
    try {
      const forged = join(dir, 'forged.json');
      writeFileSync(forged, JSON.stringify({ ...INPUT, basedOn: { ...INPUT.basedOn, newCandidatesV1Sha256: '0'.repeat(64) } }));
      expect(() => v2AuthorInput(forged)).toThrow(/different v1 candidate file/);
      const stale = join(dir, 'stale.json');
      writeFileSync(stale, JSON.stringify({ ...INPUT, rulesRevision: 'muju-phasing-1' }));
      expect(() => v2AuthorInput(stale)).toThrow(/rules revision/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('v2 summon-disruption', () => {
  it('gives every decision the intruder-survival horizon and a strictly better accepted answer', () => {
    const doc = v2Documents()['summon-disruption'];
    const all = decisions(doc);
    expect(all).toHaveLength(14);
    const edits = new Map(INPUT.summonDisruption.edits.map(e => [e.newId ?? e.id, e]));
    for (const c of all) {
      const edit = edits.get(c.id);
      expect(edit, `no declared disposition for ${c.id}`).toBeDefined();
      expect(c.horizon).toEqual({ kind: 'scripted', policy: 'pass-only@1', additionalHandoffs: INTRUDER_SURVIVAL_HANDOFFS, homeFirst: true });
      const mover = resolver(doc)(c.root).state.turn.currentPlayer;
      expect(assertsIntruderSurvival(c, edit!.intruderId, mover), `${c.id} does not assert intruder survival`).toBe(true);
      // The accepted answer is strictly better than the rejected one at the
      // survival horizon, re-derived here rather than read off the rationale.
      const positive = c.evidence.positive.find(p => p.kind === 'legal-trace@1' && p.endpoint === 'first-handoff-or-terminal')!;
      const negative = c.evidence.negative.find(p => p.kind === 'legal-trace@1' && p.endpoint === 'first-handoff-or-terminal')!;
      if (positive.kind !== 'legal-trace@1' || negative.kind !== 'legal-trace@1') throw new Error('missing complete witnesses');
      const defender: PlayerId = mover === 'white' ? 'black' : 'white';
      bound(() => {
        const root = resolver(doc)(c.root).state;
        const accepted = continueHorizon(replayMacro(root, positive.actions), c.horizon).endpoint;
        const rejected = continueHorizon(replayMacro(root, negative.actions), c.horizon).endpoint;
        if (edit!.measure === 'denied-arrival') {
          expect(accepted.phase).toBe('playing');
          expect(accepted.board.units.some(u => u.id === edit!.intruderId && u.owner === mover)).toBe(true);
          expect(armyAt(doc, c, positive.actions, defender)).toBeLessThan(armyAt(doc, c, negative.actions, defender));
        } else if (edit!.measure === 'terminal-win') {
          expect({ phase: accepted.phase, winner: accepted.winner }).toEqual({ phase: 'victory', winner: mover });
          expect(rejected.phase).toBe('playing');
        } else {
          expect({ phase: rejected.phase, winner: rejected.winner }).toEqual({ phase: 'victory', winner: defender });
          expect(accepted.phase).toBe('playing');
        }
      });
    }
  }, 300_000);

  it('garrisons the defender home corner on every re-authored root and passes the veto', () => {
    const doc = v2Documents()['summon-disruption'];
    const lookup = resolver(doc);
    const garrisoned = INPUT.summonDisruption.edits.filter(e => e.fix !== 'horizon-only');
    expect(garrisoned.map(e => e.newId ?? e.id).sort()).toEqual([
      'M5-SD-01-occupied-low-cost', 'M5-SD-02-occupied-miner', 'M5-SD-03-interior-block',
      'M5-SD-04-inclusive-edge', 'M5-SD-06-temporary-intrusion', 'M5-SD-07-split-rectangles',
      'M5-SD-09-shared-intersection', 'M5-SD-18-arrival-immediate-attack', 'M5-SD-28-single-anchor-interior-block',
    ]);
    for (const edit of garrisoned) {
      const c = decisions(doc).find(x => x.id === (edit.newId ?? edit.id))!;
      const root = lookup(c.root).state, defender: PlayerId = root.turn.currentPlayer === 'white' ? 'black' : 'white';
      const corner = root.players[defender].startCorner;
      const unit = root.board.units.find(u => u.position.x === corner.x && u.position.y === corner.y);
      expect(unit?.owner, `${c.id} corner`).toBe(defender);
      expect(unit?.definitionId).toBe(INPUT.summonDisruption.garrison.definitionId);
    }
    // M5-SD-28 is a redesign, not a garrison repair: its objective was the home
    // entry, so the blocked square must be an interior, non-corner square.
    const redesigned = decisions(doc).find(c => c.id === 'M5-SD-28-single-anchor-interior-block')!;
    expect(redesigned.authoredFrom).toMatchObject({ id: 'M5-SD-28-home-blocks-all-rectangles', disposition: 'replacement' });
    const witness = redesigned.evidence.positive.find(p => p.kind === 'legal-trace@1' && p.endpoint === 'first-handoff-or-terminal')!;
    if (witness.kind !== 'legal-trace@1') throw new Error('missing witness');
    const landing = [...witness.actions].reverse().find(a => a.type === 'MOVE');
    expect(landing && landing.type === 'MOVE' ? landing.to : null).toEqual({ x: 2, y: 1 });
    expect(bound(() => vetoDocument(doc, BINDING))).toEqual([]);
  }, 300_000);
});

describe('v2 tactics', () => {
  it('removes the two-lane free win and accepts any-of over equally valid plugged targets', () => {
    const doc = v2Documents().tactics;
    const lookup = resolver(doc);
    for (const oldId of INPUT.tactics.twoLaneGarrison.oldIds) {
      const c = decisions(doc).find(x => x.authoredFrom.id === oldId)!;
      const root = lookup(c.root).state, defender: PlayerId = root.turn.currentPlayer === 'white' ? 'black' : 'white';
      const corner = root.players[defender].startCorner;
      const unit = root.board.units.find(u => u.position.x === corner.x && u.position.y === corner.y);
      expect(unit?.owner, `${c.id} corner`).toBe(defender);
      expect(unit?.definitionId).toBe(INPUT.tactics.twoLaneGarrison.garrison.definitionId);
    }
    const multi = new Set(INPUT.tactics.multiAnswer.cases.map(c => c.oldId));
    const unique = new Set(INPUT.tactics.uniqueAnswer.cases.map(c => c.oldId));
    expect(multi.size).toBe(4); expect(unique.size).toBe(4);
    for (const c of decisions(doc)) {
      const isAnyOf = c.accept.kind === 'any-of@1';
      expect(isAnyOf, `${c.id}`).toBe(multi.has(c.authoredFrom.id));
      if (!multi.has(c.authoredFrom.id) && !unique.has(c.authoredFrom.id)) continue;
      // The accepted target set is the canonical one, recomputed here.
      const canonical = bound(() => canonicallyRemovableTargets(lookup(c.root).state));
      const named = (p: PredicateSpec): string[] => p.kind === 'any-of@1' ? p.predicates.flatMap(named) : p.kind === 'target-removed@1' ? [p.targetId] : [];
      expect(named(c.accept).sort()).toEqual(canonical);
    }
    expect(bound(() => vetoDocument(doc, BINDING))).toEqual([]);
  }, 600_000);
});

describe('v2 home-mate', () => {
  it('credits the flagged invader win explicitly, per case, and leaves the rest predicate-only', () => {
    const doc = v2Documents()['home-mate'];
    const credited = new Set(INPUT.homeMate.explicitlyCredited.oldIds);
    expect(credited.size).toBe(8);
    const allowed = decisions(doc).filter(c => c.terminalPolicy === 'allow-root-mover-win');
    expect(allowed.map(c => c.id).sort()).toEqual([...credited].sort());
    for (const c of allowed) {
      expect(c.accept.kind).toBe('any-of@1');
      if (c.accept.kind !== 'any-of@1') throw new Error('unreachable');
      const reasons = c.accept.predicates.map(p => p.kind === 'state-facts@1' && p.facts[0].kind === 'terminal' ? p.facts[0].reason : null);
      expect(reasons).toEqual(INPUT.homeMate.explicitlyCredited.acceptReasons);
      expect(c.rationale).toMatch(/v2 explicit credit, decided per case/);
    }
    bound(() => vetoUncreditedWins(doc.cases.filter(c => credited.has(c.id)), resolver(doc)));
  }, 600_000);
});

describe('v2 invariants and economy', () => {
  it('gates fifteen searched pairs at fixed work and demotes three to diagnostics', () => {
    const doc = v2Documents().invariants;
    const pairs = doc.cases.filter(c => c.kind === 'invariant-pair');
    expect(pairs).toHaveLength(20);
    const byClass = (kind: string) => pairs.filter(c => c.kind === 'invariant-pair' && c.classification === kind);
    expect(byClass('preference')).toHaveLength(15);
    expect(byClass('diagnostic').map(c => c.id).sort()).toEqual(['inv11-home-bare', 'inv13-turtle', 'inv9-chip-across-turn']);
    expect(byClass('structural').map(c => c.id).sort()).toEqual(['inv15-unknown-as-safe', 'inv18-wasted-end-place']);
    for (const c of pairs) {
      if (c.kind !== 'invariant-pair') continue;
      if (c.classification === 'structural') { expect(c.primaryMetric).toBe('none'); expect(c.work).toBeUndefined(); continue; }
      expect(c.primaryMetric, c.id).toBe('search-gap');
      expect(c.work).toBe(INPUT.invariants.work);
      expect(decisionUnits(c)).toBe(c.classification === 'preference' ? 1 : 0);
    }
    // inv16 is authored against the shipped constant, not a written-out number.
    const clock = pairs.find(c => c.id === 'inv16-clock-discipline')!;
    expect(clock.rationale).toContain(String(INACTIVITY_LIMIT));
    expect(clock.rationale).toContain(String(INACTIVITY_LIMIT - 1));
    expect(JSON.stringify(clock)).toContain(`"eq":${INACTIVITY_LIMIT - 1}`);
    // Only inv16 moved under the twenty-ply clock; the v1 build of the other
    // nineteen pairs differs from v2 only in classification and metric.
    const v1 = bound(() => buildInvariants(BINDING));
    const strip = (doc: SuiteDocument) => doc.cases.map(c => JSON.stringify(c, (k, v) =>
      ['sha256', 'classification', 'primaryMetric', 'work', 'rationale'].includes(k) ? '<v2>' : v));
    expect(strip(v1)).toEqual(strip(doc));
  }, 120_000);

  it('re-derives the economy family unchanged under the twenty-ply clock', () => {
    const v1 = JSON.parse(readFileSync('lab/hard-ai/suites/phasing/fixtures/v1/economy.suite.json', 'utf8')) as SuiteDocument;
    const v2 = v2Documents().economy;
    const strip = (doc: SuiteDocument) => JSON.stringify(doc.cases, (k, v) => k === 'sha256' ? '<ref>' : v);
    expect(strip(v2)).toEqual(strip(v1));
    expect(INPUT.economy.changed).toEqual([]);
  }, 120_000);
});

describe('free-win veto enforcement, both directions', () => {
  it('refuses a v2 bundle that carries a flagged root and still loads the v1 composition', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-v2-veto-'));
    try {
      const clean = v2Documents();
      const cleanPath = writeBundle(join(dir, '.'), clean, 'v2');
      const good = validateBundle(cleanPath);
      expect(good.release).toBe('v2');
      expect(good.vetoFindings).toEqual([]);
      expect(good.valid).toBe(true);
      // Swap in the v1 summon-disruption document: nine roots the veto refuses.
      const defective = { ...clean, 'summon-disruption': bound(() => buildNewFamilies()[0]) };
      const defectivePath = writeBundle(join(dir, '.'), defective, 'v2');
      const refused = validateBundle(defectivePath);
      expect(refused.valid).toBe(false);
      expect(refused.vetoFindings.map(f => f.id).sort()).toEqual([
        'M5-SD-01-occupied-low-cost', 'M5-SD-02-occupied-miner', 'M5-SD-03-interior-block',
        'M5-SD-04-inclusive-edge', 'M5-SD-06-temporary-intrusion', 'M5-SD-07-split-rectangles',
        'M5-SD-09-shared-intersection', 'M5-SD-18-arrival-immediate-attack', 'M5-SD-28-home-blocks-all-rectangles',
      ]);
      expect(refused.errors.every(e => e.error.startsWith('free-win veto refused'))).toBe(true);
      // The IDENTICAL documents under the v1 release still load and validate:
      // v1 is the historical record of a release authored before the veto, and
      // enforcement is gated on the manifest version, not on judgement.
      const historical = writeBundle(join(dir, '.'), defective, 'v1');
      const v1Report = validateBundle(historical);
      expect(releaseOf(JSON.parse(readFileSync(historical, 'utf8')))).toBe('v1');
      expect(v1Report.release).toBe('v1');
      expect(v1Report.vetoFindings).toEqual([]);
      expect(v1Report.valid).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 900_000);

  it('records the release on the author path and keeps the v1 manifest shape unversioned', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-v1-author-'));
    try {
      const report = authorBundle(join(dir, 'bundle'), 'v1');
      expect(report.valid).toBe(true);
      expect(report.release).toBe('v1');
      expect(report.vetoFindings).toEqual([]);
      const manifest = JSON.parse(readFileSync(join(dir, 'bundle', 'manifest.json'), 'utf8'));
      expect('release' in manifest).toBe(false);
      expect(releaseOf(manifest)).toBe('v1');
      expect(manifest.caseCount).toBe(225);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 300_000);
});

describe('v2 floors', () => {
  it('derives each floor from the v2 offered count and the frozen v1 allowed-miss budget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-v2-floor-'));
    try {
      const path = writeBundle(join(dir, '.'), v2Documents(), 'v2');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      const offered = Object.fromEntries(FAMILIES.map(f => [f, offeredBy(manifest, f)]));
      expect(offered).toEqual({ tactics: 63, invariants: 15, 'home-mate': 28, economy: 20, 'summon-disruption': 14, 'home-fortify': 6 });
      const contract: FloorContractV2 = { schema: 'muju-phasing-suite-floor-v2', manifestSha256: hashJson(manifest),
        declaredAt: '2026-09-19T00:00:00.000Z', seed: 1, profile: 'desktop',
        engineSourceSha256: '1'.repeat(64), weightsSha256: '2'.repeat(64),
        allowedMiss: { ...V1_ALLOWED_MISS }, coverage: 'all', fallback: 'veto',
        illegalOrDivergent: 'veto', unresolvedProof: 'veto',
        rationale: 'Test contract citing M5-FLOOR-PREREGISTRATION-v2.md; the allowed-miss vector is the frozen v1 budget.' };
      expect(validateFloorContract(contract, manifest)).toBeTruthy();
      expect(Object.fromEntries(FAMILIES.map(f => [f, minimumEarnedFor(contract, manifest, f)])))
        .toEqual({ tactics: 57, invariants: 14, 'home-mate': 28, economy: 20, 'summon-disruption': 13, 'home-fortify': 6 });
      // A loosened budget is refused in code, not merely discouraged in prose.
      expect(() => validateFloorContract({ ...contract, allowedMiss: { ...V1_ALLOWED_MISS, invariants: 2 } }, manifest)).toThrow(/allowed-miss/);
      expect(() => validateFloorContract({ ...contract, allowedMiss: { ...V1_ALLOWED_MISS, tactics: 5 } }, manifest)).toThrow(/allowed-miss/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 300_000);
});
