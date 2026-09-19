from pathlib import Path
import json, struct, math
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
DATA=ROOT/'muju/lab/results/opening-census-2026-09-14'
A=json.loads((DATA/'analysis.json').read_text())
C=json.loads((DATA/'census.json').read_text())
V=json.loads((DATA/'verification.json').read_text())
CONT=json.loads((DATA/'continuations.json').read_text())
F=A['features']; BIN=(DATA/'joint.bin').read_bytes()
NAVY=colors.HexColor('#26364B'); BLUE=colors.HexColor('#305E8C')
INK=colors.HexColor('#253345'); MUTED=colors.HexColor('#617080')
LIGHT=colors.HexColor('#EEF2F6'); GOLD=colors.HexColor('#D9B879')
PDF=OUT/'MHT-opening-theory.pdf'
cv=canvas.Canvas(str(PDF),pagesize=(612,792))
cv.setTitle('MHT v2.8: exhaustive first-round census and opening theory')
cv.setAuthor('Codex - analysis of the local MHT rules')
page=0
styles={
 'body':ParagraphStyle('body',fontName='Helvetica',fontSize=10.3,leading=14.6,textColor=INK,spaceAfter=8),
 'small':ParagraphStyle('small',fontName='Helvetica',fontSize=8.8,leading=12,textColor=MUTED),
 'cell':ParagraphStyle('cell',fontName='Helvetica',fontSize=8.5,leading=11.4,textColor=INK),
 'head':ParagraphStyle('head',fontName='Helvetica-Bold',fontSize=9,leading=12,textColor=colors.white),
 'h2':ParagraphStyle('h2',fontName='Helvetica-Bold',fontSize=13,leading=17,textColor=BLUE),
}
def p(text,y,x=48,w=516,kind='body',gap=9):
    para=Paragraph(text,styles[kind]); _,h=para.wrap(w,720)
    assert y-h>=53, (page,'overflow',text[:70],y,h)
    para.drawOn(cv,x,y-h)
    return y-h-gap
def heading(text,y): return p(text,y,kind='h2',gap=7)
def begin(title,kicker):
    global page
    if page: cv.showPage()
    page+=1
    cv.setFillColor(NAVY);cv.rect(0,776,612,16,fill=1,stroke=0)
    cv.setFont('Helvetica-Bold',9);cv.setFillColor(BLUE);cv.drawString(48,747,kicker.upper())
    cv.setFont('Helvetica-Bold',23);cv.setFillColor(NAVY);cv.drawString(48,714,title)
    cv.setStrokeColor(colors.HexColor('#D5DCE4'));cv.line(48,59,564,59)
    cv.setFont('Helvetica',8);cv.setFillColor(MUTED)
    cv.drawString(48,42,'MHT v2.8  |  Standard start, zero handicap  |  14 September 2026')
    cv.drawRightString(564,42,f'{page:02d}')
    return 690
def table(headers,rows,widths,y):
    dat=[[Paragraph(str(s),styles['head']) for s in headers]]
    dat += [[Paragraph(str(s),styles['cell']) for s in row] for row in rows]
    t=Table(dat,colWidths=widths,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),
      ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
      ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
      ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),
      ('LINEBELOW',(0,-1),(-1,-1),.5,colors.HexColor('#D5DCE4'))]))
    _,h=t.wrap(516,700);assert y-h>=53,(page,'table overflow',y,h)
    t.drawOn(cv,48,y-h);return y-h-14
def idx(w,b):return struct.unpack_from('<f',BIN,((w-1)*797+b-1)*12)[0]
def mask(w,b):o=((w-1)*797+b-1)*12;return BIN[o+4],BIN[o+5]
def board(w,b,x,top,size=23,footprint=False):
    wf,bf=F[w-1],F[b-1];occ={n:('W',i) for i,n in enumerate(wf['p'])}
    occ.update({99-n:('B',i) for i,n in enumerate(bf['p'])})
    ws=set(wf['spawnCoordinates'].split());bs=set()
    for n in range(100):
        if n not in [99-v for v in bf['p']] and any(n%10>=9-v%10 and n//10>=9-v//10 for v in bf['p']):bs.add(n)
    for n,r in enumerate(C['initialMap']):
        xx=x+n%10*size;yy=top-(n//10+1)*size
        fill=colors.HexColor('#E3E6EA') if r==0 else colors.HexColor('#DCE8CA') if r==16 else colors.HexColor('#F7F5EE')
        sq=chr(65+n%10)+str(n//10+1)
        if footprint and sq in ws:fill=colors.HexColor('#D6E6F5')
        if footprint and n in bs:fill=colors.HexColor('#F2E3C5')
        cv.setFillColor(fill);cv.setStrokeColor(colors.HexColor('#CAD2DA'));cv.rect(xx,yy,size,size,fill=1,stroke=1)
        if n in occ:
            side,i=occ[n];cv.setFillColor(colors.white if side=='W' else NAVY)
            cv.circle(xx+size/2,yy+size/2,size*.39,stroke=1,fill=1)
            cv.setFont('Helvetica-Bold',size*.38);cv.setFillColor(NAVY if side=='W' else colors.white)
            cv.drawCentredString(xx+size/2,yy+size*.36,['H','S','M'][i])
        else:
            cv.setFillColor(MUTED);cv.setFont('Helvetica',size*.31);cv.drawCentredString(xx+size/2,yy+size*.37,str(r))
    cv.setFillColor(MUTED);cv.setFont('Helvetica',8)
    for i in range(10):
        cv.drawCentredString(x+(i+.5)*size,top+6,chr(65+i))
        cv.drawRightString(x-5,top-(i+.65)*size,str(i+1))
    return top-10*size

y=begin('The opening is a race for deployment','Exact census / provisional theory')
y=p('<b>There are 797 distinct states after W1 and 635,203 after B1.</b> The census is exhaustive for the current standard start. Every complete first-round state has an index, grade and order / genus / species classification in the accompanying data.',y)
y=p('The strongest practical lesson is that a forward piece changes where the next army can appear. Hi can travel eight squares in four actions while Sjor and Muju keep mining at home. Black must assess that new deployment area before choosing a reply.',y)
top=y-12;bottom=board(792,792,63,top,23,True)
ry=p('W792 / B792',top,x=317,w=247,kind='h2')
ry=p('White Hi E6; Black Hi F5. Both banks are 6. Each side has 27 empty legal spawn squares, compared with one at the initial position.',ry,x=317,w=247)
ry=p('Blue and gold show the respective spawn areas. H / S / M denote Hi / Sjor / Muju. White acts next.',ry,x=317,w=247)
ry=p('White can capture Black Hi in two actions. That is a legal tactical fact. Whether the capture produces a lasting edge requires examining purchases, retreats and Black\'s reply.',ry,x=317,w=247)
y=min(bottom,ry)-20
y=p('<b>For Black:</b> study both a Hi advance that contests space and Sjor development that preserves a stronger combat piece. The best choice is conditional on W1; a single universal reply would hide the main opening decision.',y)
y=p('The advantage grades are an explicit heuristic, not solved game values or win probabilities. Thirty-eight bounded W2/B2 continuations expose several disagreements with the immediate index. Those disagreements are part of the findings.',y,kind='small')

y=begin('What was enumerated','01 / scope and completeness')
y=p('W1 means White has ended its first action phase and collected income; Black is about to act. B1 means Black has done the same and White is beginning W2. The start has four shared actions, zero crystals per side, six original tier-1 units, and the fixed 504-crystal v2.8 map.',y)
y=heading('Why the first round is finite and manageable',y)
y=p('Neither side can purchase or promote before its first income. Every opening action is therefore movement. Early ending is legal. Breadth-first enumeration explores every legal one-action destination through depth four and merges endpoints reached by different histories.',y)
y=p('First-round attacks are impossible: the closest opposing starters are the two Hi, 16 orthogonal steps apart. White can close at most eight; Black can close at most six while reserving one action to attack. That still leaves distance two. The other unit pairs have stricter movement limits.',y)
y=table(['Minimum actions needed','0','1','2','3','4','Total'],[['Distinct W1 endpoints',1,8,45,188,555,797]],[150,55,55,55,55,55,91],y)
y=p('Black has the same 797 patterns under a 180-degree rotation. A fresh Black search was run against every White endpoint. Only six pairings fail, because both Hi would finish on the same square: <b>797 x 797 - 6 = 635,203.</b> All other pairings are reachable; there is no additional path-blocking exception.',y)
y=table(['W1 ID / B1 pattern','Collision square','W1 ID / B1 pattern','Collision square'],[['675 / 797','H3','749 / 796','G4'],['780 / 792','F5','792 / 780','E6'],['796 / 749','D7','797 / 675','C8']],[145,113,145,113],y)
y=p('<b>State identity:</b> exact piece squares, banks, remaining deposits and next player. Move histories, clock values, UI selection and inert move flags do not create new board states. Resignation, undo, other maps and handicaps are outside this census.',y)
y=p('After B1 all six original pieces remain tier 1 with zero damage. Upkeep is zero, the quiet-turn count is 2, and banks equal cumulative income. Every cell not occupied at settlement retains its initial reserve. Each occupied cell has lost the collection of its unit; all other gameplay quantities follow from these records.',y,kind='small')

y=begin('A taxonomy that retains the differences','02 / order, genus and species')
y=p('An <b>order</b> records which original pieces finish away from their starting squares. A <b>genus</b> adds the three minimum geometric movement demands: ceil(orthogonal displacement / speed). A <b>species</b> adds each piece\'s terrain class, the resulting bank and a deployment-area size band.',y)
rows=[]
for o in range(1,9):
    members=[f for f in F if f['order']==o]
    rows.append([o,members[0]['orderName'],len(members),len({f['genus'] for f in members}),len({f['species'] for f in members})])
y=table(['Order','Pieces developed','Positions','Genera','Species'],rows,[48,225,81,81,81],y)
y=p('<b>Totals per side:</b> 8 orders, 35 genera and 205 species. <b>After B1:</b> 64 joint orders, 1,225 joint genera and 51,016 joint species. A joint species pairs the two single-side species and adds both capture-target masks, separating immediate tactical differences.',y)
y=p('Terrain classes distinguish home reserves, dry squares, near and outer ordinary ground, central reserves, and the two rich expansion routes. Black uses the rotated White-relative classification. Spawn bands are small (0-5), medium (6-12), large (13-20) and wide (21 or more) empty legal squares.',y)
y=p('<b>Similarity is not equivalence.</b> W779 (Hi E5) and W792 (Hi E6) belong to species 197, yet open 22 versus 27 spawn squares. Their tactical relationships with Black can differ. Exact coordinates, harvests, spawn counts and score ranges remain in the data so this variance is visible.',y)
y=p('Genus demand is a geometric descriptor, not a promise that friendly blockers permit that shortest route. The separate minimum-actions field comes from the actual legal search. Species IDs are stable identifiers for this snapshot, not a proposed universal naming system.',y,kind='small')

y=begin('Black\'s useful opening families','03 / candidate repertoire')
y=p('The table gives final Black squares in Hi / Sjor / Muju order. Every listed pattern has a verified legal witness. These are candidates to understand and test, not a claim that other legal positions are refuted.',y)
y=table(['B ID','Final Black squares','Bank / spawn','Purpose and limitation'],[
 [792,'F5 / I9 / J9','6 / 27','Large forward deployment area. Principal model candidate against deep White Hi; the Hi is exposed to W2 capture.'],
 [791,'G5 / I9 / J9','6 / 21','Adjacent alternative with different attack distances and retreat geometry. Do not treat it as equivalent to F5.'],
 [157,'I10 / H6 / J9','6 / 12','Develop Sjor; retain Hi and Muju at home. A useful combat anchor when White cannot immediately capture it.'],
 [151,'I10 / G7 / J9','6 / 13','Related Sjor plan with a different rectangle. The extra square does not by itself make it better.'],
 [721,'H7 / I9 / J8','6 / 9','Moderate Hi development and Muju relocation; a plausible middle course with less space.'],
 [74,'I10 / I9 / J9','6 / 1','End without displacement. Preserves income but gives up free first-round development.'],
 [1,'J10 / I10 / J9','6 / 0','Self-blocks all purchase squares. A cautionary example: a full bank is not enough.'],
 [8,'J10 / H10 / I9','6 / 2','Compact retreat favored by the static model against some W1s. Follow-up searches question that ranking.']
],[40,124,75,277],y)
y=p('<b>Why Sjor deserves a repertoire slot:</b> B157 is within 1.00 of the model\'s best reply for 525 of 797 W1s; all 525 lack a White single-unit capture in the screen. B151 has 522 such cases. These are counts of distinct positions, not opponent frequencies. A quiet W1 can also justify the more ambitious Hi advance.',y)
y=p('<b>Why Hi deserves a repertoire slot:</b> its speed buys deployment reach without moving the two stronger miners. B792 has 108 crystals on its currently empty spawn squares; B157 has 64. These are future access opportunities, not owned crystals or immediate income.',y)
y=p('Sjor on H6 or G7 stands on an ordinary 4-crystal deposit: its two-point collection empties that square in two own settlements. Repositioning or reinforcement is therefore part of the plan. A forward Hi\'s one-point mining rate is slower but leaves Sjor and Muju on their home deposits.',y,kind='small')

y=begin('Choose B1 after seeing W1','04 / conditional response map')
y=p('Positive numbers favor White in the immediate index; negative numbers favor Black. Lower is better for Black. This small matrix is a reading guide to the full 797-by-797 workbook matrix.',y)
y=table(['White pattern','B74<br/>hold','B157<br/>Sjor H6','B151<br/>Sjor G7','B721<br/>Hi H7','B791<br/>Hi G5','B792<br/>Hi F5'],[
 [f'W{w}: '+({'74':'hold','157':'Sjor C5','675':'Hi H3','779':'Hi E5','792':'Hi E6'}[str(w)]),*[f'{idx(w,b):+.2f}' for b in [74,157,151,721,791,792]]] for w in [74,157,675,779,792]
],[126,65,65,65,65,65,65],y)
y=heading('Against a quiet or cramped White opening',y)
y=p('Take development that White has allowed. Against W74, every active candidate in the matrix improves Black\'s index relative to holding. B792 is the model\'s best reply at -7.63, and the bounded continuation also favored Black. B157 and B151 offer a less exposed combat anchor while preserving six crystals of immediate income.',y)
y=heading('Against a deep White Hi',y)
y=p('Start the comparison with a Hi counteradvance such as B792 or B791, then inspect White\'s captures and the follow-up exchanges. Against W792, B792 is the lowest-index reply (+3.66); 54 legal Black replies lie within one point. That is a candidate set, not a forced White advantage.',y)
y=p('Keep Sjor development in the comparison. Against W675 (Hi H3), the index prefers B792 to B157, but the bounded W2/B2 line for B157 ended with Black ahead in material and in the engine\'s separate static evaluation. The immediate model misses enough exchange detail that it cannot dismiss this plan.',y)
y=heading('At intermediate distances, one square matters',y)
y=p('Against W779 (Hi E5), the static model selects B8 at +1.26, ahead of B792 at +2.87. The follow-up evaluation reverses their order: +11.24 versus +2.62 on the engine\'s own scale. Retreat can suppress the immediate capture screen while conceding future activity. Treat this as a clear warning against blindly following a sorted score column.',y)
y=p('The practical B1 question is: what can White buy or promote from this exact position, what can it capture in four actions, and what can Black then recover or threaten? The initial census answers the first boundary exactly; the later exchange still needs calculation.',y,kind='small')

y=begin('Read the threat beyond the first kill','05 / concrete tactical example')
y=p('<b>Position W792 / B792:</b> White Hi E6, Sjor B2, Muju A2; Black Hi F5, Sjor I9, Muju J9. Banks are 6 each. White begins W2. The following alternatives were validated against production legality and combat.',y)
y=table(['White W2 alternative','Cost','Action use','What it establishes'],[
 ['Hi E6-F6; capture Hi F5','0 crystals','1 move + 1 attack = 2','Black\'s forward Hi can be removed with two actions left.'],
 ['Promote Hi to Hono; move E6-G6-I6-I8; capture Sjor I9','4 crystals','3 moves + 1 attack = 4','A distant home Sjor is also exposed after promotion.'],
 ['Either capture target above','Alternative lines','Not both promised','Mask 3 means Hi and Sjor each have a single-unit capture line. It does not mean both can be taken in one turn.']
],[211,69,94,142],y)
y=p('Buying and promoting cost crystals but no action points during the placement phase; new and promoted units act immediately. This makes the first bank consequential even though W1 and B1 themselves contain no purchases. A promoted unit begins paying its higher upkeep on its next own turn.',y)
y=heading('Why losing the forward Hi costs more than three',y)
y=p('Its catalogue price is 3, but its removal also removes mining and can collapse a deployment rectangle. At B792, the model assigns Hi a liability of 9.16: material plus discounted lost harvest and lost deployment access. This helps distinguish a disposable piece from the sole anchor of a large forward area.',y)
y=heading('Why a capture flag is not an advantage proof',y)
y=p('The attacker may spend most of its turn reaching the target, expose itself to a newly bought counter, or abandon its own useful anchor square. Black\'s displayed threat mask is a hypothetical fresh turn on the unchanged board. White moves first and can remove that threat, or move into a different one.',y)
y=p('The complete single-unit screen includes existing tier-1 attackers, one affordable tier-2 promotion, or one affordable tier-1 purchase, with the shortest legal approach through actual blockers. It excludes combined attacks, friendly blocker clearing, chains of purchases that expand deployment, post-kill movement and recapture analysis.',y)
y=p('For the displayed position, both masks equal 3. White has the initiative to act on its mask; Black\'s matching mask is a warning about counterplay, not an actual simultaneous attack. The bounded continuation gave a modest positive engine evaluation for White but left Black one point ahead in catalogue material.',y,kind='small')

y=begin('How every state was graded','06 / transparent, uncalibrated model')
y=p('The index combines three opening concerns. Its weights are analyst choices, not learned parameters. Scores are rounded to two decimals before assigning a band. The CSV also gives two alternate weightings for sensitivity analysis.',y)
y=table(['Component','Definition'],[
 ['Economy E','Current bank + 0.60 x next idle harvest + 0.30 x second idle harvest. Idle harvest assumes these pieces remain on their squares.'],
 ['Deployment S','0.10 x empty legal spawn squares + 0.03 x crystals on those squares. This measures access, not ownership or income.'],
 ['Capture opportunity L','Largest opponent target liability among screened captures, or zero. Liability = catalogue price + lost discounted harvest + lost deployment score after removal.'],
 ['Opening index','Ew - Eb + Sw - Sb + 0.75 x Lw - 0.35 x Lb. The asymmetry explicitly values White\'s next move.']
],[110,406],y)
y=table(['Estimated band','Index interval','States','Share'],[
 [g,interval,f'{A["gradeCounts"][g]:,}',f'{100*A["gradeCounts"][g]/A["count"]:.2f}%'] for g,interval in [
 ('B major','s <= -6'),('B clear','-6 < s <= -3.5'),('B slight','-3.5 < s <= -1.5'),('Close','-1.5 < s < 1.5'),('W slight','1.5 <= s < 3.5'),('W clear','3.5 <= s < 6'),('W major','s >= 6')]
],[112,164,120,120],y)
y=p('<b>Sensitivity:</b> the economic variant weights E / S / Lw / Lb as 1.25 / 0.75 / 0.50 / -0.20; the spatial variant uses 0.75 / 1.25 / 1.00 / -0.50. In 415,453 states (65.40%), all three models agree on White-favored, Black-favored or Close. They need not agree on magnitude within that direction.',y)
y=p('The White-favored skew is partly built into the initiative weights. These frequencies count all distinct positions equally, including poor voluntary moves. They do not estimate real opening frequencies, first-player win rate, handicap size or a solved theoretical advantage.',y,kind='small')

y=begin('What the checks do and do not prove','07 / validation and uncertainty')
y=table(['Check','Coverage','Result'],[
 ['W1 production move audit','3,120 successor destinations; all 797 canonical settlement witnesses','Matched legal moves and first income.'],
 ['Independent Black search','Fresh depth-4 search for every W1; 2,486,625 transitions','Exactly 635,203 joint endpoints.'],
 ['Production state / tactical audit','293 joint states; 586 complete target masks; 6,878 capture lines','Matched settlement, 504-crystal conservation, spawn counts and target masks.'],
 ['Bounded continuations','38 selected W1/B1 pairs through W2 and B2','Every chosen action legal; positional rankings sometimes disagree.']
],[145,227,144],y)
y=p('The continuation engine used a fixed seed, 8,000 work units per call, beam width 10, eight output plans, tactical depth 1, 80 MCTS iterations and a 1,500 tactical-node setting. It allowed at most three calls per player turn. This is diagnostic search, not exhaustive minimax, and no opening was proved won or lost.',y)
y=table(['W / B IDs','Opening index','After-B2 material W-B','After-B2 engine static'],[
 [f'{w} / {b}',f'{r["initialIndex"]:+.2f}',f'{r["material"]:+d}',f'{r["engineStaticAfterB2"]:+.2f}']
 for w,b in [(74,792),(675,792),(675,157),(779,8),(779,792),(792,792)]
 for r in CONT if r['w']==w and r['b']==b
],[110,113,151,142],y)
y=p('The engine static score has a different scale from the opening index. Compare its ordering or sign within this table; do not subtract it from the opening index. Catalogue material also excludes bank and positional value. The continuation sheet preserves all 38 lines and final banks; the archive retains final pieces and actions.',y)
y=p('<b>Confidence:</b> the first-round endpoint count and legal witnesses are exact for the snapshot. The full capture screen is a deterministic calculation, audited on a broad sample against production tactics. The advantage grades and recommended repertoire are provisional analysis. The disagreements identify the most useful positions for deeper study.',y,kind='small')

y=begin('Use the census as an opening atlas','08 / workbook and raw-data guide')
y=p('<b>Start with Position lookup.</b> Enter a W1 ID and B1 pattern ID from 1 to 797 in the amber cells. The board, banks, deposits under pieces, taxonomy, capture masks and grade update from the census. W792 / B792 is the default worked example. Six forbidden pairs display ILLEGAL.',y)
y=table(['Sheet or file','Use'],[
 ['Opening patterns','All 797 endpoint patterns, White and Black coordinates, minimum actions, legal witnesses, harvest and deployment features.'],
 ['All B1 scores / Capture masks','Every full-round state as a matrix cell: row is W1, column is B1. Capture code = White mask + 8 x Black mask; target bits are Hi 1, Sjor 2, Muju 4.'],
 ['Black responses','Model-best reply and count of replies within one index point for each W1. Ties select the first pattern ID.'],
 ['Taxonomy / Joint species','205 single-side species and all 51,016 joint species, including membership counts and within-species score ranges.'],
 ['Continuations / Map / Method','Diagnostic W2/B2 lines, initial reserves, model definitions and source hashes.'],
 ['MHT-opening-raw-data.zip','Flat CSV with one row for every legal B1 state; W1 CSV; JSON feature and verification data; analysis scripts and source snapshot.']
],[165,351],y)
y=heading('Reconstruct any full board exactly',y)
y=p('Take the six coordinates and two banks from the record. Start with the Map sheet\'s 100 deposits, then replace the six occupied squares with their recorded remaining reserves. All units are their original tier-1 types with zero damage. White begins W2 with four actions; quiet count is 2. The W1 board is the analogous White record with Black\'s original pieces, bank zero and untouched Black deposits.',y)
y=heading('Reproduce or extend the analysis',y)
y=p('The archive contains the census, analysis and verification scripts under their original muju/lab/experiments path, along with relevant source and package files. From muju: run <font name="Courier" size="8.8">node --import tsx lab/experiments/opening-census-2026-09-14/census.ts</font>, then <font name="Courier" size="8.8">node lab/experiments/opening-census-2026-09-14/analyze.mjs</font>, then the verification script with <font name="Courier" size="8.8">node --import tsx</font>. Dependencies must be installed.',y)
y=p('Source authority: muju/SPEC.md v2.8 and the production movement, combat, spawning, mining, promotion and turn functions. The archive manifest records SHA-256 hashes. No game rules were changed for this study. A later rule or map change requires a new census and may change the pattern IDs and rankings.',y,kind='small')
cv.save()
print(f'Created {PDF} ({page} pages)')
