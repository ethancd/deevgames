/**
 * Prove Learn to Play puzzles and print what an author needs.
 *
 *   node --import tsx tools/learn-check.ts                  every arc
 *   node --import tsx tools/learn-check.ts move mine        these arcs (each file loaded on its own)
 *   node --import tsx tools/learn-check.ts move --puzzle move-3
 *   --board prints each starting board and the solver's line; --fast skips outcome counts
 */
import { buildPuzzleState } from '../src/learn/build';
import { renderBoard } from '../src/learn/notation';
import type { Arc } from '../src/learn/types';
import { verifyPuzzle } from '../src/learn/verify';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const puzzleArg = args.includes('--puzzle') ? args[args.indexOf('--puzzle') + 1] : null;
const named = args.filter(a => !a.startsWith('--') && a !== puzzleArg);

// Load arc files one by one, so a half-written arc elsewhere cannot break this run.
const { ARC_IDS } = await import('../src/learn/catalog/ids');
const ids = named.length ? named : [...ARC_IDS];
let failures = 0, count = 0;
for (const id of ids) {
  let arc: Arc;
  try { arc = (await import(`../src/learn/catalog/${id}.ts`)).ARC; }
  catch (e) { console.log(`\n## ${id}: cannot load (${(e as Error).message})`); failures++; continue; }
  const chosen = arc.puzzles.filter(p => !puzzleArg || p.id === puzzleArg);
  if (!chosen.length) continue;
  console.log(`\n## ${arc.title} (${arc.id}, ${arc.puzzles.length} puzzles)`);
  const seen = new Set<string>();
  for (const spec of chosen) {
    count++;
    if (seen.has(spec.id)) console.log(`       ✗ duplicate id ${spec.id}`);
    seen.add(spec.id);
    const r = verifyPuzzle(spec, { outcomes: !flag('--fast') });
    if (!spec.id.startsWith(`${arc.id}-`)) r.errors.push(`id should start with "${arc.id}-"`);
    if (r.text.length > 64) r.errors.push(`goal line is ${r.text.length} characters (max 64)`);
    const mark = r.errors.length ? 'FAIL' : 'ok  ';
    if (r.errors.length) failures++;
    const outcomes = r.outcomes ? ` · wins ${r.outcomes.winning}/${r.outcomes.total}` : '';
    console.log(`${mark} ${spec.id.padEnd(14)} "${r.text}"${outcomes} · ${r.nodes} nodes · ${r.ms} ms`);
    if (flag('--board')) for (const row of renderBoard(buildPuzzleState(spec))) console.log(`       ${row}`);
    for (const e of r.errors) console.log(`       ✗ ${e}`);
    for (const n of r.notes) console.log(`       · ${n}`);
    if (r.witness && (flag('--board') || r.errors.length)) console.log(`       solver line: ${r.witness.join(' ')}`);
  }
}
console.log(`\n${count - failures}/${count} puzzles proved`);
process.exit(failures ? 1 : 0);
