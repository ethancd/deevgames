import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildDesignPrompt,
  designCard,
  generateStarterNames,
  implementCards,
  validateStarterNames,
} from '../../server/claude';
import type { CardDef, JobRecord } from '../../shared/types';

function anthropicTextResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] }),
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

// Numeral-rule-safe, mutually distinct: "Name A".."Name T" (letters, not
// digits -- digits beyond "1" would themselves violate the rule these names
// are meant to satisfy).
function twentyNames(prefix = 'Name'): string[] {
  return Array.from({ length: 20 }, (_, i) => `${prefix} ${String.fromCharCode(65 + i)}`);
}

function emptyMatchContext() {
  return {
    decks: { human: [], claude: [] },
    innerWins: { human: 0, claude: 0 },
    roundHistory: [],
  };
}

function fakeJob(): JobRecord {
  return {
    id: 'job-1',
    status: 'running',
    round: 1,
    cardIds: ['r1-human-idea'],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    attempts: 1,
  };
}

describe('server/claude', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('designCard rejects with a clear error when ANTHROPIC_API_KEY is unset (no network call attempted)', async () => {
    await expect(
      designCard({
        round: 1,
        creatorId: 'claude',
        registry: [] as CardDef[],
        match: emptyMatchContext(),
      })
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('implementCards resolves to a failed status (not a throw) when ANTHROPIC_API_KEY is unset', async () => {
    const logs: string[] = [];
    const result = await implementCards({
      round: 1,
      cardIds: ['r1-human-idea'],
      cards: [
        {
          id: 'r1-human-idea',
          name: 'Idea',
          effectText: 'Keeper. Worth 1 point(s) while in play.',
          creatorId: 'human',
          createdInRound: 1,
          destroyed: false,
          implemented: false,
        },
      ],
      job: fakeJob(),
      projectRoot: '/tmp/does-not-matter',
      onLog: (line) => logs.push(line),
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/ANTHROPIC_API_KEY/);
    // Fails fast on a single guard check -- no per-attempt retry log noise.
    expect(logs.some((l) => l.includes('ANTHROPIC_API_KEY'))).toBe(true);
  });

  describe('buildDesignPrompt', () => {
    function baseDesignParams(
      overrides: Partial<Parameters<typeof buildDesignPrompt>[0]> = {}
    ): Parameters<typeof buildDesignPrompt>[0] {
      return {
        round: 5,
        creatorId: 'claude' as const,
        registry: [] as CardDef[],
        match: { decks: { human: [], claude: [] }, innerWins: { human: 3, claude: 2 }, roundHistory: [] },
        ...overrides,
      };
    }

    it('includes the strategy guide verbatim when provided, and omits the section entirely when absent', () => {
      const withGuide = buildDesignPrompt(baseDesignParams({ strategyGuide: 'ALWAYS BE CLOSING.' }));
      expect(withGuide).toContain('STRATEGY GUIDE');
      expect(withGuide).toContain('ALWAYS BE CLOSING.');

      const withoutGuide = buildDesignPrompt(baseDesignParams());
      expect(withoutGuide).not.toContain('STRATEGY GUIDE');
    });

    it('includes the seat section with the correct role label and reason when seat is provided, and omits it when absent', () => {
      const asLoser = buildDesignPrompt(
        baseDesignParams({ seat: { role: 'loser', reason: 'you lost the inner game that just ended' } })
      );
      expect(asLoser).toContain('YOUR SEAT THIS ROUND');
      expect(asLoser).toContain('LOSER');
      expect(asLoser).toContain('you lost the inner game that just ended');

      const asWinner = buildDesignPrompt(
        baseDesignParams({ seat: { role: 'winner', reason: 'you won the inner game that just ended' } })
      );
      expect(asWinner).toContain('WINNER');

      const noSeat = buildDesignPrompt(baseDesignParams());
      expect(noSeat).not.toContain('YOUR SEAT THIS ROUND');
    });

    it('includes the match-urgency line (from the creator\'s own point of view) only when both seat and matchWins are provided', () => {
      const withUrgency = buildDesignPrompt(
        baseDesignParams({
          creatorId: 'claude',
          match: { decks: { human: [], claude: [] }, innerWins: { human: 3, claude: 2 }, roundHistory: [] },
          seat: { role: 'loser', reason: 'you lost the inner game that just ended' },
          matchWins: 10,
        })
      );
      expect(withUrgency).toContain('Inner-game wins: you 2, opponent 3; first to 10 takes the match.');

      const withoutMatchWins = buildDesignPrompt(
        baseDesignParams({ seat: { role: 'loser', reason: 'you lost the inner game that just ended' } })
      );
      expect(withoutMatchWins).not.toContain('Inner-game wins:');
    });
  });

  describe('generateStarterNames', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns null (no rename) with no network call when no API key is configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const result = await generateStarterNames(['Existing Starter']);

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns the model\'s names when the first attempt already passes validation', async () => {
      const names = twentyNames();
      const fetchSpy = vi.fn().mockResolvedValue(anthropicTextResponse({ names }));
      vi.stubGlobal('fetch', fetchSpy);

      const result = await generateStarterNames(['Some Existing Card']);

      expect(result).toEqual(names);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('retries once, feeding violations back, and succeeds on the second attempt', async () => {
      // First attempt: only 19 names (a mechanical violation -- wrong count).
      const badBatch = twentyNames().slice(0, 19);
      const goodBatch = twentyNames('Second');
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce(anthropicTextResponse({ names: badBatch }))
        .mockResolvedValueOnce(anthropicTextResponse({ names: goodBatch }));
      vi.stubGlobal('fetch', fetchSpy);

      const result = await generateStarterNames([]);

      expect(result).toEqual(goodBatch);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // The retry's prompt fed the specific violation back in.
      const secondCallBody = JSON.parse(String(fetchSpy.mock.calls[1][1].body));
      const secondPrompt = secondCallBody.messages[0].content as string;
      expect(secondPrompt).toMatch(/REJECTED/);
      expect(secondPrompt).toMatch(/Expected exactly 20 names/);
    });

    it('falls back to null (no rename) when both attempts fail validation, and never throws', async () => {
      // Both attempts contain a numeral-rule violation ("2" is not "1").
      const badBatch = twentyNames();
      badBatch[0] = 'Double Trouble 2';
      const fetchSpy = vi.fn().mockResolvedValue(anthropicTextResponse({ names: badBatch }));
      vi.stubGlobal('fetch', fetchSpy);

      const result = await generateStarterNames([]);

      expect(result).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('falls back to null when the model response is unparsable JSON', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: 'not json at all' }] }),
        text: async () => 'not json at all',
      });
      vi.stubGlobal('fetch', fetchSpy);

      const result = await generateStarterNames([]);

      expect(result).toBeNull();
    });
  });

  describe('validateStarterNames', () => {
    it('accepts exactly 20 distinct, rule-clean, non-colliding names', () => {
      const violations = validateStarterNames(twentyNames(), ['Some Other Card']);
      expect(violations).toEqual([]);
    });

    it('flags a count other than 20', () => {
      const violations = validateStarterNames(twentyNames().slice(0, 5), []);
      expect(violations.some((v) => v.includes('Expected exactly 20 names'))).toBe(true);
    });

    it('flags a numeral-rule violation', () => {
      const names = twentyNames();
      names[0] = 'Double Trouble 2';
      const violations = validateStarterNames(names, []);
      expect(violations.some((v) => v.includes('not allowed'))).toBe(true);
    });

    it('flags two names in the same batch that collide case-insensitively', () => {
      const names = twentyNames();
      names[1] = names[0].toUpperCase();
      const violations = validateStarterNames(names, []);
      expect(violations.some((v) => v.includes('duplicates another generated name'))).toBe(true);
    });

    it('flags a generated name that collides with a name already in use', () => {
      const names = twentyNames();
      const violations = validateStarterNames(names, [names[3].toLowerCase()]);
      expect(violations.some((v) => v.includes('already in use'))).toBe(true);
    });
  });
});
