/* ======================================================================
   Weak Byzantine simulator — ENGINE
   Algorithm 1 extended for weak Byzantine robots (Theorem 4.2).
   Pure logic: no DOM access, so it can be tested with plain Node.js
   (see tests/). The UI reads everything it needs from window.ByzEngine.
   ====================================================================== */
window.ByzEngine = (function () {
const DIR={N:[-1,0],E:[0,1],S:[1,0],W:[0,-1]};
const OPP={N:'S',S:'N',E:'W',W:'E'};
const DIRNAME={N:'North',E:'East',S:'South',W:'West'};
const PORT_ORDER=['W','N','E','S'];           // ports numbered clockwise from West, skipping missing directions
const CW_DIR={TL:'E',TR:'S',BR:'W',BL:'N'};    // boundary walk to the next corner, clockwise
const NEXT_CW={TL:'TR',TR:'BR',BR:'BL',BL:'TL'};
const ROW_DIR={TL:'E',TR:'W',BR:'W',BL:'E'};
const IN_DIR={TL:'S',TR:'S',BR:'N',BL:'N'};
const CORNER_POS=(s,c)=>({TL:[0,0],TR:[0,s-1],BR:[s-1,s-1],BL:[s-1,0]})[c];

function dirsAt(s,r,c){return PORT_ORDER.filter(d=>{const nr=r+DIR[d][0],nc=c+DIR[d][1];return nr>=0&&nr<s&&nc>=0&&nc<s;});}
function degree(s,r,c){return dirsAt(s,r,c).length;}
function portOf(s,r,c,d){return dirsAt(s,r,c).indexOf(d)+1;}
function minPortDir(s,r,c){return dirsAt(s,r,c)[0];}
function cornerId(s,r,c){if(r===0&&c===0)return 'TL';if(r===0&&c===s-1)return 'TR';if(r===s-1&&c===s-1)return 'BR';if(r===s-1&&c===0)return 'BL';return null;}
function inwardDirOfBoundary(s,r,c){const ds=dirsAt(s,r,c);const m=['N','E','S','W'].find(d=>!ds.includes(d));return OPP[m];}
function nodeKind(s,r,c){const g=degree(s,r,c);return g===4?'internal':g===3?'boundary':'corner';}
function rngFn(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ---- Byzantine behaviours (weak Byzantine: arbitrary behaviour, but the ID can never be forged) ----
const STRATS={
  mimic:{label:'Mimic — behaves exactly like a correct robot (indistinguishable)',safe:true,
    info:'Acts and declares exactly like a correct robot. A weak Byzantine robot is allowed to do this; it shows the algorithm cannot (and need not) tell it apart.'},
  liar:{label:'Liar — walks correctly but declares the opposite (STAY↔MOVE)',safe:true,
    info:'Moves like a correct robot but writes the opposite declaration into its memory. Contradicting its own action makes it detectable.'},
  noclaim:{label:'Silent — walks correctly but never declares anything',safe:true,
    info:'Leaves its declaration memory empty. The paper: a robot that does not declare is treated as faulty.'},
  twoface:{label:'Two-faced — shows different declarations to different robots',safe:true,
    info:'Weak Byzantine robots may send different information to different robots. Even-ID observers see the truth, odd-ID observers see the opposite.'},
  stay:{label:'Stationary — never moves, always claims STAY',safe:true,
    info:'Stays on its start node forever. If that node is a corner it takes part in every rank list, otherwise it is simply absent.'},
  overstay:{label:'Over-stayer — freezes at round 3√n+1 and claims STAY',safe:true,
    info:'Behaves correctly while gathering, then ignores every later MOVE order and sits on its corner claiming STAY.'},
  crashlike:{label:'Crash-like — stops moving at round X (param)',safe:true,param:true,
    info:'Behaves correctly until round X, then freezes, keeping its last declaration (a crash that stays visible).'},
  squatter:{label:'Squatter — walks to a correct robot’s slot and sits on it',safe:true,
    info:'Computes the final node of the lowest-ID correct robot at its corner and goes there. Allowed to share a node with a correct robot; dispersion only counts non-Byzantine robots.'},
  randomwalk:{label:'⚠ Random walker — moves randomly every round',safe:false,
    info:'Wanders around the grid with random declarations. May drop onto a corner at the last moment and inflate a count (outside the proof sketch).'},
  wrongway:{label:'⚠ Wrong-way — circles the boundary anticlockwise forever',safe:false,
    info:'After round 3√n it keeps walking the boundary the wrong way, passing corners at arbitrary times.'},
  deserter:{label:'⚠ Deserter — declares STAY, then walks away in the last block',safe:false,
    info:'Declares STAY at the third rebalancing block but walks to the next corner and fills it beyond n/4.'}
};

function phaseList(s){
  const even=(s%2===0),a=[];
  a.push({key:'A',label:'Gather at corners & learn n',start:1,end:3*s,color:'#2563eb',lines:'1–4',bound:'≤ 2√n to reach a corner, +√n to learn √n → 3√n'});
  if(even){
    a.push({key:'E_REB',label:'Rebalance corners (declare → read → walk)',start:3*s+1,end:6*s,color:'#f59e0b',lines:'5–6 (+ Byzantine extension)',bound:'≤ 3√n (3 blocks of √n rounds)'});
    a.push({key:'E_COL',label:'Walk to column',start:6*s+1,end:6*s+s/2,color:'#10b981',lines:'7',bound:'≤ √n/2'});
    a.push({key:'E_DISP',label:'Disperse inside column',start:6*s+s/2+1,end:7*s,color:'#7c3aed',lines:'13–14',bound:'≤ √n/2'});
  }else{
    const h=Math.ceil(s/2);
    a.push({key:'O_MID',label:'Corners → middle of boundary',start:3*s+1,end:3*s+h,color:'#f59e0b',lines:'9',bound:'≈ √n/2'});
    a.push({key:'O_CENTER',label:'Boundary middle → centre',start:3*s+h+1,end:4*s,color:'#ef4444',lines:'10',bound:'≈ √n/2'});
    a.push({key:'O_CORNER',label:'Centre → one corner',start:4*s+1,end:5*s,color:'#0ea5e9',lines:'11',bound:'√n'});
    a.push({key:'O_COL',label:'Walk to column',start:5*s+1,end:6*s,color:'#10b981',lines:'12',bound:'≤ √n'});
    a.push({key:'O_DISP',label:'Disperse inside column',start:6*s+1,end:7*s,color:'#7c3aed',lines:'13–14',bound:'≤ √n'});
  }
  return a;
}
function phaseAt(t,s){const L=phaseList(s);return L.find(p=>t>=p.start&&t<=p.end)||L[L.length-1];}

const MODE_LABEL={
  INIT:'start',TO_BOUNDARY:'going straight to boundary',B_SELECT:'on boundary: choose port',PROBE:'probing smallest port',RETURN:'stepping back',
  SLIDE:'sliding along boundary',LEARN_START:'at corner (starting walk)',LEARN_WALK:'walking corner→corner (counting)',WAIT_S:'knows √n, waiting for round 3√n',
  EV_HOLD:'holding at corner',EV_TRANSIT:'extra robot: moving to next corner',TO_COL:'walking along boundary to my column',IN_COL:'at my column, waiting',
  DISP:'walking into the column',SETTLED:'settled (terminated)',OD_TO_MID:'corner → boundary middle',OD_AT_MID:'at boundary middle',OD_TO_CENTER:'boundary middle → centre',
  OD_AT_CENTER:'at centre (rendezvous)',OD_AT_CORNER:'at the common corner',UNSETTLED:'could NOT settle (no safe slot)'
};

function newRobot(id,r,c){
  return {id,r,c,origin:[r,c],byz:false,strat:null,sparam:null,mode:'INIT',heading:null,gatherEnd:null,s:null,learnSteps:0,hops:0,
    rank:null,col:null,depth:null,rowDir:null,inDir:null,remainCol:0,remainDepth:0,inStart:0,homeCorner:null,
    decl:null,partner:null,F:[],obs:[],detectedBy:[],deviated:false,victim:null,rc:false,moves:0,settled:false,settleRound:null};
}
function finalNodeOf(S,v){
  const cp=CORNER_POS(S,v.homeCorner);
  return [cp[0]+DIR[v.rowDir][0]*v.col+DIR[v.inDir][0]*v.depth, cp[1]+DIR[v.rowDir][1]*v.col+DIR[v.inDir][1]*v.depth];
}
function shortIds(a){return a.length<=10?a.join(','):a.slice(0,9).join(',')+',… (+'+(a.length-9)+')';}

function simulate(cfg){
  const S=cfg.s,N=S*S,K=cfg.pos.length,Tmax=7*S,EVEN=(S%2===0),rnd=rngFn(cfg.seed||1);
  const robots=cfg.pos.map((p,i)=>newRobot(i+1,p[0],p[1]));
  (cfg.byz||[]).forEach(b=>{const r=robots[b.id-1];if(r){r.byz=true;r.strat=b.strat;r.sparam=b.param||null;}});
  const snap=()=>robots.map(r=>{const o=Object.assign({},r);o.memIds=r.obs.reduce((a,x)=>a+x.entries.length,0);delete o.obs;o.F=r.F.slice();o.detectedBy=r.detectedBy.slice();return o;});
  const history=[snap()],logs=[null],metrics={moves:[0],msgs:[0]};
  let curLog=null,quiet=false,terminated=false;
  const notes=[];

  // what robot v shows (in its memory) to robot `viewer` — truthful for correct robots, arbitrary for Byzantine ones
  function shownClaim(v,viewer){
    if(!v.byz) return {decl:v.decl};
    const h=v.decl,flip=h==='STAY'?'MOVE':h==='MOVE'?'STAY':null;
    switch(v.strat){
      case 'liar': return {decl:flip};
      case 'noclaim': return {decl:null};
      case 'twoface': return {decl:(viewer%2===0)?h:flip};
      case 'stay': case 'overstay': case 'wrongway': case 'deserter': return {decl:'STAY'};
      case 'randomwalk': return {decl:v.rc?'STAY':'MOVE'};
      default: return {decl:h};
    }
  }
  function flag(rb,id,why){
    if(quiet||rb.F.includes(id))return;
    rb.F.push(id); const tg=robots[id-1]; if(tg&&!tg.detectedBy.includes(rb.id))tg.detectedBy.push(rb.id);
    if(curLog)curLog.events.push({type:'detect',by:rb.id,target:id,text:`Robot ${rb.id} marks robot ${id} as FAULTY — ${why}.`});
  }
  // verification of the declarations read in the previous block against what robots really did
  function detect(rb,here,t){
    const last=rb.obs[rb.obs.length-1]; if(!last)return;
    const now=cornerId(S,rb.r,rb.c); if(!now)return;
    const ids=new Set(here.map(x=>x.id)),nextC=NEXT_CW[last.corner];
    last.entries.forEach(e=>{
      if(e.id===rb.id)return;
      if(now===last.corner){
        if(e.decl==='STAY'&&!ids.has(e.id))flag(rb,e.id,`it declared STAY at corner ${last.corner} but is no longer here`);
        if(e.decl==='MOVE'&&ids.has(e.id))flag(rb,e.id,`it declared MOVE but is still at corner ${now}`);
      }else if(now===nextC){
        if(e.decl==='MOVE'&&!ids.has(e.id))flag(rb,e.id,`it declared MOVE from ${last.corner} but did not arrive at ${now}`);
        if(e.decl==='STAY'&&ids.has(e.id))flag(rb,e.id,`it declared STAY at ${last.corner} yet appears at ${now}`);
      }
    });
  }

  function decide(rb,t,here){
    const d={dir:null,kind:'',idle:false,text:'',why:'',lines:[],before:rb.mode,reads:here.filter(x=>x.id!==rb.id).map(x=>x.id)};
    const gl=x=>rb.gatherEnd==='odd'?[11]:x;
    const go=(dir,kind,text,lines,why)=>{d.dir=dir;d.kind=kind;d.text=text;d.lines=lines||[];d.why=why||'';return d;};
    const idle=(kind,text,lines,why)=>{d.idle=true;d.kind=kind;d.text=text;d.lines=lines||[];d.why=why||'';return d;};
    for(let guard=0;guard<14;guard++){
      const dg=degree(S,rb.r,rb.c);
      switch(rb.mode){
        case 'INIT':
          if(dg===4){rb.mode='TO_BOUNDARY';rb.heading=minPortDir(S,rb.r,rb.c);
            return go(rb.heading,'toBoundary',`Internal node (degree 4). My smallest port is ${portOf(S,rb.r,rb.c,rb.heading)} → ${DIRNAME[rb.heading]}. I leave by it and keep going straight.`,gl([1]),'Straight movement works because the grid is oriented.');}
          if(dg===3){rb.mode='B_SELECT';continue;}
          rb.mode=(rb.gatherEnd==='odd')?'OD_AT_CORNER':'LEARN_START';continue;
        case 'TO_BOUNDARY':
          if(dg===4)return go(rb.heading,'toBoundary',`Still inside the grid (degree 4): straight ${DIRNAME[rb.heading]}.`,gl([1]));
          rb.mode='B_SELECT';continue;
        case 'B_SELECT':{const ds=dirsAt(S,rb.r,rb.c);rb.heading=ds[0];rb.mode='PROBE';
          return go(rb.heading,'probe',`Boundary node (degree 3). I try my smallest port ${portOf(S,rb.r,rb.c,rb.heading)} → ${DIRNAME[rb.heading]} and look at the node I reach.`,[2,3]);}
        case 'PROBE':
          if(dg===4){rb.mode='RETURN';rb.heading=OPP[rb.heading];
            return go(rb.heading,'ret','That port led INTO the grid (degree-4 neighbour). I step back.',[3]);}
          rb.mode='SLIDE';continue;
        case 'RETURN':{const ds=dirsAt(S,rb.r,rb.c),first=OPP[rb.heading],nxt=ds.filter(x=>x!==first)[0];rb.heading=nxt;rb.mode='SLIDE';
          return go(nxt,'slide',`Back on the boundary: smallest of the other ports = ${portOf(S,rb.r,rb.c,nxt)} → ${DIRNAME[nxt]}. Sliding.`,[3]);}
        case 'SLIDE':
          if(dg===2){rb.mode=(rb.gatherEnd==='odd')?'OD_AT_CORNER':'LEARN_START';continue;}
          return go(rb.heading,'slide',`Sliding ${DIRNAME[rb.heading]} along the boundary until a degree-2 corner.`,[3]);
        case 'LEARN_START':{const cid=cornerId(S,rb.r,rb.c);rb.heading=CW_DIR[cid];rb.learnSteps=0;rb.mode='LEARN_WALK';
          return go(rb.heading,'learn',`At corner ${cid}. I walk ${DIRNAME[rb.heading]} to the next corner counting steps (O(log n) bits).`,[4],'√n−1 edges between corners ⇒ I learn √n and n.');}
        case 'LEARN_WALK':return go(rb.heading,'learn',`Walking ${DIRNAME[rb.heading]}, steps counted: ${rb.learnSteps}.`,[4]);
        case 'WAIT_S':{const s=rb.s;
          if(t<=3*s)return idle('waitS',`I know √n = ${s}. Waiting for round 3√n = ${3*s} (others may still be walking).`,[4]);
          rb.mode=(s%2===0)?'EV_HOLD':'OD_START';continue;}
        /* ======== EVEN n : Byzantine-aware rebalancing ======== */
        case 'EV_HOLD':{
          const s=rb.s,q=s*s/4;
          if(t<=6*s){
            const off=(t-3*s-1)%s,b=Math.floor((t-3*s-1)/s)+1,cid=cornerId(S,rb.r,rb.c);
            if(off===0){ // DECLARE round
              if(b>1)detect(rb,here,t);
              const rank=here.findIndex(x=>x.id===rb.id);rb.rank=rank;
              let why;
              if(rank<q){rb.decl='STAY';rb.partner=null;why=`rank #${rank+1} ≤ n/4 = ${q} → STAY`;}
              else{const p=here[rank-q];rb.partner=p.id;rb.decl='MOVE';why=`rank #${rank+1} > n/4 = ${q} → I am an extra robot: MOVE to the next corner`;}
              return idle('evDeclare',`Block ${b}/3 · DECLARE. Robots here (IDs cannot be forged): [${shortIds(here.map(x=>x.id))}]. ${why}. I write “${rb.decl}” into my memory.`,[5,6],'Ranks use every robot present (correct or not), so all correct robots at this node agree on them.');
            }
            if(off===1){ // READ + move round
              const entries=here.filter(x=>x.id!==rb.id).map(v=>({id:v.id,decl:shownClaim(v,rb.id).decl}));
              entries.forEach(e=>{if(e.decl===null)flag(rb,e.id,'it declared nothing (a correct robot always declares)');});
              rb.obs.push({t,corner:cid,entries});
              const bad=entries.filter(e=>rb.F.includes(e.id)).map(e=>e.id);
              if(rb.decl==='MOVE'){rb.mode='EV_TRANSIT';rb.heading=CW_DIR[cid];
                return go(rb.heading,'evExtra',`Block ${b}/3 · READ+MOVE. I read ${entries.length} declaration(s) and remember these IDs (O(n log n) memory). My declaration is MOVE → I walk ${DIRNAME[rb.heading]} to the next corner.${bad.length?' Known faulty here: ['+bad.join(',')+'].':''}`,[6]);}
              return idle('evStay',`Block ${b}/3 · READ. I read ${entries.length} declaration(s) and remember these IDs. I declared STAY, so I stay.${bad.length?' Known faulty here: ['+bad.join(',')+'].':''}`,[6]);
            }
            return idle('evWait',`Block ${b}/3: extras are walking; I hold my corner until the next declare round (round ${3*s+b*s+1}).`,[6]);
          }
          if(t===6*s+1){detect(rb,here,t);rb.mode='COL_START';continue;}
          return idle('evWait','Waiting.',[7]);}
        case 'EV_TRANSIT':return go(rb.heading,'evTransit',`Walking ${DIRNAME[rb.heading]} to the next corner.`,[6]);
        case 'COL_START':{
          const s=rb.s,half=s/2,q=s*s/4,cid=cornerId(S,rb.r,rb.c),c=here.length,rank=here.findIndex(x=>x.id===rb.id);
          let slot=null,m,why;
          if(c<=q){m=Math.ceil(c/half);slot=rank;why=`c = ${c} ≤ n/4 = ${q}: m = ⌈c/(√n/2)⌉ = ${m} per column`;}
          else{m=half;
            if(rank<q){slot=rank;why=`c = ${c} > n/4: corner holds ${c-q} robot(s) too many (some are faulty). Slots are numbered 0…${q-1}; mine is #${rank}`;}
            else{const p=here[rank-q];
              if(rb.F.includes(p.id)){slot=rank-q;why=`c = ${c} > n/4. I am rank #${rank+1}; I know robot ${p.id} is faulty, so I take ITS slot #${slot} (a correct robot never shares with a correct robot)`;}
              else{why=`c = ${c} > n/4, I am rank #${rank+1} and my partner robot ${p.id} is not known to be faulty`;}}}
          rb.rank=rank;rb.homeCorner=cid;
          if(slot===null){rb.mode='UNSETTLED';return idle('unsettled',`${why}. I cannot safely settle here (paper: “r_u does not settle”). Dispersion guarantee not met for me.`,[7]);}
          rb.col=Math.floor(slot/m);rb.depth=slot%m;rb.rowDir=ROW_DIR[cid];rb.inDir=IN_DIR[cid];rb.remainCol=rb.col;rb.remainDepth=rb.depth;rb.inStart=6*s+half+1;rb.mode='TO_COL';
          d.pre=`Corner ${cid}: ${why}. Slot #${slot} → column offset ${rb.col}, depth ${rb.depth}. `;continue;}
        case 'TO_COL':
          if(rb.remainCol>0){rb.remainCol--;return go(rb.rowDir,'toCol',(d.pre||'')+`Walking ${DIRNAME[rb.rowDir]} along the boundary row (${rb.remainCol} step(s) left after this).`,[7]);}
          rb.mode='IN_COL';continue;
        case 'IN_COL':
          if(t<rb.inStart)return idle('inCol',`At my column (offset ${rb.col}). Waiting for round ${rb.inStart}.`,[7,13]);
          rb.mode='DISP';continue;
        case 'DISP':
          if(rb.remainDepth>0){rb.remainDepth--;return go(rb.inDir,'disp',`Walking ${DIRNAME[rb.inDir]} into my column (${rb.remainDepth} step(s) left after this).`,[13]);}
          rb.settled=true;rb.settleRound=t;rb.mode='SETTLED';
          return idle('settle',`Depth ${rb.depth} of column offset ${rb.col} reached. My slot is unique among correct robots → I SETTLE and terminate.`,[13,14]);
        case 'UNSETTLED':return idle('unsettled','Still without a safe slot.',[7]);
        /* ======== ODD n : Algorithm 1 exactly ======== */
        case 'OD_START':{const s=rb.s,cid=cornerId(S,rb.r,rb.c);rb.hops=Math.floor(s/2);rb.heading=minPortDir(S,rb.r,rb.c);rb.mode='OD_TO_MID';
          d.pre=`Round 3√n+1. At corner ${cid}, smallest port → ${DIRNAME[rb.heading]}; I go ⌊√n/2⌋ = ${rb.hops} hops to the middle of that side. `;continue;}
        case 'OD_TO_MID':
          if(rb.hops>0){rb.hops--;return go(rb.heading,'odMid',(d.pre||'')+`Walking ${DIRNAME[rb.heading]} (${rb.hops} hop(s) left after this).`,[9]);}
          rb.mode='OD_AT_MID';continue;
        case 'OD_AT_MID':{const s=rb.s,M5=3*s+Math.ceil(s/2);
          if(t<=M5)return idle('odWaitMid',`At the middle of a boundary side. Waiting for round ${M5+1}.`,[10]);
          rb.hops=Math.floor(s/2);rb.heading=inwardDirOfBoundary(S,rb.r,rb.c);rb.mode='OD_TO_CENTER';continue;}
        case 'OD_TO_CENTER':
          if(rb.hops>0){rb.hops--;return go(rb.heading,'odCenter',`Turn 90° and walk ${DIRNAME[rb.heading]} into the grid (${rb.hops} hop(s) left after this) → the unique centre.`,[10],'The centre is a PLACE, not a robot — no leader, so Byzantine robots cannot block the rendezvous.');}
          rb.mode='OD_AT_CENTER';continue;
        case 'OD_AT_CENTER':{const s=rb.s;
          if(t<=4*s)return idle('odWaitCenter',`At the centre with ${here.length-1} other robot(s). Waiting for round ${4*s+1}.`,[10]);
          rb.gatherEnd='odd';rb.mode='INIT';continue;}
        case 'OD_AT_CORNER':{const s=rb.s;
          if(t<=5*s)return idle('odWaitCorner',`At the common corner. Waiting for round ${5*s+1}.`,[11]);
          rb.mode='COL_START_ODD';continue;}
        case 'COL_START_ODD':{const s=rb.s,cid=cornerId(S,rb.r,rb.c),c=here.length,rank=here.findIndex(x=>x.id===rb.id),m=Math.ceil(c/s);
          rb.rank=rank;rb.col=Math.floor(rank/m);rb.depth=rank%m;rb.homeCorner=cid;rb.rowDir=ROW_DIR[cid];rb.inDir=IN_DIR[cid];rb.remainCol=rb.col;rb.remainDepth=rb.depth;rb.inStart=6*s+1;rb.mode='TO_COL';
          d.pre=`All ${c} robots present at corner ${cid} (IDs unforgeable; Byzantine ones included). m = ⌈S/√n⌉ = ${m}. My rank #${rank+1} → column offset ${rb.col}, depth ${rb.depth}. `;continue;}
        default:return idle('idle','Nothing to do.',[]);
      }
    }
    return idle('idle','(no action)',[]);
  }

  // ---- behaviour of Byzantine robots: run the correct algorithm on a shadow copy, then deviate ----
  function walkToward(rb,tg){if(rb.r!==tg[0])return rb.r<tg[0]?'S':'N';if(rb.c!==tg[1])return rb.c<tg[1]?'E':'W';return null;}
  function byzDecide(rb,t,here){
    quiet=true;
    const clone=JSON.parse(JSON.stringify(rb));
    // `here` holds live robots, the clone only needs their IDs and claims
    const intended=decide(clone,t,here);
    quiet=false;
    const out={dir:null,kind:'byz',idle:false,text:'',why:'',lines:[],before:rb.mode,reads:intended.reads,intended:{dir:intended.dir,text:intended.text}};
    const adopt=()=>{Object.assign(rb,clone);out.dir=intended.dir;};
    const strat=rb.strat,X=rb.sparam;
    let say='';
    switch(strat){
      case 'mimic':case 'liar':case 'noclaim':case 'twoface':adopt();say='follows the correct algorithm for its movement';break;
      case 'stay':out.dir=null;say='never moves';break;
      case 'crashlike':{const lim=X||(3*S+1);if(t<lim){adopt();say='still correct';}else{out.dir=null;say=`stopped moving at round ${lim}`;}break;}
      case 'overstay':if(t<=3*S){adopt();say='correct so far';}else{out.dir=null;say='ignores every order since round 3√n+1';}break;
      case 'randomwalk':{const ds=dirsAt(S,rb.r,rb.c);out.dir=ds[Math.floor(rnd()*ds.length)];rb.rc=rnd()<.5;say='moves randomly';break;}
      case 'wrongway':
        if(t<=3*S){adopt();say='correct so far';}
        else{const dg=degree(S,rb.r,rb.c),cid=cornerId(S,rb.r,rb.c);
          if(cid){rb.heading=dirsAt(S,rb.r,rb.c).filter(x=>x!==CW_DIR[cid])[0];}
          else if(!rb.heading||dg===4){rb.heading=null;}
          out.dir=rb.heading;say='circles the boundary anticlockwise';}
        break;
      case 'squatter':
        if(rb.deviated){const v=robots[rb.victim-1];
          if(v&&v.col!==null&&v.homeCorner){out.dir=walkToward(rb,finalNodeOf(S,v));say=`walks to robot ${v.id}’s final node`;}else{out.dir=null;say='waits for its victim’s slot';}}
        else{adopt();
          if(['TO_COL','IN_COL'].includes(rb.mode)){const vs=here.filter(x=>!x.byz).sort((a,b)=>a.id-b.id);
            if(vs.length){rb.victim=vs[0].id;rb.deviated=true;out.dir=null;say=`chose robot ${rb.victim}’s slot as its target`;}else say='no victim here';}
          else say='correct so far';}
        break;
      case 'deserter':
        adopt();say='follows the correct algorithm';
        if(EVEN&&t===5*S+2&&rb.mode==='EV_HOLD'&&rb.decl==='STAY'){const cid=cornerId(S,rb.r,rb.c);rb.mode='EV_TRANSIT';rb.heading=CW_DIR[cid];out.dir=rb.heading;say='declared STAY but DESERTS to the next corner';}
        break;
      default:adopt();
    }
    const cl=shownClaim(rb,2),cl2=shownClaim(rb,1);
    out.claim=(strat==='twoface')?`even-ID robots see “${cl.decl}”, odd-ID robots see “${cl2.decl}”`:(cl.decl===null?'nothing (empty memory)':`“${cl.decl}”`);
    out.deviates=(out.dir!==intended.dir)||(['liar','noclaim','twoface'].includes(strat)&&rb.decl!==null);
    out.truthDecl=rb.decl;
    out.text=`Byzantine [${strat}] ${say}. Correct robot would: ${intended.text||'wait'} Shown to others: ${out.claim}.`;
    out.say=say;
    return out;
  }

  for(let t=1;t<=Tmax;t++){
    const log={t,phase:phaseAt(t,S).key,crashes:[],robots:[],events:[],notes:[],moves:0,messages:0,kinds:{},byz:[]};
    curLog=log;
    const nodes=new Map();
    robots.forEach(rb=>{if(!rb.settled||rb.byz){const k=rb.r*S+rb.c;if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(rb);}});
    nodes.forEach(list=>{list.sort((a,b)=>a.id-b.id);if(list.length>=2)log.messages+=list.length*(list.length-1);});
    const decs=[];
    robots.forEach(rb=>{
      if(rb.settled&&!rb.byz)return;
      const here=nodes.get(rb.r*S+rb.c),from=[rb.r,rb.c];
      const d=rb.byz?byzDecide(rb,t,here):decide(rb,t,here);
      decs.push({rb,d,from});
    });
    decs.forEach(({rb,d})=>{if(d.dir){rb.r+=DIR[d.dir][0];rb.c+=DIR[d.dir][1];rb.moves++;log.moves++;}});
    decs.forEach(({rb,d,from})=>{
      if(d.dir){
        if(rb.mode==='LEARN_WALK'){rb.learnSteps++;
          if(degree(S,rb.r,rb.c)===2){rb.s=rb.learnSteps+1;rb.mode='WAIT_S';
            if(!rb.byz)log.events.push({type:'learn',id:rb.id,text:`Robot ${rb.id} reached corner ${cornerId(S,rb.r,rb.c)} after ${rb.learnSteps} steps → √n = ${rb.s}, n = ${rb.s*rb.s}.`});}}
        if(rb.mode==='EV_TRANSIT'&&degree(S,rb.r,rb.c)===2)rb.mode='EV_HOLD';
        if(rb.mode==='TO_BOUNDARY'&&degree(S,rb.r,rb.c)<4)rb.mode='B_SELECT';
      }
      log.kinds[rb.byz?'byz':d.kind]=(log.kinds[rb.byz?'byz':d.kind]||0)+1;
      const entry={id:rb.id,byz:rb.byz,strat:rb.strat,from,to:[rb.r,rb.c],dir:d.dir,kind:d.kind,idle:d.idle,before:d.before,after:rb.mode,text:d.text,why:d.why,lines:d.lines||[],reads:d.reads};
      if(rb.byz){entry.intended=d.intended;entry.claim=d.claim;entry.say=d.say;entry.deviates=d.deviates;log.byz.push(entry);}
      log.robots.push(entry);
      if(rb.settled&&rb.settleRound===t&&!rb.byz)log.events.push({type:'settle',id:rb.id,text:`Robot ${rb.id} settles at (${rb.r},${rb.c}).`});
    });
    history.push(snap());logs.push(log);metrics.moves.push(log.moves);metrics.msgs.push(log.messages);
    if(robots.every(r=>r.byz||r.settled||r.mode==='UNSETTLED')){terminated=true;break;}
  }
  const R=logs.length-1;
  const nf=robots.filter(r=>!r.byz);
  const allSettled=nf.every(r=>r.settled);
  const occ=new Map();nf.forEach(r=>{const k=r.r*S+r.c;occ.set(k,(occ.get(k)||0)+1);});
  const dispersion=[...occ.values()].every(v=>v<=1);
  const maxMem=Math.max(0,...history[R].filter(r=>!r.byz).map(r=>r.memIds));
  return {s:S,n:N,k:K,even:EVEN,T:Tmax,R,robots,history,logs,metrics,terminated,allSettled,dispersion,success:allSettled&&dispersion,maxMem,phases:phaseList(S),byz:(cfg.byz||[])};
}

return { CORNER_POS, CW_DIR, DIR, DIRNAME, IN_DIR, MODE_LABEL, NEXT_CW, OPP, PORT_ORDER, ROW_DIR, STRATS, cornerId, degree, dirsAt, finalNodeOf, inwardDirOfBoundary, minPortDir, newRobot, nodeKind, phaseAt, phaseList, portOf, rngFn, shortIds, simulate };
})();
