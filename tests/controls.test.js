import test from 'node:test';
import assert from 'node:assert/strict';
import {Controls,DEFAULT_BINDINGS,CONTROLS_STORAGE_KEY} from '../src/controls.js';
function harness(saved){
 const listeners=new Map();const target={addEventListener(k,fn){(listeners.get(k)||listeners.set(k,new Set()).get(k)).add(fn);},removeEventListener(k,fn){listeners.get(k)?.delete(fn);}};
 const stored=new Map(saved?[[CONTROLS_STORAGE_KEY,JSON.stringify(saved)]]:[]);const storage={getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)};
 const doc={...target,hidden:false,activeElement:null};let active=true,pads=[],mics=0,changes=0;
 const controls=new Controls({eventTarget:target,document:doc,navigator:{getGamepads:()=>pads},storage,getActive:()=>active,onMic:()=>mics++,onChange:()=>changes++});
 function emit(type,props={}){const event={code:'',target:{tagName:'BUTTON'},prevented:false,preventDefault(){this.prevented=true;},...props};for(const listener of listeners.get(type)||[])listener(event);return event;}
 return {controls,emit,doc,stored,listeners,set active(v){active=v;},set pads(v){pads=v;},get mics(){return mics;},get changes(){return changes;}};
}
const pad=(x=0,y=0,fire=false)=>({connected:true,mapping:'standard',axes:[x,y],buttons:Array.from({length:16},(_,i)=>({pressed:i===0&&fire,value:i===0&&fire?1:0}))});
test('physical key codes aim diagonally and remember the direction after release',()=>{
 const h=harness();assert.equal(h.emit('keydown',{code:'KeyW',key:'z'}).prevented,true);h.emit('keydown',{code:'KeyD'});
 let input=h.controls.poll();assert.ok(Math.abs(input.x-Math.SQRT1_2)<1e-9);assert.ok(Math.abs(input.z-Math.SQRT1_2)<1e-9);
 h.emit('keyup',{code:'KeyW'});h.emit('keyup',{code:'KeyD'});assert.deepEqual(h.controls.poll(),input);
});
test('custom fire keys persist and default Space stops firing after rebinding',()=>{
 const h=harness();assert.equal(h.controls.setBinding('fire','KeyF'),true);h.emit('keydown',{code:'Space'});assert.equal(h.controls.poll().fire,false);
 h.emit('keydown',{code:'KeyF'});assert.equal(h.controls.poll().fire,true);assert.equal(JSON.parse(h.stored.get(CONTROLS_STORAGE_KEY)).fire,'KeyF');assert.equal(h.changes,1);
 const restored=harness(JSON.parse(h.stored.get(CONTROLS_STORAGE_KEY)));assert.equal(restored.controls.bindings.fire,'KeyF');assert.equal(restored.controls.bindingLabel('fire'),'F');
});
test('rebinding rejects conflicts, modifiers, reserved arrows and unknown actions',()=>{
 const h=harness();for(const code of ['KeyW','ShiftLeft','ControlRight','AltLeft','MetaLeft','ArrowUp','Escape','Tab','Enter','F5',''])assert.equal(h.controls.setBinding('fire',code),false,code);
 assert.equal(h.controls.setBinding('__proto__','KeyJ'),false);assert.deepEqual(h.controls.bindings,DEFAULT_BINDINGS);
});
test('arrow directions remain usable after alternate movement keys change',()=>{
 const h=harness();h.controls.setBinding('up','KeyI');h.emit('keydown',{code:'ArrowUp'});assert.deepEqual(h.controls.poll(),{x:0,z:1,fire:false});
 h.emit('keyup',{code:'ArrowUp'});h.emit('keydown',{code:'ArrowLeft'});assert.deepEqual(h.controls.poll(),{x:-1,z:0,fire:false});
});
test('microphone callback fires once per press, ignoring repeats and modifier shortcuts',()=>{
 const h=harness();h.emit('keydown',{code:'KeyV'});h.emit('keydown',{code:'KeyV',repeat:true});h.emit('keydown',{code:'KeyV'});assert.equal(h.mics,1);
 h.emit('keyup',{code:'KeyV'});h.emit('keydown',{code:'KeyV',ctrlKey:true});assert.equal(h.mics,1);h.emit('keydown',{code:'KeyV'});assert.equal(h.mics,2);
});
test('typing targets and inactive screens never capture keyboard input',()=>{
 const h=harness();for(const tagName of ['INPUT','SELECT','TEXTAREA'])assert.equal(h.emit('keydown',{code:'Space',target:{tagName}}).prevented,false);
 h.emit('keydown',{code:'Space',target:{isContentEditable:true}});assert.equal(h.controls.poll().fire,false);h.active=false;assert.equal(h.emit('keydown',{code:'Space'}).prevented,false);assert.equal(h.controls.poll().fire,false);
});
test('modal clear releases held fire and key repeat cannot re-arm it',()=>{
 const h=harness();h.emit('keydown',{code:'Space'});h.controls.pointerFire=true;assert.equal(h.controls.poll().fire,true);
 assert.equal(h.controls.poll(false).fire,false);h.emit('keydown',{code:'Space',repeat:true});assert.equal(h.controls.poll().fire,false);
 h.emit('keyup',{code:'Space'});h.emit('keydown',{code:'Space'});assert.equal(h.controls.poll().fire,true);
});
test('blur and hidden document clear all held inputs without changing last aim',()=>{
 const h=harness();h.controls.aim={x:0,z:-1};h.emit('keydown',{code:'Space'});h.emit('blur');assert.deepEqual(h.controls.poll(),{x:0,z:-1,fire:false});
 h.emit('keydown',{code:'Space'});h.doc.hidden=true;h.emit('visibilitychange');h.doc.hidden=false;assert.equal(h.controls.poll().fire,false);
});
test('standard controller left stick applies deadzone, correct forward axis and normalization',()=>{
 const h=harness();h.pads=[pad(.1,-.1)];assert.deepEqual(h.controls.poll(),{x:0,z:1,fire:false});h.pads=[pad(.7,-.7)];let input=h.controls.poll();assert.ok(Math.abs(input.x-Math.SQRT1_2)<1e-9);assert.ok(Math.abs(input.z-Math.SQRT1_2)<1e-9);
 h.pads=[pad()];assert.deepEqual(h.controls.poll(),input);
});
test('controller A and right trigger fire; a held button must be released after clear',()=>{
 const h=harness();h.pads=[pad(0,0,true)];assert.equal(h.controls.poll().fire,true);h.controls.clear();assert.equal(h.controls.poll().fire,false);
 h.pads=[pad()];h.controls.poll();const trigger=pad();trigger.buttons[7]={pressed:true,value:.9};h.pads=[trigger];assert.equal(h.controls.poll().fire,true);
});
test('keyboard direction takes priority over controller and pointer input is normalized',()=>{
 const h=harness();h.controls.aim={x:3,z:4};assert.deepEqual(h.controls.aim,{x:.6,z:.8});h.pads=[pad(1,0)];h.emit('keydown',{code:'ArrowUp'});assert.deepEqual(h.controls.poll(),{x:0,z:1,fire:false});
 h.controls.aim={x:Infinity,z:0};assert.deepEqual(h.controls.aim,{x:0,z:1});
});
test('unknown controller mappings and inaccessible gamepad APIs are ignored safely',()=>{
 const h=harness();h.pads=[{...pad(1,0,true),mapping:''}];assert.deepEqual(h.controls.poll(),{x:0,z:1,fire:false});h.controls.navigator={getGamepads(){throw Error('blocked');}};assert.equal(h.controls.poll().fire,false);
});
test('malformed persisted bindings restore defaults atomically and reset updates storage',()=>{
 const h=harness({...DEFAULT_BINDINGS,fire:'KeyW'});assert.deepEqual(h.controls.bindings,DEFAULT_BINDINGS);
 h.controls.setBinding('fire','KeyF');const copy=h.controls.bindings;copy.up='KeyZ';assert.equal(h.controls.bindings.up,'KeyW');h.controls.reset();assert.deepEqual(h.controls.bindings,DEFAULT_BINDINGS);assert.deepEqual(JSON.parse(h.stored.get(CONTROLS_STORAGE_KEY)),DEFAULT_BINDINGS);
});
test('destroy removes listeners and releases keyboard and touch state',()=>{
 const h=harness();h.emit('keydown',{code:'Space'});h.controls.pointerFire=true;h.controls.destroy();assert.equal(h.controls.pointerFire,false);assert.equal(h.controls.held.size,0);for(const set of h.listeners.values())assert.equal(set.size,0);
});
