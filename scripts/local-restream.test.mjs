import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedManager} from './local-restream.mjs';
test('concurrent viewers share one ingest and idle channels shut down',async()=>{
 let now=1000,starts=0,stops=0;
 const manager=createFeedManager({now:()=>now,idleMs:60000,start:async()=>{starts++;return{stop:()=>stops++};}});
 assert.equal(manager.count(),0);
 const [a,b]=await Promise.all([manager.get('same',{}),manager.get('same',{})]);
 assert.equal(a,b);assert.equal(starts,1);assert.equal(manager.count(),1);
 now+=59000;manager.touch('same');now+=59000;manager.sweep();assert.equal(stops,0);
 now+=2000;manager.sweep();assert.equal(stops,1);assert.equal(manager.count(),0);
 await manager.get('same',{});assert.equal(starts,2);manager.stop();
});
test('different channels have separate ingests with bounded capacity',async()=>{
 const manager=createFeedManager({maxFeeds:2,start:async()=>({stop(){}})});
 await Promise.all([manager.get('one',{}),manager.get('two',{})]);
 assert.equal(manager.count(),2);await assert.rejects(manager.get('three',{}),/capacity/);manager.stop();
});
