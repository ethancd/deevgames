import type { Element } from '../../../src/game/types';
import type { ScriptedBot, BotContext } from '../types';
import { getUnitDefinition } from '../../../src/game/units';
import { createGreedyBot } from './greedy';
import { unitById } from './bot-utils';

/**
 * E4 mono-element bots: Greedy policy with the build queue (and promotions)
 * restricted to a single element line.
 *
 * Harness ruling J-006: both sides keep the standard symmetric starting trio
 * (fire_1/water_1/plant_1); only the QUEUE is element-restricted. A literal
 * "trio of the element's own T1s" start would make the lightning and shadow
 * rows degenerate by construction (their T1s have Mining 0 — zero economy,
 * every game lost on resources), measuring a known stat rather than the
 * element line's strength.
 */
export function createMonoElementBot(element: Element): ScriptedBot {
  const greedy = createGreedyBot();
  return {
    kind: 'scripted',
    name: `Mono-${element}`,
    chooseAction(ctx: BotContext) {
      const filtered = ctx.legal.filter((a) => {
        if (a.type === 'QUEUE_UNIT') {
          return getUnitDefinition(a.definitionId).element === element;
        }
        if (a.type === 'PROMOTE_UNIT') {
          const unit = unitById(ctx.view, a.unitId);
          return unit !== null && getUnitDefinition(unit.definitionId).element === element;
        }
        return true;
      });
      if (filtered.length === 0) return null;
      return greedy.chooseAction({ ...ctx, legal: filtered });
    },
  };
}
