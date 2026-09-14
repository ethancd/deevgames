import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { playGame } from '../../harness/runner';
import { makeHomeBot } from '../home-policies';
import type { GameRecord } from '../../harness/types';

const OUT=new URL('../../results/four-actions-2026-09-12/',import.meta.url);
const path=new URL('paired-6.jsonl',OUT);
const content=existsSync(path)?readFileSync(path,'utf8'):gunzipSync(readFileSync(new URL('paired-6.jsonl.gz',OUT))).toString();
const records=content.trim().split('\n').map(s=>JSON.parse(s));
function semantic(r:GameRecord) {
  return {winner:r.winner,winType:r.winType,turns:r.turns,plies:r.plies,firstBlood:r.firstBlood,
    incomeCurve:r.incomeCurve,purchases:r.purchases,materialCurve:r.materialCurve,
    promotions:r.promotionEvents.map(({unitId,...event})=>event),
    players:Object.fromEntries(Object.entries(r.players).map(([p,s])=>[p,{...s,upkeepReleased:s.upkeepReleased?.map(({id,...event})=>event)}]))};
}
let verified=0;
for(const expected of records.filter(r=>r.i===0&&!r.swapped)) {
  const actual=await playGame({bots:{white:makeHomeBot(expected.a),black:makeHomeBot(expected.b)},
    seed:expected.seed,engineHash:'production-verification',runId:'verify',options:expected.options});
  assert.deepEqual(semantic(actual.record),semantic(expected));
  verified++;
}
assert.equal(verified,8);
writeFileSync(new URL('baseline-verification.json',OUT),JSON.stringify({verified,method:'Independent rerun using production modules; compare full economic/material curves, purchases, promotions and outcomes, ignoring generated unit IDs.'},null,2));
console.log(`Verified ${verified} six-action baseline games against production modules.`);
