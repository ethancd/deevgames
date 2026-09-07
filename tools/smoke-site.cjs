// Run against a staged or live site: node tools/smoke-site.cjs https://deevgames.ashkie.com
// Optional CHROME_PATH uses an installed Chrome; otherwise install Playwright Chromium.
const { chromium } = require('../oracle/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = (process.argv[2] || 'http://127.0.0.1:8941').replace(/\/$/, '');
const screenshots = process.env.QA_SCREENSHOTS;

(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    for (const width of [390, 834]) {
      const context = await browser.newContext({viewport: {width, height: 1112}});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.url().startsWith(base + '/') && response.status() >= 400)
          errors.push(`${response.status()} ${response.url()}`);
      });
      async function picture(name) {
        if (!screenshots) return;
        fs.mkdirSync(screenshots, {recursive: true});
        await page.screenshot({path: path.join(screenshots, `${name}-${width}.png`), fullPage: name !== 'forge-gallery'});
      }
      async function fits() {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflows viewport');
      }
      await page.goto(base + '/');
      assert.equal(await page.locator('a.game-card').count(), 3);
      await fits(); await picture('hub');
      await page.getByRole('link', {name: /Muju Hono Tanka/}).click();
      await page.getByRole('button', {name: 'Pass & Play Two players, one device', exact: true}).click();
      await page.getByRole('button', {name: 'Start Game', exact: true}).click();
      assert.equal(await page.locator('[data-testid^="cell-"]').count(), 100);
      const cells = await page.locator('[data-testid^="cell-"]').evaluateAll(nodes => nodes.slice(0, 10).map(node => {
        const r = node.getBoundingClientRect(); return {x:r.x, right:r.right, width:r.width, height:r.height};
      }));
      cells.forEach((cell, i) => {
        assert(cell.width >= 25, 'Board cells collapsed');
        assert(Math.abs(cell.width-cell.height) < 1, 'Board cells must be square');
        if (i) assert(cells[i-1].right <= cell.x + 1, 'Board cells overlap');
      });
      await fits(); await picture('muju');
      await page.getByRole('button', {name: /End Actions/}).click();
      const saved = await page.evaluate(() => localStorage.getItem('elemental-tactics-save'));
      assert(saved, 'Muju must save on a phase transition');
      await page.reload();
      await page.getByRole('button', {name: 'Pass & Play Two players, one device', exact: true}).click();
      await page.getByRole('button', {name: 'Start Game', exact: true}).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('elemental-tactics-save')), saved);
      assert.match(await page.locator('body').innerText(), /Queue Phase/);
      await page.getByRole('link', {name: '← Deev Games', exact: true}).click();
      await page.getByRole('link', {name: /FORGE/}).click();
      await fits(); await picture('forge');
      // A face-up card opens the actual game action modal with art.
      await page.locator('.cursor-pointer.ring-2').first().click();
      await page.getByRole('button', {name: 'Burn Card', exact: true}).waitFor();
      await page.waitForFunction(() => [...document.images].some(img => img.complete && img.naturalWidth > 0));
      await page.getByRole('button', {name: 'Burn Card', exact: true}).click();
      await page.getByRole('button', {name: /Confirm Burn/}).click();
      for (const skin of ['original', 'cartoon']) {
        if (skin === 'cartoon') await page.getByTitle(/Cartoon/).click();
        await page.getByRole('link', {name: 'Card Gallery', exact: true}).click();
        await page.waitForFunction(() => document.images.length > 0 && [...document.images].every(img => img.complete && img.naturalWidth > 0));
        const imageURLs = await page.locator('img').evaluateAll(nodes => nodes.map(img => img.src));
        assert(imageURLs.every(url => url.includes(skin === 'original' ? '/forge/images/' : '/forge/images-cartoon/')));
        await fits();
        if (skin === 'cartoon') await picture('forge-gallery');
        await page.reload();
        await page.getByRole('link', {name: 'Back to Game', exact: true}).click();
      }
      await page.getByRole('link', {name: '← Deev Games', exact: true}).click();
      await page.getByRole('link', {name: /Oracle of Delve/}).click();
      const hp = page.getByText('20 / 20', {exact:true}).first();
      await hp.waitFor();
      assert((await hp.locator('..').boundingBox()).height >= 20, 'Enemy health bar collapsed');
      assert((await page.getByText('50 / 50 HP', {exact:true}).locator('..').boundingBox()).height >= 24, 'Player health bar collapsed');
      await fits(); await picture('oracle');
      await page.getByRole('button', {name: /Goblin/}).click();
      await page.waitForFunction(() => !document.body.innerText.includes('Goblin\n20 / 20'));
      for (let i=0; i<20; i++) {
        if (await page.getByRole('button',{name:'Play Again',exact:true}).count()) break;
        const living = page.locator('button:not([disabled])').filter({hasText:/Goblin|Orc/});
        await living.first().waitFor({timeout:10000});
        await living.first().click();
        await page.waitForTimeout(750);
      }
      await page.getByRole('button', {name:'Play Again', exact:true}).click();
      assert.equal(await page.getByText('20 / 20', {exact:true}).count(), 2);
      await page.reload();
      await page.getByRole('heading', {name:/Oracle of Delve/}).waitFor();
      assert.deepEqual(errors, [], 'Browser errors or missing local resources');
      console.log(`PASS ${width}px: hub navigation, Muju board/save, Forge burn/both art skins, Oracle combat/restart, direct refresh`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
