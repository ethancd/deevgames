// Shared-queue wrapper. The caller supplies a fresh evidence directory and one
// command as separate argv fields; no shell interpolation or pipeline exit loss.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { acquireHeavySlot, reassignSlot, heavyBypassed } from './deevgames-phasing-m6/muju/lab/hard-ai/ladder/heavy.ts';

const repo = '/Users/ashkie/Documents/Codex/2026-09-18/wba/work/deevgames-phasing-m6/muju';
const [dir, label, ...command] = process.argv.slice(2);
assert(dir && path.isAbsolute(dir) && label && command.length);
assert(/^[a-zA-Z0-9_-]+$/.test(label));
assert(!heavyBypassed());
assert(!process.env.MUJU_HEAVY_DIR && !process.env.MUJU_HEAVY_SLOTS, 'Shared queue overrides are forbidden');
assert(!fs.existsSync(dir), 'Use a fresh directory; do not overwrite failures');
fs.mkdirSync(dir, { recursive: true });
const hash = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const release = await acquireHeavySlot(`codex-m6-${label}`);
try {
  const scan = () => execFileSync('rg', ['--files', 'src', 'server', 'lab', 'tests', 'vitest.config.ts'], { cwd: repo, encoding: 'utf8' }).trim().split('\n')
    .filter(p => /\.(?:ts|tsx|json)$/.test(p) && !p.startsWith('lab/results/') && !p.includes('/openings/') && !p.includes('/corpus/')).sort();
  const paths = scan();
  // Source plus test code; this wrapper never reads opening/corpus contents.
  const before = Object.fromEntries(paths.map(p => [p, hash(`${repo}/${p}`)]));
  const result: any = {
    startedAt: new Date().toISOString(), label, cwd: repo, command,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    statusBefore: execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }),
    quarantineSelection: process.env.MUJU_RUN_QUARANTINE ?? null,
    sourceHashes: before, wrapperSha256: hash(import.meta.filename),
  };
  const fd = fs.openSync(path.join(dir, 'command.log'), 'wx');
  try {
    const child = spawn(command[0], command.slice(1), { cwd: repo, stdio: ['ignore', fd, fd], env: process.env });
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    if (child.pid !== undefined) {
      result.childPid = child.pid;
      if (!reassignSlot(release, child.pid)) {
        child.kill('SIGTERM');
        await exited;
        throw new Error('Could not attach the shared queue slot to the actual child');
      }
    }
    result.exitCode = await exited;
  } catch (e) { result.error = e instanceof Error ? e.stack : String(e); }
  finally { fs.closeSync(fd); }
  result.finishedAt = new Date().toISOString();
  result.sourceDrift = paths.filter(p => !fs.existsSync(`${repo}/${p}`) || hash(`${repo}/${p}`) !== before[p]);
  result.sourceDrift.push(...scan().filter(p => !(p in before)));
  result.statusAfter = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
  result.success = result.exitCode === 0 && result.sourceDrift.length === 0;
  fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ label, exitCode: result.exitCode, success: result.success, sourceDrift: result.sourceDrift, error: result.error }));
  if (!result.success) process.exitCode = 1;
} finally { release(); }
