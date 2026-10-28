import * as T from 'three';
import {CAST,COURSES,center,obstacles,obstacleX} from './shared.js';
export const faces=[];
export async function loadFaces(){
 const results=await Promise.allSettled(CAST.map(async c=>{
  const im=new Image();im.src=`/assets/face-${c.id}.jpg`;await im.decode();
  const cv=document.createElement('canvas');cv.width=256;cv.height=310;const g=cv.getContext('2d');
  // Render only the head region; never redraw or generate the person's face.
  g.beginPath();g.moveTo(128,4);g.bezierCurveTo(220,0,253,36,248,101);g.lineTo(244,177);g.bezierCurveTo(237,218,208,263,178,285);g.quadraticCurveTo(128,320,82,285);g.bezierCurveTo(45,258,19,219,13,180);g.lineTo(7,103);g.bezierCurveTo(0,40,30,1,128,4);g.closePath();g.clip();
  const [x,y,w,h]=c.crop;g.drawImage(im,x*im.width,y*im.height,w*im.width,h*im.height,0,0,256,310);faces[c.id]=cv;
 }));
 let missing=0;
 for(let id=0;id<results.length;id++)if(results[id].status==='rejected'){
  missing++;const cv=document.createElement('canvas');cv.width=256;cv.height=310;const g=cv.getContext('2d');g.fillStyle=CAST[id].color;g.beginPath();g.ellipse(128,145,105,138,0,0,Math.PI*2);g.fill();g.fillStyle='#183b32';g.textAlign='center';g.font='bold 45px sans-serif';g.fillText(CAST[id].name.split(' ').map(w=>w[0]).slice(0,2).join(''),128,165);faces[id]=cv;
 }
 if(missing)throw new Error(`${missing} character photos could not load`);
}
export function avatar(c){const box=document.createElement('div');box.className='avatar';box.style.setProperty('--costume',c.color);box.setAttribute('aria-hidden','true');const body=document.createElement('div');body.className='body';box.append(body);const cv=document.createElement('canvas');cv.width=256;cv.height=310;if(faces[c.id])cv.getContext('2d').drawImage(faces[c.id],0,0);box.append(cv);return box;}
const material=(color)=>new T.MeshStandardMaterial({color,roughness:.85});
function disposeTree(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.isMesh)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}
export class World{
 constructor(container,hero=false){
  this.hero=hero;this.container=container;this.scene=new T.Scene();this.scene.fog=new T.Fog(hero?'#e1eccb':'#b2d8cb',65,145);this.renderer=new T.WebGLRenderer({antialias:true,alpha:hero});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.setClearColor('#b2d8cb',hero?0:1);container.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label',hero?'Four cartoon crewmates on a fart-powered raft':'3D cooperative raft obstacle course');
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.camera=new T.PerspectiveCamera(hero?35:48,1,.1,250);this.scene.add(new T.HemisphereLight('#fffbe6','#6b9f83',1.8));const light=new T.DirectionalLight('#fff7d8',2.2);light.position.set(-12,30,-10);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-25,right:25,top:30,bottom:-30});this.scene.add(light);this.sun=light;this.scene.add(light.target);
  this.root=new T.Group();this.scene.add(this.root);this.raft=new T.Group();this.scene.add(this.raft);this.people=[];this.particles=[];this.puffSeen=new Set();this.level=-1;
  const wood=material('#bf8756'),dark=material('#775639');for(let i=0;i<7;i++){const plank=this.mesh(new T.BoxGeometry(.6,.32,4.1),i%2?wood:material('#daa16a'),this.raft);plank.position.set((i-3)*.61,.6,0);plank.castShadow=true;plank.receiveShadow=true;}
  for(const z of [-1.5,1.5]){const beam=this.mesh(new T.BoxGeometry(4.6,.24,.25),dark,this.raft);beam.position.set(0,.42,z);}
  for(const x of [-1.8,1.8]){const tube=this.mesh(new T.CylinderGeometry(.44,.44,4.8,10),material('#234b45'),this.raft);tube.rotation.x=Math.PI/2;tube.position.set(x,.2,0);}
  this.rival=this.raft.clone(true);this.rival.traverse(o=>{if(o.isMesh)o.material=o.material.clone();});this.rival.visible=false;this.scene.add(this.rival);this.rivalPeople=[];
  this.raftTrim=[];for(const [raft,color] of [[this.raft,'#ffb56d'],[this.rival,'#88dfc3']]){const trim=this.mesh(new T.TorusGeometry(2.3,.07,6,32),material(color),raft);trim.rotation.x=Math.PI/2;trim.scale.y=.9;trim.position.y=.7;this.raftTrim.push(trim);}
  this.arrow=new T.ArrowHelper(new T.Vector3(0,0,1),new T.Vector3(0,.9,0),4,'#ecff68',.8,.55);this.raft.add(this.arrow);
  this.rocks=[];this.beans=[];
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();if(!hero)this.buildLevel(0);else {for(let i=0;i<3;i++){const wake=this.mesh(new T.RingGeometry(3+i*.55,3.04+i*.55,64),new T.MeshBasicMaterial({color:'#d9f3cd',transparent:true,opacity:.17-i*.04,side:T.DoubleSide}));wake.rotation.x=-Math.PI/2;wake.position.y=-.2;wake.scale.y=.8;}}
  this.setPlayers([{character:2},{character:0},{character:12},{character:1}]);
 }
 mesh(geo,mat,parent=this.root){const m=new T.Mesh(geo,mat);parent.add(m);return m;}
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 clearRoot(){disposeTree(this.root);this.root.clear();}
 buildLevel(level){if(this.level===level)return;this.level=level;this.clearRoot();this.rocks=[];this.beans=[];this.puffSeen.clear();const course=COURSES[level];
  const floor=this.mesh(new T.PlaneGeometry(700,700),material(['#b6ce83','#e1b77d','#b9a7d0'][level]));floor.rotation.x=-Math.PI/2;floor.position.y=-.45;floor.receiveShadow=true;
  const vertices=[],colors=[];const color=new T.Color(['#63bdb3','#74b8a6','#8bafcb'][level]);for(let z=-45;z<course.length+80;z+=2){for(const [zz,side] of [[z,-1],[z+2,-1],[z,1],[z,1],[z+2,-1],[z+2,1]]){vertices.push(center(zz,level)+side*course.width,-.1,zz);colors.push(color.r,color.g,color.b);}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();this.mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.4,side:T.DoubleSide}));
  for(let z=-35;z<course.length+60;z+=5){for(const side of [-1,1]){const cx=center(z,level)+side*(course.width+1);const bank=this.mesh(new T.DodecahedronGeometry(1.8,0),material(['#96b76b','#c49b6a','#a496ba'][level]));bank.scale.set(1,.35,1.8);bank.position.set(cx,-.1,z);bank.receiveShadow=true;if(Math.abs(z%15)<1)this.tree(cx+side*3,z);}
   const ripple=this.mesh(new T.BoxGeometry(1.4,.01,.09),material('#b7e1ca'));ripple.position.set(center(z,level)+Math.sin(z)*6,-.06,z);
  }
  for(const o of obstacles(level)){const rock=this.mesh(new T.DodecahedronGeometry(o.r,0),material(o.moving?'#e79876':'#87998c'));rock.position.set(obstacleX(o,0,level),.55,o.z);rock.scale.y=.9;rock.rotation.set(.2,o.z,.1);rock.castShadow=true;this.rocks.push({o,rock});}
  for(let i=0;i<Math.ceil(course.length/12);i++){const z=8+i*12;const bean=this.mesh(new T.SphereGeometry(.46,12,8),material('#ffe079'));bean.scale.set(.75,1.2,.7);bean.position.set(center(z,level)+(i%2?3:-3),1,z);bean.castShadow=true;this.beans.push(bean);}
  for(let z=50;z<course.length;z+=50)this.gate(z,'CHECKPOINT','#ecf3b0');this.gate(course.length,'FINISH / NO REFUNDS','#d5f65a');
 }
 tree(x,z){const trunk=this.mesh(new T.CylinderGeometry(.2,.36,3.7,6),material('#936c4c'));trunk.position.set(x,1.4,z);trunk.rotation.z=.15;trunk.castShadow=true;for(let i=0;i<5;i++){const leaf=this.mesh(new T.SphereGeometry(1,5,3),material(i%2?'#719b50':'#4d8256'));leaf.scale.set(2.6,.18,.65);leaf.rotation.y=i*Math.PI/2.5;leaf.rotation.z=.15;leaf.position.set(x+.25,3.3,z);leaf.castShadow=true;}}
 gate(z,text,color){const x=center(z,this.level);for(const side of [-1,1]){const pole=this.mesh(new T.CylinderGeometry(.12,.12,5,8),material('#e5cc92'));pole.position.set(x+side*5,2,z);}
  const cv=document.createElement('canvas');cv.width=768;cv.height=112;const ctx=cv.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,768,112);ctx.fillStyle='#172824';ctx.font='bold 37px sans-serif';ctx.textAlign='center';ctx.fillText(text,384,70);const texture=new T.CanvasTexture(cv);texture.colorSpace=T.SRGBColorSpace;const banner=this.mesh(new T.PlaneGeometry(10,1.5),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));banner.position.set(x,4,z);banner.rotation.y=Math.PI;
 }
 setPlayers(players,raft=this.raft,keyProp='playerKey',peopleProp='people'){const key=players.map(p=>p.character).join(',');if(this[keyProp]===key)return;this[keyProp]=key;for(const g of this[peopleProp]){raft.remove(g);disposeTree(g);}this[peopleProp]=[];
  players.forEach((p,i)=>{const c=CAST[p.character],g=new T.Group();raft.add(g);const x=players.length===1?0:(i%2?1.05:-1.05),z=players.length<3?0:(i<2?-.9:.95);g.position.set(x,.8,z);
   const suit=material(c.color),boots=material('#263f3c');const body=this.mesh(new T.CapsuleGeometry(.39,.45,4,8),suit,g);body.position.y=.7;body.castShadow=true;
   for(const side of [-1,1]){const leg=this.mesh(new T.CapsuleGeometry(.15,.28,3,6),boots,g);leg.position.set(side*.22,.13,0);const arm=this.mesh(new T.CapsuleGeometry(.14,.4,3,6),suit,g);arm.position.set(side*.5,.7,0);arm.rotation.z=side*-.4;}
   const vest=this.mesh(new T.TorusGeometry(.44,.12,6,12),material('#ffce66'),g);vest.position.y=.9;vest.rotation.x=Math.PI/2;
   const texture=new T.CanvasTexture(faces[c.id]);texture.colorSpace=T.SRGBColorSpace;const head=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true}));head.scale.set(1.32,1.6,1);head.position.set(0,1.85,0);g.add(head);this[peopleProp].push(g);
  });
 }
 update(s,players,dt,reduced=false,options={}){
  const t=performance.now()/1000;this.setPlayers(players);if(s)this.buildLevel(s.level);const z=s?.z??0,x=s?.x??center(0,0);const resetRound=s&&((options.roundId&&options.roundId!==this.roundId)||(this.lastElapsed!==undefined&&s.elapsed<this.lastElapsed));this.roundId=options.roundId;if(resetRound){this.puffSeen.clear();for(const p of this.particles){this.scene.remove(p.mesh);disposeTree(p.mesh);}this.particles=[];this.raft.position.set(x,0,z);}this.lastElapsed=s?.elapsed;this.raft.position.lerp(new T.Vector3(x,0,z),this.hero?1:Math.min(1,dt*12));this.raft.rotation.y=(s?.angle||0)*.12;this.raft.rotation.z=reduced?0:Math.sin(t*2.4)*.025;this.raft.position.y=reduced?0:Math.sin(t*2)*.06;
  this.people.forEach((g,i)=>{g.rotation.z=reduced?0:Math.sin(t*3+i)*.05;});
  this.rival.visible=!!options.rival;
  if(options.rival){if(resetRound)this.rival.position.set(options.rival.x,0,options.rival.z);this.setPlayers(options.rivals,this.rival,'rivalKey','rivalPeople');this.rival.position.lerp(new T.Vector3(options.rival.x,options.rival.phase==='lost'?-.6:0,options.rival.z),Math.min(1,dt*12));this.rival.rotation.y=options.rival.angle*.12;this.rival.rotation.z=reduced?0:Math.sin(t*2.4+1)*.025;}
  this.raftTrim[0].material.color.set(options.trim==='gold'?'#f9d145':options.trim==='mint'?'#70ebc0':'#ffb56d');
  if(this.hero){this.arrow.visible=false;this.camera.position.set(-8,6,-11);this.camera.lookAt(0,1,0);this.raft.rotation.y=-.3;}
  else{this.arrow.visible=s?.phase==='playing';const p=players.find(p=>p.isMe)||players[0];if(p){const direction=new T.Vector3(p.aimX,0,p.aimZ);if(direction.lengthSq()>.01){direction.normalize().applyAxisAngle(new T.Vector3(0,1,0),-this.raft.rotation.y);this.arrow.setDirection(direction);}}const portrait=this.camera.aspect<.8,rx=this.raft.position.x,rz=this.raft.position.z,zoom=options.zoom||1;this.camera.position.set(rx,(portrait?34:25)*zoom,rz-(portrait?27:23)*zoom);this.camera.lookAt(rx,0,rz+9);this.sun.position.set(rx-12,30,rz-10);this.sun.target.position.set(rx,0,rz);}
  for(const {o,rock} of this.rocks)rock.position.x=obstacleX(o,options.elapsed??s?.elapsed??0,this.level);
  this.beans.forEach((bean,i)=>{bean.visible=!s?.collected.includes(i);bean.rotation.y=t*1.4;bean.position.y=1+(reduced?0:Math.sin(t*3+i)*.15);});
  for(const puff of s?.puffs||[]){if(this.puffSeen.has(puff.id))continue;this.puffSeen.add(puff.id);for(let i=0;i<(reduced?1:4);i++){const cloud=this.mesh(new T.IcosahedronGeometry(.45,1),new T.MeshStandardMaterial({color:i%2?'#d5f65a':'#b1d86c',transparent:true,opacity:.8}),this.scene);cloud.position.set(puff.x-puff.dx*2+(Math.random()-.5),.7,puff.z-puff.dz*2+(Math.random()-.5));this.particles.push({mesh:cloud,life:1,dx:-puff.dx,dz:-puff.dz});}}
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt*.9;p.mesh.position.x+=p.dx*dt*3;p.mesh.position.z+=p.dz*dt*3;p.mesh.position.y+=dt*.5;p.mesh.scale.addScalar(dt*.9);p.mesh.material.opacity=Math.max(0,p.life*.6);if(p.life<=0){this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.particles.splice(i,1);}}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.resizeObserver.disconnect();disposeTree(this.scene);this.renderer.dispose();this.renderer.domElement.remove();}
}
