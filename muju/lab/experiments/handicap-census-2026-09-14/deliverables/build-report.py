from pathlib import Path
import json,struct
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph,Table,TableStyle
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2];DATA=ROOT/'muju/lab/results/handicap-census-2026-09-14'
A=json.loads((DATA/'analysis.json').read_text());C=json.loads((DATA/'census.json').read_text());V=json.loads((DATA/'verification.json').read_text());CONT=json.loads((DATA/'continuations.json').read_text());PROOF=json.loads((DATA/'straumr-proof.json').read_text())
FT=json.loads((DATA/'features.json').read_text());BINS={h:(DATA/f'states-h{h}.bin').read_bytes() for h in [0,3,4]};WIDTH={0:797,3:3678,4:8012}
N=colors.HexColor('#26364B');BLUE=colors.HexColor('#305E8C');INK=colors.HexColor('#253345');MUTED=colors.HexColor('#617080');LIGHT=colors.HexColor('#EEF2F6')
cv=canvas.Canvas(str(OUT/'MHT-three-and-four-crystal-openings.pdf'),pagesize=(612,792));cv.setTitle('MHT: three- and four-crystal opening handicaps');cv.setAuthor('Codex - analysis of the local v2.8 rules');page=0
styles={'body':ParagraphStyle('body',fontName='Helvetica',fontSize=10.2,leading=14.4,textColor=INK),'small':ParagraphStyle('small',fontName='Helvetica',fontSize=8.8,leading=12,textColor=MUTED),'cell':ParagraphStyle('cell',fontName='Helvetica',fontSize=8.4,leading=11.2,textColor=INK),'head':ParagraphStyle('head',fontName='Helvetica-Bold',fontSize=8.5,leading=11.4,textColor=colors.white),'h2':ParagraphStyle('h2',fontName='Helvetica-Bold',fontSize=13,leading=17,textColor=BLUE)}
def p(t,y,x=48,w=516,kind='body',gap=9):
 q=Paragraph(t,styles[kind]);_,h=q.wrap(w,720);assert y-h>=62,(page,'text overflow',y,h,t[:50]);q.drawOn(cv,x,y-h);return y-h-gap
def h(t,y):return p(t,y,kind='h2',gap=7)
def begin(title,label):
 global page
 if page:cv.showPage()
 page+=1;cv.setFillColor(N);cv.rect(0,776,612,16,fill=1,stroke=0);cv.setFont('Helvetica-Bold',9);cv.setFillColor(BLUE);cv.drawString(48,747,label.upper());cv.setFont('Helvetica-Bold',23);cv.setFillColor(N);cv.drawString(48,714,title)
 cv.setStrokeColor(colors.HexColor('#D5DCE4'));cv.line(48,54,564,54);cv.setFont('Helvetica',8);cv.setFillColor(MUTED);cv.drawString(48,38,'MHT v2.8  |  Black starting crystals 0 / 3 / 4  |  14 September 2026');cv.drawRightString(564,38,f'{page:02d}');return 690
def table(headers,rows,widths,y):
 data=[[Paragraph(str(x),styles['head']) for x in headers]]+[[Paragraph(str(x),styles['cell']) for x in row] for row in rows];t=Table(data,colWidths=widths)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),N),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),('LINEBELOW',(0,-1),(-1,-1),.5,colors.HexColor('#D5DCE4'))]));_,height=t.wrap(516,720);assert y-height>=62,(page,'table overflow',y,height);t.drawOn(cv,48,y-height);return y-height-13
def board(w,b,x,top,size=18):
 wp=C['whiteStates'][w-1]['p'];bp=C['patterns'][b-1]['units'];occ={n:('W',['H','S','M'][i]) for i,n in enumerate(wp)};tags={'fire_1':'H','fire_2':'H2','water_1':'S','water_2':'S2','plant_1':'M','plant_2':'M2','lightning_1':'R','shadow_1':'G'}
 occ.update({u['position']:('B',tags[u['definitionId']]) for u in bp})
 for n,r in enumerate(C['initialMap']):
  xx=x+n%10*size;yy=top-(n//10+1)*size;fill='#E2E5E9' if not r else '#D7E4C3' if r==16 else '#F7F5EF';cv.setFillColor(colors.HexColor(fill));cv.setStrokeColor(colors.HexColor('#CAD2DA'));cv.rect(xx,yy,size,size,fill=1,stroke=1)
  if n in occ:
   side,tag=occ[n];cv.setFillColor(colors.white if side=='W' else N);cv.circle(xx+size/2,yy+size/2,size*.40,fill=1,stroke=1);cv.setFillColor(N if side=='W' else colors.white);cv.setFont('Helvetica-Bold',size*.34 if len(tag)==1 else size*.29);cv.drawCentredString(xx+size/2,yy+size*.37,tag)
  else:cv.setFillColor(MUTED);cv.setFont('Helvetica',size*.30);cv.drawCentredString(xx+size/2,yy+size*.38,str(r))
 cv.setFillColor(MUTED);cv.setFont('Helvetica',7)
 for i in range(10):cv.drawCentredString(x+(i+.5)*size,top+5,chr(65+i));cv.drawRightString(x-4,top-(i+.65)*size,str(i+1))
 return top-size*10
def idx(hand,w,b):return struct.unpack_from('<f',BINS[hand],((w-1)*WIDTH[hand]+b-1)*24)[0]
def best(hand,w,family):return next(r for r in A['familyResponses'] if r['Handicap']==hand and r['W1_ID']==w and r['Family']==family)
def continuation(hand,w,b):return next(r for r in CONT if r['h']==hand and r['w']==w and r['b']==b)

y=begin('What three and four crystals buy','Shared opening study / findings')
y=p('<b>Three crystals creates a fourth-piece choice. Four crystals adds a strong miner and a protected promotion option.</b> Reusing the same 797 White openings, this study exhaustively enumerates Black\'s first turn under both grants, grades every resulting state and tests selected W2/B2 continuations.',y)
y=table(['Completed first round','No handicap','3 crystals','4 crystals'],[['Black setup choices',1,3,8],['Black endpoint patterns','797','3,678','8,012'],['Legal W1/B1 states','635,203','2,931,337','6,385,505']],[180,112,112,112],y)
y=p('<b>At 3:</b> buying Hi is the economic baseline; Radi supplies different movement and promotion threats. <b>At 4:</b> buying Sjor is the strongest economic default in the model, while promoting Straumr guarantees that piece survives W2. Tactical continuations sometimes favor Radi or Straumr over the model\'s preferred Sjor purchase.',y)
top=y-30;board(792,1350,81,top,18);board(792,4459,350,top,18)
p('H3: buy Hi, then Hi F5',top+23,x=65,w=220,kind='h2');p('H4: buy Sjor, then Hi F5',top+23,x=325,w=235,kind='h2')
y=top-196;y=p('Both diagrams face W792 (White Hi E6). The new Black piece stays on J10 while the original Hi uses all four actions. H3 ends with bank 7; H4 ends with bank 8. H / S / M denote Hi / Sjor / Muju.',y,kind='small')
y=p('The census is exact for this v2.8 snapshot. Advantage scores are provisional, not solved values or win probabilities. The report separates rule-derived results from model preferences and bounded-search evidence.',y)

y=begin('The complete Black decision tree','01 / legal options and counts')
y=p('White still starts with zero and makes one of the original 797 moves. Black receives its grant at game creation, separate from mined income. Its only empty initial spawn square is J10. Buying and promoting cost no AP; all movement still shares the same four AP.',y)
y=table(['Black setup','Spend','Black patterns','Joint states at H3','Joint states at H4'],[
 [f['name'],f['cost'],f'{f["patterns"]:,}',f'{next((s["count"] for s in A["overview"][1]["families"] if s["family"]==f["id"]),0):,}' if f['minHandicap']<=3 else 'Unavailable',f'{next(s["count"] for s in A["overview"][2]["families"] if s["family"]==f["id"]):,}'] for f in C['families']
],[158,48,90,110,110],y)
y=p('At 3, Black can keep the grant or buy one Hi or Radi. At 4, it can additionally buy Sjor or Gol, or promote its original Hi, Sjor or Muju. A 3-cost purchase leaves one crystal at H4. Neither grant can buy two pieces, buy a 5-cost miner, or combine purchase and promotion.',y)
y=h('Why first-round combat is still impossible',y)
y=p('The starting Hi can move at most six squares while reserving an attack, insufficient to reach White. The only faster newcomer is Radi. It begins on J10, blocked by Black Hi I10 and Muju J9. Freeing an exit costs at least one AP, leaving at most two Radi moves before an attack. That also falls short. Every enumerated partial B1 state with AP remaining was checked: none permits an attack.',y)
y=p('Fresh Black searches against all 797 White endpoints confirm that only endpoint collisions remove pairings: 29 at H3 and 59 at H4. Thus 797 x 3,678 - 29 = 2,931,337, and 797 x 8,012 - 59 = 6,385,505. There are no hidden path-blocking exceptions.',y,kind='small')

y=begin('Three crystals: income or mobility','02 / the Hi and Radi branches')
y=h('Buy Hi without moving the new Hi',y)
y=p('The useful default is to put a new Hi on J10 and develop the original Hi. A legal four-action example is <b>I10-H9-H7-H5-F5</b> (pattern B1350). The new Hi earns one crystal immediately; buying it did not use any development AP. The bank becomes 7 instead of the 9 held by a saving line with the same six-point harvest.',y)
y=p('That lower cash balance is accompanied by an extra piece worth 3 in the catalogue. With the same forward geometry, the extra Hi adds one crystal per settlement for several turns. Its occupied J10 removes one empty spawn square, a small but real cost. The model prefers some Hi purchase against 583 of the 797 White openings.',y)
y=h('Radi has two distinct plans',y)
y=table(['Plan','Verified B1 witness','Consequence'],[
 ['Develop Radi (B3086)','Hi I10-H9; Radi J10-G10-G7-F5','Radi reaches F5, while Hi remains H9. All four AP are used. First income remains 6.'],
 ['Develop original Hi (B3673)','Buy Radi J10; Hi I10-H9-H7-H5-F5','Radi waits on J10. I10 is open for its next turn; the original Hi supplies forward deployment.'],
 ['Develop both Hi (B1867)','Hi I10-H9-H7; new Hi J10-H10-H8','Two active Hi with a smaller deployment area. Relevant when a single exposed forward anchor is undesirable.']
],[124,212,180],y)
y=p('Radi mines nothing. Its value is movement, different attack reach, and access to Umeme on B2 for 4 crystals. Umeme has speed 4 and enough attack to kill Muju with the elemental bonus; unpromoted Radi does not. A Radi purchase therefore creates a different second-turn threat even when its B1 endpoint looks quiet.',y)
y=p('The model selects a Radi purchase against 214 White openings and places the family within one point of best against 482. Those counts describe the enumerated positions, not expected player behavior. Against W792, the bounded continuation for forward Radi outperformed the model-preferred Hi line; against another tested W1, the ranking reversed.',y)
y=p('Saving remains legal and preserves purchase flexibility on B2. It is never within one point of best in this particular H3 model, but that is an evaluation result rather than a proof that saving is strategically dominated.',y,kind='small')

y=begin('Four crystals: Sjor earns its place','03 / economy and alternative purchases')
y=p('A second Sjor costs 4, mines 2 immediately and owes no upkeep. It can sit on J10 while the original Hi advances, giving eight first-turn income. The model selects a Sjor purchase against every W1. The reason is primarily its sustained income and extra body; the later search does not establish it as a universal best move.',y)
y=h('Same Hi F5 plan, different investment',y)
y=table(['Black plan','Bank after B1','Gross next / second idle harvest','Next upkeep','Net next / second'],[
 ['H3 buy Hi (B1350)',7,'7 / 6',0,'7 / 6'],['H4 buy Hi (B1350)',8,'7 / 6',0,'7 / 6'],['H4 buy Sjor (B4459)',8,'8 / 7',0,'8 / 7'],['H4 promote Sachita (B8007)',8,'6 / 3',1,'5 / 2']
],[177,76,109,66,88],y)
y=p('Buying Sjor and promoting Sachita can both produce bank 8 on B1. Their next collections differ sharply. Sachita takes five from J9 immediately, leaving only three there. Its following idle collection falls to three, and upkeep also becomes due. A second Sjor spreads extraction across another eight-crystal home deposit and avoids rent.',y)
y=p('With White Hi E6 and Black Hi F5, the index is -3.80 for buying Sjor and -0.84 for promoting Sachita. Most of that gap follows directly from the ledger above. Relocating Sachita to a richer deposit can change later economics; the idle-harvest model does not plan that relocation.',y)
y=h('What the other four-crystal choices do',y)
y=p('<b>Gol:</b> a second speed-2 attacker with defense 2 and water/shadow matchups. It gives up Sjor\'s mining for mobility and combat geometry. <b>Hono:</b> higher attack and access to Cleave, but still defense 1 and the same movement speed. <b>Straumr:</b> defense rises to 3, creating the exact W2 survival guarantee on the next page. <b>Sachita:</b> faster extraction and improved combat, with finite deposits and upkeep to manage.',y)
y=p('H4 also preserves the entire H3 choice set with one more crystal in the resulting bank. The five newly unlocked setup families add 4,334 Black patterns and 3,454,168 legal joint states. Their value is more than a simple one-point cash adjustment.',y,kind='small')

y=begin('Straumr has a provable first window','04 / survival and promotion timing')
y=p('<b>At H4, Black can promote its starting Sjor to Straumr on B1, and White cannot capture that Straumr during W2.</b> This holds across every W1 and every Black B1 endpoint in the promotion family. It is stronger than the single-attacker screen used for ordinary grading.',y)
y=table(['Optimistic White attacker','Minimum relevant AP / limit','Why it cannot finish Straumr'],[
 ['Existing Hi or Hono','At least 2 AP to approach and attack the nearest possible Straumr','Hi deals at most 1; Hono at most 2. Straumr has 3 defense.'],
 ['New damaging T1 unit','At least 3 AP from the most favorable initial spawn square','One hit deals at most 2. Combining it with Hi needs at least 5 AP.'],
 ['Existing Sjor or Muju','Their W1 movement leaves them too far away','Neither can add the missing hit within the four-action budget.'],
 ['Two new units','At most two fit White\'s bank of 6 or less','Their optimistic approach-and-attack budgets also do not fit four AP.']
],[140,180,196],y)
y=p('A separate action-and-crystal calculation tested all 797 White endpoints against all 24 possible Straumr squares: <b>19,128 pairs</b>. It allowed unobstructed paths and independently ideal purchase squares, ignoring mutual blocking. Even under those favorable assumptions, White\'s maximum damage was 2. Real legal play cannot do better than this relaxed bound.',y)
y=p('Nonlethal chip damage ends that attacker\'s chain. Straumr heals when Black\'s turn starts. The result makes an advanced Straumr a dependable first-response anchor, provided the game continues. It does not stop attacks on Black\'s other pieces or home, and does not establish immunity on W3.',y)
y=h('Early tier 2 does not buy a B2 tier 3',y)
y=p('A B1 promotion spends all four starting crystals. Even Sachita\'s best first-turn mining leaves bank at most 8. At the start of B2 the promoted army owes 1 upkeep, leaving at most 7. The tier-3 upgrade costs 8. Therefore <b>none of the B1 promotion branches can reach tier 3 on B2</b>. The handicap advances tier-2 access, but the next promotion is still constrained by financing.',y)
y=p('This is one reason to compare a promotion with an extra miner rather than treating every early upgrade as an automatic technology lead.',y,kind='small')

y=begin('Read the reply against White\'s move','05 / conditional opening map')
y=p('Each entry is the lowest immediate index within the named family against that exact W1. Positive favors White; negative favors Black. Black wants the lower number. Selected compact replies can be misleading, so read the continuation comparisons on the next page before using these as a repertoire.',y)
whites=[74,157,675,779,792];labels={74:'W74: hold',157:'W157: Sjor C5',675:'W675: Hi H3',779:'W779: Hi E5',792:'W792: Hi E6'}
y=table(['White opening','No handicap best','H3 save','H3 buy Hi','H3 buy Radi'],[[labels[w],f'{best(0,w,0)["Best_index"]:+.2f}',*[f'{best(3,w,f)["Best_index"]:+.2f}' for f in [0,1,2]]] for w in whites],[164,106,82,82,82],y)
y=table(['White opening','H4 save','Hi','Radi','Sjor','Gol','Hono','Straumr','Sachita'],[[labels[w],*[f'{best(4,w,f)["Best_index"]:+.2f}' for f in range(8)]] for w in whites],[116,50,50,50,50,50,50,50,50],y)
y=h('Against a passive White opening',y)
y=p('Develop while adding a home miner. W74 lets Black keep its original Sjor and Muju mining and spend all four AP on Hi. The resulting farm-and-advance plans are attractive at both grants. A passive first move is not a useful basis for judging whether a handicap is fair.',y)
y=h('Against a deep White Hi',y)
y=p('Compare the farm-and-Hi plan with the Radi route and the protected Straumr outpost. Against W792, the model\'s H3 best is B1350 (buy Hi, original Hi F5), and its H4 best is B4459 (buy Sjor, original Hi F5). The continuation searches favor testing B3086 (Radi F5) and B6503 (Straumr H6) as serious alternatives.',y)
y=h('Against an intermediate Hi or developed Sjor',y)
y=p('Exact geometry matters more than the family label. The W779 model chooses compact purchase positions that the later searches dislike. Against W157, Radi and Straumr performed well in selected continuations. A sound study repertoire should include active placements from more than one family, rather than memorize the minimum score in each row.',y)
y=p('Black pattern IDs are new to this extension; White IDs are unchanged. Use the workbook\'s family and piece columns when comparing with the earlier report.',y,kind='small')

y=begin('The second turn changes the ranking','06 / bounded continuation evidence')
y=p('Eighty-three selected positions were played through W2 and B2 with legal engine actions. The search used 25,000 work units per call, up to three calls per player turn, beam width 16, 12 plans, tactical depth 2, 180 MCTS iterations and a 5,000 tactical-node setting. Seeds were fixed. These are diagnostic lines, not exhaustive best play.',y)
examples=[(3,792,1350,'Hi farm, Hi F5'),(3,792,3086,'Radi F5'),(4,792,4459,'Sjor farm, Hi F5'),(4,792,3086,'Radi F5'),(4,792,6503,'Straumr H6'),(4,779,3682,'Compact Sjor purchase'),(4,779,4459,'Sjor farm, Hi F5')]
y=table(['H / W1 / B ID','Black plan','Opening index','Engine after B2','Material W-B'],[[f'{hand} / {w} / {b}',label,f'{r["openingIndex"]:+.2f}',f'{r["engineStaticAfterB2"]:+.2f}',f'{r["material"]:+d}'] for hand,w,b,label in examples for r in [continuation(hand,w,b)]],[102,165,79,86,84],y)
y=p('Against W792, the immediate index prefers the H3 Hi purchase to Radi, and the H4 Sjor purchase to both Radi and Straumr. The tested continuation ordering reverses those comparisons. Radi\'s promotion/movement options and Straumr\'s secure deployment have value the short index does not fully measure.',y)
y=p('The W779 contrast is especially instructive. The model prefers the compact Sjor purchase B3682 at -6.20 to the active B4459 at -4.59. After the tested continuations, the engine evaluation is +3.94 versus -14.50. The same spending family can lead to quite different play depending on where the original pieces develop.',y)
y=p('Material alone is also insufficient: the compact W779 line leaves Black ahead by nine catalogue points, yet the engine\'s positional evaluation favors White. Its bank, threats, home defense and mobility all matter. Neither evaluator is a proof; disagreement identifies positions worth analyzing more deeply.',y)
y=p('<b>Scale warning:</b> the engine static evaluation and the opening index use different formulas and scales. Compare orderings or signs within their respective columns, not their numerical difference. No line in this diagnostic set ended the game by B2, and these 83 lines do not provide a win-rate estimate.',y,kind='small')

y=begin('How the advantage model was extended','07 / score definitions')
y=p('The original zero-handicap model compared economy, deployment and capture opportunities. Purchases and promotions now change army value, and tier 2 adds upkeep. The extension therefore adds catalogue material and uses net future idle harvest. This preserves the original model where those differences are zero.',y)
y=table(['Term','Definition'],[
 ['Material M','Sum of catalogue values of the current army. A purchase converts cash into a piece; it should not be scored only as lost cash.'],
 ['Economy E','Bank + 0.60 x (next idle harvest - rent) + 0.30 x (second idle harvest - rent). The current army stays on its squares for this forecast.'],
 ['Deployment S','0.10 x empty legal spawn squares + 0.03 x crystals on those squares. This measures access, not owned reserves.'],
 ['Capture liability','Target catalogue value + lost discounted net harvest + lost deployment score after removing that target alone.'],
 ['Opportunity Lw / Lb','Largest opposing target liability in White\'s / Black\'s capture screen, or zero. Alternatives are not added together.'],
 ['Opening index','Mw - Mb + Ew - Eb + Sw - Sb + 0.75 x Lw - 0.35 x Lb. Positive favors White.']
],[120,396],y)
y=p('White\'s screen uses its actual W2 bank. Black\'s screen uses a hypothetical fresh turn on the unchanged board after paying normal upkeep. Both consider one existing attacker, one affordable promotion, or one affordable tier-1 purchase. They account for legal approach paths and one lethal hit within four AP.',y)
y=p('The screen does not solve combined attacks, action sequences that clear blockers, retreats, recaptures or forced home-occupation play. The separate Straumr proof covers combined attacks only for that specific survival claim. The model also treats catalogue prices as material values and idle reserves as an economic forecast; both are approximations.',y)
y=p('Two alternate weightings are recorded for every state. Economic emphasis uses M / E / S / Lw / Lb weights 1 / 1.25 / 0.75 / 0.50 / -0.20. Spatial emphasis uses 1 / 0.75 / 1.25 / 1.00 / -0.50. The baseline and both variants agree on favored side or Close in 80.03% of H3 states and 83.94% of H4 states.',y)
y=p('A zero-handicap recheck matched all capture masks and all grade totals from the earlier study. Floating-point rounding changed 1,539 individual scores by at most 0.01; this is immaterial to the opening interpretation.',y,kind='small')

y=begin('Grades and meaningful classes','08 / distribution and taxonomy')
y=table(['Estimated band','Index interval','H3 states','H4 states'],[[g,interval,f'{A["overview"][1]["gradeCounts"][i]:,}',f'{A["overview"][2]["gradeCounts"][i]:,}'] for i,(g,interval) in enumerate([('B major','s <= -6'),('B clear','-6 < s <= -3.5'),('B slight','-3.5 < s <= -1.5'),('Close','-1.5 < s < 1.5'),('W slight','1.5 <= s < 3.5'),('W clear','3.5 <= s < 6'),('W major','s >= 6')])],[112,164,120,120],y)
y=p('These are uniformly weighted endpoint counts, including deliberately poor moves. A more relevant model comparison lets Black choose its best reply and then lets White choose the best W1 against that reply. The resulting index is <b>+3.66 at H0, -0.90 at H3 and -3.80 at H4</b>. W792 remains the model\'s leading White candidate in all three cases.',y)
y=p('This makes three crystals closer to neutral than four within this model. It does not establish a balanced competitive handicap: the model is uncalibrated, the tested continuations are selective, and full-game play has not been measured.',y)
y=h('Classification follows the new strategic choice',y)
y=p('White keeps its original 8 orders, 35 genera and 205 species. Black\'s <b>order</b> is now the spending family. A <b>genus</b> adds exact minimum AP, the farthest piece\'s distance from Black\'s corner and the number of pieces outside home reserves. A <b>species</b> further distinguishes terrain by unit, first income and deployment-size band.',y)
y=table(['Taxonomy measure','H3','H4'],[['Black orders / genera / species','3 / 103 / 588','8 / 265 / 1,341'],['Joint orders / genera','24 / 3,605','64 / 9,275'],['Joint species','166,778','352,749']],[256,130,130],y)
y=p('Joint species pair White and Black species and add both capture masks. Exact coordinates and scores remain distinct records within each species. Black\'s hierarchy changed from the earlier movement-based taxonomy, so its species totals are not directly comparable with the previous report. Same-type piece identities are merged when only their labels differ.',y,kind='small')

y=begin('Use and reproduce the opening atlas','09 / deliverables and verification')
y=table(['Deliverable','What it contains'],[['Shared workbook','Both handicaps and the no-handicap reference; all 8,012 Black patterns; replies to every W1; family rankings; taxonomy; all 83 continuations.'],['Position lookup','Select handicap, W1 ID and Black pattern ID. Exact score, capture targets, bank, units, remaining deposits and classification update from the census.'],['Raw-data archive','All 9,316,842 requested states in 12 flat CSV parts, each below Excel\'s row limit. Join the White and Black pattern tables for exact pieces and deposits.'],['Source and evidence','Rules snapshot, source hashes, census/scoring scripts, tactical witnesses, continuation records and the Straumr survival certificate.']],[137,379],y)
y=p('The workbook stores the full score and mask census in compact text records, decoded by the lookup. This avoids millions of separate cells while retaining every exact result. The flat CSV files are the direct data-analysis format; their keys and score components are documented in the archive README.',y)
y=h('Checks completed',y)
y=table(['Verification','Coverage'],[['Production movement and settlement','28,712 successor destinations; all 8,012 Black endpoint witnesses.'],['Fresh Black enumeration','22,883,316 transitions across all White endpoints and all eight setup families; no available B1 attacks.'],['Production tactical audit','341 joint positions, 682 complete target masks, 2,999 validated capture lines; banks, mined income, deposits and upkeep checked.'],['Straumr upper bound','19,128 White-position / target-square pairs; optimistic damage always below defense.'],['Continuation legality','All chosen actions in 83 W2/B2 diagnostic lines validated by the production rules.']],[190,326],y)
y=p('State boundaries include end-of-turn mining. After B1, White begins W2 with four AP; the quiet-turn count is 2; all pieces have zero damage. Buying leaves four Black tier-1 units; promotion leaves three Black units with one tier 2. Black\'s bank is grant minus spending plus mined income, while its cumulative mined-income counter excludes the grant.',y)
y=p('Source authority is the same local muju/SPEC.md v2.8 and production game functions used for the original report; those baseline source hashes were unchanged. No game rules were modified. Exact counts describe this snapshot; later rule or map changes require a new census. Numerical grades and repertoire suggestions remain provisional.',y,kind='small')
cv.save();print('Created',page,'pages')
