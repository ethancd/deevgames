/**
 * EMBER — reflex/pilot replay-provenance regression test
 * (src/engine/reflexIntentProvenance.test.ts).
 *
 * Promoted from a finalize-pass audit finding (llm-audit, high):
 * src/engine/index.ts's isReflexIntent() used to classify any Intent whose
 * `goal` string started with the literal prefix "reflex:" as reflex-
 * authored, purely by content matching. That function gates which entries
 * of cfg.recordedIntents survive into replay's pilotQueue (reflex-authored
 * entries are always excluded — they're recomputed live from the
 * deterministic body/world trajectory instead). But `goal` is pinned as
 * pilot-authored, free-text, non-causal narration (core/types.ts: "goal:
 * string; // narration, non-causal") with no reserved namespace enforced
 * anywhere in validation — an LLM pilot phrasing a goal as ordinary as
 * "reflex: dodge and reassess" would have been silently misclassified and
 * dropped from the queue, desyncing every subsequent queue index for the
 * rest of that replay with no error, warning, or rejected-intent log entry
 * anywhere to signal the corruption.
 *
 * Fix: src/skills/reflexes.ts now stamps a structural, engine-only
 * `params._reflexSource === true` marker on every reflex-authored Intent
 * (the same non-schema-scratch-key convention `_exploreDir` already uses —
 * see src/pilot/scripted.ts), and src/engine/index.ts's isReflexIntent()
 * filters on that instead of `goal` text. A pilot can't forge this marker:
 * the LLM path is forced strict tool-use with `additionalProperties: false`
 * (src/pilot/llmContracts.ts), so a real model's submitted params
 * structurally cannot carry an extra key, and this test's fake Pilot proves
 * the ordinary-narration case is no longer misclassified either way.
 */

import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { createScriptedPilot } from '../pilot/scripted';
import type { ContextPacket, Intent, Pilot } from '../core/types';

/** A pilot that always requests `rest`, but phrases its (non-causal)
 *  narration exactly like a reflex-authored intent — the natural phrasing
 *  the audit finding called out, not an adversarial construction. */
function createReflexPhrasingPilot(): Pilot {
  return {
    decide(_ctx: ContextPacket): Intent {
      return {
        goal: 'reflex: dodge and reassess',
        skill: 'rest',
        params: { duration: 5 },
        interruptConditions: [],
      };
    },
  };
}

describe('reflex-intent replay provenance (audit fix)', () => {
  it('a pilot-authored intent whose goal happens to start with "reflex:" is not dropped from replay', async () => {
    const SEED = 555111;
    const TICKS = 120;

    const live = createSim({ seed: SEED, pilot: createReflexPhrasingPilot() });
    await live.run(TICKS);
    const liveSerialized = live.log.serialize();
    const recordedIntents = [...live.intents];

    // Sanity: the pilot really did produce goal-prefixed-"reflex:" intents,
    // and — crucially — none of them carry the structural `_reflexSource`
    // marker (they are genuinely pilot-authored, not engine-authored
    // reflexes; only src/skills/reflexes.ts ever sets that marker).
    const goalLooksLikeReflex = recordedIntents.filter((it) => it.goal.startsWith('reflex:'));
    expect(goalLooksLikeReflex.length).toBeGreaterThan(0);
    for (const it of goalLooksLikeReflex) {
      expect((it.params as Record<string, unknown>)._reflexSource).toBeUndefined();
    }

    const replay = createSim({
      seed: SEED,
      pilot: createReflexPhrasingPilot(), // must be ignored in favor of recordedIntents
      recordedIntents,
    });
    await replay.run(TICKS);

    // Under the old goal-prefix heuristic, every one of these entries would
    // have been filtered out of the replay pilotQueue (mistaken for
    // reflex-authored), leaving the queue empty and forcing every
    // consultation onto the `wait` fallback instead of the recorded `rest`
    // — an observable divergence in both the intent sequence and the log.
    expect(replay.intents).toEqual(recordedIntents);
    expect(replay.log.serialize()).toBe(liveSerialized);
  });

  it('genuine engine-authored reflex intents are still excluded from the replay pilotQueue', async () => {
    // A real, extended ScriptedPilot run naturally hits reflex conditions
    // (collapse/flinch/flare) — confirm sim.intents actually contains
    // engine-authored reflex intents (tagged via `_reflexSource`) alongside
    // pilot-authored ones, then confirm replay still matches byte-for-byte:
    // i.e. the fix didn't just stop filtering altogether; genuine reflexes
    // are still recomputed live, never replayed from the queue. (This also
    // mirrors src/scenarios/replay.test.ts's byte-exact assertion, but adds
    // the explicit provenance-marker check the audit finding turns on.)
    const SEED = 20260711;
    const TICKS = 600;

    const live = createSim({ seed: SEED, pilot: createScriptedPilot() });
    await live.run(TICKS);
    const recordedIntents = [...live.intents];

    const reflexAuthored = recordedIntents.filter(
      (it) => (it.params as Record<string, unknown>)._reflexSource === true,
    );
    expect(reflexAuthored.length).toBeGreaterThan(0);
    for (const it of reflexAuthored) {
      expect(it.goal.startsWith('reflex:')).toBe(true);
    }

    const replay = createSim({
      seed: SEED,
      pilot: createScriptedPilot(),
      recordedIntents,
    });
    await replay.run(TICKS);

    expect(replay.intents).toEqual(recordedIntents);
    expect(replay.log.serialize()).toBe(live.log.serialize());
  });
});
