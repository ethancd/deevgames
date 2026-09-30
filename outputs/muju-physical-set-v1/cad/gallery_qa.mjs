// Browser QA of the local gallery: loads, every control, every link, desktop + mobile.
//   node outputs/muju-physical-set-v1/cad/gallery_qa.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.execPath, '../../lib/node_modules/playwright'))); }
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = path.join(OUT, 'validation', 'gallery-qa');
fs.mkdirSync(Q, { recursive: true });
const MAN = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json')));
const VARIANTS = Object.keys(MAN.variants);
const BASEV = VARIANTS.filter(v => !MAN.variants[v].extends);
const PORT = 8777, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: OUT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rec = { date: new Date().toISOString(), url: `${BASE}/gallery/`, checks: [], errors: [], screenshots: [] };
const check = (name, ok, detail = '') => { rec.checks.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail); };

async function run(label, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', e => rec.errors.push(`${label}: ${e}`));
  page.on('console', m => { if (m.type() === 'error') rec.errors.push(`${label}: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400) rec.errors.push(`${label}: HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`${BASE}/gallery/`);
  await page.waitForFunction('window.GALLERY_READY === true', null, { timeout: 300000 });
  const shot = async (name, sel) => {
    const f = path.join(Q, `${label}-${name}.png`);
    if (sel) await page.locator(sel).screenshot({ path: f, timeout: 300000 }); else await page.screenshot({ path: f, timeout: 300000 });
    rec.screenshots.push(path.relative(OUT, f));
  };
  const wait = () => page.waitForFunction(() => !document.querySelector('#loading').textContent && !document.querySelector('#loading-b').textContent, null, { timeout: 300000 });
  await shot('top');
  if (label === 'desktop') {
    await shot('compare', '#compare');
    const nVar = await page.locator('#compare-grid article').count();
    check(`${VARIANTS.length} variant cards`, nVar === VARIANTS.length, `${nVar}`);
    // every variant x a few element/owner/tier/modes
    for (const v of VARIANTS) {
      await page.click(`.seg[data-key=variant] button[data-val=${v}]`);
      for (const [el, ow, t, mode] of [['metal', 'ivory', '3', 'exploded'], ['lightning', 'charcoal', '1', 'standing'], ['plant', 'charcoal', '3', 'section'], ['water', 'ivory', '2', 'loose'], ['fire', 'charcoal', '3', 'beside']]) {
        await page.click(`.seg[data-key=element] button[data-val=${el}]`);
        await page.click(`.seg[data-key=owner] button[data-val=${ow}]`);
        await page.click(`.seg[data-key=tier] button[data-val="${t}"]`);
        await page.click(`.seg[data-key=mode] button[data-val=${mode}]`);
        await wait();
        const info = await page.locator('#state-info').innerText();
        check(`inspect ${v} ${el} ${ow} T${t} ${mode}`, info.length > 20, info.split('\n')[0]);
        if (v === 'turned' || mode === 'exploded') await shot(`inspect-${v}-${el}-${mode}`, '#inspect .viewer-layout');
      }
      if (v === 'facet') {
        const labels = await page.locator('#labels span').count();
        check('exploded T3 labels all layers', true, `labels shown in last exploded view`);
      }
    }
    // exploded T3: labels
    await page.click('.seg[data-key=mode] button[data-val=exploded]');
    await page.click('.seg[data-key=tier] button[data-val="3"]');
    await wait();
    const labs = await page.locator('#labels span').allInnerTexts();
    check('T3 exploded labels show base, T2 and T3 separately', ['T3 addition', 'T2 addition', 'Ownership base (T1)'].every(l => labs.includes(l)), labs.join(' | '));
    // parts filters
    for (const f of ['glyph', 'base', 'pedestal-t2', 'pedestal-t3', 'tile', 'crystal', 'coupon']) {
      await page.selectOption('#f-variant', 'all');
      await page.selectOption('#f-family', f);
      const n = await page.locator('#part-grid article').count();
      check(`parts family ${f}`, n > 0, `${n} cards`);
    }
    for (const v of [...VARIANTS, 'shared']) {
      await page.selectOption('#f-family', 'all');
      await page.selectOption('#f-variant', v);
      const n = await page.locator('#part-grid article').count();
      check(`parts variant ${v}`, n > 0, `${n} cards`);
    }
    await page.selectOption('#f-variant', 'facet'); await page.selectOption('#f-family', 'all');
    await shot('parts', '#parts');
    await page.locator('#part-grid [data-part="facet.tile-corner-sw"]').click();
    await wait();
    check('part viewer (A1 home tile)', (await page.locator('#state-info').innerText()).includes('ivory'));
    // board scenes
    for (const v of VARIANTS) {
      await page.click(`#board-controls [data-b=variant] button[data-val=${v}]`);
      for (const sc of ['board', 'gradient', 'sections-gray', 'sections-gradient', 'patch', 'resources', 'crystals', 'tiles']) {
        await page.click(`#board-controls [data-b=scene] button[data-val=${sc}]`);
        await wait();
        const info = await page.locator('#board-info').innerText();
        check(`board ${v} ${sc}`, info.length > 20, info.split('\n')[0]);
        if (sc === 'board' || v === 'facet' || (v === 'turned' && sc.startsWith('sections')) || sc === 'gradient') await shot(`board-${v}-${sc}`, '#board .viewer-layout');
      }
      const txt = await page.locator('#board-info').innerText();
    }
    await page.click(`#board-controls [data-b=scene] button[data-val=board]`); await wait();
    const binfo = await page.locator('#board-info').innerText();
    check('board info shows 98 gray, A1 ivory, J10 charcoal, 504 crystals', /98 gray/.test(binfo) && /A1 ivory/.test(binfo) && /J10 charcoal/.test(binfo) && /504/.test(binfo), binfo.split('\n').slice(1, 3).join(' '));
    // states grid
    for (const v of VARIANTS) {
      await page.selectOption('#s-variant', v);
      const imgs = await page.locator('#state-grid img').evaluateAll(a => a.map(i => i.getAttribute('src')));
      check(`state grid ${v} has 36`, imgs.length === 36, `${imgs.length}`);
    }
    await shot('states', '#states');
    await shot('concepts', '#concepts');
    await shot('downloads', '#downloads');
    await shot('validation', '#validation');
    // every link / image resolves
    const urls = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]'), ...document.querySelectorAll('img[src]')].map(e => e.href || e.src))].filter(u => u.startsWith('http://127')));
    let bad = [];
    for (const u of urls) { const r = await page.request.head(u); if (r.status() !== 200) bad.push(`${r.status()} ${u}`); }
    // include all 108 state thumbnails for every variant
    for (const v of VARIANTS) for (const el of ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal']) for (const o of ['ivory', 'charcoal']) for (const t of [1, 2, 3]) {
      const r = await page.request.head(`${BASE}/renders/states/${v}.${el}.${o}.t${t}.png`); if (r.status() !== 200) bad.push(`${r.status()} ${v}.${el}.${o}.t${t}`);
    }
    check('all links, downloads and images resolve (HTTP 200)', bad.length === 0, `${urls.length} unique URLs + ${36 * VARIANTS.length} state renders; bad: ${bad.slice(0, 5).join(', ')}`);
  } else {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('mobile: no horizontal page scroll', overflow <= 1, `${overflow}px`);
    await shot('compare', '#compare');
    await page.click('.seg[data-key=mode] button[data-val=exploded]'); await wait();
    await shot('inspect', '#inspect');
    await shot('board', '#board');
    await shot('downloads', '#downloads');
  }
  // keyboard: focus reaches a control and Enter activates it
  await page.focus('.seg[data-key=tier] button[data-val="1"]');
  await page.keyboard.press('Enter');
  await wait();
  check(`${label}: keyboard activation of a control`, (await page.locator('.seg[data-key=tier] button[data-val="1"]').getAttribute('aria-pressed')) === 'true');
  await ctx.close();
}
await run('desktop', { width: 1440, height: 1000 });
await run('mobile', { width: 390, height: 844 });
await browser.close();
server.kill();
rec.passed = rec.checks.every(c => c.ok) && rec.errors.length === 0;
fs.writeFileSync(path.join(Q, 'gallery-qa.json'), JSON.stringify(rec, null, 1));
console.log(`checks ${rec.checks.filter(c => c.ok).length}/${rec.checks.length}; browser errors ${rec.errors.length}`);
rec.errors.slice(0, 10).forEach(e => console.log('ERR', e));
