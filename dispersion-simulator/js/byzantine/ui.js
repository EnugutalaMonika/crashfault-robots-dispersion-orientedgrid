/* ======================================================================
   Weak Byzantine simulator — USER INTERFACE
   SVG grid, playback controls, explanation / complexity / results panels.
   Depends on: js/byzantine/engine.js (window.ByzEngine).
   ====================================================================== */
window.ByzSim = (function () {
const { DIR, DIRNAME, MODE_LABEL, STRATS, cornerId, degree, dirsAt, nodeKind, phaseAt, rngFn, simulate } = window.ByzEngine;
let active = false, onKey = null;

// ---------------------------------------------------------------------------
// UI: SVG grid, playback controls, explanation / complexity / results panels.
// ---------------------------------------------------------------------------
// ============================================================================
//  UI
// ============================================================================
const $=id=>document.getElementById(id);
const App={s:4,k:16,seed:1+Math.floor(Math.random()*999983),scen:'demo',byz:[],sim:null,t:0,playing:false,speed:1,timer:null,sel:null,selNode:null,
  opts:{ports:true,coords:true,quad:true,arrows:true}};
const G=90,M=62,xOf=c=>M+c*G,yOf=r=>M+r*G;
const hue=id=>(id*47)%360;
const pad=a=>a.length>8?a.slice(0,7).join(', ')+', … (+'+(a.length-7)+')':a.join(', ');
const SAFE=Object.keys(STRATS).filter(k=>STRATS[k].safe),ALLS=Object.keys(STRATS);

function makePlacement(){
  // Every robot starts on a uniformly random node; the same random scenario is kept until "Generate new random scenario".
  const s=App.s,k=App.k,R=rngFn(App.seed*1013+s*7+k),pos=[];
  for(let i=0;i<k;i++)pos.push([Math.floor(R()*s),Math.floor(R()*s)]);
  return pos;
}
function applyPreset(name){
  const k=App.k,s=App.s,R=rngFn(App.seed*31+s+k*3),b=[],used=new Set();
  const add=(id,st,param)=>{if(id<1||id>k||used.has(id))return;used.add(id);b.push({id,strat:st,param:param||null});};
  const rid=()=>{let g=0,id;do{id=1+Math.floor(R()*k);}while(used.has(id)&&g++<300);return id;};
  if(name==='demo'){add(Math.min(2,k),'liar');add(Math.max(1,Math.ceil(k/3)),'twoface');add(Math.max(1,Math.ceil(k/2)),'squatter');add(k,'overstay');}
  else if(name==='lowid'){add(1,'noclaim');add(2,'liar');add(3,'overstay');}
  else if(name==='oneeach'){SAFE.forEach(st=>add(rid(),st,st==='crashlike'?(4*s):null));}
  else if(name==='stress'){add(1,'deserter');add(2,'deserter');}
  else if(name==='random'){const f=Math.min(k,Math.max(0,+$('inF').value||0)),pool=$('inStress').checked?ALLS:SAFE;
    for(let i=0;i<f;i++){const st=pool[Math.floor(R()*pool.length)];add(rid(),st,st==='crashlike'?(1+Math.floor(R()*6*s)):null);}}
  App.byz=b;
}

function rebuild(keepT){
  const pos=makePlacement();
  App.sim=simulate({s:App.s,pos,byz:App.byz,seed:App.seed});
  buildSVG();buildTimeline();buildRoundsList();buildAbout();
  App.t=keepT?Math.min(App.t,App.sim.R):0;
  $('scrub').max=App.sim.R;
  renderByzList();
  setRound(App.t);
}

function buildSVG(){
  const sim=App.sim,s=sim.s,W=M*2+(s-1)*G;
  let h=`<svg id="svg" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#ea580c"/></marker></defs><g id="guide">`;
  if(sim.even){const hf=s/2,qc=['#dbeafe','#dcfce7','#fef9c3','#fce7f3'];
    [[0,0,'TL'],[0,hf,'TR'],[hf,0,'BL'],[hf,hf,'BR']].forEach((q,i)=>{const x0=xOf(q[1])-G/2,y0=yOf(q[0])-G/2;
      h+=`<rect x="${x0}" y="${y0}" width="${hf*G}" height="${hf*G}" fill="${qc[i]}" opacity=".55" rx="6"/><text x="${x0+8}" y="${y0+14}" font-size="11" fill="#475569" font-weight="700">quadrant of ${q[2]} (n/4 nodes)</text>`;});}
  else{const m=(s-1)/2;h+=`<circle cx="${xOf(m)}" cy="${yOf(m)}" r="30" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="5 4"/><text x="${xOf(m)+34}" y="${yOf(m)-30}" font-size="11" fill="#b91c1c" font-weight="700">unique centre</text>`;
    [[0,m],[s-1,m],[m,0],[m,s-1]].forEach(p=>{h+=`<rect x="${xOf(p[1])-14}" y="${yOf(p[0])-14}" width="28" height="28" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3 3" rx="6"/>`;});}
  h+=`</g><g id="edges">`;
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){
    if(c+1<s)h+=`<line class="edge" id="e-${r}-${c}-${r}-${c+1}" x1="${xOf(c)}" y1="${yOf(r)}" x2="${xOf(c+1)}" y2="${yOf(r)}"/>`;
    if(r+1<s)h+=`<line class="edge" id="e-${r}-${c}-${r+1}-${c}" x1="${xOf(c)}" y1="${yOf(r)}" x2="${xOf(c)}" y2="${yOf(r+1)}"/>`;}
  h+=`</g><g id="nodes">`;
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){const x=xOf(c),y=yOf(r),cid=cornerId(s,r,c);
    h+=`<g><circle class="nodedot${cid?' corner':''}" cx="${x}" cy="${y}" r="13"/>`;
    if(cid)h+=`<text class="cornertag" x="${x+(c===0?-34:34)}" y="${y+(r===0?-18:26)}" text-anchor="middle">${cid}</text>`;
    h+=`<circle class="nodehit" cx="${x}" cy="${y}" r="26" data-r="${r}" data-c="${c}"/></g>`;}
  h+=`</g><g id="labels"></g><g id="arrows"></g><g id="robots">`;
  sim.robots.forEach(rb=>{
    const col=`hsl(${hue(rb.id)},65%,48%)`;
    h+=rb.byz?`<g class="rb byz" id="rb${rb.id}" data-id="${rb.id}"><rect class="chip" x="-8" y="-8" width="16" height="16" rx="2" transform="rotate(45)" fill="${col}"/><text>${rb.id}</text></g>`
      :`<g class="rb" id="rb${rb.id}" data-id="${rb.id}"><circle class="chip" r="9" fill="${col}"/><text>${rb.id}</text></g>`;});
  h+=`</g><g id="badges"></g></svg>`;
  $('svgbox').innerHTML=h;
  let lb='';
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){const x=xOf(c),y=yOf(r);
    dirsAt(s,r,c).forEach((d,i)=>{lb+=`<text class="port" data-lab="port" x="${x+DIR[d][1]*25}" y="${y+DIR[d][0]*25+3}" text-anchor="middle">${i+1}</text>`;});
    lb+=`<text class="coord" data-lab="coord" x="${x+17}" y="${y+36}">(${r},${c})</text>`;}
  $('labels').innerHTML=lb;applyDisplayOpts();
  $('svgbox').onclick=ev=>{
    const g=ev.target.closest('.rb');if(g){App.sel=+g.dataset.id;App.selNode=null;updateGrid(App.t);renderSel();renderRobotsTab();return;}
    const n=ev.target.closest('.nodehit');if(n){App.selNode=[+n.dataset.r,+n.dataset.c];App.sel=null;updateGrid(App.t);renderSel();}};
}
function applyDisplayOpts(){
  const o=App.opts;
  document.querySelectorAll('[data-lab=port]').forEach(e=>e.style.display=o.ports?'':'none');
  document.querySelectorAll('[data-lab=coord]').forEach(e=>e.style.display=o.coords?'':'none');
  const gd=$('guide');if(gd)gd.style.display=o.quad?'':'none';
  const ar=$('arrows');if(ar)ar.style.display=o.arrows?'':'none';
}
function buildTimeline(){
  const sim=App.sim;let h='';
  sim.phases.forEach(p=>{const w=(p.end-p.start+1)/sim.T*100;h+=`<div class="seg" style="width:${w}%;background:${p.color}" title="${p.label}: rounds ${p.start}–${p.end}">${w>9?p.label:''}</div>`;});
  $('timeline').innerHTML=h+`<div class="cursor" id="tcur" style="left:0"></div>`;
}
function setRound(t){
  const sim=App.sim;t=Math.max(0,Math.min(sim.R,t));App.t=t;
  $('scrub').value=t;$('roundlabel').textContent=`Round ${t} / ${sim.R}`;$('tcur').style.left=`calc(${t/sim.T*100}% - 1px)`;
  $('svgbox').style.setProperty('--dur',(App.playing?Math.min(.7,.8/App.speed):.25)+'s');
  updateGrid(t);renderExplain(t);renderRobotsTab();renderSel();markRoundsList();renderCx();renderResults();
}
function clusterOffsets(m){const cols=Math.ceil(Math.sqrt(m)),rows=Math.ceil(m/cols),sp=18,a=[];for(let i=0;i<m;i++)a.push([(i%cols-(cols-1)/2)*sp,(Math.floor(i/cols)-(rows-1)/2)*sp]);return a;}
function updateGrid(t){
  const sim=App.sim,s=sim.s,snap=sim.history[t],log=sim.logs[t],by=new Map();
  snap.forEach(rb=>{const k=rb.r*s+rb.c;if(!by.has(k))by.set(k,[]);by.get(k).push(rb);});
  let badges='';
  by.forEach((list,k)=>{
    list.sort((a,b)=>a.id-b.id);
    const r=Math.floor(k/s),c=k%s,x=xOf(c),y=yOf(r),show=Math.min(list.length,16),offs=clusterOffsets(show);
    list.forEach((rb,i)=>{const el=$('rb'+rb.id);
      if(i<show){el.style.display='';el.style.transform=`translate(${x+offs[i][0]}px,${y+offs[i][1]}px)`;}else el.style.display='none';
      el.classList.toggle('settled',!!rb.settled&&!rb.byz);el.classList.toggle('sel',App.sel===rb.id);});
    if(list.length>show){badges+=`<g class="badgeN"><title>${list.length-show} more robots hidden on this node</title><rect x="${x+8}" y="${y-30}" width="32" height="15" rx="7.5"/><text x="${x+24}" y="${y-22.5}">+${list.length-show}</text></g>`;}
  });
  $('badges').innerHTML=badges;
  document.querySelectorAll('.edge.hot').forEach(e=>e.classList.remove('hot'));
  let ar='';const seen=new Set();
  if(log)log.robots.forEach(rb=>{
    if(!rb.dir)return;
    const [r1,c1]=rb.from,[r2,c2]=rb.to,key=`${r1},${c1}>${r2},${c2}`;
    const eid=(r1<r2||c1<c2)?`e-${r1}-${c1}-${r2}-${c2}`:`e-${r2}-${c2}-${r1}-${c1}`;
    const e=$(eid);if(e)e.classList.add('hot');
    if(!seen.has(key)){seen.add(key);const x1=xOf(c1),y1=yOf(r1),x2=xOf(c2),y2=yOf(r2);
      ar+=`<line class="arrow" x1="${x1+(x2-x1)*.28}" y1="${y1+(y2-y1)*.28}" x2="${x1+(x2-x1)*.72}" y2="${y1+(y2-y1)*.72}" marker-end="url(#ah)"/>`;}});
  $('arrows').innerHTML=ar;
}

/* ---------- explanation ---------- */
const ALGO=[
 'Input: square grid n = √n × √n, f ≤ n WEAK BYZANTINE robots (arbitrary behaviour, cannot forge ID)',
 '1  Each robot r_u (degree 4) reaches the boundary (degree 3) by moving in a straight line;',
 '2  if r_u is placed at a boundary node then',
 '3      r_u moves to the nearest corner (degree 2);',
 '4  Each robot r_u moves from one corner to another corner and learns √n, hence n;',
 '5  if n is even then   [BYZANTINE EXTENSION: declarations + remembered IDs + settle-with rule]',
 '6      n/4 lower-ID robots stay at their corner, the rest move to another corner;',
 '7      after 6√n rounds, from a corner with C_r robots, 2C_r/√n robots move into each column',
 '8  if n is odd then   [unchanged: Algorithm 1 already works for odd n]',
 '9      after 3√n rounds, corner robots move to the middle of the boundary (⌊√n/2⌋ hops);',
 '10     after 3.5√n rounds, robots at the boundary middle move ⌊√n/2⌋ hops at 90° to the centre;',
 '11     after 4√n rounds, the robots at the centre move together to a corner;',
 '12     after 5√n rounds, from the single corner with S_r robots, S_r/√n robots move into each column',
 '13 Each column disperses the robots across the column (lower ID → nearer the boundary);',
 '14 All the (non-Byzantine) robots settle at a unique node.'
];
function algoHTML(lines){const hl=new Set(lines);return '<pre class="algo">'+ALGO.map((l,i)=>`<div class="${(i===5||i===8)?'new ':''}${(i>0&&hl.has(i))?'hl':''}">${l.replace(/</g,'&lt;')}</div>`).join('')+'</pre>';}
const KIND_TXT={
  toBoundary:n=>`<b>${n}</b> correct robot(s) on internal nodes walk <b>straight</b> to the boundary.`,
  probe:n=>`<b>${n}</b> correct boundary robot(s) test their smallest port.`,
  ret:n=>`<b>${n}</b> correct robot(s) step back (that port led into the grid).`,
  slide:n=>`<b>${n}</b> correct robot(s) slide along the boundary to a corner.`,
  learn:n=>`<b>${n}</b> correct robot(s) walk corner→corner counting steps (learning √n).`,
  waitS:n=>`<b>${n}</b> correct robot(s) wait for round 3√n.`,
  evDeclare:n=>`<b>${n}</b> correct robot(s) <b>declare</b> STAY or MOVE.`,
  evStay:n=>`<b>${n}</b> correct robot(s) read declarations and stay.`,
  evExtra:n=>`<b>${n}</b> correct robot(s) read declarations and <b>walk to the next corner</b>.`,
  evTransit:n=>`<b>${n}</b> correct robot(s) are still walking along the boundary.`,
  evWait:n=>`<b>${n}</b> correct robot(s) hold their corner.`,
  toCol:n=>`<b>${n}</b> correct robot(s) walk to <b>their column</b>.`,
  inCol:n=>`<b>${n}</b> correct robot(s) wait at their column.`,
  disp:n=>`<b>${n}</b> correct robot(s) walk <b>into their column</b>.`,
  settle:n=>`<b>${n}</b> correct robot(s) <b>settle</b> and terminate.`,
  unsettled:n=>`<b>${n}</b> correct robot(s) <b>cannot find a safe slot</b>.`,
  odMid:n=>`<b>${n}</b> correct robot(s) walk to the <b>middle of a boundary side</b>.`,
  odWaitMid:n=>`<b>${n}</b> correct robot(s) wait at the boundary middle.`,
  odCenter:n=>`<b>${n}</b> correct robot(s) walk <b>to the centre</b>.`,
  odWaitCenter:n=>`<b>${n}</b> correct robot(s) wait at the centre.`,
  odWaitCorner:n=>`<b>${n}</b> correct robot(s) wait at the common corner.`
};
function phaseText(p,t,sim){
  const s=sim.s,n=sim.n,q=n/4;
  switch(p.key){
    case 'A':return{
      what:`<b>Stage 1 — every robot works alone.</b> Correct robots go straight to the boundary, slide to a corner, then walk to the next corner to count √n and wait for round 3√n = ${3*s}. <i>Byzantine robots do whatever they like here, but no correct robot ever waits for another robot, so they cannot delay or misdirect anyone.</i>`,
      why:`Correct robots use only their own position, port numbers and the common round counter. Nothing a Byzantine robot says or does is used in this stage.`,
      byz:`Byzantine robots may stay put, wander or walk the wrong way. They are simply not (yet) at a corner.`};
    case 'E_REB':{const b=Math.floor((t-3*s-1)/s)+1,off=(t-3*s-1)%s,t0=3*s+(b-1)*s+1;
      return{what:`<b>Stage 2 (n even) — rebalance corners, block ${b} of 3</b> (rounds ${t0}–${t0+s-1}). ${off===0?`<u>DECLARE round</u>: each correct robot reads the IDs present at its corner (IDs cannot be forged), sorts them, computes its rank and writes <b>STAY</b> (rank ≤ n/4 = ${q}, or its “settle-with” partner is known faulty) or <b>MOVE</b> into its memory. First it checks yesterday’s declarations against what robots really did.`:off===1?`<u>READ + MOVE round</u>: robots read each other’s declarations (a Byzantine robot may show something false, nothing, or different things to different robots), store the IDs they saw, mark robots that declared nothing as faulty, then MOVE-robots walk clockwise to the next corner.`:`MOVE-robots walk along the boundary (√n−1 = ${s-1} moves). The next DECLARE round is round ${t0+s}.`}`,
      why:`Capacity per corner is n/4 (one quadrant). The crash-fault trick “keep the n/4 lowest IDs” is kept, but now declarations are <b>cross-checked</b>: a correct robot always does what it declared, so any contradiction proves the other robot is faulty (no false accusations). The “settle-with” rule is used when slots are assigned (round 6√n+1): a correct robot only shares a slot with a robot it <i>knows</i> is faulty — so two correct robots never share a node.`,
      byz:`Byzantine robots count in rank lists (their IDs are real) but may lie in their declarations or not follow them. Contradictions are caught at the next declare round.`};}
    case 'E_COL':return{what:`<b>Stage 3 (n even) — walk to the column</b> (rounds ${6*s+1}–${6*s+s/2}). Each corner with c robots splits them into slots 0…c−1 by ID rank (m = ⌈c/(√n/2)⌉ per column; if c > n/4 slots are 0…n/4−1 and extras take the slot of a known-faulty partner). Robots walk along the boundary row to their column.`,
      why:`A slot (column, depth) is a unique node inside the corner’s quadrant. Slots come from ranks, so correct robots never collide.`,
      byz:`A Byzantine robot may sit on another robot’s slot — that is allowed: dispersion only forbids two <i>non-Byzantine</i> robots on one node.`};
    case 'E_DISP':return{what:`<b>Stage 4 (n even) — disperse inside the column</b> (rounds ${6*s+s/2+1}–${7*s}). Rank 0 stays on the boundary node, rank 1 one step further, … each robot settles at its depth.`,
      why:`Unique (column, depth) per rank ⇒ unique node per correct robot. Finished by 7√n = ${7*s}.`,byz:`Byzantine robots may be on the same nodes; they do not make correct robots settle anywhere else.`};
    case 'O_MID':return{what:`<b>Stage 2 (n odd) — corners → middle of a boundary side</b>. <i>Algorithm 1 is used unchanged for odd n.</i> Robots walk ⌊√n/2⌋ = ${Math.floor(s/2)} hops from their corner along the smallest-port direction.`,
      why:`For odd √n the middle of a side is unique.`,byz:`Byzantine robots cannot influence where correct robots walk.`};
    case 'O_CENTER':return{what:`<b>Stage 3 (n odd) — boundary middle → centre</b>. Robots turn 90° and walk ⌊√n/2⌋ hops to the <b>unique centre node</b>.`,
      why:`The centre is a place, not a robot. A leader-based gathering could be sabotaged by a Byzantine leader; a fixed place cannot.`,byz:`Byzantine robots may skip the centre. Nothing is lost: nobody waits for them.`};
    case 'O_CORNER':return{what:`<b>Stage 4 (n odd) — centre → one corner</b>. All robots that reached the centre move together using the Stage-1 rules and arrive at the same corner.`,
      why:`Now every correct robot is at one corner and sees the same set of IDs.`,byz:`Byzantine robots that came along are part of the ID list; Byzantine robots that did not are absent from it.`};
    case 'O_COL':return{what:`<b>Stage 5 (n odd) — walk to the column</b>. At round 5√n+1 all robots at the corner (correct <i>and</i> Byzantine, IDs unforgeable) are sorted by ID; m = ⌈S/√n⌉ per column; rank → (column, depth).`,
      why:`All correct robots at the corner see exactly the same ID set, hence compute the same ranks and unique slots. Claims made by Byzantine robots are never read.`,byz:`A Byzantine robot present shifts others’ ranks but cannot cause two correct robots to share a slot.`};
    case 'O_DISP':return{what:`<b>Stage 6 (n odd) — disperse inside the column</b>. Robots walk to their depth and settle. Done by round 7√n = ${7*s}.`,
      why:`Unique (column, depth) per rank ⇒ unique node per correct robot.`,byz:`Byzantine robots may stand on the same node as a correct one (allowed).`};
  }
  return{what:'',why:'',byz:''};
}
function configLines(snap,s){
  const m=new Map();snap.forEach(rb=>{const k=rb.r*s+rb.c;if(!m.has(k))m.set(k,[]);m.get(k).push(rb.byz?rb.id+'ᴮ':rb.id);});
  return [...m.keys()].sort((a,b)=>a-b).map(k=>`(${Math.floor(k/s)},${k%s}) ← ${pad(m.get(k))}`).join('\n');
}
function cornerTable(snap,s,q){
  const o={TL:[0,0],TR:[0,0],BL:[0,0],BR:[0,0]};
  snap.forEach(rb=>{const c=cornerId(s,rb.r,rb.c);if(c)o[c][rb.byz?1:0]++;});
  let h='<table><tr><th>corner</th>'+['TL','TR','BL','BR'].map(k=>`<th>${k}</th>`).join('')+'</tr><tr><td>correct robots</td>'+['TL','TR','BL','BR'].map(k=>`<td ${o[k][0]>q?'style="color:#b91c1c;font-weight:700"':''}>${o[k][0]}</td>`).join('')+'</tr><tr><td>Byzantine robots</td>'+['TL','TR','BL','BR'].map(k=>`<td>${o[k][1]}</td>`).join('')+'</tr></table>';
  return h+`<div class="small">Capacity of a corner’s quadrant = n/4 = ${q}.</div>`;
}
function renderExplain(t){
  const sim=App.sim,s=sim.s,n=sim.n,P=$('pExplain'),nByz=sim.byz.length;
  if(t===0){
    let h=`<h3>Initial configuration (before round 1)</h3>
    <div class="callout">Oriented mesh of ${s}×${s} = <b>n = ${n}</b> anonymous nodes; blue dots = nodes, orange numbers = ports. <b>k = ${sim.k}</b> robots with unique IDs start on arbitrary nodes. <b>${nByz} of them are weak Byzantine</b> (red diamonds). Press <b>Next</b> (→) or <b>Play</b>.</div>
    <div class="callout crash"><b>Weak Byzantine fault model (Definition 2.2 / Section 4.2):</b> a Byzantine robot may behave arbitrarily — deviate from the algorithm, pass wrong information, tell different robots different things — <b>except</b> that it cannot change or lie about its own ID. Goal: every node holds at most one <i>non-Byzantine</i> robot, and the non-Byzantine robots terminate.</div>
    <div class="callout why"><b>Why IDs matter:</b> because IDs are unforgeable, all correct robots at one node see the <i>same</i> ID list. Rank-based decisions (like “I am the 3rd smallest ID here”) are therefore consistent for all correct robots, even if Byzantine robots lie about everything else.</div>
    <h4>Byzantine robots in this run</h4>
    ${nByz?`<table><tr><th>ID</th><th>Behaviour</th><th>What it does</th></tr>${sim.byz.map(b=>`<tr class="byz"><td>${b.id}</td><td>${STRATS[b.strat].label}</td><td>${STRATS[b.strat].info}</td></tr>`).join('')}</table>`:'<div class="small">None — this is then the plain crash-free run of Algorithm 1.</div>'}
    <h4>Algorithm (Algorithm 1 + Byzantine extension)</h4>${algoHTML([])}
    <h4>Schedule</h4><table><tr><th>Stage</th><th>Rounds</th><th>Paper bound</th></tr>${sim.phases.map(p=>`<tr><td><span class="badge" style="background:${p.color}">${p.key}</span> ${p.label}</td><td>${p.start}–${p.end}</td><td>${p.bound}</td></tr>`).join('')}</table>
    <h4>Configuration</h4><pre class="mono" style="max-height:140px;overflow:auto;background:#f8fafc;padding:6px;border-radius:6px">${configLines(sim.history[0],s)}</pre>`;
    P.innerHTML=h;return;
  }
  const log=sim.logs[t],ph=phaseAt(t,s),pt=phaseText(ph,t,sim),now=sim.history[t];
  const acts=Object.keys(log.kinds).filter(k=>KIND_TXT[k]).map(k=>`<li>${KIND_TXT[k](log.kinds[k])}</li>`).join('');
  const lines=new Set();log.robots.forEach(r=>(r.lines||[]).forEach(l=>lines.add(l)));
  let h=`<h3>Round ${t} <span class="badge" style="background:${ph.color}">${ph.key} · ${ph.label}</span></h3>
  <div class="small">Phase window: rounds ${ph.start}–${ph.end} · Algorithm 1 line(s) ${ph.lines}</div>
  <div class="callout">${pt.what}</div><div class="callout why"><b>Why?</b> ${pt.why}</div>`;
  h+=`<h4>What the correct robots do</h4><ul style="margin:4px 0 4px 18px;padding:0">${acts||'<li>No active correct robots.</li>'}</ul>`;
  if(log.byz.length){
    h+=`<div class="callout crash"><b>😈 Byzantine robots this round</b> — ${pt.byz}<table style="margin-top:6px"><tr><th>ID</th><th>behaviour</th><th>a correct robot would</th><th>actually did</th><th>showed to others</th></tr>`+
    log.byz.map(b=>`<tr class="byz"><td><b>${b.id}</b></td><td>${b.strat}</td><td>${b.intended&&b.intended.text?b.intended.text:'wait'}${b.intended&&b.intended.dir?` <i>(move ${DIRNAME[b.intended.dir]})</i>`:''}</td><td>${b.say||''}${b.dir?` <i>(moved ${DIRNAME[b.dir]})</i>`:' <i>(stayed)</i>'}</td><td>${b.claim}</td></tr>`).join('')+`</table></div>`;
  }
  const det=log.events.filter(e=>e.type==='detect');
  if(det.length)h+=`<div class="callout warn"><b>🔎 Detections this round</b> (sound: a correct robot is never accused)<br>${det.slice(0,12).map(e=>e.text).join('<br>')}${det.length>12?`<br>… and ${det.length-12} more`:''}</div>`;
  const oth=log.events.filter(e=>e.type!=='detect');
  if(oth.length)h+=`<div class="callout ok">${oth.slice(0,8).map(e=>e.text).join('<br>')}${oth.length>8?`<br>… and ${oth.length-8} more events`:''}</div>`;
  if(sim.even&&(ph.key==='E_REB'||t===6*s+1))h+=`<h4>Corner loads after this round</h4>`+cornerTable(now,s,n/4);
  h+=`<div class="kv" style="margin:8px 0"><b>Moves this round</b><span>${log.moves}</span><b>Local reads (messages)</b><span>${log.messages} <span class="small">(each robot reads the memory of every co-located robot)</span></span><b>Correct / Byzantine / settled</b><span>${now.filter(r=>!r.byz).length} / ${now.filter(r=>r.byz).length} / ${now.filter(r=>r.settled).length}</span></div>`;
  h+=`<h4>Algorithm lines executed by correct robots</h4>${algoHTML([...lines])}`;
  h+=`<details open><summary>Robot-by-robot: communicate → compute → move</summary><label class="chk"><input type="checkbox" id="showIdle"> include waiting robots</label>
  <div style="max-height:340px;overflow:auto"><table id="rtab"><tr><th>ID</th><th>State before</th><th>Communicate (sees)</th><th>Compute / decision</th><th>Move</th></tr></table></div></details>
  <details><summary>Configuration after round ${t}</summary><pre class="mono" style="max-height:200px;overflow:auto;background:#f8fafc;padding:6px;border-radius:6px">${configLines(now,s)}</pre></details>`;
  P.innerHTML=h;
  const fill=()=>{const show=$('showIdle').checked;let rows='';
    log.robots.forEach(r=>{
      if(r.idle&&!show&&!['settle','evStay','evDeclare','unsettled'].includes(r.kind)&&!r.byz)return;
      rows+=`<tr class="${r.byz?'byz':''} ${App.sel===r.id?'sel':''}" data-id="${r.id}"><td><b>${r.id}</b>${r.byz?' 😈':''}</td><td>${MODE_LABEL[r.before]||r.before}</td><td>${r.reads.length?'IDs: '+pad(r.reads):'nobody else here'}</td><td>${r.text}${r.why?`<div class="small">↳ ${r.why}</div>`:''}</td><td>${r.dir?`(${r.from})→(${r.to}) ${DIRNAME[r.dir]}`:'stay'}</td></tr>`;});
    $('rtab').innerHTML=$('rtab').rows[0].outerHTML+rows;
    $('rtab').querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>{App.sel=+tr.dataset.id;updateGrid(App.t);renderSel();});};
  $('showIdle').onchange=fill;fill();
}

/* ---------- robots / selection ---------- */
function bitsOf(x){return Math.max(1,Math.ceil(Math.log2(x+1)));}
function memBits(sim){
  const s=sim.s,k=sim.k,idb=bitsOf(k);
  const rows=[['Robot ID',idb,'O(log n)'],['Round counter (≤ 7√n)',bitsOf(7*s),'O(log n)'],['Learned √n',bitsOf(s),'O(log n)'],['Step / hop counters',bitsOf(s),'O(log n)'],
    ['Rank, target column, target depth',bitsOf(k)+2*bitsOf(s),'O(log n)'],['Mode (≈ 25 states) + heading + declaration',5+2+2,'O(1)']];
  const base=rows.reduce((a,r)=>a+r[1],0);
  return{rows,base,extra:sim.maxMem*idb,extraIds:sim.maxMem,worst:3*k*idb};
}
function renderRobotsTab(){
  const sim=App.sim,snap=sim.history[App.t];
  let h=`<h3>Robot states after round ${App.t}</h3><div class="small">Click a row to highlight the robot on the grid. “Known faulty” = IDs that this correct robot has proven faulty.</div><div style="max-height:62vh;overflow:auto"><table><tr><th>ID</th><th>Kind</th><th>Status</th><th>Node</th><th>State</th><th>Memory</th><th>Moves</th></tr>`;
  snap.forEach(rb=>{
    const kind=rb.byz?`😈 ${rb.strat}`:'correct';
    const st=rb.byz?'—':rb.settled?`settled @${rb.settleRound}`:rb.mode==='UNSETTLED'?'UNSETTLED':'active';
    const mem=rb.byz?(rb.detectedBy.length?`exposed by ${rb.detectedBy.length} robot(s)`:'not exposed'):[rb.s?`√n=${rb.s}`:'',rb.rank!==null?`rank=${rb.rank}`:'',rb.decl?`decl=${rb.decl}`:'',rb.col!==null?`col=${rb.col}`:'',rb.depth!==null?`depth=${rb.depth}`:'',rb.memIds?`remembers ${rb.memIds} IDs`:'',rb.F.length?`known faulty: ${rb.F.join(',')}`:''].filter(Boolean).join(', ')||'—';
    h+=`<tr data-id="${rb.id}" class="${rb.byz?'byz':rb.mode==='UNSETTLED'?'bad':rb.settled?'settled':''} ${App.sel===rb.id?'sel':''}"><td><b>${rb.id}</b></td><td>${kind}</td><td>${st}</td><td>(${rb.r},${rb.c})</td><td>${rb.byz?'—':(MODE_LABEL[rb.mode]||rb.mode)}</td><td>${mem}</td><td>${rb.moves}</td></tr>`;});
  $('pRobots').innerHTML=h+'</table></div>';
  $('pRobots').querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>{App.sel=+tr.dataset.id;App.selNode=null;updateGrid(App.t);renderSel();renderRobotsTab();});
}
function renderSel(){
  const sim=App.sim,s=sim.s,snap=sim.history[App.t],el=$('selpanel');
  document.querySelectorAll('.rb').forEach(e=>e.classList.toggle('sel',App.sel===+e.dataset.id));
  if(App.sel){const rb=snap[App.sel-1];if(!rb){el.textContent='';return;}
    el.innerHTML=`<b>Robot ${rb.id}</b> — ${rb.byz?`<span style="color:#b91c1c"><b>Byzantine</b> (${rb.strat})</span>`:'correct'} at (${rb.r},${rb.c}) · ${rb.byz?STRATS[rb.strat].info:(rb.settled?`settled in round ${rb.settleRound}`:(MODE_LABEL[rb.mode]||rb.mode))} · started at (${rb.origin}) · moves: ${rb.moves}
    ${rb.byz?` <button class="sm" id="bMakeOk">make it correct</button>`:` <button class="sm danger" id="bMakeByz">😈 Make it Byzantine (${$('bStrat').value})</button>`}`;
    const a=$('bMakeByz');if(a)a.onclick=()=>addByz(rb.id,$('bStrat').value,+$('bParam').value||null);
    const b=$('bMakeOk');if(b)b.onclick=()=>{App.byz=App.byz.filter(x=>x.id!==rb.id);setCustom();rebuild(true);};
  }else if(App.selNode){const [r,c]=App.selNode,ids=snap.filter(x=>x.r===r&&x.c===c),ds=dirsAt(s,r,c);
    el.innerHTML=`<b>Node (${r},${c})</b> — ${nodeKind(s,r,c)}${cornerId(s,r,c)?' ('+cornerId(s,r,c)+')':''}, degree ${ds.length}. Ports: ${ds.map((d,i)=>`${i+1}→${DIRNAME[d]}`).join(', ')}. Robots here (${ids.length}): ${ids.length?pad(ids.map(x=>x.byz?x.id+'ᴮ':x.id)):'none'}.`;}
  else el.textContent='Click a robot or a node on the grid to inspect it.';
}

/* ---------- rounds list ---------- */
function buildRoundsList(){
  const sim=App.sim;let h=`<h3>Every round</h3><div class="small">Click a round to jump to it.</div><div class="rlist"><div data-t="0">Round 0 — initial configuration</div>`;
  for(let t=1;t<=sim.R;t++){const l=sim.logs[t],ph=phaseAt(t,sim.s),dt=l.events.filter(e=>e.type==='detect').length,st=l.events.filter(e=>e.type==='settle').length;
    h+=`<div data-t="${t}"><span class="badge" style="background:${ph.color}">${ph.key}</span> Round ${t}: ${l.moves} move(s), ${l.messages} read(s)${dt?` · 🔎 ${dt} detection(s)`:''}${st?` · ${st} settled`:''}</div>`;}
  $('pRounds').innerHTML=h+'</div>';
  $('pRounds').querySelectorAll('[data-t]').forEach(d=>d.onclick=()=>{pause();setRound(+d.dataset.t);});
}
function markRoundsList(){$('pRounds').querySelectorAll('[data-t]').forEach(e=>e.classList.toggle('cur',+e.dataset.t===App.t));}

/* ---------- complexity ---------- */
function renderCx(){
  const sim=App.sim,s=sim.s,n=sim.n,k=sim.k,t=App.t,R=sim.R,full=sim.history[R];
  const sumTo=(a,T)=>a.slice(0,T+1).reduce((x,y)=>x+y,0);
  const mvF=sumTo(sim.metrics.moves,R),mvN=sumTo(sim.metrics.moves,t),msF=sumTo(sim.metrics.msgs,R),msN=sumTo(sim.metrics.msgs,t);
  const maxMv=Math.max(0,...full.filter(r=>!r.byz).map(r=>r.moves)),mem=memBits(sim),lower=2*(s-1),upper=7*s,f=sim.byz.length;
  let ptab='';
  sim.phases.forEach(p=>{let first=null,last=null,mv=0;for(let r=p.start;r<=Math.min(p.end,R);r++){const l=sim.logs[r];if(l.moves>0){if(first===null)first=r;last=r;mv+=l.moves;}}
    ptab+=`<tr><td><span class="badge" style="background:${p.color}">${p.key}</span> ${p.label}</td><td>${p.bound}</td><td>${p.start}–${p.end}</td><td>${first===null?'no movement':first+'–'+last}</td><td>${mv}</td></tr>`;});
  const chart=(arr,color,label)=>{const mx=Math.max(1,...arr),w=Math.max(2,Math.floor(440/Math.max(1,arr.length)));
    let b=`<svg viewBox="0 0 ${arr.length*w+2} 70" style="width:100%;height:80px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">`;
    arr.forEach((v,i)=>{const hh=v/mx*60;b+=`<rect x="${i*w+1}" y="${66-hh}" width="${w-1}" height="${hh}" fill="${color}" opacity="${i===t?1:.55}"/>`;});
    return b+`<text x="4" y="10" font-size="9" fill="#475569">${label} (max ${mx})</text></svg>`;};
  $('pCx').innerHTML=`<h3>Complexity analysis</h3>
  <div class="callout"><b>Theorem 4.2 (paper):</b> for an oriented square grid with n nodes, n robots and f ≤ n <b>weak Byzantine</b> robots, dispersion is solved deterministically in <b>O(√n) rounds</b> using <b>O(n log n) bits</b> of memory per robot. (Crash faults need only O(log n) bits — Theorem 4.1.) Remark: also true for any k ≤ n.</div>
  <h4>Time (rounds)</h4><div class="kv"><b>This run</b><span>√n = ${s}, n = ${n}, ${sim.even?'even':'odd'} case, k = ${k}, f = ${f} Byzantine</span>
  <b>Lower bound Ω(√n)</b><span>diameter 2(√n−1) = ${lower}</span><b>Paper’s upper bound</b><span>7√n = ${upper} (same as Algorithm 1: the Byzantine extension adds no rounds — declarations and verification happen inside the existing √n-round blocks)</span>
  <b>Observed</b><span><b>${R}</b> rounds until all correct robots finished (${(R/lower).toFixed(2)} × diameter, ${(R/upper*100).toFixed(0)}% of 7√n)</span></div>
  <div class="small" style="margin:6px 0">${sim.even?'7√n (even) = 2√n (reach corner) + √n (learn √n) + 3√n (3 blocks of √n: declare, read, walk) + √n/2 (walk to column) + √n/2 (walk into column).':'7√n (odd) = 2√n + √n + √n/2 + √n/2 + √n (centre → corner) + √n (to column) + √n (into column). Identical to the crash algorithm — odd n needs no change.'}</div>
  <table><tr><th>Stage</th><th>Paper bound</th><th>Window</th><th>Movement observed</th><th>Moves</th></tr>${ptab}</table>
  <h4>Movement complexity</h4><div class="kv"><b>Total moves</b><span>${mvF} (${mvN} up to round ${t}; Byzantine robots included)</span><b>Max moves of a correct robot</b><span>${maxMv} ≤ 7√n = ${upper}</span><b>Bound</b><span>≤ 1 edge per round per robot ⇒ O(n√n) total (derived from Theorem 4.2; not separately stated in the paper)</span></div>${chart(sim.metrics.moves,'#2563eb','moves per round')}
  <h4>Message complexity</h4><div class="kv"><b>Model</b><span>Local communication only: co-located robots read each other’s memory (declarations). The paper proves no message bound.</span><b>Counted here</b><span>node with j robots in a round → j(j−1) reads</span><b>Total reads</b><span>${msF} (${msN} up to round ${t})</span><b>Derived worst case</b><span>≤ n(n−1) per round ⇒ O(n²√n)</span></div>${chart(sim.metrics.msgs,'#7c3aed','reads per round')}
  <h4>Memory per robot</h4><table><tr><th>Register</th><th>Bits (this n)</th><th>Asymptotic</th></tr>${mem.rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}
  <tr><td><b>Remembered IDs from earlier locations</b> (even n only) — observed max ${mem.extraIds} IDs</td><td>${mem.extra}</td><td><b>O(n log n)</b></td></tr>
  <tr><td><b>Total observed (largest correct robot)</b></td><td><b>${mem.base+mem.extra}</b></td><td><b>O(n log n)</b></td></tr></table>
  <p class="small">The paper: the even-n extension “requires more memory for the robots to remember all the robots’ IDs” seen at earlier locations. A robot visits at most 3 corners, each with ≤ n IDs ⇒ ≤ 3n·log n bits (worst case here: ${mem.worst}). Odd n: O(log n) as in Algorithm 1. Lower bound Ω(log k) bits.</p>
  <h4>Space complexity</h4><div class="kv"><b>Nodes</b><span>memoryless, ID-less: 0 bits; n = ${n} nodes, m = ${2*s*(s-1)} edges</span><b>Robots</b><span>k × O(n log n) = O(n² log n) bits in total for k = n (even case)</span></div>
  <h4>Optimality</h4><div class="callout ok">Time O(√n) matches the Ω(√n) lower bound ⇒ optimal. Memory O(n log n) is above the Ω(log k) lower bound, which is why the paper calls the Byzantine memory bound a cost of fault tolerance.</div>`;
}

/* ---------- results ---------- */
function renderResults(){
  const sim=App.sim,s=sim.s,n=sim.n,t=App.t,R=sim.R,snap=sim.history[t],done=(t===R);
  const nf=snap.filter(r=>!r.byz),bz=snap.filter(r=>r.byz);
  const occ=new Map(),boc=new Map();
  nf.forEach(r=>{const k=r.r*s+r.c;(occ.get(k)||occ.set(k,[]).get(k)).push(r);});
  bz.forEach(r=>{const k=r.r*s+r.c;(boc.get(k)||boc.set(k,[]).get(k)).push(r);});
  const settled=nf.filter(r=>r.settled),uns=nf.filter(r=>r.mode==='UNSETTLED');
  const dup=[...occ.values()].filter(a=>a.length>1);
  const mvN=sim.metrics.moves.slice(0,t+1).reduce((a,b)=>a+b,0),msN=sim.metrics.msgs.slice(0,t+1).reduce((a,b)=>a+b,0);
  let h=`<h3>${done?'Final result':'Live status'} (after round ${t}${done?'':' of '+R})</h3>`;
  if(done)h+=sim.success?`<div class="callout ok"><b>✔ Dispersion achieved.</b> All ${nf.length} correct robots settled and terminated, no node holds two correct robots — despite ${bz.length} Byzantine robot(s).</div>`
    :`<div class="callout crash"><b>✖ Dispersion NOT achieved for all correct robots.</b> ${uns.length?uns.length+' correct robot(s) could not find a safe slot (IDs: '+uns.map(r=>r.id).join(', ')+'). ':''}${dup.length?dup.length+' node(s) hold two correct robots. ':''}This is a scenario the paper’s proof sketch does not cover (see “Model & honesty notes” and “Stress test”).</div>`;
  else h+=`<div class="callout warn">Still running — press ⏭ for the final result.</div>`;
  h+=`<div class="kv"><b>Termination</b><span>${done?(sim.allSettled?'all correct robots terminated at round '+R+' (≤ 7√n = '+7*s+')':'NOT all correct robots terminated'):'running'}</span>
  <b>Total rounds</b><span>${t}${done?'':' so far'}</span><b>Total movements</b><span>${mvN}</span><b>Total local reads</b><span>${msN}</span>
  <b>Robots</b><span>${sim.k} total · ${nf.length} correct · ${bz.length} Byzantine · ${settled.length} settled</span>
  <b>Nodes</b><span>${occ.size} occupied by a correct robot · ${n-occ.size} without a correct robot · ${[...boc.keys()].filter(k=>occ.has(k)).length} shared with a Byzantine robot (allowed) · ${[...boc.keys()].filter(k=>!occ.has(k)).length} Byzantine-only</span>
  <b>Byzantine robots</b><span>${bz.length?bz.map(r=>`#${r.id} [${r.strat}] at (${r.r},${r.c})${r.detectedBy.length?`, exposed by ${r.detectedBy.length}`:''}`).join('; '):'none'}</span></div>`;
  h+=`<h4>Node map (row 0 on top)</h4><div class="mini" style="grid-template-columns:repeat(${s},1fr)">`;
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){const k=r*s+c,o=occ.get(k)||[],b=boc.get(k)||[];
    const st=o.filter(x=>x.settled);
    h+=`<div class="${o.length>1?'byzo':st.length&&b.length?'both':st.length?'occ':o.length?'mv':b.length?'byzo':''}" title="(${r},${c})">${o.map(x=>x.id).join(',')}${b.length?`<br><span style="color:#b91c1c">${b.map(x=>x.id+'ᴮ').join(',')}</span>`:''}</div>`;}
  h+=`</div><div class="small">green = settled correct robot · amber = correct robot sharing with Byzantine (allowed) · blue = correct robot still travelling · red = Byzantine only (or violation)</div>`;
  h+=`<h4>Each robot</h4><div style="max-height:260px;overflow:auto"><table><tr><th>ID</th><th>Kind</th><th>Start</th><th>Final / current</th><th>Status</th><th>Moves</th></tr>`;
  snap.forEach(r=>{h+=`<tr class="${r.byz?'byz':r.mode==='UNSETTLED'?'bad':r.settled?'settled':''}"><td><b>${r.id}</b></td><td>${r.byz?'😈 '+r.strat:'correct'}</td><td>(${r.origin})</td><td>(${r.r},${r.c})</td><td>${r.byz?'—':r.settled?'settled @'+r.settleRound:r.mode==='UNSETTLED'?'UNSETTLED':'travelling'}</td><td>${r.moves}</td></tr>`;});
  $('pRes').innerHTML=h+'</table></div>';
}

/* ---------- stress test ---------- */
function runStress(){
  const s=App.s,n=s*s,TR=s>=8?20:s>=6?30:50,rows=[];
  const R=rngFn(12345+s);
  const pools=[['(no Byzantine robots)',[]],...ALLS.map(a=>[a,[a]]),['all handled behaviours mixed',SAFE],['all behaviours incl. ⚠ mixed',ALLS]];
  let pi=0;
  const step=()=>{
    if(!active||!$('pStress'))return;
    if(pi>=pools.length){finish();return;}
    $('pStress').innerHTML=`<div class="small">Running stress test… ${pi}/${pools.length} behaviours done</div>`;
    runRow(pools[pi]);pi++;setTimeout(step,10);
  };
  const runRow=([name,pool])=>{
    let ok=0,runs=0;
    for(let i=0;i<TR;i++){
      const k=R()<.2?1+Math.floor(R()*n):n,pos=[];
      const mode=i%4,a=[Math.floor(R()*s),Math.floor(R()*s)];
      for(let j=0;j<k;j++){
        if(mode===0)pos.push([Math.floor(R()*s),Math.floor(R()*s)]);else if(mode===1)pos.push([a[0],a[1]]);
        else if(mode===2)pos.push(R()<.5?a:[Math.floor(R()*s),Math.floor(R()*s)]);
        else{const sd=Math.floor(R()*4),p=Math.floor(R()*s);pos.push(sd===0?[0,p]:sd===1?[s-1,p]:sd===2?[p,0]:[p,s-1]);}}
      const byz=[],used=new Set();
      if(pool.length){const f=1+Math.floor(R()*Math.max(1,Math.floor(k/2)));
        for(let j=0;j<f;j++){const id=1+Math.floor(R()*k);if(used.has(id))continue;used.add(id);const st=pool[Math.floor(R()*pool.length)];byz.push({id,strat:st,param:st==='crashlike'?1+Math.floor(R()*6*s):null});}}
      const sim=simulate({s,pos,byz,seed:i+1});runs++;if(sim.success)ok++;
    }
    rows.push([name,runs,ok]);
  };
  const finish=()=>{
  let h=`<h3>Stress test — grid ${s}×${s} (${s%2?'odd':'even'} n)</h3><div class="callout warn">Each row runs ${TR} random scenarios (random placement, random number f of Byzantine robots up to k/2, random IDs). “Success” = every correct robot settled and no two correct robots share a node.</div>
  <table><tr><th>Byzantine behaviour</th><th>runs</th><th>success</th></tr>${rows.map(r=>`<tr class="${r[2]===r[1]?'settled':'bad'}"><td>${STRATS[r[0]]?STRATS[r[0]].label:r[0]}</td><td>${r[1]}</td><td>${r[2]} / ${r[1]} (${(r[2]/r[1]*100).toFixed(0)}%)</td></tr>`).join('')}</table>
  <p class="small">Odd grids use Algorithm 1 unchanged and should be 100% for every behaviour. For even grids the paper only sketches the extension; rows below 100% mark behaviours (⚠) that inflate a corner at the last moment — see “Model &amp; honesty notes”.</p>`;
  $('pStress').innerHTML=h;
  };
  step();
}

/* ---------- about ---------- */
function buildAbout(){
  $('pAbout').innerHTML=`<h3>What the paper actually says (Section 4.2/4.3, Definition 2.2, Theorem 4.2, Lemma 2)</h3>
  <ul style="margin:4px 0 4px 18px;padding:0">
  <li><b>Fault model:</b> weak Byzantine robots “behave arbitrarily (deviate from the algorithm, pass wrong information, …) except to falsify their own identity.” Up to f ≤ n of n robots.</li>
  <li><b>Goal (Def. 2.2):</b> every node holds at most one <i>non-Byzantine</i> robot; those robots terminate.</li>
  <li><b>Odd n:</b> “the same Algorithm 1 works correctly” — simulated exactly as in the crash-fault simulator.</li>
  <li><b>Even n:</b> Algorithm 1 is extended: each corner should hold at most n/4 robots; a higher-ID robot settles at the next corner if the current corner has fewer than n/4 robots, <i>excluding faulty robots known to it</i>; robots at an overfull corner declare with whom they would settle, a robot that does not declare is treated as faulty; robots remember the IDs they saw at earlier locations (hence O(n log n) bits).</li>
  <li><b>Result:</b> O(√n) rounds, O(n log n) bits per robot; also for k ≤ n and rectangular grids.</li></ul>
  <h3>Honesty notes — please read</h3>
  <div class="callout warn">The ICDCN paper defers this section to the arXiv version, and that version gives <b>no separate pseudocode</b> for the Byzantine case and only a sketch of the proof of Lemma 2 (“due to space constraint”). I did <b>not</b> have more than that, so I had to formalise the even-n extension myself. What is paper-stated vs my formalisation:
  <ol style="margin:4px 0 0 18px;padding:0">
  <li><b>Paper:</b> odd n = Algorithm 1. <b>Here:</b> exactly that. Correct robots read only IDs and positions, never anybody’s claims, so Byzantine robots can neither change ranks consistently-for-some nor create a collision. (Dispersion allows a Byzantine robot on a correct robot’s node.)</li>
  <li><b>Paper:</b> “declare”, “not declaring ⇒ faulty”, “remember IDs seen earlier”, “known faulty”, “settle with”. <b>Here:</b> each block = DECLARE round (rank → STAY/MOVE), READ+MOVE round (read declarations, store IDs, flag silent robots), then √n−2 walking rounds. At the next declare round declarations are checked against reality; only <i>contradictions</i> (declared STAY but gone / declared MOVE but still here / failed to arrive / appears where it should not) mark a robot faulty. A correct robot always acts as it declared, so no correct robot is ever accused.</li>
  <li><b>My choice:</b> ranks and slots always use <i>all</i> robots present (so correct robots at a node agree). During the 3 rebalancing blocks the rule is the plain “n/4 lowest IDs stay” rule (an early version of mine let robots share with known-faulty partners already there; my tests showed that strands robots whenever the faulty partner then walks away). “Known faulty” is used only at slot assignment: a robot ranked above n/4 may take the slot of rank (r−n/4) only if it knows that robot is faulty — so two correct robots never share a slot.</li>
  <li><b>Known gap:</b> if a Byzantine robot (e.g. ⚠ deserter, random walker, wrong-way walker) drops onto a full corner just before the final assignment and no correct robot there has ever seen it misbehave, a correct robot may be left without a safe slot (it shows as UNSETTLED). The paper’s Lemma 2 proof sketch skips exactly this strategy discussion. The “Stress test” tab measures how often it happens.</li>
  <li>Same interpretation choices as the crash simulator: ports numbered clockwise from West, clockwise corner-to-corner walk to learn √n, columns reached along the boundary row.</li></ol></div>
  <h3>Model</h3><ul style="margin:4px 0 4px 18px;padding:0">
  <li>√n × √n oriented mesh, anonymous memoryless nodes, port labels only; corners degree 2, boundary degree 3, internal degree 4.</li>
  <li>Synchronous Communicate–Compute–Move; local communication: co-located robots read each other’s memory. A Byzantine robot may show any memory content — even different content to different readers.</li>
  <li>Unique O(log n)-bit IDs, unforgeable.</li></ul>
  <h3>Byzantine behaviours you can assign</h3>
  <table><tr><th>Behaviour</th><th>Description</th></tr>${ALLS.map(a=>`<tr><td>${STRATS[a].label}</td><td>${STRATS[a].info}</td></tr>`).join('')}</table>
  <p class="small">Paper: R. Banerjee, M. Kumar, A. R. Molla. “Optimal Fault-Tolerant Dispersion on Oriented Grids.” ICDCN 2025. arXiv:2410.17813.</p>`;
}

/* ---------- Byzantine list ---------- */
function renderByzList(){
  const el=$('byzList');
  if(!App.byz.length){el.innerHTML='<div class="small">No Byzantine robots.</div>';return;}
  el.innerHTML=App.byz.slice().sort((a,b)=>a.id-b.id).map(b=>`<div class="byzrow"><div class="top"><span>😈 robot <b>${b.id}</b>${b.param?` · round ${b.param}`:''}</span><button class="sm" data-id="${b.id}">✕</button></div><select data-sid="${b.id}">${ALLS.map(a=>`<option value="${a}" ${a===b.strat?'selected':''}>${STRATS[a].label}</option>`).join('')}</select></div>`).join('');
  el.querySelectorAll('button').forEach(x=>x.onclick=()=>{App.byz=App.byz.filter(b=>b.id!==+x.dataset.id);setCustom();rebuild(true);});
  el.querySelectorAll('select').forEach(x=>x.onchange=()=>{const b=App.byz.find(b=>b.id===+x.dataset.sid);b.strat=x.value;setCustom();rebuild(true);});
}
function setCustom(){App.scen='custom';$('selScen').value='custom';}
function addByz(id,strat,param){
  id=+id;if(!(id>=1&&id<=App.k)){alert('Robot ID must be between 1 and '+App.k);return;}
  App.byz=App.byz.filter(b=>b.id!==id);App.byz.push({id,strat,param:STRATS[strat].param?(param||4*App.s):null});setCustom();rebuild(true);
}

/* ---------- playback & init ---------- */
function pause(){App.playing=false;clearTimeout(App.timer);$('bPlay').textContent='▶ Play';}
function play(){
  if(App.t>=App.sim.R)setRound(0);
  App.playing=true;$('bPlay').textContent='⏸ Pause';
  const tick=()=>{if(!App.playing)return;if(App.t>=App.sim.R){pause();return;}setRound(App.t+1);App.timer=setTimeout(tick,1000/App.speed);};
  App.timer=setTimeout(tick,200);
}
function init(){
  const selS=$('selS');for(let s=3;s<=9;s++){const o=document.createElement('option');o.value=s;o.textContent=`${s} × ${s}  (n = ${s*s}, ${s%2?'odd':'even'})`;selS.appendChild(o);}selS.value=App.s;
  $('bStrat').innerHTML=ALLS.map(a=>`<option value="${a}">${STRATS[a].label}</option>`).join('');
  $('inK').value=App.k;
  const full=()=>{pause();$('pStress').innerHTML='';if(App.scen==='custom')App.scen='demo';applyPreset(App.scen);$('selScen').value=App.scen;rebuild(false);};
  selS.onchange=()=>{App.s=+selS.value;App.k=App.s*App.s;$('inK').value=App.k;full();};
  $('inK').onchange=()=>{App.k=Math.max(1,Math.min(App.s*App.s,+$('inK').value||1));$('inK').value=App.k;full();};
  $('btnReseed').onclick=()=>{App.seed=1+Math.floor(Math.random()*999983);full();};
  $('selScen').onchange=()=>{App.scen=$('selScen').value;pause();if(App.scen!=='custom')applyPreset(App.scen);rebuild(false);};
  $('btnRand').onclick=()=>{App.scen='random';$('selScen').value='random';pause();applyPreset('random');rebuild(false);};
  $('btnAddByz').onclick=()=>addByz($('bId').value,$('bStrat').value,+$('bParam').value||null);
  $('btnClearByz').onclick=()=>{App.byz=[];setCustom();rebuild(true);};
  [['oPorts','ports'],['oCoords','coords'],['oQuad','quad'],['oArrows','arrows']].forEach(([id,k])=>{$(id).onchange=()=>{App.opts[k]=$(id).checked;applyDisplayOpts();};});
  $('btnDownload').onclick=()=>{const sim=App.sim;
    const data={paper:'Optimal Fault-Tolerant Dispersion on Oriented Grids (ICDCN 2025) — weak Byzantine',s:sim.s,n:sim.n,k:sim.k,rounds:sim.R,byzantine:sim.byz,success:sim.success,
      log:sim.logs.slice(1).map(l=>({round:l.t,phase:l.phase,moves:l.moves,reads:l.messages,events:l.events,robots:l.robots.map(r=>({id:r.id,byzantine:r.byz,from:r.from,to:r.to,state:r.before,decision:r.text}))}))};
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,1)],{type:'application/json'}));a.download='byzantine-dispersion-log.json';a.click();};
  $('bReset').onclick=()=>{pause();setRound(0);};$('bPrev').onclick=()=>{pause();setRound(App.t-1);};$('bNext').onclick=()=>{pause();setRound(App.t+1);};$('bEnd').onclick=()=>{pause();setRound(App.sim.R);};
  $('bPlay').onclick=()=>{App.playing?pause():play();};$('scrub').oninput=()=>{pause();setRound(+$('scrub').value);};
  $('speed').oninput=()=>{App.speed=Math.pow(2,+$('speed').value);$('speedlab').textContent=(App.speed<1?App.speed.toFixed(2):App.speed.toFixed(1)).replace(/\.0$/,'')+'×';};
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
    document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.id===t.dataset.p));
    if(t.dataset.p==='pStress'&&!$('pStress').innerHTML.trim()){$('pStress').innerHTML='<div class="small">Running…</div>';setTimeout(runStress,30);}});
  if(onKey)document.removeEventListener('keydown',onKey);
  onKey=e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&e.target.type!=='range')return;
    if(e.key===' '){e.preventDefault();App.playing?pause():play();}else if(e.key==='ArrowRight'){pause();setRound(App.t+1);}
    else if(e.key==='ArrowLeft'){pause();setRound(App.t-1);}else if(e.key==='Home'){pause();setRound(0);}else if(e.key==='End'){pause();setRound(App.sim.R);}};
  document.addEventListener('keydown',onKey);
  applyPreset(App.scen);rebuild(false);
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
