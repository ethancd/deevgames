// @vitest-environment node
/**
 * Rules revision `muju-phasing-2` (owner decision 2026-09-19): the inactivity draw
 * is twenty plies, warning at seventeen. An agent reads the rule from the room, the
 * `muju_rules` payload and the published guidance; all three must state the same
 * number as the engine, and none of them may carry the retired ten-ply claim.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { observe, rules, rulesFor } from '../../server/observation';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING } from '../../src/game/inactivity';
import { createInitialGameState } from '../../src/game/board';
import { snapshot } from '../fixtures/analysis';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
/** Sentences the ten-ply rule used to be written as, in code and in prose. */
const retired = [
  /10 consecutive player turns/i, /ten consecutive (completed )?(player )?turns/i,
  /ten full player turns/i, /draw after 10 consecutive/i,
];

describe('the draw clock is stated as twenty plies everywhere an agent can read it', () => {
  it('pins the canonical constants this suite is written against', () => {
    expect(INACTIVITY_LIMIT).toBe(20);
    expect(INACTIVITY_WARNING).toBe(17);
    expect(INACTIVITY_LIMIT - INACTIVITY_WARNING).toBe(3);
  });

  it('states the limit in both rulesets of the muju_rules payload', () => {
    for (const ruleset of ['standard', 'phasing'] as const) {
      const payload = rulesFor(ruleset);
      expect(payload.victory).toContain(`${INACTIVITY_LIMIT}`);
      for (const pattern of retired) expect(payload.victory).not.toMatch(pattern);
    }
    // Standard and Phasing share the one constant; neither states a number of its own.
    expect(rules.victory).toContain(`${INACTIVITY_LIMIT} consecutive player turns`);
    expect(rulesFor('phasing').victory).toContain(`${INACTIVITY_LIMIT} full player turns`);
    expect(JSON.stringify(rules)).not.toMatch(/10 consecutive|Ten full|Ten consecutive/);
  });

  it('reports the live clock against the canonical limit in every observation', () => {
    const s = createInitialGameState(); s.inactivityPlies = INACTIVITY_WARNING;
    const view = observe({ ...snapshot(s), ready: true });
    expect(view.drawAtQuietTurns).toBe(INACTIVITY_LIMIT);
    expect(view.quietTurns).toBe(INACTIVITY_WARNING);
  });

  it.each([
    'public/skills/muju-hono-tanka/SKILL.md',
    'ONLINE.md',
    'docs/MCP_TOOL_TAPS.md',
    'docs/ANALYSIS_TOOLS.md',
  ])('states twenty plies and no retired ten-ply claim in %s', async path => {
    const text = await read(path);
    expect(text).toMatch(new RegExp(`(twenty|${INACTIVITY_LIMIT})`, 'i'));
    for (const pattern of retired) expect(text).not.toMatch(pattern);
  });

  it('keeps the browser lobby help on the canonical limit', async () => {
    const text = await read('src/online/OnlineLobby.tsx');
    expect(text).toContain('Draw after {INACTIVITY_LIMIT} consecutive turns without a kill.');
  });
});
