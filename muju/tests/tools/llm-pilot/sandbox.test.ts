// @vitest-environment node
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildSandboxProfile, buildSandboxedArgv, parseTimeCpuSeconds, runSandboxedHelper, sumHelperCpuSeconds,
  REPO_SRC_ROOT, HELPER_CPU_LIMIT_SECONDS,
} from '../../../tools/llm-pilot/sandbox';

describe('buildSandboxProfile', () => {
  it('denies network, and read/write under the given subpath; allows everything else', () => {
    const profile = buildSandboxProfile('/Users/ashkie/src');
    expect(profile).toContain('(allow default)');
    expect(profile).toContain('(deny network*)');
    expect(profile).toContain('(deny file-read* (subpath "/Users/ashkie/src"))');
    expect(profile).toContain('(deny file-write* (subpath "/Users/ashkie/src"))');
  });
  it('defaults to denying the whole repo source root (which also contains the campaign dir and every game\'s secrets/)', () => {
    expect(buildSandboxProfile()).toContain(`(subpath "${REPO_SRC_ROOT}")`);
    expect(REPO_SRC_ROOT).toBe('/Users/ashkie/src');
  });
});

describe('buildSandboxedArgv', () => {
  it('wraps the command in sandbox-exec with a written profile, a ulimit CPU cap, and nice', () => {
    const { bin, argv, profilePath } = buildSandboxedArgv('python3', ['helper.py', '--flag'], { cpuLimitSeconds: 60 });
    expect(bin).toBe('/usr/bin/sandbox-exec');
    expect(argv).toEqual(expect.arrayContaining(['-f', profilePath, '/usr/bin/time', '-l']));
    const joined = argv.join(' ');
    expect(joined).toContain('ulimit -t 60');
    expect(joined).toContain('nice -n 10');
    expect(argv.slice(-4)).toEqual(['muju-helper', 'python3', 'helper.py', '--flag']);
    expect(existsSync(profilePath)).toBe(true);
    expect(readFileSync(profilePath, 'utf8')).toContain('(deny network*)');
  });
  it('honors a custom CPU limit', () => {
    const { argv } = buildSandboxedArgv('node', ['x.js'], { cpuLimitSeconds: 5 });
    expect(argv.join(' ')).toContain('ulimit -t 5');
  });
});

describe('parseTimeCpuSeconds', () => {
  it('parses BSD `/usr/bin/time -l` trailer (user + sys)', () => {
    const sample = `some helper output\n        0.12 real         0.05 user         0.02 sys\n  1234567  maximum resident set size\n`;
    expect(parseTimeCpuSeconds(sample)).toBeCloseTo(0.07, 5);
  });
  it('returns null when the trailer is missing (e.g. killed before time could report)', () => {
    expect(parseTimeCpuSeconds('no timing info here')).toBeNull();
  });
});

describe('runSandboxedHelper (real sandbox-exec, no network required)', () => {
  let dir: string;
  let heavyDir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'muju-sandbox-test-'));
    heavyDir = mkdtempSync(path.join(os.tmpdir(), 'muju-heavy-test-'));
    process.env.MUJU_HEAVY_DIR = heavyDir;
  });

  it('runs a legitimate helper (echo) successfully and records CPU usage to helper-usage.jsonl', async () => {
    const result = await runSandboxedHelper('/bin/echo', ['hello-from-helper'], { cwd: dir, gameDir: dir, label: 'test' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello-from-helper');
    const usagePath = path.join(dir, 'player', 'helper-usage.jsonl');
    expect(existsSync(usagePath)).toBe(true);
    const entries = readFileSync(usagePath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    expect(entries).toHaveLength(1);
    expect(entries[0].exitCode).toBe(0);
    const { totalCpuSeconds, runs } = sumHelperCpuSeconds(dir);
    expect(runs).toBe(1);
    expect(totalCpuSeconds).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('cannot read this repo\'s own source (denied by the sandbox, not by Unix permissions)', async () => {
    const targetFile = path.resolve(__dirname, '../../../tools/llm-pilot/players.ts');
    expect(existsSync(targetFile)).toBe(true); // sanity: the file really exists and is readable by this test process
    const result = await runSandboxedHelper('/bin/cat', [targetFile], { cwd: dir, gameDir: dir, label: 'test-read-repo' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain('export function claudeToolsFor');
  }, 30_000);

  it('cannot reach the network', async () => {
    const result = await runSandboxedHelper('/usr/bin/curl', ['-sS', '--max-time', '5', 'https://example.com'], { cwd: dir, gameDir: dir, label: 'test-network' });
    expect(result.exitCode).not.toBe(0);
  }, 30_000);

  it('a CPU-bound helper is killed by ulimit -t well before a generous wall-clock bound (custom low cap, not the production 60s one)', async () => {
    const { spawnSync } = await import('node:child_process');
    // A tight busy loop with no I/O: `ulimit -t 2` must cut it off (SIGXCPU) within a couple of
    // real seconds, not run forever. Uses buildSandboxedArgv directly with a low cap so the test
    // stays fast; the production path (runSandboxedHelper) always uses HELPER_CPU_LIMIT_SECONDS.
    const { bin, argv } = buildSandboxedArgv('/bin/sh', ['-c', 'i=0; while true; do i=$((i+1)); done'], { cpuLimitSeconds: 2 });
    const started = Date.now();
    const result = spawnSync(bin, argv, { cwd: dir, timeout: 20_000 });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(result.status).not.toBe(0);
    expect(HELPER_CPU_LIMIT_SECONDS).toBe(60); // the production default this test intentionally overrides
  }, 25_000);
});
