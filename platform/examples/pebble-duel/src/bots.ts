// Lab bots for the integration series, including the mock-backed LLM bot
// that exercises llm -> lab -> core composition with zero network.

import type { Seat } from '@deev/core';
import type { ScriptedBot, RawBot } from '@deev/lab';
import { structuredCall, wireSchemaFor, type LlmClient } from '@deev/llm';
import { perfectMove, type PebbleState, type PebbleMove } from './game.ts';

/** Perfect play as a lab ScriptedBot (Grundy mod-4 rule). */
export function perfectBot(name = 'perfect'): ScriptedBot<PebbleState, PebbleMove> {
  return {
    name,
    choose: (ctx) => perfectMove(ctx.view, ctx.legal),
  };
}

/**
 * A scripted mock LlmClient: extracts the move the prompt marks as LEGAL0
 * and returns it through the standard non-recursive wire envelope, exactly
 * as a real structured call would arrive. ScriptedBot.choose is synchronous,
 * so the LLM path uses lab's async RawBot seam instead.
 */
export function cannedMoveClient(): LlmClient {
  return {
    complete: async ({ prompt }) => {
      const match = prompt.match(/LEGAL0=(\{.*?\})/);
      if (!match) throw new Error('mock client: no LEGAL0 marker in prompt');
      return { text: JSON.stringify({ payload: match[1] }) };
    },
  };
}

export function llmBot(client: LlmClient, name = 'llm-canned'): RawBot<PebbleState, PebbleMove> {
  return {
    name,
    nextAction: async (state: PebbleState, seat: Seat) => {
      const legal: PebbleMove[] = [];
      state.heaps.forEach((h, heap) => {
        for (const take of [1, 2, 3] as const) if (take <= h) legal.push({ heap, take });
      });
      if (state.current !== seat || legal.length === 0) return null;
      const move = await structuredCall<PebbleMove>({
        client,
        prompt: `Pick a pebble-duel move. LEGAL0=${JSON.stringify(legal[0])}`,
        schema: wireSchemaFor('a pebble-duel move { heap, take }'),
        validate: (value) => {
          const v = value as PebbleMove;
          const ok =
            typeof v === 'object' &&
            v !== null &&
            legal.some((m) => m.heap === v.heap && m.take === v.take);
          return ok ? { ok: true, value: v } : { ok: false, errors: ['not a legal move'] };
        },
      });
      return move;
    },
  };
}
