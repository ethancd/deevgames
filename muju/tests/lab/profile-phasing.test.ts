// @vitest-environment node
import "../fixtures/metal-v28-catalogue";
import { describe, it, expect, vi } from 'vitest';
import { buildP1DevPositions } from '../../lab/hard-ai/bench/profile';

// Preserve the original builder check's catalogue fixture and bounded timeout.
// Legacy Standard Hard-search profiling tests remain in profile.test.ts.
vi.setConfig({ testTimeout: 300_000 });

describe('corpus builders', () => {
  // Was `buildE1DevPositions` over `e1-dev.jsonl` (the E1 STANDARD book). That
  // set cannot be built any more: `lab/harness/runner.ts` refuses a non-Phasing
  // `initialState`, so the expectation is rewritten against the canonical
  // Phasing engine and the P1 DEV book (`p1-dev.jsonl`). The shape asserted is
  // the same one, plus the two facts that are new and load-bearing under
  // Phasing: the position is an ACT-phase root (the Hard engine searches whole
  // turns from Act), and the set label says which corpus it came from so a
  // profile artifact can never be mistaken for a Standard one.
  it('builds p1-dev positions at game turn 6 for a small opening set', async () => {
    const { positions, skipped } = await buildP1DevPositions(2);
    expect(positions.length + skipped.length).toBe(2);
    expect(positions.length).toBeGreaterThan(0);
    for (const p of positions) {
      expect(p.turnNumber).toBe(6);
      expect(p.side).toBe('white');
      expect(p.startState.turn.turnNumber).toBe(6);
      expect(p.startState.ruleset).toBe('phasing');
      expect(p.startState.turn.currentPlayer).toBe('white');
      expect(p.startState.turn.phase).toBe('action');
      expect(p.set).toBe('p1-dev');
      expect(p.label).toMatch(/^p1-/);
      expect(p.id).toBe(`p1-dev:${p.label}:turn6`);
    }
  });
});
