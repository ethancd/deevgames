// Execute only against a stable, handed-off M6 tree. Reuses the pre-M6 independent44 acceptance domain.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = '/Users/ashkie/Documents/Codex/2026-09-18/wba/work/deevgames-phasing-m6';
const repo = `${root}/muju`;
const work = '/Users/ashkie/Documents/Codex/2026-09-18/wba/work';
const out = process.argv[2];
assert(out && path.isAbsolute(out) && !fs.existsSync(out), 'Fresh absolute output path required');
const sha = (x: Buffer | string) => crypto.createHash('sha256').update(x).digest('hex');
const inputPath = `${work}/m5-new-suite-candidates-2026-09-19.json`;
const { withHeavySlot, heavyBypassed } = await import(`${repo}/lab/hard-ai/ladder/heavy.ts`);
assert(!heavyBypassed(), 'Shared queue bypass is forbidden');
assert(!process.env.MUJU_HEAVY_DIR && !process.env.MUJU_HEAVY_SLOTS, 'Shared queue overrides are forbidden');

/** Stable JSON for resolved config metadata; the book is asserted separately. */
function identityJson(value: any): string {
  function plain(v: any): any {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') { assert(Number.isFinite(v)); return v; }
    if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v as any, plain);
    assert(typeof v === 'object', 'Unexpected non-JSON identity field');
    return Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,plain(v[k])]));
  }
  return JSON.stringify(plain(value));
}

function snapshot(p: any): any {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(p)) {
    if (ArrayBuffer.isView(value)) {
      out[key] = { kind: value.constructor.name, bytes: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('hex') };
    } else if (Array.isArray(value)) {
      assert(value.every(x => typeof x === 'string' || x === undefined), `Unexpected array ${key}`);
      const ids = Array.from(value, x => x ?? '');
      while (ids.length && ids.at(-1) === '') ids.pop();
      out[key] = ids;
    } else {
      assert.equal(typeof value, 'number', `Unexpected scalar ${key}`);
      out[key] = value;
    }
  }
  return out;
}

// Ordered semantic state; UUID spelling/UI annotations are not engine state.
// Attack targets need only their canonical count in the packed representation.
function project(s: any): any {
  return {
    phase: s.phase, winner: s.winner ?? null, reason: s.victoryReason ?? null,
    ruleset: s.ruleset, actionsPerTurn: s.actionsPerTurn,
    blackCrystalHandicap: s.blackCrystalHandicap ?? 0,
    victoryRule: s.victoryRule ?? 'home-or-elimination', inactivityRule: s.inactivityRule ?? 'on',
    reviewUpkeep: { white: !!s.reviewUpkeep?.white, black: !!s.reviewUpkeep?.black },
    initialResourceLayers: s.board.initialResourceLayers,
    turn: { currentPlayer: s.turn.currentPlayer, phase: s.turn.phase, actionsRemaining: s.turn.actionsRemaining, turnNumber: s.turn.turnNumber },
    upkeepPending: !!s.upkeepPending, inactivityPlies: s.inactivityPlies ?? 0,
    progressThisTurn: !!s.progressThisTurn,
    players: Object.fromEntries(['white', 'black'].map(side => [side, { resources: s.players[side].resources, resourcesGained: s.players[side].resourcesGained }])),
    reserves: s.board.cells.flat().map((c: any) => c.resourceLayers),
    units: s.board.units.map((u: any) => ({
      definitionId: u.definitionId, owner: u.owner, position: u.position,
      damageTaken: u.damageTaken, canActThisTurn: !!u.canActThisTurn,
      placedThisTurn: !!u.placedThisTurn, promotedThisPlacement: !!u.promotedThisPlacement,
      attackCount: Math.max(u.attackedThisTurn?.length ?? 0, u.hasAttacked ? 1 : 0),
      lastAttackKilled: !!u.lastAttackKilled,
    })),
    pending: (s.pendingSummons ?? []).map((x: any) => ({ definitionId: x.definitionId, owner: x.owner, position: x.position, cost: x.cost })),
  };
}

await withHeavySlot('codex-m6-independent-acceptance', async () => {
  const scan = () => execFileSync('rg', ['--files', 'src/ai/hard', 'src/game', 'src/ai/simulate.ts', 'src/ai/types.ts', 'lab/hard-ai/ladder/heavy.ts'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').sort();
  const hashes = (paths: string[]) => Object.fromEntries(paths.map(p => [p, sha(fs.readFileSync(`${repo}/${p}`))]));
  const report: any = {
    schema: 'muju-m6-independent-acceptance-v1', startedAt: new Date().toISOString(),
    inputPath, generatorWork: 50_000, searchWork: 25_000,
    counts: { roots: 0, candidates: 0, canonicalActions: 0, stateComparisons: 0, fullUnmakes: 0, searchResults: 0, faultChecks: 0 },
    cases: [], faults: [], failures: [], success: false,
  };
  let fatal: unknown, before: Record<string, string> | undefined;
  try {
    assert(!fs.existsSync(out), 'Output appeared while waiting for shared queue');
    report.driverSha256 = sha(fs.readFileSync(import.meta.filename));
    report.git = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    report.gitStatus = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    before = hashes(scan()); report.sourceHashes = before;
    const inputBytes = fs.readFileSync(inputPath); report.inputSha256 = sha(inputBytes);
    assert.equal(report.inputSha256, '86512dc5573b1283be2c4c28644ea28dadc0f6caaf83f5271cc31091e37b6b72');
    const input = JSON.parse(inputBytes.toString());
    const { Replica, allocState, newUndo } = await import(`${repo}/src/ai/hard/core/state.ts`);
    const { AKind, newKeepSetTable, paA, paKind, paMake, toAIAction } = await import(`${repo}/src/ai/hard/core/action.ts`);
    const { buildTables } = await import(`${repo}/src/ai/hard/tables/context.ts`);
    const { decodeTurn } = await import(`${repo}/src/ai/hard/gen/turn.ts`);
    const { newGenStats, outCapacityFor } = await import(`${repo}/src/ai/hard/gen/generate.ts`);
    const { HardEngine } = await import(`${repo}/src/ai/hard/engine.ts`);
    const { DESKTOP, PHASING_EVAL_SCHEMA } = await import(`${repo}/src/ai/hard/config.ts`);
    const { DEFAULT_WEIGHTS, serializeWeights, weightsHash } = await import(`${repo}/src/ai/hard/eval/weights.ts`);
    const { FEATURE_COUNT, FEATURE_NAMES } = await import(`${repo}/src/ai/hard/eval/features.ts`);
    const { EMPTY_BOOK } = await import(`${repo}/src/ai/hard/book/format.ts`);
    const { verifyTurn } = await import(`${repo}/src/ai/hard/verify/replay.ts`);
    const { createInitialGameState } = await import(`${repo}/src/game/board.ts`);
    const { applyAction } = await import(`${repo}/src/ai/simulate.ts`);
    const { isLegalAction } = await import(`${repo}/src/game/legality.ts`);
    const weightsJson = serializeWeights(DEFAULT_WEIGHTS);
    const expectedConfig = identityJson({ ...DESKTOP, weights: JSON.parse(weightsJson), book: 'EMPTY_BOOK' });
    function productionIdentity(engine: any): string {
      assert.equal(engine.config.book, EMPTY_BOOK, 'Engine did not select EMPTY_BOOK');
      assert.equal(engine.config.weights.featureSchema, PHASING_EVAL_SCHEMA);
      assert.equal(serializeWeights(engine.config.weights), weightsJson, 'Engine weights differ from declared bootstrap');
      assert.equal(serializeWeights(engine.ctx.eval.currentWeights), weightsJson, 'Evaluator weights differ from engine');
      const config = identityJson({ ...engine.config, weights: JSON.parse(serializeWeights(engine.config.weights)), book: 'EMPTY_BOOK' });
      assert.equal(config, expectedConfig, 'Resolved engine is not the declared desktop config');
      const identity = { schema: 'muju-m6-production-engine-identity-v1', implementation: 'HardEngine', profile: 'desktop', mode: 'fixed-work',
        book: 'EMPTY_BOOK', featureCount: FEATURE_COUNT, featureNames: FEATURE_NAMES, featureSchema: PHASING_EVAL_SCHEMA,
        weightsVersion: DEFAULT_WEIGHTS.version, weightsLabel: DEFAULT_WEIGHTS.label,
        weightsHash: weightsHash(DEFAULT_WEIGHTS), weightsSha256: sha(weightsJson), configSha256: sha(config), config: JSON.parse(config) };
      const id = sha(identityJson(identity));
      if (report.engineIdentity) assert.equal(id, report.engineIdentity, 'Engine identity changed between operations');
      else { report.engineIdentity = id; report.engine = identity; }
      return id;
    }
    const roots: any[] = input.cases.map((c: any) => ({ id: c.id, state: c.rootState, provenance: 'frozen authored root' }));
    assert.equal(roots.length, 40);
    roots.push({ id: 'initial-phasing-act', state: createInitialGameState(undefined, 4, 0, 'phasing'), provenance: 'canonical initial constructor' });
    for (const id of ['M5-SD-01-occupied-low-cost', 'M5-SD-10-capture-only-reaching-anchor', 'M5-SD-22-batch-all-six-elements']) {
      const c = input.cases.find((c: any) => c.id === id);
      const branch = c.branches.find((b: any) => ['MOVE', 'ATTACK'].includes(b.witnessActions?.[0]?.type));
      const a = branch?.witnessActions[0];
      assert(a, `${id}: missing declared witness action`);
      assert(isLegalAction(c.rootState, a), `${id}: partial prefix illegal`);
      const prefixRoot = JSON.stringify(c.rootState);
      const partial = applyAction(c.rootState, a);
      assert.equal(JSON.stringify(c.rootState), prefixRoot, `${id}: prefix mutated canonical root`);
      assert.equal(partial.phase, 'playing');
      assert.equal(partial.turn.phase, 'action');
      assert.equal(partial.turn.currentPlayer, c.rootState.turn.currentPlayer);
      roots.push({ id: `${id}-after-first-witness-action`, state: partial, provenance: { base: id, action: a } });
    }

    const check = (label: string, fn: () => void, context?: unknown): boolean => {
      try { fn(); return true; }
      catch (e) { report.failures.push({ label, error: e instanceof Error ? e.message : String(e), context }); return false; }
    };
    const complete = (start: any, end: any) => {
      if (end.phase !== 'playing') return;
      assert.notEqual(end.turn.currentPlayer, start.turn.currentPlayer, 'macro stopped before handoff');
      assert.equal(end.turn.phase, 'action', 'handoff is not Act');
      assert.equal(end.turn.actionsRemaining, 4, 'handoff AP not refreshed');
      assert.equal(!!end.upkeepPending, false, 'opponent has unexpected upkeep');
    };
    function replayCanonical(start: any, actions: any[]): any {
      assert(actions.length > 0 && actions.length <= 24, 'empty or oversize macro');
      let s = start;
      for (const [i, a] of actions.entries()) {
        assert.equal(s.phase, 'playing', `action ${i} after terminal`);
        assert.equal(s.turn.currentPlayer, start.turn.currentPlayer, `opponent action at ${i}`);
        assert(isLegalAction(s, a), `canonical rejected action ${i}: ${JSON.stringify(a)}`);
        const next = applyAction(s, a);
        assert.notEqual(next, s, `no-op action ${i}`); s = next;
      }
      complete(start, s); return s;
    }
    const cloneTurn = (t: any) => ({ ...t, actions: Int32Array.from(t.actions), keepMask: t.keepMask ? Uint32Array.from(t.keepMask) : undefined });
    const faultSeen = new Set<string>();
    function fault(label: string, rep: any, s: any, p: any, t: any): void {
      if (faultSeen.has(label)) return;
      faultSeen.add(label);
      const r = verifyTurn(rep, s, p, t, newKeepSetTable());
      report.faults.push({ label, verified: r.verified, reason: r.reason });
      check(`fault:${label}`, () => assert.equal(r.verified, false));
      report.counts.faultChecks++;
    }

    for (const item of roots) {
      const { id, state } = item;
      const originalRoot = JSON.stringify(state);
      const row: any = { id, provenance: item.provenance, root: JSON.parse(originalRoot), rootSha256: sha(originalRoot), candidates: [] };
      report.cases.push(row); report.counts.roots++;
      try {
        // Use production engine wiring, including rescue injection and its
        // fixed 1536-record pool. Scoring and weights match search generation.
        const generatorEngine = new HardEngine(), ctx = generatorEngine.ctx;
        row.generatorEngineIdentity = productionIdentity(generatorEngine);
        const { rep, sc, gen, meter } = ctx, p = rep.pack(state, generatorEngine.rootState);
        p.proverMode = 2; ctx.root = p.side; ctx.scoreMover = p.side;
        meter.reset(50_000);
        const initial = snapshot(p), tables = ctx.tables[0], keep = ctx.keep[0];
        const cfg = generatorEngine.config.gen;
        const turns: any[] = new Array(outCapacityFor(cfg)), stats = newGenStats();
        buildTables(p, sc, 0, 2, tables);
        const n = gen.generate(p, tables, ctx.score, meter, 0, keep, turns, stats);
        row.generation = { n, stats, workUsed: meter.used };
        check(`${id}:nonempty`, () => assert(n > 0));
        check(`${id}:generation proof vetoes`, () => {
          assert.equal(stats.rescueCapped, 0);
          assert.equal(stats.economyCappedProverCalls, 0);
          assert.equal(tables.economyCappedProverCalls, 0);
          assert.equal(rep.cappedProverCalls, 0);
        });
        check(`${id}:generator restores root`, () => assert.deepEqual(snapshot(p), initial));
        assert.equal(JSON.stringify(state), originalRoot, 'Generator mutated canonical root');
        for (let j = 0; j < n; j++) {
          const t = cloneTurn(turns[j]), tr: any = { index: j, count: t.count, flags: t.flags, endLo: t.endLo, endHi: t.endHi, actions: Array.from(t.actions.slice(0, t.count)), keepMask: t.keepMask ? Array.from(t.keepMask) : null };
          row.candidates.push(tr); report.counts.candidates++;
          check(`${id}:candidate ${j}`, () => {
            assert(t.count > 0 && t.count <= 24, 'invalid count');
            const live = rep.pack(state, allocState()); live.proverMode = 2;
            const beforeTurn = snapshot(live), u = newUndo(), table = newKeepSetTable();
            let canonical = state, applied = 0;
            const actions: any[] = [];
            try {
              for (let k = 0; k < t.count; k++) {
                assert.equal(canonical.phase, 'playing', `packed action ${k} after terminal`);
                assert.equal(canonical.turn.currentPlayer, state.turn.currentPlayer, `packed opponent action ${k}`);
                const pa = t.actions[k];
                if (paKind(pa) === AKind.PAY_UPKEEP) {
                  assert(t.keepMask && t.keepMask.length === 4, 'generated upkeep lacks owned mask');
                  table.count = paA(pa) + 1;
                  table.masks.set(t.keepMask, paA(pa) * 4);
                }
                assert(rep.isLegal(live, pa, table), `replica rejects packed action ${k}`);
                const a = toAIAction(live, pa, table); actions.push(a);
                assert(isLegalAction(canonical, a), `canonical rejects packed action ${k}: ${JSON.stringify(a)}`);
                rep.make(live, pa, u, table); applied++;
                const next = applyAction(canonical, a);
                assert.notEqual(next, canonical); canonical = next;
                report.counts.canonicalActions++;
                assert.deepEqual(project(rep.unpack(live)), project(canonical), `state differs after action ${k}`);
                report.counts.stateComparisons++;
              }
              complete(state, canonical);
              assert.deepEqual([live.kposLo, live.kposHi], [t.endLo, t.endHi]);
              assert.deepEqual(decodeTurn(p, t, newKeepSetTable()), actions, 'production decode differs');
              const verified = verifyTurn(rep, state, p, t, newKeepSetTable());
              assert(verified.verified, verified.reason);
              assert.deepEqual(project(verified.endState), project(canonical));
              tr.canonicalActions = actions;
              const wrong = cloneTurn(t); wrong.endLo ^= 1;
              fault('wrong-end-key', rep, state, p, wrong);
              if (t.keepMask && actions.some(a => a.type === 'PAY_UPKEEP')) {
                const missing = cloneTurn(t); delete missing.keepMask;
                fault('missing-upkeep-choice', rep, state, p, missing);
              }
              if (state.turn.phase === 'action' && !state.upkeepPending && !faultSeen.has('truncated-end-action')) {
                const endAction = { type: 'END_ACTION_PHASE' };
                if (isLegalAction(state, endAction)) {
                  const partial = applyAction(state, endAction);
                  if (partial.phase === 'playing' && partial.turn.currentPlayer === state.turn.currentPlayer) {
                    const q = rep.pack(partial, allocState()), bad = cloneTurn(t);
                    bad.actions.fill(0); bad.actions[0] = paMake(AKind.END_ACTION); bad.count = 1;
                    bad.endLo = q.kposLo; bad.endHi = q.kposHi;
                    fault('truncated-end-action', rep, state, p, bad);
                  }
                }
              }
              if (canonical.phase === 'playing' && t.count < 24 && !faultSeen.has('opponent-continuation')) {
                const extra = { type: 'END_ACTION_PHASE' };
                assert(isLegalAction(canonical, extra));
                const q = rep.pack(applyAction(canonical, extra), allocState()), bad = cloneTurn(t);
                bad.actions[bad.count++] = paMake(AKind.END_ACTION); bad.endLo = q.kposLo; bad.endHi = q.kposHi;
                fault('opponent-continuation', rep, state, p, bad);
              }
            } finally {
              for (let k = 0; k < applied; k++) rep.unmake(live, u);
              assert.deepEqual(snapshot(live), beforeTurn, 'full-byte unmake differs');
              report.counts.fullUnmakes++;
            }
          }, tr);
        }
        const engine = new HardEngine();
        row.searchEngineIdentity = productionIdentity(engine);
        const result = await engine.searchTurn(state, { work: 25_000 });
        row.search = result;
        assert.equal(JSON.stringify(state), originalRoot, 'Search mutated canonical root');
        check(`${id}:Hard search`, () => {
          assert.equal(result.fallback, undefined, `fallback ${result.fallback}`);
          for (const key of ['replicaDivergences', 'cappedProverCalls', 'economyCappedProverCalls', 'preparationEconomyCappedProverCalls']) assert.equal(result.stats[key], 0, key);
          assert.equal(engine.ctx.genStats.rescueCapped, 0);
          assert.equal(rep.cappedProverCalls, 0, 'candidate replay home-proof cap');
          const end = replayCanonical(state, result.actions), packedEnd = new Replica().pack(end);
          const endKey = `${(packedEnd.kposHi >>> 0).toString(16).padStart(8, '0')}${(packedEnd.kposLo >>> 0).toString(16).padStart(8, '0')}`;
          assert.equal(result.endKey, endKey, 'Hard result end key differs');
        });
        report.counts.searchResults++;
      } catch (e) {
        report.failures.push({ label: `${id}:execution`, error: e instanceof Error ? e.stack : String(e) });
      } finally {
        row.rootUnchanged = JSON.stringify(state) === originalRoot;
        check(`${id}:canonical root unchanged`, () => assert(row.rootUnchanged));
      }
      console.log(JSON.stringify({ id, candidates: row.generation?.n, failures: report.failures.length }));
    }
    check('fault coverage', () => assert.deepEqual([...faultSeen].sort(), ['missing-upkeep-choice', 'opponent-continuation', 'truncated-end-action', 'wrong-end-key'].sort()));
  } catch (e) { fatal = e; }
  if (fatal) report.failures.push({ label: 'fatal', error: fatal instanceof Error ? fatal.stack : String(fatal) });
  try {
    const after = hashes(scan()); report.sourceHashesAfter = after;
    report.sourceDrift = before ? [...new Set([...Object.keys(before),...Object.keys(after)])].filter(p=>before![p]!==after[p]).sort() : ['before-source-snapshot-unavailable'];
    report.driverSha256After = sha(fs.readFileSync(import.meta.filename));
    report.driverDrift = !report.driverSha256 || report.driverSha256After !== report.driverSha256;
    report.inputSha256After = sha(fs.readFileSync(inputPath));
    report.inputDrift = !report.inputSha256 || report.inputSha256After !== report.inputSha256;
  } catch(e) { report.failures.push({ label: 'final provenance', error: e instanceof Error ? e.stack : String(e) }); }
  report.finishedAt = new Date().toISOString();
  report.success = !fatal && report.failures.length === 0 && report.sourceDrift?.length === 0 && !report.driverDrift && !report.inputDrift && !!report.engineIdentity && report.counts.roots === 44;
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ success: report.success, counts: report.counts, failures: report.failures.length, sourceDrift: report.sourceDrift }));
  if (!report.success) process.exitCode = 1;
});
