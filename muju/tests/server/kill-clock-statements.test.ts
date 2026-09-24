// @vitest-environment node
/**
 * Rules revision `muju-phasing-3` (owner decision 2026-09-22): the kill clock.
 * Ten kill-free plies end the game on the higher mined total (a tie draws),
 * warning at seven. This supersedes `tests/server/draw-clock-statements.test.ts`
 * (muju-phasing-2, twenty plies, always a draw) — that revision is retired, so
 * its statements test moved here rather than being edited to lie about a
 * `2026-09-19` decision it no longer describes. An agent reads the rule from the
 * room, the `muju_rules` payload and the published guidance; all of them must
 * state the same numbers as the engine, and none of them may carry a retired
 * claim (the old ten-ply draw, the twenty-ply draw, or "draw" as the only verdict).
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { observe, rules, rulesFor } from '../../server/observation';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING, minedTotal } from '../../src/game/inactivity';
import { createInitialGameState } from '../../src/game/board';
import { snapshot } from '../fixtures/analysis';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
/** Sentences a retired rule used to be written as, in code and in prose. */
const retired = [
  /10 consecutive player turns/i, /ten consecutive (completed )?(player )?turns/i,
  /ten full player turns/i, /draw after 10 consecutive/i,
  /20 full player turns/i, /twenty full player turns/i, /draw after 20 consecutive/i,
  /twenty consecutive completed (player )?turns/i,
];

describe('the kill clock is stated as ten plies, decided on mined totals, everywhere an agent can read it', () => {
  it('pins the canonical constants this suite is written against', () => {
    expect(INACTIVITY_LIMIT).toBe(10);
    expect(INACTIVITY_WARNING).toBe(7);
    expect(INACTIVITY_LIMIT - INACTIVITY_WARNING).toBe(3);
  });

  it('states the limit and the mined-total verdict in the muju_rules payload, which has one ruleset', () => {
    // Since 2026-09-21 `rulesFor()` takes no argument: the base object IS the
    // played rules, so there is one victory sentence to check, not two.
    const payload = rulesFor();
    expect(payload.ruleset).toMatchObject({ name: 'phasing', revision: 'muju-phasing-4', retired: ['standard'] });
    expect(payload.victory).toContain(`${INACTIVITY_LIMIT} consecutive kill-free player turns`);
    expect(payload.victory).toMatch(/higher.*mined total/i);
    expect(payload.victory).toMatch(/kill is any attack that removes a unit/i);
    expect(payload.victory).toBe(rules.victory);
    for (const pattern of retired) expect(payload.victory).not.toMatch(pattern);
    for (const pattern of retired) expect(JSON.stringify(rules)).not.toMatch(pattern);
  });

  it('states the c >= 9 no-checkmate gate in the checkmate rules text', () => {
    expect(rulesFor().checkmate).toMatch(/kill clock/i);
  });

  it('reports the live clock, mined totals and leader in every observation, without the removed draw-named aliases', () => {
    const s = createInitialGameState();
    s.inactivityPlies = INACTIVITY_WARNING;
    s.players.white.resourcesGained = 6; s.players.black.resourcesGained = 2; s.blackCrystalHandicap = 3;
    const view = observe({ ...snapshot(s), ready: true });
    // The draw-named aliases misled agents into treating the clock as a draw (removed 2026-09-24).
    expect(view).not.toHaveProperty('drawAtQuietTurns');
    expect(view).not.toHaveProperty('quietTurns');
    // Current shape.
    expect(view.killClock).toEqual({ plies: INACTIVITY_WARNING, limit: INACTIVITY_LIMIT, warningAt: INACTIVITY_WARNING,
      minedTotals: { white: minedTotal(s, 'white'), black: minedTotal(s, 'black') }, leader: 'white' });
    expect(view.killClock.minedTotals).toEqual({ white: 6, black: 5 });
  });

  it('reports no leader on an equal mined total', () => {
    const s = createInitialGameState();
    s.players.white.resourcesGained = 4; s.players.black.resourcesGained = 4;
    const view = observe({ ...snapshot(s), ready: true });
    expect(view.killClock.leader).toBeNull();
  });

  it.each([
    'public/skills/muju-hono-irumbu/SKILL.md',
    'public/skills/muju-hono-tanka/SKILL.md',
    'ONLINE.md',
    'docs/MCP_TOOL_TAPS.md',
    'docs/ANALYSIS_TOOLS.md',
  ])('states ten plies, the mined-total verdict and no retired claim in %s', async path => {
    const text = await read(path);
    expect(text).toMatch(new RegExp(`(ten|${INACTIVITY_LIMIT})`, 'i'));
    expect(text).toMatch(/mined total/i);
    for (const pattern of retired) expect(text).not.toMatch(pattern);
  });

  it('keeps the browser lobby help on the canonical limit and the mined-total verdict', async () => {
    const text = await read('src/online/OnlineLobby.tsx');
    expect(text).toContain('INACTIVITY_LIMIT');
    expect(text).toMatch(/mined/i);
    for (const pattern of retired) expect(text).not.toMatch(pattern);
  });
});
