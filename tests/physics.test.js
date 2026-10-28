import test from 'node:test';import assert from 'node:assert/strict';import {fresh,player,step,makeRound,stepRound,CAST,COURSES,center} from '../src/shared.js';
test('13 exact roster names and three courses',()=>{assert.equal(CAST.length,13);assert.equal(CAST[5].name,'Die Yabala (podieka)');assert.equal(CAST[12].name,'Pola');assert.equal(COURSES.length,3);});
test('fart propulsion consumes gas and moves authoritative raft',()=>{const s=fresh(),p=player('a');p.fire=true;for(let i=0;i<20;i++)step(s,[p],.05);assert.ok(s.z>0);assert.ok(p.gas<100);assert.ok(p.shots>0);});
test('opposing inputs cancel thrust',()=>{const s=fresh(),a=player('a'),b=player('b');a.fire=b.fire=true;b.aimZ=-1;step(s,[a,b],.05);assert.equal(s.vz,0);});
test('low, normal and boost scale thrust and gas cost deterministically',()=>{
 const results=[.6,1,1.4].map(power=>{const s=fresh(),p=player('a');p.power=power;p.fire=true;step(s,[p],.05);assert.equal(p.gas,100-15*power);return s.vz;});
 assert.ok(Math.abs(results[0]/results[1]-.6)<1e-12);assert.ok(Math.abs(results[2]/results[1]-1.4)<1e-12);
 const s=fresh(),p=player('b');p.power=1.4;p.gas=15;p.fire=true;step(s,[p],.05);assert.equal(p.shots,0);
});
test('cannot emit with an empty gas meter',()=>{const s=fresh(),p=player('a');p.gas=0;p.fire=true;step(s,[p],.05);assert.equal(p.shots,0);assert.equal(s.vz,0);});
test('riverbank collision damages hull with cooldown',()=>{const s=fresh();s.x=100;step(s,[],.05);assert.equal(s.hull,84);s.x=100;step(s,[],.05);assert.equal(s.hull,84);});
test('timeout loses and freezes the round',()=>{const s=fresh();s.time=.01;step(s,[],.05);assert.equal(s.phase,'lost');const elapsed=s.elapsed;step(s,[],.05);assert.equal(s.elapsed,elapsed);});
test('finish wins',()=>{const s=fresh();s.z=COURSES[0].length;s.x=center(s.z);step(s,[],.05);assert.equal(s.phase,'won');});
test('beans only collected once',()=>{const s=fresh();s.z=8;s.x=center(8)-3;step(s,[],.05);assert.equal(s.beans,1);step(s,[],.05);assert.equal(s.beans,1);});
test('invalid or zero frame durations do not emit gas or poison the simulation',()=>{const s=fresh(),p=player('a');p.fire=true;const before=structuredClone(s);for(const dt of [0,-1,NaN,Infinity])step(s,[p],dt);assert.deepEqual(s,before);assert.equal(p.shots,0);assert.equal(p.gas,100);});
test('free play has no time expiry but still loses its hull and can finish',()=>{
 const s=makeRound(0,'free');assert.equal(s.time,null);
 for(let i=0;i<1600;i++)stepRound(s,[],.1);
 assert.equal(s.phase,'playing');assert.equal(s.time,null);assert.ok(s.elapsed>150);
 s.hull=0;stepRound(s,[],.05);assert.equal(s.phase,'lost');
 const finish=makeRound(0,'free');finish.z=COURSES[0].length;finish.x=center(finish.z);stepRound(finish,[],.05);
 assert.equal(finish.phase,'won');assert.equal(finish.time,null);
});
test('race initializes two independent boats and routes thrust and pickups to the correct team',()=>{
 const s=makeRound(0,'race'),a=player('a'),b=player('b');a.team=0;b.team=1;a.fire=true;
 assert.equal(s.boats[1].x-s.boats[0].x,4);
 stepRound(s,[a,b],.05);assert.ok(s.boats[0].z>0);assert.equal(s.boats[1].z,0);assert.equal(a.shots,1);assert.equal(b.shots,0);
 a.fire=false;a.gas=10;b.gas=10;s.boats[0].z=8;s.boats[0].x=center(8)-3;
 stepRound(s,[a,b],.05);assert.equal(s.boats[0].beans,1);assert.equal(s.boats[1].beans,0);assert.ok(a.gas>b.gas+19);
});
test('first race finisher wins and freezes both boats',()=>{
 const s=makeRound(0,'race');s.boats[1].z=COURSES[0].length;s.boats[1].x=center(s.boats[1].z);
 stepRound(s,[],.05);assert.equal(s.phase,'won');assert.equal(s.winner,1);
 const before=structuredClone(s);stepRound(s,[],.05);assert.deepEqual(s,before);
});
test('race resolves same-tick finish using crossing time and reports an exact draw',()=>{
 const s=makeRound(0,'race'),length=COURSES[0].length;
 for(const [i,boat]of s.boats.entries()){boat.z=length-(i===0?.2:.1);boat.x=center(boat.z);boat.vz=10;}
 stepRound(s,[],.05);assert.equal(s.phase,'won');assert.equal(s.winner,1);
 const draw=makeRound(0,'race');draw.boats.forEach(b=>{b.z=length-.1;b.x=center(b.z);b.vz=10;});
 stepRound(draw,[],.05);assert.equal(draw.phase,'won');assert.equal(draw.winner,null);
});
test('one sunk race boat does not end the race; losing both does',()=>{
 const s=makeRound(0,'race');s.boats[0].hull=0;stepRound(s,[],.05);
 assert.equal(s.boats[0].phase,'lost');assert.equal(s.phase,'playing');
 s.boats[1].time=.01;stepRound(s,[],.05);assert.equal(s.phase,'lost');assert.equal(s.winner,null);
});
