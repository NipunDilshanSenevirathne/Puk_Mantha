import test from 'node:test';
import assert from 'node:assert/strict';
import {Voice} from '../src/voice.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const sent=[],notifications=[],connections=[],audio=[];let requests=0;
 const track={enabled:true,stopped:false,stop(){this.stopped=true;},addEventListener(){}};
 const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{requests++;return stream;}}}});
 globalThis.fetch=async()=>({ok:true,json:async()=>({iceServers:[],relay:true})});
 globalThis.document={body:{append(){}},createElement:()=>{const a={play:async()=>{},pause(){this.paused=true;},remove(){this.removed=true;}};audio.push(a);return a;}};
 class PC{
  constructor(){this.candidates=[];connections.push(this);}
  addTrack(){} async createOffer(){return {type:'offer',sdp:'test'};}async createAnswer(){return {type:'answer',sdp:'test'};}
  async setLocalDescription(d){if(this.closed)throw Error('closed');this.localDescription=d;}
  async setRemoteDescription(d){if(this.closed)throw Error('closed');this.remoteDescription=d;}
  async addIceCandidate(c){assert.ok(this.remoteDescription);this.candidates.push(c);}
  close(){this.closed=true;}
 }
 globalThis.RTCPeerConnection=PC;
 const voice=new Voice(m=>sent.push(m),m=>notifications.push(m),()=>{});
 return {voice,sent,notifications,connections,audio,track,stream,get requests(){return requests;}};
}
test('rapid Enable clicks request one mic and preserve the enabled state',async()=>{
 const h=harness();await Promise.all([h.voice.enable('ABCD2345','token'),h.voice.enable('ABCD2345','token')]);
 assert.equal(h.requests,1);assert.equal(h.voice.enabled,true);assert.equal(h.voice.muted,false);h.voice.close();
});
test('leaving while mic permission is pending stops the resulting stream',async()=>{
 const h=harness();let grant;navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>grant=resolve);
 const pending=h.voice.enable('ABCD2345','token');await tick();h.voice.close();grant(h.stream);await pending;
 assert.equal(h.track.stopped,true);assert.equal(h.voice.enabled,false);assert.equal(h.sent.length,0);
});
test('ICE received before an offer is queued and processed after its description',async()=>{
 const h=harness();await h.voice.enable('ABCD2345','token');await h.voice.sync([{id:'a',voice:true,connected:true}],'z');
 await h.voice.signal('a',{candidate:{candidate:'ice'}});await h.voice.signal('a',{description:{type:'offer',sdp:'sdp'}});
 assert.equal(h.connections[0].candidates.length,1);assert.ok(h.sent.some(m=>m.type==='signal'&&m.data.description?.type==='answer'));h.voice.close();
});
test('state bursts create one outgoing offer per player; departures release media',async()=>{
 const h=harness();await h.voice.enable('ABCD2345','token');
 const players=[{id:'z',voice:true,connected:true}];await Promise.all([h.voice.sync(players,'a'),h.voice.sync(players,'a'),h.voice.sync(players,'a')]);await tick();
 assert.equal(h.connections.length,1);assert.equal(h.sent.filter(m=>m.type==='signal').length,1);
 await h.voice.sync([],'a');assert.equal(h.voice.peers.size,0);assert.equal(h.connections[0].closed,true);assert.equal(h.audio[0].removed,true);h.voice.close();
});
test('concurrent description and ICE messages serialize without negotiation errors',async()=>{
 const h=harness();await h.voice.enable('ABCD2345','token');await h.voice.sync([{id:'a',voice:true,connected:true}],'z');
 await Promise.all([h.voice.signal('a',{description:{type:'offer',sdp:'x'}}),h.voice.signal('a',{candidate:{candidate:'one'}}),h.voice.signal('a',{candidate:{candidate:'two'}})]);
 assert.equal(h.connections[0].candidates.length,2);assert.deepEqual(h.notifications,[]);h.voice.close();
});
test('close invalidates queued negotiation and removes audio and meters',async()=>{
 const h=harness();await h.voice.enable('ABCD2345','token');await h.voice.sync([{id:'z',voice:true,connected:true}],'a');h.voice.close();await tick();
 assert.equal(h.voice.peers.size,0);assert.equal(h.track.stopped,true);assert.equal(h.voice.localAnalyser,null);assert.equal(h.sent.filter(m=>m.type==='signal').length,0);
});
test('unknown senders cannot allocate peer connections',async()=>{
 const h=harness();await h.voice.enable('ABCD2345','token');await h.voice.signal('unknown',{description:{type:'offer',sdp:'x'}});assert.equal(h.connections.length,0);h.voice.close();
});
test('mute toggles track and outgoing presence; volume clamps safely',async()=>{
 const h=harness();await h.voice.enable('ABCD2345','token');await h.voice.enable('ABCD2345','token');assert.equal(h.track.enabled,false);assert.deepEqual(h.sent.at(-1),{type:'voice',on:false});
 h.voice.setVolume(12);assert.equal(h.voice.volume,1);h.voice.setVolume(NaN);assert.equal(h.voice.volume,0);h.voice.close();
});
