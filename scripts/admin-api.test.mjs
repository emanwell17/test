import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

test('admin controls persist, protect playlist access, and enforce removal and locks during playback',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'scorezone-admin-'));
 process.env.SCOREZONE_DATA_DIR=directory;process.env.ADMIN_TOKEN='test-admin-only';
 process.env.IPTV_PLAYLIST_URL='https://live.flixnest.app/u/test.strong/live/playlist.m3u8';
 const {adminApi}=await import('./admin-api.mjs');
 const {adminSettings,fixtureDisabled}=await import('./admin-store.mjs');
 const {fixtureIdentity,applyCatalogSettings}=await import('../shared/admin-catalog.js');
 const {selectedLeague}=await import('../src/livescore-catalog.js');
 const {fixtureKey,channelKey}=await import('./daily-channel-core.mjs');
 const {listDailyChannels,playDailyChannel,adminPlaylist}=await import('./daily-channels.mjs');
 const fixture={sport:'football',home:'Admin Home',away:'Admin Away',competition:'Test League',start:Date.now()};
 const source='https://live.flixnest.app/u/test.strong/live/stream/123.m3u8';
 const channel={id:channelKey(source),name:'UK: TEST SPORT HD',url:source};
 const manual={id:channelKey(source.replace('123','456')),name:'FR: MANUAL SPORT HD',url:source.replace('123','456')};
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await mkdir(join(directory,'daily-channels'));
 await writeFile(join(directory,'daily-channels','playlist-index.json'),JSON.stringify({version:18,fingerprint:createHash('sha256').update(process.env.IPTV_PLAYLIST_URL).digest('hex'),entries:[channel,manual],savedAt:Date.now(),day}));
 await writeFile(join(directory,'daily-channels','current.json'),JSON.stringify({version:16,day,matches:{[fixtureKey(fixture)]:{fixture,channels:[channel],preparedDay:day}},completedSports:[]}));
 const dependencies={playlist:adminPlaylist,listChannels:listDailyChannels,catalog:async()=>({data:{Stages:[]}}),leagueDirectory:async()=>[{name:'Test League',country:'England',stage:{Cnm:'England',CompN:'Test League'}}]};
 const request=(path,body,token='test-admin-only',deps=dependencies)=>adminApi(new Request('https://backend.test/api/'+path,{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),deps);
 const save=async body=>{const result=await request('admin/site/change',body);assert.equal(result.status,200,JSON.stringify(await result.clone().json()));};
 try{
  assert.equal((await request('admin/site/playlist',null,'wrong')).status,401);
  const login=await(await request('admin/site/login',{remember:true})).json();
  assert.match(login.token,/^SZA-/);assert(login.expiresAt>Date.now()+29*86400000);
  assert.equal((await request('admin/site/state',null,login.token)).status,200);
  assert.equal((await request('admin/site/login',{remember:true},login.token)).status,401);
  const {adminAuthentication}=await import('./admin-sessions.mjs');
  assert.equal(await adminAuthentication(login.token,process.env.ADMIN_TOKEN,login.expiresAt+1),null);
  assert.equal(await adminAuthentication(login.token,'rotated-master'),null);
  const disk=await readFile(join(directory,'admin-sessions.json'),'utf8');assert(!disk.includes(login.token));assert(!disk.includes(process.env.ADMIN_TOKEN));
  assert.equal((await request('admin/site/logout',{},login.token)).status,200);
  assert.equal((await request('admin/site/state',null,login.token)).status,401);
  const providerList=await(await request('admin/site/playlist?provider=DINO&q=TEST',null,'test-admin-only',{...dependencies,playlist:async()=>[{...channel,provider:'DINO'},{...manual,provider:'Strong8K'}]})).json();
  assert.deepEqual(providerList.providers,['DINO','Strong8K']);assert.equal(providerList.total,1);assert.equal(providerList.channels[0].provider,'DINO');assert.equal(providerList.channels[0].url,undefined);
  const before=await(await request('admin/site/leagues?sport=football')).json();assert.equal(before.leagues[0].enabled,false);
  let refreshOptions;
  const refreshed=await request('admin/site/playlist?refresh=1&q=TEST',null,'test-admin-only',{...dependencies,playlist:async options=>{refreshOptions=options;return [channel];}});
  assert.equal(refreshed.status,200);assert.equal(refreshOptions.refresh,true);
  const listed=await(await request('admin/site/playlist')).json();assert.equal(listed.channels[0].url,undefined);
  assert.deepEqual(listed.countries.map(country=>country.code).sort(),['FR','UK']);
  const french=await(await request('admin/site/playlist?country=FR')).json();assert.equal(french.channels.length,1);assert.equal(french.channels[0].id,manual.id);
  const british=await(await request('admin/site/playlist?country=UK&q=TEST')).json();assert.equal(british.channels.length,1);assert.equal(british.channels[0].id,channel.id);
  await Promise.all([
   save({action:'league',sport:'football',country:'England',name:'Test League',enabled:true}),
   save({...fixture,action:'match',enabled:true}),
  ]);
  let settings=await adminSettings();assert.equal(settings.revision,2);assert(selectedLeague('football',{Cnm:'England',Snm:'Test League'},settings));
  const after=await(await request('admin/site/leagues?sport=football')).json();assert.equal(after.leagues[0].enabled,true);
  assert.equal(applyCatalogSettings([],'football',settings).length,1);
  await save({...fixture,action:'stream',channelId:channel.id,enabled:true,locked:true});
  const list=await listDailyChannels(fixture);assert.equal(list.channels[0].locked,true);assert.equal(list.channels[0].url,undefined);
  await assert.rejects(playDailyChannel(list.key,channel.id),error=>error.status===403);
  await save({...fixture,action:'stream',channelId:channel.id,enabled:false});
  assert.equal((await listDailyChannels(fixture)).channels.length,0);
  await assert.rejects(playDailyChannel(list.key,channel.id),/Unknown channel/);
  await save({...fixture,action:'stream',channelId:channel.id,enabled:true,locked:false});
  assert.equal((await listDailyChannels(fixture)).channels[0].locked,false);
  await save({...fixture,action:'stream',channelId:manual.id,enabled:true,locked:true});
  assert((await listDailyChannels(fixture)).channels.some(entry=>entry.id===manual.id&&entry.locked));
  await assert.rejects(playDailyChannel(list.key,manual.id),error=>error.status===403);
  await save({...fixture,action:'order',kind:'streams',order:[manual.id,channel.id]});
  assert.deepEqual((await listDailyChannels(fixture)).channels.map(entry=>entry.id),[manual.id,channel.id]);
  await save({action:'order',kind:'leagues',sport:'football',order:[{name:'Other League',country:'England'},{name:'Test League',country:'England'}]});
  const orderedSettings=await adminSettings();
  assert.equal(applyCatalogSettings([],'football',orderedSettings)[0]._leaguePriority,1);
  const invalidOrder=await request('admin/site/change',{...fixture,action:'order',kind:'streams',order:[channel.id,channel.id]});assert.equal(invalidOrder.status,400);
  await save({...fixture,action:'match',enabled:false});
  settings=await adminSettings();assert(fixtureDisabled(fixture,settings));assert.equal((await listDailyChannels(fixture)).channels.length,0);
  assert.equal(applyCatalogSettings([{_sport:fixture.sport,timestamp:fixture.start,home_team_name:fixture.home,away_team_name:fixture.away}],'football',settings).length,0);
  const publicState=await(await request('site-settings')).json();assert.equal(publicState.streams,undefined);assert.equal(publicState.matches.length,1);
  assert.equal(publicState.streamOrder,undefined);assert.equal(publicState.leagueOrder.football[0].name,'Other League');
  assert(settings.streams[fixtureIdentity(fixture)]);
  const fixtureDependencies={...dependencies,listChannels:async()=>({channels:[],complete:true}),catalog:async()=>({data:{Stages:[
   {Cnm:'England',CompN:'Premier League',Events:[{Eid:'visible',Esd:20261124130000,T1:[{Nm:'Visible Home'}],T2:[{Nm:'Visible Away'}]}]},
   {Cnm:'England',CompN:'Unlisted League',Events:[{Eid:'missing',Esd:20261124130000,T1:[{Nm:'Missing Home'}],T2:[{Nm:'Missing Away'}]}]},
  ]}})};
  const missingPath='admin/site/fixtures?sport=football&date=20261124';
  const missing=await(await request(missingPath,null,'test-admin-only',fixtureDependencies)).json();
  assert.deepEqual(missing.matches.map(match=>match.id),['missing']);
  const added=await request('admin/site/change',{...missing.matches[0],action:'match',enabled:true},'test-admin-only',fixtureDependencies);assert.equal(added.status,200);
  const remaining=await(await request(missingPath,null,'test-admin-only',fixtureDependencies)).json();assert.equal(remaining.matches.length,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
