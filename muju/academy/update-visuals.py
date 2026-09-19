from pathlib import Path
import shutil,re
R=Path(__file__).resolve().parent
def change(s,a,b):
 if a not in s:raise ValueError('Missing source: '+a[:90])
 return s.replace(a,b)
def replace_function(s,name,new):return re.sub(r'function '+name+r'\([^\n]+',lambda m:new,s,count=1)
for i in range(1,17):
 p=R/'production'/f'R{i:02}';v=p/'src/video.tsx';orig=p/'qa/previous-video.tsx'
 if not orig.exists():shutil.copy2(v,orig)
 s=orig.read_text()
 s=s.replace("import data from './timeline.json';","import data from './timeline.json';\nimport {Supplement} from './supplement';")
 s=s.replace('[0,1,2,3,4,5].map(i=><circle','[0,1,2,3].map(i=><circle').replace('cx={35+i*45}','cx={60+i*60}')
 s=s.replace('count=6','count=4').replace('left=6','left=4').replace('length:6','length:4')
 s=s.replace('Rules v2.2','Rules v2.7')
 if i==2:
  # The two-step trip spends 2 of 4; the later step spends another 1.
  s=s.replace('Six','Four').replace('six','four').replace('TEAM: 6','TEAM: 4').replace('count={6}','count={4}').replace('q?6:count','q?4:count')
  s=s.replace('i>=6','i>=4').replace("i===6?'SPEED 2':'TEAM: 4'","i%2===0?'SPEED 2':'TEAM: 4'")
  s=s.replace('pos[1]>=3.999?5:6','pos[1]>=3.999?3:4').replace('count=5;route','count=3;route')
  s=s.replace('pos[1]<3.99?6:pos[1]<4.99?5:4','pos[1]<3.99?4:pos[1]<4.99?3:2')
  s=s.replace('pos=[2,5];count=4','pos=[2,5];count=2').replace('pos[1]>=5.99?3:4','pos[1]>=5.99?1:2').replace('pos=[2,6];count=3','pos=[2,6];count=1')
  s=s.replace('count=n===26?6:6-','count=n===26?4:4-').replace('Four remain. Here’s why.','Two remain. Here’s why.').replace('Pip’s guess: three left.','Pip’s guess: one left.')
  s=s.replace('<Tickets count={4}/><Lesson title="Pocket','<Tickets count={2}/><Lesson title="Pocket').replace('<Tickets count={4}/><Lesson title="Up to','<Tickets count={2}/><Lesson title="Up to')
  s=s.replace('6 − 2 = 4 tickets left','4 − 2 = 2 tickets left').replace('4 − 1 = 3 tickets left','2 − 1 = 1 ticket left').replace('R02 · SIX ACTIONS','R02 · FOUR ACTIONS')
 elif i<=10:
  s=s.replace('bought?2:4','bought?1:4').replace('Hi costs 2 crystals','Hi costs 3 crystals')
  s=s.replace('[6,12,24]:[2,6,12]','[5,9,17]:[3,7,15]').replace('six actions untouched','four actions untouched').replace('Hi 2 → Hono 6','Hi 3 → Hono 7').replace('6 − 2 = 4 crystals','7 − 3 = 4 crystals')
  # Move the Sjor from D9 to D7: D7→D4 plus hit fits 4; D7→D3 plus hit needs 5.
  st=s.index('function Safety(');en=s.index('\nfunction Strip(',st);part=s[st:en]
  part=part.replace("['D9','D8','D7'","['D7'").replace("piece('sjor','D9'","piece('sjor','D7'").replace("['C2','E9']","['C2','E7']")
  for a,b in [('fresh six actions','fresh four actions'),('left={6}','left={4}'),('D3 fits in six','D3 fits in four'),('6 to walk + 1 to hit = 7','4 to walk + 1 to hit = 5'),('No seventh action','No fifth action'),('6 squares ÷ Speed 2 = 3 actions','4 squares ÷ Speed 2 = 2 actions'),('Total: 4.','Total: 3.'),('5 to walk + 1 to hit = 6','3 to walk + 1 to hit = 4'),('The six actions','The four actions')]:part=part.replace(a,b)
  s=s[:st]+part+s[en:]
  # Updated whole-turn accounting: 5 - 1 upkeep - 3 purchase + 4 income = 5.
  s=s.replace('n<21?2:6','n<21?1:5').replace('Bank 2 + income 4 = bank 6','Bank 1 + income 4 = bank 5').replace('Hi purchase: 2 crystals','Hi purchase: 3 crystals').replace('Bank 4 → 2. Buying','Bank 4 → 1. Buying').replace('5 actions unused','3 actions unused')
  quiet='''function Quiet({n,f}:any){const q=n>=16&&n<=19,done=n>=20&&n<=22,reset=n===13||n===23||n===25||n===29;return <><Title>{q?'At quiet nine, which ending draws?':done?'The tenth quiet turn ends the game.':reset?'An attack kill resets the count.':'Mining does not reset the quiet clock.'}</Title><Wide><Strip count={done?10:reset?0:9}/>{q?<Choices items={['A: no attack kill · income 1','B: attack kill · another enemy remains']}/>:done?<div style={{marginTop:28}}><Card title="DRAW · the next turn never begins" color={C.coral}>Income does not prevent a draw. No later home check can override it.</Card></div>:<div style={{display:'flex',gap:24,marginTop:28}}><div style={{flex:1}}><Card title="Resets to 0" color={C.mint}>An attack kills an enemy. That completed turn ends at zero.</Card></div><div style={{flex:1}}><Card title="Does not reset" color={C.gold}>Mining · movement · buying · promoting · chip hits · upkeep release</Card></div></div>}{n>=25&&<p style={{fontSize:28}}>Removing the last enemy wins immediately by elimination.</p>}</Wide></>}'''
  s=replace_function(s,'Quiet',quiet)
 else:
  s=s.replace('From the shop: 2 crystals','From the shop: 3 crystals').replace('Six layers','Five layers')
  # Only current element scenes survive in the new renderer; old strategy scene implementations are retired.
  st=s.index('function Bonks(');en=s.index('function Content(',st) if 'function Content(' in s[st:] else s.index('function Scene(',st)
  s=s[:st]+s[en:]
  s=s.replace('shield={second?6:3}','shield={second?5:3}').replace('shield={6}','shield={5}').replace('n===27?2:6','n===27?2:5')
  s=s.replace('Four still lit.','Three still lit.').replace('4 in. 2 lit.','4 in. 1 lit.')
  s=s.replace('<Tokens left={3}/>','<Tokens left={1}/>')
  s=re.sub(r'case (?:1[7-9]|2[0-7]):return [^;]+;', '', s)
  s=s.replace('default:return <Advanced ep={ep} n={n} f={f}/>;','default:return null;')
 # Supplements retain the field team and replace the hard-coded teaching panel.
 if i==2:
  s=s.replace('{n<=5||n>=32?<Dispatch','{line.supplement?<><Rail line={line} f={f}/><Supplement s={line.supplement} f={f}/></>:n<=5||n>=32?<Dispatch')
 else:
  s=s.replace('<Content ep={ep} n={n} f={thinking?line.speechFrames:f}/>','{line.supplement?<Supplement s={line.supplement} f={f}/>:<Content ep={ep} n={n} f={thinking?line.speechFrames:f}/>}')
  # The element shell passes line too.
  s=s.replace('<Content ep={ep} n={n} f={thinking?line.speechFrames:f} line={line}/>','{line.supplement?<Supplement s={line.supplement} f={f}/>:<Content ep={ep} n={n} f={thinking?line.speechFrames:f} line={line}/>}')
 s=s.replace("Rules v2.7 · AI-generated voices","Rules v2.7 · AI-generated voices")
 v.write_text(s);shutil.copy2(R/'supplement.tsx',p/'src/supplement.tsx')
print('Updated four-light Click, action arithmetic, current stats and prices, draw visuals, and supplement routing.')
