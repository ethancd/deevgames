import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUZZLE_COUNT, PUZZLE_IDS } from '../../src/learn/count';
import { PUZZLES } from '../../src/learn/catalog';

/**
 * Learn to Play is its own lazily loaded chunk. The modules the home screen
 * imports statically may read the arc data (to count puzzles), never the
 * solver, the puzzle UI or the test fixtures.
 */
const source = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');
const staticImports = (text: string) => [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);

describe('the Learn chunk', () => {
  it('App loads the Learn screens lazily and imports only the light Learn modules', () => {
    const app = source('App.tsx');
    expect(app).toMatch(/lazy\(\(\) => import\('\.\/learn\/LearnRoot'\)\)/);
    const learn = staticImports(app).filter(path => path.startsWith('./learn/'));
    expect(learn.sort()).toEqual(['./learn/count', './learn/progress', './learn/routing']);
  });

  it('the home screen counts puzzles from the arc data alone', () => {
    expect(staticImports(source('components/ModeSelect.tsx')).filter(p => p.includes('learn'))).toEqual(['../learn/count']);
    expect(staticImports(source('learn/count.ts'))).toEqual(['./catalog']);
    const catalog = staticImports(source('learn/catalog/index.ts'));
    expect(catalog.every(p => p.startsWith('./') || p === '../types')).toBe(true);
    expect(PUZZLE_COUNT).toBe(PUZZLES.length);
    expect(PUZZLE_IDS).toEqual(PUZZLES.map(e => e.puzzle.id));
  });
});
