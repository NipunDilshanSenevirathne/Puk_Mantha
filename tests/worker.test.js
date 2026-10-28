import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {GameRoom} from '../src/worker.js';
import {fresh,player,makeRound} from '../src/shared.js';

class Socket {
 constructor(){this.messages=[];this.listeners=new Map();}
 accept(){}
 send(raw){this.messages.push(JSON.parse(raw));}
 addEventListener(type,fn){this.listeners.set(type,fn);}
 emit(type,data){this.listeners.get(type)?.({data});}
 close(){this.closed=true;this.emit('close');}
}
function setup(env={}) {
 const room=new GameRoom({},env);room.created=true;room.createdAt=Date.now();
 const add=(id,character=0)=>{
  const c={ws:new Socket(),p:player(id,character),token:'token-'+id,count:0,window:Date.now(),lastInput:Date.now()};
  room.clients.set(id,c);room.rehost();return c;
 };
 return {room,add};
}
const send=(room,c,message)=>room.message(c,JSON.stringify(message));
const lastState=c=>c.ws.messages.findLast(m=>m.type==='state');

test('lobby host migration and expired reservations are broadcast without an active round',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1);
 a.disconnected=Date.now()-20001;a.p.fire=true;
 room.tick();
 assert.equal(room.host,b.p.id);assert.equal(room.clients.size,1);
 assert.equal(lastState(b).host,b.p.id);assert.equal(lastState(b).players.length,1);
 assert.equal(a.p.fire,false);
});

test('unknown and expired reconnect tokens never create replacement identities',async()=>{
 const {room,add}=setup();const a=add('a');add('b',1);
 for(const token of ['unknown',a.token]){
  a.disconnected=Date.now()-20001;
  const result=await room.fetch(new Request('https://game.example/api/room/ABCDEFGH?token='+token,{headers:{Upgrade:'websocket'}}));
  assert.equal(result.status,403);assert.equal(room.clients.size,2);
 }
});

test('closed obsolete sockets cannot mutate or disconnect a reconnected seat',async()=>{
 const NativeResponse=globalThis.Response,previousPair=globalThis.WebSocketPair;
 const pairs=[];
 globalThis.WebSocketPair=class {constructor(){this[0]=new Socket();this[1]=new Socket();pairs.push(this);}};
 globalThis.Response=class extends NativeResponse {
  constructor(body,init){if(init?.status===101)return {status:101,webSocket:init.webSocket};super(body,init);}
 };
 const {room}=setup();
 try {
  await room.fetch(new Request('https://game.example/api/room/ABCDEFGH',{headers:{Upgrade:'websocket'}}));
  const c=[...room.clients.values()][0],old=pairs[0][1];
  room.mode='race';room.state=makeRound(0,'race');c.p.team=1;
  await room.fetch(new Request('https://game.example/api/room/ABCDEFGH?token='+c.token,{headers:{Upgrade:'websocket'}}));
  old.emit('message',JSON.stringify({type:'leave'}));old.emit('close');
  assert.equal(room.clients.get(c.p.id),c);assert.equal(c.disconnected,0);
  assert.equal(c.ws,pairs[1][1]);assert.equal(room.clients.size,1);
  assert.equal(c.p.team,1);
 } finally {room.expire();globalThis.Response=NativeResponse;if(previousPair===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=previousPair;}
});

test('disconnect immediately transfers lobby host and clears stale ready and voice state',async()=>{
 const NativeResponse=globalThis.Response,previousPair=globalThis.WebSocketPair;
 globalThis.WebSocketPair=class {constructor(){this[0]=new Socket();this[1]=new Socket();}};
 globalThis.Response=class extends NativeResponse {constructor(body,init){if(init?.status===101)return {status:101};super(body,init);}};
 const {room}=setup();
 try {
  await room.fetch(new Request('https://game.example/api/room/ABCDEFGH',{headers:{Upgrade:'websocket'}}));
  await room.fetch(new Request('https://game.example/api/room/ABCDEFGH',{headers:{Upgrade:'websocket'}}));
  const [a,b]=[...room.clients.values()];a.p.ready=true;a.p.voice=true;
  a.ws.close();
  assert.equal(room.host,b.p.id);assert.equal(lastState(b).host,b.p.id);
  assert.equal(a.p.ready,false);assert.equal(a.p.voice,false);
 } finally {room.expire();globalThis.Response=NativeResponse;if(previousPair===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=previousPair;}
});

test('only host changes course; actual changes reset readiness and unchanged values preserve it',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1);b.p.ready=true;
 send(room,b,{type:'level',level:1});assert.equal(room.level,0);assert.equal(b.p.ready,true);
 send(room,a,{type:'level',level:0});assert.equal(b.p.ready,true);
 send(room,a,{type:'level',level:2});assert.equal(room.level,2);assert.equal(b.p.ready,false);
 send(room,a,{type:'start'});assert.equal(room.state,null);assert.match(a.ws.messages.at(-1).error,/Ready/);
});

test('active round locks character, readiness, and course; malformed input cannot corrupt physics',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1);room.state=fresh();b.p.ready=true;
 send(room,a,{type:'level',level:2});send(room,b,{type:'select',character:3});send(room,b,{type:'ready',ready:false});
 assert.equal(room.level,0);assert.equal(b.p.character,1);assert.equal(b.p.ready,true);
 for(const x of [null,{},'1',1e308])send(room,b,{type:'input',x,z:1,fire:true});
 assert.equal(b.p.fire,false);assert.equal(b.p.aimX,0);
 send(room,b,{type:'input',x:1,z:1,fire:true});
 assert.equal(b.p.fire,true);assert.ok(Math.abs(Math.hypot(b.p.aimX,b.p.aimZ)-1)<1e-12);
 send(room,b,{type:'input',x:0,z:1,fire:true,power:1.4});assert.equal(b.p.power,1.4);
 send(room,b,{type:'input',x:0,z:1,fire:true,power:999});assert.equal(b.p.power,1.4);
 b.lastInput=Date.now()-701;room.tick();assert.equal(b.p.fire,false);
});

test('a host can rematch after a reconnected player lost their ready flag',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1);room.state=fresh();room.state.phase='lost';
 b.p.ready=false;b.p.gas=5;b.p.shots=12;b.p.fire=true;
 send(room,b,{type:'start'});assert.equal(room.state.phase,'lost');
 send(room,a,{type:'start'});assert.equal(room.state.phase,'playing');
 assert.equal(b.p.gas,100);assert.equal(b.p.shots,0);assert.equal(b.p.fire,false);
});

test('mode is host controlled, validated, locks during play and resets readiness only when changed',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1);b.p.ready=true;
 send(room,b,{type:'mode',mode:'race'});assert.equal(room.mode,'trial');
 send(room,a,{type:'mode',mode:'unknown'});send(room,a,{type:'mode',mode:'trial'});assert.equal(b.p.ready,true);
 send(room,a,{type:'mode',mode:'free'});assert.equal(room.mode,'free');assert.equal(b.p.ready,false);assert.equal(lastState(b).mode,'free');
 send(room,b,{type:'ready',ready:true});send(room,a,{type:'start'});
 assert.equal(room.state.mode,'free');assert.equal(room.state.time,null);
 send(room,a,{type:'mode',mode:'race'});assert.equal(room.mode,'free');
});

test('race requires exactly two or four connected players and assigns alternating stable teams',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1),c=add('c',2);
 send(room,a,{type:'mode',mode:'race'});b.p.ready=c.p.ready=true;
 send(room,a,{type:'start'});assert.equal(room.state,null);assert.match(a.ws.messages.at(-1).error,/exactly 2 or 4/);
 const d=add('d',3);d.p.ready=true;send(room,a,{type:'start'});
 assert.equal(room.state.mode,'race');assert.deepEqual([a,b,c,d].map(c=>c.p.team),[0,1,0,1]);
 b.disconnected=Date.now()-20001;room.last=Date.now()-50;room.tick();
 assert.deepEqual([a,c,d].map(c=>c.p.team),[0,0,1]);
 assert.deepEqual(lastState(a).players.map(p=>p.team),[0,0,1]);
});

test('two-player race routes inputs only to their assigned boat and lobby clears assignments',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1);
 send(room,a,{type:'mode',mode:'race'});b.p.ready=true;send(room,a,{type:'start'});
 assert.deepEqual([a.p.team,b.p.team],[0,1]);
 send(room,b,{type:'input',x:0,z:1,fire:true});room.last=Date.now()-50;room.tick();
 assert.equal(room.state.boats[0].z,0);assert.ok(room.state.boats[1].z>0);
 room.state.phase='lost';send(room,a,{type:'lobby'});assert.equal(room.state,null);assert.equal(a.p.team,null);assert.equal(b.p.team,null);
});

test('a reserved disconnected seat cannot join a race it did not start',async()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1),absent=add('c',2);absent.disconnected=Date.now();
 send(room,a,{type:'mode',mode:'race'});b.p.ready=true;send(room,a,{type:'start'});
 assert.equal(absent.p.team,null);
 const response=await room.fetch(new Request('https://game.example/api/room/ABCDEFGH?token='+absent.token,{headers:{Upgrade:'websocket'}}));
 assert.equal(response.status,409);assert.equal(room.clients.size,3);
});

test('fresh entrants cannot inherit active or completed trial, free, or race results',async()=>{
 for(const mode of ['trial','free','race'])for(const phase of ['playing','won','lost']){
  const {room,add}=setup();add('a');room.mode=mode;room.state=makeRound(0,mode);room.state.phase=phase;
  const response=await room.fetch(new Request('https://game.example/api/room/ABCDEFGH',{headers:{Upgrade:'websocket'}}));
  assert.equal(response.status,409,`${mode} ${phase} should reject newcomers`);
  assert.match((await response.json()).error,/host.*lobby/);assert.equal(room.clients.size,1);
 }
});

test('existing players can reconnect to completed results and fresh players can join after host returns to lobby',async()=>{
 const NativeResponse=globalThis.Response,previousPair=globalThis.WebSocketPair;
 globalThis.WebSocketPair=class {constructor(){this[0]=new Socket();this[1]=new Socket();}};
 globalThis.Response=class extends NativeResponse {constructor(body,init){if(init?.status===101)return {status:101};super(body,init);}};
 const {room,add}=setup(),a=add('a'),b=add('b',1);
 try{
  for(const mode of ['trial','free','race']){
   room.mode=mode;room.state=makeRound(0,mode);room.state.phase='won';b.p.team=mode==='race'?1:null;b.disconnected=Date.now();
   const response=await room.fetch(new Request('https://game.example/api/room/ABCDEFGH?token='+b.token,{headers:{Upgrade:'websocket'}}));
   assert.equal(response.status,101);assert.equal(room.clients.size,2);assert.equal(b.disconnected,0);assert.equal(b.p.id,'b');
  }
  send(room,a,{type:'lobby'});assert.equal(room.state,null);
  const response=await room.fetch(new Request('https://game.example/api/room/ABCDEFGH',{headers:{Upgrade:'websocket'}}));
  assert.equal(response.status,101);assert.equal(room.clients.size,3);
 }finally{room.expire();globalThis.Response=NativeResponse;if(previousPair===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=previousPair;}
});

test('disconnected and removed clients cannot mutate room state',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1);
 b.disconnected=Date.now();send(room,b,{type:'ready',ready:true});assert.equal(b.p.ready,false);
 room.clients.delete(a.p.id);send(room,a,{type:'level',level:2});assert.equal(room.level,0);
});

test('signal forwarding is room scoped and validates signaling payload; emote indices must be integers',()=>{
 const {room,add}=setup(),a=add('a'),b=add('b',1);
 send(room,a,{type:'signal',to:b.p.id,data:'bad'});
 send(room,a,{type:'signal',to:'other-room',data:{description:{type:'offer',sdp:'ok'}}});
 send(room,a,{type:'emote',index:1.5});assert.equal(b.ws.messages.length,0);
 send(room,a,{type:'signal',to:b.p.id,data:{description:{type:'offer',sdp:'ok'}}});
 assert.deepEqual(b.ws.messages.at(-1),{type:'signal',from:'a',data:{description:{type:'offer',sdp:'ok'}}});
 b.disconnected=Date.now();const before=b.ws.messages.length;
 send(room,a,{type:'signal',to:b.p.id,data:{candidate:{candidate:'ok'}}});assert.equal(b.ws.messages.length,before);
});

test('voice credentials require an active token and responses cannot be cached',async()=>{
 const {room,add}=setup(),a=add('a');
 let response=await room.fetch(new Request('https://game.example/api/room/ABCDEFGH/ice?token='+a.token));
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await response.json()).relay,false);
 a.disconnected=Date.now();response=await room.fetch(new Request('https://game.example/api/room/ABCDEFGH/ice?token='+a.token));assert.equal(response.status,403);
});

test('concurrent TURN requests coalesce, credentials cache, and malformed relay config falls back',async(t)=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;await Promise.resolve();return Response.json({iceServers:[{urls:'turn:example.com',username:'u',credential:'c'}]});});
 const {room,add}=setup({TURN_KEY_ID:'key',TURN_API_TOKEN:'secret'}),a=add('a');
 const [one,two]=await Promise.all([room.ice(a),room.ice(a)]);
 assert.equal(calls,1);assert.equal(one,two);assert.equal(one.relay,true);await room.ice(a);assert.equal(calls,1);
 a.iceUntil=0;t.mock.method(globalThis,'fetch',async()=>Response.json({iceServers:'invalid'}));
 assert.equal((await room.ice(a)).relay,false);
});

test('room expires at lifetime limit even before its first player joins',async()=>{
 const {room}=setup();room.createdAt=Date.now()-4*3600000;
 const response=await room.fetch(new Request('https://game.example/api/room/ABCDEFGH/ice'));
 assert.equal(response.status,404);assert.equal(room.created,false);
});

test('last voluntary departure closes the room immediately',()=>{
 const {room,add}=setup(),a=add('a');send(room,a,{type:'leave'});
 assert.equal(room.created,false);assert.equal(room.clients.size,0);assert.equal(a.ws.closed,true);
});

test('room creation retries collisions and preserves initialization errors',async()=>{
 let calls=0;
 const env={ROOMS:{idFromName:name=>name,get:()=>({fetch:async()=>{calls++;return Response.json({error:'Room exists'},{status:409});}})}};
 const response=await worker.fetch(new Request('https://game.example/api/create',{method:'POST'}),env);
 assert.equal(response.status,503);assert.equal(calls,3);
 env.ROOMS.get=()=>({fetch:async()=>Response.json({error:'Unavailable'},{status:503})});
 const failure=await worker.fetch(new Request('https://game.example/api/create',{method:'POST'}),env);assert.equal(failure.status,503);
});
