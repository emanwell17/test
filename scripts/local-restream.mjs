import {dataRoot,managed,relayInternalOrigin,restreamInternalOrigin,restreamPort} from './runtime-config.mjs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,readdir,unlink,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
const ORIGINS=new Set(['https://scorezonetv.live','https://www.scorezonetv.live','http://192.168.0.164:5173','http://localhost:5173','http://127.0.0.1:5173','http://192.168.0.164:5174','http://localhost:5174','http://127.0.0.1:5174']);
export function createFeedManager({start,now=Date.now,idleMs=60000,maxFeeds=8}){
 const feeds=new Map();
 return {
  async get(id,config){
   let feed=feeds.get(id);
   if(feed?.stopped){feeds.delete(id);feed=null;}
   if(!feed){if(feeds.size>=maxFeeds)throw Error('Restream capacity reached');feed={id,lastSeen:now(),stopped:false};feeds.set(id,feed);feed.ready=Promise.resolve().then(()=>start(id,config,feed)).then(control=>{feed.control=control;return feed;}).catch(error=>{feeds.delete(id);throw error;});}
   feed.lastSeen=now();return feed.ready;
  },
  touch(id){const f=feeds.get(id);if(f)f.lastSeen=now();},
  sweep(){for(const [id,feed]of feeds)if(now()-feed.lastSeen>idleMs){feed.stopped=true;feed.control?.stop();feeds.delete(id);}},
  stop(){for(const feed of feeds.values())feed.control?.stop();feeds.clear();},
  count(){return feeds.size;},
  has(id){return feeds.has(id);},
 };
}
export async function startRestreamServer(){
 const secret=process.env.RELAY_SECRET,apiKey=process.env.SESSION_API_KEY;
 if(!secret||!apiKey)throw Error('Restream credentials missing');
 const root=join(dataRoot,'restream');await mkdir(root,{recursive:true});
 const configs=new Map();
 try{
  const stored=JSON.parse(await readFile(join(root,'inputs.json'),'utf8'));
  for(const [id,config]of Object.entries(stored)){
   const u=new URL(config.relayUrl);
   if(/^[a-f0-9]{24}$/.test(id)&&u.origin===relayInternalOrigin&&/^\/hls\/[\w-]+\/index\.m3u8$/.test(u.pathname)&&!u.search&&!u.hash&&!u.username&&!u.password)configs.set(id,{relayUrl:u.href});
  }
 }catch{}
 let persist=Promise.resolve();
 const saveInputs=()=>{persist=persist.catch(()=>{}).then(()=>writeFile(join(root,'inputs.json'),JSON.stringify(Object.fromEntries(configs))));return persist;};
 const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
 const sign=value=>createHmac('sha256',secret).update('restream:'+value).digest('base64url');
 const issue=(id,expiresAt)=>{const body=Buffer.from(JSON.stringify({id,expiresAt})).toString('base64url');return body+'.'+sign(body);};
 const verify=token=>{try{const [body,sig]=token.split('.');if(!equal(sig||'',sign(body)))return null;const d=JSON.parse(Buffer.from(body,'base64url'));return /^[a-f0-9]{24}$/.test(d.id)&&d.expiresAt>Date.now()?d:null;}catch{return null;}};
 const send=(res,status,body,headers={})=>{res.writeHead(status,{'Cache-Control':'no-store',...headers});res.end(body);};
 const manager=createFeedManager({start:async(id,config,feed)=>{
  const dir=join(root,id);await mkdir(dir,{recursive:true});
  // Delete individual files only inside this channel's generated directory.
  if(!resolve(dir).startsWith(resolve(root)+ '\\')&&!resolve(dir).startsWith(resolve(root)+'/'))throw Error('Invalid output path');
  for(const file of await readdir(dir))if(/^(?:index\.m3u8|seg_\d+_\d+\.ts)(?:\.tmp)?$/.test(file))await unlink(join(dir,file)).catch(()=>{});
  const generation=Date.now();
  const args=['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','http,https,tcp,tls,crypto','-rw_timeout','65000000','-fflags','+genpts','-analyzeduration','1000000','-probesize','1000000','-i',`${restreamInternalOrigin}/input/${id}/index.m3u8`,'-map','0:v:0','-map','0:a:0?','-c','copy','-f','hls','-hls_time','4','-hls_list_size','6','-hls_delete_threshold','2','-hls_flags','delete_segments+omit_endlist+temp_file','-hls_segment_filename',join(dir,`seg_${generation}_%06d.ts`),join(dir,'index.m3u8')];
  const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
  // Do not expose FFmpeg diagnostics: they can contain signed upstream URLs.
  let lastError='';child.stderr.on('data',chunk=>{lastError=(lastError+chunk).slice(-2048);void writeFile(join(dir,'status.log'),lastError.replace(/https?:\/\/\S+/g,'[url]').replace(/\/hls\/[\w-]+/g,'/hls/[redacted]')).catch(()=>{});});
  child.on('error',()=>{feed.stopped=true;});child.on('exit',()=>{feed.stopped=true;});
  feed.dir=dir;feed.child=child;
  return {stop:()=>{child.kill();}};
 }});
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;const cors=ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type, Authorization, Range','Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS',Vary:'Origin'}:{};
  if(origin&&!ORIGINS.has(origin))return send(res,403,'Origin not allowed');
  if(req.method==='OPTIONS')return send(res,204,'',cors);
  const u=new URL(req.url,'http://restream.local');
  try{
   if(u.pathname==='/healthz')return send(res,200,JSON.stringify({ok:true,activeFeeds:manager.count()}),{...cors,'Content-Type':'application/json'});
   if(u.pathname==='/api/sessions'&&req.method==='POST'){
    if(!equal(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''),apiKey))return send(res,401,'Unauthorized',cors);
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('Request too large');}
    const data=JSON.parse(raw);
    if(!/^[a-f0-9]{24}$/.test(data.channelId||''))throw Error('Invalid channel');
    if(data.relayUrl){
     const url=new URL(data.relayUrl);
     if(url.origin!==relayInternalOrigin||!/^\/hls\/[\w-]+\/index\.m3u8$/.test(url.pathname)||url.search||url.hash||url.username||url.password)throw Error('Invalid source');
     configs.set(data.channelId,{relayUrl:url.href});await saveInputs();
    }else if(!configs.has(data.channelId))throw Error('Unknown channel');
    const expiresAt=Math.min(Date.now()+600000,Number(data.expiresAt)||Infinity);
    if(expiresAt<=Date.now())return send(res,403,'Access expired',cors);
    const token=issue(data.channelId,expiresAt);
    return send(res,200,JSON.stringify({path:`/restream/${token}/index.m3u8`,expiresAt}),{...cors,'Content-Type':'application/json'});
   }
   const input=u.pathname.match(/^\/input\/([a-f0-9]{24})\/index\.m3u8$/);
   if(input){
    if(origin||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send(res,403,'Internal input only');
    const config=configs.get(input[1]);if(!config)return send(res,404,'Unavailable');
    const upstream=await fetch(config.relayUrl,{signal:AbortSignal.timeout(65000)});if(!upstream.ok)throw Error('Input unavailable');
    const body=await upstream.text();if(!body.startsWith('#EXTM3U'))throw Error('Invalid input playlist');
    const absolute=value=>{const url=new URL(value,config.relayUrl);if(url.origin!==relayInternalOrigin||!/^\/hls\/[\w-]+\/(?:index\.m3u8|media\.ts)$/.test(url.pathname))throw Error('Invalid input asset');return url.href;};
    const rewritten=body.split(/\r?\n/).map(line=>!line?line:line.startsWith('#')?line.replace(/URI="([^"]+)"/g,(_,v)=>`URI="${absolute(v)}"`):absolute(line)).join('\n');
    return send(res,200,rewritten,{'Content-Type':'application/vnd.apple.mpegurl'});
   }
   const media=u.pathname.match(/^\/restream\/([\w.-]+)\/(index\.m3u8|seg_\d+_\d+\.ts)$/);
   const access=media&&verify(media[1]);if(!access)return send(res,401,'Playback expired',cors);
   if(!['GET','HEAD'].includes(req.method))return send(res,405,'Method not allowed',cors);
   const config=configs.get(access.id);if(!config)return send(res,404,'Select channel again',cors);
   const feed=await manager.get(access.id,config);
   let bytes;
   for(let attempt=0;attempt<(media[2]==='index.m3u8'?80:1);attempt++){
    try{bytes=await readFile(join(feed.dir,media[2]));if(bytes.length)break;}catch{}
    if(feed.stopped)throw Error('Input stopped');await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!bytes) return send(res,503,'Feed preparing',cors);
   manager.touch(access.id);
   const headers={...cors,'Content-Type':media[2]==='index.m3u8'?'application/vnd.apple.mpegurl':'video/mp2t'};
   if(media[2].endsWith('.ts')){
    const range=String(req.headers.range||'').match(/^bytes=(\d+)-(\d*)$/);
    if(range){const start=+range[1],end=Math.min(range[2]?+range[2]:bytes.length-1,bytes.length-1);if(start>end)return send(res,416,'',cors);headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;headers['Content-Length']=end-start+1;return send(res,206,req.method==='HEAD'?'':bytes.subarray(start,end+1),headers);}
   }
   headers['Content-Length']=bytes.length;return send(res,200,req.method==='HEAD'?'':bytes,headers);
  }catch{return send(res,502,'Restream temporarily unavailable',cors);}
 });
 const cleanup=setInterval(()=>manager.sweep(),10000);cleanup.unref();
 const diskCleanup=setInterval(async()=>{
  for(const id of await readdir(root).catch(()=>[]))if(/^[a-f0-9]{24}$/.test(id)&&!manager.has(id)){
   for(const file of await readdir(join(root,id)).catch(()=>[]))if(/^(?:index\.m3u8|seg_\d+_\d+\.ts)(?:\.tmp)?$/.test(file))await unlink(join(root,id,file)).catch(()=>{});
  }
 },60000);diskCleanup.unref();
 server.listen(restreamPort,managed?'127.0.0.1':'0.0.0.0',()=>console.log('Local shared restream ready'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{manager.stop();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();});
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await startRestreamServer();
