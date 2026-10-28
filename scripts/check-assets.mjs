import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function files(dir){
  const result=[];
  for(const item of await readdir(dir,{withFileTypes:true})){
    const target=path.join(dir,item.name);
    if(item.isSymbolicLink())throw new Error('Symbolic links are not supported in deployable assets: '+target);
    if(item.isDirectory())result.push(...await files(target));
    else if(item.isFile())result.push(target);
  }
  return result;
}
async function requireFile(file,label=file){
  let details;try{details=await stat(file);}catch{throw new Error('Missing deploy asset: '+label);}
  if(!details.isFile()||!details.size)throw new Error('Empty or invalid deploy asset: '+label);
}
const required=[
  'index.html','style.css','redesign.css','landing.js','game.js',
  'assets/background.mp3','assets/lose.mp3','assets/lagoon-hero.png',
  'assets/course-bay.svg','assets/course-rapids.svg','assets/course-flush.svg',
  'licenses/three.txt',
  ...['fredoka','manrope','notosanssinhala','nunito'].flatMap(name=>[`assets/fonts/${name}.ttf`,`assets/fonts/${name}-OFL.txt`]),
  ...Array.from({length:13},(_,i)=>`assets/face-${i}.jpg`)
];
for(const file of required)await requireFile(path.join(dist,file),file);
const built=await files(dist);
for(const file of built){
  if((await stat(file)).size>25*1024*1024)throw new Error('Asset exceeds Cloudflare 25 MiB limit: '+file);
  if(/(^|[\\/])(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|node_modules|\.wrangler|\.git)(?:[\\/]|$)/i.test(file))throw new Error('Private or development file in public build: '+file);
}
for(const source of await files(path.join(root,'public'))){
  const relative=path.relative(path.join(root,'public'),source),target=path.join(dist,relative);
  await requireFile(target,relative);
  if(hash(await readFile(source))!==hash(await readFile(target)))throw new Error('Stale build asset; run npm run build: '+relative);
}
function cssReferences(source){
  const clean=source.replace(/\/\*[\s\S]*?\*\//g,'');
  return [
    ...[...clean.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)].map(m=>m[1]??m[2]??m[3]),
    ...[...clean.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)].map(m=>m[1]??m[2])
  ];
}
function srcsetReferences(value){
  const found=[];let rest=value.trim();
  while(rest){
    rest=rest.replace(/^[\s,]+/,'');if(!rest)break;
    const match=rest.match(/^\S+/);let url=match[0];rest=rest.slice(url.length);
    if(url.endsWith(',')){found.push(url.replace(/,+$/,''));continue;}
    found.push(url);const comma=rest.indexOf(',');rest=comma<0?'':rest.slice(comma+1);
  }
  return found;
}
function htmlReferences(source){
  const clean=source.replace(/<!--[\s\S]*?-->/g,'');
  const found=[];
  for(const tag of clean.matchAll(/<[a-z][^>]*>/gi)){
    for(const attribute of tag[0].matchAll(/\b(src|href|poster|action|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)){
      const value=attribute[2]??attribute[3]??attribute[4];
      found.push(...(attribute[1].toLowerCase()==='srcset'?srcsetReferences(value):[value]));
    }
  }
  return [...found,...cssReferences(clean)];
}
let referenceCount=0;
for(const file of built.filter(file=>/\.(?:html|css)$/i.test(file))){
  const relative=path.relative(dist,file).split(path.sep).join('/'),source=await readFile(file,'utf8');
  const references=/\.html$/i.test(file)?htmlReferences(source):cssReferences(source);
  for(let reference of new Set(references)){
    reference=reference.trim().replace(/&amp;/gi,'&');
    if(!reference||reference.startsWith('#')||reference.startsWith('//')||/^[a-z][a-z\d+.-]*:/i.test(reference))continue;
    let pathname;try{pathname=decodeURIComponent(new URL(reference,'https://local-assets.invalid/'+relative).pathname);}catch{throw new Error(`Invalid local reference in ${relative}: ${reference}`);}
    if(pathname.endsWith('/'))pathname+='index.html';
    const resolved=path.resolve(dist,'.'+pathname),inside=path.relative(dist,resolved);
    if(inside.startsWith('..'+path.sep)||path.isAbsolute(inside))throw new Error(`Reference escapes deploy folder in ${relative}: ${reference}`);
    await requireFile(resolved,`${reference} (referenced by ${relative})`);referenceCount++;
  }
}
console.log(`Asset check passed: ${built.length} deployable files, ${referenceCount} local HTML/CSS references resolved, all public assets current.`);
