import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../mythgarden/static/mythgarden/js/touchControls.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020}}).outputText
const {destinationAction, actionCost, readTouchPreference, arrangeSlots, readBagSlots, rememberBagSlots, moveBagItem} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const action = (uniqueDigest, extra = {}) => ({uniqueDigest, ...extra})

test('a selected item can only use its own server-offered destination', () => {
  const actions = ['PLANT-12', 'SELL-12', 'STOW-12', 'GIVE-12-9', 'GIVE-13-8', 'TALK-8', 'BUY-5', 'WATER-5'].map(d => action(d))
  for (const [target, digest] of [['soil','PLANT-12'], ['sell','SELL-12'], ['storage','STOW-12'], ['villager','GIVE-12-9']]) {
    assert.equal(destinationAction(actions, 12, target, 9).uniqueDigest, digest)
  }
  assert.equal(destinationAction(actions, 12, 'villager', 8), undefined, 'must not talk or give another item on an invalid gift tap')
  assert.equal(destinationAction(actions, 5, 'soil'), undefined, 'must not water or buy when planting was intended')
  assert.equal(destinationAction(actions, null, 'sell'), undefined)
})

test('full soil and chest prevent spending an item or time; selling still works', () => {
  const actions = ['PLANT-12','STOW-12','SELL-12'].map(d => action(d))
  assert.equal(destinationAction(actions, 12, 'soil', undefined, 6), undefined)
  assert.equal(destinationAction(actions, 12, 'storage', undefined, 6), undefined)
  assert.equal(destinationAction(actions, 12, 'soil', undefined, 5).uniqueDigest, 'PLANT-12')
  assert.equal(destinationAction(actions, 12, 'sell', undefined, 6).uniqueDigest, 'SELL-12')
})

test('changed server actions invalidate an old selection without inventing a digest', () => {
  assert.equal(destinationAction([action('GIVE-13-9')], 12, 'villager', 9), undefined)
  assert.equal(destinationAction([], 12, 'sell'), undefined)
})

test('classic and fantasy seed names do not change destination behavior', () => {
  for (const name of ['Parsnip Seed', 'Potato Seed', 'Mythfruit Seed', 'Weedbulb Seed', 'Lightning Artichoke Seed', 'Hallowed Pumpkin Seed']) {
    const seedAction = action('PLANT-42', {description: `Plant ${name}`, costType:'time',costAmount:15})
    assert.equal(destinationAction([seedAction],42,'soil'),seedAction)
  }
})

test('time and money costs remain readable, including zero cost and boosted minutes', () => {
  assert.equal(actionCost(), '')
  assert.equal(actionCost({costType:'time',costAmount:0}), '0m')
  assert.equal(actionCost({costType:'time',costAmount:7}), '7m')
  assert.equal(actionCost({costType:'time',costAmount:60}), '1h')
  assert.equal(actionCost({costType:'time',costAmount:90}), '1h 30m')
  assert.equal(actionCost({costType:'money',costAmount:25}), '25 fleurs')
})

test('the browser feature flag defaults on and respects an explicit opt-out', () => {
  assert.equal(readTouchPreference({getItem: () => null}), true)
  assert.equal(readTouchPreference({getItem: () => 'off'}), false)
  assert.equal(readTouchPreference({getItem: () => 'on'}), true)
})

test('restricted browser storage cannot prevent the game from rendering', () => {
  assert.equal(readTouchPreference({getItem: () => {throw new Error('Storage unavailable')}}), true)
  assert.equal(readTouchPreference(), true)
})

test('planting respects the tapped slot across growth, harvest and reload', () => {
  const saved = JSON.parse(JSON.stringify({12:4, 13:1}))
  const planted = arrangeSlots([{id:12,name:'seed'},{id:13,name:'sprout'}], saved)
  assert.equal(planted[4].id, 12)
  assert.equal(planted[1].id, 13)
  const harvested = arrangeSlots([{id:77,placementId:12,name:'crop'}], saved)
  assert.equal(harvested[4].name, 'crop')
  assert.equal(harvested[1], null)
})

test('old or malformed slot preferences never lose or duplicate items', () => {
  const items = [{id:1},{id:2},{id:3},{id:4}]
  const slots = arrangeSlots(items, {1:2,2:2,3:-1,4:50,99:1})
  assert.equal(slots.length,6)
  assert.deepEqual(slots.filter(Boolean).map(item=>item.id).sort(),[1,2,3,4])
  assert.equal(arrangeSlots(items, null).filter(Boolean).length,4)
})

const sceneSource = readFileSync(new URL('../mythgarden/static/mythgarden/js/sceneLayout.ts', import.meta.url), 'utf8')
const sceneCompiled = ts.transpileModule(sceneSource, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020}}).outputText
const {placeScenePeople, overlaps} = await import(`data:text/javascript;base64,${Buffer.from(sceneCompiled).toString('base64')}`)

test('landscape markers avoid crops, sell targets, travel and each other at phone/tablet sizes', () => {
  for (const [width, height, compact] of [[308,356,true], [378,488,true], [660,640,false]]) {
    const obstacles = [
      {x:0,y:0,width,height:48},
      {x:width*.16,y:height-10-Math.max(height*.38,144),width:width*.68,height:Math.max(height*.38,144)},
      {x:width*.16,y:height-10-Math.max(height*.38,144)-49,width:width*.68,height:44},
      {x:width/2-35,y:height-44,width:70,height:44},
    ]
    const positions = placeScenePeople(width,height,obstacles,2,compact,'SHOP')
    assert.equal(positions.length, 2, 'both shopkeepers must be visible')
    positions.forEach((rect,i) => {
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x+rect.width<=width && rect.y+rect.height<=height)
      assert.ok(![...obstacles,...positions.slice(0,i)].some(other=>overlaps(rect,other,4)))
    })
  }
})

test('all four Victorian residents fit directly in the scene, including short phones', () => {
  for (const [width,height,compact] of [[308,308,true],[308,356,true],[378,488,true],[660,640,false]]) {
    const obstacles = [{x:8,y:8,width:200,height:34},{x:width-60,y:height-72,width:52,height:64}]
    const positions = placeScenePeople(width,height,obstacles,4,compact,'HOME')
    assert.equal(positions.length,4)
    positions.forEach((rect,i) => {
      assert.ok(rect.x >= 8 && rect.y >= 8 && rect.x+rect.width <= width-8 && rect.y+rect.height <= height-8)
      assert.ok(![...obstacles,...positions.slice(0,i)].some(other => overlaps(rect,other,4)))
    })
    assert.deepEqual(placeScenePeople(width,height,obstacles,4,compact,'HOME'),positions)
  }
})

test('larger groups are not capped and crowded scenes keep every portrait reachable', () => {
  const obstacles = [{x:0,y:0,width:308,height:356}]
  const crowded = placeScenePeople(308,356,obstacles,5,true)
  assert.equal(crowded.length,5)
  crowded.forEach((rect,i) => assert.ok(![...obstacles,...crowded.slice(0,i)].some(other => overlaps(rect,other,4))))
  assert.deepEqual(placeScenePeople(308,356,[],0,true),[])
  const positions = placeScenePeople(308,356,[],8,true,'FARM')
  assert.equal(positions.length,8)
  assert.ok(positions.every(rect => rect.y+rect.height <= 356))
  assert.deepEqual(placeScenePeople(308,356,[],8,true,'FARM'),positions, 'positions must not randomly shuffle')
})


test('moving a bag item pins its neighbors and survives reload and server reordering', () => {
  const items = [{id:1},{id:2},{id:3}]
  const moved = moveBagItem(items, {}, 2, 5)
  assert.deepEqual(moved, {1:0,2:5,3:2})
  const reloaded = readBagSlots({getItem: () => JSON.stringify(moved)})
  const slots = arrangeSlots([...items].reverse(), reloaded)
  assert.deepEqual(slots.map(item=>item?.id ?? null), [1,null,3,null,null,2])
})

test('using an item leaves a bag hole and a new item fills it without shifting others', () => {
  const pinned = rememberBagSlots([{id:1},{id:2},{id:3}], {})
  const afterUse = rememberBagSlots([{id:3},{id:1}], pinned)
  assert.deepEqual(afterUse, {1:0,3:2})
  const acquired = rememberBagSlots([{id:4},{id:3},{id:1}], afterUse)
  assert.deepEqual(acquired, {1:0,3:2,4:1})
  assert.deepEqual(rememberBagSlots([], acquired), {}, 'new weeks discard stale item positions')
})

test('bag moves cannot overwrite occupied slots or move missing items', () => {
  const items = [{id:12,placementId:7},{id:13}]
  const pinned = rememberBagSlots(items, {})
  for (const slot of [0,1,-1,6,1.5,NaN]) assert.equal(moveBagItem(items,pinned,12,slot),null)
  assert.equal(moveBagItem(items,pinned,99,4),null)
  assert.equal(moveBagItem(items,pinned,12,4)[7],4, 'use stable placement identity')
  assert.deepEqual(items,[{id:12,placementId:7},{id:13}], 'cosmetic moves do not change inventory')
})

test('malformed or blocked bag storage is repaired without losing items', () => {
  for (const raw of ['nope','null','[]','true']) assert.deepEqual(readBagSlots({getItem:()=>raw}),{})
  assert.deepEqual(readBagSlots({getItem:()=>{throw new Error('blocked')}}),{})
  const pinned = rememberBagSlots([{id:1},{id:2},{id:3}],readBagSlots({getItem:()=>'{"1":4,"2":4,"3":99,"77":1}'}))
  assert.deepEqual(pinned,{1:4,2:0,3:1})
})
