import {makeRound,player,stepRound,CAST,MODES} from './shared.js';

const ROOM_LIFETIME = 4 * 3600000;
const RECONNECT_GRACE = 20000;
const json = (body, status = 200) => Response.json(body, {
 status, headers: {'Cache-Control':'no-store'}
});
const fallbackIce = () => ({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],relay:false});

export default {
 async fetch(request, env) {
  const u = new URL(request.url);
  if (!u.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (request.headers.get('Origin') && request.headers.get('Origin') !== u.origin) {
   return json({error:'Origin not allowed'},403);
  }
  if (u.pathname === '/api/create' && request.method === 'POST') {
   // A collision must never hand the creator someone else's room.
   for (let attempt = 0; attempt < 3; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = [...bytes].map(n => alphabet[n % alphabet.length]).join('');
    const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(u.origin+'/init',{method:'POST'}));
    if (response.status === 409) continue;
    return json({...await response.json(),code},response.status);
   }
   return json({error:'Could not create a room. Please try again.'},503);
  }
  const match = u.pathname.match(/^\/api\/room\/([A-Z2-9]{8})(\/ice)?$/);
  if (match) return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  return json({error:'Not found'},404);
 }
};

export class GameRoom {
 constructor(ctx,env) {
  this.ctx=ctx; this.env=env; this.clients=new Map(); this.created=false;
  this.state=null; this.level=0; this.mode='trial'; this.last=Date.now();
 }

 expire() {
  clearInterval(this.timer); this.timer=null; this.created=false;
  const clients=[...this.clients.values()];
  this.clients.clear(); this.host=undefined; this.state=null;
  for (const c of clients) { try {c.ws.close(1000,'Room expired');} catch {} }
 }

 async fetch(request) {
  const u = new URL(request.url);
  if (this.created && Date.now()-this.createdAt >= ROOM_LIFETIME) this.expire();
  if (u.pathname === '/init' && request.method === 'POST') {
   if (this.created) return json({error:'Room exists'},409);
   this.created=true; this.createdAt=Date.now(); this.level=0; this.mode='trial';
   return json({ok:true});
  }
  if (!this.created) return json({error:'Room expired or not found. Ask your friend for a new code.'},404);
  if (u.pathname.endsWith('/ice')) {
   if (request.method !== 'GET') return json({error:'Method not allowed'},405);
   const token=u.searchParams.get('token');
   const c=token && [...this.clients.values()].find(c=>c.token===token && !c.disconnected);
   if (!c) return json({error:'Join a room first'},403);
   return json(await this.ice(c));
  }
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({error:'WebSocket required'},426);
  const token=u.searchParams.get('token');
  let entry=token && [...this.clients.values()].find(c=>c.token===token);
  if (token && (!entry || (entry.disconnected && Date.now()-entry.disconnected>=RECONNECT_GRACE))) {
   return json({error:'Your reserved seat expired. Join again from the home screen.'},403);
  }
  if (!entry && this.state) return json({error:this.state.phase==='playing'?'Round in progress. Ask the host to return to the lobby after this round.':'Round complete. Ask the host to return to the lobby before inviting new players.'},409);
  if (!entry && this.clients.size>=4) return json({error:'Room full. Maximum four players.'},409);
  if (entry && this.state?.phase==='playing' && this.state.mode==='race' && ![0,1].includes(entry.p.team)) return json({error:'This race started while your seat was disconnected. Join after the round.'},409);
  const pair=new WebSocketPair(), [client,server]=Object.values(pair);
  server.accept();
  if (entry) {
   const old=entry.ws;
   // Swap first so queued events from the old connection cannot affect the new seat.
   entry.ws=server; entry.disconnected=0; entry.p.fire=false; entry.p.voice=false;
   entry.lastInput=Date.now(); entry.count=0; entry.window=Date.now();
   try {old.close(1000,'Reconnected elsewhere');} catch {}
  } else {
   const used=new Set([...this.clients.values()].map(c=>c.p.character));
   let char=Number(u.searchParams.get('character'));
   if (!Number.isInteger(char)||char<0||char>=CAST.length||used.has(char)) char=CAST.find(c=>!used.has(c.id)).id;
   const id=crypto.randomUUID();
   entry={ws:server,p:player(id,char),token:crypto.randomUUID(),count:0,window:Date.now(),lastInput:Date.now()};
   this.clients.set(id,entry);
  }
  this.rehost();
  const c=entry;
  this.send(c,{type:'welcome',id:c.p.id,token:c.token,host:this.host});
  server.addEventListener('message',e=>{
   if (c.ws===server && !c.disconnected) this.message(c,e.data);
  });
  const close=()=>{
   if (c.ws!==server || c.disconnected || this.clients.get(c.p.id)!==c) return;
   c.disconnected=Date.now(); c.p.fire=false; c.p.voice=false; c.p.ready=false;
   this.rehost(); this.broadcast();
  };
  server.addEventListener('close',close); server.addEventListener('error',close);
  this.broadcast();
  if (!this.timer) {this.last=Date.now();this.timer=setInterval(()=>this.tick(),50);}
  return new Response(null,{status:101,webSocket:client});
 }

 async ice(c) {
  if (c.ice && Date.now()<c.iceUntil) return c.ice;
  if (c.icePending) return c.icePending;
  c.icePending=(async()=>{
   let result=fallbackIce();
   if (this.env.TURN_KEY_ID && this.env.TURN_API_TOKEN) {
    try {
     const response=await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(this.env.TURN_KEY_ID)+'/credentials/generate-ice-servers',{
      method:'POST',headers:{Authorization:'Bearer '+this.env.TURN_API_TOKEN,'Content-Type':'application/json'},
      body:JSON.stringify({ttl:3600}),signal:AbortSignal.timeout(8000)
     });
     if (response.ok) {
      const config=await response.json();
      if (Array.isArray(config.iceServers) && config.iceServers.some(server=>{
       const urls=Array.isArray(server.urls)?server.urls:[server.urls];
       return urls.some(url=>typeof url==='string' && /^turns?:/.test(url));
      })) result={iceServers:config.iceServers,relay:true};
     }
    } catch {}
   }
   c.ice=result; c.iceUntil=Date.now()+(result.relay?1800000:30000);
   return result;
  })();
  try {return await c.icePending;} finally {c.icePending=null;}
 }

 send(c,msg) {
  if (c.disconnected) return;
  try {c.ws.send(JSON.stringify(msg));} catch {}
 }
 error(c,error) {this.send(c,{type:'error',error});}

 message(c,raw) {
  if (this.clients.get(c.p.id)!==c || c.disconnected) return;
  if (typeof raw!=='string'||raw.length>20000) return;
  if (Date.now()-c.window>1000) {c.window=Date.now();c.count=0;}
  if (++c.count>70) return;
  let m;
  try {m=JSON.parse(raw);} catch {return;}
  if (!m || typeof m!=='object' || Array.isArray(m)) return;
  const playing=this.state?.phase==='playing';
  if (m.type==='input') {
   const {x,z}=m;
   if (typeof x!=='number'||typeof z!=='number'||!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>1||Math.abs(z)>1) return;
   const len=Math.hypot(x,z);
   c.p.aimX=len>.1?x/len:0; c.p.aimZ=len>.1?z/len:1;
   if ([.6,1,1.4].includes(m.power)) c.p.power=m.power;
   c.p.fire=playing && m.fire===true; c.lastInput=Date.now();
  } else if (m.type==='select' && !playing) {
   if (!Number.isInteger(m.character)||!CAST[m.character]) return this.error(c,'Choose a character from the roster.');
   if ([...this.clients.values()].some(v=>v!==c&&v.p.character===m.character)) return this.error(c,'That character is already taken.');
   c.p.character=m.character; c.p.ready=false; this.broadcast();
  } else if (m.type==='ready' && !playing && typeof m.ready==='boolean') {
   c.p.ready=m.ready; this.broadcast();
  } else if (m.type==='level' && c.p.id===this.host && !playing) {
   if (![0,1,2].includes(m.level) || m.level===this.level) return;
   this.level=m.level; this.state=null;
   this.clients.forEach(c=>{c.p.ready=false;c.p.team=null;}); this.broadcast();
  } else if (m.type==='mode' && c.p.id===this.host && !playing) {
   if (!MODES.includes(m.mode) || m.mode===this.mode) return;
   this.mode=m.mode; this.state=null;
   this.clients.forEach(c=>{c.p.ready=false;c.p.team=null;}); this.broadcast();
  } else if (m.type==='start' && c.p.id===this.host && !playing) {
   const active=[...this.clients.values()].filter(c=>!c.disconnected);
   if (active.length<2) return this.error(c,'Invite at least one friend, or use solo practice.');
   if (this.mode==='race' && ![2,4].includes(active.length)) return this.error(c,'Race needs exactly 2 or 4 connected players for balanced teams.');
   // A completed round's results screen offers a host rematch, not guest ready controls.
   if (!this.state && active.some(c=>c.p.id!==this.host&&!c.p.ready)) return this.error(c,'Wait for everyone to press Ready.');
   this.state=makeRound(this.level,this.mode);this.state.roundId=crypto.randomUUID();
   this.clients.forEach(c=>Object.assign(c.p,{gas:100,shots:0,cooldown:0,fire:false,team:null}));
   if (this.mode==='race') active.forEach((c,index)=>c.p.team=index%2);
   this.broadcast();
  } else if (m.type==='lobby' && c.p.id===this.host && !playing) {
   this.state=null; this.clients.forEach(c=>{c.p.ready=false;c.p.fire=false;c.p.team=null;}); this.broadcast();
  } else if (m.type==='voice' && typeof m.on==='boolean') {
   c.p.voice=m.on; this.broadcast();
  } else if (m.type==='signal') {
   const to=this.clients.get(m.to);
   if (to && to!==c && !to.disconnected && validSignal(m.data)) this.send(to,{type:'signal',from:c.p.id,data:m.data});
  } else if (m.type==='emote' && Number.isInteger(m.index) && m.index>=0 && m.index<4 && Date.now()-(c.emoteAt||0)>1500) {
   c.emoteAt=Date.now();
   this.clients.forEach(v=>this.send(v,{type:'emote',from:c.p.character,text:['NOT ME!','WHO DID THAT?','TRUST THE GAS.','SORRY, BOSS.'][m.index]}));
  } else if (m.type==='leave') {
   this.clients.delete(c.p.id); this.rehost(); this.broadcast();
   try {c.ws.close(1000,'Left room');} catch {}
   if (!this.clients.size) this.expire();
  }
 }

 rehost() {
  const previous=this.host;
  if (!this.clients.has(this.host)||this.clients.get(this.host).disconnected) {
   this.host=[...this.clients.values()].find(c=>!c.disconnected)?.p.id||[...this.clients.keys()][0];
  }
  return previous!==this.host;
 }

 tick() {
  const now=Date.now(),dt=Math.min(.1,(now-this.last)/1000);
  this.last=now;
  let changed=false;
  this.clients.forEach((c,id)=>{
   if (c.disconnected||now-c.lastInput>700) c.p.fire=false;
   if (c.disconnected&&now-c.disconnected>=RECONNECT_GRACE) {this.clients.delete(id);changed=true;}
  });
  changed=this.rehost()||changed;
  if (!this.clients.size||now-this.createdAt>=ROOM_LIFETIME) {this.expire();return;}
  if (this.state?.phase==='playing') {
   stepRound(this.state,[...this.clients.values()].filter(c=>!c.disconnected).map(c=>c.p),dt);
   this.broadcast();
  } else if (changed) this.broadcast();
 }

 broadcast() {
  const msg={type:'state',host:this.host,level:this.level,mode:this.mode,state:this.state,players:[...this.clients.values()].map(c=>({...c.p,connected:!c.disconnected}))};
  this.clients.forEach(c=>this.send(c,msg));
 }
}

function validSignal(data) {
 if (!data||typeof data!=='object'||Array.isArray(data)) return false;
 if (data.description) return ['offer','answer'].includes(data.description.type) && typeof data.description.sdp==='string';
 if (data.candidate) return typeof data.candidate==='object' && typeof data.candidate.candidate==='string';
 return false;
}

