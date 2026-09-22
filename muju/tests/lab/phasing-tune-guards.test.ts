// @vitest-environment node
/** Source-boundary controls use ONLY files synthesized in this test's tmpdir. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WEIGHTS, PHASING_EVAL_SCHEMA, WEIGHTS_VERSION, WEIGHTS_FILE_SCHEMA } from '../../src/ai/hard/eval/weights';
import {
  CORPUS_MANIFEST_SCHEMA, DEV_POOL_PATH, ROW_SCHEMA, SOURCE_ALLOWLIST_SCHEMA,
  assertCurrentRow, createFreshOutput, hashText, loadRefusalRules, loadSourceApproval, preflightRuns,
  readRows, refusalFor, writeRows, type SourceAllowlist, type TexelRow,
} from '../../lab/hard-ai/tune/rows';
import { ACCOUNTING_PINS, assertAccountingPins, freeParams, PARAM_COUNT, FIRE_1, parseArgs as texelArgs } from '../../lab/hard-ai/tune/texel';
import { parseArgs as corpusArgs } from '../../lab/hard-ai/tune/corpus';

const temps: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const identity = { featureSchema: PHASING_EVAL_SCHEMA, featureCount: 62, weightsVersion: 2 } as const;
const runPath = 'lab/results/phasing-dev-run', corpusPath = 'lab/results/phasing-dev-corpus';
const poolHash = 'a'.repeat(64);
function row(): TexelRow {
  return { schema: ROW_SCHEMA, featureSchema: PHASING_EVAL_SCHEMA, weightsVersion: 2,
    id: 'authored-row', result: 0.5, side: 0, turn: 1, features: Array(62).fill(0), material: Array(18).fill(0),
    kpos: '0000000000000000', opening: 'p1-authored-a', pool: DEV_POOL_PATH, handicap: 0,
    game: 'authored-game', run: runPath, actions: 4, split: 'train' };
}
function fixture() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'phasing-tune-guards-')); temps.push(root);
  const write = (rel: string, value: unknown): string => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
    return hashText(text);
  };
  const runManifest = { schema: 'muju-ladder-manifest-v1', status: 'complete', voided: false,
    rules: { rulesVersion: 'muju-phasing-1' }, openings: { path: DEV_POOL_PATH, sha256: poolHash, ids: ['p1-authored-a'] },
    aResolvedConfig: { engine: 'hard', config: { weights: { featureSchema: PHASING_EVAL_SCHEMA, version: 2, w: Array.from(DEFAULT_WEIGHTS.w), material: Array.from(DEFAULT_WEIGHTS.material) } } } };
  const manifestSha256 = write(`${runPath}/manifest.json`, runManifest);
  const gamesSha256 = write(`${runPath}/games.jsonl`, 'AUTHORED SENTINEL: must not be opened during metadata preflight');
  const positionsSha256 = write(`${corpusPath}/positions.jsonl`, `${JSON.stringify(row())}\n`);
  const corpusManifest = { schema: CORPUS_MANIFEST_SCHEMA, ...identity, rulesVersion: 'muju-phasing-1',
    pool: { path: DEV_POOL_PATH, sha256: poolHash }, openings: ['p1-authored-a'], positionsSha256,
    sourceAllowlistSha256: 'c'.repeat(64), sources: [{ path: runPath, manifestSha256, gamesSha256 }] };
  const m: SourceAllowlist = { schema: SOURCE_ALLOWLIST_SCHEMA, ...identity, rulesVersion: 'muju-phasing-1',
    pool: { path: DEV_POOL_PATH, sha256: poolHash, openingIds: ['p1-authored-a'] },
    runs: [{ path: runPath, manifestSha256, gamesSha256, openingIds: ['p1-authored-a'], replays: [] }],
    corpora: [{ path: corpusPath, manifestSha256: write(`${corpusPath}/manifest.json`, corpusManifest), positionsSha256 }] };
  const allow = 'reviewed.allowlist.json';
  const save = () => write(allow, m);
  return { root, write, m, allow, save, runManifest, corpusManifest };
}
function opened(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map(args => String(args[0]));
}
function dataReads(files: string[]): string[] { return files.filter(f => /(?:games|positions)\.jsonl$|\/replays\//.test(f)); }

describe('M6 tuning metadata preflight before data reads', () => {
  it('refusal rules never inspect any pool, and admit only the exact p1-dev metadata path', () => {
    const read = vi.spyOn(fs, 'readFileSync');
    const rules = loadRefusalRules('/deliberately/not/a/repo');
    expect(read).not.toHaveBeenCalled();
    expect(rules.ids.size).toBe(0);
    for (const pool of [null, 'p1-dev.jsonl', 'lab/hard-ai/ladder/openings/p1-val.jsonl', 'lab/hard-ai/ladder/openings/p1-sealed.jsonl',
      'lab/hard-ai/ladder/openings/e1-dev.jsonl', 'elsewhere/p1-dev.jsonl']) expect(refusalFor('p1-authored-a', pool, rules)).toBe('pool');
    expect(refusalFor('p1-authored-a', DEV_POOL_PATH, rules)).toBeNull();
  });
  it('requires explicit source metadata and expected hash without opening data', () => {
    const f = fixture(), read = vi.spyOn(fs, 'readFileSync');
    expect(() => loadSourceApproval(f.root, undefined, undefined)).toThrow(/SHA-256/);
    expect(() => readRows(path.join(f.root, corpusPath))).toThrow(/approval/);
    expect(read).not.toHaveBeenCalled();
  });
  it('an approved run preflight opens only its allowlist and bound manifest', () => {
    const f = fixture(), hash = f.save(), read = vi.spyOn(fs, 'readFileSync');
    const approval = loadSourceApproval(f.root, f.allow, hash);
    expect(preflightRuns(approval, [runPath])).toHaveLength(1);
    expect(opened(read)).toEqual([path.join(f.root, f.allow), path.join(f.root, runPath, 'manifest.json')]);
  });
  it.each(['sealed', 'val', 'unlisted'])('rejects %s source request before any data opens', name => {
    const f = fixture(), hash = f.save(), read = vi.spyOn(fs, 'readFileSync');
    const approval = loadSourceApproval(f.root, f.allow, hash);
    expect(() => preflightRuns(approval, [runPath, `lab/results/p1-${name}`])).toThrow(/preflight/);
    expect(dataReads(opened(read))).toEqual([]);
  });
  it.each(['pool', 'rules', 'status', 'weights'])('rejects approved metadata with wrong %s before games', kind => {
    const f = fixture();
    if (kind === 'pool') f.runManifest.openings.path = 'lab/hard-ai/ladder/openings/p1-val.jsonl';
    if (kind === 'rules') f.runManifest.rules.rulesVersion = 'muju-standard';
    if (kind === 'status') f.runManifest.status = 'running';
    if (kind === 'weights') f.runManifest.aResolvedConfig.config.weights.version = 1;
    f.m.runs[0].manifestSha256 = f.write(`${runPath}/manifest.json`, f.runManifest);
    const hash = f.save(), read = vi.spyOn(fs, 'readFileSync');
    const approval = loadSourceApproval(f.root, f.allow, hash);
    expect(() => preflightRuns(approval, [runPath])).toThrow(/preflight/);
    expect(dataReads(opened(read))).toEqual([]);
  });
  it('rejects tampered allowlist or manifest bytes before data', () => {
    const f = fixture(), hash = f.save(); f.write(`${runPath}/manifest.json`, { ...f.runManifest, status: 'incomplete' });
    const read = vi.spyOn(fs, 'readFileSync');
    expect(() => loadSourceApproval(f.root, f.allow, 'f'.repeat(64))).toThrow(/hash mismatch/);
    const approval = loadSourceApproval(f.root, f.allow, hash);
    expect(() => preflightRuns(approval, [runPath])).toThrow(/hash mismatch/);
    expect(dataReads(opened(read))).toEqual([]);
  });
  it('rejects a source symlink before reading its target', () => {
    const f = fixture(), hash = f.save();
    const manifest = path.join(f.root, runPath, 'manifest.json'); fs.renameSync(manifest, manifest + '.original'); fs.symlinkSync(manifest + '.original', manifest);
    const read = vi.spyOn(fs, 'readFileSync');
    const approval = loadSourceApproval(f.root, f.allow, hash);
    expect(() => preflightRuns(approval, [runPath])).toThrow(/symbolic/);
    expect(opened(read)).toEqual([path.join(f.root, f.allow)]);
  });
  it('requires approved current corpus/source manifests before reading positions', () => {
    const f = fixture();
    const staleManifest = { ...f.corpusManifest, weightsVersion: 1 };
    f.m.corpora[0].manifestSha256 = f.write(`${corpusPath}/manifest.json`, staleManifest);
    const hash = f.save(), read = vi.spyOn(fs, 'readFileSync');
    const approval = loadSourceApproval(f.root, f.allow, hash);
    expect(() => readRows(path.join(f.root, corpusPath), approval)).toThrow(/version 2/);
    expect(dataReads(opened(read))).toEqual([]);
  });
  it('reads a hash-bound synthetic current corpus without opening any pool, game or replay', () => {
    const f = fixture(), hash = f.save(), read = vi.spyOn(fs, 'readFileSync');
    const approval = loadSourceApproval(f.root, f.allow, hash);
    expect(readRows(path.join(f.root, corpusPath), approval)).toEqual([row()]);
    expect(dataReads(opened(read))).toEqual([path.join(f.root, corpusPath, 'positions.jsonl')]);
    expect(opened(read).some(file => file.includes('/openings/'))).toBe(false);
  });
  it('rejects changed authorized positions by hash before parsing their contents', () => {
    const f = fixture(), hash = f.save(); f.write(`${corpusPath}/positions.jsonl`, 'not even JSON');
    const approval = loadSourceApproval(f.root, f.allow, hash);
    expect(() => readRows(path.join(f.root, corpusPath), approval)).toThrow(/hash mismatch/);
  });
});

describe('M6 current tuning shape, fixed coefficients and immutable outputs', () => {
  it('requires current row schema, 62 integer features and version2', () => {
    expect(() => assertCurrentRow(row())).not.toThrow();
    expect(() => assertCurrentRow({ ...row(), schema: 'muju-texel-v1' as never })).toThrow(/row/);
    expect(() => assertCurrentRow({ ...row(), featureSchema: undefined })).toThrow(/schema/);
    expect(() => assertCurrentRow({ ...row(), weightsVersion: 1 })).toThrow(/version 2/);
    expect(() => assertCurrentRow({ ...row(), features: Array(58).fill(0) })).toThrow(/62/);
    const bad = row(); bad.features[58] = NaN; expect(() => assertCurrentRow(bad)).toThrow(/row/);
  });
  it('fixes cash/escrow coefficients and fire_1 throughout the coordinate parameter set', () => {
    expect(WEIGHTS_VERSION).toBe(2); expect(WEIGHTS_FILE_SCHEMA).toBe('muju-weights-phasing-v1');
    // BankExcess (3) became a free parameter on 2026-09-21: the 2026-09-20
    // repair chose 25 empirically, so it is a tunable preference rather than an
    // accounting identity, and pinning it at 100 made this very assertion throw
    // on the shipped vector.
    expect(ACCOUNTING_PINS).toEqual({ 2: 100, 58: 1 });
    const vector = { w: Array.from(DEFAULT_WEIGHTS.w), material: Array.from(DEFAULT_WEIGHTS.material) };
    expect(() => assertAccountingPins(vector)).not.toThrow();
    for (const index of [0, 2, 58, 62 + FIRE_1]) expect(freeParams()).not.toContain(index);
    expect(freeParams()).toContain(3);
    expect(freeParams()).toHaveLength(PARAM_COUNT - 4);
    for (const index of [2, 58]) { const bad = { w: [...vector.w], material: vector.material }; bad.w[index]++; expect(() => assertAccountingPins(bad)).toThrow(/pinned/); }
    expect(() => assertAccountingPins({ w: vector.w, material: vector.material.map((v, i) => i === FIRE_1 ? 301 : v) })).toThrow(/fire_1/);
  });
  it('CLI calls require fresh outputs and explicit metadata authority', () => {
    expect(() => corpusArgs(['--runs', 'lab/results/dev'])).toThrow(/source-allowlist/);
    expect(() => texelArgs(['--corpus', 'lab/results/dev'])).toThrow(/source-allowlist/);
  });
  it('exclusive directories and row writes cannot overwrite a previous artifact', () => {
    const f = fixture(), out = path.join(f.root, 'fresh-output'); createFreshOutput(out, f.root);
    const file = writeRows(out, [row()]), before = fs.readFileSync(file, 'utf8');
    expect(() => writeRows(out, [])).toThrow();
    expect(() => createFreshOutput(out, f.root)).toThrow(/fresh/);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
});
