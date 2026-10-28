import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,player,step,COURSES,center,obstacles} from '../src/shared.js';

// A deterministic cautious crew: plot a route outside each rock's full motion
// envelope, aim to hold a modest forward speed, and take turns firing normal
// blasts to correct velocity. Only player aim/fire inputs change; the production
// simulation owns position, time, hull, pickups, cooldowns, and gas throughout.
function plotRoute(level) {
 const points=[{z:0,offset:0},...obstacles(level).map(rock=>{
  const clearance=rock.r+1.7+(rock.moving?2:0)+.8;
  const offset=rock.x>=0?Math.min(0,rock.x-clearance):Math.max(0,rock.x+clearance);
  return {z:rock.z,offset};
 }),{z:COURSES[level].length+15,offset:0}].sort((a,b)=>a.z-b.z);
 return z=>{
  let previous=points[0];
  for(const next of points.slice(1)){
   if(z<=next.z){
    const start=previous.z+3.5,end=next.z-3.5;
    const blend=Math.max(0,Math.min(1,(z-start)/(end-start)));
    return center(z,level)+previous.offset+(next.offset-previous.offset)*blend;
   }
   previous=next;
  }
  return center(z,level);
 };
}

for(let level=0;level<COURSES.length;level++)for(const count of [1,2,4]){
 test(`${COURSES[level].name}: ${count} player${count===1?'':'s'} can finish using ordinary inputs`,t=>{
  const state=fresh(level),crew=Array.from({length:count},(_,i)=>player('p'+i,i)),route=plotRoute(level);
  let hits=0,minimumHull=100;
  for(let frame=0;frame<COURSES[level].time*20+1&&state.phase==='playing';frame++){
   const desiredX=Math.max(-4,Math.min(4,(route(state.z+3)-state.x)*1.2));
   const dx=desiredX-state.vx,dz=3.2-state.vz,error=Math.hypot(dx,dz);
   crew.forEach(p=>p.fire=false);
   const next=crew.find(p=>p.gas>=15&&(!p.cooldown||p.cooldown<=.05));
   if(next&&error>5.8/Math.sqrt(count)*.53){next.aimX=dx/error;next.aimZ=dz/error;next.fire=true;}
   step(state,crew,.05);
   if(state.events.includes('bonk'))hits++;
   minimumHull=Math.min(minimumHull,state.hull);
   assert.ok(crew.every(p=>p.gas>=0&&p.gas<=100),'Gas must remain within ordinary game limits');
  }
  assert.equal(state.phase,'won',`Ended at ${state.z.toFixed(1)}m with ${state.hull} hull after ${state.elapsed.toFixed(1)}s`);
  assert.ok(state.elapsed<COURSES[level].time,'Finish before the actual course deadline');
  assert.ok(minimumHull>0,'Hull never depleted during the run');
  t.diagnostic(`${state.elapsed.toFixed(2)}s / ${COURSES[level].time}s; ${state.hull}% finish hull; ${minimumHull}% minimum hull; ${hits} impacts; ${state.beans} beans; ${crew.reduce((n,p)=>n+p.shots,0)} normal blasts`);
 });
}
