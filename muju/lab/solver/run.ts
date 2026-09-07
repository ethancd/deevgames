import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { UNIT_DEFINITIONS } from '../../src/game/units';
import { getAttackModifier } from '../../src/game/elements';
import type { UnitDefinition } from '../../src/game/types';
import { accessTimeline, marginalValues, solveRoles, staticDominators, killFrontier, canKill, validateCatalogue } from './model';

type Patch = Record<string, Partial<UnitDefinition>>;
const lightning: Patch = Object.fromEntries([2, 3, 3, 4].map((attack, i) => [`lightning_${i + 1}`, { attack }]));
const plantDepth: Patch = { plant_2: { mining: 4 }, plant_3: { mining: 5 }, plant_4: { speed: 2 } };
export const patches: Record<string, Patch> = {
  baseline: {}, lightning, plant_t2: { plant_2: { mining: 4 } }, plant_depth: plantDepth,
  plant_price: { plant_2: { cost: 5 }, plant_3: { cost: 9 }, plant_4: { cost: 14 } },
  proposed: { ...lightning, ...plantDepth },
};
const variant = process.argv[2] ?? 'current';
const original: UnitDefinition[] = JSON.parse(readFileSync(new URL('./baseline-v1.2.json', import.meta.url), 'utf8'));
if (variant !== 'current' && !(variant in patches)) throw new Error(`Unknown catalogue: ${variant}`);
const catalogue = variant === 'current' ? UNIT_DEFINITIONS.map(d => ({ ...d })) : original.map(d => ({ ...d, ...(patches[variant][d.id] ?? {}) }));
validateCatalogue(catalogue);
const start = Date.now(), roles = solveRoles(catalogue);
const rows = catalogue.map(unit => ({ ...unit,
  dominatedBy: staticDominators(unit, catalogue), role: roles[unit.id],
  access: Object.fromEntries([3, 6, 9].map(income => [income, accessTimeline(catalogue, unit, income)])),
  value: marginalValues(unit, catalogue),
}));
const turnFrontiers = [3, 6, 9].flatMap(income => Array.from({ length: 8 }, (_, i) => {
  const turn = i + 1, available = rows.filter(d => d.access[income].activeTurn !== null && d.access[income].activeTurn! <= turn);
  return { income, turn, units: available.map(d => d.id),
    maxAttack: Math.max(...available.map(d => d.attack)), maxDefense: Math.max(...available.map(d => d.defense)),
    maxSpeed: Math.max(...available.map(d => d.speed)), maxMining: Math.max(...available.map(d => d.mining)),
    canKillFrom7With3Actions: catalogue.filter(target => available.some(u => canKill(u, target, 7, 3))).map(t => t.id) };
}));
const data = { modelVersion: 1, variant, turnFrontiers, catalogueHash: createHash('sha256').update(JSON.stringify(catalogue)).digest('hex'),
  modelHash: createHash('sha256').update(readFileSync(new URL('./model.ts', import.meta.url))).update(readFileSync(new URL('./run.ts', import.meta.url))).update(readFileSync(new URL('../../src/game/elements.ts', import.meta.url))).digest('hex'),
  elapsedSeconds: (Date.now() - start) / 1000,
  assumptions: ['Open shortest-path distances, no traffic or enemy moves.',
    'Strike grid: 24 targets, all 18 open-board distances, action budgets 1/2/3; cells are not matchup probabilities.',
    'Kill frontiers: at most four distinct bodies in independent approach lanes, six shared actions; no tech gates.',
    'Mining: exact finite ten-cell corridor, six actions, one unit, no protection or other miners.',
    'Roles: least-cost SINGLE qualifying piece in declared strike/mining/occupation tasks; neither army optimality nor frequency.',
    'Access: maintained starting F1/W1/P1 and external income paid after placement; earliest single-line exemplar, not expected match timing.'],
  checks: { distinctStatProfiles: new Set(catalogue.map(d => JSON.stringify([catalogue.map(t => [getAttackModifier(d.element, t.element), getAttackModifier(t.element, d.element)]), d.attack, d.defense, d.speed, d.mining, d.cost, d.buildTime]))).size,
    sameTierDominated: rows.filter(d => d.dominatedBy.length).map(d => d.id),
    noMissionWitness: rows.filter(d => !d.role.cheapest).map(d => d.id),
    noSoleCheapestWitness: rows.filter(d => !d.role.soleCheapest).map(d => d.id) }, rows,
  focusedKillFrontiers: catalogue.filter(d => ['metal_1', 'metal_3', 'metal_4', 'water_3'].includes(d.id))
    .flatMap(target => [1, 4, 7].map(distance => ({ target: target.id, distance, solutions: killFrontier(target, catalogue, distance) }))) };
const out = resolve('lab/results/static-value-2026-09-07'); mkdirSync(out, { recursive: true });
writeFileSync(`${out}/${variant}.json`, JSON.stringify(data, null, 2) + '\n');
const lines = [
  `# Static value solver: ${variant}`, '',
  `Catalogue SHA-256: \`${data.catalogueHash}\`. Model SHA-256: \`${data.modelHash}\`.`, '',
  '**This is a set of local optimization results, not a universal power score or a proof of game balance.**', '',
  '## Distinctness and cheapest qualifying roles', '',
  'Witness counts reflect this deliberately broad mission grid, not importance or expected frequency. A witness means a cheapest qualifying single piece; it does not beat every mixed army.', '',
  '| Unit | ATK/DEF/SPD/MINE | Cost/build | Same-tier dominators | Cheapest / sole-cheapest tasks | Example witness |',
  '|---|---|---|---|---:|---|',
];
for (const d of rows) lines.push(`| ${d.name} (${d.id}) | ${d.attack}/${d.defense}/${d.speed}/${d.mining} | ${d.cost}/${d.buildTime} | ${d.dominatedBy.join(', ') || 'none'} | ${d.role.cheapest} / ${d.role.soleCheapest} | ${d.role.witnesses[0]?.mission ?? '**No witness**'} |`);
lines.push('', '## Marginal stat values (one extra point, holding opponents fixed)', '',
  'Attack and speed show newly reachable one-hit kill cells on the reporting grid. Action savings are mean shortest-path move-then-attack savings over the declared distances. Mining gains are exact extra resources within six corridor actions. Defense compares the cheapest feasible four-body/six-action attack at distance 1; “unbreakable” only means infeasible under that bound.', '',
  '| Unit | ATK+1: kill cells | SPD+1: kill cells / mean actions saved | MINE+1: fresh / scattered / stripped resources | DEF+1: cheapest kill bill before → after | ATK×SPD extra cells beyond additive |',
  '|---|---:|---:|---:|---|---:|');
for (const d of rows) {
  const c = d.value.changes, defense = c.defense.defenseKillCost[0];
  lines.push(`| ${d.id} | ${c.attack.killCells}/${d.value.base.cells} | ${c.speed.killCells}/${d.value.base.cells} / ${c.speed.strikeActionsSaved.toFixed(2)} | ${c.mining.incomeAt6.fresh} / ${c.mining.incomeAt6.scattered} / ${c.mining.incomeAt6.shallowStripped} | ${defense.before ?? 'unbreakable'} → ${defense.after ?? 'unbreakable'} | ${d.value.attackSpeedSynergy.extraKillCellsBeyondAdditive} |`);
}
lines.push('', '## Earliest financed exemplar (own turns)', '',
  'Income is external crystals per turn, paid AFTER placement/promotion. Starting units are free. No enemy, travel, or income-generating action cost is modeled here. Promotion permits immediate action; freshly placed pieces cannot promote again that turn.', '',
  '| Unit | Net line investment | Income 3 | Income 6 | Income 9 |', '|---|---:|---:|---:|---:|');
for (const d of rows) lines.push(`| ${d.id} | ${d.access[3].investment} | ${d.access[3].activeTurn ?? '>12'} | ${d.access[6].activeTurn ?? '>12'} | ${d.access[9].activeTurn ?? '>12'} |`);
lines.push('', '## Limits', '', ...data.assumptions.map(a => `- ${a}`), '',
  'Read solver/README.md for equations, counterfactual interpretation, test coverage and how to challenge these assumptions.');
lines.push('', '## Capabilities accessible by turn', '',
  'Each is the best individually financed exemplar, not an army affordable all at once. Different pieces may set different maxima. The final column requires ONE available piece to have both the speed and attack for the kill.', '',
  '| Income/turn | Own turn | Max ATK/DEF/SPD/MINE | Target types killable from distance 7 in 3 actions |',
  '|---:|---:|---|---:|');
for (const f of turnFrontiers) lines.push(`| ${f.income} | ${f.turn} | ${f.maxAttack}/${f.maxDefense}/${f.maxSpeed}/${f.maxMining} | ${f.canKillFrom7With3Actions.length}/24 |`);
lines.push('', '## Conditional crystal value of ATK +1', '',
  'Cheapest same-type squad, at most four bodies and six actions, at distances 1/4/7 against every target. Price savings average only cases feasible before AND after; newly feasible cases are reported separately and are not assigned an invented crystal price.', '',
  '| Unit | Mean crystals saved in jointly feasible cases | Newly feasible cases | Example |',
  '|---|---:|---:|---|');
for (const d of rows) { const v = d.value.changes.attack.squad, e = v.examples[0];
  lines.push(`| ${d.id} | ${v.meanCrystalsSaved?.toFixed(2) ?? 'n/a'} (${v.jointlyFeasible} cases) | ${v.newlyFeasible}/${v.cases} | ${e ? `${e.target}, distance ${e.distance}: ${e.beforeCost ?? 'infeasible'} → ${e.afterCost} crystals` : 'none'} |`);
}
writeFileSync(`${out}/${variant}.md`, lines.join('\n') + '\n');
if (process.argv.includes('--check') && (data.checks.distinctStatProfiles !== 24 || data.checks.sameTierDominated.length || data.checks.noMissionWitness.length)) process.exitCode = 1;
console.log(JSON.stringify({ variant, ...data.checks, elapsedSeconds: data.elapsedSeconds }));
