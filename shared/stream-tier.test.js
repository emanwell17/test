import test from 'node:test';
import assert from 'node:assert/strict';
import {streamTier,isFourK} from './stream-tier.js';
import {prepareFixture,playlistIndex} from '../scripts/daily-channel-core.mjs';
test('only 4K labels lock, in superscript or normal text',()=>{
 for(const name of ['UK: SKY ᴴᴰ','US: ESPN ᴿᴬᵂ','UK: TEST ʰᵉᵛᶜ'])assert.equal(streamTier({name}).locked,false);
 for(const name of ['US: TEST ⁴ᴷ','UK: TEST 4K','UK: TEST HEVC 4K','UK: TEST 3840p','UK: TEST 2160p'])assert.equal(streamTier({name}).locked,true);
 assert.equal(streamTier({name:'UK: SKY HD'}).locked,false);
 assert.equal(streamTier({name:'UK: TEST ⁴ᴷ'}).quality,'4K');
 assert.equal(isFourK({name:'UK: TEST ³⁸⁴⁰ᵖ'}),true);
});
test('superscript 4K survives the eight-option shortlist and stays locked',()=>{
 const fixture={home:'Home',away:'Away',sport:'football',start:1793412000000};
 const channels=Array.from({length:9},(_,i)=>({id:String(i),name:i===8?'UK: SKY ⁴ᴷ':'UK: SKY HD',url:'https://stored/'+i}));
 const result=prepareFixture(fixture,[{name:'Home vs Away',sport:'football',timestamp:fixture.start,channels:[{name:'Sky UK'}]}],playlistIndex(channels));
 assert.equal(result.channels.length,9);assert.equal(result.channels.at(-1).locked,true);
});
