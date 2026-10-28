import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as shared from '../src/shared.js';
import {Controls as RealControls} from '../src/controls.js';
const source=fs.readFileSync(new URL('../src/client.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').split('await loadFaces()')[0];
function harness(initialStorage={}){
 const nodes=new Map(),timers=new Map(),sockets=[],audio=[],listeners=new Map(),docListeners=new Map();let nextTimer=1;
 const listen=(map,type,fn)=>{if(!map.has(type))map.set(type,new Set());map.get(type).add(fn);};
 const eventTarget={addEventListener:(type,fn)=>listen(listeners,type,fn),removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn)};
 class Element{
  constructor(id=''){this.id=id;this.open=false;this.dataset={};this.style={};this.children=[];this.handlers={};this.selectors=new Map();this.textContent='';this.value='';this.classList={add(){},remove(){},toggle(){}};}
  append(...nodes){this.children.push(...nodes);} replaceChildren(...children){this.children=children;}setAttribute(){}focus(){doc.activeElement=this;}blur(){if(doc.activeElement===this)doc.activeElement=null;}setPointerCapture(){}
  querySelector(selector='[type="submit"]'){if(!this.selectors.has(selector))this.selectors.set(selector,new Element());return this.selectors.get(selector);}
  addEventListener(type,fn){this.handlers[type]=fn;}
  close(){if(this.open){this.open=false;this.handlers.close?.();}}showModal(){this.open=true;}
 }
 const el=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 const doc={hidden:false,body:new Element(),getElementById:el,createElement:()=>new Element(),createTextNode:text=>({textContent:text}),querySelectorAll:q=>q==='dialog[open]'?[...nodes.values()].filter(e=>e.open):[],querySelector:q=>doc.querySelectorAll(q)[0]||null,addEventListener:(type,fn)=>listen(docListeners,type,fn),removeEventListener:(type,fn)=>docListeners.get(type)?.delete(fn)};
 class Socket{
  static OPEN=1;constructor(url){this.url=url;this.readyState=0;this.messages=[];sockets.push(this);}
  send(data){this.messages.push(JSON.parse(data));}close(){this.readyState=3;this.onclose?.();}open(){this.readyState=1;}message(data){this.onmessage?.({data:JSON.stringify(data)});}
 }
 class Audio{constructor(src){this.src=src;this.paused=true;this.playCount=0;audio.push(this);}play(){this.played=true;this.paused=false;this.playCount++;return Promise.resolve();}pause(){this.paused=true;}}
 class Voice{constructor(){this.peers=new Map();}close(){}setVolume(){}sync(){return Promise.resolve();}}
 class World{constructor(){this.puffSeen=new Set();}resize(){}update(){}}
 const stored=new Map(Object.entries(initialStorage));const storage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 const navigator={getGamepads:()=>[]};
 class Controls extends RealControls{constructor(options){super({...options,eventTarget,document:doc,navigator,storage});}}
 const context=vm.createContext({...shared,crypto:webcrypto,document:doc,localStorage:storage,sessionStorage:storage,Audio,Voice,World,Controls,WebSocket:Socket,avatar:()=>new Element(),performance:{now:()=>0},matchMedia:()=>({matches:false}),window:{scrollTo(){}},location:{protocol:'https:',host:'game.example',origin:'https://game.example'},navigator,console,addEventListener:eventTarget.addEventListener,requestAnimationFrame(){},setTimeout(fn,delay){const id=nextTimer++;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),URL});
 vm.runInContext(source,context);
 return {run:code=>vm.runInContext(code,context),el,doc,sockets,timers,stored,audio,emit(type,props={}){const event={target:{tagName:'BUTTON'},preventDefault(){},stopImmediatePropagation(){},...props};for(const fn of listeners.get(type)||[])fn(event);},emitDoc(type){for(const fn of docListeners.get(type)||[])fn();}};
}
const welcome={type:'welcome',id:'me',token:'secret',host:'me'};
test('changing thrust power releases select focus and pointer fire recovers from editable focus',()=>{
 const h=harness();h.run('practice();processState()');const select=h.el('powerSelect');select.tagName='SELECT';select.value='1.4';select.focus();select.onchange();assert.equal(h.doc.activeElement,null);assert.equal(h.run('power'),1.4);
 select.focus();h.el('fartBtn').tagName='BUTTON';h.el('fartBtn').onpointerdown({preventDefault(){},pointerId:1});assert.equal(h.doc.activeElement,h.el('fartBtn'));assert.equal(h.run('control().fire'),true);
});
test('leaving cancels delayed reconnect and prevents a stale welcome from reopening a room',()=>{
 const h=harness();h.run("connect('ABCD2345')");const old=h.sockets[0];old.open();old.message(welcome);old.close();
 const retry=[...h.timers.values()].find(t=>t.delay===1000).fn;h.run('leave()');retry();old.message(welcome);
 assert.equal(h.sockets.length,1);assert.equal(h.run('current'),'home');assert.equal(h.run('token'),'');assert.equal(h.stored.has('puk-room'),false);
});
test('switching to solo invalidates the previous online socket',()=>{
 const h=harness();h.run("connect('ABCD2345')");const old=h.sockets[0];old.open();old.message(welcome);h.run('practice()');old.message({type:'state',players:[],state:null,host:'other',level:2});
 assert.equal(h.run('solo'),true);assert.equal(h.run('current'),'game');assert.equal(h.run('players.length'),1);assert.equal(h.run('code'),'');
});
test('opening settings immediately releases held keyboard and touch firing',()=>{
 const h=harness();h.run('practice()');h.emit('keydown',{code:'Space'});h.run("controls.pointerFire=true;firing=true;players[0].fire=true;openDialog('settingsDialog')");
 assert.equal(h.run('controls.held.size'),0);assert.equal(h.run('firing'),false);assert.equal(h.run('players[0].fire'),false);assert.equal(h.run('control().fire'),false);
});
test('practice time pauses behind a modal and resumes when closed',()=>{
 const h=harness();h.run("practice();processState();openDialog('settingsDialog')");const before=h.run('state.time');h.run('loop(30)');assert.equal(h.run('state.time'),before);
 h.el('settingsDialog').close();h.run('loop(60)');assert.ok(h.run('state.time')<before);
});
test('closing Join cancels an incomplete connection even after the socket opens',()=>{
 const h=harness();h.run("openDialog('joinDialog');connect('ABCD2345')");const old=h.sockets[0];old.open();h.el('joinDialog').close();old.message(welcome);
 assert.equal(h.run('current'),'home');assert.equal(h.run('socket'),null);assert.equal(h.el('joinForm').querySelector().disabled,false);
});
test('successful joining is not canceled by closing the join dialog on welcome',()=>{
 const h=harness();h.run("openDialog('joinDialog');connect('ABCD2345')");const socket=h.sockets[0];socket.open();socket.message(welcome);
 assert.equal(h.run('current'),'lobby');assert.equal(socket.readyState,1);assert.equal(h.el('joinDialog').open,false);
});
test('reconnection does not overwrite the server course with an old home selection',()=>{
 const h=harness();h.run("token='secret';level=2;connect('ABCD2345',true)");const socket=h.sockets[0];socket.open();socket.message(welcome);
 assert.equal(socket.messages.some(m=>m.type==='level'),false);
});
test('starting a new round clears previous results and resets aim',()=>{
 const h=harness();h.run("practice();state.phase='lost';processState();state=fresh(0);aim={x:-1,z:0};processState()");
 assert.equal(h.el('resultDialog').open,false);assert.equal(h.run('aim.x'),0);assert.equal(h.run('aim.z'),1);assert.equal(h.run('wasPhase'),'playing');
});
function raceFixture(h){
 h.run("mode='race';current='game';me='mint';host='papaya';players=[Object.assign(player('papaya',0),{team:0,shots:9}),Object.assign(player('mint',1),{team:1,shots:3})];state=makeRound(0,'race');Object.assign(state.boats[0],{z:120,hull:16,beans:8,time:15});Object.assign(state.boats[1],{z:30,hull:72,beans:2,time:90});processState()");
}
test('race HUD shows the local team raft and keeps rival progress separate',()=>{
 const h=harness();raceFixture(h);
 assert.equal(h.el('progress').textContent,'20%');assert.equal(h.el('hull').value,72);assert.equal(h.el('beans').textContent,'2 BEANS RESCUED');assert.equal(h.el('timer').textContent,'1:30');
 assert.match(h.el('raceBoard').innerHTML,/MINT · YOU/);assert.equal(h.run('myCrew().length'),1);assert.equal(h.run('myCrew()[0].id'),'mint');
});
test('losing a team race plays supplied defeat track and reports only the local crew',()=>{
 const h=harness();raceFixture(h);h.run("state.phase='won';state.winner=0;state.elapsed=45;state.boats[0].phase='won';processState()");
 assert.equal(h.audio.find(a=>a.src.endsWith('/lose.mp3')).playCount,1);assert.equal(h.el('resultEyebrow').textContent,'OFFICIAL INCIDENT REPORT');assert.equal(h.run('records.wins'),0);
 assert.match(h.el('resultStats').innerHTML,/<b>2<\/b><small>BEANS/);assert.match(h.el('resultStats').innerHTML,/<b>3<\/b><small>EMISSIONS/);assert.equal(h.el('blameReport').children.length,1);
});
test('race defeat keeps music paused when audio is unlocked again',()=>{
 const h=harness();raceFixture(h);h.run("state.phase='won';state.winner=0;processState();audioUnlock()");
 assert.equal(h.audio.find(a=>a.src.endsWith('/background.mp3')).paused,true);
});
test('a sunk local race raft cannot fire while spectating the other team',()=>{
 const h=harness();raceFixture(h);h.run("state.boats[1].phase='lost';processState()");h.emit('keydown',{code:'Space'});assert.equal(h.run('control().fire'),false);assert.match(h.el('gameCaption').textContent,/raft is out/);
});
test('a race draw plays no defeat track and awards no personal win',()=>{
 const h=harness();raceFixture(h);h.run("state.phase='won';state.winner=null;processState()");assert.equal(h.audio.find(a=>a.src.endsWith('/lose.mp3')).playCount,0);assert.equal(h.run('records.wins'),0);assert.match(h.el('resultEyebrow').textContent,/TIE/);
});
test('free sailing shows elapsed time with the no-countdown label',()=>{
 const h=harness();h.run("mode='free';practice();state.elapsed=61.2;processState()");assert.equal(h.run('state.time'),null);assert.equal(h.el('clockLabel').textContent,'TIME WELL WASTED');assert.equal(h.el('timer').textContent,'1:02');
});
test('successful time trials persist personal best by course and crew size only once per result',()=>{
 const h=harness();h.run("practice();state.phase='won';state.elapsed=21.123;processState();processState()");assert.equal(h.run('records.wins'),1);assert.equal(h.run("records.best['0-1']"),21.12);
 h.run("practice();players.push(player('friend',3));state.phase='won';state.elapsed=30.4;processState()");assert.equal(h.run("records.best['0-2']"),30.4);assert.equal(h.run("records.best['0-1']"),21.12);
 const saved=JSON.parse(h.stored.get('puk-records'));assert.equal(saved.wins,2);assert.equal(saved.best['0-1'],21.12);assert.equal(saved.best['0-2'],30.4);
 h.run("practice();state.phase='won';state.elapsed=40;processState()");assert.equal(h.run("records.best['0-1']"),21.12);
});
test('free finishes unlock trim progression without writing time trial records',()=>{
 const h=harness();h.run("mode='free';practice();state.phase='won';state.elapsed=25;processState()");assert.equal(h.run("unlockedTrim('gold')"),true);assert.equal(h.run('Object.keys(records.best).length'),0);
 h.run("level=1;practice();state.phase='won';processState();level=2;practice();state.phase='won';processState()");assert.equal(h.run("unlockedTrim('mint')"),true);
});
test('solo practice requested from Team Race falls back to Time Trial',()=>{
 const h=harness();h.run("mode='race';practice()");assert.equal(h.run('mode'),'trial');assert.equal(h.run('state.mode'),'trial');assert.equal(h.el('homeMode').value,'trial');assert.equal(h.run('players.length'),1);
});

test('replaying the same finished round after phase reset or reload cannot award another win',()=>{
 const h=harness();h.run("practice();state.roundId='completed-online-round';state.phase='won';state.elapsed=32.54;processState();wasPhase='';processState()");
 assert.equal(h.run('records.wins'),1);assert.equal(h.run('records.seen.length'),1);assert.equal(h.run("records.best['0-1']"),32.54);
 const next=harness({'puk-records':h.stored.get('puk-records')});next.run("practice();state.roundId='completed-online-round';state.phase='won';state.elapsed=32.54;processState()");
 assert.equal(next.run('records.wins'),1);assert.equal(next.run('records.seen.length'),1);assert.equal(next.run("records.best['0-1']"),32.54);
});
