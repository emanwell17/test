import test from 'node:test';
import assert from 'node:assert/strict';
import {siteRequestAllowed} from './site-access.mjs';
test('separate admin origin is exact and restricts administration to its host',()=>{
 const admin='https://private-admin.example.test';
 assert(siteRequestAllowed('POST','/api/admin/site/change',{origin:admin},admin));
 assert(siteRequestAllowed('GET','/api/livescore/soccer/20261124',{origin:admin},admin));
 assert.equal(siteRequestAllowed('POST','/api/admin/site/change',{origin:'https://scorezonetv.live'},admin),false);
 assert.equal(siteRequestAllowed('POST','/api/admin/site/change',{origin:admin+'.evil.test'},admin),false);
 assert.equal(siteRequestAllowed('POST','/api/sessions',{origin:admin},admin),false);
});
test('only the exact ScoreZone origin can use public APIs',()=>{
 for(const origin of ['https://www.scorezonetv.live','https://evil.test','null','https://scorezonetv.live.evil.test',undefined])assert.equal(siteRequestAllowed('POST','/api/matches/playback',{origin}),false);
 assert.equal(siteRequestAllowed('POST','/api/matches/playback',{origin:'https://scorezonetv.live'}),true);
 assert.equal(siteRequestAllowed('GET','/api/livescore/soccer/20261101',{}),false);
});
test('native video requires ScoreZone referrer and cannot override a foreign origin',()=>{
 const path='/hls/signed/index.m3u8';
 assert.equal(siteRequestAllowed('GET',path,{referer:'https://scorezonetv.live/player.html'}),true);
 assert.equal(siteRequestAllowed('GET',path,{referer:'https://scorezonetv.live.evil.test/'}),false);
 assert.equal(siteRequestAllowed('GET',path,{}),false);
 assert.equal(siteRequestAllowed('GET',path,{origin:'https://evil.test',referer:'https://scorezonetv.live/'}),false);
});
test('public callers cannot create operator sessions; hosting health probes still work',()=>{
 assert.equal(siteRequestAllowed('POST','/api/sessions',{origin:'https://scorezonetv.live'}),false);
 assert.equal(siteRequestAllowed('GET','/healthz',{}),true);
 assert.equal(siteRequestAllowed('POST','/healthz',{}),false);
});


test('official CV domains can use APIs and native media, without granting admin or session creation',()=>{
 for(const origin of ['https://scorezone.cv','https://scorezonetv.cv']){
  assert(siteRequestAllowed('POST','/api/matches/playback',{origin}));
  assert(siteRequestAllowed('GET','/hls/ticket/index.m3u8',{referer:origin+'/match.html'}));
  assert.equal(siteRequestAllowed('POST','/api/admin/site/change',{origin},'https://adminpage.pxxl.pro'),false);
  assert.equal(siteRequestAllowed('POST','/api/sessions',{origin}),false);
  assert.equal(siteRequestAllowed('POST','/api/matches/playback',{origin:origin+'.evil.test'}),false);
 }
});
