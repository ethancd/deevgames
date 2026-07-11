/**
 * EMBER — anti-role-play / narration test (src/scenarios/narration.test.ts).
 *
 * PLAN.md §5 "anti-role-play test": narrationEnabled=false vs true, same
 * seed, must produce IDENTICAL event logs except for the pilot's non-causal
 * narration fields (Intent.goal / Intent.thought — see src/core/types.ts's
 * SimConfig.narrationEnabled doc comment). Behavior must not depend on
 * prose: stripping it must not change any causal outcome.
 *
 * We deep-strip every `goal`/`thought` key from both runs' full event logs
 * (recursively, wherever they appear — deliberately not hard-coded to one
 * assumed event topic/shape) and assert the remainder is deep-equal.
 *
 * NOTE: depends on createSim from '../engine' (a throwing stub as written
 * by this agent — see src/engine/index.ts). Expected to fail until the
 * integrate agent wires the real engine.
 */

import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../core/types';
import { createSim } from '../engine';
import { createScriptedPilot } from '../pilot/scripted';

const SEED = 555444;
const TICKS = 300;

/** Recursively removes 'goal' and 'thought' keys from a JSON-like value —
 *  these are the two narration fields on Intent (src/core/types.ts) that
 *  are explicitly documented as non-causal. */
function stripNarration(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNarration);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'goal' || k === 'thought') continue;
      out[k] = stripNarration(v);
    }
    return out;
  }
  return value;
}

function stripLog(events: readonly SimEvent[]): unknown[] {
  return events.map((e) => stripNarration(e));
}

describe('anti-role-play: narration toggle', () => {
  it('narrationEnabled=false and =true produce identical logs once narration fields are stripped', async () => {
    const withNarration = createSim({
      seed: SEED,
      pilot: createScriptedPilot(),
      narrationEnabled: true,
    });
    await withNarration.run(TICKS);

    const withoutNarration = createSim({
      seed: SEED,
      pilot: createScriptedPilot(),
      narrationEnabled: false,
    });
    await withoutNarration.run(TICKS);

    expect(stripLog(withoutNarration.log.all())).toEqual(stripLog(withNarration.log.all()));
  });

  it('narrationEnabled=false actually strips goal/thought from logged intents', async () => {
    const withoutNarration = createSim({
      seed: SEED,
      pilot: createScriptedPilot(),
      narrationEnabled: false,
    });
    await withoutNarration.run(TICKS);

    const serialized = JSON.stringify(withoutNarration.log.all());
    // The ScriptedPilot's narration strings are distinctive fixed prose —
    // none of it should survive into the log when narration is off.
    expect(serialized).not.toContain('Getting dim');
    expect(serialized).not.toContain('Flee the wolf');
    expect(serialized).not.toContain('Nothing urgent');
  });
});
