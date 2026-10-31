import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
process.env.SCOREZONE_MANAGED_BACKEND='true';
process.env.SCOREZONE_PUBLIC_ORIGIN=process.env.SCOREZONE_PUBLIC_ORIGIN||'https://testscore.pxxl.pro';
const {prepareDataDirectory}=await import('./scripts/data-directory.mjs');
const storage=await prepareDataDirectory({preferred:process.env.SCOREZONE_DATA_DIR});
process.env.SCOREZONE_DATA_DIR=storage.path;
if(storage.fallback)console.warn('Configured data directory unavailable; using writable temporary storage. Daily scans rebuild after restart.');
if(!process.env.FFMPEG_PATH){
 try{process.env.FFMPEG_PATH=(await import('ffmpeg-static')).default;}catch{process.env.FFMPEG_PATH='ffmpeg';}
}
const ffmpeg=spawnSync(process.env.FFMPEG_PATH,['-version'],{windowsHide:true,stdio:'ignore'}).status===0;
if(!ffmpeg)throw Error('FFmpeg is required for shared restreaming');
const {relayPort,restreamPort}=await import('./scripts/runtime-config.mjs');
const [{createRelay},{startRestreamServer},{startDailyPreparation,listDailyChannels,playDailyChannel},{localPremiumAccess},{catalogApi}]=await Promise.all([
 import('./relay.mjs'),import('./scripts/local-restream.mjs'),import('./scripts/daily-channels.mjs'),import('./scripts/local-premium-access.mjs'),import('./scripts/catalog-api.mjs'),
]);
const origins=new Set(['https://scorezonetv.live','https://www.scorezonetv.live',...String(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)]);
const relay=createRelay({secret:process.env.RELAY_SECRET,apiKey:process.env.SESSION_API_KEY,allowedOrigins:[...origins],ttlSeconds:600,cacheBytes:Math.max(8,Math.min(256,Number(process.env.CACHE_MAX_MB)||64))*1024*1024});
const internal=http.createServer((req,res)=>{relay(req,res).catch(()=>{if(!res.headersSent)res.writeHead(502);res.end('Relay unavailable');});});
await new Promise((resolve,reject)=>{internal.once('error',reject);internal.listen(relayPort,'127.0.0.1',resolve);});
await startRestreamServer();
const stopPreparation=startDailyPreparation();
const send=(res,status,data,cors={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...cors});res.end(JSON.stringify(data));};
const publicServer=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;const cors=origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Device-ID, Range','Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS',Vary:'Origin'}:{};
 if(origin&&!origins.has(origin)){send(res,403,{error:'Origin not allowed'});return;}
 if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return;}
 const url=new URL(req.url,'http://backend.internal');
 try{
  if(url.pathname==='/healthz'){send(res,200,{ok:true,version:'catalog-restream-v1',ffmpeg:true,configured:Boolean(process.env.IPTV_PLAYLIST_URL),features:['livescore','addon-fallback','daily-channels','shared-restream','shared-cached-relay','segment-prefetch','4k-premium','hevc-filter']},cors);return;}
  if(url.pathname.startsWith('/restream/')){
   if(!['GET','HEAD'].includes(req.method)){send(res,405,{error:'Method not allowed'},cors);return;}
   const upstream=http.request({hostname:'127.0.0.1',port:restreamPort,path:req.url,method:req.method,headers:{...(origin?{Origin:origin}:{}),...(req.headers.range?{Range:req.headers.range}:{})}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
   upstream.on('error',()=>{if(!res.headersSent)send(res,502,{error:'Restream unavailable'},cors);else res.destroy();});res.on('close',()=>upstream.destroy());upstream.end();return;
  }
  if(url.pathname==='/api/matches/channels'&&req.method==='GET'){
   const fixture=Object.fromEntries(url.searchParams);
   const allowedSports=new Set(['football','basketball','american-football','hockey','baseball','motor-sports','fight','tennis','rugby','golf','billiards','afl','darts','cricket','other']);
   if(!fixture.home||fixture.home.length>200||typeof fixture.away!=='string'||fixture.away.length>200||!allowedSports.has(fixture.sport)||!/^\d{13}$/.test(fixture.start||'')||String(fixture.eventId||'').length>250){send(res,400,{error:'Invalid fixture'},cors);return;}
   send(res,200,await listDailyChannels(fixture),cors);return;
  }
  if(url.pathname==='/api/matches/playback'&&req.method==='POST'){
   let text='';for await(const chunk of req){text+=chunk;if(text.length>2048)throw Error('Request too large');}
   const {matchKey,channelId}=JSON.parse(text);
   if(!/^[a-f0-9]{24}$/.test(matchKey||'')||!/^[a-f0-9]{24}$/.test(channelId||'')){send(res,400,{error:'Invalid channel'},cors);return;}
   send(res,200,await playDailyChannel(matchKey,channelId,await localPremiumAccess(req.headers)),cors);return;
  }
  if(req.method==='GET'&&/^\/api\/(?:livescore|addon-catalog)\//.test(url.pathname)){
   const result=await catalogApi(url.pathname,url.searchParams);if(result){send(res,result.status,result.data,cors);return;}
  }
  if(url.pathname==='/api/sessions'||url.pathname.startsWith('/hls/')){await relay(req,res);return;}
  if(url.pathname==='/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('ScoreZone catalog and shared restream backend');return;}
  send(res,404,{error:'Not found'},cors);
 }catch(error){send(res,error.status===403?403:502,{error:error.status===403?'Premium required':'Service temporarily unavailable'},cors);}
});
publicServer.requestTimeout=90000;publicServer.headersTimeout=15000;
publicServer.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('ScoreZone production backend ready'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopPreparation();internal.close();publicServer.close();});
