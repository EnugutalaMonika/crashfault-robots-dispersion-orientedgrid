const fs=require('fs');
const path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','js','byzantine','engine.js'),'utf8');
const E=new Function('window',code+'; return window.ByzEngine;')({});
const rng=(seed)=>{let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
const strats=Object.keys(E.STRATS);
const SAFE=strats.filter(k=>E.STRATS[k].safe);
const TRIALS=+process.argv[2]||60;
let falseAccusations=0,exceptions=0,over=0;
const table={};
function runOne(s,pool,seed){
  const R=rng(seed),n=s*s,k=R()<.2?1+Math.floor(R()*n):n,pos=[];
  const mode=seed%4,a=[Math.floor(R()*s),Math.floor(R()*s)];
  for(let j=0;j<k;j++){
    if(mode===0)pos.push([Math.floor(R()*s),Math.floor(R()*s)]);
    else if(mode===1)pos.push([a[0],a[1]]);
    else if(mode===2)pos.push(R()<.5?a:[Math.floor(R()*s),Math.floor(R()*s)]);
    else{const sd=Math.floor(R()*4),p=Math.floor(R()*s);pos.push(sd===0?[0,p]:sd===1?[s-1,p]:sd===2?[p,0]:[p,s-1]);}
  }
  const byz=[],used=new Set();
  if(pool.length){const f=1+Math.floor(R()*Math.max(1,Math.floor(k/2)));
    for(let j=0;j<f;j++){const id=1+Math.floor(R()*k);if(used.has(id))continue;used.add(id);const st=pool[Math.floor(R()*pool.length)];byz.push({id,strat:st,param:st==='crashlike'?1+Math.floor(R()*6*s):null});}}
  let sim;try{sim=E.simulate({s,pos,byz,seed});}catch(e){exceptions++;console.log('EXC',s,pool,e.stack.split('\n').slice(0,3).join(' | '));return null;}
  // soundness: no correct robot may ever be accused
  const byzIds=new Set(byz.map(b=>b.id));
  sim.history[sim.R].forEach(r=>{if(!r.byz)r.F.forEach(id=>{if(!byzIds.has(id))falseAccusations++;});});
  if(sim.R>7*s)over++;
  return sim;
}
const pools=[['none',[]],...strats.map(a=>[a,[a]]),['mixed-safe',SAFE],['mixed-all',strats]];
for(let s=3;s<=9;s++){
  const row={};
  pools.forEach(([name,pool],pi)=>{
    let ok=0;
    for(let i=0;i<TRIALS;i++){const sim=runOne(s,pool,s*100003+pi*1009+i);if(sim&&sim.success)ok++;}
    row[name]=ok;
  });
  table[s]=row;
}
console.log('success counts out of',TRIALS,'per cell');
console.log('strategy'.padEnd(12),[3,4,5,6,7,8,9].map(s=>('s='+s).padStart(6)).join(''));
pools.forEach(([name])=>console.log(name.padEnd(12),[3,4,5,6,7,8,9].map(s=>String(table[s][name]).padStart(6)).join('')));
console.log('false accusations:',falseAccusations,' exceptions:',exceptions,' runs beyond 7s:',over);
