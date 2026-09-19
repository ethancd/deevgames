// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { buildNewFamilies, NEW_CANDIDATES_SHA } from '../../lab/hard-ai/suites/phasing/build-new-families';
import { positionRef, semanticHash, withRules } from '../../lab/hard-ai/suites/phasing/canonical';
import { validateSuiteDocument } from '../../lab/hard-ai/suites/phasing/format';
import { validateAuthorEvidence, validateProvenance, evaluateProbe, evaluatePredicate } from '../../lab/hard-ai/suites/phasing/predicates';
import type { GameState, PositionRef, SuiteDocument } from '../../lab/hard-ai/suites/phasing/format';

function resolveIn(doc: SuiteDocument) {
  return (ref: PositionRef) => {
    const position = doc.positions.find(p => p.id === ref.id);
    if (!position || positionRef(position).sha256 !== ref.sha256) throw new Error('position binding mismatch');
    return position;
  };
}

describe('new Phasing summon-disruption and home-fortify authoring', () => {
  it('preserves the pinned40-case provenance and separates decisions from rule coverage', () => {
    const documents = buildNewFamilies();
    expect(documents.map(d => [d.family, d.cases.length])).toEqual([['summon-disruption', 30], ['home-fortify', 10]]);
    expect(documents.map(d => d.cases.filter(c => c.kind === 'macro-decision').length)).toEqual([14, 6]);
    for (const doc of documents) {
      expect(new Set(doc.cases.map(c => c.id)).size).toBe(doc.cases.length);
      expect(doc.cases.every(c => c.authoredFrom.revision === NEW_CANDIDATES_SHA)).toBe(true);
      expect(doc.positions.filter(p => p.origin.kind === 'legal-prefix')).toHaveLength(doc.cases.length);
    }
  });

  it('replays every setup, recorded control and new complete positive/negative witness canonically', () => {
    for (const doc of buildNewFamilies()) {
      const binding = doc.positions[0].binding;
      withRules(binding, () => {
        validateSuiteDocument(doc);
        validateProvenance(doc);
        const resolve = resolveIn(doc);
        for (const c of doc.cases) {
          const outcome = validateAuthorEvidence(c, resolve);
          expect(outcome.status, `${c.id}: ${JSON.stringify(outcome.results.filter(r => r.status !== 'pass'))}`).toBe('pass');
        }
      }, binding);
    }
  }, 60_000);

  it('keeps the later defender rescue out of the searched SD28 macro', () => {
    const doc = buildNewFamilies()[0], c = doc.cases.find(c => c.id.startsWith('M5-SD-28-'))!;
    if (c.kind !== 'macro-decision') throw new Error('SD28 decision missing');
    const root = resolveIn(doc)(c.root), first = c.evidence.positive[0];
    expect(first.kind).toBe('legal-trace@1');
    if (first.kind !== 'legal-trace@1') throw new Error('missing macro witness');
    expect(first.endpoint).toBe('first-handoff-or-terminal');
    expect(first.actions).toHaveLength(3);
    withRules(root.binding, () => {
      const macro = evaluateProbe(first, root.state);
      expect(macro.status).toBe('pass');
      expect(macro.trace!.endpoint.board.units.some(u => u.id === 'raider')).toBe(true);
      const sequence = c.evidence.positive.find(p => p.kind === 'legal-trace@1' && p.endpoint === 'coverage-sequence')!;
      const later = evaluateProbe(sequence, root.state);
      expect(later.status).toBe('pass');
      expect(later.trace!.endpoint.board.units.some(u => u.id === 'raider')).toBe(false);
      expect(later.trace!.boundary).toBe('coverage-sequence');
    }, root.binding);
  });

  it('reproduces all64 pinned endpoints including ordered armies, commitments, attacks and receipts', () => {
    const input = JSON.parse(readFileSync(new NodeURL('../../lab/hard-ai/suites/phasing/author-inputs/new-candidates-v1.json', import.meta.url), 'utf8')) as
      { cases: { id: string; branches: { endpointState: GameState }[] }[] };
    let checked = 0;
    for (const doc of buildNewFamilies()) for (const c of doc.cases) {
      if (c.kind === 'invariant-pair') throw new Error('unexpected pair');
      const original = input.cases.find(row => row.id === c.id)!;
      const root = resolveIn(doc)(c.root);
      const probes = c.evidence.positive.filter(p => p.kind === 'legal-trace@1' && p.endpoint === 'coverage-sequence');
      expect(probes).toHaveLength(original.branches.length);
      withRules(root.binding, () => probes.forEach((probe, index) => {
        const actual = evaluateProbe(probe, root.state);
        expect(actual.status, `${c.id} branch${index}`).toBe('pass');
        const old = original.branches[index].endpointState;
        const expected = { ...old, victoryRule: old.victoryRule ?? 'home-or-elimination', inactivityRule: old.inactivityRule ?? 'on' };
        expect(semanticHash(actual.trace!.endpoint), `${c.id} branch${index} ordered endpoint`).toBe(semanticHash(expected));
        checked++;
      }), root.binding);
    }
    expect(checked).toBe(64);
  });

  it('uses an actual future-attacker receipt rather than a bank-only refund proxy', () => {
    const doc = buildNewFamilies()[0], c = doc.cases.find(c => c.id.startsWith('M5-SD-18-'))!;
    if (c.kind !== 'macro-decision') throw new Error('SD18 decision missing');
    const root = resolveIn(doc)(c.root);
    withRules(root.binding, () => {
      const positive = evaluateProbe(c.evidence.positive[0], root.state);
      expect(positive.status).toBe('pass');
      const pending = root.state.pendingSummons![0];
      const wrong: typeof c.accept = { kind: 'summon-resolution@1', commitment: { kind: 'root', id: pending.id },
        player: pending.owner, outcome: 'arrived', window: 1 };
      expect(evaluatePredicate(wrong, positive.trace!).status).toBe('fail');
    }, root.binding);
  });
});
