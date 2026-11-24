import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {dataRoot} from './runtime-config.mjs';

const file=join(dataRoot,'admin-sessions.json');
const digest=value=>createHash('sha256').update(value).digest('hex');
let queue=Promise.resolve();
async function read(){
 try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}
}
async function change(action){
 const job=queue.then(async()=>{
  const sessions=await read();const result=await action(sessions);
  await mkdir(dataRoot,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(sessions),{mode:0o600});await rename(file+'.tmp',file);
  return result;
 });
 queue=job.catch(()=>{});return job;
}
export async function adminAuthentication(supplied,master,now=Date.now()){
 if(!master||typeof supplied!=='string'||supplied.length>512)return null;
 if(timingSafeEqual(Buffer.from(digest(supplied),'hex'),Buffer.from(digest(master),'hex')))return {master:true};
 if(!/^SZA-[A-Za-z0-9_-]{43}$/.test(supplied))return null;
 const record=(await read())[digest(supplied)];
 return record&&record.expiresAt>now&&record.masterHash===digest(master)?{master:false}:null;
}
export async function issueAdminSession(master,remember,now=Date.now()){
 const token='SZA-'+randomBytes(32).toString('base64url');
 const expiresAt=now+(remember?30*86400000:8*3600000);
 await change(sessions=>{
  for(const [key,record] of Object.entries(sessions))if(record.expiresAt<=now||record.masterHash!==digest(master))delete sessions[key];
  sessions[digest(token)]={expiresAt,masterHash:digest(master)};
 });
 return {token,expiresAt};
}
export async function revokeAdminSession(token){
 await change(sessions=>{delete sessions[digest(token)];});
}
