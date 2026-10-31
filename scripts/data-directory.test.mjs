import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {prepareDataDirectory} from './data-directory.mjs';
const root=resolve('.local/data-path-tests');
async function fixture(run){await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'case-'));try{await run(dir);}finally{if(!resolve(dir).startsWith(root+sep))throw Error('Invalid test cleanup path');await rm(dir,{recursive:true,force:true});}}
test('creates a missing writable data directory before service startup',()=>fixture(async dir=>{
 const preferred=join(dir,'new','data');const result=await prepareDataDirectory({preferred,fallback:join(dir,'fallback')});
 assert.equal(result.path,preferred);assert.equal(result.fallback,false);await writeFile(join(result.path,'catalog.json'),'{}');
}));
test('an unusable application data path falls back to writable storage',()=>fixture(async dir=>{
 const blocked=join(dir,'not-a-directory');await writeFile(blocked,'file');
 const fallback=join(dir,'temporary');const result=await prepareDataDirectory({preferred:join(blocked,'restream'),fallback});
 assert.equal(result.path,fallback);assert.equal(result.fallback,true);await writeFile(join(result.path,'index.m3u8'),'#EXTM3U');
}));
test('default startup does not require an application data directory',()=>fixture(async dir=>{
 const result=await prepareDataDirectory({fallback:join(dir,'writable-default')});assert.equal(result.fallback,false);
}));
