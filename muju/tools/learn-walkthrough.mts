/**
 * Records a walkthrough video of Learn to Play against a running site (Playwright's
 * recordVideo, .webm). Start the dev server first (`npx vite --port 3002`), then:
 *
 *   node --import tsx tools/learn-walkthrough.mts phone|desktop
 *
 * MUJU_BASE_URL overrides the site (default http://127.0.0.1:3002/muju/) and
 * WALKTHROUGH_OUT the output folder (default /tmp/muju-walkthrough). The phone
 * pass records at CSS-pixel size inside a 2x canvas: crop the top-left 390x844
 * when converting (ffmpeg -vf "crop=390:844:0:0,scale=720:-2").
 * The scripted puzzles and their order are below; update them as the catalog changes.
 */
import { chromium } from 'playwright';
import { applyAction } from '../src/ai/simulate';
import type { AIAction } from '../src/ai/types';
import { getUnitById } from '../src/game/board';
import { getUnitDefinition } from '../src/game/units';
import type { GameState } from '../src/game/types';
import { puzzleById } from '../src/learn/catalog';
import { evaluate, makeContext } from '../src/learn/goals';
import { playLine } from '../src/learn/notation';
import { PuzzleSearch, compressLine } from '../src/learn/solver';

const mode = process.argv[2] === 'desktop' ? 'desktop' : 'phone';
const BASE = process.env.MUJU_BASE_URL ?? 'http://127.0.0.1:3002/muju/';
const OUT = `${process.env.WALKTHROUGH_OUT ?? '/tmp/muju-walkthrough'}/raw-${mode}`;
const viewport = mode === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const size = mode === 'phone' ? { width: 780, height: 1688 } : { width: 1280, height: 800 };
const BEAT = 650;

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport, deviceScaleFactor: mode === 'phone' ? 2 : 1, recordVideo: { dir: OUT, size } });
await context.addInitScript(() => {
  if (!localStorage.getItem('muju:onboarding:v1')) localStorage.setItem('muju:onboarding:v1', JSON.stringify({ completed: true, at: '2026-10-02T00:00:00.000Z', version: 1 }));
  if (!sessionStorage.getItem('seeded')) { localStorage.removeItem('muju:learn:v1'); sessionStorage.setItem('seeded', '1'); }
});
const page = await context.newPage();
const pause = (ms = BEAT) => page.waitForTimeout(ms);
const cell = (x: number, y: number) => page.getByTestId(`cell-${x}-${y}`);
type Probe = { id: string; phase: string; state: GameState };
const probe = () => page.evaluate(() => (window as unknown as { __mujuLearn?: Probe }).__mujuLearn ?? null);

async function pick(x: number, y: number) {
  const square = cell(x, y);
  if (await square.getAttribute('aria-pressed') !== 'true') { await square.click(); await pause(450); }
}
async function tap(state: GameState, action: AIAction) {
  switch (action.type) {
    case 'MOVE': { const u = getUnitById(state.board, action.unitId)!; await pick(u.position.x, u.position.y); await cell(action.to.x, action.to.y).click(); break; }
    case 'ATTACK': {
      const u = getUnitById(state.board, action.unitId)!; await pick(u.position.x, u.position.y);
      await cell(action.targetPosition.x, action.targetPosition.y).click(); await pause(700);
      await page.getByRole('button', { name: 'Confirm attack' }).click(); break;
    }
    case 'END_ACTION_PHASE': await page.locator('.action-bar button.primary').click(); break;
    case 'END_PLACE_PHASE':
      await pause(250);
      if (await page.locator('.action-bar[data-phase="place"]').count()) await page.getByRole('button', { name: /End turn/ }).click();
      break;
    case 'BUY_UNIT': {
      const def = getUnitDefinition(action.definitionId);
      await page.getByRole('button', { name: `Summon ${def.name} · ${def.cost} crystals`, exact: true }).click(); await pause(600);
      await cell(action.position.x, action.position.y).click(); break;
    }
    case 'PROMOTE_UNIT': { const u = getUnitById(state.board, action.unitId)!; await cell(u.position.x, u.position.y).click(); await pause(600); await page.getByRole('button', { name: /^Promote/ }).click(); break; }
    case 'PAY_UPKEEP': {
      const dialog = page.getByRole('dialog', { name: 'Choose upkeep' });
      await pause(900);
      for (const box of await dialog.getByRole('checkbox').all()) {
        const label = await box.evaluate(e => e.closest('label')!.textContent ?? '');
        const kept = action.keepUnitIds.some(id => { const u = getUnitById(state.board, id)!; return label.includes(`${String.fromCharCode(65 + u.position.x)}${u.position.y + 1}`); });
        if (await box.isEnabled() && (await box.isChecked()) !== kept) { await box.click(); await pause(400); }
      }
      await dialog.getByRole('button', { name: /Pay upkeep/ }).click(); break;
    }
    default: break;
  }
  await pause(900);
}
async function isSolved(id: string) {
  const p = await probe();
  if (!p || p.id !== id) return page.getByTestId('puzzle-success').isVisible();
  return evaluate(makeContext(puzzleById(id)!.puzzle), p.state) === 'solved';
}
async function playActions(id: string, from: GameState, actions: readonly AIAction[]) {
  let state = from;
  for (const action of actions) { if (await isSolved(id)) return; await tap(state, action); state = applyAction(state, action); }
}
async function open(id: string) {
  await page.goto(`${BASE}?learn=${id}&probe=1`);
  await page.getByTestId('puzzle-goal').waitFor();
  await pause(1600);
}
/** Play a notation line from the puzzle's start. */
async function line(id: string, moves: string[]) {
  const ctx = makeContext(puzzleById(id)!.puzzle);
  const live = (await probe())!.state;
  await playActions(id, live, playLine(live, moves).actions);
  void ctx;
}
/** Solve from wherever we are: the author's line at the start, then solver lines after each reply. */
async function solve(id: string) {
  const spec = puzzleById(id)!.puzzle;
  const ctx = makeContext(spec);
  await playActions(id, ctx.start, playLine(ctx.start, spec.solution).actions);
  for (let i = 0; i < 4 && !(await isSolved(id)); i++) {
    if ((await probe())?.id !== id) break;
    for (let t = 0; t < 80; t++) {
      const p = await probe();
      if (p && (evaluate(ctx, p.state) === 'solved' || (p.phase === 'playing' && p.state.phase === 'playing' && p.state.turn.currentPlayer === ctx.hero))) break;
      await pause(250);
    }
    if (await isSolved(id)) break;
    const live = (await probe())!.state;
    await pause(900);
    const found = new PuzzleSearch(ctx).line(live);
    if (!found) throw new Error(`${id}: no line from live position`);
    await playActions(id, live, compressLine(live, found));
  }
  await page.getByTestId('puzzle-success').waitFor({ timeout: 20_000 });
  await pause(2200);
}
async function next() { await page.getByTestId('puzzle-success').getByRole('button', { name: /^Next/ }).click(); await page.getByTestId('puzzle-goal').waitFor(); await pause(1500); }
async function toMap() { await page.goto(`${BASE}?learn=1`); await page.getByTestId('learn-continue').waitFor(); await pause(1500); }
async function scrollMap(to: number, steps = 12) {
  const from = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i++) { await page.evaluate(y => window.scrollTo(0, y), from + (to - from) * i / steps); await pause(110); }
}
async function fail(id: string, moves: string[]) {
  await line(id, moves);
  await page.getByTestId('puzzle-failure').waitFor({ timeout: 20_000 });
  await pause(2200);
}

if (mode === 'phone') {
  // The home screen and the map.
  await page.goto(BASE); await pause(2500);
  await page.getByRole('button', { name: /^Learn to Play/ }).click(); await pause(2000);
  const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await scrollMap(height, 40); await pause(800); await scrollMap(0, 25); await pause(800);
  await page.getByTestId('learn-continue').click(); await page.getByTestId('puzzle-goal').waitFor(); await pause(1800);
  // Moving: the first puzzles, then the rounding twist with a wrong try, Undo, and the right trip.
  await solve('move-1'); await next();
  await solve('move-2'); await next();
  await solve('move-3');
  await open('move-5'); await fail('move-5', ['d1-d4']);
  await page.getByTestId('puzzle-failure').getByRole('button', { name: /Undo/ }).click(); await pause(1500);
  await solve('move-5');
  // The overworld between puzzles.
  await toMap(); await pause(800);
  await page.getByTestId('learn-tile-mine-1').click(); await page.getByTestId('puzzle-goal').waitFor(); await pause(1500);
  await solve('mine-1'); await open('mine-4'); await solve('mine-4');
  // Fighting.
  await open('attack-2'); await solve('attack-2');
  await open('elements-2'); await fail('elements-2', ['a1-d3xd4']);
  await page.getByTestId('puzzle-failure').getByRole('button', { name: /Retry/ }).click(); await pause(1500);
  await solve('elements-2');
  await open('cleave-3'); await solve('cleave-3');
  await open('safety-1'); await solve('safety-1');
  await toMap(); await scrollMap(900, 15); await pause(1500);
  await page.getByTestId('learn-tile-fire-3').click(); await page.getByTestId('puzzle-goal').waitFor(); await pause(1500);
  await solve('fire-3');
  // Crystals.
  await open('summon-2'); await solve('summon-2');
  await open('promote-4'); await solve('promote-4');
  await open('upkeep-4'); await solve('upkeep-4');
  // A hint, then Show me.
  await open('invade-2');
  await page.getByRole('button', { name: 'Hint' }).click(); await pause(2600);
  await page.getByRole('button', { name: 'Show me' }).click();
  // Watch the whole demonstration, then the restart.
  for (let t = 0; t < 120 && (await probe())?.phase !== 'demo'; t++) await pause(100);
  for (let t = 0; t < 300 && (await probe())?.phase === 'demo'; t++) await pause(100);
  await pause(1500);
  await solve('invade-2');
  // Winning, and the exam.
  await open('invade-3'); await solve('invade-3');
  await open('defend-1'); await solve('defend-1');
  await open('exam-1'); await solve('exam-1');
  // An arc finished: the map fills in.
  await open('move-9'); await solve('move-9');
  await page.getByTestId('puzzle-success').getByRole('button', { name: /All puzzles/ }).click(); await pause(2500);
  await scrollMap(600, 15); await pause(2000);
} else {
  await page.goto(BASE); await pause(2000);
  await page.getByRole('button', { name: /^Learn to Play/ }).click(); await pause(2500);
  await scrollMap(1400, 25); await pause(800); await scrollMap(0, 15);
  await page.getByTestId('learn-tile-mine-9').click(); await page.getByTestId('puzzle-goal').waitFor(); await pause(1500);
  await solve('mine-9');
  await open('teamwork-5'); await solve('teamwork-5');
  await open('summon-8'); await solve('summon-8');
  await open('invade-9'); await solve('invade-9');
  await open('review-13'); await solve('review-13');
  await open('exam-6'); await solve('exam-6');
  await toMap(); await pause(2000);
}
await pause(1000);
const video = page.video();
await context.close();
console.log(await video?.path());
await browser.close();
