import {isYouthEvent} from '../src/livescore-catalog.js';

const cache=new Map(),pending=new Map();
export async function liveScoreLeagues(sport,query='',fetcher=fetch){
 const key=JSON.stringify([sport,query.toLowerCase()]);
 const saved=cache.get(key);if(saved&&saved.expires>Date.now())return saved.leagues;
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  // The directory returns popular competitions for a blank query. Broader
  // initial searches also surface competitions outside today's schedule.
  const queries=query.length>=3?[query]:['','league','cup'];
  const pages=await Promise.all(queries.map(async term=>{
   const search=new URLSearchParams();if(term)search.set('query',term);search.set('limit','5000');search.set('locale','en');
   const response=await fetcher(`https://prod-cdn-search-api.livescore.com/api/v2/search/${sport}/stage?${search}`,{signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('LiveScore league directory unavailable');
   const data=await response.json();if(!Array.isArray(data.Stages))throw Error('Invalid LiveScore league directory');return data.Stages;
  }));
  const leagues=[...new Map(pages.flat().filter(stage=>!isYouthEvent({name:[stage.CompN,stage.Snm,stage.Cnm].join(' ')})).map(stage=>{
   const name=stage.CompN||stage.Snm,country=stage.Cnm||'';
   return [JSON.stringify([country,name]),{name,country,stage}];
  })).values()].filter(league=>league.name).sort((a,b)=>a.country.localeCompare(b.country)||a.name.localeCompare(b.name));
  cache.set(key,{leagues,expires:Date.now()+6*3600000});while(cache.size>64)cache.delete(cache.keys().next().value);
  return leagues;
 })().finally(()=>pending.delete(key));pending.set(key,job);return job;
}
