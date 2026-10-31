import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
let starting;
async function healthy(){try{const r=await fetch('http://127.0.0.1:8791/healthz',{signal:AbortSignal.timeout(1000)});return r.ok;}catch{return false;}}
export async function ensureLocalRelay(){
 if(process.env.SCOREZONE_MANAGED_BACKEND==='true')return;
 if(starting)return starting;
 starting=(async()=>{
  if(await healthy())return;
  const child=spawn(process.execPath,['--env-file=.env','server.mjs'],{
   cwd:fileURLToPath(new URL('../deploy/pxxl-relay/',import.meta.url)),windowsHide:true,stdio:'ignore',
   env:{...process.env,PORT:'8791',ALLOWED_ORIGINS:'http://192.168.0.164:5173,http://localhost:5173,http://127.0.0.1:5173,http://192.168.0.164:5174,http://localhost:5174,http://127.0.0.1:5174'},
  });
  let failed=false;child.on('error',()=>{failed=true;});child.unref();
  for(let i=0;i<20;i++){if(await healthy())return;if(failed)break;await new Promise(resolve=>setTimeout(resolve,250));}
  throw Error('Local relay did not start');
 })().finally(()=>starting=null);
 return starting;
}

let restreamStarting;
export async function ensureLocalRestream(){
 if(process.env.SCOREZONE_MANAGED_BACKEND==='true')return;
 if(restreamStarting)return restreamStarting;
 restreamStarting=(async()=>{
  const ready=async()=>{try{return (await fetch('http://127.0.0.1:8792/healthz',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}};
  if(await ready())return;
  const child=spawn(process.execPath,['--env-file=.env','../../scripts/local-restream.mjs'],{cwd:fileURLToPath(new URL('../deploy/pxxl-relay/',import.meta.url)),windowsHide:true,stdio:'ignore',env:process.env});
  let failed=false;child.on('error',()=>failed=true);child.unref();
  for(let i=0;i<20;i++){if(await ready())return;if(failed)break;await new Promise(resolve=>setTimeout(resolve,250));}
  throw Error('Local restream did not start');
 })().finally(()=>restreamStarting=null);return restreamStarting;
}
