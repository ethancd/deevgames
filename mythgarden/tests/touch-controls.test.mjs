import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../mythgarden/static/mythgarden/js/touchControls.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020}}).outputText
const {destinationAction, actionCost, readTouchPreference, arrangeSlots} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
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
