import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const defaultURL=new URL('../results/map-study-2026-09-07/index.html',import.meta.url);
const output=dirname(fileURLToPath(defaultURL));
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1560,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.argv[2]??defaultURL.href);
 await page.waitForSelector('.map-card svg');assert.equal(await page.locator('.map-card').count(),5);assert.equal(await page.locator('.cell').count(),500);
 await page.screenshot({path:join(output,'overview.png'),fullPage:false});
 await page.selectOption('#view','yield');await page.selectOption('#unit','fire_1');assert.equal(await page.locator('.cell text').first().textContent(),'1');
 await page.locator('[data-map="B"][data-cell="44"]').click();assert.match(await page.locator('#detail').textContent(),/5 initial layers/);
 await page.selectOption('#view','path');assert((await page.locator('.path').count())>0);
 await page.locator('#turn').fill('3');assert.equal(await page.locator('#turn-value').textContent(),'3');
 await page.selectOption('#unit','plant_2');await page.locator('[data-region="south"]').click();assert.equal(await page.locator('#view').inputValue(),'regional');
 assert((await page.locator('.mine-marker').count())>0);
 await page.selectOption('#origin','home');assert.match(await page.locator('#marginal').textContent(),/speed \+1/);
 await page.selectOption('#well-state','stripped');await page.selectOption('#unit','fire_1');assert.match(await page.locator('#unit-note').textContent(),/top three layers/);
 await page.selectOption('#view','yield');assert.equal(await page.locator('.cell text').first().textContent(),'0');
 await page.selectOption('#well-state','fresh');await page.selectOption('#view','depth');await page.selectOption('#unit','plant_2');await page.selectOption('#origin','district');await page.locator('#turn').fill('5');
 await page.evaluate(()=>scrollTo(0,0));

 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(output,'phone.png'),fullPage:false});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('PASS: five maps / 500 cells; unit yields, square detail, opening turn, regional route, depletion, home travel and phone layout; no browser errors.');
}finally{await browser.close();}
