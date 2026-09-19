// Small authored bootstrap goldens; no corpus, searches or measured suite choices.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const repo = '/Users/ashkie/Documents/Codex/2026-09-18/wba/work/deevgames-phasing-m6/muju';
const out = process.argv[2];
assert(out && path.isAbsolute(out) && !fs.existsSync(out));
const hash = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
const { withHeavySlot, heavyBypassed } = await import(`${repo}/lab/hard-ai/ladder/heavy.ts`);
assert(!heavyBypassed() && !process.env.MUJU_HEAVY_DIR && !process.env.MUJU_HEAVY_SLOTS);
await withHeavySlot('codex-m6-freeze-bootstrap', async () => {
  const scan = () => execFileSync('rg', ['--files','src/ai/hard','src/game','src/ai/simulate.ts','src/ai/types.ts','lab/hard-ai/oracles/phasing-economy.ts','tests/ai/hard/game-fixture.ts','lab/hard-ai/positions/corpus.ts','lab/hard-ai/ladder/heavy.ts'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').sort();
  const hashes = (paths: string[]) => Object.fromEntries(paths.map(p => [p, hash(fs.readFileSync(path.join(repo,p)))]));
  const report: any = { schema: 'muju-phasing-bootstrap-goldens-v1', startedAt: new Date().toISOString(),
    cases: [], success: false, sourceDrift: true, finalizationErrors: [] };
  let before: Record<string, string> | undefined, ownsOutput = false;
  try {
    assert(!fs.existsSync(out), 'Output appeared while waiting for shared queue');
    fs.mkdirSync(out, { recursive: true }); ownsOutput = true;
    report.driverSha256 = hash(fs.readFileSync(import.meta.filename));
    report.head = execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
    report.gitStatus = execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'});
    before = hashes(scan()); report.sourceHashes = before;
    const { buildState } = await import(`${repo}/tests/ai/hard/game-fixture.ts`);
    const { mirror180 } = await import(`${repo}/lab/hard-ai/positions/corpus.ts`);
    const { canonicalPhasingEconomy } = await import(`${repo}/lab/hard-ai/oracles/phasing-economy.ts`);
    const { getUnitDefinition, UNIT_DEFINITIONS } = await import(`${repo}/src/game/units.ts`);
    const { Replica } = await import(`${repo}/src/ai/hard/core/state.ts`);
    const { Scratch } = await import(`${repo}/src/ai/hard/core/bits.ts`);
    const { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } = await import(`${repo}/src/ai/hard/tables/context.ts`);
    const { Evaluator, NULL_METER } = await import(`${repo}/src/ai/hard/eval/evaluate.ts`);
    const { FEATURE_COUNT, FEATURE_NAMES } = await import(`${repo}/src/ai/hard/eval/features.ts`);
    const { DEFAULT_WEIGHTS, serializeWeights, weightsHash } = await import(`${repo}/src/ai/hard/eval/weights.ts`);
    assert.equal(FEATURE_COUNT,62);
    assert.deepEqual(Array.from(DEFAULT_WEIGHTS.material), UNIT_DEFINITIONS.map((d:any)=>getUnitDefinition(d.id).cost*100));
    assert.deepEqual([...DEFAULT_WEIGHTS.w].flatMap((v,i)=>v?[[i,v]]:[]),[[0,100],[2,100],[3,100],[23,100],[58,1]]);
    const weights=serializeWeights(DEFAULT_WEIGHTS);
    report.weightsHash=weightsHash(DEFAULT_WEIGHTS); report.weightsFileSha256=hash(weights+'\n'); report.featureNames=FEATURE_NAMES;
    report.evaluatorIdentity = { implementation: 'production Evaluator', featureCount: FEATURE_COUNT,
      featureSchema: DEFAULT_WEIGHTS.featureSchema, weightsVersion: DEFAULT_WEIGHTS.version,
      weightsHash: report.weightsHash, weightsSha256: hash(weights), evalFix: null,
      book: 'not-used', search: 'not-executed' };
    fs.writeFileSync(path.join(out,'weights.json'),weights+'\n',{flag:'wx'});
    const base = { units: [{id:'w',def:'metal_1',owner:'white',x:2,y:2},{id:'b',def:'fire_1',owner:'black',x:7,y:7}], white:0,black:0,current:'black',phase:'place',actions:0,reserves:Array(100).fill(0),victoryRule:'elimination',inactivityRule:'off' };
    const cases = [
      ['dry-principal', base],
      ['cash-eight', {...base,white:8}], ['cash-nine', {...base,white:9}],
      ['paid-principal', {...base,pendingSummons:[{id:'paid',def:'fire_1',owner:'white',x:1,y:1}]}],
      ['finite-paid-service-no-movement-window', {...base,pendingSummons:[{id:'paid',def:'fire_1',owner:'white',x:1,y:1}],reserves:Array.from({length:100},(_,i)=>i===11?2:0)}],
      ['invalid-refund-principal', {...base,pendingSummons:[{id:'paid',def:'fire_1',owner:'white',x:1,y:1}],units:[...base.units,{id:'block',def:'plant_1',owner:'black',x:0,y:1}]}],
      ['live-finite-mining', {...base,reserves:Array.from({length:100},(_,i)=>i===22?7:0)}],
      ['unpaid-prepare-release', {...base,current:'white',phase:'place',upkeepPending:true,units:[{id:'w',def:'fire_2',owner:'white',x:2,y:2},base.units[1]],white:0}],
      ['act-mining-funds-rent', {...base,current:'white',phase:'action',actions:4,units:[{id:'w',def:'water_2',owner:'white',x:2,y:2},base.units[1]],reserves:Array.from({length:100},(_,i)=>i===22?16:0)}],
    ] as const;
    const rep = new Replica(), sc = new Scratch(2,TABLE_SCRATCH_BB,TABLE_SCRATCH_I8,2);
    for (const [name,spec] of cases) for (const mirrored of [false,true]) {
      const authored = buildState(spec as any), state = mirrored ? mirror180(authored) : authored;
      const original = JSON.stringify(state);
      const row: any = { id:`${name}/${mirrored?'rotated':'original'}`, state:JSON.parse(original), stateSha256:hash(original), success:false };
      report.cases.push(row);
      try {
      const canonical = canonicalPhasingEconomy(state);
      const sign = (owner:string)=>owner==='white'?1:-1;
      const material = state.board.units.reduce((n:any,u:any)=>n+sign(u.owner)*getUnitDefinition(u.definitionId).cost*100,0);
      const cash = (state.players.white.resources-state.players.black.resources)*100;
      const live = Math.trunc((canonical.side[0].livePVcc-canonical.side[1].livePVcc)/100)*100;
      // The only service-bearing commitment has an immediate incoming Act from
      // enemy Prepare, hence no intervening enemy movement window. Other paid
      // cases have zero available resource service. This expected value does
      // not read the implementation's exposure selector.
      const paid = (state.pendingSummons??[]).reduce((n:any,q:any)=>n+sign(q.owner)*100*q.cost,0)
        + canonical.side[0].pendingServicePVcc.reduce((a:number,b:number)=>a+b,0)
        - canonical.side[1].pendingServicePVcc.reduce((a:number,b:number)=>a+b,0);
      const expected = material+cash+live+Math.trunc(paid);
      const p=rep.pack(state), ev=new Evaluator(rep), f=new Int32Array(FEATURE_COUNT);
      assert.equal(serializeWeights(ev.currentWeights),weights,'Evaluator weights differ from frozen vector');
      const actual=ev.full(p,0,sc,0,f), opposite=ev.full(p,1,sc,0);
      Object.assign(row,{ expectedCc:expected, actualCc:actual, oppositeCc:opposite,
        ledger:{material,cash,live,paid}, features:Array.from(f), canonical:{bills:canonical.bills,arrivals:canonical.arrivals,stop:canonical.stop} });
      assert(actual === expected,`${name}/${mirrored}: canonical ledger (${actual} versus ${expected})`);
      assert(opposite === -actual,`${name}/${mirrored}: viewpoint antisymmetry (${opposite} versus ${-actual})`);
      assert.equal(ev.evaluate(p,0,100000,100001,sc,0,NULL_METER),actual,`${name}/${mirrored}: full-window policy`);
      row.success=true;
      } catch(error) { row.error=error instanceof Error?error.stack:String(error); throw error; }
      finally {
        row.rootUnchanged=JSON.stringify(state)===original;
        if (!row.rootUnchanged) { row.success=false; report.finalizationErrors.push(`${row.id}: caller state changed`); }
      }
    }
    assert.equal(report.cases.length,18,'Authored golden domain changed');
  } catch(error) { report.error=error instanceof Error?error.stack:String(error); }
  try {
    const after = hashes(scan()); report.sourceHashesAfter = after;
    report.sourceDriftPaths = before ? [...new Set([...Object.keys(before),...Object.keys(after)])].filter(p=>before![p]!==after[p]).sort() : null;
    report.sourceDrift = !before || report.sourceDriftPaths.length !== 0;
    report.driverSha256After = hash(fs.readFileSync(import.meta.filename));
    report.driverDrift = !report.driverSha256 || report.driverSha256After !== report.driverSha256;
  } catch(error) { report.finalizationErrors.push(error instanceof Error?error.stack:String(error)); }
  report.finishedAt=new Date().toISOString();
  report.success = !report.error && report.finalizationErrors.length===0 && !report.sourceDrift && !report.driverDrift && report.cases.length===18 && report.cases.every((row:any)=>row.success);
  if (ownsOutput) fs.writeFileSync(path.join(out,'goldens.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({success:report.success,cases:report.cases.length,weightsHash:report.weightsHash,error:report.error}));
  if (!report.success) process.exitCode=1;
});
