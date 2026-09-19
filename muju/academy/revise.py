"""Apply the v2.7 curriculum revision to owned copies of the published sources."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json,re,shutil
ROOT=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text())
def save(p,d):p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
updates={
 2:{1:'Job ticket. A short trip. Price: one action. Four tickets a turn.',3:'Four a turn, for the team. Not four each.',14:'The Hi makes that trip. How many of the four tickets are left?',15:'I say one left.',17:'Two remain.',19:'I said one. One ticket for every square. I am checking my pockets.',29:'Four coins on the table. They come back when your next turn starts.',32:'My four spare arms now hold the reference cards. Finally. An advantage.'},
 5:{11:'Three crystals buy a Hi there. Only the smallest pieces are for sale.'},
 8:{2:'The helmet is not defense. This video has no answer timer. Take your time.',11:'That trip is three squares. Three squares is three actions.',12:'Then the hit. Four.',13:'Four is their whole turn. It fits.',15:'Their whole turn: four actions.',16:'Hitting the Hi on D three would take all four.',19:'To hit D two, the Sjor must stand on D three. That trip is four squares.',21:'The hit would be a fifth action. There is no fifth action.',22:'Name for the file: the Missing Fifth.',26:'Four squares. Speed two. Two actions, then the hit. Three.',30:'Today was plenty. Next time, a clock that resets only when an attack removes an enemy.'},
 9:{6:'Nine. Nine finished player turns with no enemy killed by attack.',7:'A quiet turn has no enemy killed by attack. Collecting crystals does not reset this clock.',11:'Walking never resets it. Neither does mining, buying, promoting, or a hit the target survives.',12:'That square paid. The quiet clock kept counting.',13:'Attack kill. Back to zero. A crystal does not do that.',15:'A payday still fills your bank. It does not reset the quiet count.',16:'Ending A finishes with no attack kill, even though it collects one crystal.',17:'Ending B removes an enemy by attack. Another enemy remains on the board.',23:'Ending B killed an enemy by attack. That reset the count, and this turn ends at zero.',24:'So a busy payday can still be a quiet turn.',29:'Attack kill. Back to zero. A crystal does not do that.'},
10:{9:'Second box. The shop. A Hi at C three costs three crystals and no actions.',11:'One.',15:'Three actions are unused, and that is allowed. The last box is the one we count together.',22:'Bank one. Now bank five.'},
11:{5:'The shop. Three crystals. Tier one owes no toll.',15:"The Tanka's defense is five.",17:'Five is a big shield. Take your time, or just watch the toaster.',18:'Not yet. Four browned. One still pale.',28:'Three are still lit. Now a Hono that has not swung hits for four. Finished.'},
15:{19:'This is the Muju. Shield of three. Takes three crystals. That is the Muju.',27:'That completes the garden rules. Keep the three bonk cards beside your practice board.'},
16:{1:'This daisy is protected by five layers of politeness.',2:'My helmet would like five layers.',7:"The chart never changes defense. The Tanka's defense is five.",8:'Four in. One lit. The fortress lived, so that Hono is done attacking.',23:'This is the Tanka. Shield of five. Collects up to four crystals a turn. Walks two. That is the Tanka.',29:'Today was plenty. You have met all six elements and learned the game rules. Try a practice game, and keep the bonk cards nearby.'}
}
def card(id,text,title,body,speaker='COACH',**extra):
 return {**dict(id=id,speaker=speaker,text=text,cue='warm, unhurried',beat='SHOW',hold=.8,directions=[],supplement=dict(kind='card',title=title,body=body)),**extra}
addons={
 1:[card('setup','White moves first. Each side starts with a Hi, a Sjor and a Muju. White begins on B one, B two and A two. Black begins on I ten, I nine and J nine.','Meet the starting teams','WHITE: Hi B1 · Sjor B2 · Muju A2\nBLACK: Hi I10 · Sjor I9 · Muju J9\nWhite moves first. Both banks normally start at 0.',supplement=dict(kind='setup'))],
 3:[
 card('cleave-rule','A kill can unlock another attack by that same piece. This is Cleave. Tier one gets at most one attack, tier two gets two, and tier three gets three. Every attack still costs one of your four shared actions.','Cleave: earn the next attack','T1: at most 1 attack\nT2: at most 2 attacks\nT3: at most 3 attacks\nEvery attack costs 1 of the team’s 4 actions.'),
 card('cleave-demo','This Hono is beside two enemy Muju. Its first hit does four against defense three and removes one. That unlocks its second attack. One more action removes the other. Two kills cost two actions.','Hono: two kills, two actions','',supplement=dict(kind='cleave',stage=0)),
 card('cleave-finish','Now two team actions remain. This Hono has used both its attacks. It may still move, but it cannot attack a third time this turn.','Cleave stops at your tier','',supplement=dict(kind='cleave',stage=2)),
 card('cleave-limits','You may move between attacks at the normal cost. If your attack leaves the target on the board, your piece cannot attack again this turn. Even a zero damage hit closes the chain. Another teammate’s later kill cannot reopen it.','The chain closes if the target survives','Moving between attacks is allowed.\nA surviving target closes that attacker’s chain.\nAnother piece’s later kill cannot reopen it.')],
4:[card('map','New games use this Unequal routes map. Squares start with zero, four, eight, or ten crystals. There are four hundred eighty altogether. The bright home reserves and the middle cluster are real reserves, and empty squares are still roads.','Unequal routes: the current starting map','',supplement=dict(kind='map')),
 card('all-miners','Every friendly piece collects at your turn end, including pieces bought or promoted that turn. Mining uses no actions. The bank is spendable money; total income remembers everything you collected, even after you spend it.','Every friendly piece gets payday','Moved, attacked, bought or promoted: still collects.\nMining costs 0 actions.\nBank = crystals available to spend.\nTotal income = all crystals collected so far.')],
5:[card('shop-prices','Fire and Lightning cost three each. Water and Shadow cost four. Plant and Metal cost five. You may buy any number you can afford, on legal empty squares. Each new piece can act immediately.','The tier-one shop','Hi / Radi: 3 crystals\nSjor / Göl: 4 crystals\nMuju / Inyan: 5 crystals\nBuy any affordable number. New pieces act now.'),
 card('home-block','Black draws rectangles from J ten toward a Black anchor. Either player may choose any clear friendly anchor. An enemy on your home is inside every one of your rectangles, so it blocks all purchases. Existing pieces can still promote and act.','Both players use their own home','White: A1 → friendly anchor\nBlack: J10 → friendly anchor\nAn enemy on your home blocks every purchase rectangle.\nExisting pieces can still promote, move and attack.')],
6:[card('promotion-prices','For every element, tier one to tier two costs four crystals. Tier two to tier three costs eight. A promoted piece can act immediately. There is no fourth tier.','The same promotion prices for all six elements','T1 → T2: pay 4\nT2 → T3: pay 8\nOne step per piece per turn. Never on its purchase turn.\nPromoted pieces act immediately. T3 is the top.')],
7:[card('upkeep-flow','If your bank covers every bill, payment is automatic. Otherwise, choose an affordable group to keep. All tier one pieces must stay. The review upkeep setting also lets you release bigger pieces voluntarily. Losing your last piece loses the game.','Pay before healing and Place','Enough crystals: payment is automatic.\nOtherwise choose an affordable group. All T1 must stay.\nReview upkeep each turn: optionally release T2 or T3.\nNo pieces left means elimination.'),
 card('promotion-bill','A newly promoted piece pays its new tier bill on your next turn, not again today. A home occupation win is checked before any of these bills.','Tomorrow’s tier bill','Promotion now → new upkeep next own turn.\nHome win check → upkeep → full heal → Place.')],
9:[card('draw-timing','The tenth quiet turn ends in a draw after mining, before the next turn starts. Even a piece waiting on the enemy home cannot override it. Ten player turns means five complete rounds. The warning turns amber at seven.','Quiet 10 ends the game before the next turn','Mine → update quiet count → draw at 10.\nThe next home check never happens after a draw.\n10 player turns = 5 full rounds. Warning at 7.')],
10:[card('public','The board, crystals, purchases, promotions and quiet count are public. There is no hidden build queue. If no legal purchase or promotion is available, the game skips straight to actions.','Everything you need to count is public','Board · damage · reserves · banks · income · quiet count\nNo build queue or hidden production.\nPlace is skipped when no legal choice exists.'),
 card('controls','Tap an empty reachable square to move. Tap an enemy to preview a trip and attack, then confirm to spend the actions. Undo works inside the current turn. End Actions collects income and hands the turn over.','Playing your turn','Empty reachable square → move\nEnemy → preview movement + attack → confirm\nUndo stays within this turn.\nEnd Actions → mining → next player'),
 card('options','Before a new game, Black can receive an optional starting gift of one to twenty crystals. White still starts with zero. Three or more lets Black shop on its first turn. Both players still get four actions.','Optional Black crystal handicap','Off by default. Black may start with 1–20 crystals.\nAt 1–2: first turn begins with actions.\nAt 3–20: Black can enter Place on turn 1.\nBoth sides always get 4 actions.'),
 card('timed','Online rooms can use a clock or be untimed. Check the chosen clock settings before starting. Running out of allowed time loses a timed game. Resigning also gives the other player the win. These video questions have no timer.','Choose the game’s clock before starting','Online play: timed or untimed\nCheck the room’s chosen time settings.\nTimeout or resignation gives the opponent the win.\nPause these videos whenever you like.')]
}
catalog=read(ROOT/'catalog.json');matrix={x['id']:x for x in read(ROOT/'bonk-matrix.json')};byid={x['id']:x for x in catalog}
words={0:'zero',1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten'}
def names(ids):
 vals=[byid[x]['name'] for x in ids]
 return ', '.join(vals[:-1])+' and '+vals[-1] if len(vals)>1 else vals[0] if vals else 'no full health unit'
tracks=read(ROOT.parent/'docs/SOUNDTRACK_SELECTIONS.json')['full_versions']
music_order=['open-room','unequal-routes','before-dawn','open-room','unequal-routes','before-dawn','open-room','unequal-routes','before-dawn','open-room','hono-koto','umeme-held-charge','straumr-hardanger','golge-baglama','muju-charango','tanka-flute']
stamp=datetime.now(ZoneInfo('America/Chicago')).strftime('%H:%M %b %d %Y %Z')
for i in range(1,17):
 p=ROOT/'production'/f'R{i:02}';ep=read(p/'qa/previous-episode.json')
 for l in ep['lines']:
  if int(l['id']) in updates.get(i,{}):l['text']=updates[i][int(l['id'])]
  l['directions']=[x.replace('six actions','four actions').replace('Six actions','Four actions') for x in l.get('directions',[])]
 if i==2:ep['title']='Four Actions, Zero Octopus Exceptions';ep['question']='How many of the four tickets are left?'
 ep['version']=6;ep['rules']='v2.7';ep['updatedLabel']=f'Video version 6 · Last updated at {stamp}';ep['speechProvider']='openai'
 extras=addons.get(i,[])
 if i>=11:
  el=['fire','lightning','water','shadow','plant','metal'][i-11]
  extras=[card('matrix-intro',f'Now the bonk matrix for {el if el!="lightning" else "Lightning"}. We check all eighteen enemy unit types, including matching types. Both pieces start at full health and are already next to each other. One attack, not a whole turn.', 'Read one tier at a time','Green: this unit one-shots the enemy.\nRed: that enemy one-shots this unit.\nBoth at full health · adjacent · one legal attack.\nThis is damage, not a movement or safety prediction.')]
  for tier in [1,2,3]:
   u=byid[f'{el}_{tier}'];m=matrix[u['id']];wn=words[tier]
   for suffix,text,mode in [
    ('stats',f'Tier {wn}: the {u["name"]}. Attack {words[u["attack"]]}, defense {words[u["defense"]]}, speed {words[u["speed"]]}, and Mining {words[u["mining"]]}. Look at the green side first.','out'),
    ('out',f'With one attack, the {u["name"]} can finish {names(m["targets"])}. Every unlit card survives that single hit.','out'),
    ('in',f'Now the red side. A full health {u["name"]} is one shot by {names(m["threats"])}. Every unlit attacker needs help or earlier damage.','in'),
    ('read',f'That is the tier {wn} card. Pause here to compare any names. The same enemy can appear on both sides: whoever attacks first may finish the other.','both')]:
    extras.append(card(f'matrix-{tier}-{suffix}',text,'','',supplement=dict(kind='matrix',unit=u['id'],focus=mode),hold=2 if suffix=='read' else .8))
 ep['lines'][-2:-2]=extras
 for l in ep['lines']:
  ds=[]
  for d in l.get('directions',[]):
   d=d.replace('six tokens','four tokens').replace('Six action tokens','Four action tokens').replace('six coins','four coins').replace('tray of six','tray of four').replace('same six','same four').replace('team shares six','team shares four').replace('two of the six','two of the four').replace('Four tokens stay lit','Two tokens stay lit').replace('stop at six','stop at four')
   d=d.replace('Defense six','Defense five').replace('defense six','defense five').replace("Tanka\'s six shield","Tanka\'s five shield").replace('four of the six shield','four of the five shield').replace('two stay lit','one stays lit').replace('Two stay lit','One stays lit').replace('fresh Tanka on two','fresh Tanka on one').replace('Shields three, four, six','Shields three, four, five').replace('fresh Tanka, six pips','fresh Tanka, five pips').replace('four stay lit','three stay lit')
   d=d.replace('Hi costs two crystals','Hi costs three crystals').replace('Radi costs two crystals','Radi costs three crystals').replace('Kagari, six more','Kagari, eight more').replace('Kimubunga, six more','Kimubunga, eight more').replace('Inyan costs 6','Inyan costs 5').replace('Mazask costs 12','Mazask costs 9').replace('Tanka costs 24','Tanka costs 17')
   if i==8:d=d.replace('D nine','D seven').replace('six squares','four squares')
   if i==10:d=d.replace('Bank 4 to 2','Bank 4 to 1').replace('Bank two becomes bank six','Bank one becomes bank five')
   ds.append(d)
  l['directions']=ds
 track=music_order[i-1];entry=tracks[track]
 ep['soundtrack']={'id':track,'title':entry['title'],'source':entry['audio_file'],'sha256':entry['sha256']}
 save(p/'episode.json',ep)
 for filename in ['catalog.json','bonk-matrix.json','map.json']:shutil.copy2(ROOT/filename,p/'src'/filename)
 (p/'public/music').mkdir(exist_ok=True)
 shutil.copy2(ROOT.parent.parent/entry['audio_file'],p/'public/music/theme.mp3')
print('Revised 16 scripts; added full rules coverage and 18 tier matrices; assigned all 9 final mixes.')
