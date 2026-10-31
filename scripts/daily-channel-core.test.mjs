import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylist,playlistIndex,prepareFixture,createPlaybackResolver} from './daily-channel-core.mjs';
test('daily preparation stores stable channel addresses and keeps country and number distinct',()=>{
 const url='https://live.flixnest.app/u/fixture.strong/live/stream/strongvaulttv%3Achannel%3A1.m3u8';
 const refs=parsePlaylist(`#EXTM3U\n#EXTINF:-1,Strong8K · PL: CANAL+ SPORT 3 ᴿᴬᵂ\n${url}\n#EXTINF:-1,Wrong\nhttps://example.com/a.m3u8`);
 assert.equal(refs.length,1);assert.equal(refs[0].url,url);
 const fixture={home:'Gornik Zabrze',away:'Legia Warszawa',sport:'football',start:1793388600000};
 const events=[{name:'Poland : Górnik Zabrze vs Legia Warszawa',sport:'football',timestamp:fixture.start,channels:[{name:'Canal+ Sport 3 Poland'},{name:'Canal+ Sport 2 Poland'}]}];
 const prepared=prepareFixture(fixture,events,playlistIndex(refs));
 assert.equal(prepared.channels.length,1);assert.equal(prepared.channels[0].url,url);
});
test('playback waits for selection, coalesces concurrent viewers and renews near expiry',async()=>{
 let time=1000, resolutions=0,sessions=0;
 const resolve=createPlaybackResolver({now:()=>time,resolveSource:async url=>{resolutions++;return url+'?token=fresh';},createSession:async()=>({url:'http://relay/test',expiresAt:time+600000,serial:++sessions})});
 assert.equal(resolutions,0);
 const ref={id:'channel',url:'https://stored/channel'};
 const [a,b]=await Promise.all([resolve(ref),resolve(ref)]);
 assert.equal(resolutions,1);assert.deepEqual(a,b);
 await resolve(ref);assert.equal(resolutions,1);
 time+=550000;await resolve(ref);assert.equal(resolutions,2);assert.equal(sessions,2);
});
