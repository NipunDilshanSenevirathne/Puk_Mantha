export const CAST = [
 ['Adma Ribishek',[.28,.25,.34,.44],'#ffbe45','Chief Wind Officer'],
 ['Wanigarathana Shuurin',[.33,.20,.37,.49],'#44d4e0','Director of Bad Ideas'],
 ['Nipun Putha',[.30,.07,.44,.59],'#a78bfa','Captain of Questionable Decisions'],
 ['Pasindu son',[.43,.20,.35,.52],'#ff7ca8','Head of Sudden Acceleration'],
 ['Sachin Thundulkar',[.34,.14,.41,.51],'#76dfa0','Senior Gas Consultant'],
 ['Die Yabala (podieka)',[.35,.19,.46,.63],'#ffc65c','Junior Chaos Engineer'],
 ['Die Yabala (lokueka)',[.14,.08,.50,.57],'#89c9ff','Executive Chaos Engineer'],
 ['Oscar Oshitha',[.24,.02,.42,.66],'#ff9370','Best Supporting Farter'],
 ['Shan Putha Lite',[.27,.00,.55,.76],'#f5dd70','Lightweight. Heavy Consequences.'],
 ['Goja Bro',[.13,.10,.58,.67],'#83dfc2','Quality Out-of-Control'],
 ['Saragee Yohan',[.15,.06,.53,.54],'#8fa6ff','Chief Vibes Department'],
 ['Mr Anjana',[.47,.02,.48,.52],'#df9bfa','Silent But Employed'],
 ['Pola',[.21,.15,.42,.36],'#ff8d98','Minister of Propulsion']
].map(([name,crop,color,title],id)=>({id,name,crop,color,title}));
export const COURSES=[{name:'Beanwater Bay',subtitle:'A gentle introduction to poor decisions.',length:150,width:12,time:150,seed:1},{name:'Curry Rapids',subtitle:'The meeting could have been an email.',length:210,width:10,time:180,seed:2},{name:'The Final Flush',subtitle:'HR has left the chat.',length:250,width:9,time:210,seed:3}];
export const MODES=['trial','free','race'];
export const quips=['Excellent teamwork. Terrible outcome.','The raft has filed a complaint.','Promoted to underwater management.','All that gas. Absolutely no direction.','Your annual review just got interesting.'];
export function center(z,level=0){return Math.sin(z*.045+level)*4+Math.sin(z*.09)*1.8;}
export function obstacles(level){return Array.from({length:10+level*4},(_,i)=>({z:18+i*14,x:Math.sin(i*8.4)*5,r:1.2+(i%3)*.25,moving:i%4===2}));}
export function obstacleX(o,t,l){return center(o.z,l)+o.x+(o.moving?Math.sin(t*1.6+o.z)*2:0);}
export function fresh(level=0,mode='trial'){return {level,mode:mode==='free'?'free':'trial',phase:'playing',x:center(0,level),z:0,vx:0,vz:0,angle:0,spin:0,hull:100,time:mode==='free'?null:COURSES[level].time,elapsed:0,checkpoint:0,beans:0,combo:0,lastHit:-10,puffs:[],collected:[],events:[],seq:0};}
export function player(id,character=0){return {id,character,team:null,power:1,gas:100,aimX:0,aimZ:1,fire:false,shots:0,voice:false,ready:false};}
export function makeRound(level=0,mode='trial'){
 if(mode!=='race')return fresh(level,mode);
 const boats=[fresh(level),fresh(level)];
 boats[0].x-=2;boats[1].x+=2;
 return {mode:'race',level,phase:'playing',winner:null,elapsed:0,boats};
}
export function stepRound(s,players,dt){
 if(s.mode!=='race')return step(s,players,dt);
 if(s.phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
 dt=Math.min(.1,dt);s.elapsed+=dt;
 const previous=s.boats.map(b=>b.z);
 s.boats.forEach((boat,team)=>step(boat,players.filter(p=>p.team===team),dt));
 const finished=s.boats.map((boat,team)=>boat.phase==='won'?team:-1).filter(team=>team>=0);
 if(finished.length){
  s.phase='won';s.winner=finished[0];
  if(finished.length===2){
   // Resolve two crossings within one server tick by their interpolated crossing time.
   const length=COURSES[s.level].length;
   const crossing=s.boats.map((boat,team)=>Math.max(0,(length-previous[team])/Math.max(.000001,boat.z-previous[team])));
   s.winner=Math.abs(crossing[0]-crossing[1])<.000001?null:crossing[0]<crossing[1]?0:1;
  }
 }else if(s.boats.every(boat=>boat.phase==='lost'))s.phase='lost';
}
export function step(s,players,dt){
 if(s.phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
 dt=Math.min(.1,Math.max(0,dt));if(s.mode!=='free')s.time-=dt;s.elapsed+=dt;s.events=[];const n=Math.max(1,players.length);let fired=0;
 for(let i=0;i<players.length;i++){
  const p=players[i];p.gas=Math.min(100,p.gas+dt*12);p.cooldown=Math.max(0,(p.cooldown||0)-dt);
  const power=[.6,1,1.4].includes(p.power)?p.power:1,cost=15*power;
  if(p.fire&&p.gas>=cost&&p.cooldown===0){
   p.gas-=cost;p.cooldown=.38;p.shots++;fired++;
   const k=5.8/Math.sqrt(n)*power;s.vx+=p.aimX*k;s.vz+=p.aimZ*k;
   s.spin+=(i%2===0?1:-1)*.08;s.puffs.push({id:++s.seq,x:s.x,z:s.z,t:s.elapsed,dx:p.aimX,dz:p.aimZ,character:p.character});
  }
 }
 if(fired>1)s.combo++;s.vx*=Math.pow(.48,dt);s.vz*=Math.pow(.48,dt);
 const speed=Math.hypot(s.vx,s.vz);if(speed>13){s.vx*=13/speed;s.vz*=13/speed;}
 s.x+=s.vx*dt;s.z=Math.max(-3,s.z+s.vz*dt);s.angle+=s.spin*dt;s.spin*=Math.pow(.12,dt);
 const level=COURSES[s.level],cx=center(s.z,s.level),limit=level.width-2;
 const hit=()=>{if(s.elapsed-s.lastHit>1.2){s.hull=Math.max(0,s.hull-16);s.lastHit=s.elapsed;s.events.push('bonk');}};
 if(Math.abs(s.x-cx)>limit){s.x=cx+Math.sign(s.x-cx)*limit;s.vx*=-.65;hit();}
 for(const o of obstacles(s.level)){
  const dx=s.x-obstacleX(o,s.elapsed,s.level),dz=s.z-o.z,d=Math.hypot(dx,dz),r=o.r+1.7;
  if(d<r){const nx=d>.001?dx/d:1,nz=d>.001?dz/d:0;s.x+=nx*(r-d);s.z+=nz*(r-d);const dot=s.vx*nx+s.vz*nz;if(dot<0){s.vx-=1.7*dot*nx;s.vz-=1.7*dot*nz;}hit();}
 }
 for(let i=0;i<Math.ceil(level.length/12);i++){const z=8+i*12,x=center(z,s.level)+(i%2?3:-3);if(!s.collected.includes(i)&&Math.hypot(s.x-x,s.z-z)<2.8){s.collected.push(i);s.beans++;s.hull=Math.min(100,s.hull+4);players.forEach(p=>p.gas=Math.min(100,p.gas+20));s.events.push('bean');}}
 if(s.z>(s.checkpoint+1)*50&&s.z<level.length-10){s.checkpoint++;s.hull=Math.min(100,s.hull+8);s.events.push('checkpoint');}
 s.puffs=s.puffs.filter(p=>s.elapsed-p.t<1.5);
 if(s.z>=level.length){s.phase='won';if(s.mode!=='free')s.time=Math.max(0,s.time);}
 else if((s.mode!=='free'&&s.time<=0)||s.hull<=0){s.phase='lost';if(s.mode!=='free')s.time=Math.max(0,s.time);}
}
