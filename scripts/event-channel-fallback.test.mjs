import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesIptvEvent} from '../src/daddy-matching.js';
import {prepareFixture,playlistIndex} from './daily-channel-core.mjs';
const fixture={home:'Golden State Warriors',away:'LA Lakers',sport:'basketball',start:Date.UTC(2026,9,31,2)};
test('event fallback accepts both NBA teams in reversed and abbreviated labels but excludes other opponents and old dates',()=>{
 assert.equal(matchesIptvEvent('Live | Lakers vs. Warriors | all | US: PPV 123',fixture),true);
 assert.equal(matchesIptvEvent('LIVE | GSW - WARRIORS VS LAL - LAKERS | BR: NBA PPV',fixture),true);
 assert.equal(matchesIptvEvent('Live | Lakers vs. Clippers | US: PPV',fixture),false);
 assert.equal(matchesIptvEvent('Next | Lakers vs. Warriors | all | 25-10-2026 | 02:00 (GMT)',fixture),false);
 assert.equal(matchesIptvEvent('END | Lakers vs. Warriors | US: PPV',fixture),false);
});
test('event fallback works for LiveScore fixtures missing from DaddyLive and preserves normal channel matches',()=>{
 const event={name:'NBA : Golden State Warriors vs Los Angeles Lakers',sport:'basketball',timestamp:fixture.start,channels:[{name:'NBA League Pass'}]};
 const entry={id:'event',name:'Live | Lakers vs. Warriors | US: PPV 123',url:'https://stored/event'};
 const prepared=prepareFixture(fixture,[event],playlistIndex([entry]));assert.equal(prepared.channels[0].id,'event');
 assert.equal(prepareFixture(fixture,[],playlistIndex([entry])).channels[0].id,'event');
 assert.equal(prepareFixture({...fixture,away:'LA Clippers'},[],playlistIndex([entry])).channels.length,0);
 const normal={id:'normal',name:'NBA League Pass',url:'https://stored/normal'};
 assert.deepEqual(prepareFixture(fixture,[event],playlistIndex([normal,entry])).channels.map(c=>c.id),['normal']);
});
