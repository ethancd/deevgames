from pathlib import Path
import csv,gzip,hashlib,io,json,math,struct,zipfile
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2];MUJU=ROOT/'muju';DATA=MUJU/'lab/results/handicap-census-2026-09-14'
C=json.loads((DATA/'census.json').read_text());A=json.loads((DATA/'analysis.json').read_text());F=json.loads((DATA/'features.json').read_text())
R=struct.Struct('<fffBBBBff');WIDTH={0:797,3:3678,4:8012};BINS={h:(DATA/f'states-h{h}.bin').read_bytes() for h in WIDTH}
assert R.size==24
for h,n in WIDTH.items():assert len(BINS[h])==797*n*24
for name,expected in C['baselineHashes'].items():assert hashlib.sha256((MUJU/name).read_bytes()).hexdigest()==expected
def csvbytes(headers,rows):
 s=io.StringIO();w=csv.writer(s);w.writerow(headers);w.writerows(rows);return s.getvalue().encode()
def grade(s):return 'B major' if s<=-6 else 'B clear' if s<=-3.5 else 'B slight' if s<=-1.5 else 'Close' if s<1.5 else 'W slight' if s<3.5 else 'W clear' if s<6 else 'W major'
README='''MHT 3- and 4-crystal opening census. Rules v2.8, 14 September 2026.

The same 797 W1 endpoints are reused. H3 has 3,678 Black patterns and 2,931,337
legal W1/B1 states. H4 has 8,012 patterns and 6,385,505 states. All 9,316,842
requested joint states are in CSV files under states/. Each part has fewer than
1,048,576 rows and can be opened in Excel. Files are split by contiguous W1 IDs.

Read the accompanying PDF for interpretation and limits. These are exact legal
endpoint counts, with analyst-set provisional advantage scores, not win rates.
No B1 attack is possible in any enumerated state with action points left.

Reconstruction and keys
  states/*.csv: one row per legal (Handicap,W1_ID,Black_pattern_ID).
  white-patterns.csv: exact unchanged White coordinates, collections and reserves.
  black-patterns.csv: Black setup decision, exact types/coordinates/reserves and
    witnesses for every pattern. Join on the pattern IDs to recover a full board.
  initial-map.csv: initial reserve at each of the 100 squares.
  Black's first bank = handicap - spent + first income.
  The grant is not mined income. Black cumulative income = first income.
  After B1, White begins W2 with 4 AP, quiet count 2, all units have zero damage.
    Promotions leave Black with 3 pieces and future upkeep 1; purchases leave
    Black with 4 tier-1 pieces and upkeep 0. There are no missing/captured pieces.
  Replace the occupied squares of the initial map with the remaining reserves in
    the two pattern tables. Unoccupied deposits are unchanged. White bank equals
    its first mined income. Black has not yet paid the next turn's upkeep.
  Resignation, clocks, undo, move histories and inert flags are outside state
    identity. Identical same-type Black units are interchangeable; their ordering
    is canonical by definition ID then White-relative position. This avoids
    counting exchanges of two identical Hi or Sjor as different board states.
  A1 is White's upper-left home. J10 is Black's lower-right home.

Taxonomy
  White retains the original study's 8 orders, 35 genera and 205 species.
  Black order = spending family: 1 Save, 2 Buy Hi, 3 Buy Radi, 4 Buy Sjor,
    5 Buy Gol, 6 Promote Hono, 7 Promote Straumr, 8 Promote Sachita.
  Black genus = order, exact minimum AP, farthest Manhattan distance of a piece
    from Black's corner, and number of pieces outside the six home reserve cells.
  Black species adds per-unit terrain classes, income and spawn-size band.
    Bands are 0-5, 6-12, 13-20, 21+ empty squares. Classifications are descriptive;
    exact positions remain distinct records. Definitions are in census.json.
  Joint order = (White order-1)*8 + Black order.
  Joint genus key = White genus_Black genus.
  Joint species key = White species_Black species_White mask_Black mask.
    Keys are scoped to the handicap column. Mask differences separate tactics.
  This spending-first Black taxonomy differs from the no-handicap report's
    movement-first taxonomy. Species totals should not be compared as if the
    taxonomic definitions were unchanged.

Capture bits
  White mask targets Black unit slots 1/2/3/4 in black-patterns.csv, bits 1/2/4/8.
    A promoted or purchased unit changes those slot meanings. Use the table.
  Black mask targets White Hi/Sjor/Muju, bits 1/2/4.
  White is the actual W2 attacker. Black is a hypothetical fresh B2 on the
    unchanged board, after normal upkeep and healing, with no extra income.
  The screen includes one existing attacker, one affordable single promotion,
    or one affordable T1 purchase. It considers legal approach paths and one
    lethal attack within four AP. It excludes combined attacks, blocker clearing,
    chained purchases, post-kill retreat/recapture and favorable-exchange proof.
  A mask lists alternatives, not simultaneous promised captures.

Separate Straumr survival bound
  The starting Sjor promoted on B1 cannot be captured during W2 at H4. A relaxed
    action-and-crystal calculation covers all 19,128 White-position / Straumr-
    square pairs, permits unblocked approaches and independently ideal purchase
    squares, and includes combined attackers. Maximum optimistic damage is 2,
    below defense 3. See analysis/straumr-proof.json and straumr-bound.mjs.
  This proves that specific first-window survival only, not a win or W3 immunity.

Score components in the CSV
  Material_delta = White minus Black catalogue army value.
  Economy_delta = White minus Black E, where E = bank + .6*(next idle harvest-rent)
    + .3*(second idle harvest-rent). Rent is the upkeep on the current army.
  Space_delta = White minus Black S, where S = .1*empty spawn squares +
    .03*crystals on those squares. Access is not ownership or immediate income.
  White_opportunity/Black_opportunity = greatest opposing target liability among
    that side's capture mask, else zero. Liability = material + lost discounted
    net harvest + lost deployment score after removing the target alone.
  Opening_index = Mdelta + Edelta + Sdelta + .75*White_opportunity
    - .35*Black_opportunity. Positive favors White.
  Economic_index = Mdelta + 1.25*Edelta + .75*Sdelta + .5*Lw - .2*Lb.
  Spatial_index = Mdelta + .75*Edelta + 1.25*Sdelta + Lw - .5*Lb.
  Grades: B major <=-6; B clear <=-3.5; B slight <=-1.5; Close (-1.5,1.5);
    W slight <3.5; W clear <6; W major >=6, applied in this order.
  All weights/bands are uncalibrated choices. The material term is necessary now
    that armies differ; rent is necessary now that T2 units can already exist.
  Zero-handicap baseline recheck gives identical capture masks and grade counts;
    1,539 individual scores differ from the earlier JS implementation by at most
    0.01 because of floating-point rounding. There is no material strategic change.

Binary format and workbook encoding
  states-h{0,3,4}.bin uses row-major White IDs, then Black pattern IDs 1..width.
    Widths: 797 / 3,678 / 8,012. Each little-endian record is 24 bytes:
    offsets 0/4/8 float32 baseline score, White opportunity, Black opportunity;
    bytes 12/13 White/Black masks; bytes 14/15 minimum kill AP or 5 if absent;
    offsets 16/20 float32 economic and spatial score. NaN baseline = collision.
  Workbook State records packs values to avoid millions of separate Excel cells.
    Workbook strings start with S: (scores) or M: (masks), to enforce text type.
    After the prefix, four digits encode (score*100)+2000; XX/XXXX marks an
    illegal pair. Two hex digits encode White and Black masks. Each string runs
    W1 IDs 1..797. The longest cell is 3,190 characters, below Excel's limit.
    Position lookup decodes the stored exact index and masks. Flat CSV remains
    the primary machine-readable state table. Do not edit the encoded source.

Reproduction
  Source snapshot is under source/muju. Install package-lock.json dependencies.
  From source/muju, run the scripts in lab/experiments/handicap-census-2026-09-14:
    node --import tsx census.ts  (use its full relative path)
    node prepare.mjs            (use its full relative path)
    clang++ -O3 -std=c++17 [path]/score.cpp -o lab/results/handicap-census-2026-09-14/score
    lab/results/handicap-census-2026-09-14/score
    node [path]/summarize.mjs
    node [path]/straumr-bound.mjs
    node --import tsx [path]/verify.ts
    node --import tsx [path]/verify.ts --continuations
  The original census.json and analysis.json inputs are included at their original
    relative location. Fixed seeds and bounded-search settings are in verify.ts.
  The archive retains tested continuations; a later runtime/AI change can change
    search choices. No game rules were edited. Manifest hashes verify contents.
'''
(OUT/'README-data.txt').write_text(README)
# Compact source for the workbook. All exact scores and target masks are retained.
encoded=[]
for bi,b in enumerate(C['patterns']):
 row=[b['id']]
 for h in [0,3,4]:
  if bi>=WIDTH[h]:row+=['',''];continue
  scores=[];masks=[]
  for wi in range(797):
   z=R.unpack_from(BINS[h],(wi*WIDTH[h]+bi)*24)
   if math.isfinite(z[0]):scores.append(f'{round(z[0]*100)+2000:04d}');masks.append(f'{z[3]:X}{z[4]:X}')
   else:scores.append('XXXX');masks.append('XX')
  row+=[''.join(scores),''.join(masks)]
 assert all(not isinstance(v,str) or len(v)<=32767 for v in row)
 encoded.append(row)
(OUT/'encoded.json').write_text(json.dumps(encoded,separators=(',',':')))
headers=['Handicap','W1_ID','Black_pattern_ID','White_bank','Black_bank','Black_income','Black_rent','Material_delta','Economy_delta','Space_delta','White_capture_mask','Black_latent_mask','White_opportunity','Black_opportunity','Opening_index','Grade','Economic_index','Spatial_index','Joint_order','Joint_genus','Joint_species']
archive=OUT/'MHT-handicap-raw-data.zip';manifest={};total=0;parts=[]
def add(z,name,data):z.writestr(name,data);manifest[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 add(z,'README.txt',README.encode())
 add(z,'initial-map.csv',csvbytes(['Square','Initial_reserve'],[[chr(65+n%10)+str(n//10+1),v] for n,v in enumerate(C['initialMap'])]))
 wl=A['whiteLegacy']
 add(z,'white-patterns.csv',csvbytes(['W1_ID','Hi','Sjor','Muju','Bank','Hi_reserve','Sjor_reserve','Muju_reserve','Order','Genus','Species','Min_actions','Witness'],[[w['id'],*w['coords'],w['bank'],*w['reserves'],w['order'],w['genus'],w['species'],w['minActions'],w['witnessText']] for w in wl]))
 bh=['Black_pattern_ID','Family','Minimum_handicap','Spent','Min_actions','Income','Rent','Spawn_squares','Spawn_reserves','Order','Genus','Species','Movement_witness']
 for i in range(4):bh += [f'Unit{i+1}_type',f'Unit{i+1}_square',f'Unit{i+1}_reserve']
 br=[]
 for p in C['patterns']:
  row=[p['id'],p['familyName'],p['minHandicap'],p['spent'],p['minActions'],p['income'],p['rent'],p['spawnCount'],p['spawnReserve'],p['order'],p['genus'],p['species'],p['witnessText']]
  for i in range(4):
   if i<len(p['units']):u=p['units'][i];row += [u['definitionId'],u['square'],C['initialMap'][u['rel']]-u['take']]
   else:row+=['','','']
  br.append(row)
 add(z,'black-patterns.csv',csvbytes(bh,br))
 for h,step in [(3,200),(4,100)]:
  for start in range(0,797,step):
   end=min(797,start+step);name=f'states/H{h}-W{start+1:03d}-{end:03d}.csv';sha=hashlib.sha256();nbytes=0;count=0
   with z.open(name,'w',force_zip64=True) as dest:
    def emit(data):
     global nbytes
     dest.write(data);sha.update(data);nbytes+=len(data)
    emit((','.join(headers)+'\n').encode())
    for wi in range(start,end):
     w=F['white'][wi];chunk=[]
     for bi,b in enumerate(F['black'][:WIDTH[h]]):
      sc,lw,lb,wm,bm,wa,ba,ec,sp=R.unpack_from(BINS[h],(wi*WIDTH[h]+bi)*24)
      if not math.isfinite(sc):continue
      ed=w['economyWithoutGrant']-b['economyWithoutGrant']-h;sd=w['space']-b['space'];md=w['material']-b['material']
      vals=[h,wi+1,bi+1,w['income'],h+b['bankOffset']+b['income'],b['income'],b['rent'],md,f'{ed:.2f}',f'{sd:.2f}',wm,bm,f'{lw:.2f}',f'{lb:.2f}',f'{sc:.2f}',grade(sc),f'{ec:.2f}',f'{sp:.2f}',(w['order']-1)*8+b['order'],f'{w["genus"]}_{b["genus"]}',f'{w["species"]}_{b["species"]}_{wm}_{bm}']
      chunk.append(','.join(map(str,vals))+'\n');count+=1
     emit(''.join(chunk).encode())
   assert count<1048576;total+=count;parts.append({'file':name,'rows':count});manifest[name]={'bytes':nbytes,'sha256':sha.hexdigest()};print(name,count,flush=True)
 # Snapshot data and source after continuations have finished; the packaging
 # script can be rerun to refresh these members without changing the analysis.
 for name in ['census.json','features.json','analysis.json','score-summary.json','best-by-family.csv','verification.json','continuations.json','continuation-config.json','straumr-proof.json']:
  if (DATA/name).exists():add(z,'analysis/'+name,(DATA/name).read_bytes())
 for h in [0,3,4]:add(z,f'analysis/states-h{h}.bin',BINS[h])
 for tree in ['src','server','lab/experiments/handicap-census-2026-09-14']:
  for f in (MUJU/tree).rglob('*'):
   if f.is_file():add(z,'source/muju/'+str(f.relative_to(MUJU)),f.read_bytes())
 for name in ['SPEC.md','package.json','package-lock.json','tsconfig.json','lab/results/opening-census-2026-09-14/census.json','lab/results/opening-census-2026-09-14/analysis.json']:
  add(z,'source/muju/'+name,(MUJU/name).read_bytes())
 add(z,'parts.json',json.dumps(parts,indent=2).encode())
 z.writestr('manifest.json',json.dumps(manifest,indent=2))
assert total==9316842
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for name,meta in manifest.items():
  sha=hashlib.sha256()
  with z.open(name) as f:
   while chunk:=f.read(1048576):sha.update(chunk)
  assert sha.hexdigest()==meta['sha256'],name
(OUT/'qa/package-validation.json').write_text(json.dumps({'rows':total,'parts':parts,'allHashesVerified':True,'archiveBytes':archive.stat().st_size},indent=2))
print('Complete:',total,'rows;',archive.stat().st_size,'archive bytes')
