/* ======================================================================
   Crash-fault simulator — USER INTERFACE
   SVG grid, playback controls, explanation / complexity / results panels.
   Depends on: js/crash/engine.js (window.CrashEngine).
   ====================================================================== */
window.CrashSim = (function () {
const { DIR, DIRNAME, MODE_LABEL, cornerId, degree, dirsAt, nodeKind, phaseAt, simulate } = window.CrashEngine;
let active = false, onKey = null;

// ---------------------------------------------------------------------------
// UI: SVG grid, playback controls, explanation / complexity / results panels.
// ---------------------------------------------------------------------------
// ============================================================================
//  UI
// ============================================================================
const $=id=>document.getElementById(id);
const App={s:4,k:16,seed:1+Math.floor(Math.random()*999983),crashes:[],sim:null,t:0,playing:false,speed:1,timer:null,sel:null,
  opts:{ports:true,coords:true,quad:true,arrows:true},selNode:null};
const G=90, M=62;                      // grid spacing and margin in SVG units
const xOf=c=>M+c*G, yOf=r=>M+r*G;
const hue=id=>(id*47)%360;
function rng(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const pad=(a)=>a.length>8?a.slice(0,7).join(', ')+', … (+'+(a.length-7)+')':a.join(', ');

/* ---------- setup ---------- */
function makePlacement(){
  // Every robot starts on a uniformly random node; the same random scenario is kept until "Generate new random scenario".
  const s=App.s,k=App.k,R=rng(App.seed*1013+s*7+k),pos=[];
  for(let i=0;i<k;i++)pos.push([Math.floor(R()*s),Math.floor(R()*s)]);
  return pos;
}
/* ---------- build ---------- */
function rebuild(keepT){
  const pos=makePlacement();
  App.sim=simulate({s:App.s,pos,crashes:App.crashes});
  buildSVG();
  buildTimeline();
  buildRoundsList();
  buildAbout();
  const R=App.sim.R;
  App.t=keepT?Math.min(App.t,R):0;
  $('scrub').max=R;
  renderCrashList();
  setRound(App.t,true);
}

function buildSVG(){
  const sim=App.sim,s=sim.s,W=M*2+(s-1)*G;
  let h=`<svg id="svg" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">
  <defs><marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#ea580c"/></marker></defs>`;
  // quadrant / centre guide
  h+=`<g id="guide">`;
  if(sim.even){
    const hf=s/2, qc=['#dbeafe','#dcfce7','#fef9c3','#fce7f3'];
    const rects=[[0,0,'TL'],[0,hf,'TR'],[hf,0,'BL'],[hf,hf,'BR']];
    rects.forEach((q,i)=>{
      const x0=xOf(q[1])-G/2, y0=yOf(q[0])-G/2;
      h+=`<rect x="${x0}" y="${y0}" width="${hf*G}" height="${hf*G}" fill="${qc[i]}" opacity=".55" rx="6"/>`;
      h+=`<text x="${x0+8}" y="${y0+14}" font-size="11" fill="#475569" font-weight="700">quadrant of ${q[2]} (√n/2 × √n/2)</text>`;
    });
  } else {
    const m=(s-1)/2;
    h+=`<circle cx="${xOf(m)}" cy="${yOf(m)}" r="30" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="5 4"/>
        <text x="${xOf(m)+34}" y="${yOf(m)-30}" font-size="11" fill="#b91c1c" font-weight="700">unique centre</text>`;
    [[0,m],[s-1,m],[m,0],[m,s-1]].forEach(p=>{h+=`<rect x="${xOf(p[1])-14}" y="${yOf(p[0])-14}" width="28" height="28" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3 3" rx="6"/>`;});
  }
  h+=`</g><g id="edges">`;
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){
    if(c+1<s)h+=`<line class="edge" id="e-${r}-${c}-${r}-${c+1}" x1="${xOf(c)}" y1="${yOf(r)}" x2="${xOf(c+1)}" y2="${yOf(r)}"/>`;
    if(r+1<s)h+=`<line class="edge" id="e-${r}-${c}-${r+1}-${c}" x1="${xOf(c)}" y1="${yOf(r)}" x2="${xOf(c)}" y2="${yOf(r+1)}"/>`;
  }
  h+=`</g><g id="nodes">`;
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){
    const x=xOf(c),y=yOf(r),cid=cornerId(s,r,c);
    h+=`<g data-r="${r}" data-c="${c}"><circle class="nodedot${cid?' corner':''}" cx="${x}" cy="${y}" r="13"/>`;
    if(cid)h+=`<text class="cornertag" x="${x+(c===0?-34:34)}" y="${y+(r===0?-18:26)}" text-anchor="middle">${cid}</text>`;
    h+=`<circle class="nodehit" cx="${x}" cy="${y}" r="26" data-r="${r}" data-c="${c}"/></g>`;
  }
  h+=`</g><g id="labels"></g><g id="arrows"></g><g id="robots">`;
  sim.robots.forEach(rb=>{
    h+=`<g class="rb" id="rb${rb.id}" data-id="${rb.id}"><circle class="chip" r="9" fill="hsl(${hue(rb.id)},65%,48%)"/><text>${rb.id}</text></g>`;
  });
  h+=`</g><g id="ghosts"></g><g id="badges"></g></svg>`;
  $('svgbox').innerHTML=h;
  // static labels (ports + coordinates)
  let lb='';
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){
    const x=xOf(c),y=yOf(r);
    dirsAt(s,r,c).forEach((d,i)=>{
      lb+=`<text class="port" data-lab="port" x="${x+DIR[d][1]*25}" y="${y+DIR[d][0]*25+3}" text-anchor="middle">${i+1}</text>`;
    });
    lb+=`<text class="coord" data-lab="coord" x="${x+17}" y="${y+36}">(${r},${c})</text>`;
  }
  $('labels').innerHTML=lb;
  applyDisplayOpts();
  $('svgbox').onclick=ev=>{
    const g=ev.target.closest('.rb'); if(g){App.sel=+g.dataset.id;App.selNode=null;renderSel();renderRobotsTab();return;}
    const n=ev.target.closest('.nodehit'); if(n){App.selNode=[+n.dataset.r,+n.dataset.c];App.sel=null;renderSel();renderRobotsTab();}
  };
}
function applyDisplayOpts(){
  const o=App.opts;
  document.querySelectorAll('[data-lab=port]').forEach(e=>e.style.display=o.ports?'':'none');
  document.querySelectorAll('[data-lab=coord]').forEach(e=>e.style.display=o.coords?'':'none');
  const gd=$('guide'); if(gd)gd.style.display=o.quad?'':'none';
  const ar=$('arrows'); if(ar)ar.style.display=o.arrows?'':'none';
  document.querySelectorAll('.edge.hot').forEach(e=>{e.style.stroke=o.arrows?'':'#93a4c3';e.style.strokeWidth=o.arrows?'':'2.2';});
}

function buildTimeline(){
  const sim=App.sim,tot=sim.T;
  let h='';
  sim.phases.forEach(p=>{
    const w=(p.end-p.start+1)/tot*100;
    h+=`<div class="seg" style="width:${w}%;background:${p.color}" title="${p.label}: rounds ${p.start}–${p.end}">${w>9?p.label:''}</div>`;
  });
  h+=`<div class="cursor" id="tcur" style="left:0"></div>`;
  $('timeline').innerHTML=h;
}

/* ---------- rendering of one round ---------- */
function setRound(t,force){
  const sim=App.sim; t=Math.max(0,Math.min(sim.R,t)); App.t=t;
  $('scrub').value=t;
  $('roundlabel').textContent=`Round ${t} / ${sim.R}`;
  $('tcur').style.left=`calc(${t/sim.T*100}% - 1px)`;
  const dur=App.playing?Math.min(.7,.8/App.speed):.25;
  $('svgbox').style.setProperty('--dur',dur+'s');
  updateGrid(t);
  renderExplain(t);
  renderRobotsTab();
  renderSel();
  markRoundsList();
  renderCx();
  renderResults();
}
function clusterOffsets(m){
  const cols=Math.ceil(Math.sqrt(m)),rows=Math.ceil(m/cols),sp=18,a=[];
  for(let i=0;i<m;i++){a.push([(i%cols-(cols-1)/2)*sp,(Math.floor(i/cols)-(rows-1)/2)*sp]);}
  return a;
}
function updateGrid(t){
  const sim=App.sim,s=sim.s,snap=sim.history[t],log=sim.logs[t];
  const byNode=new Map();
  snap.forEach(rb=>{if(!rb.alive)return;const k=rb.r*s+rb.c;if(!byNode.has(k))byNode.set(k,[]);byNode.get(k).push(rb);});
  let badges='';
  const placed=new Set();
  byNode.forEach((list,k)=>{
    list.sort((a,b)=>a.id-b.id);
    const r=Math.floor(k/s),c=k%s,x=xOf(c),y=yOf(r),show=Math.min(list.length,16);
    const offs=clusterOffsets(show);
    list.forEach((rb,i)=>{
      const el=$('rb'+rb.id); placed.add(rb.id);
      if(i<show){el.style.display='';el.style.transform=`translate(${x+offs[i][0]}px,${y+offs[i][1]}px)`;}
      else{el.style.display='none';}
      el.classList.toggle('settled',!!rb.settled); el.classList.toggle('sel',App.sel===rb.id);
    });
    if(list.length>show){badges+=`<g class="badgeN"><title>${list.length-show} more robots hidden on this node</title><rect x="${x+8}" y="${y-30}" width="32" height="15" rx="7.5"/><text x="${x+24}" y="${y-22.5}">+${list.length-show}</text></g>`;}
  });
  let ghosts='';
  snap.forEach(rb=>{
    if(!rb.alive){
      const el=$('rb'+rb.id); el.style.display='none';
      const p=rb.crashAt; ghosts+=`<g class="ghost" transform="translate(${xOf(p[1])-18},${yOf(p[0])-18})"><text class="x">✖</text><text class="gid" y="12">#${rb.id}</text></g>`;
    }
  });
  $('ghosts').innerHTML=ghosts; $('badges').innerHTML=badges;
  // hot edges & arrows for the round that just happened
  document.querySelectorAll('.edge.hot').forEach(e=>{e.classList.remove('hot');e.style.stroke='';e.style.strokeWidth='';});
  let ar=''; const seen=new Set();
  if(log){
    log.robots.forEach(rb=>{
      if(!rb.dir)return;
      const [r1,c1]=rb.from,[r2,c2]=rb.to,key=`${r1},${c1}>${r2},${c2}`;
      const eid=(r1<r2||c1<c2)?`e-${r1}-${c1}-${r2}-${c2}`:`e-${r2}-${c2}-${r1}-${c1}`;
      const e=$(eid); if(e)e.classList.add('hot');
      if(!seen.has(key)){seen.add(key);
        const x1=xOf(c1),y1=yOf(r1),x2=xOf(c2),y2=yOf(r2);
        ar+=`<line class="arrow" x1="${x1+(x2-x1)*.28}" y1="${y1+(y2-y1)*.28}" x2="${x1+(x2-x1)*.72}" y2="${y1+(y2-y1)*.72}" marker-end="url(#ah)"/>`;}
    });
  }
  $('arrows').innerHTML=ar;
  applyDisplayOpts();
}

/* ---------- explanation ---------- */
const ALGO=[
 'Input: square grid n = √n × √n, f ≤ n faulty robots, arbitrary placement',
 '1  Each robot r_u (with degree 4) reaches the boundary (degree 3) by moving in a straight line;      // O(√n)',
 '2  if r_u is placed at a boundary node then',
 '3      r_u moves to the nearest corner (degree 2);                                                   // O(√n)',
 '4  Each robot r_u moves from one corner to another corner and learns √n, hence n;                    // O(√n)',
 '5  if n is even then',
 '6      n/4 lower-ID robots stay at their corner, the rest move to another corner;                    // O(√n)',
 '7      after 6√n rounds, from a corner with C_r robots, 2C_r/√n robots move into each column (√n/2)',
 '8  if n is odd then',
 '9      after 3√n rounds, corner robots move to the middle of the boundary (⌊√n/2⌋ hops);           // O(√n)',
 '10     after 3.5√n rounds, robots at the boundary middle move ⌊√n/2⌋ hops at 90° to the centre;     // O(√n)',
 '11     after 4√n rounds, the robots at the centre move together to a corner;',
 '12     after 5√n rounds, from the single corner with S_r robots, S_r/√n robots move into each column',
 '13 Each column disperses its robots (lower ID → nearer to the boundary);                              // O(√n)',
 '14 All the robots settle at a unique node.'
];
function algoHTML(lines){
  const hl=new Set(lines);
  return '<pre class="algo">'+ALGO.map((l,i)=>`<div class="${(i>0&&hl.has(i))?'hl':''}">${l.replace(/</g,'&lt;')}</div>`).join('')+'</pre>';
}
const KIND_TXT={
  toBoundary:n=>`<b>${n}</b> robot(s) on <b>internal nodes</b> (degree 4) walk <b>straight</b> toward the boundary using their smallest port.`,
  probe:n=>`<b>${n}</b> robot(s) on <b>boundary nodes</b> (degree 3) try their smallest port and look at the node they arrive at.`,
  ret:n=>`<b>${n}</b> robot(s) discovered that port led <b>into</b> the grid (a degree-4 neighbour) and step back.`,
  slide:n=>`<b>${n}</b> robot(s) <b>slide along the boundary</b> toward a corner.`,
  learn:n=>`<b>${n}</b> robot(s) <b>walk from their corner to the next corner</b>, counting steps (this is how √n, and so n, is learned).`,
  waitS:n=>`<b>${n}</b> robot(s) already know √n and <b>wait</b> for round 3√n (the others may still be walking).`,
  evStay:n=>`<b>${n}</b> robot(s) are among the n/4 lowest IDs of their corner and <b>stay</b>.`,
  evExtra:n=>`<b>${n}</b> <b>extra</b> robot(s) (rank > n/4) leave for the next corner.`,
  evTransit:n=>`<b>${n}</b> extra robot(s) are still walking along the boundary.`,
  evWait:n=>`<b>${n}</b> robot(s) hold their corner until the next block starts.`,
  toCol:n=>`<b>${n}</b> robot(s) walk along the boundary row to <b>their column</b>.`,
  inCol:n=>`<b>${n}</b> robot(s) stand at their column and wait for the dispersal window.`,
  disp:n=>`<b>${n}</b> robot(s) walk <b>into their column</b>.`,
  settle:n=>`<b>${n}</b> robot(s) <b>settle</b> and terminate.`,
  odMid:n=>`<b>${n}</b> robot(s) walk from a corner to the <b>middle of a boundary side</b>.`,
  odWaitMid:n=>`<b>${n}</b> robot(s) wait at the boundary middle.`,
  odCenter:n=>`<b>${n}</b> robot(s) turn 90° and walk <b>to the centre</b>.`,
  odWaitCenter:n=>`<b>${n}</b> robot(s) wait at the centre.`,
  odWaitCorner:n=>`<b>${n}</b> robot(s) wait at the common corner.`,
  idle:n=>``
};
function phaseText(p,t,log,sim){
  const s=sim.s,n=sim.n,q=n/4;
  const sec=(a,b)=>`rounds ${a}–${b}`;
  switch(p.key){
    case 'A': return {
      what:`<b>Stage 1 — every robot works alone.</b> Robots on internal nodes go straight to the boundary, boundary robots slide to a corner, and from a corner each robot walks to the next corner to count √n. A robot that already knows √n just waits until round 3√n = ${3*s}. <i>No robot waits for another robot, so there is no leader whose crash could freeze the algorithm.</i>`,
      why:`This is the paper's main trick for crash tolerance. The old algorithm [12] gathered everybody at one corner using the max/min ID as leader — if that robot crashes, everybody waits forever. Here each robot only uses its own position, its port numbers and the global round counter.`,
      crash:`Nobody was waiting for this robot, so all other robots continue unchanged. It just won't take part in later ranking.`};
    case 'E_REB': {
      const b=Math.floor((t-3*s-1)/s)+1, first=((t-3*s-1)%s===0);
      return {
      what:`<b>Stage 2 (n even) — rebalance corners, block ${b} of 3</b> (${sec(3*s+(b-1)*s+1,3*s+b*s)}). ${first?`This is a <u>decision round</u>: at each corner, robots read the IDs of co-located robots, sort them, and only the <b>n/4 = ${q} smallest IDs stay</b>; the rest are “extra” and start walking to the next corner (clockwise).`:`Extra robots are walking along the boundary (√n−1 = ${s-1} moves), everyone else holds position. The next decision round is round ${3*s+b*s+1}.`} Afterwards no corner holds more than n/4 robots.`,
      why:`An even n has no centre node, so the grid is cut into 4 quadrants of (√n/2)×(√n/2) = n/4 nodes. A corner can only disperse n/4 robots inside its own quadrant, hence the capacity n/4. Excess robots travel at most 3 corners = 3√n rounds.`,
      crash:`The robot disappears from the sorted ID list at its corner. The survivors’ ranks are recomputed at the next block start, using only visible robots, so the “keep n/4 lowest IDs” rule still holds. A crashed robot can never block anyone.`};}
    case 'E_COL': return {
      what:`<b>Stage 3 (n even) — walk to the column</b> (${sec(6*s+1,6*s+s/2)}). Each corner has c ≤ n/4 robots. They are sorted by ID and split into groups of m = ⌈c/(√n/2)⌉ robots, one group per column of the quadrant. Lower ID → column nearer to the corner. Robots walk along the boundary row to their column.`,
      why:`The quadrant has √n/2 columns and each column has √n/2 nodes. Because c ≤ n/4, each column gets at most √n/2 robots, which exactly fits.`,
      crash:`Ranks were fixed when this stage started. The crashed robot’s slot (column, depth) just stays empty; nobody else needs to change.`};
    case 'E_DISP': return {
      what:`<b>Stage 4 (n even) — disperse inside the column</b> (${sec(6*s+s/2+1,7*s)}). Robots walk into the grid, rank 0 of a group stays on the boundary node, rank 1 goes 1 step further, rank 2 goes 2 steps, … Each robot settles when it has walked its depth.`,
      why:`Every robot has a unique (column, depth) pair derived from its rank, so no two robots settle on the same node. Total time ≤ 7√n = ${7*s}.`,
      crash:`The slot of the crashed robot stays unoccupied. All other robots still settle on distinct nodes because their slots were computed before the crash.`};
    case 'O_MID': return {
      what:`<b>Stage 2 (n odd) — corners → middle of a boundary side</b> (${sec(3*s+1,3*s+Math.ceil(s/2))}). Every robot at a corner walks ⌊√n/2⌋ = ${Math.floor(s/2)} hops along the boundary in the direction of its smallest port, landing on a middle boundary node.`,
      why:`Because √n is odd, the middle of every side is one unique node (⌊√n/2⌋ hops from the corners).`,
      crash:`Nothing special: the others keep walking. The middle nodes are fixed places, not robots.`};
    case 'O_CENTER': return {
      what:`<b>Stage 3 (n odd) — boundary middle → centre</b> (${sec(3*s+Math.ceil(s/2)+1,4*s)}). From the middle of the boundary every robot turns 90° and walks ⌊√n/2⌋ = ${Math.floor(s/2)} hops inward. All robots arrive at the <b>same unique centre node</b>.`,
      why:`The centre is equidistant from all sides. It plays the role of a <i>meeting place</i> that does not depend on any robot being alive — this replaces the leader.`,
      crash:`A crash cannot stop the rendezvous: the survivors still walk to the centre.`};
    case 'O_CORNER': return {
      what:`<b>Stage 4 (n odd) — centre → one corner</b> (${sec(4*s+1,5*s)}). All robots at the centre move together: straight to the boundary (smallest port), then slide to the corner — the very same movement rules as Stage 1. Everyone reaches the same corner.`,
      why:`Now all surviving robots are at ONE corner and can disperse over all √n columns of the grid.`,
      crash:`The group is just smaller. Rank and column assignment will use only the survivors.`};
    case 'O_COL': return {
      what:`<b>Stage 5 (n odd) — walk to the column</b> (${sec(5*s+1,6*s)}). S robots are at the corner. They are sorted by ID and divided into groups of m = ⌈S/√n⌉ robots, one group per column. Lower ID → nearer column.`,
      why:`There are √n columns of √n nodes each; with S ≤ n robots, m ≤ √n robots fit in a column.`,
      crash:`Ranks were fixed at the stage start; the crashed robot’s slot simply remains empty.`};
    case 'O_DISP': return {
      what:`<b>Stage 6 (n odd) — disperse inside the column</b> (${sec(6*s+1,7*s)}). Robots walk into their column: rank 0 stays on the boundary node, rank 1 one step further, and so on, then settle. Everything is finished by round 7√n = ${7*s}.`,
      why:`Unique (column, depth) per rank ⇒ unique node per robot.`,
      crash:`Empty slot, no effect on survivors.`};
  }
  return {what:'',why:'',crash:''};
}
function cornerTable(snapPrev,snapNow,s,q){
  const cc=(snap)=>{const o={TL:0,TR:0,BL:0,BR:0};snap.forEach(rb=>{if(rb.alive){const c=cornerId(s,rb.r,rb.c);if(c)o[c]++;}});return o;};
  const a=cc(snapPrev),b=cc(snapNow);
  let h='<table><tr><th>corner</th>'+['TL','TR','BL','BR'].map(k=>`<th>${k}</th>`).join('')+'</tr>';
  h+='<tr><td>before round</td>'+['TL','TR','BL','BR'].map(k=>`<td>${a[k]}</td>`).join('')+'</tr>';
  h+='<tr><td>after round</td>'+['TL','TR','BL','BR'].map(k=>`<td ${b[k]>q?'style="color:#b91c1c;font-weight:700"':''}>${b[k]}</td>`).join('')+'</tr></table>';
  return h+`<div class="small">Capacity per corner = n/4 = ${q}. (Robots in transit are not counted.)</div>`;
}
function configLines(snap,s){
  const m=new Map();
  snap.forEach(rb=>{if(!rb.alive)return;const k=rb.r*s+rb.c;if(!m.has(k))m.set(k,[]);m.get(k).push(rb.id);});
  const keys=[...m.keys()].sort((a,b)=>a-b);
  return keys.map(k=>`(${Math.floor(k/s)},${k%s}) ← ${pad(m.get(k).sort((a,b)=>a-b))}`).join('\n');
}
function renderExplain(t){
  const sim=App.sim,s=sim.s,n=sim.n,P=$('pExplain');
  if(t===0){
    const snap=sim.history[0];
    let h=`<h3>Initial configuration (before round 1)</h3>
    <div class="callout">The grid is the <b>oriented mesh</b> of ${s}×${s} = <b>n = ${n}</b> anonymous nodes. Blue dots are nodes (memoryless, no IDs); the orange numbers are the <b>port numbers</b>. Corners have degree 2, boundary nodes degree 3, internal nodes degree 4. There are <b>k = ${sim.k}</b> robots with unique IDs; they start on arbitrary nodes. Press <b>Next</b> (→) or <b>Play</b>.</div>
    <div class="callout why"><b>What the robots know at the start:</b> only their own ID, their current node's degree/ports, and the global synchronous round counter. They do <u>not</u> know n — they will learn it in Stage 1. Orientation means a robot that enters a node through one port can always leave through the “opposite” port, i.e. keep going straight, and can turn by 90°.</div>
    <h4>Algorithm 1 (from the paper)</h4>${algoHTML([])}
    <h4>Total schedule (paper’s round marks)</h4>
    <table><tr><th>Stage</th><th>Rounds</th><th>Paper bound</th></tr>${sim.phases.map(p=>`<tr><td><span class="badge" style="background:${p.color}">${p.key}</span> ${p.label}</td><td>${p.start}–${p.end}</td><td>${p.bound}</td></tr>`).join('')}</table>
    <h4>Configuration</h4><pre class="mono" style="max-height:140px;overflow:auto;background:#f8fafc;padding:6px;border-radius:6px">${configLines(snap,s)}</pre>`;
    if(sim.crashStatus.length)h+=`<div class="callout crash"><b>Planned crashes:</b> ${sim.crashStatus.map(c=>`robot ${c.id} @ round ${c.round}`).join(', ')}.</div>`;
    P.innerHTML=h; return;
  }
  const log=sim.logs[t],ph=phaseAt(t,s),pt=phaseText(ph,t,log,sim);
  const prev=sim.history[t-1],now=sim.history[t];
  const kinds=log.kinds; let acts='';
  Object.keys(kinds).forEach(k=>{if(KIND_TXT[k]&&k!=='idle'){const tx=KIND_TXT[k](kinds[k]);if(tx)acts+=`<li>${tx}</li>`;}});
  const allLines=new Set(); log.robots.forEach(r=>r.lines.forEach(l=>allLines.add(l)));
  if(sim.even&&ph.key==='E_COL')allLines.add(7);
  let h=`<h3>Round ${t} <span class="badge" style="background:${ph.color}">${ph.key} · ${ph.label}</span></h3>
  <div class="small">Phase window: rounds ${ph.start}–${ph.end} · Algorithm 1 line(s) ${ph.lines}</div>
  <div class="callout">${pt.what}</div>
  <div class="callout why"><b>Why?</b> ${pt.why}</div>`;
  if(log.crashes.length){
    h+=`<div class="callout crash"><b>💥 Crash in this round (before Communicate):</b><ul style="margin:4px 0 4px 18px;padding:0">`+
      log.crashes.map(c=>`<li>Robot <b>${c.id}</b> crashed at node (${c.r},${c.c}) while in state “${MODE_LABEL[c.mode]||c.mode}”${c.settled?' (it had already settled – its node is now empty)':''}. It vanishes with all its memory; the other robots cannot see it any more.</li>`).join('')+
      `</ul><b>Consequence / how survivors continue:</b> ${pt.crash}</div>`;
  }
  h+=`<h4>What the robots do this round</h4><ul style="margin:4px 0 4px 18px;padding:0">${acts||'<li>No active robots.</li>'}</ul>`;
  if(log.events.length)h+=`<div class="callout ok">${log.events.slice(0,8).map(e=>e.text).join('<br>')}${log.events.length>8?`<br>… and ${log.events.length-8} more events`:''}</div>`;
  if(sim.even&&ph.key==='E_REB'){const b=Math.floor((t-3*s-1)/s)+1;h+=`<h4>Corner loads (block ${b}/3)</h4>`+cornerTable(prev,now,s,n/4);}
  if(sim.even&&(ph.key==='E_COL')&&t===6*s+1)h+=`<h4>Corner loads at the start of Stage 3</h4>`+cornerTable(prev,now,s,n/4);
  if(log.notes&&log.notes.length)h+=`<div class="callout warn">${log.notes.join('<br>')}</div>`;
  h+=`<div class="kv" style="margin:8px 0"><b>Moves this round</b><span>${log.moves}</span><b>Local reads (messages)</b><span>${log.messages} <span class="small">(each of k robots on a node reads the other k−1)</span></span><b>Robots alive / crashed / settled</b><span>${now.filter(r=>r.alive).length} / ${now.filter(r=>!r.alive).length} / ${now.filter(r=>r.settled).length}</span></div>`;
  h+=`<h4>Algorithm 1 — lines executed this round</h4>${algoHTML([...allLines])}`;
  h+=`<details open><summary>Robot-by-robot: communicate → compute → move (${log.robots.length} active robots)</summary>
    <label class="chk"><input type="checkbox" id="showIdle"> include waiting robots</label>
    <div style="max-height:320px;overflow:auto"><table id="rtab"><tr><th>ID</th><th>State before</th><th>Communicate (sees)</th><th>Compute / decision</th><th>Move</th></tr></table></div></details>`;
  h+=`<details><summary>Configuration after round ${t}</summary><pre class="mono" style="max-height:200px;overflow:auto;background:#f8fafc;padding:6px;border-radius:6px">${configLines(now,s)}</pre></details>`;
  P.innerHTML=h;
  const fill=()=>{
    const show=$('showIdle').checked; let rows='';
    log.robots.forEach(r=>{
      if(r.idle&&!show&&r.kind!=='settle'&&r.kind!=='evStay')return;
      rows+=`<tr class="${App.sel===r.id?'sel':''}" data-id="${r.id}"><td><b>${r.id}</b></td><td>${MODE_LABEL[r.before]||r.before}</td><td>${r.reads.length?'IDs: '+pad(r.reads):'nobody else here'}</td><td>${r.text}${r.why?`<div class="small">↳ ${r.why}</div>`:''}</td><td>${r.dir?`(${r.from})→(${r.to}) ${DIRNAME[r.dir]}`:'stay'}</td></tr>`;
    });
    $('rtab').innerHTML=$('rtab').rows[0].outerHTML+rows;
    $('rtab').querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>{App.sel=+tr.dataset.id;updateGrid(App.t);renderSel();});
  };
  $('showIdle').onchange=fill; fill();
}

/* ---------- robots tab / selection ---------- */
function bitsOf(x){return Math.max(1,Math.ceil(Math.log2(x+1)));}
function memBits(sim){
  const s=sim.s,n=sim.n,k=sim.k;
  const rows=[['Robot ID',bitsOf(k),'O(log n) — IDs 1…k'],['Round counter (≤ 7√n)',bitsOf(7*s),'O(log n)'],['Learned √n',bitsOf(s),'O(log n)'],
    ['Step counter for learning √n',bitsOf(s),'O(log n)'],['Hop / remaining-steps counter',bitsOf(s),'O(log n)'],['Rank among co-located robots',bitsOf(k),'O(log n)'],
    ['Target column offset',bitsOf(s),'O(log n)'],['Target depth',bitsOf(s),'O(log n)'],['Mode / phase (≈ 20 states)',5,'O(1)'],['Heading (N/E/S/W)',2,'O(1)']];
  return {rows,total:rows.reduce((a,r)=>a+r[1],0)};
}
function renderRobotsTab(){
  const sim=App.sim,s=sim.s,snap=sim.history[App.t];
  let h=`<h3>Robot states after round ${App.t}</h3><div class="small">Click a row to highlight the robot on the grid.</div><div style="max-height:62vh;overflow:auto"><table><tr><th>ID</th><th>Status</th><th>Node</th><th>State</th><th>Memory</th><th>Moves</th></tr>`;
  snap.forEach(rb=>{
    const st=!rb.alive?`crashed @${rb.crashRound}`:rb.settled?`settled @${rb.settleRound}`:'active';
    const mem=[rb.s?`√n=${rb.s}`:'',rb.learnSteps?`steps=${rb.learnSteps}`:'',rb.rank!==null?`rank=${rb.rank}`:'',rb.col!==null?`col=${rb.col}`:'',rb.depth!==null?`depth=${rb.depth}`:''].filter(Boolean).join(', ')||'—';
    h+=`<tr data-id="${rb.id}" class="${!rb.alive?'crashed':rb.settled?'settled':''} ${App.sel===rb.id?'sel':''}"><td><b>${rb.id}</b></td><td>${st}</td><td>${rb.alive?`(${rb.r},${rb.c})`:`✖ (${rb.crashAt})`}</td><td>${rb.alive?(MODE_LABEL[rb.mode]||rb.mode):'—'}</td><td>${rb.alive?mem:'lost'}</td><td>${rb.moves}</td></tr>`;
  });
  h+='</table></div>';
  $('pRobots').innerHTML=h;
  $('pRobots').querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>{App.sel=+tr.dataset.id;App.selNode=null;updateGrid(App.t);renderSel();renderRobotsTab();});
}
function renderSel(){
  const sim=App.sim,s=sim.s,snap=sim.history[App.t],el=$('selpanel');
  document.querySelectorAll('.rb').forEach(e=>e.classList.toggle('sel',App.sel===+e.dataset.id));
  if(App.sel){
    const rb=snap[App.sel-1]; if(!rb){el.textContent='';return;}
    el.innerHTML=`<b>Robot ${rb.id}</b> — ${!rb.alive?`<span style="color:#b91c1c">crashed at round ${rb.crashRound} at (${rb.crashAt})</span>`:rb.settled?`settled at (${rb.r},${rb.c}) in round ${rb.settleRound}`:`at (${rb.r},${rb.c}) · ${MODE_LABEL[rb.mode]||rb.mode}`} · started at (${rb.origin}) · moves so far: ${rb.moves}
      ${rb.alive?` <button class="sm danger" id="bCrashSel">💥 Crash it at round ${App.t+1}</button>`:''}`;
    const b=$('bCrashSel'); if(b)b.onclick=()=>{addCrash(rb.id,App.t+1);};
  } else if(App.selNode){
    const [r,c]=App.selNode,ids=snap.filter(x=>x.alive&&x.r===r&&x.c===c).map(x=>x.id);
    const ds=dirsAt(s,r,c);
    el.innerHTML=`<b>Node (${r},${c})</b> — ${nodeKind(s,r,c)}${cornerId(s,r,c)?' ('+cornerId(s,r,c)+')':''}, degree ${ds.length}. Ports: ${ds.map((d,i)=>`${i+1}→${DIRNAME[d]}`).join(', ')}. Robots here (${ids.length}): ${ids.length?pad(ids):'none'}.`;
  } else el.textContent='Click a robot or a node on the grid to inspect it.';
}

/* ---------- rounds list ---------- */
function buildRoundsList(){
  const sim=App.sim; let h=`<h3>Every round</h3><div class="small">Click a round to jump to it.</div><div class="rlist"><div data-t="0">Round 0 — initial configuration</div>`;
  for(let t=1;t<=sim.R;t++){
    const l=sim.logs[t],ph=phaseAt(t,sim.s);
    h+=`<div data-t="${t}"><span class="badge" style="background:${ph.color}">${ph.key}</span> Round ${t}: ${l.moves} move(s), ${l.messages} read(s)${l.crashes.length?` · 💥 crash of ${l.crashes.map(c=>c.id).join(',')}`:''}${l.events.filter(e=>e.type==='settle').length?` · ${l.events.filter(e=>e.type==='settle').length} settled`:''}${l.events.filter(e=>e.type==='learn').length?` · ${l.events.filter(e=>e.type==='learn').length} learned √n`:''}</div>`;
  }
  $('pRounds').innerHTML=h+'</div>';
  $('pRounds').querySelectorAll('[data-t]').forEach(d=>d.onclick=()=>{pause();setRound(+d.dataset.t);});
}
function markRoundsList(){
  const els=$('pRounds').querySelectorAll('[data-t]');
  els.forEach(e=>e.classList.toggle('cur',+e.dataset.t===App.t));
}

/* ---------- complexity ---------- */
function renderCx(){
  const sim=App.sim,s=sim.s,n=sim.n,k=sim.k,t=App.t,R=sim.R;
  const full=sim.history[R],now=sim.history[t];
  const sumTo=(arr,T)=>arr.slice(0,T+1).reduce((a,b)=>a+b,0);
  const movesFull=sumTo(sim.metrics.moves,R),movesNow=sumTo(sim.metrics.moves,t);
  const msgFull=sumTo(sim.metrics.msgs,R),msgNow=sumTo(sim.metrics.msgs,t);
  const maxMoves=Math.max(0,...full.map(r=>r.moves));
  const crashed=full.filter(r=>!r.alive).length;
  const lower=2*(s-1), upper=7*s;
  const mem=memBits(sim);
  // observed per-phase usage
  let ptab='';
  sim.phases.forEach(p=>{
    let first=null,last=null,mv=0;
    for(let r=p.start;r<=Math.min(p.end,R);r++){const l=sim.logs[r];if(l.moves>0){if(first===null)first=r;last=r;mv+=l.moves;}}
    ptab+=`<tr><td><span class="badge" style="background:${p.color}">${p.key}</span> ${p.label}</td><td>${p.bound}</td><td>${p.start}–${p.end} (${p.end-p.start+1} rounds)</td><td>${first===null?'no movement':first+'–'+last}</td><td>${mv}</td></tr>`;
  });
  // charts
  const chart=(arr,color,label)=>{
    const mx=Math.max(1,...arr),w=Math.max(2,Math.floor(440/Math.max(1,arr.length)));
    let b=`<svg viewBox="0 0 ${arr.length*w+2} 70" style="width:100%;height:80px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">`;
    arr.forEach((v,i)=>{const hh=v/mx*60;b+=`<rect x="${i*w+1}" y="${66-hh}" width="${w-1}" height="${hh}" fill="${color}" opacity="${i===t?1:.55}"/>`;});
    b+=`<text x="4" y="10" font-size="9" fill="#475569">${label} (max ${mx})</text></svg>`;return b;
  };
  let h=`<h3>Complexity analysis</h3>
  <div class="callout"><b>Theorem 4.1 (paper):</b> Faulty-robot dispersion on an oriented n-node square grid with f ≤ n crash faults is solved deterministically in <b>O(√n) rounds</b> using <b>O(log n) bits</b> per robot. Remark 1: also true for any k ≤ n.</div>
  <h4>Time (rounds)</h4>
  <div class="kv"><b>Grid</b><span>√n = ${s}, n = ${n}, ${sim.even?'even':'odd'} case, k = ${k}, crashed f = ${crashed}</span>
  <b>Lower bound Ω(√n)</b><span>diameter = 2(√n − 1) = ${lower} rounds (a robot may have to cross the whole grid)</span>
  <b>Paper's upper bound</b><span>7√n = ${upper} rounds — derived below</span>
  <b>Observed (this run)</b><span><b>${R}</b> rounds until every surviving robot has settled &nbsp;(${(R/lower).toFixed(2)} × diameter, ${(R/upper*100).toFixed(0)}% of 7√n)</span></div>
  <div class="small" style="margin:6px 0">Derivation of ${sim.even?'7√n (even n)':'7√n (odd n)'}: ${sim.even?
   '2√n (reach a corner) + √n (learn √n) + 3√n (rebalance: ≤ 3 corner hops) + √n/2 (walk to column) + √n/2 (walk into column) = 7√n.':
   '2√n (reach a corner) + √n (learn √n) + √n/2 (to boundary middle) + √n/2 (to centre) + √n (centre → corner) + √n (walk to column) + √n (walk into column) = 7√n.'}</div>
  <table><tr><th>Stage</th><th>Paper bound</th><th>Scheduled window</th><th>Rounds with movement (observed)</th><th>Moves</th></tr>${ptab}</table>
  <p class="small">Note: robots wait for the paper's round marks (e.g. 3√n, 6√n) so that every robot is ready, so the scheduled windows are upper bounds; “observed” shows when robots really moved. Dispersion ends (all robots terminated) at round ${R}.</p>
  <h4>Movement complexity</h4>
  <div class="kv"><b>Total moves (edge traversals)</b><span>${movesFull} in this run (${movesNow} up to round ${t})</span><b>Max moves of one robot</b><span>${maxMoves} ≤ 7√n = ${upper}</span><b>Bound</b><span>each robot moves ≤ 1 edge per round ⇒ ≤ 7√n each ⇒ total O(n√n) (derived from Theorem 4.1; the paper does not state a separate movement bound)</span></div>
  ${chart(sim.metrics.moves,'#2563eb','moves per round')}
  <h4>Message complexity</h4>
  <div class="kv"><b>Model</b><span><b>Local communication</b>: robots on the same node can read each other’s memory; there is no message passing over edges. The paper proves no message bound.</span><b>Counted here</b><span>each round, a node with j active robots counts j(j−1) reads</span><b>Total reads</b><span>${msgFull} in this run (${msgNow} up to round ${t})</span><b>Worst-case (derived)</b><span>≤ n(n−1) reads per round ⇒ O(n²·√n) overall; the algorithm never sends anything that is not a co-located read</span></div>
  ${chart(sim.metrics.msgs,'#7c3aed','reads per round')}
  <h4>Memory per robot</h4>
  <table><tr><th>Register</th><th>Bits (this n)</th><th>Asymptotic</th></tr>${mem.rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}<tr><td><b>Total</b></td><td><b>${mem.total}</b></td><td><b>O(log n)</b></td></tr></table>
  <p class="small">Lower bound Ω(log k) bits [Augustine &amp; Moses] — so the algorithm is memory-optimal. The weak-Byzantine extension (Theorem 4.2) needs O(n log n) bits per robot (not simulated here).</p>
  <h4>Space complexity</h4>
  <div class="kv"><b>Nodes</b><span>memoryless and ID-less: 0 bits per node, n = ${n} nodes, m = 2√n(√n−1) = ${2*s*(s-1)} edges</span><b>Robots</b><span>total ${k} × ${mem.total} = ${k*mem.total} bits = O(n log n) in the worst case k = n</span></div>
  <h4>Optimality</h4>
  <div class="callout ok">Time: Ω(√n) ≤ observed ≤ 7√n ⇒ O(√n) is <b>optimal</b>. Memory: Ω(log k) ≤ O(log n) ⇒ <b>optimal</b>.</div>`;
  $('pCx').innerHTML=h;
}

/* ---------- results ---------- */
function renderResults(){
  const sim=App.sim,s=sim.s,n=sim.n,t=App.t,R=sim.R,snap=sim.history[t];
  const alive=snap.filter(r=>r.alive),settled=snap.filter(r=>r.settled&&r.alive),crashed=snap.filter(r=>!r.alive);
  const occ=new Map(); settled.forEach(r=>{occ.set(r.r*s+r.c,(occ.get(r.r*s+r.c)||[]).concat(r.id));});
  const done=(t===R);
  const unique=[...occ.values()].every(a=>a.length===1);
  const movesNow=sim.metrics.moves.slice(0,t+1).reduce((a,b)=>a+b,0),msgNow=sim.metrics.msgs.slice(0,t+1).reduce((a,b)=>a+b,0);
  const finalOK=sim.terminated&&unique&&sim.history[R].filter(r=>r.alive).every(r=>r.settled);
  let h=`<h3>${done?'Final result':'Live status'} (after round ${t}${done?'':' of '+R})</h3>`;
  if(done){
    h+=finalOK?`<div class="callout ok"><b>✔ Dispersion achieved.</b> Every one of the ${alive.length} surviving robots has settled on a node that is occupied by it alone, and all of them have terminated.</div>`
      :`<div class="callout crash"><b>✖ Dispersion NOT achieved.</b></div>`;
    if(sim.anomaly.length)h+=`<div class="callout warn"><b>Anomalies detected:</b><br>${sim.anomaly.join('<br>')}</div>`;
  } else h+=`<div class="callout warn">The algorithm is still running — go to the last round (⏭) for the final result.</div>`;
  h+=`<div class="kv"><b>Termination</b><span>${done?(sim.terminated?'terminated at round '+R+' (≤ 7√n = '+7*s+')':'NOT terminated within 7√n'):'running'}</span>
  <b>Total rounds</b><span>${t}${done?'':' so far'}</span><b>Total movements</b><span>${movesNow}</span><b>Total local reads (messages)</b><span>${msgNow}</span>
  <b>Robots</b><span>${sim.k} total · ${alive.length} alive · ${crashed.length} crashed · ${settled.length} settled</span>
  <b>Nodes</b><span>${occ.size} occupied · ${n-occ.size} unoccupied (of ${n})</span>
  <b>Crashed robots</b><span>${crashed.length?crashed.map(r=>`#${r.id} (round ${r.crashRound}, at (${r.crashAt}), was “${MODE_LABEL[r.crashMode]||r.crashMode}”)`).join('; '):'none'}</span></div>`;
  h+=`<h4>Node occupancy map (row 0 at top)</h4><div class="mini" style="grid-template-columns:repeat(${s},1fr)">`;
  const crAt=new Map(); crashed.forEach(r=>{crAt.set(r.crashAt[0]*s+r.crashAt[1],(crAt.get(r.crashAt[0]*s+r.crashAt[1])||[]).concat(r.id));});
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){
    const k=r*s+c,o=occ.get(k);
    const here=alive.filter(x=>x.r===r&&x.c===c&&!x.settled).length;
    h+=`<div class="${o?'occ':here?'mv':''}" title="(${r},${c})">${o?o.join(','):here?('×'+here):''}</div>`;
  }
  h+=`</div><div class="small">green = settled robot ID · blue = robots still travelling (count) · empty = unoccupied</div>`;
  h+=`<h4>Final position of each robot</h4><div style="max-height:260px;overflow:auto"><table><tr><th>ID</th><th>Start</th><th>Final / last</th><th>Status</th><th>Moves</th></tr>`;
  snap.forEach(r=>{h+=`<tr class="${!r.alive?'crashed':r.settled?'settled':''}"><td><b>${r.id}</b></td><td>(${r.origin})</td><td>${r.alive?`(${r.r},${r.c})`:`✖ (${r.crashAt})`}</td><td>${!r.alive?'crashed @'+r.crashRound:r.settled?'settled @'+r.settleRound:'travelling'}</td><td>${r.moves}</td></tr>`;});
  h+='</table></div>';
  $('pRes').innerHTML=h;
}

/* ---------- about ---------- */
function buildAbout(){
  const sim=App.sim;
  $('pAbout').innerHTML=`<h3>Model used by this simulator</h3>
  <ul style="margin:4px 0 4px 18px;padding:0">
  <li><b>Graph:</b> √n × √n oriented square mesh. Nodes are anonymous and memoryless; edges are identified only by port numbers 1…degree. Corners: 4 nodes (degree 2). Boundary: 4√n−8 nodes (degree 3). Internal: n−4√n+4 nodes (degree 4).</li>
  <li><b>Oriented:</b> a robot that enters a node through a port can leave through the “opposite” port (go straight) and can turn by 90°. This is modelled as a local compass; port numbers are still printed and used for the “smallest port” tie-breaks. <i>Port numbering convention used here:</i> clockwise starting at West, skipping missing directions (internal: 1=W 2=N 3=E 4=S).</li>
  <li><b>Robots:</b> unique IDs (O(log n) bits), synchronous Communicate–Compute–Move rounds, local communication only (robots on the same node read each other’s memory).</li>
  <li><b>Crash fault:</b> a robot may crash at any time, loses all memory and is invisible afterwards. Here a crash happens at the beginning of a chosen round. Dispersion is required only for non-faulty robots.</li>
  <li><b>Goal:</b> each node holds at most one non-faulty robot and all robots terminate.</li></ul>
  <h3>Choices where the paper is informal</h3>
  <div class="callout warn">The paper describes the algorithm in prose with some gaps. To implement it exactly and deterministically I made the following <b>explicit, minimal</b> interpretation choices (none changes the paper's structure or bounds):
  <ol style="margin:4px 0 0 18px;padding:0">
  <li><b>Port order</b> (clockwise from West) fixes what “smallest port” means. Internal robots therefore go West, then slide North to corner TL; right-boundary robots probe port 1 (leads inside), step back and use port 2.</li>
  <li><b>“Learn n”:</b> each robot starts the corner-to-corner walk as soon as it reaches a corner, walking <b>clockwise</b> (TL→TR→BR→BL→TL) and counting √n−1 edges. It then waits for the global round mark 3√n.</li>
  <li><b>Round marks</b> (3√n, 3.5√n, 4√n, 5√n, 6√n, 6.5√n, 7√n) are taken from the paper; when a movement is shorter than its window the robot idles.</li>
  <li><b>Even n rebalance:</b> three blocks of √n rounds; in each block-start round a corner keeps the n/4 lowest IDs <i>present</i> and the others walk clockwise to the next corner.</li>
  <li><b>Column assignment:</b> robots of a corner are sorted by ID (rank 0…c−1); group size m = ⌈c/(√n/2)⌉ (even) or ⌈S/√n⌉ (odd); column offset = ⌊rank/m⌋, depth = rank mod m. “Lower ID → nearer column.” Columns are reached along the horizontal boundary row facing the grid’s middle.</li>
  <li><b>Odd n:</b> corner robots go ⌊√n/2⌋ hops along their smallest-port direction, turn 90° to the centre, then use the Stage-1 rules to reach one common corner (TL with this port numbering).</li>
  <li><b>Messages:</b> the paper has no message-passing; we count local reads (each robot on a node reading each co-located robot).</li></ol></div>
  <h3>Why this algorithm survives crashes</h3>
  <ul style="margin:4px 0 4px 18px;padding:0">
  <li>No robot ever waits for a specific other robot — there is <b>no leader</b>, no max/min ID election.</li>
  <li><b>Odd n:</b> the meeting point is a <i>place</i> (the centre), so a crash cannot prevent the rendezvous.</li>
  <li><b>Even n:</b> no single meeting point exists, so the grid is split into 4 quadrants with corner capacity n/4; rank-based decisions use only robots that are present.</li>
  <li>Slots (column, depth) come from ranks, so crashed robots only leave empty nodes — surviving robots never collide.</li></ul>
  <h3>Paper facts</h3>
  <table><tr><th>Algorithm</th><th>Grid</th><th>Fault</th><th>Time</th><th>Memory</th></tr>
  <tr><td>Kshemkalyani et al. [12]</td><td>Oriented</td><td>none</td><td>O(√n)</td><td>O(log k)</td></tr>
  <tr><td>Banerjee et al. [3]</td><td>Unoriented</td><td>none</td><td>O(√n)</td><td>O(log n)</td></tr>
  <tr><td>Banerjee et al. [3]</td><td>Unoriented</td><td>Crash</td><td>O(√n log n)</td><td>O(√n log n)</td></tr>
  <tr><td><b>This paper (Sec. 4)</b></td><td>Oriented</td><td>Crash</td><td><b>O(√n)</b></td><td><b>O(log n)</b></td></tr>
  <tr><td><b>This paper (Sec. 4)</b></td><td>Oriented</td><td>weak Byzantine</td><td>O(√n)</td><td>O(n log n)</td></tr></table>
  <p class="small">Paper: R. Banerjee, M. Kumar, A. R. Molla. “Optimal Fault-Tolerant Dispersion on Oriented Grids.” ICDCN 2025. arXiv:2410.17813.</p>`;
}

/* ---------- crashes ---------- */
function renderCrashList(){
  const sim=App.sim; const el=$('crashList');
  if(!App.crashes.length){el.innerHTML='<div class="small">No crashes planned.</div>';return;}
  el.innerHTML=App.crashes.slice().sort((a,b)=>a.round-b.round).map(c=>{
    const st=sim.crashStatus.find(x=>x.id===c.id&&x.round===c.round);
    const ok=st&&st.status==='applied';
    return `<div class="crashrow ${ok?'':'ign'}"><span>💥 robot <b>${c.id}</b> @ round <b>${c.round}</b>${ok?'':`<br><span class="small">${st?st.status:''}</span>`}</span><button class="sm" data-id="${c.id}">✕</button></div>`;
  }).join('');
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{App.crashes=App.crashes.filter(c=>c.id!==+b.dataset.id);rebuild(true);});
}
function addCrash(id,round){
  id=+id; round=+round;
  if(!(id>=1&&id<=App.k)){alert('Robot ID must be between 1 and '+App.k);return;}
  if(!(round>=1&&round<=7*App.s)){alert('Round must be between 1 and '+7*App.s);return;}
  App.crashes=App.crashes.filter(c=>c.id!==id); App.crashes.push({id,round});
  rebuild(true);
  if(App.t>=round)setRound(round-1);
}

/* ---------- playback ---------- */
function pause(){App.playing=false;clearTimeout(App.timer);$('bPlay').textContent='▶ Play';$('bPlay').classList.add('primary');}
function play(){
  if(App.t>=App.sim.R)setRound(0);
  App.playing=true;$('bPlay').textContent='⏸ Pause';
  const tick=()=>{ if(!App.playing)return; if(App.t>=App.sim.R){pause();return;} setRound(App.t+1); App.timer=setTimeout(tick,1000/App.speed); };
  App.timer=setTimeout(tick,200);
}
function speedFromSlider(v){return Math.pow(2,v);}

/* ---------- init ---------- */
function init(){
  const selS=$('selS'); for(let s=3;s<=9;s++){const o=document.createElement('option');o.value=s;o.textContent=`${s} × ${s}  (n = ${s*s}, ${s%2?'odd':'even'})`;selS.appendChild(o);} selS.value=App.s;
  $('inK').value=App.k;
  const rebuildAll=()=>{pause();App.crashes=[];rebuild(false);};
  selS.onchange=()=>{App.s=+selS.value;App.k=App.s*App.s;$('inK').value=App.k;rebuildAll();};
  $('inK').onchange=()=>{App.k=Math.max(1,Math.min(App.s*App.s,+$('inK').value||1));$('inK').value=App.k;rebuildAll();};
  $('btnReseed').onclick=()=>{App.seed=1+Math.floor(Math.random()*999983);rebuildAll();};
  $('btnAddCrash').onclick=()=>addCrash($('cId').value,$('cRound').value);
  $('btnClearCrash').onclick=()=>{App.crashes=[];rebuild(true);};
  [['oPorts','ports'],['oCoords','coords'],['oQuad','quad'],['oArrows','arrows']].forEach(([id,k])=>{$(id).onchange=()=>{App.opts[k]=$(id).checked;applyDisplayOpts();};});
  $('btnDownload').onclick=()=>{
    const sim=App.sim; const data={paper:'Optimal Fault-Tolerant Dispersion on Oriented Grids (ICDCN 2025)',s:sim.s,n:sim.n,k:sim.k,rounds:sim.R,crashes:App.crashes,
      initial:sim.history[0].map(r=>({id:r.id,node:[r.r,r.c]})),log:sim.logs.slice(1).map(l=>({round:l.t,phase:l.phase,moves:l.moves,reads:l.messages,crashes:l.crashes,events:l.events,robots:l.robots.map(r=>({id:r.id,from:r.from,to:r.to,state:r.before,decision:r.text}))}))};
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,1)],{type:'application/json'}));a.download='dispersion-round-log.json';a.click();
  };
  $('bReset').onclick=()=>{pause();setRound(0);};
  $('bPrev').onclick=()=>{pause();setRound(App.t-1);};
  $('bNext').onclick=()=>{pause();setRound(App.t+1);};
  $('bEnd').onclick=()=>{pause();setRound(App.sim.R);};
  $('bPlay').onclick=()=>{App.playing?pause():play();};
  $('scrub').oninput=()=>{pause();setRound(+$('scrub').value);};
  $('speed').oninput=()=>{App.speed=speedFromSlider(+$('speed').value);$('speedlab').textContent=(App.speed<1?App.speed.toFixed(2):App.speed.toFixed(1)).replace(/\.0$/,'')+'×';};
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
    document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.id===t.dataset.p));
  });
  if(onKey)document.removeEventListener('keydown',onKey);
  onKey=e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&e.target.type!=='range')return;
    if(e.key===' '){e.preventDefault();App.playing?pause():play();}
    else if(e.key==='ArrowRight'){pause();setRound(App.t+1);}
    else if(e.key==='ArrowLeft'){pause();setRound(App.t-1);}
    else if(e.key==='Home'){pause();setRound(0);}
    else if(e.key==='End'){pause();setRound(App.sim.R);}
  };
  document.addEventListener('keydown',onKey);
  App.crashes=[];
  rebuild(false);
}

return {
  mount: function () { active = true; init(); },
  unmount: function () {
    active = false;
    try { pause(); } catch (e) {}
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
  }
};
})();
