"""Create isolated reference/variant engines; fail closed if source anchors change.
Run from muju: python3 lab/experiments/depth-economy/prepare.py [--restore]
"""
from pathlib import Path
import hashlib, json, shutil, subprocess, sys, tarfile

ROOT = Path.cwd()
HERE = ROOT / 'lab/experiments/depth-economy'
OUT = ROOT / 'lab/results/depth-economy-2026-09-09'
OUT.mkdir(parents=True, exist_ok=True)
REF, BOX = HERE / '.reference', HERE / '.sandbox'
archive = OUT / 'production-source.tar.gz'
paths = ['src', 'assembly', 'lab/harness', 'lab/experiments/home-policies.ts',
         'lab/experiments/map-d-investment-policies.ts', 'lab/experiments/map-d-policies.ts',
         'package.json', 'package-lock.json', 'asconfig.json']
if not archive.exists():
    with tarfile.open(archive, 'w:gz') as tar:
        for path in paths: tar.add(ROOT / path, arcname=path)
    sources = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
               for path in paths for p in ([ROOT/path] if (ROOT/path).is_file() else (ROOT/path).rglob('*')) if p.is_file()}
    (OUT/'production-manifest.json').write_text(json.dumps({
        'gitHead': subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
        'initialStatus': subprocess.check_output(['git','status','--short'],text=True),
        'node': subprocess.check_output(['node','--version'],text=True).strip(),
        'files': sources}, indent=2)+'\n')
elif '--restore' not in sys.argv:
    manifest=json.loads((OUT/'production-manifest.json').read_text())
    for name, digest in manifest['files'].items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest, f'Production changed: {name}; use --restore for archived study'
for dest in [REF, BOX]:
    if dest.exists(): shutil.rmtree(dest)
    dest.mkdir()
    with tarfile.open(archive) as tar: tar.extractall(dest, filter='data')

changes=[]
def replace(path, old, new, count=1):
    p=BOX/path; s=p.read_text()
    assert s.count(old)==count, f'{path}: expected {count} anchors, found {s.count(old)}: {old}'
    p.write_text(s.replace(old,new)); changes.append({'path':path,'old':old,'new':new})

economy='''// Isolated lab economy. Values index absolute physical depth, starting at one.
export const ECONOMIES = { A: [1,1,1,1,1], B: [1,1,1,2,3], C: [1,2,3,4,5] } as const;
export type Economy = keyof typeof ECONOMIES;
let current: Economy = 'A';
export function setEconomy(value: Economy): void { if (!(value in ECONOMIES)) throw Error('Invalid economy'); current=value; }
export function getEconomy(): Economy { return current; }
export function layerValue(depth: number): number { return ECONOMIES[current][depth-1] ?? 0; }
export function depthValue(minedDepth: number, layers: number): number {
  let sum=0; for(let i=1;i<=layers;i++) sum+=layerValue(minedDepth+i); return sum;
}
export function yieldForMining(mining: number, cell: {minedDepth:number;resourceLayers:number}): number {
  return depthValue(cell.minedDepth, Math.max(0,Math.min(cell.resourceLayers,mining-cell.minedDepth)));
}
'''
(BOX/'src/game/economy.ts').write_text(economy)
replace('src/game/mining.ts', "import type { BoardState", "import { depthValue } from './economy';\nimport type { BoardState")
replace('src/game/mining.ts', 'export function calculateMiningYield(unit: Unit, cell: Cell): number {', '''export function calculateMiningYield(unit: Unit, cell: Cell): number {
  return depthValue(cell.minedDepth, calculateMiningLayers(unit, cell));
}
/** Physical count, independent of payout. */
export function calculateMiningLayers(unit: Unit, cell: Cell): number {''')
replace('src/game/mining.ts','const amountMined = calculateMiningYield(unit, cell);','const layersMined = calculateMiningLayers(unit, cell);\n  const amountMined = calculateMiningYield(unit, cell);')
replace('src/game/mining.ts','resourceLayers: cell.resourceLayers - amountMined,','resourceLayers: cell.resourceLayers - layersMined,')
replace('src/game/mining.ts','minedDepth: cell.minedDepth + amountMined,','minedDepth: cell.minedDepth + layersMined,')
replace('src/game/mining.ts','total += cell.resourceLayers;','total += depthValue(cell.minedDepth, cell.resourceLayers);')
replace('src/game/mining.ts','total += layers;','total += depthValue(cell.minedDepth, layers);')
replace('src/game/types.ts','resourceLayers: number; // 0-5, remaining extractable resources','resourceLayers: number; // 0-5 remaining physical layers; crystal value is separate')
replace('src/game/resourceMap.ts',"export const RESOURCE_MAP_NAME", "import { depthValue } from './economy';\nexport function initialMapCrystalValue(): number { return UNEQUAL_ROUTES_MAP.reduce((sum,n)=>sum+depthValue(0,n),0); }\n// INITIAL_MAP_RESOURCES below is the historical PHYSICAL layer count.\nexport const RESOURCE_MAP_NAME")
replace('lab/harness/invariants.ts',"import { getUnitDefinition", "import { depthValue } from '../../src/game/economy';\nimport { getUnitDefinition")
replace('lab/harness/invariants.ts','const total = capacities.reduce((sum,n)=>sum+n,0);','const total = capacities.reduce((sum,n)=>sum+depthValue(0,n),0);')
replace('lab/harness/invariants.ts','remaining += cell.resourceLayers;','remaining += depthValue(cell.minedDepth, cell.resourceLayers);')
replace('src/ai/state/eventsLog.ts',"import type { GameState", "import { depthValue } from '../../game/economy';\nimport type { GameState")
replace('src/ai/state/eventsLog.ts','amount: nextCell.minedDepth - prevCell.minedDepth,','amount: depthValue(prevCell.minedDepth, nextCell.minedDepth - prevCell.minedDepth),')
replace('src/ai/evaluation.ts',"import { canMine }", "import { canMine, calculateMiningYield }")
replace('src/ai/evaluation.ts', '''      const def = getUnitDefinition(unit.definitionId);
      potential += def.mining; // Mining power as potential''', '''      potential += calculateMiningYield(unit, state.board.cells[unit.position.y][unit.position.x]); // Actual variant-aware payout''')
for path in ['lab/harness/bots/archetypes.ts','lab/harness/bots/probes.ts']:
    p=BOX/path;p.write_text("import { depthValue, yieldForMining } from '../../../src/game/economy';\n"+p.read_text())
replace('lab/harness/bots/archetypes.ts','return Math.min(def.mining - cell.minedDepth, cell.resourceLayers);','return yieldForMining(def.mining, cell);')
replace('lab/harness/bots/archetypes.ts','def.mining * 20','depthValue(0, def.mining) * 20')
replace('lab/harness/bots/probes.ts','Math.min(def.mining - cell.minedDepth, cell.resourceLayers) * 10','yieldForMining(def.mining, cell) * 10')
replace('lab/harness/bots/probes.ts','def.mining * 10','depthValue(0, def.mining) * 10')
replace('lab/harness/bots/probes.ts','const rich = cell ? cell.resourceLayers : 0;','const rich = cell ? depthValue(cell.minedDepth, cell.resourceLayers) : 0;')
replace('lab/experiments/map-d-policies.ts',"import type { Bot", "import { yieldForMining } from '../../src/game/economy';\nimport type { Bot")
replace('lab/experiments/map-d-policies.ts','Math.max(0,Math.min(cell.resourceLayers,d.mining-cell.minedDepth))','yieldForMining(d.mining,cell)')
# Lab-only continuation entrypoint; never alter the production runner.
replace('lab/harness/runner.ts','export interface PlayGameArgs {','export interface PlayGameArgs {\n  initialState?: GameState;')
replace('lab/harness/runner.ts','let state = createInitialGameState(options.resourceLayout);','let state = args.initialState ? structuredClone(args.initialState) : createInitialGameState(options.resourceLayout);')
replace('src/game/board.ts','  const whiteState: PlayerState = {', "  board = {...board, units:board.units.map(u=>({...u,id:`start-${u.owner}-${u.definitionId}`}))};\n  const whiteState: PlayerState = {")
(OUT/'engine-patches.json').write_text(json.dumps({'newEconomyModule':economy,'replacements':changes},indent=2)+'\n')
print(f'Prepared isolated engines from {archive}; {len(changes)} checked substitutions.')
