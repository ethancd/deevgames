// Frozen pre-release baseline: changing the production default must not rewrite this study.
export const current = [
  10, 10, 4, 0, 0, 0, 4, 4, 4, 4,
  10, 10, 4, 0, 0, 0, 10, 10, 10, 4,
  4, 4, 4, 0, 0, 0, 10, 10, 10, 4,
  8, 8, 4, 4, 4, 4, 4, 4, 4, 4,
  8, 8, 4, 4, 4, 4, 4, 4, 8, 8,
  8, 8, 4, 4, 4, 4, 4, 4, 8, 8,
  4, 4, 4, 4, 4, 4, 4, 4, 8, 8,
  4, 10, 10, 10, 0, 0, 0, 4, 4, 4,
  4, 10, 10, 10, 0, 0, 0, 4, 10, 10,
  4, 4, 4, 4, 0, 0, 0, 4, 10, 10,
];
// Transcribed from Screenshot 2026-09-12 at 4.00.48 PM. F7 is selected, value 4.
export const alternate = [
  10,10,10,0,0,0,4,4,4,4,
  10,10,4,0,0,0,4,10,10,4,
  10,4,4,0,0,0,4,10,10,4,
  4,4,4,4,4,8,4,4,4,4,
  4,4,4,8,8,8,4,4,4,4,
  4,4,4,4,8,8,8,4,4,4,
  4,4,4,4,8,4,4,4,4,4,
  4,10,10,4,0,0,0,4,4,10,
  4,10,10,4,0,0,0,4,10,10,
  4,4,4,4,0,0,0,10,10,10,
];
export const coord = (p:number) => `${'ABCDEFGHIJ'[p%10]}${Math.floor(p/10)+1}`;
export const at = (s:string) => 'ABCDEFGHIJ'.indexOf(s[0]) + (Number(s.slice(1))-1)*10;
export const centralRich = ['F4','D5','E5','F5','E6','F6','G6','E7'].map(at);
// Factorial controls: keep the other family of changes at its current setting.
export const homeExpansionOnly = current.map((n,i)=>n===10||alternate[i]===10?alternate[i]:n);
export const centerOnly = current.map((n,i)=>n===8||alternate[i]===8?alternate[i]:n);
export const maps = {current,alternate,homeExpansionOnly,centerOnly};
for (const [id,cells] of Object.entries(maps)) {
  if(cells.length!==100||cells.some((n,i)=>![0,4,8,10].includes(n)||n!==cells[99-i]))throw Error(`Invalid ${id}`);
}
if(current.reduce((a,b)=>a+b)!==496||alternate.reduce((a,b)=>a+b)!==480)throw Error('Unexpected totals');
if(alternate.some((n,i)=>n!== (current[i] + homeExpansionOnly[i]-current[i]+centerOnly[i]-current[i])))throw Error('Factorial mismatch');
