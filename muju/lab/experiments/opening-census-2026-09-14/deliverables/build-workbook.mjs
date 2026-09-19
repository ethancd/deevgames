import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const out=path.dirname(new URL(import.meta.url).pathname);
const data=path.resolve(out,'../../../muju/lab/results/opening-census-2026-09-14');
const a=JSON.parse(await fs.readFile(path.join(data,'analysis.json'),'utf8'));
const c=JSON.parse(await fs.readFile(path.join(data,'census.json'),'utf8'));
const v=JSON.parse(await fs.readFile(path.join(data,'verification.json'),'utf8'));
const cont=JSON.parse(await fs.readFile(path.join(data,'continuations.json'),'utf8'));
const bin=await fs.readFile(path.join(data,'joint.bin')),F=a.features,N=F.length;
const wb=Workbook.create(),sheets={};
for(const n of ['Overview','Position lookup','Black responses','Opening patterns','All B1 scores','Capture masks','Taxonomy','Joint species','Continuations','Map','Method']){sheets[n]=wb.worksheets.add(n);sheets[n].showGridLines=false;}
const navy='#26364B',blue='#305E8C',amber='#F4E5C9';
function col(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function cell(sh,r,c){return sh.getCell(r-1,c-1);}
function title(sh,text,note){sh.getRange('A2').values=[[text]];sh.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:navy};if(note){sh.getRange('A3').values=[[note]];sh.getRange('A3').format.font={name:'Arial',size:10,italic:true,color:'#596575'};}}
function table(sh,headers,rows,start=5,name){const last=start+rows.length,end=col(headers.length-1);sh.getRange(`A${start}:${end}${last}`).values=[headers,...rows];sh.getRange(`A${start}:${end}${last}`).format.font={name:'Arial',size:10,color:navy};sh.getRange(`A${start}:${end}${last}`).format.rowHeight=20;sh.getRange(`A${start}:${end}${last}`).format.columnWidth=15;sh.getRange(`A${start}:${end}${last}`).format.verticalAlignment='center';sh.getRange(`A${start}:${end}${start}`).format={fill:navy,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:30,wrapText:true,horizontalAlignment:'center'};if(name)sh.tables.add(`A${start}:${end}${last}`,true,name);sh.freezePanes.freezeRows(start);sh.freezePanes.freezeColumns(1);return last;}
const p=sheets['Opening patterns'];title(p,'Every distinct first-move pattern','W1 and B1 share pattern IDs under a 180-degree rotation. Black coordinates are already rotated.');
const h=['Pattern ID','White Hi','White Sjor','White Muju','Black Hi','Black Sjor','Black Muju','Min actions','Shortest atomic sequences','Bank','Hi collection','Sjor collection','Muju collection','Hi reserve left','Sjor reserve left','Muju reserve left','Next idle harvest','Second idle harvest','Spawn squares','Spawn reserves','Order ID','Order','Genus ID','Species ID','Hi demand','Sjor demand','Muju demand','Hi terrain','Sjor terrain','Muju terrain','Spawn band','Economy score','Space score','Hi liability','Sjor liability','Muju liability','White witness','Black witness'];
const coords=n=>String.fromCharCode(65+n%10)+(1+Math.floor(n/10));
table(p,h,F.map(f=>[f.id,...f.coords,...f.blackCoords,f.minActions,f.shortestSequences,f.bank,...f.take,...f.reserves,f.next,f.second,f.spawnCount,f.spawnReserve,f.order,f.orderName,f.genus,f.species,...f.demands,...f.zones,f.spawnBand,f.economy,f.space,...f.captureLiability,f.witnessText,f.witness.map(([u,t])=>['Hi','Sjor','Muju'][u]+' '+coords(99-t)).join('; ')||'End turn']),5,'OpeningPatterns');
p.getRange('V6:V802').format.columnWidth=24;p.getRange('AK5:AL802').format.columnWidth=65;p.getRange('AF6:AJ802').setNumberFormat('0.00');
console.log('Pattern tables written');
const scores=sheets['All B1 scores'],masks=sheets['Capture masks'];
for(const sh of [scores,masks]){title(sh,sh.name,sh===scores?'Rows = W1 ID. Columns = B1 pattern ID. Positive favors White. ILLEGAL means both Hi occupy one square.':'Exact single-unit screen. Code = White target mask + 8 x Black latent target mask. 1 Hi; 2 Sjor; 4 Muju.');
 sh.getRangeByIndexes(4,0,N+1,N+1).format.font={name:'Arial',size:10,color:navy};sh.getRangeByIndexes(4,0,N+1,N+1).format.columnWidth=10;sh.getRangeByIndexes(4,0,N+1,N+1).format.rowHeight=20;
 sh.getRangeByIndexes(4,0,1,N+1).values=[['W1 / B1',...F.map(f=>f.id)]];sh.getRangeByIndexes(5,0,N,1).values=F.map(f=>[f.id]);
 sh.getRangeByIndexes(4,0,1,N+1).format.fill=navy;sh.getRangeByIndexes(4,0,1,N+1).format.font.color='#FFFFFF';sh.getRangeByIndexes(5,0,N,1).format.fill='#E8EDF2';sh.freezePanes.freezeRows(5);sh.freezePanes.freezeColumns(1);
}
for(let start=0;start<N;start+=40){const sr=[],mr=[];for(let i=start;i<Math.min(N,start+40);i++){const s=[],m=[];for(let j=0;j<N;j++){const off=(i*N+j)*12,z=bin.readFloatLE(off);s.push(Number.isFinite(z)?Math.round(z*100)/100:'ILLEGAL');m.push(Number.isFinite(z)?bin[off+4]+8*bin[off+5]:'ILLEGAL');}sr.push(s);mr.push(m);}scores.getRangeByIndexes(5+start,1,sr.length,N).values=sr;masks.getRangeByIndexes(5+start,1,mr.length,N).values=mr;}
scores.getRangeByIndexes(5,1,N,N).setNumberFormat('0.00');scores.getRangeByIndexes(5,1,N,N).conditionalFormats.add('colorScale',{colors:['#E7C48B','#FFFFFF','#99B9DC'],thresholds:[-8,0,8]});
console.log('All 635,203 scores and masks written');
const r=sheets['Black responses'];title(r,'Black responses to every W1','Lower index is better for Black. Near-best means within 1.00 of this model\'s best response; no win-rate claim.');
table(r,['W1 ID','White Hi','White Sjor','White Muju','Best B ID','Black Hi','Black Sjor','Black Muju','Best index','Legal B replies','Near-best replies','White species'],a.bestByW.map(x=>[x.w,...F[x.w-1].coords,x.b,...F[x.b-1].blackCoords,x.score,x.legal,x.nearBest,F[x.w-1].species]),5,'BlackResponses');
const tax=sheets.Taxonomy;title(tax,'Order, genus and species','Classification is descriptive. Members of a species are similar, not strategically interchangeable.');
const speciesRows=a.speciesKeys.map(([key,id])=>{const members=F.filter(f=>f.species===id),f=members[0];return[id,f.order,f.orderName,f.genus,f.demands.join('/'),f.zones.join(' / '),f.bank,f.spawnBand,members.length,Math.min(...members.map(m=>m.spawnCount)),Math.max(...members.map(m=>m.spawnCount)),members.map(m=>m.id).join(' ')];});
table(tax,['Species ID','Order ID','Order','Genus ID','H / S / M demand','Terrain: H / S / M','Bank','Spawn band','Patterns','Min spawn','Max spawn','Member IDs'],speciesRows,5,'Species');tax.getRange('C5:C210').format.columnWidth=24;tax.getRange('F5:F210').format.columnWidth=48;tax.getRange('L5:L210').format.columnWidth=65;
const js=sheets['Joint species'];title(js,'Every joint species after B1','Key = White species - Black species - White capture mask - Black latent capture mask.');
table(js,['Joint species ID','Joint species key','Joint order ID','Joint genus key','States','Min index','Max index','Mean index'],a.speciesStats.map(s=>[s.id,s.key,s.order,s.genus,s.count,s.min,s.max,s.sum/s.count]),5,'JointSpecies');js.getRange(`B5:B${a.speciesStats.length+5}`).format.columnWidth=25;js.getRange(`F6:H${a.speciesStats.length+5}`).setNumberFormat('0.00');
const actionText=x=>typeof x==="string"?x:x.type+(x.definitionId?" "+x.definitionId:"")+(x.unitId?" "+x.unitId.replace(/_1_.*$/,"_1"):"")+(x.position?" @"+x.position:"")+(x.to?" to "+x.to:"")+(x.targetPosition?" x"+x.targetPosition:"");
const cm=sheets.Continuations;title(cm,'Bounded W2 and B2 continuations','Diagnostic engine lines, not exhaustive best play. 8,000 work units per call, at most three calls per player turn.');
table(cm,['W1 ID','B1 ID','Initial index','After-B2 material W-B','White bank','Black bank','Engine static after B2','White W2 line','Black B2 line'],cont.map(x=>[x.w,x.b,x.initialIndex,x.material,...x.banks,x.engineStaticAfterB2,x.turns[0]?.actions.map(actionText).join('; ')??'',x.turns[1]?.actions.map(actionText).join('; ')??'']),5,'Continuations');cm.getRange(`C6:G${cont.length+5}`).setNumberFormat('0.00');cm.getRange(`H5:I${cont.length+5}`).format.columnWidth=85;cm.getRange(`H6:I${cont.length+5}`).format.wrapText=true;cm.getRange(`A6:I${cont.length+5}`).format.rowHeight=70;
const map=sheets.Map;title(map,'Initial map and state reconstruction','A1 is White\'s home. J10 is Black\'s home. Depletion occurs only at the six final occupied squares.');table(map,['Square','Initial reserve'],c.initialMap.map((n,i)=>[coords(i),n]),5,'MapReserves');
map.getRange('D5').values=[['Board rows increase downward']];for(let y=0;y<10;y++)map.getRangeByIndexes(6+y,3,1,10).values=[c.initialMap.slice(y*10,y*10+10)];map.getRange('D7:M16').format.columnWidth=7;map.getRange('D7:M16').format.rowHeight=30;map.getRange('D7:M16').conditionalFormats.add('colorScale',{colors:['#F0F1F2','#D6E0BF','#88A66A'],thresholds:[0,8,16]});
const method=sheets.Method;title(method,'Definitions, model and reproducibility');
const notes=[
 ['Scope','Standard v2.8 start; zero handicap; four shared actions; new 504-crystal map.'],
 ['W1 boundary','After White ends its first action phase and mines. Black starts B1 with zero crystals.'],
 ['B1 boundary','After Black ends and mines. White starts W2 with four actions and its W1 bank.'],
 ['State equivalence','Same six piece positions, banks, reserves and next player. Inert flags, histories and clocks excluded.'],
 ['Excluded','Resignation, undo, UI selection, different maps, handicaps and timed-room clock values.'],
 ['Completeness','BFS through every one-action move, depth 0 through 4. Stopping early included.'],
 ['Atomic sequences','Ways column counts shortest sequences of one-action destinations, not all histories or UI shortcuts.'],
 ['Cross-product proof','No first-round combat. Black cannot traverse a White unit before its last reachable step.'],
 ['Joint states','797 x 797 minus six Hi collisions = 635,203. Fresh Black BFS verified every White endpoint.'],
 ['Order','Which original pieces finish away from their starting squares: 8 possible subsets.'],
 ['Genus','Order plus per-piece ceil(Manhattan displacement / Speed). This is a demand, not a legal path proof.'],
 ['Species','Genus plus each piece terrain class, bank and spawn-size band. Exact coordinates remain distinct records.'],
 ['Spawn bands','Small 0-5; medium 6-12; large 13-20; wide 21 or more empty legal spawn squares.'],
 ['Joint taxonomy','Order and genus are paired W/B classes. Species additionally separates the two capture masks.'],
 ['Mask targets','1 = Hi, 2 = Sjor, 4 = Muju. Add bits when multiple targets have a single-unit capture line.'],
 ['White screen','Actual W2: existing unit, one affordable T2 promotion, or one affordable T1 purchase; <=4 actions.'],
 ['Black screen','Hypothetical fresh Black turn on unchanged board and existing bank. White actually moves first.'],
 ['Screen limits','Not a full-turn solver. No combined attacks, blocker clearing, purchase chains, post-kill retreat or recapture proof.'],
 ['Economy E','Bank + 0.60 x next idle harvest + 0.30 x second idle harvest.'],
 ['Space S','0.10 x legal empty spawn squares + 0.03 x crystals on those squares.'],
 ['Capture liability L','Captured unit catalogue price + lost E harvest terms + loss of S after that unit is removed.'],
 ['Opportunity Lw / Lb','Maximum opponent liability among screened targets, or zero. Not the sum of independent captures.'],
 ['Index','Ew - Eb + Sw - Sb + 0.75 x Lw - 0.35 x Lb. Positive favors White.'],
 ['Economic sensitivity','1.25 x E difference + 0.75 x S difference + 0.50 x Lw - 0.20 x Lb.'],
 ['Spatial sensitivity','0.75 x E difference + 1.25 x S difference + 1.00 x Lw - 0.50 x Lb.'],
 ['Interpretation','Analyst-set, uncalibrated opening index. Not expected crystals, win probability or game-theoretic value.'],
 ['Grades','B major <=-6; B clear <=-3.5; B slight <=-1.5; Close (-1.5,1.5); W slight <3.5; W clear <6; W major >=6.'],
 ['Response scope','Best means lowest index among all legal B1 responses to that specific W1.'],
 ['Distribution','Counts weight distinct states equally; they are not player frequencies or win rates.'],
 ['W1 production audit',c.verifiedDestinations+' legal successor destinations and '+c.count+' settlement witnesses.'],
 ['B1 fresh enumeration',a.transitionCount+' transition edges; '+a.count+' distinct joint endpoints.'],
 ['Production tactical audit',v.cases+' joint states; '+v.masks+' full masks; '+v.lines+' engine-validated capture lines.'],
 ['Source','muju/SPEC.md v2.8 and the production game, movement, combat, spawning and settlement functions.'],
 ['Flat raw data','all-B1-states.csv.gz: one row per legal full-round state, explicit coordinates, reserves and grades.'],
 ['Reconstruction','Pattern IDs resolve all pieces. Start with Map; subtract each unit collection on its final square.'],
 ['Constants after B1','Six original T1 units; zero damage; zero upkeep; quiet count 2; White W2; banks equal cumulative income.'],
 ['Source snapshot time',c.createdAt],
 ...Object.entries(c.hashes).map(([f,h])=>['SHA-256 '+f,h])];
table(method,['Field','Definition or evidence'],notes,5,'Method');method.getRange(`A5:A${notes.length+5}`).format.columnWidth=32;method.getRange(`B5:B${notes.length+5}`).format.columnWidth=115;method.getRange(`B6:B${notes.length+5}`).format.wrapText=true;method.getRange(`A6:B${notes.length+5}`).format.rowHeight=32;
const lu=sheets['Position lookup'];title(lu,'Inspect any complete first-round state','Change the two amber IDs. Every score, unit and taxonomy field resolves from the census tables.');
lu.getRange('A5:B6').values=[['White W1 ID',792],['Black B1 pattern ID',792]];lu.getRange('B5:B6').format.fill=amber;lu.getRange('B5:B6').dataValidation={rule:{type:'whole',operator:'between',formula1:1,formula2:N}};
lu.getRange('D5:D11').values=[['Opening index'],['Estimated grade'],['Capture code'],['White target mask'],['Black latent mask'],['Joint species key'],['Joint species ID']];
lu.getRange('E5').formulas=[[`=INDEX('All B1 scores'!$B$6:$${col(N)}$${N+5},$B$5,$B$6)`]];
lu.getRange('E6').formulas=[['=IF(ISNUMBER(E5),IF(E5<=-6,"B major",IF(E5<=-3.5,"B clear",IF(E5<=-1.5,"B slight",IF(E5<1.5,"Close",IF(E5<3.5,"W slight",IF(E5<6,"W clear","W major")))))),"ILLEGAL")']];
lu.getRange('E7').formulas=[[`=INDEX('Capture masks'!$B$6:$${col(N)}$${N+5},$B$5,$B$6)`]];lu.getRange('E8').formulas=[['=IF(ISNUMBER(E7),MOD(E7,8),"ILLEGAL")']];lu.getRange('E9').formulas=[['=IF(ISNUMBER(E7),INT(E7/8),"ILLEGAL")']];
lu.getRange('E10').formulas=[['=IF(ISNUMBER(E5),INDEX(\'Opening patterns\'!$X$6:$X$802,$B$5)&"-"&INDEX(\'Opening patterns\'!$X$6:$X$802,$B$6)&"-"&E8&"-"&E9,"ILLEGAL")']];
lu.getRange('E11').formulas=[[`=IF(ISNUMBER(E5),INDEX('Joint species'!$A$6:$A$${a.jointSpecies+5},MATCH(E10,'Joint species'!$B$6:$B$${a.jointSpecies+5},0)),"ILLEGAL")`]];
lu.getRange('A9:C13').values=[['Feature','White','Black'],['Bank',null,null],['Order',null,null],['Genus ID',null,null],['Species ID',null,null]];
for(const [rr,cc]of [[10,'J'],[11,'V'],[12,'W'],[13,'X']])for(const [dest,id]of [['B','$B$5'],['C','$B$6']])lu.getRange(`${dest}${rr}`).formulas=[[`=INDEX('Opening patterns'!$${cc}$6:$${cc}$802,${id})`]];
lu.getRange('A16:D22').values=[['Unit','Square','Harvest','Reserve left'],['White Hi',null,null,null],['White Sjor',null,null,null],['White Muju',null,null,null],['Black Hi',null,null,null],['Black Sjor',null,null,null],['Black Muju',null,null,null]];
for(let i=0;i<6;i++){const id=i<3?'$B$5':'$B$6',t=i%3;lu.getRange(`B${17+i}:D${17+i}`).formulas=[[`=INDEX('Opening patterns'!$${col(i<3?1+t:4+t)}$6:$${col(i<3?1+t:4+t)}$802,${id})`,`=INDEX('Opening patterns'!$${col(10+t)}$6:$${col(10+t)}$802,${id})`,`=INDEX('Opening patterns'!$${col(13+t)}$6:$${col(13+t)}$802,${id})`]];}
lu.getRange('F15').values=[['Board: White wH/wS/wM; Black bH/bS/bM; numbers = reserves']];
for(let y=0;y<10;y++)for(let x=0;x<10;x++){const square=coords(y*10+x),tokens=['wH','wS','wM','bH','bS','bM'];let f=String(c.initialMap[y*10+x]);for(let i=5;i>=0;i--)f=`IF($B$${17+i}="${square}","${tokens[i]}",${f})`;lu.getCell(16+y,5+x).formulas=[['='+f]];lu.getCell(16+y,5+x).format.fill=c.initialMap[y*10+x]===16?'#D6E0BF':c.initialMap[y*10+x]===0?'#E3E5E8':'#F5F3EC';}
lu.getRange('F16:O16').values=[Array.from({length:10},(_,i)=>String.fromCharCode(65+i))];lu.getRange('F16:O16').format.horizontalAlignment='center';lu.getRange('E17:E26').values=Array.from({length:10},(_,i)=>[i+1]);lu.getRange('E17:E26').format.horizontalAlignment='right';
lu.getRange('F17:O26').format={font:{name:'Arial',size:11,bold:true},columnWidth:7,rowHeight:28,horizontalAlignment:'center',verticalAlignment:'center',borders:{preset:'inside',style:'thin',color:'#D8DDE3'}};
lu.getRange('A5:E22').format.font={name:'Arial',size:10,color:navy};lu.getRange('A5:A22').format.columnWidth=24;lu.getRange('B5:C22').format.columnWidth=23;lu.getRange('D5:E22').format.columnWidth=24;lu.getRange('E5').setNumberFormat('0.00');
for(const r of ['A9:C9','A16:D16'])lu.getRange(r).format={fill:navy,font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
const ov=sheets.Overview;title(ov,'MHT opening census','Standard v2.8 start, no handicap. Exact census with provisional advantage estimates.');ov.tabColor=navy;lu.tabColor=blue;
table(ov,['Census measure','Count'],[['After W1',c.count],['After B1',a.count],['Excluded Hi collisions',c.collisions],['Orders per side',8],['Genera per side',a.genera],['Species per side',a.species],['Joint orders',a.jointOrders],['Joint genera',a.jointGenera],['Joint species',a.jointSpecies]],5);
table(ov,['Estimated grade','States'],['B major','B clear','B slight','Close','W slight','W clear','W major'].map(g=>[g,a.gradeCounts[g]??0]),17);
ov.getRange('D5:E11').values=[['What is established','Finding'],['First-round combat','Impossible'],['W1 / B1 purchases','Impossible at zero starting bank'],['Income after first move','3 to 6 crystals per side'],['W2 capture opportunity',a.wThreats],['Stable direction / close classification',a.robustSign],['Tactical verification',v.cases+' positions; '+v.masks+' masks']];
ov.getRange('D5:E11').format.font={name:'Arial',size:10,color:navy};ov.getRange('D5:E5').format.fill=navy;ov.getRange('D5:E5').format.font.color='#FFFFFF';ov.getRange('D5:D11').format.columnWidth=43;ov.getRange('E5:E11').format.columnWidth=44;
ov.getRange('D14').values=[['Read the PDF for conditional Black choices and the grading limitations.']];ov.getRange('D16').values=[['Position lookup opens any W1/B1 pair, including all six excluded collisions.']];ov.getRange('D18').values=[['All B1 scores contains every legal full-round state, with one score per cell.']];ov.getRange('D20').values=[['Flat CSV contains one explicit record per state. Pattern tables give legal witnesses.']];ov.getRange('D22').values=[['Uniform state counts describe the census, not player behavior or win probability.']];
ov.getRange('A5:A25').format.columnWidth=29;ov.getRange('B5:B25').format.columnWidth=15;ov.getRange('B6:B25').setNumberFormat('#,##0');ov.freezePanes.unfreeze();
console.log('Checking lookup recalculation');wb.recalculate();
for(const [w,b]of [[74,74],[792,792],[792,780],[675,157]]){lu.getRange('B5:B6').values=[[w],[b]];wb.recalculate();const got=lu.getRange('E5').values[0][0],z=bin.readFloatLE(((w-1)*N+b-1)*12);if(Number.isFinite(z)?Math.abs(got-z)>.001:got!=='ILLEGAL')throw Error('Lookup mismatch '+w+'-'+b+': '+got);}
lu.getRange('B5:B6').values=[[792],[792]];wb.recalculate();
console.log((await wb.inspect({kind:'table',range:"'Position lookup'!A5:E13",include:'values,formulas',tableMaxRows:9,tableMaxCols:5,maxChars:2500})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:20},maxChars:1500})).ndjson);
await fs.mkdir(path.join(out,'qa'),{recursive:true});
for(const [name,range]of [['Overview','A1:F26'],['Position lookup','A1:O27'],['Black responses','A1:L14'],['Opening patterns','A1:J14'],['All B1 scores','A1:L14'],['Capture masks','A1:L14'],['Taxonomy','A1:H14'],['Joint species','A1:H14'],['Continuations','A1:G14'],['Map','A1:M17'],['Method','A1:B18']]){const blob=await wb.render({sheetName:name,range,scale:1.5,format:'png'});await fs.writeFile(path.join(out,'qa',name.replaceAll(' ','-')+'.png'),new Uint8Array(await blob.arrayBuffer()));console.log('Rendered '+name);}
// Export also requests an unlimited inspection sidecar. Its per-cell computed
// styles exceed V8's string limit for this census. Supply a bounded, documented
// inspection through an adapter; workbook data, styles and formulas are intact.
const exportView=new Proxy(wb,{get(target,property){
 if(property==='inspect')return () => target.inspect({kind:'workbook,sheet,table,formula,conditionalFormatting,definedName,drawing',maxChars:20000,tableMaxRows:5,tableMaxCols:8,tableMaxCellChars:100});
 const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
}});
console.log('Exporting workbook');try {const output=await SpreadsheetFile.exportXlsx(exportView);await output.save(path.join(out,'MHT-opening-census.xlsx'));console.log('Workbook exported');}catch(e){console.error('EXPORT ERROR',e.message,e.stack?.slice(-4000));process.exitCode=1;}
