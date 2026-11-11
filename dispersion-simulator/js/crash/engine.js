/* ======================================================================
   Crash-fault simulator — ENGINE
   Algorithm 1 "Oriented Grid Dispersion with Faulty Robots" (Theorem 4.1).
   Pure logic: no DOM access, so it can be tested with plain Node.js
   (see tests/). The UI reads everything it needs from window.CrashEngine.
   ====================================================================== */
window.CrashEngine = (function () {
const DIR = {N:[-1,0], E:[0,1], S:[1,0], W:[0,-1]};
const OPP = {N:'S', S:'N', E:'W', W:'E'};
const DIRNAME = {N:'North', E:'East', S:'South', W:'West'};
// Port numbering convention used for the oriented grid: ports of a node are numbered
// 1..deg in clockwise order, starting at West, skipping directions that do not exist.
const PORT_ORDER = ['W','N','E','S'];
const CW_DIR  = {TL:'E', TR:'S', BR:'W', BL:'N'};   // boundary walk from a corner to the next corner (clockwise)
const ROW_DIR = {TL:'E', TR:'W', BR:'W', BL:'E'};   // along the horizontal boundary row, towards the middle
const IN_DIR  = {TL:'S', TR:'S', BR:'N', BL:'N'};   // from the boundary row into the grid

function dirsAt(s,r,c){
  return PORT_ORDER.filter(d=>{const nr=r+DIR[d][0], nc=c+DIR[d][1]; return nr>=0&&nr<s&&nc>=0&&nc<s;});
}
function degree(s,r,c){return dirsAt(s,r,c).length;}
function portOf(s,r,c,d){return dirsAt(s,r,c).indexOf(d)+1;}
function minPortDir(s,r,c){return dirsAt(s,r,c)[0];}
function cornerId(s,r,c){
  if(r===0&&c===0)return 'TL'; if(r===0&&c===s-1)return 'TR';
  if(r===s-1&&c===s-1)return 'BR'; if(r===s-1&&c===0)return 'BL'; return null;
}
function inwardDirOfBoundary(s,r,c){
  const ds=dirsAt(s,r,c); const missing=['N','E','S','W'].find(d=>!ds.includes(d)); return OPP[missing];
}
function nodeKind(s,r,c){const g=degree(s,r,c);return g===4?'internal':g===3?'boundary':'corner';}

// Phase windows (the paper's round marks). t = round number, s = sqrt(n)
function phaseList(s){
  const even=(s%2===0), a=[];
  a.push({key:'A', label:'Gather at corners & learn n', start:1, end:3*s, color:'#2563eb', lines:'1–4', bound:'≤ 2√n to reach a corner, +√n to learn √n  →  3√n'});
  if(even){
    a.push({key:'E_REB', label:'Rebalance corners (3 blocks)', start:3*s+1, end:6*s, color:'#f59e0b', lines:'5–6', bound:'≤ 3√n (a robot may pass up to 3 corners)'});
    a.push({key:'E_COL', label:'Walk to column', start:6*s+1, end:6*s+s/2, color:'#10b981', lines:'7', bound:'≤ √n/2'});
    a.push({key:'E_DISP', label:'Disperse inside column', start:6*s+s/2+1, end:7*s, color:'#7c3aed', lines:'13–14', bound:'≤ √n/2'});
  } else {
    const h=Math.ceil(s/2);
    a.push({key:'O_MID', label:'Corners → middle of boundary', start:3*s+1, end:3*s+h, color:'#f59e0b', lines:'9', bound:'≈ √n/2'});
    a.push({key:'O_CENTER', label:'Boundary middle → centre', start:3*s+h+1, end:4*s, color:'#ef4444', lines:'10', bound:'≈ √n/2'});
    a.push({key:'O_CORNER', label:'Centre → one corner', start:4*s+1, end:5*s, color:'#0ea5e9', lines:'11', bound:'√n'});
    a.push({key:'O_COL', label:'Walk to column', start:5*s+1, end:6*s, color:'#10b981', lines:'12', bound:'≤ √n'});
    a.push({key:'O_DISP', label:'Disperse inside column', start:6*s+1, end:7*s, color:'#7c3aed', lines:'13–14', bound:'≤ √n'});
  }
  return a;
}
function phaseAt(t,s){const L=phaseList(s); return L.find(p=>t>=p.start&&t<=p.end)||L[L.length-1];}

const MODE_LABEL = {
  INIT:'start', TO_BOUNDARY:'going straight to boundary', B_SELECT:'on boundary: choose port', PROBE:'probing smallest port',
  RETURN:'stepping back', SLIDE:'sliding along boundary', LEARN_START:'at corner (starting walk)', LEARN_WALK:'walking corner→corner (counting)',
  WAIT_S:'knows √n, waiting for round 3√n', EV_HOLD:'holding at corner', EV_TRANSIT:'extra robot: moving to next corner',
  TO_COL:'walking along boundary to my column', IN_COL:'at my column, waiting', DISP:'walking into the column', SETTLED:'settled (terminated)',
  OD_TO_MID:'corner → boundary middle', OD_AT_MID:'at boundary middle', OD_TO_CENTER:'boundary middle → centre', OD_AT_CENTER:'at centre (rendezvous)',
  OD_AT_CORNER:'at the common corner', CRASHED:'CRASHED'
};

function newRobot(id,r,c){
  return {id,r,c,origin:[r,c],alive:true,crashRound:null,crashAt:null,crashMode:null,mode:'INIT',heading:null,gatherEnd:null,
    s:null,learnSteps:0,hops:0,rank:null,col:null,depth:null,rowDir:null,inDir:null,remainCol:0,remainDepth:0,inStart:0,
    moves:0,settled:false,settleRound:null};
}

function simulate(cfg){
  const S=cfg.s, N=S*S, K=cfg.pos.length, Tmax=7*S, EVEN=(S%2===0);
  const robots=cfg.pos.map((p,i)=>newRobot(i+1,p[0],p[1]));
  const crashEv=(cfg.crashes||[]).map(e=>({id:e.id,round:e.round}));
  const snap=()=>JSON.parse(JSON.stringify(robots));
  const history=[snap()], logs=[null], metrics={moves:[0],msgs:[0]};
  let anomaly=[];
  let terminated=false;

  function cornerCounts(){
    const o={TL:0,TR:0,BL:0,BR:0};
    robots.forEach(rb=>{ if(rb.alive){const c=cornerId(S,rb.r,rb.c); if(c)o[c]++;}});
    return o;
  }

  function decide(rb,t,here){
    const d={dir:null,kind:'',idle:false,text:'',why:'',lines:[],before:rb.mode,
      reads:here.filter(x=>x.id!==rb.id).map(x=>x.id)};
    const gl=(x)=>rb.gatherEnd==='odd'?[11]:x;
    const go=(dir,kind,text,lines,why)=>{d.dir=dir;d.kind=kind;d.text=text;d.lines=lines||[];d.why=why||'';return d;};
    const idle=(kind,text,lines,why)=>{d.idle=true;d.kind=kind;d.text=text;d.lines=lines||[];d.why=why||'';return d;};
    for(let guard=0;guard<12;guard++){
      const dg=degree(S,rb.r,rb.c);
      switch(rb.mode){
        case 'INIT':
          if(dg===4){
            rb.mode='TO_BOUNDARY'; rb.heading=minPortDir(S,rb.r,rb.c);
            return go(rb.heading,'toBoundary',`Internal node (degree 4). My smallest port is ${portOf(S,rb.r,rb.c,rb.heading)} → ${DIRNAME[rb.heading]}. I leave by it and keep going straight.`,gl([1]),
              'Moving in one fixed direction is possible because the grid is oriented; it must reach a degree-3 boundary node within √n−1 rounds.');
          }
          if(dg===3){rb.mode='B_SELECT';continue;}
          rb.mode=(rb.gatherEnd==='odd')?'OD_AT_CORNER':'LEARN_START'; continue;
        case 'TO_BOUNDARY':
          if(dg===4) return go(rb.heading,'toBoundary',`Still inside the grid (degree 4). Enter via a port, leave via the opposite port: straight ${DIRNAME[rb.heading]}.`,gl([1]));
          rb.mode='B_SELECT'; continue;
        case 'B_SELECT': {
          const ds=dirsAt(S,rb.r,rb.c); rb.heading=ds[0]; rb.mode='PROBE';
          return go(rb.heading,'probe',`Boundary node (degree 3). I try my smallest port ${portOf(S,rb.r,rb.c,rb.heading)} → ${DIRNAME[rb.heading]} and look at the node I arrive at.`,[2,3],
            'To reach a corner a robot first needs to know which of its ports run along the boundary.');
        }
        case 'PROBE':
          if(dg===4){
            rb.mode='RETURN'; rb.heading=OPP[rb.heading];
            return go(rb.heading,'ret',`I arrived at a degree-4 node: that port led INTO the grid, not along the boundary. I step back.`,[3],
              'Paper: “Otherwise, the robot comes back to the boundary and selects the smallest port among the other two.”');
          }
          rb.mode='SLIDE'; continue;
        case 'RETURN': {
          const ds=dirsAt(S,rb.r,rb.c); const first=OPP[rb.heading]; const nxt=ds.filter(x=>x!==first)[0];
          rb.heading=nxt; rb.mode='SLIDE';
          return go(nxt,'slide',`Back on the boundary. Smallest port among the other two = ${portOf(S,rb.r,rb.c,nxt)} → ${DIRNAME[nxt]}. Now I slide along the boundary.`,[3]);
        }
        case 'SLIDE':
          if(dg===2){rb.mode=(rb.gatherEnd==='odd')?'OD_AT_CORNER':'LEARN_START'; continue;}
          return go(rb.heading,'slide',`Sliding along the boundary ${DIRNAME[rb.heading]} (straight) until I reach a degree-2 corner.`,[3]);
        case 'LEARN_START': {
          const cid=cornerId(S,rb.r,rb.c); rb.heading=CW_DIR[cid]; rb.learnSteps=0; rb.mode='LEARN_WALK';
          return go(rb.heading,'learn',`I am at corner ${cid} (degree 2). I start walking along the boundary ${DIRNAME[rb.heading]} to the next corner, counting my steps (needs only O(log n) bits).`,[4],
            'The number of edges between two corners is √n−1, so the step count tells me √n and therefore n. Nobody else is involved.');
        }
        case 'LEARN_WALK':
          return go(rb.heading,'learn',`Walking ${DIRNAME[rb.heading]} along the boundary, steps counted so far: ${rb.learnSteps}.`,[4]);
        case 'WAIT_S': {
          const s=rb.s;
          if(t<=3*s) return idle('waitS',`I know √n = ${s} (n = ${s*s}). Round ${t} ≤ 3√n = ${3*s}, so I wait: slower robots may still be walking.`,[4],
              'All robots will certainly be at corners by round 3√n; from round 3√n+1 the next stage begins.');
          rb.mode=(s%2===0)?'EV_HOLD':'OD_START'; continue;
        }
        /* ---------- EVEN n ---------- */
        case 'EV_HOLD': {
          const s=rb.s, q=s*s/4;
          if(t<=6*s){
            const blockStart=((t-3*s-1)%s===0);
            const b=Math.floor((t-3*s-1)/s)+1;
            if(blockStart){
              const rank=here.findIndex(x=>x.id===rb.id); rb.rank=rank;
              const ids=here.map(x=>x.id);
              if(rank<q) return idle('evStay',`Block ${b}/3. ${here.length} robot(s) here, sorted IDs: [${shortIds(ids)}]. I am #${rank+1}; the corner may keep n/4 = ${q}. #${rank+1} ≤ ${q} → I STAY.`,[5,6],
                'Rank is computed only among robots I can actually see, so a crashed robot never blocks anyone.');
              rb.mode='EV_TRANSIT'; rb.heading=CW_DIR[cornerId(S,rb.r,rb.c)];
              return go(rb.heading,'evExtra',`Block ${b}/3. ${here.length} robot(s) here, sorted IDs: [${shortIds(ids)}]. I am #${rank+1} > n/4 = ${q} → I am an EXTRA robot and walk ${DIRNAME[rb.heading]} along the boundary to the next corner.`,[5,6],
                'Corner capacity is n/4, so every corner ends up with ≤ n/4 robots – exactly one quadrant’s worth of nodes.');
            }
            return idle('evWait',`Block ${b}/3: not a decision round. I hold my corner until the next block starts (every block lasts √n = ${s} rounds).`,[6]);
          }
          if(t===6*s+1){rb.mode='COL_START';continue;}
          return idle('evWait','Waiting.',[7]);
        }
        case 'EV_TRANSIT':
          return go(rb.heading,'evTransit',`Extra robot walking ${DIRNAME[rb.heading]} along the boundary toward the next corner.`,[6]);
        case 'COL_START': {
          const s=rb.s, half=s/2, cid=cornerId(S,rb.r,rb.c), c=here.length;
          const rank=here.findIndex(x=>x.id===rb.id); const m=Math.ceil(c/half);
          if(c>s*s/4) anomaly.push(`Round ${t}: corner ${cid} holds ${c} > n/4 robots`);
          rb.rank=rank; rb.col=Math.floor(rank/m); rb.depth=rank%m;
          rb.rowDir=ROW_DIR[cid]; rb.inDir=IN_DIR[cid]; rb.remainCol=rb.col; rb.remainDepth=rb.depth; rb.inStart=6*s+half+1;
          rb.mode='TO_COL'; d.pre=`Corner ${cid} holds c = ${c} robots; the quadrant has √n/2 = ${half} columns, so m = ⌈c/(√n/2)⌉ = ${m} robots per column. My rank is #${rank+1} → column offset ${rb.col}, depth ${rb.depth}. `;
          continue;
        }
        case 'TO_COL':
          if(rb.remainCol>0){
            rb.remainCol--;
            return go(rb.rowDir,'toCol',(d.pre||'')+`Walking ${DIRNAME[rb.rowDir]} along the boundary row to my column (${rb.remainCol} step(s) left after this move).`,[7],
              'Lower ID → nearer column, so robots never cross paths in a way that creates conflicts.');
          }
          rb.mode='IN_COL'; continue;
        case 'IN_COL':
          if(t<rb.inStart) return idle('inCol',`I am at my column (offset ${rb.col}). I wait until round ${rb.inStart} when everybody starts going into the grid.`,[7,13]);
          rb.mode='DISP'; continue;
        case 'DISP':
          if(rb.remainDepth>0){
            rb.remainDepth--;
            return go(rb.inDir,'disp',`Walking ${DIRNAME[rb.inDir]} into my column; depth steps left after this move: ${rb.remainDepth}.`,[13]);
          }
          rb.settled=true; rb.settleRound=t; rb.mode='SETTLED';
          return idle('settle',`I reached depth ${rb.depth} of column offset ${rb.col}. This node is mine alone → I SETTLE and terminate.`,[13,14],
            'Each (column, depth) pair belongs to exactly one rank, so no two robots ever settle on the same node.');
        /* ---------- ODD n ---------- */
        case 'OD_START': {
          const s=rb.s; const cid=cornerId(S,rb.r,rb.c); rb.hops=Math.floor(s/2); rb.heading=minPortDir(S,rb.r,rb.c); rb.mode='OD_TO_MID';
          d.pre=`Round 3√n+1 reached. I am at corner ${cid}; my smallest port leads ${DIRNAME[rb.heading]}. I go ⌊√n/2⌋ = ${rb.hops} hops to the middle of that boundary side. `;
          continue;
        }
        case 'OD_TO_MID':
          if(rb.hops>0){rb.hops--; return go(rb.heading,'odMid',(d.pre||'')+`Walking ${DIRNAME[rb.heading]} (${rb.hops} hop(s) left after this move).`,[9],
              'Because √n is odd, the middle of a side is a unique node.');}
          rb.mode='OD_AT_MID'; continue;
        case 'OD_AT_MID': {
          const s=rb.s, M5=3*s+Math.ceil(s/2);
          if(t<=M5) return idle('odWaitMid',`I am at the middle of a boundary side. Waiting for round ${M5+1} (3.5√n).`,[10]);
          rb.hops=Math.floor(s/2); rb.heading=inwardDirOfBoundary(S,rb.r,rb.c); rb.mode='OD_TO_CENTER'; continue;
        }
        case 'OD_TO_CENTER':
          if(rb.hops>0){rb.hops--; return go(rb.heading,'odCenter',`Turn 90° and walk ${DIRNAME[rb.heading]} into the grid (${rb.hops} hop(s) left after this move) – heading for the unique centre node.`,[10],
              'The centre is equidistant from all corners/sides, so every robot reaches the SAME node without choosing any leader.');}
          rb.mode='OD_AT_CENTER'; continue;
        case 'OD_AT_CENTER': {
          const s=rb.s;
          if(t<=4*s) return idle('odWaitCenter',`I am at the centre node together with ${here.length-1} other robot(s). Waiting for round ${4*s+1} (4√n).`,[10]);
          rb.gatherEnd='odd'; rb.mode='INIT'; continue;
        }
        case 'OD_AT_CORNER': {
          const s=rb.s;
          if(t<=5*s) return idle('odWaitCorner',`I am at the common corner. Waiting for round ${5*s+1} (5√n).`,[11]);
          rb.mode='COL_START_ODD'; continue;
        }
        case 'COL_START_ODD': {
          const s=rb.s, cid=cornerId(S,rb.r,rb.c), c=here.length;
          const rank=here.findIndex(x=>x.id===rb.id); const m=Math.ceil(c/s);
          rb.rank=rank; rb.col=Math.floor(rank/m); rb.depth=rank%m;
          rb.rowDir=ROW_DIR[cid]; rb.inDir=IN_DIR[cid]; rb.remainCol=rb.col; rb.remainDepth=rb.depth; rb.inStart=6*s+1;
          rb.mode='TO_COL'; d.pre=`All ${c} surviving robots are at corner ${cid}. There are √n = ${s} columns, so m = ⌈S/√n⌉ = ${m} robots per column. My rank is #${rank+1} → column offset ${rb.col}, depth ${rb.depth}. `;
          continue;
        }
        default:
          return idle('idle','Nothing to do.',[]);
      }
    }
    return idle('idle','(no action)',[]);
  }
  function shortIds(a){return a.length<=10?a.join(','):a.slice(0,9).join(',')+',… (+'+(a.length-9)+')';}

  for(let t=1;t<=Tmax;t++){
    const log={t,phase:phaseAt(t,S).key,crashes:[],robots:[],events:[],notes:[],moves:0,messages:0,kinds:{}};
    // 1. crashes happen at the start of the round
    crashEv.filter(e=>e.round===t).forEach(e=>{
      const rb=robots[e.id-1];
      if(rb&&rb.alive){
        log.crashes.push({id:rb.id,r:rb.r,c:rb.c,mode:rb.mode,settled:rb.settled,rank:rb.rank,col:rb.col,depth:rb.depth});
        rb.alive=false; rb.crashRound=t; rb.crashAt=[rb.r,rb.c]; rb.crashMode=rb.mode; rb.mode='CRASHED';
      }
    });
    // 2. Communicate: robots see co-located (alive, non-terminated) robots
    const nodes=new Map();
    robots.forEach(rb=>{ if(rb.alive&&!rb.settled){const k=rb.r*S+rb.c; if(!nodes.has(k))nodes.set(k,[]); nodes.get(k).push(rb);} });
    nodes.forEach(list=>{list.sort((a,b)=>a.id-b.id); if(list.length>=2) log.messages+=list.length*(list.length-1);});
    // 3. Compute (all robots decide on the same snapshot)
    const decs=[];
    robots.forEach(rb=>{
      if(!rb.alive||rb.settled)return;
      const here=nodes.get(rb.r*S+rb.c);
      const from=[rb.r,rb.c];
      const d=decide(rb,t,here);
      decs.push({rb,d,from});
    });
    // 4. Move (synchronous)
    decs.forEach(({rb,d})=>{ if(d.dir){rb.r+=DIR[d.dir][0]; rb.c+=DIR[d.dir][1]; rb.moves++; log.moves++;} });
    // 5. Bookkeeping on arrival
    decs.forEach(({rb,d,from})=>{
      if(d.dir){
        if(rb.mode==='LEARN_WALK'){
          rb.learnSteps++;
          if(degree(S,rb.r,rb.c)===2){rb.s=rb.learnSteps+1; rb.mode='WAIT_S';
            log.events.push({type:'learn',id:rb.id,text:`Robot ${rb.id} reached corner ${cornerId(S,rb.r,rb.c)} after ${rb.learnSteps} steps → √n = ${rb.s}, n = ${rb.s*rb.s}.`});}
        }
        if(rb.mode==='EV_TRANSIT' && degree(S,rb.r,rb.c)===2) rb.mode='EV_HOLD';
        if(rb.mode==='TO_BOUNDARY' && degree(S,rb.r,rb.c)<4) rb.mode='B_SELECT';
      }
      log.kinds[d.kind]=(log.kinds[d.kind]||0)+1;
      log.robots.push({id:rb.id,from,to:[rb.r,rb.c],dir:d.dir,kind:d.kind,idle:d.idle,before:d.before,after:rb.mode,text:d.text,why:d.why,lines:d.lines,reads:d.reads});
      if(rb.settled&&rb.settleRound===t) log.events.push({type:'settle',id:rb.id,text:`Robot ${rb.id} settles at (${rb.r},${rb.c}).`});
    });
    if(EVEN && t===6*S){
      const cc=cornerCounts(), q=S*S/4;
      Object.keys(cc).forEach(k=>{ if(cc[k]>q) anomaly.push(`After rebalancing, corner ${k} holds ${cc[k]} > n/4 = ${q}`); });
    }
    log.cornerCounts=cornerCounts();
    history.push(snap()); logs.push(log); metrics.moves.push(log.moves); metrics.msgs.push(log.messages);
    if(robots.every(r=>!r.alive||r.settled)){terminated=true;break;}
  }
  const R=logs.length-1;
  // crash status
  const crashStatus=crashEv.map(e=>{
    const rb=robots[e.id-1];
    if(!rb) return {id:e.id,round:e.round,status:'invalid robot'};
    if(e.round>R) return {id:e.id,round:e.round,status:'ignored (algorithm already terminated)'};
    if(rb.crashRound===e.round) return {id:e.id,round:e.round,status:'applied'};
    return {id:e.id,round:e.round,status:'ignored (robot already crashed)'};
  });
  return {s:S,n:N,k:K,even:EVEN,T:Tmax,R,robots,history,logs,metrics,anomaly,terminated,crashStatus,phases:phaseList(S)};
}

return { CW_DIR, DIR, DIRNAME, IN_DIR, MODE_LABEL, OPP, PORT_ORDER, ROW_DIR, cornerId, degree, dirsAt, inwardDirOfBoundary, minPortDir, newRobot, nodeKind, phaseAt, phaseList, portOf, simulate };
})();
