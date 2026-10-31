import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
export async function prepareDataDirectory({preferred,fallback=join(tmpdir(),'scorezone-data')}={}){
 async function writable(directory){
  const path=resolve(directory);await mkdir(path,{recursive:true,mode:0o700});
  const probe=join(path,`.write-check-${randomUUID()}`);
  await writeFile(probe,'',{flag:'wx',mode:0o600});await unlink(probe);return path;
 }
 if(preferred){try{return {path:await writable(preferred),fallback:false};}catch{}}
 return {path:await writable(fallback),fallback:Boolean(preferred)};
}
