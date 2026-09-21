// First-pass variants, built from the repo's own DEFAULT_WEIGHTS / serializer. Scratch only.
import { writeFileSync } from 'node:fs';
import { DEFAULT_WEIGHTS, cloneWeights, serializeWeights, loadWeights } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights';
import { F } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features';
import { activeCatalog, NDEF } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/core/catalog';

const OUT = '/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/weights-mine';
// The Standard-era hand priors (git show 43b87b6:muju/src/ai/hard/eval/weights.ts), by feature name.
const OLD: Record<string, number> = { Material:100, Rent:-422, BankLiquid:90, BankExcess:25, HomeInvaded:-4000, PstMine:60, BankConvertible:20, SpawnArea:30, SpawnReserve:8, SpawnZero:-800, AnchorDepth:25, Infiltration:90, CornerSeal:-60, HomeThreat:-400, HomeCountdown:-180, HomePlug:220, HomeRescuers:90, Exposure:-20, DrawPressure:-8, ActionsLeft:40, ElementCoverage:150, EconDelta:80, DepletionWaste:-30, RunwayCliff:-600, Insolvency:-150, RelocationDebt:-60, Hanging:-50, HangingBuy:-30, ApproachRetreat:-25, ApproachStrand:-10, StrandPunish:20, KillAvailable:35, CleaveExposure:-40, AnchorFragility:-120, BlockingDeficit:-150, CornerInfiltration:300, Inv1SpawnZero:-800, Inv2CornerSeal:-300, Inv3RetreatSquare:-250, Inv4StrandUnpunished:-100, Inv5PoorMinerSquare:-400, Inv6FragileAnchor:-120, Inv7PromoteNoRunway:-600, Inv8NoPreAdjacency:-150, Inv9ChipAcrossTurn:-150, Inv10HomeReachable:-400, Inv11HomeBare:-250, Inv12CleaveLine:-40, Inv13Turtle:-200, Inv14LiquidityFloor:-200, Inv16ClockDiscipline:-200, Inv17SelfBlock:-60, Inv19SoftMinerExposed:-150, Inv20StrandNoRetreat:-250 };
const HOME = ['HomeInvaded','HomeThreat','HomeCountdown','HomePlug','HomeRescuers','Inv10HomeReachable','Inv11HomeBare','CornerInfiltration','Infiltration'];
const TACT = ['Hanging','HangingBuy','KillAvailable','Exposure','CleaveExposure','StrandPunish','ApproachRetreat','ApproachStrand'];

const cat = activeCatalog();
function variant(label: string, set: Record<string, number>, tierMult?: Record<number, number>) {
  const w = cloneWeights(DEFAULT_WEIGHTS); w.label = label;
  for (const [k, v] of Object.entries(set)) { const i = (F as Record<string, number>)[k]; if (i === undefined) throw new Error('no feature ' + k); w.w[i] = v; }
  if (tierMult) for (let d = 0; d < NDEF; d++) w.material[d] = Math.round(cat.cost[d] * 100 * (tierMult[cat.tier[d]] ?? 1));
  const json = serializeWeights(w); loadWeights(JSON.parse(json)); // round-trip proves it parses
  writeFileSync(`${OUT}/${label}.json`, json); console.log('wrote', label, 'material', Array.from(w.material).join(','));
}
const pick = (names: string[]) => Object.fromEntries(names.map(n => [n, OLD[n]]));
console.log('catalog tiers', Array.from({ length: NDEF }, (_, d) => cat.tier[d]).join(','), 'costs', Array.from({ length: NDEF }, (_, d) => cat.cost[d]).join(','));

variant('m-bank-discount', { BankLiquid: 90, BankExcess: 25 });                       // single factor: old cash valuation
variant('m-bank-overshoot', { BankLiquid: 50, BankExcess: 0 });                       // overshoot: cash nearly worthless
variant('m-tier-premium', {}, { 1: 1, 2: 1.2, 3: 1.4 });                              // single factor: promoted units worth more than cost
variant('m-tier-overshoot', {}, { 1: 1, 2: 1.6, 3: 2.2 });                            // overshoot
variant('m-home-block', pick(HOME));                                                  // single factor: home safety priors on
variant('m-old-priors', { ...OLD, EconDelta: 100, PendingValue: 1 });                  // everything the Standard-era engine valued
variant('m-combined', { ...pick(HOME), ...pick(TACT), BankLiquid: 90, BankExcess: 25 }, { 1: 1, 2: 1.2, 3: 1.4 }); // best guess
