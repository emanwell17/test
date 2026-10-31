import {createHash} from 'node:crypto';
const cache=new Map(),pending=new Map();
export async function localPremiumAccess(headers,fetcher=fetch,now=Date.now){
 const token=String(headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
 const deviceId=String(headers['x-device-id']||'').trim();
 if(!token||token.length>200||!deviceId||deviceId.length>160)return null;
 const key=createHash('sha256').update(token+'|'+deviceId).digest('hex');
 const hit=cache.get(key);if(hit?.cacheUntil>now())return hit.access;
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  const trial=token.startsWith('SZT-');
  let response=await fetcher(`https://scorezone-live.scorezone.workers.dev/api/${trial?'trial':'premium'}/verify`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://scorezonetv.live'},body:JSON.stringify({token,deviceId}),signal:AbortSignal.timeout(10000)});
  let data=await response.json();
  if(!trial&&!response.ok&&(response.status===404||data.error==='Premium token not found')){
   response=await fetcher('https://scorezone-premium.scorezone.workers.dev/verify-token',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://scorezonetv.live'},body:JSON.stringify({token,deviceId}),signal:AbortSignal.timeout(10000)});data=await response.json();
  }
  let expiry=Number(data.expiresAt||0);if(expiry&&expiry<1e12)expiry*=1000;
  const access=response.ok&&data.ok&&expiry>now()?{premium:true,expiresAt:expiry}:null;
  cache.set(key,{access,cacheUntil:access?Math.min(now()+60000,expiry):now()+5000});return access;
 })().catch(()=>null).finally(()=>pending.delete(key));pending.set(key,job);return job;
}
