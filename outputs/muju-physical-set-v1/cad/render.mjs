// Render the exported GLB geometry (actual model files) to PNG with headless Chromium.
//   node outputs/muju-physical-set-v1/cad/render.mjs [--quick]
// Requires the global `playwright` package and its Chromium; starts its own static server.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.execPath, '../../lib/node_modules/playwright'))); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const R = path.join(OUT, 'renders');
fs.mkdirSync(path.join(R, 'parts'), { recursive: true });
fs.mkdirSync(path.join(R, 'states'), { recursive: true });
const PORT = 8765;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: OUT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json')));
const VARIANTS = Object.keys(manifest.variants);
const ELEMENTS = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
const quick = process.argv.includes('--quick');
// --missing: resume an interrupted run; skip images already newer than manifest.json
const missing = process.argv.includes('--missing');
const MAN_T = fs.statSync(path.join(OUT, 'manifest.json')).mtimeMs;
const fresh = f => missing && fs.existsSync(f) && fs.statSync(f).mtimeMs > MAN_T;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1300 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

async function shot(file, params, w = 1200, h = 800) {
  if (fresh(file)) return;
  const qs = new URLSearchParams({ ...params, w, h }).toString();
  await page.goto(`http://127.0.0.1:${PORT}/gallery/render.html?${qs}`);
  await page.waitForFunction('window.READY === true', null, { timeout: 600000 });
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h }, timeout: 600000 });
  process.stdout.write('.');
}

const jobs = [];
for (const v of VARIANTS) {
  jobs.push([`${v}-lineup.png`, { scene: 'lineup', v }, 1600, 900]);
  jobs.push([`${v}-t3-exploded.png`, { scene: 't3-exploded', v, el: 'metal', owner: 'ivory' }, 900, 1000]);
  jobs.push([`${v}-t3-section.png`, { scene: 'state', v, el: 'lightning', owner: 'charcoal', tier: 3, clip: 1 }, 900, 1000]);
  jobs.push([`${v}-board.png`, { scene: 'board', v }, 1600, 1200]);
  jobs.push([`${v}-patch.png`, { scene: 'patch', v }, 1400, 1000]);
  jobs.push([`${v}-beside.png`, { scene: 'beside', v, el: 'water', owner: 'charcoal', tier: 3, loose: 'metal' }, 1000, 800]);
  jobs.push([`${v}-resources.png`, { scene: 'resources', v }, 1600, 700]);
  jobs.push([`${v}-tiles.png`, { scene: 'tiles', v }, 1000, 900]);
  if (!manifest.variants[v].extends) {
    jobs.push([`${v}-gradient.png`, { scene: 'gradient', v }, 1600, 1200]);
    jobs.push([`${v}-sections-gray.png`, { scene: 'sections-gray', v }, 1600, 1200]);
    jobs.push([`${v}-sections-gradient.png`, { scene: 'sections-gradient', v }, 1600, 1200]);
  }
}
jobs.push(['shared-crystals.png', { scene: 'crystals', v: 'facet' }, 1200, 700]);
for (const [f, p, w, h] of jobs) await shot(path.join(R, f), p, w, h);
if (!quick) {
  for (const p of manifest.parts.filter(p => !p.alias_of && p.family !== 'board-section')) {
    const color = Object.keys(p.geometry.glb)[0];
    await shot(path.join(R, 'parts', `${p.id}.png`), { scene: 'part', id: p.id, color }, 480, 400);
  }
  for (const v of VARIANTS) for (const el of ELEMENTS) for (const owner of ['ivory', 'charcoal']) for (const tier of [1, 2, 3])
    await shot(path.join(R, 'states', `${v}.${el}.${owner}.t${tier}.png`), { scene: 'state', v, el, owner, tier }, 320, 400);
}
await browser.close();
server.kill();
fs.writeFileSync(path.join(R, 'render-log.json'), JSON.stringify({ date: new Date().toISOString(), renderer: 'three.js r170 in headless Chromium (SwiftShader)', source: 'exported GLB files in models/', errors }, null, 1));
console.log(`\nrendered ${jobs.length} scenes${quick ? '' : ` + part thumbnails + ${36 * VARIANTS.length} state renders`}; browser errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
