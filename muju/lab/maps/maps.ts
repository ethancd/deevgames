/** Lab-only maps: live createInitialGameState and the v1.3 catalogue are untouched. */
export interface MineralMap { id: string; name: string; summary: string; rules: string[]; cells: number[] }
export const SIZE = 10;
export const index = (x: number, y: number) => y * SIZE + x;
export const xy = (p: number) => [p % SIZE, Math.floor(p / SIZE)] as const;
export const distance = (a: number, b: number) => Math.abs(a % 10 - b % 10) + Math.abs(Math.floor(a / 10) - Math.floor(b / 10));
const blank = () => Array<number>(100).fill(3);
const rect = (x: number, y: number, w: number, h: number) => Array.from({length:w*h}, (_, i) => index(x+i%w,y+Math.floor(i/w)));
function paint(cells: number[], points: number[], value: number, rotate = false) { for (const p of points) { cells[p]=value; if(rotate) cells[99-p]=value; } }
const home = rect(0,0,2,2);
const b = blank();
for (const [x,y] of [[0,0],[8,0],[0,8],[8,8],[4,4]]) paint(b,rect(x,y,2,2),5);
const c = blank(); paint(c,home,5,true); paint(c,rect(6,1,3,2),5,true);
const d = [...c];
paint(d,[...rect(0,3,2,3),index(2,3),index(2,4)],4,true);
paint(d,[...rect(3,0,3,2),index(3,2),index(4,2)],2,true);
const e = blank(); paint(e,home,5,true);
paint(e,[index(6,1),index(7,1),index(7,2),index(8,2),index(6,3),index(8,3)],5,true);
paint(e,[index(0,3),index(1,3),index(2,3),index(0,4),index(1,4),index(2,4),index(3,4),index(3,5),index(1,5),index(2,6)],4,true);
paint(e,[index(3,0),index(4,0),index(5,0),index(3,1),index(4,1),index(5,1),index(4,2),index(5,2),index(5,3),index(9,3)],2,true);
export const MAPS: MineralMap[] = [
 {id:'A',name:'Uniform wells',summary:'Five layers on every square.',rules:['Every cell starts at depth 5.'],cells:Array(100).fill(5)},
 {id:'B',name:'Five islands',summary:'Five identical deep islands: four corners and the center.',rules:['Three layers everywhere.','Five layers in the 2×2 squares at all four corners and the center.'],cells:b},
 {id:'C',name:'Two wings',summary:'Deep homes and two off-center expansion islands.',rules:['Three layers everywhere.','Five layers in the two starting 2×2 corners.','A deep 3×2 expansion at the northeast, rotated to the southwest.'],cells:c},
 {id:'D',name:'Unequal routes',summary:'Compact medium wells on one route; a shallow approach to deep wells on the other.',rules:['Three layers everywhere.','Five layers in the two starting 2×2 corners.','A deep 3×2 expansion at the northeast, rotated to the southwest.','Add a compact eight-cell shelf of four-layer wells on each player’s near flank.','Lower eight approach cells on the other flank to two layers; rotate both features.'],cells:d},
 {id:'E',name:'Braided frontiers',summary:'Deep homes, scattered deep expansions, medium shelves and secondary pockets, shallow approaches, a modest center.',rules:['Three layers form the background and central four squares.','Keep the starting 2×2 homes at five layers.','Place six deep wells in a staggered expansion on one wing.','Place ten four-layer wells across a compact shelf and small secondary pockets on the other wing.','Place ten shallow wells along approaches and one exposed edge square.','Rotate every feature 180° for the other player.'],cells:e},
];
export function validateMap(map: MineralMap) {
 if(map.cells.length!==100 || map.cells.some((v,i)=>!Number.isInteger(v)||v<0||v>5||v!==map.cells[99-i])) throw new Error(`Invalid map ${map.id}`);
 for(const p of [1,10,11,88,89,98]) if(map.cells[p]!==5) throw new Error('Starting units must retain full wells');
 if(map.id!=='A' && map.cells.reduce((a,b)=>a+b,0)!==340) throw new Error(`Budget mismatch ${map.id}`);
}
MAPS.forEach(validateMap);
export const REGIONS = [
 {id:'home',name:'Home',cells:rect(0,0,3,3),start:index(1,1)},
 {id:'east',name:'East approach',cells:rect(3,0,3,3),start:index(3,1)},
 {id:'south',name:'South shelf',cells:rect(0,3,3,3),start:index(1,3)},
 {id:'expansion',name:'Far eastern expansion',cells:rect(6,1,3,3),start:index(6,2)},
 {id:'center',name:'Center',cells:rect(3,3,4,4),start:index(4,4)},
 {id:'pocket',name:'Western pocket',cells:rect(1,6,3,3),start:index(2,6)},
 {id:'far',name:'Far corner',cells:rect(7,7,3,3),start:index(8,8)},
];
