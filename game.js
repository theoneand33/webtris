'use strict';
const COLS=10, ROWS=20, HID=2;
let CELL=30, BX=150, BY=30; // mutable: versus mode uses a smaller layout
const LOCK_DELAY=500, MAX_RESETS=15;
let DAS=110, ARR=25, SOFT=100;
try{const h=JSON.parse(localStorage.getItem('webtris_handling')||'{}');if(h.das)DAS=h.das;if(h.arr)ARR=h.arr;if(h.soft!=null)SOFT=h.soft;}catch(e){}
// versus/blitz attack table (ponytail: standard modern versus, no all-spin/surge variants)
const ATK={n:[0,1,2,4],ts:[0,2,4,6]},CMB=[0,1,1,2,2,3,3,4];
const cvs=document.getElementById('c'), ctx=cvs.getContext('2d');

const SHAPES={
  I:{m:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],c:'#2fd4e8'},
  O:{m:[[1,1],[1,1]],c:'#f7d308'},
  T:{m:[[0,1,0],[1,1,1],[0,0,0]],c:'#b93fe0'},
  S:{m:[[0,1,1],[1,1,0],[0,0,0]],c:'#3ecf4a'},
  Z:{m:[[1,1,0],[0,1,1],[0,0,0]],c:'#ef4a4a'},
  J:{m:[[1,0,0],[1,1,1],[0,0,0]],c:'#4a68ef'},
  L:{m:[[0,0,1],[1,1,1],[0,0,0]],c:'#f7941e'},
  G:{m:[],c:'#5f6673'}, // garbage row filler (color only)
};
// SRS wall kicks, +y up (negate y when applying)
const KJ={
 '01':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],'10':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
 '12':[[0,0],[1,0],[1,-1],[0,2],[1,2]],'21':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
 '23':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],'32':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
 '30':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],'03':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const KI={
 '01':[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],'10':[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
 '12':[[0,0],[-1,0],[2,0],[-1,2],[2,-1]],'21':[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
 '23':[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],'32':[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
 '30':[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],'03':[[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};
const MODES={
  sprint:{label:'SPRINT 40L',sub:'clear 40 lines fast',goal:40,accent:'#2fd4e8',mino:'I'},
  ultra:{label:'BLITZ',sub:'two-minute rush',time:120000,accent:'#f7941e',mino:'L'},
  marathon:{label:'MARATHON',sub:'150 line run',goal:150,accent:'#b93fe0',mino:'T'},
  zen:{label:'ZEN',sub:'endless mode',accent:'#3ecf4a',mino:'S'},
  versus:{label:'VS AI',sub:'fight the cpu',accent:'#ef4a4a',mino:'Z'},
};

let board, bag, cur, hold, canHold, state='menu', mode=null;
let menuHover=[0,0,0,0,0,0]; // per-row glow fade (0→1)
let lines, score, level, combo, b2b, pieces, time, gravAcc, lockT, resets, tspinFlag;
let flashes=[], popups=[], lands=[], drops=[], spawnT=0;
let moveDir=0, dasT=0, arrT=0, prevIv=0;
let vs=null; // versus match state, set by startVs()
const keys={};
let clickZones=[];
let best={};
let mouseX=-1,mouseY=-1; // ponytail: hover state via raw coords, no React state equivalent
try{best=JSON.parse(localStorage.getItem('webtris_best')||'{}')}catch(e){}

// --- audio: tiny beeper, no assets ---
let AC;
function beep(f,d=0.06,type='square',v=0.04){
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(),g=AC.createGain();
    o.type=type;o.frequency.value=f;g.gain.value=v;
    g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+d);
    o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+d);
  }catch(e){}
}

function rotateM(m,dir){
  const n=m.length,r=m.map(row=>row.slice());
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    if(dir>0) r[x][n-1-y]=m[y][x]; else r[n-1-x][y]=m[y][x];
  }
  return r;
}
function refill(){
  const a=['I','J','L','O','S','T','Z'];
  for(let i=6;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}
  bag.push(...a);
}
function collide(m,px,py){
  for(let y=0;y<m.length;y++)for(let x=0;x<m[y].length;x++){
    if(!m[y][x])continue;
    const bx=px+x,by=py+y;
    if(bx<0||bx>=COLS||by>=ROWS+HID)return true;
    if(by>=0&&board[by][bx])return true;
  }
  return false;
}
function spawn(t){
  t=t||bag.shift();
  if(bag.length<7)refill();
  cur={t,m:SHAPES[t].m.map(r=>r.slice()),r:0,x:t=='O'?4:3,y:0};
  lockT=0;resets=0;tspinFlag=false;gravAcc=0;spawnT=0;
  if(collide(cur.m,cur.x,cur.y))gameOver();
}
function startMode(m){
  mode=m;
  board=Array.from({length:ROWS+HID},()=>Array(COLS).fill(0));
  bag=[];refill();
  hold=null;canHold=true;
  lines=0;score=0;level=1;combo=-1;b2b=0;pieces=0;time=0;
  flashes=[];popups=[];lands=[];drops=[];
  spawn();state='play';
}
function grounded(){return collide(cur.m,cur.x,cur.y+1);}
function tryMove(dx,dy){
  if(collide(cur.m,cur.x+dx,cur.y+dy))return false;
  cur.x+=dx;cur.y+=dy;
  if(dx)tspinFlag=false;
  if(dy)lockT=0;
  else if(grounded()&&resets<MAX_RESETS){lockT=0;resets++;}
  return true;
}
function rotate(dir){
  if(cur.t=='O')return;
  const nm=rotateM(cur.m,dir),to=(cur.r+dir+4)%4;
  const kicks=(cur.t=='I'?KI:KJ)[''+cur.r+to];
  for(const[dx,dy]of kicks){
    if(!collide(nm,cur.x+dx,cur.y-dy)){
      cur.m=nm;cur.x+=dx;cur.y-=dy;cur.r=to;tspinFlag=true;
      if(grounded()&&resets<MAX_RESETS){lockT=0;resets++;}
      beep(440,0.03,'square',0.02);
      return;
    }
  }
}
function hardDrop(){
  let d=0;
  const sy=cur.y;
  while(!collide(cur.m,cur.x,cur.y+1)){cur.y++;d++;}
  score+=d*2;
  if(d)drops.push({m:cur.m,x:cur.x,sy,dy:cur.y-sy,t:0});
  lock();
}
function doHold(){
  if(!canHold)return;
  beep(330,0.05);
  const t=hold;hold=cur.t;
  if(t)spawn(t);else spawn();
  canHold=false;
}
function isTSpin(){
  const cx=cur.x+1,cy=cur.y+1;let n=0;
  for(const[dx,dy]of[[-1,-1],[1,-1],[-1,1],[1,1]]){
    const bx=cx+dx,by=cy+dy;
    if(bx<0||bx>=COLS||by<0||by>=ROWS+HID||board[by][bx])n++;
  }
  return n>=3;
}
function lock(){
  const ts=cur.t=='T'&&tspinFlag&&isTSpin();
  let above=true;
  for(let y=0;y<cur.m.length;y++)for(let x=0;x<cur.m[y].length;x++){
    if(!cur.m[y][x])continue;
    const by=cur.y+y;
    if(by>=HID)above=false;
    if(by>=0)board[by][cur.x+x]=cur.t;
    if(by>=HID)lands.push({x:cur.x+x,y:by,t:0});
  }
  pieces++;
  beep(180,0.04,'square',0.03);
  if(above){
    if(mode=='zen'){ // ponytail: zen clears the top 10 rows instead of ending the run
      board.splice(0,10);
      while(board.length<ROWS+HID)board.push(Array(COLS).fill(0));
      canHold=true;spawn();return;
    }
    return gameOver();
  }
  const cleared=[];
  for(let y=0;y<ROWS+HID;y++)if(board[y].every(c=>c))cleared.push(y);
  const n=cleared.length;
  let atk=0;
  if(n){
    for(const r of cleared)flashes.push({row:r,t:0});
    board=board.filter((_,i)=>!cleared.includes(i));
    while(board.length<ROWS+HID)board.unshift(Array(COLS).fill(0));
    const eligible=n==4||ts;
    combo++;
    atk=(ts?ATK.ts:ATK.n)[n-1]+CMB[Math.min(combo,7)]+(eligible&&b2b>0?1:0);
    if(mode=='ultra'){
      score+=atk*100; // blitz scoring: attack is the points
    }else{
      let base=ts?[400,800,1200,1600][n]:[0,100,300,500,800][n];
      if(eligible&&b2b>0)base=Math.floor(base*1.5);
      score+=(base+(combo>0?50*combo:0))*level;
    }
    b2b=eligible?b2b+1:0;
    lines+=n;
    let txt=ts?'T-SPIN'+['',' SINGLE',' DOUBLE',' TRIPLE'][n]:['','SINGLE','DOUBLE','TRIPLE','TETRIS'][n];
    if(eligible&&b2b>1)txt='B2B '+txt;
    popups.push({txt,t:0});
    if(combo>0)popups.push({txt:combo+' COMBO',t:0,small:1});
    if(mode=='versus'&&atk)popups.push({txt:'+'+atk+' ATK',t:0,small:1});
    beep(n==4||ts?880:520,0.12,'square',0.05);
  }else combo=-1; // guideline: combo resets on a non-clearing lock
  if(mode=='versus'&&vs){
    const a=vsResolve(atk,vs.pIn);
    if(a>0)vs.bIn.push(a);
    let g=0;while(vs.pIn.length)g+=vs.pIn.shift();
    if(g){addGarbage(g);beep(90,0.15,'sawtooth',0.05);if(state!='play')return;}
  }
  if(mode=='marathon'||mode=='zen')level=Math.min(15,1+(lines/10|0));
  const md=MODES[mode];
  if(md&&md.goal&&lines>=md.goal)return finish();
  canHold=true;
  spawn();
}
function gravity(){
  if(mode=='marathon'||mode=='zen')return Math.pow(0.8-(level-1)*0.007,level-1)*1000;
  return 1000; // sprint/ultra: 1G, jstris-style
}
function finish(){state='over';saveBest();beep(660,0.2);beep(990,0.3);}
function gameOver(){state='over';saveBest();beep(220,0.3,'sawtooth',0.05);}
function saveBest(){
  if(mode=='versus')return;
  const lower=mode=='sprint',r=lower?time:score;
  if(!best[mode]||(lower?r<best[mode]:r>best[mode]))best[mode]=r;
  try{localStorage.setItem('webtris_best',JSON.stringify(best))}catch(e){}
}
function fmtTime(ms){
  const m=ms/60000|0,s=(ms/1000|0)%60,c=(ms/10|0)%100;
  return m+':'+String(s).padStart(2,'0')+'.'+String(c).padStart(2,'0');
}

function update(dt){
  if(state!='play')return;
  time+=dt;
  if(mode=='ultra'&&time>=MODES.ultra.time)return finish();
  if(mode=='versus'&&vs){
    botUpdate(vs.bot,dt);
    if(vs.bot.dead){vs.win=true;state='over';beep(660,0.2);beep(990,0.3);return;}
  }
  // DAS/ARR
  if(moveDir){
    dasT+=dt;
    if(dasT>=DAS){arrT+=dt;while(arrT>=ARR){tryMove(moveDir,0);arrT-=ARR;}}
  }
  // gravity / soft drop
  const soft=keys['ArrowDown'];
  const iv=soft?Math.min(gravity(),SOFT):gravity();
  if(prevIv&&iv!=prevIv)gravAcc*=iv/prevIv; // keep position continuous, no jump on speed change
  prevIv=iv;
  gravAcc+=dt;
  let guard=ROWS+HID;
  while(gravAcc>=iv&&guard--){
    gravAcc-=iv;
    if(tryMove(0,1)&&soft)score+=1;
  }
  if(grounded()){
    lockT+=dt;
    if(lockT>=LOCK_DELAY)lock();
  }
  function age(list,ttl){list.forEach(e=>e.t+=dt);return list.filter(e=>e.t<ttl);}
  flashes=age(flashes,160);lands=age(lands,150);drops=age(drops,70);
  spawnT+=dt;
  popups=age(popups,900);
}

// --- rendering ---
function block(x,y,size,color,alpha=1){
  ctx.globalAlpha=alpha;
  ctx.fillStyle=color;ctx.fillRect(x,y,size,size);
  ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(x,y,size,Math.min(4,size));
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(x,y+size-Math.min(4,size),size,Math.min(4,size));
  ctx.strokeStyle='rgba(0,0,0,.35)';ctx.strokeRect(x+.5,y+.5,size-1,size-1);
  ctx.globalAlpha=1;
}
function cell(px,py,color,alpha=1){block(BX+px*CELL,BY+(py-HID)*CELL,CELL,color,alpha);}
function mini(t,cx,cy,size,alpha=1){
  const m=SHAPES[t].m,n=m.length,ox=cx-n*size/2,oy=cy-n*size/2;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(m[y][x])block(ox+x*size,oy+y*size,size,SHAPES[t].c,alpha);
}
function text(str,x,y,size=14,color='#cfd3e0',align='left'){
  ctx.font='600 '+size+'px ui-monospace,monospace';
  ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(str,x,y);
}
function panel(x,y,w,h){
  ctx.fillStyle='rgba(16,19,29,0.82)';ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='rgba(60,68,100,0.9)';ctx.strokeRect(x+.5,y+.5,w-1,h-1);
}
function button(x,y,w,h,label,fn){
  const hover=mouseX>=x&&mouseX<x+w&&mouseY>=y&&mouseY<y+h;
  panel(x,y,w,h);
  if(hover){
    ctx.fillStyle='rgba(143,163,255,0.08)';ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#8fa3ff';ctx.strokeRect(x+.5,y+.5,w-1,h-1);
  }
  text(label,x+w/2,y+h/2+5,13,hover?'#e8ebf5':'#8fa3ff','center');
  clickZones.push({x,y,w,h,fn});
}
function draw(){
  // ponytail: cursor based on last frame's clickZones (1-frame lag, invisible); avoids per-state duplication
  const over=clickZones.some(z=>mouseX>=z.x&&mouseX<z.x+z.w&&mouseY>=z.y&&mouseY<z.y+z.h);
  cvs.style.cursor=over?'pointer':'default';
  ctx.clearRect(0,0,600,660); // ponytail: transparent so body wallpaper photo shows
  ctx.fillStyle='rgba(7,8,13,0.5)';ctx.fillRect(0,0,600,660);
  clickZones=[];
  if(mode=='versus'){CELL=20;BX=30;BY=40;}else{CELL=30;BX=150;BY=30;}
  if(state=='menu'){drawMenu();return;}
  if(state=='config'){drawConfig();return;}
  if(state=='diff'){drawDiff();return;}
  // ponytail: cursor set once at end of draw() based on clickZones, not per-state
  // board
  ctx.fillStyle='rgba(13,16,24,0.82)';ctx.fillRect(BX,BY,COLS*CELL,ROWS*CELL);
  ctx.strokeStyle='rgba(255,255,255,0.04)';
  for(let x=1;x<COLS;x++){ctx.beginPath();ctx.moveTo(BX+x*CELL,BY);ctx.lineTo(BX+x*CELL,BY+ROWS*CELL);ctx.stroke();}
  for(let y=1;y<ROWS;y++){ctx.beginPath();ctx.moveTo(BX,BY+y*CELL);ctx.lineTo(BX+COLS*CELL,BY+y*CELL);ctx.stroke();}
  ctx.strokeStyle='rgba(60,68,100,0.9)';ctx.strokeRect(BX+.5,BY+.5,COLS*CELL-1,ROWS*CELL-1);
  for(let y=HID;y<ROWS+HID;y++)for(let x=0;x<COLS;x++)if(board[y][x])cell(x,y,SHAPES[board[y][x]].c);
  for(const l of lands){
    const a=1-l.t/150;
    ctx.fillStyle='rgba(255,255,255,'+(a*0.5)+')';
    ctx.fillRect(BX+l.x*CELL,BY+(l.y-HID)*CELL,CELL,CELL);
  }
  for(const f of flashes){
    const a=1-f.t/160;
    ctx.fillStyle='rgba(255,255,255,'+(a*0.8)+')';
    ctx.fillRect(BX,BY+(f.row-HID)*CELL,COLS*CELL,CELL);
  }
  if(cur&&(state=='play'||state=='pause')){
    ctx.save();ctx.beginPath();ctx.rect(BX,BY,COLS*CELL,ROWS*CELL);ctx.clip(); // slide in from top edge
    for(const dr of drops){ // hard-drop trail: white piece sliding down, 100ms
      const p=dr.t/70,y=dr.sy+dr.dy*p;
      for(let my=0;my<dr.m.length;my++)for(let mx=0;mx<dr.m[my].length;mx++)
        if(dr.m[my][mx])cell(dr.x+mx,y+my,'#ffffff',0.9*(1-p));
    }
    let gy=cur.y;while(!collide(cur.m,cur.x,gy+1))gy++;
    for(let y=0;y<cur.m.length;y++)for(let x=0;x<cur.m[y].length;x++)
      if(cur.m[y][x])cell(cur.x+x,gy+y,SHAPES[cur.t].c,0.15);
    // smooth fall: fractional offset from gravity progress; 0 when landed
    const iv=keys['ArrowDown']?Math.min(gravity(),SOFT):gravity();
    const off=grounded()?0:Math.min(gravAcc/iv,1);
    const fa=Math.min(1,spawnT/120); // spawn fade-in
    for(let y=0;y<cur.m.length;y++)for(let x=0;x<cur.m[y].length;x++)
      if(cur.m[y][x])cell(cur.x+x,cur.y+off+y,SHAPES[cur.t].c,fa);
    ctx.restore();
  }
  if(mode=='versus'&&vs){
    // compact HUD in the middle strip between the two boards
    panel(250,40,100,64);text('HOLD',258,58,10,'#6b7288');
    if(hold)mini(hold,300,82,10,canHold?1:0.3);
    panel(250,118,100,180);text('NEXT',258,136,10,'#6b7288');
    for(let i=0;i<3&&i<bag.length;i++)mini(bag[i],300,168+i*52,10);
    panel(250,312,100,58);text('TIME',258,330,10,'#6b7288');text(fmtTime(time),258,354,14);
    text('YOU',BX+COLS*CELL/2,30,12,'#6b7288','center');
    text('CPU - '+DIFF_NAMES[vs.diff-1],370+COLS*CELL/2,30,12,'#6b7288','center');
    meter(BX+COLS*CELL+4,vs.pIn.reduce((a,b)=>a+b,0));
    meter(360,vs.bIn.reduce((a,b)=>a+b,0));
    drawBot(vs.bot);
  }else{
    // hold
    panel(20,30,110,90);text('HOLD',30,50,12,'#6b7288');
    if(hold)mini(hold,75,86,16,canHold?1:0.3);
    // next
    panel(470,30,110,270);text('NEXT',480,50,12,'#6b7288');
    for(let i=0;i<5&&i<bag.length;i++)mini(bag[i],525,86+i*48,14);
    // stats
    panel(20,140,110,160);
    text(MODES[mode].label,30,160,10,'#6b7288');
    function stat(label,val){text(label,30,sy,10,'#6b7288');text(val,30,sy+18,16);sy+=44;}
    let sy=185;
    if(mode=='sprint'){stat('TIME',fmtTime(time));stat('LINES',lines+'/40');}
    if(mode=='ultra'){stat('TIME LEFT',fmtTime(Math.max(0,120000-time)));stat('SCORE',''+score);}
    if(mode=='marathon'||mode=='zen'){stat('LEVEL',''+level);sy-=4;stat('LINES',mode=='zen'?''+lines:lines+'/150');stat('SCORE',''+score);}
  }
  // popups
  let py=260;
  for(const p of popups){
    const a=1-p.t/900;
    ctx.globalAlpha=a;
    text(p.txt,BX+COLS*CELL/2,py-p.t/20,p.small?14:20,p.small?'#8fa3ff':'#ffd75e','center');
    ctx.globalAlpha=1;
    py+=p.small?22:30;
  }
  if(state=='pause')drawPause();
  if(state=='over')drawOver();
}
// 3x5 block font for menu icons, rendered with block() so letters look like minos
const GLYPH={
  A:['.#.','#.#','###','#.#','#.#'],B:['##.','#.#','##.','#.#','##.'],
  C:['.##','#..','#..','#..','.##'],E:['###','#..','##.','#..','###'],
  F:['###','#..','##.','#..','#..'],L:['#..','#..','#..','#..','###'],
  M:['#.#','###','###','#.#','#.#'],P:['##.','#.#','##.','#..','#..'],
  S:['.##','#..','.#.','..#','##.'],V:['#.#','#.#','#.#','#.#','.#.'],
  Z:['###','..#','.#.','#..','###'],
};
function glyphIcon(str,x,y,s,color){
  for(const ch of str){
    const g=GLYPH[ch];
    if(g)for(let r=0;r<5;r++)for(let c=0;c<3;c++)if(g[r][c]=='#')block(x+c*s,y+r*s,s,color);
    x+=s*4;
  }
}
function drawMenu(){
  // tetr.io-style full-width rows, tinted with each mode's accent
  const rows=[
    ...Object.entries(MODES).map(([m,md],i)=>({key:m,md,icon:['SP','BL','MA','ZE','VS'][i],fn:()=>m=='versus'?state='diff':startMode(m)})),
    {key:'cfg',md:{label:'CONFIG',sub:'handling & more',accent:'#6b7288'},icon:'CF',fn:()=>{state='config';}},
  ];
  const rx=140,rw=460,rh=74,gap=8; // rw bleeds to the right canvas edge
  rows.forEach((r,i)=>{
    const y=44+i*(rh+gap);
    const hover=mouseX>=rx&&mouseX<rx+rw&&mouseY>=y&&mouseY<y+rh;
    menuHover[i]+=((hover?1:0)-menuHover[i])*0.15; // smooth fade
    const t=menuHover[i];
    ctx.globalAlpha=0.13+0.15*t;
    ctx.fillStyle=r.md.accent;ctx.fillRect(rx,y,rw,rh);
    ctx.globalAlpha=1;
    if(t>0.005){ // ponytail: guard against 0-width stroke rendering on init
      ctx.save();ctx.shadowColor=r.md.accent;ctx.shadowBlur=18*t;
      ctx.strokeStyle=r.md.accent;ctx.lineWidth=2*t;ctx.strokeRect(rx+1,y+1,rw-2,rh-2);
      ctx.restore();ctx.lineWidth=1;
    }
    glyphIcon(r.icon,rx+26,y+(rh-35)/2,7,r.md.accent);
    text(r.md.label,rx+110,y+36,24,hover?r.md.accent:'#e8ebf5');
    text(r.md.sub.toUpperCase(),rx+110,y+56,11,hover?r.md.accent:'#8a90a5');
    if(best[r.key]){
      const b=r.key=='sprint'?fmtTime(best[r.key]):best[r.key];
      text('BEST  '+b,rx+rw-16,y+rh-12,10,'#9aa1b5','right');
    }
    clickZones.push({x:rx,y,w:rw,h:rh,fn:r.fn});
  });
  text('WEBTRIS',24,636,18,'#2a3040'); // watermark, like the tetr.io logo corner
  text('arrows move    down soft drop    space hard drop',300,604,11,'#6b7288','center');
  text('z / x rotate    c hold    r retry    esc menu',300,624,11,'#6b7288','center');
}
function drawDiff(){
  text('VS AI',300,90,44,'#e8ebf5','center');
  ctx.fillStyle='#ef4a4a';ctx.fillRect(264,108,72,3);
  text('pick a difficulty',300,128,12,'#6b7288','center');
  const accents=['#3ecf4a','#7fd44a','#ffd75e','#f7941e','#ef4a4a'];
  DIFF_NAMES.forEach((n,i)=>{
    const y=170+i*72;
    const hover=mouseX>=150&&mouseX<450&&mouseY>=y&&mouseY<y+56;
    ctx.fillStyle=hover?'rgba(40,46,68,0.85)':'rgba(16,19,29,0.82)';ctx.fillRect(150,y,300,56);
    ctx.fillStyle=accents[i];ctx.fillRect(150,y,4,56);
    ctx.strokeStyle=hover?accents[i]:'rgba(60,68,100,0.9)';ctx.strokeRect(150.5,y+.5,299,55);
    text('['+(i+1)+']',166,y+24,11,'#6b7288');
    text(n,196,y+34,18,hover?accents[i]:'#e8ebf5');
    clickZones.push({x:150,y,w:300,h:56,fn:()=>startVs(i+1)});
  });
  text('esc - back',300,628,11,'#6b7288','center');
}
function drawConfig(){
  text('HANDLING',300,90,40,'#e8ebf5','center');
  ctx.fillStyle='#8fa3ff';ctx.fillRect(258,108,84,3);
  text('tune your piece movement',300,128,12,'#6b7288','center');
  const rows=[
    {l:'DAS',sub:'delay before auto-shift',g:()=>DAS,s:v=>DAS=v,lo:30,hi:200,st:10,u:' ms'},
    {l:'ARR',sub:'auto-shift rate',g:()=>ARR,s:v=>ARR=v,lo:5,hi:100,st:5,u:' ms'}, // ponytail: 5ms floor, effectively instant
    {l:'SOFT DROP',sub:'soft drop speed',g:()=>SOFT,s:v=>SOFT=v,lo:0,hi:200,st:10,u:' ms'},
  ];
  rows.forEach((r,i)=>{
    const y=180+i*88;
    ctx.fillStyle='rgba(16,19,29,0.82)';ctx.fillRect(80,y,440,72);
    ctx.fillStyle='#8fa3ff';ctx.fillRect(80,y,4,72);
    ctx.strokeStyle='rgba(60,68,100,0.9)';ctx.strokeRect(80.5,y+.5,439,71);
    text(r.l,100,y+26,16,'#e8ebf5');
    text(r.sub,100,y+48,11,'#6b7288');
    button(330,y+20,36,32,'-',()=>{r.s(Math.max(r.lo,r.g()-r.st));saveHand();});
    text(r.g()==0?'INSTANT':r.g()+r.u,416,y+42,16,'#e8ebf5','center');
    button(466,y+20,36,32,'+',()=>{r.s(Math.min(r.hi,r.g()+r.st));saveHand();});
  });
  button(220,510,160,36,'esc - back',()=>{state='menu';});
}
function saveHand(){
  try{localStorage.setItem('webtris_handling',JSON.stringify({das:DAS,arr:ARR,soft:SOFT}))}catch(e){}
}
// --- versus helpers ---
function startVs(diff){
  startMode('versus');
  vs={diff,win:false,bot:BotGame(diff),pIn:[],bIn:[]};
}
function vsResolve(atk,inq){ // cancel queued garbage with attack, return leftover
  while(atk>0&&inq.length){
    if(inq[0]<=atk){atk-=inq[0];inq.shift();}
    else{inq[0]-=atk;atk=0;}
  }
  return atk;
}
function addGarbage(n){ // ponytail: hole column re-rolled per row
  for(let i=0;i<n;i++){
    if(board[0].some(c=>c))return gameOver();
    const hole=Math.random()*COLS|0;
    board.shift();
    const row=Array(COLS).fill('G');row[hole]=0;board.push(row);
  }
}
function meter(x,sum){
  if(sum<=0)return;
  const h=Math.min(sum,ROWS)*CELL;
  ctx.fillStyle='#ef4a4a';ctx.fillRect(x,BY+ROWS*CELL-h,6,h);
}
function drawBot(g){
  const bx=370;
  ctx.fillStyle='rgba(13,16,24,0.82)';ctx.fillRect(bx,BY,COLS*CELL,ROWS*CELL);
  ctx.strokeStyle='rgba(60,68,100,0.9)';ctx.strokeRect(bx+.5,BY+.5,COLS*CELL-1,ROWS*CELL-1);
  for(let y=HID;y<ROWS+HID;y++)for(let x=0;x<COLS;x++)
    if(g.board[y][x])block(bx+x*CELL,BY+(y-HID)*CELL,CELL,SHAPES[g.board[y][x]].c);
  if(g.cur)for(let y=0;y<g.cur.m.length;y++)for(let x=0;x<g.cur.m[y].length;x++)
    if(g.cur.m[y][x]&&g.cur.y+y>=HID)block(bx+(g.cur.x+x)*CELL,BY+(g.cur.y+y-HID)*CELL,CELL,SHAPES[g.cur.t].c);
}
function drawPause(){
  ctx.fillStyle='rgba(5,6,10,0.6)';ctx.fillRect(0,0,600,660);
  text('PAUSED',300,260,36,'#e8ebf5','center');
  ctx.fillStyle='#8fa3ff';ctx.fillRect(264,278,72,3);
  button(220,330,160,36,'esc - resume',()=>{state='play';});
  button(220,374,160,36,'r - retry',()=>mode=='versus'?startVs(vs.diff):startMode(mode));
  button(220,418,160,36,'q - quit',()=>{saveBest();state='menu';});
}
function drawOver(){
  ctx.fillStyle='rgba(5,6,10,0.7)';ctx.fillRect(0,0,600,660);
  const isVs=mode=='versus'&&vs;
  const md=MODES[mode];
  const won=isVs?vs.win:(md&&((md.goal&&lines>=md.goal)||mode=='ultra'));
  const accent=won?'#ffd75e':'#ef4a4a';
  text(isVs?(vs.win?'VICTORY':'DEFEAT'):(won?'COMPLETE':'GAME OVER'),300,240,40,accent,'center');
  ctx.fillStyle=accent;ctx.fillRect(264,258,72,3);
  text(isVs?'VS AI - '+DIFF_NAMES[vs.diff-1]:md.label,300,282,12,'#6b7288','center');
  if(isVs||mode=='sprint')text('TIME  '+fmtTime(time),300,330,22,'#e8ebf5','center');
  else text('SCORE  '+score,300,330,22,'#e8ebf5','center');
  text('LINES '+lines+'   PIECES '+pieces,300,360,12,'#9aa1b5','center');
  button(220,400,160,36,'r - retry',()=>isVs?startVs(vs.diff):startMode(mode));
  button(220,444,160,36,'esc - menu',()=>{state='menu';});
}

// --- input ---
const GAMEKEYS=['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space'];
addEventListener('keydown',e=>{
  if(GAMEKEYS.includes(e.code))e.preventDefault();
  if(state=='menu'){
    const i=['Digit1','Digit2','Digit3','Digit4','Digit5','Numpad1','Numpad2','Numpad3','Numpad4','Numpad5'].indexOf(e.code)%5;
    const k=Object.keys(MODES);
    if(i>=0&&k[i]){k[i]=='versus'?state='diff':startMode(k[i]);}
    return;
  }
  if(state=='diff'){
    const i=['Digit1','Digit2','Digit3','Digit4','Digit5','Numpad1','Numpad2','Numpad3','Numpad4','Numpad5'].indexOf(e.code)%5;
    if(i>=0)startVs(i+1);
    if(e.code=='Escape')state='menu';
    return;
  }
  if(state=='config'){
    if(e.code=='Escape')state='menu';
    return;
  }
  if(state=='over'){
    if(e.code=='KeyR')(mode=='versus'?startVs(vs.diff):startMode(mode));
    if(e.code=='Escape')state='menu';
    return;
  }
  if(state=='pause'){
    if(e.code=='Escape')state='play';
    if(e.code=='KeyR')(mode=='versus'?startVs(vs.diff):startMode(mode));
    if(e.code=='KeyQ'){saveBest();state='menu';}
    return;
  }
  keys[e.code]=true;
  if(e.repeat)return;
  if(e.code=='ArrowLeft'){moveDir=-1;dasT=0;arrT=0;tryMove(-1,0);}
  if(e.code=='ArrowRight'){moveDir=1;dasT=0;arrT=0;tryMove(1,0);}
  if(e.code=='KeyZ')rotate(-1);
  if(e.code=='KeyX'||e.code=='ArrowUp')rotate(1);
  if(e.code=='Space')hardDrop();
  if(e.code=='KeyC'||e.code=='ShiftLeft')doHold();
  if(e.code=='KeyR')(mode=='versus'?startVs(vs.diff):startMode(mode));
  if(e.code=='Escape')state='pause';
});
addEventListener('keyup',e=>{
  keys[e.code]=false;
  if(e.code=='ArrowLeft'&&moveDir==-1){
    if(keys['ArrowRight']){moveDir=1;dasT=0;arrT=0;tryMove(1,0);}else moveDir=0;
  }
  if(e.code=='ArrowRight'&&moveDir==1){
    if(keys['ArrowLeft']){moveDir=-1;dasT=0;arrT=0;tryMove(-1,0);}else moveDir=0;
  }
});
cvs.addEventListener('click',e=>{
  const r=cvs.getBoundingClientRect();
  const mx=(e.clientX-r.left)*(cvs.width/r.width);
  const my=(e.clientY-r.top)*(cvs.height/r.height);
  for(const z of clickZones)
    if(mx>=z.x&&mx<z.x+z.w&&my>=z.y&&my<z.y+z.h){z.fn();return;}
});
cvs.addEventListener('mousemove',e=>{
  const r=cvs.getBoundingClientRect();
  mouseX=(e.clientX-r.left)*(cvs.width/r.width);
  mouseY=(e.clientY-r.top)*(cvs.height/r.height);
});
cvs.addEventListener('mouseleave',()=>{mouseX=mouseY=-1;});

let last=performance.now();
function loop(now){
  const dt=Math.min(50,now-last);last=now;
  update(dt);draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
