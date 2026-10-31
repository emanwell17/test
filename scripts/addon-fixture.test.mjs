import test from 'node:test';
import assert from 'node:assert/strict';
import {addonFixture} from '../src/addon-fixture.js';
import {matchDaddyEvent,matchesSingleEvent} from '../src/daddy-matching.js';
import {fixtureKey} from './daily-channel-core.mjs';
test('live addon events retain stable identity and discipline without inventing a scheduled time',()=>{
 const meta={id:'addon:moto-q1',name:'Malaysia Qualifying 1',releaseInfo:'LIVE',genres:['Motor Sports','MotoGP']};
 const a=addonFixture(meta,'motor-sports',1000000000000),b=addonFixture(meta,'motor-sports',1000001000000);
 assert.equal(fixtureKey(a),fixtureKey(b));assert.equal(a.unknownStart,true);
 assert.equal(matchesSingleEvent('MotoGP | Round 19 | Malaysia Qualifying',a),true);
 assert.equal(matchesSingleEvent('Moto2 | Round 19 | Malaysia Qualifying',a),false);
 assert.equal(matchesSingleEvent('MotoGP | Round 19 | Malaysia Practice',a),false);
 assert.equal(matchesSingleEvent('Formula 1 : Mexico City GP - Practice 1',{home:'Mexico City Grand Prix',sport:'motor-sports',competition:'Formula 1'}),false);
});
test('single wrestling event can match its scheduled show',()=>{
 const f=addonFixture({id:'show',name:'SmackDown #1419 Danhausens Very Nice Very Evil SmackDown',releaseInfo:'31 Oct 2026 \u00b7 00:00 UTC'},'fight');
 const e={name:'WWE Friday Night SmackDown',sport:'fight',timestamp:f.start,channels:[{name:'USA Network'}]};
 assert.equal(matchDaddyEvent([e],f).channels[0].name,'USA Network');
 assert.equal(matchesSingleEvent('WWE Monday Night RAW',f),false);
});
