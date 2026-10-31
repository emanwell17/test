import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const managed=process.env.SCOREZONE_MANAGED_BACKEND==='true';
export const dataRoot=process.env.SCOREZONE_DATA_DIR?resolve(process.env.SCOREZONE_DATA_DIR):fileURLToPath(new URL('../.local/',import.meta.url));
export const publicOrigin=managed?new URL(process.env.SCOREZONE_PUBLIC_ORIGIN||'https://testscore.pxxl.pro').origin:'http://192.168.0.164:8792';
if(managed&&!publicOrigin.startsWith('https://'))throw Error('Production playback requires HTTPS');
export async function sessionApiKey(){
 if(process.env.SESSION_API_KEY)return process.env.SESSION_API_KEY;
 if(managed)throw Error('Session key is not configured');
 const settings=await readFile(new URL('../deploy/pxxl-relay/.env',import.meta.url),'utf8');
 const key=settings.match(/^SESSION_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
 if(!key)throw Error('Session key is not configured');return key;
}

export async function configuredPlaylistUrl(){
 let value=process.env.IPTV_PLAYLIST_URL;
 if(!value&&!managed){
  const settings=await readFile(new URL('../deploy/pxxl-relay/.env',import.meta.url),'utf8');
  value=settings.match(/^IPTV_PLAYLIST_URL\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
 }
 if(!value)throw Error('IPTV_PLAYLIST_URL is not configured');
 const url=new URL(value);
 if(url.origin!=='https://live.flixnest.app'||url.username||url.password||url.search||url.hash||!/^\/u\/[A-Za-z0-9_.-]+\/live\/playlist\.m3u8$/.test(url.pathname))throw Error('Invalid IPTV playlist configuration');
 return url.href;
}

function port(name,fallback){const p=Number(process.env[name]||fallback);if(!Number.isInteger(p)||p<1024||p>65535)throw Error('Invalid internal port');return p;}
export const relayPort=port('SCOREZONE_RELAY_PORT',8791);
export const restreamPort=port('SCOREZONE_RESTREAM_PORT',8792);
export const relayInternalOrigin=`http://127.0.0.1:${relayPort}`;
export const restreamInternalOrigin=`http://127.0.0.1:${restreamPort}`;
