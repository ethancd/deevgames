import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiRouter } from '../../server/router';
import { JobManager } from '../../server/jobs';
import { writeRegistry, writeMatchState, type PersistencePaths } from '../../server/persistence';
import type { CardDef, MatchState } from '../../shared/types';
import type { ImplementCardsResult } from '../../server/claude';

// Minimal fake IncomingMessage/ServerResponse pair good enough to drive
// server/router.ts directly, bypassing Vite's Connect middleware (which
// would otherwise strip the '/api' mount prefix from req.url for us -- see
// router.ts's module doc: routes here are matched WITHOUT that prefix).
function fakeRequest(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage;
  (req as unknown as { method: string }).method = method;
  (req as unknown as { url: string }).url = url;
  queueMicrotask(() => {
    if (body !== undefined) {
      req.emit('data', Buffer.from(JSON.stringify(body)));
    }
    req.emit('end');
  });
  return req;
}

interface FakeResponse {
  res: ServerResponse;
  done: Promise<{ status: number; body: unknown }>;
}

function fakeResponse(): FakeResponse {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let resolveDone!: (v: { status: number; body: unknown }) => void;
  const done = new Promise<{ status: number; body: unknown }>((resolve) => {
    resolveDone = resolve;
  });

  const res = {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
    end: (payload?: string) => {
      resolveDone({ status: statusCode, body: payload ? JSON.parse(payload) : undefined });
    },
  } as unknown as ServerResponse;

  Object.defineProperty(res, 'statusCode', {
    get: () => statusCode,
    set: (v: number) => {
      statusCode = v;
    },
  });

  return { res, done };
}

async function call(
  router: ReturnType<typeof createApiRouter>,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const req = fakeRequest(method, url, body);
  const { res, done } = fakeResponse();
  const next = (err?: unknown) => {
    if (err) throw err;
  };
  await router(req, res, next);
  return done;
}

function starter(overrides: Partial<CardDef> = {}): CardDef {
  return {
    id: 'starter-example',
    name: 'Example Starter',
    effectText: 'Keeper. Worth 1 point(s) while in play.',
    creatorId: 'starter',
    createdInRound: 0,
    destroyed: false,
    implemented: true,
    ...overrides,
  };
}

function emptyMatch(overrides: Partial<MatchState> = {}): MatchState {
  return {
    matchId: 'match-1',
    createdAt: new Date(0).toISOString(),
    decks: { human: ['starter-example'], claude: [] },
    innerWins: { human: 0, claude: 0 },
    round: 1,
    nextFirstPlayer: 'human',
    matchSeed: 1,
    currentInnerGame: null,
    roundHistory: [],
    phase: 'design',
    winner: null,
    ...overrides,
  };
}

describe('server/router', () => {
  let dir: string;
  let paths: PersistencePaths;
  let router: ReturnType<typeof createApiRouter>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lution-router-'));
    paths = { dataDir: path.join(dir, 'data'), nextCardsPath: path.join(dir, 'NEXT_CARDS.md') };
    // Inject a JobManager with a fast, network-free fake runner so tests
    // unrelated to /implement-cards can't race a real (unset-API-key)
    // claude.ts call's async jobs.json write against afterEach's tmp-dir
    // cleanup.
    const runImplement = async (): Promise<ImplementCardsResult> => ({ status: 'done' });
    const jobManager = new JobManager({ paths, projectRoot: dir, runImplement });
    await jobManager.whenReady();
    router = createApiRouter({ paths, projectRoot: dir, jobManager });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('GET /state returns null when no match exists yet', async () => {
    const { status, body } = await call(router, 'GET', '/state');
    expect(status).toBe(200);
    expect(body).toBeNull();
  });

  it('PUT /state persists, and GET /state then returns it', async () => {
    const state = emptyMatch();
    const put = await call(router, 'PUT', '/state', { state });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    const get = await call(router, 'GET', '/state');
    expect(get.status).toBe(200);
    expect(get.body).toEqual(state);
  });

  it('GET /registry returns [] then the written registry', async () => {
    const empty = await call(router, 'GET', '/registry');
    expect(empty.body).toEqual([]);

    await writeRegistry(paths, [starter()]);
    const populated = await call(router, 'GET', '/registry');
    expect(populated.body).toEqual([starter()]);
  });

  it('POST /validate-card returns ok:true for a clean card', async () => {
    const { status, body } = await call(router, 'POST', '/validate-card', {
      name: 'Brand New Idea',
      effectText: 'Keeper. Worth 1 point(s) while in play.',
    });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, violations: [] });
  });

  it('POST /validate-card reports numeral-rule violations', async () => {
    const { body } = await call(router, 'POST', '/validate-card', {
      name: 'Double Trouble',
      effectText: 'Draw two cards.',
    });
    expect((body as { ok: boolean }).ok).toBe(false);
    expect((body as { violations: string[] }).violations.length).toBeGreaterThan(0);
  });

  it('POST /registry/cards mints an id of the form r{round}-{creator}-{slug} and persists it', async () => {
    const { status, body } = await call(router, 'POST', '/registry/cards', {
      name: 'The Perfectly Normal Subgroup',
      effectText: 'Keeper. Worth 1 point(s) while in play.',
      creatorId: 'human',
      round: 3,
    });
    expect(status).toBe(201);
    const card = (body as { card: CardDef }).card;
    expect(card.id).toBe('r3-human-the-perfectly-normal-subgroup');
    expect(card.implemented).toBe(false);
    expect(card.destroyed).toBe(false);

    const registry = await call(router, 'GET', '/registry');
    expect((registry.body as CardDef[]).map((c) => c.id)).toContain(card.id);
  });

  it('POST /registry/cards rejects a duplicate name with 409 + violations', async () => {
    await writeRegistry(paths, [starter({ name: 'Taken Name' })]);
    const { status, body } = await call(router, 'POST', '/registry/cards', {
      name: 'Taken Name',
      effectText: 'Something else entirely.',
      creatorId: 'human',
      round: 1,
    });
    expect(status).toBe(409);
    expect((body as { violations: string[] }).violations.length).toBeGreaterThan(0);
  });

  it('POST /registry/cards rejects an invalid body with 400', async () => {
    const { status } = await call(router, 'POST', '/registry/cards', { name: 'Missing fields' });
    expect(status).toBe(400);
  });

  it('POST /void-round-designs mints a raw (not-yet-registered) human design and an already-existing claude design, then destroys both', async () => {
    await writeRegistry(paths, [
      { ...starter({ id: 'r4-claude-idea' }), name: 'Claude Idea', creatorId: 'claude', createdInRound: 4 },
      { ...starter({ id: 'untouched' }), effectText: 'Keeper. Worth 1 different point(s) while in play.' },
    ]);

    const { status, body } = await call(router, 'POST', '/void-round-designs', {
      round: 4,
      human: { kind: 'raw', name: 'Human Idea', effectText: 'Keeper. Worth 1 point(s) while in play.' },
      claude: { kind: 'existing', cardId: 'r4-claude-idea' },
    });
    expect(status).toBe(200);
    const resp = body as { human: CardDef; claude: CardDef };
    expect(resp.human.destroyed).toBe(true);
    expect(resp.human.creatorId).toBe('human');
    expect(resp.human.id).toBe('r4-human-human-idea');
    expect(resp.claude.destroyed).toBe(true);
    expect(resp.claude.id).toBe('r4-claude-idea');

    const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
    expect(registryAfter.find((c) => c.id === 'r4-human-human-idea')?.destroyed).toBe(true);
    expect(registryAfter.find((c) => c.id === 'r4-claude-idea')?.destroyed).toBe(true);
    expect(registryAfter.find((c) => c.id === 'untouched')?.destroyed).toBe(false);
    // Both designs share the same effect text -- exactly the case the normal
    // POST /api/registry/cards duplicate-effect gate would have rejected.
    expect(registryAfter.filter((c) => c.effectText === 'Keeper. Worth 1 point(s) while in play.').length).toBe(2);
  });

  it('POST /void-round-designs mints BOTH sides raw when neither was previously registered (the ghostwrite path)', async () => {
    await writeRegistry(paths, []);

    const { status, body } = await call(router, 'POST', '/void-round-designs', {
      round: 1,
      human: { kind: 'raw', name: 'Human Idea', effectText: 'Keeper. Worth 1 point(s) while in play.' },
      claude: { kind: 'raw', name: 'Claude Idea', effectText: 'Keeper. Worth 1 point(s) while in play.' },
    });
    expect(status).toBe(200);
    const resp = body as { human: CardDef; claude: CardDef };
    expect(resp.human.destroyed).toBe(true);
    expect(resp.claude.destroyed).toBe(true);
    expect(resp.human.id).not.toBe(resp.claude.id);
  });

  it('POST /void-round-designs returns 400 for an unknown existing cardId', async () => {
    const { status } = await call(router, 'POST', '/void-round-designs', {
      round: 1,
      human: { kind: 'raw', name: 'Human Idea', effectText: 'Keeper. Worth 1 point(s) while in play.' },
      claude: { kind: 'existing', cardId: 'does-not-exist' },
    });
    expect(status).toBe(400);
  });

  it('POST /void-round-designs rejects an invalid body with 400', async () => {
    const { status } = await call(router, 'POST', '/void-round-designs', { round: 1 });
    expect(status).toBe(400);
  });

  it('POST /resolve-round applies a keep decision and persists both registry and match state', async () => {
    const registry: CardDef[] = [
      starter({ id: 'starter-example' }),
      { ...starter({ id: 'r2-human-fresh' }), name: 'Fresh Human Idea', creatorId: 'human', implemented: false },
      { ...starter({ id: 'r2-claude-fresh' }), name: 'Fresh Claude Idea', creatorId: 'claude', implemented: false },
    ];
    await writeRegistry(paths, registry);
    const match = emptyMatch({ decks: { human: ['starter-example'], claude: [] } });
    await writeMatchState(paths, match);

    const { status, body } = await call(router, 'POST', '/resolve-round', {
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'human',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
    });

    expect(status).toBe(200);
    const respBody = body as { match: MatchState; record: { round: number; decision: string } };
    expect(respBody.record.round).toBe(2);
    expect(respBody.record.decision).toBe('keep');
    // Keep: each player adds their OWN design; nothing crosses decks.
    expect(respBody.match.decks.human).toContain('r2-human-fresh');
    expect(respBody.match.decks.claude).toContain('r2-claude-fresh');
    expect(respBody.match.decks.claude).not.toContain('r2-human-fresh');

    const persistedState = await call(router, 'GET', '/state');
    expect((persistedState.body as MatchState).decks.human).toContain('r2-human-fresh');
  });

  it('POST /resolve-round 409s when a submitted design was already resolved in ANY prior round (identity guard, not just the round-number guard)', async () => {
    // Regression for the 2026-07-03 live bug: stale designPhase state
    // replayed round 1's designs stamped with a freshly-incremented round
    // number, bypassing the per-round idempotency guard entirely.
    const registry: CardDef[] = [
      { ...starter({ id: 'r1-human-old' }), name: 'Old Human Design', creatorId: 'human' },
      { ...starter({ id: 'r1-claude-old' }), name: 'Old Claude Design', creatorId: 'claude' },
    ];
    await writeRegistry(paths, registry);
    const match = emptyMatch({
      round: 2,
      decks: { human: ['r1-human-old'], claude: ['r1-claude-old'] },
      roundHistory: [
        {
          round: 1,
          designs: { human: 'r1-human-old', claude: 'r1-claude-old' },
          winner: 'claude',
          loser: 'human',
          decision: 'keep',
          loserPick: null,
          winnerPick: null,
          destroyed: [],
          timestamp: new Date(0).toISOString(),
        },
      ],
    });
    await writeMatchState(paths, match);

    const { status, body } = await call(router, 'POST', '/resolve-round', {
      round: 2, // different round number -> the per-round guard alone would pass this
      designs: { human: 'r1-human-old', claude: 'r1-claude-old' },
      winner: 'claude',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
    });

    expect(status).toBe(409);
    expect((body as { error: string }).error).toContain('already resolved in a prior round');

    // Nothing was mutated: still exactly one history entry, decks unchanged.
    const persisted = (await call(router, 'GET', '/state')).body as MatchState;
    expect(persisted.roundHistory).toHaveLength(1);
    expect(persisted.decks.human).toEqual(['r1-human-old']);
  });

  it('POST /resolve-round returns 400 with no state mutation when a pick is illegal', async () => {
    const registry: CardDef[] = [
      { ...starter({ id: 'r2-human-fresh' }), name: 'Fresh Human Idea', creatorId: 'human' },
      { ...starter({ id: 'r2-claude-fresh' }), name: 'Fresh Claude Idea', creatorId: 'claude' },
    ];
    await writeRegistry(paths, registry);
    const match = emptyMatch({ decks: { human: [], claude: [] } });
    await writeMatchState(paths, match);

    const { status } = await call(router, 'POST', '/resolve-round', {
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'human',
      decision: 'steal',
      loserPick: { source: 'existing', cardId: 'does-not-exist-in-winner-deck', outcome: 'taken' },
      winnerPick: { source: 'design', cardId: 'r2-human-fresh', outcome: 'taken' },
    });
    expect(status).toBe(400);

    const stateAfter = await call(router, 'GET', '/state');
    expect(stateAfter.body).toEqual(match);
  });

  it('POST /resolve-round returns 400 when decision is missing/invalid', async () => {
    const registry: CardDef[] = [
      { ...starter({ id: 'r2-human-fresh' }), name: 'Fresh Human Idea', creatorId: 'human' },
      { ...starter({ id: 'r2-claude-fresh' }), name: 'Fresh Claude Idea', creatorId: 'claude' },
    ];
    await writeRegistry(paths, registry);
    await writeMatchState(paths, emptyMatch({ decks: { human: [], claude: [] } }));

    const { status } = await call(router, 'POST', '/resolve-round', {
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'human',
      loserPick: null,
      winnerPick: null,
    });
    expect(status).toBe(400);
  });

  it('POST /resolve-round is idempotent: resolving the same round twice returns 409 and does not mutate', async () => {
    const registry: CardDef[] = [
      starter({ id: 'starter-example' }),
      { ...starter({ id: 'r2-human-fresh' }), name: 'Fresh Human Idea', creatorId: 'human', implemented: false },
      { ...starter({ id: 'r2-claude-fresh' }), name: 'Fresh Claude Idea', creatorId: 'claude', implemented: false },
    ];
    await writeRegistry(paths, registry);
    await writeMatchState(paths, emptyMatch({ decks: { human: ['starter-example'], claude: [] } }));

    const first = await call(router, 'POST', '/resolve-round', {
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'human',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
    });
    expect(first.status).toBe(200);

    // Snapshot state + registry after the (single, legitimate) resolution.
    const stateAfterFirst = (await call(router, 'GET', '/state')).body;
    const registryAfterFirst = (await call(router, 'GET', '/registry')).body;

    const second = await call(router, 'POST', '/resolve-round', {
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'human',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
    });
    expect(second.status).toBe(409);
    expect((second.body as { error: string }).error).toContain('already resolved');

    // Neither the match state nor the registry was touched by the 409.
    const stateAfterSecond = (await call(router, 'GET', '/state')).body;
    const registryAfterSecond = (await call(router, 'GET', '/registry')).body;
    expect(stateAfterSecond).toEqual(stateAfterFirst);
    expect(registryAfterSecond).toEqual(registryAfterFirst);
    // roundHistory did NOT gain a duplicate round-2 entry.
    expect((stateAfterSecond as MatchState).roundHistory.filter((r) => r.round === 2)).toHaveLength(1);
  });

  it('POST /resolve-round sweeps an orphaned same-round design that the resolution never references, destroying it and listing it in RoundRecord.destroyed', async () => {
    // Mint THREE same-round designs; only two of them are actually resolved
    // below. The third models an abandoned re-request/reload orphan -- a
    // real one was found live as r3-claude-the-reflationary-thaw (minted for
    // round 3, never kept/stolen/referenced by round 3's resolution, still
    // sitting around with implemented: false, destroyed: false, in no deck).
    await call(router, 'POST', '/registry/cards', {
      name: 'Fresh Human Idea',
      effectText: 'Keeper. Worth 1 point while in play.',
      creatorId: 'human',
      round: 2,
    });
    await call(router, 'POST', '/registry/cards', {
      name: 'Fresh Second Idea',
      effectText: 'When you play this card, draw 1 card.',
      creatorId: 'claude',
      round: 2,
    });
    await call(router, 'POST', '/registry/cards', {
      name: 'Orphaned Third Idea',
      effectText: 'When you play this card, your opponent discards 1 card.',
      creatorId: 'claude',
      round: 2,
    });
    await writeMatchState(paths, emptyMatch({ decks: { human: [], claude: [] } }));

    const { status, body } = await call(router, 'POST', '/resolve-round', {
      round: 2,
      designs: { human: 'r2-human-fresh-human-idea', claude: 'r2-claude-fresh-second-idea' },
      winner: 'human',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
    });

    expect(status).toBe(200);
    const record = (body as { record: { destroyed: string[] } }).record;
    expect(record.destroyed).toEqual(['r2-claude-orphaned-third-idea']);

    const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
    expect(registryAfter.find((c) => c.id === 'r2-claude-orphaned-third-idea')?.destroyed).toBe(true);
    // The two designs the round actually resolved are untouched by the sweep.
    expect(registryAfter.find((c) => c.id === 'r2-human-fresh-human-idea')?.destroyed).toBe(false);
    expect(registryAfter.find((c) => c.id === 'r2-claude-fresh-second-idea')?.destroyed).toBe(false);
  });

  it('POST /next-cards appends a formatted entry for a round already in roundHistory', async () => {
    const registry: CardDef[] = [
      { ...starter({ id: 'r1-human-fresh' }), name: 'Fresh Human Idea', creatorId: 'human' },
    ];
    await writeRegistry(paths, registry);
    const match = emptyMatch({
      roundHistory: [
        {
          round: 1,
          designs: { human: 'r1-human-fresh', claude: null },
          winner: 'human',
          loser: 'claude',
          decision: 'keep',
          loserPick: null,
          winnerPick: null,
          destroyed: [],
          timestamp: new Date(0).toISOString(),
        },
      ],
    });
    await writeMatchState(paths, match);

    const { status } = await call(router, 'POST', '/next-cards', { round: 1 });
    expect(status).toBe(200);

    const content = await fs.readFile(paths.nextCardsPath, 'utf8');
    expect(content).toContain('Round 1');
    expect(content).toContain('Fresh Human Idea');
  });

  it('POST /next-cards 404s for a round with no record', async () => {
    await writeMatchState(paths, emptyMatch());
    const { status } = await call(router, 'POST', '/next-cards', { round: 99 });
    expect(status).toBe(404);
  });

  it('GET /jobs/:id 404s for an unknown job', async () => {
    const { status } = await call(router, 'GET', '/jobs/does-not-exist');
    expect(status).toBe(404);
  });

  it('POST /implement-cards enqueues a job that GET /jobs/:id can then find', async () => {
    // The card must exist in the registry (unregistered ids are filtered
    // out of the job -- nothing to implement for a card that was never
    // minted).
    await writeRegistry(paths, [starter({ id: 'r1-human-fresh', implemented: false, destroyed: false })]);
    const { status, body } = await call(router, 'POST', '/implement-cards', {
      round: 1,
      cardIds: ['r1-human-fresh'],
    });
    expect(status).toBe(202);
    const jobId = (body as { jobId: string }).jobId;
    expect(jobId).toBeTruthy();

    const job = await call(router, 'GET', `/jobs/${jobId}`);
    expect(job.status).toBe(200);
    expect((job.body as { id: string }).id).toBe(jobId);

    // Drain the fake runner's completion before the test (and its
    // afterEach tmp-dir cleanup) ends, so no background jobs.json write
    // races the directory removal.
    await vi.waitFor(async () => {
      const polled = await call(router, 'GET', `/jobs/${jobId}`);
      expect((polled.body as { status: string }).status).toBe('done');
    });
  });

  it('POST /implement-cards short-circuits with alreadyImplemented when every requested card is already implemented', async () => {
    await writeRegistry(paths, [starter({ id: 'r1-human-fresh', implemented: true, destroyed: false })]);

    const { status, body } = await call(router, 'POST', '/implement-cards', {
      round: 1,
      cardIds: ['r1-human-fresh'],
    });

    expect(status).toBe(200);
    expect(body).toEqual({ jobId: null, alreadyImplemented: true });
  });

  it('POST /implement-cards never spawns a job for a destroyed card (spurned/executed designs are corpses)', async () => {
    await writeRegistry(paths, [starter({ id: 'r1-human-fresh', implemented: false, destroyed: true })]);

    const { status, body } = await call(router, 'POST', '/implement-cards', {
      round: 1,
      cardIds: ['r1-human-fresh'],
    });

    expect(status).toBe(200);
    expect(body).toEqual({ jobId: null, alreadyImplemented: true });
  });

  it('POST /implement-cards filters destroyed cards out of a mixed request', async () => {
    await writeRegistry(paths, [
      starter({ id: 'r1-human-fresh', implemented: false, destroyed: false }),
      starter({ id: 'r1-claude-spurned', implemented: false, destroyed: true }),
    ]);

    const { status, body } = await call(router, 'POST', '/implement-cards', {
      round: 1,
      cardIds: ['r1-human-fresh', 'r1-claude-spurned'],
    });

    expect(status).toBe(202);
    const jobId = (body as { jobId: string }).jobId;
    expect(jobId).toBeTruthy();
    const job = await call(router, 'GET', `/jobs/${jobId}`);
    expect((job.body as { cardIds: string[] }).cardIds).toEqual(['r1-human-fresh']);
    // Drain the fake runner (see the earlier /implement-cards test's comment)
    // so no background jobs.json write races this test's tmp-dir cleanup.
    await vi.waitFor(async () => {
      const polled = await call(router, 'GET', `/jobs/${jobId}`);
      expect((polled.body as { status: string }).status).toBe('done');
    });
  });

  it('POST /implement-cards still enqueues a job when any requested card is not yet implemented', async () => {
    await writeRegistry(paths, [
      starter({ id: 'r1-human-fresh', implemented: true }),
      starter({ id: 'r1-claude-fresh', implemented: false }),
    ]);

    const { status, body } = await call(router, 'POST', '/implement-cards', {
      round: 1,
      cardIds: ['r1-human-fresh', 'r1-claude-fresh'],
    });

    expect(status).toBe(202);
    const jobId = (body as { jobId: string }).jobId;
    expect(jobId).toBeTruthy();
    await vi.waitFor(async () => {
      const polled = await call(router, 'GET', `/jobs/${jobId}`);
      expect((polled.body as { status: string }).status).toBe('done');
    });
  });

  describe('POST /design-card', () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;

    function anthropicCardResponse(): Response {
      const payload = { name: 'A Fine Card', effectText: 'Keeper. Worth 1 point(s) while in play.' };
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] }),
        text: async () => JSON.stringify(payload),
      } as unknown as Response;
    }

    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      fetchSpy = vi.fn().mockResolvedValue(anthropicCardResponse());
      vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    });

    function outgoingPrompt(): string {
      const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
      return body.messages[0].content as string;
    }

    it('opening round: openingLoser is claude -> the prompt reflects claude as the round\'s LOSER, citing the coin flip', async () => {
      await writeMatchState(
        paths,
        emptyMatch({
          round: 1,
          roundHistory: [],
          openingLoser: 'claude',
          openingLoserReason: 'coin-flip',
        })
      );

      const { status } = await call(router, 'POST', '/design-card', { round: 1 });
      expect(status).toBe(201);

      const prompt = outgoingPrompt();
      expect(prompt).toContain("round's LOSER");
      expect(prompt).toContain('coin flip');
    });

    it('opening round: openingLoser is human -> the prompt reflects claude as the round\'s WINNER', async () => {
      await writeMatchState(
        paths,
        emptyMatch({
          round: 1,
          roundHistory: [],
          openingLoser: 'human',
          openingLoserReason: 'coin-flip',
        })
      );

      const { status } = await call(router, 'POST', '/design-card', { round: 1 });
      expect(status).toBe(201);

      const prompt = outgoingPrompt();
      expect(prompt).toContain("round's WINNER");
    });

    it('mid-match round: the just-finished inner game was won by human -> claude is this round\'s LOSER', async () => {
      const finishedInnerGame = {
        seed: 1,
        rngState: 1,
        activePlayer: 'human' as const,
        turnNumber: 5,
        turnsTaken: { human: 3, claude: 2 },
        players: {
          human: {
            id: 'human' as const,
            drawPile: [],
            hand: [],
            inPlay: [],
            discard: [],
            skipNextDraw: false,
            extraTurns: 0,
          },
          claude: {
            id: 'claude' as const,
            drawPile: [],
            hand: [],
            inPlay: [],
            discard: [],
            skipNextDraw: false,
            extraTurns: 0,
          },
        },
        effectState: {},
        log: [],
        result: { outcome: 'win' as const, winner: 'human' as const },
      };

      await writeMatchState(
        paths,
        emptyMatch({
          round: 2,
          roundHistory: [
            {
              round: 1,
              designs: { human: null, claude: null },
              winner: 'human',
              loser: 'claude',
              decision: 'keep',
              loserPick: null,
              winnerPick: null,
              destroyed: [],
              timestamp: new Date(0).toISOString(),
            },
          ],
          openingLoser: undefined,
          currentInnerGame: finishedInnerGame,
        })
      );

      const { status } = await call(router, 'POST', '/design-card', { round: 2 });
      expect(status).toBe(201);

      const prompt = outgoingPrompt();
      expect(prompt).toContain("round's LOSER");
    });

    // BUG FIX (2026-07-03): reload-mid-design double-mint. If the page
    // reloads while POST /api/design-card is in flight, the browser abandons
    // the request but the server finishes it and mints Claude's card; the
    // reloaded client re-enters the design flow and fires a fresh call for
    // the SAME round. That must not mint a second card.
    it('a second call for an already-minted round reuses the same card instead of minting again', async () => {
      await writeMatchState(
        paths,
        emptyMatch({ round: 1, roundHistory: [], openingLoser: 'claude', openingLoserReason: 'coin-flip' })
      );

      const first = await call(router, 'POST', '/design-card', { round: 1 });
      expect(first.status).toBe(201);
      const firstCard = (first.body as { card: CardDef }).card;

      const second = await call(router, 'POST', '/design-card', { round: 1 });
      expect(second.status).toBe(200);
      const secondCard = (second.body as { card: CardDef }).card;
      expect(secondCard.id).toBe(firstCard.id);

      // Only ONE Claude call was ever made -- the second request was
      // answered entirely from the registry.
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
      expect(registryAfter.filter((c) => c.creatorId === 'claude' && c.createdInRound === 1)).toHaveLength(1);
    });

    // BUG FIX (2026-07-03): in-flight coalescing. Two requests for the same
    // round that are BOTH still pending (the classic reload race, where the
    // reload's fresh call overlaps the original, not-yet-settled one) must
    // await the same mint rather than each starting their own Claude call.
    it('two concurrent requests for the same round produce exactly one Claude call and one minted card', async () => {
      await writeMatchState(
        paths,
        emptyMatch({ round: 1, roundHistory: [], openingLoser: 'claude', openingLoserReason: 'coin-flip' })
      );
      // A deliberately slow fetch so both requests are guaranteed to be
      // in flight together before either one settles.
      fetchSpy = vi.fn().mockImplementation(
        () => new Promise<Response>((resolve) => setTimeout(() => resolve(anthropicCardResponse()), 20))
      );
      vi.stubGlobal('fetch', fetchSpy);

      const [first, second] = await Promise.all([
        call(router, 'POST', '/design-card', { round: 1 }),
        call(router, 'POST', '/design-card', { round: 1 }),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const firstCard = (first.body as { card: CardDef }).card;
      const secondCard = (second.body as { card: CardDef }).card;
      expect(secondCard.id).toBe(firstCard.id);

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
      expect(registryAfter.filter((c) => c.creatorId === 'claude' && c.createdInRound === 1)).toHaveLength(1);
    });

    // BUG FIX (2026-07-03) guard: a VOIDED design (destroyed: true, from
    // POST /api/void-round-designs) must NOT be handed back by the reuse
    // check -- a rule-3 redesign after a void needs a genuinely fresh card,
    // per the identical-simultaneous-designs rule.
    it('does not reuse a destroyed (voided) same-round claude design -- mints fresh instead', async () => {
      await writeRegistry(paths, [
        starter({
          id: 'r1-claude-old-idea',
          name: 'Old Idea',
          effectText: 'Keeper. Worth 1 different point(s) while in play.',
          creatorId: 'claude',
          createdInRound: 1,
          destroyed: true,
          implemented: false,
        }),
      ]);
      await writeMatchState(
        paths,
        emptyMatch({ round: 1, roundHistory: [], openingLoser: 'claude', openingLoserReason: 'coin-flip' })
      );

      const { status, body } = await call(router, 'POST', '/design-card', { round: 1 });
      expect(status).toBe(201);
      const card = (body as { card: CardDef }).card;
      expect(card.id).not.toBe('r1-claude-old-idea');

      // A fresh Claude call really was made -- the destroyed design was
      // correctly treated as unusable, not silently handed back.
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
      expect(registryAfter.find((c) => c.id === 'r1-claude-old-idea')?.destroyed).toBe(true);
      expect(registryAfter.find((c) => c.id === card.id)?.destroyed).toBe(false);
    });

    // M3: mintClaudeDesignForRound gains an atom-composition fast path.
    describe('composition support (M3)', () => {
      const validComposition = {
        cardType: 'action',
        baseValue: 0,
        effects: [{ trigger: 'onPlay', body: { atom: 'draw', target: 'self', count: { type: 'literal', value: 1 } } }],
      };

      function anthropicResponseWithComposition(composition: unknown): Response {
        const payload = { name: 'A Composed Card', effectText: 'Keeper. Worth 1 point(s) while in play.', composition };
        return {
          ok: true,
          status: 200,
          json: async () => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] }),
          text: async () => JSON.stringify(payload),
        } as unknown as Response;
      }

      it('a design response carrying a VALID composition mints instantly: implemented true, no job needed', async () => {
        await writeMatchState(
          paths,
          emptyMatch({ round: 1, roundHistory: [], openingLoser: 'claude', openingLoserReason: 'coin-flip' })
        );
        fetchSpy = vi.fn().mockResolvedValue(anthropicResponseWithComposition(validComposition));
        vi.stubGlobal('fetch', fetchSpy);

        const { status, body } = await call(router, 'POST', '/design-card', { round: 1 });
        expect(status).toBe(201);
        const card = (body as { card: CardDef }).card;
        expect(card.implemented).toBe(true);
        expect(card.composition).toEqual(validComposition);

        const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
        expect(registryAfter.find((c) => c.id === card.id)?.implemented).toBe(true);
      });

      it('a design response carrying an INVALID composition falls back to exactly today\'s path: implemented false, no job forced', async () => {
        await writeMatchState(
          paths,
          emptyMatch({ round: 1, roundHistory: [], openingLoser: 'claude', openingLoserReason: 'coin-flip' })
        );
        // Fails shape validation outright (unknown cardType, no effects array).
        fetchSpy = vi.fn().mockResolvedValue(anthropicResponseWithComposition({ cardType: 'bogus' }));
        vi.stubGlobal('fetch', fetchSpy);

        const { status, body } = await call(router, 'POST', '/design-card', { round: 1 });
        expect(status).toBe(201);
        const card = (body as { card: CardDef }).card;
        expect(card.implemented).toBe(false);
        expect(card.composition).toBeUndefined();
      });
    });
  });

  describe('POST /compile-card', () => {
    const originalPersonalKey = process.env.ANTHROPIC_PERSONAL_API_KEY;
    const originalKey = process.env.ANTHROPIC_API_KEY;

    const validComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'draw', target: 'self', count: { type: 'literal', value: 1 } } }],
    };

    function humanCard(overrides: Partial<CardDef> = {}): CardDef {
      return {
        id: 'r1-human-a-fine-idea',
        name: 'A Fine Idea',
        effectText: 'Action. Draw 1 card.',
        creatorId: 'human',
        createdInRound: 1,
        destroyed: false,
        implemented: false,
        ...overrides,
      };
    }

    function anthropicCompileResponse(payload: unknown): Response {
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] }),
        text: async () => JSON.stringify(payload),
      } as unknown as Response;
    }

    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      if (originalPersonalKey === undefined) delete process.env.ANTHROPIC_PERSONAL_API_KEY;
      else process.env.ANTHROPIC_PERSONAL_API_KEY = originalPersonalKey;
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    });

    it('an expressible card compiles instantly: registry patched with composition + implemented true', async () => {
      await writeRegistry(paths, [humanCard()]);
      fetchSpy = vi.fn().mockResolvedValue(anthropicCompileResponse({ expressible: true, composition: validComposition }));
      vi.stubGlobal('fetch', fetchSpy);

      const { status, body } = await call(router, 'POST', '/compile-card', { cardId: 'r1-human-a-fine-idea' });
      expect(status).toBe(200);
      const result = body as { ok: boolean; card?: CardDef; reason?: string };
      expect(result.ok).toBe(true);
      expect(result.card?.implemented).toBe(true);
      expect(result.card?.composition).toEqual(validComposition);

      const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
      expect(registryAfter.find((c) => c.id === 'r1-human-a-fine-idea')?.implemented).toBe(true);
    });

    it('an inexpressible card leaves the registry row untouched (implemented stays false) -- not an error response', async () => {
      await writeRegistry(paths, [humanCard()]);
      fetchSpy = vi.fn().mockResolvedValue(
        anthropicCompileResponse({ expressible: false, reason: 'Needs a bespoke interaction not in the atom catalog.' })
      );
      vi.stubGlobal('fetch', fetchSpy);

      const { status, body } = await call(router, 'POST', '/compile-card', { cardId: 'r1-human-a-fine-idea' });
      expect(status).toBe(200);
      const result = body as { ok: boolean; reason?: string };
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();

      const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
      expect(registryAfter.find((c) => c.id === 'r1-human-a-fine-idea')?.implemented).toBe(false);
      expect(registryAfter.find((c) => c.id === 'r1-human-a-fine-idea')?.composition).toBeUndefined();
    });

    it('a card already implemented short-circuits without ever calling Claude', async () => {
      await writeRegistry(paths, [humanCard({ implemented: true })]);
      fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const { status, body } = await call(router, 'POST', '/compile-card', { cardId: 'r1-human-a-fine-idea' });
      expect(status).toBe(200);
      const result = body as { ok: boolean; card?: CardDef };
      expect(result.ok).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('an unknown cardId returns ok:false with a reason, not a thrown error', async () => {
      await writeRegistry(paths, [humanCard()]);
      const { status, body } = await call(router, 'POST', '/compile-card', { cardId: 'does-not-exist' });
      expect(status).toBe(200);
      const result = body as { ok: boolean; reason?: string };
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });

  describe('POST /new-match', () => {
    const originalPersonalKey = process.env.ANTHROPIC_PERSONAL_API_KEY;
    const originalKey = process.env.ANTHROPIC_API_KEY;

    beforeEach(() => {
      // Never make a real network call from this test file -- generateStarterNames
      // should deterministically fall back to "no rename" with no API key configured.
      delete process.env.ANTHROPIC_PERSONAL_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
      if (originalPersonalKey === undefined) delete process.env.ANTHROPIC_PERSONAL_API_KEY;
      else process.env.ANTHROPIC_PERSONAL_API_KEY = originalPersonalKey;
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    });

    function twentyStarters(): CardDef[] {
      return Array.from({ length: 20 }, (_, i) =>
        starter({
          id: `starter-${i}`,
          name: `Starter ${i}`,
          startingOwner: i % 2 === 0 ? 'human' : 'claude',
        })
      );
    }

    it('resets match-state to an opening design round and writes data/meta.json, falling back on starter names with no API key', async () => {
      const registry = twentyStarters();
      await writeRegistry(paths, registry);

      const { status, body } = await call(router, 'POST', '/new-match');
      expect(status).toBe(200);
      const match = body as MatchState;

      expect(match.round).toBe(1);
      expect(match.phase).toBe('design');
      expect(match.designPhase).toBe('designing');
      expect(match.roundHistory).toEqual([]);
      expect(match.currentInnerGame).toBeNull();
      expect(match.innerWins).toEqual({ human: 0, claude: 0 });
      expect(match.decks.human).toHaveLength(10);
      expect(match.decks.claude).toHaveLength(10);

      // No previous match existed at all -> neither priority rule applies,
      // must fall back to the seeded coin flip.
      expect(match.openingLoserReason).toBe('coin-flip');
      expect(['human', 'claude']).toContain(match.openingLoser);

      // No API key configured -- generateStarterNames must fall back to
      // leaving the names unchanged rather than throwing/blocking.
      const registryAfter = (await call(router, 'GET', '/registry')).body as CardDef[];
      expect(registryAfter.map((c) => c.name).sort()).toEqual(registry.map((c) => c.name).sort());

      const metaRaw = await fs.readFile(path.join(paths.dataDir, 'meta.json'), 'utf8');
      const meta = JSON.parse(metaRaw) as { lastMatchLoser: unknown; lastGameLoser: unknown; updatedAt: unknown };
      expect(meta).toMatchObject({ lastMatchLoser: null, lastGameLoser: null });
      expect(typeof meta.updatedAt).toBe('string');
    });

    it('prioritizes the most recent roundHistory loser (recent-game-loser) when the previous match is still in progress', async () => {
      await writeRegistry(paths, twentyStarters());
      await writeMatchState(
        paths,
        emptyMatch({
          roundHistory: [
            {
              round: 1,
              designs: { human: null, claude: null },
              winner: 'human',
              loser: 'claude',
              decision: 'keep',
              loserPick: null,
              winnerPick: null,
              destroyed: [],
              timestamp: new Date(0).toISOString(),
            },
          ],
        })
      );

      const { body } = await call(router, 'POST', '/new-match');
      const match = body as MatchState;
      expect(match.openingLoser).toBe('claude');
      expect(match.openingLoserReason).toBe('recent-game-loser');

      const meta = JSON.parse(await fs.readFile(path.join(paths.dataDir, 'meta.json'), 'utf8'));
      expect(meta.lastGameLoser).toBe('claude');
      expect(meta.lastMatchLoser).toBeNull();
    });

    it('prioritizes lastMatchLoser over lastGameLoser when the previous match actually concluded', async () => {
      await writeRegistry(paths, twentyStarters());
      await writeMatchState(
        paths,
        emptyMatch({
          phase: 'match-over',
          winner: 'human',
          roundHistory: [
            {
              round: 5,
              designs: { human: null, claude: null },
              winner: 'claude',
              loser: 'human',
              decision: 'keep',
              loserPick: null,
              winnerPick: null,
              destroyed: [],
              timestamp: new Date(0).toISOString(),
            },
          ],
        })
      );

      const { body } = await call(router, 'POST', '/new-match');
      const match = body as MatchState;
      // lastMatchLoser is 'claude' (human won the match); lastGameLoser from
      // roundHistory would be 'human' -- lastMatchLoser must win the tiebreak.
      expect(match.openingLoser).toBe('claude');
      expect(match.openingLoserReason).toBe('last-match-loser');
    });
  });

  it('returns 404 for an unknown route', async () => {
    const { status } = await call(router, 'GET', '/not-a-real-route');
    expect(status).toBe(404);
  });

  describe('GET /card-source/:id', () => {
    async function writeFixture(relPath: string, contents: string): Promise<void> {
      const fullPath = path.join(dir, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, contents, 'utf8');
    }

    it('returns the effect source and test source for an implemented, tested card', async () => {
      await writeRegistry(paths, [
        { ...starter({ id: 'r1-human-widget' }), creatorId: 'human', createdInRound: 1 },
      ]);
      await writeFixture('src/effects/r1-human-widget.ts', 'export default { cardId: "r1-human-widget" };\n');
      await writeFixture(
        'tests/cards/r1-human-widget.test.ts',
        "it('does a thing', () => {});\nit('does another thing', () => {});\n"
      );

      const { status, body } = await call(router, 'GET', '/card-source/r1-human-widget');
      expect(status).toBe(200);
      expect(body).toEqual({
        effectSource: 'export default { cardId: "r1-human-widget" };\n',
        testSource: "it('does a thing', () => {});\nit('does another thing', () => {});\n",
      });
    });

    it('returns testSource: null for a starter (no test file)', async () => {
      await writeRegistry(paths, [starter({ id: 'starter-widget' })]);
      await writeFixture('src/effects/starter-widget.ts', 'export default { cardId: "starter-widget" };\n');
      // Deliberately no tests/cards/starter-widget.test.ts written.

      const { status, body } = await call(router, 'GET', '/card-source/starter-widget');
      expect(status).toBe(200);
      expect(body).toEqual({
        effectSource: 'export default { cardId: "starter-widget" };\n',
        testSource: null,
      });
    });

    it('returns 404 for an id with an invalid character (mechanical guard)', async () => {
      await writeRegistry(paths, [starter({ id: 'starter-widget' })]);
      const { status } = await call(router, 'GET', '/card-source/Starter_Widget');
      expect(status).toBe(404);
    });

    it('returns 404 for a path-traversal attempt even if it were somehow registered', async () => {
      // The id itself can never survive CARD_ID_PATTERN, regardless of
      // whether a matching registry row exists -- this is the same guard
      // that rejects any other malformed id, doubling as the traversal
      // defense described in shared/types.ts's GetCardSourceResponse doc.
      const { status } = await call(router, 'GET', '/card-source/..%2F..%2Fetc%2Fpasswd');
      expect(status).toBe(404);
    });

    it('returns 404 for an id that is well-formed but not in the registry', async () => {
      await writeRegistry(paths, []);
      const { status } = await call(router, 'GET', '/card-source/does-not-exist');
      expect(status).toBe(404);
    });

    it('returns 404 when the registry row exists but has no effect module on disk', async () => {
      await writeRegistry(paths, [starter({ id: 'starter-ghost' })]);
      // No src/effects/starter-ghost.ts written.
      const { status } = await call(router, 'GET', '/card-source/starter-ghost');
      expect(status).toBe(404);
    });
  });
});
