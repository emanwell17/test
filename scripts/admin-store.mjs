import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {dataRoot} from './runtime-config.mjs';
import {fixtureIdentity} from '../shared/admin-catalog.js';
const file=join(dataRoot,'admin-settings.json');
const empty=()=>({leagues:[],matches:[],streams:{},leagueOrder:{},streamOrder:{},revision:0});
let queue=Promise.resolve();
export async function adminSettings(){
  try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return empty();throw error;}
}
export function publicSettings(settings){return {leagues:settings.leagues,matches:settings.matches,leagueOrder:settings.leagueOrder||{},revision:settings.revision};}
export function updateAdminSettings(change){
  const job=queue.then(async()=>{
    const settings=await adminSettings();await change(settings);settings.revision++;
    await mkdir(dataRoot,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(settings));await rename(file+'.tmp',file);
    return settings;
  });
  queue=job.catch(()=>{});return job;
}
export function fixtureDisabled(fixture,settings){
  return settings.matches.some(record=>!record.enabled&&fixtureIdentity(record)===fixtureIdentity(fixture)) ||
    settings.leagues.some(rule=>!rule.enabled&&rule.sport===fixture.sport&&rule.name.toLowerCase()===String(fixture.competition||'').toLowerCase());
}
