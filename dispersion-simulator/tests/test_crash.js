const fs=require('fs');
const path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','js','crash','engine.js'),'utf8');
const E=new Function('window',code+'; return window.CrashEngine;')({});

function rng(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

let runs=0,bad=0,maxRatio=0;
const fails=[];
for(let s=3;s<=9;s++){
  const n=s*s;
  for(let trial=0;trial<400;trial++){
    const R=rng(s*100003+trial);
    const k=trial%5===0?1+Math.floor(R()*n):n;
    const mode=trial%4;
    const pos=[];
    const rootR=Math.floor(R()*s),rootC=Math.floor(R()*s);
    const a=[Math.floor(R()*s),Math.floor(R()*s)];
    for(let i=0;i<k;i++){
      if(mode===0)pos.push([Math.floor(R()*s),Math.floor(R()*s)]);
      else if(mode===1)pos.push([rootR,rootC]);
      else if(mode===2)pos.push(R()<.5?a:[rootR,rootC]);
      else { // boundary only
        const side=Math.floor(R()*4),p=Math.floor(R()*s);
        pos.push(side===0?[0,p]:side===1?[s-1,p]:side===2?[p,0]:[p,s-1]);
      }
    }
    const crashes=[];
    const f=Math.floor(R()*(k+1)*(trial%3===0?1:0.3));
    const used=new Set();
    for(let i=0;i<f;i++){
      const id=1+Math.floor(R()*k); if(used.has(id))continue; used.add(id);
      crashes.push({id,round:1+Math.floor(R()*7*s)});
    }
    const sim=E.simulate({s,pos,crashes});
    runs++;
    const fin=sim.history[sim.R];
    const alive=fin.filter(r=>r.alive);
    const occ=new Map();
    alive.forEach(r=>{const key=r.r*s+r.c;occ.set(key,(occ.get(key)||0)+1);});
    const dup=[...occ.values()].some(v=>v>1);
    const unsettled=alive.some(r=>!r.settled);
    const tooLong=sim.R>7*s;
    if(dup||unsettled||!sim.terminated||tooLong||sim.anomaly.length){
      bad++; if(fails.length<8)fails.push({s,trial,k,mode,f:crashes.length,dup,unsettled,term:sim.terminated,R:sim.R,anom:sim.anomaly.slice(0,2)});
    }
    maxRatio=Math.max(maxRatio,sim.R/(7*s));
    // per-robot move bound
    fin.forEach(r=>{ if(r.moves>7*s){bad++; if(fails.length<8)fails.push({s,trial,msg:'moves>7s',id:r.id,m:r.moves});} });
  }
}
console.log('runs',runs,'bad',bad,'max R/(7s)',maxRatio.toFixed(3));
console.log(JSON.stringify(fails,null,1));

// sanity: print a no-crash trace for s=4 rooted at BR
const s=4,pos=[];for(let i=0;i<16;i++)pos.push([3,3]);
const sim=E.simulate({s,pos,crashes:[]});
console.log('s=4 rooted BR: R=',sim.R,'phases',sim.phases.map(p=>p.key+':'+p.start+'-'+p.end).join(' '));
const f=sim.history[sim.R].map(r=>r.id+'@'+r.r+','+r.c).join(' ');
console.log(f);
const s5=5,pos5=[];for(let i=0;i<25;i++)pos5.push([2,2]);
const sim5=E.simulate({s:5,pos:pos5,crashes:[]});
console.log('s=5 rooted centre: R=',sim5.R);
console.log(sim5.history[sim5.R].map(r=>r.id+'@'+r.r+','+r.c).join(' '));
