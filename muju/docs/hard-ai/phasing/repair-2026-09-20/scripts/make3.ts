import { writeFileSync } from 'node:fs';
import { DEFAULT_WEIGHTS, cloneWeights, serializeWeights, loadWeights } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights';
import { F } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features';
import { activeCatalog, NDEF } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/core/catalog';
const OUT = '/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/weights-mine';
const cat = activeCatalog();
// The gap-fill agent's hand priors (default-v1 adapted to the Phasing schema; contract-flagged features left at 0).
const HP: Record<string, number> = { BankExcess: 25, HomeInvaded: -4000, SpawnArea: 30, SpawnReserve: 8, SpawnZero: -800, AnchorDepth: 25, Infiltration: 90, CornerSeal: -60, HomeThreat: -400, HomeCountdown: -180, HomePlug: 220, HomeRescuers: 90, Exposure: -20, DrawPressure: -8, ActionsLeft: 40, Hanging: -50, ApproachRetreat: -25, ApproachStrand: -10, StrandPunish: 20, KillAvailable: 35, CleaveExposure: -40, AnchorFragility: -120, BlockingDeficit: -150, CornerInfiltration: 300, Inv1SpawnZero: -800, Inv2CornerSeal: -300, Inv3RetreatSquare: -250, Inv4StrandUnpunished: -100, Inv6FragileAnchor: -120, Inv7PromoteNoRunway: -600, Inv8NoPreAdjacency: -150, Inv9ChipAcrossTurn: -150, Inv10HomeReachable: -400, Inv12CleaveLine: -40, Inv13Turtle: -200, Inv14LiquidityFloor: -200, Inv16ClockDiscipline: -200, Inv19SoftMinerExposed: -150, Inv20StrandNoRetreat: -250 };
function variant(label: string, set: Record<string, number>, tierMult?: Record<number, number>) {
  const w = cloneWeights(DEFAULT_WEIGHTS); w.label = label;
  for (const [k, v] of Object.entries(set)) { const i = (F as Record<string, number>)[k]; if (i === undefined) throw new Error('no feature ' + k); w.w[i] = v; }
  if (tierMult) for (let d = 0; d < NDEF; d++) w.material[d] = Math.round(cat.cost[d] * 100 * (tierMult[cat.tier[d]] ?? 1));
  const json = serializeWeights(w); loadWeights(JSON.parse(json));
  writeFileSync(`${OUT}/${label}.json`, json); console.log('wrote', label);
}
const SOLV = { Insolvency: -150, RunwayCliff: -600, RentShortfall: -300 };
variant('hp-tier13+pc', HP, { 1: 1, 2: 1.3, 3: 1.7 });
variant('hp-tier16-solv+pc', { ...HP, ...SOLV }, { 1: 1, 2: 1.6, 3: 2.2 });
variant('hp-solv+pc', { ...HP, ...SOLV });
