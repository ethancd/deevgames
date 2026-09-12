// ABI 6. Header slot 6 supplies the match's full action budget for placement.
// A complete current-turn target-removal search. No hidden state is read.
// The host supplies the canonical catalogue and elemental attack matrix.
// Buffers stay rooted for the instance lifetime; DFS mutates/undoes in place.
const MAX_UNITS: i32 = 100;
const STRIDE: i32 = 10; // position, owner, definition, damage, flags, four attack words, count
const input = new Int32Array(16 + MAX_UNITS * STRIDE);
let catalogueSize: i32 = 0;
let catalogue = new Int32Array(0); // attack, defense, speed, next, promotion cost, tier
let powers = new Int32Array(0);
export function configureCatalogue(size: i32): void {
  assert(size > 0 && size <= 1000);
  catalogueSize = size;
  catalogue = new Int32Array(size * 6);
  powers = new Int32Array(size * size);
}
const output = new Int32Array(3 * 108);
const path = new Int32Array(3 * 108);
const occupied = new Int32Array(100);
// Each DFS level owns its BFS scratch; recursion must not overwrite its caller.
const distances = new Int32Array(108 * 100);
const queues = new Int32Array(108 * 100);
let count: i32 = 0;
let player: i32 = 0;
let target: i32 = 0;
let resources: i32 = 0;
let visited: i32 = 0;
let maxNodes: i32 = 0;
let cutoff: bool = false;
let length: i32 = 0;

@external('env', 'shouldStop')
declare function shouldStop(): i32;
export function abiVersion(): i32 { return 6; }
export function inputPtr(): usize { return input.dataStart; }
export function cataloguePtr(): usize { return catalogue.dataStart; }
export function powersPtr(): usize { return powers.dataStart; }
export function outputPtr(): usize { return output.dataStart; }
export function nodes(): i32 { return visited; }
export function resultLength(): i32 { return length; }
function at(u: i32): i32 { return 16 + u * STRIDE; }
function pos(u: i32): i32 { return input[at(u)]; }
function own(u: i32): i32 { return input[at(u) + 1] == player; }
function def(u: i32): i32 { return input[at(u) + 2]; }
function alive(u: i32): bool { return pos(u) >= 0; }
function md(a: i32, b: i32): i32 { return abs(a % 10 - b % 10) + abs(a / 10 - b / 10); }
function attacked(u: i32, v: i32): bool { return (input[at(u) + 5 + (v >> 5)] & (1 << (v & 31))) != 0; }
function canAttack(u: i32): bool {
  const flags = input[at(u) + 4], attacks = input[at(u) + 9];
  return (flags & 1) != 0 && attacks < catalogue[def(u) * 6 + 5]
    && (attacks == 0 || (flags & 8) != 0);
}
function power(u: i32, v: i32): i32 { return powers[def(u) * catalogueSize + def(v)]; }
function remainingDefense(u: i32): i32 { return max(0, catalogue[def(u) * 6 + 1] - input[at(u) + 3]); }
function record(depth: i32, kind: i32, unit: i32, dest: i32): void {
  path[depth * 3] = kind; path[depth * 3 + 1] = unit; path[depth * 3 + 2] = dest;
}
function success(depth: i32): bool {
  length = depth;
  for (let k = 0; k < depth * 3; k++) output[k] = path[k];
  return true;
}
function enter(): bool {
  if (visited >= maxNodes || ((visited & 127) == 0 && shouldStop() != 0)) { cutoff = true; return false; }
  visited++; return true;
}
// Optimistic bound: empty-board access, each still-eligible attacker once.
// Ignoring traffic and competing action costs can only overestimate rescue ability.
function possible(actions: i32): bool {
  let damage = 0, attackers = 0;
  for (let u = 0; u < count; u++) {
    if (!alive(u) || !own(u) || !canAttack(u) || attacked(u, target)) continue;
    const steps = max(0, md(pos(u), pos(target)) - 1);
    const speed = catalogue[def(u) * 6 + 2];
    if ((steps + speed - 1) / speed + 1 <= actions) { damage += power(u, target); attackers++; }
  }
  return attackers > 0 && damage >= remainingDefense(target);
}
function dfs(actions: i32, depth: i32): bool {
  if (!alive(target)) return success(depth);
  if (actions <= 0 || depth >= 107 || !enter() || !possible(actions)) return false;
  // Target attacks first, then attacks that can clear movement lanes.
  for (let pass = 0; pass < 2; pass++) {
    for (let u = 0; u < count; u++) {
      if (!alive(u) || !own(u) || !canAttack(u)) continue;
      for (let v = 0; v < count; v++) {
        if ((v == target) != (pass == 0) || !alive(v) || own(v) || md(pos(u), pos(v)) != 1 || attacked(u, v)) continue;
        const damage = power(u, v), oldDamage = input[at(v) + 3], oldPos = pos(v);
        const word = at(u) + 5 + (v >> 5), oldWord = input[word];
        const oldFlags = input[at(u) + 4], oldCount = input[at(u) + 9];
        const killed = damage >= remainingDefense(v);
        input[at(u) + 9] = oldCount + 1;
        input[at(u) + 4] = (oldFlags & ~8) | (killed ? 8 : 0);
        input[word] |= 1 << (v & 31);
        if (killed) { input[at(v)] = -1; occupied[oldPos] = -1; }
        else input[at(v) + 3] += damage;
        record(depth, 2, u, oldPos);
        const found = dfs(actions - 1, depth + 1);
        input[at(u) + 4] = oldFlags; input[at(u) + 9] = oldCount;
        input[word] = oldWord; input[at(v) + 3] = oldDamage; input[at(v)] = oldPos; occupied[oldPos] = v;
        if (found) return true;
        if (cutoff) return false;
      }
    }
  }
  // Every legal destination, with exact BFS cost. Keep cheap approaches first,
  // but also retain retreat/rotation moves: these are essential for corner rescues.
  for (let u = 0; u < count; u++) {
    if (!alive(u) || !own(u) || !(input[at(u) + 4] & 1)) continue;
    const start = pos(u), speed = catalogue[def(u) * 6 + 2], base = depth * 100;
    for (let k = 0; k < 100; k++) distances[base + k] = -1;
    let head = 0, tail = 1;
    queues[base] = start; distances[base + start] = 0;
    while (head < tail) {
      const p = queues[base + head++], d = distances[base + p];
      if (d >= speed * actions) continue;
      for (let direction = 0; direction < 4; direction++) {
        const n = direction == 0 ? p - 10 : direction == 1 ? p + 10 : direction == 2 ? p - 1 : p + 1;
        if (n < 0 || n >= 100 || md(p, n) != 1 || occupied[n] >= 0 || distances[base + n] >= 0) continue;
        distances[base + n] = d + 1; queues[base + tail++] = n;
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 1; k < tail; k++) {
        const dest = queues[base + k];
        if ((md(dest, pos(target)) < md(start, pos(target))) != (pass == 0)) continue;
        const cost = (distances[base + dest] + speed - 1) / speed;
        // Any clearing sequence still needs at least one attack.
        if (cost >= actions) continue;
        input[at(u)] = dest; occupied[start] = -1; occupied[dest] = u;
        record(depth, 1, u, dest);
        const found = dfs(actions - cost, depth + 1);
        input[at(u)] = start; occupied[dest] = -1; occupied[start] = u;
        if (found) return true;
        if (cutoff) return false;
      }
    }
  }
  return false;
}
// Promotions commute. Enumerate each subset once and then enter the action phase.
// No placement is possible while an enemy occupies home (all rectangles blocked).
function promotions(first: i32, actions: i32, depth: i32): bool {
  record(depth, 4, 0, 0); // explicit phase end is always legal, even when redundant
  if (dfs(actions, depth + 1)) return true;
  if (cutoff || !enter()) return false;
  for (let u = first; u < count; u++) {
    if (!alive(u) || !own(u) || (input[at(u) + 4] & 6)) continue;
    const oldDef = def(u), next = catalogue[oldDef * 6 + 3], price = catalogue[oldDef * 6 + 4];
    if (next < 0 || price > resources) continue;
    input[at(u) + 2] = next; resources -= price;
    record(depth, 3, u, 0);
    const found = promotions(u + 1, actions, depth + 1);
    resources += price; input[at(u) + 2] = oldDef;
    if (found) return true;
    if (cutoff) return false;
  }
  return false;
}
// 1 = proved (witness); 0 = exhaustive failure in stated scope; -1 = unknown.
// Caller only enables placement-phase search with home occupied, otherwise queues
// and newly placed units would make this scope incomplete.
export function solve(targetIndex: i32, nodeLimit: i32): i32 {
  if (input[0] != 6 || input[1] > MAX_UNITS || input[1] < 1 || targetIndex < 0 || targetIndex >= input[1] || input[6] != 4) return -1;
  count = input[1]; player = input[2]; target = targetIndex; resources = input[5];
  visited = 0; maxNodes = max(0, nodeLimit); cutoff = false; length = 0;
  occupied.fill(-1);
  for (let u = 0; u < count; u++) if (alive(u)) occupied[pos(u)] = u;
  if (own(target)) return -1;
  const actions = input[4] == 0 ? input[6] : input[3];
  // Iterative deepening prefers the shortest action-cost rescue and finds simple
  // saves before spending the budget on complicated alternatives.
  for (let cost = 1; cost <= actions; cost++) {
    const found = input[4] == 0 ? promotions(0, cost, 0) : dfs(cost, 0);
    if (found) return 1;
    if (cutoff) return -1;
  }
  return 0;
}
