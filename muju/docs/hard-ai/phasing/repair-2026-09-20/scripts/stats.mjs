// usage: node stats.mjs <run dir>  -> one line: record, spend ratio, promotions/game, loss types for the hard@ seat
import fs from 'node:fs';
const dir = process.argv[2];
const gs = fs.readFileSync(dir + '/games.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
let w = 0, d = 0, l = 0, n = 0, spent = 0, gained = 0, prom = 0, placed = 0, turns = 0; const lt = {};
for (const g of gs) {
  const seat = g.players.white.bot.startsWith('hard@') ? 'white' : 'black';
  const o = (!g.winner || g.winner === 'draw') ? 'd' : g.winner === seat ? 'w' : 'l';
  if (o === 'w') w++; else if (o === 'l') { l++; lt[g.winType] = (lt[g.winType] || 0) + 1; } else d++;
  const p = g.players[seat]; n++; spent += p.resourcesSpent; gained += p.resourcesGained; prom += p.promotions; placed += p.unitsPlaced; turns += g.completedTurns;
}
const voidLine = fs.existsSync(dir + '/summary.md') && /^- \*\*VOID\*\*/m.test(fs.readFileSync(dir + '/summary.md', 'utf8'));
console.log(`W/D/L ${w}/${d}/${l}  spend ${(100 * spent / gained).toFixed(0)}% (${(spent / n).toFixed(1)}/${(gained / n).toFixed(1)})  promotions/game ${(prom / n).toFixed(2)}  placed/game ${(placed / n).toFixed(1)}  avgTurns ${(turns / n).toFixed(0)}  losses ${JSON.stringify(lt)}${voidLine ? '  [harness VOID: timing]' : ''}`);
