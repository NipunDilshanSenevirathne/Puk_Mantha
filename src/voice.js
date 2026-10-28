export class Voice {
 constructor(send, notify, onChange) {
  Object.assign(this, {send, notify, onChange, peers:new Map(), retryAfter:new Map(), volume:1, enabled:false, muted:false, audioContext:null, generation:0, members:new Set()});
 }
 async enable(code, token) {
  if (this.enabling) return this.enabling;
  if (this.stream) {
   this.muted=!this.muted;
   this.stream.getAudioTracks().forEach(t=>t.enabled=!this.muted);
   this.send({type:'voice',on:!this.muted});
   this.audioContext?.resume().catch(()=>{});
   this.peers.forEach(p=>p.audio.play().catch(()=>{}));
   this.onChange(); return;
  }
  const generation=this.generation;
  const task=(async()=>{
   let stream;
   try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone needs HTTPS or localhost.');
    const response=await fetch(`/api/room/${encodeURIComponent(code)}/ice?token=${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error('Join the room before enabling voice.');
    const config=await response.json();
    if (generation!==this.generation) return;
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if (generation!==this.generation) {stream.getTracks().forEach(t=>t.stop()); return;}
    this.config={iceServers:config.iceServers}; this.relay=!!config.relay;
    this.stream=stream; this.enabled=true; this.muted=false;
    // Audio metering is optional: it must not discard a working microphone.
    try {
     const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
     this.audioContext=new Context();
     this.audioContext.resume().catch(()=>{});
     this.localAnalyser=this.audioContext.createAnalyser();this.localAnalyser.fftSize=256;
     this.localSource=this.audioContext.createMediaStreamSource(stream);this.localSource.connect(this.localAnalyser);
    } catch {}
    stream.getAudioTracks().forEach(track=>track.addEventListener?.('ended',()=>{
     if (generation!==this.generation) return;
     this.send({type:'voice',on:false});this.close();this.notify('Microphone disconnected. Enable voice to reconnect it.');
    }));
    this.send({type:'voice',on:true});this.onChange();
    if (!this.relay) this.notify('Voice relay is not configured. Some networks may not connect.');
   } catch(e) {
    if (generation!==this.generation) return;
    stream?.getTracks().forEach(t=>t.stop());
    this.notify(e.name==='NotAllowedError'?'Microphone permission denied. Allow it in browser settings to use voice.':e.message);
   }
  })();
  this.enabling=task;
  try {await task;} finally {if (this.enabling===task) this.enabling=null;}
 }
 async sync(players, me) {
  this.me=me;
  this.members=new Set(players.filter(p=>p.id!==me&&p.connected).map(p=>p.id));
  for (const id of this.peers.keys()) if (!this.members.has(id)) this.drop(id);
  if (!this.stream) return;
  for (const p of players) {
   if (p.id===me||!p.voice||!p.connected||this.peers.has(p.id)||me>=p.id||(this.retryAfter.get(p.id)||0)>Date.now()) continue;
   const peer=this.make(p.id);
   this.enqueue(peer,async()=>{
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    if (this.isCurrent(p.id,peer)) this.send({type:'signal',to:p.id,data:{description:peer.pc.localDescription}});
   });
  }
 }
 isCurrent(id, peer) {return this.peers.get(id)===peer&&peer.generation===this.generation;}
 enqueue(peer, action) {
  peer.queue=peer.queue.then(()=>this.isCurrent(peer.id,peer)?action():undefined).catch(()=>{
   if (this.isCurrent(peer.id,peer)) {this.retryAfter.set(peer.id,Date.now()+10000);this.drop(peer.id);this.notify('Could not connect one player’s voice. Check their microphone and connection.');}
  });
  return peer.queue;
 }
 make(id) {
  const pc=new RTCPeerConnection(this.config), audio=document.createElement('audio');
  audio.autoplay=true;audio.playsInline=true;audio.volume=this.volume;document.body.append(audio);
  const peer={id,pc,audio,pending:[],muted:false,generation:this.generation,queue:Promise.resolve()};this.peers.set(id,peer);
  this.stream.getTracks().forEach(track=>pc.addTrack(track,this.stream));
  pc.onicecandidate=e=>{if (e.candidate&&this.isCurrent(id,peer)) this.send({type:'signal',to:id,data:{candidate:e.candidate}});};
  pc.ontrack=e=>{
   if (!this.isCurrent(id,peer)) return;
   const stream=e.streams[0]||new MediaStream([e.track]);audio.srcObject=stream;
   audio.play().catch(()=>this.notify('Tap the microphone button to allow voice playback.'));
   if (this.audioContext) {
    peer.source?.disconnect();peer.analyser?.disconnect();
    peer.analyser=this.audioContext.createAnalyser();peer.analyser.fftSize=256;
    peer.source=this.audioContext.createMediaStreamSource(stream);peer.source.connect(peer.analyser);
   }
   this.onChange();
  };
  pc.onconnectionstatechange=()=>{
   if (!this.isCurrent(id,peer)) return;
   if (pc.connectionState==='failed') {this.retryAfter.set(id,Date.now()+10000);this.drop(id);this.notify('A voice connection failed. A TURN relay may be needed on this network.');}
   this.onChange();
  };
  this.onChange();return peer;
 }
 async signal(from,data) {
  if (!this.stream||!data||!this.members.has(from)) return;
  if (data.description&&!['offer','answer'].includes(data.description.type)) return;
  const peer=this.peers.get(from)||this.make(from);
  return this.enqueue(peer,async()=>{
   if (data.description) {
    await peer.pc.setRemoteDescription(data.description);
    if (!this.isCurrent(from,peer)) return;
    for (const candidate of peer.pending) await peer.pc.addIceCandidate(candidate);
    peer.pending=[];
    if (data.description.type==='offer') {
     await peer.pc.setLocalDescription(await peer.pc.createAnswer());
     if (this.isCurrent(from,peer)) this.send({type:'signal',to:from,data:{description:peer.pc.localDescription}});
    }
   } else if (data.candidate) {
    if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
    else if (peer.pending.length<128) peer.pending.push(data.candidate);
   }
  });
 }
 drop(id) {
  const p=this.peers.get(id);if (!p) return;
  this.peers.delete(id);p.pc.onicecandidate=null;p.pc.ontrack=null;p.pc.onconnectionstatechange=null;p.pc.close();
  p.source?.disconnect();p.analyser?.disconnect();p.audio.pause();p.audio.srcObject=null;p.audio.remove();
 }
 mutePeer(id) {const p=this.peers.get(id);if(p){p.muted=!p.muted;p.audio.muted=p.muted;this.onChange();}}
 speaking(id) {
  const peer=this.peers.get(id),a=id===this.me?this.localAnalyser:peer?.analyser;
  if (!a||(id===this.me&&this.muted)||peer?.muted) return false;
  const samples=new Uint8Array(a.fftSize);a.getByteTimeDomainData(samples);return samples.some(v=>Math.abs(v-128)>12);
 }
 setVolume(v) {this.volume=Math.max(0,Math.min(1,Number(v)||0));this.peers.forEach(p=>p.audio.volume=this.volume);}
 close() {
  this.generation++;this.enabling=null;
  this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
  for (const id of this.peers.keys()) this.drop(id);
  this.localSource?.disconnect();this.localSource=null;this.localAnalyser=null;
  this.audioContext?.close().catch(()=>{});this.audioContext=null;
  this.enabled=false;this.muted=false;this.relay=false;this.members.clear();this.retryAfter.clear();this.onChange();
 }
}
