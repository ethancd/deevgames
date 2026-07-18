// getCardName: the display-name lookup effects must use for anything shown
// to the human (requestChoice labels, log messages). Added after the
// 2026-07-03 Subzero Serpent bug surfaced raw instance ids in a choice modal.
import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('EngineAPI.getCardName', () => {
  it('returns the registry display name for a known card', () => {
    const { api } = createTestGame({
      extraRegistry: [testCardDef('r9-test-widget', { name: 'The Test Widget' })],
      extraEffects: [testKeeperEffect('r9-test-widget', 1)],
      decks: { human: ['r9-test-widget'], claude: [] },
      hands: { human: [], claude: [] },
    });
    expect(api.getCardName('r9-test-widget')).toBe('The Test Widget');
  });

  it('falls back to the raw cardId for an unknown card', () => {
    const { api } = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: [], claude: [] },
    });
    expect(api.getCardName('never-registered')).toBe('never-registered');
  });
});
