// Dependency-free, deterministic ZIP packager. Explicit allowlist excludes credentials,
// Wrangler sessions, node_modules, logs and development workspace artifacts.
import {readFile,readdir,lstat,writeFile,mkdir} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import './check-assets.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(root,process.argv[2]||'../Pukmantha-Cloudflare.zip');
if(path.extname(output).toLowerCase()!=='.zip')throw new Error('Output must end in .zip');
const allowed=['src','public','dist','tests','scripts','docs','.github','package.json','package-lock.json','wrangler.jsonc','README.md','GITHUB_UPLOAD.md','CONTRIBUTING.md','THIRD_PARTY_NOTICES.md','VERIFICATION.md','DEPLOY.cmd','DEPLOY.sh','START-GAME.cmd','.gitignore','.gitattributes','.editorconfig','.node-version'];
const entries=[];
const forbidden=/(^|\/)(node_modules|\.wrangler|\.git|\.env(?:\..*)?|\.dev\.vars(?:\..*)?)(\/|$)/i;
async function collect(relative){
  if(forbidden.test(relative))throw new Error('Private file blocked: '+relative);
  const target=path.join(root,relative),info=await lstat(target);
  if(info.isSymbolicLink())throw new Error('Symlink blocked: '+relative);
  if(info.isDirectory())for(const name of (await readdir(target)).sort())await collect(relative+'/'+name);
  else if(info.isFile())entries.push({name:'pukmantha/'+relative,data:await readFile(target)});
}
for(const item of allowed)await collect(item);
entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
const checksums=entries.map(e=>createHash('sha256').update(e.data).digest('hex')+'  '+e.name.slice('pukmantha/'.length)).join('\n')+'\n';
entries.push({name:'pukmantha/CHECKSUMS.sha256',data:Buffer.from(checksums)});
if(entries.length>65535)throw new Error('Too many ZIP entries');

const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const local=[],central=[];let offset=0;
for(const entry of entries){
  const name=Buffer.from(entry.name),compressed=deflateRawSync(entry.data,{level:9}),crc=crc32(entry.data);
  const header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);
  header.writeUInt16LE(0x5c21,12); // Fixed 2026-01-01 timestamp for reproducible archives.
  header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(entry.data.length,22);header.writeUInt16LE(name.length,26);
  const directory=Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);
  directory.writeUInt16LE(0x5c21,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(entry.data.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
  local.push(header,name,compressed);central.push(directory,name);offset+=header.length+name.length+compressed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,directory,end]);
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,archive);
const digest=createHash('sha256').update(archive).digest('hex');
await writeFile(output+'.sha256',digest+'  '+path.basename(output)+'\n');
console.log(`Created ${output}\n${entries.length} files; ${(archive.length/1024/1024).toFixed(2)} MiB; SHA-256 ${digest}`);
