import assert from 'node:assert/strict';
import WebSocket from 'ws';

const origin=process.env.GAME_ORIGIN||'http://127.0.0.1:8787';
const socketUrl=(code,character=0,token='')=>origin.replace(/^http/,'ws')+'/api/room/'+code+'?character='+character+'&token='+encodeURIComponent(token);
const clients=[];

async function room() {
 const response=await fetch(origin+'/api/create',{method:'POST'});
 assert.equal(response.status,200);
 return (await response.json()).code;
}
async function join(code,character=0,token='') {
 const ws=new WebSocket(socketUrl(code,character,token)), messages=[],listeners=[];
 let failure;
 const wait=(predicate,from=0)=>{
  const found=messages.slice(from).find(predicate);
  if(found)return Promise.resolve(found);
  if(failure)return Promise.reject(failure);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{listeners.splice(listeners.indexOf(listener),1);reject(new Error('Timed out: '+JSON.stringify(messages.slice(-1))));},5000);
   const listener={predicate,resolve:m=>{clearTimeout(timer);resolve(m);},reject:e=>{clearTimeout(timer);reject(e);}};
   listeners.push(listener);
  });
 };
 const fail=error=>{failure=error;for(const listener of listeners.splice(0))listener.reject(error);};
 ws.on('message',raw=>{
  const message=JSON.parse(raw);messages.push(message);
  for(const listener of [...listeners])if(listener.predicate(message)){listener.resolve(message);listeners.splice(listeners.indexOf(listener),1);}
 });
 ws.on('error',fail);
 ws.on('unexpected-response',(_,response)=>{response.resume();ws.terminate();fail(new Error('Join rejected: '+response.statusCode));});
 const welcome=await wait(m=>m.type==='welcome');
 const client={ws,wait,messages,...welcome,send:m=>ws.send(JSON.stringify(m))};
 clients.push(client);
 return client;
}
async function rejected(code,token='') {
 return new Promise((resolve,reject)=>{
  const ws=new WebSocket(socketUrl(code,0,token));
  const timer=setTimeout(()=>{ws.terminate();reject(new Error('Expected join rejection'));},5000);
  ws.on('unexpected-response',(_,response)=>{clearTimeout(timer);response.resume();resolve(response.statusCode);ws.terminate();});
  ws.on('open',()=>{clearTimeout(timer);ws.close();reject(new Error('Join unexpectedly accepted'));});
  ws.on('error',()=>{});
 });
}

try {
 const code=await room(),crew=[];
 for(let i=0;i<4;i++)crew.push(await join(code,i));
 const [a,b]=crew;
 await a.wait(m=>m.type==='state'&&m.players.length===4);
 assert.equal(await rejected(code),409);
 assert.equal(await rejected(code,'unknown-token'),403);
 console.log('PASS: four-player limit and unknown reconnect token rejected');

 b.send({type:'select',character:0});
 await b.wait(m=>m.type==='error'&&m.error.includes('taken'));
 console.log('PASS: duplicate character rejected');

 b.send({type:'start'});a.send({type:'start'});
 await a.wait(m=>m.type==='error'&&m.error.includes('Ready'));
 crew.slice(1).forEach(c=>c.send({type:'ready',ready:true}));
 await a.wait(m=>m.type==='state'&&m.players.length===4&&m.players.slice(1).every(p=>p.ready));
 a.send({type:'level',level:1});
 await a.wait(m=>m.type==='state'&&m.level===1&&m.players.every(p=>!p.ready));
 const readyGateCursor=a.messages.length;
 a.send({type:'start'});
 await a.wait(m=>m.type==='error'&&m.error.includes('Ready'),readyGateCursor);
 crew.slice(1).forEach(c=>c.send({type:'ready',ready:true}));
 await a.wait(m=>m.type==='state'&&m.level===1&&m.players.slice(1).every(p=>p.ready));
 a.send({type:'start'});
 await a.wait(m=>m.state?.phase==='playing');
 console.log('PASS: ready gate, host authorization, and readiness resets for a changed course');

 a.send({type:'input',x:0,z:1,fire:true});
 const moved=await b.wait(m=>m.state?.z>.1);
 assert.ok(moved.state.seq>0);
 b.send({type:'input',x:'invalid',z:1,fire:true});
 await a.wait(m=>m.state?.elapsed>.1&&Number.isFinite(m.state.x)&&Number.isFinite(m.state.z));
 console.log('PASS: authoritative movement reaches all clients and malformed input is ignored');

 b.send({type:'signal',to:a.id,data:{description:{type:'offer',sdp:'test-only'}}});
 await a.wait(m=>m.type==='signal'&&m.from===b.id);
 const ice=await fetch(origin+'/api/room/'+code+'/ice?token='+a.token);
 assert.equal(ice.status,200);assert.equal(ice.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(origin+'/api/room/'+code+'/ice?token=invalid')).status,403);
 console.log('PASS: room-scoped voice signaling and token-protected uncached credentials');

 b.ws.close();
 const rejoined=await join(code,1,b.token);
 assert.equal(rejoined.id,b.id);
 await rejoined.wait(m=>m.type==='state'&&m.state?.phase==='playing'&&m.players.find(p=>p.id===b.id)?.connected);
 console.log('PASS: reconnect restores the same player during an active round');

 const migrationCursor=rejoined.messages.length;
 a.send({type:'leave'});
 await rejoined.wait(m=>m.type==='state'&&m.host!==a.id,migrationCursor);
 console.log('PASS: host migration during a round');

 const lobbyCode=await room(),captain=await join(lobbyCode,2),mate=await join(lobbyCode,2);
 const roster=await mate.wait(m=>m.type==='state'&&m.players.length===2);
 assert.equal(new Set(roster.players.map(p=>p.character)).size,2);
 captain.ws.close();
 await mate.wait(m=>m.type==='state'&&m.host===mate.id&&m.players.find(p=>p.id===captain.id)?.connected===false);
 const resume=await join(lobbyCode,2,captain.token);
 await resume.wait(m=>m.type==='state'&&m.host===mate.id);
 const before=mate.messages.length;
 resume.send({type:'level',level:2});
 mate.send({type:'level',level:1});
 await mate.wait(m=>m.type==='state'&&m.level===1,mate.messages.length-1);
 assert.ok(!mate.messages.slice(before).some(m=>m.type==='state'&&m.level===2));
 console.log('PASS: immediate lobby host migration, preserved reconnect identity, unique initial characters');

 const locked=await room(),one=await join(locked),two=await join(locked,1);
 two.send({type:'ready',ready:true});
 await one.wait(m=>m.type==='state'&&m.players.find(p=>p.id===two.id)?.ready);
 one.send({type:'start'});
 await one.wait(m=>m.state?.phase==='playing');
 assert.equal(await rejected(locked),409);
 console.log('PASS: new players cannot enter an active round');

 const freeCode=await room(),freeHost=await join(freeCode),freeMate=await join(freeCode,1);
 freeHost.send({type:'mode',mode:'free'});
 await freeMate.wait(m=>m.type==='state'&&m.mode==='free');
 freeMate.send({type:'ready',ready:true});
 await freeHost.wait(m=>m.type==='state'&&m.mode==='free'&&m.players.find(p=>p.id===freeMate.id)?.ready);
 freeHost.send({type:'start'});
 const freeRound=await freeMate.wait(m=>m.state?.mode==='free'&&m.state.phase==='playing');
 assert.equal(freeRound.state.time,null);
 console.log('PASS: free co-op mode starts with no countdown');

 const raceCode=await room(),racers=[];
 for(let i=0;i<3;i++)racers.push(await join(raceCode,i));
 racers[0].send({type:'mode',mode:'race'});
 await racers[1].wait(m=>m.type==='state'&&m.mode==='race');
 racers[0].send({type:'start'});
 await racers[0].wait(m=>m.type==='error'&&m.error.includes('exactly 2 or 4'));
 racers.push(await join(raceCode,3));
 racers.slice(1).forEach(c=>c.send({type:'ready',ready:true}));
 await racers[0].wait(m=>m.type==='state'&&m.mode==='race'&&m.players.length===4&&m.players.slice(1).every(p=>p.ready));
 racers[0].send({type:'start'});
 const raceRound=await racers[0].wait(m=>m.state?.mode==='race'&&m.state.phase==='playing');
 assert.deepEqual(raceRound.players.map(p=>p.team),[0,1,0,1]);
 racers[1].send({type:'input',x:0,z:1,fire:true,power:1.4});
 const raceMoved=await racers[0].wait(m=>m.state?.mode==='race'&&m.state.boats[1].z>.1);
 assert.equal(raceMoved.state.boats[0].z,0);assert.equal(raceMoved.players.find(p=>p.id===racers[1].id).power,1.4);
 racers[1].ws.close();
 const raceResume=await join(raceCode,1,racers[1].token);
 const resumedRace=await raceResume.wait(m=>m.state?.mode==='race'&&m.players.find(p=>p.id===raceResume.id)?.connected);
 assert.equal(resumedRace.players.find(p=>p.id===raceResume.id).team,1);
 console.log('PASS: balanced race teams, isolated boat thrust, boost power, and stable reconnect teams');

 assert.equal((await fetch(origin+'/api/create',{method:'POST',headers:{Origin:'https://unrelated.example'}})).status,403);
 console.log('PASS: cross-origin room creation rejected');
} finally {
 for(const client of clients){
  if(client.ws.readyState===WebSocket.OPEN){client.send({type:'leave'});client.ws.close();}
  else if(client.ws.readyState!==WebSocket.CLOSED)client.ws.terminate();
 }
}

