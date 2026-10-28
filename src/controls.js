export const DEFAULT_BINDINGS=Object.freeze({up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',fire:'Space',mic:'KeyV'});
export const CONTROLS_STORAGE_KEY='puk-controls-v1';
const ARROWS=Object.freeze({up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'});
const EXTRA_CODES=new Set(['Space','Comma','Period','Slash','Semicolon','Quote','BracketLeft','BracketRight','Backslash','Minus','Equal','Backquote','NumpadAdd','NumpadSubtract','NumpadMultiply','NumpadDivide','NumpadDecimal']);
const validCode=code=>typeof code==='string'&&(/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)||EXTRA_CODES.has(code));
const editable=target=>!!target&&(target.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(target.tagName)||!!target.closest?.('[contenteditable="true"]'));
const pressed=button=>typeof button==='number'?button>.5:!!button&&(button.pressed||button.value>.5);

/** Local keyboard/touch/gamepad input; send poll() results to the authoritative room. */
export class Controls {
 constructor({getActive=()=>true,onMic=()=>{},onChange=()=>{},eventTarget=globalThis,document=globalThis.document,navigator=globalThis.navigator,storage}={}) {
  this.getActive=getActive;this.onMic=onMic;this.onChange=onChange;
  this.eventTarget=eventTarget;this.document=document;this.navigator=navigator;
  try {this.storage=storage===undefined?globalThis.localStorage:storage;} catch {this.storage=null;}
  this._bindings={...DEFAULT_BINDINGS};this._aim={x:0,z:1};this._pointerFire=false;this.held=new Set();this.padFireArmed=true;
  try {
   const saved=JSON.parse(this.storage?.getItem(CONTROLS_STORAGE_KEY)||'null');
   // Restore atomically: a corrupt or conflicting configuration never leaves half a layout.
   if(saved&&Object.keys(DEFAULT_BINDINGS).every(action=>validCode(saved[action]))&&new Set(Object.keys(DEFAULT_BINDINGS).map(action=>saved[action])).size===6){
    for(const action of Object.keys(DEFAULT_BINDINGS))this._bindings[action]=saved[action];
   }
  } catch {}
  this.handleDown=event=>{
   if(!this.active()||editable(event.target)||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
   const code=event.code;
   if(!Object.values(this._bindings).includes(code)&&!Object.values(ARROWS).includes(code))return;
   event.preventDefault();
   // A repeat after clear() cannot turn a previously held key back on.
   if(event.repeat)return;
   const alreadyHeld=this.held.has(code);this.held.add(code);
   if(code===this._bindings.mic&&!alreadyHeld)this.onMic();
  };
  this.handleUp=event=>{this.held.delete(event.code);};
  this.handleBlur=()=>this.clear();
  this.handleVisibility=()=>{if(this.document?.hidden)this.clear();};
  eventTarget?.addEventListener?.('keydown',this.handleDown);
  eventTarget?.addEventListener?.('keyup',this.handleUp);
  eventTarget?.addEventListener?.('blur',this.handleBlur);
  document?.addEventListener?.('visibilitychange',this.handleVisibility);
 }
 active(){return !this.document?.hidden&&!editable(this.document?.activeElement)&&!!this.getActive();}
 get bindings(){return {...this._bindings};}
 get aim(){return {...this._aim};}
 set aim(value){this.setAim(value?.x,value?.z);}
 setAim(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  const length=Math.hypot(x,z);if(length<.001)return false;
  this._aim={x:x/length,z:z/length};return true;
 }
 get pointerFire(){return this._pointerFire;}
 set pointerFire(value){this._pointerFire=value===true&&this.active();}
 setBinding(action,code){
  if(!Object.hasOwn(DEFAULT_BINDINGS,action)||!validCode(code))return false;
  if(Object.entries(this._bindings).some(([other,bound])=>other!==action&&bound===code))return false;
  if(this._bindings[action]===code)return true;
  this._bindings[action]=code;this.clear();this.persist();this.onChange(this.bindings);return true;
 }
 reset(){this._bindings={...DEFAULT_BINDINGS};this.clear();this.persist();this.onChange(this.bindings);}
 persist(){try{this.storage?.setItem(CONTROLS_STORAGE_KEY,JSON.stringify(this._bindings));}catch{}}
 bindingLabel(action){return Controls.codeLabel(this._bindings[action]);}
 static codeLabel(code){
  if(!code)return 'Unbound';
  if(code.startsWith('Key'))return code.slice(3);
  if(code.startsWith('Digit'))return code.slice(5);
  if(code.startsWith('Numpad'))return 'Num '+code.slice(6);
  return ({Space:'Space',Comma:',',Period:'.',Slash:'/',Semicolon:';',Quote:"'",BracketLeft:'[',BracketRight:']',Backslash:'\\',Minus:'−',Equal:'=',Backquote:'`'})[code]||code;
 }
 gamepad(){
  let pads;try{pads=this.navigator?.getGamepads?.()||[];}catch{return {x:0,z:0,fire:false};}
  // Standard mapping avoids treating an unknown controller's menu button as fire.
  const pad=Array.from(pads).find(p=>p&&p.connected!==false&&p.mapping==='standard');
  if(!pad)return {x:0,z:0,fire:false};
  let x=Number(pad.axes?.[0])||0,z=-(Number(pad.axes?.[1])||0);
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(x,z)<.2){x=0;z=0;}
  const buttons=pad.buttons||[];
  const dpadX=Number(pressed(buttons[15]))-Number(pressed(buttons[14])),dpadZ=Number(pressed(buttons[12]))-Number(pressed(buttons[13]));
  if(dpadX||dpadZ){x=dpadX;z=dpadZ;}
  return {x,z,fire:pressed(buttons[0])||pressed(buttons[7])};
 }
 poll(allowInput=true){
  if(!allowInput||!this.active()){this.clear();return {...this._aim,fire:false};}
  const pad=this.gamepad();if(!pad.fire)this.padFireArmed=true;
  const down=action=>this.held.has(this._bindings[action])||this.held.has(ARROWS[action]);
  let x=Number(down('right'))-Number(down('left')),z=Number(down('up'))-Number(down('down'));
  if(!x&&!z){x=pad.x;z=pad.z;}
  if(x||z)this.setAim(x,z);
  return {...this._aim,fire:this._pointerFire||this.held.has(this._bindings.fire)||(this.padFireArmed&&pad.fire)};
 }
 clear(){this.held.clear();this._pointerFire=false;this.padFireArmed=false;}
 destroy(){
  this.clear();this.eventTarget?.removeEventListener?.('keydown',this.handleDown);this.eventTarget?.removeEventListener?.('keyup',this.handleUp);this.eventTarget?.removeEventListener?.('blur',this.handleBlur);this.document?.removeEventListener?.('visibilitychange',this.handleVisibility);
 }
}
