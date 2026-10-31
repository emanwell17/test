import {managed,dataRoot,publicOrigin,sessionApiKey,configuredPlaylistUrl,relayInternalOrigin,restreamInternalOrigin} from './runtime-config.mjs';
import {pathToFileURL} from 'node:url';
import {join,sep} from 'node:path';
import {streamTier,excludedCodec} from '../shared/stream-tier.js';
import {addonFixture} from '../src/addon-fixture.js';
import {ensureLocalRelay,ensureLocalRestream} from './local-relay-process.mjs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {parseDaddySchedule} from '../src/daddy-matching.js';
import {normalizeLiveScore,includeCatalogEvent} from '../src/livescore-catalog.js';
import {fixtureKey,parsePlaylist,playlistIndex,prepareFixture,createPlaybackResolver,prioritizeChannels} from './daily-channel-core.mjs';
const root=pathToFileURL(join(dataRoot,'daily-channels')+sep);
const sports={football:'soccer',basketball:'basketball','american-football':'american-football',hockey:'hockey',baseball:'baseball','motor-sports':'motorsport',fight:'boxing',tennis:'tennis',rugby:'rugby-union',golf:'golf',billiards:'billiards',afl:'afl',darts:'darts',cricket:'cricket',other:'other'};
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let loaded, database, preparing, timer, resources, resourcePending;
async function get(url,type='json') { const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok){const error=Error(`Upstream HTTP ${r.status}`);error.status=r.status;throw error;}return type==='text'?r.text():r.json(); }
async function load(){if(!loaded)loaded=(async()=>{try{database=JSON.parse(await readFile(new URL('current.json',root),'utf8'));if(database.version!==12)database.completedSports=[];}catch{database={version:12,day:'',matches:{},completedSports:[]};}return database;})();return loaded;}
let saving=Promise.resolve();
function save(){saving=saving.catch(()=>{}).then(async()=>{await mkdir(root,{recursive:true});await writeFile(new URL(`current-${process.pid}.tmp`,root),JSON.stringify(database));await rename(new URL(`current-${process.pid}.tmp`,root),new URL('current.json',root));});return saving;}
async function inputs(){
 if(resources?.day===day() && resources.scheduleExpires>Date.now())return resources;
 if(resourcePending)return resourcePending;
 resourcePending=(async()=>{
 const sameDay=resources?.day===day();
 const playlistUrl=await configuredPlaylistUrl();
 const [html,playlist]=await Promise.all([get('https://thedaddy.pk/','text'),sameDay?Promise.resolve(null):get(playlistUrl,'text')]);
 const entries=playlist===null?null:parsePlaylist(playlist,playlistUrl);if(entries&&!entries.length)throw Error('IPTV playlist empty');
 const events=parseDaddySchedule(html);if(!events.length)throw Error('Schedule empty');
 resources={day:day(),events,index:sameDay?resources.index:playlistIndex(entries),scheduleExpires:Date.now()+300000};return resources;
 })().finally(()=>resourcePending=null);return resourcePending;
}
async function prepareAddonSport(sport, source){
 const catalog=`sports_${sport.replaceAll('-','_')}`;
 const seen=new Set();
 for(let skip=0;skip<2000;skip+=20){
  const data=await get(`https://scorezonetv.live/api/catalog/${catalog}?skip=${skip}`);
  if(!Array.isArray(data.metas))throw Error('Invalid addon catalog');
  for(const meta of data.metas){
   if(seen.has(meta.id))continue;seen.add(meta.id);
   const fixture=addonFixture(meta,sport);
   if(Number.isFinite(fixture.start))database.matches[fixtureKey(fixture)]=prepareFixture(fixture,source.events,source.index);
  }
  if(data.metas.length<20)break;
 }
}
export async function prepareDailyChannels(){
 if(preparing)return preparing;
 preparing=(async()=>{
  await load(); const today=day();
  const source=await inputs();database.version=12;
  if(database.day===today&&database.completedSports.length===Object.keys(sports).length){
   // Re-match stored fixtures against schedule updates; channel URLs and the
   // daily IPTV index remain reusable without resolving any playback links.
   for(const [key,record]of Object.entries(database.matches))database.matches[key]=prepareFixture(record.fixture,source.events,source.index);
   await save();return;
  }
  if(database.day!==today){
   const carry=Object.fromEntries(Object.entries(database.matches).filter(([,m])=>includeCatalogEvent({timestamp:Number(m.fixture.start),status:''})));
   database={version:12,day:today,matches:carry,completedSports:[]};
  }
  for(const [key,record]of Object.entries(database.matches))database.matches[key]=prepareFixture(record.fixture,source.events,source.index);
  await save();
  // Process one sport at a time; no per-channel network calls or video downloads.
  for(const [sport,slug]of Object.entries(sports)){
   if(database.completedSports.includes(sport))continue;
   try{
    const feed=await get(`https://prod-cdn-public-api.livescore.com/v1/api/app/date/${slug}/${today.replaceAll('-','')}/0.0?locale=en&MD=1`);
    if(!Array.isArray(feed.Stages))throw Error('Invalid catalog');
    const previous=new Date(`${today}T12:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);
    const previousFeed=await get(`https://prod-cdn-public-api.livescore.com/v1/api/app/date/${slug}/${previous.toISOString().slice(0,10).replaceAll('-','')}/0.0?locale=en&MD=1`).catch(()=>({Stages:[]}));
    for(const event of [...normalizeLiveScore(previousFeed,sport),...normalizeLiveScore(feed,sport)].filter(e=>includeCatalogEvent(e))){
     const fixture={home:event.home_team_name,away:event.away_team_name,sport,start:event.timestamp};
     database.matches[fixtureKey(fixture)]=prepareFixture(fixture,source.events,source.index);
    }
    database.completedSports.push(sport);await save();
   }catch(error){
    if([404,410].includes(error.status)){
     try{await prepareAddonSport(sport,source);database.completedSports.push(sport);await save();}catch{}
    }
    // Retry temporary failures on the next scheduler tick. Unsupported sports
    // are recorded for today instead of being requested every five minutes.
   }
  }
 })().finally(()=>{preparing=null;});
 return preparing;
}
export async function listDailyChannels(fixture){
 await load();const key=fixtureKey(fixture);const saved=database.matches[key];
 if(saved)return {key,channels:prioritizeChannels(saved.channels.filter(c=>!excludedCodec(c))).map(streamTier).map(({url,...c})=>c),match:saved.match,complete:true};
 void prepareDailyChannels().catch(()=>{});
 if(!resources)void inputs().catch(()=>{});
 // An uncached page can be prepared from the same single daily playlist index.
 if(resources?.day===day()){
  const prepared=prepareFixture(fixture,resources.events,resources.index);
  database.matches[key]=prepared;await save();return {key,channels:prioritizeChannels(prepared.channels).map(streamTier).map(({url,...c})=>c),match:prepared.match,complete:true};
 }
 return {key,channels:[],match:null,complete:false};
}
async function resolveSource(stableUrl){
 const r=await fetch(stableUrl,{signal:AbortSignal.timeout(45000)});
 try{
  if(!r.ok)throw Error(`IPTV HTTP ${r.status}`);
  const u=new URL(r.url);
  if(u.protocol!=='https:'||u.hostname!=='vps-65a08dc7.vps.ovh.ca'||u.username||u.password||u.port||!/^\/(svt|trtv|d4k|dino|cloud)\/hls\/\d+\.m3u8$/.test(u.pathname))throw Error('Invalid playback source');
  return u.href;
 }finally{await r.body?.cancel();}
}
const relaySources=new Map();
async function issueRelaySession(url,expiresAt){
 const key=await sessionApiKey();
 const r=await fetch(`${relayInternalOrigin}/api/sessions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({url,validate:false,...(expiresAt?{expiresAt}:{})}),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok)throw Error('Relay unavailable');const ticket=await r.json();
 if(!/^\/hls\/[\w-]+\/index\.m3u8$/.test(ticket.path||'')||!(ticket.expiresAt>Date.now()))throw Error('Invalid relay session');
 return ticket;
}
async function createSession(url,reference){
 if(managed){
  const ticket=await issueRelaySession(url);
  relaySources.set(reference.id,url);
  return {url:`${publicOrigin}${ticket.path}`,expiresAt:ticket.expiresAt};
 }

 await ensureLocalRelay();
 const key=await sessionApiKey();
 const r=await fetch(`${relayInternalOrigin}/api/sessions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({url,validate:false}),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok)throw Error('Relay unavailable');const s=await r.json();
 if(!/^\/hls\/[\w-]+\/index\.m3u8$/.test(s.path||'')||!(s.expiresAt>Date.now()))throw Error('Invalid relay session');
 await ensureLocalRestream();
 const response=await fetch(`${restreamInternalOrigin}/api/sessions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({channelId:reference.id,relayUrl:`${relayInternalOrigin}${s.path}`}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Restream unavailable');const restream=await response.json();
 if(!/^\/restream\/[\w.-]+\/index\.m3u8$/.test(restream.path||''))throw Error('Invalid restream reply');
 return {url:`${publicOrigin}${restream.path}`,expiresAt:restream.expiresAt};
}
const resolvePlayback=createPlaybackResolver({resolveSource,createSession});
const backgrounds=new Map();
function prepareRemaining(matchKey,selectedId){
 if(backgrounds.has(matchKey))return;
 const job=(async()=>{
  for(const channel of database.matches[matchKey]?.channels||[]){
   if(channel.id===selectedId || excludedCodec(channel))continue;
   try{await resolvePlayback(channel);}catch{}
  }
 })().finally(()=>backgrounds.delete(matchKey));backgrounds.set(matchKey,job);
}
export async function playDailyChannel(matchKey,channelId,access=null){
 await load();const reference=database.matches[matchKey]?.channels.find(c=>c.id===channelId);
 if(!reference || excludedCodec(reference))throw Error('Unknown channel');
 if(streamTier(reference).locked && (!access?.premium || access.expiresAt<=Date.now())){const error=Error('Premium required');error.status=403;throw error;}
 let session=await resolvePlayback(reference);
 if(streamTier(reference).locked && managed){
  const source=relaySources.get(reference.id);if(!source)throw Error('Select channel again');
  const ticket=await issueRelaySession(source,access.expiresAt);
  session={url:`${publicOrigin}${ticket.path}`,expiresAt:ticket.expiresAt};
 }else if(streamTier(reference).locked){
  const key=await sessionApiKey();
  const r=await fetch(`${restreamInternalOrigin}/api/sessions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({channelId:reference.id,expiresAt:access.expiresAt}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Restream unavailable');const ticket=await r.json();
  session={url:`${publicOrigin}${ticket.path}`,expiresAt:ticket.expiresAt};
 }
 // Background work begins only after a selected channel has been prioritised.
 setTimeout(()=>prepareRemaining(matchKey,channelId),0).unref();
 return {...session,id:reference.id,name:reference.name,locked:streamTier(reference).locked};
}
export function startDailyPreparation(){
 void prepareDailyChannels().catch(()=>{});
 timer=setInterval(()=>{void prepareDailyChannels().catch(()=>{});},5*60000);timer.unref();
 return ()=>clearInterval(timer);
}
