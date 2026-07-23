'use strict';
// VS AI: self-contained sim + Dellacherie brain. Shares consts/helpers with game.js.
// ponytail: plain rotation, no wall kicks or t-spins — fine at casual level; add kicks if it feels weak.
const DIFFS=[
  {name:'VERY EASY',pps:0.5,noise:16},{name:'EASY',pps:0.8,noise:8},
  {name:'MEDIUM',pps:1.1,noise:4},{name:'HARD',pps:1.5,noise:2},
  {name:'VERY HARD',pps:2.0,noise:0},
];

function BotGame(diff){
  const d=DIFFS[Math.min(Math.max(diff,1),5)-1];
  const g={board:Array.from({length:ROWS+HID},()=>Array(COLS).fill(0)),
    bag:[],cur:null,pps:d.pps,noise:d.noise,acc:0,plan:null,combo:-1,b2b:0,dead:false};
  bSpawn(g);
  return g;
}
function bSpawn(g){
  if(!g.bag.length)refill(g.bag);
  const t=g.bag.shift();
  if(g.bag.length<7)refill(g.bag);
  g.cur={t,m:SHAPES[t].m.map(r=>r.slice()),r:0,x:t=='O'?4:3,y:0};
  g.plan=null;
  if(collide(g.board,g.cur.m,g.cur.x,g.cur.y))g.dead=true;
}
// Dellacherie evaluation: lines good, height/holes/bumpiness bad
function bEval(bd,m,px,py){
  const b=bd.map(r=>r.slice());
  for(let y=0;y<m.length;y++)for(let x=0;x<m[y].length;x++)
    if(m[y][x]&&py+y>=0)b[py+y][px+x]=1;
  let lines=0;
  for(let y=0;y<ROWS+HID;y++)if(b[y].every(c=>c))lines++;
  let aggH=0,holes=0,bump=0,prevH=null;
  for(let x=0;x<COLS;x++){
    let top=-1;
    for(let y=0;y<ROWS+HID;y++)if(b[y][x]){top=y;break;}
    const h=top<0?0:ROWS+HID-top;
    aggH+=h;
    if(top>=0)for(let y=top+1;y<ROWS+HID;y++)if(!b[y][x])holes++;
    if(prevH!=null)bump+=Math.abs(h-prevH);
    prevH=h;
  }
  return lines*0.760666-aggH*0.510066-holes*0.35663-bump*0.184483;
}
function botThink(g){
  let best=null,m=SHAPES[g.cur.t].m;
  for(let r=0;r<4;r++){
    if(r)m=rotateM(m,1);
    for(let x=-2;x<COLS;x++){
      if(collide(g.board,m,x,0))continue;
      let y=0;while(!collide(g.board,m,x,y+1))y++;
      const s=bEval(g.board,m,x,y)+(Math.random()-0.5)*g.noise;
      if(!best||s>best.s)best={r,x,y,s};
    }
  }
  g.plan=best||{r:g.cur.r,x:g.cur.x,s:-1e9};
}
function dropLock(g){
  const c=g.cur;let y=c.y;
  while(!collide(g.board,c.m,c.x,y+1))y++;
  bLock(g,y);
}
function botStep(g){ // one action per tick: rotate, shift, or drop+lock
  const c=g.cur,p=g.plan;
  if(c.r!=p.r){
    const nm=rotateM(c.m,1);
    if(!collide(g.board,nm,c.x,c.y)){c.m=nm;c.r=(c.r+1)%4;return;}
    if(c.x<p.x&&!collide(g.board,c.m,c.x+1,c.y)){c.x++;return;} // shift first, retry spin later
    if(c.x>p.x&&!collide(g.board,c.m,c.x-1,c.y)){c.x--;return;}
    dropLock(g);return; // ponytail: stuck — take what we can get
  }
  if(c.x<p.x&&!collide(g.board,c.m,c.x+1,c.y)){c.x++;return;}
  if(c.x>p.x&&!collide(g.board,c.m,c.x-1,c.y)){c.x--;return;}
  dropLock(g);
}
function bLock(g,y){
  const c=g.cur;
  for(let my=0;my<c.m.length;my++)for(let mx=0;mx<c.m[my].length;mx++){
    if(!c.m[my][mx])continue;
    if(y+my>=0)g.board[y+my][c.x+mx]=c.t;
  }
  let n=0;
  g.board=g.board.filter(r=>r.every(c2=>c2)?(n++,false):true);
  while(g.board.length<ROWS+HID)g.board.unshift(Array(COLS).fill(0));
  let atk=0;
  if(n){
    g.combo++;
    atk=ATK.n[n-1]+CMB[Math.min(g.combo,7)]+(n==4&&g.b2b>0?1:0);
    g.b2b=n==4?g.b2b+1:0;
  }else g.combo=-1;
  if(mode=='versus'&&vs){ // mirror of the player-side exchange in lock()
    const a=vsResolve(atk,vs.bIn);
    if(a>0)vs.pIn.push(a);
    let gb=0;while(vs.bIn.length)gb+=vs.bIn.shift();
    if(gb)bAddGarbage(g,gb);
  }
  bSpawn(g);
}
function bAddGarbage(g,n){
  for(let i=0;i<n;i++){
    if(g.board[0].some(c=>c)){g.dead=true;return;}
    const hole=Math.random()*COLS|0;
    g.board.shift();
    const row=Array(COLS).fill('G');row[hole]=0;g.board.push(row);
  }
}
function botUpdate(g,dt){
  if(g.dead)return;
  g.acc+=dt;
  const iv=1000/g.pps;
  let guard=64; // ponytail: cap ticks per frame
  while(g.acc>=iv&&guard-->0&&!g.dead){
    g.acc-=iv;
    if(!g.plan)botThink(g);
    botStep(g);
  }
}
// runnable check: open the browser console and run botDemo()
function botDemo(pieces=300){
  const g=BotGame(5);let locks=0,guard=1e5;
  while(locks<pieces&&!g.dead&&guard-->0){
    if(!g.plan)botThink(g);
    const before=g.cur;
    botStep(g);
    if(g.cur!==before)locks++;
  }
  const ok=g.board.length==ROWS+HID&&g.board.every(r=>r.length==COLS&&r.every(c=>c!==undefined));
  console.log('botDemo: locks='+locks+' dead='+g.dead+' boardOk='+ok);
  return ok&&locks>50;
}
