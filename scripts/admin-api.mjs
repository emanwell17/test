import {randomUUID} from 'node:crypto';
import {adminAuthentication,issueAdminSession,revokeAdminSession} from './admin-sessions.mjs';
import {adminSettings,updateAdminSettings,publicSettings} from './admin-store.mjs';
import {fixtureIdentity,playlistCountry,applyCatalogSettings} from '../shared/admin-catalog.js';
import {LEAGUES,selectedLeague,isYouthEvent} from '../src/livescore-catalog.js';
import {liveScoreLeagues} from './livescore-leagues.mjs';
import {normalizeLiveScore} from '../src/livescore-catalog.js';
import {catalogApi} from './catalog-api.mjs';
import {addonFixture} from '../src/addon-fixture.js';
const sports=new Set([...Object.keys(LEAGUES),'billiards','afl','darts','other']);
const slugs={football:'soccer',hockey:'hockey',rugby:'rugby-union','motor-sports':'motorsport',fight:'boxing'};
const clean=(value,max=200)=>typeof value==='string'&&value.trim().length<=max?value.trim():'';
function fixtureFrom(body){
 const fixture={home:clean(body.home),away:clean(body.away),sport:clean(body.sport),start:Number(body.start),competition:clean(body.competition),eventId:clean(body.eventId,250)};
 if(!fixture.home||!sports.has(fixture.sport)||!Number.isSafeInteger(fixture.start)||fixture.start<946684800000||fixture.start>4102444800000)throw Error('Enter a sport, event name and valid start time');
 return fixture;
}
export async function adminApi(request,{playlist,listChannels,catalog=catalogApi,leagueDirectory=liveScoreLeagues}){
 const url=new URL(request.url);
 if(url.pathname==='/api/site-settings'&&request.method==='GET')return Response.json(publicSettings(await adminSettings()));
 if(!url.pathname.startsWith('/api/admin/site/'))return null;
 const expected=String(process.env.ADMIN_TOKEN||'').trim();
 if(!expected)return Response.json({error:'Set ADMIN_TOKEN on the backend to enable administration'},{status:503});
 const supplied=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
 const authentication=await adminAuthentication(supplied,expected);
 if(!authentication)return Response.json({error:'Your admin session expired or the token is invalid. Sign in again.'},{status:401});
 try{
  if(url.pathname.endsWith('/login')&&request.method==='POST'){
   if(!authentication.master)return Response.json({error:'Enter the admin token to sign in again'},{status:401});
   const body=await request.json();return Response.json(await issueAdminSession(expected,body.remember===true));
  }
  if(url.pathname.endsWith('/logout')&&request.method==='POST'){
   if(!authentication.master)await revokeAdminSession(supplied);
   return Response.json({ok:true});
  }
  if(request.method==='GET'&&url.pathname.endsWith('/state'))return Response.json({...await adminSettings(),defaultLeagues:LEAGUES});
  if(request.method==='GET'&&url.pathname.endsWith('/leagues')){
   const sport=url.searchParams.get('sport'),query=(url.searchParams.get('q')||'').trim();
   if(!sports.has(sport)||query.length>100)throw Error('Invalid league search');
   const settings=await adminSettings();
   const leagues=(await leagueDirectory(slugs[sport]||sport,query)).map(({name,country,stage})=>({sport,name,country,enabled:selectedLeague(sport,stage,settings)}));
   return Response.json({leagues});
  }
  if(request.method==='GET'&&url.pathname.endsWith('/playlist')){
   const q=(url.searchParams.get('q')||'').toLowerCase();const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
   const country=url.searchParams.get('country')||'';
   const provider=url.searchParams.get('provider')||'';
   const all=await playlist({refresh:url.searchParams.get('refresh')==='1'});
   const display=new Intl.DisplayNames(['en'],{type:'region'});
   const countries=[...new Set(all.map(entry=>playlistCountry(entry.name)).filter(Boolean))].map(code=>({code,name:display.of(code==='UK'?'GB':code)})).sort((a,b)=>a.name.localeCompare(b.name));
   const providers=[...new Set(all.map(entry=>entry.provider||'Other'))].sort();
   const entries=all.filter(entry=>(!provider||(entry.provider||'Other')===provider)&&entry.name.toLowerCase().includes(q)&&(!country||(country==='untagged'?!playlistCountry(entry.name):playlistCountry(entry.name)===country)));
   return Response.json({total:entries.length,countries,providers,channels:entries.slice(offset,offset+100).map(({id,name,provider})=>({id,name,provider:provider||'Other'}))});
  }
  if(request.method==='GET'&&url.pathname.endsWith('/fixtures')){
   const sport=url.searchParams.get('sport'),date=url.searchParams.get('date');
   if(!sports.has(sport)||!/^\d{8}$/.test(date||''))throw Error('Invalid sport or date');
   const {data}=await catalog(`/api/livescore/${slugs[sport]||sport}/${date}`,new URLSearchParams());
   const settings=await adminSettings();
   if(data.unsupported||sport==='other'){
    const matches=[];
    for(let skip=0;skip<2000;skip+=20){
     const page=await catalog(`/api/addon-catalog/sports_${sport.replaceAll('-','_')}`,new URLSearchParams({skip:String(skip)}));
     for(const meta of page.data.metas||[]){const fixture=addonFixture(meta,sport);if(new Date(fixture.start).toISOString().slice(0,10).replaceAll('-','')===date)matches.push({...fixture,id:meta.id});}
     if((page.data.metas||[]).length<20)break;
    }
    const automatic=matches.map(fixture=>({_sport:sport,timestamp:fixture.start,home_team_name:fixture.home,away_team_name:fixture.away,_league:fixture.competition}));
    const visible=new Set(applyCatalogSettings(automatic,sport,settings).filter(event=>!isYouthEvent(event)).map(fixtureIdentity));
    return Response.json({matches:matches.filter(fixture=>!isYouthEvent(fixture)&&!visible.has(fixtureIdentity(fixture)))});
   }
   const matches=(data.Stages||[]).flatMap(stage=>(stage.Events||[]).map(event=>{const t=String(event.Esd);return {id:String(event.Eid),home:event.T1?.[0]?.Nm||event.Enm,away:event.T2?.[0]?.Nm||'',sport,competition:stage.CompN||stage.Snm,country:stage.Cnm,start:Date.UTC(+t.slice(0,4),+t.slice(4,6)-1,+t.slice(6,8),+t.slice(8,10),+t.slice(10,12)),status:event.Eps||'NS'};}));
   const visible=new Set(applyCatalogSettings(normalizeLiveScore(data,sport,settings),sport,settings).map(fixtureIdentity));
   return Response.json({matches:matches.filter(fixture=>!isYouthEvent(fixture)&&!visible.has(fixtureIdentity(fixture)))});
  }
  if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
  const text=await request.text();if(text.length>16000)throw Error('Request too large');
  const body=JSON.parse(text);
  if(url.pathname.endsWith('/channels'))return Response.json(await listChannels(fixtureFrom(body)));
  if(!url.pathname.endsWith('/change'))throw Error('Unknown action');
  let fixture;
  const settings=await updateAdminSettings(async state=>{
   if(body.action==='order'){
    if(!Array.isArray(body.order)||body.order.length>2000)throw Error('Invalid order');
    if(body.kind==='leagues'){
     if(!sports.has(body.sport))throw Error('Invalid sport');
     const order=body.order.map(rule=>({name:clean(rule.name),country:clean(rule.country)}));
     if(order.some(rule=>!rule.name)||new Set(order.map(rule=>JSON.stringify(rule))).size!==order.length)throw Error('Invalid league order');
     state.leagueOrder||={};state.leagueOrder[body.sport]=order;
    }else if(body.kind==='streams'){
     fixture=fixtureFrom(body);
     if(body.order.some(id=>typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))||new Set(body.order).size!==body.order.length)throw Error('Invalid stream order');
     state.streamOrder||={};state.streamOrder[fixtureIdentity(fixture)]=body.order;
    }else throw Error('Invalid order type');
   }else if(body.action==='league'){
    const sport=clean(body.sport),name=clean(body.name),country=clean(body.country);
    if(!sports.has(sport)||!name||typeof body.enabled!=='boolean')throw Error('Invalid league');
    const record={sport,name,country,enabled:body.enabled};
    state.leagues=state.leagues.filter(rule=>!(rule.sport===sport&&rule.name.toLowerCase()===name.toLowerCase()&&rule.country.toLowerCase()===country.toLowerCase()));state.leagues.push(record);
   }else if(body.action==='match'){
    fixture=fixtureFrom(body);if(typeof body.enabled!=='boolean')throw Error('Invalid match setting');
    const key=fixtureIdentity(fixture),previous=state.matches.find(record=>fixtureIdentity(record)===key);
    state.matches=state.matches.filter(record=>fixtureIdentity(record)!==key);
    state.matches.push({...fixture,id:previous?.id||'admin-'+randomUUID(),enabled:body.enabled});
   }else if(body.action==='stream'){
    fixture=fixtureFrom(body);const id=clean(body.channelId);
    if(!/^[a-f0-9]{24}$/.test(id)||typeof body.enabled!=='boolean'||(body.locked!=null&&typeof body.locked!=='boolean'))throw Error('Invalid channel');
    if(body.enabled&&!(await playlist()).some(entry=>entry.id===id))throw Error('Channel is absent from the current playlist');
    const key=fixtureIdentity(fixture);state.streams[key]||={};state.streams[key][id]={id,enabled:body.enabled,...(typeof body.locked==='boolean'?{locked:body.locked}:{})};
   }else throw Error('Unknown action');
  });
  if(fixture&&body.action==='match'&&body.enabled)void listChannels(fixture).catch(()=>{});
  if(body.action==='league'&&body.enabled)void (async()=>{
   const date=new Date(Date.now()+3600000).toISOString().slice(0,10).replaceAll('-','');
   const {data}=await catalog(`/api/livescore/${slugs[body.sport]||body.sport}/${date}`,new URLSearchParams());
   const events=normalizeLiveScore(data,body.sport,settings).filter(event=>event._league.toLowerCase()===body.name.trim().toLowerCase());
   for(let offset=0;offset<events.length;offset+=4)await Promise.all(events.slice(offset,offset+4).map(event=>listChannels({home:event.home_team_name,away:event.away_team_name,sport:body.sport,start:event.timestamp,competition:event._league}).catch(()=>{})));
  })().catch(()=>{});
  return Response.json({ok:true,revision:settings.revision});
 }catch(error){return Response.json({error:error.message||'Admin action failed'},{status:400});}
}
