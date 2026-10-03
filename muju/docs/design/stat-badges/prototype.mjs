import { chromium } from '/Users/ashkie/src/deevgames-puzzles/muju/node_modules/playwright/index.mjs';
const OUT = '/tmp/muju-puzzles/stats/shots';
import { mkdirSync } from 'node:fs'; mkdirSync(OUT, { recursive: true });
const STATS = { Hi:[2,1,2,1,'fire'], 'Honō':[3,1,2,1,'fire'], Kagari:[4,2,3,1,'fire'], Radi:[1,1,3,0,'lightning'], Umeme:[2,1,4,0,'lightning'], Kimbunga:[3,1,5,0,'lightning'],
  'Sjór':[2,2,1,2,'water'], Straumr:[2,3,1,2,'water'], 'Ægirinn':[3,4,2,3,'water'], 'Loş':[2,2,2,0,'shadow'], 'Gölge':[3,2,2,1,'shadow'], 'Karanlık':[4,2,3,2,'shadow'],
  Muju:[0,3,1,3,'plant'], Mallki:[1,3,1,5,'plant'], "Sach'akuna":[2,4,1,8,'plant'], 'Poṉ':[1,3,0,3,'metal'], 'Veḷḷi':[1,4,1,4,'metal'], Irumbu:[2,5,2,5,'metal'] };

/** Injected into the page: draws variant `v` on the selected piece (and, for v5, on the previewed target). */
function draw({ v, STATS, target }) {
  document.querySelectorAll('.proto-stats').forEach(e => e.remove());
  const PAIR = { fire: 'FL', lightning: 'FL', plant: 'PM', metal: 'PM', water: 'WS', shadow: 'WS' };
  const BEATS = { FL: 'PM', PM: 'WS', WS: 'FL' };
  const css = `
  .proto-stats{position:absolute;inset:0;pointer-events:none;z-index:40;font:800 12px/1 system-ui,-apple-system,sans-serif}
  .ps-chip{position:absolute;min-width:20px;height:20px;padding:0 5px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 1px 3px #0009,0 0 0 1.5px #0b1220}
  .ps-atk{background:#e5484d}.ps-def{background:#3e7bfa}.ps-spd{background:#e5b400;color:#1a1300}.ps-min{background:#2fb36b}
  .ps-chip.zero{background:#1f2937!important;color:#8b95a7!important;box-shadow:inset 0 0 0 1.5px #4b5563}
  .ps-tl{left:-7px;top:-7px}.ps-tr{right:-7px;top:-7px}.ps-bl{left:-7px;bottom:-7px}.ps-br{right:-7px;bottom:-7px}
  .ps-glyph{gap:3px;height:21px;padding:0 6px 0 4px;background:#0b1220ee;border:1.8px solid}
  .ps-glyph svg{width:11px;height:11px}
  .ps-glyph.ps-atk{border-color:#ff6b70;color:#ffd6d7}.ps-glyph.ps-def{border-color:#6b9bff;color:#dbe6ff}.ps-glyph.ps-spd{border-color:#ffd23f;color:#fff1bf}.ps-glyph.ps-min{border-color:#4ade80;color:#d1fadf}
  .ps-idx{position:absolute;font:900 17px/1 system-ui;text-shadow:0 1px 2px #000,0 0 6px #000c}
  .ps-idx.ps-atk{color:#ff6b70;background:none}.ps-idx.ps-def{color:#7aa7ff;background:none}.ps-idx.ps-spd{color:#ffd23f;background:none}.ps-idx.ps-min{color:#4ade80;background:none}
  .ps-idx.zero{color:#6b7280;text-shadow:none}
  .ps-cell-tl{left:5px;top:4px}.ps-cell-tr{right:5px;top:4px}.ps-cell-bl{left:5px;bottom:4px}.ps-cell-br{right:5px;bottom:4px}
  .ps-ring{position:absolute;inset:-9px}
  .ps-ringnum{position:absolute;font:900 11px/1 system-ui;color:#fff;text-shadow:0 1px 2px #000}
  .ps-eff .old{opacity:.65;font-weight:700;margin-right:1px}.ps-chip.kill{box-shadow:0 0 0 2px #fff,0 0 10px #ffffffaa}
  .ps-def s{opacity:.7;margin-right:2px}`;
  let style = document.getElementById('proto-style');
  if (!style) { style = document.createElement('style'); style.id = 'proto-style'; document.head.appendChild(style); }
  style.textContent = css;
  const cellOf = el => el.closest('.board-cell');
  const info = cell => {
    const m = /, (white|black) ([^,]+), /.exec(cell.getAttribute('aria-label') || '');
    if (!m) return null;
    const [a, d, s, mi, el] = STATS[m[2]];
    const dmgEl = cell.querySelector('.piece-damage');
    const dmg = dmgEl ? Number(dmgEl.textContent.replace(/[^0-9]/g, '')) : 0;
    return { owner: m[1], name: m[2], a, d, s, mi, el, dmg };
  };
  const GLYPH = {
    atk: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 10 9 3M7 2h3v3M2.5 7.5l2 2"/></svg>',
    def: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 1.5 10 3v3c0 2.4-1.7 3.8-4 4.6C3.7 9.8 2 8.4 2 6V3z"/></svg>',
    spd: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 6h7M6.5 3 9.5 6 6.5 9"/></svg>',
    min: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 1.5 9.5 5 6 10.5 2.5 5z"/><path d="M2.5 5h7"/></svg>',
  };
  const selectedCell = document.querySelector('.unit-token.piece-selected')?.closest('.board-square')?.querySelector('.board-cell') || document.querySelector('.board-cell.selected');
  const targetCell = target ? document.querySelector(`[data-testid="cell-${target}"]`) : null;
  const put = (cell, html, inToken = true) => {
    const square = cell.closest('.board-square');
    const host = inToken ? square.querySelector('.unit-token') : square;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const wrap = document.createElement('div'); wrap.className = 'proto-stats'; wrap.innerHTML = html; host.appendChild(wrap);
  };
  const chip = (cls, pos, n, extra = '') => `<span class="ps-chip ${cls} ${pos}${n === 0 ? ' zero' : ''}${extra}">${n}</span>`;
  const s = selectedCell && info(selectedCell);
  if (!s) return 'no selection';
  const defShown = st => st.dmg ? `<s>${st.d}</s>${st.d - st.dmg}` : `${st.d}`;
  if (v === 1) put(selectedCell, chip('ps-atk', 'ps-tl', s.a) + `<span class="ps-chip ps-def ps-tr">${defShown(s)}</span>` + chip('ps-spd', 'ps-bl', s.s) + chip('ps-min', 'ps-br', s.mi));
  if (v === 2) put(selectedCell, ['atk', 'def', 'spd', 'min'].map((k, i) => {
    const n = [s.a, s.d - s.dmg, s.s, s.mi][i], pos = ['ps-tl', 'ps-tr', 'ps-bl', 'ps-br'][i];
    return `<span class="ps-chip ps-glyph ps-${k} ${pos}${n === 0 ? ' zero' : ''}">${GLYPH[k]}${n}</span>`;
  }).join(''));
  if (v === 3) put(selectedCell, ['atk', 'def', 'spd', 'min'].map((k, i) => {
    const n = [s.a, s.d - s.dmg, s.s, s.mi][i], pos = ['ps-cell-tl', 'ps-cell-tr', 'ps-cell-bl', 'ps-cell-br'][i];
    return `<span class="ps-idx ps-${k} ${pos}${n === 0 ? ' zero' : ''}">${n}</span>`;
  }).join(''), false);
  if (v === 4) {
    const max = [4, 5, 5, 8], vals = [s.a, s.d - s.dmg, s.s, s.mi], colors = ['#e5484d', '#3e7bfa', '#e5b400', '#2fb36b'];
    // Quadrants: ATK top-left, DEF top-right, SPD bottom-left, MINE bottom-right; each arc fills its 80° slot by value / max.
    const starts = [-170, -80, 100, 10], R = 46, C = 50;
    const pt = a => [C + R * Math.cos(a * Math.PI / 180), C + R * Math.sin(a * Math.PI / 180)];
    let svg = '<svg class="ps-ring" viewBox="0 0 100 100">';
    starts.forEach((st, i) => {
      const [x0, y0] = pt(st), [x1, y1] = pt(st + 80);
      svg += `<path d="M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}" stroke="#ffffff22" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      const span = 80 * Math.min(1, vals[i] / max[i]);
      if (span > 0) { const [x2, y2] = pt(st + span); svg += `<path d="M${x0} ${y0} A${R} ${R} 0 0 1 ${x2} ${y2}" stroke="${colors[i]}" stroke-width="7" fill="none" stroke-linecap="round"/>`; }
    });
    svg += '</svg>';
    const nums = vals.map((n, i) => { const [x, y] = pt(starts[i] + 40); return `<span class="ps-ringnum" style="left:calc(${x}% - 4px);top:calc(${y}% - 6px)">${n}</span>`; }).join('');
    put(selectedCell, svg + nums);
  }
  if (v === 5) {
    const t = targetCell && info(targetCell);
    let atk = `${s.a}`, kill = false;
    if (t) {
      const mod = BEATS[PAIR[s.el]] === PAIR[t.el] ? 1 : BEATS[PAIR[t.el]] === PAIR[s.el] ? -1 : 0;
      const eff = Math.max(0, s.a + mod), defNow = t.d - t.dmg;
      kill = eff >= defNow;
      atk = mod ? `<span class="old">${s.a}${mod > 0 ? '+1' : '−1'}</span>` : `${s.a}`;
      put(targetCell, `<span class="ps-chip ps-def ps-tr${kill ? ' kill' : ''}">${t.dmg ? `<s>${t.d}</s>` : ''}${defNow}</span>`);
      put(selectedCell, `<span class="ps-chip ps-atk ps-eff ps-tl${kill ? ' kill' : ''}">${atk}</span>` + `<span class="ps-chip ps-def ps-tr">${defShown(s)}</span>` + chip('ps-spd', 'ps-bl', s.s) + chip('ps-min', 'ps-br', s.mi));
    } else put(selectedCell, chip('ps-atk', 'ps-tl', s.a) + `<span class="ps-chip ps-def ps-tr">${defShown(s)}</span>` + chip('ps-spd', 'ps-bl', s.s) + chip('ps-min', 'ps-br', s.mi));
  }
  return 'ok';
}

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await context.addInitScript(() => localStorage.setItem('muju:onboarding:v1', JSON.stringify({ completed: true, at: '2026-10-02T00:00:00.000Z', version: 1 })));
const page = await context.newPage();
// Scenes: a selected own piece; a Speed-0 piece; an attack preview on a hurt or elemental target.
const scenes = [
  { name: 'hi', puzzle: 'elements-2', select: '0-0' },
  { name: 'pon-preview', puzzle: 'elements-2', select: '2-3', preview: '3-3' },
  { name: 'irumbu', puzzle: 'metal-3' , selectName: 'Irumbu' },
  { name: 'on-crystals', puzzle: 'mine-7', selectName: 'Muju' },
];
for (const scene of scenes) {
  for (const v of [1, 2, 3, 4, 5]) {
    await page.goto(`http://127.0.0.1:3002/muju/?learn=${scene.puzzle}`);
    await page.getByTestId('puzzle-goal').waitFor(); await page.waitForTimeout(700);
    let sel = scene.select;
    if (scene.selectName) sel = await page.evaluate(n => document.querySelector(`[aria-label*="white ${n},"]`)?.dataset.testid?.replace('cell-', ''), scene.selectName);
    if (!sel) { console.log('no', scene.name); continue; }
    await page.getByTestId(`cell-${sel}`).click(); await page.waitForTimeout(450);
    if (scene.preview) { await page.getByTestId(`cell-${scene.preview}`).click(); await page.waitForTimeout(500); }
    const r = await page.evaluate(draw, { v, STATS, target: scene.preview });
    await page.waitForTimeout(150);
    const board = await page.locator('.battle-board').boundingBox();
    await page.screenshot({ path: `${OUT}/v${v}-${scene.name}.png`, clip: { x: board.x - 4, y: board.y - 4, width: board.width + 8, height: board.height + 8 } });
    if (scene.name === 'pon-preview') await page.screenshot({ path: `${OUT}/v${v}-${scene.name}-full.png` });
    if (r !== 'ok') console.log(scene.name, v, r);
  }
}
await browser.close();
console.log('done');
