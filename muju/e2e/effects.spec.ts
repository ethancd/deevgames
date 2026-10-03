import { test, expect, type Page } from './fixtures';

const ELEMENTS = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
const MAGNITUDES = ['resisted', 'normal', 'vulnerable'];
/** Frames land in MUJU_EFFECT_FRAMES when set (docs), else in the test output. */
const frame = (name: string, info: { outputPath: (name: string) => string }) =>
  process.env.MUJU_EFFECT_FRAMES ? `${process.env.MUJU_EFFECT_FRAMES}/${name}.png` : info.outputPath(`${name}.png`);
const painted = (page: Page) => page.getByTestId('board-effects').evaluate((canvas: HTMLCanvasElement) => {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 8) lit++;
  return lit;
});

test('every element paints its kill effect at all three magnitudes, then clears', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('./?effects=1');
  for (const element of ELEMENTS) {
    const sizes: number[] = [];
    for (const magnitude of MAGNITUDES) {
      await page.getByRole('group', { name: element }).getByRole('button', { name: `kill · ${magnitude}` }).click();
      await page.waitForTimeout(140);
      sizes.push(await painted(page));
      await page.locator('.effects-gallery-stage').screenshot({ path: frame(`${element}-${magnitude}-kill`, info) });
      await page.waitForTimeout(1600);
      expect(await painted(page)).toBe(0); // every effect finishes and clears
    }
    expect(sizes.every(n => n > 0)).toBe(true);
  }
});

test('reduced motion shows a single short flash with no particles', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?effects=1');
  await page.getByRole('group', { name: 'fire' }).getByRole('button', { name: 'kill · vulnerable' }).click();
  await page.waitForTimeout(80);
  expect(await painted(page)).toBeGreaterThan(0);
  await page.locator('.effects-gallery-stage').screenshot({ path: frame('reduced-motion-fire-kill', info) });
  await page.waitForTimeout(400);
  expect(await painted(page)).toBe(0);
});

test('the checkmate burst covers the board', async ({ page }, info) => {
  await page.goto('./?effects=1');
  await page.getByRole('button', { name: 'checkmate' }).click();
  await page.waitForTimeout(450);
  expect(await painted(page)).toBeGreaterThan(2000);
  await page.locator('.effects-gallery-stage').screenshot({ path: frame('checkmate', info) });
});
