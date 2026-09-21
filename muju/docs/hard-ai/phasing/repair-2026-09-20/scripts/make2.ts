import { writeFileSync } from 'node:fs';
import { DEFAULT_WEIGHTS, cloneWeights, serializeWeights, loadWeights } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights';
import { F } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features';
import { activeCatalog, NDEF } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/core/catalog';
const OUT = '/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/weights-mine';
const cat = activeCatalog();
console.log('upkeep by def:', Array.from({ length: NDEF }, (_, d) => (cat as any).upkeep?.[d] ?? '?').join(','));
function variant(label: string, set: Record<string, number>, tierMult?: Record<number, number>) {
  const w = cloneWeights(DEFAULT_WEIGHTS); w.label = label;
  for (const [k, v] of Object.entries(set)) { const i = (F as Record<string, number>)[k]; if (i === undefined) throw new Error('no feature ' + k); w.w[i] = v; }
  if (tierMult) for (let d = 0; d < NDEF; d++) w.material[d] = Math.round(cat.cost[d] * 100 * (tierMult[cat.tier[d]] ?? 1));
  const json = serializeWeights(w); loadWeights(JSON.parse(json));
  writeFileSync(`${OUT}/${label}.json`, json); console.log('wrote', label);
}
const BANK = { BankLiquid: 90, BankExcess: 25 };
const SOLV = { Insolvency: -150, RunwayCliff: -600, RentShortfall: -300 };   // old priors for the first two; RentShortfall is new under Phasing
const T16 = { 1: 1, 2: 1.6, 3: 2.2 }, T13 = { 1: 1, 2: 1.3, 3: 1.7 };
variant('m2-tier16-bank', { ...BANK }, T16);
variant('m2-tier16-solv', { ...SOLV }, T16);
variant('m2-tier16-bank-solv', { ...BANK, ...SOLV }, T16);
variant('m2-tier16-bank-solv-rent', { ...BANK, ...SOLV, Rent: -150 }, T16);
variant('m2-tier13-bank50-solv', { BankLiquid: 95, BankExcess: 50, ...SOLV }, T13);
variant('m2-bank-solv', { ...BANK, ...SOLV });
