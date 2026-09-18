#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <string>
#include <unordered_set>
#include <vector>
using namespace std;
struct Def{int atk,def,speed,cost,tier,next,promote;};
struct Unit{int pos,def;double liability;};
struct Feature{int id,family,minH,n,bank,rent,M,order,genus,species;double E,S;vector<Unit>u;vector<int>spawn;};
vector<Def>D;int modif[18][18];vector<int>adj[100];
Feature read(istream&in){Feature f;in>>f.id>>f.family>>f.minH>>f.n>>f.bank>>f.rent>>f.M>>f.E>>f.S>>f.order>>f.genus>>f.species;for(int i=0;i<f.n;i++){Unit u;in>>u.pos>>u.def>>u.liability;f.u.push_back(u);}int ns;in>>ns;while(ns--){int p;in>>p;f.spawn.push_back(p);}return f;}
bool lethal(int a,int t){return max(0,D[a].atk+modif[a][t])>=D[t].def;}
struct Cap{uint8_t mask=0,ap=5;double liability=0;};
Cap capture(const Feature&own,const Feature&enemy,int bank){
 Cap out;bool occupied[100]={};for(auto u:own.u)occupied[u.pos]=true;for(auto u:enemy.u)occupied[u.pos]=true;
 for(int ti=0;ti<enemy.n;ti++){
  const auto target=enemy.u[ti];int speeds[4]={},buySpeed=0,maxSpeed=0;
  for(int i=0;i<own.n;i++){auto u=own.u[i];if(lethal(u.def,target.def))speeds[i]=D[u.def].speed;
   if(D[u.def].next>=0&&bank>=D[u.def].promote&&lethal(D[u.def].next,target.def))speeds[i]=max(speeds[i],D[D[u.def].next].speed);
   maxSpeed=max(maxSpeed,speeds[i]);}
  for(int i=0;i<(int)D.size();i++)if(D[i].tier==1&&D[i].cost<=bank&&lethal(i,target.def))buySpeed=max(buySpeed,D[i].speed);
  maxSpeed=max(maxSpeed,buySpeed);if(!maxSpeed)continue;
  // Reject targets outside every optimistic empty-board range before BFS.
  auto md=[&](int p){return abs(p%10-target.pos%10)+abs(p/10-target.pos/10);};
  bool possible=false;for(int i=0;i<own.n;i++)if(speeds[i]&&md(own.u[i].pos)<=3*speeds[i]+1)possible=true;
  if(buySpeed)for(int p:own.spawn)if(md(p)<=3*buySpeed+1){possible=true;break;}
  if(!possible)continue;
  int dist[100];fill(dist,dist+100,-1);int q[100],head=0,tail=1;q[0]=target.pos;dist[target.pos]=0;
  while(head<tail){int p=q[head++];if(dist[p]>=3*maxSpeed+1)continue;for(int n:adj[p])if(dist[n]<0){dist[n]=dist[p]+1;if(!occupied[n])q[tail++]=n;}}
  int best=5;for(int i=0;i<own.n;i++)if(speeds[i]&&dist[own.u[i].pos]>0)best=min(best,(dist[own.u[i].pos]-2+speeds[i])/speeds[i]+1);
  if(buySpeed)for(int p:own.spawn)if(dist[p]>0)best=min(best,(dist[p]-2+buySpeed)/buySpeed+1);
  if(best<=4){out.mask|=1<<ti;out.ap=min<int>(out.ap,best);out.liability=max(out.liability,target.liability);}
 }
 return out;
}
#pragma pack(push,1)
struct Record{float score,wl,bl;uint8_t wm,bm,wa,ba;float economic,spatial;};
#pragma pack(pop)
int grade(double s){return s<=-6?0:s<=-3.5?1:s<=-1.5?2:s<1.5?3:s<3.5?4:s<6?5:6;}
double rnd(double s){return floor(s*100+.5)/100;}
struct Stats{long long count=0,wThreat=0,bThreat=0,mutual=0,robust=0;array<long long,7>grades{};double lo=1e9,hi=-1e9,sum=0;unordered_set<uint64_t>species;unordered_set<int>genera,orders;};
int main(int argc,char**argv){
 string dir=argc>1?argv[1]:"lab/results/handicap-census-2026-09-14";ifstream in(dir+"/score-input.txt");int nd;in>>nd;D.resize(nd);for(auto&d:D)in>>d.atk>>d.def>>d.speed>>d.cost>>d.tier>>d.next>>d.promote;for(int i=0;i<nd;i++)for(int j=0;j<nd;j++)in>>modif[i][j];
 int nw,nb;in>>nw>>nb;vector<Feature>W,B;for(int i=0;i<nw;i++)W.push_back(read(in));for(int i=0;i<nb;i++)B.push_back(read(in));if(!in){cerr<<"Input failed";return 2;}
 for(int n=0;n<100;n++){if(n>=10)adj[n].push_back(n-10);if(n<90)adj[n].push_back(n+10);if(n%10)adj[n].push_back(n-1);if(n%10<9)adj[n].push_back(n+1);}
 array<int,3> H={0,3,4};array<int,3> widths{};array<ofstream,3>out;array<Stats,3>stats;array<array<Stats,8>,3>family;
 for(int k=0;k<3;k++){for(auto&b:B)if(b.minH<=H[k])widths[k]++;out[k].open(dir+"/states-h"+to_string(H[k])+".bin",ios::binary);}
 ofstream bestout(dir+"/best-by-family.csv");bestout<<"Handicap,W1_ID,Family,Best_pattern,Best_index,Legal_replies,Within_one_of_global_best,No_White_capture_near_best,Global_best_pattern,Global_best_index\n";
 for(auto&w:W){array<vector<Record>,3>row;array<array<double,8>,3>best;array<array<int,8>,3>bestid,legal;for(int k=0;k<3;k++){row[k].resize(widths[k]);best[k].fill(1e9);bestid[k].fill(0);legal[k].fill(0);}
  for(auto&b:B){bool collision=false;for(auto u:w.u)for(auto v:b.u)if(u.pos==v.pos)collision=true;
   if(collision){for(int k=0;k<3;k++)if(b.minH<=H[k])row[k][b.id-1]={numeric_limits<float>::quiet_NaN(),0,0,0,0,5,5};continue;}
   Cap wc=capture(w,b,w.bank);
   for(int k=0;k<3;k++)if(b.minH<=H[k]){
    Cap bc=capture(b,w,b.bank+H[k]-b.rent);double ed=w.E-b.E-H[k],sd=w.S-b.S,md=w.M-b.M;
    double sc=rnd(md+ed+sd+.75*wc.liability-.35*bc.liability),es=rnd(md+1.25*ed+.75*sd+.5*wc.liability-.2*bc.liability),ss=rnd(md+.75*ed+1.25*sd+wc.liability-.5*bc.liability);
    Record r{(float)sc,(float)wc.liability,(float)bc.liability,wc.mask,bc.mask,wc.ap,bc.ap,(float)es,(float)ss};row[k][b.id-1]=r;
    for(Stats*st:{&stats[k],&family[k][b.family]}){st->count++;st->grades[grade(sc)]++;st->lo=min(st->lo,sc);st->hi=max(st->hi,sc);st->sum+=sc;st->wThreat+=wc.mask!=0;st->bThreat+=bc.mask!=0;st->mutual+=(wc.mask&&bc.mask);st->robust+=((sc>=1.5&&es>=1.5&&ss>=1.5)||(sc<=-1.5&&es<=-1.5&&ss<=-1.5)||(abs(sc)<1.5&&abs(es)<1.5&&abs(ss)<1.5));}
    stats[k].species.insert((uint64_t(w.species)<<24)|(uint64_t(b.species)<<8)|(wc.mask<<4)|bc.mask);stats[k].genera.insert(w.genus*1000+b.genus);stats[k].orders.insert((w.order-1)*8+b.order);
    legal[k][b.family]++;if(sc<best[k][b.family]){best[k][b.family]=sc;bestid[k][b.family]=b.id;}
   }
  }
  for(int k=0;k<3;k++){
   double global=*min_element(best[k].begin(),best[k].end());int globalid=0;for(int f=0;f<8;f++)if(best[k][f]==global){globalid=bestid[k][f];break;}
   array<int,8>near{},safe{};for(int j=0;j<widths[k];j++)if(isfinite(row[k][j].score)&&row[k][j].score<=global+1.00001){near[B[j].family]++;if(!row[k][j].wm)safe[B[j].family]++;}
   for(int f=0;f<8;f++)if(legal[k][f])bestout<<H[k]<<','<<w.id<<','<<f<<','<<bestid[k][f]<<','<<best[k][f]<<','<<legal[k][f]<<','<<near[f]<<','<<safe[f]<<','<<globalid<<','<<global<<'\n';
   out[k].write((char*)row[k].data(),row[k].size()*sizeof(Record));
  }
  if(w.id%50==0)cout<<"Scored White "<<w.id<<"/"<<nw<<endl;
 }
 ofstream summary(dir+"/score-summary.json");summary<<"{\"cases\":[";
 auto writeStats=[&](Stats&s){summary<<"\"count\":"<<s.count<<",\"min\":"<<s.lo<<",\"max\":"<<s.hi<<",\"mean\":"<<s.sum/s.count<<",\"whiteThreat\":"<<s.wThreat<<",\"blackThreat\":"<<s.bThreat<<",\"mutual\":"<<s.mutual<<",\"robustDirection\":"<<s.robust<<",\"gradeCounts\":[";for(int g=0;g<7;g++){if(g)summary<<',';summary<<s.grades[g];}summary<<']';};
 for(int k=0;k<3;k++){if(k)summary<<',';summary<<"{\"handicap\":"<<H[k]<<",\"patterns\":"<<widths[k]<<',';writeStats(stats[k]);summary<<",\"jointOrders\":"<<stats[k].orders.size()<<",\"jointGenera\":"<<stats[k].genera.size()<<",\"jointSpecies\":"<<stats[k].species.size()<<",\"families\":[";bool first=true;for(int f=0;f<8;f++)if(family[k][f].count){if(!first)summary<<',';first=false;summary<<"{\"family\":"<<f<<',';writeStats(family[k][f]);summary<<'}';}summary<<"]}";cout<<"H"<<H[k]<<": "<<stats[k].count<<" states, "<<stats[k].species.size()<<" species"<<endl;}summary<<"]}";
}
