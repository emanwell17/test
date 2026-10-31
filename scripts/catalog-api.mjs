const cache=new Map(),pending=new Map();
const sports=new Set(['soccer','basketball','american-football','hockey','baseball','motorsport','boxing','tennis','rugby-union','golf','billiards','afl','darts','cricket']);
const catalogs=new Set(['football','basketball','american_football','hockey','baseball','motor_sports','fight','tennis','rugby','golf','billiards','afl','darts','cricket','other'].map(s=>'sports_'+s));
async function cached(key,load){
 const hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit.data;
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{const data=await load();cache.set(key,{data,expires:Date.now()+300000});while(cache.size>256)cache.delete(cache.keys().next().value);return data;})().finally(()=>pending.delete(key));pending.set(key,job);return job;
}
export async function catalogApi(path,search,fetcher=fetch){
 const live=path.match(/^\/api\/livescore\/([a-z-]+)\/(\d{8})$/);
 if(live){
  if(!sports.has(live[1]))return {status:400,data:{error:'Unknown sport'}};
  return {status:200,data:await cached(path,async()=>{
   const r=await fetcher(`https://prod-cdn-public-api.livescore.com/v1/api/app/date/${live[1]}/${live[2]}/0.0?locale=en&MD=1`,{signal:AbortSignal.timeout(15000)});
   if([404,410].includes(r.status))return {Stages:[],unsupported:true};
   if(!r.ok)throw Error('LiveScore unavailable');const data=await r.json();if(!Array.isArray(data.Stages))throw Error('Invalid catalog');return data;
  })};
 }
 const addon=path.match(/^\/api\/addon-catalog\/([a-z_]+)$/);
 if(addon){
  const skip=Number(search.get('skip')||0);if(!catalogs.has(addon[1])||!Number.isInteger(skip)||skip<0||skip>2000)return {status:400,data:{error:'Invalid catalog'}};
  return {status:200,data:await cached(path+'?skip='+skip,async()=>{
   const r=await fetcher(`https://scorezonetv.live/api/catalog/${addon[1]}?skip=${skip}`,{signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('Addon unavailable');const d=await r.json();if(!Array.isArray(d.metas))throw Error('Invalid addon catalog');return {metas:d.metas};
  })};
 }
 return null;
}
