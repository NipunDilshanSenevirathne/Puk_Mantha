import {build} from 'esbuild';
import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(root,'dist');
// Only clear this project's generated build, including obsolete assets from older builds.
if(path.dirname(output)!==path.resolve(root)||path.basename(output)!=='dist')throw new Error('Unsafe output path');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(path.join(root,'public'),output,{recursive:true});
await build({absWorkingDir:root,entryPoints:['src/client.js'],bundle:true,minify:true,format:'esm',outfile:path.join(output,'game.js'),target:['es2022'],legalComments:'eof'});
await mkdir(path.join(output,'licenses'),{recursive:true});
await cp(path.join(root,'node_modules/three/LICENSE'),path.join(output,'licenses/three.txt'));
console.log('Built Pukමන්තා — source, sounds and character assets bundled locally.');
